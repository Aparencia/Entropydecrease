/**
 * ChronosCanvas — 时间生物容器
 *
 * R3F Canvas 包裹 ChronosParticleField（粒子主体）+ ChronosCreature（辅助形态）。
 * compact 尺寸上限提升至 480px（需求 1：普通视图 3D 足够大）。
 * 中央 overlay 仅保留时间数字（需求 4：提示语移出球体，由父组件状态行承担）。
 *
 * 3D 空间：camera z=5.5 fov=50（视锥半高 ≈2.57），比原 z=5.0 fov=45 增大约 24%，
 * 粒子场全态（asleep canopy≤2.0, radius=1.8）完整落在视锥内。
 *
 * 时间显示：使用 CSS 动画实现呼吸级辉光脉冲（每周期 3s），与 60bpm 心跳同频反射。
 *
 * 降级策略：系统 reduced-motion / 性能 low 档 → degraded（减粒子+跳帧+降 dpr），
 * 但保留粒子形态与动画（永不静态化）；仅 WebGL 不可用时回退 2D 静态。
 *
 * @ai-context: Chronos 渲染容器；描述符 particleMorphs，色板 chronosStyles。
 */
import { useMemo, useRef, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePerformanceModeStore } from '@/lib/performance/usePerformanceMode';
import { toChronosState } from './chronosState';
import { CHRONOS_PALETTES } from './chronosStyles';
import type { Mood } from './particleMorphs';
import { ChronosCreature } from './ChronosCreature';
import { ChronosParticleField } from './ChronosParticleField';

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
  /** 中央显示内容（时间字符串） */
  timeStr: string;
}

/** WebGL 可用性检测（不可用时回退 2D 静态） */
function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/** 2D 静态兜底（仅 WebGL 不可用）：显式宽高，只显示时间（状态行由父组件渲染） */
function ChronosStatic({ mode, timeStr }: { mode: 'full' | 'compact'; timeStr: string }) {
  return (
    <div
      className={mode === 'full'
        ? 'absolute inset-0 flex items-center justify-center'
        : 'relative flex items-center justify-center w-[clamp(240px,52vmin,480px)] h-[clamp(240px,52vmin,480px)]'}
      aria-label={timeStr}
      role="timer"
    >
      <div
        className="rounded-full shrink-0"
        style={{
          width: 'min(70%, 320px)',
          minWidth: '160px',
          aspectRatio: '1',
          background: 'radial-gradient(circle at 35% 30%, rgba(34,211,238,0.25) 0%, #0C152433 55%, transparent 75%)',
          border: '2px solid rgba(34,211,238,0.35)',
          boxShadow: '0 0 40px rgba(34,211,238,0.2)',
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-timer font-light tracking-tight leading-none text-text-primary" style={{ fontSize: mode === 'full' ? 'clamp(3rem, 9vmin, 6rem)' : 'clamp(2rem, 8vmin, 4.5rem)', fontVariantNumeric: 'tabular-nums' }}>
          {timeStr}
        </span>
      </div>
    </div>
  );
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
  timeStr,
}: ChronosCanvasProps) {
  const theme = useSceneTheme();
  // 降级（不静态化）：系统 reduced-motion 或性能 low 档 → 减粒子/跳帧/降 dpr
  const reduced = useReducedMotion();
  const perfMode = usePerformanceModeStore((s) => s.mode);
  const degraded = reduced || perfMode === 'low';
  const webgl = useMemo(() => isWebGLAvailable(), []);

  const chronosState = toChronosState({ isArmed, isRunning, isPaused, phase, isStepDive });
  const stateColor = CHRONOS_PALETTES[theme][chronosState].glow;
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;

  // P0-9：秒数变化心跳脉冲改 CSS animation 重启（key={remainingSeconds} 触发），
  // 不再每秒 2 次 setState（脉冲开/关）造成额外 React 渲染
  // 容器层统一手势（3D 与静态回退交互一致）
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

  // WebGL 不可用 → 2D 静态兜底（唯一静态化路径）
  if (!webgl) {
    return <ChronosStatic mode={mode} timeStr={timeStr} />;
  }

  return (
    <div
      className={`${containerClass} cursor-pointer`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelLongPress}
      onContextMenu={onContextMenu}
      role="timer"
      aria-label={timeStr}
    >
      <Canvas
        /* camera z=5.5 fov=50：视锥半高 ≈2.57，比原 z=5.0 fov=45 增大约 24%，
           asleep 半径 1.8 + 漂移余量 ≈2.0 完整落在视锥内；
           扩大空间让粒子聚集动画有更大的运动范围 */
        camera={{ position: [0, 0, 5.5], fov: 50 }}
        dpr={degraded ? [1, 1] : [1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        className="!absolute inset-0"
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[3, 3, 4]} intensity={1.0} color={stateColor} />
        <pointLight position={[-3, -2, -3]} intensity={0.4} color={stateColor} />
        <ChronosParticleField
          state={chronosState}
          theme={theme}
          mood={mood}
          progress={progress}
          degraded={degraded}
        />
        <ChronosCreature state={chronosState} theme={theme} />
      </Canvas>
      {/* 进度条：容器顶部边缘细条（剩余时间比例，图形化时间感知） */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" aria-hidden="true">
        <div className="h-[2px] rounded-full" style={{ width: `${progress * 100}%`, background: stateColor, opacity: 0.45, transition: 'width 1s linear' }} />
      </div>
      {/* 中央状态区：仅时间数字（需求 4：状态名/引导语移出球体）。
          时间与粒子球同源和谐：状态辉光色 + 同色 textShadow，半透明胶囊背景提升可读性
          辉光脉冲动画：3s 周期呼吸级脉冲，与 60bpm 心跳同频反射
          秒数心跳脉冲：key 随秒变化重置 chronos-second-pulse 动画（scale 1.05 → 1） */}
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
