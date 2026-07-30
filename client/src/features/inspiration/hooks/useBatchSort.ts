/**
 * @ai-context: inspiration 功能模块 Hook：useBatchSort。
 */
import { useState, useCallback, useRef } from 'react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useInspirationStore } from '../store/inspirationStore';
import type { InspirationItem } from '../store/inspirationStore';
import type { SortSuggestion } from '@/lib/ai/types';
import { useToast } from '@/components/ui';

const MAX_CONCURRENT = 3;
const REQUEST_INTERVAL_MS = 300;
const TIMEOUT_MS = 10_000;

const TIMEOUT_FALLBACK: SortSuggestion[] = [
  { category: 'todo', confidence: 0.1, reason: '分拣超时，建议手动整理' },
];

interface BatchError { id: string; message: string; }

export function useBatchSort() {
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<BatchError[]>([]);
  const abortRef = useRef(false);
  const { toast } = useToast();

  const batchSort = useCallback(async (items: InspirationItem[]) => {
    if (items.length === 0) return;
    abortRef.current = false;
    setProgress(0);
    setTotal(items.length);
    setIsProcessing(true);
    setErrors([]);

    const updateSortStatus = useInspirationStore.getState().updateSortStatus;
    const collectedErrors: BatchError[] = [];
    let completed = 0;

    // Semaphore: limit concurrent requests
    let active = 0;
    let nextIdx = 0;

    const processOne = async (item: InspirationItem): Promise<void> => {
      if (abortRef.current) return;
      updateSortStatus(item.id, 'sorting');
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
        );
        const existingTags: Record<string, string> = {
          content_nature: item.tags.content_nature,
          cognitive_depth: item.tags.cognitive_depth,
          subject: item.tags.subject,
        };
        const result = await Promise.race([
          aiPluginLoader.sortInspiration(item.content, existingTags),
          timeoutPromise,
        ]);
        if (!abortRef.current) {
          updateSortStatus(item.id, 'sorted', result.suggestions);
        }
      } catch (err: unknown) {
        const isTimeout = err instanceof Error && err.message === 'timeout';
        const msg = isTimeout ? '分拣超时' : (err instanceof Error ? err.message : '分拣失败');
        if (isTimeout) {
          updateSortStatus(item.id, 'sorted', TIMEOUT_FALLBACK);
        } else {
          updateSortStatus(item.id, 'pending');
          collectedErrors.push({ id: item.id, message: msg });
        }
      } finally {
        completed++;
        setProgress(completed);
      }
    };

    const runNext = async (): Promise<void> => {
      while (nextIdx < items.length && !abortRef.current) {
        const idx = nextIdx++;
        active++;
        await processOne(items[idx]);
        active--;
        // 请求间隔，避免触发频率限制
        if (nextIdx < items.length && !abortRef.current) {
          await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS));
        }
      }
    };

    // 启动最多 MAX_CONCURRENT 个并发 worker
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, () => runNext());
    await Promise.all(workers);

    if (collectedErrors.length > 0) {
      setErrors(collectedErrors);
      toast({ type: 'error', message: `${collectedErrors.length} 条灵感分拣失败，已跳过` });
    }
    setIsProcessing(false);
  }, [toast]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setProgress(0);
    setTotal(0);
    setIsProcessing(false);
    setErrors([]);
  }, []);

  return { progress, total, isProcessing, errors, batchSort, reset };
}
