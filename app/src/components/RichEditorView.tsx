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
import { useClipboardImagePaste } from "../hooks/useClipboardImagePaste";
import { headingCommand, headingKeymap } from "../commands/headingCommand";
import { insertTextCommand, wrapSelectionCommand } from "../commands/toolbarCommands";
import { imageDecorationPlugin } from "./imageDecorationPlugin";
import { clearDraft, readDraft } from "../utils/draftStore";
import NoteEditView, { type NoteEditHandle } from "./NoteEditView";
// v0.16.1：正文多色荧光笔——色板复用（选中色 → 包裹 ==[色]…==）
import NoteColorPicker from "./NoteColorPicker";
// 批 3（用户问题9）：CM 内容底部留白与阅读/textarea 同源（末行可滚离底边）
import { BOTTOM_BREATHER_CSS } from "../utils/contentBreather";
// 批 8（REQ-317）：编辑态选区右键菜单——插入计划纯函数 + 共享菜单组件
import { planTaskLineInsert, type SelectionActionId, type SelectionNoteAction } from "../utils/noteSelectionMenu";
import SelectionActionMenu from "./note-selection/SelectionActionMenu";

interface Props {
  note: Note;
  onCancel: () => void;
  /** 图片点击放大回调（透传 NotesPage 的 ImagePreviewOverlay） */
  onImageOpen?: (url: string, title?: string) => void;
  /** 批 8（REQ-317）：选区菜单行动类动作上抛（转问题/模型卡预填——复制/
   *  全选/加入行动就地执行，行动类由 NotesPage 层对话框/命令处理） */
  onSelectionAction?: (action: SelectionNoteAction, text: string) => void;
}

const TOOLBAR_BTN: React.CSSProperties = {
  padding: "4px 8px", fontSize: 12, cursor: "pointer",
  border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#374151",
};

/** CM 主题：与 textarea 版观感对齐（等宽字体 + 浅底 + 无聚焦描边） */
const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#fcfcfc" },
  ".cm-scroller": { fontFamily: "monospace", fontSize: "14px", lineHeight: "1.8" },
  // 底部留白 token 与阅读/textarea 同源（上 16 保留原观感；左右 0 不变）
  ".cm-content": { padding: `16px 0 ${BOTTOM_BREATHER_CSS}` },
  "&.cm-focused": { outline: "none" },
});

const RichEditorView = forwardRef<NoteEditHandle, Props>(function RichEditorView(
  { note, onCancel, onImageOpen, onSelectionAction }, ref,
) {
  const [title, setTitle] = useState(note.title);
  // CM 非受控持有正文；content state 仅作草稿恢复时的外部 doc 同步源
  const [content, setContent] = useState(note.content);
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState(false);
  const [activeHeading, setActiveHeading] = useState(0);
  const [draftPrompt, setDraftPrompt] = useState<{ title: string; content: string } | null>(null);
  // v0.16.1：荧光笔色板弹层开合（受控——选色/默认黄/点击外部关闭）
  const [highlightOpen, setHighlightOpen] = useState(false);
  // 批 8（REQ-317）：编辑态选区右键菜单态——CM 选区在菜单打开瞬间的**快照**
  // （text + to：文本与插入锚点同源同刻捕获，菜单内点击不依赖“点击瞬间的
  // CM 选区仍存活”——审查 P2-13：键盘移动光标后加入行动仍插在快照 to）
  const [selMenu, setSelMenu] = useState<{ x: number; y: number; text: string; to: number } | null>(null);

  // refs 快照（卸载/定时器闭包取最新值，防 state 闭包过期——同 NoteEditView）
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  // 内联回调 ref：CM extensions 构造后不可更新，keymap/plugin 闭包必须经 ref 取最新
  const onCancelRef = useRef(onCancel);
  const onImageOpenRef = useRef(onImageOpen);
  // 批 8：onSelectionAction 同 ref 模式（CM extension 与菜单动作闭包取最新）
  const onSelectionActionRef = useRef(onSelectionAction);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { onImageOpenRef.current = onImageOpen; }, [onImageOpen]);
  useEffect(() => { onSelectionActionRef.current = onSelectionAction; }, [onSelectionAction]);

  // ── v0.15 剪贴板图片：粘贴即落盘（import_note_image_b64）+ 插入相对引用 ──
  const onInsertImage = useCallback((rel: string) => {
    const view = viewRef.current;
    if (!view) return;
    const main = view.state.selection.main;
    const line = view.state.doc.lineAt(main.head);
    // 空行粘贴：带尾换行（独立行图片 block 化，不留行内空隙）；行中粘贴：纯内联
    const text = line.text.trim() === "" ? `![图片](${rel})\n` : `![图片](${rel})`;
    view.dispatch({
      changes: { from: main.from, to: main.to, insert: text },
      selection: { anchor: main.from + text.length },
      userEvent: "input.paste",
    });
  }, []);
  const handleImagePaste = useClipboardImagePaste({
    noteId: note.id,
    onInsert: onInsertImage,
    onError: (msg) => setStatus(msg),
  });

  // ── 保存 + 草稿层（双计时器/flushLatest/卸载保存/草稿节流，spec §4.4）──
  const getSnapshot = useCallback(() => ({ title: titleRef.current, content: contentRef.current }), []);
  const autosave = useNoteAutosave({
    noteId: note.id,
    getSnapshot,
    onError: (msg) => setStatus(msg),
  });

  // 父层命令式出口（NotesPage ESC 先 await 再刷新）
  useImperativeHandle(
    ref,
    () => ({ flushSave: () => autosave.flushLatestRef.current(), getContent: () => contentRef.current }),
    [autosave.flushLatestRef],
  );

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

  // 批 8（REQ-317）：编辑态选区动作就地执行（复制已在菜单内用快照文本完成）
  const runSelAction = (action: Exclude<SelectionActionId, "copy">) => {
    const view = viewRef.current;
    const snapshotText = selMenu?.text ?? "";
    if (action === "selectAll") {
      // 全选=CM 既有 select-all 语义（basicSetup Mod-a 同命令路径：主选区覆盖
      // 全 doc）——不引 @codemirror/commands（无直接依赖），dispatch 等价
      if (!view) return;
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length },
        scrollIntoView: true,
      });
      view.focus();
      return;
    }
    if (action === "addTask") {
      // 加入行动：以「快照 to（菜单打开瞬间选区结束处）」所在行为锚插入
      // `- [ ] <快照文本>` 独立任务行；不用点击瞬间的 view.state.selection——
      // 菜单打开后键盘移动光标会改变主选区（快照 to 才是动作时有效的锚点，
      // 审查 P2-13）；dispatch → 既有 onChange → 自动保存/草稿/任务索引重扫
      // 通道（不 bypass 保存）
      if (!view || !snapshotText) return;
      const snapshotTo = selMenu?.to ?? view.state.selection.main.to;
      const plan = planTaskLineInsert(view.state.doc.toString(), snapshotTo, snapshotText);
      if (!plan) return;
      view.dispatch({
        changes: { from: plan.from, insert: plan.insert },
        selection: { anchor: plan.from + plan.insert.length },
        userEvent: "input.addtask",
      });
      view.focus();
      return;
    }
    if (snapshotText && onSelectionActionRef.current) {
      onSelectionActionRef.current(action, snapshotText);
    }
  };

  const extensions = useMemo(() => [
    basicSetup,
    markdown(),
    headingKeymap,
    // Ctrl+S 显式保存（建版本）/ Ctrl+E 退出编辑——CM 键盘在编辑区内优先捕获
    keymap.of([
      { key: "Mod-s", run: () => { autosave.saveVersioned(); return true; } },
      { key: "Mod-e", run: () => { void autosave.flushLatestRef.current().finally(() => onCancelRef.current()); return true; } },
    ]),
    // v0.15：粘贴图片 → 拦截 + 落盘 + 插入引用（文字粘贴走默认行为）
    EditorView.domEventHandlers({ paste: (e) => handleImagePaste(e) }),
    // 批 8（REQ-317）：编辑态选区右键菜单——CM 主选区非空（sliceDoc 非空串）
    // 才弹菜单（右键落点通常已由 CM mousedown 语义定选区）；空选区维持现状
    // （原生菜单已被全局抑制→静默，与阅读态“空选区不弹”取最小一致）
    EditorView.domEventHandlers({
      // domEventHandlers 回调签名为 (event, view)——事件在前、视图在后（与
      // keymap 的 (view, event) 相反），paste 处理同型单参可用
      contextmenu: (e, view) => {
        const main = view.state.selection.main;
        if (main.empty) return false;
        const t = view.state.sliceDoc(main.from, main.to);
        if (!t.trim()) return false;
        e.preventDefault();
        e.stopPropagation(); // 自绘菜单范式：到 window 前截停（原生兜底同在）
        // 审查 P3-2：选区菜单打开时顺带关荧光笔色板（互斥——色板弹层 z30 在
        // 菜单背板 z60 之下，留开会形成视觉残留且只能靠点背板被动关闭）
        setHighlightOpen(false);
        // 快照含选区结束 offset（P2-13：加入行动锚点=打开瞬间，非点击瞬间）
        setSelMenu({ x: e.clientX, y: e.clientY, text: t, to: main.to });
        return true;
      },
    }),
    imageDecorationPlugin({ noteId: note.id, onOpen: (url, t) => onImageOpenRef.current?.(url, t) }),
    editorTheme,
  ], [note.id, autosave.saveVersioned, autosave.flushLatestRef, handleImagePaste]);

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
        // v0.15：外链图自动下载复制（防源站删除丢资源）——失败降级插原 URL + 提示
        const alt = prompt("图片描述：") || "";
        const url = prompt("图片链接：", "https://");
        if (!url) break;
        try {
          const rel = await invoke<string>("import_note_image_url", { noteId: note.id, url });
          insertTextCommand(`![${alt}](${rel})\n`)(view);
        } catch (err) {
          insertTextCommand(`![${alt}](${url})\n`)(view);
          setStatus(`外链图下载失败（已插入原链接——可能随源站点删除而失效）: ${err}`);
        }
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
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("image")} title="插入外链图（自动下载为本地副本）">🌐 链接图</button>
        <button style={TOOLBAR_BTN} onClick={() => void toolbarAction("latex")} title="LaTeX">Σ</button>
        {/* v0.16.1：正文多色荧光笔——默认黄 / 12 色板（包裹选区 ==文本== / ==[色]文本==） */}
        <div style={{ position: "relative" }}>
          <button style={TOOLBAR_BTN} data-testid="highlight-open" onClick={() => setHighlightOpen((v) => !v)} title="荧光笔：==文本==（默认黄）；==[色]文本==">🖍 荧光</button>
          {highlightOpen && (
            <>
              <div onClick={() => setHighlightOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent" }} />
              <div
                data-testid="highlight-pop"
                style={{ position: "absolute", top: "100%", left: 0, zIndex: 31, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxWidth: 200 }}
              >
                <button
                  data-testid="highlight-default"
                  style={{ ...TOOLBAR_BTN, width: "100%", marginBottom: 6, background: "#fefce8" }}
                  onClick={() => { wrapSelectionCommand("==", "==")(viewRef.current!); setHighlightOpen(false); }}
                >
                  🖍 默认黄 ==文本==
                </button>
                <NoteColorPicker
                  value={null}
                  onChange={(c) => {
                    if (c) wrapSelectionCommand(`==[${c}]`, "==")(viewRef.current!);
                    setHighlightOpen(false);
                  }}
                />
              </div>
            </>
          )}
        </div>
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

      {/* 批 8（REQ-317）：编辑态选区右键菜单（复制就地、全选=CM select-all、
          加入行动=选区内容插任务行走既有保存通道、行动类上抛 NotesPage） */}
      {selMenu && (
        <SelectionActionMenu
          mode="editing"
          x={selMenu.x}
          y={selMenu.y}
          text={selMenu.text}
          onClose={() => setSelMenu(null)}
          onAction={runSelAction}
        />
      )}
    </div>
  );
});

export default RichEditorView;
