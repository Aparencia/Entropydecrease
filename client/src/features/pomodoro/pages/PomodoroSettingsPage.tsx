/**
 * 深潜设置页（装配页）
 *
 * @ai-context: 各设置区块已拆分至 components/settings/（单文件 ≤300 行规范），
 * 本页仅保留状态与业务 handlers，按顺序装配区块。
 *
 * @ai-context: Pomodoro settings page — sections extracted to
 * components/settings/*; this page owns form state and handlers only.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useAIDuration } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { pomodoroSessionStore } from '@/lib/storage';
import type { PomodoroSession, PomodoroPreset } from '@/types/models';
import { DurationSettings } from '../components/settings/DurationSettings';
import { PresetManager } from '../components/settings/PresetManager';
import { ReminderSettings } from '../components/settings/ReminderSettings';
import { AIRecSettings } from '../components/settings/AIRecSettings';
import { EnhancementSettings } from '../components/settings/EnhancementSettings';
import { AudioSettings } from '../components/settings/AudioSettings';
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
  const { settings, updateSettings, initialize, aiRecommendedDuration, aiReasoning, setAIRecommendation, presets, activePreset, createPreset, updatePreset, deletePreset, reorderPresets } = usePomodoroStore(useShallow(s => s));

  // Local form state (mirrors store settings)
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI recommend
  const {
    loading: aiRecLoading,
    data: aiRecData,
    error: aiRecError,
    isFallback: aiRecFallback,
    needsConfig: aiRecNeedsConfig,
    recommend: aiRecommend,
  } = useAIDuration();
  const { toast } = useToast();
  const handleRecommendError = useAIErrorHandler('获取推荐失败');
  const navigate = useNavigate();

  // Load persisted settings on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Cleanup feedback timers on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // Sync local state when store settings change (e.g. after initialize resolves)
  useEffect(() => {
    setLocalSettings({ ...settings });
  }, [settings]);

  const handleDurationChange = (key: string, value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return;
    // 钳制非法输入：长休间隔允许 0（无长休），其余时长下限 1、上限 180
    const max = key === 'longBreakInterval' ? 12 : 180;
    const clamped = Math.max(key === 'longBreakInterval' ? 0 : 1, Math.min(num, max));
    setLocalSettings((prev) => ({ ...prev, [key]: clamped }));
  };

  const handleToggle = (key: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: !(prev as Record<string, unknown>)[key],
    }));
  };

  const handleWarningMinutesChange = (minutes: number) => {
    setLocalSettings((prev) => ({ ...prev, warningMinutes: Math.max(0, Math.min(10, minutes)) }));
  };

  const handleSave = () => {
    updateSettings(localSettings);
    // 时长设置与预设体系打通：同步应用到当前活动预设
    // （此前仅写全局 settings，而实际计时由预设驱动——设置"无效"的根因）
    const active = usePomodoroStore.getState().activePreset;
    if (active) {
      updatePreset(active.id, {
        workDuration: localSettings.workDuration,
        shortBreakDuration: localSettings.shortBreakDuration,
        longBreakDuration: localSettings.longBreakDuration,
        longBreakInterval: localSettings.longBreakInterval,
      }).catch(() => toast({ type: 'error', message: '预设同步失败，请重试' }));
    }
    // 课堂时长同步到静默（上课）内置预设——classDuration 仅在种子化时用过一次
    const silentPreset = presets.find((p) => p.silent);
    if (silentPreset && silentPreset.workDuration !== localSettings.classDuration) {
      updatePreset(silentPreset.id, { workDuration: localSettings.classDuration }).catch(() => {});
    }
    setSaved(true);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    updateSettings(DEFAULT_SETTINGS);
    setLocalSettings({ ...DEFAULT_SETTINGS });
    setResetDone(true);
    resetTimerRef.current = setTimeout(() => setResetDone(false), 2000);
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
      toast({ type: 'success', message: `预设「${name}」已删除` });
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
    setLocalSettings((prev) => ({ ...prev, workDuration: finalDuration }));
    updateSettings({ workDuration: finalDuration });
    const active = usePomodoroStore.getState().activePreset;
    if (active) updatePreset(active.id, { workDuration: finalDuration }).catch(() => {});
    setAIRecommendation(finalDuration, aiReasoning ?? '');
    toast({ type: 'success', message: `已应用推荐时长：${finalDuration} 分钟` });
  };

  return (
    <motion.div
      className="max-w-xl mx-auto px-kb-md py-kb-lg"
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
        >深潜设置</motion.h1>
      </motion.div>

      <DurationSettings
        localSettings={localSettings}
        activePresetName={activePreset?.name ?? null}
        aiRecommendedDuration={aiRecommendedDuration}
        aiReasoning={aiReasoning}
        onDurationChange={handleDurationChange}
      />

      <PresetManager
        presets={presets}
        canCreate={presets.length < MAX_PRESETS}
        onDelete={handleDeletePreset}
        onMove={handleMovePreset}
        onSavePreset={handleSavePreset}
      />

      <ReminderSettings
        localSettings={localSettings}
        onToggle={handleToggle}
        onWarningMinutesChange={handleWarningMinutesChange}
      />

      <AIRecSettings
        loading={aiRecLoading}
        data={aiRecData}
        error={aiRecError}
        isFallback={aiRecFallback}
        needsConfig={aiRecNeedsConfig}
        onRecommend={handleRecommend}
        onApply={handleApplyAI}
      />

      <EnhancementSettings
        localSettings={localSettings}
        onToggle={handleToggle}
      />

      <AudioSettings />

      {/* Action buttons */}
      <div className="flex flex-col gap-kb-sm">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSave}
          icon={<Save className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
        >
          {saved ? '已保存 ✓' : '保存设置'}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          onClick={handleReset}
          icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
        >
          {resetDone ? '已重置 ✓' : '重置为默认'}
        </Button>
      </div>
    </motion.div>
  );
}
