/**
 * 本地 ASR — sherpa-onnx 语音识别服务
 *
 * @ai-context: 基于 sherpa-onnx-node 原生 addon 实现本地 ASR。
 * 双引擎架构：
 * - offline（SenseVoice）：非流式，50ms/段极速推理，中文准确率最高，课后精修
 * - streaming（Paraformer）：流式，边说边出 < 200ms 延迟，实时字幕
 * @ai-context: sherpa-onnx-node 为可选依赖（optionalDependencies），
 * 加载失败时 isAvailable() 返回 false，上层自动降级到云端 ASR。
 * 符合项目"可选增强"设计原则。
 * @ai-context: 音频输入要求：16kHz 单声道 Float32 PCM。
 * 渲染进程发来的音频块已满足此格式（process-audio native addon 输出）。
 * @ai-context: sherpa-onnx-node API 兼容：旧版（<=1.12）导出工厂函数
 * createOfflineRecognizer/createOnlineRecognizer；新版（1.13+，如 1.13.4）
 * 改为导出类 OfflineRecognizer/OnlineRecognizer（new 构造，config 形状不变）。
 * 下方工厂包装双路径兼容，否则升级依赖后 TypeError: ... is not a function
 * （2026-08 真流式启动失败根因，离线路径同样受影响）。
 */

import * as path from 'path';
import * as os from 'os';
import { logger } from '../../logger.js';
import { cleanAsrResult } from '../../../src/lib/capture/asrFilters.js';
import {
  getLocalAsrConfig,
  getModelDir,
  isModelReady,
  type AsrEngine,
} from './config.js';

// ================================================================
// sherpa-onnx 动态加载（可选依赖，加载失败不崩溃）
// ================================================================

/** 识别器构造器签名（新版 API：类导出） */
type RecognizerCtor<T> = new (config: Record<string, unknown>) => T;

interface SherpaOnnx {
  /** 旧版 API（<=1.12）：工厂函数 */
  createOfflineRecognizer?: (config: Record<string, unknown>) => OfflineRecognizer;
  createOnlineRecognizer?: (config: Record<string, unknown>) => OnlineRecognizer;
  /** 新版 API（1.13+）：类导出 */
  OfflineRecognizer?: RecognizerCtor<OfflineRecognizer>;
  OnlineRecognizer?: RecognizerCtor<OnlineRecognizer>;
}

interface OfflineRecognizer {
  createStream(): OfflineStream;
  decode(stream: OfflineStream): void;
  getResult(stream: OfflineStream): { text: string };
}

interface OfflineStream {
  /** 旧版：(sampleRate, samples)；新版 1.13+：({ samples, sampleRate })，统一走 feedWaveform */
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  acceptWaveform(waveform: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
  /** 新版 OnlineStream/OfflineStream 未提供 free（句柄由 GC 回收），故为可选 */
  free?(): void;
}

export interface OnlineRecognizer {
  createStream(): OnlineStream;
  decode(stream: OnlineStream): void;
  isReady(stream: OnlineStream): boolean;
  getResult(stream: OnlineStream): { text: string };
  isEndpoint(stream: OnlineStream): boolean;
  reset(stream: OnlineStream): void;
}

export interface OnlineStream {
  /** 旧版：(sampleRate, samples)；新版 1.13+：({ samples, sampleRate })，统一走 feedWaveform */
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  acceptWaveform(waveform: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
  free?(): void;
}

/**
 * 向流喂入音频：自动适配新旧 API 签名差异。
 * 旧版（<=1.12）acceptWaveform(sampleRate, samples) 双参；
 * 新版（1.13+）acceptWaveform({ samples, sampleRate }) 单对象。
 * 按函数形参数（length）判别，调用方无需感知版本。
 */
export function feedWaveform(
  stream: OnlineStream | OfflineStream,
  sampleRate: number,
  samples: Float32Array,
): void {
  if (stream.acceptWaveform.length <= 1) {
    stream.acceptWaveform({ samples, sampleRate });
  } else {
    stream.acceptWaveform(sampleRate, samples);
  }
}

let _sherpa: SherpaOnnx | null = null;
let _loadAttempted = false;

/** 创建离线识别器：优先旧版工厂函数，缺失时用新版类构造 */
function instantiateOffline(sherpa: SherpaOnnx, config: Record<string, unknown>): OfflineRecognizer {
  if (typeof sherpa.createOfflineRecognizer === 'function') {
    return sherpa.createOfflineRecognizer(config);
  }
  if (typeof sherpa.OfflineRecognizer === 'function') {
    return new sherpa.OfflineRecognizer(config);
  }
  throw new Error('sherpa-onnx-node 既无 createOfflineRecognizer 工厂也无 OfflineRecognizer 类，请核对依赖版本');
}

/** 创建在线识别器：优先旧版工厂函数，缺失时用新版类构造 */
function instantiateOnline(sherpa: SherpaOnnx, config: Record<string, unknown>): OnlineRecognizer {
  if (typeof sherpa.createOnlineRecognizer === 'function') {
    return sherpa.createOnlineRecognizer(config);
  }
  if (typeof sherpa.OnlineRecognizer === 'function') {
    return new sherpa.OnlineRecognizer(config);
  }
  throw new Error('sherpa-onnx-node 既无 createOnlineRecognizer 工厂也无 OnlineRecognizer 类，请核对依赖版本');
}

/** 尝试加载 sherpa-onnx-node（仅尝试一次） */
function loadSherpa(): SherpaOnnx | null {
  if (_loadAttempted) return _sherpa;
  _loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sherpa = require('sherpa-onnx-node') as SherpaOnnx;
    logger.info('[LocalASR] sherpa-onnx-node loaded successfully');
  } catch (err) {
    logger.warn(`[LocalASR] sherpa-onnx-node not available (optional dependency): ${err}`);
    _sherpa = null;
  }
  return _sherpa;
}

// ================================================================
// Recognizer 单例缓存
// ================================================================

let _offlineRecognizer: OfflineRecognizer | null = null;
let _onlineRecognizer: OnlineRecognizer | null = null;

/** 获取/创建 SenseVoice 非流式识别器（单例） */
function getOfflineRecognizer(): OfflineRecognizer | null {
  if (_offlineRecognizer) return _offlineRecognizer;

  const sherpa = loadSherpa();
  if (!sherpa) return null;
  if (!isModelReady('offline')) return null;

  const modelDir = getModelDir('offline');
  const config = getLocalAsrConfig();
  const threads = config.threads > 0 ? config.threads : Math.max(1, os.cpus().length - 1);

  try {
    _offlineRecognizer = instantiateOffline(sherpa, {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: {
          model: path.join(modelDir, 'model.int8.onnx'),
          language: config.language === 'auto' ? 'auto' : config.language,
          useItn: true,
        },
        tokens: path.join(modelDir, 'tokens.txt'),
        numThreads: threads,
        provider: 'cpu',
      },
    });
    logger.info(`[LocalASR] SenseVoice offline recognizer created (threads=${threads})`);
    return _offlineRecognizer;
  } catch (err) {
    logger.error(`[LocalASR] Failed to create offline recognizer: ${err}`);
    return null;
  }
}

/** 获取/创建 Paraformer 流式识别器（单例） */
export function getOnlineRecognizer(): OnlineRecognizer | null {
  if (_onlineRecognizer) return _onlineRecognizer;

  const sherpa = loadSherpa();
  if (!sherpa) return null;
  if (!isModelReady('streaming')) return null;

  const modelDir = getModelDir('streaming');
  const config = getLocalAsrConfig();
  const threads = config.threads > 0 ? config.threads : Math.max(1, os.cpus().length - 1);

  try {
    _onlineRecognizer = instantiateOnline(sherpa, {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        paraformer: {
          encoder: path.join(modelDir, 'encoder.onnx'),
          decoder: path.join(modelDir, 'decoder.onnx'),
        },
        tokens: path.join(modelDir, 'tokens.txt'),
        numThreads: threads,
        provider: 'cpu',
      },
      endpointConfig: {
        rule1: { minTrailingSilence: 2.4 },
        // rule2 必须配 minUtteranceLength：仅给 minTrailingSilence 时默认 0，
        // 等于"1.2s 停顿即断句"——中文口语停顿频繁，短句被切碎会导致
        // 相邻句边界词重复观感。8s 覆盖绝大多数短句，兼顾实时性
        rule2: { minTrailingSilence: 1.2, minUtteranceLength: 8 },
        rule3: { minUtteranceLength: 20 },
      },
    });
    logger.info(`[LocalASR] Paraformer streaming recognizer created (threads=${threads})`);
    return _onlineRecognizer;
  } catch (err) {
    logger.error(`[LocalASR] Failed to create streaming recognizer: ${err}`);
    return null;
  }
}

// ================================================================
// 公共 API
// ================================================================

/**
 * TODO(P1-3 热词增强): 经查 sherpa-onnx-node 类型声明，hotwords 仅 transducer
 * 系模型支持（OfflineStream createStream(hotwords)，见 non-streaming-asr.js 注释
 * "Hotwords are supported only by transducer models"）；本项目使用的
 * SenseVoice（offline）与 Paraformer（streaming）均不支持。故本期不透传热词，
 * 渲染进程词表 boost 词条已由 hotwordRuntime.getSessionBoostWords() 预留，
 * 未来若换用 zipformer-transducer 模型，可给 local_asr_transcribe /
 * local_asr_stream_start 的 IPC payload 增加可选 hotwords 字段（旧载荷须兼容）
 * 并在 createStream 时传入。云端网关热词透传同为遗留项（不改 transcribe.py）。
 */

/**
 * 检测本地 ASR 是否可用（sherpa-onnx 已加载 + 模型已下载）
 */
export async function checkLocalAsrAvailable(): Promise<boolean> {
  const sherpa = loadSherpa();
  if (!sherpa) return false;

  const config = getLocalAsrConfig();
  return isModelReady(config.engine);
}

/**
 * 真流式 ASR 是否可用（同步）：sherpa 已加载 + 本地 ASR 启用 + streaming（Paraformer）模型就绪。
 * 供课堂智能采集决定是否走真流式链路（否则回退按段转写）。
 */
export function isStreamingAsrAvailable(): boolean {
  const sherpa = loadSherpa();
  if (!sherpa) return false;
  if (!getLocalAsrConfig().enabled) return false;
  return isModelReady('streaming');
}

/** 重置可用性缓存（模型下载完成后调用） */
export function resetAvailabilityCache(): void {
  _offlineRecognizer = null;
  _onlineRecognizer = null;
}

/**
 * 非流式转写（SenseVoice）— 适合课后全量分析
 *
 * @param pcmData - Float32 PCM 音频数据（16kHz 单声道）
 * @param options - 转写选项
 * @returns 转写结果
 */
export async function transcribeOffline(
  pcmData: Float32Array,
  options?: { language?: string },
): Promise<{ text: string; engine: 'offline'; durationMs: number }> {
  const startTime = Date.now();

  const recognizer = getOfflineRecognizer();
  if (!recognizer) {
    throw new Error('SenseVoice 识别器不可用（模型未下载或 sherpa-onnx 未安装）');
  }

  const stream = recognizer.createStream();
  try {
    feedWaveform(stream, 16000, pcmData);
    stream.inputFinished();
    recognizer.decode(stream);
    const result = recognizer.getResult(stream);
    // 输出后处理：相邻重复压缩 + 幻觉过滤（与流式路径一致，见 streamingAsr.ts）
    const text = cleanAsrResult(result.text ?? '');
    const durationMs = Date.now() - startTime;

    logger.debug(`[LocalASR] Offline transcribe: ${text.length} chars, ${durationMs}ms`);
    return { text, engine: 'offline', durationMs };
  } finally {
    stream.free?.();
  }
}

/**
 * 流式转写（Paraformer）— 适合实时字幕
 *
 * 将完整音频段一次性喂入流式识别器，逐帧解码后返回最终文本。
 * 真正的"边录边出"需要渲染进程持续推送音频块（后续版本支持）。
 *
 * @param pcmData - Float32 PCM 音频数据（16kHz 单声道）
 * @returns 转写结果
 */
export async function transcribeStreaming(
  pcmData: Float32Array,
): Promise<{ text: string; engine: 'streaming'; durationMs: number }> {
  const startTime = Date.now();

  const recognizer = getOnlineRecognizer();
  if (!recognizer) {
    throw new Error('Paraformer 识别器不可用（模型未下载或 sherpa-onnx 未安装）');
  }

  const stream = recognizer.createStream();
  try {
    // 分块喂入（模拟流式，每块 1600 样本 = 100ms）
    const chunkSize = 1600;
    for (let offset = 0; offset < pcmData.length; offset += chunkSize) {
      const chunk = pcmData.subarray(offset, Math.min(offset + chunkSize, pcmData.length));
      feedWaveform(stream, 16000, chunk);
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
    }

    // 尾部解码
    stream.inputFinished();
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }

    const result = recognizer.getResult(stream);
    // 输出后处理：相邻重复压缩 + 幻觉过滤（与流式路径一致，见 streamingAsr.ts）
    const text = cleanAsrResult(result.text ?? '');
    const durationMs = Date.now() - startTime;

    logger.debug(`[LocalASR] Streaming transcribe: ${text.length} chars, ${durationMs}ms`);
    return { text, engine: 'streaming', durationMs };
  } finally {
    stream.free?.();
  }
}

/**
 * 统一转写入口（根据配置选择引擎）
 *
 * @param audioBase64 - base64 编码的 Float32 PCM 音频（16kHz 单声道）
 * @param options - 转写选项
 */
export async function transcribeLocal(
  audioBase64: string,
  options?: { language?: string; sampleRate?: number; channels?: number; engine?: AsrEngine },
): Promise<{ text: string; language: string; durationMs: number }> {
  const config = getLocalAsrConfig();
  const engine = options?.engine ?? config.engine;
  const language = options?.language ?? config.language;

  // base64 → Float32Array
  const rawBytes = Buffer.from(audioBase64, 'base64');
  const pcmData = new Float32Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength / 4);

  if (engine === 'streaming' && isModelReady('streaming')) {
    const result = await transcribeStreaming(pcmData);
    return { text: result.text, language, durationMs: result.durationMs };
  }

  // 默认走 offline（SenseVoice）
  const result = await transcribeOffline(pcmData, { language });
  return { text: result.text, language, durationMs: result.durationMs };
}
