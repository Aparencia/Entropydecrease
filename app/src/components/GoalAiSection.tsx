/**
 * GoalAiSection — 设置页「目标 AI」段（v0.18.2 REQ-254）。
 *
 * @ai-context: 目标规划=内容上传类调用——独立开关默认关（content_gate 之外
 *              第二闸门）+ 预算档位（4K/10K/30K，默认标准）；关闭时 AI 规划
 *              不可用但**规则草案完全可用**（本地优先降级链）。
 * @ai-context: read-modify-write 最小面（ai_set_goal_plan——不覆盖其他设置）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiSettingsView } from "../types/ai";

const TIERS = [
  { id: "light", label: "轻量（~4K，快而省）" },
  { id: "standard", label: "标准（~10K，推荐）" },
  { id: "deep", label: "深度（~30K，计划更细）" },
];

export default function GoalAiSection() {
  const [enabled, setEnabled] = useState(false);
  const [tier, setTier] = useState("standard");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<AiSettingsView>("ai_get_settings")
      .then((s) => { setEnabled(s.goalPlanEnabled); setTier(s.goalPlanTier || "standard"); })
      .catch((e) => setMsg(`目标 AI 设置读取失败: ${e}`));
  }, []);

  const save = async (nextEnabled: boolean, nextTier: string) => {
    setBusy(true);
    setMsg("");
    try {
      await invoke("ai_set_goal_plan", { enabled: nextEnabled, tier: nextTier || null });
      setEnabled(nextEnabled);
      setTier(nextTier);
      setMsg(nextEnabled ? "已开启——访谈/详情页出现「✨ 用 AI 规划」，草案确认后落库" : "已关闭——按规则草案规划（本地优先，零影响）");
    } catch (e) {
      setMsg(`保存失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#374151" }}>🎯 目标 AI（规划师）</span>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            data-testid="goal-ai-toggle"
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void save(e.target.checked, tier)}
          />
          开启（默认关）
        </label>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
          {tier === "standard" ? "标准档 ~10K" : TIERS.find((t) => t.id === tier)?.label}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          data-testid="goal-ai-tier"
          value={tier}
          disabled={busy || !enabled}
          onChange={(e) => void save(enabled, e.target.value)}
          style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
        >
          {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>预算硬顶·成本/轨迹可查·失败自动回退规则草案</span>
      </div>
      {msg && <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>{msg}</p>}
    </div>
  );
}
