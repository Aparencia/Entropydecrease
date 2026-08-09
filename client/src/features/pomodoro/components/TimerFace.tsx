/**
 * TimerFace — 番茄钟高频区（表盘 + 时间生物 + 卫星控制）
 *
 * @ai-context: P0-2 组件边界隔离——remainingSeconds 每秒 tick 只触发本组件
 * 重渲染，页面主体（header/PresetTabs/弹窗/庆祝层）零重渲染。
 * Chronos 点击/右键/长按交互状态机与冷启动判定随迁至此。
 * 文档标题 effect 也随迁：其依赖 remainingSeconds（每秒变化），留在页面
 * 会迫使页面每秒重渲染。
 *
 * @ai-context: 高频订阅（remainingSeconds）与中低频订阅（phase/isRunning/
 * isArmed/completedCount 等）同处本组件，组件每秒重渲染不可避免；
 * 收益在于页面其余子树（PresetTabs/GoalInput/CompletionCelebration）不再
 * 被 tick 波及。ChronosCanvas 由页面层 React.memo 包裹，非 tick 变化
 * （completedCount/currentGoal 等）不会触发粒子容器 reconcile。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { toChronosState } from './chronos/chronosState';
import { isColdStart } from '../store/pomodoroStoreTypes';
import { CHRONOS_PALETTES } from './chronos/chronosStyles';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { ChronosCanvas } from './chronos/ChronosCanvas';
import { ChronosStateRow } from './chronos/ChronosStateRow';
import CycleMarkers from './CycleMarkers';
import { PomodoroControls } from './PomodoroControls';
import { SPRING } from '@/lib/animation/springConfig';

/** hex 颜色转 rgba（氛围层透明度用） */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function TimerFace() {
  // ── 高频（每秒变化）：remainingSeconds ──
  const remainingSeconds = usePomodoroStore((s) => s.remainingSeconds);
  const totalSeconds = usePomodoroStore((s) => s.totalSeconds);
  // ── 中低频状态 ──
  const phase = usePomodoroStore((s) => s.phase);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const isArmed = usePomodoroStore((s) => s.isArmed);
  const isStepDive = usePomodoroStore((s) => s.isStepDive);
  const completedCount = usePomodoroStore((s) => s.completedCount);
  const currentGoal = usePomodoroStore((s) => s.currentGoal);
  const activePreset = usePomodoroStore((s) => s.activePreset);
  const settings = usePomodoroStore((s) => s.settings);
  const lastActivityAt = usePomodoroStore((s) => s.lastActivityAt);
  // ── 动作（稳定引用，变化不触发重渲染）──
  const setRitualSkipped = usePomodoroStore((s) => s.setRitualSkipped);
  const start = usePomodoroStore((s) => s.start);
  const awaken = usePomodoroStore((s) => s.awaken);
  const startStepDive = usePomodoroStore((s) => s.startStepDive);
  const startBreathingDive = usePomodoroStore((s) => s.startBreathingDive);
  const skipBreathingDive = usePomodoroStore((s) => s.skipBreathingDive);
  const resume = usePomodoroStore((s) => s.resume);
  const skip = usePomodoroStore((s) => s.skip);
  const reset = usePomodoroStore((s) => s.reset);
  const enterImmersive = usePomodoroStore((s) => s.enterImmersive);

  // 冷启动判定：距上次番茄活动超过 24h（或从未使用）→ 沉睡点击清计数重新开始
  const coldStart = isColdStart(lastActivityAt);

  // ── Chronos 点击交互（时间生物 = 核心交互点）──
  // 沉睡 → awaken 进呼吸态（启动 30s 迈步倒计时）
  // 呼吸态运行中 → 跳过呼吸直接进入专注（呼吸缓解恢复原专注）
  // 专注运行中 → 进入呼吸缓解（30s 呼吸态，结束后恢复专注）
  // 暂停 → 继续；休息 → 提前结束
  const handleChronosTap = useCallback(() => {
    if (isRunning || isPaused) {
      if (phase === 'work') {
        if (isRunning) {
          if (isStepDive) {
            // 呼吸态（迈步/呼吸缓解）运行中 → 跳过呼吸直接进入专注
            skipBreathingDive();
          } else {
            // 专注运行中 → 进入呼吸缓解（30s 呼吸态，结束后恢复专注）
            startBreathingDive();
          }
        } else {
          resume();
        }
      } else {
        skip(); // 休息阶段点击提前结束休息
      }
    } else if (isArmed) {
      // 呼吸态待开始：启动 30s 迈步（呼吸准备环节，迈步完成无缝衔接完整专注）
      startStepDive();
    } else {
      // 沉睡：冷启动清计数重新开始，再进入呼吸态
      if (coldStart) usePomodoroStore.getState().reset();
      awaken();
    }
  }, [isRunning, isPaused, isArmed, phase, isStepDive, coldStart, startBreathingDive, skipBreathingDive, resume, skip, startStepDive, awaken]);

  // 右键点击生物：运行/暂停/休息时进入沉浸模式（提示词引导）
  const handleChronosContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isRunning || isPaused || phase !== 'work') {
      enterImmersive();
    }
  }, [isRunning, isPaused, phase, enterImmersive]);
  // 长按 → 进入沉睡（重置）
  const handleChronosLongPress = useCallback(() => {
    reset();
  }, [reset]);

  // 文档标题（每秒 tick 驱动）：依赖 remainingSeconds，必须留在此高频区
  useEffect(() => {
    if (isRunning || isPaused) {
      const m = Math.floor(remainingSeconds / 60);
      const s = remainingSeconds % 60;
      const phaseLabel = phase === 'work' ? '专注' : phase === 'short_break' ? '短休' : '长休';
      document.title = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} - ${phaseLabel} | 深潜`;
    } else {
      document.title = '深潜 - 熵减';
    }
    // cleanup 与上方 effect 分离：仅卸载时恢复默认标题，
    // 避免每秒 tick 依赖变化时先 cleanup（置 '熵减'）再重设造成的标题闪烁
  }, [remainingSeconds, phase, isRunning, isPaused]);

  useEffect(() => {
    return () => { document.title = '熵减'; };
  }, []);

  // 氛围随状态呼吸（深/浅差异化）：deep-sea 浓（压暗+状态色微光）、aurora 淡（通透）
  const theme = useSceneTheme();
  const chronosState = toChronosState({ isArmed, isRunning, isPaused, phase });
  const ambientColor = CHRONOS_PALETTES[theme][chronosState].glow;
  const ambientIntensity = theme === 'deep-sea' ? 0.5 : 0.12;

  // 状态行引导语（沉眠用默认"点击激活"；呼吸态=已激活待开始；专注→暂停/右键沉浸）
  const stateHint = chronosState === 'breathing'
    ? (isRunning ? '仪式进行中' : '点击跳过仪式 · 等待自动开始')
    : chronosState === 'focus'
      ? '点击暂停 · 右键沉浸 · 长按放弃'
      : undefined;

  // 呼吸态 1 分钟超时自动进入专注（跳过仪式，不计入计数）
  useEffect(() => {
    if (chronosState !== 'breathing' || isRunning || isPaused) return;
    const timer = setTimeout(() => {
      setRitualSkipped(true);
      start();
    }, 60000);
    return () => clearTimeout(timer);
  }, [chronosState, isRunning, isPaused, setRitualSkipped, start]);

  // 卫星轨道半径（px）= 生物容器实际宽度 / 2 × 1.45，使用 Ref + ResizeObserver 确保准确
  const containerRef = useRef<HTMLDivElement>(null);
  const [orbitRadius, setOrbitRadius] = useState(180);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      if (w > 0) setOrbitRadius(w / 2 * 1.45);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 循环标记数据 — 由活动预设的 longBreakInterval 驱动
  const cycleTotal = activePreset?.longBreakInterval ?? settings.longBreakInterval;

  const timeStr = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center relative">
      {/* 氛围层：随生物状态呼吸（deep-sea 浓 / aurora 淡，需求 2 差异化） */}
      <div
        className="absolute inset-0 pointer-events-none transition-[background] duration-1000"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${hexToRgba(ambientColor, ambientIntensity)} 0%, transparent 70%)` }}
      />
      {currentGoal && (
        <motion.p
          className="text-[12px] text-text-tertiary/70 text-center mb-2 truncate max-w-[280px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {currentGoal}
        </motion.p>
      )}
      <motion.div
        className="relative flex flex-col items-center w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, ...SPRING.gentle }}
      >
        <div ref={containerRef} className="relative mx-auto">
          <ChronosCanvas
            mode="compact"
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
            onContextMenu={handleChronosContextMenu}
            timeStr={timeStr}
          />
          {/* 卫星控制轨道：与生物共享居中上下文，轨道圆心 = 粒子球中心 */}
          <div className="absolute inset-0 pointer-events-none">
            <PomodoroControls orbitRadius={orbitRadius} />
          </div>
          {/* 待开始态快捷入口：跳过呼吸仪式直接开始（仅呼吸态=已激活且非暂停时显示） */}
          {isArmed && !isRunning && !isPaused && phase === 'work' && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[clamp(0.1rem,0.5vh,0.5rem)] z-10">
              <motion.button
                onClick={skipBreathingDive}
                className="px-2.5 py-0.5 rounded-full bg-bg-elevated/70 backdrop-blur-sm border border-border/20 text-[11px] text-text-tertiary/80 hover:text-text-primary hover:border-border/40 transition-colors"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                跳过仪式 · 直接开始
              </motion.button>
            </div>
          )}
        </div>
        {/* 状态行：生物下方（提示语不再覆盖球体；hint 随冷/热启动与迈步态动态变化） */}
        <ChronosStateRow
          input={{ isArmed, isRunning, isPaused, phase }}
          hint={stateHint}
          className="mt-[clamp(0.25rem,1vh,0.75rem)]"
        />
        {/* 循环标记：融入轨道（状态行下方） */}
        <CycleMarkers
          total={cycleTotal}
          filled={completedCount}
          className="mt-[clamp(0.15rem,0.6vh,0.5rem)]"
        />
      </motion.div>
    </div>
  );
}
