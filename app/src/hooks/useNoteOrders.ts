/**
 * useNoteOrders — 笔记/组「手动序行」store（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 兑现 line-limit-exemptions 对 NoteListView 的既有拆分计划
 *              （「拖拽/移动接线拆至 useNoteOrders.ts」）——本文件承载**序行装载与保存
 *              路径**（note_order_list / note_order_save / note_order_clear +
 *              note_group_order_list）；移动/拖拽接线在同批的 hooks/useNoteMoves.ts。
 * @ai-context: 副作用——挂载与 refreshToken 变化各拉一次；Why 依赖 refreshToken：
 *              侧栏上移/下移/回自动/手排↺（useGroupOrders→onChanged→NotesPage
 *              refreshToken++）只经父层令牌通知——挂载单拉会在树面残留旧组序/复位后
 *              残留已删序行（审查 P2-10）；与父层 refreshAll 同频重载，零去抖必要。
 *              save/reset 内联回拉（读操作，量级毫秒级）。读失败 console.warn 兜底
 *              （自动排序 fallback），不阻断 UI、不吞异常。
 * @ai-context: 边界——saveOrder/resetOrder 是**整表覆写**语义；scope 字面量由调用方以
 *              noteSectionModel.scopeKey 产出（`none` / `g:{id}`，与 Rust 侧契约绑定）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useNoteOrders(refreshToken: number) {
  // 手动排序 map（scope → 有序 ids）
  const [manualOrders, setManualOrders] = useState<Record<string, number[]>>({});
  // REQ-315：组手动序行（group_id → seq；树组头排序消费——组置顶/手排在树面生效）
  const [groupOrderRows, setGroupOrderRows] = useState<Map<number, number>>(new Map());

  // 手动序装载（REQ-287：notes 行）+ REQ-315：组序行（树组头排序）。
  // Why 依赖 refreshToken：侧栏上移/下移/回自动/手排↺（useGroupOrders→onChanged→
  // NotesPage refreshToken++）只经父层令牌通知——挂载单拉会在树面残留旧组序/
  // 复位后残留已删序行（审查 P2-10）；与父层 refreshAll 同频重载，零去抖必要
  // （重载=读操作，量级毫秒级；自持的保存路径 saveOrder 仍内联 loadOrders）
  const loadOrders = useCallback(() => {
    invoke<[string, number, number][]>("note_order_list")
      .then((rows) => {
        const map: Record<string, number[]> = {};
        for (const [scope, id] of rows) {
          (map[scope] ??= []).push(id);
        }
        setManualOrders(map);
      })
      .catch((e) => console.warn("[notes] 手动排序读取失败（自动排序兜底）:", e));
    invoke<[number, number][]>("note_group_order_list")
      .then((rows) => setGroupOrderRows(new Map(rows.map(([gid, seq]) => [gid, seq]))))
      .catch((e) => console.warn("[notes] 组排序读取失败（自动排序兜底）:", e));
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders, refreshToken]);

  const saveOrder = useCallback(async (scope: string, ids: number[]) => {
    await invoke("note_order_save", { scope, noteIds: ids });
    loadOrders();
  }, [loadOrders]);
  const resetOrder = useCallback(async (scope: string) => {
    await invoke("note_order_clear", { scope });
    loadOrders();
  }, [loadOrders]);

  return { manualOrders, groupOrderRows, saveOrder, resetOrder };
}
