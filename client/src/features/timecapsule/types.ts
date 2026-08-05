/**
 * 知识时光胶囊 — 类型定义
 *
 * @ai-context: 3.16 知识时光胶囊——把当前学习快照封装，30/60/90 天后开启，
 * 回看成长轨迹。snapshot 记录封装时刻的掌握度与统计。
 */
export type CapsuleMilestone = 30 | 60 | 90;

export type CapsuleStatus = 'sealed' | 'opened';

export interface CapsuleSnapshot {
  /** 封装时刻的掌握度（0-100，由复习/笔记/专注数据折算） */
  masterySnapshot: number;
  stats: {
    flashcardsReviewed: number;
    notesCreated: number;
    pomodoroFocusMinutes: number;
    streakDays: number;
  };
}

export interface TimeCapsule {
  id: string;
  title: string;
  content: string;
  milestone: CapsuleMilestone;
  /** 封装时间（ISO） */
  sealedAt: string;
  /** 预定开启时间（ISO） */
  openAt: string;
  status: CapsuleStatus;
  /** 实际开启时间（ISO，opened 时有值） */
  openedAt?: string;
  snapshot: CapsuleSnapshot;
}

export interface SealCapsuleInput {
  title: string;
  content: string;
  milestone: CapsuleMilestone;
}

export const CAPSULE_MILESTONE_LABELS: Record<CapsuleMilestone, string> = {
  30: '30 天',
  60: '60 天',
  90: '90 天',
};
