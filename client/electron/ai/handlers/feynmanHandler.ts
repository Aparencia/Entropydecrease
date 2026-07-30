/**
 * 费曼学习法功能 Handler
 *
 * 处理 ai_feynman_question 和 ai_feynman_evaluate_answers IPC 请求，
 * 调用 AI 网关生成追问并评估用户回答。
 *
 * @ai-context: 费曼提问与答案评估 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * 注册费曼学习法相关的所有 IPC handler
 */
function register(): void {
  /**
   * ai_feynman_question — POST /api/v1/ai/feynman-question
   */
  safeHandle(
    'ai_feynman_question',
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
      logger.info(`[AI] [feynman-q] IPC received: concept_length=${args.concept.length}, explanation_length=${args.explanation.length}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [feynman-q] Concept: ${args.concept.slice(0, 60)}`);

      const reqBody = {
        concept: args.concept,
        explanation: args.explanation,
      };

      logger.info(`[AI] [feynman-q] Target: ${gatewayUrl()}/api/v1/ai/feynman-question`);

      interface FeynmanQuestionResp {
        questions: Array<{ question: string; focus: string }>;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<FeynmanQuestionResp> => {
          const prompt = `针对概念“${args.concept}”和解释“${args.explanation}”，生成苏格拉底式追问，返回JSON: {"questions": [{"question": "...", "focus": "..."}]}`;
          const result = await generateText(prompt, '你是一个费曼学习法追问助手。请仅返回JSON。', { temperature: 0.7, maxTokens: 1024 });
          const parsed = JSON.parse(result.content);
          return { questions: parsed.questions ?? [], model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, FeynmanQuestionResp>(
          '/api/v1/ai/feynman-question',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          40000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [feynman-q] ✔ Success (${source}): questions=${resp.questions.length}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          questions: resp.questions.map((q: { question: string; focus: string }) => ({
            question: q.question,
            focus: q.focus,
          })),
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [feynman-q] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [feynman-q] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );

  /**
   * ai_feynman_evaluate_answers — POST /api/v1/ai/feynman-evaluate-answers
   */
  safeHandle(
    'ai_feynman_evaluate_answers',
    async (
      _event,
      args: {
        concept: string;
        questions: string[];
        answers: string[];
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [feynman-eval] IPC received: concept_length=${args.concept.length}, questions=${args.questions.length}, answers=${args.answers.length}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [feynman-eval] Concept: ${args.concept.slice(0, 60)}, Q count=${args.questions.length}`);

      const reqBody = {
        concept: args.concept,
        questions: args.questions,
        answers: args.answers,
      };

      logger.info(`[AI] [feynman-eval] Target: ${gatewayUrl()}/api/v1/ai/feynman-evaluate-answers`);

      interface FeynmanAnswerEvalResp {
        understanding_score: number;
        feedback: string;
        strong_points: string[];
        weak_points: string[];
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<FeynmanAnswerEvalResp> => {
          const prompt = `评估用户对概念“${args.concept}”的回答，返回JSON: {"understanding_score": 70, "feedback": "...", "strong_points": ["..."], "weak_points": ["..."]}`;
          const result = await generateText(prompt, '你是一个费曼学习法评估助手。请仅返回JSON。', { temperature: 0.4, maxTokens: 1024 });
          const parsed = JSON.parse(result.content);
          return { understanding_score: parsed.understanding_score ?? 60, feedback: parsed.feedback ?? '', strong_points: parsed.strong_points ?? [], weak_points: parsed.weak_points ?? [], model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, FeynmanAnswerEvalResp>(
          '/api/v1/ai/feynman-evaluate-answers',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          40000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [feynman-eval] ✔ Success (${source}): score=${resp.understanding_score}, strong=${resp.strong_points.length}, weak=${resp.weak_points.length}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          understandingScore: resp.understanding_score,
          feedback: resp.feedback,
          strongPoints: resp.strong_points,
          weakPoints: resp.weak_points,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [feynman-eval] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [feynman-eval] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_feynman',
  name: '浮出水面',
  version: '1.0.0',
  register,
};
