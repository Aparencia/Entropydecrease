/**
 * 学习画像展示组件
 * Learning profile display component
 *
 * @ai-context: 展示规则引擎生成的洞察 + 身份标签 + 可选 AI 深度分析按钮。
 * 离线可用（规则引擎），AI 分析需网络。
 * @ai-context: Displays rule-engine insights + identity tags + optional AI
 * deep analysis button. Offline-capable (rule engine), AI needs network.
 */
import { useMemo } from 'react';
import { Sparkles, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import type { ProfileInsight, IdentityTag } from '../types';

export interface LearningProfileProps {
  insights: ProfileInsight[];
  identityTags: IdentityTag[];
  /** AI 分析加载状态 / AI analysis loading state */
  aiLoading?: boolean;
  /** AI 分析结果文本 / AI analysis result text */
  aiResult?: string | null;
  /** 触发 AI 分析 / Trigger AI analysis */
  onAIAnalyze?: () => void;
}

export function LearningProfile({
  insights, identityTags, aiLoading, aiResult, onAIAnalyze,
}: LearningProfileProps) {
  const isOnline = useNetworkStatus();
  const unlockedTags = useMemo(() => identityTags.filter((t) => t.unlocked), [identityTags]);

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
      <h3 className="text-xs font-medium text-white/60">学习画像</h3>

      {/* 洞察列表 / Insights list */}
      {insights.length > 0 && (
        <div className="space-y-1.5">
          {insights.slice(0, 3).map((insight) => (
            <p key={insight.id} className="text-[11px] text-white/50 leading-relaxed">
              · {insight.text}
            </p>
          ))}
        </div>
      )}

      {/* 身份标签 / Identity tags */}
      {unlockedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unlockedTags.map((tag) => (
            <span
              key={tag.key}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-400/10 text-cyan-300 border border-cyan-300/20"
              title={tag.description}
            >
              {tag.title}
            </span>
          ))}
        </div>
      )}

      {/* AI 深度分析 / AI deep analysis */}
      {onAIAnalyze && (
        <div className="pt-1 border-t border-white/5">
          {aiResult ? (
            <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">{aiResult}</p>
          ) : (
            <button
              onClick={onAIAnalyze}
              disabled={!isOnline || aiLoading}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
                isOnline
                  ? 'text-violet-300 bg-violet-400/10 hover:bg-violet-400/20'
                  : 'text-white/30 bg-white/5 cursor-not-allowed',
              )}
              title={isOnline ? 'AI 深度分析' : '需要网络连接'}
            >
              {aiLoading ? (
                <span className="w-3 h-3 border border-violet-300/50 border-t-violet-300 rounded-full animate-spin" />
              ) : isOnline ? (
                <Sparkles className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {aiLoading ? '分析中...' : 'AI 深度分析'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
