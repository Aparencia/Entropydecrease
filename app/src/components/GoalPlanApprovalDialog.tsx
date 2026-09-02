/**
 * GoalPlanApprovalDialog — 规划草案确认流（双入口共用；建议制核心 UI）。
 *
 * @ai-context: ADR-028 §2——AI 产出全是草案：里程碑（勾选/删改）/组绑定/
 *              体系（create vs link 单选）/周契约（可改）/摘要展示；确认后
 *              goal_apply_plan 逐项落库（systems 独立事务——部分失败不污染）。
 * @ai-context: 「改用规则草案」一键回退 M1 suggest_milestones（降级基线）；
 *              清理登记（丢弃项）诚实展示，绝不静默。
 */
import { useMemo, useState } from "react";
import type { GoalPlanView } from "../types/goals";

interface Props {
  view: GoalPlanView;
  /** 确认回调（携带用户勾选/编辑后的请求——由调用方决定落库方式） */
  onConfirm: (req: GoalApplyReq) => Promise<void>;
  onClose: () => void;
  /** 切换规则草案（AI 建议不采纳——回到 M1 规则基线） */
  onUseRules: () => void;
}

/** 确认流请求（前端逐项勾选/编辑后的确定版本——Rust GoalApplyRequest 契约）。 */
export interface GoalApplyReq {
  milestones: { title: string; dueWeeks: number; criteriaType: string; refGroupId: number | null; note: string }[];
  groupIds: number[];
  weeklyContract: { targetDays: number; targetCards: number } | null;
  systems: { action: string; systemId: number | null; name: string | null; coreQuestion: string | null; domainEntries: string[]; concepts: { name: string; essence: string; boundary: string; relation: string }[]; reason: string }[];
}

export default function GoalPlanApprovalDialog({ view, onConfirm, onClose, onUseRules }: Props) {
  const [selectedMilestones, setSelectedMilestones] = useState<number[]>(
    view.proposal.milestones.map((_, i) => i),
  );
  const [selectedGroups, setSelectedGroups] = useState<number[]>(
    view.proposal.groups.map((_, i) => i),
  );
  const [selectedSystems, setSelectedSystems] = useState<number[]>(
    view.proposal.systems.map((_, i) => i),
  );
  const [days, setDays] = useState(view.proposal.weeklyContract?.targetDays ?? 3);
  const [cards, setCards] = useState(view.proposal.weeklyContract?.targetCards ?? 20);
  const [editingTitles, setEditingTitles] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 里程碑标题：编辑覆盖优先（原实现 ...editingTitles, ...m 后展开 m 覆盖编辑——输入被拉回原文）
  const milestoneTitles = useMemo(() => {
    const m: Record<number, string> = {};
    view.proposal.milestones.forEach((ms, i) => { m[i] = ms.title; });
    return { ...m, ...editingTitles };
  }, [view, editingTitles]);

  const confirm = async () => {
    setSaving(true);
    setErr("");
    try {
      await onConfirm({
        milestones: selectedMilestones.map((i) => ({
          title: milestoneTitles[i] ?? view.proposal.milestones[i].title,
          dueWeeks: view.proposal.milestones[i].dueWeeks,
          criteriaType: view.proposal.milestones[i].criteriaType,
          refGroupId: view.proposal.milestones[i].refGroupId,
          note: view.proposal.milestones[i].note,
        })),
        groupIds: selectedGroups.map((i) => view.proposal.groups[i].groupId),
        weeklyContract: view.proposal.weeklyContract ? { targetDays: days, targetCards: cards } : null,
        systems: selectedSystems.map((i) => view.proposal.systems[i]),
      });
      onClose();
    } catch (e) {
      setErr(`落库失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div data-testid="plan-approval" style={{ width: 560, maxHeight: "86vh", overflow: "auto", background: "#fff", borderRadius: 10, padding: 18, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>✨ AI 规划建议（草案——确认后落库）</span>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 14, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>
        {view.proposal.summary && (
          <p style={{ fontSize: 12, color: "#374151", background: "#fafaf9", padding: 8, borderRadius: 6, margin: "0 0 8px" }}>{view.proposal.summary}</p>
        )}
        {view.dropped.droppedMilestones.length + view.dropped.droppedGroups.length + view.dropped.droppedSystems.length > 0 && (
          <p style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", padding: "6px 8px", borderRadius: 6, margin: "0 0 8px" }}>
            已剔除不合法建议 {view.dropped.droppedMilestones.length + view.dropped.droppedGroups.length + view.dropped.droppedSystems.length} 条（详见详情页记载）
          </p>
        )}
        {view.honestNote && <p style={{ fontSize: 11, color: "#b45309", margin: "0 0 8px" }}>{view.honestNote}</p>}

        <SubTitle>里程碑（{selectedMilestones.length} 条已选）</SubTitle>
        {view.proposal.milestones.length === 0 && <Empty>无里程碑建议——可改用规则草案或稍后在详情页添加</Empty>}
        {view.proposal.milestones.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 0" }}>
            <input
              type="checkbox"
              checked={selectedMilestones.includes(i)}
              onChange={(e) => setSelectedMilestones((s) => e.target.checked ? [...s, i] : s.filter((x) => x !== i))}
            />
            <span style={{ fontSize: 11, color: "#9ca3af", width: 46 }}>{m.dueWeeks}周</span>
            <input
              data-testid={`plan-milestone-${i}`}
              value={milestoneTitles[i]}
              onChange={(e) => setEditingTitles((t) => ({ ...t, [i]: e.target.value }))}
              style={{ flex: 1, fontSize: 12, padding: "2px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
            />
            {m.criteriaType === "group_settled" && <span style={{ fontSize: 10, color: "#0f766e" }}>随结算</span>}
          </div>
        ))}

        <SubTitle>绑定组（{selectedGroups.length} 条已选）</SubTitle>
        {view.proposal.groups.length === 0 && <Empty>无组建议</Empty>}
        {view.proposal.groups.map((g, i) => (
          <label key={i} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, padding: "2px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedGroups.includes(i)}
              onChange={(e) => setSelectedGroups((s) => e.target.checked ? [...s, i] : s.filter((x) => x !== i))}
            />
            组 #{g.groupId} {g.reason && <span style={{ color: "#9ca3af", fontSize: 11 }}>（{g.reason}）</span>}
          </label>
        ))}

        <SubTitle>体系（{selectedSystems.length} 条已选）</SubTitle>
        {view.proposal.systems.length === 0 && <Empty>无体系建议——可稍后手动挂接/新建</Empty>}
        {view.proposal.systems.map((s, i) => (
          <label key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, padding: "2px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedSystems.includes(i)}
              onChange={(e) => setSelectedSystems((sel) => e.target.checked ? [...sel, i] : sel.filter((x) => x !== i))}
            />
            <span>
              {s.action === "create" ? `新建体系「${s.name}」（核心问题：${s.coreQuestion}；入口 ${s.domainEntries.length}；初始概念 ${s.concepts.length}）`
                : `挂接现有体系 #${s.systemId}`}
            </span>
          </label>
        ))}

        {view.proposal.weeklyContract && (
          <>
            <SubTitle>周契约建议（可改）</SubTitle>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span>每周</span>
              <input type="number" min={1} max={7} value={days} onChange={(e) => setDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} style={numStyle} />
              <span>天 ·</span>
              <input type="number" min={1} max={200} value={cards} onChange={(e) => setCards(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} style={numStyle} />
              <span>卡（弹性承诺：断签不清零）</span>
            </div>
          </>
        )}

        {err && <p data-testid="plan-error" style={{ fontSize: 11, color: "#dc2626", margin: "6px 0 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onUseRules} style={ghostBtn} title="不采纳 AI 建议——回到 M1 规则草案（永远可用的降级基线）">改用规则草案</button>
          <button onClick={onClose} style={ghostBtn}>再想想</button>
          <button data-testid="plan-confirm" onClick={() => void confirm()} disabled={saving} style={primaryBtn}>
            {saving ? "落库中…" : "✓ 确认采用"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 600, fontSize: 12, color: "#374151", margin: "10px 0 4px" }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "#9ca3af" }}>{children}</div>;
}

const numStyle: React.CSSProperties = { width: 56, fontSize: 12, padding: "2px 6px", border: "1px solid #e5e7eb", borderRadius: 4 };
const primaryBtn: React.CSSProperties = { fontSize: 12, padding: "6px 16px", borderRadius: 6, cursor: "pointer", border: "1px solid #0f766e", background: "#0f766e", color: "#fff" };
const ghostBtn: React.CSSProperties = { fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#4b5563" };
