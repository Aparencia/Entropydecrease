/**
 * @ai-context: 通用组件：ConfidenceSelector。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING } from '@/lib/animation/springConfig';
import type { Confidence } from '@/types/models';
import { AlertTriangle, Minus, CheckCircle } from 'lucide-react';

/**
 * 三档自信度选择器 — 时空竞技场
 * 色彩编码 + scale点击反馈 + 呼吸光效
 */

interface ConfidenceOption {
  value: Confidence;
  label: string;
  description: string;
  color: string;
  activeBg: string;
  activeBorder: string;
  glowColor: string;
  icon: React.ReactNode;
}

const options: ConfidenceOption[] = [
  {
    value: 'low',
    label: '不确定',
    description: '不太有把握',
    color: 'text-amber-500',
    activeBg: 'bg-amber-500/10',
    activeBorder: 'border-amber-400/50',
    glowColor: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
    icon: <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />,
  },
  {
    value: 'medium',
    label: '有把握',
    description: '比较确定',
    color: 'text-blue-500',
    activeBg: 'bg-blue-500/10',
    activeBorder: 'border-blue-400/50',
    glowColor: 'shadow-[0_0_12px_rgba(59,130,246,0.25)]',
    icon: <Minus className="w-4 h-4" strokeWidth={2} />,
  },
  {
    value: 'high',
    label: '很确定',
    description: '非常有信心',
    color: 'text-emerald-500',
    activeBg: 'bg-emerald-500/10',
    activeBorder: 'border-emerald-400/50',
    glowColor: 'shadow-[0_0_12px_rgba(16,185,129,0.25)]',
    icon: <CheckCircle className="w-4 h-4" strokeWidth={1.5} />,
  },
];

export interface ConfidenceSelectorProps {
  value: Confidence | null;
  onChange: (confidence: Confidence) => void;
  disabled?: boolean;
}

export function ConfidenceSelector({ value, onChange, disabled = false }: ConfidenceSelectorProps) {
  const prefersReduced = useReducedMotion();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-c1 font-medium text-text-tertiary text-center">你的自信度</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt, i) => {
          const isActive = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              initial={prefersReduced ? false : { y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={
                prefersReduced
                  ? { duration: 0.01 }
                  : { ...SPRING.bouncy, delay: i * 0.04 }
              }
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              className={cn(
                'relative flex flex-col items-center gap-1 py-2.5 px-2 rounded-kb-md border',
                'transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? `${opt.activeBg} ${opt.activeBorder} ${opt.glowColor}`
                  : 'bg-bg-secondary border-border/40 hover:bg-bg-tertiary/40',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="confidence-active"
                  className={cn('absolute inset-0 rounded-kb-md border-2', opt.activeBorder)}
                  transition={prefersReduced ? { duration: 0.01 } : SPRING.default}
                />
              )}
              <span className={cn('relative z-10', isActive ? opt.color : 'text-text-tertiary')}>
                {opt.icon}
              </span>
              <span className={cn(
                'relative z-10 text-b3 font-medium',
                isActive ? 'text-text-primary' : 'text-text-secondary',
              )}>
                {opt.label}
              </span>
              <span className="relative z-10 text-c1 text-text-tertiary">{opt.description}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
