/**
 * KnowledgeSystemWizard — 全局体系创建向导（v0.13.1 §五）。
 *
 * @ai-context: 三步向导——① 核心问题一句（必填；指引引用指南精神，问题先行）
 *              ② 领域入口 3–5 行（自动 3 空行，可全部跳过，输错去重）
 *              ③ 本周第一个输出（可选；落为「场景」节点）。
 * @ai-context: 不预填内容（§五 注意）——预填＝假燃料：所有输入从空字符串开始，
 *              不加任何示例填充，引导用户写自己的问题与领域入口。
 * @ai-context: 最后落库顺序——先 create_knowledge_system(global)，再逐条
 *              add_knowledge_node(domain_entry)，最后第一条输出 add_knowledge_node
 *              (scenario)。三条 invoke 顺序在测试中有断言，勿改顺序。
 */
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { KnowledgeSystem, KnowledgeNodeType } from "../types/knowledge";

interface Props {
  /** 关闭向导（onCreated 也负责关闭） */
  onClose: () => void;
  /** 创建成功回调（父页刷新体系列表并自动选中） */
  onCreated: (system: KnowledgeSystem) => void;
}

/** 步骤序号 -> 标题（步骤指示器） */
const STEP_TITLES = ["核心问题", "领域入口", "第一个输出"] as const;

/** 中文提示（注释解释 Why——指引文案引用指南精神） */
const GUIDE = {
  step1: "用一句话写下你正在攻克的核心问题。问题先行——结构在问题里的，成为体系。不抄书、不堆砌，只写真正卡住你的那一个。",
  step2: "写下这个体系麾下的 3–5 个领域入口（可全部跳过）。它们是问题树的主干分支，各是一片值得深耕的领域。",
  step3: "本周你想产出的第一个可验证输出（可选）。写下一个具体成果，它会成为一个「场景」节点，提醒你体系要产出、不要囤积。",
};

export default function KnowledgeSystemWizard({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [coreQuestion, setCoreQuestion] = useState("");
  const [domainEntries, setDomainEntries] = useState<string[]>(["", "", ""]);
  const [firstOutput, setFirstOutput] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  /** 已填写的非空领域入口（去重保留首个——「去重」为 UI 层校验） */
  const filledEntries = useMemo(
    () => Array.from(new Set(domainEntries.map((s) => s.trim()).filter(Boolean))),
    [domainEntries],
  );

  /** 校验当前步；通过返回 null，否则返回红色错误文案（逐行提示） */
  const validateStep = (s: 1 | 2 | 3): string | null => {
    if (s === 1) {
      if (!coreQuestion.trim()) return "请输入核心问题（一句话即可）。";
      return null;
    }
    if (s === 2) {
      // 去重：重复的领域入口逐行红色提示（不静默吞掉——用户知道哪行重复）
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const raw of domainEntries) {
        const t = raw.trim();
        if (!t) continue;
        if (seen.has(t)) dups.push(t);
        seen.add(t);
      }
      if (dups.length > 0) return `存在重复的领域入口：${dups.join("、")}`;
      return null;
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => (s === 3 ? 3 : (s + 1) as 1 | 2 | 3));
  };

  const back = () => {
    setError("");
    setStep((s) => (s <= 1 ? 1 : (s - 1) as 1 | 2 | 3));
  };

  const runCreate = async () => {
    const err = validateStep(1);
    if (err) {
      setStep(1);
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
    try {
      // ① 创建全局体系（name 由用户填或由核心问题派生——不必为空）
      const system = await invoke<KnowledgeSystem>("create_knowledge_system", {
        name: name.trim() || "全局体系",
        kind: "global",
        coreQuestion: coreQuestion.trim(),
      });
      // ② 非空领域入口逐条落节点（已去重；顺序即输入顺序）
      for (const text of filledEntries) {
        await invoke("add_knowledge_node", { systemId: system.id, nodeType: "domain_entry" satisfies KnowledgeNodeType, text });
      }
      // ③ 第一条输出（若有）落为「场景」节点（挂全局体系，根节点）
      if (firstOutput.trim()) {
        await invoke("add_knowledge_node", { systemId: system.id, nodeType: "scenario" satisfies KnowledgeNodeType, text: firstOutput.trim() });
      }
      onCreated(system);
    } catch (e) {
      setError(`创建失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const doClose = async () => {
    if (saving) return;
    // 输入未完成时离开给确认（防误触丢弃已写内容）
    if (coreQuestion.trim() || filledEntries.length > 0 || firstOutput.trim()) {
      const ok = await confirm("向导内容尚未创建，确定要放弃吗？", { title: "熵减", kind: "warning" });
      if (!ok) return;
    }
    onClose();
  };

  const setDomainEntry = (i: number, val: string) => {
    setDomainEntries((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  };

  const stepTitle = (i: number) => `第 ${i} 步 · ${STEP_TITLES[i - 1]}`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
      onClick={doClose}
    >
      <div
        data-testid="knowledge-wizard"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "92vw", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 10px 40px rgba(0,0,0,0.15)", overflow: "hidden" }}
      >
        {/* 头部：标题 + 关闭 */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0f766e" }}>🧠 创建全局体系</span>
          <button data-testid="wizard-close" onClick={() => void doClose()} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }} title="关闭">
            ✕
          </button>
        </div>

        {/* 步骤指示器（三段） */}
        <div style={{ display: "flex", padding: "10px 18px", gap: 6, borderBottom: "1px solid #f3f4f6" }}>
          {STEP_TITLES.map((t, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <span key={t} data-testid={`wizard-step-${n}`} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, background: active ? "#f0fdfa" : done ? "#ecfdf5" : "#f9fafb", color: active ? "#0f766e" : done ? "#047857" : "#9ca3af", border: active ? "1px solid #14b8a6" : "1px solid #e5e7eb" }}>
                {done ? "✓" : n}. {t}
              </span>
            );
          })}
        </div>

        <div style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{stepTitle(step)}</div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.6 }}>{GUIDE[`step${step}`]}</p>

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>体系名称（可选）</label>
                <input
                  data-testid="wizard-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="默认：全局体系"
                  style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>核心问题 *</label>
                <textarea
                  data-testid="wizard-core-question"
                  value={coreQuestion}
                  onChange={(e) => setCoreQuestion(e.target.value)}
                  placeholder="一句话写下真正卡住你的那个问题"
                  rows={3}
                  style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>每个入口一行；可全部跳过（空行自动忽略）。</div>
              {domainEntries.map((val, i) => (
                <input
                  key={i}
                  data-testid={`wizard-domain-${i}`}
                  value={val}
                  onChange={(e) => setDomainEntry(i, e.target.value)}
                  placeholder={`领域入口 ${i + 1}（可空）`}
                  style={{ width: "100%", fontSize: 13, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}
                />
              ))}
              <button
                data-testid="wizard-add-domain"
                onClick={() => setDomainEntries((prev) => prev.length >= 5 ? prev : [...prev, ""])}
                disabled={domainEntries.length >= 5}
                style={{ alignSelf: "flex-start", fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", color: domainEntries.length >= 5 ? "#9ca3af" : "#374151" }}
              >
                ＋ 加一行
              </button>
            </div>
          )}

          {step === 3 && (
            <textarea
              data-testid="wizard-first-output"
              value={firstOutput}
              onChange={(e) => setFirstOutput(e.target.value)}
              placeholder="可选：本周要产出的第一个可验证输出"
              rows={3}
              style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, resize: "vertical", boxSizing: "border-box" }}
            />
          )}

          {/* 逐行红色错误提示 */}
          {error && (
            <div data-testid="wizard-error" style={{ fontSize: 12, color: "#dc2626", marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px", lineHeight: 1.5 }}>
              {error}
            </div>
          )}
        </div>

        {/* 底部：上一步 / 下一步 / 完成 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderTop: "1px solid #e5e7eb", background: "#fafafa" }}>
          {step > 1 && (
            <button data-testid="wizard-back" onClick={back} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}>
              ← 上一步
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}>
            取消
          </button>
          {step < 3 ? (
            <button data-testid="wizard-next" onClick={next} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>
              下一步 →
            </button>
          ) : (
            <button data-testid="wizard-finish" onClick={() => void runCreate()} disabled={saving} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>
              {saving ? "创建中…" : "✓ 完成，创建体系"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
