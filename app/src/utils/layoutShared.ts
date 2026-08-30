/**
 * layoutShared.ts — 画布布局公共件（v0.14.1 自 layoutRadial 迁出）。
 *
 * @ai-context: 6 个布局算法共用：节点包围盒、极坐标、碰撞检测与确定性外推。
 *              全部纯函数零副作用零随机（相同输入恒相同输出——单测可精确断言）。
 *              layoutRadial 行为零变化：仅改为 import 本模块并 re-export
 *              （既有消费者 import 路径不变）。
 */

/** 画布坐标点（圆心口径；所有布局算法输出口径） */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** 画布节点类别：问题（树）/ 概念 / 模型（浮动参照） */
export type CanvasKind = "question" | "concept" | "model";

/** 画布布局输入项（key = `q:1`/`c:2`/`m:3`——三表 id 空间独立，必须带类型前缀） */
export interface CanvasLayoutItem {
  /** 画布节点唯一键（与 React Flow node.id 同源） */
  key: string;
  kind: CanvasKind;
  /** 问题树父子关系（concept/model 恒 null——浮动参照） */
  parentKey: string | null;
}

/** 画布节点包围盒（规格 §4.4：问题 220x80、概念/模型 180x70） */
export const CANVAS_BBOX: Record<CanvasKind, { w: number; h: number }> = {
  question: { w: 220, h: 80 },
  concept: { w: 180, h: 70 },
  model: { w: 180, h: 70 },
};

/** 已放置包围盒（碰撞检测输入） */
export interface PlacedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 中心点 + bbox 是否与任一已放置节点重叠（布局各算法共用碰撞检测） */
export function overlapsAny(
  center: CanvasPoint,
  bbox: { w: number; h: number },
  placed: PlacedBox[],
): boolean {
  return placed.some(
    (p) => Math.abs(center.x - p.x) < (bbox.w + p.w) / 2 && Math.abs(center.y - p.y) < (bbox.h + p.h) / 2,
  );
}

/** 角度（度）→ 圆上点（半径 radius） */
export function polar(angleDeg: number, radius: number): CanvasPoint {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

/** 关键字排序（确定性——输入顺序不影响布局结果） */
export function byKey(a: CanvasLayoutItem, b: CanvasLayoutItem): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** 碰撞外推（确定性沿 axis 方向步进，最多 maxTries 次；仍重叠按原位返回） */
export function nudgeOut(
  center: CanvasPoint,
  bbox: { w: number; h: number },
  placed: PlacedBox[],
  axis: "x" | "y",
  step: number,
  maxTries: number,
): CanvasPoint {
  let out = { ...center };
  for (let i = 0; i < maxTries && overlapsAny(out, bbox, placed); i += 1) {
    out = axis === "x" ? { x: out.x + step, y: out.y } : { x: out.x, y: out.y + step };
  }
  return out;
}

/** 放置并登记包围盒（各布局共用落点记录） */
export function placeAndRecord(
  out: Map<string, CanvasPoint>,
  placed: PlacedBox[],
  key: string,
  kind: CanvasKind,
  center: CanvasPoint,
): void {
  out.set(key, center);
  const bbox = CANVAS_BBOX[kind];
  placed.push({ x: center.x, y: center.y, w: bbox.w, h: bbox.h });
}

/** 有序树布局引擎配置 */
export interface ForestOptions {
  /** 参与树的画布项（仅 question kind——浮动参照走布带） */
  items: CanvasLayoutItem[];
  /** true=roots[0] 占圆心（depth 0）；false=全部根从 depth 1 开始（圆心被核心卡占据） */
  centerRootIncluded: boolean;
  /** 位置函数（depth / slot → 圆心；算法自定义轴向、镜像与步长） */
  pos: (depth: number, slot: number) => CanvasPoint;
  /** 碰撞外推轴（树布局沿副轴外推——主轴深度单调不受影响） */
  nudgeAxis: "x" | "y";
  nudgeStep: number;
  nudgeTries: number;
}

/** 有序树布局引擎（DFS 紧凑——父节点居中于其子节点区间；确定性零随机）。
 *
 * @ai-context: slot 为叶级序数（每叶占 1 slot，内部节点取子区间中心，可小数）；
 *              slot 步长由调用方 pos 决定（副轴间距需 ≥ 节点尺寸防叠——见各算法常量）。
 *              未知父的孤儿并入森林根部（depth 1）——不落单不丢失。返回
 *              { positions, usedSlots }：usedSlots 供浮动参照布带定位。
 */
export function layoutForest(opts: ForestOptions): { positions: Map<string, CanvasPoint>; usedSlots: number } {
  const { items, centerRootIncluded, pos, nudgeAxis, nudgeStep, nudgeTries } = opts;
  const positions = new Map<string, CanvasPoint>();
  const placed: PlacedBox[] = [];

  const children = new Map<string, CanvasLayoutItem[]>();
  const known = new Set(items.map((i) => i.key));
  const orphans: CanvasLayoutItem[] = [];
  for (const it of items) {
    if (it.parentKey == null) continue;
    if (!known.has(it.parentKey)) {
      orphans.push(it);
      continue;
    }
    const list = children.get(it.parentKey) ?? [];
    list.push(it);
    children.set(it.parentKey, list);
  }
  const roots = items.filter((i) => i.parentKey == null).sort(byKey);
  // 孤儿并入森林（depth 1——父缺失不落单，位置仍确定）
  const extraRoots = orphans.sort(byKey);
  const centerRoot = centerRootIncluded ? roots.slice(0, 1) : [];

  const place = (item: CanvasLayoutItem, depth: number, slot: number): void => {
    const bbox = CANVAS_BBOX[item.kind];
    const target = pos(depth, slot);
    const center = nudgeOut(target, bbox, placed, nudgeAxis, nudgeStep, nudgeTries);
    placeAndRecord(positions, placed, item.key, item.kind, center);
  };

  const arrange = (item: CanvasLayoutItem, depth: number, slotStart: number): number => {
    const kids = children.get(item.key) ?? [];
    if (kids.length === 0) {
      place(item, depth, slotStart);
      return 1;
    }
    let slot = slotStart;
    const childCenters: number[] = [];
    for (const k of kids) {
      const consumed = arrange(k, depth + 1, slot);
      childCenters.push(slot + (consumed - 1) / 2);
      slot += consumed;
    }
    place(item, depth, (childCenters[0] + childCenters[childCenters.length - 1]) / 2);
    return slot - slotStart;
  };

  for (const r of centerRoot) {
    place(r, 0, 0);
    let slot = 0;
    for (const k of children.get(r.key) ?? []) {
      slot += arrange(k, 1, slot);
    }
    const rest = roots.slice(1);
    for (const k of rest) slot += arrange(k, 1, slot);
    for (const k of extraRoots) slot += arrange(k, 1, slot);
    return { positions, usedSlots: slot };
  }
  let slot = 0;
  for (const k of [...roots, ...extraRoots]) slot += arrange(k, 1, slot);
  return { positions, usedSlots: slot };
}

/** 浮动参照布带（concept/model——放在树外沿，按 idx 顺序展开；确定性） */
export function placeBand(
  items: CanvasLayoutItem[],
  bandPos: (idx: number) => CanvasPoint,
): Map<string, CanvasPoint> {
  const out = new Map<string, CanvasPoint>();
  const placed: PlacedBox[] = [];
  const sorted = [...items].sort(byKey);
  sorted.forEach((it, idx) => {
    const bbox = CANVAS_BBOX[it.kind];
    let center = bandPos(idx);
    // 布带内也走碰撞外推（跨带重叠防御——不同算法带位置可能邻近）
    center = nudgeOut(center, bbox, placed, "x", 200, 8);
    placed.push({ x: center.x, y: center.y, w: bbox.w, h: bbox.h });
    out.set(it.key, center);
  });
  return out;
}
