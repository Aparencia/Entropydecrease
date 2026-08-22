/**
 * VideoImportPanel — 视频文件导入面板（REQ-015，v0.3.0）。
 *
 * @ai-context: 选视频 → import_video（字幕优先 L1/L2 免 ASR / 无字幕分窗 ASR + 关键帧 OCR）→
 *              import:progress 事件实时回显各阶段进度；完成后引导去「会话」页查看时间轴。
 * @ai-context: ffmpeg 缺失时后端返回可操作错误（引导 download-ffmpeg.ps1），面板原样展示。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImportProgress } from "../types";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };

/** 视频文件扩展名（与 Rust 侧白名单一致） */
const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "avi", "wmv", "flv", "webm", "ts", "m4v"];

export default function VideoImportPanel({ onOpenSessions }: { onOpenSessions?: (sessionId: number) => void }) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // 导入进度事件（长任务在后台线程，事件驱动回显不轮询）
  useEffect(() => {
    const unlisten = listen<ImportProgress>("import:progress", (e) => {
      setProgress(e.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const pickVideo = async () => {
    const p = await open({
      filters: [{ name: "视频", extensions: VIDEO_EXTENSIONS }],
    });
    if (typeof p === "string") {
      setVideoPath(p);
      setError("");
    }
  };

  const runImport = async () => {
    if (!videoPath) return;
    setImporting(true);
    setError("");
    setSessionId(null);
    setProgress(null);
    try {
      const id = await invoke<number>("import_video", { path: videoPath });
      setSessionId(id);
    } catch (e) {
      setError(`导入失败: ${e}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        视频文件导入{importing && <span style={{ color: "#dc2626" }}> ● 处理中</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={btn} onClick={pickVideo} disabled={importing}>
          选视频
        </button>
        <button
          style={{ ...btn, background: videoPath && !importing ? "#0d9488" : "#e5e7eb", color: videoPath && !importing ? "#fff" : "#9ca3af", border: "none", borderRadius: 6, flex: 1 }}
          onClick={runImport}
          disabled={!videoPath || importing}
        >
          {importing ? "导入中…" : "📥 导入为会话"}
        </button>
      </div>
      {videoPath && (
        <p style={{ fontSize: 11, color: "#374151", marginTop: 6, wordBreak: "break-all" }}>
          🎬 {videoPath}
        </p>
      )}
      {progress && (
        <div style={{ fontSize: 11, color: "#374151", marginTop: 6 }}>
          <div>{progress.message}</div>
          {progress.total > 1 && (
            <div
              style={{
                marginTop: 4,
                height: 6,
                background: "#f3f4f6",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  background: "#0d9488",
                  transition: "width 0.2s",
                }}
              />
            </div>
          )}
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: "#dc2626", margin: "6px 0 0", wordBreak: "break-all" }}>{error}</p>}
      {sessionId && (
        <p style={{ fontSize: 11, color: "#2563eb", margin: "6px 0 0" }}>
          ✅ 已导入会话 #{sessionId}，可到「会话」页查看时间轴
          {/* v0.11.7：完成直达（与图文采集面板共用交互） */}
          {onOpenSessions && (
            <button
              onClick={() => onOpenSessions(sessionId)}
              style={{ marginLeft: 8, fontSize: 11, border: "1px solid #2563eb", borderRadius: 4, background: "#fff", color: "#2563eb", cursor: "pointer", padding: "2px 8px" }}
            >
              去会话页
            </button>
          )}
        </p>
      )}
    </div>
  );
}
