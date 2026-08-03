/**
 * AI 记忆锚点生成功能 Handler
 *
 * 处理 ai_anchor_point IPC 请求，调用 AI 网关从笔记内容生成记忆锚点。
 *
 * @ai-context: 记忆锚点生成 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_anchor_point — POST /api/v1/ai/anchor-point
 */
function register(): void {
  safeHandle(
    'ai_anchor_point',
    async (
      _event,
      args: {
        content: string;
        title?: string;
        authToken?: string;
      },
    ) => {
      requireText(args?.content, 'content');
      const startMs = Date.now();
      logger.info(`[AI] [anchor-point] IPC received: content_length=${args.content.length}, title=${args.title ?? '(empty)'}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [anchor-point] Content preview: ${args.content.slice(0, 80)}...`);

      const reqBody = {
        content: args.content,
        title: args.title ?? '',
      };

      logger.info(`[AI] [anchor-point] Target: ${gatewayUrl()}/api/v1/ai/anchor-point`);

      interface AnchorPointResp {
        concept: string;
        association: string;
        memory_technique: string;
        importance: number;
      }
      interface AnchorPointGenResp {
        anchor_points: AnchorPointResp[];
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<AnchorPointGenResp> => {
          const prompt = `从以下笔记中生成记忆锚点，返回JSON: {"anchor_points": [{"concept": "...", "association": "...", "memory_technique": "...", "importance": 0.8}], "status": "ok"}\n\n笔记：\n${args.content}`;
          const result = await generateText(prompt, '你是一个记忆锚点生成助手。请仅返回JSON。', { temperature: 0.6, maxTokens: 1024 });
          // 宽松解析：本地小模型常输出围栏/解释文字，裸 parse 会误降级到云端
          const parsed = parseModelJson<Partial<AnchorPointGenResp>>(result.content, {});
          return { anchor_points: parsed.anchor_points ?? [], status: 'ok', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, AnchorPointGenResp>(
          '/api/v1/ai/anchor-point',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [anchor-point] ✔ Success (${source}): anchor_points=${resp.anchor_points.length}, status=${resp.status}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          anchorPoints: resp.anchor_points.map((ap: { concept: string; association: string; memory_technique: string; importance: number }) => ({
            concept: ap.concept,
            association: ap.association,
            memoryTechnique: ap.memory_technique,
            importance: ap.importance,
          })),
          status: resp.status,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [anchor-point] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [anchor-point] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_anchor_point',
  name: 'AI 记忆锚点',
  version: '1.0.0',
  register,
};
