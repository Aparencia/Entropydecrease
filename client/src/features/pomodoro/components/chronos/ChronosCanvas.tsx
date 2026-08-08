/**
 * ChronosCanvas — 时间生物容器
 *
 * R3F Canvas 包裹 ChronosSphere，按主题自动切换双风格（深潜/极光）。
 * 支持 full（沉浸全屏）与 compact（普通视图表盘尺寸）两种模式。
 * prefersReducedMotion 时回退 2D 静态形态（颜色随阶段变化，无动画）。
 *
 * @ai-context: Chronos 时间生物渲染容器，替代 TimerRing / ImmersiveRing 视觉层。
 */
import { Canvas } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { CHRONOS_STYLES, CHRONOS_PHASES, CHRONOS_STATE_LABELS, toChronosPhase, type ChronosPhase } from './chronosStyles';
import { ChronosSphere } from './ChronosSphere';

interface ChronosCanvasProps {
  /** full = 沉浸全屏；compact = 普通视图表盘尺寸 */
  mode?: 'full' | 'compact';
  phase: 'work' | 'short_break' | 'long_break';
  isRunning: boolean;
  remainingSeconds: number;
  started: boolean;
  /** 守护灵分心分数 0-100（可选，P2） */
  intensity?: number;
  /** 环境光亮度 0-1（可选，P2 暗环境自发光补偿） */
  ambientLight?: number;
  /** 完成绽放触发（P1） */
  bloom?: boolean;
  onTap?: () => void;
  /** 长按生物回调（进入沉睡） */
  onLongPress?: () => void;
  /** 中央显示内容（时间字符串） */
  timeStr: string;
}

/** 2D 静态回退形态（reduced motion / 极端低配） */
function ChronosStatic({ phase, timeStr }: {
  phase: ChronosPhase;
  timeStr: string;
}) {
  const phaseColor = CHRONOS_PHASES[phase].body;
  const state = CHRONOS_STATE_LABELS[phase];
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* 静态光环 + 渐变球体 */}
      <div
        className="rounded-full"
        style={{
          width: 'min(60%, 240px)',
          aspectRatio: '1',
          background: `radial-gradient(circle at 35% 30%, ${phaseColor}66 0%, #0C152433 55%, transparent 75%)`,
          border: `2px solid ${phaseColor}55`,
          boxShadow: `0 0 40px ${phaseColor}33`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-timer font-light tracking-tight leading-none text-text-primary" style={{ fontSize: 'clamp(2rem, 8vmin, 4.5rem)', fontVariantNumeric: 'tabular-nums' }}>
          {timeStr}
        </span>
        <span className="text-[11px] mt-2 font-medium tracking-[0.15em] uppercase" style={{ color: phaseColor }}>
          {state.icon} {state.name}
        </span>
        <span className="text-[10px] mt-1 text-text-tertiary/60">{state.hint}</span>
      </div>
    </div>
  );
}

export function ChronosCanvas({
  mode = 'full',
  phase,
  isRunning,
  remainingSeconds,
  started,
  intensity,
  ambientLight,
  bloom,
  onTap,
  onLongPress,
  timeStr,
}: ChronosCanvasProps) {
  const theme = useSceneTheme();
  const reduced = useReducedMotion();
  const style = CHRONOS_STYLES[theme];
  const chronosPhase = toChronosPhase(phase, isRunning, remainingSeconds, started);
  // 状态指示：完整状态机（沉睡/呼吸/专注/短休/长休/即将完成），优先于静态 label
  const state = CHRONOS_STATE_LABELS[chronosPhase];
  const stateColor = CHRONOS_PHASES[chronosPhase].body;

  // 降级：减少动效偏好 → 2D 静态形态
  if (reduced) {
    return <ChronosStatic phase={chronosPhase} timeStr={timeStr} />;
  }

  return (
    <div
      className={mode === 'full'
        ? 'absolute inset-0 flex items-center justify-center pointer-events-none'
        : 'relative w-[clamp(150px,34vmin,280px)] h-[clamp(150px,34vmin,280px)] pointer-events-none'}
      aria-label={`${state.name} ${timeStr}`}
      role="timer"
    >
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        className={mode === 'full' ? '!absolute inset-0' : ''}
        style={{ pointerEvents: 'auto' }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[3, 3, 4]} intensity={1.2} />
        <pointLight position={[-3, -2, -3]} intensity={0.4} color={style.emissiveColor} />
        <ChronosSphere
          phase={chronosPhase}
          style={style}
          intensity={intensity}
          ambientLight={ambientLight}
          bloom={bloom}
          onTap={onTap}
          onLongPress={onLongPress}
        />
      </Canvas>
      {/* 中央状态区：时间 + 状态名 + 交互提示（HTML 层，与 3D 叠加） */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="font-timer font-light tracking-tight leading-none text-text-primary"
          style={{ fontSize: mode === 'full' ? 'clamp(3rem, 9vmin, 6rem)' : 'clamp(1.75rem, 7vmin, 3.5rem)', fontVariantNumeric: 'tabular-nums' }}
        >
          {timeStr}
        </span>
        <span
          className="text-[11px] mt-2 font-medium tracking-[0.15em] uppercase transition-colors duration-500"
          style={{ color: stateColor }}
        >
          {state.icon} {state.name}
        </span>
        <span className="text-[10px] mt-1 text-text-tertiary/60">{state.hint}</span>
      </div>
    </div>
  );
}