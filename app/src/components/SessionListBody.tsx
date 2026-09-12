/**
 * SessionListBody — 会话列表区视图（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 列表容器（flex:1 可滚动）+ 全部分支渲染：加载态 / 空态 / 检索命中
 *              （委托 SessionSearchHits）/ 课程分组折叠 / 筛选无结果（含「清除筛选」
 *              入口）/ 平铺行。`renderRow` 行工厂一并下沉——行点击语义由父层的
 *              useSessionSelection 决定（onRowOpen / onRowModifier 原样转发），
 *              行内编辑与多选视觉仍在 SessionListRow。
 * @ai-context 边界（分支顺序=优先级，不得重排）：
 *              ① 加载态与空态是**独立**的 `&&` 块，先于分支链；空态抑制条件含
 *                 `!hits`（检索中不显示"暂无会话"）；
 *              ② 命中视图（hits 或 ocrHits）**接管**整个列表区——分组与平铺都不渲染；
 *              ③ 分组分支要求 `grouped && groupedView` 同时成立（groups=null 时回落平铺）；
 *              ④ 无匹配提示要求 `itemCount > 0 && filtered.length === 0`
 *                 （items 为空时走空态，不显示"无匹配会话"）；
 *              ⑤ canConvert 走 utils/sessionEligibility 纯函数（与批量栏同口径）。
 */
import type { CourseGroup, OcrBlockHit, SegmentHit, SessionListItem } from "../types";
import { isSessionConvertible } from "../utils/sessionEligibility";
import SessionListRow from "./SessionListRow";
import type { SessionRenameRequest } from "./SessionListRow";
import SessionSearchHits from "./SessionSearchHits";
import { Text } from "../ui/primitives";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface Props {
  loading: boolean;
  /** items.length（空态判定——不传整个列表，避免视图层再遍历） */
  itemCount: number;
  hits: SegmentHit[] | null;
  ocrHits: OcrBlockHit[] | null;
  searchKw: string;
  grouped: boolean;
  groupedView: CourseGroup[] | null;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (course: string) => void;
  filtered: SessionListItem[];
  onClearFilters: () => void;
  onOpenDetail: (id: number, targetSegId?: number) => void;
  // ── 行渲染下发项（原面板 renderRow 的入参） ──
  openSessionId: number | null;
  selected: ReadonlySet<number>;
  renameReq: SessionRenameRequest | null;
  onRenameEnd: () => void;
  onSessionRenamed: (id: number) => void;
  showToast: (msg: string, kind: "ok" | "err") => void;
  onRowOpen: (item: SessionListItem) => void;
  onRowModifier: (item: SessionListItem, ctrl: boolean, shift: boolean) => void;
  onRowContextMenu: (e: React.MouseEvent, item: SessionListItem) => void;
  onConvert: (item: SessionListItem) => void;
  onOpenNote: (noteId: number) => void;
}

export default function SessionListBody({
  loading, itemCount, hits, ocrHits, searchKw, grouped, groupedView, collapsed, onToggleCollapse,
  filtered, onClearFilters, onOpenDetail, openSessionId, selected, renameReq, onRenameEnd,
  onSessionRenamed, showToast, onRowOpen, onRowModifier, onRowContextMenu, onConvert, onOpenNote,
}: Props) {
  /** 行渲染（平铺/分组共用）；行内编辑与多选视觉在 SessionListRow */
  const renderRow = (item: SessionListItem) => (
    <SessionListRow
      key={item.session.id}
      item={item}
      isOpen={openSessionId === item.session.id}
      multiSelected={selected.has(item.session.id)}
      canConvert={isSessionConvertible(item)}
      renameRequest={renameReq}
      onRenameEnd={onRenameEnd}
      onRenamed={(id) => onSessionRenamed(id)}
      showToast={showToast}
      onOpen={onRowOpen}
      onModifierClick={onRowModifier}
      onContextMenu={onRowContextMenu}
      onConvert={(it) => onConvert(it)}
      onOpenNote={onOpenNote}
    />
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {loading && itemCount === 0 && (
        <Text as="p" size={5} tone="ink-3" style={{ padding: 16, textAlign: "center" }}>加载中…</Text>
      )}
      {!loading && itemCount === 0 && !hits && (
        <Text as="p" size={5} tone="ink-3" style={{ padding: 16, textAlign: "center" }}>
          暂无会话，去「课堂助手」开始实时捕获
        </Text>
      )}
      {hits || ocrHits ? (
        <SessionSearchHits hits={hits} ocrHits={ocrHits} searchKw={searchKw} onOpenDetail={onOpenDetail} />
      ) : grouped && groupedView ? (
        /* 课程分组（折叠 + 组内筛选排序） */
        groupedView.map((g) => (
          <div key={g.course}>
            <div
              onClick={() => onToggleCollapse(g.course)}
              style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#0f766e", cursor: "pointer", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}
            >
              {collapsed[g.course] ? "▸" : "▾"} {g.course}（{g.sessions.length}）
            </div>
            {!collapsed[g.course] && g.sessions.map(renderRow)}
          </div>
        ))
      ) : itemCount > 0 && filtered.length === 0 ? (
        /* 筛选无结果：给出清除入口 */
        <Text as="p" size={5} tone="ink-3" style={{ padding: 16, textAlign: "center" }}>
          无匹配会话{" "}
          <button style={{ ...btn, fontSize: 11 }} onClick={onClearFilters}>
            清除筛选
          </button>
        </Text>
      ) : (
        filtered.map(renderRow)
      )}
    </div>
  );
}
