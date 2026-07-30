/**
 * 学习会话 — 顶栏（关闭/进度条/新掌握计数）
 *
 * @ai-context: 从 StudySessionPage 拆出。展示"已学/总数"、进度百分比与
 * 本轮新掌握知识点数；新掌握计数变化时右侧浮出 +1 动效（showPlusOne 由
 * 交互 hook 控制 800ms 时长）。
 */
import { X, Star } from 'lucide-react';

export interface SessionHeaderProps {
  completedCount: number;
  total: number;
  progress: number;
  sessionMastered: number;
  showPlusOne: boolean;
  onClose: () => void;
}

export function SessionHeader({
  completedCount, total, progress, sessionMastered, showPlusOne, onClose,
}: SessionHeaderProps) {
  return (
    <div className="flex items-center gap-kb-sm px-kb-md py-3 flex-shrink-0">
      <button
        onClick={onClose}
        className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
      >
        <X className="w-icon-md h-icon-md" strokeWidth={1.5} />
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-b3 font-medium text-text-secondary">
            {completedCount}/{total} 已学习
          </span>
          {sessionMastered > 0 && (
            <span className="inline-flex items-center gap-1 text-c1 font-medium text-brand-600">
              <Star className="w-3 h-3 fill-brand-400 text-brand-400" strokeWidth={1.5} />
              <span className="relative">
                {sessionMastered}
                {showPlusOne && (
                  <span
                    className="absolute -right-5 -top-0.5 text-c1 font-bold text-brand-500 animate-fade-in-up"
                    style={{ animationDuration: '600ms' }}
                  >
                    +1
                  </span>
                )}
              </span>
            </span>
          )}
          <span className="text-c1 text-text-tertiary">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-kb-full bg-bg-tertiary overflow-hidden flex-1 min-h-0">
          <div
            className="h-full rounded-kb-full bg-flashcard transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
