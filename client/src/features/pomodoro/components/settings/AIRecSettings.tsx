/**
 * 深潜设置页 — 智能推荐区块（AI 时长推荐）
 *
 * @ai-context: 从 PomodoroSettingsPage 拆分。推荐请求由页面封装
 * （含历史会话加载与错误处理），本区块负责展示、手动微调与应用回调。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { DurationResult } from '@/lib/ai/types';
import { SettingsBlock } from './shared';

interface AIRecSettingsProps {
  loading: boolean;
  data: DurationResult | null;
  error: string | null;
  isFallback: boolean;
  needsConfig: boolean;
  onRecommend: () => void;
  /** 应用推荐时长（页面层负责同步到 settings 与活动预设） */
  onApply: (duration: number) => void;
}

export function AIRecSettings({
  loading,
  data,
  error,
  isFallback,
  needsConfig,
  onRecommend,
  onApply,
}: AIRecSettingsProps) {
  const navigate = useNavigate();
  // 手动微调值与已应用标记为本区块局部状态；新推荐到达时重置
  const [fineTuneValue, setFineTuneValue] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setFineTuneValue(null);
    setApplied(false);
  }, [data]);

  const displayDuration = fineTuneValue ?? data?.recommendedDuration;

  return (
    <SettingsBlock className="mb-kb-xl">
      <Card variant="default" padding="lg">
        <div className="flex items-center gap-2 mb-kb-md">
          <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">智能推荐</h2>
        </div>
        <p className="text-b2 text-text-tertiary mb-kb-md">
          AI 分析你的历史专注数据，为你推荐最适合的工作时长。
          {isFallback && data && (
            <span className="ml-1 text-semantic-warning text-c1">（基于本地分析）</span>
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
          {loading ? '分析中…' : '获取智能推荐'}
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
                  AI 推荐：{displayDuration} 分钟
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
                {data.confidence === 'high' ? '高置信度' : data.confidence === 'medium' ? '中等' : '低'}
              </span>
            </div>

            {/* 手动微调滑块 */}
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
              {applied ? '已应用推荐' : '应用推荐时长'}
            </Button>
          </div>
        )}
      </Card>
    </SettingsBlock>
  );
}
