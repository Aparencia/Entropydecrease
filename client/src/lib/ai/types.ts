/**
 * AI 插件接口 — 定义所有 AI 功能
 * v0.9.0 扩展：锚点生成、苏格拉底头脑风暴/追问、学习预测、救援、草稿生成
 */
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

// === Summarize ===
export interface SummarizeOptions {
  maxLength?: number;
  style?: 'bullet' | 'paragraph' | 'outline';
  language?: string;
}

export interface SummarizeResult {
  summary: string;
  keyPoints?: string[];
  generatedAt: Date;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Flashcards ===
export interface FlashcardOptions {
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  cardType?: 'question_answer' | 'fill_blank' | 'true_false' | 'mixed';
}

export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
  type?: string;
  confidence?: number;
}

export interface FlashcardResult {
  cards: Flashcard[];
  totalExtracted?: number;
  generatedAt: Date;
  model?: string;
  tokensUsed?: number;
}

// === Evaluate (Feynman) ===
export interface EvaluateOptions {
  criteria?: string[];
}

export interface EvaluateDimension {
  name: string;
  score: number;    // 0-10
  feedback: string;
}

export interface EvaluateResult {
  overallScore: number;
  dimensions: EvaluateDimension[];
  suggestions: string[];
  strengths: string[];
  weaknesses: string[];
  encouragement?: string;
  generatedAt: Date;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Feynman Question (AI 反问) ===
export interface FeynmanQuestionItem {
  question: string;
  focus: string;
}

export interface FeynmanQuestionResult {
  questions: FeynmanQuestionItem[];
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Feynman Answer Evaluation (理解度评估) ===
export interface FeynmanAnswerEvalResult {
  understandingScore: number;  // 0-10
  feedback: string;
  strongPoints: string[];
  weakPoints: string[];
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Duration Recommendation ===
export interface DurationHistoryData {
  sessions: Array<{
    duration: number;     // minutes
    completed: boolean;
    date: string;
    subject?: string;
  }>;
  averageFocusTime?: number;
  preferredDuration?: number;
}

export interface DurationOptions {
  minDuration?: number;
  maxDuration?: number;
}

export interface DurationResult {
  recommendedDuration: number; // minutes
  breakMinutes?: number;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  source?: 'ai' | 'local_rule' | string;
  isLocalFallback: boolean;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Vision Extract ===
export interface VisionExtractResult {
  text: string;
  formulas: string[];
  diagrams: string[];
  keyPoints: string[];
  confidence: number;
}

// === Tag Content ===
export interface TagContentResult {
  contentNature: 'concept' | 'question' | 'inspiration' | 'todo';
  cognitiveDepth: 'shallow' | 'understanding' | 'application';
  subject: string;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Sort Inspiration ===
export type SortTargetType = 'feynman' | 'flashcard' | 'note' | 'todo' | 'action_item';

export interface SortSuggestion {
  /** AI 推荐的归类方向 */
  category: SortTargetType;
  reason: string;
  confidence: number;
  /** AI 推荐的后续操作描述 */
  suggestedAction?: string;
}

export interface SortResult {
  suggestions: SortSuggestion[];
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Optimize Card ===
export interface OptimizeCardResult {
  suggestedFront: string;
  suggestedBack: string;
  improvements: string[];
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === v0.9.0 辅助类型 ===

/** 知识锚点：笔记中的核心概念及其关联 */
export interface AnchorPoint {
  /** 锚点概念名称 */
  concept: string;
  /** 锚点在原文中的位置（字符偏移） */
  position?: { start: number; end: number };
  /** 重要程度 0-1 */
  importance: number;
  /** 关联的其他锚点概念 */
  relatedConcepts?: string[];
  /** AI 生成的简短解释 */
  explanation?: string;
}

/** 头脑风暴创意条目 */
export interface BrainstormIdea {
  /** 创意标题 */
  title: string;
  /** 创意描述 */
  description: string;
  /** 分类标签 */
  category?: string;
  /** 可行性评估 0-1 */
  feasibility?: number;
  /** 激发来源 */
  source?: string;
}

/** 对话消息（用于苏格拉底追问上下文） */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/** 学习预测条目：AI 基于笔记预测用户可能被问到的问题 */
export interface PredictionPrompt {
  /** 预测的问题 */
  question: string;
  /** AI 给出的参考答案 */
  expectedAnswer: string;
  /** 难度评估 1-5 */
  difficulty?: number;
  /** 关联的知识点 */
  relatedConcepts?: string[];
}

/** 学习救援上下文：用户卡住时的环境信息 */
export interface RescueContext {
  /** 当前学习主题 */
  topic: string;
  /** 用户卡住的具体描述 */
  stuckPoint?: string;
  /** 相关笔记内容片段 */
  relatedContent?: string;
  /** 用户已尝试过的方案 */
  attempts?: string[];
  /** 当前模式（闪卡复习 / 费曼学习 / 笔记整理） */
  mode?: 'flashcard' | 'feynman' | 'note' | 'general';
}

/** 学习资源链接 */
export interface ResourceLink {
  /** 资源标题 */
  title: string;
  /** 资源 URL */
  url: string;
  /** 资源描述 */
  description?: string;
  /** 资源类型 */
  type?: 'video' | 'article' | 'exercise' | 'documentation' | 'other';
}

/** AI 生成的草稿内容（灵感转化产物） */
export interface DraftContent {
  /** 草稿标题 */
  title: string;
  /** 草稿正文（TipTap JSON 或纯文本） */
  content: string;
  /** 内容格式 */
  format: 'tiptap_json' | 'markdown' | 'plain';
  /** 自动生成的标签 */
  tags?: string[];
  /** 转化说明 */
  rationale?: string;
}

/** FEAT-022: 苏格拉底回答评估结果 */
export interface SocraticEvaluateResult {
  /** 四维度评分 */
  dimensions: {
    accuracy: number;     // 准确度 0-10
    completeness: number; // 完整度 0-10
    logic: number;        // 逻辑清晰度 0-10
    expression: number;   // 表达通俗度 0-10
  };
  /** 整体反馋 */
  feedback: string;
  /** 鼓励语 */
  encouragement: string;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

/** FEAT-022: 苏格拉底深化角度结果 */
export interface SocraticDeepeningResult {
  angles: Array<{
    key: string;        // 角度标识符
    label: string;      // 角度标签
    question: string;   // 引导问题
  }>;
  status?: string;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// === Error types ===
export type AIErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'service_unavailable'
  | 'content_filter'
  | 'invalid_response'
  | 'invalid_input'
  | 'content_too_short'
  | 'no_api_key'
  | 'offline'
  | 'auth_error'
  | 'cors_error';

export class AIError extends Error {
  constructor(
    message: string,
    public code: AIErrorCode,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIError';
  }
}
