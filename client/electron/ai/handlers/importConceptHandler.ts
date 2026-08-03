/**
 * AI 知识入籍概念化 Handler（阶段 A 入口问题）
 *
 * 处理 ai_import_concept IPC 请求，调用 AI 网关将切块文本
 * 提炼为概念候选（名称/摘要/卡片正反面），供入籍预览编辑。
 *
 * @ai-context: 知识入籍概念化 IPC handler——AIFeatureDef 注册表模式，
 * 经 callWithLocalFallback 支持云端网关优先/本地 Ollama 降级；
 * 服务端 ImportConceptResult 的 snake_case 字段在此边界转为 camelCase。
 */
import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';
import type { ConceptCandidate, TextChunk } from '../../../src/features/settling/types.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_import_concept — POST /api/v1/ai/import/concepts
 */
function register(): void {
  safeHandle(
    'ai_import_concept',
    async (
      _event,
      args: {
        title: string;
        textChunks: TextChunk[];
        authToken?: string;
      },
    ) => {
      requireText(args?.title, 'title');
      if (!Array.isArray(args?.textChunks) || args.textChunks.length === 0) {
        throw new Error('textChunks 必须是非空数组');
      }
      const startMs = Date.now();
      logger.info(
        `[AI] [importConcept] IPC received: title=${args.title.slice(0, 50)}, chunks=${args.textChunks.length}, hasAuth=${!!args.authToken}`,
      );

      // 边界切片：与服务端预算对齐（单块 ≤3000 字、≤50 块、总量 ≤50000 字）
      // 防超长材料被网关 400 拒绝；非字符串块直接丢弃（类型守卫）
      const MAX_TOTAL_CHARS = 50000;
      const sliced = args.textChunks
        .filter((c) => c && typeof c.text === 'string')
        .map((c) => ({ index: c.index, text: c.text.slice(0, 3000) }))
        .slice(0, 50);
      const kept: Array<{ index: number; text: string }> = [];
      let budget = 0;
      for (const c of sliced) {
        if (budget + c.text.length > MAX_TOTAL_CHARS) break;
        kept.push(c);
        budget += c.text.length;
      }
      if (kept.length === 0) {
        throw new Error('文本块内容为空');
      }
      const reqBody = { title: args.title.slice(0, 200), text_chunks: kept.map((c) => c.text) };

      logger.info(`[AI] [importConcept] Target: ${gatewayUrl()}/api/v1/ai/import/concepts`);

      interface ImportConceptResp {
        concepts: Array<{ name: string; summary: string; card_front: string; card_back: string }>;
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<ImportConceptResp> => {
          const prompt = `从以下资料中提炼 3-6 个值得长期记忆的核心概念。每个概念给出：名称（简洁名词短语）、一句话摘要、复习提问（问题形式，缺省由名称派生）、答案要点。仅返回JSON: {"concepts": [{"name": "...", "summary": "...", "card_front": "...", "card_back": "..."}]}\n\n【资料标题】\n${reqBody.title}\n\n【资料内容】\n${reqBody.text_chunks.join('\n\n')}`;
          const result = await generateText(prompt, '你是一位善于把资料提炼成可复习概念的图书管理员。请仅返回JSON。', { temperature: 0.5, maxTokens: 1500 });
          // 宽松解析：本地小模型常输出围栏/解释文字，裸 parse 会误降级到云端
          const parsed = parseModelJson<Partial<ImportConceptResp>>(result.content, {});
          const concepts = Array.isArray(parsed.concepts)
            ? parsed.concepts
              .filter((c) => c && typeof c.name === 'string' && c.name.trim().length > 0)
              .map((c) => ({
                name: c.name.trim().slice(0, 60),
                summary: (c.summary ?? '').slice(0, 200),
                card_front: (c.card_front ?? '').slice(0, 200),
                card_back: (c.card_back ?? '').slice(0, 500),
              }))
              .slice(0, 10) // 与服务端 MAX_CONCEPTS=10 对齐
            : [];
          return { concepts, model: result.model, tokens_used: result.tokens_used };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, ImportConceptResp>(
          '/api/v1/ai/import/concepts',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(
          `[AI] [importConcept] ✔ Success (${source}): concepts=${resp.concepts.length}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`,
        );

        // snake_case → camelCase（边界转换，遵循 api-design.md）
        const concepts: ConceptCandidate[] = resp.concepts.map((c) => ({
          name: c.name,
          summary: c.summary ?? '',
          cardFront: c.card_front ?? '',
          cardBack: c.card_back ?? '',
        }));

        return {
          concepts,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [importConcept] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [importConcept] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_import_concept',
  name: 'AI 知识入籍概念化',
  version: '1.0.0',
  register,
};
