/**
 * photoCrop — 图文截屏坐标换算纯函数（v0.11.7）。
 *
 * @ai-context: 归一化坐标（0-1，框选层相对图像）→ 物理像素（GDI 捕获尺寸）。
 *              DPI 换算基准：图像物理像素 × 归一化，不经 window.devicePixelRatio
 *              （显示缩放已由 letterbox 层消化）。clamp 到图像内、宽高取整。
 */
export function normToPixels(
  x: number,
  y: number,
  w: number,
  h: number,
  imageW: number,
  imageH: number,
): { x: number; y: number; w: number; h: number } {
  const cx = Math.min(1, Math.max(0, x));
  const cy = Math.min(1, Math.max(0, y));
  const cw = Math.min(1, Math.max(0, w));
  const ch = Math.min(1, Math.max(0, h));
  return {
    x: Math.round(cx * imageW),
    y: Math.round(cy * imageH),
    // 越界/零宽防御：至少 1 物理像素（canvas 拒绝 0 尺寸）
    w: Math.max(1, Math.round(cw * imageW)),
    h: Math.max(1, Math.round(ch * imageH)),
  };
}
