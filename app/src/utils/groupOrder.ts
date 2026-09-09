/**
 * 组排序纯函数层（REQ-315，v0.20.11 批 6）。
 *
 * @ai-context: 组展示排序的单一实现——三处消费面共用（组侧栏按 kind 分区各自
 *              调用、笔记树组头/侧栏过滤平铺整表调用）。规则=置顶区（pin=1，
 *              区内 updatedAt 降序）→ 手动序区（note_group_orders seq 升序）→
 *              自动区（其余 updatedAt 降序），桶核心见 orderBuckets.ts。
 * @ai-context: seq 为 kind 分区内相对序号：分区内调用语义精确；跨 kind 整表调用
 *              （树组头/过滤平铺）时不同分区的 seq 撞值**并列保持输入序**（桶内
 *              稳定排序——输入确定则结果确定，无 id 决胜）。改判换分区时后端已
 *              同事务清行（见 Rust 层 override_group_route），不会带旧序占位。
 */
import { nonPinnedIds, orderPinnedSeqAuto, shiftInList } from "./orderBuckets";

/** 组排序最小形状（pin/rows 缺失=未置顶/自动区——旧数据兼容） */
export interface GroupOrderShape {
  id: number;
  pin?: number;
  updatedAt: number;
}

/** 组手动序行（group_id → seq；来自 note_group_order_list 命令） */
export type GroupOrderRows = ReadonlyMap<number, number>;

/** 置顶→手动 seq→自动(updatedAt 降序) 三段重排（纯函数，供单测）。 */
export function orderGroups<T extends GroupOrderShape>(
  groups: readonly T[],
  rows: GroupOrderRows,
): T[] {
  return orderPinnedSeqAuto(groups, rows, (g) => g.updatedAt);
}

/** 分区可手动移动子序列（视觉序去掉置顶区；置顶组位置由更新时间表达）。 */
export function movableGroupIds<T extends GroupOrderShape>(ordered: readonly T[]): number[] {
  return nonPinnedIds(ordered);
}

/**
 * 分区是否处于手动排序（rows 中存在该分区未置顶成员的序行——置顶组存量行不
 * 计入：置顶区是 pin 列语义，残行只在取消置顶后复活为手动位）。
 */
export function partitionIsManual<T extends GroupOrderShape>(
  members: readonly T[],
  rows: GroupOrderRows,
): boolean {
  return members.some((g) => g.pin !== 1 && rows.has(g.id));
}

/** 分区内上移/下移（纯函数：入参=可移动子序列；越界/缺失返回 null 由 UI 禁用）。 */
export function shiftGroupOrder(
  ids: readonly number[],
  groupId: number,
  dir: 1 | -1,
): number[] | null {
  return shiftInList(ids, groupId, dir);
}
