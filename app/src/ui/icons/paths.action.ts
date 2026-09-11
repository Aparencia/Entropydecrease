/**
 * @ai-context **对象与动作图标**几何（15 个）：搜索 / 新建 / 删除 / 关闭 / 更多 / 箭头 / 勾选 /
 * 时间码 / 画面 / 播放 / 暂停 / 停止 / 刷新 / 外链。
 *
 * Why：这些是全站按钮与状态的高频语汇，也是 emoji 原本覆盖最多的部分（🔍 ＋ 🗑 ✕ ⋯ ⏱ 🖼 ▶ ⏸ ⏹）。
 * 它们必须可被 `currentColor` 着色，才能表达「选中 / 禁用 / 危险」—— emoji 做不到，
 * 而「危险」在本设计里专属于印章红（`--ed-stamp`）。
 *
 * 副作用：无（纯数据）。
 * 边界：坐标一律落在 24 网格内；不写颜色；`d` 不得含换行。
 */

import type { IconGeometry } from "./types";

// 此处**不得**写 `: Readonly<Record<string, IconGeometry>>` 宽注解 —— 那会把键类型抹成 `string`，
// 联合里混入 `string` 会让整条 `IconName` 塌回 `string`（`paths.test.ts` 的类型层反向断言会拦下）。
// `satisfies` 只校验形状、不改变推导结果，故键仍是字面量且几何仍被类型约束。
export const ACTION_ICON_PATHS = {
  /** 搜索：放大镜 */
  search: {
    elements: [
      { tag: "circle", cx: 11, cy: 11, r: 7 },
      { tag: "path", d: "M20 20l-3.5-3.5" },
    ],
  },
  /** 新建：加号 */
  plus: { elements: [{ tag: "path", d: "M12 5v14M5 12h14" }] },
  /** 删除：垃圾桶（配印章红使用） */
  trash: { elements: [{ tag: "path", d: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" }] },
  /** 关闭：叉 */
  close: { elements: [{ tag: "path", d: "M6 6l12 12M18 6L6 18" }] },
  /** 更多：横排三点 */
  "more-horizontal": {
    elements: [
      { tag: "circle", cx: 5, cy: 12, r: 1 },
      { tag: "circle", cx: 12, cy: 12, r: 1 },
      { tag: "circle", cx: 19, cy: 12, r: 1 },
    ],
  },
  /** 展开：右向折角 */
  "chevron-right": { elements: [{ tag: "path", d: "M9 6l6 6-6 6" }] },
  /** 折叠：下向折角 */
  "chevron-down": { elements: [{ tag: "path", d: "M6 9l6 6 6-6" }] },
  /** 勾选：对号（不带框，与 action 的带框勾选区分） */
  check: { elements: [{ tag: "path", d: "M5 13l4 4L19 7" }] },
  /** 时间码：时钟（配合 tabular-nums 的等宽时间戳） */
  clock: {
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 8 },
      { tag: "path", d: "M12 8v4l3 2" },
    ],
  },
  /** 画面：图像框（来源画面的标记） */
  image: {
    elements: [
      { tag: "rect", x: 3, y: 4, w: 18, h: 16, rx: 1.5 },
      { tag: "circle", cx: 9, cy: 10, r: 2 },
      { tag: "path", d: "M3 17l5-4 4 3 3-3 6 5" },
    ],
  },
  /** 播放：右向三角（复习/回听） */
  play: { elements: [{ tag: "path", d: "M8 5l11 7-11 7z" }] },
  /** 暂停：双竖线（采集态） */
  pause: { elements: [{ tag: "path", d: "M9 5v14M15 5v14" }] },
  /** 停止：方块（采集态） */
  stop: { elements: [{ tag: "rect", x: 6, y: 6, w: 12, h: 12, rx: 1.5 }] },
  /** 刷新：重跑（重新分析 / 重新索引） */
  refresh: {
    elements: [
      { tag: "path", d: "M21 12a9 9 0 1 1-2.6-6.4" },
      { tag: "path", d: "M21 4v5h-5" },
    ],
  },
  /** 外链：迁出到外部系统 */
  "external-link": {
    elements: [
      { tag: "path", d: "M14 4h6v6" },
      { tag: "path", d: "M20 4l-8 8" },
      { tag: "path", d: "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" },
    ],
  },
} satisfies Record<string, IconGeometry>;
