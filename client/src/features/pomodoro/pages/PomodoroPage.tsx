/**
 * @ai-context: pomodoro 功能模块页面：PomodoroPage。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { db } from '@/lib/storage';
import TimerRing from '../components/TimerRing';
import GoalInput from '../components/GoalInput';
import ImmersiveTimer from '../components/ImmersiveTimer';
import SlideToExit from '../components/SlideToExit';
import CycleMarkers from '../components/CycleMarkers';
import PresetEditor from '../components/PresetEditor';
import PresetTabs from '../components/PresetTabs';
import { CompletionCelebration } from '../components/CompletionCelebration';
import { EnergySuggestionBar } from '../components/EnergySuggestionBar';
import { PomodoroControls } from '../components/PomodoroControls';
import { usePomodoroStore, usePomodoroActionSignal } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { wellbeingEventBus } from '@/lib/wellbeing/wellbeingEventBus';
import { useEcosystemStore } from '@/features/retention/store/useEcosystemStore';
import { calculateDepth } from '@/features/retention/lib/coralEngine';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePomodoroEffects } from '../hooks/usePomodoroEffects';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import DiveBackground from '../components/DiveBackground';
import { SPRING } from '@/lib/animation/springConfig';
import { MAX_PRESETS } from '../lib/presetService';

export default function PomodoroPage() {
  const navigate = useNavigate();
  const {
    phase, isRunning, isPaused, remainingSeconds, totalSeconds,
    completedCount, settings, currentGoal, isImmersive,
    activePreset, presets,
    start, setPreset, setCurrentGoal,
    exitImmersive, createPreset,
    showCompletionOverlay, dismissCompletionOverlay, lastSessionActualDuration,
  } = usePomodoroStore(useShallow(s => s));

  usePomodoroEffects();

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [rememberGoal, setRememberGoal] = useState(false);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);

  // 设备降级级别推导（与萤火海沟/沉浸模式同源：L0 全量 / L1 低端 / L2 减弱动效）
  const { shouldDisableHeavyAnimations, prefersReducedMotion } = useDeviceCapability();
  const diveDegradation = prefersReducedMotion ? 'L2' : shouldDisableHeavyAnimations ? 'L1' : 'L0';

  // ── 守护灵分心分数（体验增强：心流音乐联动，开关 guardianLinkEnabled）──
  // App 级 useFocusGuardian 在等级变化时经事件总线广播分数，此处只订阅不采集
  const [focusScore, setFocusScore] = useState(0);
  useEffect(() => {
    return wellbeingEventBus.on('focus:level-changed', (ctx) => {
      if (typeof ctx.score === 'number') setFocusScore(ctx.score);
    });
  }, []);

  // ── 休息记忆重放（体验增强，开关 breakReplayEnabled）：──
  // 工作阶段完成时从目标提取关键词，供沉浸模式休息期间展示（M4 清醒期重放）
  const lastKeywordsRef = useRef<string[]>([]);
  const pomoSignal = usePomodoroActionSignal();
  useEffect(() => {
    if (pomoSignal.lastAction === 'phase_complete' && pomoSignal.lastCompletedPhase === 'work') {
      lastKeywordsRef.current = extractGoalKeywords(pomoSignal.currentGoal);
    }
  }, [pomoSignal.lastAction, pomoSignal.lastActionCounter, pomoSignal.lastCompletedPhase, pomoSignal.currentGoal]);

  // 庆祝层累计深度：统一读取珊瑚生态真实深度（原实现基于回绕的 completedCount
  // 伪算，每轮长休归零后"累计深度"会倒退）
  const totalDepth = useEcosystemStore((s) => s.totalDepth);

  // @ai-context: tick 驱动已上移至全局调度器 pomodoroScheduler.ts（App 启动时注册），
  // 不再由本页面组件级 setInterval 驱动——切离页面后计时仍持续推进

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

  // P3-19 稳定回调引用，供 memo 化的 PresetTabs 避免每秒重渲染
  const openPresetEditor = useCallback(() => setPresetEditorOpen(true), []);
  // 预设管理入口：跳转深潜设置页（删除/排序/编辑预设）
  const managePresets = useCallback(() => navigate('/pomodoro/settings'), [navigate]);

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
    // 不再强制进入沉浸模式：是否沉浸由用户自行选择（普通视图有"进入专注模式"入口）
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

  const prefersReduced = useReducedMotion();

  const immersiveEnter = prefersReduced ? {} : { opacity: 0, scale: 0.9 };
  const immersiveAnimate = { opacity: 1, scale: 1 };
  const immersiveExit = prefersReduced ? {} : { opacity: 0, scale: 0.95 };
  const immersiveTransition = prefersReduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const };

  // 循环标记数据 — 由活动预设的 longBreakInterval 驱动
  const cycleTotal = activePreset?.longBreakInterval ?? settings.longBreakInterval;

  // 双模式过渡排序：沉浸层（portal）与普通视图分属两个独立 AnimatePresence 实例，
  // mode="wait" 跨实例无效——此前切换时沉浸退场(0.5s)与普通进场(0.3s)同屏叠加
  // 约 0.6s，表现为组件重复的双曝光残帧。此处用视图状态机显式串行化
  // “新视图必须等旧视图退场动画完成后才进场”：切换期间仅渲染旧视图退场动画，
  // onExitComplete 后再迁至目标视图。全部动画参数保留，仅消除叠加。
  const [view, setView] = useState<'normal' | 'immersive' | 'switching-to-immersive' | 'switching-to-normal'>(
    () => (isImmersive ? 'immersive' : 'normal'),
  );

  useEffect(() => {
    if (isImmersive) {
      // 'switching-to-normal' → 'immersive'：沉浸退场中用户又重新进入，直接重新挂载
      setView(v => (v === 'immersive' || v === 'switching-to-immersive')
        ? v
        : v === 'switching-to-normal' ? 'immersive' : 'switching-to-immersive');
    } else {
      setView(v => (v === 'normal' || v === 'switching-to-normal')
        ? v
        : v === 'switching-to-immersive' ? 'normal' : 'switching-to-normal');
    }
  }, [isImmersive]);

  return (
    <>
      {/* 沉浸层 — createPortal 挂到 body（z-40 盖住覆盖层）；挂载时机由上方视图状态机门控 */}
      {createPortal(
        <AnimatePresence onExitComplete={() => setView(v => (v === 'switching-to-normal' ? 'normal' : v))}>
          {view === 'immersive' && (
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
                // 背景音偏好由 ImmersiveTimer 内部读全局音频 store
                // 创新功能接线（开关在 深潜设置 → 体验增强，全部缺省关闭）：
                // M4 清醒期重放 / 守护灵分心联动 / 心流音乐
                lastSessionKeywords={settings.breakReplayEnabled ? lastKeywordsRef.current : undefined}
                focusScore={settings.guardianLinkEnabled ? focusScore : 0}
                flowMusicEnabled={settings.flowMusicEnabled}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* 普通视图 — 仅在沉浸层退场完成后（或初始即普通模式时）挂载 */}
      <AnimatePresence mode="popLayout" onExitComplete={() => setView(v => (v === 'switching-to-immersive' ? 'immersive' : v))}>
        {view === 'normal' && (
        <motion.div
          key="normal"
          /* 响应式一屏适配：页面高度锚定视口（clamp 兼顾小窗口下限与大屏上限），
             内部按 顶部信息 / 中部表盘(flex-1 吸收剩余空间) / 底部控制 三段弹性布局，
             全部纵向间距用 vh clamp 随窗口缩放，任何窗口尺寸下均无需滚动 */
          className="flex flex-col items-center min-h-0 flex-1 px-4 relative h-[clamp(320px,calc(85vh-5rem),760px)] max-h-full pt-[clamp(0.5rem,2.5vh,3rem)] pb-[clamp(0.5rem,1.8vh,1.5rem)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 深潜氛围背景：垂直深度渐变 + 上浮气泡（浅色晨光海面 / 深色深海） */}
          <DiveBackground degradation={diveDegradation} />

          {/* 仪式页头：模块色「潜」印 + 衬线大字（间距随视口高度缩放） */}
          <header className="relative z-10 flex items-center gap-3 mb-[clamp(0.375rem,1.8vh,2rem)]">
            <div className="kb-dive-seal shrink-0" aria-hidden="true">潜</div>
            <div>
              <h1 className="kb-dive-title">深潜</h1>
              <p className="kb-dive-note mt-1.5">专注即下潜 · 每一分钟都是深度</p>
            </div>
          </header>

          {/* Preset tabs — 横向滚动预设列表（P3-19 memo 化） */}
          <PresetTabs
            presets={presets}
            activePresetId={activePreset?.id}
            canCreate={presets.length < MAX_PRESETS}
            onSelect={setPreset}
            onCreate={openPresetEditor}
            onManage={managePresets}
          />

          {/* 预设提示 —— 间距随视口缩放，与上方 PresetTabs 保持一致呼吸 */}
          <motion.div
            className="mt-[clamp(0.25rem,1vh,1rem)] flex items-center gap-1.5 text-[12px] text-text-secondary"
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

          {/* T5: 精力-任务匹配提示条（未运行时展示，纯本地计算） */}
          {!isRunning && !isPaused && (
            <div className="mt-2 w-full max-w-md">
              <EnergySuggestionBar />
            </div>
          )}

          {/* 中部表盘区：flex-1 吸收剩余高度，TimerRing 随 vmin 缩放，永不溢出 */}
          <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center">
          {/* Timer Ring */}
          <motion.div
            className="relative flex flex-col items-center"
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
          </div>

          {/* 循环标记 — 数量随预设变化 */}
          <CycleMarkers
            total={cycleTotal}
            filled={completedCount}
            className="mb-[clamp(0.25rem,1.2vh,2rem)]"
          />

          {/* 白噪音 + 主控制 + 沉浸入口（拆至 PomodoroControls） */}
          <PomodoroControls onStart={() => setGoalModalOpen(true)} />

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

      {/* v0.29: 深潜完成庆祝覆盖层（累计深度统一取珊瑚生态真实值） */}
      <CompletionCelebration
        visible={showCompletionOverlay}
        durationSeconds={lastSessionActualDuration ?? (activePreset?.workDuration ?? settings.workDuration) * 60}
        goal={currentGoal}
        presetName={activePreset?.name ?? null}
        totalDepth={totalDepth}
        depthGained={calculateDepth((lastSessionActualDuration ?? (activePreset?.workDuration ?? 25) * 60) / 60)}
        onClose={dismissCompletionOverlay}
        onContinue={() => { dismissCompletionOverlay(); setGoalModalOpen(true); }}
      />
    </>
  );
}

/**
 * 从番茄目标提取关键词（休息记忆重放用）
 *
 * @ai-context: 本地规则实现，零 AI 依赖（本地优先原则）：按常见分隔符分词，
 * 过滤停用词与过短/过长的片段，去重后最多取 5 个。目标为空返回空数组。
 */
function extractGoalKeywords(goal: string | null): string[] {
  if (!goal) return [];
  const STOP_WORDS = new Set([
    '这个', '那个', '今天', '明天', '一个', '什么', '怎么', '一下', '内容', '部分',
    '进行', '复习', '学习', '完成', '单词', '笔记', '数学', '英语', '语文', '物理',
    '化学', '生物', '历史', '地理', '政治', '开始', '继续', '准备', '整理', '背诵',
    '阅读', '练习', '做题', '章节', '单元', '第一', '第二', '第三',
  ]);
  const words = goal
    .split(/[\s,，。.!！?？;；:：、/\\()（）[\]【】]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 12 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 5);
}
