/**
 * NoteTreeSection — 分组树组头（v0.15；REQ-287 v0.19.7 扩展）。
 *
 * @ai-context: 交互契约——chevrion 点击只折叠/展开（stopPropagation）；组名区
 *              点击=过滤切换。REQ-287 增补：① 组头=跨组 drop target（移入该
 *              组；读 text/note-ids 多选载荷或单 id 兜底）；② 手动排序徽标
 *              （手排组显示「手排 ↺」可一键回自动）；③ 组头空白区=划选锚点
 *              （pointerdown 起点上抛 parent——行间/空列表同用空白锚点语义）。
 */
import { useState, type ReactNode } from "react";

interface Props {
  /** 组名（未分组区显示「未分组」） */
  title: string;
  count: number;
  /** 组头色条（paletteHex 结果） */
  accent: string;
  active: boolean;
  folded: boolean;
  onToggleFold: () => void;
  /** 组名点击 → 过滤切换（父层上抛） */
  onSelectTitle: () => void;
  /** REQ-287：手动排序（显示「手排」徽标） */
  manual?: boolean;
  /** REQ-287：一键恢复自动排序（清 note_orders scope） */
  onResetManual?: () => void;
  /** REQ-287：拖入组头 → 归组（父层按组绑定目标 groupId） */
  onDropNotes?: (ids: number[]) => void;
  /** REQ-287：组头空白按下（划选起点；父层按组绑定范围） */
  onMarqueeStart?: () => void;
  children: ReactNode;
}

export default function NoteTreeSection({
  title, count, accent, active, folded, onToggleFold, onSelectTitle,
  manual = false, onResetManual, onDropNotes, onMarqueeStart, children,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div data-testid={`note-tree-${title}`}>
      <div
        data-testid={`tree-header-${title}`}
        onPointerDown={(e) => {
          // REQ-287 划选锚点：按下落在组头空白区（非按钮/文本子元素）
          if (e.target === e.currentTarget) {
            e.preventDefault();
            onMarqueeStart?.();
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/note-ids") || e.dataTransfer.types.includes("text/note-id")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!onDropNotes) return;
          e.preventDefault();
          setDragOver(false);
          const ids = crateDndReadIds(e.dataTransfer);
          if (ids.length > 0) onDropNotes(ids);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 10px 6px 6px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: active ? "#0f766e" : "#6b7280",
          background: dragOver ? "#fefce8" : active ? "#f0fdfa" : "#f9fafb",
          outline: dragOver ? "1px dashed #0d9488" : "none",
          borderBottom: "1px solid #f3f4f6",
          borderLeft: `4px solid ${accent}`,
          userSelect: "none",
        }}
      >
        <button
          data-testid={`tree-chevron-${title}`}
          onClick={(e) => { e.stopPropagation(); onToggleFold(); }}
          title={folded ? "展开" : "收起"}
          style={{ fontSize: 10, border: "none", background: "none", cursor: "pointer", padding: "2px 4px", color: "#9ca3af", lineHeight: 1 }}
        >
          {folded ? "▸" : "▾"}
        </button>
        <span
          data-testid={`tree-title-${title}`}
          onClick={(e) => { e.stopPropagation(); onSelectTitle(); }}
          style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          title={active ? "点击取消过滤" : `点击过滤：${title}`}
        >
          {title}
        </span>
        {manual && (
          <button
            data-testid={`tree-manual-${title}`}
            onClick={(e) => { e.stopPropagation(); onResetManual?.(); }}
            title="手动排序中——点击恢复自动排序"
            style={{ fontSize: 9, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#047857", borderRadius: 8, padding: "0 5px", cursor: "pointer", lineHeight: "14px" }}
          >
            手排 ↺
          </button>
        )}
        <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>{count}</span>
      </div>
      {!folded && <div data-testid={`tree-body-${title}`}>{children}</div>}
    </div>
  );
}

/** 读取拖拽载荷（多选 text/note-ids JSON 优先，单 id text/note-id 兜底） */
export function crateDndReadIds(dt: DataTransfer): number[] {
  const multi = dt.getData("text/note-ids");
  if (multi) {
    try {
      const arr: unknown = JSON.parse(multi);
      if (Array.isArray(arr)) {
        const ids = arr.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0);
        if (ids.length > 0) return ids;
      }
    } catch {
      /* 损坏载荷 → 单 id 兜底 */
    }
  }
  const single = dt.getData("text/note-id");
  return single ? [Number(single)].filter((n) => Number.isInteger(n) && n > 0) : [];
}

/** 写入拖拽载荷：多选 JSON + 单 id 兜底（左侧组行既有单 id 消费者兼容） */
export function crateDndWriteIds(dt: DataTransfer, ids: number[]): void {
  if (ids.length === 0) return;
  dt.setData("text/note-ids", JSON.stringify(ids));
  if (ids.length === 1) dt.setData("text/note-id", String(ids[0]));
  dt.effectAllowed = "move";
}
