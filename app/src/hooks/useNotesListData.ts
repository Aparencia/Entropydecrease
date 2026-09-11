/**
 * useNotesListData — 笔记页列表数据真源（列表 / 过滤态 / 组与标签色 / 刷新链路）。
 *
 * @ai-context: 为什么收敛成一个 hook——`refreshToken` / `seqRef` / `load` /
 *              `handleNoteChanged` 是同一「数据真源」簇，拆散会产生多份
 *              keyword/tagFilter/sortMode 闭包快照。`handleNoteChanged` 是页面级
 *              刷新中枢（9 个下游：header 动作组 / 版本面板 / 编辑器取消 / AI 对话框 /
 *              选区行动 / 外部总线 / 移组 / ESC / 组侧栏），**必须保持单一实例**。
 * @ai-context: 副作用——① refreshToken 驱动 invoke `list_note_groups` + `list_tag_colors`
 *              （Promise.all，失败仅 console.warn）；② 搜索 300ms 防抖后 invoke
 *              `search_notes`（tag 分支 `keyword:""` / kw 分支 `tag:null`）或
 *              `list_notes`；③ `handleNoteChanged` 内 invoke `get_note` 回读选中笔记；
 *              ④ `useDbRefresh(["notes","note-groups"])` **常驻订阅**——页面由 App
 *              保活挂载，隐藏期事件不漏收（**不得**加可见性门控，否则切回即陈旧）。
 * @ai-context: 边界——selectedRef / setSelected 由页面注入（选中态跨编辑快捷键与
 *              右栏共享，本 hook 不自建第二份）；seqRef 对外暴露，供直调
 *              `list_notes` 的深链流程共用同一序号源（防旧响应覆盖新列表）；
 *              `allTags` 从 parseTags 聚合（去重 + 字典序）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteGroup, TagColor } from "../types";
import type { SortMode } from "../components/NoteListView";
import { parseTags } from "../utils/noteHelpers";
import { useDbRefresh } from "./useDbRefresh";

interface Options {
  /** 页面持有的选中笔记镜像（handleNoteChanged 取 id 回读；与 ESC/任务勾选共享一份） */
  selectedRef: RefObject<Note | null>;
  /** 选中笔记回读落库内容（页面 setSelected） */
  setSelected: Dispatch<SetStateAction<Note | null>>;
}

export function useNotesListData({ selectedRef, setSelected }: Options) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated-desc");
  const [status, setStatus] = useState("");
  // v0.12.2：侧栏刷新令牌（捕获/升降/结算后计数与组列表重载）
  const [refreshToken, setRefreshToken] = useState(0);
  // v0.14 B：视觉系统数据——组列表（组色继承）与标签色映射
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const seqRef = useRef(0);

  // v0.14 B：颜色数据加载（refreshToken 驱动——组色/标签色设置后经 onChanged 刷新）
  useEffect(() => {
    void (async () => {
      try {
        const [gs, tcs] = await Promise.all([
          invoke<NoteGroup[]>("list_note_groups", { terrain: null }),
          invoke<TagColor[]>("list_tag_colors"),
        ]);
        setGroups(gs);
        // tcs 空值防御（旧 mock/异常后端返回 null——不崩列表）
        setTagColors(Object.fromEntries((tcs ?? []).map((t) => [t.tag, t.color])));
      } catch (e) {
        console.warn("[NotesPage] 颜色数据加载失败", e);
      }
    })();
  }, [refreshToken]);

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

  // ── 操作 ──
  const refreshAll = useCallback(() => {
    setRefreshToken((t) => t + 1);
    void load(keyword, tagFilter, sortMode);
  }, [keyword, tagFilter, sortMode, load]);

  // H3：AI 补充/撤销/版本回滚后刷新——列表重载 + 选中笔记取库内最新内容
  const handleNoteChanged = useCallback(async () => {
    void load(keyword, tagFilter, sortMode);
    const cur = selectedRef.current;
    if (!cur) return;
    try {
      const fresh = await invoke<Note | null>("get_note", { id: cur.id });
      if (fresh) setSelected(fresh);
    } catch (e) {
      console.warn(`[NotesPage] 刷新笔记 ${cur.id} 失败`, e);
    }
  }, [keyword, tagFilter, sortMode, load, selectedRef, setSelected]);

  // REQ-278（v0.19.4 §5）：data:notes-changed / data:note-groups-changed 常驻订阅
  // ——覆盖"别处改动"（任务采纳/AI 落库/他页转化）。回调复用既有刷新职责：
  // refreshToken 递增重载组侧栏/色数据（refreshAll 的 refreshToken 通道）+
  // handleNoteChanged（列表重载 + 右栏选中对象回读），列表 load 仅执行一次；
  // 防抖在 useDbRefresh 内合并事件风暴，与页面本地即时刷新天然错峰。常驻订阅
  // 理由：隐藏期（display:none 保留挂载）事件不漏收——切回即最新（REQ 根治点）
  const handleExternalDbChange = useCallback(() => {
    setRefreshToken((t) => t + 1);
    void handleNoteChanged();
  }, [handleNoteChanged]);

  useDbRefresh(["notes", "note-groups"], handleExternalDbChange);

  // ── 收集所有标签 ──
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => parseTags(n).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  return {
    notes, setNotes,
    keyword, setKeyword,
    tagFilter, setTagFilter,
    sortMode, setSortMode,
    status, setStatus,
    refreshToken,
    groups, tagColors,
    seqRef,
    allTags,
    load, refreshAll, handleNoteChanged,
  };
}

/** 列表数据 hook 的返回契约（深链 hook 以整体注入方式消费） */
export type NotesListData = ReturnType<typeof useNotesListData>;
