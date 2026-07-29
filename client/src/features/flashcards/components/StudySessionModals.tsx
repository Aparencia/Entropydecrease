/**
 * 学习会话 — AI 卡片优化建议与本轮完成统计弹窗
 *
 * @ai-context: 从 StudySessionPage 拆出。优化建议三态（loading/error/data），
 * 采用后直接覆盖卡片正反面内容。完成弹窗按正确率着色分级（≥80 绿 /
 * ≥50 黄 / 其余红），并展示本轮新掌握知识点数（首次学会的卡片计数）。
 */
import { Button } from '@/components/ui';
import { X, Sparkles, Check, XIcon, RotateCcw, Star } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

interface OptimizeData {
  suggestedFront: string;
  suggestedBack: string;
  improvements: string[];
}

export interface OptimizeSuggestionModalProps {
  data: OptimizeData | null | undefined;
  loading: boolean;
  error: string | null | undefined;
  onAdopt: () => void;
  onDismiss: () => void;
}

export function OptimizeSuggestionModal({
  data, loading, error, onAdopt, onDismiss,
}: OptimizeSuggestionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-kb-md">
      <div className="w-full max-w-md bg-bg-elevated rounded-kb-xl shadow-kb-lg p-kb-lg animate-fade-in-up">
        <div className="flex items-center justify-between mb-kb-md">
          <h3 className="text-h2 font-semibold text-text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" strokeWidth={1.5} />
            AI 优化建议
          </h3>
          <button
            onClick={onDismiss}
            className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-kb-lg">
            <AIThinkingIndicator />
            <p className="text-b2 text-text-secondary">AI 正在分析卡片内容…</p>
          </div>
        )}

        {error && !loading && (
          <div className="py-kb-md">
            <p className="text-b2 text-semantic-error">{error}</p>
          </div>
        )}

        {data && !loading && (
          <div className="flex flex-col gap-kb-md kb-ai-result-enter">
            <div>
              <p className="text-c1 font-medium text-text-tertiary mb-1">建议正面</p>
              <p className="text-b2 text-text-primary bg-bg-tertiary rounded-kb-md px-3 py-2">
                {data.suggestedFront}
              </p>
            </div>
            <div>
              <p className="text-c1 font-medium text-text-tertiary mb-1">建议背面</p>
              <p className="text-b2 text-text-primary bg-bg-tertiary rounded-kb-md px-3 py-2">
                {data.suggestedBack}
              </p>
            </div>
            {data.improvements.length > 0 && (
              <div>
                <p className="text-c1 font-medium text-text-tertiary mb-1">改进说明</p>
                <ul className="list-disc list-inside space-y-1">
                  {data.improvements.map((imp, i) => (
                    <li key={i} className="text-b3 text-text-secondary">{imp}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3 mt-kb-sm">
              <Button
                variant="secondary"
                onClick={onDismiss}
                className="flex-1"
                icon={<XIcon className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              >
                忽略
              </Button>
              <Button
                onClick={() => { soundPlayer.play('ui_click'); onAdopt(); }}
                className="flex-1"
                icon={<Check className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              >
                采用建议
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 正确率分级配色（≥80 成功 / ≥50 警告 / 其余错误） */
function rateTone(correctRate: number): { bg: string; text: string } {
  if (correctRate >= 80) return { bg: 'bg-semantic-success/10 text-semantic-success', text: 'text-semantic-success' };
  if (correctRate >= 50) return { bg: 'bg-amber-500/10 text-amber-500', text: 'text-amber-500' };
  return { bg: 'bg-semantic-error/10 text-semantic-error', text: 'text-semantic-error' };
}

export interface SessionSummaryModalProps {
  completedCount: number;
  total: number;
  correctRate: number;
  sessionMastered: number;
  onRestart: () => void;
  onFinish: () => void;
}

export function SessionSummaryModal({
  completedCount, total, correctRate, sessionMastered, onRestart, onFinish,
}: SessionSummaryModalProps) {
  const tone = rateTone(correctRate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-kb-md">
      <div className="w-full max-w-sm bg-bg-elevated rounded-kb-xl shadow-kb-lg p-kb-lg animate-fade-in-up">
        <div className="flex justify-center mb-kb-md">
          <div className={cn('w-14 h-14 rounded-kb-xl flex items-center justify-center', tone.bg)}>
            <Sparkles className="w-7 h-7" strokeWidth={1.5} />
          </div>
        </div>

        <h3 className="text-h2 font-semibold text-text-primary text-center mb-kb-md">
          本轮学习完成
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-kb-lg">
          <div className="bg-bg-secondary rounded-kb-lg p-3 text-center">
            <p className="text-h1 font-bold text-text-primary">{completedCount}/{total}</p>
            <p className="text-c1 text-text-tertiary mt-0.5">完成卡片</p>
          </div>
          <div className="bg-bg-secondary rounded-kb-lg p-3 text-center">
            <p className={cn('text-h1 font-bold', tone.text)}>{correctRate}%</p>
            <p className="text-c1 text-text-tertiary mt-0.5">正确率</p>
          </div>
        </div>

        {sessionMastered > 0 && (
          <div className="flex items-center justify-center gap-1.5 mb-kb-md">
            <Star className="w-4 h-4 fill-brand-400 text-brand-400" strokeWidth={1.5} />
            <span className="text-b3 font-medium text-brand-600">
              新掌握 {sessionMastered} 个知识点
            </span>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={onRestart}
            className="flex-1"
            icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          >
            再来一轮
          </Button>
          <Button onClick={onFinish} className="flex-1">
            返回牌组
          </Button>
        </div>
      </div>
    </div>
  );
}
