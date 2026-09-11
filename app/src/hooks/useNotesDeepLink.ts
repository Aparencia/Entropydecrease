/**
 * useNotesDeepLink — 笔记页跨页深链（focusNoteId / focusNoteSearch / focusGroupId）。
 *
 * @ai-context: 深链两入口（会话页「查看笔记」的 focusNoteId、对话页引用 chip 的
 *              focusNoteSearch）**共用一次列表重载/选中/滚动，防双 effect 双拉取
 *              竞态**。⚠️ 禁止拆成两条 effect、禁止改 dep 数组、禁止去掉
 *              disposed / seq 比对、禁止把 50ms 滚动定时器改回裸 setTimeout、
 *              禁止把硬编码 `sortMode:"updated-desc"` 改走数据 hook 的 load
 *              （会引入 keyword/tagFilter 分支差异）。
 * @ai-context: 副作用——① 清 keyword/tagFilter/切 notes 视图后直调 invoke
 *              `list_notes` 全量重载（绕过 load，自带序号递增，与防抖 load 共用
 *              同一 seqRef）；② 命中目标 → 先退出编辑态（NoteEditView 卸载会自动
 *              保存 dirty 草稿：防旧内容串写 + 防 externalSearch 注入落到编辑视图）
 *              → 选中 → 50ms 后按 DOM id `note-row-{id}` scrollIntoView（id 由
 *              NoteListView 渲染——既有跨组件查询，勿改成 ref）；③ 注入
 *              readerSearch（App 侧 key 递增 ⇒ 同笔记可重触发）；④ focusGroupId
 *              仅过滤**不展开**（三栏下列表常驻）。
 * @ai-context: 边界——清空责任在 App（本页无 onFocus*Consumed 回调）：effect 只由
 *              prop 值变化触发，同值重设不重跑；定时器登记入 ref 以便卸载统一清理
 *              （cleanup 读 effect 建立时的**快照**，勿改成读 .current 最新值）。
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types";
import type { NotesListData } from "./useNotesListData";

interface Options {
  focusNoteId?: number | null;
  /** 引用跳笔记（key 递增：同笔记重复引用可重触发） */
  focusNoteSearch?: { noteId: number; search: string; key: number } | null;
  /** 图谱双击组节点 → 过滤该组 */
  focusGroupId?: number | null;
  /** S4 数据真源（深链直调 list_notes 必须共用同一 seqRef 与 setNotes） */
  notesApi: NotesListData;
  setSelected: (note: Note) => void;
  setEditing: (v: boolean) => void;
  /** 中部视图切换（"notes"=笔记列表；inbox=收件箱——深链一律切回 notes） */
  setView: (v: "notes" | "inbox") => void;
  setGroupFilter: (id: number | null) => void;
}

export function useNotesDeepLink({
  focusNoteId, focusNoteSearch, focusGroupId, notesApi, setSelected, setEditing, setView, setGroupFilter,
}: Options) {
  // v0.19.1：阅读态命中词搜索请求（来自引用跳转；key 递增可重触发）
  const [readerSearch, setReaderSearch] = useState<{ noteId: number; search: string; key: number } | null>(null);
  // L2：收集异步流程中的 setTimeout——effect cleanup 统一清理防卸载后触发
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // L2：卸载时清理所有登记的延迟定时器
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // 跨页直达（focusNoteId 定位滚动；v0.19.1 focusNoteSearch 追加命中词阅读
  // 搜索注入——两入口共用一次列表重载/选中/滚动，防双 effect 双拉取竞态）
  useEffect(() => {
    const targetId = focusNoteSearch ? focusNoteSearch.noteId : focusNoteId;
    if (targetId == null) return;
    let disposed = false;
    (async () => {
      notesApi.setKeyword("");
      notesApi.setTagFilter(null);
      setView("notes");
      const seq = ++notesApi.seqRef.current;
      try {
        const rows = await invoke<Note[]>("list_notes", { sortMode: "updated-desc" });
        if (disposed || notesApi.seqRef.current !== seq) return;
        notesApi.setNotes(rows);
        const target = rows.find((n) => n.id === targetId);
        if (target) {
          // v0.19.1 审查 M2：引用跳转=阅读+高亮主路径——先退出编辑态
          // （handleSelect 同款语义：NoteEditView 卸载自动保存 dirty 草稿，
          // 防旧内容串写 + 防 externalSearch 注入落到编辑视图）
          setEditing(false);
          setSelected(target);
          // L2：定时器登记入 ref（cleanup 可清理），不再裸 setTimeout
          timersRef.current.push(
            setTimeout(() => {
              document.getElementById(`note-row-${target.id}`)?.scrollIntoView({ block: "center" });
            }, 50),
          );
        }
        if (focusNoteSearch) setReaderSearch({ ...focusNoteSearch });
      } catch (e) {
        if (!disposed) {
          if (focusNoteSearch) setReaderSearch({ ...focusNoteSearch });
          notesApi.setStatus(`加载失败: ${e}`);
        }
      }
    })();
    return () => { disposed = true; };
  }, [focusNoteId, focusNoteSearch]);

  // v0.14 C2：图谱组节点直达——仅过滤（三栏下列表常驻；不触发展开）
  useEffect(() => {
    if (focusGroupId == null) return;
    setGroupFilter(focusGroupId);
    setView("notes");
    notesApi.setKeyword("");
    notesApi.setTagFilter(null);
  }, [focusGroupId]);

  return { readerSearch };
}
