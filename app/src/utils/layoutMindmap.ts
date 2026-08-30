/**
 * layoutMindmap.ts — 双翼思维导图布局纯函数（v0.14.1；XMind 默认心智）。
 *
 * @ai-context: 核心问题/体系名卡在中心（无核心：首根在中心）；根节点按
 *              key 排序左右交替分翼（右翼 x 正、左翼 x 负），翼内子树沿翼
 *              向外展开、上下分叉——浅/中树最平衡的呈现（规格 §2.3）。
 * @ai-context: 复用 layoutForest 引擎（每翼一次——两翼空间互斥 x 符号不同，
 *              槽位各自从 0 起无跨翼冲突）；圆心根的子节点接续入翼展开
 *              （不孤立在圆心——与辐射布局 ring1 语义对齐）。
 */
import { layoutForest, placeBand, type CanvasPoint } from "./layoutShared";
import type { CanvasLayoutItem, RadialLayoutInput } from "./layoutRadial";

/** 深度步长（主轴；问题节点 220 宽 + 60 间隙） */
const DEPTH_STEP_X = 280;
/** 槽步长（副轴 y；叶级 80 高 + 内部父居中跨度——180 保证相邻层不叠） */
const SLOT_STEP_Y = 180;
/** 布带行高 */
const BAND_STEP_Y = 110;
/** 布带距树底间距 */
const BAND_GAP_Y = 120;

export function layoutMindmap(input: RadialLayoutInput): Map<string, CanvasPoint> {
  const { hasCore, items } = input;
  const questions = items.filter((i) => i.kind === "question");
  const byKeySort = (a: CanvasLayoutItem, b: CanvasLayoutItem): number =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

  // 子节点索引（仅 question；父缺失 → 孤儿，并入翼不落单）
  const childMap = new Map<string, CanvasLayoutItem[]>();
  const known = new Set(questions.map((i) => i.key));
  const orphans: CanvasLayoutItem[] = [];
  for (const it of questions) {
    if (it.parentKey == null) continue;
    if (!known.has(it.parentKey)) {
      orphans.push(it);
      continue;
    }
    const list = childMap.get(it.parentKey) ?? [];
    list.push(it);
    childMap.set(it.parentKey, list);
  }
  const roots = questions.filter((i) => i.parentKey == null).sort(byKeySort);

  const out = new Map<string, CanvasPoint>();

  // 圆心：core 卡（hasCore）或首根（无核心）——圆心坐标恒 (0,0)
  const centerRoot = !hasCore && roots.length > 0 ? roots[0] : null;
  if (centerRoot) out.set(centerRoot.key, { x: 0, y: 0 });

  // 翼根队列：非圆心根（交替分翼）+ 圆心根的子节点（接续入翼）+ 孤儿（右翼）
  const wingSeeds: { item: CanvasLayoutItem; right: boolean }[] = [
    ...(!hasCore && roots.length > 0 ? roots.slice(1) : roots).map((r, idx) => ({ item: r, right: idx % 2 === 0 })),
    ...(centerRoot ? (childMap.get(centerRoot.key) ?? []).map((r, idx) => ({ item: r, right: idx % 2 === 0 })) : []),
    ...orphans.map((r) => ({ item: r, right: true })),
  ];
  const rightWing: CanvasLayoutItem[] = [];
  const leftWing: CanvasLayoutItem[] = [];
  for (const s of wingSeeds) {
    // 翼成员 = 翼根 + 全部子孙（子树闭包——森林只排传入项）
    const members: CanvasLayoutItem[] = [s.item];
    const walk = (r: CanvasLayoutItem): void => {
      for (const c of childMap.get(r.key) ?? []) {
        members.push(c);
        walk(c);
      }
    };
    walk(s.item);
    if (s.right) rightWing.push(...members);
    else leftWing.push(...members);
  }

  const runWing = (wing: CanvasLayoutItem[], mirrorX: boolean): number => {
    if (wing.length === 0) return 0;
    const { positions, usedSlots } = layoutForest({
      // 翼根从 depth 1 起（depth 0 = 虚拟中心，不占坐标）
      items: wing,
      centerRootIncluded: false,
      pos: (depth: number, slot: number): CanvasPoint => ({
        x: (mirrorX ? -1 : 1) * depth * DEPTH_STEP_X,
        y: slot * SLOT_STEP_Y,
      }),
      nudgeAxis: "y",
      nudgeStep: SLOT_STEP_Y,
      nudgeTries: 8,
    });
    for (const [k, v] of positions) out.set(k, v);
    return usedSlots;
  };
  const rightSlots = runWing(rightWing, false);
  const leftSlots = runWing(leftWing, true);

  // 浮动参照布带：两翼之下（低于全部节点）
  const floaters = items.filter((i) => i.kind !== "question");
  const maxY = Math.max(rightSlots, leftSlots) * SLOT_STEP_Y + BAND_GAP_Y;
  const band = placeBand(floaters, (idx) => ({ x: 200 + idx * 40, y: maxY + idx * BAND_STEP_Y }));
  for (const [k, v] of band) out.set(k, v);
  return out;
}
