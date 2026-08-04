/**
 * AI 视频分析功能 Handler
 *
 * 处理 ai_video_analyze IPC 请求，调用 AI 网关对视频文件进行多模态分析。
 * 不支持本地 Ollama 降级（Ollama 不支持视频处理），仅走远程网关。
 * 对应端点：POST /api/v1/multimodal/analyze-video（multipart/form-data）
 *
 * @ai-context: 视频分析（multipart 上传） IPC handler——AIFeatureDef 注册表模式，经 callWithLocalFallback 支持本地 Ollama 优先/云端网关降级；请求响应契约与网关 Pydantic model 对齐。
 */

import { readFile } from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { gatewayUrl, postMultipart, type AIFeatureDef } from '../utils.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_video_analyze — POST /api/v1/multimodal/analyze-video
 */
function register(): void {
  safeHandle(
    'ai_video_analyze',
    async (
      _event,
      args: {
        filePath: string;
        duration?: number;
        language?: string;
        authToken?: string;
      },
    ) => {
      const startMs = Date.now();
      logger.info(`[AI] [video-analyze] IPC received: filePath=${args.filePath}, duration=${args.duration ?? 'N/A'}, language=${args.language ?? 'zh'}, hasAuth=${!!args.authToken}`);

      logger.info(`[AI] [video-analyze] Target: ${gatewayUrl()}/api/v1/multimodal/analyze-video`);

      interface AnalyzeVideoResp {
        content: string;
        keyframes_analyzed: number;
        model_used: string;
      }

      try {
        // SEC: 路径安全校验 — 使用 path.relative 做路径边界检查
        const resolvedPath = path.resolve(args.filePath);
        const appDataPath = app.getPath('userData');
        const tempPath = app.getPath('temp');
        const relToApp = path.relative(appDataPath, resolvedPath);
        const relToTemp = path.relative(tempPath, resolvedPath);
        const isInApp = !relToApp.startsWith('..') && !path.isAbsolute(relToApp);
        const isInTemp = !relToTemp.startsWith('..') && !path.isAbsolute(relToTemp);
        if (!isInApp && !isInTemp) {
          throw new Error(`[AI] [video-analyze] File path not allowed: ${resolvedPath}`);
        }

        // 主进程读取视频文件
        const fileBuffer = await readFile(resolvedPath);
        const fileName = args.filePath.split(/[\\/]/).pop() ?? 'recording.webm';

        // 构造 FormData
        const blob = new Blob([fileBuffer], { type: 'video/webm' });
        const formData = new FormData();
        formData.append('video_file', blob, fileName);
        if (args.duration !== undefined) formData.append('duration', String(args.duration));
        if (args.language) formData.append('language', args.language);

        logger.info(`[AI] [video-analyze] File loaded: ${fileName}, size=${fileBuffer.length} bytes`);

        // 直接调用远程网关（Ollama 不支持视频处理，无本地降级）
        const { data: resp, requestId } = await postMultipart<AnalyzeVideoResp>(
          '/api/v1/multimodal/analyze-video',
          formData,
          args.authToken,
          300000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [video-analyze] ✔ Success (remote): content_length=${resp.content?.length ?? 0}, keyframes_analyzed=${resp.keyframes_analyzed}, model=${resp.model_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          content: resp.content,
          keyframesAnalyzed: resp.keyframes_analyzed,
          modelUsed: resp.model_used,
          source: 'remote' as const,
          requestId,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [video-analyze] ✖ Failed after ${elapsed}ms: ${error.message}`);
        if (error.cause) logger.error(`[AI] [video-analyze] Error cause: ${error.cause}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_video_analyze',
  name: 'AI 视频分析',
  version: '1.0.0',
  register,
};
