/**
 * dashboard 共享工具 — 欢迎区文案与相对时间
 *
 * 从 DashboardPage 提取的纯函数：时段氛围文案（对抗感觉适应）、日期标签、相对时间。
 *
 * @ai-context: dashboard 纯工具函数。
 */

/* ── 氛围文案池 ── */
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

export function getAtmosphereQuote(): string {
  const period = getTimePeriod();
  const quotes = ATMOSPHERE_QUOTES[period];
  const daySeed = new Date().getDate();
  return quotes[daySeed % quotes.length];
}

export function getTodayLabel() {
  const d = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
}

export function formatRelativeTime(date: Date): string {
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
