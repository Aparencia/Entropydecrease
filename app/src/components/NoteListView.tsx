/**
 * NoteListView — 笔记页中部列表：搜索 + 标签过滤 + 排序 + 笔记列表（H5 自 NotesPage 拆分）。
 *
 * @ai-context: 纯展示/受控组件——数据与状态全部由 NotesPage 编排（参照
 *              SessionsPage → SessionListPanel/SessionDetailPanel 既有模式）。
 *              行 id=`note-row-{id}` 供 focusNoteId 跨页直达滚动定位。
 * @ai-context: v0.12.8 勾选批量删除（与会话管理台同逻辑：行内勾选 +
 *              底部批量操作栏；副作用经 onBatchDelete 上抛父层确认/invoke）。
 * @ai-context: v0.15 分组树——组头可收起（折叠记忆 localStorage）且组名点击=过滤
 *              （v0.12.2 决策 1 语义保持：chevron 独立 stopPropagation 不冒泡触发
 *              过滤）；搜索/标签/排序激活时树退化平铺（树上下文搜索无意义）；
 *              空组不渲染（组信息在组侧栏管理）；批量勾选"只删可见子集"边界保持。
 */
import { useEffect, useMemo, useState } from "react";
import type { Note, NoteGroup } from "../types";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import NoteListRow from "./NoteListRow";
import NoteTreeSection from "./NoteTreeSection";

// 兼容既有导入面（NoteReadingView/NotesPage/parseTags.test 从此解析——v0.15 移厝 utils）
export { parseTags, fmtDate } from "../utils/noteHelpers";

export type SortMode = "updated-desc" | "pin-first" | "created-desc";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface Props {
  /** 列宽（v0.15 全站自适应——父层 useColumnLayout 驱动；缺省 320=历史值） */
  width?: number;
  notes: Note[];
  /** v0.15 分组树：组列表（组头渲染；空组不渲染；缺省空=仅未分组区） */
  groups?: NoteGroup[];
  /** 当前组过滤（组名点击=过滤切换——决策 1 语义） */
  groupFilter?: number | null;
  onGroupFilterChange?: (id: number | null) => void;
  keyword: string;
  tagFilter: string | null;
  sortMode: SortMode;
  allTags: string[];
  selectedId: number | null;
  status: string;
  /** v0.14 B：笔记色板 id 映射（noteId → 色板 id；null=默认灰）——父层 resolveNoteColor 计算 */
  noteColors?: Record<number, string | null>;
  /** v0.14 B：标签色板 id 映射（tag → 色板 id）——标签徽标底色 */
  tagColors?: Record<string, string>;
  onKeywordChange: (kw: string) => void;
  onTagFilterChange: (tag: string | null) => void;
  onSortModeChange: (mode: SortMode) => void;
  onSelect: (note: Note) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionId: number) => void;
  /** 批量删除（父层负责确认/invoke/刷新；resolve=true 表示已执行删除——
   *  勾选集合在删除执行后才清空，取消确认时保留勾选——与会话管理台一致） */
  onBatchDelete: (ids: number[]) => Promise<boolean>;
  /** v0.15：折叠为窄条（父层 useColumnLayout.setManualFolded(true)） */
  onCollapse?: () => void;
}

/** 组折叠记忆读取（localStorage 损坏/无 → 默认展开） */
function readGroupFold(key: string): boolean {
  try {
    return window.localStorage.getItem(`notes:group-fold:${key}`) === "1";
  } catch {
    return false;
  }
}

export default function NoteListView({
  width = 320, notes, groups = [], groupFilter = null, onGroupFilterChange,
  keyword, tagFilter, sortMode, allTags, selectedId, status,
  noteColors, tagColors,
  onKeywordChange, onTagFilterChange, onSortModeChange, onSelect, onCreate, onRefresh, onOpenSession, onBatchDelete,
  onCollapse,
}: Props) {
  // v0.14 B：当前主题（跟随 prefers-color-scheme；jsdom 无 matchMedia 回退 light）
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );

  // v0.12.7：勾选集合（面板本地状态——结构与会话管理台 selected 一致）
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // v0.15：组折叠态（key=组 id 字符串 / "none"=未分组区；localStorage 记忆）
  const [groupFolds, setGroupFolds] = useState<Record<string, boolean>>({});

  const toggleSelect = (id: number) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // v0.12.8 审查即修：列表数据变化（搜索/标签/排序/组过滤/删除后刷新）后裁剪勾选，
  // 防止批量删除波及当前视图外的笔记——"只删可见子集"安全边界
  useEffect(() => {
    setSelected((cur) => {
      if (cur.size === 0) return cur;
      const visible = new Set(notes.map((n) => n.id));
      let changed = false;
      const next = new Set<number>();
      for (const id of cur) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : cur;
    });
  }, [notes]);

  // v0.15：组列表到达后填充折叠初始值（仅缺失 key——不覆盖用户已切换状态）
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

  // 折叠态持久化（副作用与 state 分离）
  useEffect(() => {
    try {
      for (const [k, v] of Object.entries(groupFolds)) {
        window.localStorage.setItem(`notes:group-fold:${k}`, v ? "1" : "0");
      }
    } catch {
      /* 隐私模式——记忆丢失可接受 */
    }
  }, [groupFolds]);

  const toggleGroupFold = (key: string) => setGroupFolds((cur) => ({ ...cur, [key]: !cur[key] }));

  // v0.15：树退化规则——搜索/标签/排序激活时平铺（树上下文无意义）
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

  const renderRow = (n: Note) => (
    <NoteListRow
      key={n.id}
      note={n}
      accent={paletteHex(noteColors?.[n.id] ?? null, theme)}
      selectedId={selectedId}
      checked={selected.has(n.id)}
      tagColors={tagColors}
      onSelect={onSelect}
      onToggleSelect={toggleSelect}
      onOpenSession={onOpenSession}
    />
  );

  return (
    <div style={{ width, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📝 笔记</span>
        <button
          onClick={onCreate}
          style={{ marginLeft: "auto", fontSize: 12, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#f9fafb" }}
          title="新建笔记"
        >
          + 新建
        </button>
        <button onClick={onCollapse} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="折叠列表">⟨</button>
      </div>
      <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="搜索标题/正文…"
            style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, minWidth: 0 }}
          />
          <button onClick={onRefresh} style={{ fontSize: 13, cursor: "pointer" }}>⟳</button>
        </div>
        {/* 排序 */}
        <select
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as SortMode)}
          style={{ fontSize: 12, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
        >
          <option value="updated-desc">按更新时间</option>
          <option value="pin-first">固定优先</option>
          <option value="created-desc">按创建时间</option>
        </select>
        {/* 标签过滤条 */}
        {allTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tagFilter && (
              <span
                onClick={() => onTagFilterChange(null)}
                style={{ fontSize: 11, color: "#6b7280", cursor: "pointer", border: "1px solid #d1d5db", borderRadius: 10, padding: "1px 6px", background: "#f3f4f6" }}
              >
                清除过滤 ✕
              </span>
            )}
            {allTags.map((t) => (
              <span
                key={t}
                onClick={() => onTagFilterChange(t)}
                style={{
                  fontSize: 11,
                  cursor: "pointer",
                  border: `1px solid ${tagFilter === t ? "#0d9488" : "#e5e7eb"}`,
                  borderRadius: 10,
                  padding: "1px 6px",
                  background: tagFilter === t ? "#f0fdfa" : "#f9fafb",
                  color: tagFilter === t ? "#0d9488" : "#6b7280",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {notes.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 24 }}>暂无笔记</p>}
        {/* v0.15：分组树（组头收起）——退化条件清除后还原 */}
        {treeMode && grouped ? (
          <>
            {grouped.ungrouped.length > 0 && (
              <NoteTreeSection
                title="未分组"
                count={grouped.ungrouped.length}
                accent={paletteHex(null, theme)}
                active={groupFilter === null}
                folded={groupFolds.none === true}
                onToggleFold={() => toggleGroupFold("none")}
                onSelectTitle={() => onGroupFilterChange?.(null)}
              >
                {grouped.ungrouped.map(renderRow)}
              </NoteTreeSection>
            )}
            {groups.map((g) => {
              const items = grouped.byGroup.get(g.id) ?? [];
              // 空组不渲染（组管理在组侧栏；过滤其他组时本组 0 笔记自然隐藏）
              if (items.length === 0) return null;
              const key = String(g.id);
              return (
                <NoteTreeSection
                  key={g.id}
                  title={g.name}
                  count={items.length}
                  accent={paletteHex(g.color ?? null, theme)}
                  active={groupFilter === g.id}
                  folded={groupFolds[key] === true}
                  onToggleFold={() => toggleGroupFold(key)}
                  onSelectTitle={() => onGroupFilterChange?.(groupFilter === g.id ? null : g.id)}
                >
                  {items.map(renderRow)}
                </NoteTreeSection>
              );
            })}
          </>
        ) : (
          notes.map(renderRow)
        )}
      </div>
      {/* v0.12.8：勾选批量删除栏（与会话管理台同模式——全选三态 + 计数 + 批量删除） */}
      {selected.size > 0 && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
          <input
            type="checkbox"
            ref={(el) => {
              if (el) el.indeterminate = selected.size > 0 && selected.size < notes.length;
            }}
            checked={selected.size === notes.length && notes.length > 0}
            onChange={() => {
              if (selected.size === notes.length && notes.length > 0) {
                clearSelection();
              } else {
                setSelected(new Set(notes.map((n) => n.id)));
              }
            }}
            style={{ cursor: "pointer", flexShrink: 0 }}
            title="全选当前列表的笔记"
          />
          <span style={{ fontSize: 12, color: "#374151" }}>已选 {selected.size} 个</span>
          <button
            style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #fca5a5", color: "#dc2626", background: "#fff" }}
            onClick={async () => {
              const ids = [...selected];
              if (await onBatchDelete(ids)) clearSelection();
            }}
          >
            批量删除
          </button>
          <button style={{ ...btn, marginLeft: "auto", fontSize: 11 }} onClick={clearSelection}>
            取消
          </button>
        </div>
      )}
      {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}
    </div>
  );
}
