/**
 * NoteListRow — 笔记列表行（v0.15 自 NoteListView 拆出——树态/平铺共用）。
 *
 * @ai-context: 行 id=`note-row-{id}` 供 focusNoteId 跨页直达滚动定位；
 *              拖拽源（组行为 drop target，move_note_to_group 命令）；
 *              勾选/固定/标签/来源会话跳转保持 v0.12.x 语义不变。
 */
import { useMemo } from "react";
import type { Note } from "../types";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import { fmtDate, parseTags } from "../utils/noteHelpers";

interface Props {
  note: Note;
  /** 行左侧色条（父层 resolveNoteColor 解析结果） */
  accent: string;
  selectedId: number | null;
  checked: boolean;
  tagColors?: Record<string, string>;
  onSelect: (note: Note) => void;
  onToggleSelect: (id: number) => void;
  onOpenSession: (sessionId: number) => void;
}

export default function NoteListRow({
  note, accent, selectedId, checked, tagColors, onSelect, onToggleSelect, onOpenSession,
}: Props) {
  const tags = parseTags(note);
  // v0.14 B：当前主题（跟随 prefers-color-scheme；jsdom 无 matchMedia 回退 light）
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );
  return (
    <div
      id={`note-row-${note.id}`}
      draggable
      onDragStart={(e) => {
        // v0.14 C1：拖拽归组——笔记卡片为 drag source（组行为 drop target）
        e.dataTransfer.setData("text/note-id", String(note.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSelect(note)}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid #f3f4f6",
        borderLeft: `4px solid ${accent}`,
        cursor: "pointer",
        background: selectedId === note.id ? "#f0fdfa" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(note.id)}
          style={{ cursor: "pointer", flexShrink: 0 }}
          title="勾选后可批量删除"
        />
        {note.pin ? <span style={{ fontSize: 11, color: "#b45309" }}>📌</span> : null}
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {note.title}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
        <span>{note.source === "classroom" ? "📡 课堂" : "✍ 手动"} · {fmtDate(note.updated_at)}</span>
        {tags.slice(0, 3).map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10, color: "#6b7280", borderRadius: 8, padding: "0 4px",
              // v0.14 B：标签色徽标底色（tagColors 命中用色板色 13% 透明底；否则默认灰底）
              background: tagColors?.[t] ? `${paletteHex(tagColors[t], theme)}22` : "#f3f4f6",
            }}
          >
            {t}
          </span>
        ))}
        {tags.length > 3 && <span style={{ fontSize: 10, color: "#9ca3af" }}>+{tags.length - 3}</span>}
        {note.session_id != null && (
          <span
            onClick={(e) => { e.stopPropagation(); onOpenSession(note.session_id as number); }}
            style={{ fontSize: 11, color: "#0f766e", cursor: "pointer", fontWeight: 600 }}
            title="跳转到来源会话"
          >
            来源会话 →
          </span>
        )}
      </div>
    </div>
  );
}
