import type { AIPlugin, SummarizeResult, FlashcardResult, EvaluateResult, DurationResult,
  SummarizeOptions, FlashcardOptions, EvaluateOptions, DurationOptions, DurationHistoryData,
  OptimizeCardResult, FeynmanQuestionResult, FeynmanAnswerEvalResult,
  TagContentResult, SortResult,
  AnchorPoint, BrainstormIdea, ChatMessage, SocraticEvaluateResult, SocraticDeepeningResult, SocraticMirrorResult,
  PredictionPrompt, RescueContext, ResourceLink,
  ErrorPatternResult, QuizGenResult,
  ContentTierResult, ConflictDetectResult,
ConceptPrecheckResult,
} from './types';
import { aiClient } from '../http/apiClient';
import {
  httpSummarizeNote, httpGenerateFlashcards, httpTagContent,
  httpOptimizeCard, httpSortInspiration,
} from './remoteContentFeatures';
import {
  httpEvaluateExplanation, httpRecommendDuration,
  httpGenerateFeynmanQuestions, httpEvaluateFeynmanAnswers,
  httpGenerateAnchorPoint, httpPredictQuestion, httpRescue,
  httpAnalyzeErrorPatterns, httpGenerateQuiz,
  httpContentTier, httpConflictDetect,
  httpConceptPrecheck,
} from './remoteLearningFeatures';
import {
  httpSocraticBrainstorm, httpSocraticQuestion,
  httpSocraticEvaluate, httpSocraticDeepening, httpSocraticMirror,
} from './remoteSocraticFeatures';

/**
 * 远程 AI 插件 — 通过 HTTPS 调用 ai-gateway 服务
 *
 * 请求字段做 camelCase → snake_case 转换以匹配后端 Pydantic model；
 * 响应字段从 snake_case 映射回前端 camelCase 类型。
 *
 * @ai-context: 2026-07 拆分——内容加工在 remoteContentFeatures、学习增强在
 * remoteLearningFeatures、苏格拉底域在 remoteSocraticFeatures；本类仅保留
 * AIPlugin 门面与流式 postStream 调用，公共 API 与拆分前一致。
 */
export class RemoteAIPlugin implements AIPlugin {
  /** 保留字段：历史构造签名兼容（超时实际由 aiClient 统一控制） */
  private timeout: number;

  constructor(timeout: number = 60000) {
    this.timeout = timeout;
  }

  // ── 非流式功能（委托域模块） ─────────────────────────

  async summarizeNote(noteContent: string, options?: SummarizeOptions): Promise<SummarizeResult> {
    return httpSummarizeNote(noteContent, options);
  }

  async generateFlashcards(noteContent: string, options?: FlashcardOptions): Promise<FlashcardResult> {
    return httpGenerateFlashcards(noteContent, options);
  }

  async evaluateExplanation(concept: string, explanation: string, options?: EvaluateOptions): Promise<EvaluateResult> {
    return httpEvaluateExplanation(concept, explanation, options);
  }

  async recommendDuration(historyData: DurationHistoryData, options?: DurationOptions): Promise<DurationResult> {
    return httpRecommendDuration(historyData, options);
  }

  async generateFeynmanQuestions(concept: string, explanation: string): Promise<FeynmanQuestionResult> {
    return httpGenerateFeynmanQuestions(concept, explanation);
  }

  async evaluateFeynmanAnswers(concept: string, questions: string[], answers: string[]): Promise<FeynmanAnswerEvalResult> {
    return httpEvaluateFeynmanAnswers(concept, questions, answers);
  }

  async optimizeCard(front: string, back: string): Promise<OptimizeCardResult> {
    return httpOptimizeCard(front, back);
  }

  async tagContent(content: string): Promise<TagContentResult> {
    return httpTagContent(content);
  }

  async sortInspiration(content: string, existingTags?: Record<string, string>): Promise<SortResult> {
    return httpSortInspiration(content, existingTags);
  }

  async generateAnchorPoint(noteId: string, content: string): Promise<{ anchorPoints: AnchorPoint[] }> {
    return httpGenerateAnchorPoint(noteId, content);
  }

  async socraticBrainstorm(topic: string, context?: string): Promise<{ ideas: BrainstormIdea[] }> {
    return httpSocraticBrainstorm(topic, context);
  }

  async socraticQuestion(conversationId: string, topic: string, history: ChatMessage[]): Promise<{ question: string; hints: string[] }> {
    return httpSocraticQuestion(conversationId, topic, history);
  }

  async socraticEvaluate(topic: string, question: string, answer: string, history: ChatMessage[]): Promise<SocraticEvaluateResult> {
    return httpSocraticEvaluate(topic, question, answer, history);
  }

  async socraticDeepening(topic: string, dialogueSummary: string, history: ChatMessage[]): Promise<SocraticDeepeningResult> {
    return httpSocraticDeepening(topic, dialogueSummary, history);
  }

  async socraticMirror(topic: string, question: string): Promise<SocraticMirrorResult> {
    return httpSocraticMirror(topic, question);
  }

  async predictQuestion(noteId: string, content: string): Promise<{ predictions: PredictionPrompt[] }> {
    return httpPredictQuestion(noteId, content);
  }

  async rescue(context: RescueContext): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
    return httpRescue(context);
  }

  async analyzeErrorPatterns(goldenErrors: Array<{ flashcardId: string; correctAnswer: string; userAnswer: string }>): Promise<ErrorPatternResult> {
    return httpAnalyzeErrorPatterns(goldenErrors);
  }

  async generateQuiz(notesText: string): Promise<QuizGenResult> {
    return httpGenerateQuiz(notesText);
  }

  async contentTier(notesText: string): Promise<ContentTierResult> {
    return httpContentTier(notesText);
  }

  async conflictDetect(newNoteText: string, historyText: string): Promise<ConflictDetectResult> {
    return httpConflictDetect(newNoteText, historyText);
  }

  async conceptPrecheck(concept: string, weakHistory?: string): Promise<ConceptPrecheckResult> {
    return httpConceptPrecheck(concept, weakHistory);
  }

  // ── 流式方法实现（SSE，payload 组装 + aiClient.postStream） ─

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

// ─── 向后兼容 re-export ──────────────────────────────────────────────────────

export { normalizeScore } from './remoteLearningFeatures';
