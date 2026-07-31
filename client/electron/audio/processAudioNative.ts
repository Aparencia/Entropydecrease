/**
 * 进程环回原生模块加载器
 *
 * @ai-context: 原生 addon 是可选依赖——未编译、非 Windows、或 Windows 版本
 * 过低时必须优雅降级为"能力不可用"，绝不能让加载失败冒泡到应用启动路径
 * （AGENTS.md 高风险区约定）。故此处用 try/catch 包裹 require 并缓存结果。
 * @ai-context: 能力探测（isProcessLoopbackSupported）会真实尝试激活一次
 * WASAPI 接口，有几毫秒开销，因此结果缓存到进程生命周期。
 */

import * as path from 'path';
import { app } from 'electron';
import { logger } from '../logger.js';

/** 原生模块导出的窗口信息 */
export interface NativeWindowInfo {
  hwnd: string;
  pid: number;
  rootPid: number;
  title: string;
  processName: string;
  rootProcessName: string;
}

/** 原生模块流式回调的负载：音频块或错误 */
export interface NativeStreamPayload {
  audioBuffer?: ArrayBuffer;
  sampleRate?: number;
  channels?: number;
  durationMs?: number;
  error?: string;
}

/** 原生模块导出接口 */
export interface ProcessAudioNative {
  listAudioWindows(): NativeWindowInfo[];
  resolveRootPid(pid: number): number;
  isProcessLoopbackSupported(): boolean;
  startCapture(
    options: { pid: number; sampleRate: number; channels: number; chunkDurationMs: number },
    callback: (payload: NativeStreamPayload) => void,
  ): { ok: boolean; error: string };
  stopCapture(): boolean;
}

/** 加载状态缓存（undefined 表示尚未尝试加载） */
let cached: ProcessAudioNative | null | undefined;
let supportedCache: boolean | undefined;

/** 候选路径：开发态走源码目录构建产物，打包后走 asarUnpack 解出的目录 */
function candidatePaths(): string[] {
  const fileName = 'process_audio.node';
  const appPath = app.getAppPath();
  return [
    // 打包后：asarUnpack 将 .node 解到 app.asar.unpacked 下
    path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'native', 'process-audio', 'build', 'Release', fileName),
    // 开发态：client/native/process-audio/build/Release
    path.join(appPath, 'native', 'process-audio', 'build', 'Release', fileName),
  ];
}

/**
 * 加载原生模块；不可用时返回 null（不抛错）。
 */
export function loadProcessAudioNative(): ProcessAudioNative | null {
  if (cached !== undefined) return cached;

  if (process.platform !== 'win32') {
    logger.info('[ProcessAudio] 非 Windows 平台，进程环回不可用');
    cached = null;
    return cached;
  }

  // 主进程编译目标为 CommonJS，直接用全局 require 动态加载 .node
  for (const candidate of candidatePaths()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const native = require(candidate) as ProcessAudioNative;
      if (typeof native.startCapture === 'function') {
        logger.info(`[ProcessAudio] 原生模块已加载: ${candidate}`);
        cached = native;
        return cached;
      }
    } catch {
      // 继续尝试下一个候选路径
    }
  }

  logger.info('[ProcessAudio] 原生模块未找到（未编译或未随包分发），进程环回不可用');
  cached = null;
  return cached;
}

/**
 * 进程环回是否可用（模块已加载 + 系统 API 可用）。
 * 结果缓存到进程生命周期。
 */
export function isProcessLoopbackAvailable(): boolean {
  if (supportedCache !== undefined) return supportedCache;

  const native = loadProcessAudioNative();
  if (!native) {
    supportedCache = false;
    return supportedCache;
  }
  try {
    supportedCache = native.isProcessLoopbackSupported();
    logger.info(`[ProcessAudio] 系统能力探测: ${supportedCache ? '支持' : '不支持'}（需 Windows 10 2004+）`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[ProcessAudio] 能力探测异常，视为不可用: ${message}`);
    supportedCache = false;
  }
  return supportedCache;
}

/** 仅测试用：重置缓存 */
export function resetProcessAudioCacheForTest(): void {
  cached = undefined;
  supportedCache = undefined;
}
