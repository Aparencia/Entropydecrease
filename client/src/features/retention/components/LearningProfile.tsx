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
    /* 浅色模式适配：白色半透明背景 + 灰色边框 + 微阴影，确保卡片在浅灰页面上清晰可辨 */
    <div className="flex flex-col gap-3 p-3 rounded-xl bg-white/80 dark:bg-white/5 border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none">
      {/* 标题 —— 浅色模式使用深灰文字，提升对比度 */}
      <h3 className="text-xs font-medium text-gray-600 dark:text-white/60">学习画像</h3>

      {/* 洞察列表 / Insights list —— 浅色模式文字颜色加深 */}
      {insights.length > 0 && (
        <div className="space-y-1.5">
          {insights.slice(0, 3).map((insight) => (
            <p key={insight.id} className="text-[11px] text-gray-600 dark:text-white/50 leading-relaxed">
              · {insight.text}
            </p>
          ))}
        </div>
      )}

      {/* 身份标签 / Identity tags —— 浅色模式使用更深青色背景与文字，保证可读性 */}
      {unlockedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unlockedTags.map((tag) => (
            <span
              key={tag.key}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-100 dark:bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-300/20"
              title={tag.description}
            >
              {tag.title}
            </span>
          ))}
        </div>
      )}

      {/* AI 深度分析 / AI deep analysis —— 浅色模式分隔线使用灰色，更加可见 */}
      {onAIAnalyze && (
        <div className="pt-1 border-t border-gray-200 dark:border-white/5">
          {aiResult ? (
            <p className="text-[11px] text-gray-600 dark:text-white/50 leading-relaxed whitespace-pre-wrap">{aiResult}</p>
          ) : (
            <button
              onClick={onAIAnalyze}
              disabled={!isOnline || aiLoading}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
                /* 浅色模式在线时使用更深紫色，确保白底可读 */
                isOnline
                  ? 'text-violet-600 dark:text-violet-300 bg-violet-100 dark:bg-violet-400/10 hover:bg-violet-200 dark:hover:bg-violet-400/20'
                  : 'text-gray-400 dark:text-white/30 bg-gray-100 dark:bg-white/5 cursor-not-allowed',
              )}
              title={isOnline ? 'AI 深度分析' : '需要网络连接'}
            >
              {aiLoading ? (
                /* 加载动画边框颜色在浅色模式下使用深紫 */
                <span className="w-3 h-3 border border-violet-400/50 dark:border-violet-300/50 border-t-violet-600 dark:border-t-violet-300 rounded-full animate-spin" />
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
