/**
 * AI 领域辅助类型（v0.9.0 学习增强功能的数据结构）
 *
 * @ai-context: 锚点/头脑风暴/预测/救援/草稿/苏格拉底评估等功能的载体类型。
 * SocraticEvaluateResult.dimensions 四维度键名（accuracy/completeness/
 * logic/expression）与 AI 网关 socratic_evaluate_chain 的输出契约一致，
 * 改名需两端同步。
 * @ai-context: 纯类型文件，无运行时代码。
 */

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
  /** 整体反馈 */
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
