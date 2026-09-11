/**
 * @ai-context **域图标**几何（9 个）：课堂 / 会话 / 笔记 / 行动 / 复习 / 体系 / 目标 / 设置 / AI。
 *
 * Why：这 9 个是顶层导航与域内标题的固定语汇，必须成套、风格一致（24 网格、1.75 描边、小圆角）。
 * 它们几乎全部**没有现成的开源对应物**（「会话」「体系」「复习」在本应用里是特定语义），
 * 这正是 ADR-032 决策 6 选择自绘的原因。
 *
 * 副作用：无（纯数据）。
 * 边界：坐标一律落在 24 网格内；不写颜色；`d` 不得含换行。
 * 坐标系：viewBox `0 0 24 24`，原点左上，描边居中于路径。
 */

import type { IconGeometry } from "./types";

export const DOMAIN_ICON_PATHS: Readonly<Record<string, IconGeometry>> = {
  /** 笔记：文档 + 文字行 */
  notes: {
    elements: [
      { tag: "path", d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" },
      { tag: "path", d: "M14 3v5h5M9 13h6M9 17h4" },
    ],
  },
};
