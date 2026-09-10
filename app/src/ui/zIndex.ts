/**
 * @ai-context 全站 z-index 六档标尺（ADR-032 决策 5）。
 *
 * Why：现状 32 个文件、45 处硬编码，出现 17 个各不相同的值，且分裂成两个不相交的段
 * （50/51/60/61 与 900/1000/1100/1150）—— 叠放顺序是**涌现的**而不是被设计的。
 * 本模块把叠放变回一个可以讨论、可以 review 的显式决策。
 *
 * 副作用：无（纯数据 + 纯函数）。
 * 边界：组件**不得**再写裸数字 z-index；新增层级必须先在此加档并说明用途。
 * 批次：消费发生在批 4（原语迁移），本批只定义不消费。
 */

export const Z_TIER = {
  /** 吸顶头 / 粘性列头 / 粘性工具栏 */
  raised: 10,
  /** 常驻面板 / AI 对话 dock / 采集浮窗 */
  panel: 100,
  /** 锚定弹层 / 右键菜单 / 颜色板 / 下拉 */
  popover: 200,
  /** Modal + 遮罩（一次只允许一个） */
  modal: 300,
  /** Modal 内再开 Modal（如弹层里选日期） */
  modalNested: 400,
  /** Toast / 全局错误 / 拖拽幽灵 */
  toast: 500,
} as const;

export type ZTierName = keyof typeof Z_TIER;

export const TIER_PURPOSE: Readonly<Record<ZTierName, string>> = {
  raised: "吸顶头 / 粘性列头 / 粘性工具栏",
  panel: "常驻面板 / AI 对话 dock / 采集浮窗",
  popover: "锚定弹层 / 右键菜单 / 颜色板 / 下拉",
  modal: "Modal + 遮罩（一次只允许一个）",
  modalNested: "Modal 内再开 Modal（如弹层里选日期）",
  toast: "Toast / 全局错误 / 拖拽幽灵",
} as const;

/** 取档位数值。用函数而非直接读常量，是为了让 Consumer 侧一眼看出「这里有层级决策」 */
export function zIndex(tier: ZTierName): number {
  return Z_TIER[tier];
}
