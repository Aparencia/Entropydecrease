/**
 * NavigationCard — 智能领航（AI 推荐 + 体验增强卡）
 *
 * 覆盖原 AIRecSettings + EnhancementSettings 全部能力：
 * AI 推荐/推理/置信度/手动微调/应用/API Key 引导 + 4 个体验增强开关。
 *
 * @ai-context: 深潜设置页改造——智能领航卡。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Toggle, SettingRow } from '../shared';
import { PlannerBlock } from './PlannerBlock';
import type { DurationResult } from '@/lib/ai/types';
import type { PomodoroSettings } from '../../../store/pomodoroStoreTypes';

interface NavigationCardProps {
  localSettings: PomodoroSettings;
  loading: boolean;
  data: DurationResult | null;
  error: string | null;
  isFallback: boolean;
  needsConfig: boolean;
  onRecommend: () => void;
  onApply: (duration: number) => void;
  onToggle: (key: string) => void;
}

export function NavigationCard({
  localSettings,
  loading,
  data,
  error,
  isFallback,
  needsConfig,
  onRecommend,
  onApply,
  onToggle,
}: NavigationCardProps) {
  const navigate = useNavigate();
  const [fineTuneValue, setFineTuneValue] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setFineTuneValue(null);
    setApplied(false);
  }, [data]);

  const displayDuration = fineTuneValue ?? data?.recommendedDuration;

  return (
    <div className="rounded-kb-lg border border-border/40 bg-bg-secondary/60 p-kb-md">
      <div className="flex items-center gap-2 mb-kb-sm">
        <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
        <h2 className="text-h3 font-medium text-text-primary">智能领航</h2>
      </div>

      {/* ── AI 时长推荐 ── */}
      <div className="mb-kb-md">
        <p className="text-c1 text-text-tertiary mb-kb-sm">
          AI 分析你的历史潜次，推荐最适合的专注时长。
          {isFallback && data && (
            <span className="ml-1 text-semantic-warning">（基于本地分析）</span>
          )}
        </p>
        <Button
          variant="secondary"
          size="md"
          icon={loading ? <AIThinkingIndicator size={4} gap={3} /> : <Sparkles className="w-icon-sm h-icon-sm" />}
          disabled={loading}
          onClick={onRecommend}
          className="w-full"
        >
          {loading ? '分析中…' : '获取领航建议'}
        </Button>

        {error && (
          <div className="mt-kb-sm p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
            {error}
            {needsConfig && (
              <button
                onClick={() => navigate('/settings')}
                className="mt-2 block text-b3 underline hover:no-underline"
              >
                前往设置页配置 API Key
              </button>
            )}
          </div>
        )}

        {data && !loading && (
          <div className={cn(
            'mt-kb-md p-kb-md rounded-kb-lg',
            'bg-brand-600/5 border border-brand-500/20',
            'flex flex-col gap-2',
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-b1 font-semibold text-text-primary">
                  领航建议：{displayDuration} 分钟
                </p>
                <p className="text-b2 text-text-secondary mt-0.5">{data.reasoning}</p>
              </div>
              <span className={cn(
                'text-c1 font-medium px-2 py-0.5 rounded-kb-sm',
                data.confidence === 'high'
                  ? 'bg-semantic-success/10 text-semantic-success'
                  : data.confidence === 'medium'
                    ? 'bg-semantic-warning/10 text-semantic-warning'
                    : 'bg-text-tertiary/10 text-text-tertiary',
              )}>
                {data.confidence === 'high' ? '高置信' : data.confidence === 'medium' ? '中等' : '低'}
              </span>
            </div>

            <div className="mt-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-c1 text-text-tertiary">手动微调</span>
                <span className="text-c1 font-medium" style={{ color: 'var(--kb-focus-blue)' }}>
                  {displayDuration} 分钟
                </span>
              </div>
              <input
                type="range"
                min={Math.max(10, data.recommendedDuration - 5)}
                max={Math.min(60, data.recommendedDuration + 5)}
                value={displayDuration}
                onChange={(e) => setFineTuneValue(parseInt(e.target.value, 10))}
                className="w-full h-1.5 rounded-kb-full cursor-pointer"
                style={{ accentColor: 'var(--kb-focus-blue)' }}
              />
              <div className="flex justify-between text-c2 text-text-tertiary/60 mt-0.5">
                <span>{Math.max(10, data.recommendedDuration - 5)}分钟</span>
                <span>{Math.min(60, data.recommendedDuration + 5)}分钟</span>
              </div>
            </div>

            {isFallback && (
              <p className="text-c1 text-semantic-warning flex items-center gap-1">
                <span>⚠</span> 当前基于本地规则引擎分析（无网络）
              </p>
            )}
            <Button
              size="sm"
              icon={applied ? <CheckCircle2 className="w-icon-sm h-icon-sm" /> : undefined}
              disabled={applied}
              onClick={() => {
                if (displayDuration == null) return;
                onApply(displayDuration);
                setApplied(true);
              }}
              className="self-start"
            >
              {applied ? '已应用' : '应用建议'}
            </Button>
          </div>
        )}
      </div>

      {/* ── 今日下潜计划（P2 规划器）── */}
      <PlannerBlock
        shortBreakMinutes={localSettings.shortBreakDuration}
        longBreakInterval={localSettings.longBreakInterval}
      />

      {/* ── 深海装备（体验增强）── */}
      <div className="pt-kb-md border-t border-border/30">
        <h3 className="text-b2 font-medium text-text-primary mb-kb-sm">深海装备</h3>
        <div className="divide-y divide-border/30">
          <SettingRow label="休息记忆重放" description="休息时展示本次目标关键词，促进主动回忆">
            <Toggle
              checked={localSettings.breakReplayEnabled ?? false}
              onChange={() => onToggle('breakReplayEnabled')}
            />
          </SettingRow>
          <SettingRow label="心流音乐" description="根据专注状态自动调整背景音乐">
            <Toggle
              checked={localSettings.flowMusicEnabled ?? false}
              onChange={() => onToggle('flowMusicEnabled')}
            />
          </SettingRow>
          <SettingRow label="守护灵联动" description="结合分心检测实时调节心流音乐">
            <Toggle
              checked={localSettings.guardianLinkEnabled ?? false}
              onChange={() => onToggle('guardianLinkEnabled')}
            />
          </SettingRow>
          <SettingRow label="阶段音轨自动切换" description="休息时自动切换为休息推荐音轨">
            <Toggle
              checked={localSettings.autoSwitchAudioPhase ?? false}
              onChange={() => onToggle('autoSwitchAudioPhase')}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}