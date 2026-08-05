/**
 * 学习教练周计划视图 — 展示 AI 生成的周计划
 *
 * @ai-context: 展示由 AI 学习教练生成的周计划（每日任务列表），
 * AI 不可用时使用本地规则降级。嵌入 PlannerPanel 中。
 */
import { motion } from 'framer-motion';
import { Sparkles, Target, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeeklyCoachPlan } from '@/lib/ai/types';

interface CoachPlanViewProps {
  plan: WeeklyCoachPlan;
  loading?: boolean;
  isFallback?: boolean;
  className?: string;
}

export default function CoachPlanView({ plan, loading, isFallback, className }: CoachPlanViewProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-border/15 bg-bg-elevated/30 p-4', className)}>
        <div className="h-4 w-32 animate-pulse rounded bg-bg-tertiary/40" />
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-bg-tertiary/20" />
          ))}
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-2xl border border-border/20 bg-bg-elevated/50 overflow-hidden', className)}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold text-text-primary">{plan.weekLabel}</span>
          {isFallback && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">本地规划</span>
          )}
        </div>
      </div>

      <div className="p-3 space-y-2">
        {plan.days.map((day, i) => (
          <motion.div
            key={day.day}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-border/10 bg-bg-elevated/30 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-text-primary">{day.day}</span>
              <span className="text-[10px] text-text-tertiary">
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-brand-500">{day.focus}</span>
                <span className="ml-2">{day.estimatedMinutes} 分钟</span>
              </span>
            </div>
            <ul className="space-y-1">
              {day.tasks.map((task, j) => (
                <li key={j} className="flex items-start gap-1.5">
                  <ChevronRight className="w-3 h-3 text-brand-500/70 mt-0.5 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[12px] text-text-secondary">{task}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      {/* 周目标 */}
      <div className="px-4 py-3 border-t border-border/10">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-brand-500/70 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
          <div>
            <p className="text-[12px] text-text-secondary">{plan.weeklyGoal}</p>
            <p className="text-[11px] text-text-tertiary mt-1">{plan.encouragement}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}