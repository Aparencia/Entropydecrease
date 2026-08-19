/**
 * SessionListPanel — 会话管理台左栏（列表/筛选/批量/搜索，v0.7.1 自 SessionsPage 拆出）。
 *
 * @ai-context: 纯列表域 UI：双模式搜索（标题本地即时过滤/转写内容段搜索）、
 *              状态与转化筛选、排序、课程分组折叠、勾选批量操作栏、内联一键转笔记。
 *              筛选/排序/选择均为面板本地状态（数据已在 SessionListItem 里，
 *              零后端往返）；数据获取与转化/删除副作用经回调上抛给 SessionsPage。
 * @ai-context: 转化状态可见化核心：录制中/待转/已转笔记/异常徽标 +
 *              可转化判定（已结束 + 有内容 + 未转）。
 */
import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CourseGroup, SegmentHit, Session, SessionListItem } from "../types";
import { fmtDate, fmtDuration, fmtMs } from "../utils/fmt";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };
const selectStyle: React.CSSProperties = {
  fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff",
};
const convertBtn: React.CSSProperties = {
  ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #0d9488",
  background: "#f0fdfa", color: "#0f766e", fontWeight: 600,
};
const viewNoteBtn: React.CSSProperties = {
  ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#0f766e",
};

type StatusFilter = "all" | "recording" | "finished" | "failed";
type ConvertedFilter = "all" | "todo" | "done";
type SortBy = "time-desc" | "time-asc" | "duration";
type SearchMode = "title" | "content";

interface Props {
  items: SessionListItem[];
  groups: CourseGroup[] | null;
  grouped: boolean;
  onToggleGrouped: () => void;
  loading: boolean;
  /** 新完成会话数（一次性横幅） */
  justFinished: number;
  onDismissJustFinished: () => void;
  /** 当前打开详情会话 id（列表高亮） */
  openSessionId: number | null;
  onOpenDetail: (id: number) => void;
  onConvert: (item: SessionListItem) => void;
  onOpenNote: (noteId: number) => void;
  /** 批量转笔记（入参已过滤为可转化 id；父层负责 invoke/toast/刷新） */
  onBatchConvert: (eligibleIds: number[]) => void;
  /** 批量删除（父层负责确认/invoke/toast/刷新） */
  onBatchDelete: (ids: number[]) => void;
  showToast: (msg: string, kind: "ok" | "err") => void;
}

export default function SessionListPanel({
  items, groups, grouped, onToggleGrouped, loading, justFinished, onDismissJustFinished,
  openSessionId, onOpenDetail, onConvert, onOpenNote, onBatchConvert, onBatchDelete, showToast,
}: Props) {
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("title");
  const [searchKw, setSearchKw] = useState("");
  const [hits, setHits] = useState<SegmentHit[] | null>(null); // REQ-079：段搜索命中
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterConverted, setFilterConverted] = useState<ConvertedFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("time-desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /** REQ-079：段搜索（片段上下文 + 点击跳详情） */
  const searchSegments = async () => {
    const kw = searchKw.trim();
    if (!kw) {
      setHits(null);
      return;
    }
    try {
      setHits(await invoke<SegmentHit[]>("search_session_segments", { keyword: kw }));
    } catch (e) {
      showToast(`段搜索失败: ${e}`, "err");
    }
  };

  /** 可转化判定：已结束 + 有内容 + 未转（批量转只对该集合生效） */
  const isEligible = useCallback(
    (item: SessionListItem) =>
      item.session.status !== "recording" && item.hasContent && !item.hasNote,
    [],
  );

  /** 筛选谓词（列表与课程分组共用） */
  const matchFilters = useCallback(
    (item: SessionListItem) => {
      if (filterStatus !== "all" && item.session.status !== filterStatus) return false;
      if (filterConverted === "todo" && (item.hasNote || !item.hasContent)) return false;
      if (filterConverted === "done" && !item.hasNote) return false;
      const kw = keyword.trim().toLowerCase();
      if (kw) {
        const hay = `${item.session.title} ${item.session.source_window ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    },
    [filterStatus, filterConverted, keyword],
  );

  /** 本地排序（时间倒序为后端默认序，保持稳定不重排） */
  const sorted = useMemo(() => {
    const list = [...items];
    const endOf = (s: Session) => s.ended_at ?? Math.floor(Date.now() / 1000);
    if (sortBy === "time-asc") {
      list.sort((a, b) => a.session.started_at - b.session.started_at);
    } else if (sortBy === "duration") {
      list.sort(
        (a, b) =>
          (endOf(b.session) - b.session.started_at) - (endOf(a.session) - a.session.started_at),
      );
    }
    return list;
  }, [items, sortBy]);

  const filtered = useMemo(() => sorted.filter(matchFilters), [sorted, matchFilters]);

  /** 课程分组视图（组内同样应用筛选 + 排序） */
  const groupedView = useMemo(() => {
    if (!groups) return null;
    const endOf = (s: Session) => s.ended_at ?? Math.floor(Date.now() / 1000);
    return groups
      .map((g) => ({
        ...g,
        sessions: g.sessions.filter(matchFilters).sort((a, b) => {
          if (sortBy === "time-asc") return a.session.started_at - b.session.started_at;
          if (sortBy === "duration")
            return (endOf(b.session) - b.session.started_at) - (endOf(a.session) - a.session.started_at);
          return 0; // time-desc：后端已按新→旧
        }),
      }))
      .filter((g) => g.sessions.length > 0);
  }, [groups, matchFilters, sortBy]);

  const toggleSelect = (id: number) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterConverted("all");
    setKeyword("");
  };

  /** 批量转：先过滤出可转化集合（已转/进行中/无内容不在其中） */
  const runBatchConvert = () => {
    const byId = new Map<number, SessionListItem>();
    for (const i of items) byId.set(i.session.id, i);
    for (const g of groups ?? []) for (const i of g.sessions) byId.set(i.session.id, i);
    const eligibleIds = [...selected].filter((id) => {
      const item = byId.get(id);
      return item ? isEligible(item) : false;
    });
    if (eligibleIds.length === 0) {
      showToast("选中的会话均不可转换（已转/进行中/无内容）", "err");
      return;
    }
    setSelected(new Set());
    onBatchConvert(eligibleIds);
  };

  /** 列表项状态徽标（转化状态可见化核心） */
  const statusBadge = (item: SessionListItem) => {
    const s = item.session;
    if (s.status === "recording")
      return <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>● 录制中</span>;
    if (item.hasNote)
      return (
        <span style={{ fontSize: 11, fontWeight: 600, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 10, padding: "1px 7px" }}>
          ✓ 已转笔记
        </span>
      );
    if (s.status === "failed") return <span style={{ fontSize: 11, color: "#dc2626" }}>异常</span>;
    if (item.hasContent)
      return (
        <span style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "1px 7px" }}>
          待转
        </span>
      );
    return <span style={{ fontSize: 11, color: "#6b7280" }}>已完成</span>;
  };

  /** 列表项（列表/分组共用）：勾选 + 徽标 + 元信息 + 内联转化/查看笔记 */
  const renderItem = (item: SessionListItem) => {
    const s = item.session;
    const checked = selected.has(s.id);
    const now = Math.floor(Date.now() / 1000);
    const durationMs = ((s.ended_at ?? now) - s.started_at) * 1000;
    return (
      <div
        key={s.id}
        onClick={() => onOpenDetail(s.id)}
        style={{
          padding: "9px 14px",
          borderBottom: "1px solid #f3f4f6",
          cursor: "pointer",
          background: openSessionId === s.id ? "#f0fdfa" : "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelect(s.id)}
            style={{ cursor: "pointer", flexShrink: 0 }}
          />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.title}>
            {s.title}
          </span>
          {statusBadge(item)}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3, display: "flex", alignItems: "center", gap: 8, paddingLeft: 22 }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            #{s.id} · {fmtDate(s.started_at)}
          </span>
          <span>{s.status === "recording" ? "进行中" : fmtDuration(durationMs)}</span>
          {s.source_window && (
            <span style={{ maxWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.source_window}
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {item.hasNote ? (
              <button
                style={viewNoteBtn}
                title="打开关联笔记"
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.noteId != null) onOpenNote(item.noteId);
                }}
              >
                查看笔记 →
              </button>
            ) : isEligible(item) ? (
              <button
                style={convertBtn}
                title="一键转为笔记（与详情页同管线）"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvert(item);
                }}
              >
                转笔记
              </button>
            ) : null}
          </span>
        </div>
      </div>
    );
  };

  const modeBtn = (activeMode: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: "4px 8px",
    border: "none",
    cursor: "pointer",
    background: activeMode ? "#ccfbf1" : "#fff",
    color: activeMode ? "#0f766e" : "#6b7280",
    fontWeight: activeMode ? 600 : 400,
  });

  return (
    <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center" }}>
        🗂 学习会话
        <button
          style={{ ...btn, marginLeft: "auto", fontSize: 11, borderRadius: 6, border: grouped ? "1px solid #0d9488" : "1px solid #e5e7eb", background: grouped ? "#ccfbf1" : "#fff" }}
          onClick={onToggleGrouped}
          title="按课程分组（标题章节前缀）"
        >
          {grouped ? "分组中" : "按课程分组"}
        </button>
      </div>

      {/* 搜索：标题（本地即时过滤）/ 转写内容（段搜索）双模式单输入框 */}
      <div style={{ padding: 10, display: "flex", gap: 6 }}>
        <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
          <button style={modeBtn(searchMode === "title")} onClick={() => { setSearchMode("title"); setHits(null); }}>标题</button>
          <button style={modeBtn(searchMode === "content")} onClick={() => setSearchMode("content")}>内容</button>
        </div>
        {searchMode === "title" ? (
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索标题/窗口…"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
          />
        ) : (
          <>
            <input
              value={searchKw}
              onChange={(e) => setSearchKw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchSegments()}
              placeholder="转写内容关键词…"
              style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
            />
            <button style={btn} onClick={() => void searchSegments()}>段搜</button>
          </>
        )}
      </div>

      {/* 筛选 + 排序（本地即时生效） */}
      <div style={{ padding: "0 10px 10px", display: "flex", gap: 6, alignItems: "center" }}>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as StatusFilter)} style={selectStyle} title="按会话状态筛选">
          <option value="all">全部状态</option>
          <option value="recording">录制中</option>
          <option value="finished">已完成</option>
          <option value="failed">异常</option>
        </select>
        <select value={filterConverted} onChange={(e) => setFilterConverted(e.target.value as ConvertedFilter)} style={selectStyle} title="按转化状态筛选">
          <option value="all">全部转化</option>
          <option value="todo">未转</option>
          <option value="done">已转</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={selectStyle} title="排序">
          <option value="time-desc">新→旧</option>
          <option value="time-asc">旧→新</option>
          <option value="duration">时长</option>
        </select>
      </div>

      {/* v0.7.1：新完成会话一次性提示条 */}
      {justFinished > 0 && (
        <div style={{ margin: "0 10px 8px", fontSize: 12, color: "#0f766e", background: "#f0fdfa", border: "1px solid #5eead4", borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8 }}>
          📬 {justFinished} 个会话已完成采集
          <span style={{ marginLeft: "auto", cursor: "pointer", fontWeight: 600 }} onClick={onDismissJustFinished}>✕</span>
        </div>
      )}

      {/* 列表区 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading && items.length === 0 && (
          <p style={{ fontSize: 12, color: "#9ca3af", padding: 16, textAlign: "center" }}>加载中…</p>
        )}
        {!loading && items.length === 0 && !hits && (
          <p style={{ fontSize: 12, color: "#9ca3af", padding: 16, textAlign: "center" }}>
            暂无会话，去「课堂助手」开始实时捕获
          </p>
        )}
        {hits ? (
          /* 段搜索命中列表（高亮片段 + 跳详情定位） */
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
              「{searchKw}」命中 {hits.length} 条
            </div>
            {hits.map((h, i) => (
              <div
                key={i}
                onClick={() => onOpenDetail(h.session_id)}
                style={{ fontSize: 12, color: "#374151", padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
              >
                <div style={{ fontWeight: 500, color: "#0f766e" }}>{h.session_title}</div>
                <div style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>[{fmtMs(h.start_ms)}]</div>
                <div>
                  {h.snippet.split(searchKw).map((part, j, arr) => (
                    <span key={j}>
                      {part}
                      {j < arr.length - 1 && <mark style={{ background: "#fef08a", padding: "0 1px", borderRadius: 2 }}>{searchKw}</mark>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : grouped && groupedView ? (
          /* 课程分组（折叠 + 组内筛选排序） */
          groupedView.map((g) => (
            <div key={g.course}>
              <div
                onClick={() => setCollapsed((c) => ({ ...c, [g.course]: !c[g.course] }))}
                style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#0f766e", cursor: "pointer", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}
              >
                {collapsed[g.course] ? "▸" : "▾"} {g.course}（{g.sessions.length}）
              </div>
              {!collapsed[g.course] && g.sessions.map(renderItem)}
            </div>
          ))
        ) : items.length > 0 && filtered.length === 0 ? (
          /* 筛选无结果：给出清除入口 */
          <p style={{ fontSize: 12, color: "#9ca3af", padding: 16, textAlign: "center" }}>
            无匹配会话{" "}
            <button style={{ ...btn, fontSize: 11 }} onClick={clearFilters}>
              清除筛选
            </button>
          </p>
        ) : (
          filtered.map(renderItem)
        )}
      </div>

      {/* 批量操作栏（勾选后出现；段搜索命中视图隐藏——避免对不可见列表误操作） */}
      {!hits && selected.size > 0 && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
          <span style={{ fontSize: 12, color: "#374151" }}>已选 {selected.size} 个</span>
          <button
            style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", fontWeight: 600 }}
            onClick={runBatchConvert}
          >
            批量转笔记
          </button>
          <button style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #fca5a5", color: "#dc2626" }} onClick={() => onBatchDelete([...selected])}>
            批量删除
          </button>
          <button style={{ ...btn, marginLeft: "auto", fontSize: 11 }} onClick={clearSelection}>
            取消
          </button>
        </div>
      )}
    </div>
  );
}
