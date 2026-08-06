/**
 * 沉浸模式 — 中央计时圆环（SVG 弧形光带 + 呼吸倒计时）
 *
 * @ai-context: 从 ImmersiveTimer 拆分（单文件 ≤300 行规范），纯展示组件。
 */
import { motion, type TargetAndTransition } from 'framer-motion';

const SIZE = 280;
const STROKE_WIDTH = 8;
const R = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface ImmersiveRingProps {
  /** 剩余比例 0-1（remainingSeconds / totalSeconds） */
  progress: number;
  timeStr: string;
  label: string;
  /** 呼吸动画参数（prefersReduced 时为空对象） */
  breatheAnimation: TargetAndTransition;
}

export function ImmersiveRing({ progress, timeStr, label, breatheAnimation }: ImmersiveRingProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* SVG 弧形光带 */}
      <svg
        className="w-[65vw] h-[65vw] max-w-[400px] max-h-[400px]"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        overflow="visible"
      >
        <defs>
          {/* 光带渐变：brand-500 → accent-500 */}
          <linearGradient id="immersive-arc-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--kb-brand-500, #5B8A72)" />
            <stop offset="100%" stopColor="var(--kb-accent-500, #C4956A)" />
          </linearGradient>
          {/* 发光滤镜 */}
          <filter id="arc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 底圈 — 极淡参考线 */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={STROKE_WIDTH}
        />

        {/* 弧形光带进度条，strokeDashoffset 变化由 CSS transition 平滑过渡 */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#immersive-arc-gradient)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          filter="url(#arc-glow)"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>

      {/* 圆环内 — 倒计时数字 + 呼吸缩放 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.span
          className="font-timer font-light tracking-tight leading-none text-white/90"
          style={{
            fontSize: 'var(--kb-text-timer, clamp(4rem, 10vw, 7rem))',
            textShadow: '0 0 30px rgba(91,138,114,0.3), 0 0 60px rgba(91,138,114,0.1)',
            fontVariantNumeric: 'tabular-nums',
          }}
          animate={breatheAnimation}
        >
          {timeStr}
        </motion.span>
        <span
          className="text-[11px] mt-3 font-medium tracking-[0.15em] uppercase text-white/40"
        >
          {label}
        </span>
      </div>
    </div>
  );
}
