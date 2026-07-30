/**
 * AI 评估功能 Handler
 *
 * 处理 ai_evaluate IPC 请求，调用 AI 网关评估用户对概念的解释。
 *
 * @ai-context: 费曼解释评估 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_evaluate — POST /api/v1/ai/evaluate-explanation
 */
function register(): void {
  safeHandle(
    'ai_evaluate',
    async (
      _event,
      args: {
        concept: string;
        explanation: string;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [evaluate] IPC received: concept_length=${args.concept.length}, explanation_length=${args.explanation.length}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [evaluate] Concept: ${args.concept.slice(0, 60)}, Explanation preview: ${args.explanation.slice(0, 80)}...`);

      const reqBody = {
        concept: args.concept,
        explanation: args.explanation,
      };

      logger.info(`[AI] [evaluate] Target: ${gatewayUrl()}/api/v1/ai/evaluate-explanation`);

      interface DimensionResp {
        dimension: string;
        score: number;
        feedback: string;
      }
      interface EvaluateResp {
        overall_score: number;
        dimensions: DimensionResp[];
        strengths: string[];
        improvements: string[];
        encouragement: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<EvaluateResp> => {
          const prompt = `请评估以下对概念“${args.concept}”的解释：\n\n${args.explanation}\n\n请以JSON格式返回评估结果，格式为: {"overall_score": 75, "strengths": ["..."], "improvements": ["..."], "encouragement": "..."}`;
          const result = await generateText(prompt, '你是一个费曼学习法评估助手，擅长评估学生对概念的理解程度。请仅返回JSON。', { temperature: 0.4, maxTokens: 1024 });
          try {
            const parsed = JSON.parse(result.content);
            return {
              overall_score: parsed.overall_score ?? 60,
              dimensions: [],
              strengths: parsed.strengths ?? [],
              improvements: parsed.improvements ?? [],
              encouragement: parsed.encouragement ?? '继续加油！',
              model: result.model,
              tokens_used: result.tokens_used,
              latency_ms: result.latency_ms,
            };
          } catch {
            return { overall_score: 60, dimensions: [], strengths: [], improvements: [], encouragement: result.content.slice(0, 200), model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
          }
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, EvaluateResp>(
          '/api/v1/ai/evaluate-explanation',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          40000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [evaluate] ✔ Success (${source}): overall_score=${resp.overall_score}, dimensions=${resp.dimensions.length}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          overallScore: resp.overall_score,
          dimensions: resp.dimensions.map((d) => ({
            name: d.dimension,
            score: d.score,
            feedback: d.feedback,
          })),
          strengths: resp.strengths,
          improvements: resp.improvements,
          encouragement: resp.encouragement,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [evaluate] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [evaluate] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_evaluate',
  name: 'AI 解释评估',
  version: '1.0.0',
  register,
};
