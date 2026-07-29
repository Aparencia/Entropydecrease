/**
 * 灵感星座可视化组件
 * @ai-context 将灵感数据映射为漂浮萤火光点，按类别群落布局散布于深海沉浸式背景中。
 * 使用 constellationLayout.ts 纯函数计算坐标，本组件仅负责渲染。
 * 支持新灵感飞入动画：newInspirationId 指定时，临时光点从中心飞向目标位置。
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { DegradationLevel } from '../types';
import {
  calculateConstellationLayout,
  type ConstellationLayoutPoint,
} from '../lib/constellationLayout';
import {
  calculateFlyInAnimation,
  type FlyInResult,
} from '../lib/flyInAnimation';
import { useRandomSurface } from '../hooks/useRandomSurface';

// ─── 类型 ────────────────────────────────────────────────────

interface InspirationConstellationProps {
  inspirations: Array<{
    id: string;
    content: string;
    tags: { content_nature: string; cognitive_depth: string; subject?: string };
    sortStatus?: string;
  }>;
  degradation: DegradationLevel;
  prefersReduced?: boolean;
  /** 新建灵感 id，触发飞入动画 */
  newInspirationId?: string;
  /** 飞入动画完成回调 */
  onFlyInComplete?: () => void;
}

// ─── 常量 ────────────────────────────────────────────────────

/** L1 降级：每个类别最多 5 个光点 */
const L1_MAX_PER_CATEGORY = 5;

/** 中心排除区域（百分比坐标），为创作区留出视觉空间 */
const CENTER_EXCLUSION = { xStart: 30, xEnd: 70, yStart: 30, yEnd: 70 };

/** 浮动动画基础时长与延迟范围 */
const FLOAT_DURATION_BASE = 14;
const FLOAT_DURATION_SPAN = 10;
const FLOAT_DELAY_SPAN = 6;

// ─── 纯函数 ──────────────────────────────────────────────────

/**
 * 确定性伪随机（用于浮动动画参数，与布局函数独立）
 * @ai-context 基于 id 哈希生成动画参数，保证同一光点动画稳定
 */
function animSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** 根据 shape 返回 Tailwind className 片段 */
function shapeClassName(shape: ConstellationLayoutPoint['shape']): string {
  switch (shape) {
    case 'circle':
      return 'rounded-full';
    case 'square':
      return 'rounded-sm';
    case 'diamond':
      return 'rounded-sm rotate-45';
    case 'triangle':
      return ''; // 使用 clip-path 内联样式
    default:
      return 'rounded-full';
  }
}

/** 三角形 clip-path 样式 */
const TRIANGLE_CLIP: React.CSSProperties = {
  clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
};

// ─── 飞入光点子组件 ─────────────────────────────────────────

interface FlyInDotProps {
  flyIn: FlyInResult;
  color: string;
  size: number;
  onComplete: () => void;
}

/**
 * 飞入动画临时光点
 * @ai-context 从中心位置飞向目标群落位置，使用 CSS transition 驱动。
 * 副作用：动画结束后调用 onComplete 回调。
 */
function FlyInDot({ flyIn, color, size, onComplete }: FlyInDotProps) {
  const [arrived, setArrived] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // 下一帧启动 transition（从初始位置到目标位置）
    const raf = requestAnimationFrame(() => setArrived(true));

    // 动画结束后触发回调
    timerRef.current = setTimeout(onComplete, flyIn.duration + 50);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [flyIn.duration, onComplete]);

  const style: React.CSSProperties = {
    left: arrived ? `${flyIn.toX}%` : `${flyIn.fromX}%`,
    top: arrived ? `${flyIn.toY}%` : `${flyIn.fromY}%`,
    width: size,
    height: size,
    backgroundColor: color,
    boxShadow: `0 0 ${size * 3}px ${color}`,
    transition: arrived
      ? `left ${flyIn.duration}ms ${flyIn.easing}, top ${flyIn.duration}ms ${flyIn.easing}, opacity 300ms ease-out`
      : 'none',
    opacity: arrived ? 1 : 0.8,
  };

  return <div className="absolute rounded-full" style={style} />;
}

// ─── 主组件 ──────────────────────────────────────────────────

/**
 * 灵感星座光点层
 * @ai-context 调用纯函数布局计算后，将每个灵感渲染为 absolute 定位的发光点。
 * 支持4种形状、3种尺寸、呼吸脉动+浮动双层动画。降级 L2 完全不渲染。
 * 当 newInspirationId 存在时，渲染临时光点从中心飞入目标位置。
 */
export default function InspirationConstellation({
  inspirations,
  degradation,
  prefersReduced: prefersReducedProp,
  newInspirationId,
  onFlyInComplete,
}: InspirationConstellationProps) {
  const reducedMotion = useReducedMotion();
  const prefersReduced = prefersReducedProp ?? reducedMotion ?? false;

  // L2 降级：hooks 之后 early return
  if (degradation === 'L2') return null;

  return (
    <ConstellationInner
      inspirations={inspirations}
      degradation={degradation}
      prefersReduced={prefersReduced}
      newInspirationId={newInspirationId}
      onFlyInComplete={onFlyInComplete}
    />
  );
}

// ─── 内层渲染组件 ────────────────────────────────────────────

type InnerProps = Required<Pick<InspirationConstellationProps, 'degradation'>> &
  Omit<InspirationConstellationProps, 'degradation'> & { prefersReduced: boolean };

/**
 * 内层渲染组件
 * @ai-context 分离 early return 逻辑后，保证 hooks 调用顺序稳定。
 * 集成 useRandomSurface 实现旧灵感随机浮现效果。
 */
function ConstellationInner({
  inspirations,
  degradation,
  prefersReduced,
  newInspirationId,
  onFlyInComplete,
}: InnerProps) {
  const maxPerCategory = degradation === 'L1' ? L1_MAX_PER_CATEGORY : undefined;

  const points = useMemo<ConstellationLayoutPoint[]>(
    () => calculateConstellationLayout(inspirations, {
      maxPerCategory,
      centerExclusion: CENTER_EXCLUSION,
    }),
    [inspirations, maxPerCategory],
  );

  // ── 随机浮现 ──────────────────────────────────────────────
  /** @ai-context 将灵感数据映射为浮现候选，pending 光点权重 2x */
  const surfaceCandidates = useMemo(
    () => inspirations.map((insp) => ({ id: insp.id, sortStatus: insp.sortStatus })),
    [inspirations],
  );

  const surfaceId = useRandomSurface(surfaceCandidates, {
    disabled: prefersReduced,
    isL1: degradation === 'L1',
  });

  // ── 飞入动画 ──────────────────────────────────────────────
  const flyInTarget = useMemo<ConstellationLayoutPoint | null>(() => {
    if (!newInspirationId) return null;
    return points.find((p) => p.id === newInspirationId) ?? null;
  }, [newInspirationId, points]);

  const flyIn = useMemo<FlyInResult | null>(() => {
    if (!flyInTarget) return null;
    return calculateFlyInAnimation({
      targetX: flyInTarget.x,
      targetY: flyInTarget.y,
    });
  }, [flyInTarget]);

  const handleFlyComplete = () => {
    onFlyInComplete?.();
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {points.map((point) => {
        const seed = animSeed(point.id);
        const floatDuration = FLOAT_DURATION_BASE + seededRandom(seed * 23 + 7) * FLOAT_DURATION_SPAN;
        const floatDelay = seededRandom(seed * 31 + 13) * FLOAT_DELAY_SPAN;
        const isSurfacing = point.id === surfaceId;

        const animValue = prefersReduced
          ? 'none'
          : `kb-float-up ${floatDuration}s ease-in-out ${floatDelay}s infinite, kb-constellation-breathe ${point.breatheDuration}s ease-in-out infinite`;

        const style: React.CSSProperties = {
          left: `${point.x}%`,
          top: `${point.y}%`,
          width: point.size,
          height: point.size,
          backgroundColor: point.color,
          color: point.color,
          boxShadow: `0 0 ${point.size * 2}px ${point.color}`,
          animation: isSurfacing ? 'none' : animValue,
          transition: isSurfacing
            ? 'transform 2s ease-in-out, opacity 2s ease-in-out, box-shadow 2s ease-in-out'
            : undefined,
          ...(point.shape === 'triangle' ? TRIANGLE_CLIP : {}),
        };

        return (
          <div
            key={point.id}
            title={point.sortStatus ?? point.id}
            className={[
              'absolute pointer-events-auto cursor-default',
              shapeClassName(point.shape),
              isSurfacing ? 'kb-constellation-surface' : '',
            ].join(' ')}
            style={style}
          />
        );
      })}

      {/* 飞入动画临时光点 */}
      {flyIn && flyInTarget && !prefersReduced && (
        <FlyInDot
          flyIn={flyIn}
          color={flyInTarget.color}
          size={flyInTarget.size}
          onComplete={handleFlyComplete}
        />
      )}
    </div>
  );
}
