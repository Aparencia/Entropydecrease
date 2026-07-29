/**
 * DashboardPage — 「知识星空」沉浸式学习生态可视化
 *
 * 布局结构：
 * 1. 英雄区域（Hero）— 全宽，粒子背景 + 核心数据 + fadeInUp入场
 * 2. 学习脉搏（Pulse）— 学习强度曲线 + 交融渐变
 * 3. 知识预览（Preview）— 最近笔记/闪卡/番茄钟的浮动卡片
 *
 * @ai-context: dashboard 功能模块页面：DashboardPage。
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Timer, FileText, Layers, Lightbulb, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, fadeInUp } from '@/lib/animation/springConfig';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { pomodoroSessionStore, flashcardStore, flashcardReviewStore, appSettingsStore } from '@/lib/storage';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useNoteStore } from '@/features/notes/store/useNoteStore';
import { useFeynmanStore } from '@/features/feynman/store/useFeynmanStore';
import { useCheckIn } from '@/lib/checkin/useCheckIn';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLearningAnalytics } from '../hooks/useLearningAnalytics';
import StartupRitual from '../components/StartupRitual';
import { useLastSession } from '../hooks/useLastSession';

import LearningPulse from '../components/LearningPulse';
import KnowledgePreviewCard from '../components/KnowledgePreviewCard';
import type { MicroGoal, RitualSettings } from '../types';
import type { PomodoroSession, Flashcard, FlashcardReview } from '@/types/models';
import type { KnowledgeCard } from '../components/KnowledgePreviewCard';
import '../styles/dashboard.css';

/* ── 工具函数 ── */
const accentText: Record<string, string> = {
  pomodoro: 'text-pomodoro', note: 'text-note',
  flashcard: 'text-flashcard', feynman: 'text-feynman',
};

/* ── 氛围文案池 ── */
const ATMOSPHERE_QUOTES: Record<string, string[]> = {
  dawn:    ['晨光微暖，新的一天开始了', '天刚亮，世界还很安静', '清晨的风，带着一点凉意'],
  morning: ['阳光正好，一切刚刚好', '窗外的光，慢慢爬上了桌', '早晨的空气，格外清新'],
  noon:    ['午后的光，刚好照进书桌', '日头正暖，时光慢慢走', '正午的阳光，明亮却不刺眼'],
  evening: ['天色渐柔，适合慢下来', '夕阳把影子拉得很长', '傍晚的风，带着一天故事'],
  night:   ['夜色温柔，属于自己的时间', '星星出来了，世界安静了', '夜晚的光，只为你亮着'],
  late:    ['万籁俱静，世界只剩你和光', '深夜的灯，是最温柔的陪伴', '月亮很高，夜很深'],
};

function getTimePeriod(): string {
  const h = new Date().getHours();
  if (h < 6) return 'late';
  if (h < 9) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 14) return 'noon';
  if (h < 18) return 'evening';
  if (h < 22) return 'night';
  return 'late';
}

function getAtmosphereQuote(): string {
  const period = getTimePeriod();
  const quotes = ATMOSPHERE_QUOTES[period];
  const daySeed = new Date().getDate();
  return quotes[daySeed % quotes.length];
}

function getTodayLabel() {
  const d = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ── 动画变体 ── */
const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const heroStatVariant = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING.gentle },
};

/* ── 快捷操作 ── */
const quickActions = [
  { label: '专注', icon: Timer, path: '/pomodoro', accent: 'pomodoro' as const },
  { label: '笔记', icon: FileText, path: '/notes', accent: 'note' as const },
  { label: '闪卡', icon: Layers, path: '/flashcards', accent: 'flashcard' as const },
  { label: '费曼', icon: Lightbulb, path: '/feynman', accent: 'feynman' as const },
];

/* ══════════════════════════════════════════
   Dashboard 主组件
   ══════════════════════════════════════════ */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();

  /* ── 学习启动仪式 ── */
  const [showRitual, setShowRitual] = useState(false);
  const lastSession = useLastSession();

  useEffect(() => {
    (async () => {
      try {
        const settings = await appSettingsStore.getAll();
        const ritualRow = settings.find((s) => s.key === 'startupRitual');
        const ritual: RitualSettings | undefined = ritualRow
          ? JSON.parse(ritualRow.value)
          : undefined;
        if (ritual?.enabled === false) return;
        if (ritual?.skipToday && ritual?.lastRitualDate === getTodayStr()) return;
        if (ritual?.lastRitualDate === getTodayStr()) return;
        setShowRitual(true);
      } catch {
        setShowRitual(true);
      }
    })();
  }, []);

  const handleRitualComplete = useCallback(async (goal?: MicroGoal) => {
    const today = getTodayStr();
    const ritualValue: RitualSettings = { enabled: true, lastRitualDate: today, skipToday: false };
    try {
      const settings = await appSettingsStore.getAll();
      const ritualRow = settings.find((s) => s.key === 'startupRitual');
      if (ritualRow) {
        await appSettingsStore.update(ritualRow.id, { value: JSON.stringify(ritualValue), updatedAt: new Date() });
      } else {
        await appSettingsStore.create({
          id: `startupRitual-${Date.now()}`,
          key: 'startupRitual',
          value: JSON.stringify(ritualValue),
          updatedAt: new Date(),
        });
      }
    } catch { /* 静默 */ }
    void goal;
    setShowRitual(false);
  }, []);

  const handleRitualSkip = useCallback(async () => {
    setShowRitual(false);
  }, []);

  /* ── 数据源 ── */
  const userName = user?.user_metadata?.display_name || user?.email?.split('@')[0];
  const greetingText = useMemo(() => {
    const quote = getAtmosphereQuote();
    return userName ? `${quote} — ${userName}` : quote;
  }, [userName]);

  const { streakDays } = useCheckIn('dashboard');

  const loadDecks = useFlashcardStore((s) => s.loadDecks);
  const notes = useNoteStore((s) => s.notes);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const feynmanNotes = useFeynmanStore((s) => s.notes);
  const loadFeynmanNotes = useFeynmanStore((s) => s.loadNotes);

  const [isLoading, setIsLoading] = useState(true);
  const [pomodoroSessions, setPomodoroSessions] = useState<PomodoroSession[]>([]);
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [flashcardReviews, setFlashcardReviews] = useState<FlashcardReview[]>([]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      loadDecks(), loadNotes(), loadFeynmanNotes(),
      pomodoroSessionStore.getAll().then(setPomodoroSessions),
      flashcardStore.getAll().then(setAllCards),
      flashcardReviewStore.getAll().then(setFlashcardReviews),
    ]).finally(() => setIsLoading(false));
  }, []); // eslint-disable-line

  /* ── 核心统计 ── */
  const todayPomodoroCount = useMemo(() => {
    const today = new Date().toDateString();
    return pomodoroSessions.filter((s) => new Date(s.completedAt).toDateString() === today).length;
  }, [pomodoroSessions]);
  const noteTotal = notes.length;
  const dueFlashcardCount = useMemo(() => allCards.filter((c) => new Date(c.dueDate) <= new Date()).length, [allCards]);
  const feynmanInProgressCount = useMemo(() => feynmanNotes.filter((n) => n.status === 'in_progress').length, [feynmanNotes]);

  const heroStats = [
    { label: '今日专注', value: todayPomodoroCount, unit: '次', accent: 'pomodoro', icon: Timer },
    { label: '笔记总数', value: noteTotal, unit: '篇', accent: 'note', icon: FileText },
    { label: '待复习', value: dueFlashcardCount, unit: '张', accent: 'flashcard', icon: Layers },
    { label: '费曼进行中', value: feynmanInProgressCount, unit: '个', accent: 'feynman', icon: Lightbulb },
  ];

  /* ── 学习分析 ── */
  const { data: analytics, loading: analyticsLoading } = useLearningAnalytics(14);

  /* ── 知识预览卡片数据 ── */
  const knowledgeCards = useMemo<KnowledgeCard[]>(() => {
    const cards: KnowledgeCard[] = [];

    // 最近笔记
    const sortedNotes = [...notes].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    sortedNotes.slice(0, 2).forEach((n) => {
      cards.push({
        id: `note-${n.id}`,
        type: 'note',
        title: n.title || '无标题笔记',
        time: formatRelativeTime(new Date(n.updatedAt)),
      });
    });

    // 最近闪卡复习
    const sortedReviews = [...flashcardReviews].sort((a, b) =>
      new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    );
    if (sortedReviews.length > 0) {
      const latestReview = sortedReviews[0];
      const card = allCards.find((c) => c.id === latestReview.cardId);
      cards.push({
        id: `fc-${latestReview.id}`,
        type: 'flashcard',
        title: card ? card.front.replace(/<[^>]*>/g, '').slice(0, 40) : '复习闪卡',
        time: formatRelativeTime(new Date(latestReview.reviewedAt)),
      });
    }

    // 最近番茄钟
    const sortedSessions = [...pomodoroSessions].sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    if (sortedSessions.length > 0) {
      const latest = sortedSessions[0];
      cards.push({
        id: `pomo-${latest.id}`,
        type: 'pomodoro',
        title: `${Math.round(latest.actualDuration / 60)} 分钟专注`,
        time: formatRelativeTime(new Date(latest.completedAt)),
      });
    }

    // 费曼笔记
    const sortedFeynman = [...feynmanNotes].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (sortedFeynman.length > 0) {
      cards.push({
        id: `feynman-${sortedFeynman[0].id}`,
        type: 'feynman',
        title: sortedFeynman[0].concept,
        time: formatRelativeTime(new Date(sortedFeynman[0].updatedAt)),
      });
    }

    return cards.slice(0, 5);
  }, [notes, flashcardReviews, allCards, pomodoroSessions, feynmanNotes]);

  return (
    <div className="relative min-h-full overflow-x-hidden">
      {/* ════ 英雄区域 ════ */}
      <section className="relative w-full overflow-hidden">

        {/* 英雄内容 */}
        <motion.div
          className="relative max-w-[1100px] mx-auto px-6 pt-rhythm-xl pb-rhythm-lg"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* 问候语 + 日期 */}
          <motion.div className="mb-rhythm-lg" {...fadeInUp}>
            <h1 className="text-d2 font-semibold text-text-primary tracking-tight mb-2">
              {greetingText}
            </h1>
            <p className="text-b2 text-text-tertiary">{getTodayLabel()}</p>
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

          {/* 核心数据统计 */}
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-rhythm-sm"
            variants={staggerContainer}
          >
            {heroStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  className={cn(
                    'relative p-5 rounded-kb-xl',
                    'border border-border/15 backdrop-blur-sm',
                    'bg-bg-elevated/30 hover:bg-bg-elevated/50',
                    'transition-all duration-beat-x3 group',
                  )}
                  variants={heroStatVariant}
                  whileHover={{ y: -2, scale: 1.02 }}
                  transition={SPRING.default}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={cn('w-icon-sm h-icon-sm', accentText[stat.accent])} strokeWidth={1.5} />
                    <span className="text-c1 text-text-tertiary font-medium">{stat.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      'text-d1 font-bold tabular-nums tracking-tight',
                      accentText[stat.accent],
                      !reducedMotion && 'kb-stat-breathe',
                    )}>
                      {isLoading ? '—' : stat.value}
                    </span>
                    <span className="text-b3 text-text-tertiary">{stat.unit}</span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* 快捷操作 */}
          <motion.div
            className="flex gap-3 mt-rhythm-md"
            variants={staggerContainer}
          >
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
                  variants={heroStatVariant}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING.default}
                >
                  <Icon className={cn('w-4 h-4', accentText[action.accent])} strokeWidth={1.5} />
                  {action.label}
                </motion.button>
              );
            })}
          </motion.div>
        </motion.div>
      </section>

      {/* ════ 学习脉搏区域 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 py-rhythm-lg kb-section-blend">
        <LearningPulse
          data={analytics?.trend ?? []}
          loading={analyticsLoading}
        />
      </section>

      {/* ════ 知识预览区域 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 pb-rhythm-xl">
        {/* 标题 */}
        <motion.div
          className="flex items-center gap-2 mb-rhythm-sm"
          {...fadeInUp}
        >
          <h2 className="text-b1 font-semibold text-text-primary">知识预览</h2>
          <span className="text-c1 text-text-tertiary">最近的学习足迹</span>
        </motion.div>

        {/* 卡片网格 - 有机流动布局 */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-rhythm-sm">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[140px] rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton"
                style={{ borderRadius: '24px 12px 20px 16px' }}
              />
            ))}
          </div>
        ) : knowledgeCards.length > 0 ? (
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-3 gap-rhythm-sm"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {knowledgeCards.map((card, i) => (
              <motion.div key={card.id} variants={heroStatVariant}>
                <KnowledgePreviewCard card={card} index={i} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-rhythm-xl">
            <p className="text-b2 text-text-tertiary">
              还没有学习记录，开始你的第一次学习吧
            </p>
          </div>
        )}
      </section>

      {/* ══ 学习启动仪式模态层 ══ */}
      {showRitual && (
        <StartupRitual
          onComplete={handleRitualComplete}
          onSkip={handleRitualSkip}
          lastSession={lastSession}
        />
      )}
    </div>
  );
}
