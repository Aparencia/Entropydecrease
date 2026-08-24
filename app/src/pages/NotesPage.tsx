/**
 * NotesPage — v0.12.2 笔记页三栏编排层（信息架构重构）。
 *
 * @ai-context: 三栏分工（规划 §2）——GroupSidebar（240px 组筛选/快速记录/
 *              收件箱入口）+ 中部列表（收件箱视图 ↔ NoteListView 原位切换，
 *              布局不变）+ 右栏阅读/编辑（NoteReadingView）。groupFilter
 *              只做过滤——组行单击不再有展开动作（决策 1 三元分离）。
 * @ai-context: 收件箱动线（决策 2 二元论）——碎片=原料；升笔记成功后
 *              onPromoted 打开新笔记（右侧闭环可见），碎片即时从收件箱移除；
 *              未归组笔记在「全部笔记」可见（两种实体两条动线）。
 * @ai-context: H3 辅助面板插槽（VersionPanel/EnrichPanel）与 H1 任务回写、
 *              Ctrl+E/ESC、图片预览、组级复习面均沿用 v0.11.x 语义。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Note } from "../types";
import NoteEditView, { type NoteEditHandle } from "../components/NoteEditView";
import NoteListView, { parseTags } from "../components/NoteListView";
import type { SortMode } from "../components/NoteListView";
import GroupSidebar from "../components/GroupSidebar";
import FeedFragmentList from "../components/FeedFragmentList";
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

/** 中部视图：notes=笔记列表（组过滤/搜索/标签）；inbox=收件箱碎片列表 */
type MiddleView = "notes" | "inbox";

export default function NotesPage({ focusNoteId, onOpenSessions }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated-desc");
  // v0.11.0：组过滤（null=全部；仅过滤——不触发展开）
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  // v0.12.2：中部视图（收件箱 ↔ 笔记列表原位切换）
  const [view, setView] = useState<MiddleView>("notes");
  // v0.11.2：复习面（groupId=null 全量；undefined=关闭）
  const [review, setReview] = useState<{ groupId: number | null; name: string } | undefined>(undefined);
  const [selected, setSelected] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  // M3：编辑态
  const [editing, setEditing] = useState(false);
  // v0.10.1：图片点击放大预览
  const [previewImg, setPreviewImg] = useState<{ src: string; title?: string } | null>(null);
  // v0.12.2：侧栏刷新令牌（捕获/升降/结算后计数与组列表重载）
  const [refreshToken, setRefreshToken] = useState(0);
  const seqRef = useRef(0);
  // L2：收集异步流程中的 setTimeout——effect cleanup 统一清理防卸载后触发
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
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

  // focusNoteId 跨页直达（三栏下无需展开——列表常驻，滚动定位即可）
  useEffect(() => {
    if (focusNoteId == null) return;
    let disposed = false;
    (async () => {
      setKeyword("");
      setTagFilter(null);
      setView("notes");
      const seq = ++seqRef.current;
      try {
        const list = await invoke<Note[]>("list_notes", { sortMode: "updated-desc" });
        if (disposed || seqRef.current !== seq) return;
        setNotes(list);
        const target = list.find((n) => n.id === focusNoteId);
        if (target) {
          setSelected(target);
          // L2：定时器登记入 ref（cleanup 可清理），不再裸 setTimeout
          timersRef.current.push(
            setTimeout(() => {
              document.getElementById(`note-row-${target.id}`)?.scrollIntoView({ block: "center" });
            }, 50),
          );
        }
      } catch (e) {
        if (!disposed) setStatus(`加载失败: ${e}`);
      }
    })();
    return () => { disposed = true; };
  }, [focusNoteId]);

  // v0.10.1 F5：Ctrl+E 进入 / ESC 退出编辑——单一 window 监听 + ref 持有
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
          void handleNoteChangedRef.current();
        })();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── 操作 ──
  const refreshAll = useCallback(() => {
    setRefreshToken((t) => t + 1);
    void load(keyword, tagFilter, sortMode);
  }, [keyword, tagFilter, sortMode, load]);

  const runDelete = async (id: number) => {
    try {
      await invoke<boolean>("delete_note", { id });
      if (selected?.id === id) setSelected(null);
      void load(keyword, tagFilter, sortMode);
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    }
  };

  /**
   * v0.12.8：列表级批量删除（用户要求：与「会话」管理台同操作逻辑——勾选 +
   * 确认 + 逐条 invoke，无需先打开笔记；删除选中笔记同步清空右栏选中态）。
   * 返回是否执行了删除（取消确认返回 false——父面板据此保留/清空勾选）。
   */
  const runBatchDelete = async (ids: number[]): Promise<boolean> => {
    const ok = await confirm(`确定删除选中的 ${ids.length} 个笔记？删除后不可恢复。`, {
      title: "熵减",
      kind: "warning",
    });
    if (!ok) return false;
    let failed = 0;
    for (const id of ids) {
      try {
        await invoke<boolean>("delete_note", { id });
        if (selected?.id === id) setSelected(null);
      } catch {
        failed += 1;
      }
    }
    setStatus(failed > 0 ? `已删除 ${ids.length - failed} 个，${failed} 个失败` : "");
    void load(keyword, tagFilter, sortMode);
    return true;
  };

  const runPinToggle = async (note: Note) => {
    try {
      const newPin = note.pin ? 0 : 1;
      await invoke<boolean>("update_note_pin", { id: note.id, pin: newPin });
      setSelected((prev) => (prev?.id === note.id ? { ...prev, pin: newPin } : prev));
      void load(keyword, tagFilter, sortMode);
    } catch (e) {
      setStatus(`固定操作失败: ${e}`);
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

  // v0.13.6：编辑退出三出口（完成/Ctrl+E/ESC）统一刷新——ESC 是 []-deps 窗口监听，
  // 经 ref 取最新 handleNoteChanged（防闭包持有旧 keyword/tagFilter 快照）
  const handleNoteChangedRef = useRef(handleNoteChanged);
  useEffect(() => { handleNoteChangedRef.current = handleNoteChanged; }, [handleNoteChanged]);
  // v0.13.6（审查 H1 修复）：编辑器命令式出口——ESC 先 await 保存再刷新（防卸载
  // 保存与 get_note 竞态在 ESC 出口重演"编辑后右栏旧值"）
  const editorRef = useRef<NoteEditHandle | null>(null);

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
        setKeyword("");
        setTagFilter(null);
        void load("", null, sortMode);
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

  // H3：辅助面板插槽——VersionPanel + EnrichPanel，key=note.id 切笔记重置内部任务态
  const auxPanels = selected ? (
    <>
      <EnrichPanel key={`enrich-${selected.id}`} noteId={selected.id} onUpdated={() => void handleNoteChanged()} />
      <VersionPanel key={`version-${selected.id}`} noteId={selected.id} onChanged={() => void handleNoteChanged()} />
    </>
  ) : null;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左侧：组筛选侧栏（240px）── */}
      <GroupSidebar
        groupFilter={groupFilter}
        onGroupFilterChange={(id) => { setGroupFilter(id); setView("notes"); }}
        onChanged={refreshAll}
        onOpenReview={(groupId, name) => setReview({ groupId, name })}
        selectedNoteId={selected?.id ?? null}
        // 收件箱=全量碎片视图，与组过滤无关——清组过滤消除"组行高亮 + 收件箱"
        // 并存矛盾（审查修复）
        onOpenInbox={() => { setGroupFilter(null); setView("inbox"); }}
        inboxActive={view === "inbox"}
        refreshToken={refreshToken}
      />

      {/* ── 中部：收件箱视图 ↔ 笔记列表原位切换（布局不变）── */}
      {view === "inbox" ? (
        <FeedFragmentList
          onChanged={refreshAll}
          onPromoted={(note) => {
            // 右侧自动打开新笔记（闭环可见）；碎片已从收件箱移除（列表已刷新）
            setSelected(note);
            setEditing(false);
            // 搜索/标签态同步清空（审查修复：原只 load("") 不更新 keyword/tagFilter，
            // 防抖 effect 会用旧搜索词重新覆盖列表——新笔记在「全部笔记」可见）
            setKeyword("");
            setTagFilter(null);
            setGroupFilter(null);
            void load("", null, sortMode);
          }}
        />
      ) : (
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
          onBatchDelete={runBatchDelete}
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
                ref={editorRef}
                note={selected}
                onCancel={() => {
                  // v0.13.6：完成编辑 → 列表重载 + 选中笔记重取（右栏立即显示新标题/正文）
                  setEditing(false);
                  void handleNoteChanged();
                }}
              />
            }
            auxPanels={auxPanels}
            onEdit={() => setEditing(true)}
            onPinToggle={() => void runPinToggle(selected)}
            onDelete={() => void runDelete(selected.id)}
            onTagClick={(t) => { setTagFilter(t); setKeyword(""); setView("notes"); }}
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
      {/* v0.10.1：图片放大预览（ESC/点击遮罩关闭——与编辑退出 ESC 互斥） */}
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
