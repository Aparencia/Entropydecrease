/**
 * 熵减 Service Worker 同步处理器
 *
 * 利用 Background Sync API（渐进增强）在网络恢复时
 * 通知客户端应用执行离线队列重放。
 *
 * PWA 模式增强：
 * - 离线操作写入 localStorage 队列作为降级存储
 * - 网络恢复时自动触发同步（online 事件）
 * - 支持 Periodic Background Sync（如果浏览器支持）
 *
 * 注意：Background Sync API 目前仅 Chromium 系浏览器完整支持，
 * 其他浏览器会静默降级，不影响正常功能。
 *
 * @ai-context: Service Worker：syncHandler。
 */

declare const self: ServiceWorkerGlobalScope;

interface SyncEvent extends ExtendableEvent {
  tag: string;
  waitUntil(promise: Promise<unknown>): void;
}

const SYNC_TAG = 'ed-sync';
const PERIODIC_SYNC_TAG = 'ed-periodic-sync';
const OFFLINE_QUEUE_KEY = 'ed_offline_queue';

/**
 * 监听 sync 事件 —— 当网络恢复时由浏览器触发
 */
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === SYNC_TAG || event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(replayOfflineQueue());
  }
});

/**
 * 监听来自客户端的 TRIGGER_SYNC 消息（降级同步用）
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'TRIGGER_SYNC') {
    event.waitUntil(replayOfflineQueue());
  }
});

/**
 * 通知所有已打开的客户端页面执行同步
 */
async function replayOfflineQueue(): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_REQUESTED' });
  });
}

/**
 * 注册一次 sync —— 由应用层在离线操作后调用
 * 例如：navigator.serviceWorker.ready.then(reg => reg.sync.register('ed-sync'))
 *
 * PWA 增强：
 * - 优先尝试 Background Sync API
 * - 若不支持，回退到 localStorage 队列 + online 事件触发
 */
export async function registerSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  if ('sync' in registration) {
    await (registration as unknown as { sync: { register(tag: string): Promise<void> } }).sync
      .register(SYNC_TAG);
  } else {
    // 降级方案：网络恢复时手动触发同步
    scheduleFallbackSync();
  }
}

/**
 * 监听来自 Service Worker 的消息
 * 返回一个取消订阅函数
 */
export function onSyncMessage(
  callback: (data: { type: string }) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'SYNC_REQUESTED') {
      callback(event.data);
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}

// ---------------------------------------------------------------------------
// PWA 增强：离线队列 + 降级同步
// ---------------------------------------------------------------------------

/**
 * 将离线操作记录到 localStorage 队列
 * 当 Background Sync 不可用时作为降级方案
 */
export function enqueueOfflineOperation(operation: {
  type: string;
  payload: unknown;
  timestamp: number;
}): void {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: Array<unknown> = raw ? JSON.parse(raw) : [];
    queue.push(operation);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage 不可用时静默失败
  }
}

/**
 * 获取当前离线队列中的所有待同步操作
 */
export function getOfflineQueue(): Array<{
  type: string;
  payload: unknown;
  timestamp: number;
}> {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 清空离线队列（同步完成后调用）
 */
export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    // 静默失败
  }
}

/**
 * 降级方案：监听 online 事件，网络恢复时触发同步
 * 通过 postMessage 通知 Service Worker 广播 SYNC_REQUESTED
 */
let _fallbackScheduled = false;

function scheduleFallbackSync(): void {
  if (_fallbackScheduled) return;
  _fallbackScheduled = true;

  const handler = () => {
    _fallbackScheduled = false;
    window.removeEventListener('online', handler);
    // 延迟 2 秒等待网络稳定
    setTimeout(() => {
      // 通过 postMessage 请求 SW 触发同步广播
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
      } else {
        // SW 不可用时，直接派发事件让应用层同步
        window.dispatchEvent(new CustomEvent('ed-sync-requested'));
      }
    }, 2000);
  };

  window.addEventListener('online', handler);
}

/**
 * 注册 Periodic Background Sync（如果浏览器支持）
 * 允许浏览器在后台定期触发同步，即使用户未打开应用
 */
export async function registerPeriodicSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ('periodicSync' in registration) {
      await (registration as unknown as {
        periodicSync: { register(tag: string, options: { minInterval: number }): Promise<void> };
      }).periodicSync.register(PERIODIC_SYNC_TAG, {
        // 最少每 24 小时同步一次
        minInterval: 24 * 60 * 60 * 1000,
      });
    }
  } catch {
    // Periodic Sync 不可用时静默降级
  }
}
