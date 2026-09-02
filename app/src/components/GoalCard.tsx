/**
 * GoalCard — 目标卡（单行折叠；优化评审 #5：列表是导航不是仪表盘）。
 *
 * @ai-context: 单行只呈现名称 + 状态徽标 + 一句话进度；周契约/组徽标/回顾流/
 *              操作全部收进目标详情。🎓 可毕业 = 判据配方全达标（后端现算）。
 * @ai-context: 零叙事元素——无活跃天数/排名/激励文案（规格 §十红线）。
 */
import type { GoalCardView } from "../types/goals";
import { GOAL_STATUS_LABELS } from "../types/goals";

interface Props {
  card: GoalCardView;
  onClick: () => void;
}

/** 状态徽标色（B 视觉系统四级颜色的最小子集） */
function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case "active": return { bg: "#f0fdfa", fg: "#0f766e" };
    case "paused": return { bg: "#fffbeb", fg: "#b45309" };
    case "graduated": return { bg: "#ecfdf5", fg: "#047857" };
    default: return { bg: "#f3f4f6", fg: "#6b7280" };
  }
}

export default function GoalCard({ card, onClick }: Props) {
  const badge = statusColor(card.goal.status);
  return (
    <div
      data-testid="goal-card"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
        cursor: "pointer", marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 15 }}>🎯</span>
      <span style={{ fontWeight: 600, fontSize: 13, color: "#1f2937" }}>{card.goal.name}</span>
      <span
        data-testid="goal-status-badge"
        style={{ fontSize: 10, color: badge.fg, background: badge.bg, borderRadius: 8, padding: "1px 7px", border: `1px solid ${badge.fg}33` }}
      >
        {GOAL_STATUS_LABELS[card.goal.status] ?? card.goal.status}
      </span>
      {card.goal.status === "graduated" && card.goal.completedAt != null && (
        <span style={{ fontSize: 10, color: "#9ca3af" }}>
          {new Date(card.goal.completedAt * 1000).toISOString().slice(0, 10)}
        </span>
      )}
      {card.ready && card.goal.status === "active" && (
        <span data-testid="goal-ready-badge" style={{ fontSize: 10, color: "#b45309", background: "#fffbeb", borderRadius: 8, padding: "1px 7px" }}>
          🎓 可毕业
        </span>
      )}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>{card.statement}</span>
    </div>
  );
}
