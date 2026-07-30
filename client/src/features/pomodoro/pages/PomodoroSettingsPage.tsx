/**
 * @ai-context: pomodoro 功能模块页面：PomodoroSettingsPage。
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Timer, Zap, Bell, Save, RotateCcw, GraduationCap, Sparkles, CheckCircle2, Music, Volume2, Brain } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { Button, Card, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useAIDuration } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { pomodoroSessionStore } from '@/lib/storage';
import type { PomodoroSession } from '@/types/models';
import {
  audioTracks,
  loadAudioPreferences,
  saveAudioPreferences,
} from '@/lib/audio/audioConfig';
import type { AudioPreferences } from '@/lib/audio/audioConfig';

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

// Toggle switch component
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative w-11 h-6 rounded-kb-full transition-colors duration-kb-fast ease-kb-default',
        'flex-shrink-0',
        'hover:scale-[1.02] active:scale-[0.98]',
        checked ? 'bg-brand-600' : 'bg-bg-tertiary border border-border/50',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-kb-full bg-white shadow-kb-sm',
          'transition-transform duration-kb-fast ease-kb-default',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

// Setting row helper
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-kb-sm">
      <div className="flex-1 min-w-0">
        <p className="text-b2 font-medium text-text-primary">{label}</p>
        {description && (
          <p className="text-c1 text-text-tertiary mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0 ml-kb-md">{children}</div>
    </div>
  );
}

export default function PomodoroSettingsPage() {
  const { settings, updateSettings, initialize, mode: _mode, aiRecommendedDuration, aiReasoning, setAIRecommendation } = usePomodoroStore(useShallow(s => s));

  // Local form state (mirrors store settings)
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [audioPrefs, setAudioPrefs] = useState<AudioPreferences>(() => loadAudioPreferences());

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
  const [aiRecApplied, setAIRecApplied] = useState(false);
  const [fineTuneValue, setFineTuneValue] = useState<number | null>(null);
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
    if (!isNaN(num) && num > 0 && num <= 180) {
      setLocalSettings((prev) => ({ ...prev, [key]: num }));
    } else if (value === '' || value === '0') {
      setLocalSettings((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const handleToggle = (key: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: !(prev as Record<string, unknown>)[key],
    }));
  };

  const handleSave = () => {
    updateSettings(localSettings);
    saveAudioPreferences(audioPrefs);
    setSaved(true);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    updateSettings(DEFAULT_SETTINGS);
    setLocalSettings({ ...DEFAULT_SETTINGS });
    setResetDone(true);
    resetTimerRef.current = setTimeout(() => setResetDone(false), 2000);
  };

  return (
    <motion.div
      className="max-w-xl mx-auto px-kb-md py-kb-lg"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.06 } } }}
    >
      <motion.h1
        className="text-h1 font-semibold text-text-primary mb-kb-lg"
        variants={{ hidden: { opacity: 0, y: -12, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}
      >深潜设置</motion.h1>

      {/* Duration settings */}
      <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-md">
        <div className="flex items-center gap-2 mb-kb-md">
          <Timer className="w-icon-sm h-icon-sm text-pomodoro" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">时长设置</h2>
        </div>

        <div className="space-y-kb-md">
          {/* AI 推荐时长提示 */}
          {aiRecommendedDuration != null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-kb-md bg-brand-50 border border-brand-200/30">
              <Brain className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--kb-focus-blue)' }} />
              <p className="text-c1 text-text-secondary">
                <span className="font-medium" style={{ color: 'var(--kb-focus-blue)' }}>AI 推荐 {aiRecommendedDuration} 分钟</span>
                {aiReasoning && <span className="ml-1 text-text-tertiary">— {aiReasoning}</span>}
              </p>
            </div>
          )}
          <Input
            label="工作时长（自习模式）"
            type="number"
            value={String(localSettings.workDuration)}
            onChange={(e) => handleDurationChange('workDuration', e.target.value)}
            min={1}
            max={180}
            suffix={<span className="text-text-tertiary text-b3">分钟</span>}
          />
          <Input
            label="短休息"
            type="number"
            value={String(localSettings.shortBreakDuration)}
            onChange={(e) => handleDurationChange('shortBreakDuration', e.target.value)}
            min={1}
            max={60}
            suffix={<span className="text-text-tertiary text-b3">分钟</span>}
          />
          <Input
            label="长休息"
            type="number"
            value={String(localSettings.longBreakDuration)}
            onChange={(e) => handleDurationChange('longBreakDuration', e.target.value)}
            min={1}
            max={60}
            suffix={<span className="text-text-tertiary text-b3">分钟</span>}
          />
          <Input
            label="长休息间隔"
            type="number"
            value={String(localSettings.longBreakInterval)}
            onChange={(e) => handleDurationChange('longBreakInterval', e.target.value)}
            min={1}
            max={12}
            suffix={<span className="text-text-tertiary text-b3">个番茄</span>}
          />
        </div>
      </Card>
      </motion.div>

      {/* Class mode settings */}
      <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-md">
        <div className="flex items-center gap-2 mb-kb-md">
          <GraduationCap className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">上课模式设置</h2>
        </div>
        <p className="text-c1 text-text-tertiary mb-kb-md">
          上课模式下，使用固定课堂时长，课间自动短休，不进入长休息。
        </p>
        <div className="space-y-kb-md">
          <Input
            label="课堂时长"
            type="number"
            value={String(localSettings.classDuration)}
            onChange={(e) => handleDurationChange('classDuration', e.target.value)}
            min={10}
            max={120}
            suffix={<span className="text-text-tertiary text-b3">分钟</span>}
          />
        </div>
      </Card>
      </motion.div>

      {/* Automation settings */}
      <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-md">
        <div className="flex items-center gap-2 mb-kb-sm">
          <Zap className="w-icon-sm h-icon-sm text-semantic-warning" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">自动化</h2>
        </div>

        <div className="divide-y divide-border/30">
          <SettingRow label="自动开始休息" description="工作结束后自动进入休息">
            <Toggle
              checked={localSettings.autoStartBreak}
              onChange={() => handleToggle('autoStartBreak')}
            />
          </SettingRow>
          <SettingRow label="自动开始下一个番茄" description="休息结束后自动开始工作">
            <Toggle
              checked={localSettings.autoStartWork}
              onChange={() => handleToggle('autoStartWork')}
            />
          </SettingRow>
        </div>
      </Card>
      </motion.div>

      {/* Notification settings */}
      <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-xl">
        <div className="flex items-center gap-2 mb-kb-sm">
          <Bell className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">提醒方式</h2>
        </div>

        <div className="divide-y divide-border/30">
          <SettingRow label="声音提醒" description="阶段切换时播放提示音">
            <Toggle
              checked={localSettings.soundEnabled}
              onChange={() => handleToggle('soundEnabled')}
            />
          </SettingRow>
          <SettingRow label="浏览器通知" description="通过系统通知提醒阶段切换">
            <Toggle
              checked={localSettings.notificationEnabled}
              onChange={() => handleToggle('notificationEnabled')}
            />
          </SettingRow>
        </div>
      </Card>
      </motion.div>

      {/* AI 智能推荐 */}
      <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-xl">
        <div className="flex items-center gap-2 mb-kb-md">
          <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">智能推荐</h2>
        </div>
        <p className="text-b2 text-text-tertiary mb-kb-md">
          AI 分析你的历史专注数据，为你推荐最适合的工作时长。
          {aiRecFallback && aiRecData && (
            <span className="ml-1 text-semantic-warning text-c1">（基于本地分析）</span>
          )}
        </p>

        <Button
          variant="secondary"
          size="md"
          icon={aiRecLoading ? <AIThinkingIndicator size={4} gap={3} /> : <Sparkles className="w-icon-sm h-icon-sm" />}
          disabled={aiRecLoading}
          onClick={async () => {
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
              setAIRecApplied(false);
            } catch (error) {
              handleRecommendError(error);
            }
          }}
          className="w-full"
        >
          {aiRecLoading ? '分析中…' : '获取智能推荐'}
        </Button>

        {aiRecError && (
          <div className="mt-kb-sm p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
            {aiRecError}
            {aiRecNeedsConfig && (
              <button
                onClick={() => navigate('/settings')}
                className="mt-2 block text-b3 underline hover:no-underline"
              >
                前往设置页配置 API Key
              </button>
            )}
          </div>
        )}

        {aiRecData && !aiRecLoading && (
          <div className={cn(
            'mt-kb-md p-kb-md rounded-kb-lg',
            'bg-brand-600/5 border border-brand-500/20',
            'flex flex-col gap-2',
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-b1 font-semibold text-text-primary">
                  AI 推荐：{fineTuneValue ?? aiRecData.recommendedDuration} 分钟
                </p>
                <p className="text-b2 text-text-secondary mt-0.5">{aiRecData.reasoning}</p>
              </div>
              <span className={cn(
                'text-c1 font-medium px-2 py-0.5 rounded-kb-sm',
                aiRecData.confidence === 'high'
                  ? 'bg-semantic-success/10 text-semantic-success'
                  : aiRecData.confidence === 'medium'
                    ? 'bg-semantic-warning/10 text-semantic-warning'
                    : 'bg-text-tertiary/10 text-text-tertiary',
              )}>
                {aiRecData.confidence === 'high' ? '高置信度' : aiRecData.confidence === 'medium' ? '中等' : '低'}
              </span>
            </div>

            {/* 手动微调滑块 */}
            <div className="mt-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-c1 text-text-tertiary">手动微调</span>
                <span className="text-c1 font-medium" style={{ color: 'var(--kb-focus-blue)' }}>
                  {fineTuneValue ?? aiRecData.recommendedDuration} 分钟
                </span>
              </div>
              <input
                type="range"
                min={Math.max(10, aiRecData.recommendedDuration - 5)}
                max={Math.min(60, aiRecData.recommendedDuration + 5)}
                value={fineTuneValue ?? aiRecData.recommendedDuration}
                onChange={(e) => setFineTuneValue(parseInt(e.target.value, 10))}
                className="w-full h-1.5 rounded-kb-full cursor-pointer"
                style={{ accentColor: 'var(--kb-focus-blue)' }}
              />
              <div className="flex justify-between text-c2 text-text-tertiary/60 mt-0.5">
                <span>{Math.max(10, aiRecData.recommendedDuration - 5)}分钟</span>
                <span>{Math.min(60, aiRecData.recommendedDuration + 5)}分钟</span>
              </div>
            </div>

            {aiRecFallback && (
              <p className="text-c1 text-semantic-warning flex items-center gap-1">
                <span>⚠</span> 当前基于本地规则引擎分析（无网络）
              </p>
            )}
            <Button
              size="sm"
              icon={aiRecApplied ? <CheckCircle2 className="w-icon-sm h-icon-sm" /> : undefined}
              disabled={aiRecApplied}
              onClick={() => {
                const finalDuration = fineTuneValue ?? aiRecData.recommendedDuration;
                setLocalSettings((prev) => ({ ...prev, workDuration: finalDuration }));
                updateSettings({ workDuration: finalDuration });
                setAIRecommendation(finalDuration, aiRecData.reasoning);
                setAIRecApplied(true);
                toast({ type: 'success', message: `已应用推荐时长：${finalDuration} 分钟` });
              }}
              className="self-start"
            >
              {aiRecApplied ? '已应用推荐' : '应用推荐时长'}
            </Button>
          </div>
        )}
      </Card>
      </motion.div>

      {/* 音效设置 */}
      <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-xl">
        <div className="flex items-center gap-2 mb-kb-sm">
          <Music className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">音效设置</h2>
        </div>

        {/* 白噪音 */}
        <div className="divide-y divide-border/30">
          <SettingRow label="白噪音" description="工作阶段自动播放白噪音">
            <Toggle
              checked={audioPrefs.whiteNoiseEnabled}
              onChange={() => setAudioPrefs((p) => ({ ...p, whiteNoiseEnabled: !p.whiteNoiseEnabled }))}
            />
          </SettingRow>

          <SettingRow label="白噪音轨道" description="选择背景音效">
            <select
              value={audioPrefs.whiteNoiseTrackId}
              onChange={(e) => setAudioPrefs((p) => ({ ...p, whiteNoiseTrackId: e.target.value }))}
              className="bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            >
              {audioTracks.filter((t) => t.category === 'white_noise').map((t) => (
                <option key={t.id} value={t.id}>{t.nameZh}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label="白噪音音量" description="调整白噪音音量">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioPrefs.whiteNoiseVolume}
                onChange={(e) => setAudioPrefs((p) => ({ ...p, whiteNoiseVolume: parseFloat(e.target.value) }))}
                className="w-24 h-1 accent-brand-500 cursor-pointer"
              />
            </div>
          </SettingRow>

          {/* 背景音乐 */}
          <SettingRow label="背景音乐" description="工作阶段播放轻音乐">
            <Toggle
              checked={audioPrefs.bgmEnabled}
              onChange={() => setAudioPrefs((p) => ({ ...p, bgmEnabled: !p.bgmEnabled }))}
            />
          </SettingRow>

          <SettingRow label="背景音乐轨道" description="选择背景音乐">
            <select
              value={audioPrefs.bgmTrackId}
              onChange={(e) => setAudioPrefs((p) => ({ ...p, bgmTrackId: e.target.value }))}
              className="bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            >
              {audioTracks.filter((t) => t.category === 'bgm').map((t) => (
                <option key={t.id} value={t.id}>{t.nameZh}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label="背景音乐音量" description="调整背景音乐音量">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioPrefs.bgmVolume}
                onChange={(e) => setAudioPrefs((p) => ({ ...p, bgmVolume: parseFloat(e.target.value) }))}
                className="w-24 h-1 accent-brand-500 cursor-pointer"
              />
            </div>
          </SettingRow>
        </div>
      </Card>
      </motion.div>

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
