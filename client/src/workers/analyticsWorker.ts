/**
 * @file 学习分析 Web Worker
 * @description 在后台线程执行聚合计算，避免阻塞主线程渲染
 *
 * 消息协议：
 * - 入站：{ type: 'aggregate', payload: { data: AggregateInput, days: number } }
 * - 出站：{ type: 'result', data: AnalyticsAggregate } | { type: 'error', message: string }
 *
 * @ai-context: Web Worker：analyticsWorker。
 */
import type { AggregateInput } from '../features/dashboard/utils/aggregator';
import { aggregateAnalytics } from '../features/dashboard/utils/aggregator';
import type { AnalyticsAggregate } from '../features/dashboard/types/analytics';

/** Worker 入站消息类型 */
interface AggregateMessage {
  type: 'aggregate';
  payload: { data: AggregateInput; days: number };
}

/** Worker 出站消息类型 */
type WorkerResponse =
  | { type: 'result'; data: AnalyticsAggregate }
  | { type: 'error'; message: string };

/**
 * 序列化日期字段：将 ISO 字符串还原为 Date 对象
 * Worker 接收的 JSON 中 Date 字段为字符串，需还原
 */
function reviveDates(data: AggregateInput): AggregateInput {
  return {
    sessions: data.sessions.map((s) => ({ ...s, completedAt: new Date(s.completedAt) })),
    notes: data.notes.map((n) => ({ ...n, createdAt: new Date(n.createdAt), updatedAt: new Date(n.updatedAt) })),
    flashcards: data.flashcards.map((f) => ({
      ...f, createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt),
      dueDate: new Date(f.dueDate), lastReviewDate: f.lastReviewDate ? new Date(f.lastReviewDate) : undefined,
    })),
    feynmanNotes: data.feynmanNotes.map((n) => ({
      ...n, createdAt: new Date(n.createdAt), updatedAt: new Date(n.updatedAt),
      completedAt: n.completedAt ? new Date(n.completedAt) : undefined,
    })),
    reviews: data.reviews.map((r) => ({ ...r, reviewedAt: new Date(r.reviewedAt) })),
  };
}

/**
 * 处理聚合请求
 * @param msg 入站消息
 * @returns 聚合结果或错误信息
 */
function handleAggregate(msg: AggregateMessage): WorkerResponse {
  try {
    const revived = reviveDates(msg.payload.data);
    const result = aggregateAnalytics(revived, msg.payload.days);
    return { type: 'result', data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', message: `聚合计算失败: ${message}` };
  }
}

// Worker 消息监听
self.addEventListener('message', (e: MessageEvent<AggregateMessage>) => {
  const msg = e.data;
  if (msg?.type === 'aggregate') {
    const response = handleAggregate(msg);
    self.postMessage(response);
  }
});
