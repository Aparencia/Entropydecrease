/**
 * useGroupOrders — 组排序/置顶操作 hook（REQ-315，v0.20.11 批 6）。
 *
 * @ai-context: 从 GroupSidebar 拆出的排序域（行数压线）——自持组手动序行
 *              （note_group_order_list）并按 refreshKey 重载；暴露三类操作：
 *              置顶切换（update_note_group_pin）、分区内上移/下移（前端按渲染
 *              规则重排 → note_group_order_save 整表快照覆写）、单组回自动
 *              （note_group_order_clear）。错误统一经 onError 上抛（侧栏 status
 *              区承载），成功经 onChanged 全量刷新（组列表重载含新 pin/序行）。
 * @ai-context: 快照只含置顶区外成员（置顶组由 pin 列表达不占手动位）；首次移动
 *              即把分区转手排（与 REQ-287 笔记拖拽快照同语义）。纯函数在
 *              utils/groupOrder.ts（orderGroups/shiftGroupOrder——配单测），
 *              hook 只做接线。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteGroup } from "../types";
import {
  movableGroupIds,
  orderGroups,
  partitionIsManual,
  shiftGroupOrder,
  type GroupOrderRows,
} from "../utils/groupOrder";

interface Props {
  /** 当前组列表（已按 feedCapture 过滤的展示集——分区成员口径=所见即所得） */
  groups: NoteGroup[];
  /** 重载键（父层 refreshToken/load 变化时重拉序行） */
  refreshKey: number;
  /** 成功回调（父层全量刷新） */
  onChanged: () => void;
  /** 失败回调（错误文案上抛 status 区） */
  onError: (msg: string) => void;
}

export function useGroupOrders({ groups, refreshKey, onChanged, onError }: Props) {
  const [orderRows, setOrderRows] = useState<GroupOrderRows>(new Map());

  useEffect(() => {
    invoke<[number, number][]>("note_group_order_list")
      .then((rows) => setOrderRows(new Map(rows.map(([gid, seq]) => [gid, seq]))))
      .catch((e) => console.warn("[groups] 组排序读取失败（自动排序兜底）:", e));
  }, [refreshKey]);

  /** 某 kind 分区按 置顶→手排→自动 规则排序（组侧栏分区渲染消费）。 */
  const orderedPartition = useCallback(
    (kind: string) => orderGroups(groups.filter((g) => g.kind === kind), orderRows),
    [groups, orderRows],
  );

  /** 分区是否处于手动排序（分区头「手排 ↺」徽标）。 */
  const partitionManual = useCallback(
    (kind: string) => partitionIsManual(orderedPartition(kind), orderRows),
    [orderedPartition, orderRows],
  );

  /** 置顶/取消置顶（pin=0/1；updated_at 同步刷新=置顶区按时间定序的动因）。 */
  const togglePin = useCallback(async (g: NoteGroup) => {
    try {
      await invoke<boolean>("update_note_group_pin", { id: g.id, pin: g.pin === 1 ? 0 : 1 });
      onError("");
      onChanged();
    } catch (e) {
      onError(`置顶操作失败: ${e}`);
    }
  }, [onChanged, onError]);

  /**
   * 分区内上移/下移：以渲染序去掉置顶区后的子序列换位 → 整表快照覆写
   * （首次移动=分区转手排）。置顶组不在此子序列（置顶区按更新时间定序）。
   */
  const moveGroup = useCallback(async (g: NoteGroup, dir: 1 | -1) => {
    const base = movableGroupIds(orderedPartition(g.kind));
    const next = shiftGroupOrder(base, g.id, dir);
    if (!next) return; // 边界/置顶组——按钮已禁用，防御性短路
    try {
      await invoke("note_group_order_save", { kind: g.kind, groupIds: next });
      onError("");
      onChanged();
    } catch (e) {
      onError(`排序失败: ${e}`);
    }
  }, [orderedPartition, onChanged, onError]);

  /** 单组回自动（清该组手动位；其余成员保持手动序——稀疏行语义合法）。 */
  const clearGroupOrder = useCallback(async (g: NoteGroup) => {
    try {
      await invoke("note_group_order_clear", { groupId: g.id });
      onError("");
      onChanged();
    } catch (e) {
      onError(`回自动排序失败: ${e}`);
    }
  }, [onChanged, onError]);

  /** 分区整体回自动（空快照=清整分区手动序；幂等）。 */
  const resetPartition = useCallback(async (kind: string) => {
    try {
      await invoke("note_group_order_save", { kind, groupIds: [] });
      onError("");
      onChanged();
    } catch (e) {
      onError(`回自动排序失败: ${e}`);
    }
  }, [onChanged, onError]);

  /** 右键菜单动作可用性（置顶/边界组禁用上移下移——置顶区语义见文件头）。 */
  const canMoveAt = useCallback((g: NoteGroup) => {
    const base = movableGroupIds(orderedPartition(g.kind));
    const idx = base.indexOf(g.id);
    return {
      canMoveUp: g.pin !== 1 && idx > 0,
      canMoveDown: g.pin !== 1 && idx >= 0 && idx < base.length - 1,
      hasOrderRow: orderRows.has(g.id),
    };
  }, [orderedPartition, orderRows]);

  return {
    orderRows,
    orderedPartition,
    partitionManual,
    togglePin,
    moveGroup,
    clearGroupOrder,
    resetPartition,
    canMoveAt,
  };
}
