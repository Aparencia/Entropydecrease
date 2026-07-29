/**
 * 苏格拉底式学习模式 — 类型定义
 * FEAT-022
 *
 * @ai-context: feynman 功能模块：types。
 */

/** 苏格拉底学习会话 */
export interface SocraticSession {
  id: string;
  topic: string;
  phase: 'brainstorm' | 'dialogue' | 'deepening' | 'summary';
  ideas: BrainstormState;
  rounds: SocraticRound[];
  maxRounds: number;
  createdAt: string;
  completedAt?: string;
}

/** 头脑风暴状态 */
export interface BrainstormState {
  selected: string[];  // 选中的 idea title
  ideas: Array<{ title: string; description: string; category?: string }>;
}

/** 单轮苏格拉底追问 */
export interface SocraticRound {
  roundNumber: number;
  aiQuestion: string;
  userAnswer: string;
  aiFeedback: string;
  hints: string[];
  /** 四维度评分（可选，回答后生成） */
  dimensions?: DimensionScore;
}

/** 四维度评分 */
export interface DimensionScore {
  accuracy: number;     // 准确度 0-10
  completeness: number; // 完整度 0-10
  logic: number;        // 逻辑清晰度 0-10
  expression: number;   // 表达通俗度 0-10
}
