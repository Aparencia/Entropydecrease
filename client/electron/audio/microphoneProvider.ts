/**
 * 麦克风 Provider（线下课堂/讲座场景音频采集）
 *
 * @ai-context: 与端点环回 Provider 同属"渲染进程侧采集"模式——主进程通过 IPC
 * 指令驱动渲染进程调用 getUserMedia({ audio }) 获取麦克风输入，渲染进程完成
 * AudioWorklet/ScriptProcessor 切片后经 IPC 回传音频块，故本 Provider 实现
 * handleRendererChunk。与端点环回的差异：麦克风走 getUserMedia 而非
 * getDisplayMedia，不需要视频轨触发授权，也不依赖 setDisplayMediaRequestHandler。
 *
 * @ai-context: 设计决策
 * - sourceId 复用为麦克风 deviceId：null/undefined 表示使用系统默认麦克风，
 *   传入具体 deviceId 可选择指定设备（由前端 enumerateDevices 枚举得到）。
 * - 采样率/声道数与环回 Provider 共享默认值（16kHz/单声道），保证下游
 *   VAD/ASR 管道无需根据源类型切换处理逻辑。
 * - 权限处理：Electron 主进程需在 app whenReady 后通过
 *   session.defaultSession.setPermissionRequestHandler 授权 mediaDevices
 *   权限请求，否则渲染进程的 getUserMedia 会被 Chromium 默认拒绝。
 * - 错误场景覆盖：用户拒绝授权、设备被占用、设备拔出/禁用均由 start 抛错
 *   或渲染进程上报，编排器记录日志并通知用户（麦克风场景无降级目标）。
 */

import { logger } from '../logger.js';
import type {
  AudioChunkSink,
  AudioProviderStartContext,
  AudioSourceProvider,
  RendererAudioChunk,
} from './audioSourceProvider.js';
import type { AudioSourceKind } from '../../src/lib/capture/audioSourceStrategy.js';

/** 麦克风设备信息（供前端设备选择 UI 展示） */
export interface MicrophoneDeviceInfo {
  /** 设备唯一标识（传给 getUserMedia 的 deviceId） */
  deviceId: string;
  /** 用户可读的设备名称（系统未授权时可能为空字符串） */
  label: string;
  /** 是否为系统默认麦克风 */
  isDefault: boolean;
}

/**
 * 枚举可用麦克风设备
 *
 * Electron 主进程无 navigator.mediaDevices，故通过主窗口的渲染进程执行
 * enumerateDevices() 并收集 audioinput 类型设备。若主窗口不可用则
 * 返回空数组（而非抛错），由 UI 层给出「无法检测设备」提示。
 */
export async function listMicrophoneDevices(): Promise<MicrophoneDeviceInfo[]> {
  // 延迟导入避免循环依赖（BrowserWindow 在 app ready 前不可用）
  const { BrowserWindow } = await import('electron');
  const wins = BrowserWindow.getAllWindows();
  const win = wins.find((w) => !w.isDestroyed());
  if (!win) {
    logger.warn('[MicrophoneProvider] 无可用窗口，无法枚举麦克风设备');
    return [];
  }

  try {
    // 在渲染进程执行设备枚举：enumerateDevices 返回所有媒体设备，
    // 此处仅筛选 audioinput（麦克风）类型并提取必要字段
    const devices = await win.webContents.executeJavaScript(`
      (async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          return devices
            .filter(d => d.kind === 'audioinput')
            .map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || ('麦克风 ' + (i + 1)),
              isDefault: d.deviceId === 'default' || i === 0,
            }));
        } catch (e) {
          return [];
        }
      })()
    `);
    return devices as MicrophoneDeviceInfo[];
  } catch (err) {
    logger.error('[MicrophoneProvider] 枚举麦克风设备失败:', err);
    return [];
  }
}

/**
 * 麦克风 Provider
 *
 * 负责线下课堂场景的麦克风音频采集。数据流方向与端点环回一致：
 * 主进程发指令 → 渲染进程 getUserMedia + 切片 → IPC 回传 → sink。
 */
export class MicrophoneProvider implements AudioSourceProvider {
  readonly kind: AudioSourceKind = 'microphone';

  /** 音频块接收回调（由编排器注入，最终经 emitChunk 补时间戳后分发给消费者） */
  private readonly sink: AudioChunkSink;
  private capturing = false;
  private disposed = false;
  /** 绑定的窗口引用，用于 stop 时发送停止指令 */
  private boundWindow: AudioProviderStartContext['window'] | null = null;

  constructor(sink: AudioChunkSink) {
    this.sink = sink;
  }

  /**
   * 启动麦克风采集
   *
   * 向渲染进程发送 audio_capture_do_start 指令（附带 microphone: true 标记），
   * 渲染进程据此调用 getUserMedia({ audio: { deviceId } }) 而非 getDisplayMedia。
   * sourceId 作为麦克风 deviceId 透传：null 表示系统默认麦克风。
   */
  async start(ctx: AudioProviderStartContext): Promise<void> {
    if (this.capturing || this.disposed) return;

    // sourceId 复用作麦克风 deviceId：null 表示使用系统默认麦克风设备
    const deviceId = ctx.sourceId ?? null;

    this.capturing = true;
    this.boundWindow = ctx.window;

    logger.info(
      `[MicrophoneProvider] 开始捕获, deviceId=${deviceId ?? '(默认麦克风)'}, ` +
      `chunkDurationMs=${ctx.options.chunkDurationMs}, ` +
      `sampleRate=${ctx.options.sampleRate}, channels=${ctx.options.channels}`,
    );

    // 通知渲染进程开始麦克风采集：与端点环回共用 audio_capture_do_start 通道，
    // 通过 microphone 标记区分采集路径（渲染进程 useClassroomAudio 据此分支）
    if (!ctx.window.isDestroyed()) {
      ctx.window.webContents.send('audio_capture_do_start', {
        sourceId: deviceId,
        options: ctx.options,
        // 麦克风标记：渲染进程收到此标记后走 getUserMedia 路径而非 getDisplayMedia
        microphone: true,
      });
    }
  }

  /** 停止麦克风采集（幂等） */
  stop(): void {
    if (!this.capturing) return;

    this.capturing = false;
    logger.info('[MicrophoneProvider] 停止捕获');

    // 通知渲染进程停止音频采集（与端点环回共用 audio_capture_do_stop 通道）
    if (this.boundWindow && !this.boundWindow.isDestroyed()) {
      this.boundWindow.webContents.send('audio_capture_do_stop');
    }
    this.boundWindow = null;
  }

  /**
   * 接收渲染进程回传的麦克风音频块
   *
   * 数据格式与端点环回完全一致（PCM Float32, 16kHz, 单声道），
   * 由编排器统一补时间戳后分发给下游 VAD/ASR 管道。
   */
  handleRendererChunk(data: RendererAudioChunk): void {
    if (!this.capturing || this.disposed) return;
    this.sink(data);
  }

  /** 释放资源（幂等） */
  dispose(): void {
    this.stop();
    this.disposed = true;
  }
}
