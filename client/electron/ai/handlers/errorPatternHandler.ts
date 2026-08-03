/**
 * AI 错误模式分析 Handler
 *
 * 处理 ai_error_pattern IPC 请求，调用 AI 网关分析黄金错误记录，
 * 识别错误模式（概念盲区/概念混淆/过度自信）并给出改进建议。
 *
 * @ai-context: 错误模式分析 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；本地降级返回空模式列表（前端回退纯本地统计）。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_error_pattern — POST /api/v1/ai/error-pattern
 */
function register(): void {
  safeHandle(
    'ai_error_pattern',
    async (
      _event,
      args: {
        goldenErrors: Array<{ flashcardId: string; correctAnswer: string; userAnswer: string }>;
        authToken?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [errorPattern] IPC received: errors_count=${args.goldenErrors.length}, hasAuth=${!!args.authToken}`);

      const reqBody = { goldenErrors: args.goldenErrors.slice(0, 20) };

      logger.info(`[AI] [errorPattern] Target: ${gatewayUrl()}/api/v1/ai/error-pattern`);

      interface PatternResp {
        type: string;
        keywords: string[];
        explanation: string;
        suggestion: string;
      }
      interface ErrorPatternResp {
        patterns: PatternResp[];
        top_offenders: Array<{ flashcardId: string; count: number }>;
        summary: string;
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<ErrorPatternResp> => {
          const errorsText = reqBody.goldenErrors
            .map((e, i) => `【错误 #${i + 1}】正确答案：${e.correctAnswer}\n用户回答：${e.userAnswer}`)
            .join('\n');
          const prompt = `分析以下黄金错误记录，识别错误模式，返回JSON: {"patterns": [{"type": "concept_blind|concept_confusion|overconfidence", "keywords": ["..."], "explanation": "...", "suggestion": "..."}], "top_offenders": [{"flashcardId": "...", "count": 1}], "summary": "不超过50字总结"}\n\n${errorsText}`;
          const result = await generateText(prompt, '你是一个教育心理学专家，擅长识别学习者的典型错误模式。请仅返回JSON。', { temperature: 0.3, maxTokens: 2048 });
          const parsed = JSON.parse(result.content);
          return {
            patterns: parsed.patterns ?? [],
            top_offenders: parsed.top_offenders ?? [],
            summary: parsed.summary ?? '',
            model: result.model,
            tokens_used: result.tokens_used,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, ErrorPatternResp>(
          '/api/v1/ai/error-pattern',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [errorPattern] ✔ Success (${source}): patterns=${resp.patterns.length}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          patterns: resp.patterns.map((p) => ({
            type: p.type,
            keywords: p.keywords,
            explanation: p.explanation,
            suggestion: p.suggestion,
          })),
          topOffenders: resp.top_offenders,
          summary: resp.summary,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [errorPattern] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [errorPattern] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_error_pattern',
  name: 'AI 错误模式分析',
  version: '1.0.0',
  register,
};
