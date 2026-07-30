/**
 * AI 离线请求队列
 *
 * 断网时将 AI 请求持久化到 IndexedDB，恢复网络后按 FIFO 顺序自动消费。
 * 使用独立的 Dexie 实例，不与 sync-service 的 offlineQueue 共用。
 *
 * @ai-context: 离线 AI 请求排队与网络恢复重放，与 sync/OfflineQueue 相互独立（AI 请求专用）。
 * @ai-context: 警告——IndexedDB 库名 'keban-ai-queue' 为存量数据标识，与主库 'keban' 同属品牌改名永久豁免项，绝对不可改名。
 */

import Dexie, { type Table } from 'dexie';
import { aiClient } from '../http/apiClient';

// ── 数据模型 ──────────────────────────────────────────────────────────────────

/** AI 离线请求记录 */
export interface AIQueueItem {
  id: string;          // UUID
  feature: string;     // 'summarize' | 'generate-cards' | 'evaluate' | 'recommend'
  endpoint: string;    // API 路径，如 '/api/v1/ai/summarize'
  payload: unknown;    // 请求体
  createdAt: number;   // 时间戳（ms）
  retryCount: number;  // 已重试次数
  status: 'pending' | 'processing' | 'completed' | 'failed';
  nextRetryAt: number; // 下次可重试时间戳（指数退避）
}

// ── 常量 ───────────────────────────────────────────────────────────────────────

const MAX_QUEUE_SIZE = 20;
const MAX_RETRY_COUNT = 3;
const BASE_DELAY_MS = 500;
const RETRY_BACKOFF_MS = 2000;

// ── 独立 Dexie 实例 ────────────────────────────────────────────────────────────

class AIQueueDatabase extends Dexie {
  aiQueue!: Table<AIQueueItem, string>;

  constructor() {
    // 库名为存量数据标识，永久豁免品牌改名（见文件头 @ai-context）
    super('keban-ai-queue');
    this.version(1).stores({
      aiQueue: 'id, feature, status, createdAt, nextRetryAt',
    });
  }
}

const aiQueueDB = new AIQueueDatabase();

// ── Toast 桥接（供 React 层注入） ─────────────────────────────────────────────

type ToastFn = (options: { type: 'success' | 'error' | 'warning' | 'info'; message: string }) => void;

let toastFn: ToastFn | null = null;

/**
 * 注册 Toast 回调函数（由 React 组件在挂载时调用）
 * @example
 * const { toast } = useToast();
 * useEffect(() => {
 *   registerQueueToast(toast);
 * }, [toast]);
 */
export function registerQueueToast(fn: ToastFn): void {
  toastFn = fn;
}

function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
  toastFn?.({ type, message });
}

// ── 队列操作 ───────────────────────────────────────────────────────────────────

/**
 * 生成 UUID（轻量版，无需 crypto.randomUUID）
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 计算下次重试时间（指数退避）
 * 间隔 = BASE_DELAY_MS + retryCount * RETRY_BACKOFF_MS
 */
function calcNextRetryAt(retryCount: number): number {
  return Date.now() + BASE_DELAY_MS + retryCount * RETRY_BACKOFF_MS;
}

/**
 * 入队：将 AI 请求写入 IndexedDB
 *
 * 队列满 20 条时，覆盖最旧条目（按 createdAt 升序）。
 * 入队后弹出 Toast 提示用户。
 */
async function enqueue(feature: string, endpoint: string, payload: unknown): Promise<string> {
  const id = generateId();
  const now = Date.now();

  const item: AIQueueItem = {
    id,
    feature,
    endpoint,
    payload,
    createdAt: now,
    retryCount: 0,
    status: 'pending',
    nextRetryAt: now, // 立即可重试
  };

  // 检查队列大小，满时删除最旧条目
  const count = await aiQueueDB.aiQueue.where('status').anyOf(['pending', 'processing']).count();
  if (count >= MAX_QUEUE_SIZE) {
    const oldest = await aiQueueDB.aiQueue
      .where('status')
      .anyOf(['pending', 'processing'])
      .sortBy('createdAt');
    if (oldest.length > 0) {
      await aiQueueDB.aiQueue.delete(oldest[0].id);
    }
  }

  await aiQueueDB.aiQueue.add(item);
  showToast('info', '已加入队列，联网后自动重试');

  return id;
}

/**
 * 处理单条队列记录
 * 成功：从队列删除；失败：更新 retryCount / nextRetryAt 或标记 failed
 */
async function processItem(item: AIQueueItem): Promise<void> {
  // 标记为处理中
  await aiQueueDB.aiQueue.update(item.id, { status: 'processing' });

  try {
    await aiClient.post(item.endpoint, item.payload);
    // 消费成功，删除记录
    await aiQueueDB.aiQueue.delete(item.id);
    showToast('success', '离线 AI 请求已完成');
  } catch {
    const newRetryCount = item.retryCount + 1;
    if (newRetryCount >= MAX_RETRY_COUNT) {
      // 超过最大重试次数，标记失败
      await aiQueueDB.aiQueue.update(item.id, {
        status: 'failed',
        retryCount: newRetryCount,
      });
      showToast('error', `AI 请求失败（已重试 ${MAX_RETRY_COUNT} 次）`);
    } else {
      // 回退到 pending，设置指数退避
      await aiQueueDB.aiQueue.update(item.id, {
        status: 'pending',
        retryCount: newRetryCount,
        nextRetryAt: calcNextRetryAt(newRetryCount),
      });
    }
  }
}

/**
 * 消费队列：按 FIFO 顺序串行处理所有待消费条目
 *
 * 并发上限 1（串行消费，避免瞬间大量请求）。
 * 仅处理 status=pending 且 nextRetryAt <= now 的记录。
 */
async function processQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return; // 仍然离线，跳过
  }

  const now = Date.now();
  const pendingItems = await aiQueueDB.aiQueue
    .where('status')
    .equals('pending')
    .and((item) => item.nextRetryAt <= now)
    .sortBy('createdAt');

  for (const item of pendingItems) {
    await processItem(item);
    // 每条处理完短暂间隔，避免过快连击
    await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS));
  }
}

/**
 * 网络恢复时触发队列消费
 */
function onNetworkRestored(): void {
  void processQueue();
}

/**
 * 获取当前待处理队列大小（pending + processing）
 */
async function getQueueSize(): Promise<number> {
  return aiQueueDB.aiQueue
    .where('status')
    .anyOf(['pending', 'processing'])
    .count();
}

/**
 * 清空队列（删除所有记录，包括 failed）
 */
async function clearQueue(): Promise<void> {
  await aiQueueDB.aiQueue.clear();
}

// ── 生命周期管理 ───────────────────────────────────────────────────────────────

let listenersAttached = false;

/**
 * 启动队列监听（应用初始化时调用一次）
 *
 * - 注册 window online 事件监听
 * - 应用启动时若在线则立即消费
 */
function startAutoProcess(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  window.addEventListener('online', onNetworkRestored);

  // 启动时若在线则立即消费
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void processQueue();
  }
}

/**
 * 停止监听（一般不需要调用，供测试用）
 */
function stopAutoProcess(): void {
  window.removeEventListener('online', onNetworkRestored);
  listenersAttached = false;
}

// ── 导出公共接口 ────────────────────────────────────────────────────────────────

export const offlineAIQueue = {
  enqueue,
  processQueue,
  getQueueSize,
  clearQueue,
  startAutoProcess,
  stopAutoProcess,
  registerQueueToast,
};
