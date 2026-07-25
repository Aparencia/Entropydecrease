/**
 * AI 视觉提取功能 Handler
 *
 * 处理 ai_vision_extract IPC 请求，调用 AI 网关对图片进行多模态内容提取。
 * 支持本地 Ollama 降级：优先调用本地多模态模型，失败后降级到远程网关。
 * 对应端点：POST /api/v1/vision/extract
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateVision } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_vision_extract — POST /api/v1/vision/extract
 */
function register(): void {
  safeHandle(
    'ai_vision_extract',
    async (
      _event,
      args: {
        imageBase64: string;
        language?: string;
        mode?: string;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      const base64Len = args.imageBase64?.length ?? 0;
      logger.info(`[AI] [vision-extract] IPC received: image_base64_length=${base64Len}, language=${args.language ?? 'zh'}, mode=${args.mode ?? 'auto'}, hasAuth=${!!args.authToken}`);

      const reqBody = {
        image_base64: args.imageBase64,
        language: args.language ?? 'zh',
        mode: args.mode ?? 'auto',
      };

      logger.info(`[AI] [vision-extract] Target: ${gatewayUrl()}/api/v1/vision/extract`);

      interface CodeBlockResp {
        language: string;
        code: string;
      }
      interface VisionExtractResp {
        text: string;
        formulas: string[];
        diagrams: string[];
        key_points: string[];
        code_blocks: CodeBlockResp[];
        concepts: string[];
        confidence: number;
        model_used: string;
        processing_time_ms: number;
        mode: string;
      }

      try {
        // 本地 Ollama 降级链
        const localHandler = async (): Promise<VisionExtractResp> => {
          const prompt = `请对这张图片进行内容提取。提取所有可见文本、公式、图表描述、关键要点、代码块和核心概念。\n语言：${args.language ?? 'zh'}\n模式：${args.mode ?? 'auto'}`;
          const result = await generateVision(args.imageBase64, prompt, '你是一个专业的视觉内容提取助手，擅长从图片中提取结构化信息。', { temperature: 0.3, maxTokens: 4096 });
          return {
            text: result.content,
            formulas: [],
            diagrams: [],
            key_points: [],
            code_blocks: [],
            concepts: [],
            confidence: result.content.trim() ? 0.85 : 0.3,
            model_used: result.model,
            processing_time_ms: result.latency_ms,
            mode: args.mode ?? 'auto',
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, VisionExtractResp>(
          '/api/v1/vision/extract',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          90000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [vision-extract] ✔ Success (${source}): text_length=${resp.text?.length ?? 0}, formulas=${resp.formulas?.length ?? 0}, concepts=${resp.concepts?.length ?? 0}, confidence=${resp.confidence}, model=${resp.model_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          text: resp.text,
          formulas: resp.formulas ?? [],
          diagrams: resp.diagrams ?? [],
          keyPoints: resp.key_points ?? [],
          codeBlocks: (resp.code_blocks ?? []).map((cb) => ({
            language: cb.language,
            code: cb.code,
          })),
          concepts: resp.concepts ?? [],
          confidence: resp.confidence,
          modelUsed: resp.model_used,
          processingTimeMs: resp.processing_time_ms,
          mode: resp.mode,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [vision-extract] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [vision-extract] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_vision_extract',
  name: 'AI 视觉内容提取',
  version: '1.0.0',
  register,
};
