/**
 * D2 课堂问答 Handler
 *
 * 处理 ai_session_qa IPC 请求，调用 AI 网关针对课堂转写内容回答问题，
 * 返回带引用来源（时间戳+摘录）的答案；网关不可用时抛出（渲染层提示）。
 *
 * @ai-context: D2 session-QA IPC handler——AIFeatureDef 注册表模式，
 * authToken 由渲染进程显式注入透传。请求响应契约与网关 session_qa
 * 路由的 Pydantic model 对齐。
 */

import { requireText, safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_session_qa — POST /api/v1/ai/session-qa
 */
function register(): void {
  safeHandle(
    'ai_session_qa',
    async (
      _event,
      args: {
        question: string;
        transcript: string;
        authToken?: string;
      },
    ) => {
      requireText(args?.question, 'question');
      requireText(args?.transcript, 'transcript');
      const startMs = Date.now();
      logger.info(
        `[AI] [session-qa] IPC received: question_len=${args.question.length}, transcript_len=${args.transcript.length}, hasAuth=${!!args.authToken}`,
      );

      const reqBody = {
        question: args.question,
        transcript: args.transcript,
      };

      logger.info(`[AI] [session-qa] Target: ${gatewayUrl()}/api/v1/ai/session-qa`);

      interface QaReferenceResp {
        time: string;
        text: string;
      }

      interface SessionQaResp {
        answer: string;
        references: QaReferenceResp[];
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        // 本地优先：Ollama 可用时本地生成（离线降级路径之一）
        const localHandler = async (): Promise<SessionQaResp> => {
          const prompt = `课堂转写内容：\n${args.transcript.slice(0, 8000)}\n\n问题：${args.question}\n\n请只依据转写内容回答，3-5 句，先结论后依据；转写没有的信息明确说明。返回JSON: {"answer":"...","references":[{"time":"00:00:00","text":"片段摘录"}]}`;
          const result = await generateText(prompt, '你是「回声定位」课堂问答助手，只输出 JSON。', { temperature: 0.3, maxTokens: 1024 });
          // 宽松解析：本地小模型常输出围栏/解释文字
          const parsed = parseQaJson(result.content);
          return {
            answer: parsed.answer,
            references: parsed.references,
            status: parsed.answer ? 'success' : 'degraded',
            model: result.model,
            tokens_used: result.tokens_used,
            latency_ms: result.latency_ms,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, SessionQaResp>(
          '/api/v1/ai/session-qa',
          reqBody,
          localHandler,
          args.authToken,
          30000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(
          `[AI] [session-qa] ✔ Success (${source}): status=${resp.status}, refs=${resp.references?.length ?? 0}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`,
        );
        return {
          answer: resp.answer,
          references: resp.references ?? [],
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
        logger.error(`[AI] [session-qa] ✖ Failed after ${elapsed}ms: ${error.message}`);
        throw error;
      }
    },
  );
}

/** 宽松解析问答 JSON（本地小模型输出不可靠，需容错） */
function parseQaJson(content: string): { answer: string; references: Array<{ time: string; text: string }> } {
  const fallback = { answer: '', references: [] };
  try {
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const data = JSON.parse(cleaned) as { answer?: unknown; references?: unknown };
    if (!data || typeof data !== 'object') return fallback;
    const answer = typeof data.answer === 'string' ? data.answer.slice(0, 600) : '';
    const refs: Array<{ time: string; text: string }> = [];
    if (Array.isArray(data.references)) {
      for (const r of data.references.slice(0, 3)) {
        if (r && typeof r === 'object' && typeof (r as { time?: unknown }).time === 'string' && typeof (r as { text?: unknown }).text === 'string') {
          refs.push({ time: (r as { time: string }).time.slice(0, 16), text: (r as { text: string }).text.slice(0, 80) });
        }
      }
    }
    return { answer, references: refs };
  } catch {
    return fallback;
  }
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_session_qa',
  name: 'D2 课堂问答',
  version: '1.0.0',
  register,
};
