/**
 * RetroTimeline — 回顾流时间线（创建→里程碑→组结算→毕业；全现算零双写）。
 *
 * @ai-context: REQ-256——时间线数据从 goal_retro 现算（goals.created_at/
 *              milestones/settlements/graduation 四源），毕业报告快照永久
 *              保留（目标删除后由「毕业档案」区读取本组件同款渲染）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GoalRetroView } from "../types/goals";
import { ReportBody } from "./GraduateDialog";

interface Props {
  goalId: number;
}

const KIND_DOT: Record<string, string> = {
  created: "#0f766e",
  milestone: "#0d9488",
  settlement: "#f59e0b",
  graduated: "#047857",
};

export default function RetroTimeline({ goalId }: Props) {
  const [view, setView] = useState<GoalRetroView | null>(null);
  const [err, setErr] = useState("");
  const [showReport, setShowReport] = useState(true);

  useEffect(() => {
    invoke<GoalRetroView>("goal_retro", { id: goalId })
      .then(setView)
      .catch((e) => setErr(`回顾流加载失败: ${e}`));
  }, [goalId]);

  if (err) return <p style={{ fontSize: 11, color: "#dc2626" }}>{err}</p>;
  if (!view) return <p style={{ fontSize: 11, color: "#9ca3af" }}>回顾流加载中…</p>;

  return (
    <div data-testid="retro-timeline">
      {view.entries.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "3px 0" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: KIND_DOT[e.kind] ?? "#9ca3af", marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, color: "#1f2937" }}>{e.title}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              {e.occurredAt > 0 ? new Date(e.occurredAt * 1000).toISOString().slice(0, 10) + " · " : ""}{e.detail}
            </div>
          </div>
        </div>
      ))}
      {view.graduation && (
        <div style={{ marginTop: 10, border: "1px solid #a7f3d0", borderRadius: 8, padding: 10, background: "#ecfdf5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#047857" }}>🎓 毕业报告（快照永久保留）</span>
            <button
              onClick={() => setShowReport((s) => !s)}
              style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", border: "1px solid #a7f3d0", borderRadius: 4, background: "#fff", color: "#047857", cursor: "pointer" }}
            >
              {showReport ? "收起" : "展开"}
            </button>
          </div>
          {showReport && <ReportBody report={view.graduation} />}
        </div>
      )}
    </div>
  );
}
