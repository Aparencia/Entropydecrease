/**
 * engine.ts — **全仓唯一 GSAP 入口**（ADR-035 §2 · 裁决 R2.2）。
 *
 * @ai-context 业务背景：L4 动效层（批 6）的引擎装配点 —— 动效落点只许
 *   `const { gsap, useGSAP } = await import("../motion/engine")` 取引擎。
 * @ai-context 🔻 判据口径（控制方 2026-09-13 追加指令；ADR-035 的 `:30` 快照注释写的是**白名单**口径，
 *   与本文件落地口径不一致，差异已登记在 task-3-report.md 供 T35 就地加注）：
 *   「本文件是唯一静态 import GSAP 家族（`gsap` / `gsap/*` / `@gsap/react`）的文件」
 *   **不是判据**，而是 **ADR-035 决策 3 的闭包交集判据**的**派生结论**（供失败定位的诊断读数）。
 *   判据本体逐字 = 「`app/src/**` 中**静态** import `gsap` / `@gsap/react` 的文件集合
 *   ∩ **首屏静态可达闭包** = ∅」；本文件之所以能存在，是因为它**不在**该闭包内 ——
 *   白名单口径一加新文件就漏（易腐化），闭包交集是结构性的。少了这条约束，GSAP 会被拉进
 *   首屏静态闭包，`vendor-gsap` 独立懒 chunk 的承诺（规格 §13 风险表）当场落空。
 * @ai-context 🔴 为什么必须在**顶层**执行 `registerPlugin(useGSAP, …)`（尖刺 S3.2 的发现，本仓已复现）：
 *   不注册时 `useGSAP()` **防不住 React 19 StrictMode 的双 tween** —— 实测裸 `useEffect` 留
 *   **2 个** tween，`useGSAP()` **也是 2 个**，卸载后 tween 仍挂在 globalTimeline 上（既不报错也不清理）。
 *   根因是 **gsap 双实例**：`gsap` 的 `exports["."]` 把 `import → index.js`（ESM）与
 *   `require → dist/gsap.js`（CJS）指向**两个物理文件**，而 `@gsap/react@2.1.2` **无 `exports`**
 *   字段、`main` 指 UMD/CJS（内部 `require("gsap")`）⇒ Vitest 把依赖 external 给 Node 原生加载后，
 *   `@gsap/react` 拿到 CJS 运行时、应用代码拿到 ESM 运行时；两个实例各有自己的 `_context`
 *   ⇒ `context.revert()` **静默空转、无任何警告**。`registerPlugin(useGSAP)` 把 useGSAP 的
 *   `_gsap` 对齐到本文件的实例 ⇒ 实测 StrictMode **1 个 tween**、卸载后 `transform === ""` 且 tween 数 0。
 *   浏览器构建不受影响（Vite 认 `module` 字段）—— 这是**测试底座独有**的坑，验收判据见 `engine.test.ts`。
 * @ai-context 插件集合与顺序由 ADR-035 §2 冻结（恰 4 个，`engine.guard.test.ts` 与本节对拍）：
 *   `useGSAP`（React 19 集成）· `Flip`（跨布局形态变化）· `ScrollToPlugin`（时间码回跳）·
 *   `CustomEase`（双基调的具名 ease；批 6 T8 在此 `CustomEase.create`）。
 *
 * 副作用：**进程级全局副作用** —— `registerPlugin` 执行后这四个插件对本进程内所有 GSAP 实例可见。
 *   测试隔离不受影响（每个测试文件独立环境），但**不得**把本模块当「无副作用工具」在首屏路径上静态引用。
 * 边界：本模块**只能经 `await import()` 到达**（判据 = 上面那条**闭包交集**，不是白名单）；
 *   凡需要 `useGSAP` 的组件，其自身必须在动态 import 链上。
 *   本文件不做任何动效编排 —— 时长 / 位移 / 具名 ease 分别归 token 真源、`motion/shift.ts` 与 T8。
 */
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase);

/**
 * 双基调的**具名 ease**（裁决 R3.4 · 规格 §8.3 的「活的纸」/「洇开」曲线，计划 T8 Step 3）。
 * 控制点与 CSS 侧 `--ed-ease-paper` **同值**（`0.215,0.61,0.355,1` = `power2.out` 的 bezier 近似）
 * ⇒ 两侧不只是共享「不是回弹」这一性质，而是**同一条曲线**（回弹/过冲会被 `tone.test.ts` 的
 * 101 点单调性判据拦下）。名字与 `motion/tone.ts` 的 `TONE_EASE_NAME.paper` 逐字对应 ——
 * 两边分叉时那条判据当场红（`parseEase` 对未注册名**静默**返回 `undefined`）。
 * ⚠️ 必须在 `registerPlugin(CustomEase)` **之后**：未注册时 `CustomEase.create` 进不了 GSAP 的 ease 表。
 */
CustomEase.create("ed-paper-bleed", "M0,0 C0.215,0.61 0.355,1 1,1");

/**
 * `Flip` 与 `gsap` / `useGSAP` 一并转出（T33 落地；控制方 2026-09-13 裁决「授权路径 B」）：
 * 列折叠的跨元素配对（`data-flip-id`）需要 Flip，而本文件是**唯一**允许出现 gsap 家族说明符的地方
 * （判据 = `engine.guard.test.ts` ③′ 的 importer 集合相等 + ③‴ 的动态说明符域）⇒ 新增第二个 importer
 * 文件会当场红，故只能经本文件转出。`registerPlugin` 的插件集合与顺序**一字未动**。
 */
export { gsap, useGSAP, Flip };

/**
 * `gsap.core.Timeline` 的**转出**（计划 T10 Interfaces 逐字：`export type { gsap }` 转不出命名空间成员）。
 * ⚠️ **这是便利，不是类型检查的必需品**（T13b 按合并评审 I-2 更正本段的旧说法）：旧注释称
 * 「`import { gsap } from "gsap"` 绑定的**值**会遮蔽 `gsap` 这个**全局命名空间** ⇒ 使用方直接写
 * `gsap.core.Timeline` 过不了类型检查」—— **因果为假**：类型位置上的 `gsap.core.Timeline` 解析的是
 * gsap 自己声明的**全局命名空间**，与是否 import 无关。T13b 在同一棵提交树上以六个 tsc case 实测：
 *   · **不 import** 任何东西直接写它 ⇒ **exit 0**；· import 了 `gsap` 且**值也真用到**（`gsap.timeline`）
 *   再在类型位置写它 ⇒ **exit 0**；· 唯一会红的是「import 了**值**却**只**在类型位置用它」⇒
 *   **exit 2 / TS6133**（`noUnusedLocals` 判「值从未被读」，**不是**类型解析失败；从 `"gsap"` 直接
 *   import 是同一机理、同一报错）；· 阳性对照（同树 `app/src/**` 新文件里故意写错类型）⇒
 *   **exit 2 / TS2322** —— 那几个 0 **不是**「没检查」。
 * ⇒ 别名的真实价值：消费方写 `import type { GsapTimeline }`（类型边不进产物、也不会撞上 TS6133）——
 *   `motion/controls.ts` / `test/motionHarness.ts` 今天正是这么用的；删掉本行 ⇒ 两处 **TS2305**、exit 2
 *   （故它**不是**没人用的装饰）。留着的另一个理由是它是**计划冻结的接口面**。
 */
export type GsapTimeline = gsap.core.Timeline;
