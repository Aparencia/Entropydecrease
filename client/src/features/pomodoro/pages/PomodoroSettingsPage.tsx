/**
 * 深潜设置页（下潜档案版）
 *
 * @ai-context: 数据驱动改造——顶部「潜航档案」展示近 30 天数据洞察，
 * 设置卡片按主题分组（氧气配比/潜航任务/预警声呐/水下声景/智能领航），
 * 即改即存（无保存按钮），底部保留「恢复出厂深度」重置链接。
 *
 * @ai-context: Pomodoro settings page — dive-profile layout with live-save.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useAIDuration } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { pomodoroSessionStore } from '@/lib/storage';
import type { PomodoroSession, PomodoroPreset } from '@/types/models';
import { useDiveProfile } from '../hooks/useDiveProfile';
import { DiveProfileCard } from '../components/settings/dive/DiveProfileCard';
import { OxygenMixCard } from '../components/settings/dive/OxygenMixCard';
import { TaskPresetCard } from '../components/settings/dive/TaskPresetCard';
import { SonarAlertCard } from '../components/settings/dive/SonarAlertCard';
import { SoundscapeCard } from '../components/settings/dive/SoundscapeCard';
import { NavigationCard } from '../components/settings/dive/NavigationCard';
import { MAX_PRESETS } from '../lib/presetService';

const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  autoStartBreak: true,
  autoStartWork: false,
  soundEnabled: true,
  notificationEnabled: false,
  classDuration: 45,
};

export default function PomodoroSettingsPage() {
  // P0-1 细粒度订阅：设置页为低频页，但整 store 订阅会在计时 tick 等
  // 任何字段变化时重渲染整页表单，拆分为单字段订阅
  const settings = usePomodoroStore((s) => s.settings);
  const presets = usePomodoroStore((s) => s.presets);
  const activePreset = usePomodoroStore((s) => s.activePreset);
  const aiReasoning = usePomodoroStore((s) => s.aiReasoning);
  // 动作（稳定引用）
  const updateSettings = usePomodoroStore((s) => s.updateSettings);
  const initialize = usePomodoroStore((s) => s.initialize);
  const setAIRecommendation = usePomodoroStore((s) => s.setAIRecommendation);
  const createPreset = usePomodoroStore((s) => s.createPreset);
  const updatePreset = usePomodoroStore((s) => s.updatePreset);
  const deletePreset = usePomodoroStore((s) => s.deletePreset);
  const reorderPresets = usePomodoroStore((s) => s.reorderPresets);

  // Local form state (mirrors store settings)
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const { toast } = useToast();

  // AI recommend
  const {
    loading: aiRecLoading,
    data: aiRecData,
    error: aiRecError,
    isFallback: aiRecFallback,
    needsConfig: aiRecNeedsConfig,
    recommend: aiRecommend,
  } = useAIDuration();
  const handleRecommendError = useAIErrorHandler('获取领航建议失败');
  const navigate = useNavigate();

  // 潜航档案数据洞察
  const diveStats = useDiveProfile();

  // Load persisted settings on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Sync local state when store settings change (e.g. after initialize resolves)
  useEffect(() => {
    setLocalSettings({ ...settings });
  }, [settings]);

  /** 即改即存：时长类设置变更 → 本地态 + store + 同步活动预设 */
  const handleDurationChange = (key: string, value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return;
    // 钳制非法输入：长休间隔允许 0（无长休），其余时长下限 1、上限 180
    const max = key === 'longBreakInterval' ? 12 : 180;
    const clamped = Math.max(key === 'longBreakInterval' ? 0 : 1, Math.min(num, max));
    const next = { ...localSettings, [key]: clamped };
    setLocalSettings(next);
    updateSettings(next as typeof settings);
    // 时长设置与预设体系打通：同步应用到当前活动预设
    const active = usePomodoroStore.getState().activePreset;
    if (active) {
      const patch: Partial<PomodoroPreset> = {};
      if (key === 'workDuration') patch.workDuration = clamped;
      if (key === 'shortBreakDuration') patch.shortBreakDuration = clamped;
      if (key === 'longBreakDuration') patch.longBreakDuration = clamped;
      if (key === 'longBreakInterval') patch.longBreakInterval = clamped;
      if (Object.keys(patch).length > 0) {
        updatePreset(active.id, patch).catch(() => toast({ type: 'error', message: '预设同步失败，请重试' }));
      }
    }
    // 课堂时长同步到静默（上课）内置预设
    if (key === 'classDuration') {
      const silentPreset = presets.find((p) => p.silent);
      if (silentPreset && silentPreset.workDuration !== clamped) {
        updatePreset(silentPreset.id, { workDuration: clamped }).catch((err) => {
          console.warn('[PomodoroSettingsPage] sync class preset duration failed', err);
        });
      }
    }
  };

  /** 即改即存：开关类设置变更 */
  const handleToggle = (key: string) => {
    const next = {
      ...localSettings,
      [key]: !(localSettings as Record<string, unknown>)[key],
    };
    setLocalSettings(next);
    updateSettings(next as typeof settings);
  };

  const handleWarningMinutesChange = (minutes: number) => {
    const next = { ...localSettings, warningMinutes: Math.max(0, Math.min(10, minutes)) };
    setLocalSettings(next);
    updateSettings(next as typeof settings);
  };

  /** 恢复出厂深度（重置为默认） */
  const handleReset = () => {
    setLocalSettings({ ...DEFAULT_SETTINGS });
    updateSettings(DEFAULT_SETTINGS as typeof settings);
    toast({ type: 'success', message: '已恢复出厂深度' });
  };

  // 预设排序：上移/下移一位后持久化新顺序
  const handleMovePreset = (id: string, dir: -1 | 1) => {
    const index = presets.findIndex((p) => p.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= presets.length) return;
    const ids = presets.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderPresets(ids);
  };

  const handleDeletePreset = async (id: string, name: string) => {
    try {
      await deletePreset(id);
      toast({ type: 'success', message: `任务「${name}」已删除` });
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : '删除失败' });
    }
  };

  const handleSavePreset = async (
    data: Omit<PomodoroPreset, 'id' | 'sortOrder' | 'createdAt' | 'builtin'>,
    editing: PomodoroPreset | null,
  ) => {
    if (editing) {
      await updatePreset(editing.id, data);
    } else {
      await createPreset(data);
    }
  };

  // AI 推荐请求：加载历史会话 → 调用推荐（本地优先，AI 失败自动降级）
  const handleRecommend = async () => {
    try {
      const sessions: PomodoroSession[] = await pomodoroSessionStore.getAll();
      const historySessions = sessions.map((s) => ({
        duration: Math.round(s.duration / 60),
        completed: !s.interrupted,
        date: s.completedAt instanceof Date ? s.completedAt.toISOString() : String(s.completedAt),
        subject: s.subject,
      }));
      const avgFocus = sessions.length > 0
        ? sessions.reduce((sum, s) => sum + Math.round(s.actualDuration / 60), 0) / sessions.length
        : undefined;
      await aiRecommend({
        sessions: historySessions,
        averageFocusTime: avgFocus ? Math.round(avgFocus) : undefined,
        preferredDuration: localSettings.workDuration,
      });
    } catch (error) {
      handleRecommendError(error);
    }
  };

  // 应用推荐时长：同步 settings 与当前活动预设（预设驱动实际计时）
  const handleApplyAI = (finalDuration: number) => {
    const next = { ...localSettings, workDuration: finalDuration };
    setLocalSettings(next);
    updateSettings(next as typeof settings);
    const active = usePomodoroStore.getState().activePreset;
    if (active) updatePreset(active.id, { workDuration: finalDuration }).catch((err) => {
      console.warn('[PomodoroSettingsPage] sync active preset duration failed', err);
    });
    setAIRecommendation(finalDuration, aiReasoning ?? '');
    toast({ type: 'success', message: `已应用领航建议：${finalDuration} 分钟` });
  };

  return (
    <motion.div
      className="max-w-3xl mx-auto px-kb-md py-kb-lg"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.06 } } }}
    >
      <motion.div
        className="flex items-center gap-2 mb-kb-lg"
        variants={{ hidden: { opacity: 0, y: -12, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}
      >
        {/* 返回深潜模块 */}
        <Tip text="返回深潜">
          <button
            onClick={() => navigate('/pomodoro')}
            aria-label="返回深潜"
            className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
          >
            <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
          </button>
        </Tip>
        <motion.h1
          className="text-h1 font-semibold text-text-primary"
          variants={{ hidden: { opacity: 0, y: -12, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}
        >深潜 · 潜航配置</motion.h1>
      </motion.div>

      {/* 潜航档案（数据摘要） */}
      <DiveProfileCard stats={diveStats} />

      {/* 2×2 核心设置网格 */}
      <div className="mt-kb-md grid grid-cols-1 md:grid-cols-2 gap-kb-md">
        <OxygenMixCard
          localSettings={localSettings}
          activePresetName={activePreset?.name ?? null}
          onDurationChange={handleDurationChange}
          stats={diveStats}
        />
        <TaskPresetCard
          presets={presets}
          canCreate={presets.length < MAX_PRESETS}
          onDelete={handleDeletePreset}
          onMove={handleMovePreset}
          onSavePreset={handleSavePreset}
        />
        <SonarAlertCard
          localSettings={localSettings}
          onToggle={handleToggle}
          onWarningMinutesChange={handleWarningMinutesChange}
          stats={diveStats}
        />
        <SoundscapeCard />
      </div>

      {/* 智能领航（全宽） */}
      <div className="mt-kb-md">
        <NavigationCard
          localSettings={localSettings}
          loading={aiRecLoading}
          data={aiRecData}
          error={aiRecError}
          isFallback={aiRecFallback}
          needsConfig={aiRecNeedsConfig}
          onRecommend={handleRecommend}
          onApply={handleApplyAI}
          onToggle={handleToggle}
        />
      </div>

      {/* 即改即存说明 + 恢复出厂深度 */}
      <div className="mt-kb-lg flex items-center justify-center gap-4">
        <span className="text-c1 text-text-tertiary">所有改动即时生效，无需保存</span>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-c1 text-text-tertiary hover:text-text-primary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          恢复出厂深度
        </button>
      </div>
    </motion.div>
  );
}