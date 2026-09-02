/**
 * InterviewDialog — 目标设定对话框（一套组件双展开：访谈默认 / 快速副入口）。
 *
 * @ai-context: 优化评审 #4——双轨制是入口不是两套组件：访谈模式=四步向导+
 *              宣言确认（第 1/3 问必答、2/4 问折叠可跳过）；快速模式=只展开
 *              名称+期限，判据走默认档（tier/scenario=None 后端契约）。
 * @ai-context: 步骤状态/答案本地；创建一步到位（status=active 无 draft 仪式）；
 *              宣言预览为展示层（与后端 assemble_declaration 同语义——
 *              判定的唯一事实源在后端 goal_interview.rs）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Goal, MilestoneDraft } from "../types/goals";
import type { InterviewAnswers } from "../utils/goalInterview";
import {
  EMPTY_ANSWERS, interviewMissing, assembleDeclarationPreview, toCreateInput, toQuickInput,
} from "../utils/goalInterview";
import { StepCriteria, StepDeclaration, StepFeasibility, StepLevelDriver, StepScenario } from "./InterviewSteps";

interface Props {
  mode: "interview" | "quick";
  groups: { id: number; name: string }[];
  onClose: () => void;
  /** 创建成功（或编辑保存成功）回调——不携带目标对象（编辑态无新目标，调用方自行刷新） */
  onCreated: () => void;
  /** 编辑态（目标详情→重新访谈）：走 update_goal_interview（配方重推，名称随对话框生效） */
  goalId?: number;
  /** 预填名称（空态热词入口） */
  initialName?: string;
}

const HORIZON_OPTIONS = [
  { id: "3m", label: "3 个月" },
  { id: "6m", label: "半年" },
  { id: "2w", label: "先试两周" },
  { id: "none", label: "无期限" },
];

const TIER_LABELS: Record<string, string> = {
  hands_on: "能上手：全部里程碑 + 主组结算 1 次",
  solo_project: "能独立完成实例：全部里程碑 + 组结算 + 应用记录 ≥1",
  teach_cert: "能教别人/证书：全部里程碑 + 组结算 + 自测 ≥80%（M3 生效）",
  default: "说不清：全部里程碑 + ≥1 组结算 + 近 90 天复习活跃",
};

export default function InterviewDialog({ mode, groups, onClose, onCreated, goalId, initialName }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [horizon, setHorizon] = useState("3m");
  const [a, setA] = useState<InterviewAnswers>(EMPTY_ANSWERS);
  const [drafts, setDrafts] = useState<MilestoneDraft[]>([]);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestKey, setSuggestKey] = useState("");

  const patch = (p: Partial<InterviewAnswers>) => setA((prev) => ({ ...prev, ...p }));

  // 宣言页（step 4）载入草案：现状×投入变化时重新建议（按键控缓存）
  useEffect(() => {
    if (step !== 4 || mode !== "interview") return;
    const key = `${a.level}|${a.weeklyCommitment}`;
    if (key === suggestKey) return;
    setSuggestKey(key);
    invoke<MilestoneDraft[]>("suggest_goal_milestones", { level: a.level || null, weeklyCommitment: a.weeklyCommitment || null })
      .then(setDrafts)
      .catch((e) => setErr(`建议里程碑加载失败: ${e}`));
  }, [step, mode, a.level, a.weeklyCommitment, suggestKey]);

  const tierLabel = TIER_LABELS[a.tier] ?? "";
  // 时效口径：访谈模式取第 3 问 chips（a.horizon），快速模式取顶部下拉（horizon）
  const effectiveHorizon = a.horizon || horizon;
  const declaration = assembleDeclarationPreview(name, effectiveHorizon, a, tierLabel);

  const create = async () => {
    setSaving(true);
    setErr("");
    try {
      const input = mode === "quick"
        ? toQuickInput(name, horizon)
        : toCreateInput(
            name, effectiveHorizon, a,
            drafts.filter((d) => d.title.trim()).map((d) => ({ title: d.title.trim(), dueWeeks: d.dueWeeks })),
          );
      if (goalId != null) {
        // 编辑态：配方重推（判据/意图整体重写；名称随对话框生效，绑组不变）
        await invoke<boolean>("update_goal_interview", { id: goalId, input });
        onCreated();
        return;
      }
      await invoke<Goal>("create_goal", { input });
      onCreated();
    } catch (e) {
      setErr(`创建失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    setErr("");
    if (step === 0 && !a.scenario.trim()) { setErr(interviewMissing(a) ?? "请填写场景"); return; }
    if (step === 1) { setA((p) => ({ ...p, level: p.level || "" })); }
    if (step === 2 && !a.tier) { setErr("第 3 问「做到什么程度算会了？」必答"); return; }
    setStep((s) => Math.min(4, s + 1));
  };

  // 快速模式：两字段 + 创建（访谈模式走步骤向导）
  const quickMode = mode === "quick";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div data-testid="interview-dialog" style={{ width: 520, maxHeight: "86vh", overflow: "auto", background: "#fff", borderRadius: 10, padding: 18, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>
            {quickMode ? "🎯 快速记一个目标" : "🎯 定一个学习目标"}
          </span>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 14, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>

        {quickMode ? (
          <div>
            <Label>目标名称</Label>
            <input
              data-testid="quick-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：学会 Python / 练听力 / 画水彩"
              autoFocus
              style={inputStyle}
            />
            <Label>期限</Label>
            <select value={horizon} onChange={(e) => setHorizon(e.target.value)} style={{ ...inputStyle, width: 200 }}>
              {HORIZON_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "8px 0 0" }}>
              判据走默认档（里程碑 + ≥1 组结算 + 近 90 天复习活跃）；可随时从详情页重新访谈。
            </p>
          </div>
        ) : (
          <>
            <Label>目标名称</Label>
            <input
              data-testid="interview-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：学会 Python / 练听力 / 画水彩"
              autoFocus
              style={inputStyle}
            />
            {/* 折线指示（步骤 0-4） */}
            <div style={{ fontSize: 11, color: "#9ca3af", margin: "10px 0" }}>
              {["意图", "现状", "判据", "素材", "宣言"].map((t, i) => (
                <span key={t} style={{ marginRight: 12, color: i <= step ? "#0f766e" : "#9ca3af", fontWeight: i === step ? 700 : 400 }}>
                  {i + 1}.{t}{i === 3 ? "" : " ›"}
                </span>
              ))}
            </div>
            <div style={{ minHeight: 190 }}>
              {step === 0 && <StepScenario a={a} setA={patch} />}
              {step === 1 && <StepLevelDriver a={a} setA={patch} />}
              {step === 2 && <StepCriteria a={a} setA={patch} />}
              {step === 3 && <StepFeasibility a={a} setA={patch} groups={groups} />}
              {step === 4 && (
                <StepDeclaration
                  name={name}
                  declaration={declaration}
                  drafts={drafts}
                  onDraftChange={setDrafts}
                />
              )}
            </div>
          </>
        )}

        {err && <p data-testid="dialog-error" style={{ fontSize: 11, color: "#dc2626", margin: "6px 0 0" }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#9ca3af", marginRight: "auto" }}>
            {!quickMode && step === 4 && "确认后即创建——里程碑/判据可从详情页调整"}
          </span>
          {!quickMode && step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} style={ghostBtn}>上一步</button>
          )}
          {!quickMode && (step === 1 || step === 3) && (
            <button data-testid="skip-step" onClick={() => setStep((s) => s + 1)} style={ghostBtn}>跳过／以后想</button>
          )}
          {!quickMode && step < 4 && (
            <button data-testid="next-step" onClick={next} style={primaryBtn}>下一步</button>
          )}
          {(quickMode || step === 4) && (
            <button data-testid="confirm-create" onClick={() => void create()} disabled={saving || !name.trim()} style={primaryBtn}>
              {saving ? "创建中…" : "✓ 确认创建"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e5e7eb",
  borderRadius: 6, boxSizing: "border-box", marginBottom: 10,
};
const primaryBtn: React.CSSProperties = {
  fontSize: 12, padding: "6px 16px", borderRadius: 6, cursor: "pointer",
  border: "1px solid #0f766e", background: "#0f766e", color: "#fff",
};
const ghostBtn: React.CSSProperties = {
  fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
  border: "1px solid #d1d5db", background: "#fff", color: "#4b5563",
};

function Label({ children }: { children: string }) {
  return <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{children}</div>;
}
