/**
 * @ai-context 设计系统 token 的公共入口（ADR-032）。
 *
 * Why：产物 `tokens.gen.ts` 是生成物，直接 import 会把「生成」这一实现细节
 * 泄漏到 131 个组件里。本门面是组件唯一应 import 的入口，也是将来若要换生成策略时的
 * 唯一改动点（组件不动）。
 *
 * 副作用：无。样式变量的注入需要在 app 入口 import "./ui/tokens.css"（批 4 接线）。
 * 边界：本模块**不含颜色字面量** —— 颜色只在 scripts/gen-tokens.mjs。
 */

export { COLOR_TOKENS, SCALE_TOKENS, THEMES } from "./tokens.gen";
export type { ColorToken, ThemeName } from "./tokens.gen";

/** 组装 CSS 变量名。`cssVar("bg-canvas")` → `"--ed-bg-canvas"` */
export function cssVar(name: string): string {
  return `--ed-${name}`;
}

/** 读取 CSS 变量的引用写法，供内联 style 过渡期使用。`varRef("ink-2")` → `"var(--ed-ink-2)"` */
export function varRef(name: string): string {
  return `var(--ed-${name})`;
}
