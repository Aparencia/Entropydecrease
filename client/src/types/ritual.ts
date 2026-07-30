/**
 * 学习启动仪式领域类型 / Startup ritual domain types
 *
 * @ai-context: 纯类型文件。RitualRecord 持久化到 Dexie `ritualRecords` 表，
 * 记录每次仪式的掌握标记、微目标与编排埋点（planVariant），支撑复习闭环
 * 与 v0.27.0 自适应参数调优。
 * @ai-context: Pure type file. RitualRecord persists to the `ritualRecords`
 * table, capturing mastery marks, micro goals and plan telemetry
 * (planVariant) for the review loop and future adaptive tuning.
 */

/** 掌握程度标记 / Mastery mark for the review flashback step */
export type MasteryMark = 'mastered' | 'fuzzy' | 'unmastered';

/** 单次仪式记录 / One persisted ritual session record */
export interface RitualRecord {
  id: string;
  /** 仪式日期 YYYY-MM-DD */
  date: string;
  /** 回顾闪回掌握标记（未标记为 undefined） */
  masteryMark?: MasteryMark;
  /** 回顾的笔记 ID */
  noteId?: string;
  /** 微目标文本 */
  goalText?: string;
  /** 微目标使用的快选标签 */
  goalTags: string[];
  /** 目标是否完成（Beta.1 由番茄钟回收确认，未确认为 undefined） */
  goalCompleted?: boolean;
  /** 本次仪式总时长（毫秒） */
  ritualDurationMs: number;
  /** 编排变体埋点（A/B 与自适应裁决数据源） */
  planVariant: string;
  createdAt: Date;
}
