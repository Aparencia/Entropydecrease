/**
 * layoutOrg.ts — 垂直组织树布局纯函数（v0.14.1；XMind「组织结构图」）。
 *
 * @ai-context: 根在最上（无核心：首根在顶端），子节点向下逐层展开、水平分叉——
 *              纯层级浏览用（规格 §2.3）；深树需缩放/滚动，本算法只保证
 *              确定性紧凑（回退=用户拖拽，布局不是唯一呈现）。
 * @ai-context: 浮动参照（概念/模型）落在树右侧布带（高于全部树节点的 x 之外）。
 */
import { layoutForest, placeBand, type CanvasPoint } from "./layoutShared";
import type { RadialLayoutInput } from "./layoutRadial";

/** 深度步长（主轴 y；问题节点 80 高 + 间隙） */
const DEPTH_STEP_Y = 200;
/** 槽步长（副轴 x；叶级 220 宽 + 内部父居中跨度——320 保证相邻层不叠） */
const SLOT_STEP_X = 320;
/** 布带列宽（浮动参照；180 宽 + 间隙） */
const BAND_STEP_X = 220;
/** 布带距树右间距 */
const BAND_GAP_X = 160;

export function layoutOrg(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const questions = items.filter((i) => i.kind === "question");

  const { positions, usedSlots } = layoutForest({
    items: questions,
    centerRootIncluded: !hasCore,
    pos: (depth: number, slot: number): CanvasPoint => ({ x: slot * SLOT_STEP_X, y: depth * DEPTH_STEP_Y }),
    nudgeAxis: "x",
    nudgeStep: SLOT_STEP_X,
    nudgeTries: 8,
  });

  // 浮动参照布带：树右侧（maxX = 已用槽数 × 槽步长；布带内 y 展开）
  const floaters = items.filter((i) => i.kind !== "question");
  const maxX = usedSlots * SLOT_STEP_X + BAND_GAP_X;
  const band = placeBand(floaters, (idx) => ({ x: maxX + idx * BAND_STEP_X, y: 100 + idx * 40 }));

  const out = new Map(positions);
  for (const [k, v] of band) out.set(k, v);
  return out;
}
