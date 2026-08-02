/**
 * AI 学伴对话 Handler
 *
 * 处理 ai:chat:* IPC 请求：发送消息（流式）、历史加载、会话管理。
 * 流式输出复用 streamHandler 的 ai:stream:* 事件体系。
 *
 * @ai-context: 学伴对话 IPC handler——非 AIFeatureDef 模式（多通道），
 * 直接 safeHandle 注册；流式走 postJsonStream + sender.send 回推；
 * 用户消息与助手回复均持久化到 SQLite（chatRepository）。
 */
import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { postJsonStream } from '../gatewayStream.js';
import * as chatRepo from '../../db/chatRepository.js';

/** IPC chunk 推送节流间隔（ms），防止高频 chunk 风暴 */
const CHUNK_THROTTLE_MS = 50;

export function registerChatHandlers(): void {
  // ── ai:chat:send — 流式对话 ──────────────────────────────────
  safeHandle(
    'ai:chat:send',
    async (
      event,
      args: {
        requestId: string;
        sessionId: string;
        message: string;
        history: Array<{ role: string; content: string }>;
        scene: string;
        authToken?: string;
      },
    ) => {
      const { requestId, sessionId, message, history, scene, authToken } = args;
      const sender = event.sender;
      const startMs = Date.now();

      logger.info(`[AI] [chat] Send: reqId=${requestId}, session=${sessionId}, msg_len=${message.length}`);

      // 持久化用户消息
      chatRepo.insertMessage({
        session_id: sessionId,
        role: 'user',
        content: message,
        content_type: 'text',
        trigger_type: null,
        tokens_used: null,
        model: null,
        latency_ms: null,
      });
      chatRepo.touchSession(sessionId);

      const payload = {
        message,
        history: history.slice(-40),
        system_context: { personality: 'dynamic_adaptive', scene },
      };

      let fullResponse = '';
      let chunkBuffer = '';
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;

      /** 将缓冲区内的 chunk 一次性推送到渲染进程 */
      function flush(): void {
        if (!chunkBuffer || sender.isDestroyed()) return;
        sender.send('ai:stream:chunk', { requestId, chunk: chunkBuffer });
        chunkBuffer = '';
        throttleTimer = null;
      }

      try {
        const stream = postJsonStream('/api/v1/ai/chat/stream', payload, authToken);

        for await (const chunk of stream) {
          fullResponse += chunk;
          chunkBuffer += chunk;
          if (!throttleTimer) {
            throttleTimer = setTimeout(flush, CHUNK_THROTTLE_MS);
          }
        }

        // 流结束：刷出剩余缓冲
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        flush();

        const latencyMs = Date.now() - startMs;

        // 持久化助手回复
        chatRepo.insertMessage({
          session_id: sessionId,
          role: 'assistant',
          content: fullResponse,
          content_type: 'text',
          trigger_type: null,
          tokens_used: null,
          model: null,
          latency_ms: latencyMs,
        });
        chatRepo.touchSession(sessionId);

        if (!sender.isDestroyed()) {
          sender.send('ai:stream:end', { requestId });
        }

        logger.info(`[AI] [chat] Complete: ${latencyMs}ms, resp_len=${fullResponse.length}`);
        return { ok: true, requestId };
      } catch (err) {
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        flush();

        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[AI] [chat] Error: reqId=${requestId}, ${errorMsg}`);

        if (!sender.isDestroyed()) {
          sender.send('ai:stream:error', { requestId, error: errorMsg });
        }

        return { ok: false, requestId, error: errorMsg };
      }
    },
  );

  // ── ai:chat:history — 加载历史消息 ───────────────────────────
  safeHandle(
    'ai:chat:history',
    async (_event, args: { sessionId: string; limit?: number; before?: number }) => {
      const rows = chatRepo.getMessages(args.sessionId, args.limit ?? 50, args.before);
      return rows.reverse();
    },
  );

  // ── ai:chat:sessions — 获取最新会话 ──────────────────────────
  safeHandle('ai:chat:sessions', async () => {
    const session = chatRepo.getLatestSession();
    return session ? [session] : [];
  });

  // ── ai:chat:new-session — 创建新会话 ─────────────────────────
  safeHandle(
    'ai:chat:new-session',
    async (_event, args?: { title?: string }) => {
      return chatRepo.createSession(args?.title);
    },
  );
}
