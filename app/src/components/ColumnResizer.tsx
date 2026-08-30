/**
 * ColumnResizer — 列拖拽手柄（v0.15 全站自适应）。
 *
 * @ai-context: pointer 事件捕获（setPointerCapture → 事件全量路由到元素本身，
 *              拖出窗口仍持续；元素卸载即自动停止——无 window 监听残留，审查即修）。
 *              方向由调用方决定（side="right" 拖右边增宽/左边收窄；side="left"
 *              反向——拖左手柄收窄列本身）。纯展示，增量化经 onResize 上抛
 *              （useColumnLayout.resizeBy 夹取 min/max）。
 */
import { useRef, useState } from "react";

interface Props {
  /** 手柄所在边的对齐方向（决定拖拽增量的符号） */
  side?: "right" | "left";
  onResize: (delta: number) => void;
  /** 双击恢复默认宽度（调用方负责 resetWidth） */
  onReset?: () => void;
}

export default function ColumnResizer({ side = "right", onResize, onReset }: Props) {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 旧 WebView 无捕获——move 仍走元素事件 */ }
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    onResize(side === "right" ? dx : -dx);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 未捕获则忽略 */ }
    setDragging(false);
  };

  return (
    <div
      data-testid="column-resizer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={() => onReset?.()}
      title="拖拽调整宽度（双击恢复默认）"
      style={{
        width: 5,
        flexShrink: 0,
        cursor: "col-resize",
        background: hover || dragging ? "#0d9488" : "transparent",
        borderLeft: "1px solid #e5e7eb",
        transition: "background 0.15s",
        userSelect: "none",
        touchAction: "none",
      }}
    />
  );
}
