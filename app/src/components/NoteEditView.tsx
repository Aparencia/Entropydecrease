/**
 * NoteEditView — v0.10.0 笔记编辑视图（M3 + A1 段落操作）。
 *
 * @ai-context: 源码编辑（textarea）+ 轻量工具栏 + 快捷键 + 自动/显式保存。
 *              A1：Ctrl+Shift+↑↓ 提升/降低标题层级、Ctrl+Shift+M 合并段、Ctrl+Shift+S 拆分段。
 *              工具栏按钮插入 Markdown 语法片段。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Note } from "../types";

interface Props {
  note: Note;
  onCancel: () => void;
}

/** 在 textarea 光标位置插入文本 */
function insertAtCursor(ta: HTMLTextAreaElement, text: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.substring(0, start);
  const after = ta.value.substring(end);
  ta.value = before + text + after;
  const pos = start + text.length;
  ta.setSelectionRange(pos, pos);
  ta.focus();
}

/** 包裹选中文本 */
function wrapSelection(ta: HTMLTextAreaElement, before: string, after: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.substring(start, end);
  const newText = before + selected + after;
  const fullBefore = ta.value.substring(0, start);
  const fullAfter = ta.value.substring(end);
  ta.value = fullBefore + newText + fullAfter;
  ta.setSelectionRange(start + before.length, start + before.length + selected.length);
  ta.focus();
}

const TOOLBAR_BTN: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: "#fff",
  color: "#374151",
};

export default function NoteEditView({ note, onCancel }: Props) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v0.10.1 F1：卸载自动保存用的最新值快照（unmount 时 state 闭包不可靠）
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const dirtyRef = useRef(false);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // 自动保存：每 30s 有改动保存（不建版本）
  useEffect(() => {
    if (!dirty) return;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      saveDraft(false);
    }, 30000);
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [dirty, content, title]);

  const saveDraft = useCallback(async (createVersion: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      // v0.10.1 F2：createVersion 真正传后端——false=轻量保存不建版本
      await invoke("update_note", { id: note.id, title, content, createVersion });
      setDirty(false);
      if (createVersion) {
        setStatus("✅ 已保存（建版本）");
      }
    } catch (e) {
      setStatus(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [note.id, title, content, saving]);

  // Ctrl+S 显式保存（建版本）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ta = taRef.current;
    if (!ta) return;

    // Ctrl+S → 保存建版本
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      void saveDraft(true);
      return;
    }

    // Ctrl+E → 退出编辑
    if (e.ctrlKey && e.key === "e") {
      e.preventDefault();
      saveDraft(false).then(() => onCancel());
      return;
    }

    // A1：段落级操作
    if (e.ctrlKey && e.shiftKey) {
      const selStart = ta.selectionStart;
      const selEnd = ta.selectionEnd;
      const lines = content.split("\n");
      // 找到光标所在行的行号
      let lineIdx = 0;
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length + (i > 0 ? 1 : 0) > selStart) {
          lineIdx = i;
          break;
        }
        charCount += lines[i].length + (i > 0 ? 1 : 0);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        // 提升标题层级（减 #）
        const line = lines[lineIdx];
        const m = line.match(/^(#{2,6})\s/);
        if (m) {
          lines[lineIdx] = line.replace(/^#/, "");
        } else if (line.startsWith("# ")) {
          // 已经是 H1，降为普通段落
          lines[lineIdx] = line.replace(/^#\s+/, "");
        }
        setContent(lines.join("\n"));
        setDirty(true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        // 降低标题层级（加 #）
        const line = lines[lineIdx];
        const m = line.match(/^(#{1,5})\s/);
        if (m) {
          lines[lineIdx] = "#" + line;
        } else {
          // 普通段落变为 H6
          lines[lineIdx] = "###### " + line;
        }
        setContent(lines.join("\n"));
        setDirty(true);
      } else if (e.key === "M") {
        e.preventDefault();
        // 合并选中段（从选中位置开始合并连续段落）
        if (selStart !== selEnd) {
          // 有选中文本 → 直接移除换行
          const selected = ta.value.substring(selStart, selEnd);
          const merged = selected.replace(/\n+/g, " ");
          const newContent = ta.value.substring(0, selStart) + merged + ta.value.substring(selEnd);
          setContent(newContent);
          setDirty(true);
        }
      } else if (e.key === "S") {
        e.preventDefault();
        // 拆分段落：在光标处插入换行
        const before = content.substring(0, selStart);
        const after = content.substring(selStart);
        setContent(before + "\n" + after);
        setDirty(true);
      }
    }
  }, [content, note.id, saveDraft, onCancel]);

  // 工具栏操作（v0.10.1：local-image 需异步导入——dialog 选文件后复制进
  // data_dir 再插入相对引用；import 失败明确提示不落脏数据）
  const toolbarAction = async (action: string) => {
    const ta = taRef.current;
    if (!ta) return;
    switch (action) {
      case "bold": wrapSelection(ta, "**", "**"); break;
      case "italic": wrapSelection(ta, "*", "*"); break;
      case "h1": wrapSelection(ta, "# ", ""); break;
      case "h2": wrapSelection(ta, "## ", ""); break;
      case "h3": wrapSelection(ta, "### ", ""); break;
      case "ul": wrapSelection(ta, "- ", ""); break;
      case "ol": wrapSelection(ta, "1. ", ""); break;
      case "quote": wrapSelection(ta, "> ", ""); break;
      case "code": wrapSelection(ta, "```\n", "\n```"); break;
      case "table": insertAtCursor(ta, "\n| 标题 | 内容 |\n|------|------|\n| 行1  | 值1  |\n"); break;
      case "link": {
        const url = prompt("链接地址：", "https://");
        if (url) wrapSelection(ta, "[", `](${url})`);
        break;
      }
      case "latex": wrapSelection(ta, "$", "$"); break;
      case "image": {
        // 外部链接图（保留原 prompt URL 入口）
        const alt = prompt("图片描述：") || "";
        const url = prompt("图片链接：", "https://");
        if (url) insertAtCursor(ta, `![${alt}](${url})\n`);
        break;
      }
      case "local-image": {
        // v0.10.1：本地文件 → 复制进 notes-images/{nid}/ → 相对引用插入
        const file = await open({
          multiple: false,
          filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
        });
        if (typeof file !== "string") return;
        try {
          const rel = await invoke<string>("import_note_image", { noteId: note.id, sourcePath: file });
          insertAtCursor(ta, `![图片](${rel})\n`);
        } catch (e) {
          setStatus(`插入失败: ${e}`);
          return;
        }
        break;
      }
    }
    setDirty(true);
    ta.focus();
  };

  // 失焦自动保存
  const handleBlur = () => {
    if (dirty) void saveDraft(false);
  };

  // 完成编辑（保存草稿后退出——v0.10.1 F4：原「取消」语义矛盾，改名诚实化）
  const handleDone = () => {
    if (dirty) void saveDraft(false);
    onCancel();
  };

  // v0.10.1 F1：卸载时 dirty 自动保存（切笔记/切页不丢编辑内容——
  // 防串写修复的保存侧；串写侧由 NotesPage 退出编辑态 + key 重建兜底）
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        void invoke("update_note", {
          id: note.id,
          title: titleRef.current,
          content: contentRef.current,
          createVersion: false,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 工具栏 */}
      <div style={{ padding: "6px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", background: "#fafafa" }}>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("bold")} title="粗体 Ctrl+B"><b>B</b></button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("italic")} title="斜体 Ctrl+I"><i>I</i></button>
        <span style={{ width: 1, height: 20, background: "#d1d5db" }} />
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("h1")} title="标题1">H1</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("h2")} title="标题2">H2</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("h3")} title="标题3">H3</button>
        <span style={{ width: 1, height: 20, background: "#d1d5db" }} />
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("ul")} title="无序列表">• 列表</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("ol")} title="有序列表">1. 列表</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("quote")} title="引用">❝ 引用</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("code")} title="代码块">&lt;/&gt;</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("table")} title="表格">⊞ 表格</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("link")} title="链接">🔗</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("local-image")} title="插入本地图片（复制进应用数据目录）">🖼 图片</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("image")} title="插入外部链接图">🌐 链接图</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("latex")} title="LaTeX">Σ</button>
        <span style={{ flex: 1 }} />
        {/* A1段落操作提示 */}
        <span style={{ fontSize: 10, color: "#9ca3af" }}>Ctrl+Shift+↑↓层级 · M合并 · S拆分</span>
        <span style={{ width: 1, height: 20, background: "#d1d5db" }} />
        <button
          onClick={() => void saveDraft(true)}
          style={{ ...TOOLBAR_BTN, background: "#0d9488", color: "#fff", border: "none", fontWeight: 600 }}
          disabled={saving}
        >
          {saving ? "保存中…" : "💾 保存（Ctrl+S）"}
        </button>
        <button onClick={handleDone} style={{ ...TOOLBAR_BTN, color: "#6b7280" }}>完成（Ctrl+E）</button>
      </div>

      {/* 标题 */}
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
        style={{ padding: "10px 16px", fontSize: 16, fontWeight: 600, border: "none", borderBottom: "1px solid #e5e7eb", outline: "none", width: "100%" }}
        placeholder="笔记标题"
      />

      {/* 编辑器 */}
      <textarea
        ref={taRef}
        value={content}
        onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{ flex: 1, padding: 16, fontSize: 14, lineHeight: 1.8, border: "none", outline: "none", resize: "none", fontFamily: "monospace", background: "#fcfcfc" }}
        placeholder="在此编辑笔记内容…"
      />

      {status && <p style={{ padding: "4px 16px", fontSize: 12, color: "#047857" }}>{status}</p>}
    </div>
  );
}