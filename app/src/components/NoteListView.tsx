/**
 * NoteListView — 笔记页左栏：搜索 + 标签过滤 + 排序 + 笔记列表（H5 自 NotesPage 拆分）。
 *
 * @ai-context: 纯展示/受控组件——数据与状态全部由 NotesPage 编排（参照
 *              SessionsPage → SessionListPanel/SessionDetailPanel 既有模式）。
 *              行 id=`note-row-{id}` 供 focusNoteId 跨页直达滚动定位。
 */
import type { Note } from "../types";

export type SortMode = "updated-desc" | "pin-first" | "created-desc";

/** 解析 tags JSON 为字符串数组（损坏 JSON 回退空数组——防御性） */
export function parseTags(note: Note): string[] {
  try {
    const t = JSON.parse(note.tags);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/** 格式化 unix 秒为日期字符串 */
export function fmtDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

interface Props {
  notes: Note[];
  keyword: string;
  tagFilter: string | null;
  sortMode: SortMode;
  allTags: string[];
  selectedId: number | null;
  status: string;
  onKeywordChange: (kw: string) => void;
  onTagFilterChange: (tag: string | null) => void;
  onSortModeChange: (mode: SortMode) => void;
  onSelect: (note: Note) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionId: number) => void;
}

export default function NoteListView({
  notes, keyword, tagFilter, sortMode, allTags, selectedId, status,
  onKeywordChange, onTagFilterChange, onSortModeChange, onSelect, onCreate, onRefresh, onOpenSession,
}: Props) {
  return (
    <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📝 笔记</span>
        <button
          onClick={onCreate}
          style={{ marginLeft: "auto", fontSize: 12, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#f9fafb" }}
          title="新建笔记"
        >
          + 新建
        </button>
      </div>
      <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="搜索标题/正文…"
            style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6 }}
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
        {notes.map((n) => {
          const tags = parseTags(n);
          return (
            <div
              key={n.id}
              id={`note-row-${n.id}`}
              onClick={() => onSelect(n)}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #f3f4f6",
                cursor: "pointer",
                background: selectedId === n.id ? "#f0fdfa" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {n.pin ? <span style={{ fontSize: 11, color: "#b45309" }}>📌</span> : null}
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                  {n.title}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                <span>{n.source === "classroom" ? "📡 课堂" : "✍ 手动"} · {fmtDate(n.updated_at)}</span>
                {tags.slice(0, 3).map((t) => (
                  <span key={t} style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", borderRadius: 8, padding: "0 4px" }}>{t}</span>
                ))}
                {tags.length > 3 && <span style={{ fontSize: 10, color: "#9ca3af" }}>+{tags.length - 3}</span>}
                {n.session_id != null && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onOpenSession(n.session_id as number); }}
                    style={{ fontSize: 11, color: "#0f766e", cursor: "pointer", fontWeight: 600 }}
                    title="跳转到来源会话"
                  >
                    来源会话 →
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}
    </div>
  );
}
