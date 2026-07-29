/**
 * @ai-context: dashboard 功能模块：atmosphereQuote。
 */
/* ── 氛围文案池（零压力，纯意境） ── */

const ATMOSPHERE_QUOTES: Record<string, string[]> = {
  dawn:    ['晨光微暖，新的一天开始了', '天刚亮，世界还很安静', '清晨的风，带着一点凉意'],
  morning: ['阳光正好，一切刚刚好', '窗外的光，慢慢爬上了桌', '早晨的空气，格外清新'],
  noon:    ['午后的光，刚好照进书桌', '日头正暖，时光慢慢走', '正午的阳光，明亮却不刺眼'],
  evening: ['天色渐柔，适合慢下来', '夕阳把影子拉得很长', '傍晚的风，带着一天故事'],
  night:   ['夜色温柔，属于自己的时间', '星星出来了，世界安静了', '夜晚的光，只为你亮着'],
  late:    ['万籁俱静，世界只剩你和光', '深夜的灯，是最温柔的陪伴', '月亮很高，夜很深'],
};

export function getTimePeriod(): string {
  const h = new Date().getHours();
  if (h < 6) return 'late';
  if (h < 9) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 14) return 'noon';
  if (h < 18) return 'evening';
  if (h < 22) return 'night';
  return 'late';
}

/** 基于日期种子选文案，同一天不变 */
export function getAtmosphereQuote(): string {
  const period = getTimePeriod();
  const quotes = ATMOSPHERE_QUOTES[period];
  const daySeed = new Date().getDate();
  return quotes[daySeed % quotes.length];
}
