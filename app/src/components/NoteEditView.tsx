/**
 * NoteEditView — v0.10.0 笔记编辑视图（M3 + A1 段落操作）。
 *
 * @ai-context: 源码编辑（textarea）+ 轻量工具栏 + 快捷键 + 自动/显式保存。
 *              A1：Ctrl+Shift+↑↓ 提升/降低标题层级、Ctrl+Shift+M 合并段、Ctrl+Shift+S 拆分段。
 *              工具栏按钮插入 Markdown 语法片段。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Note } from "../types";
// H2：插入/包裹改为纯函数（返回新字符串+光标位置）——受控更新走 setContent；
// A1 段落/层级操作同款纯函数（自本组件抽出，可单测）
import {
  insertAtCursor, wrapSelection, promoteHeading, demoteHeading, mergeSelection, splitAtCursor,
  type EditResult,
} from "./markdownEdit";

interface Props {
  note: Note;
  onCancel: () => void;
}

/** v0.13.6（审查 H1 修复）：父层命令式出口——ESC 出口先 await 保存再刷新
 *  （原 ESC 由父层直接 setEditing(false)，卸载保存与刷新竞态重演 P0） */
export interface NoteEditHandle {
  flushSave: () => Promise<void>;
}

// L14：自动保存双计时参数——停止输入 2s 存一次（debounce）；dirty 期间最长
// 30s 必存一次（maxWait）。Why：纯 debounce 在持续输入时计时器反复重置永不
// 触发，长篇输入全程内容只活在内存里，崩溃/误关即丢失
const AUTOSAVE_IDLE_MS = 2000;
const AUTOSAVE_MAX_WAIT_MS = 30_000;

const TOOLBAR_BTN: React.CSSProperties = {
  padding: "4px 8px", fontSize: 12, cursor: "pointer",
  border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#374151",
};

const NoteEditView = forwardRef<NoteEditHandle, Props>(function NoteEditView({ note, onCancel }, ref) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  // L14：双计时器 ref（idle debounce + maxWait，常量见文件头注释）
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v0.10.1 F1：卸载自动保存用的最新值快照（unmount 时 state 闭包不可靠）
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const dirtyRef = useRef(false);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

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

  // 定时器闭包会持有旧 saveDraft（title/content 快照过期）→ 经 ref 取最新
  const saveDraftRef = useRef(saveDraft);
  useEffect(() => { saveDraftRef.current = saveDraft; }, [saveDraft]);

  // L14：自动保存（不建版本）——saveDraft 提升为本 effect 之前定义的
  // useCallback，依赖补齐无需 exhaustive-deps 抑制
  useEffect(() => {
    if (!dirty) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => void saveDraftRef.current(false), AUTOSAVE_IDLE_MS);
    // maxWait 只在 dirty 起点登记一次——持续输入超 30s 也必存一次
    if (!maxWaitTimerRef.current) {
      maxWaitTimerRef.current = setTimeout(() => {
        maxWaitTimerRef.current = null;
        void saveDraftRef.current(false);
      }, AUTOSAVE_MAX_WAIT_MS);
    }
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [dirty, content, title, saveDraft]);

  // dirty 清零（保存成功）后撤销 maxWait 计时，避免干净状态下重复保存
  useEffect(() => {
    if (!dirty && maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, [dirty]);

  // 卸载清理双计时器（dirty 内容兜底由卸载保存 effect 负责）
  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
  }, []);

  // v0.13.6（审查 H1）：绕开 saving 卫兵的"最终保存"——在途自动保存可能携带旧闭包
  // 值，以 refs 最新快照强制落库（同值重复写幂等无害）；完成后 dirty 清零，卸载
  // 自动保存不再重复写。ESC/完成/Ctrl+E 三出口共用本函数保证"先保存后刷新"。
  const flushLatest = useCallback(async () => {
    if (!dirtyRef.current) return;
    await invoke("update_note", {
      id: note.id,
      title: titleRef.current,
      content: contentRef.current,
      createVersion: false,
    });
    setDirty(false);
  }, [note.id]);

  // 父层命令式出口（NotesPage ESC 出口先 await 再刷新）
  useImperativeHandle(ref, () => ({ flushSave: () => flushLatest() }), [flushLatest]);

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
      // L15：.finally 保证保存失败也能退出编辑态——原 .then 在保存 promise
      // 异常路径下卡死在编辑态（用户无法退出）；失败信息仍由 status 展示
      // v0.13.6（审查 H1）：改走 flushLatest（含在途保存场景的确定性落库）
      void flushLatest().finally(() => onCancel());
      return;
    }

    // A1：段落级操作（纯函数计算新文本+光标，经 applyEdit 受控应用）
    if (e.ctrlKey && e.shiftKey) {
      const selStart = ta.selectionStart;
      const selEnd = ta.selectionEnd;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        // 提升标题层级（减 #）；不可提升时不动内容
        const r = promoteHeading(content, selStart);
        if (r) applyEdit(r);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        // 降低标题层级（加 #）；普通段落变 H6
        applyEdit(demoteHeading(content, selStart));
      } else if (e.key === "M") {
        e.preventDefault();
        // 合并选中段（选区内换行→空格）；无选区不动内容
        const r = mergeSelection(content, selStart, selEnd);
        if (r) applyEdit(r);
      } else if (e.key === "S") {
        e.preventDefault();
        // 拆分段落：光标处插入换行
        applyEdit(splitAtCursor(content, selStart));
      }
    }
  }, [content, saveDraft, flushLatest, onCancel]);

  // H2：应用编辑结果——setContent 走受控更新（React state 为唯一数据源），
  // 再经 rAF 在本轮渲染提交后恢复光标选区（受控 textarea 重写 value 会把
  // 光标重置到末尾）。原实现直写 DOM value 不同步 state → 重渲染后插入被抹掉
  const applyEdit = (r: EditResult) => {
    setContent(r.value);
    setDirty(true);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(r.selStart, r.selEnd);
    });
  };

  // 工具栏操作（v0.10.1：local-image 需异步导入——dialog 选文件后复制进
  // data_dir 再插入相对引用；import 失败明确提示不落脏数据）
  const toolbarAction = async (action: string) => {
    const ta = taRef.current;
    if (!ta) return;
    // 读取当前 DOM 值与选区（受控组件下与 content state 一致）
    const v = ta.value;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    switch (action) {
      case "bold": applyEdit(wrapSelection(v, s, e, "**", "**")); break;
      case "italic": applyEdit(wrapSelection(v, s, e, "*", "*")); break;
      case "h1": applyEdit(wrapSelection(v, s, e, "# ", "")); break;
      case "h2": applyEdit(wrapSelection(v, s, e, "## ", "")); break;
      case "h3": applyEdit(wrapSelection(v, s, e, "### ", "")); break;
      case "ul": applyEdit(wrapSelection(v, s, e, "- ", "")); break;
      case "ol": applyEdit(wrapSelection(v, s, e, "1. ", "")); break;
      case "quote": applyEdit(wrapSelection(v, s, e, "> ", "")); break;
      case "code": applyEdit(wrapSelection(v, s, e, "```\n", "\n```")); break;
      case "table": applyEdit(insertAtCursor(v, s, e, "\n| 标题 | 内容 |\n|------|------|\n| 行1  | 值1  |\n")); break;
      case "link": {
        const url = prompt("链接地址：", "https://");
        if (url) applyEdit(wrapSelection(v, s, e, "[", `](${url})`));
        break;
      }
      case "latex": applyEdit(wrapSelection(v, s, e, "$", "$")); break;
      case "image": {
        // 外部链接图（保留原 prompt URL 入口）
        const alt = prompt("图片描述：") || "";
        const url = prompt("图片链接：", "https://");
        if (url) applyEdit(insertAtCursor(v, s, e, `![${alt}](${url})\n`));
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
          // 异步返回后重读光标（dialog 期间选区可能已变）
          applyEdit(insertAtCursor(ta.value, ta.selectionStart, ta.selectionEnd, `![图片](${rel})\n`));
        } catch (err) {
          setStatus(`插入失败: ${err}`);
        }
        break;
      }
    }
  };

  // 完成编辑（先 await 保存再退出——v0.13.6：原异步不等待，退出后右栏/列表
  // 读到旧值；保存失败也退出（status 已展示），不卡死编辑态）
  // 审查 H1 修复：走 flushLatest（在途自动保存时也确定性落库最新快照）
  const handleDone = async () => {
    try {
      await flushLatest();
    } finally {
      onCancel();
    }
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
        // L1：不再空吞错——卸载保存失败需留痕（内容仅存在于内存已不可恢复）
        }).catch((e) => console.warn(`[NoteEditView] 卸载自动保存失败（笔记 ${note.id}）`, e));
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
        <button onClick={() => void handleDone()} style={{ ...TOOLBAR_BTN, color: "#6b7280" }}>完成（Ctrl+E）</button>
      </div>

      {/* 标题 */}
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
        onBlur={() => { if (dirty) void saveDraft(false); }}
        style={{ padding: "10px 16px", fontSize: 16, fontWeight: 600, border: "none", borderBottom: "1px solid #e5e7eb", outline: "none", width: "100%" }}
        placeholder="笔记标题"
      />

      {/* 编辑器 */}
      <textarea
        ref={taRef}
        value={content}
        onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (dirty) void saveDraft(false); }}
        autoFocus // v0.12.2：新建即编辑态聚焦首行（去摩擦——零对话框新建后直接可输入）
        style={{ flex: 1, padding: 16, fontSize: 14, lineHeight: 1.8, border: "none", outline: "none", resize: "none", fontFamily: "monospace", background: "#fcfcfc" }}
        placeholder="在此编辑笔记内容…"
      />

      {status && <p style={{ padding: "4px 16px", fontSize: 12, color: "#047857" }}>{status}</p>}
    </div>
  );
});

export default NoteEditView;