/**
 * useDashboardData — Dashboard 核心数据聚合（从 DashboardPage 提取）
 *
 * 职责：知识星座/设备降级、用户问候、打卡与留存、学习数据加载与统计、
 * 分析聚合（画像/雷达/进度/月历/目标）、活动流、知识预览。
 * 数据流与原 DashboardPage 严格等价（拆分防回归的基准）。
 *
 * @ai-context: dashboard 数据聚合 hook——三视图组件的单一数据源。
 */
import { useMemo, useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { Timer, FileText, Layers, Lightbulb } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCheckIn } from '@/lib/checkin/useCheckIn';
import { useEcosystemStore } from '@/features/retention/store/useEcosystemStore';
import { useRetentionSettings } from '@/features/retention/store/useRetentionSettings';
import {
  generateTimeInsights, generateConsistencyInsights,
  generateEfficiencyInsights, computeIdentityTags,
} from '@/features/retention/lib/profileEngine';
import type { StreakState } from '@/features/retention/types';
import { pomodoroSessionStore, flashcardStore, flashcardReviewStore } from '@/lib/storage';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useNoteStore } from '@/features/notes/store/useNoteStore';
import { useFeynmanStore } from '@/features/feynman/store/useFeynmanStore';
import { useLearningAnalytics } from '../hooks/useLearningAnalytics';
import { useKnowledgeGraph } from '@/features/constellation/hooks/useKnowledgeGraph';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { useLearningProgress } from '@/hooks/useLearningProgress';
import { getDailyConfig } from '@/features/retention/lib/dailyVariation';
import { METAPHOR_MAP } from '@/lib/metaphors/metaphorDictionary';
import { formatRelativeTime, getAtmosphereQuote } from '../utils/dashboardUtils';
import type { GoalProgress } from '../types/analytics';
import type { NebulaDegradation } from '../components/DashboardNebula';
import type { PomodoroSession, Flashcard, FlashcardReview } from '@/types/models';
import type { KnowledgeCard } from '../components/KnowledgePreviewCard';
import type { ActivityItem } from '../components/deep-sea/creatures/PlanktonStream';

/** lucide 图标 → ActivityItem.icon（strokeWidth 类型收窄） */
function toActivityIcon(icon: ComponentType<{ className?: string; strokeWidth?: string | number }>): ActivityItem['icon'] {
  return icon as unknown as ActivityItem['icon'];
}

/** 视图组件消费的类型：useDashboardData 返回值 */
export type DashboardData = ReturnType<typeof useDashboardData>;

export function useDashboardData() {
  const { user } = useAuth();

  /* ── 知识星座（阶段 B：宪法第六条的空间化外壳，只读聚合 + 纯函数派生） ── */
  const { graph: knowledgeGraph, loading: knowledgeLoading, error: knowledgeError } = useKnowledgeGraph();
  const effectiveTier = useEffectiveTier();

  // 设备降级级别推导（星云粒子/动画按级裁剪）
  const { shouldDisableHeavyAnimations, prefersReducedMotion } = useDeviceCapability();
  const nebulaDegradation: NebulaDegradation = prefersReducedMotion ? 'L2' : shouldDisableHeavyAnimations ? 'L1' : 'L0';

  /* ── 数据源 ── */
  const userName = user?.user_metadata?.display_name || user?.email?.split('@')[0];
  const greetingText = useMemo(() => {
    const quote = getAtmosphereQuote();
    // 每日确定性鼓励文案（对抗感觉适应，与时段氛围互补）
    const encouragement = getDailyConfig().encouragement;
    return userName ? `${quote} · ${encouragement} · ${userName}` : `${quote} · ${encouragement}`;
  }, [userName]);

  const { streakDays, todayCheckIn, loading: checkInLoading } = useCheckIn('dashboard');

  // ── 留存机制数据准备 ──
  const retentionEnabled = useRetentionSettings((s) => s.enabled);
  const corals = useEcosystemStore((s) => s.corals);
  const totalDepth = useEcosystemStore((s) => s.totalDepth);

  // 基于珊瑚种植日期构建 StreakState（StreakBubble 组件所需）
  const streakState: StreakState | null = useMemo(() => {
    if (!retentionEnabled || corals.length === 0) return null;
    const uniqueDays = new Set(
      corals.map((c) => new Date(c.plantedAt).toISOString().split('T')[0]),
    );
    const sorted = [...uniqueDays].sort().reverse();
    // 连续天数 = 从最近日期向前逐日检查，遇到间隔即停止
    let currentStreak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
    return {
      id: 'streak-main',
      currentStreak,
      longestStreak: sorted.length,
      lastActiveDate: sorted[0] || new Date().toISOString().split('T')[0],
      restDayPreference: 0,
      retainedPercent: 50,
    };
  }, [retentionEnabled, corals]);

  const notes = useNoteStore((s) => s.notes);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const feynmanNotes = useFeynmanStore((s) => s.notes);
  const loadFeynmanNotes = useFeynmanStore((s) => s.loadNotes);
  const loadDecks = useFlashcardStore((s) => s.loadDecks);

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

  /* ── 学习分析 ── */
  const { data: analytics, loading: analyticsLoading } = useLearningAnalytics(14);

  // ── 留存：基于已有分析数据生成学习画像（离线规则引擎，无需网络）
  const profileData = useMemo(() => {
    if (!analytics) return { insights: [], identityTags: [] };
    const insights = [
      ...generateTimeInsights(analytics.heatmap),
      ...generateConsistencyInsights(analytics.trend),
      ...generateEfficiencyInsights(analytics.radar),
    ];
    const totalMinutes = analytics.trend.reduce((s, t) => s + t.value, 0);
    const identityTags = computeIdentityTags({
      totalFocusMinutes: totalMinutes,
      feynmanCompleted: feynmanNotes.filter((n) => n.status === 'completed').length,
      totalReviews: flashcardReviews.length,
      longestStreak: streakDays,
      coralCount: corals.length,
      totalDepth: totalDepth,
    });
    return { insights, identityTags };
  }, [analytics, feynmanNotes, flashcardReviews, streakDays, corals, totalDepth]);

  // 🧩 五维能力雷达图
  const radarData = analytics?.radar ?? [];

  // 📈 学习进度条（各模块学习完成百分比）
  const progressItems = useLearningProgress();

  // 📅 珊瑚礁月历数据：最近 31 天是否有学习活动
  const calendarDays = useMemo(() => {
    const now = new Date();
    const byDate = new Map((analytics?.trend ?? []).map((t) => [t.date, t.value]));
    return Array.from({ length: 31 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (30 - i));
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        day: d.getDate(),
        checked: (byDate.get(iso) ?? 0) > 0,
        isToday: i === 30,
      };
    });
  }, [analytics]);

  // 🎯 目标进度（PearlGoal）：直接消费聚合层 goals
  const goalData: GoalProgress[] = analytics?.goals ?? [];

  // 🌊 最近活动（PlanktonStream）：各模块最近记录（async 查询，静默失败）
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acts: ActivityItem[] = [];
        const ps = await pomodoroSessionStore.getTable().orderBy('completedAt').last();
        if (ps) {
          acts.push({
            icon: toActivityIcon(Timer), text: '完成一次深潜', time: formatRelativeTime(new Date(ps.completedAt)),
            accent: 'pomodoro', timestamp: new Date(ps.completedAt).getTime(),
          });
        }
        const rv = await flashcardReviewStore.getTable().orderBy('reviewedAt').last();
        if (rv) {
          acts.push({
            icon: toActivityIcon(Layers), text: '复习了闪卡', time: formatRelativeTime(new Date(rv.reviewedAt)),
            accent: 'flashcard', timestamp: new Date(rv.reviewedAt).getTime(),
          });
        }
        const sortedNotes = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        if (sortedNotes.length > 0) {
          const n = sortedNotes[0];
          acts.push({
            icon: toActivityIcon(FileText), text: `编辑了「${n.title}」`, time: formatRelativeTime(new Date(n.updatedAt)),
            accent: 'note', timestamp: new Date(n.updatedAt).getTime(),
          });
        }
        if (feynmanNotes.length > 0) {
          const f = [...feynmanNotes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
          acts.push({
            icon: toActivityIcon(Lightbulb), text: `讲解了「${f.concept}」`, time: formatRelativeTime(new Date(f.updatedAt)),
            accent: 'feynman', timestamp: new Date(f.updatedAt).getTime(),
          });
        }
        if (!cancelled) setRecentActivities(acts.slice(0, 4));
      } catch {
        // 静默失败（活动流是可选增强）
      }
    })();
    return () => { cancelled = true; };
  }, [notes, feynmanNotes]);

  // 🪼 知识预览空状态文案（隐喻词典，确定性轮换）
  const emptyQuote = useMemo(() => {
    const pool = METAPHOR_MAP.emptyStates.pomodoro;
    return pool[new Date().getDate() % pool.length];
  }, []);

  /* ── 知识预览卡片数据 ── */
  const knowledgeCards = useMemo<KnowledgeCard[]>(() => {
    const cards: KnowledgeCard[] = [];
    const sortedNotes = [...notes].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    sortedNotes.slice(0, 2).forEach((n) => {
      cards.push({
        id: `note-${n.id}`,
        type: 'note',
        title: n.title || '无标题笔记',
        time: formatRelativeTime(new Date(n.updatedAt)),
        targetPath: `/notes/${n.id}`,
      });
    });

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
        targetPath: '/flashcards',
      });
    }

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
        targetPath: '/pomodoro',
      });
    }

    const sortedFeynman = [...feynmanNotes].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (sortedFeynman.length > 0) {
      cards.push({
        id: `feynman-${sortedFeynman[0].id}`,
        type: 'feynman',
        title: sortedFeynman[0].concept,
        time: formatRelativeTime(new Date(sortedFeynman[0].updatedAt)),
        targetPath: `/feynman/${sortedFeynman[0].id}`,
      });
    }

    return cards.slice(0, 5);
  }, [notes, flashcardReviews, allCards, pomodoroSessions, feynmanNotes]);

  return {
    // 星座与降级
    knowledgeGraph, knowledgeLoading, knowledgeError, effectiveTier, nebulaDegradation,
    // 用户与问候
    userName, greetingText,
    // 打卡与留存
    streakDays, todayCheckIn, checkInLoading, retentionEnabled, streakState,
    // 学习数据与统计
    notes, feynmanNotes, isLoading, pomodoroSessions, allCards, flashcardReviews,
    todayPomodoroCount, noteTotal, dueFlashcardCount, feynmanInProgressCount,
    // 分析聚合
    analytics, analyticsLoading, profileData, radarData, progressItems, calendarDays, goalData,
    // 活动流与知识预览
    recentActivities, emptyQuote, knowledgeCards,
  };
}
