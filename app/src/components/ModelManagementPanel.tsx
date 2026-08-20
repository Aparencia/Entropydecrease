/**
 * ModelManagementPanel — 模型管理面板（2026-08-20 用户需求：原「结构分析模型」
 * 面板改名为模型管理并覆盖**全部模型**——转写/说话人/标点/OCR/结构，各自
 * 状态可见、可下载的提供应用内下载入口，未下载的说明降级路径）。
 *
 * @ai-context: 各区段数据源：health_status（missing_models 按前缀分类：
 *              streaming/sensevoice/speaker/punctuation）+ asr_streaming_model_status
 *              + model_download_status（流式进度）+ speaker_model_download_status
 *              （说话人进度）+ structure_model_status（内嵌 StructureModelSetting）。
 * @ai-context: 下载命令幂等：download_streaming_model / download_speaker_model /
 *              structure_model_download（结构面板内部）；进度事件
 *              model:download-* 与 speaker-model:download-*。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import StructureModelSetting from "./StructureModelSetting";

/** 健康快照（health_status 载荷）。 */
interface HealthSnapshot {
  disk_free_gb: number | null;
  disk_warn: boolean;
  missing_models: string[];
  asr_alive: boolean;
  ocr_alive: boolean;
}

/** 流式模型就绪状态。 */
interface StreamingModelStatus {
  ready: boolean;
  missing: string[];
}

/** 下载进度（model_downloader::DownloadProgress 契约）。 */
interface DownloadProgress {
  file: string;
  downloadedBytes: number;
  totalBytes: number;
}

/** 说话人下载状态。 */
interface SpeakerDownloadStatus {
  state: string; // idle | downloading | done | failed
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

const btn: React.CSSProperties = { padding: "2px 10px", fontSize: 11, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", cursor: "pointer" };
const badge: React.CSSProperties = { fontSize: 11, padding: "1px 8px", borderRadius: 10, background: "#f3f4f6", color: "#6b7280" };

export default function ModelManagementPanel() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [streaming, setStreaming] = useState<StreamingModelStatus | null>(null);
  const [streamProgress, setStreamProgress] = useState<DownloadProgress | null>(null);
  const [streamBusy, setStreamBusy] = useState(false);
  const [speaker, setSpeaker] = useState<SpeakerDownloadStatus | null>(null);
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [h, s] = await Promise.all([
        invoke<HealthSnapshot>("health_status"),
        invoke<StreamingModelStatus>("asr_streaming_model_status"),
      ]);
      setHealth(h);
      setStreaming(s);
      setSpeaker(await invoke<SpeakerDownloadStatus>("speaker_model_download_status"));
    } catch (e) {
      setError(`模型状态查询失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 流式 + 说话人下载进度事件
  useEffect(() => {
    const unlisten = Promise.all([
      listen<DownloadProgress>("model:download-progress", (e) => setStreamProgress(e.payload)),
      listen("model:download-done", () => {
        setStreamProgress(null);
        setStreamBusy(false);
        void refresh();
      }),
      listen<string>("model:download-failed", (e) => {
        setStreamBusy(false);
        setError(`流式模型下载失败: ${e.payload}`);
      }),
      listen<DownloadProgress>("speaker-model:download-progress", (e) => setSpeaker({ state: "downloading", downloadedBytes: e.payload.downloadedBytes, totalBytes: e.payload.totalBytes, error: null })),
      listen("speaker-model:download-done", () => void refresh()),
      listen<string>("speaker-model:download-failed", (e) => {
        setSpeakerBusy(false);
        setError(`说话人模型下载失败: ${e.payload}`);
      }),
    ]);
    return () => {
      void unlisten.then((fns) => fns.forEach((fn) => fn()));
    };
  }, [refresh]);

  const downloadStreaming = async () => {
    setStreamBusy(true);
    setError("");
    try {
      await invoke("download_streaming_model");
    } catch (e) {
      setStreamBusy(false);
      setError(`流式模型下载启动失败: ${e}`);
    }
  };

  const downloadSpeaker = async () => {
    setSpeakerBusy(true);
    setError("");
    try {
      await invoke("download_speaker_model");
    } catch (e) {
      setSpeakerBusy(false);
      setError(`说话人模型下载启动失败: ${e}`);
    }
  };

  const missing = (prefix: string) => (health?.missing_models ?? []).filter((m) => m.startsWith(prefix));
  const pct = (d: number, t: number) => (t > 0 ? `${Math.round((d / t) * 100)}%` : "连接中…");
  const speakerState = speaker?.state ?? "idle";

  return (
    <div style={{ fontSize: 12, color: "#374151" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        🧩 模型管理（全部模型按需下载 · 未下载自动降级）
      </div>
      {error && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>{error}</div>}

      {/* 转写模型：流式主链路 + 离线重打分 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, width: 200 }}>流式转写（Zipformer）</span>
        {streaming?.ready ? (
          <span style={{ ...badge, background: "#f0fdfa", color: "#0d9488" }}>✓ 已就绪</span>
        ) : (
          <span style={{ ...badge, background: "#fef2f2", color: "#dc2626" }}>未下载</span>
        )}
        {!streaming?.ready && !streamBusy && !streamProgress && (
          <button style={btn} onClick={() => void downloadStreaming()}>下载（~300MB）</button>
        )}
        {(streamBusy || streamProgress) && (
          <span style={{ fontSize: 11, color: "#0f766e" }}>
            ⬇ {streamProgress ? `${streamProgress.file} ${pct(streamProgress.downloadedBytes, streamProgress.totalBytes)}` : "连接中…"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, width: 200 }}>离线转写（SenseVoice）</span>
        {missing("sensevoice").length === 0 ? (
          <span style={{ ...badge, background: "#f0fdfa", color: "#0d9488" }}>✓ 已就绪</span>
        ) : (
          <span style={{ ...badge, background: "#fef2f2", color: "#dc2626" }}>缺失（重打分降级）</span>
        )}
        <span style={{ fontSize: 10.5, color: "#9ca3af" }}>随安装包捆绑；脚本 scripts/download-streaming-asr.mjs 可重装</span>
      </div>

      {/* 说话人模型（讲者切换；应用内下载入口——用户需求） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, width: 200 }}>说话人模型（wespeaker）</span>
        {speakerState === "done" ? (
          <span style={{ ...badge, background: "#f0fdfa", color: "#0d9488" }}>✓ 已就绪</span>
        ) : speakerState === "downloading" ? (
          <span style={{ fontSize: 11, color: "#0f766e" }}>
            ⬇ {pct(speaker?.downloadedBytes ?? 0, speaker?.totalBytes ?? 0)}
          </span>
        ) : (
          <span style={{ ...badge, background: "#fef2f2", color: "#dc2626" }}>
            {speakerState === "failed" ? "下载失败" : "未下载"}
          </span>
        )}
        {speakerState !== "done" && speakerState !== "downloading" && (
          <button style={btn} onClick={() => void downloadSpeaker()} disabled={speakerBusy}>
            {speakerBusy ? "启动中…" : "下载（20-70MB）"}
          </button>
        )}
        {speakerState === "failed" && speaker?.error && (
          <span style={{ fontSize: 10.5, color: "#dc2626" }}>{speaker.error}</span>
        )}
      </div>

      {/* 标点恢复模型 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, width: 200 }}>标点恢复（ct-transformer）</span>
        {missing("punctuation").length === 0 ? (
          <span style={{ ...badge, background: "#f0fdfa", color: "#0d9488" }}>✓ 已就绪</span>
        ) : (
          <span style={{ ...badge, background: "#fffbeb", color: "#b45309" }}>未下载（无标点降级）</span>
        )}
        <span style={{ fontSize: 10.5, color: "#9ca3af" }}>脚本 scripts/download-punctuation.mjs 可安装</span>
      </div>

      {/* OCR 模型（ModelScope 自动缓存） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, width: 200 }}>OCR（PP-OCRv6）</span>
        {health?.ocr_alive ? (
          <span style={{ ...badge, background: "#f0fdfa", color: "#0d9488" }}>✓ 引擎运行中</span>
        ) : (
          <span style={{ ...badge, background: "#fffbeb", color: "#b45309" }}>引擎未就绪</span>
        )}
        <span style={{ fontSize: 10.5, color: "#9ca3af" }}>首次使用经 ModelScope 自动缓存</span>
      </div>

      {/* 结构模型（版面/表格/公式——原结构分析模型区段） */}
      <StructureModelSetting />
    </div>
  );
}
