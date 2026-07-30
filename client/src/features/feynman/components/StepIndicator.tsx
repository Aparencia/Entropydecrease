/**
 * @ai-context: 通用组件：StepIndicator。
 */
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen, MessageSquare, Highlighter, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/animation/springConfig';

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  completedSteps: number[];
}

const steps = [
  { num: 1 as const, label: '选择概念', icon: BookOpen, desc: '确定学习主题' },
  { num: 2 as const, label: '讲解概念', icon: MessageSquare, desc: '用简单语言解释' },
  { num: 3 as const, label: '标注薄弱', icon: Highlighter, desc: '找出说不清的部分' },
  { num: 4 as const, label: '简化重述', icon: RefreshCw, desc: '用更通俗的话重讲' },
];

/**
 * 垂直时间线步骤指示器 — 苏格拉底对话风格
 * 蔡格尼克效应：未来步骤模糊化，激发好奇与前进动力
 * 当前步骤：品牌色呼吸脉动节点
 */
export function StepIndicator({ currentStep, completedSteps }: StepIndicatorProps) {
  const prefersReduced = useReducedMotion();
  const isCompleted = (n: number) => completedSteps.includes(n);
  const isCurrent = (n: number) => currentStep === n;
  const isFuture = (n: number) => n > currentStep && !completedSteps.includes(n);

  return (
    <div className="flex flex-col gap-0">
      {/* 进度标题 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-c1 text-text-tertiary font-medium">学习进度</span>
        <motion.span
          key={currentStep}
          className="text-c1 font-semibold text-feynman tabular-nums"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {currentStep} / {steps.length}
        </motion.span>
      </div>

      {/* 垂直时间线 */}
      <div className="relative pl-6">
        {/* 左侧竖线 */}
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border/40 rounded-full" />
        {/* 进度填充线 */}
        <motion.div
          className="absolute left-[11px] top-2 w-0.5 rounded-full bg-gradient-to-b from-feynman to-brand-500"
          initial={false}
          animate={{
            height: `${((Math.min(currentStep, steps.length) - 0.5) / (steps.length - 0.2)) * 100}%`,
          }}
          transition={prefersReduced ? { duration: 0.01 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {steps.map(({ num, label, icon: Icon, desc }, idx) => {
          const completed = isCompleted(num);
          const current = isCurrent(num);
          const future = isFuture(num);
          const isLast = idx === steps.length - 1;

          return (
            <motion.div
              key={num}
              className={cn(
                'relative flex items-start gap-3 pb-5',
                isLast && 'pb-0',
                future && !prefersReduced && 'opacity-40',
              )}
              style={future && !prefersReduced ? { filter: 'blur(1.5px)' } : undefined}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: future && !prefersReduced ? 0.4 : 1, x: 0 }}
              transition={prefersReduced ? { duration: 0.01 } : { ...SPRING.default, delay: idx * 0.06 }}
            >
              {/* 节点 */}
              <div className="relative flex-shrink-0 -ml-6">
                {/* 当前步骤脉动光晕 */}
                {current && !completed && !prefersReduced && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, var(--kb-brand-500) 0%, transparent 70%)',
                      width: 24,
                      height: 24,
                    }}
                    animate={{
                      scale: [1, 1.8, 1],
                      opacity: [0.4, 0.15, 0.4],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                )}

                <motion.div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center border-2',
                    'transition-colors duration-300',
                    completed && 'bg-semantic-success border-semantic-success text-white',
                    current && !completed && 'bg-brand-500 border-brand-500 text-white',
                    future && 'bg-bg-elevated border-border text-text-tertiary',
                  )}
                  animate={current && !completed && !prefersReduced ? {
                    scale: [1, 1.1, 1],
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {completed ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={SPRING.bouncy}
                    >
                      <Check className="w-3 h-3" strokeWidth={2.5} />
                    </motion.div>
                  ) : (
                    <Icon className="w-3 h-3" strokeWidth={1.5} />
                  )}
                </motion.div>
              </div>

              {/* 文本内容 */}
              <div className="flex flex-col pt-0.5 min-w-0">
                <span className={cn(
                  'text-b3 font-medium leading-tight',
                  completed && 'text-semantic-success',
                  current && !completed && 'text-brand-600 dark:text-brand-400',
                  future && 'text-text-tertiary',
                )}>
                  {label}
                </span>
                {(current || completed) && (
                  <motion.span
                    className="text-c1 text-text-tertiary mt-0.5"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                  >
                    {desc}
                  </motion.span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
