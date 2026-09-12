/**
 * @ai-context `scripts/gen-tokens.mjs` 的类型声明 —— 让 `tsc` 能检查它的 import 方。
 *
 * Why：生成器是 `.mjs`（**纯 node 必须能跑**，故不能是 `.ts`），而 `tsc` 默认对 `.mjs` 报 TS7016
 * （「implicitly has an 'any' type」）—— 该错误会随 `npm run build`（`tsc && vite build`）使构建失败。
 * `src/ui/tokens.drift.test.ts` 需要 `renderAll()` / `CONTRAST_BASELINE` / `normalizeEol()` 来守住产物；
 * `src/ui/primitives/style-seams.test.ts`（批 6 T5 起）还需要 `DURATION_TOKENS` / `EASING_TOKENS`。
 *
 * 纪律：本文件是**类型契约**，不含运行时值 —— 声明与生成器实现不可能在运行时分叉。
 *
 * ⚠️ 已知维护成本（**本文件与 `.mjs` 的一致性没有任何机制强制**）：本文件是**手写类型镜像**，
 * 并非从实现推导。TypeScript **信任环境声明** —— 它只读本文件，从不校验 `.mjs` 的实际导出：
 *   · 改了某导出的**类型**（如把 `spaceScale` 从 `readonly number[]` 改成别的）：`tsc` **不报错**，
 *     声明文件才是权威 → 漂移**是静默的**。（已实测：把本文件 `spaceScale` 声明成 `readonly string[]`
 *     而 `.mjs` 实为数字数组，`npx tsc --noEmit` 仍 exit 0。）
 *   · 生成器**新增**导出而未在此声明：import 方会报「模块无此导出」（假缺失），`tsc` 同样不会
 *     拿 `.mjs` 来纠正。
 * 结论：**改动生成器的导出或类型（增 / 删 / 改签名）时必须手工同步本文件** —— 没有编译器兜底。
 * 后续可考虑引入 `@types/node` 并把生成器收敛到单一语言源以消掉这层手写镜像；那属于另一个任务，
 * 本任务因「不新增依赖 + 生成器须纯 node 可跑」而保留现状。
 *
 * 边界：`SCALE_SOURCE` / `COLOR_TOKENS` 在此为**源数据**（字面量较宽：`typeScale` 是 `string[]`，
 * `COLOR_TOKENS` 元素的 `name` 只是 `string`）；产物 `tokens.gen.ts` 里 `SCALE_TOKENS` 与
 * `COLOR_TOKENS` 才是 `as const` 后的窄化类型（后者用 `as const satisfies readonly ColorToken[]`
 * 保住 16 个字面量名，并据此导出 `ColorTokenName` 供门面 `cssVar` / `varRef` 收窄入参）。
 * 本文件声明的是**生成器的导出**，产物自身的类型由 `renderTs()` 的模板给出 —— 两者刻意不同。
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

/** 动效时长源数据（规格 §8.4）；`name` 不含 `--ed-dur-` 前缀，`ms` 为纯数字 */
export interface DurationToken {
  readonly name: string;
  readonly ms: number;
  readonly usage: string;
}

/** 缓动源数据（规格 §8.4）；`name` 不含 `--ed-` 前缀 */
export interface EasingToken {
  readonly name: string;
  readonly value: string;
  readonly usage: string;
}

/** 批 6 T5 起：动效时长真源（9 条）—— 迁移自 primitives/motion.css 的临时接缝 */
export declare const DURATION_TOKENS: readonly DurationToken[];

/** 批 6 T5 起：缓动真源（今日 1 条；T8 追加双基调两条） */
export declare const EASING_TOKENS: readonly EasingToken[];

/* 注：合并名册 `MOTION_TOKENS` 只存在于**产物** `src/ui/tokens.gen.ts`（由 `renderTs()` 生成），
   生成器本身不导出它 —— 故此处**不得**声明，否则 import 方在编译期可通过、运行期取到 undefined。 */

/** 纯渲染：返回两份产物的完整文本，不触磁盘 */
export declare function renderAll(): { css: string; ts: string };

/** 行尾归一：`\r\n` / 孤立 `\r` → `\n`。`--check` 与漂移测试 import 的是同一个函数（唯一实现） */
export declare function normalizeEol(s: string): string;
