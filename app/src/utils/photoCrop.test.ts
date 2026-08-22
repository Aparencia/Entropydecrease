/**
 * photoCrop 坐标换算测试（v0.11.7 图文截屏）。
 *
 * @ai-context: DPI 关键路径——归一化坐标 × 物理像素；覆盖边界（0/1）、
 *              越界（clamp）、非整数（取整）、零宽（防御 1px）。
 */
import { describe, expect, it } from "vitest";
import { normToPixels } from "./photoCrop";

describe("normToPixels", () => {
  it("标准区域按物理像素换算", () => {
    // 1920×1080 全屏截图，框选左上 1/4
    const r = normToPixels(0, 0, 0.5, 0.5, 1920, 1080);
    expect(r).toEqual({ x: 0, y: 0, w: 960, h: 540 });
  });

  it("DPI 150% 缩放下仍按物理像素（不经 devicePixelRatio）", () => {
    // 逻辑窗口 1280×720 → 物理 1920×1080；归一化坐标不变
    const r = normToPixels(0.25, 0.25, 0.5, 0.5, 1920, 1080);
    expect(r).toEqual({ x: 480, y: 270, w: 960, h: 540 });
  });

  it("越界输入 clamp 到图像内且输出不越界", () => {
    // 输入全越界（起点在右/下边界外）→ 起点收至末行/末列、宽高收至剩余空间
    const r = normToPixels(-0.5, 1.5, 2, 2, 100, 100);
    expect(r).toEqual({ x: 0, y: 99, w: 100, h: 1 });
  });

  it("起点在界内但宽高越界 → 收窄到图像边界（审查 P7）", () => {
    // 框选右下角 50%，起点 (0.9, 0.9) → 剩余空间仅 10px
    const r = normToPixels(0.9, 0.9, 0.5, 0.5, 100, 100);
    expect(r).toEqual({ x: 90, y: 90, w: 10, h: 10 });
    // 输出矩形必须完全在图像内（canvas 源矩形越界 → 透明带）
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });

  it("非整数坐标取整（含四舍五入）", () => {
    const r = normToPixels(0.333, 0.333, 0.333, 0.333, 1000, 1000);
    expect(r).toEqual({ x: 333, y: 333, w: 333, h: 333 });
  });

  it("零宽/负宽防御为至少 1 像素", () => {
    const r = normToPixels(0, 0, 0, 0, 800, 600);
    expect(r.w).toBe(1);
    expect(r.h).toBe(1);
  });
});
