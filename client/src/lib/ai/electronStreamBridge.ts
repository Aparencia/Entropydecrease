/**
 * Electron IPC 流式桥（SSE over IPC）
 *
 * @ai-context: 渲染进程经 'ai:stream:start' 发起，主进程以
 * 'ai:stream:chunk/end/error' 事件回推；requestId 关联请求与事件，
 * 队列 + Promise 桥接把事件流转为 AsyncGenerator。finally 中必须
 * 取消三个监听，否则重复调用会泄漏 listener。
 * @ai-context: method 参数是网关流式端点路径（如 '/api/v1/ai/summarize/stream'），
 * 由主进程 streamHandler 原样转发，新增流式功能需网关+主进程+此处三端对齐。
 */
import { AIError } from './ai-errors';
import { getActiveUserKey } from './apiKeyManager';

/**
 * 通过 IPC 流式推送获取 AI 响应
 * 生成 requestId，启动流式请求，监听 chunk/end/error 事件
 */
export async function* streamIpc(
  authToken: string | null,
  method: string,
  payload: Record<string, unknown>,
): AsyncGenerator<string, void, unknown> {
  const requestId = crypto.randomUUID();
  const api = window.electronAPI;
  if (!api) throw new AIError('Electron API 不可用', 'service_unavailable', false);

  // 启动流式请求
  api.invoke('ai:stream:start', { requestId, method, payload, authToken, userApiKey: getActiveUserKey() });

  // 等待流式结果的 Promise-based 桥接
  const queue: Array<{ type: 'chunk'; chunk: string } | { type: 'end' } | { type: 'error'; error: string }> = [];
  let resolve: (() => void) | null = null;

  const notify = () => { if (resolve) { resolve(); resolve = null; } };

  const unsubChunk = api.on('ai:stream:chunk', (...args: unknown[]) => {
    const data = args[0] as { requestId: string; chunk: string };
    if (data.requestId === requestId) { queue.push({ type: 'chunk', chunk: data.chunk }); notify(); }
  });
  const unsubEnd = api.on('ai:stream:end', (...args: unknown[]) => {
    const data = args[0] as { requestId: string };
    if (data.requestId === requestId) { queue.push({ type: 'end' }); notify(); }
  });
  const unsubError = api.on('ai:stream:error', (...args: unknown[]) => {
    const data = args[0] as { requestId: string; error: string };
    if (data.requestId === requestId) { queue.push({ type: 'error', error: data.error }); notify(); }
  });

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>(r => { resolve = r; });
      }
      const item = queue.shift();
      if (!item) continue;
      if (item.type === 'chunk') yield item.chunk;
      else if (item.type === 'end') return;
      else if (item.type === 'error') throw new AIError(item.error, 'service_unavailable', true);
    }
  } finally {
    unsubChunk();
    unsubEnd();
    unsubError();
  }
}
