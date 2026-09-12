/**
 * GraduateDialog — 毕业仪式（报告预览 → 确认毕业）。
 *
 * @ai-context: 毕业＝用户可见确认仪式（v0.11.3 结算纪律延续）——确认前展示
 *              现算信号预览（里程碑/结算/复习弱项），确认后 goal_settle 生成
 *              完整报告快照（毕业后冻结、目标删除仍可读——REQ-255/256）。
 * @ai-context: 未达标时按钮不可达（GoalDetail 禁用）；本对话框只管确认流。
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Modal, StatusLine } from "../ui/primitives";
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
    /* 批 4 T5：自建遮罩 + 面板几何 + 手写标题/关闭（原 `:57-62`）交给 `Modal`。
       档位 `m`(520) 与原面板逐字同宽；`size`/`testId` 值都不变（唯一改名的是关闭钮：
       原 `:61` 无名 ⇒ 现为 `graduate-dialog-close`，无测试引用）。原实现无 ESC 路径，迁移后新增。 */
    <Modal
      open
      onClose={onClose}
      title="毕业仪式"
      size="m"
      testId="graduate-dialog"
      footer={
        report ? (
          <Button variant="primary" size="md" onClick={onClose}>完成</Button>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={onClose}>再等等</Button>
            <Button variant="primary" size="md" testId="confirm-graduate" busy={saving} onClick={() => void confirm()}>
              {saving ? "毕业中…" : "🎓 确认毕业"}
            </Button>
          </>
        )
      }
    >
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
        毕业＝确认这一轮学习目标达成——报告快照永久保留（目标删除后仍可读）。
      </p>

      {report ? (
        <div data-testid="graduate-result">
          <div style={{ fontSize: 14, fontWeight: 700, color: "#047857", marginBottom: 8 }}>🎉 已毕业——「{report.goalName}」</div>
          <ReportBody report={report} />
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
          {err && <StatusLine kind="error" testId="graduate-error">{err}</StatusLine>}
        </>
      )}
    </Modal>
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
