/**
 * 远程网关 — 苏格拉底域 AI 功能（头脑风暴/追问/评估/深化）
 *
 * @ai-context: 从 RemoteAIPlugin 拆出。history role 前端→网关映射
 * （assistant→tutor / 其余→learner）为网关契约；brainstorm 与 question
 * 复用同一 /api/v1/ai/socratic 端点，仅 history 构造不同。
 */
import type {
  BrainstormIdea, ChatMessage,
  SocraticEvaluateResult, SocraticDeepeningResult, SocraticMirrorResult,
} from './types';
import { classifyRawError } from './errorClassifier';
import { aiClient } from '../http/apiClient';

/** history role 前端→网关映射（assistant→tutor，其余→learner） */
function toBackendHistory(history: ChatMessage[]): Array<{ role: string; content: string }> {
  return history.map(h => ({
    role: h.role === 'assistant' ? 'tutor' : 'learner',
    content: h.content,
  }));
}

/** /api/v1/ai/socratic 响应结构 */
interface SocraticResponse {
  question: string; hint: string; thinking_direction: string;
  depth_level: number; turn_count: number;
  status: string; model: string; tokens_used: number; latency_ms: number;
}

// ── POST /api/v1/ai/socratic (brainstorm) ───────────────────
export async function httpSocraticBrainstorm(
  topic: string, context?: string,
): Promise<{ ideas: BrainstormIdea[] }> {
  try {
    const result = await aiClient.post<SocraticResponse>(
      '/api/v1/ai/socratic',
      { topic, history: context ? [{ role: 'learner', content: context }] : null },
    );

    // 将苏格拉底追问结果映射为 BrainstormIdea 列表
    return {
      ideas: [
        {
          title: result.question || '思考方向',
          description: result.hint || result.thinking_direction || '',
          category: result.thinking_direction || undefined,
          feasibility: 0.7,
          source: 'socratic_brainstorm',
        },
      ],
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/socratic (question) ─────────────────────
export async function httpSocraticQuestion(
  _conversationId: string, topic: string, history: ChatMessage[],
): Promise<{ question: string; hints: string[] }> {
  try {
    const backendHistory = toBackendHistory(history);

    const result = await aiClient.post<SocraticResponse>(
      '/api/v1/ai/socratic',
      { topic, history: backendHistory.length > 0 ? backendHistory : null },
    );

    return {
      question: result.question,
      hints: [result.hint, result.thinking_direction].filter(Boolean),
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/socratic/evaluate ────────────────────────
export async function httpSocraticEvaluate(
  topic: string, question: string, answer: string, history: ChatMessage[],
): Promise<SocraticEvaluateResult> {
  try {
    const result = await aiClient.post<{
      dimensions: { accuracy: number; completeness: number; logic: number; expression: number };
      feedback: string; encouragement: string; status: string;
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/socratic/evaluate',
      { topic, question, answer, history: toBackendHistory(history) },
    );

    return {
      dimensions: result.dimensions,
      feedback: result.feedback,
      encouragement: result.encouragement,
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/socratic/deepening ───────────────────────
export async function httpSocraticDeepening(
  topic: string, dialogueSummary: string, history: ChatMessage[],
): Promise<SocraticDeepeningResult> {
  try {
    const result = await aiClient.post<{
      angles: Array<{ key: string; label: string; question: string }>;
      status: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/socratic/deepening',
      { topic, dialogue_summary: dialogueSummary, history: toBackendHistory(history) },
    );

    return {
      angles: result.angles,
      status: result.status,
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/socratic (mirror) ────────────────────────
export async function httpSocraticMirror(
  topic: string, question: string,
): Promise<SocraticMirrorResult> {
  try {
    const result = await aiClient.post<{
      mirror_question: string; reflection_hint: string; perspective_shift?: string;
      status: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/socratic',
      { topic, question, mode: 'mirror' },
    );

    return {
      mirrorQuestion: result.mirror_question,
      reflectionHint: result.reflection_hint,
      perspectiveShift: result.perspective_shift,
      status: result.status,
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error) {
    throw classifyRawError(error, 'fetch');
  }
}
