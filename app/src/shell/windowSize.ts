/**
 * @ai-context 主窗尺寸的**单一真源**（规格 §1 决策 17：默认 1280×800，最小 1024×640）。
 *
 * Why 要有这个 TS 常量：真值在 `app/src-tauri/tauri.conf.json`（JSON，TS 读不到也不该读），
 *   而前端有三处需要同一组数字 —— ① 断点下限（T5 的 1024 档）② 验收测试（T14 量「1024 无溢出」）
 *   ③ 守卫测试（读 JSON 逐字比对，防止有人只改一边）。
 *   没有它，「1024」会在前端再散落成第 8 处魔数 —— 正是本批要消灭的东西。
 *
 * 副作用：无。边界：只描述**主窗**；采集浮窗由 Rust 侧建（360×240，resizable=false），不在本文件表达。
 */
export const WINDOW_SIZE = {
  defaultWidth: 1280,
  defaultHeight: 800,
  minWidth: 1024,
  minHeight: 640,
} as const;

/** 顶栏溢出策略的下限（= 最小窗宽）；规格 §6.1「<1024 由最小窗兜底」 */
export const NAV_MIN_WIDTH = WINDOW_SIZE.minWidth;
