/**
 * @ai-context: pomodoro 功能模块页面：PomodoroPage。
 * @ai-context: P0-1/P0-2 性能重构——整 store 订阅（useShallow(s => s)）拆为
 * 细粒度 selector；remainingSeconds 等每秒高频字段随交互状态机整体迁入
 * TimerFace 子组件，页面主体仅订阅中低频字段，tick 不再重渲染
 * header/PresetTabs/弹窗/庆祝层子树。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { db } from '@/lib/storage';
import GoalInput from '../components/GoalInput';
import ImmersiveTimer from '../components/ImmersiveTimer';
import SlideToExit from '../components/SlideToExit';
import PresetEditor from '../components/PresetEditor';
import PresetTabs from '../components/PresetTabs';
import { CompletionCelebration } from '../components/CompletionCelebration';
import { TimerFace } from '../components/TimerFace';
import { usePomodoroStore, usePomodoroActionSignal } from '../store/usePomodoroStore';
import type { PomodoroPreset } from '@/types/models';
import { wellbeingEventBus } from '@/lib/wellbeing/wellbeingEventBus';
import { useEcosystemStore } from '@/features/retention/store/useEcosystemStore';
import { calculateDepth } from '@/features/retention/lib/coralEngine';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePomodoroEffects } from '../hooks/usePomodoroEffects';
import { MAX_PRESETS } from '../lib/presetService';
import '../styles/pomodoro-dive.css';

export default function PomodoroPage() {
  const navigate = useNavigate();
  // ── P0-1 细粒度订阅：中低频字段（每秒 tick 的 remainingSeconds 等高频
  // 字段已随交互状态机迁入 TimerFace，本页不订阅）──
  const isImmersive = usePomodoroStore((s) => s.isImmersive);
  const settings = usePomodoroStore((s) => s.settings);
  const activePreset = usePomodoroStore((s) => s.activePreset);
  const presets = usePomodoroStore((s) => s.presets);
  const currentGoal = usePomodoroStore((s) => s.currentGoal);
  const showCompletionOverlay = usePomodoroStore((s) => s.showCompletionOverlay);
  const lastSessionActualDuration = usePomodoroStore((s) => s.lastSessionActualDuration);
  // ── 动作（稳定引用）──
  const setPreset = usePomodoroStore((s) => s.setPreset);
  const setCurrentGoal = usePomodoroStore((s) => s.setCurrentGoal);
  const exitImmersive = usePomodoroStore((s) => s.exitImmersive);
  const createPreset = usePomodoroStore((s) => s.createPreset);
  const updatePreset = usePomodoroStore((s) => s.updatePreset);
  const deletePreset = usePomodoroStore((s) => s.deletePreset);
  const dismissCompletionOverlay = usePomodoroStore((s) => s.dismissCompletionOverlay);

  usePomodoroEffects();

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [rememberGoal, setRememberGoal] = useState(false);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PomodoroPreset | null>(null);

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

  // 页面卸载时清掉庆祝层残留：完成瞬间切走页面，下次进入不再弹出旧庆祝层
  useEffect(() => {
    return () => { dismissCompletionOverlay(); };
  }, [dismissCompletionOverlay]);

  // P3-19 稳定回调引用，供 memo 化的 PresetTabs 避免每秒重渲染
  const openPresetEditor = useCallback(() => {
    setEditingPreset(null);
    setPresetEditorOpen(true);
  }, []);
  // 右键编辑预设
  const handleEditPreset = useCallback((preset: PomodoroPreset) => {
    setEditingPreset(preset);
    setPresetEditorOpen(true);
  }, []);
  // 右键复制为新预设
  const handleDuplicatePreset = useCallback(async (preset: PomodoroPreset) => {
    const { id: _id, builtin: _builtin, sortOrder: _sortOrder, createdAt: _createdAt, ...data } = preset;
    await createPreset({ ...data, name: `${preset.name}（副本）` });
  }, [createPreset]);
  // 右键删除预设
  const handleDeletePreset = useCallback(async (id: string) => {
    await deletePreset(id);
  }, [deletePreset]);
  // 预设管理入口：跳转深潜设置页（删除/排序/编辑预设）
  const managePresets = useCallback(() => navigate('/pomodoro/settings'), [navigate]);

  /**
   * 提交目标并开始番茄。goal 为空字符串时表示"跳过目标"：
   * 仍然启动计时，但不记录目标（currentGoal 置 null，也不写目标记忆库）。
   * 提交后以 1 分钟迈步启动（呼吸开始计时），迈步完成无缝衔接完整专注。
   */
  const handleGoalSubmit = async (goal: string) => {
    setCurrentGoal(goal || null);
    setGoalModalOpen(false);
    // store 更新为同步（zustand set 即时生效），startStepDive() 无需等待 React state 落盘
    usePomodoroStore.getState().startStepDive();
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

  // 双模式过渡排序：沉浸层（portal）与普通视图分属两个独立 AnimatePresence 实例，
  // mode="wait" 跨实例无效——此前切换时沉浸退场(0.5s)与普通进场(0.3s)同屏叠加
  // 约 0.6s，表现为组件重复的双曝光残帧。此处用视图状态机显式串行化
  // "新视图必须等旧视图退场动画完成后才进场"：切换期间仅渲染旧视图退场动画，
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

  // 沉浸模式 ESC 退出：捕获阶段监听优先于 AppLayout 全局 ESC（退出模块），
  // 避免沉浸中按 ESC 直接切走页面且 exitImmersive 未调用导致 isImmersive 残留
  useEffect(() => {
    if (view !== 'immersive') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitImmersive();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view, exitImmersive]);

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
          {/* 页头压缩一行：潜印 + 标题 + 预设提示（省出纵向空间给生物，需求 6） */}
          <header className="relative z-10 flex items-center gap-2.5 w-full">
            <div className="kb-dive-seal shrink-0" style={{ width: 38, height: 38, fontSize: '0.95rem' }} aria-hidden="true">潜</div>
            <div>
              <h1 className="kb-dive-title" style={{ fontSize: 'clamp(1.1rem,2.2vw,1.6rem)' }}>深潜</h1>
              <p className="kb-dive-note" style={{ fontSize: '0.62rem' }}>专注即下潜 · 每一分钟都是深度</p>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>
                {activePreset
                  ? activePreset.longBreakInterval === 0
                    ? `课堂 ${activePreset.workDuration}min · 短休 ${activePreset.shortBreakDuration}min`
                    : `专注 ${activePreset.workDuration}min · 每 ${activePreset.longBreakInterval} 个长休`
                  : `专注 ${settings.workDuration}min`}
              </span>
            </div>
          </header>

          {/* 生物主体区：flex-1 全高让位（高频 tick 隔离在 TimerFace 内） */}
          <TimerFace />

          {/* PresetTabs 基座轨道：生物下方（预设 = 生物的"能量轨道"） */}
          <PresetTabs
            presets={presets}
            activePresetId={activePreset?.id}
            canCreate={presets.length < MAX_PRESETS}
            onSelect={setPreset}
            onCreate={openPresetEditor}
            onManage={managePresets}
            onEditPreset={handleEditPreset}
            onDuplicatePreset={handleDuplicatePreset}
            onDeletePreset={handleDeletePreset}
          />

          <GoalInput
            open={goalModalOpen}
            onClose={() => setGoalModalOpen(false)}
            onSubmit={handleGoalSubmit}
            rememberGoal={rememberGoal}
            onRememberChange={setRememberGoal}
          />

          {/* 预设快捷创建/编辑弹窗 */}
          <PresetEditor
            open={presetEditorOpen}
            onClose={() => setPresetEditorOpen(false)}
            initial={editingPreset}
            onSave={async (data) => {
              if (editingPreset) {
                await updatePreset(editingPreset.id, data);
              } else {
                const preset = await createPreset(data);
                setPreset(preset.id);
              }
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
