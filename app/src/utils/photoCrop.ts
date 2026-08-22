/**
 * photoCrop — 图文截屏坐标换算纯函数（v0.11.7）。
 *
 * @ai-context: 归一化坐标（0-1，框选层相对图像）→ 物理像素（GDI 捕获尺寸）。
 *              DPI 换算基准：图像物理像素 × 归一化，不经 window.devicePixelRatio
 *              （显示缩放已由 letterbox 层消化）。输入 clamp 到 [0,1]；输出矩形
 *              保证完全在图像内（起点 ≤ 末行/末列、宽高不越界——canvas 源矩形
 *              越界会产生透明带，审查 P7 防御）。
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
  // 起点 clamp 到图像末行/末列（round 可能越界 1 像素——如 cx=1 → imageW）
  const px = Math.min(imageW - 1, Math.round(cx * imageW));
  const py = Math.min(imageH - 1, Math.round(cy * imageH));
  return {
    x: px,
    y: py,
    // 宽高：至少 1 物理像素且不越出图像右/下边界（canvas 拒绝 0 尺寸）
    w: Math.max(1, Math.min(imageW - px, Math.round(cw * imageW))),
    h: Math.max(1, Math.min(imageH - py, Math.round(ch * imageH))),
  };
}
