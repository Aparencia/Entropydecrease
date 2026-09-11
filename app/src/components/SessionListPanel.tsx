/**
 * SessionListPanel — 会话管理台左栏（列表/筛选/批量/搜索，v0.7.1 自 SessionsPage 拆出）。
 *
 * @ai-context: 纯列表域 UI：双模式搜索（标题本地即时过滤/转写内容段搜索）、
 *              状态与转化筛选、排序、课程分组折叠、勾选批量操作栏、内联一键转笔记。
 *              筛选/排序/选择均为面板本地状态（数据已在 SessionListItem 里，
 *              零后端往返）；数据获取与转化/删除副作用经回调上抛给 SessionsPage。
 * @ai-context: 批 4 交互矩阵：去行内 checkbox → 笔记同款选择模式——「选择」
 *              按钮进入（单击行=勾选）/ 再点或 Esc 退出；Ctrl/⌘+单击=加/减单
 *              行、Shift+单击=按当前可见列表位置区间（复用 utils/noteSelection
 *              纯函数，零笔记域耦合）；多选态视觉=靛蓝底 + ✓ 前缀（行级实现
 *              在 SessionListRow）。列表变化（筛选/排序/折叠/刷新）自动裁剪
 *              选集至当前可见行；批量栏口径=当前可见列表（全选框三态保留）。
 * @ai-context: Esc 退出链：行内重命名（输入内 Esc 自吞）→ 右键菜单 → 选择
 *              模式/多选态（清选集退出）；右键菜单=单行语义（打开详情/重命名/
 *              复制标题/转笔记/删除——SessionRowContextMenu 委托父层处理）。
 */
import { useEffect, useRef, useState } from "react";
import type { CourseGroup, SessionListItem } from "../types";
import { isSessionConvertible } from "../utils/sessionEligibility";
import {
  useSessionListView,
  type ConvertedFilter,
  type SortBy,
  type StatusFilter,
} from "../hooks/useSessionListView";
import { useSessionSearch } from "../hooks/useSessionSearch";
import { useSessionSelection } from "../hooks/useSessionSelection";
import type { SessionRenameRequest } from "./SessionListRow";
import SessionRowContextMenu from "./SessionRowContextMenu";
import SessionListBody from "./SessionListBody";
import SessionSearchBar from "./SessionSearchBar";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };
const selectStyle: React.CSSProperties = {
  fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff",
};

interface Props {
  /** 列宽（v0.15 全站自适应——父层 useColumnLayout 驱动；缺省 320=历史值） */
  width?: number;
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
  /** 打开详情（可选 targetSegId：段搜索命中段定位——M4 修复透传） */
  onOpenDetail: (id: number, targetSegId?: number) => void;
  onConvert: (item: SessionListItem) => void;
  onOpenNote: (noteId: number) => void;
  /** 批量转笔记（入参已过滤为可转化 id；父层负责 invoke/toast/刷新） */
  onBatchConvert: (eligibleIds: number[]) => void | Promise<unknown>;
  /** 批量删除（父层负责确认/invoke/toast/刷新；resolve=true=全部删除成功） */
  onBatchDelete: (ids: number[]) => Promise<boolean>;
  /** 单行删除（右键菜单；父层复用详情页删除动线——确认/清详情/刷新） */
  onDeleteOne: (id: number) => void;
  /** 行内改名成功（父层刷新当前打开详情——列表刷新走 data:sessions-changed 总线） */
  onSessionRenamed: (id: number) => void;
  showToast: (msg: string, kind: "ok" | "err") => void;
  /** v0.15：折叠为窄条（父层 useColumnLayout.setManualFolded(true)） */
  onCollapse?: () => void;
}

export default function SessionListPanel({
  width = 320, items, groups, grouped, onToggleGrouped, loading, justFinished, onDismissJustFinished,
  openSessionId, onOpenDetail, onConvert, onOpenNote, onBatchConvert, onBatchDelete, onDeleteOne,
  onSessionRenamed, showToast, onCollapse,
}: Props) {
  // ── 三模式搜索（批 0-C2 拆至 hooks/useSessionSearch：唯一两个 invoke 的落点）──
  const {
    keyword, setKeyword, searchMode, selectMode, searchKw, setSearchKw,
    hits, ocrHits, ocrBusy, searchSegments, searchOcrBlocks,
  } = useSessionSearch({ showToast });
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterConverted, setFilterConverted] = useState<ConvertedFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("time-desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ item: SessionListItem; x: number; y: number } | null>(null);
  // 行内重命名请求（nonce：同一行连续两次「重命名」也能重启编辑态）
  const [renameReq, setRenameReq] = useState<SessionRenameRequest | null>(null);
  const renameNonceRef = useRef(0);
  // 批 4 审查修复（P3-2）：批量操作 pending——state=按钮禁用视觉，ref=同 tick
  // 拦截（state 更新异步，连点需 ref 立即生效；与行内改名 busyRef 同模式）。
  // Why：原无防护，双击「批量删除」二次提交报"已删除 0 个"（首次已删空选集
  // 数据、二次空跑）；批量转同理。
  const [batchBusy, setBatchBusy] = useState<"convert" | "delete" | null>(null);
  const batchBusyRef = useRef(false);

  // ── 视图模型（批 0-C2 拆至 hooks/useSessionListView）──
  const { filtered, groupedView, visibleOrder } = useSessionListView({
    items, groups, grouped, collapsed, filterStatus, filterConverted, keyword, sortBy,
  });

  // ── 多选/选择模式状态机（批 0-C2 拆至 hooks/useSessionSelection）──
  const {
    selected, selectionMode, clearSelection, exitBatch, enterSelectionMode,
    rowOpen, rowModifier, toggleAllVisible,
  } = useSessionSelection({ visibleOrder, onOpenDetail });

  // Esc 退出链：右键菜单 → 选择模式/多选态（清选集退出）。
  // （行内重命名输入内已 stopPropagation 自吞 Esc——不在此列）
  // ★ 全面板唯一 window keydown：优先级=右键菜单先 return（菜单开着时按 Esc 只关菜单，
  //   选集保留）。**不得**把 Esc 挪进 useSessionSelection 另建监听——两个监听会让一次
  //   Esc 同时关菜单 + 清选集（行为不等价）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (contextMenu) { setContextMenu(null); return; }
      if (selectionMode || selected.size > 0) exitBatch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextMenu, selectionMode, selected.size, exitBatch]);

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterConverted("all");
    setKeyword("");
  };

  /** 分组折叠切换（列表区组头点击——原内联 setCollapsed 收敛于此，语义不变） */
  const toggleCollapse = (course: string) => setCollapsed((c) => ({ ...c, [course]: !c[course] }));

  /** 批量转：先过滤出可转化集合（已转/进行中/无内容不在其中）；pending 防连点
   *（P3-2——onBatchConvert 允许返回 Promise：父层 invoke 完成前按钮保持禁用） */
  const runBatchConvert = async () => {
    if (batchBusyRef.current) return;
    const byId = new Map<number, SessionListItem>();
    for (const i of items) byId.set(i.session.id, i);
    for (const g of groups ?? []) for (const i of g.sessions) byId.set(i.session.id, i);
    const eligibleIds = [...selected].filter((id) => {
      const item = byId.get(id);
      return item ? isSessionConvertible(item) : false;
    });
    if (eligibleIds.length === 0) {
      showToast("选中的会话均不可转换（已转/进行中/无内容）", "err");
      return;
    }
    batchBusyRef.current = true;
    setBatchBusy("convert");
    clearSelection();
    try {
      await onBatchConvert(eligibleIds);
    } finally {
      batchBusyRef.current = false;
      setBatchBusy(null);
    }
  };

  const selectModeBtn = (on: boolean): React.CSSProperties => ({
    ...btn,
    fontSize: 11,
    borderRadius: 6,
    border: on ? "1px solid #4f46e5" : "1px solid #d1d5db",
    background: on ? "#eef2ff" : "#fff",
    color: on ? "#3730a3" : "#4b5563",
    fontWeight: on ? 600 : 400,
  });

  return (
    <div style={{ width, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center" }}>
        🗂 学习会话
        <button
          onClick={onCollapse}
          style={{ ...btn, fontSize: 11, border: "none", background: "none", color: "#9ca3af", marginLeft: 4 }}
          title="折叠列表"
        >
          ⟨
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {/* 批 4：选择模式进入/退出（再点或 Esc 退出；进入后单击行=勾选） */}
          {selectionMode && (
            <span
              data-testid="session-select-mode-chip"
              style={{ fontSize: 10.5, color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: 10, padding: "0 6px", background: "#eef2ff", lineHeight: "16px", fontWeight: 400 }}
            >
              选择模式{selected.size > 0 ? `（${selected.size}）` : ""}
            </span>
          )}
          <button
            data-testid="session-select-mode-btn"
            style={selectModeBtn(selectionMode)}
            onClick={() => (selectionMode ? exitBatch() : enterSelectionMode())}
            title={selectionMode ? "退出选择模式（Esc）" : "进入选择模式：单击会话=勾选（Ctrl/Shift 多选）"}
          >
            选择
          </button>
          <button
            style={{ ...btn, fontSize: 11, borderRadius: 6, border: grouped ? "1px solid #0d9488" : "1px solid #e5e7eb", background: grouped ? "#ccfbf1" : "#fff" }}
            onClick={onToggleGrouped}
            title="按课程分组（标题章节前缀）"
          >
            {grouped ? "分组中" : "按课程分组"}
          </button>
        </div>
      </div>

      {/* 搜索：标题（本地即时过滤）/ 转写内容（段搜索）/ 画面（图内文字）三模式单输入框 */}
      <SessionSearchBar
        searchMode={searchMode}
        keyword={keyword}
        searchKw={searchKw}
        ocrBusy={ocrBusy}
        onSelectMode={selectMode}
        onKeywordChange={setKeyword}
        onSearchKwChange={setSearchKw}
        onSearchSegments={() => void searchSegments()}
        onSearchOcrBlocks={() => void searchOcrBlocks()}
      />

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

      {/* 列表区（批 0-C2 拆至 components/SessionListBody） */}
      <SessionListBody
        loading={loading}
        itemCount={items.length}
        hits={hits}
        ocrHits={ocrHits}
        searchKw={searchKw}
        grouped={grouped}
        groupedView={groupedView}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        filtered={filtered}
        onClearFilters={clearFilters}
        onOpenDetail={onOpenDetail}
        openSessionId={openSessionId}
        selected={selected}
        renameReq={renameReq}
        onRenameEnd={() => setRenameReq(null)}
        onSessionRenamed={onSessionRenamed}
        showToast={showToast}
        onRowOpen={rowOpen}
        onRowModifier={rowModifier}
        onRowContextMenu={(e, item) => setContextMenu({ item, x: e.clientX, y: e.clientY })}
        onConvert={onConvert}
        onOpenNote={onOpenNote}
      />

      {/* 批量操作栏（出现后出现；段搜索命中视图隐藏——避免对不可见列表误操作） */}
      {!hits && !ocrHits && selected.size > 0 && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
          {/* 批 4 审查修复（P3-1）：全选框口径 = 当前可见行序 visibleOrder——
              平铺=筛选后序、分组=展开组顺次。原 filtered 口径在折叠组时把
              不可见行也纳入全选（勾选后随即被裁剪 effect 清掉，计数误导且
              折叠内容被误批量操作），与区间/自动裁剪同基准。三态 indeterminate
              用回调 ref 每渲染刷新——部分选中显示横杠 */}
          <input
            type="checkbox"
            data-testid="session-select-all"
            ref={(el) => {
              if (el) el.indeterminate = selected.size > 0 && selected.size < visibleOrder.length;
            }}
            checked={selected.size === visibleOrder.length && visibleOrder.length > 0}
            onChange={toggleAllVisible}
            style={{ cursor: "pointer", flexShrink: 0 }}
            title="全选当前可见的会话（折叠组行不含在内）"
          />
          <span style={{ fontSize: 12, color: "#374151" }}>已选 {selected.size} 个</span>
          <button
            style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", fontWeight: 600, opacity: batchBusy ? 0.55 : 1 }}
            disabled={batchBusy !== null}
            onClick={() => void runBatchConvert()}
            title={batchBusy ? "批量转处理中…" : undefined}
          >
            批量转笔记
          </button>
          <button
            style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #fca5a5", color: "#dc2626", opacity: batchBusy ? 0.55 : 1 }}
            disabled={batchBusy !== null}
            onClick={() => void (async () => {
              // P3-2 pending 防连点（ref 同 tick 拦截——双击不再二次提交）
              if (batchBusyRef.current) return;
              batchBusyRef.current = true;
              setBatchBusy("delete");
              try {
                // 成功后清选集（全删或全不删——后端单事务原子，无半删计数）
                if (await onBatchDelete([...selected])) clearSelection();
              } finally {
                batchBusyRef.current = false;
                setBatchBusy(null);
              }
            })()}
            title={batchBusy ? "批量删除处理中…" : undefined}
          >
            批量删除
          </button>
          <button style={{ ...btn, marginLeft: "auto", fontSize: 11 }} onClick={clearSelection}>
            取消
          </button>
        </div>
      )}

      {/* 行右键菜单（单行语义；危险项红字） */}
      {contextMenu && (
        <SessionRowContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpenDetail={(id) => onOpenDetail(id)}
          onRename={(it) => setRenameReq({ id: it.session.id, nonce: ++renameNonceRef.current })}
          onConvert={(it) => onConvert(it)}
          onDelete={(it) => onDeleteOne(it.session.id)}
          canConvert={isSessionConvertible(contextMenu.item)}
        />
      )}
    </div>
  );
}
