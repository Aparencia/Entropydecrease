/**
 * reviewStats — 复习页到期统计/范围归约纯函数（v0.20.10 批 5：复习独立顶层页）。
 *
 * @ai-context: ReviewPage 头部组过滤器（全部+各组，含到期数）与空态判定的
 *              归约逻辑抽离为纯函数——Why：不依赖 React/副作用，vitest 直测
 *              （AAA），页面只消费结果，避免在 JSX 内散布过滤/查找分支。
 * @ai-context: 数据契约=count_due_cards 的 group_id Option 面（null=全部到期卡）；
 *              total 与 byGroup 由页面并行拉取后组装，本模块不做 I/O。
 */
import type { NoteGroup } from "../types/notes";

/** 到期分布行（组 + 该组到期卡数；供过滤器 chips 渲染） */
export interface DueGroupRow {
  group: NoteGroup;
  due: number;
}

/** 到期 >0 的组行，按到期数降序（最急的组在最前——复习入口打开即见优先级）。
 *  零到期组不产出（过滤器 chips 只列有卡可复习的组，避免空组噪音）。 */
export function dueGroupRows(groups: NoteGroup[], byGroup: Record<number, number>): DueGroupRow[] {
  return groups
    .map((group) => ({ group, due: byGroup[group.id] ?? 0 }))
    .filter((r) => r.due > 0)
    .sort((a, b) => b.due - a.due);
}

/** 当前过滤器范围的到期数（null=全部——取 total；组 id 查不到按 0 防御——
 *  组删除竞态下不崩、开始复习按钮自然禁用）。 */
export function scopeDueCount(
  selGroupId: number | null,
  byGroup: Record<number, number>,
  total: number,
): number {
  return selGroupId === null ? total : (byGroup[selGroupId] ?? 0);
}

/** 范围名（头部展示用；未知 id 降级"已选组"——组删除后不显示空名）。 */
export function scopeLabel(groups: NoteGroup[], selGroupId: number | null): string {
  if (selGroupId === null) return "全部组";
  return groups.find((g) => g.id === selGroupId)?.name ?? "已选组";
}
