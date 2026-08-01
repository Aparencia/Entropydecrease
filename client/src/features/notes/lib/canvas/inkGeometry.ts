/**
 * 墨迹几何工具（纯函数，可单测）
 * Ink geometry utilities (pure, testable)
 *
 * @ai-context: 阶段三 OneNote 式墨迹。pointsToSvgPath 用中点二次贝塞尔平滑
 * 采样点；distanceToStroke 计算点到笔画各线段的最短距离（橡皮擦命中）；
 * strokesInRegion 返回任意点落在矩形区域内的笔画 id（套索选择）。
 * @ai-context: pointsToSvgPath smooths sampled points via midpoint quadratic
 * bezier; distanceToStroke = min point-to-segment distance (eraser hit-test);
 * strokesInRegion selects strokes with any point inside a rectangle (lasso).
 */
import type { InkPoint, InkStroke } from '@/types/models';

/** 矩形区域 / Rectangular region */
export interface Region {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 采样点 → 平滑 SVG path（中点二次贝塞尔）。
 * Sampled points -> smooth SVG path (midpoint quadratic bezier).
 */
export function pointsToSvgPath(points: InkPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    // 单点画极短线段以便渲染出点 / single point: tiny segment so it renders
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** 点到线段的最短距离 / Shortest distance from point to segment */
function distToSegment(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * 点到笔画的最短距离（橡皮擦命中检测）。空笔画返回 Infinity。
 * Min distance from a point to a stroke (eraser hit-test). Infinity if empty.
 */
export function distanceToStroke(point: InkPoint, stroke: InkStroke): number {
  const pts = stroke.points;
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(point.x - pts[0].x, point.y - pts[0].y);
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(point, pts[i], pts[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * 返回任意点落在区域内的笔画 id（套索选择）。
 * Ids of strokes having any point inside the region (lasso selection).
 */
export function strokesInRegion(strokes: InkStroke[], region: Region): string[] {
  return strokes
    .filter((s) =>
      s.points.some((p) =>
        p.x >= region.minX && p.x <= region.maxX && p.y >= region.minY && p.y <= region.maxY,
      ),
    )
    .map((s) => s.id);
}
