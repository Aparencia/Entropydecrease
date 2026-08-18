/**
 * LiveActivityPanel — 实时活动面板（采集期间右侧核心反馈，简要设计）。
 *
 * @ai-context: 用户要求"转写流要简要"——设计原则：单行紧凑卡片、色点区分来源
 *              （字幕=绿、语音=灰、画面=蓝）、无冗余装饰；partial 仅显示当前行；
 *              列表超限截断（计数保留）；新内容自动跟随滚动。
 * @ai-context: 状态机：初始化（模型加载）→ 采集中 → 停止中 → 融合中 → 完成/失败，
 *              由 live:status / session:fusing/fused/failed 事件推导，父组件控制显隐。
 */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AsrFinalEvent, OcrEvent, SubtitleEvent } from "../types";

/** 定稿转写行（字幕或语音） */
interface TranscriptLine {
  id: number;
  time: number; // 会话相对毫秒（前端按事件到达估算，展示 mm:ss）
  source: "subtitle" | "asr";
  text: string;
}

/**
 * 识别中行（M3/REQ-038 流式先行 + 静默修正）：
 * committed=false = partial 上屏（灰色斜体"识别中"）；
 * committed=true = SenseVoice 重打分定稿（原位转黑，无闪烁无跳动）。
 */
interface PartialLine {
  text: string;
  committed: boolean;
}

/** 画面要点行 */
interface OcrLine {
  id: number;
  time: number;
  text: string;
}

/** 显示条数（简要：只显示最近几条，总数在状态行计数） */
const SHOW_TRANSCRIPT_LINES = 6;
const SHOW_OCR_LINES = 4;
/** 内存保留上限（计数独立累加，截断只影响可显示的历史） */
const MAX_KEPT = 100;

let seq = 0;
const nextId = () => ++seq;

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function LiveActivityPanel() {
  const [tab, setTab] = useState<"transcript" | "ocr">("transcript");
  // 状态机（简要徽标文本）
  const [phase, setPhase] = useState<string>("正在初始化…");
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [partial, setPartial] = useState<PartialLine | null>(null);
  const [ocrLines, setOcrLines] = useState<OcrLine[]>([]);
  // 累计计数（列表截断后仍保留）
  const countsRef = useRef({ subtitle: 0, asr: 0, ocr: 0 });
  const [counts, setCounts] = useState({ subtitle: 0, asr: 0, ocr: 0 });
  const startedAtRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  // TD-053 修复：partial 以 ref 镜像（事件回调读最新值），沉淀副作用移出 setState updater
  const partialRef = useRef<PartialLine | null>(null);
  const lastFinalTimeRef = useRef(0);

  // 时长计时（1s tick，仅展示）
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // M3/REQ-038 沉淀：已定稿（committed）的识别中行并入定稿列表（计数+时间戳）。
    // 纯追加（不读旧列表、无副作用），StrictMode 双调用安全（幂等由调用方保证只调一次）
    const settleAsrLine = (text: string, time: number) => {
      setTranscripts((prev) => {
        const next = [...prev, { id: nextId(), time, source: "asr" as const, text }];
        return next.length > MAX_KEPT ? next.slice(next.length - MAX_KEPT) : next;
      });
      countsRef.current.asr += 1;
      setCounts({ ...countsRef.current });
    };
    // 事件回调统一入口：更新 partial 状态并同步 ref 镜像（TD-053：副作用在回调，
    // 不在 updater——StrictMode 双调用不再导致计数双加/ID 跳号）
    const applyPartial = (next: PartialLine | null) => {
      partialRef.current = next;
      setPartial(next);
    };

    const unlisteners: Promise<() => void>[] = [
      // 状态机：live:status 的 recording 由 ClassroomPage 判定显示时机，此处只映射文案
      listen<string>("live:status", (e) => {
        if (e.payload === "recording") {
          setPhase("● 采集中");
          startedAtRef.current = startedAtRef.current ?? Date.now();
        } else if (e.payload === "stopped") {
          // 停止：把已定稿未沉淀的行并入列表（防末句丢失，T2 语义）
          const prev = partialRef.current;
          if (prev?.committed && prev.text.trim()) {
            settleAsrLine(prev.text, lastFinalTimeRef.current);
          }
          applyPartial(null);
          setPhase("⏹ 已停止");
        } else if (e.payload === "failed") {
          setPhase("⚠ 采集异常");
        }
      }),
      listen<string>("live:asr-partial", (e) => {
        // 新 partial 到来：若上一行已定稿未沉淀 → 先沉淀再显示新识别行
        const prev = partialRef.current;
        if (prev?.committed && prev.text.trim()) {
          settleAsrLine(prev.text, lastFinalTimeRef.current);
        }
        applyPartial({ text: e.payload, committed: false });
      }),
      listen<AsrFinalEvent>("live:asr-final", (e) => {
        lastFinalTimeRef.current = e.payload.timestampMs;
        // M3/REQ-038 静默修正：partial 行原位灰→黑（无闪烁无跳动）；
        // 无 partial（快速断句）时直接沉淀为定稿行
        const prev = partialRef.current;
        if (prev && prev.text.trim()) {
          applyPartial({ text: e.payload.text, committed: true });
        } else {
          settleAsrLine(e.payload.text, e.payload.timestampMs);
          applyPartial(null);
        }
      }),
      listen<SubtitleEvent>("live:subtitle", (e) => {
        setTranscripts((prev) => {
          // TD-043：时间戳取后端会话纪元（start_ms = 字幕首样本时刻）
          const next = [
            ...prev,
            { id: nextId(), time: e.payload.timestampMs, source: "subtitle" as const, text: e.payload.text },
          ];
          return next.length > MAX_KEPT ? next.slice(next.length - MAX_KEPT) : next;
        });
        countsRef.current.subtitle += 1;
        setCounts({ ...countsRef.current });
      }),
      listen<OcrEvent>("live:ocr", (e) => {
        setOcrLines((prev) => {
          // TD-043：时间戳取后端会话纪元
          const next = [...prev, { id: nextId(), time: e.payload.timestampMs, text: e.payload.text }];
          return next.length > MAX_KEPT ? next.slice(next.length - MAX_KEPT) : next;
        });
        countsRef.current.ocr += 1;
        setCounts({ ...countsRef.current });
      }),
      listen<number>("session:fusing", () => setPhase("⏳ 融合中…")),
      listen<number>("session:fused", () => setPhase("✅ 融合完成")),
      listen<string>("session:fusion-failed", (e) => setPhase(`⚠ 融合失败（原始段保留）: ${e.payload}`)),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
  const phaseColor = phase.startsWith("●") ? "#dc2626" : phase.startsWith("⏳") ? "#b45309" : phase.startsWith("⚠") ? "#dc2626" : "#374151";
  // 简要显示：只渲染最近几条（总数在状态行）
  const shownTranscripts = transcripts.slice(-SHOW_TRANSCRIPT_LINES);
  const shownOcr = ocrLines.slice(-SHOW_OCR_LINES);
  const totalTranscript = counts.subtitle + counts.asr;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* 状态机 + 统计（一行简要） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderBottom: "1px solid #e5e7eb",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: phaseColor }}>{phase}</span>
        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtTime(elapsedMs)}</span>
        <span style={{ color: "#0d9488" }}>字幕 {counts.subtitle}</span>
        <span style={{ color: "#6b7280" }}>语音 {counts.asr}</span>
        <span style={{ color: "#2563eb" }}>画面 {counts.ocr}</span>
      </div>

      {/* Tab 切换（简要两栏） */}
      <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", flexShrink: 0 }}>
        {(
          [
            ["transcript", "实时转写"],
            ["ocr", "画面要点"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              cursor: "pointer",
              border: "none",
              borderRadius: 6,
              background: tab === key ? "#0d9488" : "#f3f4f6",
              color: tab === key ? "#fff" : "#4b5563",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容流（简要：仅最近几条，无滚动） */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 14px 14px" }}>
        {tab === "transcript" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {shownTranscripts.length === 0 && !partial && (
              <p style={{ fontSize: 12, color: "#9ca3af" }}>等待识别…（说话或屏幕出现字幕时显示）</p>
            )}
            {shownTranscripts.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ fontSize: 11, color: "#9ca3af", width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {fmtTime(t.time)}
                </span>
                <span
                  title={t.source === "subtitle" ? "字幕" : "语音"}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    flexShrink: 0,
                    alignSelf: "center",
                    background: t.source === "subtitle" ? "#0d9488" : "#9ca3af",
                  }}
                />
                <span style={{ color: t.source === "subtitle" ? "#0f766e" : "#374151" }}>{t.text}</span>
              </div>
            ))}
            {totalTranscript > SHOW_TRANSCRIPT_LINES && (
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0", paddingLeft: 52 }}>
                ⋯ 共 {totalTranscript} 段，仅显示最近 {SHOW_TRANSCRIPT_LINES} 条（会话页可看全部）
              </p>
            )}
            {partial && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  fontSize: 13,
                  color: partial.committed ? "#374151" : "#9ca3af",
                  fontStyle: partial.committed ? "normal" : "italic",
                }}
              >
                <span style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtTime(elapsedMs)}</span>
                <span
                  title={partial.committed ? "已定稿" : "识别中"}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    flexShrink: 0,
                    alignSelf: "center",
                    background: partial.committed ? "#9ca3af" : "#d1d5db",
                  }}
                />
                <span>{partial.text}{partial.committed ? "" : "…"}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {shownOcr.length === 0 && (
              <p style={{ fontSize: 12, color: "#9ca3af" }}>等待画面识别…（屏幕出现文字/板书时显示）</p>
            )}
            {shownOcr.map((o) => (
              <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ fontSize: 11, color: "#9ca3af", width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {fmtTime(o.time)}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, alignSelf: "center", background: "#2563eb" }} />
                <span style={{ color: "#1e40af" }}>{o.text}</span>
              </div>
            ))}
            {counts.ocr > SHOW_OCR_LINES && (
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0", paddingLeft: 52 }}>
                ⋯ 共 {counts.ocr} 条，仅显示最近 {SHOW_OCR_LINES} 条（会话页可看全部）
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
