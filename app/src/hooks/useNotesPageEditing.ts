/**
 * useNotesPageEditing — 笔记页编辑态 + Ctrl+E/ESC 快捷键 + 编辑器命令式出口
 * （自 NotesPage 拆分，v0.10.1 F5 / v0.13.6 审查 H1 语义不变）。
 *
 * @ai-context: 快捷键契约——**单一** `window` keydown、deps `[]`、无条件注册
 *              （不按页面可见性门控：NotesPage 由 App 保活挂载，隐藏期快捷键仍
 *              生效是既有行为）。最新值一律经 ref 读取：editingRef（本 hook）、
 *              selectedRef（**页面持有并注入**——handleTaskToggle/handleNoteChanged
 *              也读它，不能在本 hook 内另建第二份）、onExitedRef（ESC 后的刷新）。
 * @ai-context: ESC 顺序契约（被 NotesPage.test.tsx 直接断言）——先 `await
 *              editorRef.current?.flushSave?.()`（update_note），再 setEditing(false)
 *              并触发 onExited（get_note/列表重载）；保存失败也退出（编辑器内已展示）。
 * @ai-context: 副作用——注册/注销 `window` keydown。边界——editorRef 仅在
 *              editing=true 时被 NoteReadingView 的 editor 槽挂到真实编辑器上
 *              （非编辑态为 null，正是调用方 openAiDialog 走 `?? selected.content`
 *              兜底的原因）；本 hook 不持有任何 invoke。
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Note } from "../types";
import type { NoteEditHandle } from "../components/NoteEditView";

interface Options {
  /** 页面持有的选中笔记镜像（跨 3 个消费者共享——本 hook 只读，不新建） */
  selectedRef: RefObject<Note | null>;
  /** 编辑退出出口（ESC）：先 flushSave 再调用；经内部 ref 取最新闭包 */
  onExited: () => void | Promise<void>;
}

interface Editing {
  editing: boolean;
  setEditing: (v: boolean) => void;
  /** 编辑器命令式出口（RichEditorView/NoteEditView 的 ref 目标） */
  editorRef: RefObject<NoteEditHandle | null>;
}

export function useNotesPageEditing({ selectedRef, onExited }: Options): Editing {
  // M3：编辑态
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  // v0.13.6：编辑退出三出口（完成/Ctrl+E/ESC）统一刷新——ESC 是 []-deps 窗口监听，
  // 经 ref 取最新 onExited（防闭包持有旧 keyword/tagFilter 快照）
  const onExitedRef = useRef(onExited);
  useEffect(() => { onExitedRef.current = onExited; }, [onExited]);

  // v0.13.6（审查 H1 修复）：编辑器命令式出口——ESC 先 await 保存再刷新（防卸载
  // 保存与 get_note 竞态在 ESC 出口重演"编辑后右栏旧值"）
  const editorRef = useRef<NoteEditHandle | null>(null);

  // v0.10.1 F5：Ctrl+E 进入 / ESC 退出编辑——单一 window 监听 + ref 持有最新值。
  // ⚠️ 调用点必须留在页面组件体**靠前位置**：SelectionActionMenu 以 capture 层
  // 抢在页面 ESC 之前，监听挂载的相对顺序由 hook 调用序决定，勿后移。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "e" && selectedRef.current && !editingRef.current) {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === "Escape" && editingRef.current) {
        e.preventDefault();
        // v0.13.6（审查 H1）：ESC 先 await 保存再刷新——原实现先 setEditing(false)
        // 直出，卸载保存与 get_note/list load 竞态（UI 停留旧值）；保存失败也退出
        // （编辑器 status 已展示错误），刷新照常执行
        void (async () => {
          try {
            await editorRef.current?.flushSave?.();
          } catch {
            /* 保存失败不阻断退出——编辑器内已展示 */
          }
          setEditing(false);
          void onExitedRef.current();
        })();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedRef]);

  return { editing, setEditing, editorRef };
}
