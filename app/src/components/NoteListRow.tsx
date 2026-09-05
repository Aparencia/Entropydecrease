/**
 * NoteListRow — 笔记列表行（v0.15 自 NoteListView 拆出；REQ-287 v0.19.7 重构）。
 *
 * @ai-context: 行 id=`note-row-{id}` 供 focusNoteId 跨页直达滚动定位。
 * @ai-context: REQ-287 交互矩阵——行内 checkbox 移除：单击=打开（右栏读，
 *              selectionMode 下由父层改判为勾选）；Ctrl/⌘+单击=加/减选（不
 *              换右栏）；Shift+单击=区间选（父层按列表位置）。多选态视觉=
 *              靛蓝底 + ✓ 前缀（替代勾选框）。拖拽源：本行（未选集）或多选
 *              整组（选中态行拖任一行=整体带走）——载荷 text/note-ids JSON +
 *              单 id 兜底；行间落点经 onDropOnRow 上抛（组内手动排序，父层
 *              判定启用手排/禁入）。
 */
import { useMemo } from "react";
import type { Note } from "../types";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import { fmtDate, parseTags } from "../utils/noteHelpers";
import { crateDndWriteIds } from "./NoteTreeSection";

interface Props {
  note: Note;
  /** 行左侧色条（父层 resolveNoteColor 解析结果） */
  accent: string;
  /** 当前打开（右栏阅读）的笔记 id——teal 高亮优先 */
  openId: number | null;
  /** 本行是否在多选集内（靛蓝高亮 + ✓ 前缀） */
  multiSelected: boolean;
  tagColors?: Record<string, string>;
  /** 单击打开/右栏读（父层在批量选择模式下改判勾选） */
  onOpen: (note: Note) => void;
  /** Ctrl/⌘+单击=增删选集；Shift+单击=区间选（均不换右栏） */
  onModifierClick: (note: Note, ctrl: boolean, shift: boolean) => void;
  /** 拖拽行载荷（多选整组=选集 ids；未选中态=单行 id） */
  dragIds: number[];
  /** 行间落点（组内手动排序；父层判定——仅树模式传入） */
  onDropOnRow?: (ids: number[], targetId: number, before: boolean) => void;
  onOpenSession: (sessionId: number) => void;
  /** v0.16.1：右键菜单打开（父层持有坐标/状态；原生菜单已全局禁用） */
  onContextMenu?: (e: React.MouseEvent, note: Note) => void;
}

export default function NoteListRow({
  note, accent, openId, multiSelected, tagColors, onOpen, onModifierClick,
  dragIds, onDropOnRow, onOpenSession, onContextMenu,
}: Props) {
  const tags = parseTags(note);
  // v0.14 B：当前主题（跟随 prefers-color-scheme；jsdom 无 matchMedia 回退 light）
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );
  const isOpen = openId === note.id;
  return (
    <div
      id={`note-row-${note.id}`}
      data-testid={`note-row-${note.id}`}
      draggable
      onDragStart={(e) => {
        // REQ-287：多选整组拖走（dragIds=选集）；未选中态=单行（左栏归组兼容）
        crateDndWriteIds(e.dataTransfer, dragIds.length > 0 ? dragIds : [note.id]);
      }}
      onDragOver={(e) => {
        if (!onDropOnRow) return;
        const types = e.dataTransfer.types;
        if (!types.includes("text/note-ids") && !types.includes("text/note-id")) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        if (!onDropOnRow) return;
        e.preventDefault();
        e.stopPropagation();
        const raw = e.dataTransfer.getData("text/note-ids");
        let ids: number[] = [];
        try {
          const arr: unknown = JSON.parse(raw);
          if (Array.isArray(arr)) ids = arr.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0);
        } catch { /* 兜底单 id */ }
        if (ids.length === 0) {
          const single = Number(e.dataTransfer.getData("text/note-id"));
          if (Number.isInteger(single) && single > 0) ids = [single];
        }
        if (ids.length === 0 || ids.includes(note.id)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onDropOnRow(ids, note.id, e.clientY < rect.top + rect.height / 2);
      }}
      onContextMenu={(e) => {
        // v0.16.1：应用内右键菜单——抑制原生菜单 + 上抛坐标（多选语义父层裁决）
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, note);
      }}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) onModifierClick(note, true, false);
        else if (e.shiftKey) onModifierClick(note, false, true);
        else onOpen(note);
      }}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid #f3f4f6",
        borderLeft: `4px solid ${accent}`,
        cursor: "pointer",
        background: isOpen ? "#f0fdfa" : multiSelected ? "#eef2ff" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {multiSelected ? (
          <span style={{ fontSize: 11, color: "#4f46e5", fontWeight: 700, flexShrink: 0 }}>✓</span>
        ) : (
          <span style={{ width: 11, flexShrink: 0 }} />
        )}
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
