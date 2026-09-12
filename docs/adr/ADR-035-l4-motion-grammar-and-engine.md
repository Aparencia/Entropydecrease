# ADR-035：L4 动效纲领与引擎（GSAP 唯一入口 / token 真源 / 三档强度 / 双基调 / 位移上限）

> 状态：已接受（2026-09-13，**批 6 波 A 落地**；决策本体 = 规格 §8 + 控制方裁决 R0–R12 + 波 A 的代码与守卫）
> 关联：[前端重设计规格](../superpowers/specs/2026-09-11-frontend-redesign-design.md)（**§3 红线 6（:127）** · §8 全节（:489–:560）· §10 批 6 行（:658）· §11-4（:740）/ §11-5（:741）/ §11-9（:760）/ §11-10（:766）· §13（:811）· §14（:836））· [动效规范](../standards/motion.md)（**本 ADR 的规范载体；判据纪律的机械输入**）· [ADR-034](./ADR-034-l2-shell-navigation-and-column-contract.md) · [ADR-033](./ADR-033-l1-primitives-and-view-layer-contract.md) · [ADR-032](./ADR-032-frontend-design-system-tokens.md) · [ADR-013](./ADR-013-live-session-preload-and-playback-pause.md) · [批 6 实施计划](../superpowers/plans/2026-09-12-frontend-redesign-batch6-motion.md)

## 背景

规格 §14 的 ADR 表逐字登记「**ADR-034/035 顺延至批 3 / 批 6**」；批 3 / 批 5 已把 L2 壳层（ADR-034）与 L1 原语 / L3 视图（ADR-033）落成 durable 载体，而 **L4 动效层在批 6 之前只有接缝、没有纲领**：批 4 收口逐字声明「**只有接缝、没有纲领**（三档强度 / 双基调 / GSAP 全缺）」，`app/src` 里只有 `[data-phase]` 退场接缝与 `app/src/ui/primitives/motion.css` 的 **10 个临时 token**（批 0-D 的临时接缝，文件头逐字承诺「批 6 的动效 token 真源完成后**整块删除**」）。

⇒ 本 ADR 把**架构级**决策固化成 durable 载体（引擎选型与接入面 · 唯一入口与插件注册 · token 单一真源 · 三档 / 双基调 / 位移上限的实现层 · 判据纪律 · 一处红线例外）。三条事实驱动它：

1. **规范先于代码**（AGENTS.md §0.4）：[动效规范](../standards/motion.md)（批 6 T1，`bffed928`）**先落地**，本 ADR 记录其上的决策，波 A 的 T3–T14 按它装配。
2. **本批首次改动「零新增依赖」**（R2.1 授权装 `gsap@3.15.0` + `@gsap/react@2.1.2`），也**首次为规格 §3 红线 6 新增第三处例外**（R0.1 第 1 条：用户裁决「B · 连承载面一起建」）。
3. **手感的数值（三档倍数、编排时长、错开量）不属本 ADR 管辖** —— 它们是可 headless 抽检、**不得升格为判据**的手感参数；本 ADR 只管「在哪一层、由谁强制」。

## 决策

### 1. 引擎 = GSAP 3.15.0 + `@gsap/react` 2.1.2（版本冻结），四层纲领与四条分界规则由规范承载（依据：规格 §8.1（:489）/ §8.2（:498）· R2.1）

- **版本逐字冻结**：`gsap@3.15.0` + `@gsap/react@2.1.2`。事实（R2.1 实测）：**零传递依赖** · peer = `gsap ^3.12.5` + `react >=17` · 许可 `Standard "no charge" license`；2025 起 Webflow 令 GSAP **全插件免费**（含 `Flip` / `ScrollToPlugin` / `CustomEase`）。落点 = `app/package.json` 的 `dependencies` 恰 +2（归 **T3**）。
- **分界规则**（规格 §8.2 逐字表；执行口径，全文见[动效规范](../standards/motion.md)）：单属性 · 无时序 · <200ms ⇒ **CSS transition**；多元素 · 有时序 · 需中断/反向/seek ⇒ **GSAP timeline**；「从 A 布局滑到 B 布局」⇒ **GSAP Flip**；循环环境动效 ⇒ **CSS keyframes**（`@keyframes` 桶边界只留 `Loading` / `Skeleton` / `Probe`）。
- **四层纲领**（规格 §8.1 逐字：响应 80–180ms / 环境 2–6s 循环 / 编排 400–900ms / 生长 秒→天）是**时间尺度与配重的唯一真源**，本 ADR 不复制，只固化两条不可协商：① **第一优先 = 响应层 + 用户动作触发的编排层**；② **环境层不得被降为纯背景**（用户二次确认原话「交互时最重要，**但闲置时也要有生命感（环境层别退太多）**」，规格 §8.6.1（:552））。
- 本批是**「零新增依赖」的唯一一次破例**（批 2/4/5 的硬约束由 R2.1 授权破例一次）；除这 2 个 npm 包外零新增依赖（Rust 侧 `Cargo.lock` 692 包零变化）。

### 2. 全仓唯一 GSAP 入口 = `app/src/motion/engine.ts`，顶层**必须** `gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`（依据：R2.2 · 尖刺 S3.2 实测）

**接口冻结快照**（T3 逐字照此建；本 ADR 是插件集合的真源）：

```ts
// 唯一允许静态 import GSAP 家族的文件
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase); // ← 顶层，不可省、不可条件化
export { gsap, useGSAP };
```

🔴 **为什么必须注册（测试底座独有的事实；尖刺 S3.2 的读数逐字抄在此处，因为 `spike-gsap-runtime.md` 在 `.superpowers/**` 里 gitignored、不入库）**：

- 不 `registerPlugin` 时 **`useGSAP()` 防不住 React 19 StrictMode 的双 tween** —— 实测：裸 `useEffect` = **2 个 tween**，`useGSAP()` **也是 2 个**，卸载后 `transform` 残留。
- **根因 = gsap 双实例**：`gsap` 的 `exports["."]` 把 `import → index.js`（ESM）与 `require → dist/gsap.js`（CJS）分成**两个物理文件**，而 `@gsap/react@2.1.2` **无 `exports`**、`main` 指 UMD/CJS（内部 `require('gsap')`）⇒ Vitest external 后 `@gsap/react` 拿到 **CJS 运行时**、应用拿到 **ESM 运行时**，两个 `_context` ⇒ `context.revert()` **静默空转、无任何警告**。
- `registerPlugin(useGSAP)` 之后实测：StrictMode 下 **1 个 tween**、卸载后 `transform === ""` 且 tween 数 **0**。
- **浏览器构建不受影响**（Vite 认 `module` 字段）—— **这是测试底座独有的坑**，验收判据落在 T3 的 `engine.test.ts`（StrictMode 单 tween + 卸载清净）与 T4 的守卫。

其余边界：`registerPlugin` 是**全局副作用**（进程级可见），且本文件**只能经 `await import()` 到达**（决策 3）；插件集合**恰 4 个、顺序逐字**，`engine.guard.test.ts` 与本节做集合对拍。

### 3. 懒加载边界 = 「`app/src/**` 中**静态** import `gsap` / `@gsap/react` 的文件集合 ∩ **首屏静态可达闭包** = ∅」（依据：R2.1 判据 ③ · R11.1 追认并加强）

- **槽位早已预留**：`app/src/build/manualChunks.ts` 的 `EXACT` 已含 `gsap` / `@gsap/react` 两行（批 2 交付）；G8 = `app/src/build/manualChunks.test.ts:272` 由「此刻没有 gsap」**改判**为「恰是这两个」（**按它自带的指引修，不是改断言**）。
- **判据不是白名单**（白名单易腐化：新文件一加就漏）**而是闭包交集**（结构性、有工具可算：复用 `scripts/bundle-eager-graph.mjs` 的源文件集合）。三件套：① 产物出现 `vendor-gsap-*.js`；② `check-bundle-budget.mjs --no-build --json` 的 `firstScreen.chunks` **不含**它（首屏 chunk 数仍 **3**，首屏 gzip 基线 **100.49 kB**）；③ 上式的**交集为空**。
- **三条连带硬约束**：① `engine.ts` 仍是**唯一引擎装配文件**（决策 2 不变）；② **任何需要使用 `useGSAP` 的组件，其自身必须位于动态 import 链上** —— 首屏静态页（**课堂页 `pages/ClassroomPage.tsx` 是静态的**，批 2 交付形态「8 页懒 + 课堂页静态」）里的 GSAP 动画**必须**抽成 `React.lazy` 子件；③ **派生禁令**：`@gsap/react` 不得被任何首屏静态模块静态 import（它是 `vendor-gsap` 成员，一旦进闭包就等于 GSAP 进首屏）。
- 落点 = **T4** 的 `app/src/motion/engine.guard.test.ts`：闭包交集是**无条件可跑**的硬判据；①② 是 `runIf(existsSync(dist))` 的产物用例 + **真实构建强制命令行** —— 🔴 **`dist` 不入库 ⇒ 在导出树里 ①② 不运行：未运行 ≠ 通过**，必须计入报告的「未验证」单列（R11.5）。

### 4. 动效 token 真源 = `app/scripts/gen-tokens.mjs`（单一真源、绝不双写）（依据：规格 §11-4（:740）· R1.1 · R2.3）

- **10 个变量逐字迁入**（值一字不改）：`DURATION_TOKENS` × 9（`micro` 120 · `overlay-in` 200 · `overlay-out` 160 · `toast-in` 180 · `toast-out` 140 · `skeleton` 1200 · `card` 220 · `reveal` 500 · `page` 150）+ `EASING_TOKENS` × 1（`--ed-ease: cubic-bezier(0.2, 0, 0, 1)`，出场比进场快）⇒ 产物 `app/src/ui/tokens.css`（`:root`）+ `tokens.gen.ts`（导出 `DURATION_TOKENS` / `EASING_TOKENS` / `MOTION_TOKENS`）。
- **`motion.css` 不得再定义任何 `--ed-*`**：临时 `:root{}` 块**整块删除**（T5 已落：`motion.css` **74 → 54 行**，`--ed-*` 定义实测 **0**）。生成物**永不手改**：改真源必须重生成并**同提交**带两个产物。
- 判据落点（已落）：`app/src/ui/primitives/style-seams.test.ts`（G4：`motion.css` 的 `--ed-*` 定义**恒 0** 的回归封条 + 真源侧计数 9/1 + 逐名逐值改读 `renderAll().css`）· `app/src/ui/tokens.drift.test.ts`（产物 == `renderAll()`）。
- **`pill` 档**：`radiusScale` 第 5 档 `{ name: "pill", px: 999 }`；**999 取自既有原语层兜底值**（全仓唯一命中 `app/src/ui/primitives/Surface.css:58` 的 `var(--ed-radius-pill, 999px)`），**不许自创** ⇒ G9（`tokens.drift.test.ts:55` → `[3, 5, 8, 10, 999]`）与 G14（`app/scripts/gen-tokens.test.mjs:122` + `:132-136` 的真源 ↔ 消费者同值对拍）**两处独立真源断言必须同任务同提交处理**。
- **为什么不在 `motion.css` 定义 `--ed-*`（也不引 `--ed-` 私有档位变量）**：与 G4 的新判据直接冲突；T6 的档位块因此**直接覆写属性**，不新增任何 `--ed-*`。

### 5. 强度三档 = `<html data-motion="eco|standard|rich">`；系统 `prefers-reduced-motion` **优先于档位**（源序）（依据：规格 §8.5（:526）· R3.1–R3.3）

- **载体 / 取值逐字**：`data-motion` 写在 `<html>` 上，取值 `"eco"` | `"standard"` | `"rich"`，**默认 `"standard"`**；持久化键逐字 **`motion:intensity`**（照 `app/src/views/useViewMemory.ts` 范式：三纯函数 + 注入 `Storage` + `globalThis.localStorage` 默认值 + 惰性读取 + 静默降级）；**初值 = 跟随系统**（`prefers-reduced-motion: reduce` ⇒ `"eco"`，否则 `"standard"`）；`matchMedia` **必须自带守卫**（`typeof window.matchMedia !== "function"`）。
- 🔴 **源序是优先级实现**：CSS 里后写覆盖 ⇒ **档位规则块必须写在 reduced-motion 块之前**；顺序写反 = 用户选的档**盖掉**系统无障碍设置，违反规格 §8.6.1（:552）第 4 条「『活』不得以无障碍为代价」。**新增守卫**断言行号关系（`app/src/ui/primitives/motion-coverage.test.ts`，归 **T6**，带变异体）。
- **必须有可切换的 UI 入口**（否则「三档正确」不可验收）：`SettingsPage` 的「动效强度」三段控件（新组件 `app/src/components/MotionIntensityControl.tsx`，归 **T7**；**复用 `ViewSwitcher` 原语**以满足「`ed-btn` 段控件类名空间 + `aria-pressed` + 零行内 style」且不触 `nativeButton.ratchet` 的域）。
- **不在本 ADR 管辖**：三档的具体倍数（手感参数）；**跨窗口同步**（`?float=1` / `?overlay=1` 各自独立，登记）。

### 6. 双基调 = `data-tone` 属性 + 两个缓动 token + `CustomEase` 具名 ease，**不按类名分**（依据：规格 §8.3（:511）· R3.4）

- **载体 = `data-tone`**，取值逐字 `"instrument"` | `"paper"`；**每个动效落点显式声明基调**（`instrument` = 有「读数」的界面：采集 / 复习 / 时间轴 / 到期刻度；`paper` = 有「文字」的界面：笔记 / 会话 / 体系）。**禁止**在 CSS 里用类名区分基调（会与既有 `ed-*` 类名空间冲突）。
- **缓动落点** = `tokens.gen.ts` 的两个缓动 token（精密仪器 `power3.inOut` 族，匀速段更长、沿轴线带刻度感 / 活的纸 `power2.out` + 自定义「洇开」曲线，**带惯性沉降、不是回弹**）；GSAP 侧经 `CustomEase.create()` 注册**具名 ease**，**默认 ease 不承担基调语义**。归 **T8**（token + 具名 ease + 单调性判据）。
- 「惯性沉降」= **减速到停**（无过冲、无二次反方向运动）；「回弹」属规格 §8.7 明确不做的三类之一。

### 7. 位移上限 8px：唯一出口 = `app/src/motion/shift.ts`，判据域收窄到**动画位移**（依据：规格 §8.4（:518）末句 · R3.5 · R11.4）

- **判据域** = 全仓 `app/src/**` 的 **`translate*()` 数值实参** + **`motion/` 层导出的位移常量**；> 8px 即红。实测支撑：全仓 `translate*()` **18 处**（数值实参 **10 处**），**> 8px = 0 处**（最大 `Modal.css:52` / `Toast.css:64` 的 `translateY(8px)`）⇒ **扩域零存量白名单**可行。
- 🔴 **不判** `margin` / `left` / `top` 的 px 字面量：实测 > 8px 的 **4 处全是布局量**（`app/src/components/NotePreviewView.tsx:64` 的 `margin:10px` · `app/src/shell/TopBar.test.tsx:215` 与 `app/src/ui/primitives/Toast.placement.test.tsx:103-104` 的 `top: 64px`），拉进来只造假阳性；而「动画不得动 layout 属性」已由决策 8 的属性集合审计**单独覆盖** ⇒ 无漏洞。
- **位移不做成 CSS 变量**：没有消费者就是死变量（还会给人「已被强制」的错觉）。强制手段是机器判据。归 **T9**（唯一出口 + 扩域守卫）。

### 8. 判据纪律：确定性推进唯一正解 + 可中断双断言 + 属性集合代理 + 「只能登记」清单（依据：规格 §11-10（:766）· R1.4 · R8.1–R8.6）

**正文（含被守卫逐字复用的字符串）在[动效规范](../standards/motion.md)的「判据纪律」节，本 ADR 不复制全文**，只固化四条不可协商的边界：

1. **确定性推进的唯一正解** = `gsap.timeline({ paused: true })` + `tl.time(t)`；🔴 **四个禁用项** = `gsap.updateRoot` · `gsap.ticker.tick` · `gsap.ticker.sleep` · `await sleep`（真实定时器 / fake timers）。测试里的推进调用**只能是**正解。
2. **可中断 / 可反向必须双断言**：**同时**断 tween 计数（`gsap.globalTimeline.getChildren().length`，或旧 tween 的 `totalTime()` 冻结）**与**目标元素 `style.transform` —— 只看 `style.transform` **会假绿**（GSAP 3 默认 `overwrite:false` ⇒ 覆盖同属性时旧 tween 仍在跑）。
3. **「60fps」在本环境不可判** ⇒ 代理判据 = 被动画属性集合 **⊆ `{transform, translate, rotate, scale, opacity, filter}`**（即未动 layout 属性）。需要几何变化的动效走 **transform 路径**（Flip 用 `scale: true`）—— **让实现去满足判据，不放宽判据去迁就实现**（R12.3）。🔴 任何收口**不得**出现「60fps 已达成」类表述。
4. **只能登记、不许编造弱判据的清单（durable 落点）**：真实 **60fps** · **Flip 几何位移**（`Flip.getState` 的 `bounds` 全 0、位移增量恒 `translate3d(0px,0px,0px)`）· **真实媒体播放** · **`window` 级滚动**（`ScrollToPlugin` 的 `window` 目标读数恒 0）· **真机 / WebView2 观感** · 视图密度观感 · 切视图卡顿 · 惰性挂载的运行时内存效果 · **暗档（`data-theme`）实际生效**。

结构锚点四个（凡能落成 **DOM 结构 + `data-*` + 类名 + 属性值**的判据优先于时间判据，R8.5）：**`data-motion`** · **`data-tone`** · **`data-shell-phase`** · **`data-phase`**。两条 API 陷阱：`tl.to()` 返回 **Timeline 本身**不是 Tween（取句柄用 `tl.to(...).getChildren()` 或 `gsap.to`）；**绝不可把 jsdom 的 `performance` 挂到 `globalThis`**（自调用栈溢出）。

## 后端契约例外（规格 §3 红线 6 的第三处例外）

> **依据**：R0.1 第 1 条逐字 —— 「规格 §3 红线 6『后端数据模型零改动』新增**第三处例外**，必须：① 规格 §3 就地加注（带原因/影响面/回滚）；② `ADR-035` 单列『后端契约例外』节；③ `cargo test --test app_lib_tests` 本批必须真跑」。规格 §3 的既有两处例外（E1 `MemoryEntry.tier` / E2 `tag_colors` 种子）是**先例不是授权**（规格 §12 逐字「例外须各自登记原因/影响面/回滚；新增例外需再次裁决」）。
> 🔻 **本节状态（诚实边界）**：**授权已下、三条例外的形态已由三份探针回收裁决定稿**（PB1 `probe-audio-availability.md` · PB2 `probe-fsrs-interval.md` · `probe-audio-runtime.md`）；**波 B（T20 / T22 / T23）落地后的实测读数待回填** —— **「待回填」= 命令注册计数实测值 · sidecar 字段终名 · `aligned` 初值语义终稿 · `MAX_GAP_MS` 的授权值与理由 · `cargo test` 逐字读数**，由 **T35** 定稿本节。**本节此刻不是「已完成」状态。**
> **共同约束（三条例外逐条适用）**：**只读** / **不新增表** / **不改既有字段与既有 SQL 文本的语义** / **零迁移**（`flashcards` 建表后零 `ALTER TABLE`；`CARD_COLUMNS` 不动）；**都不触碰 AGENTS.md §10 的「SQLite schema / 迁移」面**。

| # | 例外 | 原因 | 影响面 | 回滚 | 依据 |
|---|---|---|---|---|---|
| **E3** | `Flashcard` += **只读字段** `intervalDays`（camelCase；Rust 4 文件 / 5 处） | **真实间隔前端今天拿不到，但后端已经算出来了**：`scheduler.rs:69` 的 `ScheduleOutcome{…, interval_days: f32, …}` 与 `:99` 的 `max(1.0)` 都算过，而 `review_card` 的返回构造（PB2 读数 `commands_flashcards.rs:206-210`；⚠️ **该行号随 T20 落地会下移 ⇒ 锚点认内容**：`Ok(Flashcard { state_json, due_at, ..card })`）**只返回 `state_json` / `due_at`**，写库只有 `db_flashcards.rs` 的 `update_card_schedule`（`UPDATE flashcards SET state_json = ?1, due_at = ?2`）⇒ **DB 无 interval 列**、`stateJson` 键逐字只有 `stability`/`difficulty`/`reps`/`lapses`/`lastReviewMs`。而 `stateJson` 的契约逐字是「后端调度契约，**前端透传不解析**」⇒ 前端**不得**用 `dueAt` 差分或字符数**自造**「真实间隔」（AGENTS.md「不发明数字」） | `Flashcard` 是 **6 条命令的共享返回类型** ⇒ 字段会同时出现在 `list_due_cards` / `review_card` / `quiz_group_cards` / `create_model_card` / `list_group_cards` / `model_card_from_note` 的返回里；**本批只消费前两处**，其余四处**如实登记为「顺带变化」**。前端 `app/src/types/notes.ts` 加**可选** `intervalDays?: number`（**零夹具改动**）。🔴 **两个精度域必须在类型注释里显式声明**：① `review_card` 路径 = **精确值**（当场用 `outcome.interval_days` **显式覆写** —— 该函数用 `..card` 结构体更新语法，**不覆写会漏出旧值**，这是必须点名的陷阱）；② **行派生路径 = 整天粒度**（`row_to_card` 由 `dueAt − stateJson.lastReviewMs` 反推 `max(round(…),1)`，是**唯一**能给 5 个查询方法一次供值处）。UI 上「答『忘了』则回缩」**必须**用 ① 的精确值 | 删字段 + 还原 5 处（`types_note.rs` · `db_flashcards.rs`×2 · `commands_flashcards.rs` · `types_contract_tests.rs` 的**追加行**）+ 删前端可选字段。**零迁移、零 SQL 变更** ⇒ 回滚不影响任何已落库数据 | R5.4 的 PB2 回收裁决（含 G11 = `types_contract_tests.rs:34` 的 `assert_wire!` **只许追加、不许删除任何既有字段/键**） |
| **E4** | 新增**只读** IPC `session_audio_path`（**命令注册 312 → 313**） | **音频真的落盘且已接线，但前端拿不到路径**：`audio_store.rs`（212 行）写 `{data_dir}/session-audio/{session_id}.wav`（16 kHz 单声道 PCM16，44 字节 RIFF 头，~115 MB/小时）；创建 `live_session.rs:258-262` · 每 200 ms 写块 `live_session_loop.rs:162-164` · finalize `:391-397`。播放三件套**已现成**：`app/src-tauri/tauri.conf.json:24` 的 CSP 已含 `media-src 'self' asset: http://asset.localhost blob:`，`:25-28` 的 `assetProtocol.enable=true` + `scope:["$APPDATA/**"]` 覆盖 `app_data_dir` ⇒ 🔴 **本批零 `tauri.conf.json` 改动**（AGENTS.md §10 的该审查面**不触发**） | **本批唯一的新增 IPC**：入参 `session_id: i64`；出参 `Option<SessionAudioRef>`（字段**只许** `path` / `aligned` / `durationMs` —— `aligned` 自证量必须到 UI，`Option<String>` 装不下）；注册点 `app_commands.rs:335` 邻近；计数 **312 → 313**（定义 + 注册各 +1）；`SessionAudioRef` **必须**进 `types_contract_tests.rs` 的 `assert_wire!`（**新增一行断言，不是改判**）。🔴 **安全三条**（AGENTS.md §4）：① **必须**校验入参；② **必须**把路径限定在应用数据目录内（**不许**把任意路径透传给 asset protocol ⇒ 目录穿越）；③ **不许**前端 `fetch()` 整取音频（不带 Range 的 200 分支会把 115 MB 读进内存）⇒ **只许 `<audio src>`**（硬判据）。⚠️ **适用范围硬边界**：**只有实时采集会话有音频**；导入会话的音轨在 `%TEMP%` 且导入结束即 `remove_dir_all`、`sessions` 表无源视频路径列 ⇒ 对导入会话本命令**恒 `Ok(None)`**，UI 必须如实区分 | 删命令 + 删注册行 ⇒ 计数回 **312**；前端删调用点即回到「只读时间轨、无音频播放」。**零依赖变更**（`Cargo.lock` 692 包零变化）、**零 `tauri.conf.json` 改动** | R5.5 的 PB1 回收裁决 + R12.2（出参形状追认） |
| **E5** | **WAV 轴 ≡ 会话轴**：写块路径按 `chunk.timestamp_ms` 的**空档等长补静音** + **失效安全** + **`aligned` 自证量** | **今天 `segments[].start_ms / 1000` 不能当 `audio.currentTime`**：`start_ms` 是会话纪元墙钟 − `total_paused_ms`，而 WAV 轴 = **已写样本数 ÷ 16000**、从第一个被捕获样本起**纯追加、无任何静音填充**。⚠️ **暂停本身不产生偏移**（端点 `Stop` ↔ 时间戳冻结**严格抵消**；暂停期 `write_chunk` **完全不调用**，不写 0 字节、不写静音）；间隙来自**静默窗根本不产包** ⇒ 偏差清单里 **D2 最危险且无上界**（对大量静默的课程录音，漂移可达**分钟级**）。⇒ 采**根治方案**：「只暴露 `first_sample_ms + samples_written`」的最小方案**只修 D1**、会交付一个「看起来对、实际会漂」的播放头，违反「标签不许说谎」 | `live_session*.rs`（**AGENTS.md §10 名单内** ⇒ 该任务必须显式执行 §10 审查记录）· `audio_store.rs`（`write_chunk` 加 `timestamp_ms: i64` 入参 + 对齐簿记 + `finalize` 写 sidecar `{id}.wav.meta.json`）· `live_session_loop.rs:163` **一个**调用点 · 新纯函数 `audio_align.rs` + `audio_align_tests.rs` · **`audio_store_tests.rs` 的既有 `write_chunk` 调用点改签名**（必要连带：**只改调用形态、不改任何期望值**）· `audio_store.rs:3` 的 `@ai-context` 就地更正（旧文「实时链路当前不落盘」**自相矛盾**）· **ADR-013 就地加注**（新增「WAV 轴与会话轴的对齐」一节）。**失效安全语义**：时间戳缺失 / 非单调 / 超大空档（> `MAX_GAP_MS`）⇒ **退回今天的纯追加**并置 `aligned = false`（**绝不静默分歧**），**不丢样本、不阻断会话主链路**。**历史录音必须如实区分**：本修复之前的 WAV 轴**不保证对齐** ⇒ UI 对**无基准**的录音**不得假装精确**；🔴 **禁止**用恒为 `true` 的字段充当该标记 | 还原 1 个签名 + 1 个调用点 + 删 2 个新文件 + 停写 sidecar（**补静音只影响新录音**，既有 WAV 一字不动）；`aligned` 字段随命令一同删除。**零新增依赖、零迁移、零新数据面** | R5.5-b 的三条裁决（根治方案 / 纯函数 + 失效安全 / `aligned` 自证量）+ 可行性复核（`chunk.timestamp_ms` 今天就在写块路径手边） |

## 后果

- **正面**：L4 动效层**首次有了 durable 契约** —— 引擎与接入面、唯一真源、三档与双基调的载体、位移上限的强制手段、判据纪律与「只能登记」清单，都有单一出处可引；批 7/8 及后续动效工作不必再回到批次台账（`.superpowers/**`，不入库）。规格 §3 红线 6 的第三处例外**有了 durable 记录**（此前只有 E1/E2 两个先例）。
- **负面 / 代价**：
  ① 本 ADR 的**多数判据落点在写它时尚未存在**（T4/T6/T8/T9/T11/T13/T14 才建）⇒ 合规性验证表逐行标状态，**「已落」与「归 T#」必须分开读**，否则会误读成「判据齐备」。
  ② **测试底座独有的双实例坑**（决策 2）是**代码形态约束**（顶层 `registerPlugin`），不是可选项；把它当「风格问题」会在 StrictMode 下静默产生双 tween。
  ③ 三档 / 双基调的**观感**不可机器判据 ⇒ 「三档正确」的机器面只有「档位映射 + DOM 属性 + 源序」三件，观感面进「只能登记」清单。
- **风险**：
  ① **新落点的类名形状**：必须是 `<既有基类>--<修饰>`（`motion-coverage.test.ts:113-124` 的选择器域过滤）—— 新起一个 `.ed-*` 基类名会当场红；T13 的环境层与 T12 的响应层必须照此。
  ② **`@keyframes` 桶边界**（只留 `Loading` / `Skeleton` / `Probe`）：新循环动效**只能写进 `motion.css`**（`Loading.css` / `Button.css` / `StatusLine.css` 三处均被既有守卫禁止新增），且**每一处 `animation` 声明的选择器原文（含伪元素）必须逐字进 reduced-motion 名单**（G7 不动）。
  ③ **`aligned` 的语义是「不能保证对齐」而非「一定没对齐」**（历史录音无法判定 ⇒ 取保守值）—— UI 文案**不得**说「这条录音没有对齐」。

## 替代方案与否决理由

- **自研 timeline**：否决。规格 §8.2 已定分界规则（Flip / 中断 / 反向 / seek 是签名动效的硬需求），自研等于重写一套调度器 + 清理语义，且无 StrictMode 清理的既有解。
- **`motion` / `framer-motion`（含其它 React 动画绑定）**：否决。绑定在 React 树上、对 **Flip**（跨布局形态变化的原子能力）无对等物；本批的分界表要求「从 A 布局滑到 B 布局」走 Flip。
- **把 `engine.ts` 静态 import 进首屏 / 只维护一份「静态 import 白名单」**：否决（R11.1）。白名单**易腐化**（新文件一加就漏），且会把 GSAP 拉进首屏闭包 —— 与 R2.1 判据①②（`vendor-gsap` 独立懒 chunk、`firstScreen.chunks` 不含它）直接冲突。取**闭包交集判据**：结构性、已有工具可算。
- **把 8px 做成 CSS 变量 / token**：否决。没有消费者就是死变量，且会给人「已被强制」的错觉；强制手段是机器判据（决策 7）。
- **把 `margin` / `left` / `top` 的 px 字面量拉进位移判据**：否决（R11.4）。实测 4 处 > 8px **全是布局量** ⇒ 假阳性；动画不得动 layout 属性由属性集合审计单独覆盖。
- **用类名区分双基调**：否决（R3.4）。会与既有 `ed-*` 类名空间冲突；载体用 `data-tone` 属性 + 两个缓动 token。
- **把时长 / 缓动留在 `motion.css` 双写（或在 `motion.css` 定义 `--ed-*` 私有档位变量）**：否决（R1.1）。临时接缝的文件头逐字承诺「真源完成后整块删除」；单一真源、绝不双写；T6 的档位块改为**直接覆写属性**。
- **把 `ADR-035` 并入批 8 治理收口 / 并入 `ADR-034`**：否决（同 ADR-034 的处置理由）。批 6 正是 L4 动效批，AGENTS.md §11 要求「任何技术栈/架构级变更先写 ADR」；`ADR-034` 的管辖面是 L2 壳层，合写会让引擎与判据纪律被壳层细节稀释。
- **E3 走「前端用 `dueAt` 差分自造真实间隔」**：否决（AGENTS.md「不发明数字」+ `stateJson` 的「前端透传不解析」契约）。
- **E4 出参用裸 `Option<String>`**：否决（R12.2）。装不下 `aligned` 自证量；把 `aligned` 塞进第二条命令会破坏「本批唯一新增 IPC」与「312 → 313」两条硬约束。
- **E5 走「最小方案：只暴露 `first_sample_ms` + `samples_written`」**：否决（R5.5-b）。**只修 D1，而 D2 无上界** ⇒ 交付一个会漂的播放头；逐块 `(timestamp_ms, sample_offset)` 索引**登记为日后可能的精度升级**，本批不做。
- **E5 用「继续收但丢弃」代替端点 `Stop` 实现暂停**：否决（既有语义）。`ADR-013` 逐字「端点 Stop、不喂 ASR、**不写 WAV**、时间戳补偿」；改语义不在本批范围。

## 合规性验证

> 口径同 ADR-034：每一条决策都要能在**已提交的树**上被判据钉住；「落点」= **断言所在文件**，不是「注释里提过」。⚠️ 本 ADR 写于波 A 进行中 ⇒ **状态列必读**：`✅ 已落` = 该判据已在树上可跑；`⏳ T#` = 由该任务建立（**此刻读作「已定形态、未见判据」**）。

| 决策 | 断言 | 落点 | 状态 |
|---|---|---|---|
| §1 引擎版本冻结 + 分界 + 四层配重 | 规范正文（四层表 / 分界表 / 配重）逐字在位 | `docs/standards/motion.md`（「引擎与分界规则」「四层纲领」节） | ✅ 已落（`bffed928`） |
| §2 唯一入口 + 顶层 `registerPlugin`（恰 4 个） | StrictMode 单 tween · 卸载后 `transform === ""` 且 tween 数 0 · 四插件真的注册 | 新建 `app/src/motion/engine.ts` + `app/src/motion/engine.test.ts` | ⏳ T3 |
| §3 懒加载边界（闭包交集 + 三件套） | 静态 import 文件集合 ∩ 首屏静态可达闭包 = ∅（含两个阳性对照）· 产物 `vendor-gsap-*.js` · `firstScreen.chunks` 不含它 | 新建 `app/src/motion/engine.guard.test.ts` + G8 = `app/src/build/manualChunks.test.ts:272` 改判 | ⏳ T4 / T3 |
| §4 token 单一真源（9 + 1 + `pill`） | `motion.css` 的 `--ed-*` 定义**恒 0**（回归封条）+ 真源侧计数 9/1 + 逐名逐值 == `motion.css` 原值 | `app/src/ui/primitives/style-seams.test.ts:166-188`（G4） | ✅ 已落（T5） |
| §4 `pill` = 999（真源 ↔ 唯一消费者同值） | `[3, 5, 8, 10, 999]` + `== Surface.css:58` 的兜底字面量 | `app/src/ui/tokens.drift.test.ts:55`（G9）· `app/scripts/gen-tokens.test.mjs:122/:132-136`（G14） | ✅ 已落（T5） |
| §4 生成物不手改 | 产物 == `renderAll()`（真源 → 产物漂移守卫） | `app/src/ui/tokens.drift.test.ts:25-28` 区段 | ✅ 已落（批 0-D，T5 后仍绿） |
| §5 三档载体 / 初值 / 静默降级 | `data-motion` 恰 `["eco","standard","rich"]` · `motion:intensity` 键逐字 · 无 `matchMedia` 不抛 · Storage 抛静默降级 | 新建 `app/src/motion/intensity.ts` + `intensity.test.ts` | ⏳ T6 |
| §5 **源序**：系统 reduced-motion 优先于档位 | 档位块行号 < reduced-motion 块行号（两块都在） | `app/src/ui/primitives/motion-coverage.test.ts`（新增 describe） | ⏳ T6 |
| §5 可切换 UI 入口 | 三段控件 + `aria-pressed` + 零行内 style + 无裸 `<button>` | 新建 `app/src/components/MotionIntensityControl.tsx` + `SettingsPage.tsx` | ⏳ T7 |
| §6 双基调载体与具名 ease | 两个缓动 token 落 `tokens.gen.ts`；`CustomEase.create` 后 `parseEase(name)` 是 function | `app/scripts/gen-tokens.mjs` + 生成物 2 件 + `app/src/motion/tone.ts` + `engine.ts` | ⏳ T8 |
| §7 位移 ≤ 8px（唯一出口 + 扩域） | `translate*()` 数值实参 > 8px = **0**；`motion/` 层常量 ≤ 8 | `app/src/ui/primitives/style-seams.test.ts`（扩域）或新建位移守卫 | ⏳ T9 |
| §8 确定性推进 / 双断言 / 属性集合 | 推进唯一正解 + 四禁用（底座）· 双断言模板 · 被动画属性集合 ⊆ transform 族 | 新建 `app/src/test/motionHarness.ts` · `app/src/motion/controls.ts` | ⏳ T10 / T11 |
| §8 判据纪律的机械输入 | 8 个纪律串逐字在位（守卫逐字复用） | `docs/standards/motion.md` 的「判据纪律」节 + T10 的守卫 | ✅ 规范已落 / ⏳ T10 守卫 |
| 例外 E3 | 线格式含 `intervalDays` 且既有 10 键逐字仍在（只许追加）· 精确值覆写 · 派生整天粒度 | `app/src-tauri/src/types_contract_tests.rs:34`（G11）· `flashcards` 相关 Rust 单测 | ⏳ T20 |
| 例外 E4 | 无音频 ⇒ `None` · 非法 id ⇒ `Err` · 路径越界 ⇒ `Err` · `aligned` 不得恒 true · **312 → 313** | `app/src-tauri/src/commands_audio.rs` + 单测 · `scripts/check-command-registry.mjs` | ⏳ T22 |
| 例外 E5 | 空档补静音字节数逐字算式 · 时间戳缺失/非单调 ⇒ 纯追加 + `aligned = false` 且**样本一个不丢** · 批量 ≡ 增量对拍 | 新建 `app/src-tauri/src/audio_align_tests.rs` + `audio_store_tests.rs` | ⏳ T23 |
| 例外三件套 | ① 规格 §3 就地加注 ② 本节 **待回填** → 定稿 ③ `cargo test --test app_lib_tests` 真跑 | 规格 §3（:127-134）· 本节 · `cargo test` 读数 | ⏳ T35（① ②）/ T20/T22/T23（③） |

## 登记（非本 ADR 管辖，供后续批次接手）

- **`ADR-019` 缺号**：`docs/adr/` 实盘最高 ADR-034（本 ADR 落库后最高 = ADR-035），编号序列里 **ADR-019 缺号** ⇒ 🔴 **不补、不复用，只登记**（编号规则逐字「编号一经分配不再复用」，`docs/adr/README.md` 的「编号规则」节）。
- **暗档 `data-theme` 接线 → 批 7/8**（R2.5）：`app/src/ui/tokens.css:92` 定义了 `[data-theme="dark"]`（⚠️ R2.5 / 批 6 计划表 2 写的 `:79` 是 **T5 迁移前**的读数；T5 把 12 行时长 / 缓动 token 插进 `:root` 后该块下移到 `:92`，本 ADR 取**迁移后**的行号），**全仓无写入方**（`setAttribute("data-theme"` / `dataset.theme =` 0 命中）⇒ 暗档今天**永不生效**；主题靠 8 处 `matchMedia("(prefers-color-scheme: dark)")` **一次性读取、无订阅**。本批**零动作**；批 6 新增的动效 CSS **一律 `var(--ed-*)`、不得假设亮档**、不得用 `[data-theme]` 做前提。
- **`ink-4` 与规格 §4.3 条件③（审校模式）→ 批 7/8**（R6.2）：`ink-4` 保持 **0 生产调用点**；条件③逐字「进入『审校模式』时全部升到 ≥4.5:1」，而**今天没有这个模式**。
- **`Text` 字号越界 551 处 / 120 文件 → 批 8 治理收口**（R6.3）：本批只保证「新代码不新增越界」。
- **`pinnable` 的消费方 → 本批波 C 的列折叠 Flip**（规格 §6.2 该行的「接线拖拽+记忆**或**删钩子」）：代码权威 = `app/src/shell/columnRegistry.ts:50` 的 `notes-outline` = **`true`**、其余 12 行 `false`（ADR-034 §2 加注① 已就地更正规格）。
- **五类棘轮余量 · `FROZEN_NUMERIC_ZINDEX` · `bundle-eager-graph` 的 `import type` 口径 → 均非本批**（R6.10，去向照 `docs/versions/v0.22.md` 原表：批 5/7、批 8）。
- **`docs/tech-debt/`（191,980 B / 1555 行，未入库未忽略）→ 挂起、待用户裁决**（R6.9）：本批**零动作**。
- **只能登记（仪器不可达）**：真实 60fps · Flip 几何位移 · 真实媒体播放 · `window` 级滚动 · 真机 / WebView2 观感 · 视图密度观感 · 切视图卡顿 · 惰性挂载的运行时内存效果 · 暗档实际生效 —— 清单本体在决策 8，收口报告与 `docs/versions/v0.22.md` 的批 6 节各带一份。
- **本 ADR 不管辖的邻近项**：相变两态（规格 §6.3）与列折叠 Flip 的**结构改造**（「先改结构、再上 Flip」，8 处 `ColumnBar` 落点）· 6 个签名动效的**逐条形态**（R5.1–R5.7，含 #2 的**字符率近似**「规格未定义语速函数」）· `usePresence` 本批**零改动**（R2.4）· 多窗口间的档位同步 · `%TEMP%` 导入会话无音频承载面 · sidecar 孤儿文件（`cleanup` 只扫 `.wav`）· 「删除会话不删音频」—— 均归批 6 的波 B/C/D 或后续批次，见[批 6 实施计划](../superpowers/plans/2026-09-12-frontend-redesign-batch6-motion.md)。

## 相关决策

- [ADR-034](./ADR-034-l2-shell-navigation-and-column-contract.md)：L2 壳层契约（本 ADR 的 §5 相变与 §7 列折叠 Flip 落在它的列契约上；它的「登记」节逐字把 `ADR-035 = L4 动效纲领与引擎` 归批 6）
- [ADR-033](./ADR-033-l1-primitives-and-view-layer-contract.md)：L1 原语层与视图层契约（`[data-phase]` 动效接缝 · 退场指针门控 —— 本批在其上接纲领，不改其契约）
- [ADR-032](./ADR-032-frontend-design-system-tokens.md)：前端设计系统与 token 层（`--ed-` 前缀单源生成；本 ADR 的决策 4 是它的动效子集延伸）
- [ADR-013](./ADR-013-live-session-preload-and-playback-pause.md)：实时会话预热与播放暂停驱动（**例外 E5 的暂停语义出处**，并由 T23 就地加注「WAV 轴与会话轴的对齐」）
- [动效规范（L4）](../standards/motion.md)：本 ADR 的规范载体（四层 / 分界 / 三档 / 双基调 / 判据纪律的正文）
