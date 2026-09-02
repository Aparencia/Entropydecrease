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
import type { GoalDetailView, GoalProgressView, GroupWeakness } from "../types/goals";
import { GOAL_STATUS_LABELS } from "../types/goals";
import InterviewDialog from "./InterviewDialog";

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
  }, []);

  if (err && !detail) return <div style={{ padding: 24, fontSize: 13, color: "#dc2626" }}>{err}</div>;
  if (!detail) return <div style={{ padding: 24, fontSize: 13, color: "#9ca3af" }}>加载中…</div>;

  const { goal, milestones, criteria } = detail;
  const p = progress?.progress;
  const ready = progress?.ready ?? false;

  const toggleMilestone = async (m: { id: number; status: string }) => {
    await invoke("set_goal_milestone_status", { id: m.id, status: m.status === "done" ? "pending" : "done" });
    onChanged(); void refresh();
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
    if (!window.confirm(`确定删除目标「${goal.name}」？里程碑与绑定将一并移除（组本身不受影响）。`)) return;
    await invoke("delete_goal", { id: goalId });
    onDeleted();
  };
  const boundIds = detail.groups.map((g) => g.id);
  const bindable = groups.filter((g) => !boundIds.includes(g.id));

  return (
    <div data-testid="goal-detail" style={{ padding: 16, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>🎯 {goal.name}</span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>{GOAL_STATUS_LABELS[goal.status]}</span>
        {ready && <span style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", borderRadius: 8, padding: "1px 8px" }}>🎓 可毕业（毕业仪式 M2）</span>}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>始于 {new Date(goal.createdAt * 1000).toISOString().slice(0, 10)}</span>
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

      {/* 里程碑 */}
      <SectionTitle>里程碑（结算型随组结算自动通过）</SectionTitle>
      {milestones.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
          <input type="checkbox" checked={m.status === "done"} onChange={() => void toggleMilestone(m)} />
          <span style={{ fontSize: 12, color: m.status === "done" ? "#9ca3af" : "#1f2937", textDecoration: m.status === "done" ? "line-through" : "none" }}>{m.title}</span>
          {m.criteriaType === "group_settled" && <span style={{ fontSize: 10, color: "#0f766e", background: "#f0fdfa", borderRadius: 8, padding: "0 6px" }}>随组结算</span>}
          {m.status === "skipped" && <span style={{ fontSize: 10, color: "#9ca3af" }}>已跳过</span>}
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
      <SectionTitle>最弱一块（FSRS 低稳定性卡占比）</SectionTitle>
      {p && p.weakGroups.length > 0 ? (
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

      {/* 动作区 */}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => void changeStatus(goal.status === "paused" ? "active" : "paused")} style={miniPrimary}>
          {goal.status === "paused" ? "▶ 恢复" : "⏸ 暂停"}
        </button>
        <button onClick={() => setEditing(true)} style={miniPrimary}>✎ 重新访谈</button>
        <button disabled style={{ ...miniDanger, opacity: 0.5 }} title="毕业仪式与回顾流随 v0.18.1（M2）交付">🎓 毕业仪式 · M2</button>
        <button onClick={() => void removeGoal()} style={miniDanger} title="删除目标（里程碑/绑定一并移除）">🗑 删除目标</button>
      </div>
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
