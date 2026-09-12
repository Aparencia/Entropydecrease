/**
 * env.ts —— **环境层**（规格 §8.1「2–6s 循环｜应用在呼吸」）的幅度真源与落点登记表（批 6 T13）。
 *
 * @ai-context 业务背景：四层纲领里，环境层是「闲置时也要有生命感」的载体（用户 2026-09-11 二次确认逐字
 *   「交互时最重要，**但闲置时也要有生命感（环境层别退太多）**」），四件逐字 = **探针摆动 · 采集脉冲 ·
 *   未确认段落墨度极缓慢起伏（幅度 2%）· 到期刻度微光**。引擎分界按 §8.2：循环环境动效一律走
 *   **CSS keyframes**（不占 JS 主线程，reduced-motion 一条媒体查询即静态）⇒ 本模块**不产生运动**、
 *   不 import GSAP、不碰 DOM，只提供两样判据侧的事实：
 *   ① **幅度真源**：`LOW_CONFIDENCE_INK_AMPLITUDE`（规格 §8.1 逐字 2%）。CSS 侧只写 keyframes 的**两端
 *      极值**（`1` 与 `0.98`），**不写** `0.02` —— 两处各写一个 0.02 就是第二个真源（R1.1）；对拍由
 *      `env.test.ts` 的 V4 负责（幅度只许有一个落点）。
 *   ② **落点登记表**：keyframes 名 ↔ 落点选择器（逐序数组，供守卫比对）。落点一律取
 *      `<既有基类>--<修饰>` 形状 —— `ui/primitives/motion-coverage.test.ts:113-124` 的选择器域只放行
 *      「修饰类 `--` / BEM 子元素 `__` / 既有基类」三种名字，新起一个 `.ed-*` 基类名会当场撞上那条既有守卫。
 *
 * 副作用：无 —— 纯数据常量，零 I/O、零 DOM、零 GSAP（可被首屏静态引用，不进 `vendor-gsap` 懒 chunk）。
 * 边界：① 只登记四件里的**三件新落点**；第 ① 件「探针摆动」复用 `Loading.css` 的既有 `.ed-probe` +
 *   `ed-probe-swing`（G5：`Loading.css` 本批零改动）⇒ 不进本表；
 *   ② **时长不在这里**：唯一真源 = `app/scripts/gen-tokens.mjs`。本层三条循环的周期从 `--ed-dur-skeleton`
 *   （1200ms）以 `calc()` 倍数派生（故无新时长字面量）；唯二例外是 `Loading.css:71` 那个未 token 化的
 *   `2.4s`，已逐字登记在 `docs/standards/motion.md`；
 *   ③ 档位节拍（eco 停 / rich 只提高频率）与 reduced-motion 名单都落在 `ui/primitives/motion.css`；
 *   ④ 三条落点今天都**没有生产调用点**（LIVE 仪表 / 到期刻度 / 低置信段正文分别由波 B 的 T18、T21 与
 *   T25/T28 接线）⇒ 本模块登记的是 **seam**，不得被读成「环境层已交付」（R11.3 / R12.4）。
 */

/**
 * 未确认段落（低置信段）墨度起伏的**幅度** —— 规格 §8.1 逐字「幅度 2%」。
 *
 * Why 具名：motion.md 的「四层纲领」逐字要求「环境层的幅度上限（含 2% 的墨度起伏）**必须写成具名常量**，
 * 不许散落字面量」；`ui/primitives/motion.css` 的 `@keyframes ed-unconfirmed-breathe` 只写两端极值
 * （`0.98` / `1`），差值由 `env.test.ts` 与本常量对拍 —— 于是「2%」全仓只有一个数值落点。
 */
export const LOW_CONFIDENCE_INK_AMPLITUDE = 0.02;

/**
 * 未确认段落（低置信段）的落点类名 —— `Text` 原语基类 `ed-text` 的**修饰类**。
 *
 * 🔴 形状受 `ui/primitives/motion-coverage.test.ts` 的选择器域约束，**不得**改回旧的 `ed-low-confidence`
 * （那个名字不在任何基类域内，会被「未登记基类」判据拦下；要放行它就得改三条既有断言 = G16，
 * 控制方 R12.1 已裁定**不启用**）。生产调用点 = `components/structuredBlocks.ts` 的
 * `lowConfidenceClass()`（`SessionSegment.confidence < 0.5` 的段）；样式落点 = `ui/primitives/Text.css`。
 */
export const LOW_CONFIDENCE_CLASS = "ed-text--low-confidence";

/** 环境层的一个循环落点：`@keyframes` 名 ↔ 声明它的选择器（选择器原文，含修饰类） */
export interface AmbientItem {
  /** `@keyframes` 名（定义只许在 `ui/primitives/motion.css` —— 桶边界） */
  readonly keyframes: string;
  /** 声明 `animation:` 的选择器原文（必须逐字进 reduced-motion 名单） */
  readonly selector: string;
}

/** 环境层 ②③④ 三件新落点（**逐序数组**：顺序 = 规格 §8.1 四件的顺序去掉第 ① 件）。
 *  ⚠️ `selector` 一律是**选择器原文**（带前导 `.`）；`LOW_CONFIDENCE_CLASS` 是类名本身（不带点）
 *  —— 它是 `lowConfidenceClass()` 的返回值，两处口径不同、不可互相代入。 */
export const AMBIENT_ITEMS: readonly AmbientItem[] = [
  { keyframes: "ed-capture-pulse", selector: ".ed-status--live-pulse" },
  { keyframes: "ed-unconfirmed-breathe", selector: `.${LOW_CONFIDENCE_CLASS}` },
  { keyframes: "ed-due-glow", selector: ".ed-surface--due-glow" },
];
