import type { AIPlugin, SummarizeResult, FlashcardResult, EvaluateResult, DurationResult,
  SummarizeOptions, FlashcardOptions, EvaluateOptions, DurationOptions, DurationHistoryData,
  OptimizeCardResult, FeynmanQuestionResult, FeynmanAnswerEvalResult,
  TagContentResult, SortResult,
  AnchorPoint, BrainstormIdea, ChatMessage, SocraticEvaluateResult, SocraticDeepeningResult,
  PredictionPrompt, RescueContext, ResourceLink
} from './types';
import { AIError } from './types';
import { classifyRawError } from './errorClassifier';
import { aiClient } from '../http/apiClient';

/**
 * 远程 AI 插件 — 通过 HTTPS 调用 ai-gateway 服务
 *
 * 请求字段做 camelCase → snake_case 转换以匹配后端 Pydantic model；
 * 响应字段从 snake_case 映射回前端 camelCase 类型。
 */

/**
 * 将后端返回的评分规范化到 0-10 范围
 * - 后端可能返回 0-10 或 0-100 范围的分数
 * - 0-100 范围（>10）缩放到 0-10
 * - 0-10 范围直接使用
 * - 边界值 clamp 到 [0, 10]
 */
function normalizeScore(raw: number): number {
  if (raw > 100) return 10;
  if (raw > 10) return Math.round((raw / 10) * 10) / 10; // 0-100 → 0-10, 保留1位小数
  if (raw < 0) return 0;
  return raw;
}

export class RemoteAIPlugin implements AIPlugin {
  private timeout: number;

  constructor(timeout: number = 60000) {
    this.timeout = timeout;
  }

  /**
   * 离线前置检查
   */
  private checkOnline() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new AIError('当前处于离线状态，无法使用 AI 功能', 'offline', false);
    }
  }

  // ── POST /api/v1/ai/summarize ──────────────────────────────
  async summarizeNote(noteContent: string, options?: SummarizeOptions): Promise<SummarizeResult> {
    try {
      // 构建后端 SummarizeRequest: { text, options: { max_length, style, language } }
      const backendOptions: Record<string, unknown> = {};
      if (options?.maxLength != null) backendOptions.max_length = options.maxLength;
      if (options?.style != null) backendOptions.style = options.style;
      if (options?.language != null) backendOptions.language = options.language;

      const result = await aiClient.post<{
        summary: string; model: string; tokens_used: number; latency_ms: number;
      }>(
        '/api/v1/ai/summarize',
        { text: noteContent, options: backendOptions },
      );

      return {
        summary: result.summary,
        keyPoints: [],
        generatedAt: new Date(),
        model: result.model,
        tokensUsed: result.tokens_used,
        latencyMs: result.latency_ms,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/generate-cards ─────────────────────────
  async generateFlashcards(noteContent: string, options?: FlashcardOptions): Promise<FlashcardResult> {
    try {
      // 构建后端 CardGenRequest: { note, options: { max_cards, difficulty, card_type } }
      const backendOptions: Record<string, unknown> = {};
      if (options?.count != null) backendOptions.max_cards = options.count;
      if (options?.difficulty != null) backendOptions.difficulty = options.difficulty;
      if (options?.cardType != null) backendOptions.card_type = options.cardType;

      const result = await aiClient.post<{
        cards: Array<{ front: string; back: string; type: string; confidence: number }>;
        total_extracted: number; model: string; tokens_used: number;
      }>(
        '/api/v1/ai/generate-cards',
        { note: noteContent, options: backendOptions },
      );

      return {
        cards: result.cards.map(c => ({
          front: c.front,
          back: c.back,
          type: c.type,
          confidence: c.confidence,
        })),
        totalExtracted: result.total_extracted,
        generatedAt: new Date(),
        model: result.model,
        tokensUsed: result.tokens_used,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/evaluate-explanation ───────────────────
  async evaluateExplanation(concept: string, explanation: string, _options?: EvaluateOptions): Promise<EvaluateResult> {
    try {
      // 构建后端 EvaluateRequest: { concept, explanation }
      const result = await aiClient.post<{
        overall_score: number;
        dimensions: Array<{ dimension: string; score: number; feedback: string }>;
        strengths: string[];
        improvements: string[];
        encouragement: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/recommend-duration ─────────────────────
  async recommendDuration(historyData: DurationHistoryData, _options?: DurationOptions): Promise<DurationResult> {
    try {
      // 构建后端 RecommendRequest: { history: [{ duration_minutes, completed, subject, timestamp }] }
      const history = (historyData.sessions || []).map(s => ({
        duration_minutes: s.duration,
        completed: s.completed,
        subject: s.subject || '',
        timestamp: s.date,
      }));

      const result = await aiClient.post<{
        recommended_minutes: number;
        break_minutes: number;
        reason: string;
        source: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/feynman-question ───────────────────
  async generateFeynmanQuestions(concept: string, explanation: string): Promise<FeynmanQuestionResult> {
    try {
      const result = await aiClient.post<{
        questions: Array<{ question: string; focus: string }>;
        model: string;
        tokens_used: number;
        latency_ms: number;
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/feynman-evaluate-answers ────────────
  async evaluateFeynmanAnswers(
    concept: string,
    questions: string[],
    answers: string[],
  ): Promise<FeynmanAnswerEvalResult> {
    try {
      const result = await aiClient.post<{
        understanding_score: number;
        feedback: string;
        strong_points: string[];
        weak_points: string[];
        model: string;
        tokens_used: number;
        latency_ms: number;
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/optimize-card ──────────────────────────
  async optimizeCard(front: string, back: string): Promise<OptimizeCardResult> {
    try {
      const result = await aiClient.post<{
        suggested_front: string;
        suggested_back: string;
        improvements: string[];
        model: string;
        tokens_used: number;
        latency_ms: number;
      }>(
        '/api/v1/ai/optimize-card',
        { front, back },
      );

      return {
        suggestedFront: result.suggested_front,
        suggestedBack: result.suggested_back,
        improvements: result.improvements,
        model: result.model,
        tokensUsed: result.tokens_used,
        latencyMs: result.latency_ms,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/tag-content ──────────────────────────────
  async tagContent(content: string): Promise<TagContentResult> {
    try {
      const result = await aiClient.post<{
        content_nature: string;
        cognitive_depth: string;
        subject: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }>(
        '/api/v1/ai/tag-content',
        { content },
      );

      return {
        contentNature: result.content_nature as TagContentResult['contentNature'],
        cognitiveDepth: result.cognitive_depth as TagContentResult['cognitiveDepth'],
        subject: result.subject,
        model: result.model,
        tokensUsed: result.tokens_used,
        latencyMs: result.latency_ms,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/sort-inspiration ─────────────────────────
  async sortInspiration(content: string, existingTags?: Record<string, string>): Promise<SortResult> {
    try {
      const result = await aiClient.post<{
        suggestions: Array<{ category: string; reason: string; confidence: number; suggested_action?: string }>;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }>(
        '/api/v1/ai/sort-inspiration',
        { content, existing_tags: existingTags },
      );

      return {
        suggestions: result.suggestions.map(s => ({
          category: s.category as SortResult['suggestions'][0]['category'],
          reason: s.reason,
          confidence: s.confidence,
          suggestedAction: s.suggested_action,
        })),
        model: result.model,
        tokensUsed: result.tokens_used,
        latencyMs: result.latency_ms,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/anchor-point ─────────────────────────────
  async generateAnchorPoint(noteId: string, content: string): Promise<{ anchorPoints: AnchorPoint[] }> {
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/socratic (brainstorm) ───────────────────
  async socraticBrainstorm(topic: string, context?: string): Promise<{ ideas: BrainstormIdea[] }> {
    try {
      const result = await aiClient.post<{
        question: string; hint: string; thinking_direction: string;
        depth_level: number; turn_count: number;
        status: string; model: string; tokens_used: number; latency_ms: number;
      }>(
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/socratic (question) ─────────────────────
  async socraticQuestion(
    conversationId: string,
    topic: string,
    history: ChatMessage[],
  ): Promise<{ question: string; hints: string[] }> {
    try {
      const backendHistory = history.map(h => ({
        role: h.role === 'assistant' ? 'tutor' : 'learner',
        content: h.content,
      }));

      const result = await aiClient.post<{
        question: string; hint: string; thinking_direction: string;
        depth_level: number; turn_count: number;
        status: string; model: string; tokens_used: number; latency_ms: number;
      }>(
        '/api/v1/ai/socratic',
        { topic, history: backendHistory.length > 0 ? backendHistory : null },
      );

      return {
        question: result.question,
        hints: [result.hint, result.thinking_direction].filter(Boolean),
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/socratic/evaluate ────────────────────────
  async socraticEvaluate(
    topic: string,
    question: string,
    answer: string,
    history: ChatMessage[],
  ): Promise<SocraticEvaluateResult> {
    try {
      const backendHistory = history.map(h => ({
        role: h.role === 'assistant' ? 'tutor' : 'learner',
        content: h.content,
      }));

      const result = await aiClient.post<{
        dimensions: { accuracy: number; completeness: number; logic: number; expression: number };
        feedback: string;
        encouragement: string;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }>(
        '/api/v1/ai/socratic/evaluate',
        { topic, question, answer, history: backendHistory },
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/socratic/deepening ───────────────────────
  async socraticDeepening(
    topic: string,
    dialogueSummary: string,
    history: ChatMessage[],
  ): Promise<SocraticDeepeningResult> {
    try {
      const backendHistory = history.map(h => ({
        role: h.role === 'assistant' ? 'tutor' : 'learner',
        content: h.content,
      }));

      const result = await aiClient.post<{
        angles: Array<{ key: string; label: string; question: string }>;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }>(
        '/api/v1/ai/socratic/deepening',
        { topic, dialogue_summary: dialogueSummary, history: backendHistory },
      );

      return {
        angles: result.angles,
        status: result.status,
        model: result.model,
        tokensUsed: result.tokens_used,
        latencyMs: result.latency_ms,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/predict ─────────────────────────────────
  async predictQuestion(noteId: string, content: string): Promise<{ predictions: PredictionPrompt[] }> {
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
      throw this.handleError(error);
    }
  }

  // ── POST /api/v1/ai/rescue ──────────────────────────────────
  async rescue(context: RescueContext): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
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
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    throw classifyRawError(error, 'fetch');
  }

  // ── 流式方法实现 ─────────────────────────────────────

  async *summarizeNoteStream(noteContent: string, options?: SummarizeOptions): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/summarize/stream', {
      text: noteContent,
      params: { max_length: options?.maxLength, style: options?.style, language: options?.language },
    });
  }

  async *generateFlashcardsStream(noteContent: string, options?: FlashcardOptions): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/generate-cards/stream', {
      text: noteContent,
      params: { count: options?.count, difficulty: options?.difficulty, card_type: options?.cardType },
    });
  }

  async *evaluateExplanationStream(concept: string, explanation: string, _options?: EvaluateOptions): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/evaluate-explanation/stream', {
      text: explanation,
      text2: concept,
    });
  }

  async *recommendDurationStream(historyData: DurationHistoryData, _options?: DurationOptions): AsyncIterable<string> {
    const history = (historyData.sessions || []).map(s => ({
      duration_minutes: s.duration, completed: s.completed, subject: s.subject || '', timestamp: s.date,
    }));
    yield* aiClient.postStream('/api/v1/ai/recommend-duration/stream', {
      text: JSON.stringify({ history }),
    });
  }

  async *tagContentStream(content: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/tag-content/stream', { text: content });
  }

  async *optimizeCardStream(front: string, back: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/optimize-card/stream', { text: front, text2: back });
  }

  async *sortInspirationStream(content: string, existingTags?: Record<string, string>): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/sort-inspiration/stream', {
      text: content,
      params: { existing_tags: existingTags },
    });
  }

  async *generateFeynmanQuestionsStream(concept: string, explanation: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/feynman-question/stream', {
      text: explanation,
      text2: concept,
    });
  }

  async *evaluateFeynmanAnswersStream(concept: string, questions: string[], answers: string[]): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/feynman-evaluate-answers/stream', {
      text: JSON.stringify({ concept, questions, answers }),
    });
  }

  async *generateAnchorPointStream(noteId: string, content: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/anchor-point/stream', { text: content, params: { note_id: noteId } });
  }

  async *socraticBrainstormStream(topic: string, context?: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/socratic/stream', {
      text: topic,
      params: { context: context || '' },
    });
  }

  async *socraticQuestionStream(conversationId: string, topic: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/socratic/stream', {
      text: topic,
      params: { conversation_id: conversationId, history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *socraticEvaluateStream(topic: string, question: string, answer: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/socratic/evaluate/stream', {
      text: answer,
      text2: topic,
      params: { question, history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *socraticDeepeningStream(topic: string, dialogueSummary: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/socratic/deepening/stream', {
      text: topic,
      text2: dialogueSummary,
      params: { history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *predictQuestionStream(noteId: string, content: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/predict/stream', { text: content, params: { note_id: noteId } });
  }

  async *rescueStream(context: RescueContext): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/rescue/stream', {
      text: context.relatedContent || context.topic,
      params: { stuck_description: context.stuckPoint || '', mode: context.mode || 'general' },
    });
  }

  async *generateDraftStream(inspirationId: string, type: 'flashcard' | 'feynman' | 'note', content: string): AsyncIterable<string> {
    yield* aiClient.postStream('/api/v1/ai/inspiration-draft/stream', {
      text: content,
      params: { inspiration_id: inspirationId, type },
    });
  }
}
