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

// 此处**不得**写 `: Readonly<Record<string, IconGeometry>>` 宽注解 —— 那会把键类型抹成 `string`，
// 使 `IconName` 退化为 `string`，批 4 数百处 `<Icon name="…" />` 的拼写错误在编译期静默通过。
// `satisfies` 只校验形状、不改变推导结果，故键仍是字面量且几何仍被类型约束。
export const DOMAIN_ICON_PATHS = {
  /** 课堂：显示器 + 底座（采集源） */
  classroom: {
    elements: [
      { tag: "rect", x: 3, y: 4, w: 18, h: 13, rx: 1.5 },
      { tag: "path", d: "M8 21h8M12 17v4" },
    ],
  },
  /** 会话：堆叠的行（一次捕获 = 一条会话） */
  sessions: {
    elements: [{ tag: "path", d: "M4 6h16M4 12h16M4 18h10" }],
  },
  /** 笔记：文档 + 文字行 */
  notes: {
    elements: [
      { tag: "path", d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" },
      { tag: "path", d: "M14 3v5h5M9 13h6M9 17h4" },
    ],
  },
  /** 行动：勾选框（裁决队列） */
  action: {
    elements: [
      { tag: "rect", x: 3, y: 3, w: 18, h: 18, rx: 1.5 },
      { tag: "path", d: "M8 12.5l2.5 2.5L16 9.5" },
    ],
  },
  /** 复习：循环箭头（间隔重复） */
  review: {
    elements: [
      { tag: "path", d: "M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" },
      { tag: "path", d: "M18 3v4h-4M6 21v-4h4" },
    ],
  },
  /** 体系：树（根 + 两支） */
  knowledge: {
    elements: [
      { tag: "circle", cx: 12, cy: 5, r: 2 },
      { tag: "circle", cx: 6, cy: 19, r: 2 },
      { tag: "circle", cx: 18, cy: 19, r: 2 },
      { tag: "path", d: "M12 7v4M6 17v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" },
    ],
  },
  /** 目标：同心圆靶 */
  goals: {
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 8 },
      { tag: "circle", cx: 12, cy: 12, r: 3 },
    ],
  },
  /** 设置：齿轮（简化为中心圆 + 八向齿） */
  settings: {
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 3 },
      { tag: "path", d: "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" },
    ],
  },
  /** AI：双星（主星 + 副星，暗示「生成」而非「聊天」） */
  ai: {
    elements: [
      { tag: "path", d: "M11 3l1.7 4.6L17.3 9l-4.6 1.7L11 15.3l-1.7-4.6L4.7 9l4.6-1.4z" },
      { tag: "path", d: "M18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2-2.2-.8 2.2-.8z" },
    ],
  },
} satisfies Record<string, IconGeometry>;
