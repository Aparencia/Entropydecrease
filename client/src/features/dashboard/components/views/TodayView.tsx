/**
 * TodayView — 「今日」视图：计划与行动（默认首屏）
 *
 * 认知任务：执行意图（今日航线）+ 未完成显性化（待办，蔡格尼克效应）+ 低门槛行动（快捷操作）。
 * 欢迎区由全局 DashboardWelcome 承载（三视图共享，固定首屏）。
 *
 * @ai-context: dashboard 三视图之今日视图。
 */
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Timer, FileText, Layers, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { DashboardCard } from '../DashboardCard';
import { useHomeScheme } from '../../hooks/useHomeScheme';
import PlannerPanel from '@/features/planner/components/PlannerPanel';
import SocialProofBanner from '@/features/retention/components/SocialProofBanner';
import PearlGoal from '../deep-sea/creatures/PearlGoal';
import KnowledgePreviewCard from '../KnowledgePreviewCard';
import type { DashboardData } from '../../hooks/useDashboardData';

const accentText: Record<string, string> = {
  pomodoro: 'text-pomodoro', note: 'text-note',
  flashcard: 'text-flashcard', feynman: 'text-feynman',
};

const quickActions = [
  { label: '专注', icon: Timer, path: '/pomodoro', accent: 'pomodoro' as const },
  { label: '笔记', icon: FileText, path: '/notes', accent: 'note' as const },
  { label: '闪卡', icon: Layers, path: '/flashcards', accent: 'flashcard' as const },
  { label: '费曼', icon: Lightbulb, path: '/feynman', accent: 'feynman' as const },
];

interface TodayViewProps {
  isLoading: boolean;
  todayPomodoroCount: number;
  noteTotal: number;
  dueFlashcardCount: number;
  feynmanInProgressCount: number;
  goalData: DashboardData['goalData'];
  analyticsLoading: boolean;
  knowledgeCards: DashboardData['knowledgeCards'];
  emptyQuote: string;
}

export function TodayView({
  isLoading,
  todayPomodoroCount, noteTotal, dueFlashcardCount, feynmanInProgressCount,
  goalData, analyticsLoading, knowledgeCards, emptyQuote,
}: TodayViewProps) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { scheme } = useHomeScheme();

  const heroStats: Array<{
    label: string; value: number; unit: string;
    accent: 'pomodoro' | 'note' | 'flashcard' | 'feynman';
    icon: typeof Timer; path: string;
  }> = [
    { label: '今日专注', value: todayPomodoroCount, unit: '次', accent: 'pomodoro', icon: Timer, path: '/pomodoro' },
    { label: '笔记总数', value: noteTotal, unit: '篇', accent: 'note', icon: FileText, path: '/notes' },
    { label: '待复习', value: dueFlashcardCount, unit: '张', accent: 'flashcard', icon: Layers, path: '/flashcards' },
    { label: '费曼进行中', value: feynmanInProgressCount, unit: '个', accent: 'feynman', icon: Lightbulb, path: '/feynman' },
  ];

  return (
    <div className="stagger-fade-in">
      {/* ════ 今日航线：行动导向主角 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 pt-rhythm-md">
        <PlannerPanel />
      </section>

      {/* ════ 今日待办：未完成显性化（蔡格尼克效应） ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-rhythm-sm">
          <DashboardCard
            accent="flashcard"
            onClick={() => navigate('/flashcards')}
            role="link"
            tabIndex={0}
          >
            <div className="p-5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-kb-full bg-bg-elevated/60 flex items-center justify-center flex-shrink-0">
                <Layers className={cn('w-5 h-5', accentText.flashcard)} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="text-b2 font-medium text-text-primary">
                  待复习 <span className="tabular-nums">{isLoading ? '—' : dueFlashcardCount}</span> 张
                </div>
                <div className="text-c1 text-text-tertiary truncate">朦胧的知识，等待一次唤醒</div>
              </div>
            </div>
          </DashboardCard>
          <DashboardCard
            accent="feynman"
            onClick={() => navigate('/feynman')}
            role="link"
            tabIndex={0}
          >
            <div className="p-5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-kb-full bg-bg-elevated/60 flex items-center justify-center flex-shrink-0">
                <Lightbulb className={cn('w-5 h-5', accentText.feynman)} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="text-b2 font-medium text-text-primary">
                  费曼进行中 <span className="tabular-nums">{isLoading ? '—' : feynmanInProgressCount}</span> 个
                </div>
                <div className="text-c1 text-text-tertiary truncate">把讲清楚的概念，留在海面上</div>
              </div>
            </div>
          </DashboardCard>
        </div>
      </section>

      {/* ════ 快捷操作 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <div className="flex gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.path}
                onClick={() => navigate(action.path)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-kb-lg',
                  'border border-border/20 backdrop-blur-sm',
                  'bg-bg-elevated/30 hover:bg-bg-elevated/60',
                  'text-b3 font-medium text-text-secondary hover:text-text-primary',
                  'transition-all duration-beat-x2',
                )}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
              >
                <Icon className={cn('w-4 h-4', accentText[action.accent])} strokeWidth={1.5} />
                {action.label}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ════ 今日统计：状态反馈 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-rhythm-sm">
          {heroStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <DashboardCard
                  accent={stat.accent}
                  role="link"
                  tabIndex={0}
                  aria-label={`进入${stat.label}模块`}
                  onClick={() => navigate(stat.path)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(stat.path); } }}
                  className="h-full p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={cn('w-icon-sm h-icon-sm', accentText[stat.accent])} strokeWidth={1.5} />
                    <span className="text-c1 text-text-tertiary font-medium">{stat.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      'text-d1 font-bold tabular-nums tracking-tight',
                      accentText[stat.accent],
                      scheme === 'deep-sea' && !reducedMotion && 'kb-stat-breathe',
                    )}>
                      {isLoading ? '—' : stat.value}
                    </span>
                    <span className="text-b3 text-text-tertiary">{stat.unit}</span>
                  </div>
                </DashboardCard>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* 🎯 目标进度（目标梯度效应，紧邻计划区） */}
      {goalData.length > 0 && (
        <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
          <PearlGoal goals={goalData} loading={analyticsLoading} />
        </section>
      )}

      {/* ════ 社交证据（归属感，收尾不抢注意力） ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <SocialProofBanner />
      </section>

      {/* ════ 知识预览：回到学习现场 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-lg pb-rhythm-xl">
        <div className="mb-rhythm-sm">
          <ModuleRitualHeader
            title="知识预览"
            note="最近的学习足迹"
            sealChar="星"
            sealColor="#40AB92"
            compact
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-rhythm-sm">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[140px] bg-bg-elevated/30 animate-pulse-skeleton"
                style={{ borderRadius: '24px 12px 20px 16px' }}
              />
            ))}
          </div>
        ) : knowledgeCards.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-rhythm-sm">
            {knowledgeCards.map((card, i) => (
              <KnowledgePreviewCard key={card.id} card={card} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-rhythm-xl">
            <p className="text-b2 text-text-tertiary">
              {emptyQuote}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
