/**
 * 本地 ASR — 真流式控制器（Paraformer 在线识别）
 *
 * @ai-context: 把采集音频块实时喂给 sherpa-onnx Paraformer 在线识别器，边解码
 * 边推送：partial 结果节流推送（asr_stream_partial），端点检测（isEndpoint）
 * 断句后推送 final（asr_stream_final）并 reset 流。服务课堂 smart 采集的真流式
 * 转录；不可用时上层回退按段转写（见 useClassroomEvents）。
 * @ai-context: 单例状态机；音频输入要求 16kHz 单声道 Float32 PCM（与 native
 * process-audio / 端点环回采集输出格式一致）。partial 仅在识别文本变化且距上次
 * 推送 ≥150ms 时推送，避免 IPC 风暴。
 */

import type { BrowserWindow } from 'electron';
import { logger } from '../../logger.js';
import { getOnlineRecognizer, type OnlineStream } from './SherpaAsrService.js';

/** partial 推送节流：两次 partial 推送的最小间隔（ms） */
const PARTIAL_EMIT_INTERVAL_MS = 150;

// ================================================================
// 单例状态
// ================================================================

let _stream: OnlineStream | null = null;
let _win: BrowserWindow | null = null;
let _sampleRate = 16000;
/** 当前已识别文本（用于变化检测，reset 后清空） */
let _lastPartialText = '';
let _lastPartialEmitAt = 0;

/** 流式 ASR 是否激活 */
export function isStreamingActive(): boolean {
  return _stream !== null;
}

/** 向渲染进程推送事件（窗口已销毁时静默跳过） */
function emit(channel: 'asr_stream_partial' | 'asr_stream_final', payload: Record<string, unknown>): void {
  if (_win && !_win.isDestroyed()) {
    _win.webContents.send(channel, payload);
  }
}

/**
 * 启动流式 ASR：创建持久在线流。
 * @returns 成功标志与采样率；识别器不可用时 success=false
 */
export function startStreamingAsr(
  win: BrowserWindow,
  sampleRate = 16000,
): { success: boolean; sampleRate?: number; error?: string } {
  // 已在进行中：仅刷新目标窗口引用
  if (_stream) {
    _win = win;
    return { success: true, sampleRate: _sampleRate };
  }

  const recognizer = getOnlineRecognizer();
  if (!recognizer) {
    return { success: false, error: '流式识别器不可用（sherpa 未加载或 streaming 模型未下载）' };
  }

  try {
    _stream = recognizer.createStream();
    _win = win;
    _sampleRate = sampleRate;
    _lastPartialText = '';
    _lastPartialEmitAt = 0;
    logger.info(`[StreamingASR] 已启动 (sampleRate=${sampleRate})`);
    return { success: true, sampleRate };
  } catch (err) {
    logger.error(`[StreamingASR] 启动失败: ${err}`);
    _stream = null;
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 喂入一个音频块（Float32 PCM，16k 单声道）：解码并推送 partial / final。
 *
 * 流程：acceptWaveform → while isReady: decode → 检查 isEndpoint：
 * - 命中端点：取 final 文本推送 asr_stream_final，reset 流开启下一句；
 * - 未命中：取 partial 文本，变化且满足节流间隔时推送 asr_stream_partial。
 */
export function feedStreamingAsr(audioBuffer: ArrayBuffer, sampleRate?: number): void {
  if (!_stream || !_win || _win.isDestroyed()) return;
  const recognizer = getOnlineRecognizer();
  if (!recognizer) return;

  const samples = new Float32Array(audioBuffer);
  if (samples.length === 0) return;
  const rate = sampleRate ?? _sampleRate;

  try {
    _stream.acceptWaveform(rate, samples);
    while (recognizer.isReady(_stream)) {
      recognizer.decode(_stream);
    }

    // 端点检测：断句 → 推送 final 并 reset
    if (recognizer.isEndpoint(_stream)) {
      const finalText = recognizer.getResult(_stream).text?.trim() ?? '';
      recognizer.reset(_stream);
      _lastPartialText = '';
      _lastPartialEmitAt = 0;
      if (finalText) {
        emit('asr_stream_final', { text: finalText, timestamp: Date.now() });
      }
      return;
    }

    // partial：文本变化且满足节流间隔时推送
    const partialText = recognizer.getResult(_stream).text?.trim() ?? '';
    const now = Date.now();
    if (
      partialText &&
      partialText !== _lastPartialText &&
      now - _lastPartialEmitAt >= PARTIAL_EMIT_INTERVAL_MS
    ) {
      _lastPartialText = partialText;
      _lastPartialEmitAt = now;
      emit('asr_stream_partial', { text: partialText });
    }
  } catch (err) {
    logger.warn(`[StreamingASR] 解码异常: ${err}`);
  }
}

/** 停止流式 ASR：释放流并清理状态 */
export function stopStreamingAsr(): void {
  if (_stream) {
    try {
      _stream.free();
    } catch (err) {
      logger.warn(`[StreamingASR] 释放流失败: ${err}`);
    }
    _stream = null;
  }
  _win = null;
  _lastPartialText = '';
  _lastPartialEmitAt = 0;
  logger.info('[StreamingASR] 已停止');
}
