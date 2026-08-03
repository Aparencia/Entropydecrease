/**
 * AI 功能契约类型（每个 AI 功能的 Options / Result）
 *
 * @ai-context: Result 中 model/tokensUsed/latencyMs 为可选遥测字段，由网关
 * 返回时透传；本地 Ollama 路径可能缺失，消费方必须判空。
 * @ai-context: 纯类型文件，无运行时代码。
 */

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
  /** F1 多情境提取：为重要知识点生成表述不同的变体卡片 */
  variants?: boolean;
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
