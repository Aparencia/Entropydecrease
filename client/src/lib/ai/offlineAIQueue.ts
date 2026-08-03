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

// ── 队列状态订阅（供 React 层监听队列大小变化，驱动徽标 UI 更新）─────────────────

/** 队列大小变化监听器回调签名 */
type QueueSizeListener = (size: number) => void;
const queueSizeListeners: Set<QueueSizeListener> = new Set();

/**
 * 注册队列大小变化监听器（供 React 组件订阅队列状态，驱动徽标渲染）
 * @returns 取消订阅函数，组件卸载时调用以释放引用
 */
function subscribeQueueSize(listener: QueueSizeListener): () => void {
  queueSizeListeners.add(listener);
  return () => queueSizeListeners.delete(listener);
}

/** 查询当前队列大小并通知所有监听器（每次入队/出队后调用） */
async function notifyQueueSize(): Promise<void> {
  const size = await getQueueSize();
  queueSizeListeners.forEach((fn) => fn(size));
}

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
  // UX 设计理由：入队后立即给出轻量反馈，告知用户请求不会丢失，联网后将自动处理
  showToast('info', '请求已排队，联网后将自动处理');
  // 通知 UI 层更新队列徽标计数
  await notifyQueueSize();

  return id;
}

/**
 * 处理单条队列记录
 * 成功：从队列删除；失败：更新 retryCount / nextRetryAt 或标记 failed
 */
async function processItem(item: AIQueueItem): Promise<boolean> {
  // 标记为处理中
  await aiQueueDB.aiQueue.update(item.id, { status: 'processing' });

  try {
    await aiClient.post(item.endpoint, item.payload);
    // 消费成功，删除记录
    await aiQueueDB.aiQueue.delete(item.id);
    // 通知 UI 层更新队列徽标（单条完成时由 processQueue 汇总显示批量通知）
    await notifyQueueSize();
    return true;
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
    // 处理失败，返回 false（由 processQueue 汇总统计）
    return false;
  }
}

/**
 * 恢复上次运行卡死在 processing 状态的记录
 *
 * @ai-context 应用退出/崩溃时正在消费的记录会停留在 processing，
 * 而 processQueue 只查 pending——不恢复则这些已向用户承诺“已排队”
 * 的请求永久静默丢失。启动时统一重置为 pending 重新参与消费。
 */
async function recoverStuckItems(): Promise<void> {
  try {
    await aiQueueDB.aiQueue.where('status').equals('processing').modify({ status: 'pending' });
  } catch {
    // IndexedDB 不可用时静默降级，不影响主流程
  }
}

/** 消费互斥锁：防止启动消费与 online 事件消费并发进入导致同一请求重复上报 */
let processingLock = false;

/**
 * 消费队列：按 FIFO 顺序串行处理所有待消费条目
 *
 * 并发上限 1（串行消费，避免瞬间大量请求）。
 * 仅处理 status=pending 且 nextRetryAt <= now 的记录。
 * 处理完成后统一显示批量完成通知，避免多条 toast 连续弹出干扰用户。
 */
async function processQueue(): Promise<void> {
  if (processingLock) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return; // 仍然离线，跳过
  }
  processingLock = true;
  try {
    const now = Date.now();
    const pendingItems = await aiQueueDB.aiQueue
      .where('status')
      .equals('pending')
      .and((item) => item.nextRetryAt <= now)
      .sortBy('createdAt');

    // UX 设计理由：统计本批次成功完成的数量，处理完后统一展示汇总 toast，
    // 避免逐条弹出造成视觉噪音（当积压多条请求时尤为明显）
    let completedCount = 0;
    for (const item of pendingItems) {
      const success = await processItem(item);
      if (success) completedCount++;
      // 每条处理完短暂间隔，避免过快连击
      await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS));
    }

    // 批量完成汇总通知（仅当有成功完成的条目时才显示）
    if (completedCount > 0) {
      showToast(
        'success',
        completedCount === 1
          ? '离线 AI 请求已完成'
          : `离线队列已完成 ${completedCount} 个请求`,
      );
    }
  } finally {
    processingLock = false;
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
 * - 恢复上次卡死在 processing 的记录（防数据静默丢失）
 * - 应用启动时若在线则立即消费
 */
function startAutoProcess(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  window.addEventListener('online', onNetworkRestored);

  // 先恢复卡死记录再判断是否立即消费，确保 processing 残留不丢
  void recoverStuckItems().then(() => {
    // 启动时若在线则立即消费
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void processQueue();
    }
  });
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
  subscribeQueueSize,
  startAutoProcess,
  stopAutoProcess,
  registerQueueToast,
};
