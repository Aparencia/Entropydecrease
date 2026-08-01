/**
 * 每日微变化生成器
 * Daily micro-variation generator
 *
 * @ai-context: 对抗感觉适应（hedonic adaptation）：基于日期 seed 的确定性
 * 随机，每天提供微妙的新鲜感。纯前端，无网络依赖。
 * @ai-context: Combats hedonic adaptation: deterministic randomness seeded
 * by date provides subtle daily freshness. Pure frontend, no network.
 */

// ─── 日期种子 / Date seed ──────────────────────────────────────────

/** 获取今日种子（YYYYMMDD 整数） / Get today's seed (YYYYMMDD integer) */
export function getDailySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** 确定性伪随机（mulberry32） / Deterministic PRNG (mulberry32) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── 每日配置 / Daily configuration ────────────────────────────────

export interface DailyConfig {
  /** 色相偏移（-5 ~ +5 度） / Hue shift (-5 to +5 degrees) */
  hueShift: number;
  /** 今日鼓励文案 / Today's encouragement quote */
  encouragement: string;
  /** 今日推荐学习角度 / Today's recommended study angle */
  studyAngle: string;
  /** 深潜完成文案（7 天不重复） / Dive completion quote (7-day rotation) */
  completionQuote: string;
  /** 今日氛围关键词 / Today's ambiance keyword */
  ambianceKeyword: string;
}

// ─── 文案池 / Quote pools ──────────────────────────────────────────

const ENCOURAGEMENTS = [
  '今天的你，比昨天更深了一点',
  '每一次专注，都是给未来自己的礼物',
  '深海不问赶路人，时光不负有心人',
  '你正在做一件很酷的事——坚持',
  '安静地努力，终会发出自己的光',
  '今天的深度，是明天的起点',
  '专注本身，就是一种天赋',
  '你不需要完美，只需要持续',
  '每一段心流，都是大脑在重塑自己',
  '深潜的意义，在于你选择了沉下来',
  '知识在重复中生长，你在坚持中蜕变',
  '今天也辛苦了，深海为你留了一盏灯',
  '慢一点没关系，方向对了就好',
  '你的珊瑚又长了一节',
];

const STUDY_ANGLES = [
  '今天试试从反例角度切入？',
  '换个方式：先画一张思维导图再开始',
  '试试把今天的概念讲给一个"小孩"听',
  '今天可以从一个真实案例入手',
  '试着找出这个概念和你已知知识的联系',
  '今天用"如果…那么…"的格式来理解',
  '试试从历史角度：这个概念是怎么被发现的？',
  '今天关注"为什么"比"是什么"更重要',
  '试着用类比来解释今天的难点',
  '今天可以从一个争议性问题切入',
  '试试先做几道题，再回头看理论',
  '今天把大目标拆成 3 个小步骤',
  '试着从应用场景倒推：学这个能做什么？',
  '今天用"教别人"的心态来学',
];

const COMPLETION_QUOTES = [
  '又深了一段，你的珊瑚在生长',
  '深海的宁静，属于坚持下潜的你',
  '每一段专注，都是向更深处的一次呼吸',
  '水母为你守夜，你只管向下探索',
  '又一片海域被你点亮了',
  '深处的光，只给愿意下潜的人',
  '你的专注，让深海不再寂静',
];

const AMBIANCE_KEYWORDS = [
  '静谧', '微光', '涌动', '沉淀', '清澈', '深邃', '温柔',
  '辽阔', '安宁', '流动', '闪烁', '悠然', '坚定', '舒展',
];

// ─── 核心函数 / Core function ──────────────────────────────────────

/** 获取今日配置（确定性，同一天内多次调用结果一致） */
export function getDailyConfig(): DailyConfig {
  const seed = getDailySeed();
  const rng = mulberry32(seed);

  const hueShift = Math.round((rng() - 0.5) * 10); // -5 ~ +5
  const encouragement = ENCOURAGEMENTS[Math.floor(rng() * ENCOURAGEMENTS.length)];
  const studyAngle = STUDY_ANGLES[Math.floor(rng() * STUDY_ANGLES.length)];
  const dayIndex = Math.floor(seed / 1) % COMPLETION_QUOTES.length;
  const completionQuote = COMPLETION_QUOTES[dayIndex];
  const ambianceKeyword = AMBIANCE_KEYWORDS[Math.floor(rng() * AMBIANCE_KEYWORDS.length)];

  return { hueShift, encouragement, studyAngle, completionQuote, ambianceKeyword };
}

/**
 * 应用每日色相偏移到 CSS 变量
 * Apply daily hue shift to CSS variable
 */
export function applyDailyHueShift(): void {
  const { hueShift } = getDailyConfig();
  if (hueShift !== 0) {
    document.documentElement.style.setProperty('--daily-hue-shift', `${hueShift}deg`);
  }
}
