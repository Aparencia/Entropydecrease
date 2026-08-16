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
import { notifyQuotaExhaustedToRenderer } from './gatewayHttp.js';

/**
 * 流式 POST 请求：解析 SSE data: 行，逐 chunk yield 文本
 */
export async function* postJsonStream<TReq>(
  apiPath: string,
  body: TReq,
  authToken?: string,
  timeoutMs: number = 300000,
  /** 外部 AbortSignal（如用户取消流式请求），与内部超时 signal 组合 */
  externalSignal?: AbortSignal,
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

  // 组合外部 signal：如果外部 signal 被 abort，也 abort 内部 controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

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
    // 配额类 429：通知渲染进程展示配额耗尽提示（不改变既有抛错行为）
    if (resp.status === 429) notifyQuotaExhaustedToRenderer(detail);
    throw new Error(`Stream HTTP ${resp.status}: ${detail}`);
  }

  logger.info(`[AI] ← Stream started ${url}${requestId ? ` [req-id: ${requestId}]` : ''}`);

  if (!resp.body) {
    throw new Error('Stream response body is null');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  /** SSE 缓冲最大字节数，防止恶意服务端无分隔符输出耗尽内存 */
  const MAX_BUFFER_SIZE = 1 * 1024 * 1024; // 1MB
  /** CL-M2: 读取阶段无数据超时（ms）——原超时仅覆盖 fetch 建连阶段，
   *  服务端建连后挂起不发数据会导致读取永久等待 */
  const READ_TIMEOUT_MS = 30_000;

  try {
    while (true) {
      // CL-M2: 外部取消信号检查——abort 后立即停止消费，避免继续拉取
      if (externalSignal?.aborted) {
        break;
      }

      let { done, value } = await readWithTimeout(reader, READ_TIMEOUT_MS);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 缓冲上限检查：防止恶意服务端无分隔符输出耗尽内存
      if (buffer.length > MAX_BUFFER_SIZE) {
        throw new Error(`SSE buffer exceeded ${MAX_BUFFER_SIZE} bytes, possible malicious stream`);
      }

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
    // CL-M2: 所有退出路径（[DONE] 提前 return/异常/取消）必须 cancel 响应流，
    // 否则底层 TCP 连接保持打开直到 GC（连接泄漏）；cancel 对已自然结束的流为 no-op
    try {
      await reader.cancel();
    } catch {
      // 流已关闭时 cancel 抛错可忽略
    }
    reader.releaseLock();
  }
}

/**
 * CL-M2: 带超时的流读取——读取阶段无数据超时（30s）时取消流并抛错，
 * 防止服务端建连后挂起导致调用方永久等待；超时同时 cancel reader
 * 释放底层 TCP 连接（否则挂起的 read() 永远不结束）。
 */
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      // 取消流：让挂起的 read() 立即结束，并释放底层连接
      reader.cancel().catch(() => {});
      reject(new Error(`Stream read timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([reader.read(), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
