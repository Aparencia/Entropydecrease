import { useState, useCallback } from 'react';
import { Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { Brain, Zap, BookOpen, RotateCcw } from 'lucide-react';
import {
  getCurrentAlgorithm,
  setSchedulerAlgorithm,
  getMaxNewCardsPerDay,
  setMaxNewCardsPerDay,
  getMaxReviewsPerDay,
  setMaxReviewsPerDay,
  DEFAULT_MAX_NEW_CARDS,
  DEFAULT_MAX_REVIEWS,
} from '@/lib/schedulingFactory';

/**
 * Toggle 开关组件
 */
function Toggle({ checked, onChange }: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-kb-full transition-colors duration-kb-fast flex-shrink-0',
        checked ? 'bg-brand-500' : 'bg-bg-tertiary',
      )}
      aria-label={checked ? '关闭' : '开启'}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-kb-full bg-white shadow-kb-sm transition-transform duration-kb-fast',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

/**
 * 闪卡调度算法设置
 *
 * - 算法选择（SM-2 / FSRS）
 * - 每日新卡上限
 * - 每日复习上限
 */
export default function FlashcardSettings() {
  const { toast } = useToast();

  const [algorithm, setAlgorithm] = useState<'sm2' | 'fsrs'>(getCurrentAlgorithm);
  const [maxNewCards, setMaxNewCards] = useState(getMaxNewCardsPerDay);
  const [maxReviews, setMaxReviews] = useState(getMaxReviewsPerDay);

  const handleAlgorithmToggle = useCallback((useFSRS: boolean) => {
    const newAlgo = useFSRS ? 'fsrs' : 'sm2';
    setAlgorithm(newAlgo);
    setSchedulerAlgorithm(newAlgo);
    toast({
      type: 'success',
      message: useFSRS ? '已切换到 FSRS-5 算法（可减少 20-30% 复习量）' : '已切换回 SM-2 经典算法',
    });
  }, [toast]);

  const handleMaxNewCardsChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(200, value));
    setMaxNewCards(clamped);
    setMaxNewCardsPerDay(clamped);
  }, []);

  const handleMaxReviewsChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(1000, value));
    setMaxReviews(clamped);
    setMaxReviewsPerDay(clamped);
  }, []);

  const handleReset = useCallback(() => {
    setAlgorithm('fsrs');
    setSchedulerAlgorithm('fsrs');
    setMaxNewCards(DEFAULT_MAX_NEW_CARDS);
    setMaxNewCardsPerDay(DEFAULT_MAX_NEW_CARDS);
    setMaxReviews(DEFAULT_MAX_REVIEWS);
    setMaxReviewsPerDay(DEFAULT_MAX_REVIEWS);
    toast({ type: 'success', message: '已恢复默认设置' });
  }, [toast]);

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
          <h2 className="text-b1 font-semibold text-text-primary">闪卡调度</h2>
        </div>
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-c1 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          重置
        </button>
      </div>

      {/* 算法选择 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
            <span className="text-b2 font-medium text-text-primary">间隔算法</span>
          </div>
          <p className="text-c1 text-text-tertiary mt-0.5 ml-6">
            {algorithm === 'fsrs'
              ? 'FSRS-5：基于记忆模型优化，减少 20-30% 复习量'
              : 'SM-2：经典间隔重复算法'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-c1', algorithm === 'sm2' ? 'text-text-primary font-medium' : 'text-text-tertiary')}>
            SM-2
          </span>
          <Toggle
            checked={algorithm === 'fsrs'}
            onChange={handleAlgorithmToggle}
          />
          <span className={cn('text-c1', algorithm === 'fsrs' ? 'text-text-primary font-medium' : 'text-text-tertiary')}>
            FSRS
          </span>
        </div>
      </div>

      {/* 每日新卡上限 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
            <span className="text-b2 font-medium text-text-primary">每日新卡上限</span>
          </div>
          <p className="text-c1 text-text-tertiary mt-0.5 ml-6">
            每天最多学习的新卡片数量
          </p>
        </div>
        <input
          type="number"
          min={1}
          max={200}
          value={maxNewCards}
          onChange={(e) => handleMaxNewCardsChange(parseInt(e.target.value, 10) || 1)}
          className="w-20 h-8 text-center text-b2 font-medium text-text-primary bg-bg-tertiary/50 border border-border/30 rounded-kb-md focus:outline-none focus:border-brand-400 transition-colors"
        />
      </div>

      {/* 每日复习上限 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
            <span className="text-b2 font-medium text-text-primary">每日复习上限</span>
          </div>
          <p className="text-c1 text-text-tertiary mt-0.5 ml-6">
            每天最多复习的卡片数量
          </p>
        </div>
        <input
          type="number"
          min={1}
          max={1000}
          value={maxReviews}
          onChange={(e) => handleMaxReviewsChange(parseInt(e.target.value, 10) || 1)}
          className="w-20 h-8 text-center text-b2 font-medium text-text-primary bg-bg-tertiary/50 border border-border/30 rounded-kb-md focus:outline-none focus:border-brand-400 transition-colors"
        />
      </div>
    </Card>
  );
}
