/**
 * AI 网关流式请求层（SSE 解析）
 *
 * @ai-context: 从 ai/utils.ts 拆出。按 \n\n 分割 SSE 事件、data: 行
 * 逐 chunk yield；[DONE] 结束、parsed.error 抛错、JSON 解析失败时
 * 回退为纯文本 yield（网关某些端点直接输出文本片段）。
 * 消费方为 streamHandler.ts（转发到渲染进程 ai:stream:* 事件）。
 */
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { gatewayUrl } from './gatewayConfig.js';

/**
 * 流式 POST 请求：解析 SSE data: 行，逐 chunk yield 文本
 */
export async function* postJsonStream<TReq>(
  apiPath: string,
  body: TReq,
  authToken?: string,
  timeoutMs: number = 300000,
): AsyncGenerator<string, void, unknown> {
  const base = gatewayUrl();
  if (!base) {
    throw new Error('[AI] Gateway URL not configured');
  }
  const url = `${base}${apiPath}`;
  const clientRequestId = randomUUID();

  logger.info(`[AI] → POST (stream) ${url} [req-id: ${clientRequestId}]`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': clientRequestId,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (networkError: unknown) {
    const err = networkError as { name?: string; message?: string };
    if (err.name === 'AbortError') {
      throw new Error(`Stream request timeout after ${timeoutMs}ms`);
    }
    throw new Error(`Stream network error: ${err.message || String(networkError)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const requestId = resp.headers.get('ai-gateway-request-id') ?? undefined;

  if (!resp.ok) {
    const detail = await resp.text().catch(() => 'unknown error');
    logger.error(`[AI] ✖ Stream HTTP ${resp.status} ${url} [req-id: ${requestId ?? clientRequestId}]: ${detail.slice(0, 200)}`);
    throw new Error(`Stream HTTP ${resp.status}: ${detail}`);
  }

  logger.info(`[AI] ← Stream started ${url}${requestId ? ` [req-id: ${requestId}]` : ''}`);

  if (!resp.body) {
    throw new Error('Stream response body is null');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按 \n\n 分割 SSE 事件
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              return;
            }
            // 先单独解析 JSON：仅捕获解析失败（回退纯文本），
            // 避免把下方 parsed.error 的主动 throw 一并吞掉——
            // 那个 throw 必须传播出去才能触发上层「流式失败→降级非流式」。
            let parsed: { error?: string; chunk?: string } | null = null;
            try {
              parsed = JSON.parse(data);
            } catch {
              // JSON 解析失败，尝试作为纯文本
              if (data) {
                yield data;
              }
              continue;
            }
            if (parsed?.error) {
              throw new Error(`Stream error: ${parsed.error}`);
            }
            if (parsed?.chunk) {
              yield parsed.chunk;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
