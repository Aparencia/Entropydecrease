/**
 * DashboardWelcome — 欢迎区（全局门面，固定首屏）
 *
 * 认知任务：回归奖赏（宪法第二条：久别返回的第一反馈永远是"欢迎回来"性质）+ 归属感。
 * 三视图共享：视图切换时欢迎区不动，减少视觉跳动（注意力残留最小化）。
 * StreakBubble 内嵌右上角（即时反馈，习惯循环的奖励端）。
 *
 * @ai-context: 首页全局欢迎区。
 */
import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { SPRING, fadeInUp } from '@/lib/animation/springConfig';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { getTodayLabel } from '../utils/dashboardUtils';
import type { StreakState } from '@/features/retention/types';

// 留存组件懒加载（首屏 bundle 控制）
const StreakBubble = lazy(() => import('@/features/retention/components/StreakBubble').then(m => ({ default: m.StreakBubble })));

interface DashboardWelcomeProps {
  greetingText: string;
  streakDays: number;
  streakState: StreakState | null;
}

export function DashboardWelcome({ greetingText, streakDays, streakState }: DashboardWelcomeProps) {
  return (
    <section className="relative w-full overflow-hidden">
      <motion.div
        className="relative max-w-[1100px] mx-auto px-6 pt-rhythm-xl pb-rhythm-md"
        initial="hidden"
        animate="visible"
      >
        {/* 连续打卡气泡：布局内嵌欢迎区右上（即时反馈） */}
        <div className="absolute top-6 right-6 z-10 hidden md:block">
          <Suspense fallback={null}>
            <StreakBubble streakState={streakState} />
          </Suspense>
        </div>

        <motion.div className="mb-rhythm-md" {...fadeInUp}>
          <div className="flex items-start gap-3">
            <ModuleRitualHeader sealChar="星" sealColor="#40AB92" compact />
            <div>
              <h1 className="text-d2 font-semibold text-text-primary tracking-tight mb-2">
                {greetingText}
              </h1>
              <p className="text-b2 text-text-tertiary">{getTodayLabel()}</p>
            </div>
          </div>
          {streakDays > 0 && (
            <motion.span
              className="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-kb-full bg-brand-500/10 text-brand-500 text-c1 font-medium"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...SPRING.bouncy, delay: 0.3 }}
            >
              <Sparkles className="w-3 h-3" /> 连续学习 {streakDays} 天
            </motion.span>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}
