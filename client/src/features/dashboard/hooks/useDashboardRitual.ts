/**
 * useDashboardRitual — 学习启动仪式数据流（从 DashboardPage 提取）
 *
 * 职责：仪式状态（显示/音效/强度/自适应）、仪式历史（目标接力+火种）、
 * 仪式派生（快选标签/编排计划/记忆回响/AI 回顾小问）与全部回调。
 * 数据流与原 DashboardPage 严格等价（拆分防回归的基准）。
 *
 * @ai-context: 学习启动仪式数据 hook——仪式状态与回调的单一来源。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { appSettingsStore } from '@/lib/storage';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import { useLastSession } from '../hooks/useLastSession';
import { saveRitualRecord, createReviewCardIfNeeded, loadRitualRecords } from '../lib/ritualService';
import { fetchRecallQuestion } from '../lib/ritualRecallService';
import { buildQuickTags, findLastUnfinishedGoal, computeRitualStreak } from '../utils/ritualHelpers';
import { buildRitualPlan, pickAbGroup } from '../utils/ritualPlanner';
import { formatRelativeTime } from '../utils/dashboardUtils';
import type { RitualSettings, RitualOutcome, RitualSkipScope, RitualIntensity, MemoryEchoItem, RecallQuestion } from '../types';

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

interface RitualFlowInput {
  /** 笔记列表（快选标签与记忆回响的数据源） */
  notes: Array<{ title: string; updatedAt: string | Date }>;
}

export function useDashboardRitual({ notes }: RitualFlowInput) {
  const [showRitual, setShowRitual] = useState(false);
  const [ritualToast, setRitualToast] = useState<string | null>(null);
  const [lastUnfinishedGoal, setLastUnfinishedGoal] = useState<string | undefined>(undefined);
  const [ritualStreak, setRitualStreak] = useState(1);
  const [ritualSoundOn, setRitualSoundOn] = useState(false);
  const [ritualIntensity, setRitualIntensity] = useState<RitualIntensity>('standard');
  const [ritualAutoAdapt, setRitualAutoAdapt] = useState(true);
  const lastSession = useLastSession();

  // 加载仪式配置（soundOn/intensity/autoAdapt/enabled/skipToday）
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

  return {
    showRitual,
    ritualToast,
    lastSession,
    ritualQuickTags,
    ritualPlan,
    ritualEchoes,
    recallQuestion,
    ritualStreak,
    ritualSoundOn,
    ritualIntensity,
    ritualAutoAdapt,
    handleRitualComplete,
    handleRitualSkip,
    handleRitualSoundToggle,
  };
}
