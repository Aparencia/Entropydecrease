/**
 * AiServicePanel — AI 服务设置面板（REQ-138/139/140，v0.8.0 M1 使能层）。
 *
 * @ai-context: v0.11.6 M1 瘦身：Provider 管理已迁出至 AiProviderSettings；
 *              本面板保留 ① 全局开关（授权红线默认关——开启且未授权时内联
 *              授权说明：仅上传文本+最小上下文，音视频/图像永不出本机，同意后
 *              才生效）；② 审计列表（REQ-085 AiAuditEntry 缓冲可见化，可清空）。
 * @ai-context: 本组件为纯配置面板，不做内容上传（M2 精修/M3 补充才消费
 *              content_gate）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiAuditEntry, AiSettingsView } from "../types";

/** 通用小按钮样式（与各设置面板一致） */
const btn: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};

/** 审计时间格式化（本地时间 HH:MM:SS） */
function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function AiServicePanel() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  // 授权确认卡（开启开关且未授权时展示）
  const [consentVisible, setConsentVisible] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await invoke<AiSettingsView>("ai_get_settings"));
    } catch (e) {
      setMsg({ kind: "err", text: `读取 AI 设置失败：${e}` });
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setAudit(await invoke<AiAuditEntry[]>("ai_audit_list"));
    } catch {
      /* 审计加载失败不阻塞面板 */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAudit();
  }, [load, loadAudit]);

  /** 开关切换：未授权时先弹授权确认卡，同意后才真正开启 */
  const toggleEnabled = async (on: boolean) => {
    if (on && view && !view.authorized) {
      setConsentVisible(true);
      return;
    }
    await applyEnabled(on);
  };

  const applyEnabled = async (on: boolean) => {
    setConsentVisible(false);
    setBusy(true);
    try {
      await invoke("ai_set_enabled", { enabled: on });
      setMsg({ kind: "ok", text: on ? "AI 功能已开启" : "AI 功能已关闭" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `操作失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

  /** 授权同意（持久化 authorized=true + 开启开关） */
  const consent = async () => {
    setBusy(true);
    try {
      await invoke("ai_set_authorized", { authorized: true });
      await invoke("ai_set_enabled", { enabled: true });
      setConsentVisible(false);
      setMsg({ kind: "ok", text: "已授权并开启 AI 功能" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `授权失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

  const clearAudit = async () => {
    try {
      await invoke("ai_audit_clear");
      setAudit([]);
    } catch (e) {
      setMsg({ kind: "err", text: `清空审计失败：${e}` });
    }
  };

  return (
    <div style={{ fontSize: 12, color: "#1f2937" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>✨ AI 服务</span>
        {view?.enabled ? (
          <span style={{ color: "#0d9488", fontWeight: 600 }}>● 已开启</span>
        ) : (
          <span style={{ color: "#9ca3af" }}>○ 默认关闭</span>
        )}
      </div>

      {/* 全局开关 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!view?.enabled}
            disabled={busy}
            onChange={(e) => void toggleEnabled(e.target.checked)}
          />
          AI 功能开关
        </label>
        <span style={{ color: "#6b7280" }}>（默认关——AI 调用须显式开启）</span>
      </div>

      {/* 授权确认卡（开启且未授权时出现） */}
      {consentVisible && (
        <div
          style={{
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            borderRadius: 6,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>AI 使用授权确认</div>
          <div style={{ lineHeight: 1.6, marginBottom: 8 }}>
            开启后，AI 精修/知识补充功能将上传<strong>转写文本与最小上下文</strong>至
            AI 服务提供商（Provider）进行处理。本地优先铁律：<strong>音视频与图像永不出本机</strong>。
            是否同意？
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void consent()} disabled={busy}>
              同意并开启
            </button>
            <button style={btn} onClick={() => setConsentVisible(false)} disabled={busy}>
              暂不
            </button>
          </div>
        </div>
      )}

      {/* 审计列表 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>AI 调用审计</span>
          <button style={{ ...btn, padding: "2px 8px" }} onClick={() => void clearAudit()}>
            清空
          </button>
        </div>
        {audit.length === 0 ? (
          <div style={{ color: "#9ca3af" }}>暂无调用记录</div>
        ) : (
          <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            {audit.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "4px 8px", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ color: "#6b7280", width: 64, flexShrink: 0 }}>{fmtTime(a.at_unix)}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.upload_summary}
                </span>
                <span style={{ color: a.result === "ok" ? "#0d9488" : "#dc2626" }}>{a.result}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 状态消息 */}
      {msg && (
        <div style={{ fontSize: 11, color: msg.kind === "ok" ? "#0d9488" : "#dc2626", marginTop: 4 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
