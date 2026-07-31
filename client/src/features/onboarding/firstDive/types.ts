/**
 * 「首潜」新手引导系统 · 领域类型
 *
 * @ai-context: kb-onboarding-v2 是统一的新手引导状态（替代散落的
 * kb-onboarding-done / kb-3d-guide-done 双 key），结构变更需保持向后兼容
 * （新增字段给默认值，禁止改名/删除已有字段）。
 * @ai-context: 画像（profile）仅存本地 localStorage，不上云（隐私决策，
 * 见 docs/Foresight/first-dive-onboarding-brainstorm.md §6）。
 */

/** 首潜整体阶段 */
export type FirstDiveStage =
  | 'landing'   // 待回答着陆之问（L0）
  | 'diving'    // 首潜进行中（L1）
  | 'done'      // 已完成
  | 'skipped';  // 已跳过

/** 着陆之问的用户画像（学习困扰类型） */
export type OnboardingProfile =
  | 'focus'       // 一学习就走神 → 从深潜开始
  | 'memory'      // 背了就忘 → 从闪卡开始
  | 'expression'  // 学了讲不出来 → 从费曼开始
  | 'explore';    // 随便看看 → 跳过首潜

/** 首潜步骤标识（顺序由 DIVE_STEPS 决定） */
export type DiveStepId = 'pomodoro' | 'note' | 'review' | 'feynman';

/** 持久化到 localStorage 的首潜状态（key: kb-onboarding-v2） */
export interface FirstDiveStateV2 {
  /** 状态结构版本，用于将来迁移 */
  version: 1;
  stage: FirstDiveStage;
  profile: OnboardingProfile | null;
  /** 已完成的首潜步骤 */
  completedSteps: DiveStepId[];
  /** 首潜开始时各数据表的基线计数（用于检测"新产生的第一条数据"） */
  baselines: Partial<Record<DiveStepId, number>>;
}

/** 单个首潜步骤的静态定义 */
export interface DiveStepDef {
  id: DiveStepId;
  /** 需要引导用户前往的路由 */
  route: string;
  /** 步骤短标题（潜航日志用） */
  title: string;
  /** 微光的引导语（品牌人格：不催促、不评判） */
  instruction: string;
  /** 完成时微光的回应 */
  praise: string;
}
