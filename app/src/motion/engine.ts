/**
 * engine.ts — **全仓唯一 GSAP 入口**（ADR-035 §2 · 裁决 R2.2）。
 *
 * @ai-context 业务背景：L4 动效层（批 6）的引擎装配点。所有动效落点只许
 *   `const { gsap, useGSAP } = await import("../motion/engine")` —— 本文件是全仓**唯一**
 *   静态 import GSAP 家族（`gsap` / `gsap/*` / `@gsap/react`）的文件。少了这条约束，
 *   GSAP 会被拉进首屏静态闭包，`vendor-gsap` 独立懒 chunk 的承诺（规格 §13 风险表）当场落空。
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
 * 边界：本模块**只能经 `await import()` 到达**（R11.1 的闭包判据 = 「静态 import GSAP 家族的文件集合
 *   ∩ 首屏静态可达闭包 = ∅」）；凡需要 `useGSAP` 的组件，其自身必须在动态 import 链上。
 *   本文件不做任何动效编排 —— 时长 / 位移 / 具名 ease 分别归 token 真源、`motion/shift.ts` 与 T8。
 */
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase);

export { gsap, useGSAP };
