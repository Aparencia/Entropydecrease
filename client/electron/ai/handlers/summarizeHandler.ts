/**
 * AI 摘要功能 Handler
 *
 * 处理 ai_summarize IPC 请求，调用 AI 网关生成文本摘要。
 * 支持本地 Ollama 降级：优先调用本地模型，失败后降级到远程网关。
 *
 * @ai-context: 笔记摘要 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_summarize — POST /api/v1/ai/summarize
 * 接收前端 camelCase 参数，转为后端 snake_case 请求体，
 * 再将后端 snake_case 响应转回 camelCase。
 */
function register(): void {
  safeHandle(
    'ai_summarize',
    async (
      _event,
      args: {
        text: string;
        maxLength?: number;
        style?: string;
        language?: string;
        authToken?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [summarize] IPC received: text_length=${args.text.length}, style=${args.style ?? 'default'}, language=${args.language ?? 'auto'}, maxLength=${args.maxLength ?? 'none'}, hasAuth=${!!args.authToken}`);
      logger.debug(`[AI] [summarize] Text preview: ${args.text.slice(0, 80)}...`);

      const reqBody = {
        text: args.text,
        options: {
          ...(args.maxLength != null && { max_length: args.maxLength }),
          ...(args.style != null && { style: args.style }),
          ...(args.language != null && { language: args.language }),
        },
      };

      logger.info(`[AI] [summarize] Target: ${gatewayUrl()}/api/v1/ai/summarize`);

      interface SummarizeResp {
        summary: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        // 本地 Ollama 降级链
        const localHandler = async (): Promise<SummarizeResp> => {
          const styleHint = args.style ? `，风格：${args.style}` : '';
          const langHint = args.language ? `，语言：${args.language}` : '';
          const lenHint = args.maxLength ? `，字数控制在${args.maxLength}字以内` : '';
          const prompt = `请对以下内容进行摘要${styleHint}${langHint}${lenHint}：\n\n${args.text}`;
          const result = await generateText(prompt, '你是一个专业的学习笔记摘要助手，擅长提炼核心要点。', { temperature: 0.5, maxTokens: 2048 });
          return {
            summary: result.content,
            model: result.model,
            tokens_used: result.tokens_used,
            latency_ms: result.latency_ms,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, SummarizeResp>(
          '/api/v1/ai/summarize',
          reqBody,
          localHandler,
          args.authToken,
          90000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [summarize] ✔ Success (${source}): model=${resp.model}, tokens=${resp.tokens_used}, backend_latency=${resp.latency_ms}ms, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          summary: resp.summary,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [summarize] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [summarize] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_summarize',
  name: 'AI 文本摘要',
  version: '1.0.0',
  register,
};
