/**
 * ritualPlanner — 自适应编排 + A/B 分流（纯函数）
 * Adaptive ritual planner + A/B allocation (pure functions)
 *
 * @ai-context: RIT-02+04（决策 6）合并系统——按上下文裁剪/重排步骤并输出
 * planVariant 埋点。RIT-03（决策/B1.6）A/B：B 组把呼吸提前到开场（"先纯
 * 呼吸再回顾"假设），planVariant 记录分组供 v0.27.0 依据完成率裁决。
 * 本文件仅含纯函数（无副作用/存储/网络），参数为 v0.26.0 保守初值。
 * @ai-context: Pure planner. Adapts steps by context, B group moves the
 * breathing step to the front; planVariant carries telemetry for later
 * data-driven adjudication. Conservative fixed params for v0.26.0.
 */
import type {
  RitualStep,
  RitualPlan,
  RitualPlanContext,
  RitualAbGroup,
} from '../types';

/** 老用户自适应轻档触发的连续天数阈值 */
const ADAPT_STREAK_THRESHOLD = 7;
/** 放松版（更暗视觉/文案）触发的起始小时 */
const RELAX_HOUR = 22;

/** 稳定 A/B 分流：字符串 hash 奇偶决定分组（同一 seed 恒定，RIT-03 埋点前提） */
export function pickAbGroup(seed: string): RitualAbGroup {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? 'A' : 'B';
}

/** 将末尾的呼吸步骤移到开头（B 组：开场先纯呼吸） */
function frontloadBreathing(steps: RitualStep[]): RitualStep[] {
  if (steps.length === 0 || steps[0] === 'breathing') return steps;
  const idx = steps.lastIndexOf('breathing');
  if (idx < 0) return steps;
  const rest = steps.filter((_, i) => i !== idx);
  return ['breathing', ...rest];
}

/**
 * 生成编排计划。
 * 规则优先级：手动 intensity > 自适应轻档 > 无回顾数据裁剪；A/B 与放松版
 * 叠加在最终 variant 标签上。
 */
export function buildRitualPlan(ctx: RitualPlanContext): RitualPlan {
  const { hasLastSession, streakDays, hour, intensity, autoAdapt, abGroup } = ctx;

  // 是否走轻档：手动 light，或（自适应开启 且 连续≥7天 且 非 deep）
  const isLight =
    intensity === 'light' ||
    (autoAdapt && streakDays >= ADAPT_STREAK_THRESHOLD && intensity !== 'deep');

  let steps: RitualStep[] = isLight
    ? ['goal', 'breathing']              // 轻档：一行目标 + 呼吸
    : ['review', 'goal', 'breathing'];   // 标准/深度：完整三步

  // 无上次会话数据 → 裁剪回顾
  if (!hasLastSession) {
    steps = steps.filter((s) => s !== 'review');
  }
  // 兜底：至少保留呼吸一步
  if (steps.length === 0) steps = ['breathing'];

  // A/B：B 组开场先纯呼吸
  if (abGroup === 'B') steps = frontloadBreathing(steps);

  const intensityLabel = isLight ? 'light' : intensity;
  const night = hour >= RELAX_HOUR ? '-night' : '';
  const planVariant = `${intensityLabel}-${abGroup}${night}`;

  return { steps, planVariant };
}
