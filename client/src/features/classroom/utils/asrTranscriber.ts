/**
 * 课堂 ASR 转写与并发控制
 *
 * @ai-context: 从 useClassroomCapture 拆出。转写 15s 超时、失败重试 1 次
 * （指数退避）。并发信号量限 3 路，排队上限 10——超限时丢弃最旧的排队段
 * 而非无限堆积（课堂场景下旧音频价值随时间衰减，宁可丢段也不让内存与
 * 延迟失控）。连续失败 3 次由调用方提示用户检查网关。
 * @ai-context: 本地 ASR 优先策略——检测 local_asr_check_available，
 * 可用时走 IPC local_asr_transcribe（零成本、离线可用），
 * 失败且 fallbackToCloud=true 时降级到云端网关。
 */
import { useRef, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';

/** 最大并发 ASR 请求数 */
const MAX_CONCURRENT_ASR = 3;
/** 等待队列上限，超出丢弃最旧 */
const MAX_ASR_QUEUE = 10;

interface TranscribePayload {
  audio_base64: string;
  language: string;
  sample_rate: number;
  channels: number;
}

/** 转写响应（与后端 TranscribeResponse 对应的关键字段） */
interface TranscribeResponse {
  text: string;
  model_used?: string;
  warning?: string | null;
}

// ================================================================
// 本地 ASR 可用性缓存（避免每段都 IPC 查询）
// ================================================================

let _localAsrAvailable: boolean | null = null;
let _localAsrFallbackToCloud = true;

/** 本地→云端降级可见性回调（由 useClassroomEvents 注入 toast） */
let _asrFallbackCallback: (() => void) | null = null;
/** 会话级节流：一次会话最多提示一次降级，refreshLocalAsrStatus 在会话启动时复位 */
let _asrFallbackNotified = false;

/** 注册/注销 ASR 本地→云端降级回调（传 null 注销） */
export function setOnAsrFallback(cb: (() => void) | null): void {
  _asrFallbackCallback = cb;
}

/** 刷新本地 ASR 可用性缓存（课堂会话开始时调用一次） */
export async function refreshLocalAsrStatus(): Promise<boolean> {
  _asrFallbackNotified = false; // 新会话复位降级提示节流
  try {
    if (!window.electronAPI) {
      _localAsrAvailable = false;
      return false;
    }
    const status = await window.electronAPI.invoke('local_asr_check_available') as {
      available: boolean;
      enabled: boolean;
      modelDownloaded: boolean;
    };
    _localAsrAvailable = status.available && status.enabled;
    // 读取 fallback 配置
    const config = await window.electronAPI.invoke('local_asr_get_config') as { fallbackToCloud?: boolean };
    _localAsrFallbackToCloud = config.fallbackToCloud !== false;
    return _localAsrAvailable;
  } catch {
    _localAsrAvailable = false;
    return false;
  }
}

/** 获取当前本地 ASR 可用状态（同步，使用缓存） */
export function isLocalAsrReady(): boolean {
  return _localAsrAvailable === true;
}

// ================================================================
// 本地 ASR 转写（IPC 调用主进程 sherpa-onnx）
// ================================================================

async function transcribeLocalViaIpc(payload: TranscribePayload): Promise<string | null> {
  if (!window.electronAPI) throw new Error('electronAPI 不可用');
  const result = await window.electronAPI.invoke('local_asr_transcribe', {
    audioBase64: payload.audio_base64,
    language: payload.language,
    sampleRate: payload.sample_rate,
    channels: payload.channels,
  }) as { text: string; language: string; durationMs: number };
  return result.text?.trim() || null;
}

// ================================================================
// 云端 ASR 转写（原有逻辑）
// ================================================================

async function transcribeCloud(payload: TranscribePayload): Promise<string | null> {
  const resp = await aiClient.post<TranscribeResponse>('/api/v1/asr/transcribe', payload, { timeout: 15000 });
  // fallback 降级响应（含 warning 或 fallback 空文本）按失败处理
  if (resp.warning || (!resp.text?.trim() && resp.model_used === 'fallback')) {
    throw new Error(resp.warning || 'ASR 服务降级，转写结果为空');
  }
  return resp.text?.trim() || null;
}

// ================================================================
// 统一转写入口（本地优先 → 云端降级）
// ================================================================

/**
 * ASR 转写（本地优先，云端降级）
 *
 * 策略：
 * 1. 本地 ASR 可用 → IPC 调用 sherpa-onnx（零成本、离线可用）
 * 2. 本地失败 + fallbackToCloud → 降级到云端网关（15s 超时，重试 1 次）
 * 3. 本地不可用 → 直接走云端
 */
export async function transcribeWithRetry(payload: TranscribePayload, retries = 1): Promise<string | null> {
  // ── 本地 ASR 优先 ──
  if (_localAsrAvailable) {
    try {
      const text = await transcribeLocalViaIpc(payload);
      if (text) return text;
    } catch (localErr) {
      console.warn('[asrTranscriber] 本地 ASR 失败，尝试云端降级:', localErr);
      if (!_localAsrFallbackToCloud) throw localErr;
      // 降级可见性：会话级节流 1 次，回调由 useClassroomEvents 注入
      if (!_asrFallbackNotified) {
        _asrFallbackNotified = true;
        _asrFallbackCallback?.();
      }
    }
  }

  // ── 云端 ASR（带重试） ──
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await transcribeCloud(payload);
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
  return null;
}

/** 语言配置映射为 ASR 接口取值 */
export function toAsrLanguage(configLanguage: 'zh' | 'en' | 'mixed'): string {
  if (configLanguage === 'en') return 'en';
  if (configLanguage === 'mixed') return 'auto';
  return 'zh';
}

interface AsrSemaphoreOptions {
  /**
   * 队列保护丢弃段时的可观测回调。
   * @param droppedTotal 会话内累计丢弃段数
   * @param consecutiveDrops 连续丢弃次数（期间无段顺利入队/获取槽位时重置）
   */
  onDrop?: (droppedTotal: number, consecutiveDrops: number) => void;
}

export function useAsrSemaphore(options?: AsrSemaphoreOptions) {
  const semaphoreRef = useRef({
    active: 0,
    queue: [] as (() => void)[],
    droppedTotal: 0,
    consecutiveDrops: 0,
  });
  const healthRef = useRef({ lastSuccessTime: 0, consecutiveFailures: 0 });
  // ref 桥接：acquire 的 useCallback 依赖数组保持为空
  const onDropRef = useRef(options?.onDrop);
  onDropRef.current = options?.onDrop;

  /**
   * 申请并发槽位。
   * @ai-context 注意：本函数实际永不返回 null——队列满时丢弃的是已在队列
   * 中的最旧等待者，而非本次请求。返回类型保留 `Promise<void> | null` 仅为
   * 向后兼容既有消费点的判空写法（useClassroomEvents）。
   */
  const acquire = useCallback((): Promise<void> | null => {
    const sem = semaphoreRef.current;
    if (sem.active < MAX_CONCURRENT_ASR) {
      sem.active++;
      sem.consecutiveDrops = 0;
      return Promise.resolve();
    }
    // 队列保护：超出上限时丢弃最旧的排队任务
    if (sem.queue.length >= MAX_ASR_QUEUE) {
      sem.queue.shift(); // 移除最旧的等待者（其 Promise 永远不会 resolve，GC 会回收）
      sem.droppedTotal++;
      sem.consecutiveDrops++;
      console.warn(`[useClassroomCapture] ASR 队列已满，丢弃最旧的排队段（累计 ${sem.droppedTotal}）`);
      onDropRef.current?.(sem.droppedTotal, sem.consecutiveDrops);
    } else {
      sem.consecutiveDrops = 0;
    }
    return new Promise<void>((resolve) => {
      sem.queue.push(() => { sem.active++; resolve(); });
    });
  }, []);

  const release = useCallback(() => {
    const sem = semaphoreRef.current;
    sem.active--;
    if (sem.queue.length > 0) {
      const next = sem.queue.shift()!;
      next();
    }
  }, []);

  const markSuccess = useCallback(() => {
    healthRef.current.lastSuccessTime = Date.now();
    healthRef.current.consecutiveFailures = 0;
  }, []);

  /** 记录失败并返回是否达到"应提示用户"的阈值（恰好第 3 次） */
  const markFailure = useCallback((): boolean => {
    healthRef.current.consecutiveFailures++;
    return healthRef.current.consecutiveFailures === 3;
  }, []);

  return { acquire, release, markSuccess, markFailure };
}
