/**
 * @ai-context: dashboard 功能模块：dashboardHelpers。
 */
/* ── Dashboard 辅助工具函数与常量 ── */

export const accentText: Record<string, string> = {
  pomodoro: 'text-pomodoro', note: 'text-note',
  flashcard: 'text-flashcard', feynman: 'text-feynman',
};
export const accentBg: Record<string, string> = {
  pomodoro: 'bg-pomodoro/10', note: 'bg-note/10',
  flashcard: 'bg-flashcard/10', feynman: 'bg-feynman/10',
};
export const accentDot: Record<string, string> = {
  pomodoro: 'bg-brand-500', note: 'bg-note',
  flashcard: 'bg-flashcard', feynman: 'bg-feynman',
};

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

/** 获取今天日期字符串 YYYY-MM-DD */
export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
