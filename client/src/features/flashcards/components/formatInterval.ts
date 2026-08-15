/**
 * 评分间隔展示工具（自 RatingBar.tsx 拆出）
 *
 * @ai-context: SM2 下次复习间隔天数转紧凑展示（<1d / 12d / 3mo / 1.5y），
 * 从组件文件移出（react-refresh：组件文件只导出组件）。
 */
export function formatInterval(days: number): string {
  if (days === 0) return '<1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
