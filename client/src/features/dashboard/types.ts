/**
 * @ai-context: dashboard 功能模块：types。
 */
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

/** 掌握程度标记 */
export type MasteryMark = 'mastered' | 'fuzzy' | 'unmastered';
