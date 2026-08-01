/**
 * 墨迹渲染层（SVG）
 * Ink rendering layer (SVG)
 *
 * @ai-context: 阶段三。将已提交笔画 + 进行中笔画渲染为 SVG path（pointsToSvgPath
 * 平滑）。荧光笔半透明（strokeOpacity 0.4）。pointer-events-none，绘制事件由
 * FreeCanvas 的绘制覆盖层处理。绝对定位覆盖整个画布（与文本块同坐标系）。
 * @ai-context: Renders committed + in-progress strokes as smoothed SVG paths;
 * highlighter is translucent. pointer-events-none (drawing handled by overlay).
 */
import { pointsToSvgPath } from '../../lib/canvas/inkGeometry';
import type { InkStroke } from '@/types/models';

interface InkLayerProps {
  strokes: InkStroke[];
  currentStroke: InkStroke | null;
  width: number;
  height: number;
}

export function InkLayer({ strokes, currentStroke, width, height }: InkLayerProps) {
  const all = currentStroke ? [...strokes, currentStroke] : strokes;
  if (all.length === 0) return null;
  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 6 }}
    >
      {all.map((s) => (
        <path
          key={s.id}
          d={pointsToSvgPath(s.points)}
          stroke={s.color}
          strokeWidth={s.width}
          strokeOpacity={s.tool === 'highlighter' ? 0.4 : 1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
