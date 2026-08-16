/**
 * 本地 ASR — 真流式控制器（Zipformer 在线识别）
 *
 * @ai-context: 把采集音频块实时喂给 sherpa-onnx Zipformer 在线识别器，边解码
 * 边推送：partial 结果节流推送（asr_stream_partial），端点检测（isEndpoint）
 * 断句后推送 final（asr_stream_final）并 reset 流。服务课堂 smart 采集的真流式
 * 转录；不可用时上层回退按段转写（见 useClassroomEvents）。
 * @ai-context: 单例状态机；音频输入要求 16kHz 单声道 Float32 PCM（与 native
 * process-audio / 端点环回采集输出格式一致）。partial 仅在识别文本变化且距上次
 * 推送 ≥150ms 时推送，避免 IPC 风暴。
 */

import type { BrowserWindow } from 'electron';
import { logger } from '../../logger.js';
import { cleanAsrResult, computeRms, estimateAsrConfidence, SILENCE_RMS_THRESHOLD } from '../../../src/lib/capture/asrFilters.js';
import { getOnlineRecognizer, feedWaveform, type OnlineStream } from './SherpaAsrService.js';
import { rescoreWithSenseVoice, pickRescored } from './sensevoiceRescore.js';

/** partial 推送节流：两次 partial 推送的最小间隔（ms） */
const PARTIAL_EMIT_INTERVAL_MS = 150;
/**
 * P0-5 CPU 优化：静音块隔块喂入——静音期模型反复 decode 无新内容却持续
 * 消耗 CPU，每隔 1 个静音块喂 1 次（端点检测延迟最多增加一个采集块粒度，
 * 可接受）；非静音块全部喂入保证识别实时性。
 */
const SILENT_FEED_SKIP_COUNT = 1;

// ================================================================
// 单例状态
// ================================================================

let _stream: OnlineStream | null = null;
let _win: BrowserWindow | null = null;
let _sampleRate = 16000;
/** 当前已识别文本（用于变化检测，reset 后清空） */
let _lastPartialText = '';
let _lastPartialEmitAt = 0;
/**
 * 会话级最新热词（P0-6）：渲染进程课程识别成功后经
 * local_asr_stream_set_hotwords 更新；每个端点断句后以最新热词重建流
 * （createStream(hotwords)），无需重启即可让新词条生效。
 */
let _latestHotwords: string | undefined;
/** 最近一次推送的 final 文本（停止 flush 时与尾句去重） */
let _lastFinalText = '';
/** 静音块跳过计数（隔块喂入，P0-5） */
let _silentSkipCounter = 0;
/**
 * P1-1 句音频累积：自上次端点断句以来的全部 PCM（含静音尾），
 * 端点命中时合并送 SenseVoice 整句重打分。
 */
let _sentencePcm: Float32Array[] = [];

/** 合并句音频（多块拼接，返回合并后 Float32Array） */
function collectSentencePcm(): Float32Array {
  const total = _sentencePcm.reduce((sum, buf) => sum + buf.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const buf of _sentencePcm) {
    merged.set(buf, offset);
    offset += buf.length;
  }
  _sentencePcm = [];
  return merged;
}

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
 * 启动流式 ASR：创建持久在线流（支持热词增强）。
 * @returns 成功标志与采样率；识别器不可用时 success=false
 */
export function startStreamingAsr(
  win: BrowserWindow,
  sampleRate = 16000,
  hotwords?: string,
): { success: boolean; sampleRate?: number; error?: string } {
  // 已在进行中：仅刷新目标窗口引用
  if (_stream) {
    if (sampleRate !== _sampleRate) {
      logger.warn(`[StreamingASR] 重入时采样率不一致：${sampleRate} vs ${_sampleRate}，忽略新采样率`);
    }
    _win = win;
    return { success: true, sampleRate: _sampleRate };
  }

  const recognizer = getOnlineRecognizer();
  if (!recognizer) {
    return { success: false, error: '流式识别器不可用（sherpa 未加载或 streaming 模型未下载）' };
  }

  try {
    // 透传热词增强字符串（zipformer-transducer 支持 createStream(hotwords)）
    _latestHotwords = hotwords;
    _stream = recognizer.createStream(hotwords);
    _win = win;
    _sampleRate = sampleRate;
    _lastPartialText = '';
    _lastPartialEmitAt = 0;
    _lastFinalText = '';
    _silentSkipCounter = 0;
    _sentencePcm = [];
    logger.info(`[StreamingASR] 已启动 (sampleRate=${sampleRate}${hotwords ? `, hotwords=${hotwords}` : ''})`);
    return { success: true, sampleRate };
  } catch (err) {
    logger.error(`[StreamingASR] 启动失败: ${err}`);
    _stream = null;
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 更新会话热词（P0-6）：渲染进程课程识别成功后调用。
 * 不立即重启流（会丢当前句），在下一个端点断句时以最新热词重建流生效。
 */
export function updateStreamingHotwords(hotwords: string | undefined): void {
  _latestHotwords = hotwords;
  logger.info(`[StreamingASR] 热词已更新，将在下一断句生效${hotwords ? ` (${hotwords.length} chars)` : ''}`);
}

/**
 * 喂入一个音频块（Float32 PCM，16k 单声道）：解码并推送 partial / final。
 *
 * 流程：acceptWaveform → while isReady: decode → 检查 isEndpoint：
 * - 命中端点：取 final 文本推送 asr_stream_final，reset 流开启下一句；
 * - 未命中：取 partial 文本，变化且满足节流间隔时推送 asr_stream_partial。
 *
 * @ai-context: 输出端统一经 cleanAsrResult（相邻重复压缩 + 幻觉过滤）——
 * Zipformer 流式在静音段存在重复输出最后词/短句的已知行为（"就是就是"），
 * 直接透传会让重复文本上屏；压缩/过滤在推送前完成，渲染进程无需感知。
 */
export function feedStreamingAsr(audioBuffer: ArrayBuffer, sampleRate?: number): void {
  if (!_stream || !_win || _win.isDestroyed()) return;
  const recognizer = getOnlineRecognizer();
  if (!recognizer) return;

  const samples = new Float32Array(audioBuffer);
  if (samples.length === 0) return;
  const rate = sampleRate ?? _sampleRate;

  // P1-1：句音频累积（含被隔块跳过的静音块——重打分需要完整句音频）
  _sentencePcm.push(new Float32Array(samples));

  // P0-5 静音隔块喂入：静音块每隔 1 块喂 1 次（端点检测延迟 +1 块粒度），
  // 降低静音期（课堂大部分时间）无效 decode 的 CPU 占用
  if (computeRms(audioBuffer) < SILENCE_RMS_THRESHOLD) {
    _silentSkipCounter++;
    if (_silentSkipCounter <= SILENT_FEED_SKIP_COUNT) return;
    _silentSkipCounter = 0;
  } else {
    _silentSkipCounter = 0;
  }

  try {
    // 统一适配层：新旧版 sherpa-onnx-node 的 acceptWaveform 签名不同
    feedWaveform(_stream, rate, samples);
    while (recognizer.isReady(_stream)) {
      recognizer.decode(_stream);
    }

    // 端点检测：断句 → 推送 final 并以最新热词重建流（P0-6 热词生效点）
    if (recognizer.isEndpoint(_stream)) {
      // 输出后处理：相邻重复压缩 + 幻觉过滤（静音段重复输出防护）
      const rawText = recognizer.getResult(_stream).text ?? '';
      // P1-1 两遍重打分：句音频送 SenseVoice 整句复核（一致性校验通过才替换）
      let finalRaw = rawText;
      let rescored = false;
      const sentencePcm = collectSentencePcm();
      if (sentencePcm.length > 0) {
        const rescoreResult = rescoreWithSenseVoice(sentencePcm);
        if (rescoreResult?.text) {
          const picked = pickRescored(rawText, rescoreResult.text);
          if (picked.rescored) {
            finalRaw = picked.text;
            rescored = true;
          }
        }
      }
      const finalText = cleanAsrResult(finalRaw);
      const confidence = rescored
        ? Math.max(estimateAsrConfidence(finalRaw, finalText), 0.85)
        : estimateAsrConfidence(finalRaw, finalText);
      _lastFinalText = finalText;
      // 重建流：以会话最新热词 createStream（热词变化无需重启即可生效）
      _stream = recognizer.createStream(_latestHotwords);
      _lastPartialText = '';
      _lastPartialEmitAt = 0;
      if (finalText) {
        emit('asr_stream_final', { text: finalText, confidence, timestamp: Date.now() });
      }
      return;
    }

    // partial：文本变化且满足节流间隔时推送（同样经重复压缩，预览与定稿一致）
    const partialText = cleanAsrResult(recognizer.getResult(_stream).text ?? '');
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

/**
 * 停止流式 ASR：先 flush 未定稿的尾句再释放流。
 *
 * @ai-context: 释放前若流内已有部分识别文本（未触发端点），取一次最终结果
 * 推送——FeynmanRecorder 的停止时序依赖此行为（注释承诺"flush 最后一段
 * final"），缺失会导致最后一句丢失。flush 后释放流并清理状态。
 */
export function stopStreamingAsr(): void {
  if (_stream) {
    try {
      // flush 尾句：仅在窗口存活且流内已有可交付文本时推送
      if (_win && !_win.isDestroyed()) {
        const recognizer = getOnlineRecognizer();
        const rawTail = recognizer ? recognizer.getResult(_stream).text ?? '' : '';
        const tailText = rawTail ? cleanAsrResult(rawTail) : '';
        // P0-4 flush 去重：尾句与最近一次 final 完全一致时不再推送
        // （端点已推送过该句，flush 重复上屏是停止瞬间重复的兜底场景）
        if (tailText && tailText !== _lastFinalText) {
          const confidence = estimateAsrConfidence(rawTail, tailText);
          emit('asr_stream_final', { text: tailText, confidence, timestamp: Date.now() });
        }
      }
      // 新版（1.13+）流对象无 free 方法（句柄由 GC 回收），可选调用
      _stream.free?.();
    } catch (err) {
      logger.warn(`[StreamingASR] 释放流失败: ${err}`);
    }
    _stream = null;
  }
  _win = null;
  _lastPartialText = '';
  _lastPartialEmitAt = 0;
  _lastFinalText = '';
  _silentSkipCounter = 0;
  _sentencePcm = [];
  logger.info('[StreamingASR] 已停止');
}
