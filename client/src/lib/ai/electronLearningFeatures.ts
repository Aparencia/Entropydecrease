/**
 * Electron IPC — 学习增强类 AI 功能（评估/时长/费曼/预测/救援/锚点）
 *
 * @ai-context: 从 ElectronAIPlugin 拆出的按域函数集。含前后端字段适配的
 * 关键映射：overallScore>10 时除以 10（历史上网关曾返回百分制）；
 * rescue 三级提示中 level===3 作为 alternativeApproach。苏格拉底域见
 * electronSocraticFeatures.ts。这些映射是行为契约，修改需谨慎。
 */
import type {
  EvaluateOptions, EvaluateResult,
  DurationOptions, DurationHistoryData, DurationResult,
  FeynmanQuestionResult, FeynmanAnswerEvalResult,
  AnchorPoint, PredictionPrompt, RescueContext, ResourceLink,
} from './types';
import { classifyRawError } from './errorClassifier';
import { getActiveUserKey } from './apiKeyManager';

// ── invoke('ai_evaluate') ───────────────────────────────────
export async function ipcEvaluateExplanation(
  authToken: string | null, concept: string, explanation: string, _options?: EvaluateOptions,
): Promise<EvaluateResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_evaluate', {
      concept,
      explanation,
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      overallScore: number;
      dimensions: Array<{ name: string; score: number; feedback: string }>;
      strengths: string[]; improvements: string[]; encouragement: string;
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      // HACK: 网关历史版本曾返回百分制，>10 时除以 10 归一化
      overallScore: result.overallScore > 10 ? result.overallScore / 10 : result.overallScore,
      dimensions: result.dimensions.map(d => ({
        name: d.name,
        score: d.score,
        feedback: d.feedback,
      })),
      suggestions: result.improvements,
      strengths: result.strengths,
      weaknesses: result.improvements,
      encouragement: result.encouragement,
      generatedAt: new Date(),
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_recommend_duration') ─────────────────────────
export async function ipcRecommendDuration(
  authToken: string | null, historyData: DurationHistoryData, _options?: DurationOptions,
): Promise<DurationResult> {
  try {
    // 将前端 session 数据映射为 FocusSessionInput（camelCase）
    const history = (historyData.sessions || []).map(s => ({
      durationMinutes: s.duration,
      completed: s.completed,
      subject: s.subject || '',
      timestamp: s.date,
    }));

    const result = await window.electronAPI!.invoke('ai_recommend_duration', {
      history,
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      recommendedMinutes: number; breakMinutes: number; reason: string;
      source: string; isLocalFallback: boolean;
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      recommendedDuration: result.recommendedMinutes,
      breakMinutes: result.breakMinutes,
      reasoning: result.reason,
      confidence: 'medium',
      source: result.source,
      isLocalFallback: result.isLocalFallback,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_feynman_question') ──────────────────────────
export async function ipcGenerateFeynmanQuestions(
  authToken: string | null, concept: string, explanation: string,
): Promise<FeynmanQuestionResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_feynman_question', {
      concept,
      explanation,
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      questions: Array<{ question: string; focus: string }>;
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      questions: result.questions.map(q => ({
        question: q.question,
        focus: q.focus,
      })),
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_feynman_evaluate_answers') ────────────────────
export async function ipcEvaluateFeynmanAnswers(
  authToken: string | null, concept: string, questions: string[], answers: string[],
): Promise<FeynmanAnswerEvalResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_feynman_evaluate_answers', {
      concept,
      questions,
      answers,
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      understandingScore: number; feedback: string;
      strongPoints: string[]; weakPoints: string[];
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      understandingScore: result.understandingScore,
      feedback: result.feedback,
      strongPoints: result.strongPoints,
      weakPoints: result.weakPoints,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_anchor_point') ─────────────────────────────────
export async function ipcGenerateAnchorPoint(
  authToken: string | null, _noteId: string, content: string,
): Promise<{ anchorPoints: AnchorPoint[] }> {
  try {
    const result = await window.electronAPI!.invoke('ai_anchor_point', {
      content,
      title: '',
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      anchorPoints: Array<{ concept: string; association: string; memoryTechnique: string; importance: number }>;
      status: string; model: string; tokensUsed: number; latencyMs: number;
    };

    return {
      anchorPoints: (result.anchorPoints || []).map(ap => ({
        concept: ap.concept,
        importance: ap.importance,
        explanation: ap.association || ap.memoryTechnique || undefined,
        relatedConcepts: ap.memoryTechnique ? [ap.memoryTechnique] : undefined,
      })),
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_predict') ──────────────────────────────────────
export async function ipcPredictQuestion(
  authToken: string | null, _noteId: string, content: string,
): Promise<{ predictions: PredictionPrompt[] }> {
  try {
    const result = await window.electronAPI!.invoke('ai_predict', {
      content,
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      predictions: Array<{ question: string; type: string; reason: string; curiosityScore: number }>;
      status: string; model: string; tokensUsed: number; latencyMs: number;
    };

    return {
      predictions: (result.predictions || []).map(p => ({
        question: p.question,
        expectedAnswer: p.reason || '',
        difficulty: Math.round(p.curiosityScore * 5) as PredictionPrompt['difficulty'],
        relatedConcepts: p.type ? [p.type] : undefined,
      })),
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_rescue') ───────────────────────────────────────
export async function ipcRescue(
  authToken: string | null, context: RescueContext,
): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
  try {
    const result = await window.electronAPI!.invoke('ai_rescue', {
      content: context.relatedContent || context.topic,
      stuckDescription: context.stuckPoint || context.topic,
      attemptedMethods: context.attempts?.join('; ') || '',
      authToken,
      userApiKey: getActiveUserKey(),
    }) as {
      rescueLevels: Array<{ level: number; label: string; suggestion: string; hintQuestion: string }>;
      encouragement: string; status: string;
      model: string; tokensUsed: number; latencyMs: number;
    };

    const hints = (result.rescueLevels || []).map(lv => lv.hintQuestion || lv.suggestion);
    const alternativeApproach = (result.rescueLevels || []).find(lv => lv.level === 3)?.suggestion;

    return {
      hints,
      resources: [],
      alternativeApproach,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}
