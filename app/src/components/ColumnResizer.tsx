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
  // REQ-285（v0.19.6）：上次事件 x——move 传**相邻增量**而非距起点累计位移。
  // @ai-context: useColumnLayout.resizeBy 为增量语义（cur + delta）；旧实现每次
  //              move 都传全程距离（clientX - startX）导致重复累加 =「拖拽加速」。
  const lastXRef = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    lastXRef.current = e.clientX;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 旧 WebView 无捕获——move 仍走元素事件 */ }
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    onResize(side === "right" ? dx : -dx);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 未捕获则忽略 */ }
    setDragging(false);
  };

  // REQ-285（v0.19.6）：键盘可达性（§2.9 交互矩阵）——←/→ 步进 ±16px（Shift=±8px）。
  // @ai-context: 与 pointer 拖拽同走 onResize 增量语义；夹取由 useColumnLayout 负责。
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 8 : 16;
    const dx = e.key === "ArrowRight" ? step : -step;
    onResize(side === "right" ? dx : -dx);
  };

  return (
    <div
      data-testid="column-resizer"
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={() => onReset?.()}
      title="拖拽调整宽度（←/→ 微调；双击恢复默认）"
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
