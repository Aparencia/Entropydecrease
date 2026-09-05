/**
 * WebInboxPanel — web 扩展收件服务（v0.20.4 / REQ-304）。
 *
 * @ai-context: 只绑 127.0.0.1 随机端口 + 随机 token（首启生成持久化）；扩展在
 *              已登录 DOM 抽取（公众号/知乎正解）→ POST /ingest 单向投递；
 *              本面板=启动/停止/参数展示（端口+token 复制给扩展安装配置）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface InboxView {
  running: boolean;
  port: number | null;
  token: string | null;
  inbox_url: string | null;
}

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };
const okBtn: React.CSSProperties = { ...btn, background: "#0d9488", color: "#fff", border: "none" };
const ghostBtn: React.CSSProperties = { ...btn, background: "#fff", border: "1px solid #e5e7eb", color: "#374151" };

export function WebInboxPanel() {
  const [view, setView] = useState<InboxView | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      setView(await invoke<InboxView>("web_inbox_status"));
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const start = async () => {
    try {
      setView(await invoke<InboxView>("web_inbox_start"));
      setMsg("✓ 收件服务已启动——仅本机回环可达（随机端口 + token 鉴权）");
    } catch (e) {
      setErr(String(e));
    }
  };

  const stop = async () => {
    try {
      await invoke("web_inbox_stop");
      setMsg("已停止（token 保留——下次启动同 token，扩展零重配）");
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const copy = async () => {
    if (!view?.token) return;
    try {
      await navigator.clipboard.writeText(
        `端口：${view.port}\nToken：${view.token}`,
      );
      setMsg("已复制端口与 token——粘贴到浏览器扩展弹窗（app/extension-web-clipper 手动加载）");
    } catch (e) {
      setErr(`复制失败: ${e}`);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
        <b>🛬 本地收件（浏览器扩展投递）</b>{" "}
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          登录墙正解：扩展读已登录 DOM → 本服务（127.0.0.1 + token 单向投递）→ kind=web 会话
        </span>
      </div>
      {msg && <div style={{ fontSize: 11, color: "#047857", marginBottom: 4 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 4 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {!view?.running ? (
          <button style={okBtn} onClick={() => void start()}>▶ 启动收件服务</button>
        ) : (
          <>
            <span style={{ fontSize: 12 }}>端口 <b>{view.port}</b></span>
            <code style={{ fontSize: 11, background: "#f9fafb", padding: "2px 6px", borderRadius: 4 }}>{view.token}</code>
            <button style={ghostBtn} onClick={() => void copy()}>复制参数</button>
            <button style={{ ...ghostBtn, color: "#dc2626" }} onClick={() => void stop()}>⏹ 停止</button>
          </>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
        安装扩展：Edge/Chrome 扩展管理页开启开发者模式 → 「加载已解压的扩展程序」→ 选 app/extension-web-clipper（投递契约见 docs/Foresight/web-capture-extension-protocol.md）
      </div>
    </div>
  );
}

export default WebInboxPanel;
