/**
 * @ai-context shift.ts — **位移的唯一出口**（批 6 T9；规格 §8.4（:518）末句「位移上限 8px」）。
 *
 * Why 单独成件：§8.4 的 8px 是**硬上限**，而批 6 的编排层（对齐 / 显影 / 相变 / 回跳 / 浮现…）逐个都要写位移
 * 参数 —— 各写各的必然在 6 个签名动效之间逐处漂移。`ui/primitives/motion.css` 亦逐字要求「批 6 的 GSAP
 * 时间线同样不得越过该上限」。⇒ 位移量**只**从本模块取，由 `app/src/motion/shift.guard.test.ts` 的机器判据
 * 守两半：① 全仓 `app/src/**` **生产文件**的 `translate*()` 数值实参 ≤ 8px；② `motion/**` 的位移常量 ≤ 8px。
 *
 * 副作用：无（纯常量 + 纯函数，不碰 DOM / 存储 / IPC）。
 * 边界：
 *   ① 它是**上界**不是目标值 —— 编排层的「远」靠**时长与错开**表达，不靠位移；
 *   ② `clampShift` 是**运行时安全网**，**挡不住**绕过本模块直接 `gsap.to(el, { y: 40 })` 的写法 ——
 *      那条路径只由属性集合审计（`ANIMATABLE_PROPERTIES`，R8.4）与评审间接约束，**本模块不声称封死**；
 *   ③ **布局量不在判据域**（R11.4）：`margin` / `left` / `top` 这类 >8px 实测一大片（T9 探针：5 处 px
 *      字面量 + 大量行内 `marginTop: 60` 风格值），**全是布局量** ⇒ 判它们会造假阳性；
 *      「动画不得动布局属性」由 `ANIMATABLE_PROPERTIES` 单独覆盖；
 *   ④ `%` 形态（居中 `translate(-50%, -50%)`、扫光 `translateX(±100%)`）**有意不判** —— 它们是居中与扫光，
 *      不是位移量（既有口径逐字保留）。
 */
export const SHIFT_MAX_PX = 8;

/**
 * 把任意位移量夹进 §8.4 的 ±8px（**运行时**安全网，不是许可证）。
 * `NaN` ⇒ **抛**：`NaN` 不是一个位移量，静默归零会把「上游解析失败」伪装成「合法的不动」
 * （AGENTS.md §4 明禁忽略错误）。`±Infinity` 是合法的「很大」，照常夹到 ±8。
 */
export function clampShift(px: number): number {
  if (Number.isNaN(px)) throw new Error("clampShift: 位移量是 NaN（上游解析失败，不许静默归零）");
  return Math.max(-SHIFT_MAX_PX, Math.min(px, SHIFT_MAX_PX));
}

/** 唯一允许被动画化的属性白名单（R8.4 的代理判据常量；**逐序**冻结为 R8.4 的逐字序，layout 属性一律不在内）。 */
export const ANIMATABLE_PROPERTIES: readonly string[] = [
  "transform",
  "translate",
  "rotate",
  "scale",
  "opacity",
  "filter",
];

/** 位移**绝不许**动的布局属性（R11.4：它们不在 8px 判据域内，而是被属性集合审计**整体**排除）。 */
export const SHIFT_BANNED_PROPERTIES: readonly string[] = [
  "margin",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "padding",
];
