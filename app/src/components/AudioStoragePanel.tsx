/**
 * AudioStoragePanel — 会话音频落盘管理（TD-2026-08-20-H 清偿：REQ-068
 * session_audio_status/cleanup 后端"M6 清理 UI"承诺兑现）。
 *
 * @ai-context: 展示音频落盘状态（文件数/占用/保留期/预算）+ 手动清理入口
 *              （超保留期删旧 + 超预算删最旧）；enabled=false 时提示未启用
 *              （前端可见化——此前仅后端注释承诺）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SessionAudioStatus {
  fileCount: number;
  totalBytes: number;
  retentionDays: number;
  diskBudgetBytes: number;
  enabled: boolean;
}

interface CleanupSummary {
  deleted: number;
  freedBytes: number;
}

/** 字节 → 可读大小（纯函数）。 */
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function AudioStoragePanel() {
  const [status, setStatus] = useState<SessionAudioStatus | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cleaning, setCleaning] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try {
      setStatus(await invoke<SessionAudioStatus>("session_audio_status"));
    } catch (e) {
      setError(`音频状态查询失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cleanup = async () => {
    setCleaning(true);
    setError("");
    setInfo("");
    try {
      const s = await invoke<CleanupSummary>("session_audio_cleanup");
      setInfo(`清理完成：删除 ${s.deleted} 个文件，释放 ${fmtBytes(s.freedBytes)}`);
      void refresh();
    } catch (e) {
      setError(`清理失败: ${e}`);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🎙 会话音频存储</span>
        {status && (
          <span style={{ fontSize: 11.5, color: "#374151" }}>
            {status.fileCount} 个文件 · {fmtBytes(status.totalBytes)} · 保留 {status.retentionDays} 天
          </span>
        )}
        <button
          onClick={() => void cleanup()}
          disabled={cleaning || !status?.enabled}
          style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: cleaning ? "wait" : "pointer" }}
          title="手动清理：超保留期删除 + 超预算删最旧"
        >
          {cleaning ? "清理中…" : "立即清理"}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>}
      {!error && info && <div style={{ fontSize: 11, color: "#0f766e" }}>{info}</div>}
      {status && !status.enabled && (
        <div style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "4px 8px" }}>
          音频落盘未启用——会话原始音频不会保存（讲者分析等离线能力将不可用）
        </div>
      )}
    </div>
  );
}
