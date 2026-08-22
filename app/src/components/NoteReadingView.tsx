/**
 * NoteReadingView — 笔记页右栏阅读视图（H5 自 NotesPage 拆分）。
 *
 * @ai-context: 大纲 + 标题栏 + 信息条 + A2 搜索条 + 内容区（编辑态由父层传入
 *              editor 元素替换；阅读态渲染 NoteMarkdown）。
 * @ai-context: M6 修复——搜索高亮计数/跳转改为只读查询 React 渲染的
 *              <mark data-note-search-hit>（高亮本身由 NoteMarkdown 数据驱动
 *              生成），不再 TreeWalker 直改 DOM；卸载无需手动清理 mark。
 * @ai-context: H3——auxPanels 插槽由 NotesPage 注入 VersionPanel/EnrichPanel，
 *              挂载于内容区滚动容器内（阅读态可见，编辑态隐藏）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Note } from "../types";
import NoteMarkdown from "./NoteMarkdown";
import { fmtDate, parseTags } from "./NoteListView";

interface Props {
  note: Note;
  editing: boolean;
  /** 编辑态替换内容区的编辑视图元素（由 NotesPage 构造 NoteEditView） */
  editor?: ReactNode;
  /** H3：版本时间线/知识补充等辅助面板插槽（阅读态显示） */
  auxPanels?: ReactNode;
  onEdit: () => void;
  onPinToggle: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
  onOpenSession: (sessionId: number) => void;
  onTaskToggle: (newContent: string) => void;
  onImageOpen: (src: string, title?: string) => void;
}

export default function NoteReadingView({
  note, editing, editor, auxPanels,
  onEdit, onPinToggle, onDelete, onTagClick, onOpenSession, onTaskToggle, onImageOpen,
}: Props) {
  // A2：搜索高亮（M6：匹配集合=渲染产物只读查询，计数经此状态驱动）
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<HTMLElement[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // v0.11.5 大纲折叠态
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);

  // ── 大纲：从 Markdown 提取标题 ──
  const outline = useMemo(() => {
    const lines = note.content.split("\n");
    const headings: { level: number; text: string; index: number }[] = [];
    lines.forEach((line, i) => {
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m) headings.push({ level: m[1].length, text: m[2], index: i });
    });
    return headings;
  }, [note.content]);

  // 点击大纲跳转
  const scrollToHeading = (index: number) => {
    const el = document.getElementById(`heading-${index}`);
    el?.scrollIntoView({ block: "start" });
  };

  // A2：收集匹配（mark 由 NoteMarkdown 数据驱动渲染——此处只读查询不修改 DOM）
  useEffect(() => {
    if (!searchActive || !searchQuery || !contentRef.current) {
      setSearchMatches([]);
      return;
    }
    const marks = Array.from(contentRef.current.querySelectorAll<HTMLElement>("mark[data-note-search-hit]"));
    setSearchMatches(marks);
    if (marks.length > 0) marks[0]?.scrollIntoView({ block: "center" });
    setSearchIndex(0);
  }, [searchActive, searchQuery, note.content, editing]);

  // 上下跳转匹配
  const jumpSearch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next = (searchIndex + dir + searchMatches.length) % searchMatches.length;
    setSearchIndex(next);
    searchMatches[next]?.scrollIntoView({ block: "center" });
  };

  const selectedTags = parseTags(note);

  return (
    <>
      {/* v0.11.5 大纲面板（可收起） */}
      {!outlineCollapsed && (
        <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid #f3f4f6", overflowY: "auto", padding: "12px 8px", background: "#fafafa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
            <span>大纲</span>
            <button
              onClick={() => setOutlineCollapsed(true)}
              style={{ fontSize: 12, color: "#9ca3af", cursor: "pointer", border: "none", background: "none", padding: "0 2px", lineHeight: 1 }}
              title="收起大纲"
            >
              ✕
            </button>
          </div>
          {outline.length === 0 && <p style={{ fontSize: 11, color: "#d1d5db" }}>无标题</p>}
          {outline.map((h, i) => (
            <div
              key={i}
              onClick={() => scrollToHeading(h.index)}
              style={{
                paddingLeft: `${(h.level - 1) * 12}px`,
                fontSize: 12,
                color: "#4b5563",
                cursor: "pointer",
                lineHeight: 1.8,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={h.text}
            >
              {h.text}
            </div>
          ))}
        </div>
      )}

      {/* 正文区 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* v0.11.5 大纲折叠悬浮按钮 */}
        {outlineCollapsed && (
          <button
            onClick={() => setOutlineCollapsed(false)}
            style={{
              position: "absolute",
              left: 8, top: 8, zIndex: 10,
              fontSize: 16, cursor: "pointer",
              padding: "4px 8px", borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              lineHeight: 1,
            }}
            title="展开大纲"
          >
            📑
          </button>
        )}
        {/* 标题栏 */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {note.pin ? "📌 " : ""}{note.title}
          </h2>
          <button
            onClick={onPinToggle}
            style={{ fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: note.pin ? "#fffbeb" : "#fff" }}
            title={note.pin ? "取消固定" : "固定"}
          >
            📌
          </button>
          <button
            onClick={onEdit}
            style={{ fontSize: 12, cursor: "pointer", padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#f0fdfa", color: "#0d9488", fontWeight: 600 }}
          >
            ✏ 编辑（Ctrl+E）
          </button>
          <button
            onClick={onDelete}
            style={{ fontSize: 12, color: "#dc2626", cursor: "pointer", padding: "4px 10px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff" }}
          >
            删除
          </button>
        </div>

        {/* 信息条：标签 + 来源 + 时间 + 版本 */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11, color: "#6b7280" }}>
          {selectedTags.map((t) => (
            <span
              key={t}
              onClick={() => onTagClick(t)}
              style={{ cursor: "pointer", color: "#0d9488", border: "1px solid #d1fae5", borderRadius: 10, padding: "1px 6px", background: "#ecfdf5" }}
            >
              #{t}
            </span>
          ))}
          <span>创建: {fmtDate(note.created_at)}</span>
          <span>· 更新: {fmtDate(note.updated_at)}</span>
          {note.session_id != null && (
            <span
              onClick={() => onOpenSession(note.session_id as number)}
              style={{ color: "#0f766e", cursor: "pointer", fontWeight: 600 }}
            >
              来源会话 →
            </span>
          )}
          {note.rule_version && <span>· 规则: {note.rule_version}</span>}
        </div>

        {/* A2：搜索高亮条 */}
        <div style={{ padding: "4px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setSearchActive((v) => !v)}
            style={{ fontSize: 11, cursor: "pointer", padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db", background: searchActive ? "#f0fdfa" : "#fff", color: searchActive ? "#0d9488" : "#6b7280" }}
          >
            🔍 {searchActive ? "关闭搜索" : "搜索"}
          </button>
          {searchActive && (
            <>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="在笔记中搜索…"
                style={{ flex: 1, maxWidth: 240, padding: "3px 6px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4 }}
                autoFocus
              />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                {searchMatches.length > 0 ? `${searchIndex + 1}/${searchMatches.length}` : "无匹配"}
              </span>
              <button onClick={() => jumpSearch(1)} style={{ fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#4b5563" }}>↓</button>
              <button onClick={() => jumpSearch(-1)} style={{ fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#4b5563" }}>↑</button>
            </>
          )}
        </div>

        {/* M3：编辑态 → 父层编辑视图；阅读态 → Markdown 渲染（+H3 辅助面板） */}
        {editing ? (
          editor
        ) : (
          <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: 16, fontSize: 14, lineHeight: 1.8 }}>
            {auxPanels}
            <NoteMarkdown
              note={note}
              searchQuery={searchActive ? searchQuery : ""}
              onTaskToggle={onTaskToggle}
              onOpenSession={onOpenSession}
              onImageOpen={onImageOpen}
            />
          </div>
        )}
      </div>
    </>
  );
}
