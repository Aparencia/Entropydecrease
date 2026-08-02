/**
 * Electron IPC — 苏格拉底域 AI 功能（头脑风暴/追问/评估/深化）
 *
 * @ai-context: 从 electronLearningFeatures 拆出，与 remoteSocraticFeatures
 * 结构对称。history role 前端→网关映射（assistant→tutor / 其余→learner）
 * 为网关契约；brainstorm 与 question 复用同一 'ai_socratic' IPC 通道。
 */
import type {
  BrainstormIdea, ChatMessage,
  SocraticEvaluateResult, SocraticDeepeningResult,
} from './types';
import { classifyRawError } from './errorClassifier';

/** history role 前端→网关映射（assistant→tutor，其余→learner） */
function toBackendHistory(history: ChatMessage[]): Array<{ role: string; content: string }> {
  return history.map(h => ({
    role: h.role === 'assistant' ? 'tutor' : 'learner',
    content: h.content,
  }));
}

// ── invoke('ai_socratic') brainstorm ──────────────────────────
export async function ipcSocraticBrainstorm(
  authToken: string | null, topic: string, context?: string,
): Promise<{ ideas: BrainstormIdea[] }> {
  try {
    const result = await window.electronAPI!.invoke('ai_socratic', {
      topic,
      history: context ? [{ role: 'learner', content: context }] : null,
      authToken,
    }) as {
      question: string; hint: string; thinkingDirection: string;
      depthLevel: number; turnCount: number;
      status: string; model: string; tokensUsed: number; latencyMs: number;
    };

    return {
      ideas: [
        {
          title: result.question || '思考方向',
          description: result.hint || result.thinkingDirection || '',
          category: result.thinkingDirection || undefined,
          feasibility: 0.7,
          source: 'socratic_brainstorm',
        },
      ],
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_socratic') question ────────────────────────────
export async function ipcSocraticQuestion(
  authToken: string | null, _conversationId: string, topic: string, history: ChatMessage[],
): Promise<{ question: string; hints: string[] }> {
  try {
    const backendHistory = toBackendHistory(history);

    const result = await window.electronAPI!.invoke('ai_socratic', {
      topic,
      history: backendHistory.length > 0 ? backendHistory : null,
      authToken,
    }) as {
      question: string; hint: string; thinkingDirection: string;
      depthLevel: number; turnCount: number;
      status: string; model: string; tokensUsed: number; latencyMs: number;
    };

    return {
      question: result.question,
      hints: [result.hint, result.thinkingDirection].filter(Boolean),
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_socratic_evaluate') ────────────────────────────
export async function ipcSocraticEvaluate(
  authToken: string | null, topic: string, question: string, answer: string, history: ChatMessage[],
): Promise<SocraticEvaluateResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_socratic_evaluate', {
      topic,
      question,
      answer,
      history: toBackendHistory(history),
      authToken,
    }) as {
      dimensions: { accuracy: number; completeness: number; logic: number; expression: number };
      feedback: string; encouragement: string; status: string;
      model: string; tokensUsed: number; latencyMs: number;
    };

    return {
      dimensions: result.dimensions,
      feedback: result.feedback,
      encouragement: result.encouragement,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_socratic_deepening') ───────────────────────────
export async function ipcSocraticDeepening(
  authToken: string | null, topic: string, dialogueSummary: string, history: ChatMessage[],
): Promise<SocraticDeepeningResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_socratic_deepening', {
      topic,
      dialogueSummary,
      history: toBackendHistory(history),
      authToken,
    }) as {
      angles: Array<{ key: string; label: string; question: string }>;
      status: string; model: string; tokensUsed: number; latencyMs: number;
    };

    return {
      angles: result.angles,
      status: result.status,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    throw classifyRawError(error, 'ipc');
  }
}
