/**
 * @ai-context: 通用组件：TimerRing。
 */
import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TimerRingProps {
  totalSeconds: number;
  remainingSeconds: number;
  phase: 'work' | 'short_break' | 'long_break';
  isRunning: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  work: '#5B8A72',
  short_break: '#7BC4B8',
  long_break: '#6B9BD2',
};

// RGB tuples for interpolation
const COLOR_WARM_START: [number, number, number] = [91, 138, 114];  // #5B8A72
const COLOR_WARM_END:   [number, number, number] = [196, 149, 106];  // #C4956A

function lerpColor(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): string {
  const r = Math.round(from[0] + t * (to[0] - from[0]));
  const g = Math.round(from[1] + t * (to[1] - from[1]));
  const b = Math.round(from[2] + t * (to[2] - from[2]));
  return `rgb(${r}, ${g}, ${b})`;
}

function getStrokeColor(
  phase: string,
  remainingSeconds: number,
): string {
  const base = PHASE_COLORS[phase] ?? '#5B8A72';
  if (phase === 'work' && remainingSeconds <= 300 && remainingSeconds > 0) {
    const t = 1 - remainingSeconds / 300;
    return lerpColor(COLOR_WARM_START, COLOR_WARM_END, t);
  }
  return base;
}

const PHASE_LABELS: Record<string, string> = {
  work: '专注中',
  short_break: '短休息',
  long_break: '长休息',
};

export default function TimerRing({
  totalSeconds,
  remainingSeconds,
  phase,
  isRunning,
}: TimerRingProps) {
  const gradientId = useId();
  const glowGradientId = useId();

  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const color = getStrokeColor(phase, remainingSeconds);
  const label = PHASE_LABELS[phase];
  const isLast10 = remainingSeconds <= 10 && remainingSeconds > 0 && isRunning;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // 进度环由下方 JSX 的 strokeDashoffset prop + CSS transition（1s linear）驱动：
  // remainingSeconds 每秒变化触发重渲染，offset 随之平滑过渡。原 RAF 循环以 60fps
  // 重复 setAttribute 相同值（1h 计时约 21.6 万次无效 DOM 写）且 size 计算与 viewBox
  // 不一致，纯属冗余，已移除。

  const size = 280;
  const strokeWidth = 6;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative flex items-center justify-center">
      {/* 环境光晕 — 呼吸动画 */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size + 60,
          height: size + 60,
          background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
        }}
        animate={{
          scale: isRunning ? [1, 1.06, 1] : 1,
          opacity: isRunning ? [0.4, 0.7, 0.4] : 0.2,
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <svg
        className="block w-[200px] h-[200px] md:w-[280px] md:h-[280px]"
        viewBox={`0 0 ${size} ${size}`}
        overflow="visible"
      >
        <defs>
          {/* 主渐变 */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={PHASE_COLORS[phase]} stopOpacity={1} />
            <stop offset="100%" stopColor={PHASE_COLORS[phase]} stopOpacity={0.3} />
          </linearGradient>
          {/* 光晕渐变 */}
          <linearGradient id={glowGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={PHASE_COLORS[phase]} stopOpacity={0.15} />
            <stop offset="100%" stopColor={PHASE_COLORS[phase]} stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* 刻度标记 — 12/3/6/9 位置 */}
        {[0, 90, 180, 270].map((angle) => (
          <line
            key={angle}
            x1={size / 2}
            y1={strokeWidth + 2}
            x2={size / 2}
            y2={strokeWidth + 8}
            stroke="var(--kb-text-tertiary)"
            strokeWidth={1}
            opacity={0.2}
            transform={`rotate(${angle} ${size / 2} ${size / 2})`}
          />
        ))}

        {/* 背景环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border/20"
        />

        {/* 进度环 — 带渐变，strokeDashoffset 变化由 CSS transition 平滑过渡 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dashoffset 1s linear',
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
      </svg>

      {/* 中心内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.span
          className={cn(
            'font-timer font-light tracking-tight leading-none',
            isLast10 && 'animate-pulse',
          )}
          style={{
            fontSize: 'clamp(3.5rem, 8vw, 5.5rem)',
            color: isLast10 ? '#C4956A' : 'var(--kb-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
          key={timeStr}
          initial={{ opacity: 0.6, y: 2, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
        >
          {timeStr}
        </motion.span>
        <motion.span
          className="text-[11px] mt-2 font-medium tracking-[0.08em] uppercase"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {label}
        </motion.span>
      </div>
    </div>
  );
}
