/**
 * layoutTreeRight.ts — 水平逻辑树布局纯函数（v0.14.1；XMind「逻辑图（向右）」）。
 *
 * @ai-context: 根在最左（无核心：首根在圆心），子节点向右单向展开、上下分叉——
 *              读图路径最顺、深树最不易乱（规格 §2.3 选型）；密集树节点的
 *              确定性紧凑算法（layoutForest DFS）：父节点居中于子区间。
 * @ai-context: 浮动参照（概念/模型）落在树底布带（低于全部树节点）——确定性、
 *              不遮挡；孤儿并入森林根部（父缺失不落单）。
 */
import { layoutForest, placeBand, type CanvasPoint } from "./layoutShared";
import type { RadialLayoutInput } from "./layoutRadial";

/** 深度步长（主轴 x；问题节点 220 宽 + 60 间隙） */
const DEPTH_STEP_X = 280;
/** 槽步长（副轴 y；叶级 80 高 + 内部父居中跨度——180 保证相邻层不叠） */
const SLOT_STEP_Y = 180;
/** 布带行高（浮动参照；70 高 + 间隙） */
const BAND_STEP_Y = 110;
/** 布带距树底间距 */
const BAND_GAP_Y = 120;

export function layoutTreeRight(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const questions = items.filter((i) => i.kind === "question");

  const { positions, usedSlots } = layoutForest({
    items: questions,
    centerRootIncluded: !hasCore,
    pos: (depth: number, slot: number): CanvasPoint => ({ x: depth * DEPTH_STEP_X, y: slot * SLOT_STEP_Y }),
    nudgeAxis: "y",
    nudgeStep: SLOT_STEP_Y,
    nudgeTries: 8,
  });

  // 浮动参照布带：树底之下（maxY = 已用槽数 × 槽步长；布带内 x 展开）
  const floaters = items.filter((i) => i.kind !== "question");
  const maxY = usedSlots * SLOT_STEP_Y + BAND_GAP_Y;
  const band = placeBand(floaters, (idx) => ({ x: 200 + idx * 40, y: maxY + idx * BAND_STEP_Y }));

  return merge(positions, band);
}

function merge(a: Map<string, CanvasPoint>, b: Map<string, CanvasPoint>): Map<string, CanvasPoint> {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, v);
  return out;
}
