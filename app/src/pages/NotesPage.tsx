/**
 * NotesPage — 笔记页三栏编排层（v0.12.2 信息架构重构；批 0-C2 Task 1 拆分后只留
 * 编排：页面态 + 三栏/覆盖层装配 + 页面级动作）。
 *
 * @ai-context: 逻辑归属——列表数据/过滤态/组与标签色/刷新中枢在 `useNotesListData`
 *              （refreshToken/seqRef/handleNoteChanged 同一真源）；编辑态与
 *              Ctrl+E/ESC 在 `useNotesPageEditing`；跨页深链在 `useNotesDeepLink`；
 *              删除与清理留痕在 `useNotesBatchActions`；SE 封存在
 *              `useNotesSealedFilter`；三栏与覆盖层是 `components/notes/` 下的薄
 *              适配器（各自的 @ai-context 承载细节与 DOM 边界）。
 * @ai-context: 页面级语义——groupFilter 只做过滤（组行单击不展开，决策 1 三元分离）；
 *              碎片升笔记成功后 onPromoted 打开新笔记闭环、未归组笔记在「全部笔记」
 *              可见（决策 2 二元论）；复习面已剥离为顶层 Tab —— ⓘ「复习本组」是
 *              跨页深链（onOpenReview 透传 App 转页预选，本页不宿主 Overlay）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types";
import { resolveNoteColor } from "../utils/colorPalette";
// 批 8（REQ-317）：模型卡对话框槽（拆件）与选区行动类编排（hook 收敛）
import { useNoteSelectionActions } from "../hooks/useNoteSelectionActions";
import NotesGroupsColumn from "../components/notes/NotesGroupsColumn";
import NotesListColumn from "../components/notes/NotesListColumn";
import NotesReadingColumn from "../components/notes/NotesReadingColumn";
import NotesOverlays from "../components/notes/NotesOverlays";
import { useColumnLayout } from "../hooks/useColumnLayout";
import { useNoteAttention } from "../components/useNoteAttention";
import { useNotesSealedFilter } from "../hooks/useNotesSealedFilter";
import { useNotesPageEditing } from "../hooks/useNotesPageEditing";
import { useNotesBatchActions } from "../hooks/useNotesBatchActions";
import { useNotesListData } from "../hooks/useNotesListData";
import { useNotesDeepLink } from "../hooks/useNotesDeepLink";

interface Props {
  focusNoteId?: number | null;
  /** v0.19.1（REQ-260）：引用跳笔记——打开目标并注入命中词阅读搜索
   *  （key 递增：同笔记重复引用可重触发） */
  focusNoteSearch?: { noteId: number; search: string; key: number } | null;
  /** v0.14 C2：图谱双击组节点 → 过滤该组（变化时跟随，同 focusNoteId 模式） */
  focusGroupId?: number | null;
  /** v0.20.10（批 5）：复习域页深链——ⓘ「复习本组」→ App 转顶层复习页并预选
   *  该组（groupId=null 保留为全量语义，当前无调用方——组侧栏全量按钮已随
   *  无被动提醒裁决移除）；消费在 ReviewPage，本页只透传 */
  onOpenReview?: (groupId: number | null, name: string) => void;
  onOpenSessions?: (sessionId: number) => void;
  /** 打开体系页并选中体系（v0.13.7 触点① 组行徽标） */
  onOpenSystem?: (systemId: number) => void;
  /** TD-2026-09-05-A：空体系引导——跳体系页并打开建体系向导 */
  onCreateSystem?: () => void;
}

/** 中部视图：notes=笔记列表（组过滤/搜索/标签）；inbox=收件箱碎片列表 */
type MiddleView = "notes" | "inbox";

export default function NotesPage({ focusNoteId, focusNoteSearch, focusGroupId, onOpenReview, onOpenSessions, onOpenSystem, onCreateSystem }: Props) {
  // ── 页面态（选中 / 中部形态 / 组过滤 / 覆盖层）──
  const [selected, setSelected] = useState<Note | null>(null);
  // v0.11.0：组过滤（null=全部；仅过滤——不触发展开）
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  // v0.12.2：中部视图（收件箱 ↔ 笔记列表原位切换）
  const [view, setView] = useState<MiddleView>("notes");
  // v0.17.0：编辑态 AI 能力对话框（精修/知识补充统一入口——REQ-246）
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiContent, setAiContent] = useState("");
  // v0.10.1：图片点击放大预览
  const [previewImg, setPreviewImg] = useState<{ src: string; title?: string } | null>(null);

  // ── 数据层（列表 / 过滤态 / 组与标签色 / 刷新链路）——见 useNotesListData；
  // selectedRef 由页面持有并注入（handleTaskToggle/handleNoteChanged/ESC 共享一份）──
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const list = useNotesListData({ selectedRef, setSelected });
  // v0.20.3（REQ-301）：SE 情绪 tag（#树洞）默认排除（设置可显）——见 useNotesSealedFilter
  const { filterSealed } = useNotesSealedFilter(list.refreshToken);
  // M3：编辑态（Ctrl+E / ESC / 编辑器命令式出口）——见 useNotesPageEditing
  const { editing, setEditing, editorRef } = useNotesPageEditing({
    selectedRef,
    // 退出刷新经 hook 内 ref 镜像取最新闭包（防 []-deps 监听持有旧 keyword/tagFilter）
    onExited: list.handleNoteChanged,
  });
  // REQ-316（批 7）+ v0.12.8：单删/批量删/空组清理留痕 toast——见 useNotesBatchActions
  const { toast, showToast, notifyCleanNotice, runDelete, runBatchDelete } = useNotesBatchActions({
    selectedId: selected?.id ?? null,
    onCleared: () => setSelected(null),
    onReload: () => void list.load(list.keyword, list.tagFilter, list.sortMode),
    onStatus: list.setStatus,
  });
  // v0.15：三栏列状态（可拖拽 + 宽度记忆 + 窄窗自动折叠；默认值=历史固定宽度）
  const groupsCol = useColumnLayout("notes-groups", { default: 240, min: 180, max: 320, autoFoldBelow: 860 });
  const listCol = useColumnLayout("notes-list", { default: 320, min: 240, max: 420, autoFoldBelow: 700 });
  const outlineCol = useColumnLayout("notes-outline", { default: 180, min: 140, max: 260, autoFoldBelow: 1100 });

  // A6：注意力跟踪
  useNoteAttention(selected?.id ?? null, selected?.title ?? "");

  // v0.19.1 / v0.14 C2：跨页深链（focusNoteId ∪ focusNoteSearch 合并一次重载 + 组直达）
  // ——见 useNotesDeepLink（两入口共用一次 effect / 序号比对 / 定时器登记全在该文件）
  const { readerSearch } = useNotesDeepLink({
    focusNoteId,
    focusNoteSearch,
    focusGroupId,
    notesApi: list,
    setSelected,
    setEditing,
    setView,
    setGroupFilter,
  });

  // ── 操作 ──
  const runPinToggle = async (note: Note) => {
    try {
      const newPin = note.pin ? 0 : 1;
      await invoke<boolean>("update_note_pin", { id: note.id, pin: newPin });
      setSelected((prev) => (prev?.id === note.id ? { ...prev, pin: newPin } : prev));
      void list.load(list.keyword, list.tagFilter, list.sortMode);
    } catch (e) {
      list.setStatus(`置顶操作失败: ${e}`);
    }
  };

  // H1：任务清单勾选回写——本地先行更新（即时反馈），持久化建版本快照可回滚
  const handleTaskToggle = (newContent: string) => {
    const cur = selectedRef.current;
    if (!cur) return;
    const { id, title } = cur;
    setSelected((prev) => (prev?.id === id ? { ...prev, content: newContent } : prev));
    invoke("update_note", { id, title, content: newContent, createVersion: true }).catch((e) => {
      console.warn(`[NotesPage] 任务勾选回写失败（笔记 ${id}）`, e);
    });
  };

  // 批 8（REQ-317）：选区行动类编排 hook 收敛（转问题/模型卡预填态）
  const { modelDialog, openModelCard, closeModelCard, handleSelectionAction, onModelCardCreated } = useNoteSelectionActions({
    noteId: selected?.id ?? null, onChanged: list.handleNoteChanged, notify: showToast,
  });

  // v0.17.0：AI 能力入口——阅读态使用直接进入编辑态（用户裁决）+ 内容快照
  // （编辑态取编辑器当前内容=未保存所见即所修；阅读态用已存笔记内容——快照
  // 在进入编辑前采集，编辑器挂载前 ref 为空，兜底 selected.content）
  const openAiDialog = useCallback(() => {
    if (!selected) return;
    setEditing(true);
    setAiContent(editorRef.current?.getContent() ?? selected.content);
    setAiDialogOpen(true);
  }, [selected]);

  // 新建笔记（v0.12.2 去摩擦：零对话框——新建即编辑；落未归组「全部笔记」可见）
  const handleCreate = () => {
    invoke<Note>("create_note", { new: { title: "未命名笔记", content: "", source: "manual" } })
      .then((n) => {
        setSelected(n);
        // 若此前在编辑其他笔记，NoteEditView key 变化触发卸载保存
        setEditing(true);
        // 切回笔记视图 + 全部笔记过滤——新笔记立即可见（闭环）
        setView("notes");
        setGroupFilter(null);
        list.setKeyword("");
        list.setTagFilter(null);
        void list.load("", null, list.sortMode);
      })
      .catch((e) => list.setStatus(`新建失败: ${e}`));
  };

  // 列表选中（v0.10.1 F1：切笔记先退出编辑态——NoteEditView 卸载自动保存
  // dirty 草稿，防旧内容串写进新笔记；key 重建双保险）
  const handleSelect = (n: Note) => {
    setSelected(n);
    setEditing(false);
  };

  // v0.11.0：组过滤在客户端生效（列表已全量加载；组切换零请求）
  // v0.20.3（REQ-301）+2026-09-06 审查（TD-E）：SE 封存默认不可见——#树洞
  // tag 精确匹配（防“树洞XX”子串误滤）；除显式显隐开关外任何视图态均排除
  const visibleNotes = useMemo(() => {
    const filtered = groupFilter === null ? list.notes : list.notes.filter((n) => n.group_id === groupFilter);
    return filterSealed(filtered);
  }, [list.notes, groupFilter, filterSealed]);

  // v0.14 B：组映射（noteId → 组，resolveNoteColor 组继承档用）
  const groupMap = useMemo(() => new Map(list.groups.map((g) => [g.id, g])), [list.groups]);
  // v0.14 B：笔记色板 id 映射（四档优先级解析——笔记显式 > 组继承 > 标签 > 默认灰）
  const noteColors = useMemo(() => {
    const m: Record<number, string | null> = {};
    for (const n of visibleNotes) {
      m[n.id] = resolveNoteColor(n, n.group_id != null ? groupMap.get(n.group_id) : null, list.tagColors);
    }
    return m;
  }, [visibleNotes, groupMap, list.tagColors]);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左侧：组筛选侧栏（折叠窄条/列表切换 + 列拖拽手柄见
          components/notes/NotesGroupsColumn）── */}
      <NotesGroupsColumn
        groupsCol={groupsCol}
        groupFilter={groupFilter}
        onGroupFilterChange={(id) => { setGroupFilter(id); setView("notes"); }}
        onChanged={list.refreshAll}
        onOpenReview={onOpenReview}
        selectedNoteId={selected?.id ?? null}
        onOpenInbox={() => { setGroupFilter(null); setView("inbox"); }}
        inboxActive={view === "inbox"}
        refreshToken={list.refreshToken}
        onOpenSystem={onOpenSystem}
        onCleanNotice={notifyCleanNotice}
      />

      {/* ── 中部：收件箱视图 ↔ 笔记列表原位切换 + 列拖拽手柄（三形态切换见
          components/notes/NotesListColumn；手柄在折叠态也渲染）── */}
      <NotesListColumn
        listCol={listCol}
        view={view}
        onChanged={list.refreshAll}
        onCleanNotice={notifyCleanNotice}
        onPromoted={(note) => {
          // 右侧自动打开新笔记（闭环可见）；碎片已从收件箱移除（列表已刷新）
          setSelected(note);
          setEditing(false);
          // 搜索/标签态同步清空（审查修复：原只 load("") 不更新 keyword/tagFilter，
          // 防抖 effect 会用旧搜索词重新覆盖列表——新笔记在「全部笔记」可见）
          list.setKeyword("");
          list.setTagFilter(null);
          setGroupFilter(null);
          void list.load("", null, list.sortMode);
        }}
        notes={visibleNotes}
        groups={list.groups}
        groupFilter={groupFilter}
        keyword={list.keyword}
        tagFilter={list.tagFilter}
        sortMode={list.sortMode}
        allTags={list.allTags}
        selectedId={selected?.id ?? null}
        status={list.status}
        noteColors={noteColors}
        tagColors={list.tagColors}
        refreshToken={list.refreshToken}
        onGroupFilterChange={setGroupFilter}
        onKeywordChange={(kw) => { list.setKeyword(kw); list.setTagFilter(null); }}
        onTagFilterChange={(tag) => { list.setTagFilter(tag); if (tag) list.setKeyword(""); }}
        onSortModeChange={list.setSortMode}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onRefresh={() => void list.load(list.keyword, list.tagFilter, list.sortMode)}
        onOpenSession={(id) => onOpenSessions?.(id)}
        onBatchDelete={runBatchDelete}
        // v0.16.1：笔记行右键菜单动作（复用既有处理——置顶/编辑/删除/归组刷新）
        onNotePinToggle={(n) => void runPinToggle(n)}
        onNoteEdit={(n) => { handleSelect(n); setEditing(true); }}
        onNoteDelete={(n) => void runDelete(n.id)}
        onNoteMoved={() => { list.refreshAll(); void list.handleNoteChanged(); }}
      />

      {/* ── 右栏：阅读视图 / 编辑视图（插槽装配见 components/notes/NotesReadingColumn）── */}
      <NotesReadingColumn
        selected={selected}
        editing={editing}
        setEditing={setEditing}
        readerSearch={readerSearch}
        noteColors={noteColors}
        groups={list.groups}
        editorRef={editorRef}
        outlineCol={outlineCol}
        onChanged={list.handleNoteChanged}
        onError={list.setStatus}
        onCreateSystem={onCreateSystem}
        onOpenAi={openAiDialog}
        onOpenModelCard={openModelCard}
        onSelectionAction={handleSelectionAction}
        onPinToggle={(n) => void runPinToggle(n)}
        onDelete={(id) => void runDelete(id)}
        onTaskToggle={handleTaskToggle}
        onTagClick={(t) => { list.setTagFilter(t); list.setKeyword(""); setView("notes"); }}
        onOpenSession={onOpenSessions}
        onImageOpen={(src, title) => setPreviewImg({ src, title })}
        onCleanNotice={notifyCleanNotice}
      />
      {/* 覆盖层（AI 对话框 / 模型卡对话框 / 图片放大预览 / 清理留痕 toast）——
          条件门控与 key 语义见 components/notes/NotesOverlays */}
      <NotesOverlays
        selected={selected}
        aiOpen={aiDialogOpen}
        aiContent={aiContent}
        onAiClose={() => setAiDialogOpen(false)}
        onAiUpdated={() => void list.handleNoteChanged()}
        modelDialog={modelDialog}
        onModelCardClose={closeModelCard}
        onModelCardCreated={onModelCardCreated}
        previewImg={previewImg}
        onPreviewClose={() => setPreviewImg(null)}
        toast={toast}
      />
    </div>
  );
}