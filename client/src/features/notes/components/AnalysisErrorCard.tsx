/**
 * 分析失败错误卡片（从 AnalysisPreview 抽出的错误分支）
 *
 * @ai-context: P0-1 错误态可操作化载体——按传入的回调渲染差异化操作按钮：
 * onRetry（重试）/ onGoSettings（打开设置）/ 关闭。样式语言与
 * AnalysisPreview 原错误分支完全一致（纯搬移，零逻辑变更）。
 * @ai-context: Error-state card extracted from AnalysisPreview; renders
 * actionable buttons (retry / open settings / dismiss) per provided handlers.
 */
import { AlertCircle, RotateCcw, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisErrorCardProps {
  /** 用户可读错误文案 */
  error: string;
  /** 重试回调（retry 类错误提供） */
  onRetry?: () => void;
  onDismiss: () => void;
  /** 打开设置回调（gateway_config 类错误提供） */
  onGoSettings?: () => void;
}

export function AnalysisErrorCard({ error, onRetry, onDismiss, onGoSettings }: AnalysisErrorCardProps) {
  return (
    <div
      className={cn(
        'mx-3 my-2 p-4 rounded-kb-lg',
        'bg-semantic-error/5 backdrop-blur-xl border border-semantic-error/15 shadow-kb-md',
      )}
    >
      <div className="flex items-start gap-2 mb-3">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-semantic-error" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-b2 font-medium text-semantic-error">分析失败</p>
          <p className="text-b3 text-text-tertiary mt-1 leading-relaxed">{error}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            重试
          </button>
        )}
        {onGoSettings && (
          <button
            onClick={onGoSettings}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
            打开设置
          </button>
        )}
        <button
          onClick={onDismiss}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
            'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary active:scale-95 transition-all duration-kb-fast',
          )}
        >
          关闭
        </button>
      </div>
    </div>
  );
}

export default AnalysisErrorCard;
