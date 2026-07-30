/**
 * AI 课堂多模态分析 Handler
 *
 * 处理 ai_session_analyze IPC 请求，调用 AI 网关对课堂关键帧与音频段进行多模态分析。
 * 支持本地 Ollama 降级：优先调用本地多模态模型，失败后降级到远程网关。
 * 对应端点：POST /api/v1/multimodal/analyze-session
 *
 * @ai-context: 课堂会话分析 IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateVisionMulti } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_session_analyze — POST /api/v1/multimodal/analyze-session
 */
function register(): void {
  safeHandle(
    'ai_session_analyze',
    async (
      _event,
      args: {
        keyframes: Array<{
          timestamp: number;      // 已转为秒
          imageBase64: string;
          changeType: string;
        }>;
        audioSegments: Array<{
          timestampStart: number;  // 已转为秒
          timestampEnd: number;
          audioText: string | null;
        }>;
        duration: number;          // 已转为秒
        language?: string;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      const kfCount = args.keyframes?.length ?? 0;
      const segCount = args.audioSegments?.length ?? 0;
      logger.info(`[AI] [session-analyze] IPC received: keyframes=${kfCount}, audioSegments=${segCount}, duration=${args.duration}s, language=${args.language ?? 'zh'}, hasAuth=${!!args.authToken}`);

      const reqBody = {
        keyframes: args.keyframes.map(kf => ({
          timestamp: kf.timestamp,
          image_base64: kf.imageBase64,
          change_type: kf.changeType,
        })),
        audio_segments: args.audioSegments.map(seg => ({
          timestamp_start: seg.timestampStart,
          timestamp_end: seg.timestampEnd,
          audio_text: seg.audioText,
        })),
        duration: args.duration,
        language: args.language ?? 'zh',
      };

      logger.info(`[AI] [session-analyze] Target: ${gatewayUrl()}/api/v1/multimodal/analyze-session`);

      interface AnalyzeSessionResp {
        content: string;
        keyframes_analyzed: number;
        model_used: string;
      }

      try {
        // 本地 Ollama 降级链
        const localHandler = async (): Promise<AnalyzeSessionResp> => {
          // 从 keyframes 中提取 imageBase64 数组
          const imagesBase64 = args.keyframes.map(kf => kf.imageBase64);

          // 构造包含时间轴信息和音频段文本的 prompt
          const timelineParts: string[] = [];
          for (const kf of args.keyframes) {
            timelineParts.push(`[${kf.timestamp}s] 画面变化类型：${kf.changeType}`);
          }

          const audioParts: string[] = [];
          for (const seg of args.audioSegments) {
            if (seg.audioText) {
              audioParts.push(`[${seg.timestampStart}s - ${seg.timestampEnd}s] 音频内容：${seg.audioText}`);
            }
          }

          const prompt = [
            `请对以下课堂内容进行多模态分析。课程总时长：${args.duration}秒。`,
            '',
            '=== 关键帧时间轴 ===',
            ...timelineParts,
            '',
            ...(audioParts.length > 0
              ? ['=== 音频段内容 ===', ...audioParts, '']
              : []),
            '请综合分析课堂内容，包括知识点提取、教学结构分析、重点难点标注等。',
            `语言：${args.language ?? 'zh'}`,
          ].join('\n');

          const result = await generateVisionMulti(
            imagesBase64,
            prompt,
            '你是一个专业的课堂内容分析助手，擅长从视觉和音频信息中提取教学结构化知识。',
            { temperature: 0.3, maxTokens: 4096 },
          );

          return {
            content: result.content,
            keyframes_analyzed: imagesBase64.length,
            model_used: result.model,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, AnalyzeSessionResp>(
          '/api/v1/multimodal/analyze-session',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          120000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [session-analyze] ✔ Success (${source}): content_length=${resp.content?.length ?? 0}, keyframes_analyzed=${resp.keyframes_analyzed}, model=${resp.model_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          content: resp.content,
          keyframesAnalyzed: resp.keyframes_analyzed,
          modelUsed: resp.model_used,
          source,
          requestId,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [session-analyze] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [session-analyze] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_session_analyze',
  name: 'AI 课堂多模态分析',
  version: '1.0.0',
  register,
};
