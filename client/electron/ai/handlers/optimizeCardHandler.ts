/**
 * AI 闪卡优化功能 Handler
 *
 * 处理 ai_optimize_card IPC 请求，调用 AI 网关优化已有闪卡的正反面内容。
 *
 * @ai-context: 卡片优化 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_optimize_card — POST /api/v1/ai/optimize-card
 */
function register(): void {
  safeHandle(
    'ai_optimize_card',
    async (
      _event,
      args: {
        front: string;
        back: string;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [optimize-card] IPC received: front_length=${args.front.length}, back_length=${args.back.length}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [optimize-card] Front preview: ${args.front.slice(0, 60)}, Back preview: ${args.back.slice(0, 60)}`);

      const reqBody = {
        front: args.front,
        back: args.back,
      };

      logger.info(`[AI] [optimize-card] Target: ${gatewayUrl()}/api/v1/ai/optimize-card`);

      interface OptimizeCardResp {
        suggested_front: string;
        suggested_back: string;
        improvements: string[];
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<OptimizeCardResp> => {
          const prompt = `请优化以下闪卡，返回JSON: {"suggested_front": "...", "suggested_back": "...", "improvements": ["..."]}
正面：${args.front}
反面：${args.back}`;
          const result = await generateText(prompt, '你是一个闪卡优化助手，擅长改进问答对的表述。请仅返回JSON。', { temperature: 0.5, maxTokens: 1024 });
          const parsed = JSON.parse(result.content);
          return { suggested_front: parsed.suggested_front ?? args.front, suggested_back: parsed.suggested_back ?? args.back, improvements: parsed.improvements ?? [], model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, OptimizeCardResp>(
          '/api/v1/ai/optimize-card',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [optimize-card] ✔ Success (${source}): improvements=${resp.improvements.length}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          suggestedFront: resp.suggested_front,
          suggestedBack: resp.suggested_back,
          improvements: resp.improvements,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [optimize-card] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [optimize-card] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_optimize_card',
  name: 'AI 闪卡优化',
  version: '1.0.0',
  register,
};
