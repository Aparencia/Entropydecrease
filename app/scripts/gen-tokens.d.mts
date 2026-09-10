/**
 * @ai-context `scripts/gen-tokens.mjs` 的类型声明 —— 让 `tsc` 能检查它的 import 方。
 *
 * Why：生成器是 `.mjs`（**纯 node 必须能跑**，故不能是 `.ts`），而 `tsc` 默认对 `.mjs` 报 TS7016
 * （「implicitly has an 'any' type」）—— 该错误会随 `npm run build`（`tsc && vite build`）使构建失败。
 * `src/ui/tokens.drift.test.ts` 需要 `renderAll()` 与 `CONTRAST_BASELINE` 来守住产物。
 *
 * 纪律：本文件是**类型契约**，不含运行时值 —— 声明与生成器实现不可能在运行时分叉。
 * 边界：新增/删除生成器的导出时必须同步本文件（名字对不上会直接编译失败，不会静默漂移）。
 * `SCALE_SOURCE` / `COLOR_TOKENS` 在此为**源数据**（字面量较宽，`typeScale` 是 `string[]`）；
 * 产物 `tokens.gen.ts` 的 `SCALE_TOKENS` 才是 `as const` 后的窄化类型 —— 两者刻意不同。
 */

export interface ColorToken {
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly usage: string;
}

export interface ContrastBaseline {
  readonly canvas: string;
  readonly surface: string;
}

export declare const CONTRAST_BASELINE: {
  readonly light: ContrastBaseline;
  readonly dark: ContrastBaseline;
};

/** 颜色 token 源数据；`name` 不含 `--ed-` 前缀 */
export declare const COLOR_TOKENS: readonly ColorToken[];

/** 非颜色 token 源数据（字阶/间距/圆角/图标） */
export declare const SCALE_SOURCE: {
  readonly fontFamilyBody: string;
  readonly fontFamilyUi: string;
  readonly fontFamilyMono: string;
  readonly typeScale: readonly string[];
  readonly spaceScale: readonly number[];
  readonly radiusScale: readonly { readonly name: string; readonly px: number }[];
  readonly overlayAlpha: number;
  readonly iconGrid: number;
  readonly iconStroke: number;
  readonly iconSizes: readonly number[];
};

/** 纯渲染：返回两份产物的完整文本，不触磁盘 */
export declare function renderAll(): { css: string; ts: string };
