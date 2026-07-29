/**
 * @ai-context: 通用组件：FeynmanStepNavigation。
 */
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface FeynmanStepNavigationProps {
  currentStep: number;
  isCompleted: boolean;
  onPrev: () => void;
  onNext: () => void;
  onComplete: () => void;
  onBackToList: () => void;
}

/**
 * 费曼学习会话底部步骤导航条。
 */
export function FeynmanStepNavigation({
  currentStep,
  isCompleted,
  onPrev,
  onNext,
  onComplete,
  onBackToList,
}: FeynmanStepNavigationProps) {
  return (
    <motion.div
      className={cn(
        'flex items-center justify-between gap-kb-sm px-kb-md py-3',
        'border-t border-border/50 bg-bg-elevated/90 backdrop-blur-sm flex-shrink-0 relative z-10',
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <Button
        variant="secondary"
        size="sm"
        icon={<ArrowLeft className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
        onClick={onPrev}
        disabled={currentStep === 1}
      >
        上一步
      </Button>

      {currentStep < 4 ? (
        <Button
          size="sm"
          icon={<ArrowRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          iconRight={<span />}
          onClick={onNext}
        >
          下一步
        </Button>
      ) : !isCompleted ? (
        <Button
          size="sm"
          icon={<Check className="w-icon-sm h-icon-sm" strokeWidth={2} />}
          onClick={onComplete}
        >
          完成学习
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={onBackToList}
        >
          返回列表
        </Button>
      )}
    </motion.div>
  );
}
