/**
 * ChronosCanvas — 时间生物容器（R3F 3D 渲染版）
 *
 * R3F + WebGPU 渲染的 3D 粒子球体（ChronosSphere），替代 2D Canvas 版：
 * 保留 3D 球面坐标 + 透视投影的立体观感，渲染走 THREE.Points（GPU 高效），
 * 1500 粒子轻松 60fps，位置算法与 2D 版一致（静态分布 + 增量角度）。
 *
 * compact 尺寸上限 480px；中央 overlay 仅保留时间数字（提示语移出球体）。
 * 时间显示：阶段开始 5s + hover 显示（父组件 showTime prop）。
 *
 * 降级策略：系统 reduced-motion / 性能 low 档 → degraded（减粒子），动画保留不静态化。
 *
 * @ai-context: Chronos 渲染容器；3D 粒子球 ChronosSphere，WebGPU 渲染后端。
 */
import { Canvas } from '@react-three/fiber';
import { useRef, useState, memo } from 'react';
import * as THREE from 'three';
import WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePerformanceModeStore } from '@/lib/performance/usePerformanceMode';
import { toChronosState } from './chronosState';
import { CHRONOS_PALETTES } from './chronosStyles';
import type { Mood } from './particleMorphs';
import { ChronosSphere } from './ChronosSphere';

/** 长按判定阈值（ms）：长按=中止/放弃（回沉睡） */
const LONG_PRESS_MS = 800;
/** 点击判定阈值（ms） */
const TAP_MAX_MS = 500;

interface ChronosCanvasProps {
  /** full = 沉浸全屏；compact = 普通视图表盘尺寸 */
  mode?: 'full' | 'compact';
  phase: 'work' | 'short_break' | 'long_break';
  isRunning: boolean;
  isPaused: boolean;
  isArmed: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  /** 1 分钟迈步进行中（迈步期间显示呼吸态而非专注） */
  isStepDive?: boolean;
  /** 预设气质（深度定制粒子外形） */
  mood?: Mood;
  onTap?: () => void;
  onLongPress?: () => void;
  /** 右键点击生物（沉浸模式入口，父组件处理） */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** 阶段开始 5s 显示标记（父组件检测运行起始沿传入；hover 时同样显示） */
  showTime?: boolean;
  /** 中央显示内容（时间字符串） */
  timeStr: string;
}

// P0-2 React.memo：TimerFace 因 completedCount/currentGoal 等非 tick 字段
// 重渲染时，粒子容器跳过 reconcile（timeStr 变化时 props 不等，正常重渲染）
export const ChronosCanvas = memo(function ChronosCanvas({
  mode = 'full',
  phase,
  isRunning,
  isPaused,
  isArmed,
  remainingSeconds,
  totalSeconds,
  isStepDive,
  mood,
  onTap,
  onLongPress,
  onContextMenu,
  showTime = false,
  timeStr,
}: ChronosCanvasProps) {
  const theme = useSceneTheme();
  // 降级（不静态化）：系统 reduced-motion 或性能 low 档 → 减粒子
  const reduced = useReducedMotion();
  const perfMode = usePerformanceModeStore((s) => s.mode);
  const degraded = reduced || perfMode === 'low';

  const chronosState = toChronosState({ isArmed, isRunning, isPaused, phase, isStepDive });
  const stateColor = CHRONOS_PALETTES[theme][chronosState].glow;
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;

  // ── 时间显示隐藏化：父组件传入 showTime（阶段开始 5s），hover 粒子团时显示 ──
  const [hovering, setHovering] = useState(false);
  const timeVisible = showTime || hovering;

  // 容器层统一手势
  const pointerDownRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const handlePointerDown = () => {
    longPressFiredRef.current = false;
    pointerDownRef.current = Date.now();
    cancelLongPress();
    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };
  const handlePointerUp = () => {
    cancelLongPress();
    if (longPressFiredRef.current) return;
    if (Date.now() - pointerDownRef.current < TAP_MAX_MS && onTap) onTap();
  };

  const containerClass = mode === 'full'
    ? 'absolute inset-0 flex items-center justify-center'
    : 'relative w-[clamp(240px,52vmin,480px)] h-[clamp(240px,52vmin,480px)] overflow-hidden';

  return (
    <div
      className={`${containerClass} cursor-pointer`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelLongPress}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      role="timer"
      aria-label={timeStr}
    >
      {/* 3D 粒子球（R3F + WebGPU；THREE.Points 高效渲染，canvas 填满容器） */}
      <Canvas
        gl={(c) => new WebGPURenderer({ canvas: c, antialias: true, alpha: true, stencil: false })}
        dpr={[1, degraded ? 1 : 1.5]}
        camera={{ fov: 50, near: 0.1, far: 20, position: [0, 0, 4.5] }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <ChronosSphere
          state={chronosState}
          mood={mood}
          progress={progress}
          degraded={degraded}
        />
      </Canvas>
      {/* 进度条：容器顶部边缘细条（剩余时间比例，图形化时间感知） */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" aria-hidden="true">
        <div className="h-[2px] rounded-full" style={{ width: `${progress * 100}%`, background: stateColor, opacity: 0.45, transition: 'width 1s linear' }} />
      </div>
      {/* 中央状态区：仅时间数字。
          时间显示隐藏化：阶段开始显示 5s + 鼠标悬停粒子团时显示，否则隐藏
          辉光脉冲动画：3s 周期呼吸级脉冲，与 60bpm 心跳同频反射
          秒数心跳脉冲：key 随秒变化重置 chronos-second-pulse 动画（scale 1.05 → 1） */}
      {timeVisible && (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span
          key={remainingSeconds}
          className="px-3 py-1 rounded-full bg-bg-elevated/40 backdrop-blur-sm border border-border/15 font-timer font-light tracking-tight leading-none chronos-time-glow chronos-second-pulse"
          style={{
            fontSize: mode === 'full' ? 'clamp(3rem, 9vmin, 6rem)' : 'clamp(1.75rem, 7vmin, 3.5rem)',
            fontVariantNumeric: 'tabular-nums',
            color: stateColor,
            textShadow: `0 0 18px ${stateColor}55, 0 0 42px ${stateColor}22`,
            transition: 'color 0.6s ease, text-shadow 0.6s ease',
          }}
        >
          {timeStr}
        </span>
      </div>
      )}
      {/* 时间辉光脉冲动画 keyframes */}
      <style>{`
        @keyframes chronos-glow-pulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.15); }
        }
        @keyframes chronos-second-pulse {
          0% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .chronos-second-pulse {
          animation: chronos-glow-pulse 3s ease-in-out infinite, chronos-second-pulse 300ms ease-out;
        }
      `}</style>
    </div>
  );
});
