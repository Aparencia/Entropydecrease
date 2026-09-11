/**
 * useNoteMoves — 笔记拖拽/移动三入口接线（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 三入口同文件是**硬约束**，不是组织偏好——`dropBusyRef`（行落点并发锁，
 *              防陈旧快照互覆）被「右键组内上移/下移」与「行间落点」共用，且两者都走
 *              同一条整表覆写路径 saveOrder→note_order_save。拆进两个文件会得到两把
 *              独立 ref（锁失去意义）与双轨保存。
 * @ai-context: 入口一 moveToGroup（组头/左侧组行 drop、批量移动到组）：逐条
 *              move_note_to_group，目标 scope 有手排时把新入组未置顶笔记追加末尾
 *              （置顶成员由置顶区表达，不写手排行；重写快照顺带清存量置顶残行）；
 *              源组变空 → autoCleanedGroups 去重上抛 onCleanNotice（REQ-316 留痕）。
 * @ai-context: 入口二 moveWithinScope（右键上移/下移）：自动排序 scope 的首次显式移动
 *              = 以当前可见序快照转手排再移动（与行落点同一保存路径，无 discoverability
 *              缺口、无双轨）；dropBusyRef 占用期间整体短路。
 * @ai-context: 入口三 handleDropOnRow（行间落点）：跨组先归入目标组 → 取目标 scope 底序
 *              → 只写置顶区外子序列 → 与既有序一致时跳过保存（防无谓快照）。**5 个
 *              `onNoteMoved?.()` 出口（仅置顶成员 / 目标不可见 / 序无变化 / 正常 / catch）
 *              缺一即父层不刷新、UI 静默陈旧。**
 * @ai-context: 边界——treeMode=false（搜索/标签/非默认排序平铺）整条链路短路：平铺是
 *              过滤结果非完整 scope，不做 scope 级重排。移动命令失败一律 console.warn
 *              （部分操作可能已提交）+ onNoteMoved 兜底刷新。本批只搬家：4×notes.find
 *              与 O(n²) 倾向**不优化**（触碰时序语义）。
 */
import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types";
// REQ-316（批 7）：移组返回契约（空组自动清理留痕数据源）
import type { MoveNoteResult } from "../types/notes";
// REQ-315：scope 内 置顶→手排→自动 排序纯函数 + 显式移动（树视图 pin 生效）
import { dropNotesIntoOrder, shiftNoteOrder } from "../utils/noteOrder";
import { scopeKey } from "../utils/noteSectionModel";

export interface NoteMovesInput {
  notes: Note[];
  /** 树模式判据（平铺态禁排序拖拽——交互矩阵锁定规则） */
  treeMode: boolean;
  /** scope → 手排有序 ids（useNoteOrders） */
  manualOrders: Record<string, number[]>;
  /** scope 手动底序（可见展示序去掉置顶区；调用方以 useCallback 保持引用稳定） */
  manualBaseOf: (scope: string) => number[] | null;
  /** 整表覆写保存路径（useNoteOrders.saveOrder——三个入口唯一保存路径） */
  saveOrder: (scope: string, ids: number[]) => Promise<void>;
  /** 移动/归组完成 → 父层重载数据 */
  onNoteMoved?: () => void;
  /** REQ-316（批 7）：移组触发源空组自动清理 → 上抛组标题（父层 toast 留痕） */
  onCleanNotice?: (groupNames: string[]) => void;
  /** 归组成功后收起选集菜单（菜单态在 useNoteListSelection，须传稳定引用） */
  closeBatchMenu: () => void;
}

export function useNoteMoves({
  notes, treeMode, manualOrders, manualBaseOf, saveOrder, onNoteMoved, onCleanNotice, closeBatchMenu,
}: NoteMovesInput) {
  const [busyMove, setBusyMove] = useState(false);
  // L5：行落点并发锁（防陈旧快照互覆）——moveWithinScope 与 handleDropOnRow 共用
  const dropBusyRef = useRef(false);

  /** 拖拽归组（组头/左侧组行复用单 id 兜底仍可用） */
  const moveToGroup = useCallback(async (ids: number[], groupId: number | null) => {
    setBusyMove(true);
    try {
      const groupNotes = new Set(
        notes.filter((n) => (groupId == null ? n.group_id == null : n.group_id === groupId)).map((n) => n.id),
      );
      const cleanedNames: string[] = [];
      for (const id of ids) {
        if (groupNotes.has(id)) continue;
        const r = await invoke<MoveNoteResult>("move_note_to_group", { noteId: id, groupId });
        cleanedNames.push(...r.autoCleanedGroups);
      }
      // 目标手排：新入组未置顶笔记追加末尾（跨组 drop 的"加入该组"语义；
      // 置顶成员由置顶区表达，不写手排行；重写快照顺带清存量置顶残行）
      const scope = scopeKey(groupId);
      if (manualOrders[scope]) {
        const pinned = new Set(notes.filter((n) => n.pin === 1).map((n) => n.id));
        const cur = manualOrders[scope].filter((id) => !ids.includes(id) && !pinned.has(id));
        await saveOrder(scope, [...cur, ...ids.filter((id) => !groupNotes.has(id) && !pinned.has(id))]);
      }
      onNoteMoved?.();
      // REQ-316（批 7）：批量移走后源空组清理留痕（跨条聚合去重）
      if (cleanedNames.length > 0) onCleanNotice?.([...new Set(cleanedNames)]);
      closeBatchMenu();
    } catch (e) {
      console.warn("[notes] 归组失败:", e);
    } finally {
      setBusyMove(false);
    }
  }, [notes, manualOrders, saveOrder, onNoteMoved, onCleanNotice, closeBatchMenu]);

  /**
   * REQ-315：右键「上移/下移」组内显式移动——补"必须拖一次才触发手排快照"的
   * 发现性缺口：自动排序 scope 的首次显式移动 = 以当前可见序快照转手排再移动
   * （与行落点拖拽同一保存路径 saveOrder——无双轨）。
   */
  const moveWithinScope = useCallback(async (note: Note, dir: 1 | -1) => {
    if (dropBusyRef.current || !treeMode) return;
    const gid = note.group_id ?? null;
    const base = manualBaseOf(scopeKey(gid));
    const next = base ? shiftNoteOrder(base, note.id, dir) : null;
    if (!next) return;
    dropBusyRef.current = true;
    try {
      await saveOrder(scopeKey(gid), next);
      onNoteMoved?.();
    } catch (e) {
      console.warn("[notes] 组内移动失败:", e);
    } finally {
      dropBusyRef.current = false;
    }
  }, [treeMode, manualBaseOf, saveOrder, onNoteMoved]);

  /** 行间落点（同 scope 手动排序；跨组归入目标组后按落点插入——L2 审查修正：
   *  先归组、后整表覆写；目标不可见/无 ord 尾部不再静默 no-op） */
  const handleDropOnRow = useCallback(async (ids: number[], targetId: number, before: boolean) => {
    // L3：平铺态（搜索/标签/非默认排序）禁排序拖拽——矩阵锁定规则
    if (!treeMode) return;
    if (dropBusyRef.current) return;
    const target = notes.find((n) => n.id === targetId);
    if (!target || ids.includes(targetId)) return;
    dropBusyRef.current = true;
    try {
      const targetGroup = target.group_id ?? null;
      const scope = scopeKey(targetGroup);
      const base = manualBaseOf(scope);
      if (!base) return;
      // 跨组 id：先归入目标组（await 顺序执行——同事务语义由命令层保证）
      const external = ids.filter((id) => {
        const n = notes.find((x) => x.id === id);
        return n && (n.group_id ?? null) !== targetGroup;
      });
      const cleanedNames: string[] = [];
      for (const id of external) {
        const r = await invoke<MoveNoteResult>("move_note_to_group", { noteId: id, groupId: target.group_id });
        cleanedNames.push(...r.autoCleanedGroups);
      }
      // REQ-316（批 7）：跨组拖走使源组变空 → 清理留痕（零清理零变化）
      if (cleanedNames.length > 0) onCleanNotice?.([...new Set(cleanedNames)]);
      // 落位（REQ-315：只写置顶区外子序列；落点在置顶行上 = 置顶区下沿即手动区首位）
      const pinned = new Set(notes.filter((n) => n.pin === 1).map((n) => n.id));
      const moved = ids.filter((id) => !pinned.has(id));
      if (moved.length === 0) {
        // 仅置顶成员拖拽：置顶区按更新时间定序不可移动——归组已完成即返回，不制造快照
        onNoteMoved?.();
        return;
      }
      const anchor = target.pin === 1 ? { head: true as const } : { targetId, before };
      const next = dropNotesIntoOrder(base, moved, anchor);
      if (!next) {
        // 目标不可见（折叠/异常）——至少完成归组，不写序
        onNoteMoved?.();
        return;
      }
      // 与既有序一致（如仅拖置顶行）= 跳过保存——防无变化操作制造无谓快照
      const prevBase = (manualOrders[scope] ?? []).filter((id) => {
        const n = notes.find((x) => x.id === id);
        return !n || n.pin !== 1;
      });
      if (prevBase.length === next.length && prevBase.every((id, i) => next[i] === id)) {
        onNoteMoved?.();
        return;
      }
      await saveOrder(scope, next);
      onNoteMoved?.();
    } catch (e) {
      console.warn("[notes] 行落点排序失败（部分操作可能已提交）:", e);
      onNoteMoved?.();
    } finally {
      dropBusyRef.current = false;
    }
  }, [treeMode, notes, manualOrders, manualBaseOf, saveOrder, onNoteMoved, onCleanNotice]);

  return { busyMove, moveToGroup, moveWithinScope, handleDropOnRow };
}
