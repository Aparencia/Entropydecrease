/**
 * SpeakerSwitchCard — 讲者切换卡片（v0.7.2 REQ-153：弱化版说话人分离展示）。
 *
 * @ai-context: 会话详情打开时懒加载 analyze_session_speakers（后端幂等：
 *              已分析直接返回）；三态展示——未启用（模型缺失，可一键下载）、
 *              已分析无切换（单人口播/未检测到）、已分析有切换（N 处 +
 *              时间点列表，置信度标注）。诚实降级：模型缺失不报错不占位。
 * @ai-context: TD-2026-08-20-D 清偿（G1）：未启用态新增「下载说话人模型」按钮
 *              （download_speaker_model 命令 + speaker-model:download-* 事件
 *              进度展示；下载完成自动重分析）。mock 事件载荷为
 *              { file, downloadedBytes, totalBytes }。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SpeakerAnalysisResult } from "../types";
import { fmtMs } from "../utils/fmt";

interface DownloadProgress {
  file: string;
  downloadedBytes: number;
  totalBytes: number;
}

export default function SpeakerSwitchCard({ sessionId }: { sessionId: number }) {
  // null=加载中；未启用（模型缺失）时 result.enabled=false
  const [result, setResult] = useState<SpeakerAnalysisResult | null>(null);
  const [error, setError] = useState("");
  // TD-2026-08-20-D：下载状态（null=未下载中）
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const analyze = useCallback(
    (cancelled: { current: boolean }) => {
      setResult(null);
      setError("");
      void invoke<SpeakerAnalysisResult>("analyze_session_speakers", { sessionId })
        .then((r) => {
          if (!cancelled.current) setResult(r);
        })
        .catch((e) => {
          if (!cancelled.current) setError(`讲者分析失败: ${e}`);
        });
    },
    [sessionId],
  );

  useEffect(() => {
    const cancelled = { current: false };
    analyze(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [analyze]);

  // TD-2026-08-20-D：下载进度/完成/失败事件
  useEffect(() => {
    const unlisten = Promise.all([
      listen<DownloadProgress>("speaker-model:download-progress", (e) => {
        setProgress(e.payload);
        setDownloading(true);
      }),
      listen("speaker-model:download-done", () => {
        setDownloading(false);
        setProgress(null);
        // 下载完成 → 自动重分析（模型已就位）
        analyze({ current: false });
      }),
      listen<string>("speaker-model:download-failed", (e) => {
        setDownloading(false);
        setProgress(null);
        setError(`说话人模型下载失败: ${e.payload}`);
      }),
    ]);
    return () => {
      void unlisten.then((fns) => fns.forEach((fn) => fn()));
    };
  }, [analyze]);

  const downloadModel = async () => {
    setError("");
    setDownloading(true);
    try {
      await invoke("download_speaker_model");
    } catch (e) {
      setDownloading(false);
      setError(`下载启动失败: ${e}`);
    }
  };

  if (error) {
    return (
      <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>
        👥 讲者分析不可用：{error}
      </div>
    );
  }
  if (!result) {
    return (
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>👥 讲者分析中…</div>
    );
  }
  if (!result.enabled) {
    return (
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
        <div>
          👥 讲者分离未启用（缺少说话人模型——wespeaker，约 20-70MB，可一键下载）
        </div>
        {downloading ? (
          <div style={{ marginTop: 4, fontSize: 11, color: "#0f766e" }}>
            ⬇ 下载中…{" "}
            {progress && progress.totalBytes > 0
              ? `${((progress.downloadedBytes / progress.totalBytes) * 100).toFixed(0)}%`
              : "连接中…"}
          </div>
        ) : (
          <button
            onClick={() => void downloadModel()}
            style={{
              marginTop: 4,
              fontSize: 11,
              border: "1px solid #0d9488",
              borderRadius: 6,
              background: "#f0fdfa",
              color: "#0f766e",
              cursor: "pointer",
              padding: "3px 10px",
            }}
            title="下载 wespeaker 说话人模型（GitHub/hf-mirror 双镜像）"
          >
            ⬇ 下载说话人模型
          </button>
        )}
      </div>
    );
  }
  if (result.changes.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
        👥 讲者切换：未检测到（单人讲解或音色变化未达阈值）
      </div>
    );
  }
  return (
    <details style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
      <summary style={{ cursor: "pointer" }}>
        👥 讲者切换 {result.changes.length} 处（弱化版：仅标切换点，不识别身份）
      </summary>
      {result.changes.map((c, i) => (
        <div key={`${c.timeMs}-${i}`} style={{ marginTop: 3 }}>
          [{fmtMs(c.timeMs)}] 换人（置信度 {c.confidence.toFixed(2)}）
        </div>
      ))}
    </details>
  );
}
