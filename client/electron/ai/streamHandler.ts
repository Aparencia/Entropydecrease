/**
 * AI 流式输出 IPC Handler
 *
 * 处理 ai:stream:start IPC 请求，通过 postJsonStream() 获取 SSE 流，
 * 将 chunk 以 50ms 节流推送到渲染进程。
 *
 * 通信协议：
 * - 渲染进程 → 主进程：ipcRenderer.invoke('ai:stream:start', { requestId, method, payload })
 * - 主进程 → 渲染进程：
 *   - 'ai:stream:chunk'  { requestId, chunk }
 *   - 'ai:stream:end'    { requestId }
 *   - 'ai:stream:error'  { requestId, error }
 *
 * @ai-context: AI 流式请求 IPC（ai:stream:start）：postJsonStream 逐 chunk 经 ai:stream:chunk/end/error 事件推回渲染进程，requestId 关联。
 */

import { safeHandle } from '../ipcUtils.js';
import { logger } from '../logger.js';
import { postJsonStream } from './utils.js';

// ================================================================
// 节流配置
// ================================================================

/** IPC chunk 推送节流间隔（ms），防止高频 chunk 风暴 */
const CHUNK_THROTTLE_MS = 50;

/** 活跃的流式请求 AbortController 映射（requestId → controller） */
const activeStreams = new Map<string, AbortController>();

// ================================================================
// IPC Handler 注册
// ================================================================

/**
 * 注册 ai:stream:start handler
 *
 * 渲染进程通过 invoke 发起流式请求，主进程逐 chunk 推送到渲染进程。
 * 使用 50ms 节流合并高频 chunk，防止 IPC 风暴。
 */
export function registerStreamHandler(): void {
  safeHandle(
    'ai:stream:start',
    async (
      event,
      args: {
        requestId: string;
        /** API 路径，如 /api/v1/ai/summarize/stream */
        method: string;
        /** 请求体 */
        payload: Record<string, unknown>;
        /** 认证 token */
        authToken?: string;
      },
    ) => {
      const { requestId, method, payload, authToken } = args;
      const sender = event.sender;

      // CL-M1: API 路径白名单校验——method 实为路径，直接拼入 URL 可访问
      // 网关任意端点（含 ?/# 注入参数）；仅允许受信任的 AI 功能路径
      const VALID_STREAM_PATH = /^\/api\/v1\/(ai|multimodal)\/[A-Za-z0-9_\/-]+$/;
      if (
        typeof method !== 'string' ||
        method.includes('?') ||
        method.includes('#') ||
        !VALID_STREAM_PATH.test(method)
      ) {
        logger.warn(`[AI] [stream] 拒绝非法路径: ${method}`);
        return { ok: false, error: 'Invalid stream path' };
      }

      logger.info(`[AI] [stream] Start: requestId=${requestId}, method=${method}`);

      // 为该流式请求创建 AbortController
      const abortController = new AbortController();
      activeStreams.set(requestId, abortController);

      // CL-L9: 发起流式请求的窗口销毁时清理活跃流——否则 for await 继续从
      // 网关拉取直到流结束/超时（默认 300s），多次开关窗口累积残留流
      const wc = event.sender;
      wc.once('destroyed', () => {
        const controller = activeStreams.get(requestId);
        if (controller) {
          controller.abort();
          activeStreams.delete(requestId);
          logger.info(`[AI] [stream] Window destroyed, aborted stream: requestId=${requestId}`);
        }
      });

      // 50ms 节流缓冲
      let chunkBuffer = '';
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      let cancelled = false;

      /** 将缓冲区内的 chunk 一次性推送到渲染进程 */
      function flushChunks(): void {
        if (cancelled || !chunkBuffer) return;
        if (sender.isDestroyed()) return;
        sender.send('ai:stream:chunk', { requestId, chunk: chunkBuffer });
        chunkBuffer = '';
        throttleTimer = null;
      }

      try {
        const stream = postJsonStream(
          method,
          payload,
          authToken,
          undefined,
          abortController.signal,
        );

        for await (const chunk of stream) {
          if (cancelled || abortController.signal.aborted) {
            cancelled = true;
            break;
          }

          chunkBuffer += chunk;

          // 启动节流定时器（仅在无定时器运行时）
          if (!throttleTimer) {
            throttleTimer = setTimeout(flushChunks, CHUNK_THROTTLE_MS);
          }
        }

        // 流结束：刷出剩余缓冲
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        flushChunks();

        // 推送结束信号
        if (!cancelled && !sender.isDestroyed()) {
          sender.send('ai:stream:end', { requestId });
        }

        logger.info(`[AI] [stream] Complete: requestId=${requestId}`);
        return { ok: true, requestId };
      } catch (err) {
        // 流异常：刷出剩余缓冲，推送错误信号
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        flushChunks();

        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`[AI] [stream] Error: requestId=${requestId}, error=${errorMessage}`);

        if (!cancelled && !sender.isDestroyed()) {
          sender.send('ai:stream:error', { requestId, error: errorMessage });
        }

        return { ok: false, requestId, error: errorMessage };
      } finally {
        activeStreams.delete(requestId);
      }
    },
  );

  // 注册取消流式请求的 handler
  safeHandle(
    'ai:stream:cancel',
    async (_event, args: { requestId: string }) => {
      const { requestId } = args;
      logger.info(`[AI] [stream] Cancel requested: requestId=${requestId}`);
      const controller = activeStreams.get(requestId);
      if (controller) {
        controller.abort();
        activeStreams.delete(requestId);
        logger.info(`[AI] [stream] Cancelled: requestId=${requestId}`);
      }
      return { ok: true };
    },
  );
}
