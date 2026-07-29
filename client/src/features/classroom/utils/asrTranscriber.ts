/**
 * 课堂 ASR 转写与并发控制
 *
 * @ai-context: 从 useClassroomCapture 拆出。转写 15s 超时、失败重试 1 次
 * （指数退避）。并发信号量限 3 路，排队上限 10——超限时丢弃最旧的排队段
 * 而非无限堆积（课堂场景下旧音频价值随时间衰减，宁可丢段也不让内存与
 * 延迟失控）。连续失败 3 次由调用方提示用户检查网关。
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

/** ASR 转写（15s 超时，失败后最多重试 1 次，指数退避） */
export async function transcribeWithRetry(payload: TranscribePayload, retries = 1): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await aiClient.post<{ text: string }>('/api/v1/asr/transcribe', payload, { timeout: 15000 });
      return resp.text?.trim() || null;
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

export function useAsrSemaphore() {
  const semaphoreRef = useRef({ active: 0, queue: [] as (() => void)[] });
  const healthRef = useRef({ lastSuccessTime: 0, consecutiveFailures: 0 });

  /** 申请并发槽位；返回 null 表示本段已被队列保护丢弃 */
  const acquire = useCallback((): Promise<void> | null => {
    const sem = semaphoreRef.current;
    if (sem.active < MAX_CONCURRENT_ASR) {
      sem.active++;
      return Promise.resolve();
    }
    // 队列保护：超出上限时丢弃最旧的排队任务
    if (sem.queue.length >= MAX_ASR_QUEUE) {
      sem.queue.shift(); // 移除最旧的等待者（其 Promise 永远不会 resolve，GC 会回收）
      console.warn('[useClassroomCapture] ASR 队列已满，丢弃最旧的排队段');
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
