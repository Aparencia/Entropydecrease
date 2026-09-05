/**
 * NoteListView — 笔记页中部列表：搜索/标签/排序 + 列表（REQ-287 v0.19.7 重构）。
 *
 * @ai-context: 交互矩阵落地（§2.6/2.9）——行内 checkbox 移除：多选三通道
 *              （Ctrl/⌘+单击=加/减、Shift+单击=按列表位置区间、工具栏「选择」
 *              批量模式行单击=勾选，Esc/完成退出）；拖拽矩阵（组头/组行双
 *              drop、同 scope 行间落点=手动排序自动启用快照、自动排序组禁入
 *              位置语义只做归组、搜索/标签平铺禁排序拖拽）；组头空白=划选
 *              锚点（区间=组内自首行至当前行带）；批量栏=删除+移动到组；
 *              右键=选集批处理（删除/移动）或单行既有菜单。手动序落库
 *              note_orders（scope=g{id}/none）——本组件全权管理（拉取/保存/
 *              回自动），父层只经 onNoteMoved 重载数据。
 * @ai-context: 树序范围：全局可见序（树=未分组+各组顺次、折叠组行不参与）为
 *              区间/划选唯一基准；跨组语义=归组（目标手排时按落点插入）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteGroup } from "../types";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import { emptySelection, rangeSelection, toggleSelection } from "../utils/noteSelection";
import NoteListRow from "./NoteListRow";
import NoteTreeSection from "./NoteTreeSection";
import NoteRowContextMenu from "./NoteRowContextMenu";

// 兼容既有导入面（NoteReadingView/NotesPage/parseTags.test 从此解析——v0.15 移厝 utils）
export { parseTags, fmtDate } from "../utils/noteHelpers";

export type SortMode = "updated-desc" | "pin-first" | "created-desc";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };
const ghostBtn: React.CSSProperties = { ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" };

interface Props {
  width?: number;
  notes: Note[];
  groups?: NoteGroup[];
  groupFilter?: number | null;
  onGroupFilterChange?: (id: number | null) => void;
  keyword: string;
  tagFilter: string | null;
  sortMode: SortMode;
  allTags: string[];
  selectedId: number | null;
  status: string;
  noteColors?: Record<number, string | null>;
  tagColors?: Record<string, string>;
  onKeywordChange: (kw: string) => void;
  onTagFilterChange: (tag: string | null) => void;
  onSortModeChange: (mode: SortMode) => void;
  onSelect: (note: Note) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionId: number) => void;
  onBatchDelete: (ids: number[]) => Promise<boolean>;
  onNotePinToggle?: (note: Note) => void;
  onNoteEdit?: (note: Note) => void;
  onNoteDelete?: (note: Note) => void;
  onNoteMoved?: () => void;
  onCollapse?: () => void;
}

/** scope 键（组/null=未分组） */
const scopeKey = (groupId: number | null): string => (groupId == null ? "none" : `g:${groupId}`);

/** 读组折叠记忆（localStorage 损坏/无 → 默认展开） */
function readGroupFold(key: string): boolean {
  try { return window.localStorage.getItem(`notes:group-fold:${key}`) === "1"; } catch { return false; }
}

interface SectionData {
  scope: string;
  groupId: number | null;
  title: string;
  accent: string;
  items: Note[];
}

export default function NoteListView({
  width = 320, notes, groups = [], groupFilter = null, onGroupFilterChange,
  keyword, tagFilter, sortMode, allTags, selectedId, status,
  noteColors, tagColors,
  onKeywordChange, onTagFilterChange, onSortModeChange, onSelect, onCreate, onRefresh, onOpenSession, onBatchDelete,
  onNotePinToggle, onNoteEdit, onNoteDelete, onNoteMoved, onCollapse,
}: Props) {
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );

  // ── 多选态（REQ-287）：selectionMode=批量选择模式（单击=勾选）；anchor=区间锚
  const [selection, setSelection] = useState<Set<number>>(emptySelection());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  // 右键/批处理面板
  const [contextMenu, setContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [batchMenu, setBatchMenu] = useState<{ ids: number[]; x: number; y: number } | null>(null);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [busyMove, setBusyMove] = useState(false);

  // 组折叠态
  const [groupFolds, setGroupFolds] = useState<Record<string, boolean>>({});
  // 手动排序 map（scope → 有序 ids）
  const [manualOrders, setManualOrders] = useState<Record<string, number[]>>({});

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

  // 手动序装载（REQ-287）
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
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const saveOrder = useCallback(async (scope: string, ids: number[]) => {
    await invoke("note_order_save", { scope, noteIds: ids });
    loadOrders();
  }, [loadOrders]);
  const resetOrder = useCallback(async (scope: string) => {
    await invoke("note_order_clear", { scope });
    loadOrders();
  }, [loadOrders]);

  // ── 分组树数据（同 v0.15 结构）——可见序统一从本结构生成 ──
  const treeMode = keyword.trim() === "" && tagFilter === null && sortMode === "updated-desc";
  const grouped = useMemo(() => {
    if (!treeMode) return null;
    const ungrouped: Note[] = [];
    const byGroup = new Map<number, Note[]>();
    for (const n of notes) {
      if (n.group_id == null) ungrouped.push(n);
      else {
        const arr = byGroup.get(n.group_id) ?? [];
        arr.push(n);
        byGroup.set(n.group_id, arr);
      }
    }
    return { ungrouped, byGroup };
  }, [notes, treeMode]);

  // 折叠初始值（沿用 v0.15）
  useEffect(() => {
    setGroupFolds((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const g of groups) {
        const key = String(g.id);
        if (!(key in next)) { next[key] = readGroupFold(key); changed = true; }
      }
      if (!("none" in next)) { next.none = readGroupFold("none"); changed = true; }
      return changed ? next : cur;
    });
  }, [groups]);
  useEffect(() => {
    try {
      for (const [k, v] of Object.entries(groupFolds)) window.localStorage.setItem(`notes:group-fold:${k}`, v ? "1" : "0");
    } catch { /* 隐私模式 */ }
  }, [groupFolds]);

  /** 手动序应用（scope 有序则按其排；否则原序） */
  const applyManual = useCallback((items: Note[], scope: string): Note[] => {
    const order = manualOrders[scope];
    if (!order) return items;
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...items].sort((a, b) => {
      const pa = pos.get(a.id), pb = pos.get(b.id);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });
  }, [manualOrders]);

  // 显示节（树/平铺）→ sections（可见序）
  const sections: SectionData[] = useMemo(() => {
    const mk = (scope: string, groupId: number | null, title: string, accent: string, items: Note[]): SectionData =>
      ({ scope, groupId, title, accent, items: applyManual(items, scope) });
    const out: SectionData[] = [];
    if (treeMode && grouped) {
      const ungrouped: Note[] = [];
      const byGroup = new Map<number, Note[]>();
      for (const n of notes) {
        if (n.group_id == null) ungrouped.push(n);
        else { const a = byGroup.get(n.group_id) ?? []; a.push(n); byGroup.set(n.group_id, a); }
      }
      // 折叠只影响 body（folded prop）——组头必须常驻（chevron 再点可展开）
      if (ungrouped.length > 0 || groupFilter === null) {
        out.push(mk("none", null, "未分组", paletteHex(null, theme), ungrouped));
      }
      for (const g of groups) {
        const items = byGroup.get(g.id) ?? [];
        if (items.length === 0) continue;
        out.push(mk(scopeKey(g.id), g.id, g.name, paletteHex(g.color ?? null, theme), items));
      }
    } else {
      out.push(mk("flat", null, "", paletteHex(null, theme), notes));
    }
    return out;
  }, [treeMode, grouped, groups, notes, groupFolds, applyManual, theme, groupFilter]);

  const visibleOrder = useMemo(() => sections.flatMap((s) => s.items.map((n) => n.id)), [sections]);
  useEffect(() => { visibleIdsRef.current = visibleOrder; }, [visibleOrder]);

  // ── 行交互 ──
  const handleOpen = useCallback((note: Note) => {
    if (selectionMode) {
      // 批量模式：单击=勾选（不换右栏）
      setSelection((cur) => toggleSelection(cur, note.id));
      setAnchor(note.id);
      return;
    }
    onSelect(note);
    if (selection.size === 0) setAnchor(note.id);
  }, [selectionMode, onSelect, selection.size]);

  const handleModifierClick = useCallback((note: Note, ctrl: boolean, shift: boolean) => {
    if (ctrl) {
      setSelection((cur) => toggleSelection(cur, note.id));
      setAnchor(note.id);
    } else if (shift) {
      setSelection((cur) => rangeSelection(cur, visibleIdsRef.current, anchor, note.id));
    }
  }, [anchor]);

  /** 拖拽归组（组头/左侧组行复用单 id 兜底仍可用） */
  const moveToGroup = useCallback(async (ids: number[], groupId: number | null) => {
    setBusyMove(true);
    try {
      const groupNotes = new Set(
        notes.filter((n) => (groupId == null ? n.group_id == null : n.group_id === groupId)).map((n) => n.id),
      );
      for (const id of ids) {
        if (groupNotes.has(id)) continue;
        await invoke("move_note_to_group", { noteId: id, groupId });
      }
      // 目标手排：新入组笔记追加末尾（跨组 drop 的"加入该组"语义）
      const scope = scopeKey(groupId);
      if (manualOrders[scope]) {
        const cur = manualOrders[scope].filter((id) => !ids.includes(id));
        await saveOrder(scope, [...cur, ...ids.filter((id) => !groupNotes.has(id))]);
      }
      onNoteMoved?.();
      setBatchMenu(null);
    } catch (e) {
      console.warn("[notes] 归组失败:", e);
    } finally {
      setBusyMove(false);
    }
  }, [notes, manualOrders, saveOrder, onNoteMoved]);

  /** 行间落点（同 scope 手动排序；自动排序组=仅归组语义已在 header 处理） */
  const handleDropOnRow = useCallback(async (ids: number[], targetId: number, before: boolean) => {
    const target = notes.find((n) => n.id === targetId);
    if (!target) return;
    const scope = scopeKey(target.group_id ?? null);
    const order = manualOrders[scope];
    const movers = ids.filter((id) => !order || order.includes(id) || notes.find((n) => n.id === id)?.group_id === target.group_id);
    const current = order ?? sections.find((s) => s.scope === scope)?.items.map((n) => n.id) ?? [];
    // 快照语义：首次拖=自动启用（当前可见序即快照）
    const list = (order ?? current).filter((id) => !movers.includes(id));
    const idx = list.indexOf(targetId);
    if (idx < 0) return;
    list.splice(before ? idx : idx + 1, 0, ...movers);
    // 跨组落点：先把非本组笔记归入目标组
    for (const id of ids) {
      const n = notes.find((x) => x.id === id);
      if (n && (n.group_id ?? null) !== (target.group_id ?? null)) {
        await invoke("move_note_to_group", { noteId: id, groupId: target.group_id });
      }
    }
    await saveOrder(scope, list);
    onNoteMoved?.();
  }, [notes, manualOrders, sections, saveOrder, onNoteMoved]);

  /** 划选（组头空白起 → 组内首行至当前行带；走既有行命中的全局序） */
  const startMarquee = useCallback((scope: string) => {
    const section = sections.find((s) => s.scope === scope);
    if (!section || section.items.length === 0) return;
    const startGlobal = visibleOrder.indexOf(section.items[0].id);
    if (startGlobal < 0) return;
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const rowEl = el?.closest<HTMLElement>('[id^="note-row-"]');
      if (!rowEl) return;
      const id = Number(rowEl.id.replace("note-row-", ""));
      const gi = visibleOrder.indexOf(id);
      if (gi < 0) return;
      const lo = Math.min(startGlobal, gi);
      const hi = Math.max(startGlobal, gi);
      setSelection(new Set(visibleOrder.slice(lo, hi + 1)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sections, visibleOrder]);

  const rowAccent = (n: Note) => paletteHex(noteColors?.[n.id] ?? null, theme);

  const renderRow = (n: Note) => (
    <NoteListRow
      key={n.id}
      note={n}
      accent={rowAccent(n)}
      openId={selectedId}
      multiSelected={selection.has(n.id)}
      tagColors={tagColors}
      onOpen={handleOpen}
      onModifierClick={handleModifierClick}
      dragIds={selection.size > 0 && selection.has(n.id) ? [...selection] : []}
      onDropOnRow={handleDropOnRow}
      onOpenSession={onOpenSession}
      onContextMenu={(e, note) => {
        if (selection.size > 0 && selection.has(note.id)) {
          setBatchMenu({ ids: [...selection], x: e.clientX, y: e.clientY });
        } else {
          setContextMenu({ note, x: e.clientX, y: e.clientY });
        }
      }}
    />
  );

  const toggleGroupFold = (key: string) => setGroupFolds((cur) => ({ ...cur, [key]: !cur[key] }));

  // 批处理：删除（父层确认）与移动到组
  const batchDelete = async () => {
    if (!batchMenu) return;
    const ok = await onBatchDelete(batchMenu.ids);
    if (ok) { setBatchMenu(null); setBatchMoveOpen(false); clearSelection(); }
  };

  return (
    <div style={{ width, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📝 笔记</span>
        {selectionMode && (
          <span style={{ fontSize: 10.5, color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: 10, padding: "0 6px", background: "#eef2ff", lineHeight: "16px" }}>
            选择模式{selection.size > 0 ? `（${selection.size}）` : ""}
          </span>
        )}
        <button
          data-testid="batch-mode-toggle"
          onClick={() => (selectionMode ? exitBatch() : setSelectionMode(true))}
          style={{
            ...ghostBtn,
            marginLeft: "auto",
            borderColor: selectionMode ? "#4f46e5" : undefined,
            color: selectionMode ? "#3730a3" : "#4b5563",
          }}
          title={selectionMode ? "退出选择模式（Esc）" : "进入选择模式：单击笔记=勾选（可多选后批量操作）"}
        >
          选择
        </button>
        <button onClick={onCreate} style={{ fontSize: 12, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#f9fafb" }} title="新建笔记">+ 新建</button>
        <button onClick={onCollapse} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="折叠列表">⟨</button>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={keyword} onChange={(e) => onKeywordChange(e.target.value)} placeholder="搜索标题/正文…" style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, minWidth: 0 }} />
          <button onClick={onRefresh} style={{ fontSize: 13, cursor: "pointer" }}>⟳</button>
        </div>
        <select value={sortMode} onChange={(e) => onSortModeChange(e.target.value as SortMode)} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}>
          <option value="updated-desc">按更新时间</option>
          <option value="pin-first">固定优先</option>
          <option value="created-desc">按创建时间</option>
        </select>
        {allTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tagFilter && (
              <span onClick={() => onTagFilterChange(null)} style={{ fontSize: 11, color: "#6b7280", cursor: "pointer", border: "1px solid #d1d5db", borderRadius: 10, padding: "1px 6px", background: "#f3f4f6" }}>清除过滤 ✕</span>
            )}
            {allTags.map((t) => (
              <span key={t} onClick={() => onTagFilterChange(t)} style={{ fontSize: 11, cursor: "pointer", border: `1px solid ${tagFilter === t ? "#0d9488" : "#e5e7eb"}`, borderRadius: 10, padding: "1px 6px", background: tagFilter === t ? "#f0fdfa" : "#f9fafb", color: tagFilter === t ? "#0d9488" : "#6b7280" }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {sections.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 24 }}>暂无笔记</p>}
        {sections.map((sec) => (
          sec.scope === "flat" ? (
            <div key="flat">{notes.map(renderRow)}</div>
          ) : (
            <NoteTreeSection
              key={sec.scope}
              title={sec.title}
              count={sec.items.length}
              accent={sec.accent}
              active={sec.groupId === null ? groupFilter === null : groupFilter === sec.groupId}
              folded={groupFolds[sec.groupId == null ? "none" : String(sec.groupId)] === true}
              onToggleFold={() => toggleGroupFold(sec.groupId == null ? "none" : String(sec.groupId))}
              onSelectTitle={() => onGroupFilterChange?.(sec.groupId === null ? null : (groupFilter === sec.groupId ? null : sec.groupId))}
              manual={!!manualOrders[sec.scope]}
              onResetManual={() => void resetOrder(sec.scope)}
              onDropNotes={(ids) => void moveToGroup(ids, sec.groupId)}
              onMarqueeStart={() => startMarquee(sec.scope)}
            >
              {sec.items.map(renderRow)}
            </NoteTreeSection>
          )
        ))}
      </div>

      {/* 批量操作栏（去勾选框后的批量入口：删除 + 移动到组；选择模式下同样可用） */}
      {selection.size > 0 && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
          <span style={{ fontSize: 12, color: "#3730a3" }}>已选 {selection.size} 个</span>
          <button data-testid="batch-move-btn" style={ghostBtn} onClick={() => setBatchMenu({ ids: [...selection], x: 0, y: 0 })}>移动到组</button>
          <button data-testid="batch-delete-btn" style={{ ...ghostBtn, borderColor: "#fca5a5", color: "#dc2626" }} onClick={() => void (async () => { if (await onBatchDelete([...selection])) clearSelection(); })()}>批量删除</button>
          {selectionMode && <button data-testid="batch-done-btn" style={{ ...ghostBtn, color: "#3730a3" }} onClick={exitBatch}>完成</button>}
          <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={clearSelection}>取消</button>
        </div>
      )}

      {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}

      {/* 单行右键菜单（既有） */}
      {contextMenu && onNotePinToggle && onNoteEdit && onNoteDelete && onNoteMoved && (
        <NoteRowContextMenu
          note={contextMenu.note}
          groups={groups}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onPinToggle={onNotePinToggle}
          onEdit={onNoteEdit}
          onDelete={onNoteDelete}
          onMoved={onNoteMoved}
        />
      )}

      {/* 选集批处理菜单（删除/移动到组） */}
      {batchMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => { setBatchMenu(null); setBatchMoveOpen(false); }} />
          <div data-testid="batch-context-menu" style={{ position: "fixed", zIndex: 41, left: batchMenu.x || 12, top: batchMenu.y || 12, minWidth: 180, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", padding: 6, fontSize: 12 }}>
            <div style={{ padding: "2px 6px", color: "#9ca3af", fontSize: 11 }}>已选 {batchMenu.ids.length} 个</div>
            {!batchMoveOpen ? (
              <>
                <button style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left" }} disabled={busyMove} onClick={() => setBatchMoveOpen(true)}>📁 移动到组…</button>
                <button data-testid="batch-menu-delete" style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left", borderColor: "#fca5a5", color: "#dc2626" }} disabled={busyMove} onClick={() => void batchDelete()}>删除选中（{batchMenu.ids.length}）</button>
                <button style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left" }} onClick={() => { setBatchMenu(null); clearSelection(); }}>清除选择</button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" }}>
                <button style={{ ...ghostBtn, textAlign: "left" }} disabled={busyMove} onClick={() => void moveToGroup(batchMenu.ids, null)}>（移出组）</button>
                {groups.map((g) => (
                  <button key={g.id} style={{ ...ghostBtn, textAlign: "left" }} disabled={busyMove} onClick={() => void moveToGroup(batchMenu.ids, g.id)}>📁 {g.name}</button>
                ))}
                <button style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", textAlign: "left" }} onClick={() => setBatchMoveOpen(false)}>← 返回</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
