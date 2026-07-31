/**
 * 首潜步骤定义 · 纯数据
 *
 * @ai-context: 步骤完成检测采用"数据基线差值"机制——首潜开始时记录
 * 各表计数基线，某表计数超过基线即判定该步完成（见 useFirstDiveStore）。
 * 文案遵循品牌人格：微光水母语气，不催促、不评判。
 */
import type { DiveStepDef, DiveStepId, OnboardingProfile } from './types';

/** 首潜步骤（完整学习循环：专注 → 记录 → 复习 → 复述） */
export const DIVE_STEPS: DiveStepDef[] = [
  {
    id: 'pomodoro',
    route: '/pomodoro',
    title: '完成一次迷你深潜',
    instruction: '先试一次 3 分钟的迷你深潜吧——不用准备什么，感受一下专注沉下去的样子。',
    praise: '你完成了第一次下潜。水面之下，比想象中安静。',
  },
  {
    id: 'note',
    route: '/notes',
    title: '记下一条笔记',
    instruction: '随手记点什么——刚才想到的、今天学到的，一句话就够，它会沉淀成你的第一块暗礁。',
    praise: '第一块暗礁已经形成。碎片落进海里，就不会再丢了。',
  },
  {
    id: 'review',
    route: '/flashcards',
    title: '呼吸一次（复习手册卡）',
    instruction: '打开《潜航员手册》复习几张卡——它会教你怎么用这片海，而且过几天还会自己回来找你。',
    praise: '第一次呼吸完成。这些卡片会在你快忘记时，准时浮现。',
  },
  {
    id: 'feynman',
    route: '/feynman',
    title: '浮出水面说一句',
    instruction: '最后一步：用一句话讲讲你刚才学到的东西。讲得出来，才是真的懂。',
    praise: '你浮出了水面。首潜完成——这片海，现在是你的了。',
  },
];

/** 按步骤 id 查找定义 */
export const getDiveStep = (id: DiveStepId): DiveStepDef =>
  DIVE_STEPS.find((s) => s.id === id) ?? DIVE_STEPS[0];

/**
 * 根据画像决定首潜起始步骤（着陆之问的分流规则）：
 * 走神 → 深潜起步；背了就忘 → 直接从复习手册开始；讲不出来 → 费曼起步。
 * 起始步骤之前的步骤不会被跳过，只是排到循环末尾。
 */
export const orderStepsByProfile = (profile: OnboardingProfile): DiveStepDef[] => {
  const startId: DiveStepId =
    profile === 'memory' ? 'review'
    : profile === 'expression' ? 'feynman'
    : 'pomodoro';
  const startIndex = DIVE_STEPS.findIndex((s) => s.id === startId);
  return [...DIVE_STEPS.slice(startIndex), ...DIVE_STEPS.slice(0, startIndex)];
};

/** 着陆之问选项文案（L0） */
export const LANDING_OPTIONS: Array<{
  profile: OnboardingProfile;
  label: string;
  hint: string;
}> = [
  { profile: 'focus', label: '一学习就走神', hint: '从一次 3 分钟的迷你深潜开始' },
  { profile: 'memory', label: '背了就忘', hint: '从一副会自己回来的卡组开始' },
  { profile: 'expression', label: '学了却讲不出来', hint: '从把一件事讲清楚开始' },
  { profile: 'explore', label: '我只想先随便看看', hint: '直接进入，自由探索' },
];
