/**
 * 时间格式化工具（全站统一入口）
 *
 * @ai-context: 2026-08 全仓体检（D12）收敛——此前 formatDate/formatDuration/
 * formatRelativeTime/formatTimeAgo/formatTime 在 12+ 个文件中各自实现，
 * 行为已出现分叉（如 UnifiedTimeline 与 SmartCapturePanel 的 relative 实现
 * 不同）。本文件为唯一权威实现，历史分叉按本文件语义收敛。
 * @ai-context: 纯函数，无副作用，可安全重构与并发使用。
 */

/** YYYY-MM-DD（本地时区） */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** HH:mm（本地时区） */
export function formatTime(date: Date | string | number): string {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** HH:mm:ss（本地时区） */
export function formatTimeWithSeconds(date: Date | string | number): string {
  const d = new Date(date);
  return `${formatTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** 时长格式化：秒 → "Xm Ys"（>=1h 时 "Xh Ym"；<1m 时 "Ys"） */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** 时长格式化（仅分钟级，用于统计展示）：分钟数 → "X 分钟" */
export function formatMinutes(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))} 分钟`;
}

/**
 * 相对时间：与 now 的差值 → "刚刚 / N 分钟前 / N 小时前 / N 天前 / YYYY-MM-DD"。
 * @param date - 目标时间
 * @param now - 参照时间（默认 Date.now()，测试可注入）
 */
export function formatRelativeTime(date: Date | string | number, now: number = Date.now()): string {
  const t = new Date(date).getTime();
  const diff = now - t;
  if (diff < 0) return formatDate(date); // 未来时间（时钟偏差）直接显示日期
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatDate(date);
}

/** 更粗粒度的相对时间（"N 天前"级别，>30 天显示日期）——用于长周期统计视图 */
export function formatTimeAgo(date: Date | string | number, now: number = Date.now()): string {
  const t = new Date(date).getTime();
  const diff = now - t;
  if (diff < 0) return formatDate(date);
  const days = Math.floor(diff / 86400000);
  if (days < 1) return formatRelativeTime(date, now);
  if (days < 30) return `${days} 天前`;
  return formatDate(date);
}

/**
 * 会话内定位：毫秒时间戳 → "MM:SS"（相对会话起始时间，负值钳为 00:00）。
 * 用于课堂时间轴/采集面板的逐条定位（原 UnifiedTimeline 与 SmartCapturePanel
 * 各自实现且完全一致，D12 收敛于此）。
 */
export function formatSessionElapsed(ms: number, startMs: number): string {
  const elapsed = Math.max(0, Math.floor((ms - startMs) / 1000));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** 知识半衰期标记：返回剩余天数（负数=已过期）及色值（NotesPage expiryBadge 收敛） */
export function expiryBadge(expiresAt: Date | undefined): { days: number; label: string; color: string } | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const diff = new Date(expiresAt).getTime() - now;
  const days = Math.round(diff / 86400000);
  if (days <= 0) return { days, label: '已过期', color: 'text-semantic-error' };
  if (days <= 7) return { days, label: `${days} 天后过期`, color: 'text-semantic-warning' };
  if (days <= 30) return { days, label: `${days} 天后过期`, color: 'text-text-tertiary' };
  return null; // 超过 30 天不显示
}
