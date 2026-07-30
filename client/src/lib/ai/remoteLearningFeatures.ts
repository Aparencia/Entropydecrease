/**
 * 远程网关 — 学习增强类 AI 功能（评估/时长/费曼/锚点/预测/救援）
 *
 * @ai-context: 从 RemoteAIPlugin 拆出。normalizeScore 处理网关可能返回
 * 0-10 或 0-100 两种量程的历史兼容问题；rescue level===3 作为
 * alternativeApproach、resources 恒为空数组（后端暂不返回资源链接），
 * 均为行为契约。苏格拉底域见 remoteSocraticFeatures.ts。
 */
import type {
  EvaluateOptions, EvaluateResult,
  DurationOptions, DurationHistoryData, DurationResult,
  FeynmanQuestionResult, FeynmanAnswerEvalResult,
  AnchorPoint, PredictionPrompt, RescueContext, ResourceLink,
} from './types';
import { classifyRawError } from './errorClassifier';
import { aiClient } from '../http/apiClient';

/**
 * 将后端返回的评分规范化到 0-10 范围
 * - 后端可能返回 0-10 或 0-100 范围的分数
 * - 0-100 范围（>10）缩放到 0-10
 * - 0-10 范围直接使用
 * - 边界值 clamp 到 [0, 10]
 */
export function normalizeScore(raw: number): number {
  if (raw > 100) return 10;
  if (raw > 10) return Math.round((raw / 10) * 10) / 10; // 0-100 → 0-10, 保留1位小数
  if (raw < 0) return 0;
  return raw;
}

// ── POST /api/v1/ai/evaluate-explanation ───────────────────
export async function httpEvaluateExplanation(
  concept: string, explanation: string, _options?: EvaluateOptions,
): Promise<EvaluateResult> {
  try {
    // 构建后端 EvaluateRequest: { concept, explanation }
    const result = await aiClient.post<{
      overall_score: number;
      dimensions: Array<{ dimension: string; score: number; feedback: string }>;
      strengths: string[]; improvements: string[]; encouragement: string;
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/evaluate-explanation',
      { concept, explanation },
    );

    return {
      overallScore: normalizeScore(result.overall_score),
      dimensions: result.dimensions.map(d => ({
        name: d.dimension,
        score: normalizeScore(d.score),
        feedback: d.feedback,
      })),
      suggestions: result.improvements,
      strengths: result.strengths,
      weaknesses: result.improvements,
      encouragement: result.encouragement,
      generatedAt: new Date(),
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/recommend-duration ─────────────────────
export async function httpRecommendDuration(
  historyData: DurationHistoryData, _options?: DurationOptions,
): Promise<DurationResult> {
  try {
    // 构建后端 RecommendRequest: { history: [{ duration_minutes, completed, subject, timestamp }] }
    const history = (historyData.sessions || []).map(s => ({
      duration_minutes: s.duration,
      completed: s.completed,
      subject: s.subject || '',
      timestamp: s.date,
    }));

    const result = await aiClient.post<{
      recommended_minutes: number; break_minutes: number; reason: string;
      source: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/recommend-duration',
      { history },
    );

    return {
      recommendedDuration: result.recommended_minutes,
      breakMinutes: result.break_minutes,
      reasoning: result.reason,
      confidence: 'medium',
      source: result.source,
      isLocalFallback: result.source === 'local_rule',
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/feynman-question ───────────────────
export async function httpGenerateFeynmanQuestions(
  concept: string, explanation: string,
): Promise<FeynmanQuestionResult> {
  try {
    const result = await aiClient.post<{
      questions: Array<{ question: string; focus: string }>;
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/feynman-question',
      { concept, explanation },
    );

    return {
      questions: result.questions.map(q => ({
        question: q.question,
        focus: q.focus,
      })),
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/feynman-evaluate-answers ────────────
export async function httpEvaluateFeynmanAnswers(
  concept: string, questions: string[], answers: string[],
): Promise<FeynmanAnswerEvalResult> {
  try {
    const result = await aiClient.post<{
      understanding_score: number; feedback: string;
      strong_points: string[]; weak_points: string[];
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/feynman-evaluate-answers',
      { concept, questions, answers },
    );

    return {
      understandingScore: result.understanding_score,
      feedback: result.feedback,
      strongPoints: result.strong_points,
      weakPoints: result.weak_points,
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/anchor-point ─────────────────────────────
export async function httpGenerateAnchorPoint(
  _noteId: string, content: string,
): Promise<{ anchorPoints: AnchorPoint[] }> {
  try {
    const result = await aiClient.post<{
      anchor_points: Array<{
        concept: string; association: string; memory_technique: string; importance: number;
      }>;
      status: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/anchor-point',
      { content, title: '' },
    );

    return {
      anchorPoints: result.anchor_points.map(ap => ({
        concept: ap.concept,
        importance: ap.importance,
        explanation: ap.association || ap.memory_technique || undefined,
        relatedConcepts: ap.memory_technique ? [ap.memory_technique] : undefined,
      })),
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/predict ─────────────────────────────────
export async function httpPredictQuestion(
  _noteId: string, content: string,
): Promise<{ predictions: PredictionPrompt[] }> {
  try {
    const result = await aiClient.post<{
      predictions: Array<{
        question: string; type: string; reason: string; curiosity_score: number;
      }>;
      status: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/predict',
      { content },
    );

    return {
      predictions: result.predictions.map(p => ({
        question: p.question,
        expectedAnswer: p.reason || '',
        difficulty: Math.round(p.curiosity_score * 5) as PredictionPrompt['difficulty'],
        relatedConcepts: p.type ? [p.type] : undefined,
      })),
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/rescue ──────────────────────────────────
export async function httpRescue(
  context: RescueContext,
): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
  try {
    const result = await aiClient.post<{
      rescue_levels: Array<{
        level: number; label: string; suggestion: string; hint_question: string;
      }>;
      encouragement: string;
      status: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/rescue',
      {
        content: context.relatedContent || context.topic,
        stuck_description: context.stuckPoint || context.topic,
        attempted_methods: context.attempts?.join('; ') || '',
      },
    );

    const hints = result.rescue_levels.map(lv => lv.hint_question || lv.suggestion);
    const alternativeApproach = result.rescue_levels.find(lv => lv.level === 3)?.suggestion;

    return {
      hints,
      resources: [], // 后端暂不返回资源链接
      alternativeApproach,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}
