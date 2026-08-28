/**
 * RichEditorView — v0.14 子项目 A 编辑器容器（CodeMirror 6 增强编辑）。
 *
 * @ai-context: 替代 NoteEditView 的编辑角色（NotesPage 编辑态插槽，spec §3.1）：
 *              CM 富编辑（图片内联/语法高亮/折叠/Ctrl+Z 撤销）＋工具栏（CM
 *              transaction 天然进撤销栈）＋保存（双计时器 + 草稿层经
 *              useNoteAutosave 统一管理）＋降级护栏（CM 初始化失败回退
 *              NoteEditView textarea——编辑器是核心资产，渲染层失败不可用）。
 *              退出三出口（完成/Ctrl+E/ESC）统一走 flushLatest（v0.13.6 教训：
 *              先 await 落库再刷新，防竞态重演）。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import type { Note } from "../types";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useNoteAutosave } from "../hooks/useNoteAutosave";
import { headingCommand, headingKeymap } from "../commands/headingCommand";
import { insertTextCommand, wrapSelectionCommand } from "../commands/toolbarCommands";
import { imageDecorationPlugin } from "./imageDecorationPlugin";
import { clearDraft, readDraft } from "../utils/draftStore";
import NoteEditView, { type NoteEditHandle } from "./NoteEditView";

interface Props {
  note: Note;
  onCancel: () => void;
  /** 图片点击放大回调（透传 NotesPage 的 ImagePreviewOverlay） */
  onImageOpen?: (url: string, title?: string) => void;
}

const TOOLBAR_BTN: React.CSSProperties = {
  padding: "4px 8px", fontSize: 12, cursor: "pointer",
  border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#374151",
};

/** CM 主题：与 textarea 版观感对齐（等宽字体 + 浅底 + 无聚焦描边） */
const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#fcfcfc" },
  ".cm-scroller": { fontFamily: "monospace", fontSize: "14px", lineHeight: "1.8" },
  ".cm-content": { padding: "16px 0" },
  "&.cm-focused": { outline: "none" },
});

const RichEditorView = forwardRef<NoteEditHandle, Props>(function RichEditorView(
  { note, onCancel, onImageOpen }, ref,
) {
  const [title, setTitle] = useState(note.title);
  // CM 非受控持有正文；content state 仅作草稿恢复时的外部 doc 同步源
  const [content, setContent] = useState(note.content);
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState(false);
  const [activeHeading, setActiveHeading] = useState(0);
  const [draftPrompt, setDraftPrompt] = useState<{ title: string; content: string } | null>(null);

  // refs 快照（卸载/定时器闭包取最新值，防 state 闭包过期——同 NoteEditView）
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  // 内联回调 ref：CM extensions 构造后不可更新，keymap/plugin 闭包必须经 ref 取最新
  const onCancelRef = useRef(onCancel);
  const onImageOpenRef = useRef(onImageOpen);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { onImageOpenRef.current = onImageOpen; }, [onImageOpen]);

  // ── 保存 + 草稿层（双计时器/flushLatest/卸载保存/草稿节流，spec §4.4）──
  const getSnapshot = useCallback(() => ({ title: titleRef.current, content: contentRef.current }), []);
  const autosave = useNoteAutosave({
    noteId: note.id,
    getSnapshot,
    onError: (msg) => setStatus(msg),
  });

  // 父层命令式出口（NotesPage ESC 先 await 再刷新）
  useImperativeHandle(ref, () => ({ flushSave: () => autosave.flushLatestRef.current() }), [autosave.flushLatestRef]);

  // ── 草稿恢复：挂载时检查，草稿比 DB 新 → 提示 ──
  useEffect(() => {
    const draft = readDraft(note.id);
    if (draft && draft.updatedAt > note.updated_at) {
      setDraftPrompt({ title: draft.title, content: draft.content });
    }
  }, [note.id, note.updated_at]);

  // ── CM 生命周期 ──
  const handleDocChange = useCallback((d: string) => {
    contentRef.current = d;
    setContent(d);
    autosave.markDirty();
    autosave.scheduleDraftWrite();
  }, [autosave.markDirty, autosave.scheduleDraftWrite]);

  const extensions = useMemo(() => [
    basicSetup,
    markdown(),
    headingKeymap,
    // Ctrl+S 显式保存（建版本）/ Ctrl+E 退出编辑——CM 键盘在编辑区内优先捕获
    keymap.of([
      { key: "Mod-s", run: () => { autosave.saveVersioned(); return true; } },
      { key: "Mod-e", run: () => { void autosave.flushLatestRef.current().finally(() => onCancelRef.current()); return true; } },
    ]),
    imageDecorationPlugin({ noteId: note.id, onOpen: (url, t) => onImageOpenRef.current?.(url, t) }),
    editorTheme,
  ], [note.id, autosave.saveVersioned, autosave.flushLatestRef]);

  const { containerRef, viewRef } = useCodeMirror({
    doc: content,
    extensions,
    onChange: handleDocChange,
    onHeadingLevelChange: setActiveHeading,
    onInitError: () => setFallback(true),
  });

  // 降级护栏：CM 初始化失败 → textarea 全功能保底（ref 透传，父层接口不变）
  if (fallback) {
    return <NoteEditView ref={ref} note={note} onCancel={onCancel} />;
  }

  // ── 工具栏（CM command：全部进撤销栈）──
  const toolbarAction = async (action: string) => {
    const view = viewRef.current;
    if (!view) return;
    switch (action) {
      case "bold": wrapSelectionCommand("**", "**")(view); break;
      case "italic": wrapSelectionCommand("*", "*")(view); break;
      case "h1": headingCommand(1)(view); break;
      case "h2": headingCommand(2)(view); break;
      case "h3": headingCommand(3)(view); break;
      case "ul": wrapSelectionCommand("- ", "")(view); break;
      case "ol": wrapSelectionCommand("1. ", "")(view); break;
      case "quote": wrapSelectionCommand("> ", "")(view); break;
      case "code": wrapSelectionCommand("```\n", "\n```")(view); break;
      case "table": insertTextCommand("\n| 标题 | 内容 |\n|------|------|\n| 行1  | 值1  |\n")(view); break;
      case "link": {
        const url = prompt("链接地址：", "https://");
        if (url) wrapSelectionCommand("[", `](${url})`)(view);
        break;
      }
      case "latex": wrapSelectionCommand("$", "$")(view); break;
      case "image": {
        const alt = prompt("图片描述：") || "";
        const url = prompt("图片链接：", "https://");
        if (url) insertTextCommand(`![${alt}](${url})\n`)(view);
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
          insertTextCommand(`![图片](${rel})\n`)(view);
        } catch (err) {
          setStatus(`插入失败: ${err}`);
        }
        break;
      }
    }
  };

  const headingBtn = (level: number) => ({
    ...TOOLBAR_BTN,
    ...(activeHeading === level ? { background: "#0d9488", color: "#fff", borderColor: "#0d9488" } : {}),
  });

  const handleDone = async () => {
    try {
      await autosave.flushLatestRef.current();
    } finally {
      onCancelRef.current();
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 草稿恢复提示条（崩溃/强杀后重开） */}
      {draftPrompt && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
          <span style={{ flex: 1 }}>检测到未保存的编辑草稿，是否恢复？</span>
          <button
            onClick={() => { setTitle(draftPrompt.title); setContent(draftPrompt.content); setDraftPrompt(null); }}
            style={TOOLBAR_BTN}
          >
            恢复
          </button>
          <button
            onClick={() => { clearDraft(note.id); setDraftPrompt(null); }}
            style={{ ...TOOLBAR_BTN, color: "#6b7280" }}
          >
            丢弃
          </button>
        </div>
      )}

      {/* 工具栏（H1/H2/H3 显示当前行级别高亮态） */}
      <div style={{ padding: "6px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", background: "#fafafa" }}>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("bold")} title="粗体 Ctrl+B"><b>B</b></button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("italic")} title="斜体 Ctrl+I"><i>I</i></button>
        <span style={{ width: 1, height: 20, background: "#d1d5db" }} />
        <button style={headingBtn(1)} onClick={() => void toolbarAction("h1")} title="标题1 Ctrl+1">H1</button>
        <button style={headingBtn(2)} onClick={() => void toolbarAction("h2")} title="标题2 Ctrl+2">H2</button>
        <button style={headingBtn(3)} onClick={() => void toolbarAction("h3")} title="标题3 Ctrl+3">H3</button>
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
        <span style={{ fontSize: 10, color: "#9ca3af" }}>Ctrl+Shift+↑↓层级 · Ctrl+Z 撤销</span>
        <span style={{ width: 1, height: 20, background: "#d1d5db" }} />
        <button
          onClick={() => autosave.saveVersioned()}
          style={{ ...TOOLBAR_BTN, background: "#0d9488", color: "#fff", border: "none", fontWeight: 600 }}
          disabled={autosave.saving}
        >
          {autosave.saving ? "保存中…" : "💾 保存（Ctrl+S）"}
        </button>
        <button onClick={() => void handleDone()} style={{ ...TOOLBAR_BTN, color: "#6b7280" }}>完成（Ctrl+E）</button>
      </div>

      {/* 标题 */}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          autosave.markDirty();
          autosave.scheduleDraftWrite();
        }}
        onBlur={() => { if (autosave.dirty) autosave.saveLight(); }}
        style={{ padding: "10px 16px", fontSize: 16, fontWeight: 600, border: "none", borderBottom: "1px solid #e5e7eb", outline: "none", width: "100%" }}
        placeholder="笔记标题"
      />

      {/* CM 编辑区 */}
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden" }} />

      {status && <p style={{ padding: "4px 16px", fontSize: 12, color: "#047857" }}>{status}</p>}
    </div>
  );
});

export default RichEditorView;
