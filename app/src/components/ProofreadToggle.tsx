/**
 * ProofreadToggle — 可选 LLM 文本校对开关（v0.20.2 / REQ-270）。
 *
 * @ai-context: 双闸门之二（content_gate 之外独立开关，默认关）；开启提示
 *              「仅文本上云、语音不出本机」；关闭=转写链路零影响。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AiSettingsView {
  enabled: boolean;
  authorized: boolean;
  proofread_enabled: boolean;
}

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };

export function ProofreadToggle() {
  const [on, setOn] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void invoke<AiSettingsView>("ai_get_settings")
      .then((v) => {
        setOn(v.proofread_enabled);
        setGlobalEnabled(v.enabled);
        setAuthorized(v.authorized);
      })
      .catch((e) => setErr(`读取设置失败: ${e}`));
  }, []);

  const toggle = async (next: boolean) => {
    setErr("");
    setMsg("");
    if (next && !globalEnabled) {
      setMsg("提示：还需开启上方「AI 功能」全局开关（默认关——授权红线）");
    }
    try {
      await invoke("ai_set_proofread", { enabled: next });
      setOn(next);
      setMsg(next ? "已开启文本校对（建议制：机器只给建议，由你裁决采纳）" : "已关闭文本校对（转写链路零影响）");
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b>🔤 文本校对（LLM）</b>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => void toggle(e.target.checked)}
          data-testid="proofread-toggle"
          style={{ cursor: "pointer" }}
        />
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{on ? "已开启（默认关双闸门之二）" : "默认关"}</span>
        {on && (
          <button
            style={{ ...btn, border: "1px solid #e5e7eb", background: "#fff", color: "#374151" }}
            onClick={() => void toggle(false)}
          >
            关闭
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
        逐句建议制：仅文本上云（语音/画面永不出本机）；开启仍需全局开关+授权；建议在会话详情「🔤 校对」入口使用。
        {authorized ? "" : "（尚未同意 AI 授权——请在 AI 服务授权卡完成）"}
      </div>
      {msg && <div style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{err}</div>}
    </div>
  );
}

export default ProofreadToggle;
