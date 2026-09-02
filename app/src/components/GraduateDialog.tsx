/**
 * GraduateDialog — 毕业仪式（报告预览 → 确认毕业）。
 *
 * @ai-context: 毕业＝用户可见确认仪式（v0.11.3 结算纪律延续）——确认前展示
 *              现算信号预览（里程碑/结算/复习弱项），确认后 goal_settle 生成
 *              完整报告快照（毕业后冻结、目标删除仍可读——REQ-255/256）。
 * @ai-context: 未达标时按钮不可达（GoalDetail 禁用）；本对话框只管确认流。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GraduationReport, GoalDetailView, GoalProgressView } from "../types/goals";

interface Props {
  goalId: number;
  onClose: () => void;
  onGraduated: () => void;
}

export default function GraduateDialog({ goalId, onClose, onGraduated }: Props) {
  const [detail, setDetail] = useState<GoalDetailView | null>(null);
  const [progress, setProgress] = useState<GoalProgressView | null>(null);
  const [report, setReport] = useState<GraduationReport | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await invoke<GoalDetailView>("get_goal_detail", { id: goalId });
      setDetail(d);
      const p = await invoke<GoalProgressView>("get_goal_progress", { id: goalId });
      setProgress(p);
      setErr("");
    } catch (e) {
      setErr(`加载失败: ${e}`);
    }
  }, [goalId]);

  useEffect(() => { void load(); }, [load]);

  const confirm = async () => {
    setSaving(true);
    setErr("");
    try {
      const r = await invoke<GraduationReport>("goal_settle", { id: goalId });
      setReport(r);
      onGraduated();
    } catch (e) {
      setErr(`毕业失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const p = progress?.progress;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div data-testid="graduate-dialog" style={{ width: 520, maxHeight: "86vh", overflow: "auto", background: "#fff", borderRadius: 10, padding: 18, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>🎓 毕业仪式</span>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 14, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
          毕业＝确认这一轮学习目标达成——报告快照永久保留（目标删除后仍可读）。
        </p>

        {report ? (
          <div data-testid="graduate-result">
            <div style={{ fontSize: 14, fontWeight: 700, color: "#047857", marginBottom: 8 }}>🎉 已毕业——「{report.goalName}」</div>
            <ReportBody report={report} />
            <button onClick={onClose} style={primaryBtn}>完成</button>
          </div>
        ) : (
          <>
            {/* 确认前：现算信号预览 */}
            {detail && p && (
              <div style={{ fontSize: 12, color: "#374151", background: "#fafaf9", padding: 10, borderRadius: 6, marginBottom: 8, lineHeight: 2 }}>
                里程碑 {p.milestoneDone}/{p.milestoneTotal} · 组结算 {p.settlementsCount} 次 · 复习活跃 {p.reviewDays90} 天 · 弱项 {p.weakGroups.length} 组
                <div style={{ fontSize: 11, color: "#9ca3af" }}>确认后将生成完整报告：里程碑明细/子组结算/复习统计/成果物清单（组·笔记·闪卡·概念）</div>
              </div>
            )}
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
              {detail?.criteria.map((c, i) => (
                <div key={i} style={{ color: c.met ? "#047857" : "#9ca3af" }}>{c.met ? "✓" : "○"} {c.label}：{c.detail}</div>
              ))}
            </div>
            {err && <p data-testid="graduate-error" style={{ fontSize: 11, color: "#dc2626" }}>{err}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={ghostBtn}>再等等</button>
              <button data-testid="confirm-graduate" onClick={() => void confirm()} disabled={saving} style={primaryBtn}>
                {saving ? "毕业中…" : "🎓 确认毕业"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 报告正文（确认后结果 / 毕业档案共用） */
export function ReportBody({ report }: { report: GraduationReport }) {
  const done = report.milestones.filter((m) => m.status === "done").length;
  const total = report.milestones.filter((m) => m.status !== "skipped").length;
  const sumSettlements = report.groupSettlements.reduce((a, s) => a + s.settlementCount, 0);
  return (
    <div style={{ fontSize: 12, color: "#374151" }}>
      <Section>达成标准</Section>
      <div style={{ marginBottom: 8 }}>{report.criteriaStatement}</div>
      <Section>里程碑</Section>
      <div style={{ marginBottom: 8 }}>
        {report.milestones.map((m, i) => (
          <div key={i}>{m.status === "skipped" ? "○ 跳过" : m.status === "done" ? "✓" : "○"} {m.title}</div>
        ))}
        <div style={{ color: "#9ca3af" }}>{done}/{total} 达成</div>
      </div>
      <Section>组结算</Section>
      <div style={{ marginBottom: 8 }}>
        {report.groupSettlements.map((s, i) => (
          <div key={i}>{s.groupName}：{s.settlementCount} 次（最近 {s.lastSettledAt ? new Date(s.lastSettledAt * 1000).toISOString().slice(0, 10) : "—"}）</div>
        ))}
        <div style={{ color: "#9ca3af" }}>共 {sumSettlements} 次（含归档组历史）</div>
      </div>
      <Section>复习统计</Section>
      <div style={{ marginBottom: 8 }}>
        {report.reviewStats.cardTotal} 卡 · {report.reviewStats.reviewLogsTotal} 次复习 · 近 90 天 {report.reviewStats.reviewDays90} 天 · 低稳定性 {report.reviewStats.weakCards} 卡
      </div>
      <Section>成果物</Section>
      <div>
        {report.artifacts.groups} 组 · {report.artifacts.notes} 笔记 · {report.artifacts.cards} 卡 · {report.artifacts.concepts} 概念
      </div>
    </div>
  );
}

function Section({ children }: { children: string }) {
  return <div style={{ fontWeight: 600, color: "#374151", marginTop: 8 }}>{children}</div>;
}

const primaryBtn: React.CSSProperties = { fontSize: 12, padding: "6px 16px", borderRadius: 6, cursor: "pointer", border: "1px solid #0f766e", background: "#0f766e", color: "#fff" };
const ghostBtn: React.CSSProperties = { fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#4b5563" };
