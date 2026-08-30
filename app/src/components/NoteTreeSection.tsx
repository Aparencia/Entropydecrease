/**
 * NoteTreeSection — 分组树组头（v0.15：笔记组可收起）。
 *
 * @ai-context: 交互契约（v0.12.2 决策 1 保持）——chevrion 独立点击只折叠/展开
 *              （stopPropagation 防冒泡触发过滤）；组名区点击=过滤切换（与
 *              GroupSidebar 组行同语义）。折叠态持久化由父层（NoteListView）
 *              持有；组色条经 accent 传入（未分组=默认灰）。
 */
import type { ReactNode } from "react";

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
  children: ReactNode;
}

export default function NoteTreeSection({
  title, count, accent, active, folded, onToggleFold, onSelectTitle, children,
}: Props) {
  return (
    <div data-testid={`note-tree-${title}`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 10px 6px 6px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: active ? "#0f766e" : "#6b7280",
          background: active ? "#f0fdfa" : "#f9fafb",
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
        <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>{count}</span>
      </div>
      {!folded && <div data-testid={`tree-body-${title}`}>{children}</div>}
    </div>
  );
}
