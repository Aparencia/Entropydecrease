/**
 * AI 插件接口 — 定义所有 AI 功能（+ 类型总出口兼容层）
 *
 * @ai-context: 2026-07 拆分——功能契约类型在 ai-feature.types，领域辅助
 * 类型在 ai-domain.types，错误类在 ai-errors。本文件保留 AIPlugin 接口
 * 定义并 re-export 全部类型，全项目 `@/lib/ai/types` 旧导入路径零改动。
 * @ai-context: AIPlugin 可选方法（?）表示插件可不实现该能力，调用方
 * （AIPluginLoader/routeDispatcher）必须先判存在再调用；Stream 后缀
 * 方法为 SSE 流式版本，与同名非流式方法一一对应。
 */
import type {
  SummarizeOptions, SummarizeResult,
  FlashcardOptions, FlashcardResult,
  EvaluateOptions, EvaluateResult,
  DurationHistoryData, DurationOptions, DurationResult,
  VisionExtractResult, TagContentResult, OptimizeCardResult, SortResult,
  FeynmanQuestionResult, FeynmanAnswerEvalResult,
} from './ai-feature.types';
import type {
  AnchorPoint, BrainstormIdea, ChatMessage, PredictionPrompt,
  RescueContext, ResourceLink, DraftContent,
  SocraticEvaluateResult, SocraticDeepeningResult,
} from './ai-domain.types';

export interface AIPlugin {
  summarizeNote(noteContent: string, options?: SummarizeOptions): Promise<SummarizeResult>;
  generateFlashcards(noteContent: string, options?: FlashcardOptions): Promise<FlashcardResult>;
  evaluateExplanation(concept: string, explanation: string, options?: EvaluateOptions): Promise<EvaluateResult>;
  recommendDuration(historyData: DurationHistoryData, options?: DurationOptions): Promise<DurationResult>;
  extractScreenContent?(imageBase64: string, language?: string): Promise<VisionExtractResult>;
  tagContent?(content: string): Promise<TagContentResult>;
  optimizeCard?(front: string, back: string): Promise<OptimizeCardResult>;
  sortInspiration?(content: string, existingTags?: Record<string, string>): Promise<SortResult>;
  generateFeynmanQuestions(concept: string, explanation: string): Promise<FeynmanQuestionResult>;
  evaluateFeynmanAnswers(concept: string, questions: string[], answers: string[]): Promise<FeynmanAnswerEvalResult>;
  /** v0.9.0: 从笔记内容中提取知识锚点 */
  generateAnchorPoint?(noteId: string, content: string): Promise<{ anchorPoints: AnchorPoint[] }>;
  /** v0.9.0: 苏格拉底式头脑风暴，激发创意与联想 */
  socraticBrainstorm?(topic: string, context?: string): Promise<{ ideas: BrainstormIdea[] }>;
  /** v0.9.0: 苏格拉底式追问，引导深度思考 */
  socraticQuestion?(conversationId: string, topic: string, history: ChatMessage[]): Promise<{ question: string; hints: string[] }>;
  /** FEAT-022: 苏格拉底回答评估，返回四维度评分 */
  socraticEvaluate?(topic: string, question: string, answer: string, history: ChatMessage[]): Promise<SocraticEvaluateResult>;
  /** FEAT-022: 苏格拉底深化角度生成 */
  socraticDeepening?(topic: string, dialogueSummary: string, history: ChatMessage[]): Promise<SocraticDeepeningResult>;
  /** v0.9.0: 基于笔记内容预测可能的问题 */
  predictQuestion?(noteId: string, content: string): Promise<{ predictions: PredictionPrompt[] }>;
  /** v0.9.0: 学习救援，当用户卡住时提供提示与资源 */
  rescue?(context: RescueContext): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }>;
  /** v0.9.0: 将灵感草稿转化为正式内容 */
  generateDraft?(inspirationId: string, type: 'flashcard' | 'feynman' | 'note', content: string): Promise<{ draft: DraftContent }>;

  // ── 流式版本（可选，SSE） ────────────────────────────────
  summarizeNoteStream?(noteContent: string, options?: SummarizeOptions): AsyncIterable<string>;
  generateFlashcardsStream?(noteContent: string, options?: FlashcardOptions): AsyncIterable<string>;
  evaluateExplanationStream?(concept: string, explanation: string, options?: EvaluateOptions): AsyncIterable<string>;
  recommendDurationStream?(historyData: DurationHistoryData, options?: DurationOptions): AsyncIterable<string>;
  extractScreenContentStream?(imageBase64: string, language?: string): AsyncIterable<string>;
  tagContentStream?(content: string): AsyncIterable<string>;
  optimizeCardStream?(front: string, back: string): AsyncIterable<string>;
  sortInspirationStream?(content: string, existingTags?: Record<string, string>): AsyncIterable<string>;
  generateFeynmanQuestionsStream?(concept: string, explanation: string): AsyncIterable<string>;
  evaluateFeynmanAnswersStream?(concept: string, questions: string[], answers: string[]): AsyncIterable<string>;
  generateAnchorPointStream?(noteId: string, content: string): AsyncIterable<string>;
  socraticBrainstormStream?(topic: string, context?: string): AsyncIterable<string>;
  socraticQuestionStream?(conversationId: string, topic: string, history: ChatMessage[]): AsyncIterable<string>;
  socraticEvaluateStream?(topic: string, question: string, answer: string, history: ChatMessage[]): AsyncIterable<string>;
  socraticDeepeningStream?(topic: string, dialogueSummary: string, history: ChatMessage[]): AsyncIterable<string>;
  predictQuestionStream?(noteId: string, content: string): AsyncIterable<string>;
  rescueStream?(context: RescueContext): AsyncIterable<string>;
  generateDraftStream?(inspirationId: string, type: 'flashcard' | 'feynman' | 'note', content: string): AsyncIterable<string>;
}

// ─── 向后兼容 re-export（旧导入路径 '@/lib/ai/types' 保持有效） ──────────────

export type {
  SummarizeOptions, SummarizeResult,
  FlashcardOptions, Flashcard, FlashcardResult,
  EvaluateOptions, EvaluateDimension, EvaluateResult,
  FeynmanQuestionItem, FeynmanQuestionResult, FeynmanAnswerEvalResult,
  DurationHistoryData, DurationOptions, DurationResult,
  VisionExtractResult, TagContentResult,
  SortTargetType, SortSuggestion, SortResult, OptimizeCardResult,
} from './ai-feature.types';

export type {
  AnchorPoint, BrainstormIdea, ChatMessage, PredictionPrompt,
  RescueContext, ResourceLink, DraftContent,
  SocraticEvaluateResult, SocraticDeepeningResult,
} from './ai-domain.types';

export { AIError } from './ai-errors';
export type { AIErrorCode } from './ai-errors';
