/**
 * 时间/时长格式化纯函数（会话页列表与详情共用，避免重复实现）。
 *
 * @ai-context: 时间轴语义与 Rust 侧一致：毫秒相对会话起点；日期为 Unix 秒。
 */

/** 毫秒 → mm:ss（>=1 小时时为 h:mm:ss），时间轴/命中时间戳用。 */
export function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${sec}`;
  return `${String(m).padStart(2, "0")}:${sec}`;
}

/** 时长毫秒 → "XhYm" / "YmZs"（会话列表时长徽标用）。 */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${sec}s`;
  return `${sec}s`;
}

/** Unix 秒 → "MM-DD HH:mm"（列表紧凑格式；跨年补年份）。 */
export function fmtDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return d.getFullYear() === new Date().getFullYear()
    ? `${mm}-${dd} ${hh}:${mi}`
    : `${d.getFullYear()}-${mm}-${dd}`;
}
