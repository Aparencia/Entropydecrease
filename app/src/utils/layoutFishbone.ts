/**
 * layoutFishbone.ts — 鱼骨图布局纯函数（v0.14.1；简化版——用户确认）。
 *
 * @ai-context: 完整鱼骨因果语义与知识树不匹配（规格 §2.3），本算法只取形态：
 *              主干横线 = 体系根（核心卡在鱼头，或无核心时首根为鱼头）；
 *              一级根上下交替为骨刺（+/-140px），二级及更深沿所在骨刺
 *              方向向外展开（每步 +170/+90），同骨子树按序遍历成一串——
 *              确定性、骨刺间空间互斥（上下符号不同、水平位置按 cnt 足距）。
 * @ai-context: 浮动参照（概念/模型）落在最骨刺之下的布带。
 */
import { placeBand, type CanvasPoint } from "./layoutShared";
import type { RadialLayoutInput } from "./layoutRadial";

/** 骨刺纵向偏移（问题节点 80 高 + 间隙） */
const BONE_DY = 140;
/** 骨刺水平间距（问题节点 220 宽 + 间隙——同侧相邻刺按 cnt 均分推进） */
const BONE_DX = 240;
/** 骨刺延伸步长（沿刺方向） */
const LANE_X = 170;
const LANE_Y = 90;
/** 布带行高 */
const BAND_STEP_Y = 110;
/** 布带距最刺间距 */
const BAND_GAP_Y = 140;

export function layoutFishbone(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const questions = items.filter((i) => i.kind === "question");
  const sorted = [...questions].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const out = new Map<string, CanvasPoint>();
  const known = new Set(questions.map((i) => i.key));

  const children = new Map<string, string[]>();
  const orphanKeys: string[] = [];
  for (const it of sorted) {
    if (it.parentKey == null) continue;
    if (!known.has(it.parentKey)) {
      orphanKeys.push(it.key);
      continue;
    }
    const list = children.get(it.parentKey) ?? [];
    list.push(it.key);
    children.set(it.parentKey, list);
  }
  const roots = sorted.filter((i) => i.parentKey == null).map((i) => i.key);
  const headKey = hasCore || roots.length === 0 ? null : roots[0];
  const bones = (hasCore || roots.length === 0 ? roots : roots.slice(1)).slice();
  orphanKeys.forEach((k) => bones.push(k));

  // 鱼头：核心卡（hasCore）或首根——圆心 (0,0)
  if (headKey != null) out.set(headKey, { x: 0, y: 0 });

  // 骨刺：上下交替；沿刺延伸（DFS 计步——同骨子树串在刺上不重叠）
  bones.forEach((boneKey, idx) => {
    const above = idx % 2 === 0;
    const sign = above ? 1 : -1;
    const bx = BONE_DX + Math.floor(idx / 2) * BONE_DX;
    const by = sign * BONE_DY;
    let counter = 0;
    const walk = (key: string): void => {
      // 节点自身位置 = 骨刺 + 已走步数 × 延伸步长（首节点即骨刺位）
      out.set(key, { x: bx + counter * LANE_X, y: by + sign * counter * LANE_Y });
      counter += 1;
      for (const kid of children.get(key) ?? []) walk(kid);
    };
    walk(boneKey);
  });

  // 浮动参照布带：全部骨刺之下
  const floaters = items.filter((i) => i.kind !== "question");
  const maxY = BONE_DY + BAND_GAP_Y + Math.ceil(bones.length / 2) * LANE_Y;
  const band = placeBand(floaters, (idx) => ({ x: 200 + idx * 40, y: maxY + idx * BAND_STEP_Y }));
  for (const [k, v] of band) out.set(k, v);
  return out;
}
