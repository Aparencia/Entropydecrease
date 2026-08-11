import type {
  AIPlugin,
  SummarizeOptions, SummarizeResult,
  FlashcardOptions, FlashcardResult,
  EvaluateOptions, EvaluateResult,
  DurationOptions, DurationHistoryData, DurationResult,
  OptimizeCardResult, FeynmanQuestionResult, FeynmanAnswerEvalResult,
  TagContentResult, SortResult,
  AnchorPoint, BrainstormIdea, ChatMessage,
  SocraticEvaluateResult, SocraticDeepeningResult, SocraticMirrorResult,
  PredictionPrompt, RescueContext, ResourceLink,
  ErrorPatternResult, QuizGenResult,
  ContentTierResult, ConflictDetectResult,
  ConceptPrecheckResult,
} from './types';
import {
  ipcSummarizeNote, ipcGenerateFlashcards, ipcTagContent,
  ipcOptimizeCard, ipcSortInspiration,
} from './electronContentFeatures';
import {
  ipcEvaluateExplanation, ipcRecommendDuration,
  ipcGenerateFeynmanQuestions, ipcEvaluateFeynmanAnswers,
  ipcGenerateAnchorPoint, ipcPredictQuestion, ipcRescue,
  ipcAnalyzeErrorPatterns, ipcGenerateQuiz,
  ipcContentTier, ipcConflictDetect,
  ipcConceptPrecheck,
} from './electronLearningFeatures';
import {
  ipcSocraticBrainstorm, ipcSocraticQuestion,
  ipcSocraticEvaluate, ipcSocraticDeepening, ipcSocraticMirror,
} from './electronSocraticFeatures';
import { streamIpc } from './electronStreamBridge';

/**
 * Electron AI 插件 — 通过 Electron IPC 通道调用 ai-gateway
 *
 * 使用 preload.ts 暴露的 electronAPI.invoke 与主进程通信。
 * 主进程通过 Node.js fetch 代理请求到 ai-gateway 服务。
 *
 * @ai-context: 2026-07 拆分——内容加工功能在 electronContentFeatures、
 * 学习增强功能在 electronLearningFeatures、流式桥在 electronStreamBridge；
 * 本类仅保留 AIPlugin 门面与 authToken 状态，公共 API 与拆分前一致。
 * @ai-context: authToken 由 aiPluginProvider 在每次获取实例时刷新注入，
 * 本类不自行获取 token。
 */
export class ElectronAIPlugin implements AIPlugin {
  private authToken: string | null = null;

  /**
   * 设置认证 token（每次 AI 调用前可更新）
   */
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  // ── 非流式功能（委托域模块） ─────────────────────────

  async summarizeNote(noteContent: string, options?: SummarizeOptions): Promise<SummarizeResult> {
    return ipcSummarizeNote(this.authToken, noteContent, options);
  }

  async generateFlashcards(noteContent: string, options?: FlashcardOptions): Promise<FlashcardResult> {
    return ipcGenerateFlashcards(this.authToken, noteContent, options);
  }

  async evaluateExplanation(concept: string, explanation: string, options?: EvaluateOptions): Promise<EvaluateResult> {
    return ipcEvaluateExplanation(this.authToken, concept, explanation, options);
  }

  async recommendDuration(historyData: DurationHistoryData, options?: DurationOptions): Promise<DurationResult> {
    return ipcRecommendDuration(this.authToken, historyData, options);
  }

  async optimizeCard(front: string, back: string): Promise<OptimizeCardResult> {
    return ipcOptimizeCard(this.authToken, front, back);
  }

  async generateFeynmanQuestions(concept: string, explanation: string): Promise<FeynmanQuestionResult> {
    return ipcGenerateFeynmanQuestions(this.authToken, concept, explanation);
  }

  async evaluateFeynmanAnswers(concept: string, questions: string[], answers: string[]): Promise<FeynmanAnswerEvalResult> {
    return ipcEvaluateFeynmanAnswers(this.authToken, concept, questions, answers);
  }

  async tagContent(content: string): Promise<TagContentResult> {
    return ipcTagContent(this.authToken, content);
  }

  async sortInspiration(content: string, existingTags?: Record<string, string>): Promise<SortResult> {
    return ipcSortInspiration(this.authToken, content, existingTags);
  }

  async generateAnchorPoint(noteId: string, content: string): Promise<{ anchorPoints: AnchorPoint[] }> {
    return ipcGenerateAnchorPoint(this.authToken, noteId, content);
  }

  async socraticBrainstorm(topic: string, context?: string): Promise<{ ideas: BrainstormIdea[] }> {
    return ipcSocraticBrainstorm(this.authToken, topic, context);
  }

  async socraticQuestion(conversationId: string, topic: string, history: ChatMessage[]): Promise<{ question: string; hints: string[] }> {
    return ipcSocraticQuestion(this.authToken, conversationId, topic, history);
  }

  async socraticEvaluate(topic: string, question: string, answer: string, history: ChatMessage[]): Promise<SocraticEvaluateResult> {
    return ipcSocraticEvaluate(this.authToken, topic, question, answer, history);
  }

  async socraticDeepening(topic: string, dialogueSummary: string, history: ChatMessage[]): Promise<SocraticDeepeningResult> {
    return ipcSocraticDeepening(this.authToken, topic, dialogueSummary, history);
  }

  async socraticMirror(topic: string, question: string): Promise<SocraticMirrorResult> {
    return ipcSocraticMirror(this.authToken, topic, question);
  }

  async predictQuestion(noteId: string, content: string): Promise<{ predictions: PredictionPrompt[] }> {
    return ipcPredictQuestion(this.authToken, noteId, content);
  }

  async rescue(context: RescueContext): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
    return ipcRescue(this.authToken, context);
  }

  async analyzeErrorPatterns(goldenErrors: Array<{ flashcardId: string; correctAnswer: string; userAnswer: string }>): Promise<ErrorPatternResult> {
    return ipcAnalyzeErrorPatterns(this.authToken, goldenErrors);
  }

  async generateQuiz(notesText: string): Promise<QuizGenResult> {
    return ipcGenerateQuiz(this.authToken, notesText);
  }

  async contentTier(notesText: string): Promise<ContentTierResult> {
    return ipcContentTier(this.authToken, notesText);
  }

  async conflictDetect(newNoteText: string, historyText: string): Promise<ConflictDetectResult> {
    return ipcConflictDetect(this.authToken, newNoteText, historyText);
  }

  async conceptPrecheck(concept: string, weakHistory?: string): Promise<ConceptPrecheckResult> {
    return ipcConceptPrecheck(this.authToken, concept, weakHistory);
  }

  // ── 流式方法实现（payload 组装 + 委托流式桥） ─────────

  async *summarizeNoteStream(noteContent: string, options?: SummarizeOptions): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/summarize/stream', {
      text: noteContent,
      params: { max_length: options?.maxLength, style: options?.style, language: options?.language },
    });
  }

  async *generateFlashcardsStream(noteContent: string, options?: FlashcardOptions): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/generate-cards/stream', {
      text: noteContent,
      params: { count: options?.count, difficulty: options?.difficulty, card_type: options?.cardType },
    });
  }

  async *evaluateExplanationStream(concept: string, explanation: string, _options?: EvaluateOptions): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/evaluate-explanation/stream', {
      text: explanation,
      text2: concept,
    });
  }

  async *recommendDurationStream(historyData: DurationHistoryData, _options?: DurationOptions): AsyncIterable<string> {
    const history = (historyData.sessions || []).map(s => ({
      duration_minutes: s.duration, completed: s.completed, subject: s.subject || '', timestamp: s.date,
    }));
    yield* streamIpc(this.authToken, '/api/v1/ai/recommend-duration/stream', {
      text: JSON.stringify({ history }),
    });
  }

  async *tagContentStream(content: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/tag-content/stream', { text: content });
  }

  async *optimizeCardStream(front: string, back: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/optimize-card/stream', { text: front, text2: back });
  }

  async *sortInspirationStream(content: string, existingTags?: Record<string, string>): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/sort-inspiration/stream', {
      text: content,
      params: { existing_tags: existingTags },
    });
  }

  async *generateFeynmanQuestionsStream(concept: string, explanation: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/feynman-question/stream', {
      text: explanation,
      text2: concept,
    });
  }

  async *evaluateFeynmanAnswersStream(concept: string, questions: string[], answers: string[]): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/feynman-evaluate-answers/stream', {
      text: JSON.stringify({ concept, questions, answers }),
    });
  }

  async *generateAnchorPointStream(noteId: string, content: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/anchor-point/stream', { text: content, params: { note_id: noteId } });
  }

  async *socraticBrainstormStream(topic: string, context?: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/socratic/stream', {
      text: topic,
      params: { context: context || '' },
    });
  }

  async *socraticQuestionStream(conversationId: string, topic: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/socratic/stream', {
      text: topic,
      params: { conversation_id: conversationId, history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *socraticEvaluateStream(topic: string, question: string, answer: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/socratic/evaluate/stream', {
      text: answer,
      text2: topic,
      params: { question, history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *socraticDeepeningStream(topic: string, dialogueSummary: string, history: ChatMessage[]): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/socratic/deepening/stream', {
      text: topic,
      text2: dialogueSummary,
      params: { history: history.map(h => ({ role: h.role, content: h.content })) },
    });
  }

  async *predictQuestionStream(noteId: string, content: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/predict/stream', { text: content, params: { note_id: noteId } });
  }

  async *rescueStream(context: RescueContext): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/rescue/stream', {
      text: context.relatedContent || context.topic,
      params: { stuck_description: context.stuckPoint || '', mode: context.mode || 'general' },
    });
  }

  async *generateDraftStream(inspirationId: string, type: 'flashcard' | 'feynman' | 'note', content: string): AsyncIterable<string> {
    yield* streamIpc(this.authToken, '/api/v1/ai/inspiration-draft/stream', {
      text: content,
      params: { inspiration_id: inspirationId, type },
    });
  }
}
