/**
 * 首潜状态机 Store（Zustand）
 *
 * @ai-context: 步骤完成检测 = 数据基线差值——首潜开始时记录四张表的
 * 计数基线，轮询发现某表计数超过基线即判定对应步骤完成。
 * 好处：只认"真实产生的数据"，与各模块 UI 零耦合。
 * @ai-context: 副作用——localStorage 持久化（firstDiveStorage）、
 * IndexedDB 计数（fetchStepCounts）、手册种子（seedHandbookDeck）。
 * 判定老用户（任一核心表非空）时跳过 L0/L1 且不种手册，不打扰存量用户。
 */
import { create } from 'zustand';
import { db } from '@/lib/storage';
import type { DiveStepId, FirstDiveStage, FirstDiveStateV2, OnboardingProfile } from './types';
import { DIVE_STEPS, orderStepsByProfile } from './diveSteps';
import { loadFirstDiveState, saveFirstDiveState } from './firstDiveStorage';
import { seedHandbookDeck } from './seedHandbook';

/** 各首潜步骤对应的数据表计数（基线差值检测的数据源） */
export type StepCounts = Record<DiveStepId, number>;

/** 读取四张表的当前计数（依赖注入 database 便于测试 Mock） */
export async function fetchStepCounts(database: typeof db = db): Promise<StepCounts> {
  const [pomodoro, note, review, feynman] = await Promise.all([
    database.pomodoroSessions.count(),
    database.notes.count(),
    database.flashcardReviews.count(),
    database.feynmanNotes.count(),
  ]);
  return { pomodoro, note, review, feynman };
}

interface FirstDiveStoreState {
  stage: FirstDiveStage;
  profile: OnboardingProfile | null;
  completedSteps: DiveStepId[];
  baselines: Partial<Record<DiveStepId, number>>;
  /** bootstrap 是否已执行（防止重复初始化） */
  isReady: boolean;
  /** 刚完成的步骤（供 UI 展示 praise 文案，展示后清空） */
  justCompleted: DiveStepId | null;

  /** 启动引导：迁移旧标记、判定老用户、种手册 */
  bootstrap: () => Promise<void>;
  /** 回答着陆之问（L0） */
  answerLanding: (profile: OnboardingProfile) => Promise<void>;
  /** 轮询检测步骤完成（L1） */
  checkProgress: () => Promise<void>;
  /** 跳过首潜 */
  skipDive: () => void;
  /** 清除 praise 展示标记 */
  clearJustCompleted: () => void;
}

/** 当前应执行的步骤（按画像排序后第一个未完成项） */
export function getCurrentStep(
  profile: OnboardingProfile | null,
  completedSteps: DiveStepId[],
): DiveStepId | null {
  const ordered = profile ? orderStepsByProfile(profile) : DIVE_STEPS;
  const next = ordered.find((s) => !completedSteps.includes(s.id));
  return next?.id ?? null;
}

const persist = (state: Pick<FirstDiveStateV2, 'stage' | 'profile' | 'completedSteps' | 'baselines'>) =>
  saveFirstDiveState({ version: 1, ...state });

export const useFirstDiveStore = create<FirstDiveStoreState>((set, get) => ({
  stage: 'done', // bootstrap 前默认不打扰，避免闪烁
  profile: null,
  completedSteps: [],
  baselines: {},
  isReady: false,
  justCompleted: null,

  bootstrap: async () => {
    if (get().isReady) return;
    const persisted = loadFirstDiveState();

    if (persisted.stage === 'landing') {
      // 老用户判定：任一核心表已有数据 → 视为已完成，不种手册、不弹引导
      try {
        const counts = await fetchStepCounts();
        const hasData = counts.pomodoro > 0 || counts.note > 0 || counts.feynman > 0
          || (await db.flashcardDecks.count()) > 0;
        if (hasData) {
          const done: FirstDiveStateV2 = { ...persisted, stage: 'done' };
          persist(done);
          set({ ...done, isReady: true });
          return;
        }
        // 全新用户：种入《潜航员手册》（幂等）
        await seedHandbookDeck();
      } catch {
        // 数据层异常时不阻塞应用启动，按已完成处理
        set({ stage: 'done', isReady: true });
        return;
      }
    }

    set({
      stage: persisted.stage,
      profile: persisted.profile,
      completedSteps: persisted.completedSteps,
      baselines: persisted.baselines,
      isReady: true,
    });
  },

  answerLanding: async (profile) => {
    if (profile === 'explore') {
      const next = { stage: 'skipped' as const, profile, completedSteps: [], baselines: {} };
      persist(next);
      set(next);
      return;
    }
    // 记录基线：首潜只认"此后新产生"的数据
    let baselines: Partial<Record<DiveStepId, number>> = {};
    try {
      baselines = await fetchStepCounts();
    } catch {
      // 计数失败时基线为空（0），首潜仍可进行
    }
    const next = { stage: 'diving' as const, profile, completedSteps: [] as DiveStepId[], baselines };
    persist(next);
    set(next);
  },

  checkProgress: async () => {
    const { stage, profile, completedSteps, baselines } = get();
    if (stage !== 'diving') return;

    let counts: StepCounts;
    try {
      counts = await fetchStepCounts();
    } catch {
      return; // 单次轮询失败静默，下次再试
    }

    const current = getCurrentStep(profile, completedSteps);
    if (!current) return;

    // 仅推进"当前步骤"：保证引导节奏线性，避免用户乱序操作导致跳步混乱
    if (counts[current] > (baselines[current] ?? 0)) {
      const nextCompleted = [...completedSteps, current];
      const allDone = nextCompleted.length >= DIVE_STEPS.length;
      const next = {
        stage: (allDone ? 'done' : 'diving') as FirstDiveStage,
        profile,
        completedSteps: nextCompleted,
        baselines,
      };
      persist(next);
      set({ ...next, justCompleted: current });
    }
  },

  skipDive: () => {
    const { profile, completedSteps, baselines } = get();
    const next = { stage: 'skipped' as const, profile, completedSteps, baselines };
    persist(next);
    set(next);
  },

  clearJustCompleted: () => set({ justCompleted: null }),
}));

/** 新手期判定：双标签副标题等新手辅助 UI 的显隐依据 */
export const useIsNewbiePhase = (): boolean =>
  useFirstDiveStore((s) => s.isReady && s.stage !== 'done');
