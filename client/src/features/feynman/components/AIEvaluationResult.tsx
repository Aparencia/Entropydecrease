/**
 * AI 评估结果展示面板
 *
 * @ai-context: 从 FeynmanSessionPage 拆出的纯展示组件——渲染讲解质量
 * 评估的综合评分/维度进度条/优势/待改进/建议。数据来自 useAIEvaluate，
 * 评分阈值文案（≥80 出色 / ≥60 较好）为产品定义，勿随意调整。
 */
import { X, Sparkles, CheckCircle2, Circle, RotateCcw } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import type { EvaluateResult } from '@/lib/ai/types';

interface AIEvaluationResultProps {
  loading: boolean;
  error: string | null;
  needsConfig: boolean;
  data: EvaluateResult | null;
  onClose: () => void;
  onGoSettings: () => void;
  /** v0.30: 重置 AI 反馈（用户建议） */
  onReset?: () => void;
}

export function AIEvaluationResult({
  loading, error, needsConfig, data, onClose, onGoSettings, onReset,
}: AIEvaluationResultProps) {
  return (
    <div className={cn(
      'p-kb-md rounded-kb-lg',
      'bg-brand-600/5 border border-brand-500/20',
    )}>
      <div className="flex items-center justify-between mb-kb-md">
        <h3 className="text-b1 font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          AI 评估结果
        </h3>
        <div className="flex items-center gap-1">
          {onReset && data && !loading && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-kb-md text-c1 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
              title="清除评估结果，可重新评估"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              重置
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-b2 text-text-secondary py-4">
          <AIThinkingIndicator size={4} gap={3} />
          正在评估你的讲解…
        </div>
      )}

      {error && !loading && (
        <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
          {error}
          {needsConfig && (
            <button
              onClick={onGoSettings}
              className="mt-2 block text-b3 underline hover:no-underline"
            >
              前往设置页配置 API Key
            </button>
          )}
        </div>
      )}

      {data && !loading && (
        <div className="flex flex-col gap-kb-md kb-ai-result-enter">
          {/* Overall score */}
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-16 h-16 rounded-kb-full flex items-center justify-center flex-shrink-0',
              'bg-brand-600/10 text-brand-600 text-h2 font-bold',
            )}>
              {data.overallScore}
            </div>
            <div>
              <p className="text-b1 font-semibold text-text-primary">综合评分</p>
              <p className="text-b2 text-text-tertiary">
                {data.overallScore >= 80 ? '讲得非常出色！' : data.overallScore >= 60 ? '掌握较好，还有提升空间' : '建议继续深化理解'}
              </p>
            </div>
          </div>

          {/* Dimensions */}
          {data.dimensions.length > 0 && (
            <div>
              <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-2">维度评分</p>
              <div className="flex flex-col gap-2">
                {data.dimensions.map((dim, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-b2 text-text-secondary w-20 flex-shrink-0">{dim.name}</span>
                    <div className="flex-1 h-2 bg-bg-tertiary rounded-kb-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-kb-full transition-all duration-500"
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <span className="text-b3 text-text-tertiary w-8 text-right">{dim.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths */}
          {data.strengths.length > 0 && (
            <div>
              <p className="text-b3 font-medium text-semantic-success uppercase tracking-wide mb-1">优势</p>
              <ul className="flex flex-col gap-1">
                {data.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-semantic-success flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {data.weaknesses.length > 0 && (
            <div>
              <p className="text-b3 font-medium text-semantic-error uppercase tracking-wide mb-1">待改进</p>
              <ul className="flex flex-col gap-1">
                {data.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                    <Circle className="w-3.5 h-3.5 mt-0.5 text-rose-400 flex-shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {data.suggestions.length > 0 && (
            <div>
              <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-1">建议</p>
              <ul className="flex flex-col gap-1">
                {data.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                    <span className="mt-1 w-1.5 h-1.5 rounded-kb-full bg-brand-500 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
