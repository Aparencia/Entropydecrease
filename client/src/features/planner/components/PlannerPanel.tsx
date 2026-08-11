/**
 * 今日航线面板 — 个性化学习计划
 * Daily plan panel — personalized learning path
 *
 * @ai-context: P1 规划器 UI：展示今日计划任务（模块徽章/时长/理由/完成勾选），
 * 点击任务跳转对应模块；AI 不可用时展示本地规则计划（source 标签区分）。
 * 全部完成或加载中时折叠为空态。焦虑防线合规：无倒计时/赤字/比较。
 * @ai-context: Daily plan panel: renders today's plan items with module
 * badges, duration, reason and completion toggles; AI plans are labeled
 * differently from local-rule fallback plans.
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Sparkles, Compass, Check, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLearningPlan } from '../hooks/useLearningPlan';
import { PLAN_MODULE_META } from '../types';
import { Modal, Button } from '@/components/ui';
import CoachPlanView from './CoachPlanView';
import { useAILearningCoach } from '@/lib/ai/hooks/useAILearningCoach';

export default function PlannerPanel() {
  const navigate = useNavigate();
  const { plan, loading, regenerate, toggleDone } = useLearningPlan();
  // P6 学习教练：AI 生成周学习计划（懒加载，失败 isFallback 展示降级文案）
  const { plan: coachPlan, loading: coachLoading, isFallback: coachFallback, generatePlan } = useAILearningCoach();
  const [coachOpen, setCoachOpen] = useState(false);
  const handleOpenCoach = () => {
    setCoachOpen(true);
    if (!coachPlan) void generatePlan();
  };

  // 加载中：骨架占位
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/15 bg-bg-elevated/30 p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-bg-tertiary/40" />
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-bg-tertiary/20" />
          ))}
        </div>
      </div>
    );
  }

  // 无计划：静默隐藏（首日/存储异常）
  if (!plan || plan.items.length === 0) return null;

  const doneCount = plan.items.filter((i) => i.done).length;
  const allDone = doneCount === plan.items.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={cn(
        'rounded-2xl border p-5 backdrop-blur-sm transition-colors',
        allDone
          ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
          : 'border-brand-500/20 bg-brand-500/[0.05]',
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <Compass className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          今日航线
          <span className="rounded-full bg-bg-tertiary/40 px-2 py-0.5 text-[10px] font-normal text-text-tertiary">
            {doneCount}/{plan.items.length} 项
          </span>
          {plan.source === 'local' && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-normal text-amber-400">
              本地规划
            </span>
          )}
        </h2>
        <button
          onClick={() => void regenerate()}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-tertiary transition-colors hover:text-text-primary hover:bg-bg-tertiary/30"
          aria-label="重新生成今日计划"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          重排
        </button>
        {/* P6 学习教练：AI 周计划入口 */}
        <button
          onClick={handleOpenCoach}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-tertiary transition-colors hover:text-brand-500 hover:bg-brand-500/10"
          aria-label="AI 教练周计划"
        >
          <CalendarRange className="w-3.5 h-3.5" strokeWidth={1.5} />
          AI 教练
        </button>
      </div>

      <ul className="space-y-2">
        {plan.items.map((item) => {
          // 渲染层兜底：即使存储数据异常（外部写入/旧版本），也不因
          // PLAN_MODULE_META 索引 undefined 而崩溃（loadPlan 已过滤，双保险）
          const meta = PLAN_MODULE_META[item.module] ?? PLAN_MODULE_META.pomodoro;
          return (
            <li
              key={item.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border/20 bg-bg-elevated/30 p-3 transition-all',
                item.done && 'opacity-55',
              )}
            >
              {/* 完成勾选 */}
              <button
                onClick={() => toggleDone(item.id)}
                aria-label={item.done ? `取消完成：${item.title}` : `标记完成：${item.title}`}
                className={cn(
                  'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors',
                  item.done
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                    : 'border-border/50 text-transparent hover:border-brand-400/60',
                )}
              >
                <Check className="w-3 h-3" strokeWidth={2.5} />
              </button>

              {/* 任务主体 */}
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => navigate(meta.route)}
                aria-label={`前往${meta.label}模块`}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', meta.badge)}>
                    {meta.label}
                  </span>
                  <span className="truncate text-[13px] font-medium text-text-primary">
                    {item.title}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-text-tertiary tabular-nums">
                    {item.minutes} 分钟
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-text-secondary">{item.task || item.reason}</p>
              </button>
            </li>
          );
        })}
      </ul>

      {plan.note && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-tertiary">
          <Sparkles className="mt-0.5 w-3 h-3 flex-shrink-0 text-brand-500/70" strokeWidth={1.5} />
          {plan.note}
        </p>
      )}

      {/* P6 AI 教练周计划弹层 */}
      <Modal
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        title="🧭 AI 教练周计划"
        description="基于本周学习数据生成下周安排"
        size="lg"
      >
        {coachPlan ? (
          <CoachPlanView plan={coachPlan} loading={coachLoading} isFallback={coachFallback} />
        ) : (
          <div className="py-10 text-center text-c1 text-text-tertiary animate-pulse">
            {coachLoading ? 'AI 教练正在规划你的学习周…' : '暂无周计划，点击下方按钮生成'}
          </div>
        )}
        {coachPlan && (
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => void generatePlan()}>
              <RefreshCw className="w-3 h-3 mr-1" strokeWidth={1.5} />
              重新生成
            </Button>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
