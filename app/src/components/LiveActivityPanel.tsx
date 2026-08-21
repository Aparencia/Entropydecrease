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
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
// 2026-08 用户需求：实时转写中显示图片数据（转写 Tab 顶部"最近画面"条，独立区域不跳动）
import LiveImageStrip from "./LiveImageStrip";
// v0.9.0 验收缺陷修复：采集态档案条（形态×画面档×领域 + 升降档提示/确认）
import LiveProfileStrip from "./LiveProfileStrip";
import type { AsrFinalEvent, LiveSessionStatus, OcrEvent, SessionInfo, SubtitleEvent } from "../types";

/** 定稿转写行（字幕或语音） */
interface TranscriptLine {
  id: number;
  time: number; // 会话相对毫秒（前端按事件到达估算，展示 mm:ss）
  source: "subtitle" | "asr";
  text: string;
}

/**
 * 识别中行（M3/REQ-038 流式先行 + 静默修正；2026-08 扩展为多行挂起）：
 * committed=false = partial 上屏（灰色斜体"识别中"，同句流式更新原位替换）；
 * committed=true = SenseVoice 重打分定稿（原位转黑，待新句开始统一沉淀入列表）。
 * id=句子序：同句 partial→final 复用同一 id（保证 React key 稳定不跳动）。
 */
interface PendingLine {
  id: number;
  /** 定稿时刻（会话纪元 ms；未定稿阶段 0——展示用实时时钟） */
  time: number;
  text: string;
  committed: boolean;
}

/** 画面要点行（v0.7.3 REQ-161：一行=一屏摘要——同屏块合并显示） */
interface OcrLine {
  id: number;
  time: number;
  /** 屏号（同屏事件合并为一行） */
  screenId: number;
  text: string;
}

/** 显示条数（简要：只显示最近几条，总数在状态行计数） */
const SHOW_TRANSCRIPT_LINES = 6;
const SHOW_OCR_LINES = 4;
/** 内存保留上限（计数独立累加，截断只影响可显示的历史） */
const MAX_KEPT = 100;
/** 未沉淀行显示上限（防御极端连续定稿；超限先沉淀已定稿行） */
const MAX_PENDING_LINES = 8;

let seq = 0;
const nextId = () => ++seq;
/** 句子序（未沉淀行 id；跨会话单调递增即可，不重置） */
let pendingSeq = 0;
const nextPendingId = () => ++pendingSeq;

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

/**
 * 中文句读切分（识别中行展示用，2026-08 用户需求：识别中的灰斜体内容全部显示）。
 *
 * @ai-context: 流式 partial 是整句候选且可能含多个句子（zipformer 中文模型输出
 *              带句读；asr_clean 的跨标点重复/纯标点幻觉处理即依赖此事实）——
 *              现状整句挤在一行灰斜里越滚越长；按句读切分后每句一行，全部可见。
 *              句读保留在句尾；无句读尾段为"残余"（调用方加 … 表示仍在识别）。
 *              不切英文句点（Mr./U.S. 缩写防误切）与逗号（句内成分不拆行）。
 *              连续句读（"结束。。"）切出的纯标点段过滤（防垃圾行）。
 */
function splitBySentence(text: string): string[] {
  const parts: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if ("。！？!?…".includes(ch)) {
      if (hasText(buf)) parts.push(buf);
      buf = "";
    }
  }
  if (hasText(buf)) parts.push(buf);
  return parts;
}

/** 段是否含实质内容（过滤纯标点/空白段——连续句读切出的垃圾段不展示） */
function hasText(seg: string): boolean {
  return seg.trim().length > 0 && !/^[。！？!?…\s]+$/.test(seg);
}

export default function LiveActivityPanel({ sessionId, windowTitle }: { sessionId?: number | null; windowTitle?: string | null }) {
  const [tab, setTab] = useState<"transcript" | "ocr">("transcript");
  // 状态机（简要徽标文本）
  const [phase, setPhase] = useState<string>("正在初始化…");
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  // 未沉淀行列表（识别中 partial + 已定稿待沉淀 committed；2026-08 多行挂起）
  const [partials, setPartials] = useState<PendingLine[]>([]);
  const [ocrLines, setOcrLines] = useState<OcrLine[]>([]);
  // 累计计数（列表截断后仍保留）
  const countsRef = useRef({ subtitle: 0, asr: 0, ocr: 0 });
  const [counts, setCounts] = useState({ subtitle: 0, asr: 0, ocr: 0 });
  const startedAtRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  // TD-053 修复：partials 以 ref 镜像（事件回调读最新值），沉淀副作用移出 setState updater
  const partialsRef = useRef<PendingLine[]>([]);
  // v0.7.2（REQ-151）：采集信息面板（平台/时长/合集——live:session-info 事件）
  const [info, setInfo] = useState<SessionInfo | null>(null);

  // 会话切换：清空旧会话信息 + 拉取兜底（live:session-info 事件在引擎就绪时
  // 发出，可能早于本面板挂载/监听注册——invoke 拉取保证信息条始终可见；
  // 拉取失败静默：无活动会话等场景语义正确）
  // 2026-08 修复（状态不一致）：live:status recording / live:paused 事件只发
  // 一次——页面刷新/重进课堂助手后本面板挂载晚于事件，phase 永远停在
  // "正在初始化…"，而左侧已由 live_session_status 拉取显示"采集中"；
  // 挂载时拉取一次按 active/paused 还原状态机（事件仍为增量更新通道）
  useEffect(() => {
    setInfo(null);
    if (!sessionId) return;
    void invoke<SessionInfo>("live_session_info")
      .then(setInfo)
      .catch(() => undefined);
    void invoke<LiveSessionStatus>("live_session_status")
      .then((s) => {
        if (s.active) {
          setPhase(s.paused ? "⏸ 已暂停（时间轴冻结）" : "● 采集中");
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
    // 事件回调统一入口：更新未沉淀行列表并同步 ref 镜像（TD-053：副作用在回调，
    // 不在 updater——StrictMode 双调用不再导致计数双加/ID 跳号）
    const applyPartials = (next: PendingLine[]) => {
      let list = next;
      // 防御极端连续定稿：超上限先沉淀已定稿行（剩余通常 ≤1 条识别中行）
      if (list.length > MAX_PENDING_LINES) {
        list = settleCommitted(list);
      }
      partialsRef.current = list;
      setPartials(list);
    };
    /** 沉淀全部已定稿行入转写列表（按各自定稿时刻），返回剩余未定稿行 */
    const settleCommitted = (list: PendingLine[]): PendingLine[] => {
      for (const line of list) {
        if (line.committed && line.text.trim()) {
          settleAsrLine(line.text, line.time);
        }
      }
      return list.filter((l) => !l.committed);
    };

    const unlisteners: Promise<() => void>[] = [
      // 状态机：live:status 的 recording 由 ClassroomPage 判定显示时机，此处只映射文案
      listen<string>("live:status", (e) => {
        if (e.payload === "recording") {
          setPhase("● 采集中");
          startedAtRef.current = startedAtRef.current ?? Date.now();
        } else if (e.payload === "stopped") {
          // 停止：全部已定稿行沉淀入列表（防末句丢失，T2 语义）；识别中残余清空
          applyPartials(settleCommitted(partialsRef.current));
          setPhase("⏹ 已停止");
        } else if (e.payload === "failed") {
          setPhase("⚠ 采集异常");
        }
      }),
      listen<string>("live:asr-partial", (e) => {
        // 流式更新分两种：同句（末行未定稿 → 原位替换文本）；新句（末行已定稿或
        // 无行 → 先沉淀全部已定稿行，再开新行）。后端单流保证：final 之后的
        // partial 必属新句（端点已重建流）——无需显式句 id 协议
        const list = partialsRef.current;
        const last = list[list.length - 1];
        if (last && !last.committed) {
          applyPartials([...list.slice(0, -1), { ...last, text: e.payload }]);
        } else {
          applyPartials([
            ...settleCommitted(list),
            { id: nextPendingId(), time: 0, text: e.payload, committed: false },
          ]);
        }
      }),
      listen<AsrFinalEvent>("live:asr-final", (e) => {
        // M3/REQ-038 静默修正：partial 行原位灰→黑（无闪烁无跳动）；
        // 无 partial（快速断句）时直接沉淀为定稿行；
        // 连续定稿（上一行已定稿未沉淀）→ 新行追加——修复原实现互相覆盖丢失
        const list = partialsRef.current;
        const last = list[list.length - 1];
        if (last && !last.committed) {
          applyPartials([
            ...list.slice(0, -1),
            { ...last, text: e.payload.text, time: e.payload.timestampMs, committed: true },
          ]);
        } else if (last) {
          applyPartials([
            ...list,
            { id: nextPendingId(), time: e.payload.timestampMs, text: e.payload.text, committed: true },
          ]);
        } else {
          settleAsrLine(e.payload.text, e.payload.timestampMs);
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
          // TD-043：时间戳取后端会话纪元；v0.7.3（REQ-161）：同屏块合并为
          // 一行屏摘要（首块 + 后续小字块追加，防 175 行碎片刷屏）
          const last = prev[prev.length - 1];
          if (last && last.screenId === e.payload.screenId) {
            const next = [...prev];
            const text =
              last.text.length < 80 ? `${last.text} ${e.payload.text}` : last.text;
            next[next.length - 1] = { ...last, text };
            return next;
          }
          const next = [
            ...prev,
            { id: nextId(), time: e.payload.timestampMs, screenId: e.payload.screenId, text: e.payload.text },
          ];
          return next.length > MAX_KEPT ? next.slice(next.length - MAX_KEPT) : next;
        });
        countsRef.current.ocr += 1;
        setCounts({ ...countsRef.current });
      }),
      // 2026-08 A1：暂停/恢复状态机（硬暂停——时间轴冻结，面板显示暂停态）
      listen("live:paused", () => setPhase("⏸ 已暂停（时间轴冻结）")),
      listen("live:resumed", () => setPhase("● 采集中")),
      // v0.7.2（REQ-151）：采集信息（平台/时长/合集——标题信号 + 播放器 OCR）
      listen<SessionInfo>("live:session-info", (e) => setInfo(e.payload)),
      listen<number>("session:fusing", () => setPhase("⏳ 融合中…")),
      listen<number>("session:fused", () => setPhase("✅ 融合完成")),
      listen<string>("session:fusion-failed", (e) => setPhase(`⚠ 融合失败（原始段保留）: ${e.payload}`)),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
  const phaseColor = phase.startsWith("●") ? "#dc2626" : phase.startsWith("⏸") ? "#b45309" : phase.startsWith("⏳") ? "#b45309" : phase.startsWith("⚠") ? "#dc2626" : "#374151";
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
        {tab === "transcript" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* 2026-08 用户需求：实时图片数据（最近画面条；独立区域，图片更新不引起转写行跳动） */}
            <LiveImageStrip sessionId={sessionId ?? null} />
            {shownTranscripts.length === 0 && partials.length === 0 && (
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
            {/* 2026-08 用户需求：ASR 未沉淀行全部展示——识别中（灰斜）按句读拆多行
                全部显示；已定稿待沉淀（黑）一行；连续定稿各行并存；新句首个
                partial 到达时统一沉淀入上方列表 */}
            {partials.map((p) => {
              if (p.committed) {
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "baseline",
                      fontSize: 13,
                      color: "#374151",
                    }}
                  >
                    <span style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {fmtTime(p.time)}
                    </span>
                    <span
                      title="已定稿待沉淀"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        flexShrink: 0,
                        alignSelf: "center",
                        background: "#9ca3af",
                      }}
                    />
                    <span>{p.text}</span>
                  </div>
                );
              }
              // 识别中：整句候选按句读切分多行灰斜体——"识别中的内容全部显示"；
              // 首行带时间，后续行对齐留空；残余段（无句读尾段）加 … 
              const segs = splitBySentence(p.text);
              return segs.map((seg, i) => (
                <div
                  key={`${p.id}-${i}`}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    fontSize: 13,
                    color: "#9ca3af",
                    fontStyle: "italic",
                  }}
                >
                  <span style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {i === 0 ? fmtTime(elapsedMs) : ""}
                  </span>
                  <span
                    title="识别中"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      flexShrink: 0,
                      alignSelf: "center",
                      background: "#d1d5db",
                    }}
                  />
                  <span>{seg}{i === segs.length - 1 ? "…" : ""}</span>
                </div>
              ));
            })}
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
                <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0, fontWeight: 600 }}>
                  屏{o.screenId}
                </span>
                <span style={{ color: "#1e40af" }}>{o.text}</span>
              </div>
            ))}
            {counts.ocr > SHOW_OCR_LINES && (
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0", paddingLeft: 52 }}>
                ⋯ 共 {counts.ocr} 块 / {ocrLines.length} 屏，仅显示最近 {SHOW_OCR_LINES} 屏（会话页可看全部）
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
