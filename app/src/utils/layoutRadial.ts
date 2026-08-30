/**
 * layoutRadial.ts — 知识体系画布辐射布局纯函数（v0.13.8 §4.4）。
 *
 * @ai-context: 画布=手动画布非自动图（REQ-029 P3）——节点位置由用户拖拽决定，
 *               本算法只在「首次打开画布」与「自动排列」时计算，用户拖走的
 *               位置不再被算法覆盖（规格 §4.4 纪律：只计算一次）。
 * @ai-context: BFS 分层——圆心 ring 0（核心问题虚拟节点或第一个根），
 *              每层向外 +200px（ring 1 = 220px）；ring ≥2 子节点落在父节点
 *              角度扇区内（spread = 60°/(子节点数+1)）；碰撞沿角度外推 +50px
 *              最多 2 次、仍重叠则到下一环（规格 §4.4 步骤 6）。
 * @ai-context: v0.14.1：公共件迁出至 layoutShared（本文件行为零变化——仅改为
 *              import + re-export，既有消费者 import 路径不变；新增布局算法
 *              mindmap/treeRight/org/fishbone/dualRing 复用同一公共件）。
 * @ai-context: 零随机——孤儿与概念/模型浮动项用 golden angle 兜底（确定性伪随机），
 *              单测可精确断言；返回值为**圆心**坐标，React Flow 左上角转换
 *              （x - 宽/2, y - 高/2）由画布视图层完成。
 */
import {
  CANVAS_BBOX,
  byKey,
  overlapsAny,
  polar,
  type CanvasKind,
  type CanvasLayoutItem,
  type CanvasPoint,
} from "./layoutShared";

export type { CanvasKind, CanvasLayoutItem, CanvasPoint };
export { CANVAS_BBOX };

/** ring 1 环半径（规格 §4.4；圆心即 ring 0） */
export const RING_BASE = 220;
/** 每环半径增量（v0.13.9：200 → 160——深度≥3 层边长超过 600px 横穿画布，缩短长边） */
export const RING_STEP = 160;
/** 碰撞外推步长（规格 §4.4：沿角度 +50px） */
const COLLISION_STEP = 50;
/** 碰撞外推最大次数（超过则到下一环） */
const COLLISION_MAX_TRIES = 2;
/** 扇区角（规格 §4.4：spread = 60°/(子节点数+1)，子节点角度 = 父角度 ± spread） */
const SECTOR_SPREAD_DEG = 60;
/** 孤儿/浮动兜底角度步长——golden angle（确定性伪随机，测可复现） */
const GOLDEN_ANGLE_DEG = 137.508;

/** 布局输入 */
export interface RadialLayoutInput {
  /** 体系核心问题——true 时圆心被虚拟核心问题占据（视图层渲染），全部根节点上环 1 */
  hasCore: boolean;
  items: CanvasLayoutItem[];
}

/**
 * BFS 辐射布局：输入画布项，输出各项圆心坐标（key → center）。
 *
 * @ai-context: 纯函数零副作用零随机——相同输入恒相同输出（前端初始化/
 *              自动排列与单测共用同一算法，保证布局可复现可断言）。
 */
export function layoutRadial(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const out = new Map<string, CanvasPoint>();
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const angleOf = new Map<string, number>();

  const questions = items.filter((i) => i.kind === "question");
  const floaters = items.filter((i) => i.kind !== "question").sort(byKey);

  // 子节点索引：仅 question 参与树；parentKey 找不到父 → 孤儿（最外环 golden 兜底）
  const children = new Map<string, CanvasLayoutItem[]>();
  const orphans: CanvasLayoutItem[] = [];
  const known = new Set(questions.map((i) => i.key));
  for (const it of questions) {
    if (it.parentKey == null) continue;
    if (!known.has(it.parentKey)) {
      orphans.push(it);
      continue;
    }
    const list = children.get(it.parentKey) ?? [];
    list.push(it);
    children.set(it.parentKey, list);
  }
  const roots = questions.filter((i) => i.parentKey == null).sort(byKey);

  const placeAt = (item: CanvasLayoutItem, angleDeg: number, baseRadius: number): void => {
    const bbox = CANVAS_BBOX[item.kind];
    let radius = baseRadius;
    let center = polar(angleDeg, radius);
    let tries = 0;
    while (tries < COLLISION_MAX_TRIES && overlapsAny(center, bbox, placed)) {
      radius += COLLISION_STEP;
      center = polar(angleDeg, radius);
      tries += 1;
    }
    if (overlapsAny(center, bbox, placed)) {
      // 外推 2 次仍重叠 → 到下一环（规格 §4.4 步骤 6）
      radius = baseRadius + RING_STEP;
      center = polar(angleDeg, radius);
    }
    out.set(item.key, center);
    angleOf.set(item.key, angleDeg);
    placed.push({ x: center.x, y: center.y, w: bbox.w, h: bbox.h });
  };

  // ring 0：无核心问题时第一个根在圆心（规格 §4.4 步骤 2）
  if (!hasCore && roots.length > 0) placeAt(roots[0], 0, 0);

  // BFS：ring ℓ（ℓ≥1）——ring 1 = 其余根 + ring0 根的子节点（均匀分布）；
  // ring ≥2 = 上一环各项的子节点（父角度扇区分布）
  const centerRoot = hasCore ? [] : roots.slice(0, 1);
  let current: CanvasLayoutItem[] = [
    ...roots.slice(centerRoot.length),
    ...(centerRoot[0] ? children.get(centerRoot[0].key) ?? [] : []),
  ];
  let ring = 1;
  while (current.length > 0) {
    const radius = RING_BASE + (ring - 1) * RING_STEP;
    const n = current.length;
    const next: CanvasLayoutItem[] = [];
    current.forEach((item, idx) => {
      let angle: number;
      if (ring === 1) {
        angle = -90 + (360 / n) * idx;
      } else {
        const parentKey = item.parentKey ?? "";
        const parentAngle = angleOf.get(parentKey) ?? -90;
        const siblings = children.get(parentKey) ?? [];
        const spread = SECTOR_SPREAD_DEG / (siblings.length + 1);
        const sibIdx = siblings.findIndex((s) => s.key === item.key);
        angle = parentAngle + (sibIdx - (siblings.length - 1) / 2) * 2 * spread;
      }
      placeAt(item, angle, radius);
      for (const k of children.get(item.key) ?? []) next.push(k);
    });
    current = next;
    ring += 1;
  }

  // 浮动（概念/模型）+ 孤儿：最外环（紧邻最深树环之后；无树时即 ring 1）
  // ——while 结束后 ring = 最深环序号 + 1，正是浮动参照应落的外环序号
  const outerRadius = RING_BASE + (ring - 1) * RING_STEP;
  const floaters_n = Math.max(floaters.length, 1);
  floaters.forEach((it, idx) => placeAt(it, -90 + (360 / floaters_n) * idx, outerRadius));
  orphans.forEach((it, idx) => placeAt(it, (idx * GOLDEN_ANGLE_DEG) % 360, outerRadius));

  return out;
}
