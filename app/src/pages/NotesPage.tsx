/**
 * NotesPage — v0.10.0 笔记独立页面（编排层）。
 *
 * @ai-context: H5 拆分后仅保留数据获取与选中态编排（参照 SessionsPage →
 *              SessionListPanel/SessionDetailPanel 模式）：
 *              NoteListView=左栏列表/筛选/排序；NoteReadingView=右栏阅读视图。
 * @ai-context: H3——VersionPanel（REQ-144 版本时间线）与 EnrichPanel（REQ-142
 *              知识补充）经 auxPanels 插槽挂载于笔记详情区（阅读态可见），
 *              key=note.id 保证切笔记时面板任务状态重置。
 * @ai-context: H1——任务清单勾选回写 createVersion: true（可回滚快照），且
 *              行级定位修复在 NoteMarkdown（渲染序号 → 源行索引）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types";
import NoteEditView from "../components/NoteEditView";
import NoteListView, { parseTags } from "../components/NoteListView";
import type { SortMode } from "../components/NoteListView";
import NoteGroupPanel from "../components/NoteGroupPanel";
import ReviewSessionOverlay from "../components/ReviewSessionOverlay";
import NoteReadingView from "../components/NoteReadingView";
import ImagePreviewOverlay from "../components/ImagePreviewOverlay";
import VersionPanel from "../components/VersionPanel";
import EnrichPanel from "../components/EnrichPanel";
import { useNoteAttention } from "../components/useNoteAttention";

interface Props {
  focusNoteId?: number | null;
  onOpenSessions?: (sessionId: number) => void;
}

export default function NotesPage({ focusNoteId, onOpenSessions }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated-desc");
  // v0.11.0：组过滤（null=全部；NoteGroupPanel 受控）
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  // v0.11.5：树模式受控展开组 id（单值——同一时间只展开一个组；M4 跨页直达设置）
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  // v0.11.2：复习面（groupId=null 全量；undefined=关闭）
  const [review, setReview] = useState<{ groupId: number | null; name: string } | undefined>(undefined);
  const [selected, setSelected] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  // M3：编辑态
  const [editing, setEditing] = useState(false);
  // v0.10.1：图片点击放大预览（复用 ImagePreviewOverlay）
  const [previewImg, setPreviewImg] = useState<{ src: string; title?: string } | null>(null);
  const seqRef = useRef(0);
  // L2：收集异步流程中的 setTimeout——effect cleanup 统一清理防卸载后触发
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // M4：跨页直达 effect 读取最新展开组（避免 stale closure）
  const expandedGroupIdRef = useRef<number | null>(null);
  useEffect(() => { expandedGroupIdRef.current = expandedGroupId; }, [expandedGroupId]);
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

  // L2：卸载时清理所有登记的延迟定时器
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

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
          // M4（审查修复）：跨页直达——目标笔记已归组且该组未展开时，
          // 先展开目标组（受控 expandedGroupId），再等待 DOM 渲染后滚动
          const targetGroupId = target.group_id ?? null;
          const needExpand = targetGroupId != null && expandedGroupIdRef.current !== targetGroupId;
          if (needExpand) setExpandedGroupId(targetGroupId);
          // L2：定时器登记入 ref（cleanup 可清理），不再裸 setTimeout
          timersRef.current.push(
            setTimeout(() => {
              document.getElementById(`note-row-${target.id}`)?.scrollIntoView({ block: "center" });
            }, needExpand ? 200 : 50),
          );
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

  // H1：任务清单勾选回写——本地先行更新（即时反馈），持久化建版本快照可回滚
  // Why: 勾选属用户数据变更；原 createVersion: false 无快照，误勾选无法恢复
  const handleTaskToggle = (newContent: string) => {
    const cur = selectedRef.current;
    if (!cur) return;
    const { id, title } = cur;
    setSelected((prev) => (prev?.id === id ? { ...prev, content: newContent } : prev));
    invoke("update_note", { id, title, content: newContent, createVersion: true }).catch((e) => {
      console.warn(`[NotesPage] 任务勾选回写失败（笔记 ${id}）`, e);
    });
  };

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
  }, [keyword, tagFilter, sortMode, load]);

  // 新建笔记（v0.10.1 F1：新建即编辑）
  const handleCreate = () => {
    const title = prompt("笔记标题：", "未命名笔记");
    if (!title) return;
    invoke<Note>("create_note", { new: { title, content: "", source: "manual" } })
      .then((n) => {
        setSelected(n);
        // 若此前在编辑其他笔记，NoteEditView key 变化触发卸载保存
        setEditing(true);
        void load(keyword, tagFilter, sortMode);
      })
      .catch((e) => setStatus(`新建失败: ${e}`));
  };

  // 列表选中（v0.10.1 F1：切笔记先退出编辑态——NoteEditView 卸载自动保存
  // dirty 草稿，防旧内容串写进新笔记；key 重建双保险）
  const handleSelect = (n: Note) => {
    setSelected(n);
    setEditing(false);
  };

  // ── 收集所有标签 ──
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => parseTags(n).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  // v0.11.0：组过滤在客户端生效（列表已全量加载；组切换零请求）
  const visibleNotes = useMemo(
    () => (groupFilter === null ? notes : notes.filter((n) => n.group_id === groupFilter)),
    [notes, groupFilter],
  );

  // v0.11.5：搜索/标签过滤激活 → 平铺模式（树退化为两栏布局）
  const flatMode = keyword !== "" || tagFilter !== null;

  // H3：辅助面板插槽——VersionPanel（版本时间线）+ EnrichPanel（知识补充），
  // 与 NoteEditView 同层的笔记详情区；key=note.id 切笔记重置面板内部任务态
  const auxPanels = selected ? (
    <>
      <EnrichPanel key={`enrich-${selected.id}`} noteId={selected.id} onUpdated={() => void handleNoteChanged()} />
      <VersionPanel key={`version-${selected.id}`} noteId={selected.id} onChanged={() => void handleNoteChanged()} />
    </>
  ) : null;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 组树面板（v0.11.5：非平铺=树形合并；平铺=仅组侧栏）── */}
      <NoteGroupPanel
        groupFilter={groupFilter}
        onGroupFilterChange={setGroupFilter}
        selectedNoteId={selected?.id ?? null}
        onChanged={() => void load(keyword, tagFilter, sortMode)}
        onOpenReview={(groupId, name) => setReview({ groupId, name })}
        allNotes={notes}
        flatMode={flatMode}
        selectedId={selected?.id ?? null}
        onSelectNote={handleSelect}
        onOpenSession={(id) => onOpenSessions?.(id)}
        keyword={keyword}
        tagFilter={tagFilter}
        sortMode={sortMode}
        onKeywordChange={(kw) => { setKeyword(kw); setTagFilter(null); }}
        onCreate={handleCreate}
        expandedGroupId={expandedGroupId}
        onExpandedGroupChange={setExpandedGroupId}
      />
      {/* v0.11.5：平铺模式（搜索/标签过滤激活）→ 显示传统列表 */}
      {flatMode && (
        <NoteListView
          notes={visibleNotes}
          keyword={keyword}
          tagFilter={tagFilter}
          sortMode={sortMode}
          allTags={allTags}
          selectedId={selected?.id ?? null}
          status={status}
          onKeywordChange={(kw) => { setKeyword(kw); setTagFilter(null); }}
          onTagFilterChange={(tag) => { setTagFilter(tag); if (tag) setKeyword(""); }}
          onSortModeChange={setSortMode}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onRefresh={() => void load(keyword, tagFilter, sortMode)}
          onOpenSession={(id) => onOpenSessions?.(id)}
        />
      )}

      {/* ── 右栏：阅读视图 / 编辑视图 ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", overflow: "hidden" }}>
        {selected ? (
          <NoteReadingView
            note={selected}
            editing={editing}
            editor={
              <NoteEditView
                key={selected.id}
                note={selected}
                onCancel={() => {
                  setEditing(false);
                  void load(keyword, tagFilter, sortMode);
                }}
              />
            }
            auxPanels={auxPanels}
            onEdit={() => setEditing(true)}
            onPinToggle={() => void runPinToggle(selected)}
            onDelete={() => void runDelete(selected.id)}
            onTagClick={(t) => { setTagFilter(t); setKeyword(""); }}
            onOpenSession={(id) => onOpenSessions?.(id)}
            onTaskToggle={handleTaskToggle}
            onImageOpen={(src, title) => setPreviewImg({ src, title })}
          />
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
      {/* v0.11.2：组级复习面（提取优先；评分推进 FSRS 调度） */}
      {review && (
        <ReviewSessionOverlay
          groupId={review.groupId}
          groupName={review.name}
          onClose={() => setReview(undefined)}
        />
      )}
    </div>
  );
}
