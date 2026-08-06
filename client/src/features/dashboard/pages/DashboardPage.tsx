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
import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Timer, FileText, Layers, Lightbulb, Sparkles, Hourglass,
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
// 留存机制组件：连续打卡气泡、珊瑚生态、深度计、学习画像
// 使用 lazy 动态导入避免增加首屏 bundle 体积
import { useEcosystemStore } from '@/features/retention/store/useEcosystemStore';
import { useRetentionSettings } from '@/features/retention/store/useRetentionSettings';
import SocialProofBanner from '@/features/retention/components/SocialProofBanner';
import PlannerPanel from '@/features/planner/components/PlannerPanel';
import {
  generateTimeInsights, generateConsistencyInsights,
  generateEfficiencyInsights, computeIdentityTags,
} from '@/features/retention/lib/profileEngine';
import type { StreakState } from '@/features/retention/types';
// React.lazy 动态导入留存组件（具名导出需 .then 包装为 default export）
const StreakBubble = lazy(() => import('@/features/retention/components/StreakBubble').then(m => ({ default: m.StreakBubble })));
const DepthMeter = lazy(() => import('@/features/retention/components/DepthMeter').then(m => ({ default: m.DepthMeter })));
const CoralEcosystem = lazy(() => import('@/features/retention/components/CoralEcosystem').then(m => ({ default: m.CoralEcosystem })));
const LearningProfile = lazy(() => import('@/features/retention/components/LearningProfile').then(m => ({ default: m.LearningProfile })));
// React.lazy 动态导入知识星座组件（阶段 B：双轨渲染；3D 轨仅 high 档加载）
const KnowledgeConstellation = lazy(() => import('@/features/constellation/components/KnowledgeConstellation').then(m => ({ default: m.KnowledgeConstellation })));
const KnowledgeSky = lazy(() => import('@/lib/3d/scenes/KnowledgeSky').then(m => ({ default: m.KnowledgeSky })));
import { useLearningAnalytics } from '../hooks/useLearningAnalytics';
import { useKnowledgeGraph } from '@/features/constellation/hooks/useKnowledgeGraph';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import DashboardNebula from '../components/DashboardNebula';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import StartupRitual from '../components/StartupRitual';
import { useLastSession } from '../hooks/useLastSession';
import { saveRitualRecord, createReviewCardIfNeeded, loadRitualRecords } from '../lib/ritualService';
import { fetchRecallQuestion } from '../lib/ritualRecallService';
import { buildQuickTags, findLastUnfinishedGoal, computeRitualStreak } from '../utils/ritualHelpers';
import { buildRitualPlan, pickAbGroup } from '../utils/ritualPlanner';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';

import LearningPulse from '../components/LearningPulse';
import KnowledgePreviewCard from '../components/KnowledgePreviewCard';
import GrowthStory from '../components/GrowthStory';
import CognitiveLoadWidget from '../components/CognitiveLoadWidget';
import JellyfishRadar from '../components/deep-sea/creatures/JellyfishRadar';
import CoralReefCalendar from '../components/deep-sea/creatures/CoralReefCalendar';
import { useLearningProgress } from '@/hooks/useLearningProgress';
import type { RitualSettings, RitualOutcome, RitualSkipScope, RitualIntensity, MemoryEchoItem, RecallQuestion } from '../types';
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

/** 稳定的 A/B 分流种子（设备级，持久化到 localStorage；RIT-03 埋点前提） */
function getAbSeed(): string {
  try {
    let s = localStorage.getItem('ed_ritual_ab_seed');
    if (!s) { s = crypto.randomUUID(); localStorage.setItem('ed_ritual_ab_seed', s); }
    return s;
  } catch {
    return 'default-seed';
  }
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
  const [ritualToast, setRitualToast] = useState<string | null>(null);
  const [lastUnfinishedGoal, setLastUnfinishedGoal] = useState<string | undefined>(undefined);
  const [ritualStreak, setRitualStreak] = useState(1);
  const [ritualSoundOn, setRitualSoundOn] = useState(false);
  const [ritualIntensity, setRitualIntensity] = useState<RitualIntensity>('standard');
  const [ritualAutoAdapt, setRitualAutoAdapt] = useState(true);
  const lastSession = useLastSession();

  /* ── 知识星座（阶段 B：宪法第六条的空间化外壳，只读聚合 + 纯函数派生） ── */
  const { graph: knowledgeGraph, loading: knowledgeLoading, error: knowledgeError } = useKnowledgeGraph();
  const effectiveTier = useEffectiveTier();

  // 设备降级级别推导（星云粒子/动画按级裁剪）
  const { shouldDisableHeavyAnimations, prefersReducedMotion } = useDeviceCapability();
  const nebulaDegradation = prefersReducedMotion ? 'L2' : shouldDisableHeavyAnimations ? 'L1' : 'L0';

  useEffect(() => {
    (async () => {
      try {
        const settings = await appSettingsStore.getAll();
        const ritualRow = settings.find((s) => s.key === 'startupRitual');
        const ritual: RitualSettings | undefined = ritualRow
          ? JSON.parse(ritualRow.value)
          : undefined;
        if (ritual?.soundOn) setRitualSoundOn(true);
        if (ritual?.intensity) setRitualIntensity(ritual.intensity);
        if (ritual?.autoAdapt === false) setRitualAutoAdapt(false);
        if (ritual?.enabled === false) return;
        if (ritual?.skipToday && ritual?.lastRitualDate === getTodayStr()) return;
        if (ritual?.lastRitualDate === getTodayStr()) return;
        setShowRitual(true);
      } catch {
        setShowRitual(true);
      }
    })();
  }, []);

  // 目标接力 + 火种：加载仪式历史（RIT-09/19）
  useEffect(() => {
    (async () => {
      const records = await loadRitualRecords();
      setLastUnfinishedGoal(findLastUnfinishedGoal(records));
      setRitualStreak(computeRitualStreak(records));
    })();
  }, []);

  /** appSettings 中 startupRitual 配置的幂等 upsert（保留 soundOn） */
  const persistRitualSettings = useCallback(async (patch: Partial<RitualSettings>) => {
    try {
      const settings = await appSettingsStore.getAll();
      const ritualRow = settings.find((s) => s.key === 'startupRitual');
      const prev: RitualSettings = ritualRow
        ? JSON.parse(ritualRow.value)
        : { enabled: true, lastRitualDate: '', skipToday: false };
      const value: RitualSettings = { ...prev, ...patch };
      if (ritualRow) {
        await appSettingsStore.update(ritualRow.id, { value: JSON.stringify(value), updatedAt: new Date() });
      } else {
        await appSettingsStore.create({
          id: `startupRitual-${Date.now()}`,
          key: 'startupRitual',
          value: JSON.stringify(value),
          updatedAt: new Date(),
        });
      }
    } catch { /* 静默 */ }
  }, []);

  const handleRitualSoundToggle = useCallback((on: boolean) => {
    setRitualSoundOn(on);
    void persistRitualSettings({ soundOn: on });
  }, [persistRitualSettings]);

  const handleRitualComplete = useCallback(async (outcome: RitualOutcome) => {
    setShowRitual(false);
    await persistRitualSettings({ enabled: true, lastRitualDate: getTodayStr(), skipToday: false });
    // 数据闭环：记录落库 + 掌握标记生成复习卡（RIT-05/06/09）
    await saveRitualRecord(outcome, lastSession);
    // 目标下压番茄钟：微目标带入深潜计时页顶部展示（RIT-10/B1.3）
    if (outcome.goal?.text) {
      usePomodoroStore.getState().setCurrentGoal(outcome.goal.text);
    }
    const scheduled = await createReviewCardIfNeeded(outcome.masteryMark, lastSession);
    if (scheduled) {
      setRitualToast('已为你安排 1 张复习卡，今天记得回顾 ✦');
      setTimeout(() => setRitualToast(null), 4000);
    }
  }, [persistRitualSettings, lastSession]);

  const handleRitualSkip = useCallback(async (scope: RitualSkipScope) => {
    setShowRitual(false);
    if (scope === 'today') {
      await persistRitualSettings({ enabled: true, lastRitualDate: getTodayStr(), skipToday: true });
    } else if (scope === 'forever') {
      await persistRitualSettings({ enabled: false, lastRitualDate: getTodayStr(), skipToday: false });
    }
    // 'once'：仅本次关闭，不持久化
  }, [persistRitualSettings]);

  /* ── 数据源 ── */
  const userName = user?.user_metadata?.display_name || user?.email?.split('@')[0];
  const greetingText = useMemo(() => {
    const quote = getAtmosphereQuote();
    return userName ? `${quote} — ${userName}` : quote;
  }, [userName]);

  const { streakDays } = useCheckIn('dashboard');

  // ── 留存机制数据准备 ──
  // 珊瑚生态数据（供 StreakBubble / DepthMeter / CoralEcosystem 消费）
  const retentionEnabled = useRetentionSettings((s) => s.enabled);
  const coralData = useEcosystemStore();

  // 基于珊瑚种植日期构建 StreakState（StreakBubble 组件所需）
  // 复用已有的珊瑚数据避免额外存储开销
  const streakState: StreakState | null = useMemo(() => {
    if (!retentionEnabled || coralData.corals.length === 0) return null;
    const uniqueDays = new Set(
      coralData.corals.map((c) => new Date(c.plantedAt).toISOString().split('T')[0]),
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
      currentStreak, // 从最近日期向前推算的连续打卡天数
      longestStreak: sorted.length,
      lastActiveDate: sorted[0] || new Date().toISOString().split('T')[0],
      restDayPreference: 0,
      retainedPercent: 50,
    };
  }, [retentionEnabled, coralData.corals]);

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

  /* ── 仪式快选标签：目标接力 + 最近笔记标题（RIT-09） ── */
  const ritualQuickTags = useMemo(
    () => buildQuickTags(notes.map((n) => n.title), lastUnfinishedGoal),
    [notes, lastUnfinishedGoal],
  );

  /* ── 自适应编排计划（RIT-02+04/B1.1）+ A/B 分流（RIT-03/B1.6） ── */
  const ritualPlan = useMemo(
    () => buildRitualPlan({
      hasLastSession: !!lastSession,
      streakDays: ritualStreak,
      hour: new Date().getHours(),
      intensity: ritualIntensity,
      autoAdapt: ritualAutoAdapt,
      abGroup: pickAbGroup(getAbSeed()),
    }),
    [lastSession, ritualStreak, ritualIntensity, ritualAutoAdapt],
  );

  /* ── 记忆回响时间线：最近 3 条笔记足迹（RIT-04/B1.4，锚点未实现时的回退源） ── */
  const ritualEchoes = useMemo<MemoryEchoItem[]>(
    () => notes.slice(0, 3).map((n) => ({
      title: n.title || '无标题笔记',
      dateLabel: formatRelativeTime(new Date(n.updatedAt)),
    })),
    [notes],
  );

  /* ── AI 回顾小问（RIT-08/B1.2）：仪式显示时异步拉取，失败/超时/离线回退遮罩摘要 ── */
  const [recallQuestion, setRecallQuestion] = useState<RecallQuestion | null>(null);
  useEffect(() => {
    if (!showRitual || !lastSession) return;
    let cancelled = false;
    (async () => {
      const q = await fetchRecallQuestion(lastSession.noteId, lastSession.noteTitle, lastSession.noteExcerpt);
      if (!cancelled) setRecallQuestion(q);
    })();
    return () => { cancelled = true; };
  }, [showRitual, lastSession]);

  const heroStats = [
    { label: '今日专注', value: todayPomodoroCount, unit: '次', accent: 'pomodoro', icon: Timer, path: '/pomodoro' },
    { label: '笔记总数', value: noteTotal, unit: '篇', accent: 'note', icon: FileText, path: '/notes' },
    { label: '待复习', value: dueFlashcardCount, unit: '张', accent: 'flashcard', icon: Layers, path: '/flashcards' },
    { label: '费曼进行中', value: feynmanInProgressCount, unit: '个', accent: 'feynman', icon: Lightbulb, path: '/feynman' },
  ];

  /* ── 学习分析 ── */
  const { data: analytics, loading: analyticsLoading } = useLearningAnalytics(14);

  // ── 留存：基于已有分析数据生成学习画像（离线规则引擎，无需网络）
  // 放在 analytics / feynmanNotes / flashcardReviews 声明之后，确保变量已就绪
  const profileData = useMemo(() => {
    if (!analytics) return { insights: [], identityTags: [] };
    const insights = [
      ...generateTimeInsights(analytics.heatmap),
      ...generateConsistencyInsights(analytics.trend),
      ...generateEfficiencyInsights(analytics.radar),
    ];
    // 从已有统计推算身份标签解锁状态
    const totalMinutes = analytics.trend.reduce((s, t) => s + t.value, 0);
    const identityTags = computeIdentityTags({
      totalFocusMinutes: totalMinutes,
      feynmanCompleted: feynmanNotes.filter((n) => n.status === 'completed').length,
      totalReviews: flashcardReviews.length,
      longestStreak: streakDays,
      coralCount: coralData.corals.length,
      totalDepth: coralData.totalDepth,
    });
    return { insights, identityTags };
  }, [analytics, feynmanNotes, flashcardReviews, streakDays, coralData]);

  // 🧩 五维能力雷达图（analytics.radar 由聚合 Worker 按 days 窗口产出，直接消费）
  const radarData = analytics?.radar ?? [];

  // 📈 学习进度条（各模块学习完成百分比）
  const progressItems = useLearningProgress();

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
        targetPath: `/notes/${n.id}`,
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
        targetPath: '/flashcards',
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
        targetPath: '/pomodoro',
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
        targetPath: `/feynman/${sortedFeynman[0].id}`,
      });
    }

    return cards.slice(0, 5);
  }, [notes, flashcardReviews, allCards, pomodoroSessions, feynmanNotes]);

  return (
    <div className="relative min-h-full overflow-x-hidden">
      {/* 星云氛围背景：靛蓝/赛博青/琥珀星云 + 闪烁星点 */}
      <DashboardNebula degradation={nebulaDegradation} />

      {/* ════ 英雄区域 ════ */}
      <section className="relative w-full overflow-hidden">

        {/* 英雄内容 */}
        <motion.div
          className="relative max-w-[1100px] mx-auto px-6 pt-rhythm-xl pb-rhythm-lg"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* 问候语 + 日期 + 仪式印章 */}
          <motion.div className="mb-rhythm-lg" {...fadeInUp}>
            <div className="flex items-start gap-3">
              <ModuleRitualHeader sealChar="星" sealColor="#6366F1" compact />
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
                  role="link"
                  tabIndex={0}
                  aria-label={`进入${stat.label}模块`}
                  onClick={() => navigate(stat.path)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(stat.path); } }}
                  className={cn(
                    'relative p-5 rounded-kb-xl cursor-pointer',
                    'border border-border/15 backdrop-blur-sm',
                    'bg-bg-elevated/30 hover:bg-bg-elevated/50',
                    'transition-all duration-beat-x3 group',
                    'focus-visible:outline-2 focus-visible:outline-brand-500',
                  )}
                  variants={heroStatVariant}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
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

          {/* 社交证据横幅：匿名聚合统计（设置关闭/离线时静默隐藏） */}
          <SocialProofBanner />

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

          {/* 今日航线：个性化学习计划（AI 优先，本地规则兜底） */}
          <motion.div className="mt-rhythm-md" {...fadeInUp}>
            <PlannerPanel />
          </motion.div>
        </motion.div>
      </section>

      {/* ════ 留存机制：深海养成可视化区域 ════ */}
      {/* 放置在英雄区下方、学习脉搏上方：视觉优先级中等，不抢首屏注意力
          仅当留存总开关开启且有数据时才渲染（组件内部各自守卫） */}
      {retentionEnabled && (
        <section className="relative max-w-[1100px] mx-auto px-6 py-rhythm-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-rhythm-sm">
            {/* 左列：累计深度计（身份认同——"我已经是怎样的人"） */}
            <Suspense fallback={<div className="h-24 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
              <DepthMeter />
            </Suspense>

            {/* 中列：珊瑚生态缸缩略入口（点击展开全屏，损失规避机制） */}
            <Suspense fallback={<div className="h-24 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
              <CoralEcosystem />
            </Suspense>

            {/* 右列：学习画像洞察 + 身份标签（离线规则引擎驱动） */}
            <Suspense fallback={<div className="h-24 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
              <LearningProfile
                insights={profileData.insights}
                identityTags={profileData.identityTags}
              />
            </Suspense>
          </div>

          {/* 连续打卡气泡：绝对定位于区域右上角，不占据文档流空间
              无排名、无比较（4.5 节约束），洋流休息日显示为水波纹 */}
          <div className="absolute top-0 right-6 z-10">
            <Suspense fallback={null}>
              <StreakBubble streakState={streakState} />
            </Suspense>
          </div>
        </section>
      )}

      {/* ════ 知识星座区域（阶段 B）════ */}
      {/* 宪法第六条：星座是珊瑚引擎的空间化外壳，不新增引擎。双轨按
          useEffectiveTier 切换：high → 3D 轨（独立 Canvas，dpr≤1.5），
          否则 DOM/SVG 轨（L1 每档 ≤15 节点）。冷启动引导由
          KnowledgeConstellation 承担（high 档空态同样回落该分支）。 */}
      <section className="relative max-w-[1100px] mx-auto px-6 py-rhythm-sm">
        <ModuleRitualHeader
          title="知识星座"
          note="概念掌握度的空间化"
          sealChar="星"
          sealColor="#6366F1"
          compact
          className="mb-rhythm-sm"
        />
        <Suspense fallback={<div className="h-56 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
          {effectiveTier === 'high' && knowledgeGraph && !knowledgeGraph.coldStart && knowledgeGraph.nodes.length > 0 ? (
            <KnowledgeSky graph={knowledgeGraph} />
          ) : (
            <KnowledgeConstellation graph={knowledgeGraph} loading={knowledgeLoading} error={knowledgeError} />
          )}
        </Suspense>
      </section>

      {/* ════ 成长叙事 + 认知负荷（1.11 D1 / 1.13 A5）════ */}
      {/* 自我效能感叙事：只陈述本周事实 + 正向收尾；认知负荷实时仪表盘
          （数据来自 useBehaviorSignals 经 cognitiveLoadStore 发布） */}
      <section className="relative max-w-[1100px] mx-auto px-6 py-rhythm-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-rhythm-sm">
          <div className="md:col-span-2">
            <GrowthStory aggregate={analytics} loading={analyticsLoading} />
          </div>
          <CognitiveLoadWidget />
        </div>
        {/* 🧩 五维能力雷达图：下方全宽，学习能力可视化 */}
        {radarData.length > 0 && (
          <div className="mt-rhythm-sm">
            <JellyfishRadar data={radarData} loading={analyticsLoading} />
          </div>
        )}
      </section>

      {/* ════ 3.16 知识时光胶囊入口 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 py-rhythm-sm">
        <div className="flex items-center justify-between gap-4 rounded-kb-xl border border-border-subtle bg-bg-elevated/60 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-kb-full bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Hourglass className="w-5 h-5" strokeWidth={1.4} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">知识时光胶囊</div>
              <div className="text-xs text-text-tertiary truncate">把现在的学习状态封存，30/60/90 天后开启回看成长</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/timecapsule')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-kb-lg text-xs font-medium text-brand-600 border border-brand-300/50 bg-brand-500/5 hover:bg-brand-500/10 transition-colors"
          >
            <Hourglass className="w-4 h-4" strokeWidth={1.5} />
            封装时光胶囊
          </button>
        </div>
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
          className="mb-rhythm-sm"
          {...fadeInUp}
        >
          <ModuleRitualHeader
            title="知识预览"
            note="最近的学习足迹"
            sealChar="星"
            sealColor="#6366F1"
            compact
          />
        </motion.div>

        {/* 卡片网格 - 有机流动布局 */}
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
          quickTags={ritualQuickTags}
          streakDays={ritualStreak}
          soundOn={ritualSoundOn}
          onSoundToggle={handleRitualSoundToggle}
          plan={ritualPlan}
          recentEchoes={ritualEchoes}
          recallQuestion={recallQuestion}
        />
      )}

      {/* ══ 仪式反馈 toast（复习卡已安排） ══ */}
      {ritualToast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-kb-full bg-bg-elevated/95 border border-border/60 shadow-kb-md text-sm text-text-primary animate-fade-in-up"
        >
          {ritualToast}
        </div>
      )}
    </div>
  );
}
