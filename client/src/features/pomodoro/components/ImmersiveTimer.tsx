/**
 * ImmersiveTimer — 「潮汐穹顶」沉浸模式
 *
 * 全屏渐变色场背景（随进度变化），
 * 弧形光带进度条 + 呼吸缩放大字号倒计时，
 * 底部极简 icon-only 操作。
 *
 * @ai-context: 通用组件：ImmersiveTimer。
 * @ai-context: 3.8 心流音乐引擎 + 3.13 具身学习休息引导集成于此。
 */
import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING, BEAT } from '@/lib/animation/springConfig';
import { AnchorReminderOverlay } from './AnchorReminderOverlay';
import { useFlowMusic } from '@/hooks/useFlowMusic';

const SIZE = 280;
const STROKE_WIDTH = 8;
const R = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const PHASE_LABELS: Record<string, string> = {
  work: '专注中',
  short_break: '休息中',
  long_break: '休息中',
};

interface ImmersiveTimerProps {
  /** 背景音（白噪音）开关状态 */
  whiteNoiseEnabled?: boolean;
  /** 背景音音量 0-1 */
  whiteNoiseVolume?: number;
  /** 切换背景音开关 */
  onToggleWhiteNoise?: () => void;
  /** 调节背景音音量 */
  onWhiteNoiseVolume?: (vol: number) => void;
  /** M4 清醒期重放：上次专注会话的关键词列表 */
  lastSessionKeywords?: string[];
  /** 3.8 专注守护灵分心分数（0-100），用于心流音乐引擎 */
  focusScore?: number;
  /** 3.8 心流音乐引擎是否激活 */
  flowMusicEnabled?: boolean;
}

/** 3.13 具身学习休息活动列表 */
const EMBODIED_ACTIVITIES = [
  { id: 'stretch', label: '站立拉伸', icon: '🧘' },
  { id: 'gesture', label: '手势比划概念', icon: '✋' },
  { id: 'walk-think', label: '空间行走思考', icon: '🚶' },
];

/** 3.13 休息活动轮换间隔（ms） */
const ACTIVITY_ROTATE_INTERVAL = 30_000;

/**
 * 根据进度计算背景渐变色场（完全不透明，确保计时器清晰可读）
 * 0-20%: 深蓝宁静 (brand-700 基调)
 * 20-80%: 最深处 (brand-900 基调) — 最沉浸
 * 80-100%: 逐渐变暖 (加入 accent 色调) — 暗示即将结束
 */
function getBackgroundGradient(progressPercent: number): string {
  if (progressPercent <= 20) {
    const t = progressPercent / 20;
    const r = Math.round(15 - t * 7);
    const g = Math.round(40 - t * 18);
    const b = Math.round(55 - t * 15);
    return `radial-gradient(ellipse 120% 100% at 50% 40%, 
      rgb(${r}, ${g}, ${b}) 0%, 
      rgb(8, 22, 35) 50%, 
      rgb(5, 12, 22) 100%)`;
  }
  if (progressPercent <= 80) {
    return `radial-gradient(ellipse 120% 100% at 50% 40%, 
      rgb(8, 22, 40) 0%, 
      rgb(4, 10, 20) 50%, 
      rgb(2, 6, 14) 100%)`;
  }
  const t = (progressPercent - 80) / 20;
  const warmR = Math.round(20 + t * 35);
  const warmG = Math.round(12 + t * 15);
  return `radial-gradient(ellipse 120% 100% at 50% 40%, 
    rgb(${warmR}, ${warmG}, 30) 0%, 
    rgb(10, 8, 15) 50%, 
    rgb(5, 4, 10) 100%)`;
}

export default function ImmersiveTimer({
  whiteNoiseEnabled = false,
  whiteNoiseVolume = 0.5,
  onToggleWhiteNoise,
  onWhiteNoiseVolume,
  lastSessionKeywords,
  focusScore = 0,
  flowMusicEnabled = false,
}: ImmersiveTimerProps) {
  const prefersReduced = useReducedMotion();

  const {
    remainingSeconds,
    totalSeconds,
    phase,
    isRunning,
    currentGoal,
    pause,
    resume,
    reset,
  } = usePomodoroStore(useShallow(s => s));

  // 3.8 心流音乐引擎（工作阶段激活）
  const flowMusic = useFlowMusic(focusScore);
  useEffect(() => {
    if (flowMusicEnabled && phase === 'work') {
      flowMusic.activate();
    } else {
      flowMusic.deactivate();
    }
  }, [flowMusicEnabled, phase, flowMusic]);

  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
  const progressPercent = (1 - progress) * 100;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const label = PHASE_LABELS[phase] ?? '专注中';

  const backgroundGradient = useMemo(
    () => getBackgroundGradient(progressPercent),
    [progressPercent],
  );

  // 弧形光带进度由下方 JSX 的 strokeDashoffset prop + CSS transition（duration-1000）驱动：
  // remainingSeconds 每秒变化触发重渲染，offset 随之平滑过渡。原 RAF 循环以 60fps
  // 重复 setAttribute 相同值，纯属冗余，已移除。

  // 呼吸动画参数 — 匹配 BEAT.x5 (600ms 周期 → 实际用4s完整呼吸)
  const breatheAnimation = prefersReduced
    ? {}
    : {
        scale: [1, 1.02, 1],
        transition: {
          duration: BEAT.x5 / 100, // 6s 完整呼吸周期
          repeat: Infinity,
          ease: 'easeInOut' as const,
        },
      };

  const isBreak = phase === 'short_break' || phase === 'long_break';

  // 3.13 休息活动轮换索引
  const [activityIndex, setActivityIndex] = useState(0);
  useEffect(() => {
    if (!isBreak) {
      setActivityIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setActivityIndex(prev => (prev + 1) % EMBODIED_ACTIVITIES.length);
    }, ACTIVITY_ROTATE_INTERVAL);
    return () => clearInterval(interval);
  }, [isBreak]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none"
      style={{
        background: backgroundGradient,
        transition: `background ${BEAT.x5}ms ease-in-out`,
      }}
    >
      {/* 顶部目标显示 — fade in，不抢注意力 */}
      {currentGoal && (
        <motion.p
          className="absolute top-16 left-0 right-0 text-center text-[12px] text-white/30 truncate px-16 font-medium tracking-wide"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.gentle, delay: 0.3 }}
        >
          {currentGoal}
        </motion.p>
      )}

      {/* M4 清醒期重放引导：休息时显示上次会话的关键词，渐入渐出 */}
      {isBreak && lastSessionKeywords && lastSessionKeywords.length > 0 && (
        <motion.div
          className="absolute top-28 left-0 right-0 flex flex-col items-center gap-1.5 px-8"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <span className="text-[10px] text-white/25 tracking-widest uppercase">
            ˖ 记忆重放 ˖
          </span>
          <div className="flex flex-wrap justify-center gap-1.5">
            {lastSessionKeywords.map((kw, i) => (
              <motion.span
                key={kw}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white/60 border border-white/10 bg-white/5"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
              >
                {kw}
              </motion.span>
            ))}
          </div>
          <motion.p
            className="text-[11px] text-white/30 mt-0.5 italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            ～ 回想一下刚才学的内容 ～
          </motion.p>
        </motion.div>
      )}

      {/* 中央计时器区域 */}
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

      {/* T2 记忆锚点提醒浮层 — work 阶段每 12 分钟一句话要点，15 秒自动消失 */}
      <AnchorReminderOverlay />

      {/* 3.13 休息阶段具身学习活动建议 — 底部非侵入式卡片 */}
      {isBreak && (
        <motion.div
          className="absolute bottom-36 left-0 right-0 flex justify-center px-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/8 backdrop-blur-sm">
            <span className="text-sm">{EMBODIED_ACTIVITIES[activityIndex].icon}</span>
            <span className="text-[11px] text-white/50 font-medium tracking-wide">
              {EMBODIED_ACTIVITIES[activityIndex].label}
            </span>
            <span className="text-[9px] text-white/20 ml-1">
              {activityIndex + 1}/{EMBODIED_ACTIVITIES.length}
            </span>
          </div>
        </motion.div>
      )}

      {/* 底部操作区 — 极简 icon-only */}
      <motion.div
        className="absolute bottom-16 flex items-center gap-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING.gentle, delay: 0.2 }}
      >
        {/* 背景音开关 + 音量调节 */}
        {onToggleWhiteNoise && (
          <div className="flex items-center gap-2">
            {/* 沉浸模式背景音开关，带 tooltip */}
            <Tip text={whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onToggleWhiteNoise}
              aria-label={whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                'bg-white/5 border backdrop-blur-sm',
                'transition-colors duration-200',
                whiteNoiseEnabled
                  ? 'border-white/15 text-white/80 hover:text-white'
                  : 'border-white/8 text-white/35 hover:text-white/60 hover:bg-white/8',
              )}
            >
              {whiteNoiseEnabled
                ? <Volume2 className="w-4 h-4" strokeWidth={1.5} />
                : <VolumeX className="w-4 h-4" strokeWidth={1.5} />}
            </motion.button>
            </Tip>
            <AnimatePresence>
              {whiteNoiseEnabled && onWhiteNoiseVolume && (
                <motion.input
                  key="vol-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={whiteNoiseVolume}
                  onChange={(e) => onWhiteNoiseVolume(parseFloat(e.target.value))}
                  aria-label="背景音音量"
                  className="w-20 h-1 cursor-pointer accent-[#5B8A72]"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 80 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 暂停/继续按钮，带 tooltip */}
        <Tip text={isRunning ? '暂停' : '继续'}>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={isRunning ? pause : resume}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center',
            'bg-white/8 backdrop-blur-sm border border-white/10',
            'text-white/60 hover:text-white/90 hover:bg-white/12',
            'transition-colors duration-200',
          )}
        >
          {isRunning
            ? <Pause className="w-5 h-5" strokeWidth={1.5} />
            : <Play className="w-5 h-5 ml-0.5" strokeWidth={1.5} />}
        </motion.button>
        </Tip>

        {/* 停止按钮，带 tooltip */}
        <Tip text="停止">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={reset}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            'bg-white/5 border border-white/8',
            'text-white/40 hover:text-white/70 hover:bg-white/8',
            'transition-colors duration-200',
          )}
        >
          <Square className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </motion.div>
    </div>
  );
}