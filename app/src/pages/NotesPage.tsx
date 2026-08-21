/**
 * NotesPage — v0.10.0 笔记独立页面（阅读视图 + 大纲 + 标签 + 信息条 + A2 搜索高亮）。
 *
 * @ai-context: 左栏搜索/标签过滤/排序/笔记列表，右栏 Markdown 渲染阅读视图。
 * @ai-context: v0.7.1（会话体验）：focusNoteId 跨页直达；session_id 非空显示「来源会话 →」。
 * @ai-context: v0.10.0（笔记能力建设）：替换 `<pre>` 源码预览为 react-markdown 全渲染；
 *              新增 tags/properties/pin 数据模型；大纲面板；A2 Ctrl+F 搜索高亮。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Note } from "../types";
import NoteEditView from "../components/NoteEditView";
import NoteImage from "../components/NoteImage";
import ImagePreviewOverlay from "../components/ImagePreviewOverlay";
import { useNoteAttention } from "../components/useNoteAttention";

interface Props {
  focusNoteId?: number | null;
  onOpenSessions?: (sessionId: number) => void;
}

type SortMode = "updated-desc" | "pin-first" | "created-desc";

/** 解析 tags JSON 为字符串数组 */
function parseTags(note: Note): string[] {
  try {
    const t = JSON.parse(note.tags);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/** 格式化 unix 秒为日期字符串 */
function fmtDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

export default function NotesPage({ focusNoteId, onOpenSessions }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated-desc");
  const [selected, setSelected] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  // A2：搜索高亮
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<HTMLElement[]>([]);
  // M3：编辑态
  const [editing, setEditing] = useState(false);
  // v0.10.1：图片点击放大预览（复用 ImagePreviewOverlay）
  const [previewImg, setPreviewImg] = useState<{ src: string; title?: string } | null>(null);
  const seqRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // A6：注意力跟踪
  useNoteAttention(selected?.id ?? null, selected?.title ?? "");

  // ── 加载笔记列表 ──
  const load = useCallback(async (kw: string, tag: string | null, sort: SortMode) => {
    const seq = ++seqRef.current;
    try {
      if (tag) {
        const list = await invoke<Note[]>("search_notes", { keyword: "", tag });
        if (seqRef.current === seq) setNotes(list);
      } else if (kw) {
        const list = await invoke<Note[]>("search_notes", { keyword: kw, tag: null as string | null });
        if (seqRef.current === seq) setNotes(list);
      } else {
        const list = await invoke<Note[]>("list_notes", { sortMode: sort });
        if (seqRef.current === seq) setNotes(list);
      }
    } catch (e) {
      if (seqRef.current === seq) setStatus(`加载失败: ${e}`);
    }
  }, []);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => void load(keyword, tagFilter, sortMode), 300);
    return () => clearTimeout(timer);
  }, [keyword, tagFilter, sortMode, load]);

  // focusNoteId 跨页直达
  useEffect(() => {
    if (focusNoteId == null) return;
    let disposed = false;
    (async () => {
      setKeyword("");
      setTagFilter(null);
      const seq = ++seqRef.current;
      try {
        const list = await invoke<Note[]>("list_notes", { sortMode: "updated-desc" });
        if (disposed || seqRef.current !== seq) return;
        setNotes(list);
        const target = list.find((n) => n.id === focusNoteId);
        if (target) {
          setSelected(target);
          setTimeout(() => {
            document.getElementById(`note-row-${target.id}`)?.scrollIntoView({ block: "center" });
          }, 50);
        }
      } catch (e) {
        if (!disposed) setStatus(`加载失败: ${e}`);
      }
    })();
    return () => { disposed = true; };
  }, [focusNoteId]);

  // v0.10.1 F5：Ctrl+E 进入 / ESC 退出编辑——单一 window 监听 + ref 持有
  // 最新状态（原实现依赖 [selected, editing] 反复解绑重绑，存在竞态窗口）
  const editingRef = useRef(editing);
  const selectedRef = useRef(selected);
  useEffect(() => { editingRef.current = editing; }, [editing]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "e" && selectedRef.current && !editingRef.current) {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === "Escape" && editingRef.current) {
        e.preventDefault();
        setEditing(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── 操作 ──
  const runDelete = async (id: number) => {
    try {
      await invoke<boolean>("delete_note", { id });
      if (selected?.id === id) setSelected(null);
      void load(keyword, tagFilter, sortMode);
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    }
  };

  const runPinToggle = async (note: Note) => {
    try {
      const newPin = note.pin ? 0 : 1;
      await invoke<boolean>("update_note_pin", { id: note.id, pin: newPin });
      setSelected((prev) => prev?.id === note.id ? { ...prev, pin: newPin } : prev);
      void load(keyword, tagFilter, sortMode);
    } catch (e) {
      setStatus(`固定操作失败: ${e}`);
    }
  };

  // A2：搜索高亮匹配
  useEffect(() => {
    if (!searchActive || !searchQuery || !contentRef.current) {
      setSearchMatches([]);
      return;
    }
    const root = contentRef.current;
    const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const matches: HTMLElement[] = [];
    const texts: { node: Text }[] = [];
    while (treeWalker.nextNode()) {
      const textNode = treeWalker.currentNode as Text;
      if (!["SCRIPT", "STYLE", "CODE"].includes(textNode.parentElement?.tagName || "")) {
        texts.push({ node: textNode });
      }
    }
    // 用正则搜索每个文本节点
    const re = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    texts.forEach(({ node }) => {
      const text = node.textContent || "";
      let match;
      while ((match = re.exec(text)) !== null) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const span = document.createElement("mark");
        span.style.background = "#fde68a";
        span.style.borderRadius = "2px";
        span.style.padding = "0 1px";
        range.surroundContents(span);
        matches.push(span);
      }
    });
    setSearchMatches(matches);
    if (matches.length > 0) {
      matches[0]?.scrollIntoView({ block: "center" });
    }
    setSearchIndex(0);
    return () => {
      // 清理：展开 mark 标签
      matches.forEach((m) => {
        const p = m.parentNode;
        if (p) {
          while (m.firstChild) p.insertBefore(m.firstChild, m);
          p.removeChild(m);
        }
      });
    };
  }, [searchActive, searchQuery, selected?.content]);

  // 上下跳转匹配
  const jumpSearch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next = (searchIndex + dir + searchMatches.length) % searchMatches.length;
    setSearchIndex(next);
    searchMatches[next]?.scrollIntoView({ block: "center" });
  };

  // ── 收集所有标签 ──
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => parseTags(n).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  // ── 大纲：从 Markdown 提取标题 ──
  const outline = useMemo(() => {
    if (!selected) return [];
    const lines = selected.content.split("\n");
    const headings: { level: number; text: string; index: number }[] = [];
    lines.forEach((line, i) => {
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m) headings.push({ level: m[1].length, text: m[2], index: i });
    });
    return headings;
  }, [selected]);

  // 点击大纲跳转
  const scrollToHeading = (index: number) => {
    const el = document.getElementById(`heading-${index}`);
    el?.scrollIntoView({ block: "start" });
  };

  // ── 获取所有标签（当前选中笔记） ──
  const selectedTags = selected ? parseTags(selected) : [];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左栏：搜索 + 标签过滤 + 排序 + 列表 ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📝 笔记</span>
          <button
            onClick={() => {
              const title = prompt("笔记标题：", "未命名笔记");
              if (!title) return;
              invoke<Note>("create_note", { new: { title, content: "", source: "manual" } })
                .then((n) => {
                  setSelected(n);
                  // v0.10.1 F1：新建即编辑（v0.10.0 P0-3 规划补全）——
                  // 若此前在编辑其他笔记，NoteEditView key 变化触发卸载保存
                  setEditing(true);
                  void load(keyword, tagFilter, sortMode);
                })
                .catch((e) => setStatus(`新建失败: ${e}`));
            }}
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
              onChange={(e) => { setKeyword(e.target.value); setTagFilter(null); }}
              placeholder="搜索标题/正文…"
              style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6 }}
            />
            <button onClick={() => void load(keyword, tagFilter, sortMode)} style={{ fontSize: 13, cursor: "pointer" }}>⟳</button>
          </div>
          {/* 排序 */}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
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
                  onClick={() => setTagFilter(null)}
                  style={{ fontSize: 11, color: "#6b7280", cursor: "pointer", border: "1px solid #d1d5db", borderRadius: 10, padding: "1px 6px", background: "#f3f4f6" }}
                >
                  清除过滤 ✕
                </span>
              )}
              {allTags.map((t) => (
                <span
                  key={t}
                  onClick={() => { setTagFilter(t); setKeyword(""); }}
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
                onClick={() => {
                  // v0.10.1 F1：切笔记先退出编辑态（NoteEditView 卸载自动保存
                  // dirty 草稿——防旧内容串写进新笔记；key 重建双保险）
                  setSelected(n);
                  setEditing(false);
                }}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid #f3f4f6",
                  cursor: "pointer",
                  background: selected?.id === n.id ? "#f0fdfa" : "transparent",
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
                      onClick={(e) => { e.stopPropagation(); onOpenSessions?.(n.session_id as number); }}
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

      {/* ── 右栏：阅读视图 ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", overflow: "hidden" }}>
        {selected ? (
          <>
            {/* 大纲面板 */}
            <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid #f3f4f6", overflowY: "auto", padding: "12px 8px", background: "#fafafa" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>大纲</div>
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

            {/* 正文区 */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* 标题栏 */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {selected.pin ? "📌 " : ""}{selected.title}
                </h2>
                <button
                  onClick={() => runPinToggle(selected)}
                  style={{ fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: selected.pin ? "#fffbeb" : "#fff" }}
                  title={selected.pin ? "取消固定" : "固定"}
                >
                  📌
                </button>
                <button
                  onClick={() => setEditing(true)}
                  style={{ fontSize: 12, cursor: "pointer", padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#f0fdfa", color: "#0d9488", fontWeight: 600 }}
                >
                  ✏ 编辑（Ctrl+E）
                </button>
                <button
                  onClick={() => runDelete(selected.id)}
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
                    onClick={() => { setTagFilter(t); setKeyword(""); }}
                    style={{ cursor: "pointer", color: "#0d9488", border: "1px solid #d1fae5", borderRadius: 10, padding: "1px 6px", background: "#ecfdf5" }}
                  >
                    #{t}
                  </span>
                ))}
                <span>创建: {fmtDate(selected.created_at)}</span>
                <span>· 更新: {fmtDate(selected.updated_at)}</span>
                {selected.session_id != null && (
                  <span
                    onClick={() => onOpenSessions?.(selected.session_id as number)}
                    style={{ color: "#0f766e", cursor: "pointer", fontWeight: 600 }}
                  >
                    来源会话 →
                  </span>
                )}
                {selected.rule_version && <span>· 规则: {selected.rule_version}</span>}
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

              {/* M3：编辑态 → 显示编辑视图；阅读态 → Markdown 渲染 */}
              {editing ? (
                <NoteEditView
                  key={selected.id}
                  note={selected}
                  onCancel={() => {
                    setEditing(false);
                    void load(keyword, tagFilter, sortMode);
                  }}
                />
              ) : (
              <div
                ref={contentRef}
                style={{ flex: 1, overflowY: "auto", padding: 16, fontSize: 14, lineHeight: 1.8 }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    // 任务列表勾选
                    input: ({ node, ...props }) => (
                      <input
                        {...props}
                        onChange={(e) => {
                          // 勾选回写 content
                          const checked = e.target.checked;
                          const lines = selected.content.split("\n");
                          const newLines = lines.map((line) => {
                            if (checked && line.match(/^\s*- \[ \]/)) {
                              return line.replace("- [ ]", "- [x]");
                            } else if (!checked && line.match(/^\s*- \[x\]/)) {
                              return line.replace("- [x]", "- [ ]");
                            }
                            return line;
                          });
                          const newContent = newLines.join("\n");
                          setSelected((prev) => prev ? { ...prev, content: newContent } : prev);
                          // 异步保存（不建版本——v0.10.1 F2 接通 create_version）
                          invoke("update_note", { id: selected.id, title: selected.title, content: newContent, createVersion: false }).catch(() => {});
                        }}
                      />
                    ),
                    // 标题锚点供大纲跳转
                    h1: ({ node, children, ...props }) => {
                      const idx = selected.content.split("\n").findIndex((l) => l.startsWith("# ") && l.slice(2).trim() === (children as string)?.trim());
                      return <h1 id={`heading-${idx}`} {...props} style={{ fontSize: 20, margin: "16px 0 8px", borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>{children}</h1>;
                    },
                    h2: ({ node, children, ...props }) => {
                      const idx = selected.content.split("\n").findIndex((l) => l.startsWith("## ") && l.slice(3).trim() === (children as string)?.trim());
                      return <h2 id={`heading-${idx}`} {...props} style={{ fontSize: 17, margin: "14px 0 6px" }}>{children}</h2>;
                    },
                    h3: ({ node, children, ...props }) => {
                      const idx = selected.content.split("\n").findIndex((l) => l.startsWith("### ") && l.slice(4).trim() === (children as string)?.trim());
                      return <h3 id={`heading-${idx}`} {...props} style={{ fontSize: 15, margin: "12px 0 4px", color: "#374151" }}>{children}</h3>;
                    },
                    // 时间戳回链渲染（P1/A5 预览预备）
                    a: ({ node, href, children, ...props }) => {
                      const tsMatch = href?.match(/^\[\[ts:(\d+)\]\]$/);
                      if (tsMatch) {
                        const ms = parseInt(tsMatch[1]);
                        const sec = Math.floor(ms / 1000);
                        const min = Math.floor(sec / 60);
                        const secStr = String(sec % 60).padStart(2, "0");
                        return (
                          <span
                            style={{ cursor: "pointer", color: "#0d9488", borderBottom: "1px dashed #14b8a6", background: "#f0fdfa", borderRadius: 3, padding: "0 4px" }}
                            onClick={() => {
                              if (selected.session_id) onOpenSessions?.(selected.session_id as number);
                            }}
                            title={`⏱ 跳转到会话 ${Math.floor(ms / 60000)}:${secStr} 处 —— 点击查看视频对应片段`}
                          >
                            ⏱ {min}:{secStr}
                          </span>
                        );
                      }
                      return <a href={href} {...props} style={{ color: "#2563eb" }}>{children}</a>;
                    },
                    // 代码块
                    code: ({ node, className, children, ...props }) => {
                      const isInline = !className;
                      if (isInline) {
                        return <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3, fontSize: 13 }} {...props}>{children}</code>;
                      }
                      return (
                        <pre style={{ background: "#1f2937", color: "#e5e7eb", borderRadius: 6, padding: 12, overflowX: "auto", fontSize: 13 }}>
                          <code className={className} {...props}>{children}</code>
                        </pre>
                      );
                    },
                    // 表格
                    table: ({ node, ...props }) => (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }} {...props} />
                      </div>
                    ),
                    th: ({ node, ...props }) => <th style={{ border: "1px solid #d1d5db", padding: "6px 10px", background: "#f9fafb", fontWeight: 600 }} {...props} />,
                    td: ({ node, ...props }) => <td style={{ border: "1px solid #d1d5db", padding: "6px 10px" }} {...props} />,
                    // 图片（v0.10.1：本地相对引用经 resolve+convertFileSrc，
                    // 点击放大；外部 URL 直出）
                    img: ({ src, alt }) => (
                      <NoteImage
                        src={src ?? ""}
                        alt={alt ?? ""}
                        noteId={selected.id}
                        onOpen={(url, title) => setPreviewImg({ src: url, title })}
                      />
                    ),
                    // 引用
                    blockquote: ({ node, ...props }) => (
                      <blockquote style={{ borderLeft: "3px solid #0d9488", margin: "8px 0", padding: "4px 12px", color: "#6b7280", background: "#f9fafb" }} {...props} />
                    ),
                  }}
                >
                  {selected.content}
                </ReactMarkdown>
              </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            从左侧选择一条笔记查看
          </div>
        )}
      </div>
      {/* v0.10.1：图片放大预览（ESC/点击遮罩关闭——与编辑退出 ESC 互斥：
        编辑态无 Markdown 渲染，预览只存在于阅读态） */}
      {previewImg && (
        <ImagePreviewOverlay src={previewImg.src} title={previewImg.title} onClose={() => setPreviewImg(null)} />
      )}
    </div>
  );
}