/**
 * @ai-context 图标层的公共导出面（ADR-032 决策 6）。
 *
 * Why：批 4 之后全站图标都从这里 import。收敛导出面使「换实现」只需改这一个文件，
 * 也让「谁在用图标层」可被一次 grep 找到。
 *
 * 副作用：无。
 * 边界：本模块**不导出**分组数据文件（`paths.domain` / `paths.action`）—— 那是内部结构，
 * 直接 import 会绕过重名校验。
 */

export { Icon } from "./Icon";
export { ICON_PATHS, ICON_NAMES } from "./paths";
// `IconName` 从 `./paths` 再导出而非 `./types`：它在 `paths.ts` 里由注册表键**派生**，
// `types.ts` 只是消费它的下游（`IconProps.name`）。从 `./types` 再导出会得到 TS2459
// （该模块只 import 未 export，`isolatedModules` 下不成立）。
export type { IconName } from "./paths";
export { ICON_ELEMENT_TAGS } from "./types";
export type { IconElement, IconElementTag, IconGeometry, IconProps, IconSize } from "./types";
