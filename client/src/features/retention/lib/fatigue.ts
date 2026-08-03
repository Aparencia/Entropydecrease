/**
 * 疲劳共情判定（宪法 P2 · 觉察原则）
 * Fatigue empathy rules (constitution P2 · awareness principle)
 *
 * @ai-context: 纯函数规则层：连续深潜而不上浮休息达到阈值时建议一次呼吸。
 * 觉察而非管控——建议永远可忽略、无惩罚、无阻断（宪法第二/四原则）。
 *
 * @ai-context: Pure rules: suggest surfacing after N consecutive work
 * sessions without a real break. Suggestions are always dismissible.
 */

/** 连续完成的工作会话数阈值（未经历真实休息）→ 触发一次共情建议 */
export const SURFACE_SUGGESTION_THRESHOLD = 2;

/** 休息时长达到计划值的此比例即视为"真实休息"（跳过/提前返回不算） */
export const REAL_BREAK_RATIO = 0.6;

export function shouldSuggestSurfacing(workSessionsWithoutBreak: number): boolean {
  return workSessionsWithoutBreak >= SURFACE_SUGGESTION_THRESHOLD;
}

/**
 * 判定一次休息是否为真实休息（时长口径，不依赖动作标记）
 * @ai-context skip 不写 lastAction，故用停留时长与计划时长比较判定
 */
export function wasRealBreak(elapsedMs: number, plannedSeconds: number): boolean {
  if (plannedSeconds <= 0) return false;
  return elapsedMs >= plannedSeconds * 1000 * REAL_BREAK_RATIO;
}

/** 共情文案（零负向语言：是邀请，不是警告） */
export const SURFACE_SUGGESTION_TEXT =
  '已连续深潜一段时间了，要不要上浮透口气？忽略也没关系，海一直在。';
