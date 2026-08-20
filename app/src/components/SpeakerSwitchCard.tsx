/**
 * SpeakerSwitchCard — 讲者切换卡片（v0.7.2 REQ-153：弱化版说话人分离展示）。
 *
 * @ai-context: 会话详情打开时懒加载 analyze_session_speakers（后端幂等：
 *              已分析直接返回）；三态展示——未启用（模型缺失，提示下载）、
 *              已分析无切换（单人口播/未检测到）、已分析有切换（N 处 +
 *              时间点列表，置信度标注）。诚实降级：模型缺失不报错不占位。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SpeakerAnalysisResult } from "../types";
import { fmtMs } from "../utils/fmt";

export default function SpeakerSwitchCard({ sessionId }: { sessionId: number }) {
  // null=加载中；未启用（模型缺失）时 result.enabled=false
  const [result, setResult] = useState<SpeakerAnalysisResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError("");
    void invoke<SpeakerAnalysisResult>("analyze_session_speakers", { sessionId })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(`讲者分析失败: ${e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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
        👥 讲者分离未启用（缺少说话人模型——运行{" "}
        <code style={{ background: "#f3f4f6", padding: "0 4px", borderRadius: 4 }}>
          scripts/download-speaker-model.ps1
        </code>{" "}
        后重启应用；详见课堂助手使用说明）
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
