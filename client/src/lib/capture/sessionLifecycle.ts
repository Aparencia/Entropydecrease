/**
 * 采集会话生命周期编排（从 CaptureManager 拆出）
 * Session lifecycle orchestration, extracted from CaptureManager.
 *
 * @ai-context: 对应原 startSession/stopSession/initSessionRecord/emitStoppedAndReset。
 * 三路径（fine/smart/full_record）互斥编排不变：start 先隐式 stop；smart 走
 * SmartCaptureController、full_record 仅协调状态（录制在主进程）、fine 走
 * Pipeline/Worker 并动态注册 ASR Worker、启动融合定时器与帧看门狗。
 * @ai-context: Mirrors the original start/stop flow statement-by-statement;
 * counters, event emissions and store writes keep their exact order.
 */

import { ASRWorker } from '@/lib/ai/asrWorker';
import { captureEventBus } from './eventBus';
import { captureStore } from '@/lib/storage/captureStore';
import type { CaptureRuntime } from './captureRuntime';
import type { CaptureSessionConfig, VideoRecording } from './captureTypes';

/** 创建持久化会话并重置计数（三路径共用） */
export async function initSessionRecord(
  rt: CaptureRuntime,
  config: CaptureSessionConfig,
  mode: 'vision' | 'both',
): Promise<string> {
  const session = await captureStore.createSession({
    targetWindow: config.windowTitle,
    mode,
    status: 'active',
    segments: [],
  });
  rt.sessionId = session.id;
  rt.sessionConfig = config;
  rt.frameCount = 0;
  rt.extractedCount = 0;
  return session.id;
}

/**
 * 开始采集会话
 * 创建持久化会话记录，通过 RouteDispatcher 决策启用哪些 Worker，并初始化流水线状态
 */
export async function startSession(
  rt: CaptureRuntime,
  config: CaptureSessionConfig,
): Promise<string> {
  if (rt.sessionId) {
    await stopSession(rt);
  }

  rt.capturePath = config.path ?? 'fine';

  // Path B 智能模式：跳过 Pipeline/Worker，用轻量采样器 + 流式 ASR 替代
  if (rt.capturePath === 'smart') {
    const id = await initSessionRecord(rt, config, 'vision');
    rt.smartController.start(id, config.microphone);

    captureEventBus.emit('session:started', { sessionId: id, config, path: 'smart' });
    return id;
  }

  // Path C 全程录制：录制由 Electron 主进程 VideoRecorder 管理，此处仅协调状态
  if (rt.capturePath === 'full_record') {
    const id = await initSessionRecord(rt, config, 'vision');
    rt.fullRecordStartTime = Date.now();

    captureEventBus.emit('session:started', { sessionId: id, config, path: 'full_record' });
    return id;
  }

  // Path A（fine）原有逐帧流水线模式
  rt.lastDecision = rt.dispatcher.decide({
    hasWindowAccess: !!config.windowId,
    hasAudioSource: config.audioEnabled,
    uiAutomationAvailable: false, // Electron 环境下后续检测
  });

  // 根据决策动态注册 ASR Worker（传入用户配置的语言）
  if (rt.lastDecision.audioEnabled && !rt.asrWorker) {
    rt.asrWorker = new ASRWorker(config.language || 'zh');
    rt.pipeline.registerWorker(rt.asrWorker);
    rt.dispatcher.registerWorker(rt.asrWorker);
  } else if (!rt.lastDecision.audioEnabled && rt.asrWorker) {
    rt.pipeline.unregisterWorker('asr-worker');
    rt.dispatcher.unregisterWorker('asr-worker');
    rt.asrWorker = null;
  }

  // 创建持久化会话
  const id = await initSessionRecord(rt, config, rt.lastDecision.audioEnabled ? 'both' : 'vision');

  captureEventBus.emit('session:started', {
    sessionId: id,
    config,
    routeDecision: rt.lastDecision,
  });

  // 定期触发融合（每 3 秒）
  rt.fusionIntervalId = setInterval(() => {
    if (rt.sessionId) {
      rt.crossFusion.fuseByTimeWindow();
    }
  }, 3000);

  // 启动帧超时保底检测
  rt.frameWatchdog.reset();

  return id;
}

/**
 * 停止采集会话
 * 清空流水线队列，重置调度器，更新会话状态
 */
export async function stopSession(rt: CaptureRuntime): Promise<void> {
  const sessionId = rt.sessionId;
  if (!sessionId) return;

  // 最先停止帧超时保底计时器，防止在后续 await 期间触发重启
  rt.frameWatchdog.stop();

  // Path C 全程录制：构建 VideoRecording 并广播 record:video_ready
  if (rt.capturePath === 'full_record') {
    const duration = Date.now() - rt.fullRecordStartTime;

    await captureStore.updateSession(sessionId, {
      status: 'completed',
      endedAt: new Date(),
    });

    // 视频文件信息由主进程 VideoRecorder 在 stopRecording 后返回，
    // 此处先发事件，外部监听者可通过 IPC 查询最终文件路径
    const videoRecording: VideoRecording = {
      filePath: '', // 由调用方在 IPC stop 回调中填充
      duration,
      fileSizeBytes: 0, // 由调用方在 IPC stop 回调中填充
      format: 'webm',
      hasAudio: false,
    };

    captureEventBus.emit('record:video_ready', {
      sessionId,
      videoRecording,
    });

    emitStoppedAndReset(rt);
    rt.fullRecordStartTime = 0;
    return;
  }

  // Path B 智能模式：组装 SessionBundle 并广播
  if (rt.capturePath === 'smart') {
    const bundle = rt.smartController.assembleBundle();

    await captureStore.updateSession(sessionId, {
      status: 'completed',
      endedAt: new Date(),
    });

    captureEventBus.emit('smart:bundle_ready', {
      sessionId,
      bundle,
    });

    rt.smartController.stop();
    emitStoppedAndReset(rt);
    return;
  }

  // Path A（fine）原有流水线清理
  rt.pipeline.clear();
  rt.dispatcher.reset();
  rt.crossFusion.reset();
  rt.lastDecision = null;
  rt.isPaused = false;

  if (rt.fusionIntervalId !== null) {
    clearInterval(rt.fusionIntervalId);
    rt.fusionIntervalId = null;
  }

  await captureStore.updateSession(sessionId, {
    status: 'completed',
    endedAt: new Date(),
  });

  captureEventBus.emit('session:stopped', {
    sessionId,
    frameCount: rt.frameCount,
    extractedCount: rt.extractedCount,
  });

  rt.sessionId = null;
  rt.sessionConfig = null;
}

/** 广播 session:stopped 并重置公共会话状态（smart/full_record 共用） */
export function emitStoppedAndReset(rt: CaptureRuntime): void {
  captureEventBus.emit('session:stopped', {
    sessionId: rt.sessionId,
    frameCount: rt.frameCount,
    extractedCount: rt.extractedCount,
  });
  rt.sessionId = null;
  rt.sessionConfig = null;
  rt.capturePath = 'fine';
}
