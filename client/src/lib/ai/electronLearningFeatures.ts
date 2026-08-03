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
  ErrorPatternResult, QuizGenResult, QuizQuestion,
  ContentTierResult, ConflictDetectResult,
  ConceptPrecheckResult,
} from './types';
import { classifyRawError } from './errorClassifier';

// ── invoke('ai_evaluate') ───────────────────────────────────
export async function ipcEvaluateExplanation(
  authToken: string | null, concept: string, explanation: string, _options?: EvaluateOptions,
): Promise<EvaluateResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_evaluate', {
      concept,
      explanation,
      authToken,
    }) as {
      overallScore: number;
      dimensions: Array<{ name: string; score: number; feedback: string }>;
      strengths: string[]; improvements: string[]; encouragement: string;
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      /**
       * HACK：评分归一化兼容处理
       *
       * 背景原因：AI 网关历史版本（v1.0 之前）曾返回百分制评分（0-100），
       * 现行网关已统一为十分制（0-10）。为避免旧版网关返回的百分制数据
       * 导致前端显示异常，当 overallScore > 10 时自动除以 10 归一化。
       *
       * 保留理由：自部署的私有化网关可能仍有旧版本在运行，无法确定全量
       * 升级时点，因此该兼容逻辑必须保持幂等。
       *
       * @todo 当确认所有生产/私有化网关均已升级到 v1.0+ 后，可安全移除此 HACK。
       * 跟踪方式：在 AI 网关发版日志中搜索「评分归一化」关键词确认全量升级状态。
       */
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

// ── invoke('ai_error_pattern') ────────────────────────
export async function ipcAnalyzeErrorPatterns(
  authToken: string | null,
  goldenErrors: Array<{ flashcardId: string; correctAnswer: string; userAnswer: string }>,
): Promise<ErrorPatternResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_error_pattern', {
      goldenErrors,
      authToken,
    }) as {
      patterns: Array<{ type: string; keywords: string[]; explanation: string; suggestion: string }>;
      topOffenders: Array<{ flashcardId: string; count: number }>;
      summary: string; model: string; tokensUsed: number;
    };

    return {
      patterns: (result.patterns || []).map(p => ({
        type: p.type as ErrorPatternResult['patterns'][number]['type'],
        keywords: p.keywords,
        explanation: p.explanation,
        suggestion: p.suggestion,
      })),
      topOffenders: result.topOffenders || [],
      summary: result.summary,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_generate_quiz') — N1 迷你测试生成 ────
export async function ipcGenerateQuiz(authToken: string | null, notesText: string): Promise<QuizGenResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_generate_quiz', {
      notesText, authToken,
    }) as { questions: QuizQuestion[]; model: string; tokensUsed: number };
    return {
      questions: result.questions || [],
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_content_tier') — N5 内容分层 ───────────
export async function ipcContentTier(authToken: string | null, notesText: string): Promise<ContentTierResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_content_tier', {
      notesText, authToken,
    }) as ContentTierResult & { model: string; tokensUsed: number };
    return {
      core: result.core || [],
      support: result.support || [],
      detail: result.detail || [],
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_conflict_detect') — N6 概念冲突检测 ────
export async function ipcConflictDetect(authToken: string | null, newNoteText: string, historyText: string): Promise<ConflictDetectResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_conflict_detect', {
      newNoteText, historyText, authToken,
    }) as ConflictDetectResult & { model: string; tokensUsed: number };
    return {
      conflicts: result.conflicts || [],
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_concept_precheck') — E1 概念预检 ─────
export async function ipcConceptPrecheck(authToken: string | null, concept: string, weakHistory?: string): Promise<ConceptPrecheckResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_concept_precheck', {
      concept, weakHistory, authToken,
    }) as ConceptPrecheckResult & { model: string; tokensUsed: number };
    return {
      questions: result.questions || [],
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}
