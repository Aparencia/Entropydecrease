/**
 * ColumnResizer — 列拖拽手柄（v0.15 全站自适应）。
 *
 * @ai-context: pointer 事件捕获（setPointerCapture → window move/up）——拖出窗口
 *              或丢失 mouseup 仍能结束；方向由调用方决定（side="right" 拖右边
 *              增宽/左边收窄；side="left" 反向——拖左手柄收窄列本身）。纯展示，
 *              增量化经 onResize 上抛（useColumnLayout.resizeBy 夹取 min/max）。
 */
import { useState } from "react";

interface Props {
  /** 手柄所在边的对齐方向（决定拖拽增量的符号） */
  side?: "right" | "left";
  onResize: (delta: number) => void;
  /** 双击恢复默认宽度（调用方负责 resetWidth） */
  onReset?: () => void;
}

export default function ColumnResizer({ side = "right", onResize, onReset }: Props) {
  const [hover, setHover] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* 旧 WebView 无捕获——move 仍走 window */ }
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      onResize(side === "right" ? dx : -dx);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      data-testid="column-resizer"
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={() => onReset?.()}
      title="拖拽调整宽度（双击恢复默认）"
      style={{
        width: 5,
        flexShrink: 0,
        cursor: "col-resize",
        background: hover ? "#0d9488" : "transparent",
        borderLeft: "1px solid #e5e7eb",
        transition: "background 0.15s",
        userSelect: "none",
      }}
    />
  );
}
