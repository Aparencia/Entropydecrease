/**
 * layoutDualRing.ts — 双环布局纯函数（v0.14.1；浮动项贴树）。
 *
 * @ai-context: 问题树内环沿用辐射布局（layoutRadial——树深=环深不变），
 *              概念/模型浮动项独占「树最深环 + 半环」的贴树外环（≈树缘
 *              外 80px，而非辐射布局的整环 160px）——修复「浮动项总落
 *              最外环远离树」的观感问题（规格 §2.3）。
 * @ai-context: 树部分与 layoutRadial 同算法同输出（行为零变化）；仅浮动项
 *              环半径收紧。孤儿兜底语义继承辐射布局（golden angle）。
 */
import { layoutRadial, RING_STEP, type RadialLayoutInput } from "./layoutRadial";
import { CANVAS_BBOX, nudgeOut, polar, type CanvasPoint } from "./layoutShared";
import type { PlacedBox } from "./layoutShared";

/** 贴树环增量（半环——树缘 +80px，紧贴不分离） */
const HUG_STEP = RING_STEP / 2;
/** 碰撞外推步长（沿 x 外推——贴树环拥挤时的退让） */
const COLLISION_STEP = 60;

export function layoutDualRing(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const questions = items.filter((i) => i.kind === "question");
  const floaters = items.filter((i) => i.kind !== "question");

  // 问题树：辐射布局（同 layoutRadial——仅树节点参与环层）
  const treePos = layoutRadial({ hasCore, items: questions });
  const out = new Map(treePos);

  // 树最深环半径（问题节点圆心到原点最大距离；空树 → 0）
  let deepest = 0;
  for (const p of treePos.values()) {
    deepest = Math.max(deepest, Math.hypot(p.x, p.y));
  }
  const hugRadius = deepest + HUG_STEP;

  // 浮动参照：贴树环（全周均匀分布；确定性外推防挤叠）
  const placed: PlacedBox[] = [];
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
