/**
 * useLiveSessionEvents — 实时采集事件监听 hook（v0.12.0 M6，采集体验债）。
 *
 * @ai-context: 从 LiveActivityPanel 抽取的事件监听逻辑（partial/final/subtitle/
 *              ocr/status/session-info/fusing）——主面板与采集浮窗共用同一数据流，
 *              避免两份监听各自维护状态导致不一致。返回只读状态（phase/转写/
 *              未沉淀行/计数/画面/时长/会话信息），展示层各自渲染。
 * @ai-context: 状态机：live:status（recording/stopped/failed）→ 文案映射；
 *              挂载时 invoke live_session_info + live_session_status 兜底还原
 *              （事件可能在面板挂载前已发出——页面刷新/重进后 phase 停在初始态）。
 *
 * @line-limit-exemption: 本文件为事件订阅单一来源（订阅 10+ 事件 + 沉淀算法），
 *              登记 docs/standards/line-limit-exemptions.md。
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AsrFinalEvent,
  LiveSessionStatus,
  OcrEvent,
  SessionInfo,
  SubtitleEvent,
} from "../types";

/** 定稿转写行（字幕或语音） */
export interface TranscriptLine {
  id: number;
  time: number;
  source: "subtitle" | "asr";
  text: string;
}

/** 识别中行（committed=false=partial 上屏；committed=true=已定稿待沉淀） */
export interface PendingLine {
  id: number;
  time: number;
  text: string;
  committed: boolean;
}

/** 画面要点行（同一屏块合并为一行） */
export interface OcrLine {
  id: number;
  time: number;
  screenId: number;
  text: string;
}

/** 事件状态（只读，展示层消费） */
export interface LiveEventState {
  phase: string;
  transcripts: TranscriptLine[];
  partials: PendingLine[];
  counts: { subtitle: number; asr: number; ocr: number };
  ocrLines: OcrLine[];
  elapsedMs: number;
  info: SessionInfo | null;
  /** live:status 是否正在采集（recording）——控制类按钮显隐判定 */
  capturing: boolean;
}

/** 内存保留上限（计数独立累加，截断只影响可显示的历史） */
const MAX_KEPT = 100;
/** 未沉淀行显示上限（防御极端连续定稿；超限先沉淀已定稿行） */
const MAX_PENDING_LINES = 8;

let seq = 0;
const nextId = () => ++seq;
let pendingSeq = 0;
const nextPendingId = () => ++pendingSeq;

export function useLiveSessionEvents(sessionId?: number | null): LiveEventState {
  const [phase, setPhase] = useState<string>("正在初始化…");
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [partials, setPartials] = useState<PendingLine[]>([]);
  const [ocrLines, setOcrLines] = useState<OcrLine[]>([]);
  const [counts, setCounts] = useState({ subtitle: 0, asr: 0, ocr: 0 });
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [capturing, setCapturing] = useState(false);
  const countsRef = useRef({ subtitle: 0, asr: 0, ocr: 0 });
  const startedAtRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const partialsRef = useRef<PendingLine[]>([]);

  // 挂载兜底：事件可能在监听注册前已发出——拉取一次还原状态机。
  // 不 gate 于 sessionId：采集浮窗无 React 会话 id，但采集期间必有活动会话，
  // 拉取返回当前活动会话状态（无则 status.active=false，phase 停在初始态）。
  useEffect(() => {
    setInfo(null);
    void invoke<SessionInfo>("live_session_info")
      .then(setInfo)
      .catch(() => undefined);
    void invoke<LiveSessionStatus>("live_session_status")
      .then((s) => {
        if (s.active) {
          setPhase(s.paused ? "⏸ 已暂停（时间轴冻结）" : "● 采集中");
          setCapturing(true);
          startedAtRef.current = startedAtRef.current ?? Date.now();
        }
      })
      .catch(() => undefined);
  }, [sessionId]);

  // 时长计时（1s tick，仅展示）
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const settleAsrLine = (text: string, time: number) => {
      setTranscripts((prev) => {
        const next = [...prev, { id: nextId(), time, source: "asr" as const, text }];
        return next.length > MAX_KEPT ? next.slice(next.length - MAX_KEPT) : next;
      });
      countsRef.current.asr += 1;
      setCounts({ ...countsRef.current });
    };
    const settleCommitted = (list: PendingLine[]): PendingLine[] => {
      for (const line of list) {
        if (line.committed && line.text.trim()) settleAsrLine(line.text, line.time);
      }
      return list.filter((l) => !l.committed);
    };
    const applyPartials = (next: PendingLine[]) => {
      let list = next;
      if (list.length > MAX_PENDING_LINES) list = settleCommitted(list);
      partialsRef.current = list;
      setPartials(list);
    };

    const unlisteners: Promise<() => void>[] = [
      listen<string>("live:status", (e) => {
        if (e.payload === "recording") {
          setPhase("● 采集中");
          setCapturing(true);
          startedAtRef.current = startedAtRef.current ?? Date.now();
        } else if (e.payload === "stopped") {
          applyPartials(settleCommitted(partialsRef.current));
          setPhase("⏹ 已停止");
          setCapturing(false);
        } else if (e.payload === "failed") {
          setPhase("⚠ 采集异常");
          setCapturing(false);
        }
      }),
      listen<string>("live:asr-partial", (e) => {
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
          const last = prev[prev.length - 1];
          if (last && last.screenId === e.payload.screenId) {
            const next = [...prev];
            const text = last.text.length < 80 ? `${last.text} ${e.payload.text}` : last.text;
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
      listen("live:paused", () => setPhase("⏸ 已暂停（时间轴冻结）")),
      listen("live:resumed", () => setPhase("● 采集中")),
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
  return { phase, transcripts, partials, counts, ocrLines, elapsedMs, info, capturing };
}
