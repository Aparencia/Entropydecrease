/**
 * AudioStoragePanel — 会话音频落盘管理（TD-2026-08-20-H 清偿：REQ-068
 * session_audio_status/cleanup 后端"M6 清理 UI"承诺兑现）。
 *
 * @ai-context: 展示音频落盘状态（文件数/占用/保留期/预算）+ 手动清理入口
 *              （超保留期删旧 + 超预算删最旧）；enabled=false 时提示未启用
 *              （前端可见化——此前仅后端注释承诺）。
 * @ai-context: 批 8 T27（用户裁决 U1-a #1）：加**真开关** —— 此前后端没有 setter 命令、
 *              配置也没有落盘通道 ⇒ `status.enabled` 恒 true、用户改不了（产品问题 #1）。
 *              现在点击 ⇒ `session_audio_config_set({ enabled })` ⇒ **用后端回读的状态整体
 *              替换本地状态**（不写本地乐观值：写盘失败必须从错误行走出来，不许假装成功）。
 * @ai-context: 开关用 `Button` 原语；本文件既有的「立即清理」是原生 `<button>`（在
 *              `nativeButtonBaseline` 里登记为 1）⇒ **那个不动**，新开关不得再添原生按钮。
 * @ai-context: 写盘位置 = 应用数据目录的 `audio-store.json`（后端构造，前端不传路径）；
 *              开关**下次实时会话**生效（不热切换进行中会话）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "../ui/primitives";

interface SessionAudioStatus {
  fileCount: number;
  totalBytes: number;
  retentionDays: number;
  diskBudgetBytes: number;
  enabled: boolean;
  /** 生效开关（env ENTROPY_AUDIO_STORE 覆盖配置文件时与 `enabled` 不同） */
  effective: boolean;
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

/** 设置开关的 IPC 名（与后端 `commands_audio::session_audio_config_set` 逐字同名）。 */
export const SET_ENABLED_COMMAND = "session_audio_config_set";

export default function AudioStoragePanel() {
  const [status, setStatus] = useState<SessionAudioStatus | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [saving, setSaving] = useState(false);

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

  /**
   * 切换落盘开关（持久化；下次实时会话生效）。
   *
   * @ai-context: 入参 = **当前值的反**（不在本地先翻转）⇒ 连点不会让 UI 与后端错开；
   *              成功路径只用后端回读的 status（`setStatus(await invoke(...))`）。
   */
  const toggle = async (next: boolean) => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      setStatus(await invoke<SessionAudioStatus>(SET_ENABLED_COMMAND, { enabled: next }));
      setInfo(next ? "已开启：原始音频将在下次实时会话落盘" : "已关闭：下次实时会话不再保存原始音频");
    } catch (e) {
      setError(`音频落盘开关保存失败: ${e}`);
    } finally {
      setSaving(false);
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
        <Button
          variant="secondary"
          size="sm"
          busy={saving}
          disabled={!status}
          title="开启 / 关闭会话音频落盘（写入应用数据目录 audio-store.json；下次实时会话生效）"
          testId="audio-store-toggle"
          style={{ marginLeft: "auto" }}
          onClick={() => void toggle(!(status?.enabled ?? true))}
        >
          {status?.enabled === false ? "落盘：关" : "落盘：开"}
        </Button>
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
          {status.effective
            ? "音频落盘已关闭，但环境变量 ENTROPY_AUDIO_STORE 正在覆盖——仍会保存原始音频"
            : "音频落盘未启用——会话原始音频不会保存（讲者分析等离线能力将不可用）"}
        </div>
      )}
    </div>
  );
}
