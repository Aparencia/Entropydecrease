/**
 * 本地 ASR — sherpa-onnx 语音识别服务
 *
 * @ai-context: 基于 sherpa-onnx-node 原生 addon 实现本地 ASR。
 * 单一引擎：zipformer-transducer 中英双语流式模型，同时承担实时流式
 * 转写（streamingAsr.ts 真流式路径）与按段转写（transcribeLocal 路径）。
 * @ai-context: zipformer-transducer 支持 createStream(hotwords) 热词增强，
 * 热词字符串由调用方经 IPC payload 透传（详见 local_asr_transcribe 与
 * local_asr_stream_start 接口）。
 * @ai-context: sherpa-onnx-node 为可选依赖（optionalDependencies），
 * 加载失败时 isAvailable() 返回 false，上层自动降级到云端 ASR。
 * 符合项目"可选增强"设计原则。
 * @ai-context: 音频输入要求：16kHz 单声道 Float32 PCM。
 * 渲染进程发来的音频块已满足此格式（process-audio native addon 输出）。
 * @ai-context: sherpa-onnx-node API 兼容：旧版（<=1.12）导出工厂函数
 * createOnlineRecognizer；新版（1.13+，如 1.13.4）改为导出类
 * OnlineRecognizer（new 构造，config 形状不变）。
 * 下方工厂包装双路径兼容，否则升级依赖后 TypeError: ... is not a function。
 */

import * as path from 'path';
import * as os from 'os';
import { logger } from '../../logger.js';
import { cleanAsrResult } from '../../../src/lib/capture/asrFilters.js';
import {
  getLocalAsrConfig,
  getModelDir,
  isModelReady,
  MODEL_FILES,
} from './config.js';

// ================================================================
// sherpa-onnx 动态加载（可选依赖，加载失败不崩溃）
// ================================================================

/** 识别器构造器签名（新版 API：类导出） */
type RecognizerCtor<T> = new (config: Record<string, unknown>) => T;

interface SherpaOnnx {
  /** 旧版 API（<=1.12）：工厂函数 */
  createOnlineRecognizer?: (config: Record<string, unknown>) => OnlineRecognizer;
  /** 新版 API（1.13+）：类导出 */
  OnlineRecognizer?: RecognizerCtor<OnlineRecognizer>;
}

export interface OnlineRecognizer {
  createStream(hotwords?: string): OnlineStream;
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
  /** 新版 OnlineStream 未提供 free（句柄由 GC 回收），故为可选 */
  free?(): void;
}

/**
 * 向流喂入音频：自动适配新旧 API 签名差异。
 * 旧版（<=1.12）acceptWaveform(sampleRate, samples) 双参；
 * 新版（1.13+）acceptWaveform({ samples, sampleRate }) 单对象。
 * 按函数形参数（length）判别，调用方无需感知版本。
 */
export function feedWaveform(
  stream: OnlineStream,
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

let _onlineRecognizer: OnlineRecognizer | null = null;

/** 获取/创建 Zipformer 流式识别器（单例） */
export function getOnlineRecognizer(): OnlineRecognizer | null {
  if (_onlineRecognizer) return _onlineRecognizer;

  const sherpa = loadSherpa();
  if (!sherpa) return null;
  if (!isModelReady()) return null;

  const modelDir = getModelDir();
  const config = getLocalAsrConfig();
  const cpuCount = Math.max(1, os.cpus().length);
  // P0-5 CPU 优化：默认 min(4, cpuCount)（zipformer 小模型线程扩展性差，
  // 占满 CPU-1 线程是内测「离线 ASR CPU 100%」主因），用户配置硬上限 8
  const rawThreads = config.threads > 0 ? config.threads : Math.min(4, cpuCount);
  const threads = Math.min(rawThreads, 8);

  try {
    _onlineRecognizer = instantiateOnline(sherpa, {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        // zipformer2 属于 transducer 类模型：sherpa-onnx-node 的 C API 字段为
        // `transducer`（encoder/decoder/joiner 三件套），没有 `zipformer2` 字段；
        // 曾误用 zipformer2 导致字段被忽略、encoder 为空而创建失败
        transducer: {
          encoder: path.join(modelDir, MODEL_FILES.encoder),
          decoder: path.join(modelDir, MODEL_FILES.decoder),
          joiner: path.join(modelDir, MODEL_FILES.joiner),
        },
        tokens: path.join(modelDir, MODEL_FILES.tokens),
        numThreads: threads,
        provider: 'cpu',
      },
      // enableEndpoint 显式开启：sherpa-onnx-node 1.13+ 官方 API 为扁平字段，
      // 同时保留 endpointConfig 嵌套形状以兼容 rule2.minUtteranceLength=8
      enableEndpoint: true,
      endpointConfig: {
        rule1: { minTrailingSilence: 2.4 },
        // P0-4 重复修复：rule2 静音 1.2s→2.0s、minUtteranceLength 8→10——
        // 中文口语句内停顿普遍 1-2s，1.2s 阈值误断句会把同一句切成两段、
        // 段首重复段尾（内测「识别偶发重复」主要来源）；2.0s 覆盖绝大多数
        // 句内停顿，minUtteranceLength=10 保证短句不被切碎
        rule2: { minTrailingSilence: 2.0, minUtteranceLength: 10 },
        rule3: { minUtteranceLength: 20 },
      },
    });
    logger.info(`[LocalASR] Zipformer streaming recognizer created (threads=${threads})`);
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
 * 检测本地 ASR 是否可用（sherpa-onnx 已加载 + 模型已下载）
 */
export async function checkLocalAsrAvailable(): Promise<boolean> {
  const sherpa = loadSherpa();
  if (!sherpa) return false;
  return isModelReady();
}

/**
 * 真流式 ASR 是否可用（同步）：sherpa 已加载 + 本地 ASR 启用 + 模型就绪。
 * 供课堂智能采集决定是否走真流式链路（否则回退按段转写）。
 */
export function isStreamingAsrAvailable(): boolean {
  const sherpa = loadSherpa();
  if (!sherpa) return false;
  if (!getLocalAsrConfig().enabled) return false;
  return isModelReady();
}

/** 重置可用性缓存（模型下载完成后调用） */
export function resetAvailabilityCache(): void {
  _onlineRecognizer = null;
}

/**
 * 完整音频段转写（Zipformer 在线识别器，模拟流式喂入）
 *
 * 将完整音频段一次性喂入流式识别器，逐帧解码后返回最终文本。
 * 用于按段转写路径（课堂非真流式 / 课后分析）。
 *
 * @param pcmData - Float32 PCM 音频数据（16kHz 单声道）
 * @param hotwords - 可选热词增强字符串（zipformer-transducer 支持）
 * @returns 转写结果
 */
export async function transcribeStreaming(
  pcmData: Float32Array,
  hotwords?: string,
): Promise<{ text: string; engine: 'zipformer'; durationMs: number }> {
  const startTime = Date.now();

  const recognizer = getOnlineRecognizer();
  if (!recognizer) {
    throw new Error('Zipformer 识别器不可用（模型未下载或 sherpa-onnx 未安装）');
  }

  const stream = recognizer.createStream(hotwords);
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
    // 输出后处理：相邻重复压缩 + 幻觉过滤
    // P1-1 两遍重打分接入点：此处为本地按段转写最终文本出口，
    // SenseVoice 重打分将在此处对 text 做句末复核（高置信度者胜出）
    const text = cleanAsrResult(result.text ?? '');
    const durationMs = Date.now() - startTime;

    logger.debug(`[LocalASR] Zipformer transcribe: ${text.length} chars, ${durationMs}ms`);
    return { text, engine: 'zipformer', durationMs };
  } finally {
    stream.free?.();
  }
}

/**
 * 统一转写入口
 *
 * @param audioBase64 - base64 编码的 Float32 PCM 音频（16kHz 单声道）
 * @param options - 转写选项
 */
export async function transcribeLocal(
  audioBase64: string,
  options?: { language?: string; sampleRate?: number; channels?: number; hotwords?: string },
): Promise<{ text: string; language: string; durationMs: number }> {
  const config = getLocalAsrConfig();
  const language = options?.language ?? config.language;

  // P0-5 前置阻断：非 16kHz 采样率会严重降低识别质量（模型按 16k 训练），
  // 此前仅 warn 放行——内测「离线 ASR 识别不准确」的隐性来源之一。
  // 此处直接拒绝，渲染进程在采集启动前亦有前置校验（asrTranscriber）
  if (options?.sampleRate && options.sampleRate !== 16000) {
    throw new Error(`本地 ASR 要求 16kHz 单声道 Float32 PCM，收到 ${options.sampleRate}Hz`);
  }

  // base64 → Float32Array
  const rawBytes = Buffer.from(audioBase64, 'base64');
  const pcmData = new Float32Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength / 4);

  const result = await transcribeStreaming(pcmData, options?.hotwords);
  return { text: result.text, language, durationMs: result.durationMs };
}