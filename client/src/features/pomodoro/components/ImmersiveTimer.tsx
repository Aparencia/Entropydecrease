/**
 * ImmersiveTimer — 「潮汐穹顶」沉浸模式
 *
 * 全屏渐变色场背景（随进度变化），
 * 弧形光带进度条 + 呼吸缩放大字号倒计时（ImmersiveRing），
 * 底部极简 icon-only 操作（ImmersiveControls）。
 *
 * @ai-context: 3.8 心流音乐引擎 + 3.13 具身学习休息引导集成于此；
 * 中央圆环与底部操作区已拆至 ImmersiveRing / ImmersiveControls
 * （单文件 ≤300 行规范）。
 */
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BEAT } from '@/lib/animation/springConfig';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { AnchorReminderOverlay } from './AnchorReminderOverlay';
import { ChronosCanvas } from './chronos/ChronosCanvas';
import { ImmersiveRing } from './ImmersiveRing';
import { ImmersiveControls } from './ImmersiveControls';
import { useFlowMusic } from '@/hooks/useFlowMusic';

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
  /** 专注完成绽放触发（Chronos 时间生物） */
  bloom?: boolean;
  /** 环境光亮度 0-1（P2 暗环境自发光补偿） */
  ambientLight?: number;
  /** Chronos 生物形态开关（缺省 true，关闭回退经典环） */
  chronosEnabled?: boolean;
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
  bloom = false,
  ambientLight = 0.5,
  chronosEnabled = true,
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
    skip,
  } = usePomodoroStore(useShallow(s => s));

  // Chronos 点击交互（时间生物 = 核心交互点）：
  // 专注 → 暂停/继续；休息 → 提前结束休息；长按 → 沉睡
  const handleChronosTap = () => {
    if (phase === 'work') {
      if (isRunning) pause();
      else resume();
    } else {
      skip();
    }
  };
  const handleChronosLongPress = () => {
    reset();
  };

  // 背景音偏好：外部传入优先（向后兼容），缺省读全局音频偏好 store
  const storePrefs = useAudioPrefsStore();
  const effectiveWhiteNoiseEnabled = whiteNoiseEnabled ?? storePrefs.whiteNoiseEnabled;
  const effectiveWhiteNoiseVolume = whiteNoiseVolume ?? storePrefs.whiteNoiseVolume;
  const effectiveToggleWhiteNoise = onToggleWhiteNoise ?? storePrefs.toggleWhiteNoise;
  const effectiveWhiteNoiseVolumeChange = onWhiteNoiseVolume ?? storePrefs.setWhiteNoiseVolume;

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

  const isBreak = phase === 'short_break' || phase === 'long_break';

  // 经典环呼吸动画参数（chronosEnabled=false 时回退）
  const breatheAnimation = prefersReduced
    ? {}
    : {
        scale: [1, 1.02, 1],
        transition: {
          duration: BEAT.x5 / 100,
          repeat: Infinity,
          ease: 'easeInOut' as const,
        },
      };

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
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.3 }}
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

      {/* 中央计时器区域 — Chronos 时间生物（可回退经典环） */}
      {chronosEnabled ? (
        <ChronosCanvas
          mode="full"
          phase={phase}
          isRunning={isRunning}
          remainingSeconds={remainingSeconds}
          started
          intensity={focusScore > 0 ? focusScore : 50}
          ambientLight={ambientLight}
          bloom={bloom}
          onTap={handleChronosTap}
          onLongPress={handleChronosLongPress}
          timeStr={timeStr}
        />
      ) : (
        <ImmersiveRing progress={progress} timeStr={timeStr} label={label} breatheAnimation={breatheAnimation} />
      )}

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
      <ImmersiveControls
        whiteNoiseEnabled={effectiveWhiteNoiseEnabled}
        whiteNoiseVolume={effectiveWhiteNoiseVolume}
        onToggleWhiteNoise={effectiveToggleWhiteNoise}
        onWhiteNoiseVolume={effectiveWhiteNoiseVolumeChange}
        isRunning={isRunning}
        onPause={pause}
        onResume={resume}
        onReset={reset}
      />
    </div>
  );
}
