/**
 * 帧流水线处理（从 CaptureManager 拆出）
 * Frame pipeline handling, extracted from CaptureManager.
 *
 * @ai-context: 对应原 pushFrame/handleResult/handleError。按 capturePath 路由：
 * full_record 仅计帧、smart 交给 SmartCaptureController、fine 走 Pipeline；
 * P8 视觉模式注入 metadata.visionMode 供 VisionWorker 消费；结果/错误处理
 * 委托 captureResultProcessor。逻辑与原实现一致，仅状态改为经 CaptureRuntime 读写。
 * @ai-context: Routes frames by capture path exactly as before; side effects
 * (counters, watchdog reset, events) keep their original order.
 */

import { processExtractionResult, processExtractionError } from './captureResultProcessor';
import { captureEventBus } from './eventBus';
import type { CaptureRuntime } from './captureRuntime';
import type { ExtractionResult, PipelineMessage, ScreenshotData } from './captureTypes';

/**
 * 推送截图帧到流水线
 */
export function pushFrame(rt: CaptureRuntime, frameData: ScreenshotData): void {
  const sessionId = rt.sessionId;
  if (!sessionId || rt.isPaused) return;

  // @ai-context Path C 全程录制：帧数据由 MediaRecorder 直接采集，无需处理
  if (rt.capturePath === 'full_record') {
    rt.frameCount++;
    return;
  }

  // Path B 智能模式：通过 SmartSampler 筛选关键帧
  if (rt.capturePath === 'smart') {
    rt.frameCount++;
    rt.smartController.pushFrame(sessionId, frameData);
    return;
  }

  // Path A（fine）原有逐帧推送：检查路由决策是否启用视觉通道
  if (rt.lastDecision && !rt.lastDecision.visionEnabled) {
    return;
  }

  const message = rt.pipeline.createMessage<ScreenshotData>(
    'screenshot',
    sessionId,
    frameData,
  );
  // P8 视觉提取模式注入：VisionWorker 读取 metadata.visionMode 选择提取策略
  if (rt.visionMode && rt.visionMode !== 'auto') {
    message.metadata = { ...message.metadata, visionMode: rt.visionMode };
  }

  const accepted = rt.pipeline.push(message);
  if (accepted) {
    rt.frameCount++;
    // 每收到一帧，重置保底计时器
    rt.frameWatchdog.reset();
    captureEventBus.emit('frame:pushed', {
      sessionId,
      messageId: message.id,
      frameCount: rt.frameCount,
    });
  }
}

/**
 * 流水线结果回调（委托 captureResultProcessor 持久化/融合/广播）
 */
export function handleResult(
  rt: CaptureRuntime,
  result: ExtractionResult,
  message: PipelineMessage,
): void {
  const sessionId = rt.sessionId;
  if (!sessionId) return;
  rt.extractedCount++;
  processExtractionResult(
    rt.dispatcher,
    rt.crossFusion,
    {
      sessionId,
      sessionConfig: rt.sessionConfig,
      extractedCount: rt.extractedCount,
    },
    result,
    message,
  );
}

/**
 * 流水线错误回调（映射失败通道并触发调度器降级）
 */
export function handleError(rt: CaptureRuntime, error: Error, message: PipelineMessage): void {
  const newDecision = processExtractionError(rt.dispatcher, rt.sessionId, error, message);
  if (newDecision) {
    rt.lastDecision = newDecision;
  }
}
