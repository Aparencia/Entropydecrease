/**
 * RitualFooter — 仪式底部操作区（步骤指示器 + 主按钮"一圈点亮"）
 * Ritual footer (step dots + primary button with cycle-lit state)
 *
 * @ai-context: RIT-17 软引导——呼吸步骤首圈未完成时主按钮呈半透明
 * 呼吸态（animate-breathe），圈满后点亮为实色；点亮前仍可点击通过
 * （不强制，自主权审查项）。
 * @ai-context: RIT-17 soft guidance: primary button breathes at low
 * opacity until the first breathing cycle completes, then lights up.
 * Always clickable — never blocks the user.
 */
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  totalSteps: number;
  stepIndex: number;
  isLast: boolean;
  /** 最后一步的"一圈点亮"状态（非最后一步恒为 true） */
  cycleLit: boolean;
  /** 当前步骤是否需要完成一圈呼吸才点亮（仅"最后一步为呼吸步"时为 true，B1.6 A/B 支持呼吸前置） */
  requireCycle: boolean;
  onNext: () => void;
}

export function RitualFooter({ totalSteps, stepIndex, isLast, cycleLit, requireCycle, onNext }: Props) {
  const dimmed = requireCycle && !cycleLit;

  return (
    <div className="flex items-center justify-between pt-2">
      {/* 步骤指示器 */}
      <div className="flex gap-1.5" aria-label={`第 ${stepIndex + 1} 步，共 ${totalSteps} 步`}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              i === stepIndex ? 'bg-focus w-4' : i < stepIndex ? 'bg-focus/50' : 'bg-border',
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-kb-full text-sm font-medium',
          'text-white transition-all duration-500 active:scale-95',
          dimmed
            ? 'bg-focus/40 animate-breathe' // 首圈未满：半透明呼吸态（仍可点击）
            : 'bg-focus hover:bg-focus/90 shadow-[0_0_12px_rgba(74,155,217,0.35)]',
        )}
      >
        {isLast ? '开始学习' : '下一步'}
        <ChevronRight className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  );
}
