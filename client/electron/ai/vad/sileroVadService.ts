/**
 * 本地 Silero VAD 服务（主进程，onnxruntime-node）
 *
 * @ai-context: 在主进程用 onnxruntime-node 运行 silero_vad_v5 模型（有状态
 * 流式 VAD），渲染进程经 IPC `vad_silero_process` 喂入 PCM 块换取语音概率。
 * 选主进程而非渲染进程 onnxruntime-web 的原因：Electron 生产环境 file://
 * 协议下 wasm 加载与 worker/COI 均不可靠（见 docs/knowledge/bugs/
 * 2026-08-classroom-asr-file-protocol-worklet-load-failure.md 的教训——
 * "API 可用"≠"资源可用"），Node 环境加载本地模型无此问题。
 * @ai-context EN: Silero v5 VAD runs in the Electron main process via
 * onnxruntime-node. The renderer feeds PCM chunks over IPC and receives
 * speech probabilities. Main-process hosting avoids the wasm/worker/COI
 * pitfalls of file:// in production builds.
 * @ai-context: 模型文件从 node_modules 包内读取（@ricky0123/vad-web 的
 * dist/silero_vad_v5.onnx），dev 与 asar 打包后路径均可命中（fs 对 asar
 * 透明）。加载/推理任一失败均静默降级为 unavailable，渲染进程回退纯 RMS
 * VAD（本地优先原则下的优雅降级，不阻塞采集）。
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { safeHandle } from '../../ipcUtils.js';
import { IPC_CHANNELS } from '../../ipc/channels.js';
import { logger } from '../../logger.js';

// ================================================================
// 懒加载状态
// ================================================================

/** onnxruntime InferenceSession 实例（懒加载单例） */
let _session: import('onnxruntime-node').InferenceSession | null = null;
/** Silero v5 有状态推理的 state 张量 [2,1,128] */
let _state: import('onnxruntime-node').Tensor | null = null;
/** 加载是否已永久失败（避免反复重试） */
let _loadFailed = false;
/** 进行中的加载 Promise（并发去重） */
let _loadPromise: Promise<boolean> | null = null;

/** 解析 silero_vad_v5.onnx 模型路径（dev = client/node_modules；prod = asar 内 node_modules） */
function resolveModelPath(): string {
  return path.join(
    app.getAppPath(),
    'node_modules',
    '@ricky0123',
    'vad-web',
    'dist',
    'silero_vad_v5.onnx',
  );
}

/** 懒加载模型与会话；返回是否可用。失败静默（渲染进程降级 RMS） */
function ensureLoaded(): Promise<boolean> {
  if (_session && _state) return Promise.resolve(true);
  if (_loadFailed) return Promise.resolve(false);
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async (): Promise<boolean> => {
    try {
      // 与 sherpa-onnx-node 同款动态加载模式（可选依赖失败不崩溃）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
      const modelPath = resolveModelPath();
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Silero 模型文件不存在: ${modelPath}`);
      }
      _session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });
      // 初始 state：零张量 [2,1,128]（与 @ricky0123/vad-web 的 SileroV5 初始化一致）
      _state = new ort.Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
      logger.info(`[SileroVAD] 模型加载成功: ${modelPath}`);
      return true;
    } catch (err) {
      _loadFailed = true;
      _session = null;
      _state = null;
      logger.warn(`[SileroVAD] 模型加载失败，VAD 降级纯 RMS: ${err}`);
      return false;
    }
  })();
  return _loadPromise;
}

/** 重置流状态（新会话开始时调用，state 归零） */
function resetState(): void {
  _state = null;
  if (_session) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
      _state = new ort.Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
    } catch {
      _state = null;
    }
  }
}

/**
 * 整块 PCM 推理，返回语音概率（0-1）。
 * 输入要求 16kHz 单声道 Float32；块长任意（v5 模型支持可变长输入）。
 * 推理失败返回 null 并置失效（下次调用重新加载一次）。
 */
async function processPcm(pcm: Float32Array): Promise<number | null> {
  if (!(await ensureLoaded())) return null;
  if (!_session || !_state) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
    const input = new ort.Tensor('float32', pcm, [1, pcm.length]);
    const sr = new ort.Tensor('int64', new BigInt64Array([16000n]), [1]);
    const results = await _session.run({ input, state: _state, sr });
    if (!results.stateN || !results.output) {
      logger.warn('[SileroVAD] 推理输出缺失 stateN/output');
      return null;
    }
    _state = results.stateN;
    const prob = results.output.data[0];
    return typeof prob === 'number' ? prob : null;
  } catch (err) {
    logger.warn(`[SileroVAD] 推理失败，本次概率置空: ${err}`);
    // 会话对象损坏时释放，下次 process 会重新加载
    _session = null;
    _state = null;
    return null;
  }
}

// ================================================================
// IPC 注册
// ================================================================

/** 注册 Silero VAD IPC handler（ai/index.ts 统一调用） */
export function registerVadHandlers(): void {
  safeHandle(
    IPC_CHANNELS.VAD_SILERO_PROCESS,
    async (
      _event,
      args: { samples: ArrayBuffer; sampleRate?: number; reset?: boolean },
    ) => {
      if (args?.reset) resetState();
      const available = await ensureLoaded();
      if (!available || !args?.samples) {
        return { probability: null, available };
      }
      if (args.sampleRate && args.sampleRate !== 16000) {
        // P0-5 采样率校验口径：非 16k 直接拒绝（本地引擎要求 16k）
        logger.warn(`[SileroVAD] 非预期采样率: ${args.sampleRate}Hz，跳过推理`);
        return { probability: null, available };
      }
      const pcm = new Float32Array(args.samples);
      if (pcm.length === 0) return { probability: null, available };
      const probability = await processPcm(pcm);
      return { probability, available: probability !== null };
    },
  );
  logger.info('[SileroVAD] IPC handler registered (vad_silero_process)');
}
