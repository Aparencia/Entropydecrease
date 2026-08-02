/**
 * AI 请求超时包装器
 *
 * @ai-context: 前端 hooks 层兜底安全网——当下游（IPC/fetch）Promise 长时间
 * 未 settle 时，主动以 AIError('timeout') reject，避免 UI 永远卡在 loading。
 * 超时值须大于 Electron IPC 层超时（40-60s）以避免误杀正常慢请求。
 * @ai-context: Frontend hook-layer safety net — proactively rejects with
 * AIError('timeout') when downstream promises never settle.
 */
import { AIError } from '../ai-errors';

/** 默认超时：75 秒（IPC 层最大 60s + 15s 缓冲） */
export const AI_REQUEST_TIMEOUT_MS = 75_000;

/** 为 Promise 添加超时兜底，超时后抛出 AIError('timeout', retryable=true) */
export function withTimeout<T>(promise: Promise<T>, ms = AI_REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AIError('AI 服务响应超时，请稍后重试', 'timeout', true));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
