// @vitest-environment node
/**
 * layoutRadial.test.ts — 辐射布局纯函数单测（v0.13.8 §六：黄金用例）。
 *
 * @ai-context: 断言契约（规格 §4.4）——中心节点在 (0,0)；ring 1 均匀分布；
 *              环 ≥2 父角度扇区（spread = 60°/(子数+1)）；orphan 最外环
 *              golden angle 确定性兜底；碰撞沿角度外推（部分节点半径 > 基础环）。
 *              全 AAA + golden（确定性零随机——相同输入恒相同输出）。
 */
import { describe, expect, it } from "vitest";
import {
  CANVAS_BBOX, RING_BASE, RING_STEP,
  layoutRadial,
  type CanvasLayoutItem, type CanvasPoint,
} from "./layoutRadial";

/** 坐标带 1e-3 容差断言（三角函数近似） */
function expectPt(actual: CanvasPoint, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 2);
  expect(actual.y).toBeCloseTo(y, 2);
}

/** 位置方向角（度，-180..180——环 ≥2 扇区断言用；圆心项返回 null） */
function directionDeg(p: CanvasPoint): number {
  if (Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9) return 0;
  return (Math.atan2(p.y, p.x) * 180) / Math.PI;
}

/** 圆心到原点的半径 */
function radiusOf(p: CanvasPoint): number {
  return Math.hypot(p.x, p.y);
}

/** 两中心点是否重叠（bbox 碰撞检测口径：dx < 宽和/2 且 dy < 高和/2） */
function overlaps(a: CanvasPoint, b: CanvasPoint): boolean {
  const w = CANVAS_BBOX.question.w;
  const h = CANVAS_BBOX.question.h;
  return Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h;
}

const q = (id: number, parentId: number | null): CanvasLayoutItem => ({
  key: `q:${id}`, kind: "question", parentKey: parentId == null ? null : `q:${parentId}`,
});
const c = (id: number): CanvasLayoutItem => ({ key: `c:${id}`, kind: "concept", parentKey: null });
const m = (id: number): CanvasLayoutItem => ({ key: `m:${id}`, kind: "model", parentKey: null });

describe("layoutRadial 辐射布局", () => {
  it("无核心问题、单根：根节点在圆心 (0,0)", () => {
    // Arrange + Act
    const pos = layoutRadial({ hasCore: false, items: [q(1, null)] });
    // Assert
    expectPt(pos.get("q:1")!, 0, 0);
  });

  it("无核心问题、多根+子节点：root0 在圆心，其余根与子节点均匀环绕 ring 1", () => {
    // Arrange：两个根 + root0 的一个子节点 → ring 1 两项（-90° 与 90°）
    const pos = layoutRadial({
      hasCore: false,
      items: [q(1, null), q(2, null), q(3, 1)],
    });
    // Assert
    expectPt(pos.get("q:1")!, 0, 0);
    expectPt(pos.get("q:2")!, 0, -RING_BASE); // -90°（顶部）
    expectPt(pos.get("q:3")!, 0, RING_BASE); // 90°（底部）
  });

  it("有核心问题：虚拟核心占圆心，全部根节点均匀分布 ring 1", () => {
    // Arrange：4 根（核心问题不含在 items——视图层单独渲染）
    const pos = layoutRadial({ hasCore: true, items: [q(1, null), q(2, null), q(3, null), q(4, null)] });
    // Assert：-90° / 0° / 90° / 180°（环半径 220）
    expectPt(pos.get("q:1")!, 0, -RING_BASE);
    expectPt(pos.get("q:2")!, RING_BASE, 0);
    expectPt(pos.get("q:3")!, 0, RING_BASE);
    expectPt(pos.get("q:4")!, -RING_BASE, 0);
  });

  it("环 ≥2：子节点落在父角度扇区内（spread = 60°/(子数+1)，±spread 对称）", () => {
    // Arrange：根 → 单子 p（ring1 顶部 -90°）→ p 的 3 子（ring2，±30° 对称）
    const pos = layoutRadial({
      hasCore: false,
      items: [q(1, null), q(2, 1), q(3, 2), q(4, 2), q(5, 2)],
    });
    // Assert：扇区角度 -120 / -90 / -60（半径统一 420 或碰撞外推——方向不变）
    expect(directionDeg(pos.get("q:3")!)).toBeCloseTo(-120, 1);
    expect(directionDeg(pos.get("q:4")!)).toBeCloseTo(-90, 1);
    expect(directionDeg(pos.get("q:5")!)).toBeCloseTo(-60, 1);
    // ring2 基础半径 = 220 + 200
    expect(radiusOf(pos.get("q:3")!)).toBeGreaterThanOrEqual(RING_BASE + RING_STEP - 1e-6);
  });

  it("父节点缺失（orphan）→ 最外环 golden angle 确定性兜底", () => {
    // Arrange：根 + 一个父不存在的子节点
    const pos = layoutRadial({
      hasCore: false,
      items: [q(1, null), q(99, 42)], // q:42 不存在
    });
    // Assert：orphan 在 ring1（220）0° 方向（golden 序列第一项）
    expectPt(pos.get("q:99")!, RING_BASE, 0);
  });

  it("概念/模型浮动项 → 最外环均匀分布（无树时即 ring 1）", () => {
    // Arrange：有核心问题 + 2 浮动项（概念/模型各一）
    const pos = layoutRadial({ hasCore: true, items: [c(1), m(2)] });
    // Assert：-90° 与 90° 均匀分布
    expectPt(pos.get("c:1")!, 0, -RING_BASE);
    expectPt(pos.get("m:2")!, 0, RING_BASE);
  });

  it("碰撞处理：扇区内兄弟重叠 → 沿角度外推（部分节点半径超过基础环）", () => {
    // Arrange：根 → p（ring1）→ p 的 6 子（ring2 扇区密集，相邻必重叠）
    const p = q(2, 1);
    const kids = [q(3, 2), q(4, 2), q(5, 2), q(6, 2), q(7, 2), q(8, 2)];
    const pos = layoutRadial({ hasCore: false, items: [q(1, null), p, ...kids] });
    // Assert：① 至少一个子节点被外推（半径 > 基础环 420）
    const radii = kids.map((k) => radiusOf(pos.get(k.key)!));
    expect(radii.some((r) => r > RING_BASE + RING_STEP + 1e-6)).toBe(true);
    // ② 外推后最终位置两两不重叠（碰撞检测收敛保证）
    const all = [pos.get("q:1")!, pos.get("q:2")!, ...kids.map((k) => pos.get(k.key)!)];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        expect(overlaps(all[i], all[j])).toBe(false);
      }
    }
  });

  it("空输入 → 空结果（不崩）", () => {
    // Arrange + Act
    const pos = layoutRadial({ hasCore: false, items: [] });
    // Assert
    expect(pos.size).toBe(0);
  });
});
