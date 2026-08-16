/**
 * SenseVoice 两遍重打分服务（P1-1，主进程）
 *
 * @ai-context: sherpa-onnx 的 SenseVoice-Small 非流式识别器（offline），
 * 对整句音频做二次识别（整句注意力上下文精度优于流式解码）。流式
 * Zipformer 负责实时出字，句末由本服务重打分，经一致性校验后择优。
 * 模型未下载/加载失败时静默不可用（重打分是可选增强，不影响流式主链路）。
 * @ai-context EN: SenseVoice offline rescoring for two-pass ASR. The
 * streaming Zipformer keeps real-time output; at sentence end SenseVoice
 * re-recognizes the full-sentence audio, and the better result wins after a
 * consistency check. Degrades silently when the model is unavailable.
 * @ai-context: 兼容 sherpa-onnx-node 新旧 API（createOfflineRecognizer 工厂
 * 与 OfflineRecognizer 类，与 SherpaAsrService 的在线识别器同模式）。
 */

import path from 'path';
import { logger } from '../../logger.js';
import { getRescoreModelDir, isRescoreModelReady, RESCORE_MODEL_FILES } from './config.js';

// ================================================================
// 类型与状态
// ================================================================

/** sherpa-onnx offline 识别器最小接口（本服务仅用到的成员） */
interface OfflineRecognizer {
  createStream(): OfflineStream;
  getResult(stream: OfflineStream): { text: string };
}

interface OfflineStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  acceptWaveform(waveform: { samples: Float32Array; sampleRate: number }): void;
  free?(): void;
}

interface SherpaOnnxOffline {
  createOfflineRecognizer?: (config: Record<string, unknown>) => OfflineRecognizer;
  OfflineRecognizer?: new (config: Record<string, unknown>) => OfflineRecognizer;
}

let _recognizer: OfflineRecognizer | null = null;
let _loadAttempted = false;
let _loadFailed = false;

// ================================================================
// 加载与推理
// ================================================================

/** 懒加载 SenseVoice offline 识别器（单例；失败后不再重试） */
function ensureLoaded(): OfflineRecognizer | null {
  if (_recognizer) return _recognizer;
  if (_loadFailed) return null;
  if (_loadAttempted) return null; // 进行中（同步加载，无并发窗口）
  _loadAttempted = true;

  try {
    if (!isRescoreModelReady()) {
      logger.info('[SenseVoiceRescore] 重打分模型未下载，跳过（可选增强）');
      _loadFailed = true;
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sherpa = require('sherpa-onnx-node') as SherpaOnnxOffline;
    const modelDir = getRescoreModelDir();
    const config = {
      modelConfig: {
        senseVoice: {
          model: path.join(modelDir, RESCORE_MODEL_FILES.model),
          useInverseTextNormalization: true,
        },
        tokens: path.join(modelDir, RESCORE_MODEL_FILES.tokens),
        numThreads: 2,
        provider: 'cpu',
      },
    };
    // 双路径兼容（旧版工厂函数 / 新版类构造），与在线识别器同模式
    if (typeof sherpa.createOfflineRecognizer === 'function') {
      _recognizer = sherpa.createOfflineRecognizer(config);
    } else if (typeof sherpa.OfflineRecognizer === 'function') {
      _recognizer = new sherpa.OfflineRecognizer(config);
    } else {
      throw new Error('sherpa-onnx-node 无离线识别器入口（版本过旧？）');
    }
    logger.info('[SenseVoiceRescore] SenseVoice 重打分识别器就绪');
    return _recognizer;
  } catch (err) {
    _loadFailed = true;
    logger.warn(`[SenseVoiceRescore] 加载失败，重打分不可用: ${err}`);
    return null;
  }
}

/** 重打分是否可用（模型就绪；供渲染进程可用性展示） */
export function isRescoreAvailable(): boolean {
  return ensureLoaded() !== null;
}

/** 模型下载完成后重置缓存（modelManager 调用） */
export function resetRescoreCache(): void {
  _recognizer = null;
  _loadAttempted = false;
  _loadFailed = false;
}

export interface RescoreResult {
  text: string;
  durationMs: number;
}

/** Jaccard 字符集相似度（本地实现，避免跨包依赖） */
function jaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 两遍重打分择优：SenseVoice 结果与原流式结果一致性校验。
 * - 重打分文本为空 → 保留原结果（未通过重打分）
 * - 完全一致 → 保留原结果（无变化，避免无谓替换）
 * - 一致性 Jaccard ≥0.35 → 采用重打分文本（整句注意力上下文精度优于流式）
 * - 差异过大（<0.35）→ 保留流式原结果（音频质量差时两个解码器都不可信，
 *   保守取与实时显示一致的结果，避免上屏文本整句跳变）
 */
export function pickRescored(
  original: string,
  rescored: string,
): { text: string; rescored: boolean } {
  const r = (rescored ?? '').trim();
  if (!r || r === original) return { text: original, rescored: false };
  if (jaccard(original, r) >= 0.35) return { text: r, rescored: true };
  return { text: original, rescored: false };
}

/**
 * 对整句 PCM（16kHz 单声道 Float32）做 SenseVoice 重打分。
 * 失败/不可用返回 null（调用方保留流式原结果）。
 */
export function rescoreWithSenseVoice(pcm: Float32Array): RescoreResult | null {
  const recognizer = ensureLoaded();
  if (!recognizer || pcm.length === 0) return null;
  const startTime = Date.now();
  try {
    const stream = recognizer.createStream();
    const CHUNK = 3200; // 200ms 块
    for (let offset = 0; offset < pcm.length; offset += CHUNK) {
      const chunk = pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length));
      if (stream.acceptWaveform.length <= 1) {
        stream.acceptWaveform({ samples: chunk, sampleRate: 16000 });
      } else {
        stream.acceptWaveform(16000, chunk);
      }
    }
    const text = recognizer.getResult(stream)?.text?.trim() ?? '';
    stream.free?.();
    return { text, durationMs: Date.now() - startTime };
  } catch (err) {
    logger.warn(`[SenseVoiceRescore] 重打分推理失败: ${err}`);
    return null;
  }
}
