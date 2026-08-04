/**
 * 课堂音频管道与健康监控 hook
 *
 * @ai-context: 从 useClassroomCapture 拆出。渲染端音频管道由主进程
 * audio_capture_do_start/stop 指令驱动（Electron 中系统音频只能在渲染进程取到）。
 * 两处关键修复保留：①AudioContext 在 IPC 回调（非用户手势调用栈）中创建时受
 * Chrome autoplay policy 影响默认 suspended，音频回调永不触发，必须显式
 * resume()；②原 ScriptProcessor 的 bufferSize 必须是 [256,16384] 内 2 的幂
 * （仅降级路径需要，详见 lib/audioPipeline.ts）。
 * @ai-context: 健康 watchdog 区分两种故障——"开始后 15s 从未收到音频块"
 * （管道未启动）与"曾正常但中断 >10s"（设备变更/被抢占），各自独立提示。
 * @ai-context: 静音诊断/窗口源回退/设备变更自动重启见 useAudioRecovery。
 *
 * @ai-context: AudioWorklet 迁移说明（2025）
 *   ScriptProcessor 已被 Web Audio API 规范标记为 deprecated，未来 Chromium 可能移除。
 *   新架构使用 AudioWorklet（audio-chunk-processor.js），音频处理在独立渲染线程执行。
 *   管道逻辑已提取到 lib/audioPipeline.ts，本 hook 仅负责生命周期管理和健康监控。
 *   降级策略：若 audioWorklet API 不可用，自动回退到 ScriptProcessor 路径。
 *
 * @ai-context: 音频源切换——本 hook 支持两种采集路径：
 *   - 系统环回（网课场景）：通过 getDisplayMedia + loopback 采集系统混音
 *   - 麦克风（现场课程场景）：通过 getUserMedia 直接采集麦克风输入
 *   由主进程 audio_capture_do_start IPC 指令中的 microphone 字段分支。
 */
import { useState, useEffect, useRef } from 'react';
import type { AudioChunkData, CaptureMode, SessionStatus, CaptureManager } from '@/lib/capture';
import { startAudioPipeline } from '@/lib/audioPipeline';

/** 开始采集后多久仍无音频块则判定管道未启动 */
const NEVER_RECEIVED_TIMEOUT_MS = 15000;
/** 音频中断多久判定为异常 */
const CHUNK_GAP_TIMEOUT_MS = 10000;

interface AudioStartPayload {
  sourceId: string;
  options: { sampleRate: number; channels: number; chunkDurationMs: number };
  /** 现场课程场景：启用麦克风采集（与系统环回互斥） */
  microphone?: boolean;
}

export interface AudioHealth {
  lastChunkTime: number;
  chunkCount: number;
  isHealthy: boolean;
}

interface UseClassroomAudioOptions {
  captureManager: CaptureManager;
  status: SessionStatus;
  mode: CaptureMode;
  onNotify: (type: 'warning' | 'error', message: string) => void;
}

/**
 * 打开系统音频环回流。
 *
 * 必须走 getDisplayMedia 且同时请求 video —— 主进程的
 * setDisplayMediaRequestHandler 会在授权时附加 audio: 'loopback'，
 * 这是 Windows 下拿到真实系统音频的唯一可靠路径。
 * 旧的 getUserMedia({ audio: { chromeMediaSource: 'desktop' } }) 在
 * Electron 30+ 会静默返回恒为数字零的静音轨（RMS 0.00），不可再用。
 * 拿到流后立即停掉视频轨，仅保留音频，避免屏幕捕获的额外开销。
 */
async function openDesktopAudioStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('系统音频轨缺失：displayMedia 未返回 loopback 音频');
  }
  // 视频轨仅用于触发 loopback 授权，立即停止释放屏幕捕获资源
  stream.getVideoTracks().forEach((t) => {
    t.stop();
    stream.removeTrack(t);
  });
  console.info(
    `[useClassroomCapture] 系统音频环回已获取: track="${audioTracks[0].label}", ` +
    `enabled=${audioTracks[0].enabled}, muted=${audioTracks[0].muted}`,
  );
  return stream;
}

/**
 * 打开麦克风音频流（现场课程场景）。
 *
 * 与系统环回不同，麦克风直接使用 getUserMedia API，无需视频轨触发授权。
 * deviceId 为 null 时使用系统默认麦克风；传入具体 deviceId 可选择指定设备。
 *
 * 错误场景：
 * - NotAllowedError：用户拒绝授权或系统级权限未开启
 * - NotFoundError：无可用麦克风设备
 * - NotReadableError：设备被其他应用独占
 */
async function openMicrophoneStream(deviceId: string | null): Promise<MediaStream> {
  // 构造 audio 约束：deviceId 为 null 时不指定，由系统选择默认麦克风
  const audioConstraints: MediaTrackConstraints = {
    // 指定采样率与声道数，与下游 VAD/ASR 管道期望一致（16kHz/单声道）
    sampleRate: 16000,
    channelCount: 1,
    // 关闭浏览器内置降噪/回声消除，保留原始音频供 VAD 校准与 ASR 处理
    // （内置降噪会压缩动态范围，影响 RMS 能量计算的准确性）
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (deviceId) {
    audioConstraints.deviceId = { exact: deviceId };
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
  });

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('麦克风音频轨缺失：getUserMedia 未返回音频');
  }
  console.info(
    `[useClassroomCapture] 麦克风已获取: track="${audioTracks[0].label}", ` +
    `deviceId=${deviceId ?? '(默认)'}, settings=`,
    audioTracks[0].getSettings(),
  );
  return stream;
}

export function useClassroomAudio({ captureManager, status, mode, onNotify }: UseClassroomAudioOptions) {
  const [audioHealth, setAudioHealth] = useState<AudioHealth>({
    lastChunkTime: 0, chunkCount: 0, isHealthy: true,
  });
  const healthRef = useRef({ lastChunkTime: 0, chunkCount: 0 });
  const audioCleanupRef = useRef<(() => void | Promise<void>) | null>(null);

  // onNotify 的稳定引用：音频生命周期 effect 依赖数组为 []，
  // 直接闭包会随渲染变化而过期，故用 ref 桥接。
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;

  // 监听音频块（带健康跟踪）
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as AudioChunkData;
      captureManager.pushAudioChunk(chunk);
      // healthRef 保持逐块更新（watchdog 只读 ref，精度不受影响）
      healthRef.current = {
        lastChunkTime: Date.now(),
        chunkCount: healthRef.current.chunkCount + 1,
      };
      // 性能卫生：仅每 10 块或健康态翻转（不健康→健康）时才 setState，
      // 消除流式 400ms 块下约 2.5Hz 的整页重渲染
      const { lastChunkTime, chunkCount } = healthRef.current;
      setAudioHealth((prev) => {
        if (!prev.isHealthy) return { lastChunkTime, chunkCount, isHealthy: true };
        if (chunkCount % 10 === 0) return { lastChunkTime, chunkCount, isHealthy: true };
        return prev;
      });
    });
    return off;
  }, [status, captureManager]);

  // 健康 watchdog：检测"从未收到音频块"与"音频中断"两种故障
  useEffect(() => {
    if (status !== 'capturing') {
      setAudioHealth({ lastChunkTime: 0, chunkCount: 0, isHealthy: true });
      healthRef.current = { lastChunkTime: 0, chunkCount: 0 };
      return;
    }
    const audioEnabled = mode === 'audio' || mode === 'mixed';
    if (!audioEnabled) return;

    const capturingStartedAt = Date.now();
    let warnedNever = false;
    let warnedStopped = false;
    const timer = setInterval(() => {
      const { lastChunkTime } = healthRef.current;
      if (lastChunkTime === 0) {
        // 场景一：开始采集后从未收到任何音频块（音频管道未启动/被挂起）
        if (Date.now() - capturingStartedAt > NEVER_RECEIVED_TIMEOUT_MS) {
          setAudioHealth((prev) => (prev.isHealthy ? { ...prev, isHealthy: false } : prev));
          if (!warnedNever) {
            warnedNever = true;
            onNotify('error', '未检测到音频输入，音频采集可能未启动，请停止后重新开始采集');
          }
        }
      } else if (Date.now() - lastChunkTime > CHUNK_GAP_TIMEOUT_MS) {
        // 场景二：音频曾正常但中断超过 10s。chunkCount 从 healthRef 取真实
        // 逐块计数——state 因降频可能滞后（前 9 块恒为 0），沿用会让横幅
        // 把"音频中断"误判为"从未检测到音频"（ClassroomStatusBanners 按
        // chunkCount === 0 分支）
        setAudioHealth((prev) => (prev.isHealthy
          ? { ...prev, chunkCount: healthRef.current.chunkCount, isHealthy: false }
          : prev));
        if (!warnedStopped) {
          warnedStopped = true;
          onNotify('warning', '音频输入中断超过 10s，请检查系统音频设置');
        }
      } else {
        // 恢复正常
        setAudioHealth((prev) => (prev.isHealthy ? prev : { ...prev, isHealthy: true }));
        warnedNever = false;
        warnedStopped = false;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [status, mode, onNotify]);

  // 监听音频采集生命周期指令
  useEffect(() => {
    if (!window.electronAPI) return;

    const offStart = window.electronAPI.on('audio_capture_do_start', (...args: unknown[]) => {
      if (audioCleanupRef.current) return;
      const payload = args[0] as AudioStartPayload;
      (async () => {
        try {
          // 根据采集源选择不同的音频流获取路径：
          // - 麦克风（现场课程）：getUserMedia 直接采集麦克风输入
          // - 系统环回（网课默认）：getDisplayMedia + loopback 采集系统混音
          const stream = payload.microphone
            ? await openMicrophoneStream(payload.sourceId || null)
            : await openDesktopAudioStream();
          const audioCtx = new AudioContext({ sampleRate: payload.options.sampleRate });
          // 关键修复：非用户手势调用栈中创建的 AudioContext 默认 suspended，
          // 必须显式 resume()，否则音频处理回调永不触发（0 音频块）。
          if (audioCtx.state !== 'running') {
            await audioCtx.resume();
          }
          console.info(`[useClassroomCapture] 音频管道已启动, AudioContext state=${audioCtx.state}, sampleRate=${audioCtx.sampleRate}`);

          // IPC 转发回调：收到完整音频块后通过 Electron IPC 发送给主进程
          const onChunk = (buffer: ArrayBuffer, durationMs: number) => {
            window.electronAPI?.send('audio_capture_chunk', {
              audioBuffer: buffer,
              sampleRate: payload.options.sampleRate,
              channels: payload.options.channels,
              durationMs,
            });
          };

          // 统一入口：优先 AudioWorklet，模块加载失败自动降级 ScriptProcessor
          // （生产 file:// 下 addModule 会因 opaque origin 失败，降级保底）
          audioCleanupRef.current = await startAudioPipeline(
            audioCtx, stream, payload.options, onChunk,
          );
        } catch (err) {
          console.error('[useClassroomCapture] Audio pipeline start failed:', err);
          // 根据采集源类型给出不同的诊断提示
          const hint = payload.microphone
            ? '音频采集启动失败，无法获取麦克风输入，请检查麦克风设备和权限设置'
            : '音频采集启动失败，无法获取系统音频，请检查音频输出设备';
          notifyRef.current('error', hint);
        }
      })();
    });

    const offStop = window.electronAPI.on('audio_capture_do_stop', () => {
      void audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    });

    return () => {
      offStart();
      offStop();
      void audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    };
  }, []);

  return { audioHealth, audioCleanupRef };
}
