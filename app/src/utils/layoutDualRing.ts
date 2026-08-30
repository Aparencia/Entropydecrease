/**
 * layoutDualRing.ts — 双环布局纯函数（v0.14.1；浮动项贴树）。
 *
 * @ai-context: 问题树内环沿用辐射布局（layoutRadial——树深=环深不变），
 *              概念/模型浮动项独占「树缘外紧贴」环——修复「浮动项总落
 *              最外环远离树」的观感问题（规格 §2.3）。
 * @ai-context: 树缘口径=最深圆心距 + 问题节点半宽（110，沿半径方向最坏）+ 浮动项
 *              半宽（90）+ 间隙（20）——审查修复：原「圆心距 + 半环 80」把圆心
 *              距当树缘，AABB 判定下浮动项压住 4/5 个 ring1 树节点（已复现）。
 *              碰撞集合预置全部树节点包围盒——浮动项与树不重叠是硬约束。
 * @ai-context: 树部分与 layoutRadial 同算法同输出（行为零变化）；仅浮动项
 *              环半径收紧。孤儿兜底语义继承辐射布局（golden angle）。
 */
import { layoutRadial, type RadialLayoutInput } from "./layoutRadial";
import { CANVAS_BBOX, nudgeOut, polar, type CanvasPoint, type PlacedBox } from "./layoutShared";

/** 树缘间隙（浮动项与树节点 AABB 的最小间距） */
const HUG_GAP = 20;
/** 碰撞外推步长（沿 x 外推——浮动项环拥挤时的退让） */
const COLLISION_STEP = 60;

export function layoutDualRing(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const questions = items.filter((i) => i.kind === "question");
  const floaters = items.filter((i) => i.kind !== "question");

  // 问题树：辐射布局（同 layoutRadial——仅树节点参与环层）
  const treePos = layoutRadial({ hasCore, items: questions });
  const out = new Map(treePos);

  // 树缘半径：最深问题节点圆心距 + 其半宽（沿半径方向最坏 110）——AABB 口径下
  // 「圆心距 + 固定步」不足以让浮动项脱离树节点包围盒（审查实测重叠，见头注释）
  let deepest = 0;
  for (const p of treePos.values()) {
    deepest = Math.max(deepest, Math.hypot(p.x, p.y));
  }
  const questionHalfW = CANVAS_BBOX.question.w / 2;
  const hugRadius = deepest + questionHalfW + 90 + HUG_GAP;

  // 浮动参照：贴树环（全周均匀分布；碰撞集合含全部树节点——重叠硬约束）
  const placed: PlacedBox[] = [...treePos.values()].map((p) => {
    const b = CANVAS_BBOX.question;
    return { x: p.x, y: p.y, w: b.w, h: b.h };
  });
  const floatersSorted = [...floaters].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  floatersSorted.forEach((it, idx) => {
    const bbox = CANVAS_BBOX[it.kind];
    const target = polar(-90 + (360 / Math.max(floatersSorted.length, 1)) * idx, hugRadius);
    const center = nudgeOut(target, bbox, placed, "x", COLLISION_STEP, 8);
    placed.push({ x: center.x, y: center.y, w: bbox.w, h: bbox.h });
    out.set(it.key, center);
  });
  return out;
}
