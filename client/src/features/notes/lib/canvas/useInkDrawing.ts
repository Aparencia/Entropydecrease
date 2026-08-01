/**
 * 墨迹绘制 hook（指针事件 → 笔画）
 * Ink drawing hook (pointer events -> strokes)
 *
 * @ai-context: 阶段三 OneNote 式墨迹。钢笔/荧光笔经 pointerdown/move/up 采集
 * 采样点生成笔画（荧光笔宽度×3 且半透明由渲染层处理）；橡皮擦按 distanceToStroke
 * 命中删除笔画。用 ref 保存进行中笔画避免闭包过期。'select' 工具不绘制（交给块层）。
 * @ai-context: Pen/highlighter sample points into strokes via pointer events;
 * eraser removes strokes by distanceToStroke hit-test. Active stroke kept in a
 * ref to avoid stale closures. 'select' tool draws nothing (block layer handles it).
 */
import { useCallback, useRef, useState } from 'react';
import type { InkPoint, InkStroke } from '@/types/models';
import { distanceToStroke } from './inkGeometry';

export type InkTool = 'select' | 'pen' | 'highlighter' | 'eraser';

/** 橡皮擦命中半径（px） / Eraser hit radius */
const ERASE_RADIUS = 12;

interface UseInkDrawingOptions {
  tool: InkTool;
  color: string;
  width: number;
  /** 客户端坐标 → 画布坐标 / client coords -> canvas coords */
  getCanvasPoint: (clientX: number, clientY: number) => InkPoint;
  onCommitStroke: (stroke: InkStroke) => void;
  onErase: (predicate: (stroke: InkStroke) => boolean) => void;
}

export function useInkDrawing(opts: UseInkDrawingOptions) {
  const { tool, color, width, getCanvasPoint, onCommitStroke, onErase } = opts;
  const [currentStroke, setCurrentStroke] = useState<InkStroke | null>(null);
  const strokeRef = useRef<InkStroke | null>(null);
  const drawingRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (tool === 'select' || e.button !== 0) return;
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (tool === 'eraser') {
      drawingRef.current = true;
      onErase((s) => distanceToStroke(point, s) <= Math.max(ERASE_RADIUS, s.width / 2 + 4));
      return;
    }
    drawingRef.current = true;
    const stroke: InkStroke = {
      id: crypto.randomUUID(),
      tool,
      color,
      width: tool === 'highlighter' ? width * 3 : width,
      points: [point],
    };
    strokeRef.current = stroke;
    setCurrentStroke(stroke);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [tool, color, width, getCanvasPoint, onErase]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (tool === 'eraser') {
      onErase((s) => distanceToStroke(point, s) <= Math.max(ERASE_RADIUS, s.width / 2 + 4));
      return;
    }
    const prev = strokeRef.current;
    if (prev) {
      const updated = { ...prev, points: [...prev.points, point] };
      strokeRef.current = updated;
      setCurrentStroke(updated);
    }
  }, [tool, getCanvasPoint, onErase]);

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const stroke = strokeRef.current;
    if (stroke && stroke.points.length > 0 && tool !== 'eraser') {
      onCommitStroke(stroke);
    }
    strokeRef.current = null;
    setCurrentStroke(null);
  }, [tool, onCommitStroke]);

  return { currentStroke, handlePointerDown, handlePointerMove, handlePointerUp };
}
