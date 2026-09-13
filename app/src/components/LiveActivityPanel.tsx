/**
 * LiveActivityPanel — 实时活动面板（采集期间右侧核心反馈，简要设计）。
 *
 * @ai-context: 用户要求"转写流要简要"——设计原则：单行紧凑卡片、色点区分来源
 *              （字幕=绿、语音=灰、画面=蓝）、无冗余装饰；列表超限截断（计数保留）；
 *              新内容自动跟随滚动。
 * @ai-context: 2026-08 用户需求：ASR 流式返回显示**所有未沉淀行**——识别中的
 *              partial 按句读切分为多行灰斜体全部显示（不再一行越滚越长）；
 *              已定稿待沉淀 committed 行黑色并存（连续定稿不互相覆盖丢失）；
 *              新句首个 partial 到达时统一沉淀入列表。
 * @ai-context: 状态机：初始化（模型加载）→ 采集中 → 停止中 → 融合中 → 完成/失败，
 *              由 live:status / session:fusing/fused/failed 事件推导，父组件控制显隐。
 * @ai-context: 批 7 T6（C9.16 的 7a 半）：按豁免表 `:38` 的拆法把转录流与 OCR 预览整段搬至
 *              `LiveTranscriptStream.tsx` / `LiveOcrPreview.tsx`（**纯搬迁、零行为变化**）；
 *              本件只留状态机 + 统计行 + 采集信息条 + 档案条 + Tab 栏与两件的装配。
 *              两个子件**常驻挂载**（列表状态与事件订阅在子件内）⇒ 切 Tab 不丢行。
 *              「逐段显影」动效属 7b/T20，本件不含任何动效。
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
// v0.9.0 验收缺陷修复：采集态档案条（形态×画面档×领域 + 升降档提示/确认）
import LiveProfileStrip from "./LiveProfileStrip";
import type { LiveSessionStatus, SessionInfo } from "../types";
// 批 2b：暂停展示单一来源（context 注入 pausedReason + 三态文案，防双轨）
import { useCaptureControl } from "../hooks/useLiveCaptureControl";
import { pauseReasonLabel } from "../hooks/liveCaptureState";
// 批 7 T6：转录流 / OCR 预览两件（各自持有列表状态与事件订阅）
import LiveTranscriptStream from "./LiveTranscriptStream";
import LiveOcrPreview from "./LiveOcrPreview";

/** 内存保留上限（计数独立累加，截断只影响可显示的历史；注入给两个子件，保持单一份口径） */
const MAX_KEPT = 100;

let seq = 0;
const nextId = () => ++seq;

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 时长展示（秒 → h:mm:ss / m:ss；v0.7.2 信息面板用） */
function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default function LiveActivityPanel({ sessionId, windowTitle }: { sessionId?: number | null; windowTitle?: string | null }) {
  // 批 2b：暂停展示单一来源（CaptureStatusProvider context，主窗单实例）——
  // 本面板不再自订阅 live:paused/resumed（详情流只管内容阶段，防双轨漂移）
  const capture = useCaptureControl();
  const [tab, setTab] = useState<"transcript" | "ocr">("transcript");
  // 状态机（简要徽标文本；内容阶段——暂停文案由 pausedReason 覆盖展示）
  const [phase, setPhase] = useState<string>("正在初始化…");
  // 累计计数（列表截断后仍保留）
  const countsRef = useRef({ subtitle: 0, asr: 0, ocr: 0 });
  const [counts, setCounts] = useState({ subtitle: 0, asr: 0, ocr: 0 });
  const startedAtRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  // v0.7.2（REQ-151）：采集信息面板（平台/时长/合集——live:session-info 事件）
  const [info, setInfo] = useState<SessionInfo | null>(null);

  /** 计数累加入口（两个子件的回调；ref 为真源 ⇒ 与列表更新同批，无 updater 副作用） */
  const bump = (kind: "subtitle" | "asr" | "ocr") => {
    countsRef.current[kind] += 1;
    setCounts({ ...countsRef.current });
  };
  /** 计时起点（首个 recording 到达时；`??` 幂等，重复事件不重置） */
  const markStarted = () => {
    startedAtRef.current = startedAtRef.current ?? Date.now();
  };

  // 会话切换：清空旧会话信息 + 拉取兜底（live:session-info 事件在引擎就绪时
  // 发出，可能早于本面板挂载/监听注册——invoke 拉取保证信息条始终可见；
  // 拉取失败静默：无活动会话等场景语义正确）
  // 2026-08 修复（状态不一致）：live:status recording 只发一次——页面刷新/重进
  // 课堂助手后本面板挂载晚于事件，phase 永远停在"正在初始化…"，而左侧已由
  // live_session_status 拉取显示"采集中"；挂载时拉取一次按 active 还原状态机
  // （暂停态还原归 CaptureStatusProvider 快照——批 2b 职责边界）
  useEffect(() => {
    setInfo(null);
    if (!sessionId) return;
    void invoke<SessionInfo>("live_session_info")
      .then(setInfo)
      .catch(() => undefined);
    void invoke<LiveSessionStatus>("live_session_status")
      .then((s) => {
        if (s.active) {
          setPhase("● 采集中");
          startedAtRef.current = startedAtRef.current ?? Date.now();
        }
      })
      .catch(() => undefined);
  }, [sessionId]);

  // 时长计时（1s tick，仅展示）
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      // v0.7.2（REQ-151）：采集信息（平台/时长/合集——标题信号 + 播放器 OCR）
      listen<SessionInfo>("live:session-info", (e) => setInfo(e.payload)),
      // 批 2b：live:paused/resumed 不再由本面板订阅——暂停为采集控制状态，
      // 单一来源 CaptureStatusProvider；暂停文案由 pausedReason 覆盖（见状态行）
      listen<number>("session:fusing", () => setPhase("⏳ 融合中…")),
      listen<number>("session:fused", () => setPhase("✅ 融合完成")),
      listen<string>("session:fusion-failed", (e) => setPhase(`⚠ 融合失败（原始段保留）: ${e.payload}`)),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
  // 暂停期间展示 reason 文案（三态短文案同徽标/浮窗）；否则为内容流阶段文案
  const statusText = capture.pausedReason ? pauseReasonLabel(capture.pausedReason) ?? phase : phase;
  const phaseColor = phase.startsWith("●") ? "#dc2626" : phase.startsWith("⏳") ? "#b45309" : phase.startsWith("⚠") ? "#dc2626" : "#374151";
  const statusColor = capture.pausedReason ? "#b45309" : phaseColor;

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
        <span style={{ fontWeight: 600, color: statusColor }}>{statusText}</span>
        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtTime(elapsedMs)}</span>
        <span style={{ color: "#0d9488" }}>字幕 {counts.subtitle}</span>
        <span style={{ color: "#6b7280" }}>语音 {counts.asr}</span>
        <span style={{ color: "#2563eb" }}>画面 {counts.ocr}</span>
      </div>

      {/* v0.7.2（REQ-151）：采集信息条（平台/时长/合集/字幕——信息透明化；
          数据源：标题信号 + 播放器 OCR + 字幕检测计数。
          修复（2026-08 用户反馈）：**采集态常显**——此前"有信息才显示"导致
          本地窗口/无平台后缀/无合集/OCR 未出结果时整条隐藏（右侧空白）；
          未知项用占位文案（诚实标注，不假装），信息条始终占用该区域 */}
      {info && (
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            padding: "6px 14px",
            borderBottom: "1px solid #e5e7eb",
            fontSize: 11,
            color: "#6b7280",
            alignItems: "center",
          }}
        >
          <span title="窗口标题后缀识别（本地）">
            🎬 {info.platform ?? "未知平台"}
          </span>
          <span title="播放器画面识别（OCR，约 10s 出结果）">
            ⏱ 时长 {info.durationSecs != null ? fmtDur(info.durationSecs) : "识别中…"}
          </span>
          <span title="合集（标题序列号识别 + 播放器 OCR）">
            📚{" "}
            {info.series
              ? `${info.series}${info.episode != null ? ` 第${info.episode}集` : ""}${
                  info.totalEpisodes != null ? ` / 共${info.totalEpisodes}集` : ""
                }`
              : "非合集/未识别"}
          </span>
          <span title={counts.subtitle > 0 ? "实时字幕检测命中" : "尚未检测到内嵌/滚动字幕"}>
            {counts.subtitle > 0 ? "💬 字幕：检测到（内嵌/滚动）" : "💬 字幕：未检测到"}
          </span>
        </div>
      )}

      {/* v0.9.0 验收缺陷修复：采集态档案条（形态×画面档×领域常显 + 升降档提示/降档确认） */}
      <LiveProfileStrip windowTitle={windowTitle ?? null} />

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
        {/* 批 7 T6：两件常驻挂载（各自按 `active` 自隐，切 Tab 不丢行） */}
        <LiveTranscriptStream
          active={tab === "transcript"}
          sessionId={sessionId}
          counts={counts}
          onBump={bump}
          onPhase={setPhase}
          onStarted={markStarted}
          elapsedMs={elapsedMs}
          fmtTime={fmtTime}
          nextId={nextId}
          maxKept={MAX_KEPT}
        />
        <LiveOcrPreview
          active={tab === "ocr"}
          counts={counts}
          onBump={bump}
          fmtTime={fmtTime}
          nextId={nextId}
          maxKept={MAX_KEPT}
        />
      </div>
    </div>
  );
}
