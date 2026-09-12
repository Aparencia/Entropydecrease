/**
 * tone.ts — 双基调（`data-tone`）的**唯一登记表**与两条缓动落点（规格 §8.3 · ADR-035 · 裁决 R3.4）。
 *
 * @ai-context 业务背景：本仓的动效分两张面 —— ①**精密仪器**（有「读数」的界面：采集 / 复习 / 时间轴 /
 *   到期刻度）用 `power3.inOut` 族：匀速段更长、沿轴线、带刻度感；②**活的纸**（有「文字」的界面：
 *   笔记 / 会话 / 体系）用 `power2.out` / 自定义「洇开」曲线：带**惯性沉降**（减速到停），**不是回弹**。
 *   载体逐字 = `data-tone` 属性（取值 `"instrument" | "paper"`，**每个动效落点显式声明**）；
 *   🔴 **禁止**用类名区分基调 —— 那会与既有 `ed-*` 类名空间冲突。本层只**定义**基调与缓动，
 *   落点接线（把 `data-tone` 写进 DOM）在波 B/C。
 * @ai-context CSS 侧与 GSAP 侧的**同源机理**：CSS 只有 `cubic-bezier(...)`（真源 = 生成物 `tokens.css` 的
 *   `--ed-ease-instrument` / `--ed-ease-paper` 两条，由 `scripts/gen-tokens.mjs` 的 `EASING_TOKENS` 渲染），
 *   GSAP 侧是 `CustomEase.create("ed-paper-bleed", …)`（在 `engine.ts` 注册）——「活的纸」两侧是**同一条**
 *   bezier（`0.215,0.61,0.355,1`，即 `power2.out` 的 bezier 近似）；「精密仪器」两侧只是**粗近似**
 *   （CSS 没有 GSAP 的 ease 族，`power3.inOut` 用 `cubic-bezier(0.4,0,0.2,1)` 近似，且**不引入第二套 ease 定义**）。
 *   🔴 **量化**（T8+T9 合并评审的**独立测量**，归一化进度轴上的采样对拍；不是「微小」）：
 *   · `--ed-ease-instrument`（`cubic-bezier(0.4,0,0.2,1)`，CSS 侧）vs GSAP `power3.inOut`：
 *     **maxDiff ≈ 0.409 @ x = 0.40**（CSS 0.6136 vs GSAP 0.2048）—— 同一 x 上前 40% 的进度差 **41 个百分点**
 *     （CSS 侧前段快出、GSAP 侧前段慢起）；两个值在**同一台仪器、同一次运行**内取得 ⇒ 本批**接受该差**。
 *   · `--ed-ease-paper` vs GSAP `ed-paper-bleed`（`CustomEase`）：控制点均 `[0.215,0.61,0.355,1]` ⇒ **同一条曲线**，
 *     101 点对拍 **maxDiff = 5.26e-4 · drops = 0** —— 即「活的纸」族**两路一致**，与 instrument 族 0.409 形成对照。
 *   🔴 **下游纪律**：「本批接受该差」**不等于**可以两路横跳 —— **同一动效不得在 CSS 路与 GSAP 路之间横跳**：
 *   一个落点的曲线要么全程取 CSS（`transition-timing-function: var(--ed-ease-instrument)`），要么全程取
 *   GSAP timeline 的 `ease: "power3.inOut"`，**不许**同一处两路混用（否则该处会出现 0.409 量级的曲线跳变）。
 *   两侧共享的**硬性质** = 「不是回弹」（单调不减、无过冲、无二次反方向），
 *   由 `tone.test.ts` 的 101 点单调性判据钉住 —— 那是本任务最有牙的一条。
 *
 * 副作用：无 —— 纯数据 + 纯函数，**不 import GSAP**（故本模块可被首屏静态引用，不进 `vendor-gsap` 懒 chunk）。
 * 边界：① `toneEase()` 返回的是**实参**（内置名或已注册的具名 ease），它**不注册**任何东西 —— 注册在
 *   `engine.ts`（`CustomEase` 在那里 `registerPlugin` + `create`）⇒ 取用前必须先 import engine，否则
 *   `gsap.parseEase("ed-paper-bleed")` **静默返回 `undefined`**（只有一条 stderr 警告、动画照跑默认 ease）。
 *   ② 本层**不产生运动**：没有 tween / timeline 工厂；`prefers-reduced-motion: reduce` 时是否跳过由**落点**
 *   决定（规格 §8.6.1 第 4 条「『活』不得以无障碍为代价」），本层只提供基调名与曲线。
 */
export const MOTION_TONES = ["instrument", "paper"] as const;
export type MotionTone = (typeof MOTION_TONES)[number];

/** token 名（不含 `--ed-` 前缀）—— `tokens.css` 里由生成器的 `EASING_TOKENS` 定义 */
export const TONE_EASE_TOKEN: Readonly<Record<MotionTone, string>> = {
  instrument: "ease-instrument",
  paper: "ease-paper",
};

/** GSAP 侧具名 ease：`power3.inOut` 是内置；`ed-paper-bleed` 由 `engine.ts` 的 `CustomEase.create` 注册 */
export const TONE_EASE_NAME: Readonly<Record<MotionTone, string>> = {
  instrument: "power3.inOut",
  paper: "ed-paper-bleed",
};

/** CSS 侧落点：`transition-timing-function: toneEaseVar(tone)` ⇒ 例 `var(` + `--ed-ease-instrument)` */
export function toneEaseVar(tone: MotionTone): string {
  return `var(--ed-${TONE_EASE_TOKEN[tone]})`;
}

/** GSAP 侧落点：`gsap.to(el, { ease: toneEase(tone) })` */
export function toneEase(tone: MotionTone): string {
  return TONE_EASE_NAME[tone];
}
