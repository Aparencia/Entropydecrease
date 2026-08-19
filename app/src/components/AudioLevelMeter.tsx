/**
 * AudioLevelMeter — 实时音频电平条（VU 表，2026-08 A2）。
 *
 * @ai-context: 监听 live:audio-level 事件（后端每音频块 200ms 推送一次，
 *              rms=0-1 原始 RMS，clipping=削波标志）——采集中"听到课程声音
 *              吗"当场可见（静音/讲话/削波三态可辨；试听自检实时化，C2 收敛）。
 * @ai-context: 12 段条 + 对数映射（RMS 0.01≈-40dB 起步，语音典型 0.05-0.3
 *              落中段）；削波整条标红提示。
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/** 电平段数 */
const SEGMENTS = 12;
/** 削波显示保持时长（ms）：削波后条停留红色提示，不瞬闪 */
const CLIP_HOLD_MS = 800;

interface AudioLevelPayload {
  rms: number;
  clipping: boolean;
}

/** 对数映射 RMS → 段数（-60dB 起步，0dB 满段） */
function segmentsFor(rms: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  const ratio = (db + 60) / 60; // -60dB→0，0dB→1
  return Math.max(0, Math.min(SEGMENTS, Math.round(ratio * SEGMENTS)));
}

export default function AudioLevelMeter() {
  const [segments, setSegments] = useState(0);
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    const unlisten = listen<AudioLevelPayload>("live:audio-level", (e) => {
      setSegments(segmentsFor(e.payload.rms));
      if (e.payload.clipping) {
        setClipping(true);
        // 削波标志保持一段时间（后端每块推送，削波中断后红条不瞬闪）
        window.setTimeout(() => setClipping(false), CLIP_HOLD_MS);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div style={{ margin: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>音频</span>
        <div style={{ flex: 1, display: "flex", gap: 2, height: 10 }}>
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const on = i < segments;
            // 中段绿→黄，末两段红（削波区）
            const color = i >= SEGMENTS - 2 ? "#ef4444" : i >= SEGMENTS - 5 ? "#f59e0b" : "#0d9488";
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderRadius: 2,
                  background: on ? (clipping && i >= SEGMENTS - 2 ? "#ef4444" : color) : "#e5e7eb",
                  transition: "background 80ms linear",
                }}
              />
            );
          })}
        </div>
        {clipping && <span style={{ fontSize: 10, color: "#dc2626", flexShrink: 0 }}>削波!</span>}
      </div>
      <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>
        电平跳动 = 正在采集课程声音（无跳动请检查系统声音/播放器）
      </div>
    </div>
  );
}
