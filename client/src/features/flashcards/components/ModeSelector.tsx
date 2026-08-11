/**
 * 多感官复习模式切换栏
 *
 * @ai-context: 3.5 多感官复习——五种复习通道（阅读/听力/书写/讲解/情境）。
 * 切换即持久化（store 内 setReviewMode），阅读模式为默认通道。
 */
import { BookOpen, Headphones, PenLine, Mic, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  REVIEW_MODES,
  REVIEW_MODE_LABELS,
  REVIEW_MODE_HINTS,
  type ReviewMode,
} from '../lib/reviewMode';

const MODE_ICONS: Record<ReviewMode, React.ReactNode> = {
  reading: <BookOpen className="w-4 h-4" strokeWidth={1.6} />,
  listening: <Headphones className="w-4 h-4" strokeWidth={1.6} />,
  writing: <PenLine className="w-4 h-4" strokeWidth={1.6} />,
  speaking: <Mic className="w-4 h-4" strokeWidth={1.6} />,
  situational: <Sparkles className="w-4 h-4" strokeWidth={1.6} />,
};

interface ModeSelectorProps {
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-kb-md pt-2 flex-wrap">
      <div className="flex items-center gap-1 rounded-kb-full bg-bg-secondary/80 p-1 border border-border-subtle">
        {REVIEW_MODES.map((m) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m)}
              title={REVIEW_MODE_HINTS[m]}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-kb-full text-xs font-medium',
                'transition-all duration-kb-fast disabled:opacity-50',
                active
                  ? 'bg-brand-500/10 text-brand-600 border border-brand-300/50'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary border border-transparent',
              )}
            >
              {MODE_ICONS[m]}
              {REVIEW_MODE_LABELS[m]}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-text-tertiary hidden sm:block">{REVIEW_MODE_HINTS[mode]}</span>
    </div>
  );
}
