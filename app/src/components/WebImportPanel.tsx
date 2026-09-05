/**
 * WebImportPanel — URL 采集动线（v0.20.4 / REQ-303 阶段 1）。
 *
 * @ai-context: 课堂助手第四条动线「URL 采集」：粘贴 URL → 本地抽取管线
 *              （ureq 静态直取 + 规则转 MD）→ kind=web 会话（会话列表/转笔记
 *              复用既有通道）；正文失败自动保留原 HTML 附件（降级链——不产生
 *              半成品）；SPA/登录墙缺口由阶段 2 扩展（浏览器扩展读已登录 DOM）
 *              补齐，本面板保持同一入口。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** WebCaptureView 响应结构（serde camelCase——字段须 camel 读取） */
interface CaptureView {
  sessionId: number;
  title: string;
  site: string | null;
  author: string | null;
  chars: number;
  extractedOk: boolean;
}

interface Props {
  /** 采集完成 → 跳转会话页（同一动线惯例；父层可能未接——幂等可空） */
  onOpenSessions?: (sessionId: number) => void;
  onStatus?: (msg: string) => void;
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  marginBottom: 8,
  background: "#fff",
};
const btn: React.CSSProperties = {
  padding: "5px 12px",
  cursor: "pointer",
  fontSize: 12,
  borderRadius: 6,
  border: "none",
  background: "#0d9488",
  color: "#fff",
};

export default function WebImportPanel({ onOpenSessions, onStatus }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const capture = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const view = await invoke<CaptureView>("web_capture_url", { url: u });
      setMsg(
        `✓ 已采集「${view.title}」${view.extractedOk ? `（正文 ${view.chars} 字符）` : "（正文抽取失败——已保留原 HTML 附件）"}${view.site ? ` · ${view.site}` : ""}`,
      );
      setUrl("");
      onStatus?.(`URL 采集完成：${view.title}`);
      onOpenSessions?.(view.sessionId);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🌐 URL 采集</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void capture();
          }}
          placeholder="粘贴文章链接（http/https）…"
          disabled={busy}
          style={{
            flex: 1,
            fontSize: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: "5px 8px",
            minWidth: 0,
          }}
        />
        <button style={btn} onClick={() => void capture()} disabled={busy || !url.trim()}>
          {busy ? "采集中…" : "采集"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, color: "#047857", marginTop: 5 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 5 }}>{err}</div>}
      <div style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 5 }}>
        正文本地抽取入库（kind=web 会话）；静态站直取，SPA/登录墙由浏览器扩展（阶段 2）覆盖
      </div>
    </div>
  );
}
