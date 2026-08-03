/**
 * AI 迷你测试生成 Handler（N1）
 *
 * 处理 ai_generate_quiz IPC 请求，调用 AI 网关基于多篇笔记生成
 * 5-10 题混合题型（填空/单选/简答）课程级迷你测试。
 *
 * @ai-context: 迷你测试生成 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；本地降级同样走 JSON 生成。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_generate_quiz — POST /api/v1/ai/generate-quiz
 */
function register(): void {
  safeHandle(
    'ai_generate_quiz',
    async (
      _event,
      args: {
        notesText: string;
        authToken?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [quizGen] IPC received: text_len=${args.notesText.length}, hasAuth=${!!args.authToken}`);

      const reqBody = { notesText: args.notesText.slice(0, 6000) };

      logger.info(`[AI] [quizGen] Target: ${gatewayUrl()}/api/v1/ai/generate-quiz`);

      interface QuizQuestionResp {
        type: string;
        question: string;
        options: string[];
        answer: string;
        explanation: string;
        concept: string;
      }
      interface QuizGenResp {
        questions: QuizQuestionResp[];
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<QuizGenResp> => {
          const prompt = `基于以下笔记内容生成 5-8 道迷你测试题（混合填空fill_blank/单选choice/简答short_answer），仅返回JSON: {"questions": [{"type": "...", "question": "...", "options": [], "answer": "...", "explanation": "...", "concept": "..."}]}\n\n${reqBody.notesText}`;
          const result = await generateText(prompt, '你是一位教育评估专家，擅长设计检测真实理解程度的测验题目。请仅返回JSON。', { temperature: 0.5, maxTokens: 3000 });
          const parsed = JSON.parse(result.content);
          return {
            questions: parsed.questions ?? [],
            model: result.model,
            tokens_used: result.tokens_used,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, QuizGenResp>(
          '/api/v1/ai/generate-quiz',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [quizGen] ✔ Success (${source}): questions=${resp.questions.length}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          questions: resp.questions.map((q) => ({
            type: q.type,
            question: q.question,
            options: q.options ?? [],
            answer: q.answer,
            explanation: q.explanation ?? '',
            concept: q.concept ?? '',
          })),
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [quizGen] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [quizGen] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_generate_quiz',
  name: 'AI 迷你测试生成',
  version: '1.0.0',
  register,
};
