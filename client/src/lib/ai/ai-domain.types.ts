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

/** F4: 错误模式条目——type 三值与网关 error_pattern_v1.txt 契约一致 */
export interface ErrorPatternItem {
  /** 错误类型：概念盲区 / 概念混淆 / 过度自信 */
  type: 'concept_blind' | 'concept_confusion' | 'overconfidence';
  /** 关联关键词（3 个） */
  keywords: string[];
  /** 错误原因简述 */
  explanation: string;
  /** 具体改进建议 */
  suggestion: string;
}

/** F4: 错误模式分析结果 */
export interface ErrorPatternResult {
  patterns: ErrorPatternItem[];
  /** 高频错误卡片及其出现次数 */
  topOffenders: Array<{ flashcardId: string; count: number }>;
  /** 整体趋势总结（≤ 50 字） */
  summary: string;
  model?: string;
  tokensUsed?: number;
}

/** N1: 迷你测试题型 */
export type QuizQuestionType = 'fill_blank' | 'choice' | 'short_answer';

/** N1: 单道测试题 */
export interface QuizQuestion {
  type: QuizQuestionType;
  /** 题干（填空题用 ____ 表示空格） */
  question: string;
  /** 选择题选项，其他题型为空数组 */
  options: string[];
  /** 正确答案（choice 为选项字母） */
  answer: string;
  /** 一句话解析 */
  explanation: string;
  /** 考察的概念关键词（错题定位用） */
  concept: string;
}

/** N1: 迷你测试生成结果 */
export interface QuizGenResult {
  questions: QuizQuestion[];
  model?: string;
  tokensUsed?: number;
}

/** N5: 内容分层条目 */
export interface ContentTierItem {
  /** 原文片段摘录 */
  text: string;
  /** core 层专用：为何是核心 */
  reason?: string;
}

/** N5: 内容三层分层结果（策略性遗忘标记） */
export interface ContentTierResult {
  core: ContentTierItem[];
  support: ContentTierItem[];
  detail: ContentTierItem[];
  model?: string;
  tokensUsed?: number;
}

/** N6: 单条概念冲突 */
export interface ConceptConflict {
  /** 历史理解中的矛盾表述 */
  oldClaim: string;
  /** 新笔记中的矛盾表述 */
  newClaim: string;
  /** 冲突涉及的概念主题 */
  topic: string;
  /** 先破后立的修正建议 */
  suggestion: string;
}

/** N6: 概念冲突检测结果 */
export interface ConflictDetectResult {
  conflicts: ConceptConflict[];
  model?: string;
  tokensUsed?: number;
}

// ════════════════════════════════════════════════════════════════
// Phase 2 新 AI 功能类型
// ════════════════════════════════════════════════════════════════

/** 苏格拉底反问镜（mirror 模式）结果 */
export interface SocraticMirrorResult {
  /** 镜像反问：将用户问题以另一种视角反弹回去 */
  mirrorQuestion: string;
  /** 反思提示 */
  reflectionHint: string;
  /** 视角切换建议 */
  perspectiveShift?: string;
  status?: string;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

/** 辩论类型 */
export type DebateType = 'academic' | 'policy' | 'value' | 'speculative';

/** 单轮辩论 */
export interface DebateRound {
  roundNumber: number;
  /** AI 论点 */
  aiArgument: string;
  /** 用户反驳 */
  userCounter: string;
  /** AI 对用户反驳的回应 */
  aiRebuttal?: string;
  /** 本轮得分（AI 评估） */
  score?: number;
}

/** 辩论结果 */
export interface DebateResult {
  rounds: DebateRound[];
  topic: string;
  debateType: DebateType;
  /** 综合评分 */
  totalScore: number;
  /** 评分说明 */
  scoringBreakdown: string;
  status?: string;
}

/** 反直觉事实 */
export interface CounterintuitiveFact {
  fact: string;
  explanation: string;
  source?: string;
  /** 相关领域 */
  domain?: string;
  /** 反直觉程度 1-10 */
  surpriseLevel?: number;
}

/** 概念拟人化 - 关系戏剧类型 */
export type RelationshipType = 'mentor' | 'twin' | 'rival' | 'parent_child' | 'ally';

/** 概念拟人化 - 关系戏剧 */
export interface RelationshipDrama {
  targetConcept: string;
  relationship: RelationshipType;
  story: string;
}

/** 概念拟人化数据 */
export interface PersonaData {
  concept: string;
  name: string;
  personality: string;
  backstory: string;
  catchphrase: string;
  relationships: RelationshipDrama[];
  appearance?: string;
}

/** 记忆术类型 */
export type MnemonicType = 'phonetic' | 'story' | 'spatial';

/** 记忆术数据 */
export interface MnemonicData {
  type: MnemonicType;
  text: string;
  /** 助记提示 */
  hint?: string;
  /** 关联图片描述 */
  visualClue?: string;
  /** 效果评分 1-10 */
  effectivenessScore?: number;
}

/** 播客角色 */
export type SpeakerRole = 'host' | 'guest';

/** 播客片段 */
export interface PodcastSegment {
  speaker: SpeakerRole;
  text: string;
  duration?: number;
}

/** 播客数据 */
export interface PodcastData {
  title: string;
  segments: PodcastSegment[];
  /** 总时长（秒） */
  totalDuration?: number;
  /** 嘉宾介绍 */
  guestIntro?: string;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

/** 学习教练周计划 - 单日任务 */
export interface CoachDayTask {
  day: string;
  tasks: string[];
  focus: string;
  estimatedMinutes: number;
}

/** 学习教练周计划 */
export interface WeeklyCoachPlan {
  weekLabel: string;
  days: CoachDayTask[];
  weeklyGoal: string;
  encouragement: string;
  status?: string;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

/** 信息图部分 */
export interface InfographicSection {
  title: string;
  points: string[];
  icon?: string;
}

/** 信息图关系连接 */
export interface InfographicRelation {
  from: string;
  to: string;
  label: string;
}

/** 信息图数据 */
export interface InfographicData {
  title: string;
  sections: InfographicSection[];
  relations: InfographicRelation[];
  theme: 'academic' | 'tech' | 'warm';
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

/** E1: 单个概念预检探测问题 */
export interface PrecheckQuestion {
  /** 探测性问题 */
  question: string;
  /** 想暴露的错误认知或误解 */
  intent: string;
}

/** E1: 概念预检结果（错误概念先破后立） */
export interface ConceptPrecheckResult {
  questions: PrecheckQuestion[];
  model?: string;
  tokensUsed?: number;
}
