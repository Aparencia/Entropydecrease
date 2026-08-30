/**
 * layoutCanvas.ts — 画布布局分发器（v0.14.1；按 layoutAlgorithm 分派）。
 *
 * @ai-context: 纯函数——输入 items + hasCore + 算法名，输出 key → 圆心坐标。
 *              未知算法名回退辐射布局（前端枚举与 Rust 白名单同口径——防御
 *              旧数据/损坏值不炸渲染）。返回值口径与 layoutRadial 一致：
 *              **圆心坐标**（React Flow 左上角转换由视图层完成）。
 */
import { layoutRadial, type RadialLayoutInput } from "./layoutRadial";
import { layoutMindmap } from "./layoutMindmap";
import { layoutTreeRight } from "./layoutTreeRight";
import { layoutOrg } from "./layoutOrg";
import { layoutFishbone } from "./layoutFishbone";
import { layoutDualRing } from "./layoutDualRing";
import type { CanvasPoint } from "./layoutShared";
import type { LayoutAlgorithm } from "../types/knowledge";

export const LAYOUT_ALGORITHMS: LayoutAlgorithm[] = [
  "radial", "mindmap", "treeRight", "org", "fishbone", "dualRing",
];

/** 分发器：未知算法名回退辐射（缺省与迁移 DEFAULT 一致） */
export function layoutCanvas(
  input: RadialLayoutInput,
  algorithm: LayoutAlgorithm,
): Map<string, CanvasPoint> {
  switch (algorithm) {
    case "mindmap": return layoutMindmap(input);
    case "treeRight": return layoutTreeRight(input);
    case "org": return layoutOrg(input);
    case "fishbone": return layoutFishbone(input);
    case "dualRing": return layoutDualRing(input);
    default: return layoutRadial(input);
  }
}
