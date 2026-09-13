/**
 * LiveOcrPreview — 画面要点预览（采集期「画面要点」Tab 的内容区；批 7 T6 自
 * `LiveActivityPanel.tsx` 纯搬迁而出，豁免表 `:38` 指定的拆法；**零行为变化**）。
 *
 * @ai-context: **常驻挂载**（父件无条件渲染本件，靠 `active` 自隐）：切到「实时转写」Tab 时
 *              `live:ocr` 仍继续收屏 —— 与拆件前「列表状态住在父件」的行为逐字等价；
 *              「同屏块合并为一行屏摘要 + 超限截断」的规则整段搬自拆前实现。
 * @ai-context: 注入面：`counts`/`onBump`（状态行计数同源）、`fmtTime`/`nextId`/`maxKept`
 *              （父件持单一份实现，防拆件后两套口径）。逐段显影动效属 7b/T20。
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OcrEvent } from "../types";
import { Text } from "../ui/primitives";

/** 画面要点行（v0.7.3 REQ-161：一行=一屏摘要——同屏块合并显示） */
interface OcrLine {
  id: number;
  time: number;
  /** 屏号（同屏事件合并为一行） */
  screenId: number;
  text: string;
}

/** 显示条数（简要：只显示最近几条，总数在状态行计数） */
const SHOW_OCR_LINES = 4;

export default function LiveOcrPreview({ active, counts, onBump, fmtTime, nextId, maxKept }: {
  active: boolean;
  counts: { subtitle: number; asr: number; ocr: number };
  onBump: (kind: "ocr") => void;
  fmtTime: (ms: number) => string;
  nextId: () => number;
  maxKept: number;
}) {
  const [ocrLines, setOcrLines] = useState<OcrLine[]>([]);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
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
          return next.length > maxKept ? next.slice(next.length - maxKept) : next;
        });
        onBump("ocr");
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  // 简要显示：只渲染最近几条（总数在状态行）
  const shownOcr = ocrLines.slice(-SHOW_OCR_LINES);

  if (!active) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {shownOcr.length === 0 && (
        <Text as="p" size={5} tone="ink-3">等待画面识别…（屏幕出现文字/板书时显示）</Text>
      )}
      {shownOcr.map((o) => (
        <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: 1.6 }}>
          <Text tone="ink-3" style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {fmtTime(o.time)}
          </Text>
          <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0, fontWeight: 600 }}>
            屏{o.screenId}
          </span>
          <span style={{ color: "#1e40af" }}>{o.text}</span>
        </div>
      ))}
      {counts.ocr > SHOW_OCR_LINES && (
        <Text as="p" tone="ink-3" style={{ fontSize: 11, margin: "4px 0 0", paddingLeft: 52 }}>
          ⋯ 共 {counts.ocr} 块 / {ocrLines.length} 屏，仅显示最近 {SHOW_OCR_LINES} 屏（会话页可看全部）
        </Text>
      )}
    </div>
  );
}
