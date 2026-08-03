/**
 * AI 学习预测功能 Handler
 *
 * 处理 ai_predict IPC 请求，调用 AI 网关基于笔记内容生成预测性问题。
 *
 * @ai-context: 预测提问 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_predict — POST /api/v1/ai/predict
 */
function register(): void {
  safeHandle(
    'ai_predict',
    async (
      _event,
      args: {
        content: string;
        authToken?: string;
      },
    ) => {
      requireText(args?.content, 'content');
      const startMs = Date.now();
      logger.info(`[AI] [predict] IPC received: content_length=${args.content.length}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [predict] Content preview: ${args.content.slice(0, 80)}...`);

      const reqBody = { content: args.content };

      logger.info(`[AI] [predict] Target: ${gatewayUrl()}/api/v1/ai/predict`);

      interface PredictionResp {
        question: string;
        type: string;
        reason: string;
        curiosity_score: number;
      }
      interface PredictGenResp {
        predictions: PredictionResp[];
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<PredictGenResp> => {
          const prompt = `基于以下笔记内容，生成预测性问题，返回JSON: {"predictions": [{"question": "...", "type": "...", "reason": "...", "curiosity_score": 0.8}], "status": "ok"}\n\n笔记：\n${args.content}`;
          const result = await generateText(prompt, '你是一个预测驱动学习助手，擅长从笔记中生成引导性问题。请仅返回JSON。', { temperature: 0.6, maxTokens: 1024 });
          // 宽松解析：本地小模型常输出围栏/解释文字，裸 parse 会误降级到云端
          const parsed = parseModelJson<Partial<PredictGenResp>>(result.content, {});
          return { predictions: parsed.predictions ?? [], status: 'ok', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, PredictGenResp>(
          '/api/v1/ai/predict',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [predict] ✔ Success (${source}): predictions=${resp.predictions.length}, status=${resp.status}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          predictions: resp.predictions.map((p: { question: string; type: string; reason: string; curiosity_score: number }) => ({
            question: p.question,
            type: p.type,
            reason: p.reason,
            curiosityScore: p.curiosity_score,
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
        logger.error(`[AI] [predict] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [predict] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_predict',
  name: 'AI 学习预测',
  version: '1.0.0',
  register,
};
