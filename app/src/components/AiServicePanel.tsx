/**
 * AiServicePanel — AI 服务设置面板（REQ-138/139/140，v0.8.0 M1 使能层）。
 *
 * @ai-context: 使能层全部配置集中于此：① 全局开关（授权红线默认关——
 *              开启且未授权时内联授权说明：仅上传文本+最小上下文，音视频/
 *              图像永不出本机，同意后才生效）；② 密钥管理（掩码输入/保存到
 *              Windows DPAPI 凭据库/清除——密钥从不回传前端，视图只有
 *              hasKey/keySource，保存时输入框留空即不改密钥）；③ 端点/模型
 *              可配；④ 一键测试连接（余额接口试通——错误密钥明确报错）；
 *              ⑤ 余额卡片（total/grants/topped_up + 刷新 + 低余额提醒）；
 *              ⑥ 审计列表（REQ-085 AiAuditEntry 缓冲可见化，可清空）。
 * @ai-context: 本组件为纯配置面板，不做内容上传（M2 精修/M3 补充才消费
 *              content_gate）；测试连接/余额查询为配置验证读操作不 gate 授权。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AiAuditEntry,
  AiBalance,
  AiSettingsInput,
  AiSettingsView,
  BalanceView,
} from "../types";

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
  // 表单态（与视图解耦：未保存的编辑不回填/不覆盖）
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [threshold, setThreshold] = useState("1");
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  // 授权确认卡（开启开关且未授权时展示）
  const [consentVisible, setConsentVisible] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await invoke<AiSettingsView>("ai_get_settings");
      setView(v);
      setBaseUrl(v.baseUrl);
      setModel(v.model);
      setThreshold(String(v.lowBalanceThreshold));
    } catch (e) {
      setMsg({ kind: "err", text: `读取 AI 设置失败：${e}` });
    }
  }, []);

  const loadBalance = useCallback(async () => {
    setBusy(true);
    try {
      setBalance(await invoke<BalanceView>("ai_get_balance"));
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "err", text: `查询余额失败：${e}` });
    } finally {
      setBusy(false);
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

  /** 保存密钥（留空 = 不改；保存后清空输入框，避免明文残留在 DOM） */
  const saveKey = async () => {
    if (!keyInput.trim()) {
      setMsg({ kind: "err", text: "请输入密钥后再保存" });
      return;
    }
    setBusy(true);
    try {
      await invoke("ai_save_key", { apiKey: keyInput.trim() });
      setKeyInput("");
      setMsg({ kind: "ok", text: "密钥已保存到系统凭据保护（DPAPI 加密）" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `保存密钥失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    setBusy(true);
    try {
      await invoke("ai_clear_key");
      setKeyInput("");
      setMsg({ kind: "ok", text: "密钥已清除" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `清除密钥失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

  /** 更新端点/模型/阈值 */
  const saveSettings = async () => {
    if (!view) return;
    setBusy(true);
    try {
      const input: AiSettingsInput = {
        enabled: view.enabled,
        authorized: view.authorized,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        lowBalanceThreshold: parseFloat(threshold) || 1,
        rememberCostChoice: view.rememberCostChoice,
      };
      await invoke("ai_update_settings", { settings: input });
      setMsg({ kind: "ok", text: "设置已保存" });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `保存设置失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

  /** 测试连接（余额接口试通——验证密钥有效性） */
  const testConnection = async () => {
    setBusy(true);
    try {
      const b = await invoke<AiBalance>("ai_test_connection");
      setMsg({
        kind: "ok",
        text: `连接成功：余额 ¥${b.totalBalance.toFixed(2)}（赠额 ¥${b.grantsBalance.toFixed(2)} / 充值 ¥${b.toppedUpBalance.toFixed(2)}）`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: `连接失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

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

  const low = balance?.lowBalanceWarning;
  const b = balance?.balance;

  return (
    <div style={{ fontSize: 12, color: "#1f2937" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>✨ AI 服务（SiliconFlow）</span>
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
            SiliconFlow 进行处理。本地优先铁律：<strong>音视频与图像永不出本机</strong>。
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

      {/* 密钥管理 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>API 密钥</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <input
            type={showKey ? "text" : "password"}
            placeholder={view?.hasKey ? `已配置（来源：${view.keySource}）· 留空不改` : "sk-..."}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            style={{
              flex: 1,
              padding: "5px 8px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
          />
          <button style={btn} onClick={() => setShowKey((s) => !s)}>
            {showKey ? "隐藏" : "显示"}
          </button>
          <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void saveKey()} disabled={busy}>
            保存
          </button>
          {view?.hasKey && (
            <button style={btn} onClick={() => void clearKey()} disabled={busy}>
              清除
            </button>
          )}
        </div>
        <div style={{ color: "#6b7280" }}>
          密钥经 Windows 系统凭据保护（DPAPI）加密存储，不落数据库/明文文件；环境变量
          SILICONFLOW_API_KEY 优先（开发路径）。
        </div>
      </div>

      {/* 端点/模型 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>端点与模型</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.siliconflow.cn/v1"
            style={inputStyle}
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="模型名"
            style={{ ...inputStyle, width: 200 }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>低余额阈值（元）</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
          <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void saveSettings()} disabled={busy}>
            保存设置
          </button>
          <button style={btn} onClick={() => void testConnection()} disabled={busy}>
            一键测试连接
          </button>
        </div>
      </div>

      {/* 余额卡片 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 10, background: "#fafafa" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>余额</span>
          <button style={{ ...btn, padding: "2px 8px" }} onClick={() => void loadBalance()} disabled={busy}>
            刷新
          </button>
        </div>
        {b ? (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: low ? "#dc2626" : "#0d9488" }}>
              ¥{b.totalBalance.toFixed(2)}
              <span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
                赠额 ¥{b.grantsBalance.toFixed(2)} · 充值 ¥{b.toppedUpBalance.toFixed(2)} · {b.currency}
              </span>
            </div>
            {low && <div style={{ color: "#dc2626", marginTop: 4 }}>⚠️ {low}</div>}
          </div>
        ) : (
          <div style={{ color: "#9ca3af" }}>未查询（点击刷新获取实时余额）</div>
        )}
      </div>

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

/** 输入框统一样式 */
const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "5px 8px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  minWidth: 0,
};
