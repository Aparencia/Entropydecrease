import type {
  AIPlugin,
  SummarizeOptions,
  SummarizeResult,
  FlashcardOptions,
  FlashcardResult,
  EvaluateOptions,
  EvaluateResult,
  DurationOptions,
  DurationHistoryData,
  DurationResult,
  OptimizeCardResult,
  FeynmanQuestionResult,
  FeynmanAnswerEvalResult,
  TagContentResult,
  SortResult,
  AnchorPoint,
  BrainstormIdea,
  ChatMessage,
  SocraticEvaluateResult,
  SocraticDeepeningResult,
  PredictionPrompt,
  RescueContext,
  ResourceLink,
} from './types';
import { AIError } from './types';
import { classifyRawError } from './errorClassifier';
import { getActiveUserKey } from './apiKeyManager';

/**
 * Electron AI 插件 — 通过 Electron IPC 通道调用 ai-gateway
 *
 * 使用 preload.ts 暴露的 electronAPI.invoke 与主进程通信。
 * 主进程通过 Node.js fetch 代理请求到 ai-gateway 服务。
 */
export class ElectronAIPlugin implements AIPlugin {
  private authToken: string | null = null;

  /**
   * 设置认证 token（每次 AI 调用前可更新）
   */
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  /**
   * 离线前置检查
   */
  private checkOnline() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new AIError('当前处于离线状态，无法使用 AI 功能', 'offline', false);
    }
  }

  // ── invoke('ai_summarize') ──────────────────────────────────
  async summarizeNote(noteContent: string, options?: SummarizeOptions): Promise<SummarizeResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_summarize', {
        text: noteContent,
        maxLength: options?.maxLength,
        style: options?.style,
        language: options?.language,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        summary: string;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
      };
      return {
        summary: result.summary,
        keyPoints: [],
        generatedAt: new Date(),
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_generate_cards') ─────────────────────────────
  async generateFlashcards(noteContent: string, options?: FlashcardOptions): Promise<FlashcardResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_generate_cards', {
        note: noteContent,
        maxCards: options?.count,
        difficulty: options?.difficulty,
        cardType: options?.cardType,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        cards: Array<{ front: string; back: string; type: string; confidence: number }>;
        totalExtracted: number;
        model: string;
        tokensUsed: number;
        requestId?: string;
      };
      return {
        cards: result.cards.map(c => ({
          front: c.front,
          back: c.back,
          type: c.type,
          confidence: c.confidence,
        })),
        totalExtracted: result.totalExtracted,
        generatedAt: new Date(),
        model: result.model,
        tokensUsed: result.tokensUsed,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_evaluate') ───────────────────────────────────
  async evaluateExplanation(
    concept: string,
    explanation: string,
    _options?: EvaluateOptions,
  ): Promise<EvaluateResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_evaluate', {
        concept,
        explanation,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        overallScore: number;
        dimensions: Array<{ name: string; score: number; feedback: string }>;
        strengths: string[];
        improvements: string[];
        encouragement: string;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
      };
      return {
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_recommend_duration') ─────────────────────────
  async recommendDuration(
    historyData: DurationHistoryData,
    _options?: DurationOptions,
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
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        recommendedMinutes: number;
        breakMinutes: number;
        reason: string;
        source: string;
        isLocalFallback: boolean;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_optimize_card') ──────────────────────────────
  async optimizeCard(front: string, back: string): Promise<OptimizeCardResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_optimize_card', {
        front,
        back,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        suggestedFront: string;
        suggestedBack: string;
        improvements: string[];
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
      };
      return {
        suggestedFront: result.suggestedFront,
        suggestedBack: result.suggestedBack,
        improvements: result.improvements,
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_feynman_question') ──────────────────────────
  async generateFeynmanQuestions(concept: string, explanation: string): Promise<FeynmanQuestionResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_feynman_question', {
        concept,
        explanation,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        questions: Array<{ question: string; focus: string }>;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_feynman_evaluate_answers') ────────────────────
  async evaluateFeynmanAnswers(
    concept: string,
    questions: string[],
    answers: string[],
  ): Promise<FeynmanAnswerEvalResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_feynman_evaluate_answers', {
        concept,
        questions,
        answers,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        understandingScore: number;
        feedback: string;
        strongPoints: string[];
        weakPoints: string[];
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_tag_content') ─────────────────────────────────
  async tagContent(content: string): Promise<TagContentResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_tag_content', {
        content,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        contentNature: string;
        cognitiveDepth: string;
        subject: string;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
      };

      return {
        contentNature: result.contentNature as TagContentResult['contentNature'],
        cognitiveDepth: result.cognitiveDepth as TagContentResult['cognitiveDepth'],
        subject: result.subject,
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_sort_inspiration') ─────────────────────────────
  async sortInspiration(content: string, existingTags?: Record<string, string>): Promise<SortResult> {
    try {
      const result = await window.electronAPI!.invoke('ai_sort_inspiration', {
        content,
        existingTags,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        suggestions: Array<{ category: string; reason: string; confidence: number; suggestedAction?: string }>;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
      };

      return {
        suggestions: result.suggestions.map(s => ({
          category: s.category as SortResult['suggestions'][0]['category'],
          reason: s.reason,
          confidence: s.confidence,
          suggestedAction: s.suggestedAction,
        })),
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_anchor_point') ─────────────────────────────────
  async generateAnchorPoint(noteId: string, content: string): Promise<{ anchorPoints: AnchorPoint[] }> {
    try {
      const result = await window.electronAPI!.invoke('ai_anchor_point', {
        content,
        title: '',
        authToken: this.authToken,
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_socratic') brainstorm ──────────────────────────
  async socraticBrainstorm(topic: string, context?: string): Promise<{ ideas: BrainstormIdea[] }> {
    try {
      const result = await window.electronAPI!.invoke('ai_socratic', {
        topic,
        history: context ? [{ role: 'learner', content: context }] : null,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_socratic') question ────────────────────────────
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

      const result = await window.electronAPI!.invoke('ai_socratic', {
        topic,
        history: backendHistory.length > 0 ? backendHistory : null,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_socratic_evaluate') ────────────────────────────
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

      const result = await window.electronAPI!.invoke('ai_socratic_evaluate', {
        topic,
        question,
        answer,
        history: backendHistory,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        dimensions: { accuracy: number; completeness: number; logic: number; expression: number };
        feedback: string;
        encouragement: string;
        status: string;
        model: string;
        tokensUsed: number;
        latencyMs: number;
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_socratic_deepening') ───────────────────────────
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

      const result = await window.electronAPI!.invoke('ai_socratic_deepening', {
        topic,
        dialogueSummary,
        history: backendHistory,
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        angles: Array<{ key: string; label: string; question: string }>;
        status: string;
        model: string;
        tokensUsed: number;
        latencyMs: number;
      };

      return {
        angles: result.angles,
        status: result.status,
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_predict') ──────────────────────────────────────
  async predictQuestion(noteId: string, content: string): Promise<{ predictions: PredictionPrompt[] }> {
    try {
      const result = await window.electronAPI!.invoke('ai_predict', {
        content,
        authToken: this.authToken,
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
      throw this.handleError(error);
    }
  }

  // ── invoke('ai_rescue') ───────────────────────────────────────
  async rescue(context: RescueContext): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
    try {
      const result = await window.electronAPI!.invoke('ai_rescue', {
        content: context.relatedContent || context.topic,
        stuckDescription: context.stuckPoint || context.topic,
        attemptedMethods: context.attempts?.join('; ') || '',
        authToken: this.authToken,
        userApiKey: getActiveUserKey(),
      }) as {
        rescueLevels: Array<{ level: number; label: string; suggestion: string; hintQuestion: string }>;
        encouragement: string;
        status: string; model: string; tokensUsed: number; latencyMs: number;
      };

      const hints = (result.rescueLevels || []).map(lv => lv.hintQuestion || lv.suggestion);
      const alternativeApproach = (result.rescueLevels || []).find(lv => lv.level === 3)?.suggestion;

      return {
        hints,
        resources: [],
        alternativeApproach,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    throw classifyRawError(error, 'ipc');
  }

  // ── 流式 IPC 辅助方法 ───────────────────────────────

  /**
   * 通过 IPC 流式推送获取 AI 响应
   * 生成 requestId，启动流式请求，监听 chunk/end/error 事件
   */
  private async *_streamIpc(
    method: string,
    payload: Record<string, unknown>,
  ): AsyncGenerator<string, void, unknown> {
    const requestId = crypto.randomUUID();
    const api = window.electronAPI;
    if (!api) throw new AIError('Electron API 不可用', 'service_unavailable', false);

    // 启动流式请求
    api.invoke('ai:stream:start', { requestId, method, payload, authToken: this.authToken, userApiKey: getActiveUserKey() });

    // 等待流式结果的 Promise-based 桥接
    const queue: Array<{ type: 'chunk'; chunk: string } | { type: 'end' } | { type: 'error'; error: string }> = [];
    let resolve: (() => void) | null = null;

    const notify = () => { if (resolve) { resolve(); resolve = null; } };

    const unsubChunk = api.on('ai:stream:chunk', (...args: unknown[]) => {
      const data = args[0] as { requestId: string; chunk: string };
      if (data.requestId === requestId) { queue.push({ type: 'chunk', chunk: data.chunk }); notify(); }
    });
    const unsubEnd = api.on('ai:stream:end', (...args: unknown[]) => {
      const data = args[0] as { requestId: string };
      if (data.requestId === requestId) { queue.push({ type: 'end' }); notify(); }
    });
    const unsubError = api.on('ai:stream:error', (...args: unknown[]) => {
      const data = args[0] as { requestId: string; error: string };
      if (data.requestId === requestId) { queue.push({ type: 'error', error: data.error }); notify(); }
    });

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>(r => { resolve = r; });
        }
        const item = queue.shift();
        if (!item) continue;
        if (item.type === 'chunk') yield item.chunk;
        else if (item.type === 'end') return;
        else if (item.type === 'error') throw new AIError(item.error, 'service_unavailable', true);
      }
    } finally {
      unsubChunk();
      unsubEnd();
      unsubError();
    }
  }

  // ── 流式方法实现 ─────────────────────────────────────

  async *summarizeNoteStream(noteContent: string, options?: SummarizeOptions): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/summarize/stream', {
      text: noteContent,
      params: { max_length: options?.maxLength, style: options?.style, language: options?.language },
    });
  }

  async *generateFlashcardsStream(noteContent: string, options?: FlashcardOptions): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/generate-cards/stream', {
      text: noteContent,
      params: { count: options?.count, difficulty: options?.difficulty, card_type: options?.cardType },
    });
  }

  async *evaluateExplanationStream(concept: string, explanation: string, _options?: EvaluateOptions): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/evaluate-explanation/stream', {
      text: explanation,
      text2: concept,
    });
  }

  async *recommendDurationStream(historyData: DurationHistoryData, _options?: DurationOptions): AsyncIterable<string> {
    const history = (historyData.sessions || []).map(s => ({
      duration_minutes: s.duration, completed: s.completed, subject: s.subject || '', timestamp: s.date,
    }));
    yield* this._streamIpc('/api/v1/ai/recommend-duration/stream', {
      text: JSON.stringify({ history }),
    });
  }

  async *tagContentStream(content: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/tag-content/stream', { text: content });
  }

  async *optimizeCardStream(front: string, back: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/optimize-card/stream', { text: front, text2: back });
  }

  async *sortInspirationStream(content: string, existingTags?: Record<string, string>): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/sort-inspiration/stream', {
      text: content,
      params: { existing_tags: existingTags },
    });
  }

  async *generateFeynmanQuestionsStream(concept: string, explanation: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/feynman-question/stream', {
      text: explanation,
      text2: concept,
    });
  }

  async *evaluateFeynmanAnswersStream(concept: string, questions: string[], answers: string[]): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/feynman-evaluate-answers/stream', {
      text: JSON.stringify({ concept, questions, answers }),
    });
  }

  async *generateAnchorPointStream(noteId: string, content: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/anchor-point/stream', { text: content, params: { note_id: noteId } });
  }

  async *socraticBrainstormStream(topic: string, context?: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/socratic/stream', {
      text: topic,
      params: { context: context || '' },
    });
  }

  async *socraticQuestionStream(conversationId: string, topic: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/socratic/stream', {
      text: topic,
      params: { conversation_id: conversationId, history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *socraticEvaluateStream(topic: string, question: string, answer: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/socratic/evaluate/stream', {
      text: answer,
      text2: topic,
      params: { question, history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *socraticDeepeningStream(topic: string, dialogueSummary: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/socratic/deepening/stream', {
      text: topic,
      text2: dialogueSummary,
      params: { history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *predictQuestionStream(noteId: string, content: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/predict/stream', { text: content, params: { note_id: noteId } });
  }

  async *rescueStream(context: RescueContext): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/rescue/stream', {
      text: context.relatedContent || context.topic,
      params: { stuck_description: context.stuckPoint || '', mode: context.mode || 'general' },
    });
  }

  async *generateDraftStream(inspirationId: string, type: 'flashcard' | 'feynman' | 'note', content: string): AsyncIterable<string> {
    yield* this._streamIpc('/api/v1/ai/inspiration-draft/stream', {
      text: content,
      params: { inspiration_id: inspirationId, type },
    });
  }
}
