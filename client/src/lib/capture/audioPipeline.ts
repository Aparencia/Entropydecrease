/**
 * 音频流水线处理（从 CaptureManager 拆出）
 * Audio pipeline handling, extracted from CaptureManager.
 *
 * @ai-context: 对应原 pushAudioChunk。按 capturePath 路由：full_record 忽略、
 * smart 交给 SmartCaptureController（VADMarker 检测语音段触发流式 ASR）、
 * fine 走 CrossFusion VAD 判定 + Pipeline 推送。含 ASR 静默排查的临时诊断日志
 * （原样保留），逻辑与拆分前一致。
 * @ai-context: Routes audio chunks by capture path exactly as before and keeps
 * the temporary [ASR-DIAG] diagnostic log untouched.
 */

import type { CaptureRuntime } from './captureRuntime';
import type { AudioChunkData } from './captureTypes';

/**
 * 推送音频块到流水线
 */
export function pushAudioChunk(rt: CaptureRuntime, audioData: AudioChunkData): void {
  // TEMP DIAGNOSTIC（ASR 静默排查）：音频块进入路由的分叉点
  console.info(
    `[ASR-DIAG] pushAudioChunk: path=${rt.capturePath}, hasSession=${!!rt.sessionId}, paused=${rt.isPaused}`,
  );
  const sessionId = rt.sessionId;
  if (!sessionId || rt.isPaused) return;

  // @ai-context Path C 全程录制：音频由 MediaRecorder 直接采集，无需处理
  if (rt.capturePath === 'full_record') return;

  // Path B 智能模式：VADMarker 检测语音段，流式触发 ASR 转写
  if (rt.capturePath === 'smart') {
    rt.smartController.pushAudioChunk(audioData);
    return;
  }

  // Path A（fine）：检查路由决策是否启用音频通道
  if (rt.lastDecision && !rt.lastDecision.audioEnabled) {
    return;
  }

  // VAD 检测：通过 CrossFusionEngine 判断是否有语音活动
  const voiceActive = rt.crossFusion.detectVoiceActivity(audioData.audioBuffer);
  if (voiceActive) {
    rt.crossFusion.requestVisionCapture();
  }

  const message = rt.pipeline.createMessage<AudioChunkData>(
    'audio_chunk',
    sessionId,
    audioData,
  );

  rt.pipeline.push(message);
}
