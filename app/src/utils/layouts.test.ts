// @vitest-environment node
/**
 * layouts.test.ts — v0.14.1 新增布局算法纯函数单测（5 算法 + 分发器）。
 *
 * @ai-context: 通用不变式（规格 §6）：全部输入 key 有位置 / 两跑确定性一致 /
 *              典型输入无重叠；再按算法各断言一条结构契约：
 *              mindmap 左右翼、treeRight x 随深度、org y 随深度、
 *              fishbone 骨刺上下交替、dualRing 浮动项贴树环（半径收紧）。
 */
import { describe, expect, it } from "vitest";
import { layoutCanvas, LAYOUT_ALGORITHMS } from "./layoutCanvas";
import { CANVAS_BBOX } from "./layoutShared";
import { layoutRadial } from "./layoutRadial";
import { layoutMindmap } from "./layoutMindmap";
import { layoutTreeRight } from "./layoutTreeRight";
import { layoutOrg } from "./layoutOrg";
import { layoutFishbone } from "./layoutFishbone";
import { layoutDualRing } from "./layoutDualRing";
import type { CanvasLayoutItem } from "./layoutRadial";
import type { LayoutAlgorithm } from "../types/knowledge";

const q = (id: number, parentId: number | null): CanvasLayoutItem => ({
  key: `q:${id}`, kind: "question", parentKey: parentId == null ? null : `q:${parentId}`,
});
const c = (id: number): CanvasLayoutItem => ({ key: `c:${id}`, kind: "concept", parentKey: null });
const m = (id: number): CanvasLayoutItem => ({ key: `m:${id}`, kind: "model", parentKey: null });

/** 典型输入：核心问题 + 3 根（其一带子树）+ 概念/模型浮动项 */
const typical = () => ({
  hasCore: true,
  items: [q(1, null), q(2, null), q(3, null), q(4, 1), q(5, 1), q(6, 4), c(11), m(12), c(13)],
});

/** 无核心变体：首根带头子树（审查回归——鱼骨头子树曾整体丢位）+ 浮动项 */
const typicalNoCore = () => ({
  hasCore: false,
  items: [q(1, null), q(2, 1), q(3, 1), q(4, null), c(11), m(12)],
});

function kindOf(key: string): "question" | "concept" | "model" {
  return key.startsWith("q:") ? "question" : key.startsWith("c:") ? "concept" : "model";
}

/** 通用不变式：key 全覆盖 + 两跑一致 + 无重叠（输入可指定——hasCore 两种形态） */
function expectInvariants(alg: LayoutAlgorithm, input: { hasCore: boolean; items: CanvasLayoutItem[] } = typical()) {
  // Arrange
  // Act
  const a = layoutCanvas(input, alg);
  const b = layoutCanvas(input, alg);
  // Assert：key 全覆盖（所有 item 都有位置——缺失会以 (0,0) 兜底并写库，禁缺）
  expect([...a.keys()].sort()).toEqual(input.items.map((i) => i.key).sort());
  // 确定性：两跑完全相同
  expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  // 无重叠（按各自 kind 包围盒：dx < (w1+w2)/2 且 dy < (h1+h2)/2）
  const entries = [...a.entries()];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [k1, p1] = entries[i];
      const [k2, p2] = entries[j];
      const b1 = CANVAS_BBOX[kindOf(k1)];
      const b2 = CANVAS_BBOX[kindOf(k2)];
      const overlap = Math.abs(p1.x - p2.x) < (b1.w + b2.w) / 2 && Math.abs(p1.y - p2.y) < (b1.h + b2.h) / 2;
      expect(overlap, `${k1} 与 ${k2} 重叠`).toBe(false);
    }
  }
}

describe("新增布局算法通用不变式（全覆盖/确定性/无重叠）", () => {
  it.each(["mindmap", "treeRight", "org", "fishbone", "dualRing"] as LayoutAlgorithm[])(
    "%s（有核心）",
    (alg) => expectInvariants(alg),
  );
  // 审查修复：矩阵补 hasCore=false 变体——各算法"首根占圆心/头带子树"路径
  it.each(["mindmap", "treeRight", "org", "fishbone", "dualRing"] as LayoutAlgorithm[])(
    "%s（无核心·首根带头子树）",
    (alg) => expectInvariants(alg, typicalNoCore()),
  );
});

describe("layoutMindmap 双翼思维导图", () => {
  it("根节点左右分翼（首个根右翼 x>0，次根左翼 x<0），子节点沿翼向外（|x| 随深度增）", () => {
    // Arrange：核心 + 3 根（q1 右翼 / q2 左翼 / q3 右翼；q5 是 q1 的子节点）
    const pos = layoutMindmap({
      hasCore: true,
      items: [q(1, null), q(2, null), q(3, null), q(5, 1)],
    });
    // Assert：q1 右翼、q2 左翼、q3 右翼；q5 比 q1 更靠外（深度 +1）
    const p1 = pos.get("q:1")!, p2 = pos.get("q:2")!, p3 = pos.get("q:3")!, p5 = pos.get("q:5")!;
    expect(p1.x).toBeGreaterThan(0);
    expect(p2.x).toBeLessThan(0);
    expect(p3.x).toBeGreaterThan(0);
    expect(Math.abs(p5.x)).toBeGreaterThan(Math.abs(p1.x));
  });

  it("无核心：首根在圆心 (0,0)，其余根入翼", () => {
    // Arrange
    const pos = layoutMindmap({ hasCore: false, items: [q(1, null), q(2, null)] });
    // Assert
    expect(pos.get("q:1")).toEqual({ x: 0, y: 0 });
    expect(pos.get("q:2")!.x).not.toBe(0);
  });
});

describe("layoutTreeRight 水平逻辑树", () => {
  it("根在 depth1（有核心），子节点 x 随深度步进（280/560）", () => {
    // Arrange
    const pos = layoutTreeRight({
      hasCore: true,
      items: [q(1, null), q(2, 1), q(3, 2)],
    });
    // Assert：x = depth × 280（圆心口径）
    expect(pos.get("q:1")!.x).toBe(280);
    expect(pos.get("q:2")!.x).toBe(560);
    expect(pos.get("q:3")!.x).toBe(840);
  });

  it("无核心：首根圆心，其余根 depth1", () => {
    // Arrange
    const pos = layoutTreeRight({ hasCore: false, items: [q(1, null), q(2, null)] });
    // Assert
    expect(pos.get("q:1")!.x).toBe(0);
    expect(pos.get("q:2")!.x).toBe(280);
  });
});

describe("layoutOrg 垂直组织树", () => {
  it("根在 depth1（有核心），子节点 y 随深度步进（200/400）", () => {
    // Arrange
    const pos = layoutOrg({
      hasCore: true,
      items: [q(1, null), q(2, 1), q(3, 2)],
    });
    // Assert：y = depth × 200（圆心口径）
    expect(pos.get("q:1")!.y).toBe(200);
    expect(pos.get("q:2")!.y).toBe(400);
    expect(pos.get("q:3")!.y).toBe(600);
  });

  it("无核心：首根在顶端 (0,0)", () => {
    // Arrange
    const pos = layoutOrg({ hasCore: false, items: [q(1, null), q(2, null)] });
    // Assert
    expect(pos.get("q:1")).toEqual({ x: 0, y: 0 });
  });
});

describe("layoutFishbone 鱼骨图（简化版）", () => {
  it("骨刺上下交替：首刺 y>0（上）、次刺 y<0（下），子骨沿刺向外", () => {
    // Arrange：核心 + 2 根（两刺）+ 首刺的一个子节点
    const pos = layoutFishbone({
      hasCore: true,
      items: [q(1, null), q(2, null), q(3, 1)],
    });
    // Assert：q1 上刺、q2 下刺（y 符号相反）；q3 沿 q1 方向延伸（同号、更远）
    const p1 = pos.get("q:1")!, p2 = pos.get("q:2")!, p3 = pos.get("q:3")!;
    expect(p1.y).toBeGreaterThan(0);
    expect(p2.y).toBeLessThan(0);
    expect(p3.y).toBeGreaterThan(p1.y);
    expect(p3.x).toBeGreaterThan(p1.x);
  });

  it("无核心：首根为鱼头 (0,0)，其余为刺", () => {
    // Arrange
    const pos = layoutFishbone({ hasCore: false, items: [q(1, null), q(2, null)] });
    // Assert
    expect(pos.get("q:1")).toEqual({ x: 0, y: 0 });
    expect(pos.get("q:2")!.x).toBeGreaterThan(0);
  });
});

describe("layoutDualRing 双环（浮动项贴树）", () => {
  it("浮动项贴树缘：树缘口径（圆心距+半宽+90+20）而非圆心距+半环；树节点输出与辐射一致", () => {
    // Arrange：2 层树（最深圆心距 380 = 220 + 160）+ 2 浮动项
    const input = { hasCore: true, items: [q(1, null), q(2, 1), q(3, 2), c(11), c(12)] };
    const dual = layoutDualRing(input);
    const radial = layoutRadial(input);
    // Assert：浮动项落在树缘（380 + 问题半宽 110 + 浮动半宽 90 + 间隙 20 = 600；
    //         碰撞预算 8×60 兜底只外推）
    const deepest = Math.max(...["q:1", "q:2", "q:3"].map((k) => Math.hypot(radial.get(k)!.x, radial.get(k)!.y)));
    for (const k of ["c:11", "c:12"]) {
      const r = Math.hypot(dual.get(k)!.x, dual.get(k)!.y);
      expect(r).toBeGreaterThanOrEqual(deepest + 110 + 90 + 20 - 1e-6);
      expect(r).toBeLessThanOrEqual(deepest + 110 + 90 + 20 + 8 * 60 + 1e-6);
    }
    // Assert：树节点与辐射布局同输出（行为零变化）
    for (const k of ["q:1", "q:2", "q:3"]) expect(dual.get(k)).toEqual(radial.get(k));
  });

  it("单环扁树（5 根 + 5 浮动项，审查回归）：浮动项与树节点 AABB 全部不重叠", () => {
    // Arrange：单环 5 根（角距 72°）+ 5 概念——修复前 4/5 浮动项压住 ring1 节点
    const roots = [q(1, null), q(2, null), q(3, null), q(4, null), q(5, null)];
    const floaters = [c(11), c(12), c(13), c(14), c(15)];
    const pos = layoutDualRing({ hasCore: true, items: [...roots, ...floaters] });
    // Assert：每个浮动项与每个树节点无重叠（同款 AABB 判定）
    for (const f of floaters) {
      const p1 = pos.get(f.key)!;
      const b1 = CANVAS_BBOX.concept;
      for (const r of roots) {
        const p2 = pos.get(r.key)!;
        const b2 = CANVAS_BBOX.question;
        const ov = Math.abs(p1.x - p2.x) < (b1.w + b2.w) / 2 && Math.abs(p1.y - p2.y) < (b1.h + b2.h) / 2;
        expect(ov, `${f.key} 与 ${r.key} 重叠`).toBe(false);
      }
    }
  });
});

describe("layoutCanvas 分发器", () => {
  it("未知算法名回退辐射布局（防御旧数据/损坏值）", () => {
    // Arrange：TS 层防不了——经 any 模拟后端返回未知值
    const pos = layoutCanvas(typical(), "force" as unknown as LayoutAlgorithm);
    const posRadial = layoutCanvas(typical(), "radial");
    // Assert
    expect(pos).toEqual(posRadial);
  });

  it("LAYOUT_ALGORITHMS 与下拉候选全枚举一致（6 项，Rust 白名单同口径）", () => {
    expect(LAYOUT_ALGORITHMS).toEqual(["radial", "mindmap", "treeRight", "org", "fishbone", "dualRing"]);
  });
});
