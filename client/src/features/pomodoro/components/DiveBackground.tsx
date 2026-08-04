/**
 * 深潜背景氛围层
 * @description 深潜番茄钟沉浸背景：垂直深度渐变 + 上浮气泡 + 深度光带 + 底部雾
 * @ai-context 纯 CSS 动画驱动（零 JS 调度）；DOM 数量按降级裁剪：
 * L0 全量（12 气泡 + 2 光带 + 雾）；L1 减量（6 气泡 + 1 光带）；L2 仅渐变静帧
 */
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/pomodoro-dive.css';

/** 降级级别：与萤火海沟/沉浸模式同源（L0 正常 / L1 低端 / L2 减弱动效） */
export type DiveDegradation = 'L0' | 'L1' | 'L2';

interface DiveBackgroundProps {
  /** 降级级别：L2 仅渲染渐变静帧 */
  degradation: DiveDegradation;
}

/** 确定性伪随机 @ai-context 气泡位置/时长可复现，避免重渲染抖动 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

interface Bubble {
  id: number;
  x: number;        // 相对容器宽度（%）
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  sway: number;     // 上浮摇摆幅度（px）
}

/** 生成上浮气泡 @ai-context 尺寸 2-6px、周期 10-22s、延迟 0-16s */
function generateBubbles(count: number): Bubble[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: seeded(i * 7 + 3) * 92 + 4,
    size: 2 + seeded(i * 13 + 5) * 4,
    duration: 10 + seeded(i * 17 + 11) * 12,
    delay: seeded(i * 23 + 7) * 16,
    opacity: 0.25 + seeded(i * 31 + 13) * 0.35,
    sway: (seeded(i * 37 + 19) - 0.5) * 48,
  }));
}

/** 深度光带配置 @ai-context 水面折射微光斜带 */
const DIVE_RAYS = [
  { y: '22%', width: 560, height: 90 },
  { y: '52%', width: 420, height: 70 },
] as const;

/**
 * 深潜背景组件
 * @ai-context 相对容器绝对定位（页面面板内），随主题变量自动适配晨光海面/深海
 */
export default function DiveBackground({ degradation }: DiveBackgroundProps) {
  const prefersReduced = useReducedMotion();

  // L1 减量 / L0 全量；L2 不渲染动态层
  const bubbleCount = degradation === 'L1' ? 6 : 12;
  const bubbles = useMemo(
    () => generateBubbles(prefersReduced ? 0 : bubbleCount),
    [prefersReduced, bubbleCount],
  );
  const rays = degradation === 'L1' ? DIVE_RAYS.slice(0, 1) : DIVE_RAYS;
  const showFog = degradation !== 'L2';
  const animPlay = prefersReduced ? 'paused' as const : undefined;

  if (degradation === 'L2') {
    return <div className="kb-dive" aria-hidden="true" />;
  }

  return (
    <div className="kb-dive" aria-hidden="true">
      {/* 上浮气泡 */}
      {bubbles.length > 0 && (
        <div className="absolute inset-0 overflow-hidden">
          {bubbles.map((b) => (
            <span
              key={b.id}
              className="kb-dive-bubble"
              style={{
                left: `${b.x}%`,
                width: b.size,
                height: b.size,
                ['--kb-bubble-duration' as string]: `${b.duration}s`,
                ['--kb-bubble-delay' as string]: `${b.delay}s`,
                ['--kb-bubble-opacity' as string]: b.opacity,
                ['--kb-bubble-sway' as string]: `${b.sway}px`,
                animationPlayState: animPlay,
              }}
            />
          ))}
        </div>
      )}

      {/* 深度光带 */}
      {rays.map((ray, i) => (
        <div
          key={`ray-${i}`}
          className="kb-dive-ray"
          style={{
            top: ray.y,
            width: ray.width,
            height: ray.height,
            marginLeft: -ray.width / 2,
            animationPlayState: animPlay,
          }}
        />
      ))}

      {/* 底部深海雾 */}
      {showFog && <div className="kb-dive-fog" style={{ animationPlayState: animPlay }} />}
    </div>
  );
}
