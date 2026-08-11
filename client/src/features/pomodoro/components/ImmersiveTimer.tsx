/**
 * ImmersiveTimer — 「潮汐穹顶」沉浸模式
 *
 * 全屏渐变色场背景（随进度变化），
 * 中央 Chronos 时间生物（full 模式）+ 底部极简 icon-only 操作（ImmersiveControls）。
 *
 * @ai-context: 3.8 心流音乐引擎 + 3.13 具身学习休息引导集成于此；
 * 底部操作区已拆至 ImmersiveControls（单文件 ≤300 行规范）。
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { BEAT } from '@/lib/animation/springConfig';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { AnchorReminderOverlay } from './AnchorReminderOverlay';
import { ChronosCanvas } from './chronos/ChronosCanvas';
import { ChronosStateRow } from './chronos/ChronosStateRow';
import { toChronosState } from './chronos/chronosState';
import { ImmersiveControls } from './ImmersiveControls';
import { useFlowMusic } from '@/hooks/useFlowMusic';

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
  // P0-1 细粒度订阅：整 store 订阅（useShallow(s => s)）会在任何字段变化时
  // 重渲染沉浸层；remainingSeconds 每秒 tick 不可避免，但其余字段独立订阅
  // 避免 settings/presets 等无关变化波及本层
  const remainingSeconds = usePomodoroStore((s) => s.remainingSeconds);
  const totalSeconds = usePomodoroStore((s) => s.totalSeconds);
  const phase = usePomodoroStore((s) => s.phase);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const isArmed = usePomodoroStore((s) => s.isArmed);
  const activePreset = usePomodoroStore((s) => s.activePreset);
  const isStepDive = usePomodoroStore((s) => s.isStepDive);
  const currentGoal = usePomodoroStore((s) => s.currentGoal);
  // 动作（稳定引用）
  const pause = usePomodoroStore((s) => s.pause);
  const startBreathingDive = usePomodoroStore((s) => s.startBreathingDive);
  const skipBreathingDive = usePomodoroStore((s) => s.skipBreathingDive);
  const resume = usePomodoroStore((s) => s.resume);
  const reset = usePomodoroStore((s) => s.reset);
  const skip = usePomodoroStore((s) => s.skip);

  // Chronos 点击交互（设计详解状态机）：
  // 专注 → 呼吸缓解（30s）/继续；呼吸(运行中) → 跳过呼吸直接专注；休息 → 提前结束；长按 → 沉睡
  const handleChronosTap = () => {
    const cs = toChronosState({ isArmed, isRunning, isPaused, phase, isStepDive });
    if (cs === 'focus') {
      if (isRunning) startBreathingDive();
      else resume();
    } else if (cs === 'breathing') {
      // 呼吸态（迈步/呼吸缓解）运行中 → 跳过呼吸直接进入专注
      if (isRunning) skipBreathingDive();
      else resume();
    } else if (cs === 'short_break' || cs === 'long_break') {
      skip();
    }
    // asleep 在沉浸模式不应出现（进入沉浸必经运行/暂停），忽略
  };
  const handleChronosLongPress = () => {
    reset();
  };

  // 空格键暂停/继续（排除输入框聚焦场景）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (phase !== 'work') return;
      e.preventDefault();
      if (isRunning) pause();
      else if (isPaused) resume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, isRunning, isPaused, pause, resume]);

  // 背景音偏好：外部传入优先（向后兼容），缺省读全局音频偏好 store
  const storePrefs = useAudioPrefsStore();
  const effectiveWhiteNoiseEnabled = whiteNoiseEnabled ?? storePrefs.whiteNoiseEnabled;
  const effectiveWhiteNoiseVolume = whiteNoiseVolume ?? storePrefs.whiteNoiseVolume;
  const effectiveToggleWhiteNoise = onToggleWhiteNoise ?? storePrefs.toggleWhiteNoise;
  const effectiveWhiteNoiseVolumeChange = onWhiteNoiseVolume ?? storePrefs.setWhiteNoiseVolume;

  // 时间显示 5s：阶段开头（remaining === total）触发（覆盖运行起始沿与 store 恢复运行态）。
  // timer 存 ref：effect 依赖每秒变化的 remainingSeconds，局部变量 timer 会被每秒
  // 重跑的 effect cleanup 清除（时间永不隐藏）
  const [showTime, setShowTime] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (totalSeconds > 0 && remainingSeconds === totalSeconds) {
      setShowTime(true);
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      showTimerRef.current = setTimeout(() => setShowTime(false), 5000);
    }
  }, [remainingSeconds, totalSeconds]);
  useEffect(() => () => { if (showTimerRef.current) clearTimeout(showTimerRef.current); }, []);

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

  const backgroundGradient = useMemo(
    () => getBackgroundGradient(progressPercent),
    [progressPercent],
  );

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

      {/* 中央计时器区域 — Chronos 时间生物（唯一形态） */}
      <ChronosCanvas
        mode="full"
        phase={phase}
        isRunning={isRunning}
        isPaused={isPaused}
        isArmed={isArmed}
        remainingSeconds={remainingSeconds}
        totalSeconds={totalSeconds}
        isStepDive={isStepDive}
        mood={activePreset?.mood}
        onTap={handleChronosTap}
        onLongPress={handleChronosLongPress}
        showTime={showTime}
        timeStr={timeStr}
      />
      {/* 状态行（沉浸深色背景专用变体）：仅 work 阶段显示（休息时由活动建议卡占据该区域） */}
      {phase === 'work' && (
        <ChronosStateRow
          input={{ isArmed, isRunning, isPaused, phase }}
          variant="immersive"
          hint={isRunning ? '点击调整一下 · 空格暂停 · 长按放弃' : '点击继续'}
          className="absolute bottom-32 left-0 right-0"
        />
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
