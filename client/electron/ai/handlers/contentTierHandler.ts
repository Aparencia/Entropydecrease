/**
 * AI 内容分层 Handler（N5 策略性遗忘标记）
 *
 * 处理 ai_content_tier IPC 请求，调用 AI 网关将笔记内容分为
 * 核心概念/支撑材料/参考细节三层。
 *
 * @ai-context: 内容分层 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；本地降级同样走 JSON 生成。
 */

import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_content_tier — POST /api/v1/ai/content-tier
 */
function register(): void {
  safeHandle(
    'ai_content_tier',
    async (
      _event,
      args: {
        notesText: string;
        authToken?: string;
      },
    ) => {
      requireText(args?.notesText, 'notesText');
      const startMs = Date.now();
      logger.info(`[AI] [contentTier] IPC received: text_len=${args.notesText.length}, hasAuth=${!!args.authToken}`);

      const reqBody = { notesText: args.notesText.slice(0, 6000) };

      logger.info(`[AI] [contentTier] Target: ${gatewayUrl()}/api/v1/ai/content-tier`);

      interface TierItemResp {
        text: string;
        reason?: string;
      }
      interface ContentTierResp {
        core: TierItemResp[];
        support: TierItemResp[];
        detail: TierItemResp[];
        model: string;
        tokens_used: number;
      }

      try {
        const localHandler = async (): Promise<ContentTierResp> => {
          const prompt = `将以下笔记内容分为三层：core（核心概念，含 reason）、support（支撑材料）、detail（参考细节），仅返回JSON: {"core": [{"text": "...", "reason": "..."}], "support": [{"text": "..."}], "detail": [{"text": "..."}]}\n\n${reqBody.notesText}`;
          const result = await generateText(prompt, '你是一位认知负荷管理专家，擅长从笔记中提炼核心概念。请仅返回JSON。', { temperature: 0.3, maxTokens: 2500 });
          // 宽松解析：本地小模型常输出围栏/解释文字，裸 parse 会误降级到云端
          const parsed = parseModelJson<Partial<ContentTierResp>>(result.content, {});
          return {
            core: parsed.core ?? [],
            support: parsed.support ?? [],
            detail: parsed.detail ?? [],
            model: result.model,
            tokens_used: result.tokens_used,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, ContentTierResp>(
          '/api/v1/ai/content-tier',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [contentTier] ✔ Success (${source}): core=${resp.core.length}, support=${resp.support.length}, detail=${resp.detail.length}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          core: resp.core.map((item) => ({ text: item.text, reason: item.reason ?? '' })),
          support: resp.support.map((item) => ({ text: item.text, reason: item.reason ?? '' })),
          detail: resp.detail.map((item) => ({ text: item.text, reason: item.reason ?? '' })),
          model: resp.model,
          tokensUsed: resp.tokens_used,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [contentTier] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [contentTier] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_content_tier',
  name: 'AI 内容分层',
  version: '1.0.0',
  register,
};
