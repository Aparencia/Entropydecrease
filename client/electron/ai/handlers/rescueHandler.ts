/**
 * AI 学习救援功能 Handler
 *
 * 处理 ai_rescue IPC 请求，调用 AI 网关为卡住的学习者提供分层救援提示。
 *
 * @ai-context: 卡壳救援 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_rescue — POST /api/v1/ai/rescue
 */
function register(): void {
  safeHandle(
    'ai_rescue',
    async (
      _event,
      args: {
        content: string;
        stuckDescription: string;
        attemptedMethods?: string;
        authToken?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [rescue] IPC received: content_length=${args.content.length}, stuck_length=${args.stuckDescription.length}, methods=${args.attemptedMethods ?? 'none'}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [rescue] Stuck description: ${args.stuckDescription.slice(0, 80)}`);

      // 前端 camelCase → 后端 snake_case
      const reqBody = {
        content: args.content,
        stuck_description: args.stuckDescription,
        attempted_methods: args.attemptedMethods ?? '',
      };

      logger.info(`[AI] [rescue] Target: ${gatewayUrl()}/api/v1/ai/rescue`);

      interface RescueLevelResp {
        level: number;
        label: string;
        suggestion: string;
        hint_question: string;
      }
      interface RescueGenResp {
        rescue_levels: RescueLevelResp[];
        encouragement: string;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        const localHandler = async (): Promise<RescueGenResp> => {
          const prompt = `学习者卡住了，请提供分层救援提示，返回JSON: {"rescue_levels": [{"level": 1, "label": "...", "suggestion": "...", "hint_question": "..."}], "encouragement": "...", "status": "ok"}\n\n卡住情境：${JSON.stringify(reqBody)}`;
          const result = await generateText(prompt, '你是一个学习救援助手，擅长为卡住的学习者提供分层提示。请仅返回JSON。', { temperature: 0.6, maxTokens: 1024 });
          const parsed = JSON.parse(result.content);
          return { rescue_levels: parsed.rescue_levels ?? [], encouragement: parsed.encouragement ?? '加油！', status: 'ok', model: result.model, tokens_used: result.tokens_used, latency_ms: result.latency_ms };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, RescueGenResp>(
          '/api/v1/ai/rescue',
          reqBody,
          localHandler,
          args.authToken,
          60000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [rescue] ✔ Success (${source}): levels=${resp.rescue_levels.length}, status=${resp.status}, model=${resp.model}, tokens=${resp.tokens_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          rescueLevels: resp.rescue_levels.map((lv: { level: number; label: string; suggestion: string; hint_question: string }) => ({
            level: lv.level,
            label: lv.label,
            suggestion: lv.suggestion,
            hintQuestion: lv.hint_question,
          })),
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
        logger.error(`[AI] [rescue] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [rescue] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_rescue',
  name: 'AI 学习救援',
  version: '1.0.0',
  register,
};
