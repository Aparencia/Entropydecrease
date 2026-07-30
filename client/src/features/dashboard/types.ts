/**
 * @ai-context: dashboard 功能模块：types。
 */
import type { MasteryMark } from '@/types/ritual';

/* ── 学习启动仪式（FEAT-017）类型定义 ── */

/** 仪式三步骤 */
export type RitualStep = 'review' | 'goal' | 'breathing';

/** 微目标 */
export interface MicroGoal {
  text: string;
  tags: string[];
}

/** Box Breathing 四阶段 */
export type BreathingPhase = 'inhale' | 'hold1' | 'exhale' | 'hold2';

/** 呼吸阶段计算结果 */
export interface BreathingState {
  phase: BreathingPhase;
  /** 当前阶段进度 0-1 */
  phaseProgress: number;
  /** 已完成循环次数 */
  cycleCount: number;
  /** 中文阶段标签 */
  phaseLabel: string;
}

/** 仪式设置（持久化到 AppSettings） */
export interface RitualSettings {
  enabled: boolean;
  /** ISO 日期字符串，上次完成仪式的日期 YYYY-MM-DD */
  lastRitualDate: string;
  /** 今天不再显示 */
  skipToday: boolean;
  /** 呼吸引导音开关（v0.26.0 A2.3，缺省视为关闭） */
  soundOn?: boolean;
  /** 仪式强度偏好（v0.26.0 B1.1，缺省 standard） */
  intensity?: RitualIntensity;
  /** 自适应编排开关（v0.26.0 B1.1，缺省开启） */
  autoAdapt?: boolean;
}

/** 仪式强度档位（RIT-04：轻/标准/深度） */
export type RitualIntensity = 'light' | 'standard' | 'deep';

/** A/B 分组（RIT-03：开场顺序实验） */
export type RitualAbGroup = 'A' | 'B';

/** 编排计划：步骤序列 + 埋点变体标识 */
export interface RitualPlan {
  steps: RitualStep[];
  planVariant: string;
}

/** 编排上下文（ritualPlanner 输入） */
export interface RitualPlanContext {
  /** 是否有上次学习会话（无则裁剪回顾步骤） */
  hasLastSession: boolean;
  /** 含今天在内的连续天数 */
  streakDays: number;
  /** 当前小时 0-23（≥22 触发放松版） */
  hour: number;
  intensity: RitualIntensity;
  autoAdapt: boolean;
  abGroup: RitualAbGroup;
}

/** 上次学习会话数据 */
export interface LastSessionData {
  noteTitle: string;
  /** 笔记末尾 200 字摘录 */
  noteExcerpt: string;
  noteId: string;
  /** ISO 时间戳 */
  studiedAt: string;
}

/** 掌握程度标记 / 仪式记录 —— 统一定义在 @/types/ritual，此处透传保持既有导入路径 */
export type { MasteryMark, RitualRecord } from '@/types/ritual';

/* ── v0.26.0 Alpha.1 新增 ── */

/** 快选标签（目标接力 + 最近笔记标题） */
export interface QuickTag {
  text: string;
  /** 是否为"昨天未完成的目标"接力项 */
  relay: boolean;
}

/** 仪式完成时回传给页面层的结果 */
export interface RitualOutcome {
  goal?: MicroGoal;
  masteryMark?: MasteryMark;
  /** 仪式总时长（毫秒） */
  durationMs: number;
  /** 编排变体埋点（A1 固定 standard） */
  planVariant: string;
}

/** 跳过范围：仅本次 / 今天不再显示 / 永久关闭 */
export type RitualSkipScope = 'once' | 'today' | 'forever';

/** 记忆回响时间线单项（RIT-04/B1.4，优先锚点数据，回退笔记摘要） */
export interface MemoryEchoItem {
  title: string;
  /** 摘要片段（可空） */
  excerpt?: string;
  /** 相对时间标签，如 "3 天前" */
  dateLabel: string;
}

/** AI 回顾小问（RIT-08/B1.2，降级时为 null） */
export interface RecallQuestion {
  question: string;
  reference: string;
}
