/**
 * AI 概念预检 Handler（E1 错误概念先破后立）
 *
 * 处理 ai_concept_precheck IPC 请求，调用 AI 网关为费曼讲解前
 * 生成 1-2 个错误概念探测问题。
 *
 * @ai-context: 概念预检 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；本地降级同样走 JSON 生成。
 */

import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_concept_precheck — POST /api/v1/ai/concept-precheck
 */
function register(): void {
  safeHandle(
    'ai_concept_precheck',
    async (
      _event,
      args: {
        concept: string;
        weakHistory?: string;
        authToken?: string;
      },
    ) => {
      requireText(args?.concept, 'concept');
      const startMs = Date.now();
      logger.info(`[AI] [conceptPrecheck] IPC received: concept=${args.concept.slice(0, 50)}, weak_len=${(args.weakHistory ?? '').length}, hasAuth=${!!args.authToken}`);

      const reqBody = {
        concept: args.concept.slice(0, 500),
        weakHistory: (args.weakHistory ?? '').slice(0, 2000),
      };

      logger.info(`[AI] [conceptPrecheck] Target: ${gatewayUrl()}/api/v1/ai/concept-precheck`);

      interface PrecheckQuestionResp {
        question: string;
        intent: string;
      }
      interface ConceptPrecheckResp {
        questions: PrecheckQuestionResp[];
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<ConceptPrecheckResp> => {
          const prompt = `针对概念「${reqBody.concept}」设计 1-2 个探测性问题，暴露学习者常见误解（非知识记忆考察），仅返回JSON: {"questions": [{"question": "...", "intent": "..."}]}\n\n【学习者历史薄弱点】\n${reqBody.weakHistory || '（暂无）'}`;
          const result = await generateText(prompt, '你是一位善于发现学习误区的热心教练。请仅返回JSON。', { temperature: 0.5, maxTokens: 1000 });
          // 宽松解析：本地小模型常输出围栏/解释文字，裸 parse 会误降级到云端
          const parsed = parseModelJson<Partial<ConceptPrecheckResp>>(result.content, {});
          return {
            questions: parsed.questions ?? [],
            model: result.model,
            tokens_used: result.tokens_used,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, ConceptPrecheckResp>(
          '/api/v1/ai/concept-precheck',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [conceptPrecheck] ✔ Success (${source}): questions=${resp.questions.length}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          questions: resp.questions.map((q) => ({
            question: q.question,
            intent: q.intent ?? '',
          })),
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [conceptPrecheck] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [conceptPrecheck] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_concept_precheck',
  name: 'AI 概念预检',
  version: '1.0.0',
  register,
};
