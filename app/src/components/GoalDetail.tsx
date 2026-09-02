/**
 * GoalDetail — 目标详情（里程碑清单/关联组/判据明细/弱项块/动作区）。
 *
 * @ai-context: 一致性契约——进度信号每次现算（get_goal_progress），动作后
 *              局部刷新；毕业仪式/回顾流属 M2（按钮留壳禁用不误导）。
 * @ai-context: 弱项块（M1）= FSRS 低稳定性卡占比 Top 组（json_extract 现算）；
 *              里程碑勾选 done 记 goal_milestone_done 埋点（后端幂等）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConceptWeaknessView, GoalDetailView, GoalPlanView, GoalProgressView, GroupWeakness } from "../types/goals";
import { GOAL_STATUS_LABELS } from "../types/goals";
import InterviewDialog from "./InterviewDialog";
import GraduateDialog from "./GraduateDialog";
import RetroTimeline from "./RetroTimeline";
import GoalPlanApprovalDialog from "./GoalPlanApprovalDialog";

interface Props {
  goalId: number;
  onChanged: () => void;
  onDeleted: () => void;
}

export default function GoalDetail({ goalId, onChanged, onDeleted }: Props) {
  const [detail, setDetail] = useState<GoalDetailView | null>(null);
  const [progress, setProgress] = useState<GoalProgressView | null>(null);
  const [err, setErr] = useState("");
  const [newMile, setNewMile] = useState("");
  const [bindGroupId, setBindGroupId] = useState(0);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  // 改名（update_goal 接线）与里程碑标题行内编辑（update_goal_milestone 接线）
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [editingMileId, setEditingMileId] = useState<number | null>(null);
  const [editingMileValue, setEditingMileValue] = useState("");
  // v0.18.1：毕业仪式对话框 / 放弃原因内联确认
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [abandonMode, setAbandonMode] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  // v0.18.2：AI 规划（详情页重规划——增量追加）/ 最弱概念（M3 真实化规则信号）
  const [aiPlan, setAiPlan] = useState<GoalPlanView | null>(null);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [weakConcepts, setWeakConcepts] = useState<ConceptWeaknessView[]>([]);

  const refresh = useCallback(async () => {
    try {
      const d = await invoke<GoalDetailView>("get_goal_detail", { id: goalId });
      setDetail(d);
      const p = await invoke<GoalProgressView>("get_goal_progress", { id: goalId });
      setProgress(p);
      setErr("");
    } catch (e) {
      setErr(`详情加载失败: ${e}`);
    }
  }, [goalId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    invoke<{ id: number; name: string }[]>("list_note_groups", { terrain: "container" })
      .then((gs) => setGroups(gs))
      .catch((e) => setErr(`组列表加载失败: ${e}`));
    // v0.18.2：最弱概念（规则信号现算——M3 真实化）
    invoke<ConceptWeaknessView[]>("goal_concept_weakness", { goalId })
      .then((cs) => setWeakConcepts(cs.filter((c) => c.weak).slice(0, 5)))
      .catch(() => { /* 无体系/概念时为空——次要块降级 */ });
  }, [goalId]);

  const runAiPlan = async () => {
    setAiPlanning(true);
    setErr("");
    try {
      const view = await invoke<GoalPlanView>("ai_goal_plan", { goalId, tier: null, authorized: true });
      setAiPlan(view);
    } catch (e) {
      setErr(`AI 规划失败: ${e}`);
    } finally {
      setAiPlanning(false);
    }
  };

  if (err && !detail) return <div style={{ padding: 24, fontSize: 13, color: "#dc2626" }}>{err}</div>;
  if (!detail) return <div style={{ padding: 24, fontSize: 13, color: "#9ca3af" }}>加载中…</div>;

  const { goal, milestones, criteria } = detail;
  const p = progress?.progress;
  const ready = progress?.ready ?? false;

  const toggleMilestone = async (m: { id: number; status: string }) => {
    await invoke("set_goal_milestone_status", { id: m.id, status: m.status === "done" ? "pending" : "done" });
    onChanged(); void refresh();
  };
  const saveRename = async () => {
    if (!renameValue.trim()) { setRenameMode(false); return; }
    // horizon 不传 → 后端保持原锚点（update_goal_inner None=不变语义）
    await invoke("update_goal", { id: goalId, name: renameValue.trim(), domainTag: detail!.goal.domainTag, horizon: null });
    setRenameMode(false);
    onChanged(); await refresh();
  };
  const saveMileTitle = async (id: number) => {
    const title = editingMileValue.trim();
    if (!title) { setEditingMileId(null); return; }
    await invoke("update_goal_milestone", { id, title, dueAt: null });
    setEditingMileId(null);
    onChanged(); await refresh();
  };
  const addMilestone = async () => {
    if (!newMile.trim()) return;
    await invoke("add_goal_milestone", { goalId, title: newMile.trim(), dueAt: null, criteriaType: null, refGroupId: null });
    setNewMile("");
    onChanged(); await refresh();
  };
  const removeMilestone = async (id: number) => { await invoke("delete_goal_milestone", { id }); onChanged(); await refresh(); };
  const changeStatus = async (status: string) => { await invoke("update_goal_status", { id: goalId, status }); onChanged(); await refresh(); };
  const removeGroup = async (gid: number) => { await invoke("unbind_goal_group", { goalId, groupId: gid }); onChanged(); await refresh(); };
  const bindGroup = async () => {
    if (!bindGroupId) return;
    await invoke("bind_goal_group", { goalId, groupId: bindGroupId });
    setBindGroupId(0); onChanged(); await refresh();
  };
  const removeGoal = async () => {
    if (goal.status === "graduated") {
      // 已毕业：删除仅影响目标本体——毕业报告快照永久保留（档案区可读）
      if (!window.confirm(`确定删除已毕业目标「${goal.name}」？毕业报告快照仍会在「毕业档案」保留。`)) return;
    } else if (!window.confirm(`确定删除目标「${goal.name}」？里程碑与绑定将一并移除（组本身不受影响）。`)) {
      return;
    }
    await invoke("delete_goal", { id: goalId });
    onDeleted();
  };
  const abandon = async () => {
    await invoke("goal_abandon", { id: goalId, reason: abandonReason.trim() || null });
    setAbandonMode(false);
    setAbandonReason("");
    onChanged(); await refresh();
  };
  const boundIds = detail.groups.map((g) => g.id);
  const bindable = groups.filter((g) => !boundIds.includes(g.id));
  // v0.18.1：组删除降级提示（group_settled 型里程碑的绑定组被删 → ref SET NULL）
  const degradedMilestones = milestones.filter((m) => m.criteriaType === "group_settled" && m.refGroupId == null);
  const canGraduate = ready && goal.status === "active";

  return (
    <div data-testid="goal-detail" style={{ padding: 16, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {renameMode ? (
          <input
            data-testid="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: "3px 8px", border: "1px solid #0f766e", borderRadius: 6, flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); }}
          />
        ) : (
          <span style={{ fontWeight: 700, fontSize: 15 }}>🎯 {goal.name}</span>
        )}
        <span style={{ fontSize: 11, color: "#6b7280" }}>{GOAL_STATUS_LABELS[goal.status]}</span>
        {ready && <span style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", borderRadius: 8, padding: "1px 8px" }}>🎓 可毕业（毕业仪式 M2）</span>}
        {renameMode ? (
          <>
            <button data-testid="rename-save" onClick={() => void saveRename()} style={miniPrimary}>✓</button>
            <button onClick={() => setRenameMode(false)} style={miniDanger}>取消</button>
          </>
        ) : (
          <button
            data-testid="rename-start"
            onClick={() => { setRenameValue(goal.name); setRenameMode(true); }}
            style={{ marginLeft: "auto", ...miniPrimary }}
            title="改名（不改判据/绑组）"
          >
            ✎ 改名
          </button>
        )}
        <span style={{ fontSize: 11, color: "#9ca3af" }}>始于 {new Date(goal.createdAt * 1000).toISOString().slice(0, 10)}</span>
      </div>
      <p style={{ fontSize: 12, color: "#4b5563", background: "#fafaf9", padding: 8, borderRadius: 6, margin: "10px 0" }}>{detail.declaration}</p>

      {/* 判据与进度 */}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
        {progress?.statement ?? ""} · 结算 {p?.settlementsCount ?? 0} 次 · 周契约 {p?.contractDone ?? 0}/{p?.contractTotal ?? 0} · 复习活跃 {p?.reviewDays90 ?? 0} 天 · 应用 {p?.applicationsCount ?? 0} 条
      </div>
      <div style={{ background: "#f3f4f6", borderRadius: 3, marginBottom: 10 }}>
        <div style={{ width: `${Math.min(100, Math.round(progress?.progress.percent ?? 0))}%`, height: 6, background: "#0f766e", borderRadius: 3 }} />
      </div>
      {criteria.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {criteria.map((c, i) => (
            <div key={i} style={{ fontSize: 11, color: c.met ? "#047857" : "#9ca3af" }}>
              {c.met ? "✓" : "○"} {c.label}：{c.detail}
            </div>
          ))}
        </div>
      )}

      {/* 组删除降级提示（REQ-257）：绑定组已删——判据信号丢失，按手动确认 */}
      {degradedMilestones.length > 0 && (
        <div data-testid="degraded-milestone-note" style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", borderRadius: 6, padding: "6px 10px", margin: "8px 0" }}>
          ⚠️ 绑定组已删除（{degradedMilestones.length} 条「随组结算」里程碑失去自动通过信号——现按手动确认）
        </div>
      )}

      {/* 里程碑 */}
      <SectionTitle>里程碑（结算型随组结算自动通过）</SectionTitle>
      {milestones.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
          <input type="checkbox" checked={m.status === "done"} onChange={() => void toggleMilestone(m)} />
          {editingMileId === m.id ? (
            <>
              <input
                data-testid="mile-title-input"
                value={editingMileValue}
                onChange={(e) => setEditingMileValue(e.target.value)}
                autoFocus
                style={{ flex: 1, fontSize: 12, padding: "2px 6px", border: "1px solid #0f766e", borderRadius: 4 }}
                onKeyDown={(e) => { if (e.key === "Enter") void saveMileTitle(m.id); }}
              />
              <button onClick={() => void saveMileTitle(m.id)} style={miniPrimary}>✓</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: m.status === "done" ? "#9ca3af" : "#1f2937", textDecoration: m.status === "done" ? "line-through" : "none" }}>{m.title}</span>
              {m.criteriaType === "group_settled" && <span style={{ fontSize: 10, color: "#0f766e", background: "#f0fdfa", borderRadius: 8, padding: "0 6px" }}>随组结算</span>}
              {m.status === "skipped" && <span style={{ fontSize: 10, color: "#9ca3af" }}>已跳过</span>}
              <button onClick={() => { setEditingMileId(m.id); setEditingMileValue(m.title); }} style={smallGhost}>改</button>
            </>
          )}
          <button onClick={() => void removeMilestone(m.id)} style={smallDanger}>删</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, margin: "6px 0 14px" }}>
        <input value={newMile} onChange={(e) => setNewMile(e.target.value)} placeholder="新里程碑（例如：第 8 周 刷题）" style={miniInput} />
        <button onClick={() => void addMilestone()} style={miniPrimary}>＋</button>
      </div>

      {/* 关联组 */}
      <SectionTitle>关联组（一组可服务多目标）</SectionTitle>
      <div style={{ marginBottom: 8 }}>
        {detail.groups.map((g) => (
          <span key={g.id} style={{ fontSize: 11, background: "#f3f4f6", borderRadius: 10, padding: "2px 8px", marginRight: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
            {g.name}
            <button onClick={() => void removeGroup(g.id)} style={smallDanger}>×</button>
          </span>
        ))}
        {detail.groups.length === 0 && <span style={{ fontSize: 11, color: "#9ca3af" }}>暂无绑定——绑定后结算/复习/弱项才计入进度</span>}
      </div>
      {bindable.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <select value={bindGroupId} onChange={(e) => setBindGroupId(Number(e.target.value))} style={miniInput}>
            <option value={0}>选择组…</option>
            {bindable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => void bindGroup()} style={miniPrimary}>＋ 绑定</button>
        </div>
      )}

      {/* 弱项块（M1：FSRS 低稳定性卡占比 Top 组） */}
      <SectionTitle>最弱一块（FSRS 低稳定性卡占比）</SectionTitle>      {p && p.weakGroups.length > 0 ? (
        p.weakGroups.map((w: GroupWeakness) => (
          <div key={w.groupId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.groupName}</span>
            <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 3 }}>
              <div style={{ width: `${Math.round(w.weakRatio * 100)}%`, height: 6, background: w.weakRatio >= 0.6 ? "#dc2626" : "#f59e0b", borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, color: "#6b7280" }}>{w.weakCards}/{w.cardTotal} 卡</span>
          </div>
        ))
      ) : (
        <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 10px" }}>暂无弱项信号（绑定组无卡）</p>
      )}

      {/* v0.18.2：最弱概念（90 天无引用/未应用——规则信号，M3 真实化） */}
      {weakConcepts.length > 0 && (
        <>
          <SectionTitle>最弱概念（90 天未动）</SectionTitle>
          {weakConcepts.map((c) => (
            <div key={c.conceptId} style={{ fontSize: 11, color: "#b45309", padding: "2px 0" }}>
              ○ {c.name}——{c.reason}
            </div>
          ))}
        </>
      )}

      {/* 动作区 */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => void changeStatus(goal.status === "paused" ? "active" : "paused")} style={miniPrimary}>
          {goal.status === "paused" ? "▶ 恢复" : "⏸ 暂停"}
        </button>
        <button onClick={() => setEditing(true)} style={miniPrimary}>✎ 重新访谈</button>
        <button
          data-testid="ai-plan-detail"
          onClick={() => void runAiPlan()}
          disabled={aiPlanning}
          style={{ ...miniPrimary, border: "1px solid #7c3aed", color: "#7c3aed" }}
          title="AI 规划建议（默认关；失败/超限不影响规则能力）"
        >
          {aiPlanning ? "✨ 规划中…" : "💡 AI 规划"}
        </button>
        {goal.status === "active" || goal.status === "paused" ? (
          <>
            <button
              data-testid="graduate-open"
              onClick={() => setGraduateOpen(true)}
              disabled={!canGraduate}
              style={{ ...miniPrimary, opacity: canGraduate ? 1 : 0.5 }}
              title={canGraduate ? "毕业仪式——确认后生成报告快照" : "毕业判据未全部满足（见上方明细）"}
            >
              🎓 毕业仪式
            </button>
            {abandonMode ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  data-testid="abandon-reason"
                  value={abandonReason}
                  onChange={(e) => setAbandonReason(e.target.value)}
                  placeholder="放弃原因（可选）"
                  style={{ fontSize: 11, padding: "3px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: 140 }}
                />
                <button data-testid="abandon-confirm" onClick={() => void abandon()} style={miniDanger}>确认放弃</button>
                <button onClick={() => { setAbandonMode(false); setAbandonReason(""); }} style={miniPrimary}>取消</button>
              </div>
            ) : (
              <button data-testid="abandon-open" onClick={() => setAbandonMode(true)} style={miniDanger}>🗑 放弃</button>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{goal.status === "graduated" ? "已毕业——回顾流与报告见下方" : "已放弃——无惩罚，随时可再立新目标"}</span>
        )}
        <button onClick={() => void removeGoal()} style={miniDanger} title="删除目标（里程碑/绑定一并移除；毕业报告快照保留）">🗑 删除目标</button>
      </div>

      {/* v0.18.1：回顾流 + 毕业报告（快照永久保留） */}
      <SectionTitle>回顾流（创建 → 里程碑 → 结算 → 毕业）</SectionTitle>
      <RetroTimeline goalId={goalId} />

      {err && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 8 }}>{err}</p>}
      {editing && (
        <InterviewDialog
          mode="interview"
          goalId={goalId}
          groups={groups}
          onClose={() => setEditing(false)}
          onCreated={() => { setEditing(false); onChanged(); void refresh(); }}
        />
      )}
      {graduateOpen && (
        <GraduateDialog
          goalId={goalId}
          onClose={() => setGraduateOpen(false)}
          onGraduated={() => { setGraduateOpen(false); onChanged(); void refresh(); }}
        />
      )}
      {aiPlan && (
        <GoalPlanApprovalDialog
          view={aiPlan}
          onClose={() => setAiPlan(null)}
          onUseRules={() => { setAiPlan(null); setErr("已改用规则草案——AI 建议未采纳"); }}
          onConfirm={async (req) => {
            await invoke("goal_apply_plan", {
              goalId,
              request: { ...req, replaceMilestones: false },
            });
            onChanged(); await refresh();
          }}
        />
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div style={{ fontWeight: 600, fontSize: 12, color: "#374151", margin: "8px 0 6px" }}>{children}</div>;
}

const miniInput: React.CSSProperties = { fontSize: 11, padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, flex: 1, minWidth: 0 };
const miniPrimary: React.CSSProperties = { fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", cursor: "pointer" };
const miniDanger: React.CSSProperties = { fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", cursor: "pointer" };
const smallDanger: React.CSSProperties = { fontSize: 10, padding: "1px 6px", border: "none", background: "none", color: "#b91c1c", cursor: "pointer" };
const smallGhost: React.CSSProperties = { fontSize: 10, padding: "1px 6px", border: "none", background: "none", color: "#6b7280", cursor: "pointer" };
