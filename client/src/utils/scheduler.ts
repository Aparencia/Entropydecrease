/**
 * 主线程任务调度器
 * 将长任务分片为 <16ms 的微任务，保证60fps
 *
 * @ai-context: 工具函数：scheduler。
 */

/** 在空闲时段执行低优先级任务 */
export function scheduleIdle<T>(task: () => T): Promise<T> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => resolve(task()));
    } else {
      setTimeout(() => resolve(task()), 1);
    }
  });
}

/** 将长数组处理分片为多个帧 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T) => R,
  chunkSize = 50,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = chunk.map(processor);
    results.push(...chunkResults);
    // 每处理一批，让出主线程
    if (i + chunkSize < items.length) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return results;
}

/** 预加载路由组件（在空闲时段） */
export function prefetchRoute(importFn: () => Promise<unknown>): void {
  scheduleIdle(() => importFn().catch((err) => {
    console.debug('[scheduler] prefetch route module failed', err);
  }));
}
