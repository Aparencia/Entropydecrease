/**
 * 留存机制系统类型定义
 * Retention mechanism system type definitions
 *
 * @ai-context: 留存优化四大机制（即时反馈/可变奖励/身份认同/损失规避）的
 * 共享类型层。所有 retention 子模块从此处导入类型。
 * @ai-context: Shared type layer for the four retention mechanisms
 * (instant feedback / variable rewards / identity / loss aversion).
 */

// ─── 深海发现（可变奖励） / Deep Sea Discoveries ───────────────────

/** 发现稀有度等级 / Discovery rarity tiers */
export type DiscoveryRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** 深海发现记录 / A single deep-sea discovery record */
export interface DeepSeaDiscovery {
  id: string;
  /** 发现物类型标识 / Creature/item type key */
  type: string;
  rarity: DiscoveryRarity;
  /** 发现时的累计深度（米） / Cumulative depth at discovery (meters) */
  depth: number;
  discoveredAt: Date;
  /** 触发来源会话类型 / Source session type that triggered this */
  sourceType: 'pomodoro' | 'flashcard' | 'feynman';
}

/** 发现物定义（静态配置） / Discovery definition (static config) */
export interface DiscoveryDef {
  type: string;
  name: string;
  rarity: DiscoveryRarity;
  description: string;
  /** SVG 路径或程序化形状标识 / SVG path or procedural shape key */
  shapeKey: string;
}

// ─── 珊瑚生态（身份认同） / Coral Ecosystem ────────────────────────

/** 珊瑚健康状态 / Coral health status */
export type CoralHealth = 'healthy' | 'bleached';

/** 珊瑚种类（由学习行为决定） / Coral type (determined by learning action) */
export type CoralType = 'branching' | 'brain' | 'fan' | 'tube';

/** 珊瑚记录 / A single coral record */
export interface CoralRecord {
  id: string;
  type: CoralType;
  health: CoralHealth;
  plantedAt: Date;
  /** 来源会话 ID / Source session ID */
  sourceSession: string;
  /** 种植深度（米） / Planting depth (meters) */
  depth: number;
  /** 关联的发现物（可选） / Associated discovery (optional) */
  discoveryId?: string;
}

// ─── 防断裂 Streak / Anti-break Streak ─────────────────────────────

/** Streak 状态记录 / Streak state record */
export interface StreakState {
  id: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  /** 洋流休息日偏好（0=周日, 1=周一...6=周六） / Rest day preference */
  restDayPreference: number;
  /** 断裂后保留百分比 / Retained percent after break */
  retainedPercent: number;
}

// ─── 学习画像 / Learning Profile ───────────────────────────────────

/** 身份标签 / Identity tag */
export interface IdentityTag {
  key: string;
  title: string;
  description: string;
  /** 解锁阈值描述 / Unlock threshold description */
  threshold: string;
  unlocked: boolean;
}

/** 规则引擎生成的洞察 / Rule-engine generated insight */
export interface ProfileInsight {
  id: string;
  category: 'time' | 'efficiency' | 'consistency' | 'breadth';
  text: string;
  /** 数据支撑值 / Supporting data value */
  value?: number;
}

// ─── 留存设置 / Retention Settings ─────────────────────────────────

/** 留存机制全局开关 / Global retention feature toggles */
export interface RetentionSettings {
  /** 总开关：关闭所有养成反馈 / Master switch: disable all nurture feedback */
  enabled: boolean;
  /** 深潜完成庆祝 / Deep dive completion celebration */
  completionCelebration: boolean;
  /** 闪卡记忆强度微动画 / Flashcard memory strength pulse */
  memoryStrengthPulse: boolean;
  /** 费曼完成庆祝 / Feynman completion celebration */
  feynmanCelebration: boolean;
  /** 深海发现系统 / Deep sea discovery system */
  discoveries: boolean;
  /** 珊瑚生态养成 / Coral ecosystem nurturing */
  coralEcosystem: boolean;
  /** 防断裂 Streak 显示 / Streak display */
  streakDisplay: boolean;
  /** 即将断裂预警通知（默认关闭） / Break warning notification (default off) */
  breakWarning: boolean;
  /** 社交证据显示 / Social proof display */
  socialProof: boolean;
}

/** 默认留存设置（所有通知默认关闭） / Default retention settings */
export const DEFAULT_RETENTION_SETTINGS: RetentionSettings = {
  enabled: true,
  completionCelebration: true,
  memoryStrengthPulse: true,
  feynmanCelebration: true,
  discoveries: true,
  coralEcosystem: true,
  streakDisplay: true,
  breakWarning: false,
  socialProof: true,
};

// ─── 社交证据 / Social Proof ───────────────────────────────────────

/** 今日聚合统计（来自 sync-service） / Today's aggregate stats */
export interface TodayStats {
  deepDiveCount: number;
  activeUsers: number;
  totalMinutesToday: number;
}

// ─── 学习里程碑事件 / Learning Milestone Event ─────────────────────

/** 学习里程碑事件详情 / Learning milestone event detail */
export interface LearningMilestoneDetail {
  type: 'pomodoro' | 'flashcard' | 'feynman';
  /** 本次学习时长（秒） / Session duration (seconds) */
  durationSeconds: number;
  /** 累计深度（米） / Cumulative depth (meters) */
  totalDepth: number;
}
