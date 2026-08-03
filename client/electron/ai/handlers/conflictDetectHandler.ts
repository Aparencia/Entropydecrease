/**
 * AI 概念冲突检测 Handler（N6）
 *
 * 处理 ai_conflict_detect IPC 请求，调用 AI 网关比对新笔记与
 * 历史理解（旧笔记/费曼讲解摘录）之间的矛盾冲突。
 *
 * @ai-context: 概念冲突检测 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；本地降级同样走 JSON 生成。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_conflict_detect — POST /api/v1/ai/conflict-detect
 */
function register(): void {
  safeHandle(
    'ai_conflict_detect',
    async (
      _event,
      args: {
        newNoteText: string;
        historyText: string;
        authToken?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [conflictDetect] IPC received: new_len=${args.newNoteText.length}, history_len=${args.historyText.length}, hasAuth=${!!args.authToken}`);

      const reqBody = {
        newNoteText: args.newNoteText.slice(0, 3000),
        historyText: args.historyText.slice(0, 3000),
      };

      logger.info(`[AI] [conflictDetect] Target: ${gatewayUrl()}/api/v1/ai/conflict-detect`);

      interface ConflictItemResp {
        old_claim: string;
        new_claim: string;
        topic: string;
        suggestion: string;
      }
      interface ConflictDetectResp {
        conflicts: ConflictItemResp[];
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<ConflictDetectResp> => {
          const prompt = `分析新笔记与历史理解之间的概念冲突（只报告真正的矛盾），仅返回JSON: {"conflicts": [{"old_claim": "...", "new_claim": "...", "topic": "...", "suggestion": "..."}]}\n\n【新笔记】\n${reqBody.newNoteText}\n\n【历史理解】\n${reqBody.historyText}`;
          const result = await generateText(prompt, '你是一位概念转变研究专家，擅长识别学习者新旧理解之间的矛盾。请仅返回JSON。', { temperature: 0.3, maxTokens: 2000 });
          const parsed = JSON.parse(result.content);
          return {
            conflicts: parsed.conflicts ?? [],
            model: result.model,
            tokens_used: result.tokens_used,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, ConflictDetectResp>(
          '/api/v1/ai/conflict-detect',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [conflictDetect] ✔ Success (${source}): conflicts=${resp.conflicts.length}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          conflicts: resp.conflicts.map((c) => ({
            oldClaim: c.old_claim,
            newClaim: c.new_claim,
            topic: c.topic ?? '',
            suggestion: c.suggestion ?? '',
          })),
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [conflictDetect] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [conflictDetect] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_conflict_detect',
  name: 'AI 概念冲突检测',
  version: '1.0.0',
  register,
};
