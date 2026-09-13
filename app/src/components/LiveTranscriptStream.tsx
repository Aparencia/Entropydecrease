/**
 * LiveTranscriptStream — 实时转写流（采集期「实时转写」Tab 的内容区；批 7 T6 自
 * `LiveActivityPanel.tsx` 纯搬迁而出，豁免表 `:38` 指定的拆法；**零行为变化**）。
 *
 * @ai-context: **常驻挂载**（父件无条件渲染本件，靠 `active` 自隐）：切到「画面要点」Tab 时
 *              转写行仍继续累积；`live:status` / `asr-partial` / `asr-final` / `subtitle`
 *              四个订阅与「partial 按句读拆行、定稿原位转黑、超限先沉淀」整段搬自拆前实现。
 * @ai-context: 注入面：`counts`/`onBump`（状态行计数同源）、`onPhase`/`onStarted`（`live:status`
 *              的文案与计时起点仍归父件状态机）、`elapsedMs`（父件 1s tick 驱动）、
 *              `fmtTime`/`nextId`/`maxKept`（父件持单一份实现，防拆件后两套口径）。
 */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
// 2026-08 用户需求：实时转写中显示图片数据（转写 Tab 顶部"最近画面"条，独立区域不跳动）
import LiveImageStrip from "./LiveImageStrip";
// 批 7 T20（§C9.19 先拆后改）：**行**渲染拆至 `TranscriptRow.tsx`（DOM 与文案逐字未动）；
// 本件只留状态、四个事件订阅与两处「列表级」文案（空态行 / 共 N 段提示行）。
import { PendingRows, TranscriptRow } from "./TranscriptRow";
import type { PendingLine, TranscriptLine } from "./TranscriptRow";
import type { AsrFinalEvent, SubtitleEvent } from "../types";
import { Text } from "../ui/primitives";

/** 显示条数（简要：只显示最近几条，总数在状态行计数） */
const SHOW_TRANSCRIPT_LINES = 6;
/** 未沉淀行显示上限（防御极端连续定稿；超限先沉淀已定稿行） */
const MAX_PENDING_LINES = 8;

/** 句子序（未沉淀行 id；跨会话单调递增即可，不重置） */
let pendingSeq = 0;
const nextPendingId = () => ++pendingSeq;

export default function LiveTranscriptStream({
  active, sessionId, counts, onBump, onPhase, onStarted, elapsedMs, fmtTime, nextId, maxKept,
}: {
  active: boolean;
  sessionId?: number | null;
  counts: { subtitle: number; asr: number; ocr: number };
  onBump: (kind: "asr" | "subtitle") => void;
  onPhase: (text: string) => void;
  onStarted: () => void;
  elapsedMs: number;
  fmtTime: (ms: number) => string;
  nextId: () => number;
  maxKept: number;
}) {
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  // 未沉淀行列表（识别中 partial + 已定稿待沉淀 committed；2026-08 多行挂起）
  const [partials, setPartials] = useState<PendingLine[]>([]);
  // TD-053 修复：partials 以 ref 镜像（事件回调读最新值），沉淀副作用移出 setState updater
  const partialsRef = useRef<PendingLine[]>([]);

  useEffect(() => {
    // M3/REQ-038 沉淀：已定稿（committed）的识别中行并入定稿列表（计数+时间戳）。
    // 纯追加（不读旧列表、无副作用），StrictMode 双调用安全（幂等由调用方保证只调一次）
    const settleAsrLine = (text: string, time: number) => {
      setTranscripts((prev) => {
        const next = [...prev, { id: nextId(), time, source: "asr" as const, text }];
        return next.length > maxKept ? next.slice(next.length - maxKept) : next;
      });
      onBump("asr");
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
          onPhase("● 采集中");
          onStarted();
        } else if (e.payload === "stopped") {
          // 停止：全部已定稿行沉淀入列表（防末句丢失，T2 语义）；识别中残余清空
          applyPartials(settleCommitted(partialsRef.current));
          onPhase("⏹ 已停止");
        } else if (e.payload === "failed") {
          onPhase("⚠ 采集异常");
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
          return next.length > maxKept ? next.slice(next.length - maxKept) : next;
        });
        onBump("subtitle");
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  // 简要显示：只渲染最近几条（总数在状态行）
  const shownTranscripts = transcripts.slice(-SHOW_TRANSCRIPT_LINES);
  const totalTranscript = counts.subtitle + counts.asr;

  if (!active) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* 2026-08 用户需求：实时图片数据（最近画面条；独立区域，图片更新不引起转写行跳动） */}
      <LiveImageStrip sessionId={sessionId ?? null} />
      {shownTranscripts.length === 0 && partials.length === 0 && (
        <Text as="p" size={5} tone="ink-3">等待识别…（说话或屏幕出现字幕时显示）</Text>
      )}
      {shownTranscripts.map((t) => (
        <TranscriptRow key={t.id} line={t} fmtTime={fmtTime} />
      ))}
      {totalTranscript > SHOW_TRANSCRIPT_LINES && (
        <Text as="p" tone="ink-3" style={{ fontSize: 11, margin: "4px 0 0", paddingLeft: 52 }}>
          ⋯ 共 {totalTranscript} 段，仅显示最近 {SHOW_TRANSCRIPT_LINES} 条（会话页可看全部）
        </Text>
      )}
      <PendingRows partials={partials} fmtTime={fmtTime} elapsedMs={elapsedMs} />
    </div>
  );
}
