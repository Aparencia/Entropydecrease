/**
 * 苏格拉底追问功能 Handler
 *
 * 处理 ai_socratic / ai_socratic_evaluate / ai_socratic_deepening IPC 请求，
 * 调用 AI 网关实现苏格拉底式追问、评估与深化。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// 公共类型
// ================================================================

interface BackendHistoryItem {
  role: 'tutor' | 'learner';
  content: string;
}

// ================================================================
// IPC Handler
// ================================================================

/**
 * 注册苏格拉底相关的全部 IPC handler
 */
function register(): void {
  /**
   * ai_socratic — POST /api/v1/ai/socratic
   */
  safeHandle(
    'ai_socratic',
    async (
      _event,
      args: {
        topic: string;
        history?: BackendHistoryItem[] | null;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [socratic] IPC received: topic_length=${args.topic.length}, history=${args.history?.length ?? 0}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [socratic] Topic preview: ${args.topic.slice(0, 80)}`);

      const reqBody = {
        topic: args.topic,
        history: args.history ?? null,
      };

      logger.info(`[AI] [socratic] Target: ${gatewayUrl()}/api/v1/ai/socratic`);

      interface SocraticResp {
        question: string;
        hint: string;
        thinking_direction: string;
        depth_level: number;
        turn_count: number;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<SocraticResp> => {
          const prompt = `作为苏格拉底式导师，针对主题“${args.topic}”生成一个引导性问题，返回JSON: {"question": "...", "hint": "...", "thinking_direction": "...", "depth_level": 1, "turn_count": 1, "status": "ok"}`;
          const result = await generateText(prompt, '你是一个苏格拉底式学习导师。请仅返回JSON。', { temperature: 0.7, maxTokens: 512 });
          const parsed = JSON.parse(result.content);
          return { question: parsed.question ?? '', hint: parsed.hint ?? '', thinking_direction: parsed.thinking_direction ?? '', depth_level: parsed.depth_level ?? 1, turn_count: parsed.turn_count ?? 1, status: 'ok', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, SocraticResp>(
          '/api/v1/ai/socratic',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [socratic] ✔ Success (${source}): depth=${resp.depth_level}, turn=${resp.turn_count}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          question: resp.question,
          hint: resp.hint,
          thinkingDirection: resp.thinking_direction,
          depthLevel: resp.depth_level,
          turnCount: resp.turn_count,
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
        logger.error(`[AI] [socratic] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [socratic] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );

  /**
   * ai_socratic_evaluate — POST /api/v1/ai/socratic/evaluate
   */
  safeHandle(
    'ai_socratic_evaluate',
    async (
      _event,
      args: {
        topic: string;
        question: string;
        answer: string;
        history?: BackendHistoryItem[];
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [socratic-eval] IPC received: topic_length=${args.topic.length}, question_length=${args.question.length}, answer_length=${args.answer.length}, history=${args.history?.length ?? 0}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [socratic-eval] Topic: ${args.topic.slice(0, 60)}, Q: ${args.question.slice(0, 60)}`);

      const reqBody = {
        topic: args.topic,
        question: args.question,
        answer: args.answer,
        history: args.history ?? [],
      };

      logger.info(`[AI] [socratic-eval] Target: ${gatewayUrl()}/api/v1/ai/socratic/evaluate`);

      interface SocraticEvaluateResp {
        dimensions: { accuracy: number; completeness: number; logic: number; expression: number };
        feedback: string;
        encouragement: string;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<SocraticEvaluateResp> => {
          const prompt = `评估学生对问题的回答，返回JSON: {"dimensions": {"accuracy": 70, "completeness": 65, "logic": 75, "expression": 80}, "feedback": "...", "encouragement": "...", "status": "ok"}`;
          const result = await generateText(prompt, '你是一个苏格拉底式评估助手。请仅返回JSON。', { temperature: 0.4, maxTokens: 512 });
          const parsed = JSON.parse(result.content);
          return { dimensions: parsed.dimensions ?? { accuracy: 60, completeness: 60, logic: 60, expression: 60 }, feedback: parsed.feedback ?? '', encouragement: parsed.encouragement ?? '继续加油！', status: 'ok', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, SocraticEvaluateResp>(
          '/api/v1/ai/socratic/evaluate',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [socratic-eval] ✔ Success (${source}): accuracy=${resp.dimensions.accuracy}, completeness=${resp.dimensions.completeness}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          dimensions: resp.dimensions,
          feedback: resp.feedback,
          encouragement: resp.encouragement,
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
        logger.error(`[AI] [socratic-eval] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [socratic-eval] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );

  /**
   * ai_socratic_deepening — POST /api/v1/ai/socratic/deepening
   */
  safeHandle(
    'ai_socratic_deepening',
    async (
      _event,
      args: {
        topic: string;
        dialogueSummary: string;
        history?: BackendHistoryItem[];
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [socratic-deep] IPC received: topic_length=${args.topic.length}, summary_length=${args.dialogueSummary.length}, history=${args.history?.length ?? 0}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [socratic-deep] Topic: ${args.topic.slice(0, 60)}, Summary preview: ${args.dialogueSummary.slice(0, 80)}`);

      // 前端 camelCase dialogueSummary → 后端 snake_case dialogue_summary
      const reqBody = {
        topic: args.topic,
        dialogue_summary: args.dialogueSummary,
        history: args.history ?? [],
      };

      logger.info(`[AI] [socratic-deep] Target: ${gatewayUrl()}/api/v1/ai/socratic/deepening`);

      interface AngleResp {
        key: string;
        label: string;
        question: string;
      }
      interface SocraticDeepeningResp {
        angles: AngleResp[];
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<SocraticDeepeningResp> => {
          const prompt = `针对主题“${args.topic}”的对话摘要，生成深化探索角度，返回JSON: {"angles": [{"key": "...", "label": "...", "question": "..."}], "status": "ok"}`;
          const result = await generateText(prompt, '你是一个苏格拉底式深化探索助手。请仅返回JSON。', { temperature: 0.7, maxTokens: 1024 });
          const parsed = JSON.parse(result.content);
          return { angles: parsed.angles ?? [], status: 'ok', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, SocraticDeepeningResp>(
          '/api/v1/ai/socratic/deepening',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [socratic-deep] ✔ Success (${source}): angles=${resp.angles.length}, status=${resp.status}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          angles: resp.angles.map((a: { key: string; label: string; question: string }) => ({
            key: a.key,
            label: a.label,
            question: a.question,
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
        logger.error(`[AI] [socratic-deep] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [socratic-deep] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_socratic',
  name: 'AI 苏格拉底追问',
  version: '1.0.0',
  register,
};
