/**
 * A3 微进展叙述 Handler
 *
 * 处理 ai_progress_narrate IPC 请求，调用 AI 网关把本周学习统计
 * 叙述成一句温暖的进展文本；网关不可达时由渲染层离线模板兜底。
 *
 * @ai-context: A3 micro-progress narrator IPC handler——AIFeatureDef 注册表模式，
 * authToken 由渲染进程从 supabase session 显式注入透传（主进程不自动注入）。
 * 请求响应契约与网关 progress_narrative 路由的 Pydantic model 对齐。
 */

import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_progress_narrate — POST /api/v1/ai/progress-narrative
 */
function register(): void {
  safeHandle(
    'ai_progress_narrate',
    async (
      _event,
      args: {
        statsText: string;
        authToken?: string;
      },
    ) => {
      requireText(args?.statsText, 'statsText');
      const startMs = Date.now();
      logger.info(`[AI] [progress-narrative] IPC received: stats_length=${args.statsText?.length ?? 0}, hasAuth=${!!args.authToken}`);

      // 前端 camelCase → 后端 snake_case
      const reqBody = {
        stats_text: args.statsText ?? '',
      };

      logger.info(`[AI] [progress-narrative] Target: ${gatewayUrl()}/api/v1/ai/progress-narrative`);

      interface NarrativeGenResp {
        narrative: string;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        // 本地优先：Ollama 可用时本地生成（离线降级路径之一）
        const localHandler = async (): Promise<NarrativeGenResp> => {
          const prompt = `以下是用户本周的学习统计：\n${reqBody.stats_text}\n\n请把这段统计写成一句温暖、具体的微进展叙述（不超过两句话，正向语言），返回JSON: {"narrative": "..."}`;
          const result = await generateText(prompt, '你是一位温暖的学习教练，擅长把学习统计讲述成看得见的进步。请仅返回JSON。', { temperature: 0.7, maxTokens: 256 });
          // 宽松解析：本地小模型常输出围栏/解释文字，裸 parse 会误降级到云端
          const parsed = parseModelJson<Partial<NarrativeGenResp>>(result.content, {});
          return { narrative: parsed.narrative ?? '', status: 'success', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, NarrativeGenResp>(
          '/api/v1/ai/progress-narrative',
          reqBody,
          localHandler,
          args.authToken,
          30000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [progress-narrative] ✔ Success (${source}): status=${resp.status}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          narrative: resp.narrative,
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
        logger.error(`[AI] [progress-narrative] ✖ Failed after ${elapsed}ms: ${error.message}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_progress_narrate',
  name: 'A3 微进展叙述',
  version: '1.0.0',
  register,
};
