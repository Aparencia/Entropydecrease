/**
 * AI 闪卡生成功能 Handler
 *
 * 处理 ai_generate_cards IPC 请求，调用 AI 网关从笔记生成闪卡。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_generate_cards — POST /api/v1/ai/generate-cards
 */
function register(): void {
  safeHandle(
    'ai_generate_cards',
    async (
      _event,
      args: {
        note: string;
        maxCards?: number;
        difficulty?: string;
        cardType?: string;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [flashcard] IPC received: note_length=${args.note.length}, maxCards=${args.maxCards ?? 'default'}, difficulty=${args.difficulty ?? 'default'}, cardType=${args.cardType ?? 'default'}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [flashcard] Note preview: ${args.note.slice(0, 80)}...`);

      const reqBody = {
        note: args.note,
        options: {
          ...(args.maxCards != null && { max_cards: args.maxCards }),
          ...(args.difficulty != null && { difficulty: args.difficulty }),
          ...(args.cardType != null && { card_type: args.cardType }),
        },
      };

      logger.info(`[AI] [flashcard] Target: ${gatewayUrl()}/api/v1/ai/generate-cards`);

      interface CardResp {
        front: string;
        back: string;
        type: string;
        confidence: number;
      }
      interface CardGenResp {
        cards: CardResp[];
        total_extracted: number;
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<CardGenResp> => {
          const maxHint = args.maxCards ? `，最多生成${args.maxCards}张` : '';
          const diffHint = args.difficulty ? `，难度：${args.difficulty}` : '';
          const prompt = `请从以下笔记内容生成闪卡（问答对）${maxHint}${diffHint}。\n请以JSON格式返回，格式为: {"cards": [{"front": "问题", "back": "答案", "type": "basic", "confidence": 0.9}]}\n\n笔记内容：\n${args.note}`;
          const result = await generateText(prompt, '你是一个专业的闪卡生成助手，擅长从笔记中提取核心知识点并生成问答对。请仅返回JSON。', { temperature: 0.5, maxTokens: 2048 });
          try {
            const parsed = JSON.parse(result.content);
            return { cards: parsed.cards || [], total_extracted: (parsed.cards || []).length, model: result.model, tokens_used: result.tokens_used };
          } catch {
            return { cards: [], total_extracted: 0, model: result.model, tokens_used: result.tokens_used };
          }
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, CardGenResp>(
          '/api/v1/ai/generate-cards',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          90000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [flashcard] ✔ Success (${source}): cards=${resp.cards.length}, total_extracted=${resp.total_extracted}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          cards: resp.cards.map((c) => ({
            front: c.front,
            back: c.back,
            type: c.type,
            confidence: c.confidence,
          })),
          totalExtracted: resp.total_extracted,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [flashcard] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [flashcard] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_generate_cards',
  name: 'AI 反衰减呼吸生成',
  version: '1.0.0',
  register,
};
