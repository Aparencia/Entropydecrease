/**
 * useNoteListSelection — 行多选态 + 菜单态 + 批量删除（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 交互矩阵（REQ-287）的多选三通道与两个菜单的**唯一状态宿主**：
 *              Ctrl/⌘+单击=加/减选（不换右栏）、Shift+单击=按**可见序位置**区间选、
 *              工具栏「选择」批量模式下行单击=勾选。菜单三态：batchMenu（选集菜单）/
 *              contextMenu（单行菜单）/batchMoveOpen（选集菜单的二级「移动到组」视图）。
 * @ai-context: Esc 是**唯一** window keydown handler，优先级链不可拆散：
 *              batchMenu → contextMenu → 批量模式/非空选集。菜单态因此必须留在本 hook，
 *              展示件（NoteListBatchMenu）做成受控组件——否则会出现两个 window keydown
 *              同时判定的语义漂移（行为依赖 React 批处理时序）。
 * @ai-context: `visibleIdsRef` 是可见序镜像，供 Shift 区间读取——handleModifierClick 的
 *              依赖数组里没有 visibleOrder，直接读 props 会拿到陈旧闭包。
 * @ai-context: 边界——notes 变化时把选集裁剪到可见子集（既有安全边界，防已删笔记残留）；
 *              批量删除由父层确认（onBatchDelete 返回是否成功），**成功才清选**，
 *              失败保留选集供重试。anchor 语义（审查 L4）：普通单击恒重设锚、Ctrl 后锚
 *              指向本次点击行（即使该行已被移除，Explorer 同款）、无锚首次 Shift=单选该行。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Note } from "../types";
import { emptySelection, rangeSelection, toggleSelection } from "../utils/noteSelection";

export interface NoteListSelectionInput {
  notes: Note[];
  /** 全局可见序（区间选基准——useNoteSections 产出；折叠组行已排除） */
  visibleOrder: number[];
  /** 行单击=打开右栏（批量选择模式下由本 hook 改判为勾选） */
  onSelect: (note: Note) => void;
  /** 批量删除（父层确认对话框 + 删除 + 刷新） */
  onBatchDelete: (ids: number[]) => Promise<boolean>;
}

export function useNoteListSelection({ notes, visibleOrder, onSelect, onBatchDelete }: NoteListSelectionInput) {
  // ── 多选态（REQ-287）：selectionMode=批量选择模式（单击=勾选）；anchor=区间锚
  const [selection, setSelection] = useState<Set<number>>(emptySelection());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  // 右键/批处理面板
  const [contextMenu, setContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [batchMenu, setBatchMenu] = useState<{ ids: number[]; x: number; y: number } | null>(null);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);

  const visibleIdsRef = useRef<number[]>([]);

  const clearSelection = useCallback(() => {
    setSelection(emptySelection());
    setAnchor(null);
  }, []);
  const exitBatch = useCallback(() => { setSelectionMode(false); clearSelection(); }, [clearSelection]);

  // 列表数据变化裁剪（只留可见子集——既有安全边界）
  useEffect(() => {
    setSelection((cur) => {
      if (cur.size === 0) return cur;
      const visible = new Set(notes.map((n) => n.id));
      let changed = false;
      const next = new Set<number>();
      for (const id of cur) if (visible.has(id)) next.add(id); else changed = true;
      return changed ? next : cur;
    });
  }, [notes]);

  // Esc：先退批处理面板 → 批量模式（清多选退出）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (batchMenu) { setBatchMenu(null); setBatchMoveOpen(false); return; }
      if (contextMenu) { setContextMenu(null); return; }
      if (selectionMode || selection.size > 0) exitBatch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [batchMenu, contextMenu, selectionMode, selection.size, exitBatch]);

  useEffect(() => { visibleIdsRef.current = visibleOrder; }, [visibleOrder]);

  // ── 行交互 ──
  const handleOpen = useCallback((note: Note) => {
    if (selectionMode) {
      // 批量模式：单击=勾选（不换右栏）
      setSelection((cur) => toggleSelection(cur, note.id));
      setAnchor(note.id);
      return;
    }
    // 审查 L4：普通单击=单选并打开——先清既有选集，anchor 恒指向本次点击
    if (selection.size > 0) clearSelection();
    onSelect(note);
    setAnchor(note.id);
  }, [selectionMode, onSelect, selection.size, clearSelection]);

  const handleModifierClick = useCallback((note: Note, ctrl: boolean, shift: boolean) => {
    if (ctrl) {
      setSelection((cur) => toggleSelection(cur, note.id));
      // 审查 L4：Ctrl 后 anchor 指向本次点击行（即使该行被移除——Explorer 同款）
      setAnchor(note.id);
    } else if (shift) {
      if (anchor == null) {
        // 审查 L4：无锚的首次 Shift=单选该行并设为锚（连按两次不再各加单行）
        setSelection(new Set([note.id]));
        setAnchor(note.id);
      } else {
        setSelection((cur) => rangeSelection(cur, visibleIdsRef.current, anchor, note.id));
      }
    }
  }, [anchor]);

  /** 行右键：命中选集内 → 选集菜单（批量语义）；否则单行菜单（v0.16.1 既有） */
  const openRowContextMenu = useCallback((e: MouseEvent, note: Note) => {
    if (selection.size > 0 && selection.has(note.id)) {
      setBatchMenu({ ids: [...selection], x: e.clientX, y: e.clientY });
    } else {
      setContextMenu({ note, x: e.clientX, y: e.clientY });
    }
  }, [selection]);

  /** 收起选集菜单（归组成功与菜单自身共用；引用稳定，供 useNoteMoves 调用） */
  const closeBatchMenu = useCallback(() => setBatchMenu(null), []);

  // 批处理：删除（父层确认）
  const batchDelete = async () => {
    if (!batchMenu) return;
    const ok = await onBatchDelete(batchMenu.ids);
    if (ok) { setBatchMenu(null); setBatchMoveOpen(false); clearSelection(); }
  };

  return {
    selection, setSelection, anchor, selectionMode, setSelectionMode,
    contextMenu, setContextMenu, batchMenu, setBatchMenu, batchMoveOpen, setBatchMoveOpen,
    clearSelection, exitBatch, handleOpen, handleModifierClick, openRowContextMenu,
    closeBatchMenu, batchDelete,
  };
}
