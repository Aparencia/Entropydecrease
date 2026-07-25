/**
 * AI 片段笔记合并 Handler
 *
 * 处理 ai_merge_notes IPC 请求，将增量分析产生的多个片段笔记
 * 合并为一份完整结构化笔记。纯文本操作，无需多模态模型。
 * 对应端点：POST /api/v1/multimodal/merge-notes
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_merge_notes — POST /api/v1/multimodal/merge-notes
 */
function register(): void {
  safeHandle(
    'ai_merge_notes',
    async (
      _event,
      args: {
        partials: string[];
        duration?: number;   // 秒
        language?: string;
        authToken?: string;
        userApiKey?: string;
      },
    ) => {
      const startMs = Date.now();
      const partialCount = args.partials?.length ?? 0;
      logger.info(`[AI] [merge-notes] IPC received: partials=${partialCount}, duration=${args.duration ?? 0}s`);

      if (!args.partials || args.partials.length === 0) {
        throw new Error('partials 不能为空');
      }

      // 只有一个片段时直接返回
      if (args.partials.length === 1) {
        return {
          content: args.partials[0].trim(),
          modelUsed: 'none (single partial)',
          source: 'local' as const,
        };
      }

      const reqBody = {
        partials: args.partials,
        duration: args.duration ?? 0,
        language: args.language ?? 'zh-CN',
      };

      logger.info(`[AI] [merge-notes] Target: ${gatewayUrl()}/api/v1/multimodal/merge-notes`);

      interface MergeNotesResp {
        content: string;
        model_used: string;
      }

      try {
        // 本地 Ollama 降级：纯文本合并
        const localHandler = async (): Promise<MergeNotesResp> => {
          const partsContent = args.partials
            .map((p, i) => `### 片段 ${i + 1}\n\n${p.trim()}`)
            .join('\n\n---\n\n');

          const prompt = [
            `以下是一门课程（总时长约 ${args.duration ?? 0} 秒）的 ${args.partials.length} 个片段笔记。`,
            '请将它们合并为一份完整的结构化课堂笔记，要求：',
            '1. 去除重复内容',
            '2. 使用 Markdown 二级标题按知识模块组织',
            '3. 补充片段间的衔接语句',
            '4. 保留所有公式、定义、代码',
            '5. 末尾添加「核心知识点摘要」',
            '',
            '---',
            '',
            partsContent,
            '',
            '---',
            '',
            '请直接输出合并后的 Markdown 笔记。',
          ].join('\n');

          const result = await generateText(
            prompt,
            '你是一个专业的课堂笔记整理助手，擅长将多个片段笔记合并为完整、连贯的结构化笔记。',
            { temperature: 0.3, maxTokens: 4096 },
          );

          return {
            content: result.content,
            model_used: result.model,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, MergeNotesResp>(
          '/api/v1/multimodal/merge-notes',
          reqBody,
          localHandler,
          args.authToken,
          args.userApiKey,
          30000, // 纯文本合并，30s 超时足够
        );

        const elapsed = Date.now() - startMs;
        logger.info(`[AI] [merge-notes] ✔ Success (${source}): content_length=${resp.content?.length ?? 0}, model=${resp.model_used}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`);
        return {
          content: resp.content,
          modelUsed: resp.model_used,
          source,
          requestId,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [merge-notes] ✖ Failed after ${elapsed}ms: ${error.message}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_merge_notes',
  name: 'AI 片段笔记合并',
  version: '1.0.0',
  register,
};
