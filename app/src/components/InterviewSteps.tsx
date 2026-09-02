/**
 * InterviewSteps.tsx — 访谈四步 + 宣言确认的步骤组件（InterviewDialog 拆件）。
 *
 * @ai-context: 一套组件两种展开（优化评审 #4）——访谈模式四步向导在这里；
 *              快速模式（名称+期限）在 InterviewDialog 内联，不重复组件。
 * @ai-context: 第 1/3 问必答（前端先行校验，后端命令层同口径拦截）；2/4 问
 *              折叠可选（「跳过／以后想」合法路径）——访谈绝不允许变成负担。
 */
import type { MilestoneDraft } from "../types/goals";
import type { InterviewAnswers } from "../utils/goalInterview";
import {
  COMMITMENT_OPTIONS, DRIVER_OPTIONS, HORIZON_OPTIONS, LEVEL_OPTIONS,
  SCENARIO_OPTIONS, TIER_OPTIONS,
} from "../utils/goalInterview";

interface StepProps {
  a: InterviewAnswers;
  setA: (patch: Partial<InterviewAnswers>) => void;
}

/** 一致的小芯片按钮 */
function Chip({ active, onClick, children, testid }: {
  active: boolean; onClick: () => void; children: string; testid?: string;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      style={{
        fontSize: 12, padding: "4px 12px", borderRadius: 14, cursor: "pointer",
        border: active ? "1px solid #0f766e" : "1px solid #d1d5db",
        background: active ? "#f0fdfa" : "#fff", color: active ? "#0f766e" : "#4b5563",
      }}
    >
      {children}
    </button>
  );
}

/** 步 1：意图澄清（必答——学会以后想用它做什么） */
export function StepScenario({ a, setA }: StepProps) {
  return (
    <div>
      <StepTitle n={1} title="意图澄清" desc="学会以后想用它做什么？（定义真目标，不是学科名）" required />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {SCENARIO_OPTIONS.map((s) => (
          <Chip key={s} testid={`scenario-chip-${s}`} active={a.scenario === s}
            onClick={() => setA({ scenario: s })}>{s}</Chip>
        ))}
      </div>
      <input
        data-testid="scenario-input"
        value={a.scenario}
        onChange={(e) => setA({ scenario: e.target.value })}
        placeholder="或直接说你想用它做什么…"
        style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}
      />
      <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0" }}>这一问必答——说不清场景，目标会退化成「假燃料」列表。</p>
    </div>
  );
}

/** 步 2：现状与驱动（折叠可选——跳过合法） */
export function StepLevelDriver({ a, setA }: StepProps) {
  return (
    <div>
      <StepTitle n={2} title="现状与驱动" desc="现在什么程度？为什么是现在？（可跳过——以后想）" />
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>现在什么程度？</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LEVEL_OPTIONS.map((o) => (
            <Chip key={o.id} active={a.level === o.id} onClick={() => setA({ level: o.id })}>{o.label}</Chip>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>为什么是现在？</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DRIVER_OPTIONS.map((d) => (
            <Chip key={d} active={a.driver === d} onClick={() => setA({ driver: d })}>{d}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 步 3：边界与判据（判据档位必答——做到什么程度算会了） */
export function StepCriteria({ a, setA }: StepProps) {
  return (
    <div>
      <StepTitle n={3} title="边界与判据" desc="做到什么程度算会了？时间怎么算？明确不学什么？" required />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {TIER_OPTIONS.map((o) => (
          <Chip key={o.id} testid={`tier-chip-${o.id}`} active={a.tier === o.id}
            onClick={() => setA({ tier: o.id })}>{o.label}</Chip>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>时间怎么算？</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {HORIZON_OPTIONS.map((o) => (
          <Chip key={o.id} active={a.horizon === o.id} onClick={() => setA({ horizon: o.id })}>{o.label}</Chip>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>明确不学什么？（防目标沼泽化）</div>
      <input
        value={a.nonScope}
        onChange={(e) => setA({ nonScope: e.target.value })}
        placeholder="例如：不做 Web 框架 / 不学乐理史…"
        style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}
      />
    </div>
  );
}

/** 步 4：可行与素材（折叠可选——组绑定在访谈内完成） */
export function StepFeasibility({ a, setA, groups, }: StepProps & { groups: { id: number; name: string }[] }) {
  return (
    <div>
      <StepTitle n={4} title="可行与素材" desc="每周能投多少时间？已有关联素材？已知障碍？" />
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>每周能投多少时间？</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {COMMITMENT_OPTIONS.map((o) => (
          <Chip key={o.id} active={a.weeklyCommitment === o.id}
            onClick={() => setA({ weeklyCommitment: o.id })}>{o.label}</Chip>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>已有关联素材（可多选——绑定到目标）</div>
      {groups.length === 0 && (
        <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 6px" }}>暂无笔记组——目标可稍后从详情页绑定。</p>
      )}
      <div style={{ maxHeight: 120, overflow: "auto", marginBottom: 10 }}>
        {groups.map((g) => (
          <label key={g.id} style={{ display: "block", fontSize: 12, color: "#4b5563", padding: "3px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={a.groupIds.includes(g.id)}
              onChange={(e) => setA({
                groupIds: e.target.checked ? [...a.groupIds, g.id] : a.groupIds.filter((x) => x !== g.id),
              })}
              style={{ marginRight: 6 }}
            />
            {g.name}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>已知障碍？</div>
      <input
        value={a.obstacles}
        onChange={(e) => setA({ obstacles: e.target.value })}
        placeholder="例如：下班晚 / 经常出差…"
        style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}
      />
    </div>
  );
}

interface DeclarationProps {
  name: string;
  declaration: string;
  drafts: MilestoneDraft[];
  onDraftChange: (drafts: MilestoneDraft[]) => void;
}

/** 步 5：宣言确认（回显 + 里程碑草案预填可删改） */
export function StepDeclaration({ name, declaration, drafts, onDraftChange }: DeclarationProps) {
  const update = (idx: number, patch: Partial<MilestoneDraft>) =>
    onDraftChange(drafts.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  return (
    <div>
      <StepTitle n={5} title="目标宣言" desc="可改可退——确认后创建（status=active，一步到位）" />
      <div data-testid="declaration-preview" style={{ fontSize: 12, color: "#1f2937", background: "#fafaf9", padding: 10, borderRadius: 6, marginBottom: 10, lineHeight: 1.7 }}>
        {declaration || "请先在第一步填写目标名称"}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        里程碑草案（预填自 {name || "你的现状"}——可删改标题/期限）
      </div>
      {drafts.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#9ca3af", width: 54 }}>第{d.dueWeeks}周</span>
          <input
            data-testid={`draft-title-${i}`}
            value={d.title}
            onChange={(e) => update(i, { title: e.target.value })}
            style={{ flex: 1, padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6 }}
          />
          <select
            value={d.dueWeeks}
            onChange={(e) => update(i, { dueWeeks: Number(e.target.value) })}
            style={{ fontSize: 11, padding: "3px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}
          >
            {[0, 4, 6, 8, 12, 16, 24, 36].map((w) => (
              <option key={w} value={w}>{w === 0 ? "无期限" : `第 ${w} 周`}</option>
            ))}
          </select>
          <button
            data-testid={`draft-remove-${i}`}
            onClick={() => onDraftChange(drafts.filter((_, j) => j !== i))}
            style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #fecaca", borderRadius: 4, background: "#fff", color: "#b91c1c", cursor: "pointer" }}
          >
            删
          </button>
        </div>
      ))}
    </div>
  );
}

/** 步骤标题（必答标记） */
function StepTitle({ n, title, desc, required }: { n: number; title: string; desc: string; required?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1f2937" }}>
        {n}. {title} {required && <span style={{ color: "#b91c1c", fontSize: 11 }}>必答</span>}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{desc}</div>
    </div>
  );
}
