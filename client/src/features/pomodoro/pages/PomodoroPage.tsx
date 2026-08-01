/**
 * @ai-context: pomodoro 功能模块页面：PomodoroPage。
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Pause, RotateCcw, SkipForward, Clock, Volume2, VolumeX, Focus, Plus, GraduationCap, BookOpen, PenLine, BookMarked, Brain, Timer, Moon, Coffee, Dumbbell, Music, Languages, Calculator, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/storage';
import TimerRing from '../components/TimerRing';
import GoalInput from '../components/GoalInput';
import ImmersiveTimer from '../components/ImmersiveTimer';
import SlideToExit from '../components/SlideToExit';
import CycleMarkers from '../components/CycleMarkers';
import PresetEditor from '../components/PresetEditor';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useAudioPlayer } from '@/lib/audio/useAudioPlayer';
import { audioTracks, loadAudioPreferences, saveAudioPreferences } from '@/lib/audio/audioConfig';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePomodoroEffects } from '../hooks/usePomodoroEffects';
import { SPRING } from '@/lib/animation/springConfig';
import { MAX_PRESETS } from '../lib/presetService';
import type { AudioPreferences } from '@/lib/audio/audioConfig';

const WHITE_NOISE_FADE_MS = 1000;
const WHITE_NOISE_FADE_OUT_MS = 1500;
const TIMER_TICK_INTERVAL_MS = 1000;

/** 预设图标映射（lucide 图标名 → 组件） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRESET_ICONS: Record<string, React.ComponentType<any>> = {
  GraduationCap, BookOpen, PenLine, BookMarked, Brain, Timer,
  Moon, Coffee, Dumbbell, Music, Languages, Calculator, Microscope,
};

export default function PomodoroPage() {
  const {
    phase, isRunning, isPaused, remainingSeconds, totalSeconds,
    completedCount, settings, currentGoal, isImmersive,
    activePreset, presets,
    start, pause, resume, reset, skip, setPreset, setCurrentGoal,
    enterImmersive, exitImmersive, tick, createPreset,
  } = usePomodoroStore(useShallow(s => s));

  usePomodoroEffects();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [rememberGoal, setRememberGoal] = useState(false);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);

  // ── 白噪音 ──
  const [audioPrefs, setAudioPrefs] = useState<AudioPreferences>(() => loadAudioPreferences());
  const whiteNoiseTrack = useMemo(
    () => audioTracks.find((t) => t.id === audioPrefs.whiteNoiseTrackId) ?? audioTracks[0],
    [audioPrefs.whiteNoiseTrackId],
  );
  const whiteNoisePlayer = useAudioPlayer({
    src: whiteNoiseTrack.src, volume: audioPrefs.whiteNoiseVolume,
    loop: true, fadeInMs: WHITE_NOISE_FADE_MS, fadeOutMs: WHITE_NOISE_FADE_OUT_MS,
  });

  useEffect(() => {
    if (isRunning && phase === 'work' && audioPrefs.whiteNoiseEnabled) {
      whiteNoisePlayer.play();
    } else {
      whiteNoisePlayer.pause();
    }
  }, [isRunning, phase, audioPrefs.whiteNoiseEnabled]); // eslint-disable-line

  const toggleWhiteNoise = () => {
    const next = { ...audioPrefs, whiteNoiseEnabled: !audioPrefs.whiteNoiseEnabled };
    setAudioPrefs(next); saveAudioPreferences(next);
  };
  const handleWhiteNoiseVolume = (vol: number) => {
    const next = { ...audioPrefs, whiteNoiseVolume: vol };
    setAudioPrefs(next); saveAudioPreferences(next);
    whiteNoisePlayer.setVolume(vol);
  };

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => tick(), TIMER_TICK_INTERVAL_MS);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, tick]);

  useEffect(() => {
    if (isRunning || isPaused) {
      const m = Math.floor(remainingSeconds / 60);
      const s = remainingSeconds % 60;
      const phaseLabel = phase === 'work' ? '专注' : phase === 'short_break' ? '短休' : '长休';
      document.title = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} - ${phaseLabel} | 深潜`;
    } else {
      document.title = '深潜 - 熵减';
    }
    return () => { document.title = '熵减'; };
  }, [remainingSeconds, phase, isRunning, isPaused]);

  const handleMainButton = () => {
    if (isRunning) pause();
    else if (isPaused) resume();
    else setGoalModalOpen(true);
  };

  /**
   * 提交目标并开始番茄。goal 为空字符串时表示“跳过目标”：
   * 仍然启动计时，但不记录目标（currentGoal 置 null，也不写目标记忆库）。
   */
  const handleGoalSubmit = async (goal: string) => {
    setCurrentGoal(goal || null);
    setGoalModalOpen(false);
    // 使用微任务确保上述setState完成后再触发store更新
    await Promise.resolve();
    start();
    enterImmersive();
    if (rememberGoal && goal) {
      try {
        const existing = await db.pomodoroGoals.where('text').equals(goal).first();
        if (existing) {
          await db.pomodoroGoals.update(existing.id, { useCount: existing.useCount + 1, lastUsedAt: new Date() });
        } else {
          await db.pomodoroGoals.add({ id: crypto.randomUUID(), text: goal, useCount: 1, lastUsedAt: new Date() });
        }
      } catch (e) { console.error('[Pomodoro] Failed to save goal:', e); }
    }
  };

  const mainButtonIcon = isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />;
  const prefersReduced = useReducedMotion();

  const immersiveEnter = prefersReduced ? {} : { opacity: 0, scale: 0.9 };
  const immersiveAnimate = { opacity: 1, scale: 1 };
  const immersiveExit = prefersReduced ? {} : { opacity: 0, scale: 0.95 };
  const immersiveTransition = prefersReduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const };

  // 循环标记数据 — 由活动预设的 longBreakInterval 驱动
  const cycleTotal = activePreset?.longBreakInterval ?? settings.longBreakInterval;

  return (
    <>
      {/* 沉浸模式 — portal 到 body，AnimatePresence 在 portal 内部管理动效 */}
      {createPortal(
        <AnimatePresence>
          {isImmersive && (
            <motion.div
              key="immersive"
              className="fixed inset-0 z-40 flex flex-col overflow-hidden"
              initial={immersiveEnter}
              animate={immersiveAnimate}
              exit={immersiveExit}
              transition={immersiveTransition}
            >
              <div className="absolute top-6 left-0 right-0 z-10"><SlideToExit onExit={exitImmersive} /></div>
              <ImmersiveTimer
                whiteNoiseEnabled={audioPrefs.whiteNoiseEnabled}
                whiteNoiseVolume={audioPrefs.whiteNoiseVolume}
                onToggleWhiteNoise={toggleWhiteNoise}
                onWhiteNoiseVolume={handleWhiteNoiseVolume}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* 普通模式 */}
      <AnimatePresence mode="popLayout">
      {!isImmersive && (
        <motion.div
          key="normal"
          className="flex flex-col items-center justify-center min-h-0 flex-1 px-4 py-12 relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 背景环境光 — 由3D场景提供，已移除 */}

          {/* Preset tabs — 横向滚动预设列表 */}
          <motion.div
            className="flex items-center gap-0.5 p-1 bg-bg-secondary/60 backdrop-blur-sm rounded-full border border-border/20 max-w-full overflow-x-auto"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ...SPRING.gentle }}
          >
            {presets.map((preset) => {
              const Icon = PRESET_ICONS[preset.icon] ?? BookOpen;
              const isActive = activePreset?.id === preset.id;
              return (
                <motion.button
                  key={preset.id}
                  onClick={() => setPreset(preset.id)}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    'relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-300 whitespace-nowrap',
                    isActive
                      ? 'text-white shadow-[0_2px_12px_rgba(91,138,114,0.3)]'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="pomo-mode-bg"
                      className="absolute inset-0 rounded-full bg-brand-500"
                      transition={SPRING.default}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                    {preset.name}
                    <span className={cn('text-[10px] opacity-60', isActive && 'opacity-80')}>· {preset.workDuration}min</span>
                  </span>
                </motion.button>
              );
            })}
            {/* "+" 快捷创建预设入口（达上限时隐藏） */}
            {presets.length < MAX_PRESETS && (
              <motion.button
                onClick={() => setPresetEditorOpen(true)}
                whileTap={{ scale: 0.9 }}
                className="flex items-center justify-center w-8 h-8 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/60 transition-all duration-200 flex-shrink-0"
                aria-label="新建预设"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
              </motion.button>
            )}
          </motion.div>

          {/* 预设提示 */}
          <motion.div
            className="mt-3 flex items-center gap-1.5 text-[12px] text-text-secondary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>
              {activePreset
                ? activePreset.longBreakInterval === 0
                  ? `课堂 ${activePreset.workDuration}min · 短休 ${activePreset.shortBreakDuration}min`
                  : `专注 ${activePreset.workDuration}min · 每 ${activePreset.longBreakInterval} 个番茄长休`
                : `专注 ${settings.workDuration}min`}
            </span>
          </motion.div>

          <div className="flex-1 min-h-[3rem]" />

          {/* Timer Ring */}
          <motion.div
            className="my-8 relative"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, ...SPRING.gentle }}
          >
            {currentGoal && (
              <motion.p
                className="text-[12px] text-text-tertiary/70 text-center mb-3 truncate max-w-[280px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                {currentGoal}
              </motion.p>
            )}
            <TimerRing
              totalSeconds={totalSeconds}
              remainingSeconds={remainingSeconds}
              phase={phase}
              isRunning={isRunning}
            />
          </motion.div>

          {/* 循环标记 — 数量随预设变化 */}
          <CycleMarkers
            total={cycleTotal}
            filled={completedCount}
            className="mb-8"
          />

          {/* 白噪音控制 */}
          <motion.div
            className="flex items-center gap-2 mb-8 px-4 py-2 bg-bg-elevated/40 backdrop-blur-sm rounded-full border border-border/20"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleWhiteNoise}
              className={cn(
                'p-1.5 rounded-full transition-all duration-200',
                audioPrefs.whiteNoiseEnabled ? 'text-brand-500' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {audioPrefs.whiteNoiseEnabled
                ? <Volume2 className="w-4 h-4" strokeWidth={1.5} />
                : <VolumeX className="w-4 h-4" strokeWidth={1.5} />}
            </motion.button>
            <span className="text-[11px] text-text-tertiary select-none">{whiteNoiseTrack.nameZh}</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={audioPrefs.whiteNoiseVolume}
              onChange={(e) => handleWhiteNoiseVolume(parseFloat(e.target.value))}
              className="w-16 h-1 accent-brand-500 cursor-pointer"
            />
          </motion.div>

          {/* Controls — 居中大按钮 + 品牌色光晕 */}
          <motion.div
            className="flex items-center gap-4 mb-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, ...SPRING.gentle }}
          >
            <motion.button
              whileTap={{ scale: 0.9, rotate: -180 }}
              onClick={reset}
              className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:border-border/50 transition-all duration-200"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05, boxShadow: '0 8px 32px rgba(91,138,114,0.45)' }}
              whileTap={{ scale: 0.97 }}
              onClick={handleMainButton}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center',
                'bg-brand-500 text-white',
                'shadow-[0_4px_20px_rgba(91,138,114,0.35),0_0_40px_rgba(91,138,114,0.15)]',
                'transition-shadow duration-300',
              )}
            >
              {mainButtonIcon}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9, x: 3 }}
              onClick={skip}
              className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:border-border/50 transition-all duration-200"
            >
              <SkipForward className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
          </motion.div>

          {/* 沉浸模式入口 */}
          {(isRunning || isPaused) && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => enterImmersive()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-secondary/40 transition-all duration-200 mb-6"
            >
              <Focus className="w-4 h-4" strokeWidth={1.5} />
              进入专注模式
            </motion.button>
          )}

          <GoalInput
            open={goalModalOpen}
            onClose={() => setGoalModalOpen(false)}
            onSubmit={handleGoalSubmit}
            rememberGoal={rememberGoal}
            onRememberChange={setRememberGoal}
          />

          {/* 预设快捷创建弹窗 */}
          <PresetEditor
            open={presetEditorOpen}
            onClose={() => setPresetEditorOpen(false)}
            onSave={async (data) => {
              const preset = await createPreset(data);
              setPreset(preset.id);
            }}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
