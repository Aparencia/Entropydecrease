# 批 6 动效系统实施计划（L4：GSAP 引擎 + token 真源 + 四层纲领 + 三档强度 + 双基调 + 相变两态 + 6 个签名动效）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **本文件当前是「前半部分」**：只含 ① 头部与 `## Global Constraints` ② `### 每个拆分任务的统一作业模式` ③ `## 实测基线` ④ `## 波次总表` ⑤ **波 A（T1–T16）的全部任务节** ⑥ `## 陷阱` ⑦ 波 B/C/D 与 `## 待裁决清单` / `## 诚实边界` / `## 收口回写八节的占位小节`。**波 B / 波 C / 波 D 的任务节由后续单元从占位处续写**。
>
> ✅ **续写状态（P2 单元，2026-09-13）**：上面那句是**编制期（P1）的状态陈述，保留原样作为历史记录**；**本文件现已完整**——波 B = **T17–T26** · 波 C = **T27–T33** · 波 D = **T34–T36**，`## 待裁决清单` / `## 诚实边界` / `## 收口回写八节` 三节已写成终态，`## 陷阱` 增加 **B8（P-1..P-18 并入）/ B9（P2 新增）**。终态任务号与单写者约束见 `## 波次总表`。

**Goal:** 把规格 §8 的 **L4 动效系统**从「只有接缝、没有纲领」建成**有纲领、有引擎、有判据**的一层，并连**承载面**一起交付：**GSAP 引擎接入（唯一入口 + `registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`）** · **动效 token 真源迁移进 `gen-tokens.mjs`（10 个 `--ed-*` + `pill` 档）** · **四层纲领（响应 / 环境 / 编排 / 生长）的机器判据** · **强度三档（`data-motion`）与双基调（`data-tone` + 两个缓动 token）** · **`prefers-reduced-motion` 优先于档位的源序守卫** · **§6.3 相变两态（采集态 58px LIVE 仪表 + 波形、复习态零 chrome 单列 640）** · **6 个签名动效（可中断、可反向、reduced-motion 降级、三档行为）** · **`usePresence` 本批零改动**。规格 §10 批 6 行的验收列逐字为：**「可中断可反向；三档正确；60fps」**。

**Architecture:** 本批**首次改动「零新增依赖」这条批 2/4/5 的硬约束**（R2.1 授权装 `gsap@3.15.0` + `@gsap/react@2.1.2`），并**首次触碰规格 §3 红线 6**（R0.1 第 1 条：新增**第三处**经批准的后端契约例外，只读、不新增表、不改既有字段与 SQL 语义）。改动分四波：**波 A 地基与纲领**（规范 + ADR + 引擎 + token 真源 + 三档 + 双基调 + 响应/环境层 + 守卫改判）→ **波 B 承载面**（相变两态 + LIVE 仪表/波形 + 到期刻度 + 时间轨/播放头）→ **波 C 6 个签名动效** → **波 D 收口**。**波内可并行，波间串行**（波 B 依赖波 A 的引擎与 token；波 C 依赖波 B 的承载面）。唯一 GSAP 入口 = `app/src/motion/engine.ts`；**离线可降级**：引擎加载失败或 `prefers-reduced-motion: reduce` 时一律跳终态（无 JS 依赖的 CSS 路径仍在）。

**Tech Stack:** Tauri 2.11.5 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6 · Vitest 4.1.11（全局 `environment: "node"`；组件测试首行必须 `// @vitest-environment jsdom`；**无 jest-dom / 无 user-event**）· Node 24（`scripts/*.mjs` 门禁）· **新增**：`gsap@3.15.0` + `@gsap/react@2.1.2`（零传递依赖；GSAP 2025 起全插件免费，含 Flip/ScrollTo/CustomEase）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（**§3 红线 6 与两处既有例外** · **§4.3 条件③** · **§6.2 列契约** · **§6.3 相变两态** · **§7.3 三条硬约束** · **§8 全节（8.1 四层纲领 / 8.2 引擎与分界规则 / 8.3 双基调 / 8.4 token 与清单 / 8.5 强度三档 / 8.6 六个签名动效 / 8.6.1 四条硬约束）** · **§10 批 6 行** · **§11 验收 5/10** · **§12** · **§13** · **§14**）

**控制方裁决指针（硬输入，不许重新论证、不许削弱、不许绕过）:** **本地路径 `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/rulings.md`（R0–R10，共 266 行；本计划的最高行动依据）**。该目录整体 gitignored、**永不入库**，故此处**不给相对链接**（先例：批 4 计划曾因一条指进 `.superpowers/` 的相对链接让导出树 `docs-check` 必红，修复提交 `0228a013`）—— 需要读裁决的读者请在本地工作树按上述路径打开。同目录另有三份侦察与一份尖刺：`recon-a-motion-infra.md`（1369 行）· `recon-b-signature-sites.md`（842）· `recon-c-followups-and-limits.md`（1109）· `spike-gsap-runtime.md`（726）。

**输入材料（开工前六份，优先级即此序）**

1. **本计划的 `## 实测基线`**（计划者在 `dev@6cbe964e` 实跑八条门禁 + 逐文件 `countLines()` 亲测得到；**下游任何任务都不得引用侦察里"批 5 未收口"时点的读数** —— 那些会被本批基线整体替换）
2. **控制方裁决 R0–R10**（本计划的**行动依据**；每条的执行形态见 `## Global Constraints` 的 R 系列压缩表，**不许削弱、不许绕过**）
3. 规格对应节（上列 `Spec` 的全部节）
4. **格式母本**：[批 5 视图层计划](./2026-09-12-frontend-redesign-batch5-view-layer.md)（1840 行；本计划的章节骨架、Global Constraints 写法、任务节格式、`### 每个拆分任务的统一作业模式`、`## 实测基线`、`## 待裁决清单`、`## 诚实边界`、`## 收口回写` 全部照它）· 姊妹计划 [批 4](./2026-09-12-frontend-redesign-batch4-primitives.md)（1964 行）· [批 2](./2026-09-11-frontend-redesign-batch2-bundle.md) 的 **Task 5**（GSAP 懒加载判据的原始出处）
5. **`docs/versions/v0.22.md` 的批 3 / 批 4 / 批 5 三节**（交接项与「诚实代价」的写法；批 6 收口同七段结构）
6. **`.superpowers/sdd/DISPATCH-TEMPLATE.md`**（实施者纪律，最高优先）· **`.superpowers/sdd/REVIEW-TEMPLATE.md`**（评审者纪律；若不存在则以 DISPATCH-TEMPLATE 为准）

---

## Global Constraints

- **本批范围（规格 §10 批 6 行逐字）**：`| **6 动效系统** | GSAP 接入 + token + 四层 + 三档 + 相变两态 + 6 个签名动效 + \`usePresence\` | 可中断可反向；三档正确；60fps |`（规格 `:658`，**本计划者逐字复核**）。验收列 3 条**全部是前端面**，无 Rust 项 —— 但 R0.1 第 1 条因 #4「刻度生长」把**只读后端契约**纳入本批，故 Rust 侧仍有改动，`cargo test` **必跑**。
- **★ 用户裁决「B · 连承载面一起建」的三条硬后果（R0.1，不许打折）**
  1. **规格 §3 红线 6「后端数据模型零改动」新增第三处例外**，必须：① 规格 §3 就地加注（带原因/影响面/回滚）；② `ADR-035` 单列「后端契约例外」节；③ `cargo test --test app_lib_tests` **本批必须真跑**（`line-limits --full` 之外再加一条），**不得**把「未跑」写成「已跑」。
  2. **验收面 = 9 个**（6 个签名动效 + 相变两态 + 承载面 3 项里的 LIVE 仪表/波形、到期刻度、播放头/时间轨）。逐条给兑现度，**未兑现的必须逐条带「为什么」与去向**。
  3. **`usePresence` 之外的「B9 中间态声明」在本批到期作废** —— 批 4/批 5 的「只有接缝、没有纲领」声明**在本批作废**；批 6 收口**必须**给出「动效系统已交付什么、未交付什么」的**二分清单**，不得笼统声称「已交付」。
- **★ 本批范围（用户裁决原文，R0.1 逐字）**：「批 6 追加三个新界面：采集态 58px LIVE 仪表+波形、到期刻度视觉、播放头/时间轨+音频播放。#4 要动后端契约（规格 §3 红线 6 需新增例外+ADR），#5 要接音频文件路径与播放（碰 Rust）。批 6 体量翻倍，验收面从 6 个变 9 个。」
- **★ 本批的非目标清单（违反即任务失败）**
  1. **不做 §12「登记不排期」四项里的任何一项**（R0.2）：`滚动驱动动效 · 图谱浮现 · 笔记树生长 · 熵减收拢`。**§8.6 的 6 个签名动效被 §12 登记为不排期的是 0 个** ⇒ 承接 6 个签名动效**不**违反 §12；**批 6 若顺手做「图谱浮现」必须先请裁**。
  2. **不做暗档接线**（R2.5）：`data-theme="dark"` **本批零动作**（实测：`tokens.css:79` 定义了它、**全仓无写入方** ⇒ 暗档今天永不生效；主题靠 8 处 `matchMedia("(prefers-color-scheme: dark)")` **一次性读取、无订阅**）。本批只**登记**，去向批 7/8。但本批新增的动效 CSS **不得假设亮档**（一律 `var(--ed-*)`，受 `style-seams.test.ts:238` 的「`primitives/*.css` 零颜色字面量」约束）。
  3. **`usePresence` 本批零改动**（R2.4）：不扩 `propertyName`、不改签名。GSAP 路径的「多属性不等时长」用 GSAP timeline 的 `onComplete` 解决；确需挂载/卸载时机 hook 时**新建** `app/src/motion/useMotionPresence.ts`（≤80 行）而**不动**既有 hook。
  4. **不做 `ink-4` 与 §4.3 条件③**（R6.2 / 批 4 裁决）：`ink-4` **保持 0 生产调用点**（实测：`app/src/**` 里 `ink-4` 的生产调用点 **0**，只有 `Text.css:35` 的类规则 + 类型联合 + 守卫）。→ 直接后果见 `## 陷阱` #B6-①（环境层「未确认段落墨度起伏」**今天没有 DOM 落点**）。
  5. **不做 `Text` 字号越界 551 处 / 120 文件**（R6.3）：就地加注 + 登记**批 8 治理收口**；批 6 只保证「新代码不新增越界」。
  6. **不做 `docs/tech-debt/` 的任何动作**（R6.9，挂起待用户裁决）：`git status --porcelain` **全批必须始终只有 `?? docs/tech-debt/` 一个条目**。
  7. **不做「笔记轨」三轨**（规格 §8.6 批 5 加注 `:547-550`）：签名动效 #1「对齐」的**第三轨 = OCR 文字**，不是「笔记」。
  8. **不做 Flip 的几何位移验收**（R5.7 + 尖刺 S2.6）：jsdom 里 `Flip.getState` 的 `bounds` 全 0、`Flip.from()` 的位移增量恒 `translate3d(0px,0px,0px)` ⇒ **几何位移零可观测**，只能登记/headless。
  9. **不做真实帧率验收**（R8.4）：`60fps` 只能出现在「未测」与「代理判据」两处；**批 6 收口不得出现「60fps 已达成」类表述**。
- **★★ R0–R10 压缩表（每条一行：编号 + 裁决要点 + 本批执行形态；结论一字不改）**

  | # | 裁决要点（压缩，不改结论） | 本批执行形态（任务 / 判据 / 登记） |
  |---|---|---|
  | **R1.1** | **单一真源，绝不双写**：批 6 之后 `app/scripts/gen-tokens.mjs` 是时长/缓动 token 的**唯一真源**；`motion.css` 里**不得**再出现 `:root{}` 的 `--ed-dur-*` / `--ed-ease` 定义 | **T5**（迁移 + 删块）+ **T5 的新判据**「motion.css 的 `--ed-*` 定义恒 0」 |
  | **R1.2** | 「为批 6 预留」的守卫**到期改判，不删除**：换等价或更强判据 + **必须**附专属变异体 + 报告逐条点名「旧判据原文 / 新判据 / 变异体 / 为什么更强」；**禁止** `it.skip` / 删除 / 放宽为恒真 | **T14**（G1/G2/G3/G6）+ **T15**（G-1..G-4）+ **T3**（G8）；逐条四要素 |
  | **R1.3** | **既有断言的改动必须逐条授权**：本批**授权**的既有断言**仅限** R6 系列点名的那些（7 条 + `drift.test.ts:52`）。清单外**任何**既有断言的改动 = **STOP 报告请裁** | **实测发现 3 条清单外必红断言** ⇒ 见 `### 表 5`，**默认按「必要连带」执行**、报告逐条点名；控制方否决则 STOP 回退 |
  | **R1.4** | 判据不得以「风格正确」代替「行为正确」：每条新判据必须能在**变异体**下变红；**不许快照、不许源码文本断言**（除守卫文件本身的静态守卫，那类必须**同时**给行为判据）。四大类可用判据 = 确定性时序 · tween 计数+属性值双断言 · 被动画属性集合审计 · DOM 结构/类名/属性 | 每个任务的 **Verification** 表逐行给「判据 ↔ 变异体 ↔ 期望」；静态守卫（T4/T11/T12/T13 的名单/扫描类）**一律配一条行为判据** |
  | **R1.5** | **每个任务八门禁 + 干净树**：`line-limits --full` · `docs-check` · `check-command-registry` · `tsc --noEmit` · `vitest run` · `cargo test`（本批有 Rust 改动 ⇒ **必跑**）· `check-bundle-budget`（跑真实构建的任务）· `bundle-eager-graph`（跑真实构建的任务）。每条给命令 + exit + 读数 | `## 实测基线` 表 1 = 基线读数；每任务报告的「八门禁读数组」 |
  | **R1.6** | **提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`；新文件两步 `git add -- <path>` 再 `--only`；**禁止** `git add -A` / `git add .` / `stash` / `checkout --` / `restore` / `clean` / `reset --hard` / `--no-verify` / `add -f` / `amend` / `rebase`；subject ≤50 字、动词开头、无句号。**临时文件只许写批次 `tmp/<unit>/`** | 见 `★ 提交纪律` |
  | **R2.1** | **GSAP 只经 `import()` 落 `vendor-gsap` 懒 chunk —— 三件套判据 + 专属守卫**：版本冻结 `gsap@3.15.0` + `@gsap/react@2.1.2`；判据 ① 产物出现 `vendor-gsap-*.js` ② `check-bundle-budget --no-build --json` 的 `firstScreen.chunks` **不含**它 ③ `app/src/**` 里**静态** `from "gsap"` / `from "@gsap/react"` 命中 **0**（只许 `await import()`）；**新增守卫文件**（≤200 行）+ **各带变异体**；授权修 `manualChunks.test.ts:272`（**不是**改断言） | **T3**（装 + 入口 + G8）+ **T4**（守卫）；⚠️ **判据 ③ 与 R2.2 的 `registerPlugin(useGSAP, …)` 互斥** ⇒ 精确化见 `### 表 4` 的 **S1** 与「R2.1③ 精确化」 |
  | **R2.2** | **全仓唯一 GSAP 入口 = `app/src/motion/engine.ts`**，该模块**必须**在顶层执行 `gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`。依据（尖刺最重要的单条发现）：不 register 时 `useGSAP()` **防不住 React 19 StrictMode 双 tween**（裸 `useEffect` = 2 个 tween，`useGSAP()` **也是 2 个**，卸载后 `transform` 残留）；根因 = **gsap 双实例**（`gsap` 的 `exports["."]` 把 `import→index.js` / `require→dist/gsap.js` 分成两个物理文件，`@gsap/react@2.1.2` **无 `exports`**、`main` 指 CJS ⇒ Vitest external 后它拿到 **CJS 运行时**、app 拿到 **ESM 运行时**，两个 `_context` ⇒ `context.revert()` **静默空转、无任何警告**）。`registerPlugin(useGSAP)` 后：StrictMode **1 个 tween**、卸载后 `transform=""` 且 tween 数 0。（**浏览器构建不受影响**：Vite 认 `module` 字段 —— **这是测试底座独有的坑**，写进 `ADR-035` 与 `## 陷阱`） | **T3**（引擎 + registerPlugin）+ **T3/T10** 的 StrictMode 判据 |
  | **R2.3** | **动效 token 真源迁移**：把 `motion.css:37-56` 的 **10 个**变量逐字迁进 `gen-tokens.mjs` ⇒ `tokens.css` + `tokens.gen.ts`，**然后删除** `motion.css` 的临时 `:root{}` 块；**同时补 `pill` 档**（登记项 F5；实测四文件 `pill` 各 0 命中、`git log -S pill` 空；`radiusScale` 今日 `stamp3/control5/panel8/overlay10`；`tokens.drift.test.ts:52` 仍是 `toEqual([3,5,8,10])`）；`pill` 的 px 值**取既有原语层兜底值**（**执行者实测后逐字登记**，不许自创）；授权（**唯一**）：`app/src/ui/tokens.drift.test.ts:52` + `app/src/ui/primitives/style-seams.test.ts:179`；⚠️ **登记路径更正**：批 5 台账写的 `ui/primitives/tokens.drift.test.ts` **不存在**，真路径 = **`app/src/ui/tokens.drift.test.ts`** | **T5**（迁移 + pill + G4/G9）；**本计划者已实测 `pill` 的既有兜底值 = `999px`**（全 `app/src` 唯一命中 `app/src/ui/primitives/Surface.css:58`）⇒ 见 `### 表 4` 的 **S3** |
  | **R2.4** | **`usePresence` 本批零改动**（200 行；三相位 `enter/entered/exit`；`transitionend`（只认本节点）+ `exitMs`(160) + `timeoutSlackMs`(80) 兜底；`matchMedia` 自带守卫）。**不扩 `propertyName`**、不改签名。确需挂载/卸载时机 hook ⇒ **新建** `app/src/motion/useMotionPresence.ts`（≤80 行） | **本批零动作**（非目标 3）；波 B/C 若确需 ⇒ 新建文件 |
  | **R2.5** | **`data-theme="dark"` 本批零动作**（实测 `tokens.css:79` 定义、全仓无写入方；8 处 `matchMedia("(prefers-color-scheme: dark)")` 一次性读取、无订阅；无外观设置页、无 theme localStorage 键）。暗档接线属**批 7/8**，本批**只登记**；新增动效 CSS **不得假设亮档** | **T1**（规范里写明）+ **本批新增 CSS 一律 `var(--ed-*)`**；受 `style-seams.test.ts:238` 约束 |
  | **R3.1** | **档位载体 = `data-motion` 写在 `<html>` 上**，取值逐字 `"eco"｜"standard"｜"rich"`，默认 `"standard"`；🔴 **硬约束**：`motion.css` 内**档位规则块必须写在 reduced-motion 块之前**；并**新增一条守卫**断言这个源序（带变异体）。依据 §8.5 逐字「系统 `prefers-reduced-motion` **优先于档位**」 | **T6**（通道 + 源序守卫）；**实测支持**：`app/src/**` 今天 `documentElement` **0 命中**、`data-motion` **0 命中** |
  | **R3.2** | **持久化 + 初值**：键逐字 = **`motion:intensity`**；照 `app/src/views/useViewMemory.ts`（**70 行，顶格**）范式（三纯函数 + 注入 `Storage` + `globalThis.localStorage` 默认值 + 惰性读取 + 静默降级）；新文件预算 **≤60 行**；**初值 = 跟随系统**（`prefers-reduced-motion: reduce` ⇒ `"eco"`，否则 `"standard"`）；`matchMedia` **必须自带守卫**（尖刺实测 jsdom 30.0.1 **没有** `window.matchMedia`）；⚠️ 测试桩**必须**实现 `addListener`/`removeListener`（GSAP 走 legacy 分支） | **T6**（纯函数 + hook）+ **T10**（桩） |
  | **R3.3** | **必须有可切换的 UI 入口**（否则「三档正确」不可验收）：`SettingsPage` 增加**「动效强度」三段控件**（新组件 `app/src/components/MotionIntensityControl.tsx`，预算 ≤120 行，走既有 `ed-btn` 段控件类名空间 + `aria-pressed`，**零行内 style**）。**不做**完整外观/主题设置页（批 7/8） | **T7**；⚠️ **实测硬约束**：该文件落在 `nativeButton.ratchet` 的**域内**（`app/src/components/**` 非 test）⇒ **不得渲染裸 `<button>`**，否则 `FROZEN_NATIVE_BUTTON_TOTAL=393` 与新文件计数立刻红 ⇒ 实现必须**复用 `ViewSwitcher` 原语**（见 `## 陷阱` #B7-②） |
  | **R3.4** | **双基调 = `data-tone` 属性 + 缓动 token 双档，不按类名分**。登记面 = 每个动效落点显式声明基调：`data-tone="instrument"`（有「读数」的界面：采集/复习/时间轴/到期刻度）｜`data-tone="paper"`（有「文字」的界面：笔记/会话/体系）。缓动落点：`tokens.gen.ts` 新增两个缓动 token（精密仪器 `power3.inOut` 族 / 活的纸 `power2.out` + 自定义「洇开」曲线，**带惯性沉降、不是回弹** —— §8.3 逐字）；GSAP 侧经 `CustomEase.create()` 注册具名 ease。**禁止**在 CSS 里用类名区分基调 | **T8**（token + 具名 ease + 单调性判据） |
  | **R3.5** | **§8.4「位移上限 8px」= 可测判据，不是形容词**：全仓 `app/src/**` 的 `translate*` / `margin` / `left/top` 位移字面量（剥注释后）**不得超过 8px**；GSAP tween 的位移参数经 `motion/` 层集中定义（**唯一出口**）+ 新增守卫生效。`--ed-dur-*` 的既有 10 个值**逐个对照 §8.4 逐字**（`recon-a` A1：**全部存在、值全对**，且比 §8.4 多出 overlay 200/160 与 toast 180/140 四档 ⇒ **§8.4 已覆盖，无需改值**） | **T9**（唯一出口 + 扩域守卫）；⚠️ **本计划者实测**：全仓 `translate*()` 数值实参 **0 处 >8px**（18 处 translate、10 处数值实参，最大 8px）⇒ 扩域**零存量白名单**可行；而 `margin`/`left`/`top` px 字面量有 **4 处 >8px**（全是**布局量**）⇒ 守卫**不判**它们，逐字登记（见 `### 表 4` 的 **S4**） |
  | **R4.1** | **`--ed-nav-h` 保持 56px 不动，新增 `--ed-nav-h-live: 58px`**。依据：`shell/navHeight.consumption.test.ts:130-146` 把域内每个 `var(--ed-nav-h, <N>px)` 的兜底字面量**硬绑 token 真源** ⇒ 改 56 会让该判据无处成立。⇒ **零既有断言改动**即可实现采集态 58px | **波 B**（T17 起）；**波 A 不动** |
  | **R4.2** | 三条既有「禁止动效」断言按 R1.2 改判（**授权**）：`shell/TopBar.css:5-6` 文件头禁令 + `shell/TopBar.test.tsx:139-143`；`shell/ShellFallback.test.tsx:58-63`；`ui/primitives/ViewSwitcher.test.tsx:222-223`。⚠️ **不动**：`Loading.test.tsx:177`（恰 2 个 keyframes）与 `:204`（禁第二条媒体查询）—— 依据 §8.6.1 分桶裁定「keyframes 桶只留 `Loading`/`Skeleton`/`Probe`」 | **T14**（G1/G2/G3）；**G5 零动作** |
  | **R4.3** | 采集态「波形」用 **div 条阵列**建，**禁止 SVG**（`no-inline-svg.test.ts` 明禁内联 SVG；今天只有 `AudioLevelMeter.tsx`(88) 的 12 段离散色块，全仓 `波形｜waveform` **0 命中**）。新建 `app/src/components/Waveform.tsx`（预算 ≤150 行）；LIVE 仪表 = 波形 + 计时 + 暂停/标记/停止（数据源 IPC 事件 `live:audio-level`，载荷 `{ rms: number; clipping: boolean }`，后端每音频块 200ms 推一次）。⚠️ 改 `AudioLevelMeter` 的 DOM 会**动三处棘轮台账**（`statusLineBaseline` 3 / `surfaceBaseline` 1 / `textBaseline` 3）⇒ **优先新建** `Waveform` 而不改既有组件的 DOM | **波 B**（T17 起） |
  | **R4.4** | 复习态「零 chrome + 单列卡片居中 640」（§6.3 逐字）。壳层新增相变态通道（`data-shell-phase="capture｜review｜idle"`）。「相变 chrome 用**绝对定位交叉淡入**，**不 animate height**」（§8.4 逐字）—— **硬判据**：守卫断言相变容器**不含** `height` transition/animate | **波 B**（T17 起） |
  | **R4.5** | 「琥珀退去」的琥珀逐字锁定 = **`--ed-due` 族**（实测 `tokens.gen.ts:25` `due` 的 usage 逐字含「到期刻度 / 低置信点线 / 记忆语义文字」）⇒ 相变凝固的「琥珀退去」= 采集态 LIVE 仪表/暂停徽标的 `--ed-due` 族元素在转入常态时**墨度退到常态档**。**不许**新造琥珀值 | **波 B/C** |
  | **R5.1–R5.7** | 6 个签名动效 + 列折叠 Flip 的逐条形态裁定（#1 对齐 = 三轨按 `data-ms` 共轴 + 非对齐轨位移偏移 ≤8px + 第三轨 OCR；#2 显影编排落**课后** `SessionRawView`，节奏近似 = `text.length / (end_ms - start_ms)`**字符率**，🔴 文件头必须逐字写明「这是字符率近似；规格未定义语速函数」；#3 相变凝固载体 = `Waveform` + `--ed-due` + 域 Tab 行；#4 刻度生长须**先探针**后端是否已有 interval，禁止前端自造「真实间隔」；#5 时间码回跳**必须先跑音频可得性探针**，判否即 STOP；#6 记忆浮现四件（**用 `x` 而非 `letterSpacing`** = 硬判据）；#7 列折叠**先改结构（同宿主 + 宽度变化）再上 Flip**，几何位移**只能登记/headless**） | **波 C**（#1–#6 + Flip）；`SessionTriTrackView.tsx`（**207 行**）· `SessionRawView.tsx`（157）· `ReviewPage.tsx`（231）· `components/review/ReviewSessionPanel.tsx`（231）· `NoteMarkdown.tsx`（**266 行**，实测 ≠ recon-b 的 244）· 7 处列折叠页面 |
  | **R6.1–R6.10** | 承接/登记表：**R6.1** `pill` 档四处 ✅ 并入 R2.3 · **R6.2** `ink-4` 与 §4.3 条件③ ❌ 不承接（保持 0 调用点，加注 + 登记批 7/8）· **R6.3** 字号越界 551 处/120 文件 ❌ 不承接（登记批 8；可达上限 526 因 11 文件/25 处在 `NON_MIGRATED_14`）· **R6.4** `textBaseline.ts` **297 行**：🔴 **只许改 1 行**（`:174` 的「558/120 不变」→ 实测 **551/120**），**不许加行** · **R6.5** 守卫自证缺口 **G-1..G-4** ✅ 承接（独立任务，四条各补 1 个**专属变异体**）· **R6.6** `pinnable` 文本三处冲突 ✅ 就地更正规格 `:398` 与 `:647`（代码权威 = `shell/columnRegistry.ts:50` 的 `notes-outline` = **`true`**）· **R6.7** `docs/standards/` 新增动效规范章节 ✅ **批 6 做**（必须先于动效代码）· **R6.8** `ADR-035` ✅ 批 6 写 + 进索引 · **R6.9** `docs/tech-debt/` ⏸ 挂起、零动作 · **R6.10** 五类棘轮余量 / `FROZEN_NUMERIC_ZINDEX` / `bundle-eager-graph` 的 `import type` 口径 ❌ 均非批 6 | **T5**（R6.1）· **T16**（R6.4 + R6.6）· **T15**（R6.5）· **T1**（R6.7）· **T2**（R6.8） |
  | **G1–G10** | 守卫改判清单（逐条授权 + 逐条要变异体）：**G1** `shell/TopBar.test.tsx:139-143` 改判 · **G2** `shell/ShellFallback.test.tsx:58-63` 改判 · **G3** `ui/primitives/ViewSwitcher.test.tsx:222-223` 改判 · **G4** `ui/primitives/style-seams.test.ts:179` 改判为 **0** · **G5** `Loading.test.tsx:177`/`:204` 🔴 **不动** · **G6** `ui/primitives/style-seams.test.ts:192` 改判（块位置唯一不变、名单可增长、必须落在档位块之后）· **G7** `ui/primitives/motion-coverage.test.ts:141` 🔴 **不动**（§11-5 的判据本体）· **G8** `manualChunks.test.ts:272` 按自带正解修 · **G9** `ui/tokens.drift.test.ts:52` 改判 · **G10** `shell/navHeight.consumption.test.ts:130-146` 🔴 **不动** | **T14**（G1/G2/G3/G6）· **T5**（G4/G9）· **T3**（G8）· **G5/G7/G10 零动作** |
  | **R8.1** | **确定性推进（唯一正解）**：`gsap.timeline({paused:true})` + `tl.time(t)`。🔴 **禁用**：`gsap.updateRoot(t)`（被漂移的 `globalTimeline._start` 偏移，实测 0→0.105→0.199）· `gsap.ticker.tick()`（墙钟驱动）· `gsap.ticker.sleep()`（新建 tween 会同步唤醒并立刻跑一帧）· `await sleep()` / 真实定时器 / fake timers。实测精度：`power2` tween 在 `tl.time(0.25)`（dur 0.5、x:0→100）⇒ `translate3d(87.5px,0px,0px)` **逐字精确** | **T10**（harness + 纪律入册）+ **T11**（模板） |
  | **R8.2** | **可中断判据必须双断言**：**同时**断 `gsap.globalTimeline.getChildren().length`（或旧 tween 的 `totalTime()` 冻结）**与**目标元素 `style.transform`。依据：GSAP 3 默认 `overwrite:false` ⇒ 覆盖同属性时**旧 tween 仍在跑**，**只看 `style.transform` 会假绿** | **T11**（`controls.ts` 唯一出口 + 双断言模板） |
  | **R8.3** | 两条 API 陷阱：`tl.to()` 返回 **Timeline 本身**不是 Tween（要拿 tween 用 `tl.to(...).getChildren()` 或 `gsap.to`）· **绝不可把 jsdom 的 `performance` 挂到 `globalThis`**（`Performance-impl.js:14` 自调用 ⇒ 栈溢出） | `## 陷阱` #B2-①/#B2-②；**T10** 的 harness **不得**挂 `performance` |
  | **R8.4** | **「60fps」= 只能登记/headless，机器判据用属性集合代理**：审计被动画的 CSS 属性集合 **⊆ {transform, translate, rotate, scale, opacity, filter}**（即**未动 layout 属性**）。实测对照：动 `x+opacity` 只写 `translate/rotate/scale/transform/opacity`；动 `width` 会写 `width`。🔴 收口**不得**出现「60fps 已达成」类表述 | **T11**（属性集合审计守卫）+ **波 D** 措辞纪律 |
  | **R8.5** | **契约/结构类判据优先**：凡能落成 **DOM 结构 + `data-*` + 类名 + 属性值** 的，优先于时间判据。`data-motion` / `data-tone` / `data-shell-phase` / `data-phase` 是本批的四个结构锚点 | 全部任务：优先结构判据，时间判据只在必须时用 |
  | **R8.6** | **变异体纪律（照批 4/5）**：每变异**新解一棵树** · **CONTROL 在冻结提交树上取** · harness **把「跑到了断言（用例数 >0）」与「跑红了」分开判** · **禁 `--reporter=basic`**（Vitest 4 已移除 ⇒ 伪装的红 = 假证明） · **变异体实验不得与全量测试并发**（`KnowledgeGraphView.test.tsx` 的负载敏感 flake；批 4 判定「已加固、未复现」） | **T15** + 每个任务的 Verification 表 |
  | **R8.7** | **「0 命中」必须点名仪器 + 双侧自证**；**文本扫描先剥注释**（正解先例 `sliceScan.ts` 的 `stripComments`）；**中文串一律不经 PowerShell 字符串层**（PS 5.1 按 GBK 误解码 ⇒ 假 0 命中） | `★ 仪器纪律` |
  | **R8.8** | **贴边文件（动手前先量）**：`textBaseline.ts` **297** · `dialogMigration.e.test.ts` **300（零余量 ⇒ 禁止再碰）** · `emptyStateRatchet.test.ts` **296** · `style-contract.test.ts` **296** · `style-seams.test.ts` **288** · `buttonMigration.test.ts` **280** · `NotesReadingColumn.views.test.tsx` **280**。新文件一律 **≤300**，且**创建时**就棘轮干净 | 见 `★ 贴边文件表`（**本计划者逐个实测复核**） |
  | **R8.9** | **本批必须真跑 `cargo test --test app_lib_tests`**（R0.1 第 1 条），并给逐字读数；`check-command-registry.mjs` 的计数（今日 **312/312/0**）随新命令同步 | **本计划者已实跑**（见 `### 表 1` 第 8 行）；每个动 Rust 的任务重跑 |
  | **R0.2** | 本批**不**触碰 §12「登记不排期」四项中的任何一项；批 6 若顺手做「图谱浮现」**必须先请裁** | **非目标 1**；波 C 的 6 个签名动效**不在**该四项内（实测：§8.6 的 6 个被登记为不排期的是 **0 个**） |
- **★ 行数纪律（唯一有效口径）**：单文件 **≤300 行**（**全部行数、含空行**），口径 = `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` == `scripts/line-limits.mjs` 的 `countLines()`。⚠️ **绝不使用** `Get-Content`（本机 PS 5.1 按 GBK 解码，**少算可达 56 行**；实测最大 `live_session_pause.rs` 353→297，连硬限违规都能读成合规）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾不带换行的文件少算 1，本仓有 8 个这样的源文件）。
  - 🔻 **R11.8 第 1 条逐字（措辞校准，本计划全文适用）**：「**`scripts/line-limits.mjs:23` 的 `SOURCE_EXT = /\.(ts|tsx|rs)$/`** ⇒ **`.css` 与 `.mjs` 不在行数门禁视野内**（控制方已自核该行）。⇒ 所有「新文件 ≤300」的承诺**必须**写成「**`.ts`/`.tsx`/`.rs` 新文件 ≤300**」；**不得**用「CSS 不算」当放宽理由（`motion.css` 仍按 ≤300 自律）」。⇒ **本计划凡写「新文件 ≤300」处，一律读作「`.ts`/`.tsx`/`.rs` 新文件 ≤300」**；`.css`/`.mjs` 只给**预算**、并在超预算时**如实登记为「门禁视野外」**。
  - **新 `.ts`/`.tsx`/`.rs` 文件 ≤300 且不许 `--write` 登记**（301–600 档要登记；>600 必须硬拆）。`line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 当前为空（`>600` 零容忍）。
  - 🔴 **计划里每个任务给的「预算行数」是估算，不是绑定约束**；**绑定约束是 ≤300 且不新增豁免登记**。⇒ 实施者**不得为落进预算而删判据**；超预算**登记即可**，但**超过 300 必须拆**。
  - ⚠️ **本计划者实测的门禁视野（重要，别自造门禁）**：`scripts/line-limits.mjs:23` 的 `SOURCE_EXT = /\.(ts|tsx|rs)$/` ⇒ **`.mjs` 与 `.css` 都不在行数门禁视野内**。故 `app/scripts/gen-tokens.mjs`（269）、`app/src/ui/primitives/*.css`、`app/vitest.config.ts`(23) 之外的一切 `.mjs` **涨行不会被任何门禁拦**。⇒ 本计划对 `.mjs`/`.css` 只给「预算」不设硬判据（设了就是自造门禁）；若确实超 300，**如实登记为「门禁视野外」**，不要假装被守住。
- **★ 贴边文件表（本计划者 2026-09-13 在 `dev@6cbe964e` 逐文件实测；列 = 实测行数 / 余量 / 本批纪律）**

  | 文件 | 实测 | 余量 | 本批纪律 |
  |---|---:|---:|---|
  | `app/src/ui/primitives/dialogMigration.e.test.ts` | **300** | **0** | 🔴 **禁止再碰**（承载 `DIALOG_20` / `NON_MIGRATED_14` 两条硬守卫；R8.8 逐字） |
  | `app/src/ui/primitives/textBaseline.ts` | **297** | 3 | 🔴 **只许改 1 行、不许加行**（R6.4；T16）。改后必须仍 **297** |
  | `app/src/ui/primitives/style-contract.test.ts` | **296** | 4 | ⚠️ T5 要改 `:233` 一条断言（**清单外，见 `### 表 5`**）⇒ **净增行数必须 = 0** |
  | `app/src/ui/primitives/emptyStateRatchet.test.ts` | **296** | 4 | 本批**零改动** |
  | `app/src/ui/primitives/Modal.test.tsx` | **296** | 4 | 本批**零改动**（`confirmMigration` 同域） |
  | `app/src/build/manualChunks.test.ts` | **292** | 8 | ⚠️ T3 要改 `:272` 一条断言（G8，授权）⇒ **净增行数必须 ≤ +8，设计为 0** |
  | `app/src/ui/primitives/style-seams.test.ts` | **288** | 12 | ⚠️ T5（G4）+ T14（G6）+ T9（位移域）都要动它 ⇒ **三个任务串行、共用同一个写者队列**；每次提交后必须复测行数 |
  | `app/src/ui/primitives/Button.test.tsx` | **286** | 14 | 本批零改动（除非 T12 加焦点环判据 ⇒ 只许**追加**） |
  | `app/src/ui/primitives/usePresence.test.tsx` | **282** | 18 | 本批**零改动**（R2.4） |
  | `app/src/ui/primitives/buttonMigration.test.ts` | **280** | 20 | 本批**零改动**（B1/B2 守卫） |
  | `app/src/components/notes/NotesReadingColumn.views.test.tsx` | **280** | 20 | ⚠️ 波 C 的列折叠 Flip 可能触及 ⇒ **波 A 零改动**（T15 只做变异实验，不改它） |
  | `app/src/shell/TopBar.test.tsx` | **230** | 70 | T14 改判（G1）⇒ 净增 ≤ +20 |
  | `app/src/ui/primitives/ViewSwitcher.test.tsx` | **225** | 75 | T14 改判（G3）⇒ 净增 ≤ +20 |
  | `app/src/views/session/SessionTriTrackView.tsx` | **207** | 93 | 波 C 的 #1 落点（R5.1） |
  | `app/src/components/NoteMarkdown.tsx` | **266** | 34 | ⚠️ **实测 266 ≠ recon-b 的 244**（代码权威）；波 B/C 的 `[[ts:ms]]` 落点 |
  | `app/src/ui/tokens.gen.ts`（生成物） | **61** | — | 由 `gen-tokens.mjs` 重生成，**永不手改** |
  | `app/src/ui/tokens.css`（生成物） | **100** | — | 同上 |
  | `app/scripts/gen-tokens.mjs` | **269** | — | ⚠️ `.mjs` **不在行数门禁视野内**（`SOURCE_EXT` 不含 `.mjs`）⇒ 只给预算（≤320） |
  | `app/src/ui/primitives/motion.css` | **74** | — | ⚠️ `.css` **不在行数门禁视野内** ⇒ 只给预算（T6 后 ≤180、T12 后 ≤240、T13 后 ≤300） |
- **★ 门禁基线表（`dev@6cbe964e`，计划者本轮实跑；见 `## 实测基线`）**

  | 门禁 | 基线 |
  |---|---|
  | `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 122 · 登记条目 122** |
  | `node scripts/docs-check.mjs` | exit 0（扫描 **277** / 检查 **177**，五项全 ✅） |
  | `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** |
  | `cd app; npx tsc --noEmit` | exit 0（**0 错**）· ⚠️ **必须单独跑**（vitest 用 esbuild 剥类型、不做类型检查） |
  | `cd app; npx vitest run` | exit 0 · **184 文件 / 1770 用例 / 0 失败 / 0 skip**（`numTotalTestSuites 647` · `testResults.length 184` · ⚠️ **`numTotalTestFiles` 字段在 vitest 4.1.11 里不存在**，文件数只能用 `testResults.length`） |
  | `node scripts/check-bundle-budget.mjs --no-build` | exit 0 · 首屏 3 chunk：`index-Bn5oI23G.js` 108,620 B → gzip 35,562 B · `vendor-react-lr0dg1MX.js` 192,536 → 60,375 · `vendor-tauri-UIF4jgRy.js` 17,143 → 4,548 ⇒ **首屏 JS 合计 318,299 B · gzip 100,485 B = 100.49 kB** · 余量 **99.52 kB**（预算 200 kB）· **懒 chunk 31 个 583.98 kB**（不计入）· CSS 3 个 63,229 B = 63.23 kB（不计入，只报告） |
  | `node scripts/bundle-eager-graph.mjs` | exit 0 · 入口 `app\src\main.tsx` · **首屏静态可达源文件 91** · **npm 包 4**（`@tauri-apps/api` · `@tauri-apps/plugin-desktop` 实为 `plugin-dialog` · `react` · `react-dom`） |
  | Rust（`cd app/src-tauri; cargo test --test app_lib_tests`） | **exit 0** · `running 2306 tests` ⇒ `test result: ok. 2300 passed; 0 failed; 6 ignored`（**本批动 Rust ⇒ 这条基线必跑，且每步重跑**） |
  | `app/dist` provenance | `app/dist/index.html` **mtime 2026-09-12T15:25:31.759Z** · 入口 chunk `index-Bn5oI23G.js` **108,620 B** · 全部 `dist/assets/*.js` 同一 mtime（= 批 5 收口的真实构建产物） |
- **★ 每条读数必须带出处与时刻**：任何「前后对比」的首屏读数都必须写明 `app/dist` 的 **mtime + 对应提交 sha**；`check-bundle-budget.mjs` **不打印 mtime**（实测其 provenance 只有「dist 路径 + 入口 chunk 名 + 逐 chunk 字节」）⇒ **mtime 由执行单元自采**：`(Get-Item app/dist/index.html).LastWriteTime`。
- **★ 真实构建的取锁协议（本仓**没有**工具级锁 —— 这是单元约定）**
  - 事实（**实测**）：`scripts/check-bundle-budget.mjs` **无任何锁机制**；全仓 `**/build.lock` **0 命中**。批 4/批 5 报告里的「取锁」是**并行单元之间的人工约定**，不是脚本能力。
  - 约定（**照批 4/批 5 沿用**）：跑真实构建前先取锁 ——
    ```powershell
    $lock = ".superpowers\sdd\2026-09-12-frontend-redesign-batch6-motion\tmp\p1\build.lock"
    # 锁体写 createdAt / pid / purpose（用 node writeFileSync，不经 PowerShell 字符串层）
    New-Item -ItemType File -Path $lock -ErrorAction Stop   # 已存在即抛 ⇒ 占用则退避重试 30s × ≤6
    try { <真实构建 + 判据> } finally { Remove-Item $lock -Force }
    ```
    取不到锁**不许硬跑**（`app/dist` 是全批的 provenance，两个构建并发会让 Δ 无法归因）。
- **★ 首屏/可达性的判据形态（一律三件套，永不使用裸绝对数）**：① 工具原始读数（注明口径）② **Δ（相对 `6cbe964e` 冻结值）** ③ **机理核查**（`pages/**` 新增几个 · npm 包新增几个 · **新进首屏集合 = []?**）。⚠️ **本批的 Δ 是构造性的**：GSAP 只经 `import()` 到达 ⇒ 首屏 chunk 个数应仍是 **3**、`vendor-gsap-*` 只在懒 chunk 里；**`manualChunks` 只切文件、一字节不降**（`check-bundle-budget.mjs:205` 逐字）。
  - ⚠️ **`Δ` 恰为 0 时先当仪器故障**（先自证仪器能测出已知差异，再下结论）；**< ~2 kB 的 Δ 必须用同源真构建对比**（rollup 的 CSS 拼接顺序非确定性，批 4 实测同源两树差 9 B）。
  - ⚠️ **chunk 名不是稳定标识**（v0.22 `:549` 陷阱 #110）⇒ 判 chunk 增删**必须用模块级字面量归属**或**逐块字节闭合核算**；只比名字会同时产生**假 ADDED + 假 REMOVED**。
- **★ 提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`（本仓**多 agent 并行**，裸 `git commit` 会扫走别人已暂存的条目，包括 `D` 条目）。**新建文件必须两步**：`git add -- <path>` 再 `--only`。**禁止**：`git add -A` · `git add .` · `git stash` · `git checkout --` · `git restore` · `git clean`（任何写模式）· `git reset --hard` · `--no-verify` · `git add -f` · `amend` · `rebase` · force push。Conventional Commits：`<type>(<scope>): <subject>`，**subject ≤50 字**、动词开头、无结尾句号（**抄命令前人工数字符数**）。
  - 🔴 **`.superpowers/**` 永不 `git add -f`**（目录整体 gitignored；本计划里提到的所有 `.superpowers/` 路径都**不是**交付物）。
  - ⚠️ **新建任何目录前先 `git check-ignore <path>`（不带斜杠）验证**：根 `tmp/` **未被 gitignore**（实测 `git check-ignore tmp` = **exit 1**；⚠️ 带斜杠的 `git check-ignore tmp/` 报 exit 0 是**假阳性**，`.gitignore:48` 是空行）—— 本批已发生过一次事故（recon-b/recon-c 把探针写到仓库根 `tmp/`，控制方已移走并删除）。**临时文件只许写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/tmp/<unit>/`**。
- **★ 仪器纪律（承批 1–5 的 32+ 类陷阱，本批逐条适用；下面只列本批最常踩的）**
  1. **本机没有 `pwsh` 二进制**，shell 是 **Windows PowerShell 5.1**（码页 `gb2312`）⇒ **中文串一律不经 PowerShell 字符串层**，读文本/JSON 一律 `node -e` / `node <script.mjs>`。
  2. 🔴 **绝不用 `2>&1 |`**（PS 5.1 把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1）。判 exit 用 `$LASTEXITCODE` 或 `2>file`。
  3. 🔴 **`>` / `2>` 写 UTF-16LE** ⇒ 落文本用 node `writeFileSync`；读回 PS 重定向产物必须 `readFileSync(p,"utf16le")`（否则中文全是乱码）。
  4. **PowerShell 单行 + 嵌套引号会 `SyntaxError`**（实测本轮踩到 1 次）⇒ **判据一律给可粘贴的脚本文件路径**（`.superpowers/.../tmp/<unit>/*.mjs`），不写长 `node -e "…"` 单行。
  5. **任何「0 命中」/「不存在」结论必须点名仪器 + 可复现命令 + 双侧自证**（对**已知存在**的串必须命中、对无意义串必须 0）；**文本扫描先剥注释**。
  6. **`git archive` 取不到未跟踪文件**，解包树里没有 `.git`（`git grep` 静默 0 命中）；**导出树必须用 `git -c core.autocrlf=false archive -o t.tar <commit>`**（不加 `-c` 会导出 CRLF ⇒ `tokens.drift.test.ts` / `gen-tokens.test.mjs` 这类对换行敏感的 suite `SyntaxError` 而**假红**）；**junction 借 `node_modules`，删树前先 `[System.IO.Directory]::Delete($junction,$false)` 摘点并 `Test-Path` 确认**。
  7. **`--no-build` 在导出树必失败**（`dist` 不入库）⇒ 导出树内要跑预算守卫必须先在树内 build。
  8. **`--outputFile` 按仓库根解析**；含空格/中文的路径不能经 `shell:true`。
- **★ 变异体与守卫纪律（R8.6 + 批 4/5 附纪律，逐条适用）**
  1. **变异体实验一律在导出副本里做**；**绝不许在 `app/src/**` 上「改→跑→还原」**（批 3 两起、批 4 #28 一起；正解 = **每个变异新解一棵树**）。
  2. **CONTROL 必须在冻结提交树上取**（批 4 #28 家族：脏树上 `dialogMigration.e.test.ts` 曾假红 1 条）。
  3. **harness 必须把「跑到了断言（用例数 >0）」与「跑红了」分开判**（批 4 #30：`--cache.dir` 是 vitest 4 的废弃参数 ⇒ exit 1 且 **0 用例**，被误读成「判据集体失效」）。**没有 `ran` 闸的变异体实验，「全绿」与「全红」都不可信。**
  4. 🔴 **禁 `--reporter=basic`**（Vitest 4 已移除 ⇒ 产出「伪装的红」= 假证明）。用 `--reporter=json --outputFile=…`（⚠️ **`numTotalTestFiles` 不存在**，文件数读 `testResults.length`）。
  5. **变异体实验不得与全量测试并发**（`KnowledgeGraphView.test.tsx` 的负载敏感 flake）。
  6. **不许 `eval` / `new Function` / `Function(...)`**；类型噪音用显式类型收口，**不许** `@ts-expect-error` / `any` / 关类型检查。
  7. **每条新判据自带变异体**（CONTROL 只证「跑得起来」）；**反例守卫（必须绿的反向变异）与必红的变异体分开列**。
  8. **新造的每个守卫/棘轮必须给「防真空阳性对照」**：喂一个**已知存在**的样本必须命中、喂无意义串必须不命中；**基线常量不可手工改宽** —— 用 `FROZEN == sum(entries)` 式不变式 + 锚 + 反向对照。
  9. ⚠️ **「全文件文本扫描」型守卫会被注释/测试名里的字面量误伤**（批 0-D Task 10 实测；`// @vitest-environment jsdom` 指令串写进注释也会让文件真按 jsdom 跑）⇒ 提到会触发守卫的串时用拼接写法（`"<" + "svg"`）或改述；**不要**为绕开守卫去改守卫本身。
- **★ 计划级冲突的处理**：实施中发现**两条已批准要求互相排斥**时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 命令 + 代价）**，一次报控制方裁决；**不要自行取舍，也不要两条都硬做**。本计划已预判四处（`### 表 4` 的 S1–S4，均在 `## 实测基线` 里逐条给读数），遇到新的照此办理。
- **★ 报告与临时文件**：报告写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`（**该目录整体 gitignored ⇒ 永不 `git add -f`**）。探针/日志/基线/解包树一律写同目录 `tmp/<unit>/` 下的子目录，**不许放仓库根**。报告必含（R 系列 §九「每任务必含」4 条）：① 八门禁逐条（命令 + exit + 读数）② 诚实边界（区分「仪器不可达」与「本批未做」）③ 权威读数带 **提交号 + `app/dist` mtime** ④ 「只能登记」清单（**不许编造弱判据**）。

### 每个拆分任务的统一作业模式（本批全部任务共用，逐条照做；照批 5 母本）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与八条门禁，把读数写进报告的「开工读数组」；**先看 `git status --porcelain`，不是自己的路径一律不碰**。
2. **文件占用检查**：本轮是**多单元共用一棵工作树**；开工前把自己要改的路径与 `tmp/` 里的在飞声明比对，冲突 ⇒ 只读轮询 90s × ≤5，窗口不关 ⇒ 报控制方。
3. **依赖必须「已提交」而不是「工作树已改」**（DISPATCH-TEMPLATE §三）：等 `git log --oneline -1 -- <被依赖文件>` 出现上游提交再提交自己；确实要先行 ⇒ 把接口冻结成快照写进报告并在提交信息里注明依赖哪次提交。
4. **一次只切一处**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
5. **验收判据 = 「既有测试逐条原样通过」+「新增用例只增不减」**；本批**授权改动**的既有断言**仅限** `### 表 5` 点名的 7 条（R 系列 G1–G4/G6/G8/G9 + `drift.test.ts:52`）与表 5 的 3 条清单外连带项 ⇒ **其余任何既有断言改动 ⇒ STOP 并报控制方**。
6. **每条新判据自带变异体**（导出副本、带 CONTROL、禁 `--reporter=basic`、harness 带 `ran` 闸）；**变异体必须证明「这条判据自己能红」**，不许用一个 CONTROL 代表全部。
7. **报告必含**：① 逐条命令 + 观测输出 + exit code 的八门禁；② **逐条兑现度声明**（**不是** B9 中间态声明 —— R0.1 第 3 条已把那条作废）；③ **诚实单列「你没能验证的地方」**（逐条写清是「仪器不可达」还是「本批未做」）；④ 首屏读数必须带 **dist mtime + 对应提交**；⑤ 五类棘轮的「未加计数」读数（每个新增 UI 文件各跑一次）。
8. **提交**：`git diff --stat` 复核只含自己的文件 → 新建文件先 `git add -- <path>` → `git commit --only -m "<msg>" -- <显式路径…>`（subject 人工数到 ≤50）。
9. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 复现命令 + 代价）**，一次报控制方裁决。

---

## 实测基线（计划者 2026-09-13 在 `dev@6cbe964e` 实跑；下游一切目标与排序都从此派生）

> **出处**：`HEAD = 6cbe964e`（`git rev-parse --short HEAD`）· 分支 `dev` · **工作树 `git status --porcelain` = 仅 `?? docs/tech-debt/` 一条** · `app/dist/index.html` **mtime 2026-09-12T15:25:31.759Z** · 入口 chunk `index-Bn5oI23G.js` **108,620 B** · 全部读数采集于 **2026-09-13**（本轮会话）。

### 表 1 · 八门禁（逐条命令 + exit + 读数）

| # | 命令 | exit | 读数（逐字） |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `✅ line-limits（--full · 数值一致）：>600 硬限 0（棘轮内）· 301–600 档 122 · 登记条目 122` |
| 2 | `node scripts/docs-check.mjs` | **0** | `docs-check: 扫描 277 个 Markdown 文件（检查 177 个，archive 快照与豁免清单除外）` + `✅ 相对链接全部有效` · `✅ file:// 引用目标均存在` · `✅ 文件名规范` · `✅ 索引覆盖完整` · `✅ 模板源与实例一致` |
| 3 | `node scripts/check-command-registry.mjs` | **0** | `✅ 命令注册一致：定义 312 / 注册 312 / 重复 0` |
| 4 | `cd app; npx tsc --noEmit` | **0** | **0 错**（无输出） |
| 5 | `cd app; npx vitest run --reporter=json --outputFile=<批次tmp>/vitest-baseline.json` | **0** | `numTotalTestSuites 647` · `numTotalTests 1770` · `numPassedTests 1770` · `numFailedTests 0` · `numPendingTests 0` · `numTodoTests 0` · **`testResults.length 184`** · `success true`。⚠️ **`numTotalTestFiles` 字段不存在（`undefined`）** —— 文件数只能用 `testResults.length`（本批派发书已点名） |
| 6 | `node scripts/check-bundle-budget.mjs --no-build` | **0** | 首屏 3 chunk：`index-Bn5oI23G.js` 108,620 B → gzip 35,562 B · `vendor-react-lr0dg1MX.js` 192,536 → 60,375 · `vendor-tauri-UIF4jgRy.js` 17,143 → 4,548 ⇒ **首屏合计原始 318,299 B · gzip 100,485 B = 100.49 kB** · **余量 99.52 kB** · **懒 chunk 31 个 · gzip 583,980 B = 583.98 kB** · `index.html` 1,558 B · `.css` 3 个 63,229 B = 63.23 kB（不计入，只报告）· `.ttf` 20 / `.woff` 20 / `.woff2` 19 |
| 7 | `node scripts/bundle-eager-graph.mjs` | **0** | 入口 `app\src\main.tsx` · **首屏静态可达源文件 91** · **首屏拉入的 npm 包 4**（`@tauri-apps/api` · `@tauri-apps/plugin-dialog` · `react` · `react-dom`） |
| 8 | `cd app/src-tauri; cargo test --test app_lib_tests` | **0** | `running 2306 tests` ⇒ `test result: ok. 2300 passed; 0 failed; 6 ignored; 0 measured; 0 filtered out; finished in 13.17s`（stderr 有 2 条既有 warning：`lib.rs` 多重 build target · `db_task_index_tests.rs:6` unused import —— **不新增**） |
| 9 | `app/dist` provenance（自采） | — | `app/dist/index.html` **mtime 2026-09-12T15:25:31.759Z** · size 1,558 B · 入口 chunk `index-Bn5oI23G.js` **108,620 B**（`dist/assets/*.js` 全部同一 mtime） |
| 10 | `git status --porcelain` | **0** | 仅 `?? docs/tech-debt/` 一行 |

**本轮真实构建未跑**（`--no-build` 之外无构建）：`app/dist` 沿用批 5 收口的产物（mtime 与 v0.22 批 5 节逐字一致：`2026-09-12T15:25:31.759Z` = `2026-09-12 23:25:31 +08:00`）。任何需要真实构建的任务**自己取锁 + 构建 + 自采 mtime**。

### 表 2 · 本批落点实测（计划者逐文件 `ReadAllLines` / `countLines()` 亲测）

| 对象 | 文件 | 实测行数 | 今天的事实（要点，均为本轮亲测） |
|---|---|---|---|
| 动效接缝（临时真源） | `app/src/ui/primitives/motion.css` | **74** | `:37-56` 的 `:root{}` 是**批 0-D 的临时接缝**（`--ed-dur-*` ×9 + `--ed-ease`）；`:65-74` 是 `app/src` 内**唯一**一条 `prefers-reduced-motion` 块（12 基类 + `.ed-skeleton::after` + `.ed-empty-enter`）；文件头 `:7-8` 逐字承诺「批 6 的动效 token 真源完成后**整块删除**」 |
| token 真源 | `app/scripts/gen-tokens.mjs` | **269** | `SCALE_SOURCE`（`:80-111`）只有 fontFamily ×3 / typeScale / spaceScale / radiusScale / overlayAlpha / iconGrid / iconStroke / iconSizes / navHeight；**无 `--ed-dur-*`、无 `--ed-ease`**（逐字复核） |
| 生成物 | `app/src/ui/tokens.css` · `tokens.gen.ts` | **100** · **61** | 由 `renderAll()` 产出；`radiusScale` 今日 **4 档** `stamp3/control5/panel8/overlay10` |
| 漂移守卫 | `app/src/ui/tokens.drift.test.ts` | **87** | `:25-28` 产物 == `renderAll()`；`:38` `COLOR_TOKENS.length === 16`；**`:52` `expect(SCALE_TOKENS.radiusScale.map(r => r.px)).toEqual([3, 5, 8, 10])`**（G9 的落点） |
| 生成器守卫 | `app/scripts/gen-tokens.test.mjs` | **209** | **`:114` `expect(SCALE_SOURCE.radiusScale.map(r => r.px)).toEqual([3, 5, 8, 10])`** —— **第二条 radiusScale 钉值**（见 `### 表 5` 的 #3） |
| 接缝守卫 | `app/src/ui/primitives/style-seams.test.ts` | **288** | `:163-180` 「§8.4 的 10 个动效变量落值，一个不多一个不少」（G4 的落点：`:178` 逐名逐值 `toContain` + **`:179` 总数恒等 10**）；`:182-188` 位移 ≤8px（**只扫 `primitives/*.css`**）；`:190-200` reduced-motion 块恰 1（**G6 的落点：`:192`**）+ 逐基类 `toContain` |
| 覆盖守卫 | `app/src/ui/primitives/motion-coverage.test.ts` | **147** | `:36-40` 从 reduced-motion 块抽 `MOTION_ENTRIES`；`:42-55` `BASE_CLASSES` 12 + `:99` `toHaveLength(12)`；**`:113-124` 只放行「修饰类 `--` / BEM `__` / `<基类>-…`」三种形状的 `.ed-*`**；`:132-146` 每一处 `animation:` 的选择器原文必须在名单里（**G7 不动**） |
| 跨文件契约守卫 | `app/src/ui/primitives/style-contract.test.ts` | **296** | **`:219-236`「退场时长三方对拍：组件常量 == 组件 CSS 兜底字面量 == motion.css 定值」**，`:233` 直接读 `motion.css` 找 `--ed-dur-overlay-out: 160ms;` / `--ed-dur-toast-out: 140ms;`（见 `### 表 5` 的 #1） |
| Toast 双真源守卫 | `app/src/ui/primitives/Toast.style.test.ts` | （未单测行数） | **`:114-132`**「退场时长的两个真源对拍」，`:127` 从 `motion.css` 读 `--ed-dur-toast-out: (\d+)ms;`；**`:123` 自带改写指引逐字**：「③ 若批 6 把时长搬进 token 真源并删掉 `motion.css` 的变量块，本条会红，届时按新的唯一真源改写」（见 `### 表 5` 的 #2） |
| GSAP 槽位 | `app/src/build/manualChunks.ts` · `.test.ts` | **159** · **292** | 槽位 `EXACT` 已含 `gsap` / `@gsap/react` 两行（规则**天然惰性**）；**`.test.ts:272` `expect(Object.keys(all).filter(d => d === "gsap" \|\| d === "@gsap/react")).toEqual([])`**（G8 的落点：**装即红，设计如此**；`:271` 自带正解指引「去构建一次，核对 vendor-gsap chunk 独立生成且只经 import() 到达」） |
| 档位通道 | （全 `app/src`） | — | `data-motion` / `data-intensity` / `data-density` / `data-preset` **各 0 命中**；`documentElement` **0 命中**（⇒ `<html>` 上写属性是本批**新增**能力，零既有先例） |
| 主题 | `app/src/ui/tokens.css:79` | — | 定义了 `[data-theme="dark"]`，但**全仓无写入方**（`setAttribute("data-theme"` / `dataset.theme =` 0 命中）⇒ 暗档**运行时永不生效**（R2.5 的实测依据） |
| 持久化范式 | `app/src/views/useViewMemory.ts` | **70**（**顶格，余量 0**） | 三纯函数 + 注入 `Storage` + `globalThis.localStorage` 默认值 + 惰性读取 + 静默降级；`VIEW_MEMORY_PREFIX = "view:default:"` |
| 设置页宿主 | `app/src/pages/SettingsPage.tsx` | **150** | 单页滚动 + `GroupTitle` 视觉分组 + 10 个自包含面板；`columnSpec("settings-main").default` 取列宽；**零 `data-testid`**；**不在 `NON_MIGRATED_14`** |
| 段控件原语 | `app/src/ui/primitives/ViewSwitcher.tsx` · `.css` | **135** · **63** | 容器 `.ed-btn-group` + 段 `.ed-btn--segment` + `aria-pressed`，**零行内 style**；`:47` 三属性各 `var(--ed-dur-micro, 120ms)`；已在 barrel（`index.ts:47-48`）⇒ **T7 直接复用，零棘轮计数** |
| 原语 barrel | `app/src/ui/primitives/index.ts` | **48** | `:11 import "./motion.css";` + 13 个值导出 + 类型导出 |
| 测试桩 | `app/src/test/setup.ts` | **28** | **只桩 `Range`**；**无 `matchMedia` / `requestAnimationFrame` / `ResizeObserver` / `IntersectionObserver` 全局桩** |
| 测试配置 | `app/vitest.config.ts` | **23** | `environment: "node"` · `setupFiles: ["src/test/setup.ts"]` · `include: ["src/**/*.test.ts","src/**/*.test.tsx","scripts/**/*.test.mjs"]` · `testTimeout: 15000` |
| 包体 | `app/package.json` · `package-lock.json` | **41** · **5525** | `dependencies` **14** / `devDependencies` **10**（逐键实测；⚠️ `recon-a` A7 的结论表写 **11** 是**它的笔误**，以本轮实测为准）；**无 `gsap` / `@gsap/react`**；**无 jest-dom / user-event** |
| 环境层落点 | `app/src/ui/primitives/Loading.css` · `EmptyState.css` | **79** · **103** | 全 `app/src` 只有 **3 个 `@keyframes`**：`ed-empty-in`（EmptyState）· `ed-skeleton-shimmer` · `ed-probe-swing`（后两者 Loading）；`ed-probe-swing` 的时长是**硬编码 `2.4s`**（非 token） |
| 未确认面 | `app/src/components/structuredBlocks.ts:57-58` | （未单测行数） | `lowConfidenceClass()` 产出 `"ed-low-confidence"`，但**该函数只有它自己的测试引用（生产调用点 0）**，且**全仓无 `.ed-low-confidence` 的 CSS 规则**（批 0-D Task 13 删掉了 `App.css` 的那条）⇒ 「未确认」今天**没有 DOM 落点** |
| 层级标尺 | `app/src/ui/zIndex.ts` | **42** | 六档 `raised 10` / `panel 100` / `popover 200` / `modal 300` / `modalNested 400` / `toast 500` |
| ADR 索引 | `docs/adr/README.md` | **60** | 一张四列表（列 = 编号 / 标题 / 状态 / 日期）；实盘最高 **ADR-034**（`ADR-035` 不存在；`ADR-019` 缺号 —— **本批不补、不复用，只登记**） |
| 规范索引 | `docs/standards/README.md` | （未单测行数） | 一张四列表（列 = 规范 / 主题 / 个人项目 / 小团队），**逐文件一行** ⇒ 新增 `motion.md` **必须**加行进表，否则 `docs-check` 的「索引覆盖完整 ✅」会变成 `⚠️ N 个文件未收录于本目录索引` |
| 豁免登记 | `docs/standards/line-limit-exemptions.md` | **232** | `:224` 的人工引用块写 `motion.css 74 · index.ts 45 · style-seams.test.ts 271 · style-contract.test.ts 214 · motion-coverage.test.ts 147` ⇒ **今日实测** `74 ✅ / 48 ❌ / 288 ❌ / 296 ❌ / 147 ✅`（该块**不在生成器视野内** ⇒ 改它不会被门禁发现、也不会被门禁保护） |
| 规范清单 | `docs/standards/` | **25 文件 / 0 子目录** | **无任何 `motion` / 动效命名文件**；24/25 文件对「动效 / motion / 动画 / `prefers-reduced`」**全 0 命中**（唯一命中 = `line-limit-exemptions.md` 的人工引用块）⇒ `motion.md` 是**新建文件** |
| 版本文件 | `docs/versions/v0.22.md:33` | **646** | 逐字 = 一行四列（`v0.22.6 · 批 6` ／ 动效系统：GSAP 接入 + token + 四层纲领 + 三档强度 + 相变两态 + 6 个签名动效 + `usePresence` ／ 动效 ／ REQ-318 起）；`:35` 逐字把「新增动效规范章节」放在**批 8** ⇒ 与规格 `:836`（**未标批次**）冲突（R6.7 已裁：**批 6 做**，两处就地加注消歧） |

### 表 3 · 三个「今天已存在但我不能直接复用」的机制（本批必须绕开或改造）

| 机制 | 出处（逐字要点） | 为什么不能直接复用 | 本批形态 |
|---|---|---|---|
| **`motion.css` 的 `:root{}` 临时 token 块** | `motion.css:37-56`；文件头 `:7-8` 自陈「批 6 的动效 token 真源完成后**整块删除**」 | 它**不是**真源（真源是 `gen-tokens.mjs`），且 `style-seams.test.ts:179` 把「本文件恰 10 个 `--ed-*`」钉死 ⇒ 想在这里加任何新变量都会红 | **T5 整块迁走 + 删块**；新变量一律进 `gen-tokens.mjs` ⇒ `tokens.css` |
| **`motion-coverage.test.ts` 的类名形状过滤** | `:113-124`：只有「含 `--` / 含 `__` / `<基类>-…` / 是登记基类」的 `.ed-*` 才放行；`:99` `BASE_CLASSES` 恰 12 | 本批要新增环境层动画落点 ⇒ 若起一个**新的 `.ed-*` 基类名**（如 `.ed-env-pulse`），`:113-124` 当场红，而改 `:99` 的 `toHaveLength(12)` 属**清单外既有断言** | **T13**：新落点一律用 **`<既有基类>--<修饰>`** 形状（如 `.ed-status--live-pulse` / `.ed-surface--due-glow`），**不新增基类**（详见 `## 陷阱` #B5-①） |
| **`@keyframes` 桶** | `Loading.test.tsx:177` `expect(CSS.match(/@keyframes/g)).toHaveLength(2)`（**G5 不动**）· `Button.test.tsx:268` 禁 · `StatusLine.test.tsx:244` + `statusLineRatchet.test.ts:167` 禁 | 环境层要新增循环动效，但**既有三处都禁止**再放 keyframes | **T13**：新 keyframes **只能进 `motion.css`**（`.css` 不在行数门禁视野、`:192` 只数 reduced-motion 块数）；同步进 reduced-motion 名单（G6 允许名单增长） |

### 表 4 · 规格/裁决与实测的冲突台账（计划期实测；逐条在波 A 或波 D 处置）

| # | 裁决/规格原文 | 实测 | 处置 |
|---|---|---|---|
| **S1** | **R2.1 判据 ③**：`app/src/**` 里**静态** `from "gsap"` / `from "@gsap/react"` 命中 **0**（只许 `await import()`） | **R2.2** 同时要求 `app/src/motion/engine.ts` **顶层**执行 `gsap.registerPlugin(useGSAP, …)` —— 而 `useGSAP` 是 **React hook**，**无法**在 `await import()` 之后于组件渲染期拿到；且 `@gsap/react` 内部 `require('gsap')` ⇒ 两者必在同一 chunk | 🔴 **两条裁决在字面上互斥**。**本计划的执行形态 = 精确化，不改结论**：**判据 ③′** = 「静态 import GSAP 家族的**文件白名单 = `app/src/motion/engine.ts` 一个**；`app/src/**` 其余文件命中 **0**」；**判据 ③″** = 「`motion/engine.ts` **不得被任何静态可达 `main.tsx` 的模块 import**」+ R2.1 的 ①（产物出现 `vendor-gsap-*.js`）与 ②（`firstScreen.chunks` 不含它）**逐字保留**。⇒ **懒 chunk 的意图一字不减**（真正的不变量是「首屏静态闭包不含 gsap」），而 R2.2 变得可执行。**报告请控制方追认**（见编制报告「需修正的裁决」节） |
| **S2** | **R2.1** 要求「新增守卫文件把三条写成机器判据」，其中 ①/② 都**依赖真实构建产物 `app/dist`** | `app/dist` **不入库**（`git archive` 取不到）⇒ 在导出树/新克隆里该守卫若硬跑必然红；若 `it.skip` 则**永远不会红**（R1.2 禁「放宽为恒真」） | **T4** 的守卫文件：①/② 落成**真实构建任务里的强制命令**（不做常驻 vitest 用例），vitest 内只保留 ③′/③″（纯源码图，无需产物）**并附一条 `runIf(existsSync(dist))` 的产物用例**（存在即跑、不绿则红；不存在 ⇒ 输出 `⚠️ 未运行（无 app/dist）` 并**计入报告的未验证单列**）。⚠️ `runIf` 的「未运行」**不得**被读成绿 —— 报告必须逐条写明 |
| **S3** | **R2.3** `pill` 的 px 值「取既有原语层兜底值（执行者实测后逐字登记）」（`recon-c` C1 推测 = **999**） | **本轮实测**：全 `app/src` 扫 `var(--ed-radius-pill, <值>)` ⇒ **命中 1 处**，`app/src/ui/primitives/Surface.css:58` = **`999px`**（阳性对照：`--ed-radius-panel` 命中 5 处、`--ed-radius-stamp/control/overlay` 各命中 1 处 CSS 声明 + 生成物 1 行；无意义串命中 0） | **T5 取 `pill = 999`**（`radiusScale` 第 5 档 `{name:"pill", px:999}`）⇒ `tokens.drift.test.ts:52` 变成 `[3,5,8,10,999]`（G9 授权）、`gen-tokens.test.mjs:114` 同步（**清单外，见 `### 表 5` #3**） |
| **S4** | **R3.5**：全仓 `app/src/**` 的 `translate*` / **`margin` / `left` / `top`** 位移字面量（剥注释后）**不得超过 8px** | **本轮实测（两个独立探针）**：① `translate*()` 全仓 **18 处**，其中**数值实参 10 处**，**>8px = 0 处**（最大 `Modal.css:52` / `Toast.css:64` 的 `translateY(8px)`；其余 `%` 形态按既有口径跳过）⇒ 扩域**零存量白名单**；② `margin`/`left`/`top` 的 px 字面量 **14 处**，其中 **>8px = 4 处**：`components/NotePreviewView.tsx:64` `margin:10px` · `shell/TopBar.test.tsx:215` `top: 64px` · `ui/primitives/Toast.placement.test.tsx:103/104` `top: 64px` —— **全部是布局量，不是位移动画量** | **T9 的守卫域 = `translate*()` 数值实参（全仓）+ `motion/` 层导出的位移常量**；`margin`/`left`/`top` px 字面量**逐字登记为「布局量，不判」**（附上列 4 处读数）。⇒ 这是对 R3.5 的**收窄**，**报告请控制方追认** |
| **S5** | **R4.2 / G3**：`ViewSwitcher.test.tsx:222-223` 改判为「只许 token 变量 + 落点可被 reduced-motion 覆盖」 | 该条**同时**禁 `@media` 与 `@keyframes`：`@media` 禁令与 `style-seams.test.ts:192` 同向（`app/src` 内 reduced-motion 块恰 1）**仍必须成立**；`@keyframes` 禁令与 G5 的桶边界同向**仍必须成立** | **T14 的 G3 形态** = **保留两条禁令原文** + **追加**「本文件出现的每条 `transition` 的值只许含 `var(--ed-dur-` / `var(--ed-ease` 且其落点类在 `motion.css` 的 reduced-motion 名单里」。⇒ 净增行数 ≤ +20（余量 75） |
| **S6** | **R6.4**：`textBaseline.ts` **297 行**「只许改 1 行、不许加行」 | 本轮实测 **297**（余 3）；`:174` 逐字含「⇒ 558/120 不变」，而 `recon-c` C3 实测今日 `FROZEN_FONT_OOB_TOTAL=551` / `FILES=120`（批 5 顺带迁了 7 处） | **T16**：只把这 1 行的 `558` 改成 `551`（`120` 不动），改后**必须仍 297**；判据 = 行数读数 + `--full` exit 0 |
| **S7** | **R6.6**：`pinnable` 三处文本冲突 | `recon-b` B8 实测代码 `shell/columnRegistry.ts:50` 的 `notes-outline` = **`true`**，而规格 `:398` 与 `:647` 都写「批 3 **全行写 `false`**」 | **T16**：规格 `:398` / `:647` 两处**就地更正**（原文保留 + 加注，代码为权威） |
| **S8** | **R6.7**：动效规范章节归**批 6** | `docs/versions/v0.22.md:35` 明写放**批 8** ⇒ 与规格 `:836`（未标批次）三方不一致 | **T1 在批 6 落地**；`v0.22.md:35` 与规格 `:836` 的**就地加注消歧**归**波 D**（本批前半不写） |

### 表 5 · 🔴 R1.3 清单外的既有断言（**本批必然改红**；🔻 **R11.2 已全部授权**，见下）

> **口径**：R1.3 逐字「本批**授权**修改的既有断言**仅限** R6 系列点名的那些（7 条 + `drift.test.ts:52`）。清单外**任何**既有断言的改动 = **STOP 报告请裁**」。
> 🔻 **R11.2 处置（2026-09-13，取代 P1 的「请追认」）**：**G12/G13/G14 全部授权**（已进 `rulings.md §七` 的唯一授权清单），共同条件 = 给出旧原文（file:line）· 新原文 · **专属变异体** · 「语义不变、只换真源/值」的逐字论证。⇒ 下表三行**不再是"清单外"**，而是 **G12/G13/G14 三个已授权改判**；**逐条必须在 T5 报告里点名四要素**。
> **本计划者的处置依据（DISPATCH-TEMPLATE §三「通则」逐字）**：「一个改动的**必要后果**（如「阈值改判 ⇒ 组件测试必须显式声明视口」）**与该改动同提交才是真正的原子**；把它劈成独立提交会产出一个**测试必红的中间提交** ⇒ 那才是反原子。」
> ⚠️ **本表之外仍有一条"清单外"的必红项**：`rulings.md §七` 的 **G11 = `types_contract_tests.rs:34`**（R5.4 加字段的算术后果，**已授权、只许追加**）—— 它归 **T20**，不在本表（本表只覆盖 T5 的三条）。
> ⚠️ **R11.3 的落点命名若改用 `ed-low-confidence`** ⇒ 会新增 **G16 候选**（`motion-coverage.test.ts` 三处），**当前未授权** ⇒ 见 T13 的降级路径（默认走 `--` 形状，零授权）。

| # | 文件:行 | 旧断言原文（逐字） | 为什么必红 | 建议的新断言 | G 号 | 归属任务 |
|---|---|---|---|---|---|
| **1** | `app/src/ui/primitives/style-contract.test.ts:233`（在 `:219-236` 的 `describe` 内） | `expect(motion, \`motion.css 的 --${decl?.[1]} 定值必须等于 ${jsMs}ms\`).toContain(\`--${decl?.[1]}: ${jsMs}ms;\`);`（`motion` = `stripComments(read("motion.css"))`，`:220`） | T5 删掉 `motion.css:37-56` 后，`--ed-dur-overlay-out: 160ms;` / `--ed-dur-toast-out: 140ms;` **不再出现在 motion.css** ⇒ 两条 `DURATION_PAIRS` 全红 | 把 `const motion = stripComments(read("motion.css"));` 换成生成的**唯一真源**文本：`const tokens = stripComments(renderAll().css);`（`renderAll` 从 `../../scripts/gen-tokens.mjs` import），`:233` 改读 `tokens`。**净增行数 0**（`renderAll()` 的 import 从 `tokens.drift.test.ts:15` 抄）。🔻 **R11.2 已授权为 G12**；**专属变异体**：把 `tokens.css` 的 `--ed-dur-overlay-out` 改成 `161ms` ⇒ 两条 `DURATION_PAIRS` 之一红（**语义不变、只换真源**：EXIT_MS ↔ token 定值一致这条不变式一字不改） | **G12** | **T5** |
| **2** | `app/src/ui/primitives/Toast.style.test.ts:127-129` | `const tokenMs = /--ed-dur-toast-out:\s*(\d+)ms;/.exec(MOTION_CSS)?.[1];` + `expect(tokenMs, "motion.css 缺 \`--ed-dur-toast-out: <n>ms;\`").toBeDefined();` | 同上（该 block 被删） | 把 `MOTION_CSS` 换成 `renderAll().css`（`const MOTION_CSS = read("motion.css")` 在 `:35` ⇒ 改为 `stripComments(renderAll().css)`），并把 `:129` 的失败信息文本改成「生成物 `tokens.css` 缺 …」。⚠️ **该条自带授权**：`:123` 逐字「③ 若批 6 把时长搬进 token 真源并删掉 `motion.css` 的变量块，本条会红，届时按新的唯一真源改写」。🔻 **R11.2 已授权为 G13**；**专属变异体**：把 `tokens.gen.ts`/生成器的 `toast-out` 值改成 `150` ⇒ `:130` 的同值断言红（**同值断言 `:130` 一字不改**） | **G13** | **T5** |
| **3** | `app/scripts/gen-tokens.test.mjs:114` | `expect(SCALE_SOURCE.radiusScale.map((r) => r.px)).toEqual([3, 5, 8, 10]);` | `pill` 档进 `radiusScale` 后变成 `[3,5,8,10,999]` ⇒ 红 | 改判为 `[3, 5, 8, 10, 999]`，并**追加**一条「`pill` 的 px == 原语层兜底值」（从 `app/src/ui/primitives/Surface.css` 读 `var(--ed-radius-pill, (\d+)px)` 对拍 ⇒ 把真源与唯一消费者钉在一起）。⚠️ **替代方案（若控制方不想改本行）**：`pill` 不进 `radiusScale` 而单开 `SCALE_SOURCE.radiusPill = 999` ⇒ 本行与 G9 的 `drift.test.ts:52` **都不必改**，但 R2.3/G9 的「`radiusScale` 加 `pill` 后改判」逐字就得放弃 ⇒ **须控制方二选一**。🔻 **R11.8 第 5 条逐字**：「**`gen-tokens.test.mjs` 与 `tokens.drift.test.ts` 是两处独立真源断言**（G14/G9）⇒ 凡改 `radiusScale`/`SCALE_TOKENS` 的任务**必须同时**处理两处」⇒ **本行与 G9 必须同任务同提交处理** | **G14** | **T5** |

---

## 波次总表

> **四波、同一收口**（R 系列 §九）。**波内可并行，波间串行**（波 B 依赖波 A 的引擎与 token；波 C 依赖波 B 的承载面）。
> **依赖列 = 必须「已提交」而不是「工作树已改」**（DISPATCH-TEMPLATE §三）。**并行列 = 同一时刻可否有第二个实施者动它**。

### 波 → 任务号

| 波 | 主题 | 任务号 | 状态 |
|---|---|---|---|
| **波 A · 地基与纲领** | ADR + 规范 + 引擎 + token 真源 + 三档 + 双基调 + 位移守卫 + 确定性底座 + 可中断模板 + 响应层 + 环境层 + 守卫改判 + G-1..G-4 补测 + 文档更正 | **T1 – T16** | ✅ **本文件已写完（本单元负责）** |
| **波 B · 承载面** | 相变两态（`data-shell-phase` + `--ed-nav-h-live` + `LiveBar`/`Waveform` + 复习态零 chrome）· 到期刻度视觉 + **`Flashcard.intervalDays` 只读字段（Rust 5 处）** · `session_audio_path` 只读命令（312→313）· **WAV 轴 ≡ 会话轴（R5.5-b 补静音 + 失效安全 + `aligned` 自证量）** · 时间轨/播放头 + `[[ts:ms]]` 接上 ms | **T17 – T26**（10 个） | ✅ **本文件已写完（本单元负责）** |
| **波 C · 6 个签名动效** | #1 对齐 · #2 显影编排 · #3 相变凝固 · #4 刻度生长 · #5 时间码回跳 · #6 记忆浮现 · 列折叠 Flip | **T27 – T33**（7 个） | ✅ **本文件已写完（本单元负责）** |
| **波 D · 收口** | 八门禁终态（含 `cargo test`）· 真实构建取锁 + 首屏 Δ 归因 · 规格 §3/§4.3/§6.2/§6.3/§8/§10/§11/§12/§14 就地加注 · `v0.22.md` 批 6 节（七段结构）· `ADR-035` 定稿 + 索引 · 用户面 9 项验收的兑现度表 + 二分清单 · 全批收口评审 | **T34 – T36**（3 个，最后一号 = **T36**） | ✅ **本文件已写完（本单元负责）** |

> **🔴 编号纪律（续写单元必读）**：**波 A 固定占用 T1–T16，不得重排或复号**；波 B/C/D 的任务号从 **T17** 起**连续**编号（波 B → 波 C → 波 D 顺序递增），并在上表与本表同步。**若波 B/C 的任务数与占位不符 ⇒ 只改上表的「任务号」列，不改波 A 的任何编号**。
> **✅ 续写单元定稿的编号（本批全量 = T1–T36，共 36 个任务）**：**波 B = T17–T26** · **波 C = T27–T33** · **波 D = T34–T36**。波 A 的 16 个任务号与全部任务节**逐字未动**（本单元只按 R11.1/R11.3/R11.4/R11.5/R11.6/R11.8 做**定点修订**，逐处见下方「波 A 定点修订台账」）。

### 波 A 任务一览（T1–T16）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T1** | **动效规范**：新建 `docs/standards/motion.md`（纲领 + 四层 + 三档 + 双基调 + **判据纪律**）+ 进 `docs/standards/README.md` 索引 | — | ✅ 与 T2 | 新建 `docs/standards/motion.md` · `docs/standards/README.md`（+1 行） | 1 |
| **T2** | **`ADR-035`（L4 动效纲领与引擎）**：新建 + 进 `docs/adr/README.md` 索引；含「后端契约例外」节 | T1（引用规范） | ✅ 与 T3/T4 | 新建 `docs/adr/ADR-035-l4-motion-grammar-and-engine.md` · `docs/adr/README.md`（+1 行） | 1 |
| **T3** | **装 GSAP + 唯一入口**：`npm install`（`package.json` + lock）· 新建 `app/src/motion/engine.ts`（顶层 `registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`）· **G8 修** `manualChunks.test.ts:272` · 新建 `engine.test.ts` | T2（ADR 冻结接口） | ❌ 独占 `package.json` / lock | **`app/package.json`** · **`app/package-lock.json`** · 新建 `app/src/motion/engine.ts` · 新建 `app/src/motion/engine.test.ts` · **`app/src/build/manualChunks.test.ts`** | 2（装依赖 / 引擎+G8） |
| **T4** | **GSAP 懒加载三件套守卫**：新建 `app/src/motion/engine.guard.test.ts` + 真实构建命令判据 | T3 | ✅ 与 T5/T6 | 新建 `app/src/motion/engine.guard.test.ts` | 1 |
| **T5** | **动效 token 真源迁移**：10 变量 + `pill` 进 `gen-tokens.mjs` ⇒ 重生成 `tokens.css` / `tokens.gen.ts`；删 `motion.css:37-56`；**G4 改判**；**G9 改判**；`### 表 5` 的 3 条连带 | T3（引擎不依赖 token，但同波地基；实际无硬依赖，可与 T3 并行**仅当**不碰 `package.json`） | ✅ 与 T4/T6（文件不相交） | **`app/scripts/gen-tokens.mjs`** · **`app/src/ui/primitives/motion.css`** · 生成物 2 件 · `app/src/ui/tokens.drift.test.ts` · **`app/src/ui/primitives/style-seams.test.ts`** · `app/scripts/gen-tokens.test.mjs` · `app/src/ui/primitives/style-contract.test.ts` · `app/src/ui/primitives/Toast.style.test.ts` | 2（迁移+G4 / pill+G9+连带） |
| **T6** | **三档强度通道**：新建 `app/src/motion/intensity.ts` + `intensity.test.ts`；`motion.css` 加档位块（**在 reduced-motion 块之前**）；`motion-coverage.test.ts` 加**源序守卫** | T5（token 真源先落地，避免双写） | ✅ 与 T4 | 新建 `app/src/motion/intensity.ts` · 新建 `app/src/motion/intensity.test.ts` · `app/src/ui/primitives/motion.css` · `app/src/ui/primitives/motion-coverage.test.ts` | 1 |
| **T7** | **动效强度控件**：新建 `app/src/components/MotionIntensityControl.tsx`（**复用 `ViewSwitcher`**）+ 测试；接进 `SettingsPage` | T6 | ✅ 与 T8–T13 | 新建 2 件 · `app/src/pages/SettingsPage.tsx` | 1 |
| **T8** | **双基调**：新建 `app/src/motion/tone.ts` + 测试；`gen-tokens.mjs` 加两个缓动 token ⇒ 重生成；`engine.ts` 加 `CustomEase.create` 具名 ease | T5 · T3 | ✅ 与 T6/T7 | 新建 2 件 · `app/scripts/gen-tokens.mjs` · 生成物 2 件 · `app/src/motion/engine.ts` | 1 |
| **T9** | **位移上限 8px 唯一出口 + 扩域守卫**：新建 `app/src/motion/shift.ts` + 测试；扩 `style-seams.test.ts` 的位移判据域（或新建守卫） | T5（`style-seams` 写者队列） | ❌ 与 T5/T14 串行（同文件） | 新建 2 件 · **`app/src/ui/primitives/style-seams.test.ts`** | 1 |
| **T10** | **确定性测试底座**：新建 `app/src/test/motionHarness.ts` + 测试；`docs/standards/testing.md` 就地加注（≤20 行） | T3 | ✅ 与 T11 | 新建 2 件 · `docs/standards/testing.md` | 1 |
| **T11** | **可中断/可反向唯一出口 + 判据模板 + 属性集合审计**：新建 `app/src/motion/controls.ts` + 测试 | T3 · T10 | ✅ 与 T12/T13 | 新建 2 件 | 1 |
| **T12** | **响应层七类动作回执**：原语层四类回执 + `motion.css` 的**元素级全局回执**（零调用点改动）+ 七类覆盖守卫 | T6（同文件 `motion.css`） | ❌ 与 T6/T13 串行（同文件） | `app/src/ui/primitives/motion.css` · `app/src/ui/primitives/Button.css` · 新建 `app/src/motion/responseCoverage.test.ts` | 2（原语层 / 元素级 + 守卫） |
| **T13** | **环境层四件 + `@keyframes` 桶边界**：`motion.css` 加探针/脉冲/墨度/刻度四件（新落点一律 `<基类>--<修饰>` 形状）+ 名单同步 | T12（同文件队列） | ❌ 与 T6/T12 串行 | `app/src/ui/primitives/motion.css` · `app/src/ui/primitives/motion-coverage.test.ts` | 1 |
| **T14** | **G1/G2/G3/G6 改判**（每条给旧断言原文 / 新断言 / 专属变异体 / 为什么更强） | T12（顶栏动效先落，判据才有对象） | ❌ 与 T9 串行（同 `style-seams`） | **`app/src/shell/TopBar.test.tsx`** · `app/src/shell/TopBar.css`（文件头注释）· `app/src/shell/ShellFallback.test.tsx` · `app/src/ui/primitives/ViewSwitcher.test.tsx` · **`app/src/ui/primitives/style-seams.test.ts`** | 2（G1/G2 / G3/G6） |
| **T15** | **G-1..G-4 补测**：四条各补 1 个**专属变异体**（**证据型任务，零生产代码**） | T3（要有 CONTROL 树） | ✅ 与 T14 | 0（产出 `tmp/t15/**`） | 1（登记提交：只改文档/台账） |
| **T16** | **文档就地更正（三处）**：`textBaseline.ts:174`（**只改 1 行**）· 规格 `:398`/`:647` 的 `pinnable` · `line-limit-exemptions.md:224` 人工引用块的行数漂移 | T5（`style-seams` / `style-contract` 行数已定） | ✅ 与 T14/T15 | `app/src/ui/primitives/textBaseline.ts` · `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` · `docs/standards/line-limit-exemptions.md` | 1 |

**预估波 A 提交数 = 18**（T3/T5/T12/T14 各 2 个，其余各 1 个，T15 计 1 个登记提交）。

### 波 B/C/D 任务一览（T17–T36，续写单元定稿）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T17** | **相变态通道**：新建 `app/src/shell/shellPhase.ts` + `shellPhase.test.ts`；`gen-tokens.mjs` 加 **`navHeightLive: 58`** ⇒ 重生成；`App.tsx` 挂通道（**净增 ≤8 行，590→≤598**） | T6（`data-motion` 同族能力）· T5（生成器队列） | ✅ 与 T20/T22/T23 | 新建 2 件 · **`app/scripts/gen-tokens.mjs`** · 生成物 2 件 · **`app/src/App.tsx`（590，⚠️ 硬限 600）** | 2（token+通道 / App 接线） |
| **T18** | **采集态 LIVE 仪表**：新建 `app/src/components/Waveform.tsx`（**div 条阵列，禁 SVG**）+ `shell/LiveBar.tsx` + 各测试；接 `live:audio-level` | T17 | ✅ 与 T19 | 新建 4 件 | 2（Waveform / LiveBar） |
| **T19** | **复习态零 chrome + 相变交叉淡入（不 animate height）**：`motion.css` 相位块 + `TopBar.css`；新建 `app/src/shell/shellPhase.guard.test.ts` | T17 · T18 | ❌ 与 T12/T13 串行（`motion.css` 队列） | **`app/src/ui/primitives/motion.css`** · `app/src/shell/TopBar.css` · 新建 1 件 | 1 |
| **T20** | **`Flashcard.intervalDays` 只读字段（Rust 5 处，含 G11）**：`types_note.rs` · `db_flashcards.rs`×2 · `commands_flashcards.rs` · **`types_contract_tests.rs:34`** | — | ✅ 与 T22/T23 不相交 | 4 个 `.rs`（**零新增文件**） | 1 |
| **T21** | **到期刻度视觉（前端承载面）**：新建 `app/src/components/review/DueScale.tsx` + 测试；`ReviewPage.tsx` 接刻度 | T20（字段先落地） | ✅ 与 T22 | 新建 2 件 · `app/src/pages/ReviewPage.tsx`（231） | 1 |
| **T22** | **`session_audio_path` 只读命令**：`commands_audio.rs` + `app_commands.rs:335` 邻近注册 + Rust 单测；**312→313** | — | ✅ 与 T20/T23 | `app/src-tauri/src/commands_audio.rs`（83）· **`app/src-tauri/src/app_commands.rs`（478）** | 1 |
| **T23** | **WAV 轴 ≡ 会话轴（R5.5-b 根治）**：新建 `app/src-tauri/src/audio_align.rs` + `audio_align_tests.rs`；`audio_store.rs` 签名 + 对齐簿记 + sidecar；`live_session_loop.rs:163` 调用点；`audio_store.rs:3` 加注更正；**ADR-013 就地加注**；**§10 额外审查记录** | T22（同一条 IPC 面） | ✅ 与 T20/T21 | 新建 2 件 · `app/src-tauri/src/audio_store.rs`（212）· **`app/src-tauri/src/live_session_loop.rs`（410）** · `docs/adr/ADR-013-*.md` | 2（纯函数+单测 / 接线+加注） |
| **T24** | **`SessionViewSlot` 注入槽 + 播放头承载**：`views/registry.ts` 加可选槽；`components/session-detail/**` 容器侧新建 `SessionAudioSlot.ts`（取数 + `convertFileSrc`，**`views/**` 零 `@tauri-apps` 边界不得破**） | T22 · T23 | ✅ 与 T25 | `app/src/views/registry.ts`（109）· 新建 1–2 件 · `components/session-detail/SessionViewHost.test.tsx`（250） | 1 |
| **T25** | **时间轨 + 播放头 + `Waveform` 定位**：`views/session/SessionTriTrackView.tsx`（207）加轨与播放头（**纯注入**）；元素级 `scrollTo`；优雅降级 + `StatusLine kind="error"` | T24 | ❌ 与 T26 串行（同视图文件） | `app/src/views/session/SessionTriTrackView.tsx`（207）· `SessionTriTrackView.test.tsx`（239） | 2（轨 / 播放头+降级） |
| **T26** | **`[[ts:ms]]` 接上 ms**：`components/NoteMarkdown.tsx:212-231` 新增可选回调并接线；调用点注入 | T25（有承载面才有落点） | ✅ 与 T25 的部分步骤 | `app/src/components/NoteMarkdown.tsx`（**266**） | 1 |
| **T27** | **#1 对齐**：`views/session/SessionTriTrackView.tsx` 三轨 `data-ms` 共轴 + 位移偏移 ≤8px（经 `motion/shift.ts`） | T25 · T11 | ❌ 与 T25 串行（同文件） | `SessionTriTrackView.tsx` · 新建 1 件 | 1 |
| **T28** | **#2 显影编排**（落点 = **课后** `components/session-detail/SessionRawView.tsx` 157）：字符率近似 + 文件头逐字声明 | T27 | ✅ 与 T29–T31 | `SessionRawView.tsx`（157）· 新建 1 件 | 1 |
| **T29** | **#3 相变凝固**：`Waveform` 收束成直线 + `--ed-due` 族退去 + 域 Tab 交叉淡入；**可反向** | T18 · T19 | ✅ 与 T28/T30 | `app/src/components/Waveform.tsx` · `motion.css` · 新建 1 件 | 1 |
| **T30** | **#4 刻度生长**：`DueScale.tsx` 生长/回缩；回缩用 `review_card` 的**精确** `intervalDays` | T20 · T21 | ✅ 与 T28/T29 | `components/review/DueScale.tsx` · `ReviewSessionPanel.tsx`（231） | 1 |
| **T31** | **#5 时间码回跳**：播放头沿轨滑动 + 掠过几帧缩略（`imageUrl` 槽） | T25 · T24 | ✅ 与 T28–T30 | `SessionTriTrackView.tsx` · 新建 1 件 | 1 |
| **T32** | **#6 记忆浮现**：`ReviewSessionPanel.tsx` 揭晓四件；**用 `x` 而非 `letterSpacing`** + 接 `Text.css:15-20` 钩子 | T30 | ✅ 与 T31 | `ReviewSessionPanel.tsx`（231）· 新建 1 件 | 1 |
| **T33** | **列折叠 Flip（🔴 先 STOP 实测结构代价）**：**8 处** ColumnBar 落点先量再改；几何位移只登记 | T19 · T11 | ❌ 独占（跨 8 文件 + 3 个测试文件） | 见 T33 节（**含 `components/ChatSidebar.tsx` · `pages/GoalsPage.tsx` · `shell/columnConsumption.test.ts`**） | 0–3（**取决于 STOP 结论**） |
| **T34** | **终态测量**：八门禁 + **`cargo test` 本批必跑** + 真实构建取锁 + 首屏 Δ 归因 + 五类棘轮终态 | 全部 | ❌ 最后 | 0 生产代码（产出 `tmp/t34/**` + 报告） | 1（**只改文档/台账**） |
| **T35** | **文档回写**：规格 9 节就地加注 + `ADR-035` 定稿 + `docs/adr/README.md` + `docs/standards/motion.md` 收口 + **`v0.22.md` 批 6 节（七段）** + `line-limit-exemptions.md` 人工块 | T34 | ✅ 与 T36 | `docs/superpowers/specs/…design.md`（850）· `docs/adr/ADR-035-*.md` · `docs/adr/README.md`（60）· `docs/standards/motion.md` · `docs/versions/v0.22.md`（646）· `docs/standards/line-limit-exemptions.md`（232）· `docs/adr/ADR-013-*.md` | 3（规格+ADR / v0.22 / 台账） |
| **T36** | **用户面 9 项兑现度表 + 二分清单 + 全批收口评审** | T34 · T35 | ❌ 最后 | 0 生产代码（产出评审件 + 收口回写） | 1（登记提交，**若无可 durable 结论则零提交 + 报告**） |

**预估波 B/C/D 提交数 = 25–28**（波 B = 14：T17/T18/T23/T25 各 2 + 其余各 1 · 波 C = 6–9：六条各 1 + T33 的 0–3 · 波 D = 5：T34 1 + T35 3 + T36 1）；**全批预估 43–46 提交**（波 A 18 + 25–28）。

> **🔴 热点文件的单写者约束（波 B/C/D）**
> | 文件 | 唯一写者队列 | 说明 |
> |---|---|---|
> | **`app/src/ui/primitives/motion.css`** | 波 A：T5→T6→T12→T13 → **波 B：T19 → 波 C：T29** | 严格串行；`.css` 不在门禁视野 ⇒ 只给预算 |
> | **`app/src/views/session/SessionTriTrackView.tsx`** | **T25 → T27 → T31** | 三个任务串行；每次提交后复测行数（207 起，目标 ≤300） |
> | **`app/src/components/review/ReviewSessionPanel.tsx`**（231） | **T30 → T32** | 串行 |
> | **`app/scripts/gen-tokens.mjs`** + 生成物 2 件 | 波 A：T5→T8 → **波 B：T17** | 每次改完**必须** `node scripts/gen-tokens.mjs` 重生成并**同提交**带两个产物 |
> | **`app/src/App.tsx`（590）** | **T17 唯一** | ⚠️ **硬限 600**（`line-limits --full` 的 `>600` 零容忍）⇒ 净增 ≤8 行；波 B/C 其余任务**零改动** |
> | **`app/src/views/registry.ts`（109）** | **T24 唯一** | 槽位**只许追加可选字段**（既有 3 处 `import type` 者与 2 个页面的判据不许动） |
> | **`app/src/components/NoteMarkdown.tsx`（266）** | **T26 唯一** | 只许**追加**可选回调；既有 `onOpenSession` 签名一字不改 |
> | **`app/src/components/session-detail/**`** | **T24 → T28** | T24 只动容器侧 + 新建槽文件；T28 只动 `SessionRawView.tsx` |
> | **Rust `app/src-tauri/src/audio_store.rs`（212）** | **T23 唯一** | T22 只动 `commands_audio.rs` / `app_commands.rs` |
> | **`app/src-tauri/src/app_commands.rs`（478）** | **T22 唯一** | 只加 1 行注册条目 |
> | **六类棘轮 + `dialogMigration.e.test.ts`（300/300）+ `navHeight.consumption.test.ts`（165）+ `motion-coverage.test.ts` 的 `:141`** | **无人**（全批只读） | 任何任务若发现「必须改它们才能绿」⇒ **STOP**（`## Global Constraints` 的计划级冲突处理）。⚠️ **唯一例外**：`motion-coverage.test.ts` 若因 R11.3 的落点命名而需改动 ⇒ 见 **T13 的降级路径**（默认**不改**：落点用 `<基类>--<修饰>` 形状即可全绿） |
>
> **可安全并行（波 B 第一段）**：T17 ∥ T20 ∥ T22（文件不相交）→ 之后 T18 ∥ T19 ∥ T21 ∥ T23 → T24 → T25 ∥ T26 → 波 C 串行链（T27 → T28 ∥ T29 ∥ T30 → T31 ∥ T32）→ T33 → T34 → T35 ∥ T36。

> **🔴 热点文件的单写者约束（波 A）**
> | 文件 | 唯一写者队列 | 说明 |
> |---|---|---|
> | **`app/src/ui/primitives/style-seams.test.ts`**（288，余 12） | **T5 → T9 → T14** | 三者**必须串行**；每步提交后**必须复测行数**（≤300）。**任何一步涨到 >300 ⇒ 先把该步的新判据拆到新文件**（不许 `--write` 登记） |
> | **`app/src/ui/primitives/motion.css`**（74，`.css` 不在门禁视野） | **T5（删块）→ T6（档位块）→ T12（响应层）→ T13（环境层）** | 严格串行；每一步只加自己那一节 |
> | **`app/src/ui/primitives/motion-coverage.test.ts`**（147） | **T6（源序）→ T13（名单增长）** | 串行 |
> | **`app/scripts/gen-tokens.mjs`** + 生成物 2 件 | **T5 → T8** | 串行；每次改完**必须** `node scripts/gen-tokens.mjs` 重生成并**同提交**带上两个产物 |
> | **`app/src/motion/engine.ts`** | **T3 → T8** | 串行；T8 只加 `CustomEase.create` 三行 |
> | **`app/package.json` / `app/package-lock.json`** | **T3** | 其余任务**零改动**（批 2/4/5 的「零新增依赖」在本批由 R2.1 唯一破例一次） |
> | **`app/src/build/manualChunks.test.ts`**（292，余 8） | **T3** | G8 唯一落点；**净增行数必须 = 0** |
> | **`app/src/shell/TopBar.test.tsx` · `ShellFallback.test.tsx` · `ui/primitives/ViewSwitcher.test.tsx`** | **T14** | 其余任务零改动 |
> | **五类棘轮 + 各自 `*Baseline.ts` + `dialogMigration.e.test.ts`（300/300）+ `buttonMigration.test.ts`（280）+ `zIndex.guard.test.ts`** | **无人**（全批只读） | 任何任务若发现「必须改它们才能绿」⇒ **STOP**（见 `## Global Constraints` 的计划级冲突处理） |
> | **`app/src/ui/primitives/textBaseline.ts`**（297） | **T16**（只改 1 行） | 其余任务零改动（`emptyStateRatchet` / `textRatchet` 只读） |
>
> **可安全并行**：T1 ∥ T2 ∥ T3 ∥ T4 ∥ T5 ∥ T6 · T7 ∥ T8 ∥ T10 ∥ T11 · T15 ∥ T16。
> **必须串行**：T5 → T9 → T14（`style-seams`）；T5 → T6 → T12 → T13（`motion.css`）；T3 → T8（`engine.ts`）；T14 必须在 T12 之后（顶栏动效先落）。

---

## 波 A · 地基与纲领（T1–T16）

> 以下每个任务节都含：**目标** · **要动的文件（逐个给实测行数 + 是否 ≥290 贴边 + 是否在 `NON_MIGRATED_14`）** · **步骤** · **Verification 表（判据 ↔ 变异体 ↔ 期望，逐行）** · **提交信息** · **诚实边界**。
> 🔴 `NON_MIGRATED_14` 逐字清单（`app/src/ui/primitives/dialogMigration.e.test.ts:115-122`，**本轮逐字复核**）：`components/CaptureOverlayPanel.tsx` · `GroupRowContextMenu.tsx` · `ImagePreviewOverlay.tsx` · `NoteEditView.tsx` · `NoteLinkToSystem.tsx` · `NoteListBatchMenu.tsx` · `NoteMoveToGroupMenu.tsx` · `NoteRowContextMenu.tsx` · `RichEditorView.tsx` · `RouteInfoPopover.tsx` · `ScreenSelectOverlay.tsx` · `SessionRowContextMenu.tsx` · `chat/ChatLaunchMenu.tsx` · `note-selection/SelectionActionMenu.tsx`。**波 A 的 16 个任务一个都不落在其中**（逐个核对见各任务的「要动的文件」表）。

### 🔻 波 A 定点修订台账（R11.1–R11.8 的落点；**任务号与任务节结构未动**，只做逐处定点修订）

> **本单元（P2 续写单元）对波 A 的全部改动只有下表这些**，逐条点名「改了哪个 T 的哪一段」；**其余内容逐字保持原样**。R11.2 的追认表现在 `### 表 5`（三条已从"清单外"变为 **G12/G13/G14**）；R11.7 的两条代码对齐已在 P1 的表 1/表 2 里逐字为 266 / 10，**本单元复核一致、无需改**。

| 裁决 | 落点 | 改了什么 |
|---|---|---|
| **R11.1** | **T2 · Step 3** | 「静态白名单 = `engine.ts`」⇒ 重述为 🔴「`app/src/**` 中静态 import `gsap`/`@gsap/react` 的文件集合 ∩ 首屏静态可达闭包 = ∅」+ 三条连带硬约束（`engine.ts` 唯一装配 · **需要 `useGSAP` 的组件自身必须在动态 import 链上** · `@gsap/react` 不得被首屏静态模块静态 import）+ **课堂页是静态的** ⇒ 课堂页的 GSAP 必须抽 `React.lazy` |
| **R11.1** | **T3 · Interfaces 的冻结快照之后** | 加「唯一允许静态 import 的文件 = 本文件」的**派生说明**（闭包判据 ⇒ 白名单是结论不是判据）+ 连带硬约束② |
| **R11.1 / R11.5** | **T4 · Interfaces（Step 1/2/3）· V1/V2/V2b** | ③′ 与 ③″ **合成为闭包判据**（交集为空）；③′ 的「文件集恰等于」降为**诊断读数**；新增 **V2b**（课堂页静态闭包不含 GSAP 家族）+ 遍历的**第二个阳性对照** `pages/ClassroomPage.tsx`；R11.5 的「未运行 ≠ 通过 / 守卫不得静默通过」逐字并入 Step 3 |
| **R11.3** | **T13 · 四件的落点表 ③ 行 · Step 1（G15 域判定）· Step 2/2b（新增）· Step 3 · V4/V4b/V4c · Files 表 · 诚实边界** | 第 ③ 件**改为真接线**：落点 = `views/session/**` 段条目 + `SessionSegment.confidence` + `lowConfidenceClass()` 真调用（0→2）；类名取 **`ed-text--low-confidence`**（`--` 形状 ⇒ **零既有断言改动**）；幅度 **2% 具名常量**；**G15 域判定**（`Loading.test.tsx:49` 实证 ⇒ **条件不成立、G15 失效、G5 恢复**）；**「环境层 4 件逐条兑现度」写进本任务 + 波 D 收口要求**；新增 V4b/V4c + 三个变异体；**接线因写者队列下沉到 T25/T28**（逐字登记，不得写成已通过） |
| **R11.4** | **T9 · V4b（新增）· 诚实边界①** | 位移判据域**收窄为只判 `translate*()` + `motion/` 层位移常量**（`margin\|left\|top` 的 4 处 >8px 为布局量、**不判**）；R11.4 的**追认**与理由逐字写入；4 处读数从「白名单」改为「守卫注释里的现场证据」；新增 V4b（`motion/` 层常量 ≤8px） |
| **R11.5** | **T4 · Step 3 的两个 ⚠️ 条目** | 「真实构建强制命令 + `runIf(existsSync(dist))` 用例 + **未运行入「未验证」单列**」；「未运行 ≠ 通过 ⇒ 守卫**不得**静默通过」；并写明**闭包判据是无条件可跑的那一半**（导出树里仍有硬判据） |
| **R11.6** | **T14 · G3 行（S5 形态）· 诚实边界②** | G3 = **保留两条禁令原文 + 追加「transition 值只许 token」正面判据**；「请追认」⇒ **已获 R11.6 追认**（逐字引 R11.6 与「比原裁决更强」） |
| **R11.8** | **Global Constraints 行数纪律 · T5 Files 表 · T5 诚实边界①②⑤** | 「新文件 ≤300」⇒ **「`.ts`/`.tsx`/`.rs` 新文件 ≤300」**（`SOURCE_EXT` 实测不含 `.css`/`.mjs`）；`pill = 999px`（点名 `Surface.css:58`）；新落点类名形状约束；`documentElement` 0 命中（三档通道是全新能力）；**`gen-tokens.test.mjs` 与 `tokens.drift.test.ts` 是两处独立真源断言（G14/G9 必须同时处理）** |
| **R11.2** | **`### 表 5` 表头 + 三行 + G 号列** | 三条从「清单外 / 需追认」改为**已授权 G12/G13/G14**，逐条补**专属变异体**；并声明本表之外**仍有一条已授权的清单外项 = G11**（归 T20）与**一条未授权的 G16 候选**（R11.3 的命名分支） |

**本单元对波 A 未做的任何其它改动（自陈）**：T1/T6/T7/T8/T10/T11/T12/T15/T16 的正文、全部 Verification 表、全部提交信息、全部诚实边界、`## 实测基线` 三表、`## 陷阱` B1–B7 的原文 —— **一字未动**（`## 陷阱` 只**追加** B8/B9 两节，见下）。

---

### Task 1: 动效规范 `docs/standards/motion.md`（**必须先于任何动效代码**）

> **为什么第一个做**：AGENTS.md §0.4 逐字「规范与代码冲突时以规范为准；**规范过时时先改规范再改代码**」。今天 `docs/standards/` 对「动效 / motion / 动画 / `prefers-reduced`」**几乎零命中**（实测 24/25 文件全 0），而波 A 要落一整套动效纲领 —— 顺序颠倒就是「先写代码再补规范」。

**目标**：新建 `docs/standards/motion.md`，把规格 §8 的**四层纲领、引擎分界规则、双基调、强度三档、reduced-motion 优先级、6 个签名动效的硬约束、以及本批的判据纪律（确定性推进正解 + 四个禁用项 + 可中断双断言 + 属性集合代理）**写成**可执行的规范**；并在 `docs/standards/README.md` 的索引表里加一行（否则 `docs-check` 的「索引覆盖完整 ✅」会变成 `⚠️`）。

**Files:**
- 新建 `docs/standards/motion.md`（预算 **≤260 行**；`.md` 不受行数门禁约束，此处是自设预算）
- 改 `docs/standards/README.md`（**+1 行**，插进「规范清单」表；建议插在 `performance.md` 之后）
- **`NON_MIGRATED_14`**：不适用（`.md` 文件）

**Interfaces:**
- Consumes：规格 §8 全节 · §8.6.1 四条硬约束 · 尖刺报告 S4/S5 的实测结论
- Produces：`docs/standards/motion.md`（其「判据纪律」节的**禁用项字符串**被 **T10** 的 harness 与 **T11** 的守卫**逐字复用** ⇒ 该节是下游的机械输入，不是散文）

- [ ] **Step 1: 抄骨架（照 `docs/standards/performance.md`(167 行) 的章节结构）**
  章节序：`# 动效规范（L4）` · `## 目的` · `## 适用时机` · `## 四层纲领` · `## 引擎与分界规则` · `## 双基调` · `## 强度三档与 reduced-motion 优先级` · `## 判据纪律（可测与不可测）` · `## 检查清单` · `## 输出物` · `## 常见误区` · `## 相关文档`。

- [ ] **Step 2: 四层纲领节 —— 逐字抄规格 §8.1 `:489-496` 的表 + §8.6.1 第 1 条的配重结论**
  **不得**改写数值（响应层 80–180ms · 环境层 2–6s · 编排层 400–900ms · 生长层 秒→天）；`未确认段落墨度极缓慢起伏` 的**幅度逐字 = 2%**。

- [ ] **Step 3: 引擎与分界规则节 —— 逐字抄 §8.2 `:498-509` 的四行判据表 + §13 的「GSAP 独立 chunk 懒加载」**
  写清：**单属性 · 无时序 · <200ms ⇒ CSS transition；多元素 · 有时序 · 需中断/反向/seek ⇒ GSAP timeline；从 A 布局滑到 B 布局 ⇒ Flip；循环环境动效 ⇒ CSS keyframes（不占 JS 主线程，reduced-motion 一条媒体查询即静态）**。附**本批的引擎事实**（`gsap@3.15.0` + `@gsap/react@2.1.2`；唯一入口 `app/src/motion/engine.ts`；顶层 `registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`；**gsap 双实例陷阱**逐字见 `## 陷阱` #B1-①）。

- [ ] **Step 4: 判据纪律节（本节是硬输入）**
  必须逐字含下列四组字符串（**下游守卫会按这些串做「文档 ↔ 代码」对拍**）：
  - **正解（唯一）**：`gsap.timeline({paused:true})` + `tl.time(t)`
  - **禁用（四个，逐字）**：`gsap.updateRoot` · `gsap.ticker.tick` · `gsap.ticker.sleep` · `await sleep`
  - **可中断判据（双断言，逐字两半）**：`gsap.globalTimeline.getChildren().length`（或旧 tween 的 `totalTime()` 冻结）**与** 目标元素 `style.transform`
  - **帧率代理判据**：被动画的 CSS 属性集合 **⊆ `{transform, translate, rotate, scale, opacity, filter}`**
  并逐字写清 **不可用判据清单（只能登记）**：真实 60fps · Flip 几何位移 · `window` 级滚动 · 真实媒体播放 · 真机/WebView2 观感 · 视图密度观感 · 切视图卡顿 · 惰性挂载的运行时内存效果 · 暗档实际生效。

- [ ] **Step 5: `docs/standards/README.md` 加索引行**
  在「规范清单」表里加一行（**格式照既有行，四列齐全**）：
  `| [motion.md](./motion.md) | 动效规范（L4 四层纲领 / 引擎分界 / 双基调 / 三档强度 / 判据纪律） | ✅ 必用 | ✅ 必用 |`
  ⚠️ 该表的第 3/4 列是「个人项目 / 小团队」，请照邻行取 ✅/⬜，**不要**新造符号。

- [ ] **Step 6: 跑门禁并提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/docs-check.mjs            # 期望：五项全 ✅（尤其「索引覆盖完整」）
node scripts/line-limits.mjs --full     # 期望：exit 0 · 0 / 122 / 122
git add -- docs/standards/motion.md
git commit --only -m "docs(standards): 新增 L4 动效规范章节" -- docs/standards/motion.md docs/standards/README.md
```

**Verification**

| # | 判据 | 变异体（专属，翻回旧行为 ⇒ 必须红） | 期望 |
|---|---|---|---|
| **V1** | `node scripts/docs-check.mjs` 的输出里**不出现** `未收录于本目录索引` 字样，且含 `✅ 索引覆盖完整`（仪器 = `scripts/docs-check.mjs`；口径 = `idxContent.includes(basename(file))`，只 warn 不 exit 1 ⇒ **判据必须按输出文本判，不能只看 exit code**；变异体实验同样按输出文本判） | **M1**：删掉 `docs/standards/README.md` 里刚加的那一行 ⇒ 再跑 | **M1 后期望**：输出出现 `⚠️ 1 个文件未收录于本目录索引` 并列出 `docs/standards/motion.md`；恢复后 ✅ |
| **V2** | **文档 ↔ 代码对拍**：`motion.md` 必须逐字含 `scripts/…` 无关的 8 个纪律串（4 禁用 + 2 双断言半句 + 1 正解 + 1 属性集合）—— 由 **T10** 的守卫机械执行（本任务先自证一次：用手写探针脚本在 `motion.md` 里找这 8 个串，**并喂一个无意义串证明探针会报 0**） | **M2**：把 `motion.md` 里的 `gsap.ticker.sleep` 改写成「ticker sleep」⇒ 探针与守卫都不再命中 | **M2 后期望**：探针报「缺 1 条」；T10 的守卫用例红（`expect(md).toContain("gsap.ticker.sleep")`） |
| **V3** | **引用保真**：`motion.md` 里**每条**「规格 §x.y」引用后面括号里给的行号，在规格文件里**确实包含**该节标题串（探针：读 `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`，按 `:NNN` 抽行号，断言 `lines[n-1].includes("### " + 节号)`） | **M3**：把 `§8.1` 的行号从 `489` 改成 `499` | **M3 后期望**：探针报该行不含 `### 8.1` |
| **V4** | `node scripts/line-limits.mjs --full` exit 0（新 `.md` 不进扫描域，本判据只证**没顺手把别的东西弄红**） | —（门禁类，无需变异） | exit 0 · `>600 硬限 0 · 301–600 档 122 · 登记条目 122` |

**提交信息**：`docs(standards): 新增 L4 动效规范章节`（**subject 12 字**）

**诚实边界**：① 本任务**不产生任何可运行代码** ⇒ 「规范被遵守」这件事**只能由下游任务的判据间接证明**（V2 只证明**串在**，不证明**人在照做**）；② `motion.md` 的「不可用判据清单」是**登记性文字**，`docs-check` **不会**校验它是否与实盘一致 ⇒ 实盘一致性由 **波 D** 的收口评审人工核对；③ 本任务**不写** `docs/standards/testing.md`（那归 T10）。

---

### Task 2: `ADR-035`（L4 动效纲领与引擎）+ 索引

> **依据**：R6.8 逐字「规格 §14 逐字『ADR-034/035 顺延至批 3 / 批 6』；`recon-a` A10：`docs/adr/` 实盘最高 ADR-034，**ADR-019 缺号**（**不修，只登记**）」。

**目标**：新建 `docs/adr/ADR-035-l4-motion-grammar-and-engine.md`，把波 A 已定的**架构级**决策固化成 durable 载体（引擎选型与接入面 · 唯一入口与插件注册 · **gsap 双实例陷阱** · token 真源迁移 · 三档 / 双基调 / 位移上限的实现层 · 判据纪律），并**单列「后端契约例外」节**（R0.1 第 1 条 ②）；同时进 `docs/adr/README.md` 索引。

**Files:**
- 新建 `docs/adr/ADR-035-l4-motion-grammar-and-engine.md`（预算 **≤300 行**；格式母本 = `docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md`（161 行）的骨架：`## 背景` / `## 决策`（`### N. ` 子节）/ `## 后果` / `## 替代方案与否决理由` / `## 合规性验证` / `## 登记（非本 ADR 管辖，供后续批次接手）` / `## 相关决策`）
- 改 `docs/adr/README.md`（**+1 行**，插在 ADR-034 之后；⚠️ **不要**去补 `ADR-019` 的缺号）
- **`NON_MIGRATED_14`**：不适用

**Interfaces:**
- Consumes：T1 的 `motion.md`（规范是 ADR 的上游）· 尖刺 S3.2 的双实例实测（`tmp/spike-gsap/evidence/vitest-s3-nofix.out.txt` 与 `…-withfix.out.txt`）
- Produces：ADR-035 的「决策」节被 **T3/T5/T6/T8/T9** 逐条引用；「后端契约例外」节的**四列**被**波 B** 的 T-probe 回填

- [ ] **Step 1: 抄 `ADR-034` 的章节骨架**（`## 背景` → `## 决策` → `## 后果` → `## 替代方案与否决理由` → `## 合规性验证` → `## 登记` → `## 相关决策`），行数与语气照它。
- [ ] **Step 2: 「决策」子节（每条一节，逐条给依据）**
  1. **引擎 = GSAP**（`gsap@3.15.0` + `@gsap/react@2.1.2`；零传递依赖；许可 `Standard 'no charge' license`；2025 起全插件免费含 Flip/ScrollTo/CustomEase）。**否决**：自研 timeline（规格 §8.2 已定）、`motion` / `framer-motion`（React 绑定、不利 Flip）。
  2. **唯一入口 = `app/src/motion/engine.ts`**，顶层 `gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`。**依据逐字写进 ADR**（双实例根因 + 实测读数：未注册 ⇒ StrictMode **2 个 tween**、卸载后 `transform` 残留；注册后 ⇒ **1 个 tween**、`transform=""`、tween 数 0）。
  3. **懒加载边界（🔻 R11.1 追认并加强后的形态，取代 P1 的「白名单」写法）** = 🔴 **「`app/src/**` 中静态 import `gsap` / `@gsap/react` 的文件集合 ∩ 首屏静态可达闭包 = ∅」**（机器可判：复用 `scripts/bundle-eager-graph.mjs` 的源文件集合；闭包判据是**结构性**的，白名单是**易腐化**的）。**三条连带硬约束必须逐字进 ADR**：① `engine.ts` 仍是**唯一引擎装配文件**（`registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)` 在此，R2.2 不变）；② **任何需要使用 `useGSAP` 的组件，其自身必须位于动态 import 链上** —— 首屏静态页（**🔴 课堂页 `pages/ClassroomPage.tsx` 是静态的**，批 2 交付形态「8 页懒 + 课堂页静态」）里的 GSAP 动画**必须**抽成 `React.lazy` 子件；③ **派生禁令**：`@gsap/react` 不得被任何首屏静态模块静态 import（它是 `vendor-gsap` 成员，一旦进闭包就等于 GSAP 进首屏）。ADR 里必须写清**为什么**这种写法等价于（且强于）R2.1 的原意「只经 `import()` 落懒 chunk」。
  4. **token 真源 = `app/scripts/gen-tokens.mjs`**（R1.1）；`motion.css` 不得再定义 `--ed-dur-*` / `--ed-ease`。
  5. **档位载体 = `<html data-motion="eco|standard|rich">`**（R3.1）+ **源序**（档位块先于 reduced-motion 块）+ 系统 `prefers-reduced-motion` **优先于档位**。
  6. **双基调 = `data-tone` + 两个缓动 token + `CustomEase` 具名 ease**（R3.4）；**不按类名分**。
  7. **位移上限 8px 的唯一出口 = `app/src/motion/shift.ts`**（R3.5 + `### 表 4` 的 S4 收窄）。
  8. **判据纪律**（正解 / 四禁用 / 双断言 / 属性集合代理；不可用清单）—— 引 `motion.md` 而非复制。
- [ ] **Step 3: 「后端契约例外」节（R0.1 第 1 条 ②）**
  四列表：**原因** · **影响面** · **回滚** · **依据**。**内容形态**：本 ADR 记录**授权已下**（R0.1 第 1 条），**具体形态待波 B 的 T-probe 回填**（探针须回答 `list_due_cards` / `review_card` / `count_due_cards` 的 Rust 侧返回结构里**是否已有** interval / scheduled_days / due 间隔量；有 ⇒ 零 Rust 改动、只加只读暴露；无 ⇒ 新增**只读**字段，**不新增表、不改既有字段、不改既有 SQL 语义**）。**这一节必须显式标注「待回填」**，不得写成已完成。⚠️ 波 D 定稿这一节。
- [ ] **Step 4: 「登记」节逐条**：`ADR-019` 缺号（**不补、不复用**）· 暗档 `data-theme` 接线 → 批 7/8（R2.5）· `ink-4` / §4.3 条件③ → 批 7/8（R6.2）· 字号越界 551 → 批 8（R6.3）· `pinnable` 消费方 → 本批随列折叠 Flip（波 C）· `pane`/`docs/tech-debt/` → 挂起（R6.9）。
- [ ] **Step 5: `docs/adr/README.md` 加一行**（照表头 `| 编号 | 标题 | 状态 | 日期 |`，状态取邻行用词，日期 `2026-09-13`）。
- [ ] **Step 6: 跑门禁并提交**（命令同 T1；`git add -- docs/adr/ADR-035-l4-motion-grammar-and-engine.md` 后再 `--only`）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | `docs-check` 输出含 `✅ 索引覆盖完整` 且**不含** `未收录于本目录索引`（口径同 T1 V1） | **M1**：删掉 README 的 ADR-035 行 | **M1 后期望**：`⚠️ … docs/adr/ADR-035-l4-motion-grammar-and-engine.md` 出现在输出里 |
| **V2** | **ADR ↔ 引擎代码对拍**：ADR「决策 2」里逐字列出的插件集合 == `app/src/motion/engine.ts` 顶层 `registerPlugin(...)` 的实参集合（探针：从两个文件各抽一次，做集合相等；**阳性对照**：抽到的集合非空且恰 4 个） | **M2**：从 `engine.ts` 的 `registerPlugin` 里删掉 `ScrollToPlugin` | **M2 后期望**：集合不等 ⇒ 探针报 `ADR 列 4 / 代码列 3`；T4 的守卫同步红 |
| **V3** | **例外节四列齐备**：ADR 里「后端契约例外」节的表头逐字含 `原因` / `影响面` / `回滚` / `依据`，且节内**含**「待回填」三字（防波 B 未做而 ADR 已声称完成） | **M3**：删掉「回滚」列；**M3b**：删掉「待回填」 | **M3 后期望**：探针报缺 1 列；**M3b 后期望**：探针报「例外节声称已完成（无待回填标记）」 |
| **V4** | `line-limits --full` exit 0 + `docs-check` exit 0 | —（门禁类） | exit 0 / exit 0 |

**提交信息**：`docs(adr): 新增 ADR-035 L4 动效纲领与引擎`（**subject 16 字**）

**诚实边界**：① 「后端契约例外」节**本任务只写授权与形态边界，不写实测读数**（波 B 的 T-probe 回填）—— 这是**有意的**，不是遗漏；② ADR 里引用的**尖刺读数**来自 `.superpowers/`（gitignored，不入库）⇒ ADR 正文**必须把关键读数逐字写下来**（否则导出树里读者无从追溯）；③ ADR **不认证**「三档正确 / 60fps」（那是判据的事）。

---

### Task 3: 装 GSAP + 唯一入口 `engine.ts` + G8 改判

> **依据**：R2.1（版本冻结 + 授权装依赖）· R2.2（唯一入口 + 顶层 `registerPlugin`）· G8（`manualChunks.test.ts:272` **按它自带的正解指引修，不是改断言**）。
> **这是本批唯一破「零新增依赖」的地方**（批 2/4/5 的硬约束在本批由 R2.1 授权破例一次）。

**目标**：装 `gsap@3.15.0` + `@gsap/react@2.1.2`；建 `app/src/motion/engine.ts`（**全仓唯一 GSAP 入口**，顶层 `registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`，导出 `gsap` / `useGSAP`）；把 `manualChunks.test.ts:272` 的「此刻没有 gsap」断言按 G8 改判为「装上了，且仍落 `vendor-gsap`」；用 StrictMode 用例证明「注册后 1 个 tween」。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/package.json` | **41** | 否 | 否 | 加 2 条 `dependencies` |
| `app/package-lock.json` | **5525** | 否（`.json`） | 否 | `npm install` 自动写 |
| `app/src/motion/engine.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤90** |
| `app/src/motion/engine.test.ts` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `app/src/build/manualChunks.test.ts` | **292** | ⚠️ **是**（余 **8**） | 否 | **只改 `:263-274` 的 `:271-272` 两行，净增行数 = 0** |

**Interfaces:**
- Consumes：T2 的 ADR（插件集合冻结）
- Produces：`export { gsap, useGSAP }` —— 被 **T4/T8/T10/T11** 与波 B/C 的全部动效落点消费。**接口冻结快照**（写进报告）：
  ```ts
  // app/src/motion/engine.ts
  import { useGSAP } from "@gsap/react";
  import { gsap } from "gsap";
  import { Flip } from "gsap/Flip";
  import { ScrollToPlugin } from "gsap/ScrollToPlugin";
  import { CustomEase } from "gsap/CustomEase";
  gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase);
  export { gsap, useGSAP };
  ```
  **唯一允许静态 import GSAP 家族的文件就是本文件**（**🔻 R11.1 的闭包判据形态**：判据不是「白名单 = 本文件」这种易腐化写法，而是 **「静态 import GSAP 家族的文件集合 ∩ 首屏静态可达闭包 = ∅」**；本文件之所以能存在，是因为它**不在**该闭包内 —— 二者是**派生**关系，不是两条判据）；其余 `app/src/**` 只许 `await import("../motion/engine")`。
  ⚠️ **连带硬约束二（波 B/C 的入场条件）**：**凡需要 `useGSAP` 的组件，其自身必须在动态 import 链上** —— **课堂页是静态页**（批 2 交付形态）⇒ 课堂页上的任何 GSAP 动画**必须**抽成 `React.lazy` 子件；**不得**为了省一层懒加载而把 `engine.ts` 拉进首屏闭包。

- [ ] **Step 0: 开工自证**（`git log --oneline -3` 期望 `6cbe964e` 打头 + T1/T2 的提交；`git status --porcelain` 期望仅 `?? docs/tech-debt/`）
- [ ] **Step 1: 装依赖（第 1 个原子提交）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npm install gsap@3.15.0 @gsap/react@2.1.2
# 判据：exit 0；Test-Path node_modules\gsap；Test-Path node_modules\@gsap\react
cd ..
git commit --only -m "build(motion): 装上 gsap 与 @gsap/react" -- app/package.json app/package-lock.json
```
> ⚠️ `npm install` 是**本批唯一允许的依赖安装**；它**必须只改 `app/package.json` + `app/package-lock.json` 两个文件**（提交前 `git status --porcelain` 复核，多出任何路径 ⇒ STOP）。

- [ ] **Step 2: 建 `engine.ts`**（逐字照上面的冻结快照；文件头写 `@ai-context`：Why = R2.2 的双实例根因 + 为什么必须在顶层 register + 为什么本文件是全仓唯一静态 import 点；副作用 = 注册全局插件；边界 = **只能经 `import()` 到达**）
- [ ] **Step 3: G8 改判**（`manualChunks.test.ts:263-274`）

把 `:271-272` 两行
```ts
    // 批 6 装上后这条会红 ⇒ 去构建一次，核对 vendor-gsap chunk 独立生成且只经 import() 到达。
    expect(Object.keys(all).filter((d) => d === "gsap" || d === "@gsap/react")).toEqual([]);
```
改成（**净增行数 = 0**，并**保留**原注释指向的验收动作）
```ts
    // 批 6 已装上（本行由批 6 按上面那句正解改判）：判据从「此刻没有」变成「恰是这两个」。
    expect(Object.keys(all).filter((d) => d === "gsap" || d === "@gsap/react").sort()).toEqual(["@gsap/react", "gsap"]);
```
同时把 `it` 的标题（`:263`）从「槽位在表里，且 package.json 此刻没有 gsap（两半必须同时成立）」改成「槽位在表里，且 package.json 已装 gsap（两半必须同时成立）」（**同行替换，净增 0**）。⚠️ `:273` 的 `expect(vendorGroupOf("/r/node_modules/gsap/index.js")).toBe("vendor-gsap");` **一字不改**（它是「装上了仍归对组」这一半）。
- [ ] **Step 4: 新建 `engine.test.ts`**（首行 `// @vitest-environment jsdom`）
  三条用例：① **StrictMode 下单 tween**（`render(<StrictMode><Probe/></StrictMode>)` 后 `gsap.getTweensOf(el).length === 1`）② **卸载后清零且无残留**（`unmount()` 后 `el.style.transform === ""` 且 tween 数 0）③ **四个插件真的注册**（`CustomEase.create("ed-probe","0.2,0,0,1")` 后 `gsap.parseEase("ed-probe")` 是 function 且 `typeof Flip.getState === "function"`）
  ⚠️ 测试里**不得**把 jsdom 的 `performance` 挂到 `globalThis`（R8.3）；**不得**用 `await sleep()`。
- [ ] **Step 5: 八门禁 + 第 2 个提交**

```powershell
git add -- app/src/motion/engine.ts app/src/motion/engine.test.ts
git commit --only -m "feat(motion): 建 GSAP 唯一入口与插件注册" -- app/src/motion/engine.ts app/src/motion/engine.test.ts app/src/build/manualChunks.test.ts
```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | `manualChunks.test.ts` 的新断言（G8）：`Object.keys({...deps, ...devDeps}).filter(d => d==="gsap"\|\|d==="@gsap/react").sort()` 等于 `["@gsap/react","gsap"]` | **M1**：把 `app/package.json` 的 `gsap` 那行删掉（导出树内）⇒ 重跑该文件 | **M1 后期望**：`toEqual(["@gsap/react","gsap"])` 收到 `["@gsap/react"]` ⇒ **红**（证明新断言不是恒真） |
| **V2** | **StrictMode 单 tween**：组件在 `StrictMode` 下调用 `useGSAP()` 建 1 个 tween ⇒ `gsap.getTweensOf(el).length === 1`（**双断言之一**：同时断 `gsap.globalTimeline.getChildren().length === 1`） | **M2**：把 `engine.ts` 的 `registerPlugin` 实参里的 `useGSAP` 删掉 ⇒ 重跑 | **M2 后期望**：实测 **2 个 tween**（尖刺 S3.2 的既有读数）⇒ **红**。⚠️ 该变异是**本批最重要的一条**（它证明「那一行 register 真的在防 StrictMode」） |
| **V3** | **卸载干净**：`unmount()` 后 `el.style.transform === ""` 且 `gsap.getTweensOf(el).length === 0` | **M3**：把 `useGSAP()` 换成裸 `useEffect` + `gsap.to` | **M3 后期望**：`transform` 残留 `translate3d(…)` ⇒ 红 |
| **V4** | **四插件注册**：`CustomEase.create` 后 `gsap.parseEase(name)` 为 function；`Flip.getState` / `gsap.plugins` 可见 | **M4**：从 `registerPlugin` 摘掉 `CustomEase` | **M4 后期望**：`parseEase(name)` 返回 `undefined`（尖刺 S4.1 实测的静默退化）⇒ 红 |
| **V5** | **静态 import 白名单 = 1**：全仓 `app/src/**` 里 `from "gsap"` / `from "@gsap/react"` / `from "gsap/*"` 的静态命中，剥注释后**只出现在 `motion/engine.ts`**（本任务的**自证探针**；常驻守卫在 T4） | **M5**：在 `app/src/main.tsx` 加一行 `import { gsap } from "gsap";` | **M5 后期望**：命中数 1 → 2 且文件 ≠ `engine.ts` ⇒ 红 |
| **V6** | `cd app; npx tsc --noEmit` exit 0 · `npx vitest run` 全绿且**用例数 ≥ 1770 + 新增**（**既有用例一条不许少**） | —（门禁类） | exit 0 / exit 0 |

**提交信息**：① `build(motion): 装上 gsap 与 @gsap/react`（subject 16 字）② `feat(motion): 建 GSAP 唯一入口与插件注册`（subject 15 字）

**诚实边界**：① 🔴 **`vendor-gsap` chunk 是否真的独立生成、且不在首屏** —— 本任务的断言**证明不了**（那要真实构建；`### 表 4` 的 S2）⇒ 归 **T4** 的真实构建命令 + `## 诚实边界` 单列；② 「`@gsap/react` 在浏览器构建里不会造成双实例」是**尖刺的推断**（Vite 认 `module` 字段），**本批不实测浏览器侧** ⇒ 只登记；③ `gsap.registerPlugin` 是**全局副作用** ⇒ 一旦 `engine.ts` 被 import，插件对全进程可见；这一点**不影响**测试隔离（每个测试文件独立 worker），但**必须**写进文件头；④ 本任务**不改** `vite.config.ts` / `manualChunks.ts`（`vendor-gsap` 槽位早已存在且规则天然惰性）。

---

### Task 4: GSAP 懒加载三件套守卫（新守卫文件 + 真实构建判据）

> **依据**：R2.1 逐字「**新增守卫文件**（预算 ≤200 行）：把三条写成机器判据 + **各带变异体**」。三条 = ① 产物出现 `vendor-gsap-*.js` ② `check-bundle-budget --no-build --json` 的 `firstScreen.chunks` **不含**它 ③ `app/src/**` 里**静态** `from "gsap"` / `from "@gsap/react"` 命中 **0**。形态取舍见 `### 表 4` 的 **S2**。

**目标**：新建 `app/src/motion/engine.guard.test.ts`，把三条判据落成机器判据（③ 用 `### 表 4` S1 的精确化形态 `③′/③″`；①② 以 `runIf(existsSync(dist))` 的产物用例 + **强制命令行**双轨执行）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/motion/engine.guard.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**（无需 DOM），预算 **≤200** |
| `app/src/build/manualChunks.ts` | **159** | 否 | 否 | **零改动**（槽位已就位；本任务只读它做阳性对照） |

- [ ] **Step 1: 写 ③′（静态 import 白名单 —— 🔻 R11.1 追认后的形态）**
  扫描域 = `app/src/**` 的 `.ts`/`.tsx`（**剥注释**，正解先例 `ui/primitives/sliceScan.ts` 的 `stripComments`），正则 = `/(?:^|\n)\s*import[^;]*?from\s*["'](gsap(?:\/[^"']*)?|@gsap\/react)["']/` **加上** `export … from` 形态。**断言**：命中集合的**文件集**恰等于 `{"motion/engine.ts"}`（**不是「命中 0」** —— 见 S1）。**防真空对照**：先喂一个已知存在的样本（`engine.ts` 自身必须命中 ⇒ `hits.length >= 4`），再喂无意义串（`"gsap-core"` / `"not-gsap"` 必须 0 命中）。
- [ ] **Step 2: 写 ③″（`engine.ts` 不在首屏静态闭包内）—— 🔻 与 ③′ 合成为 R11.1 的闭包判据**
  🔴 **R11.1 逐字**：「`app/src/**` 中**静态** import `gsap` / `@gsap/react` 的文件集合 **∩** 首屏静态可达闭包 **= ∅**」（复用 `scripts/bundle-eager-graph.mjs` 的源文件集合，机器可判）。**实施形态**：③′ 产出「静态 import GSAP 家族的文件集合」（正则级扫描），③″ 产出「首屏静态可达闭包」（最小静态图遍历）；**判据 = 两者交集为空**。
  ⚠️ ③′ 的「文件集恰等于 `{"motion/engine.ts"}`」是**诊断读数**（用于失败信息定位），**不是**判据本体 —— 它单独存在时是易腐化的白名单。**两个读数都要打印**，判据取交集。
  写一个**最小静态图遍历**（≤60 行，写在测试文件内）：从 `app/src/main.tsx` 出发，只用正则抽**静态** `import … from "…"` / `export … from "…"`（**排除** `import(` / `import type`），递归解析相对路径（含 `./x` → `./x.ts` / `./x.tsx` / `./x/index.ts`），断言访问集合**不含** `motion/engine.ts`。**阳性对照**：同一遍历必须**能**到达 `ui/primitives/index.ts`（已知在首屏 ⇒ 证明遍历没有静默失效）。**第二阳性对照（🔻 课堂页）**：同一遍历必须**能**到达 `pages/ClassroomPage.tsx`（它是首屏静态页 ⇒ 证明「课堂页静态」这条事实被仪器看见；「课堂页里的 GSAP 必须走 `React.lazy`」的判据由此可红）。
- [ ] **Step 3: 写 ①/②（产物用例）**
  `const dist = join(ROOT, "app", "dist"); const hasDist = existsSync(join(dist, "index.html"));`
  - `it.runIf(hasDist)("① 产物里出现 vendor-gsap-*.js", …)`：`readdirSync(join(dist,"assets")).filter(f => f.startsWith("vendor-gsap-") && f.endsWith(".js"))` 长度 ≥1
  - `it.runIf(hasDist)("② firstScreen.chunks 不含 vendor-gsap", …)`：`execFileSync("node", ["scripts/check-bundle-budget.mjs","--no-build","--json"], { cwd: ROOT })` ⇒ `JSON.parse` ⇒ 断言 `firstScreen.chunks.every(c => !String(c).includes("vendor-gsap"))`
  - ⚠️ **R11.5 逐字（本条的形态依据）**：「**真实构建强制命令 + `runIf(existsSync(dist))` 用例 + 未运行入「未验证」单列**」；「**未运行 ≠ 通过** ⇒ 报告必须把该用例写进「未运行」而不是「已通过」；守卫**不得**静默通过」。⇒ `it.runIf` 的两条用例在 `hasDist === false` 时**必须**在文件头与报告里被点名「未运行」，**不得**计入绿；`runIf` 的「跳过 + 显式登记」**不是**「放宽为恒真」（R1.2 禁的是后者）。
  - ➕ **并入（R11.5）**：③′/③″ 合并后，**闭包判据（交集为空）是无条件可跑的那一半** ⇒ 导出树里守卫**仍有一条硬判据**，不会整体失效；这条是 R11.5 追认时**新增的强度**，报告要写明。
- [ ] **Step 4: 强制命令行（本任务的硬判据，不在 vitest 里）**

```powershell
# 取锁（协议见 Global Constraints）后跑真实构建
node scripts/check-bundle-budget.mjs            # 真实构建；判据 exit 0
node scripts/check-bundle-budget.mjs --no-build --json > <批次tmp>\budget.json
node -e "const j=require('fs').readFileSync(process.argv[1],'utf8');const o=JSON.parse(j);console.log(JSON.stringify(o.firstScreen.chunks))" <批次tmp>\budget.json
(Get-Item app/dist/index.html).LastWriteTime     # 自采 mtime
Get-ChildItem app/dist/assets -Filter "vendor-gsap*"   # 判据：非空
```
- [ ] **Step 5: 八门禁 + 提交**（`git add -- app/src/motion/engine.guard.test.ts` 再 `--only`）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | ③′：静态 import GSAP 家族的文件集 == `{"app/src/motion/engine.ts"}`；且阳性对照 `hits.length >= 4`、`"gsap-core"`/`"not-gsap"` 0 命中 | **M1**：在 `app/src/components/NoteMarkdown.tsx` 顶部加 `import { gsap } from "gsap";` | **M1 后期望**：文件集多一个成员 ⇒ 红（且该变异**同时**会让 V2 红 —— 两半互证） |
| **V2** | ③″ / **R11.1 判据本体**：`main.tsx` 的静态可达闭包**不含** `motion/engine.ts`；且该集合**含** `ui/primitives/index.ts` **与** `pages/ClassroomPage.tsx`（两个阳性对照） | **M2**：在 `app/src/main.tsx` 加 `import { gsap } from "./motion/engine";` | **M2 后期望**：可达集合含 `motion/engine.ts` ⇒ 红 |
| **V2b** | **🔻 R11.1 连带硬约束②的机器判据**：`pages/ClassroomPage.tsx` 的**静态**闭包里**不含**任何裸 `import ... from "@gsap/react"` / `from "gsap"`（课堂页上的 GSAP 必须抽 `React.lazy` 子件） | **M2b**：在 `pages/ClassroomPage.tsx` 顶部加 `import { useGSAP } from "@gsap/react";` | **M2b 后期望**：交集非空 ⇒ 红（**这条把「课堂页是静态的」这条实测事实变成了守卫**） |
| **V3** | ①：真实构建后 `app/dist/assets/vendor-gsap-*.js` 存在 | **M3**：把 `engine.ts` 改成 `export const noop = 1`（不 import gsap）并**把 T3 的落点全部注掉**（导出树内）⇒ 重建 | **M3 后期望**：`vendor-gsap-*` **空** ⇒ 红（证明该判据不是恒真） |
| **V4** | ②：`--no-build --json` 的 `firstScreen.chunks` 里**没有**任何含 `vendor-gsap` 的项；且首屏 chunk 个数仍为 **3**、首屏 gzip 仍在 **~100.49 kB** 量级（Δ 与机理见报告中） | **M4**：在 `app/src/main.tsx` 加静态 `import` 到 `engine.ts`（同 M2）⇒ 重建 | **M4 后期望**：`firstScreen.chunks` 出现 `vendor-gsap-*.js`、首屏 gzip 显著上升 ⇒ 红 |
| **V5** | `npx vitest run src/motion/engine.guard.test.ts`：**用例数 >0**（`ran` 闸）且全绿 | —（CONTROL） | `testResults.length===1`，`numTotalTests >= 4`，`numFailedTests===0` |

**提交信息**：`test(motion): 加 GSAP 懒加载三件套守卫`（subject 15 字）

**诚实边界**：① 🔴 **本守卫在导出树/新克隆里 ①② 永不运行**（`dist` 不入库）—— 这是 `### 表 4` S2 的**已知代价**；补偿 = Step 4 的强制命令行 + 报告单列；② ③″ 的静态图遍历是**正则级**（不是 TS 编译器 API）⇒ 对「`export * from` 再导出」「路径别名」等形态可能漏判；**已登记的已知边界**，波 D 若要强化再换 TS-API 口径（批 5 的 `tmp/t1/eager-graph-tsapi.mjs` **不在库里**，本批**不重建**它）；③ 本任务**不判**「懒 chunk 里 gsap 的字节数是否合理」（那是 §13 风险表的观察项，不是判据）。

---

### Task 5: 动效 token 真源迁移（10 变量 + `pill` 档 + G4/G9 改判）

> **依据**：R1.1（单一真源）· R2.3（迁移 + `pill` + 授权清单）· G4（`style-seams.test.ts:179` 改判为 **0**）· G9（`tokens.drift.test.ts:52` 改判）· `### 表 4` 的 **S3**（`pill = 999` 实测）· `### 表 5` 的 **3 条清单外连带**。

**目标**：把 `motion.css:37-56` 的 **10 个**变量逐字迁进 `gen-tokens.mjs` 的单一真源 ⇒ 生成 `tokens.css` + `tokens.gen.ts`；**删除** `motion.css` 的临时 `:root{}` 块；补 `pill` 档（**999**）；把「10 个变量」的守护从「钉临时接缝」改成「钉唯一真源 + 派生门面 + 封住回归路径」。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/scripts/gen-tokens.mjs` | **269** | 否（`.mjs` **不在门禁视野**） | 否 | 加 `DURATION_TOKENS` / `EASING_TOKENS` 真源 + `renderCss`/`renderTs` 各加一段（预算 ≤320） |
| `app/src/ui/tokens.css`（生成物） | **100** | 否 | 否 | 重生成（10 变量进 `:root`） |
| `app/src/ui/tokens.gen.ts`（生成物） | **61** | 否 | 否 | 重生成（导出 `DURATION_TOKENS` / `EASING_TOKENS` / `MOTION_TOKENS`） |
| `app/src/ui/primitives/motion.css` | **74** | 否（`.css` **不在门禁视野**） | 否 | **删 `:37-56`**（保留 `:58-74` 的 reduced-motion 块与其注释） |
| `app/src/ui/primitives/style-seams.test.ts` | **288** | ⚠️ **是**（余 **12**） | 否 | **G4 改判**（`describe` 的 1 条 `it` 重写：源换成生成物 + 旧源恒 0 的新判据）⇒ **净增行数 ≤ +12** |
| `app/src/ui/tokens.drift.test.ts` | **87** | 否 | 否 | **G9 改判**（`:52` 加 `pill`） |
| `app/scripts/gen-tokens.test.mjs` | **209** | 否（`.mjs` 不在门禁视野） | 否 | **`### 表 5` #3 = G14**（`:114` 加 `999` + 追加一条「== 原语层兜底值」） |
| `app/src/ui/primitives/style-contract.test.ts` | **296** | ⚠️ **是**（余 **4**） | 否 | **`### 表 5` #1 = G12**（`:220`/`:233` 两处，**净增 0**） |
| `app/src/ui/primitives/Toast.style.test.ts` | **132** | 否（余 168） | 否 | **`### 表 5` #2 = G13**（`:35` 与 `:127-129`，**净增 ≤ +2**） |

**Interfaces:**
- Consumes：T3 的 `engine.ts`（无硬依赖，只同波）
- Produces：`--ed-dur-micro/overlay-in/overlay-out/toast-in/toast-out/skeleton/card/reveal/page` + `--ed-ease`（**字节不变**）落进 `tokens.css`；`SCALE_TOKENS.radiusScale` 第 5 档 `{name:"pill", px:999}`。**既有 19 处生产消费点**（`var(--ed-dur-x, <同值字面量>)`）**一字不改** —— `motion.css:7-8` 逐字承诺「删块即生效，无需改任何规则」，本任务**必须验证这句话为真**。

- [ ] **Step 1: 真源入册**（`gen-tokens.mjs`）
  加（数值**逐字**照 `motion.css:37-56`，**不许改值**）：
  ```js
  /** 动效时长（规格 §8.4）—— 批 6 从 motion.css 的临时接缝迁入，值逐字不变 */
  export const DURATION_TOKENS = [
    { name: "micro", ms: 120, usage: "响应层：单属性、无时序的交互回执（§8.2）" },
    /* …overlay-in 200 · overlay-out 160 · toast-in 180 · toast-out 140 · skeleton 1200 · card 220 · reveal 500 · page 150… */
  ];
  /** 缓动 —— 全站唯一曲线（规格 §8.4 `--ease cubic-bezier(0.2,0,0,1)`） */
  export const EASING_TOKENS = [{ name: "", value: "cubic-bezier(0.2, 0, 0, 1)", usage: "全站唯一曲线" }];
  ```
  `renderCss()` 在 `:root` 里加一段（放在 `--ed-nav-h` 之后）：`--ed-dur-<name>: <ms>ms;` ×9 + `--ed-ease: <value>;`；`renderTs()` 加 `DURATION_TOKENS` / `EASING_TOKENS` / 合并的 `MOTION_TOKENS` 导出 + `MotionTokenName` 窄类型。
  加 `pill`：`radiusScale` 追加 `{ name: "pill", px: 999 }`（**`### 表 4` S3：999 是实测的既有兜底值**）。
- [ ] **Step 2: 重生成 + 删块（`motion.css`）** —— `node scripts/gen-tokens.mjs`；然后**只删** `motion.css:37-56`（含 `:root {` 与 `}` 两行），**保留** `:58-74` 的注释块与 reduced-motion 块**逐字不动**（`## 陷阱` #B4-①）。
- [ ] **Step 3: 验证「删块即生效」**（本任务的**核心事实判据**）
  剥注释后扫全 `app/src/**`，断言：**`var(--ed-dur-*/--ed-ease` 的消费点全部带同值兜底字面量**（正则 `var\(--ed-(?:dur|ease)[a-z-]*,\s*[^)]+\)` 的命中数 == `var\(--ed-(?:dur|ease)` 的总命中数）。⇒ 无兜底的消费点会让「删块」静默改变行为。
- [ ] **Step 4: G4 改判**（`style-seams.test.ts:162-180`）
  旧：`describe("motion.css 接缝契约（批 6 删块即接管，故名字与取值必须钉住）")` 里那条 `it` 断言 **`motion.css` 里恰 10 个 `--ed-*` 且逐值相等**。
  新：同一 `it`（**保留位置、保留 `it` 序号**）改成三段：
  1. `expect(stripComments(MOTION_CSS).match(/--ed-[a-z0-9-]+\s*:/g) ?? [], "批 6 已把真源迁走，motion.css 不得再有 --ed-* 定义").toEqual([]);`（**旧行为的回归封条**）
  2. 逐名逐值断言改读 **`renderAll().css`**（从 `../../../scripts/gen-tokens.mjs` import；`tokens.drift.test.ts:15` 是 import 先例）
  3. `expect(DURATION_TOKENS.length).toBe(9)` + `expect(EASING_TOKENS.length).toBe(1)`（**真源侧计数**，把「一个不多一个不少」钉在真源上）
- [ ] **Step 5: G9 + `### 表 5` 三条连带**
  `tokens.drift.test.ts:52` → `toEqual([3, 5, 8, 10, 999])`；`gen-tokens.test.mjs:114` → 同上 + 追加「== `Surface.css` 的 `var(--ed-radius-pill, (\d+)px)` 兜底值」；`style-contract.test.ts:220/:233` 与 `Toast.style.test.ts:35/:127-129` 的**数据源从 `motion.css` 换成 `renderAll().css`**（改法与理由逐字见 `### 表 5`）。
- [ ] **Step 6: 八门禁 + 两个提交**

```powershell
git add -- app/scripts/gen-tokens.mjs app/src/ui/tokens.css app/src/ui/tokens.gen.ts
git commit --only -m "refactor(motion): 动效 token 迁入生成器真源" -- app/scripts/gen-tokens.mjs app/src/ui/tokens.css app/src/ui/tokens.gen.ts app/src/ui/primitives/motion.css app/src/ui/primitives/style-seams.test.ts app/src/ui/primitives/style-contract.test.ts app/src/ui/primitives/Toast.style.test.ts
# 再一个提交带 pill（G9 + gen-tokens.test.mjs）：
git commit --only -m "feat(tokens): 补 pill 圆角档并改判漂移断言" -- app/scripts/gen-tokens.mjs app/src/ui/tokens.css app/src/ui/tokens.gen.ts app/src/ui/tokens.drift.test.ts app/scripts/gen-tokens.test.mjs
```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **旧源恒 0**：`motion.css` 剥注释后 `--ed-[a-z0-9-]+\s*:` 命中 **0** | **M1**：往 `motion.css` 加回一行 `--ed-dur-card: 220ms;` | **M1 后期望**：命中 1 ⇒ 红（**这条是旧断言没有的回归封条**） |
| **V2** | **新源逐名逐值**：`renderAll().css` 含 9 个 `--ed-dur-<name>: <N>ms;` + `--ed-ease: cubic-bezier(0.2, 0, 0, 1);`，**名字与取值逐个等于** `motion.css:37-56` 的原值 | **M2**：把真源里 `micro` 的 `ms` 从 `120` 改成 `130` **但不重生成产物** | **M2 后期望**：`tokens.drift.test.ts` 红（产物 ≠ 输出）+ V2 红；**若同时重生成产物** ⇒ 只有 V2 红（证明 V2 判的是真源、drift 判的是产物，**两条各有齿**） |
| **V3** | **消费点兜底齐备**：全仓 `var(--ed-dur-*` / `var(--ed-ease` 的**每一个**命中都带同值兜底（命中数相等） | **M3**：把 `Surface.css:75` 的 `var(--ed-dur-micro, 120ms)` 改成 `var(--ed-dur-micro)` | **M3 后期望**：两数不等（1 处无兜底）⇒ 红 |
| **V4** | **G9 新值**：`SCALE_TOKENS.radiusScale.map(r => r.px)` 等于 `[3, 5, 8, 10, 999]` **且** `gen-tokens.test.mjs` 的「== `Surface.css` 兜底值」对拍绿 | **M4**：把真源的 `pill.px` 改成 `998` 并重生成 | **M4 后期望**：`drift.test.ts:52` 红 + 兜底对拍红（两条同时红 ⇒ 真源与唯一消费者被钉在一起） |
| **V5** | **G4 的真源侧计数**：`DURATION_TOKENS.length === 9` ∧ `EASING_TOKENS.length === 1` | **M5**：从真源删掉 `page` 一节并重生成 | **M5 后期望**：`length === 8` ⇒ 红 |
| **V6** | `line-limits --full` exit 0（`style-seams.test.ts` 与 `style-contract.test.ts` 仍 ≤300）· `npx vitest run` 全绿且**既有 1770 用例一条不少** · `tsc --noEmit` 0 错 | —（门禁类） | 三条 exit 0；`style-seams` 实测行数 ≤300（**报告必须给出改后实测行数**） |

**提交信息**：① `refactor(motion): 动效 token 迁入生成器真源`（subject 17 字）② `feat(tokens): 补 pill 圆角档并改判漂移断言`（subject 18 字）

**诚实边界**：① **`### 表 5` 的 3 条既有断言改动已由 R11.2 授权（G12/G13/G14）**（R1.3 的 STOP 义务因此解除）⇒ 本计划执行、**报告仍须逐条点名四要素**（旧原文 / 新原文 / 专属变异体 / 「语义不变、只换真源」的论证）；② 🔻 **R11.8**：`gen-tokens.mjs`（`.mjs`）与两个 `.css`/生成物**不在行数门禁视野**（`SOURCE_EXT = /\.(ts|tsx|rs)$/`，实测）⇒ 「≤320」是自设预算，**没有**门禁背书；**凡承诺「新文件 ≤300」处一律读作「`.ts`/`.tsx`/`.rs` 新文件 ≤300」**；③ 迁走的 10 个变量里 **3 个今天 0 生产消费者**（`--ed-dur-card` / `--ed-dur-reveal` / `--ed-dur-page`，recon-a A1⑥ 实测）⇒ 它们在本批**由波 C 的编排层首次消费**，本任务**不作消费者**；④ 「删块即生效」这条**只被 V3 静态证明**（兜底字面量齐备），**运行时观感无法在 jsdom 判**；⑤ 🔻 **R11.8 第 2/3/4 条在本任务的三处落点**：`pill` = **`999px`**（全仓唯一命中 `app/src/ui/primitives/Surface.css:58`，**不许自创**；本计划者已复核该行）· **新落点类名一律 `<既有基类>--<修饰>`**（`motion-coverage.test.ts:113-124` 的过滤逐字排除「修饰类 `--` / BEM 子元素 `__` / `<基类>-…`」）· **`app/src` 里 `documentElement` 0 命中**（本计划者实测；三档通道是**全新能力**，宿主与守卫都要新建 —— 见 T6/T17）。

---

### Task 6: 三档强度通道（`data-motion` + `motion:intensity` + 源序守卫）

> **依据**：R3.1（载体 = `<html data-motion>`，取值 `eco|standard|rich`，默认 `standard`，**档位块必须先于 reduced-motion 块** + 新增源序守卫）· R3.2（键 `motion:intensity`、照 `useViewMemory` 范式、**≤60 行**、初值跟随系统、`matchMedia` 自带守卫、桩要实现 `addListener`）。

**目标**：新建 `app/src/motion/intensity.ts`（三纯函数 + 一个 hook：`MOTION_INTENSITIES` / `defaultIntensity(mql)` / `readIntensity(storage)` / `writeIntensity(v, storage)` / `applyIntensity(el, v)` / `useMotionIntensity()`）；在 `motion.css` 里加三档规则块（**写在 reduced-motion 块之前**）；在 `motion-coverage.test.ts` 里加**源序守卫**（带变异体）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/motion/intensity.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤60**（R3.2 硬预算） |
| `app/src/motion/intensity.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**（纯函数 + 注入 `Storage`，照 `useViewMemory` 的范式 ⇒ 不需要 jsdom），预算 **≤200** |
| `app/src/ui/primitives/motion.css` | **T5 后 74 - 20 = 54** | 否（`.css` 不在门禁视野） | 否 | 加档位块（预算 +≤120） |
| `app/src/ui/primitives/motion-coverage.test.ts` | **147** | 否（余 153） | 否 | **追加**一个 `describe`（源序守卫，+≤40 行） |

**Interfaces:**
- Produces（**接口冻结快照**，被 T7/T12/T13 与波 B/C 消费）：
  ```ts
  export const MOTION_INTENSITIES = ["eco", "standard", "rich"] as const;
  export type MotionIntensity = (typeof MOTION_INTENSITIES)[number];
  export const MOTION_INTENSITY_KEY = "motion:intensity";
  export function defaultIntensity(mql?: Pick<MediaQueryList, "matches"> | null): MotionIntensity;
  export function readIntensity(storage: Storage = globalThis.localStorage): MotionIntensity | null;
  export function writeIntensity(v: MotionIntensity, storage: Storage = globalThis.localStorage): void;
  export function applyIntensity(value: MotionIntensity, el?: HTMLElement | null): void;   // 写 data-motion
  export function useMotionIntensity(): readonly [MotionIntensity, (v: MotionIntensity) => void];
  ```
- ⚠️ `applyIntensity` 的默认目标是 `globalThis.document?.documentElement`（**本仓 `app/src` 今天 `documentElement` 0 命中** ⇒ 这是**新增**能力，必须带 `typeof document === "undefined"` 守卫）。

- [ ] **Step 1: 写 `intensity.ts`**（`@ai-context` 写清：Why = §8.5「系统 reduced-motion 优先于档位」；副作用 = 写 `<html data-motion>` 与 localStorage；边界 = 三处降级：无 `document` / 无 `localStorage` / 无 `matchMedia`）
- [ ] **Step 2: 写 `motion.css` 的档位块**（**逐字放在 reduced-motion 块之前，中间不得插入其它规则块**）

```css
/* ★ 强度三档（规格 §8.5）。**本块必须在 reduced-motion 块之前** —— 源序即优先级：
   reduced-motion 是后写的 `!important` 覆盖，系统设置永远赢过用户选的档（§8.5 逐字）。 */
html[data-motion="eco"] { /* 只留响应层：编排层时长归零 ⇒ 直接跳终态 */ }
html[data-motion="standard"] { /* 默认档：四层全开，环境层幅度减小 */ }
html[data-motion="rich"] { /* 环境层幅度与频率提高，编排层加长、错开更明显 */ }
```
  三块里**只放**（节流到本批真正有落点的属性）：`--ed-tier-env-scale` / `--ed-tier-orchestra-scale` 两个**内部变量**⚠️ —— **不行**：`style-seams.test.ts:179`（G4 改判后）断言 `motion.css` 的 `--ed-*` 定义**恒 0** ⇒ **不得**在 `motion.css` 定义任何 `--ed-*`。⇒ 三块改为**直接覆写属性**（`animation-duration` / `transition-duration` / `scale`），需要共享数值时用**非 `--ed-` 前缀**的局部变量（如 `--tier-env-scale`），或直接写死倍数并加注释。**本计划取后者**：直接写 `animation-duration` 的 `calc()` 倍数，注释里说明为什么不引私变量（避免与 G4 的新判据打架）。
- [ ] **Step 3: 源序守卫（`motion-coverage.test.ts` 追加）**

```ts
describe("★ 源序：档位块必须在 reduced-motion 块之前（规格 §8.5『系统 reduced-motion 优先于档位』）", () => {
  const clean = stripComments(read("motion.css"));
  const atTier = clean.search(/\[data-motion="(?:eco|standard|rich)"\]/);
  const atReduced = clean.indexOf("@media (prefers-reduced-motion");
  it("两块都在（防选择器改名把守卫静默关掉）", () => { expect(atTier).toBeGreaterThanOrEqual(0); expect(atReduced).toBeGreaterThanOrEqual(0); });
  it("档位块行号 < reduced-motion 块行号", () => { expect(atTier).toBeLessThan(atReduced); });
});
```
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **初值跟随系统**：`defaultIntensity({ matches: true })` ⇒ `"eco"`；`{ matches: false }` ⇒ `"standard"` | **M1**：把 reduce 分支返回改成 `"rich"` | **M1 后期望**：`"rich" !== "eco"` ⇒ 红 |
| **V2** | **`matchMedia` 缺失不抛**：真 node 环境（无 `window.matchMedia`）调 `useMotionIntensity`/`applyIntensity` **不抛**，落 `"standard"` | **M2**：删掉 `typeof window.matchMedia !== "function"` 守卫（尖刺实测：jsdom 30.0.1 **没有** `window.matchMedia` ⇒ `.add()` 抛 `TypeError: _win.matchMedia is not a function`） | **M2 后期望**：`TypeError` ⇒ 红 |
| **V3** | **持久化键逐字**：`writeIntensity("rich", stub)` 后 `stub.getItem("motion:intensity") === "rich"`；`readIntensity` 对垃圾值（`"loud"` / `""` / `null`）返回 `null`（⇒ 调用方回退默认档） | **M3**：把键改成 `"motion:intensity:v2"` | **M3 后期望**：`getItem("motion:intensity")` 为 `null` ⇒ 红 |
| **V4** | **`Storage` 抛 ⇒ 静默降级**：`readIntensity(throwingStorage)` 返回 `null`、`writeIntensity(v, throwingStorage)` 不抛 | **M4**：去掉 `try/catch` | **M4 后期望**：抛 ⇒ 红 |
| **V5** | **`applyIntensity` 写真属性**：jsdom 下 `applyIntensity("rich", el)` 后 `el.dataset.motion === "rich"`；**node 环境**下不传 `el` 且无 `document` ⇒ **不抛** | **M5**：把 `dataset.motion` 写成 `dataset.intensity` | **M5 后期望**：`el.dataset.motion` 为 `undefined` ⇒ 红 |
| **V6** | **源序**：`motion.css` 里档位块的位置 < reduced-motion 块的位置（判据原位见 Step 3） | **M6**：把两块顺序对调 | **M6 后期望**：`atTier > atReduced` ⇒ 红（**这是 R3.1 逐字要求的新守卫**） |
| **V7** | **三档值域闭合**：`MOTION_INTENSITIES` 恰 `["eco","standard","rich"]`，且 `motion.css` 里出现的 `[data-motion="…"]` 取值集合与它**相等** | **M7**：给 `MOTION_INTENSITIES` 加 `"ultra"` 而不加 CSS 块（或反之） | **M7 后期望**：集合不等 ⇒ 红（**判据双向**：多一个档位或多一块 CSS 都红） |
| **V8** | `line-limits --full` exit 0 · `tsc --noEmit` 0 错 · `npx vitest run` 全绿（用例只增不减） | — | 三条 exit 0 |

**提交信息**：`feat(motion): 落三档强度通道与源序守卫`（subject 15 字）

**诚实边界**：① **「三档动画看起来不一样」不可机器判据**（尖刺 S4.2②：jsdom 无排版、几何无差异）⇒ 本任务只判**档位映射 + DOM 属性 + 源序**，「三档正确」的观感面进 `## 诚实边界`；② 三档的具体**倍数**（`eco` 归零 / `rich` 提高多少）在 Step 2 里**取整到可读值并在注释里写理由** —— 它们是**手感参数**，波 D 可用 headless 抽检但**不能**升格为判据；③ `<html data-motion>` 是**文档级副作用**，与「页面保活挂载」（红线 2）无冲突，但**在 Tauri 多窗口变体（`?float=1` / `?overlay=1`）里会各自独立** —— 本批**不处理**跨窗口同步（登记）。

---

### Task 7: 动效强度控件（`MotionIntensityControl` + `SettingsPage`）

> **依据**：R3.3 逐字「在 `SettingsPage` 增加一个**「动效强度」三段控件**（新组件 `app/src/components/MotionIntensityControl.tsx`，预算 ≤120 行，走既有 `ed-btn` 段控件类名空间 + `aria-pressed`，**零行内 style**）」。

**目标**：新建 `app/src/components/MotionIntensityControl.tsx`（**薄适配器**：复用 `ui/primitives` 的 `ViewSwitcher` 原语 —— 见下「关键取舍」）并接进 `SettingsPage` 的「功能预览」组之前。

**🔴 关键取舍（实测驱动，必须照做）**：`app/src/components/**` 的非 test 文件**落在 `nativeButton.ratchet` 的域内**（`nativeButton.ratchet.test.ts:144-145` 的 `isTest`/`isPrim`/`isIcons` 三个谓词只排除 `*.test.(ts|tsx)` / `ui/primitives/**` / `ui/icons/**`）⇒ 若本组件直接渲染 `<button>`，`FROZEN_NATIVE_BUTTON_BY_FILE`（**114 键 / 和 393**）会因为**新文件**当场红（`:203-214` ②「任一文件超过其冻结值」+ 新增文件的分支）。**而 `ViewSwitcher` 是原语**（在 `ui/primitives/` 内，被排除），且它**已经是**「容器 `.ed-btn-group` + 段 `.ed-btn--segment` + `aria-pressed` + 零行内 style」的形态（批 5 R-2 的类名空间折中）⇒ **R3.3 的三条形式要求（`ed-btn` 段控件类名空间 / `aria-pressed` / 零行内 style）由 `ViewSwitcher` 逐字满足**，本组件退化为 20 行适配器。**这不是绕过 R3.3，而是用仓内既有的正解实现它**；若控制方要求**自建**三段控件 ⇒ 必须同时处理棘轮（登记 `SPLIT_MOVES` 或改冻结表 ⇒ 属清单外既有断言改动）⇒ **STOP 请裁**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/components/MotionIntensityControl.tsx` | **不存在（新建）** | — | 否 | 新建，预算 **≤60** |
| `app/src/components/MotionIntensityControl.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `app/src/pages/SettingsPage.tsx` | **150** | 否（余 150） | 否 | 加一个 `GroupTitle` + 面板（+≤10 行） |

**Interfaces:**
- Consumes：T6 的 `useMotionIntensity()` / `MOTION_INTENSITIES` / `MotionIntensity`；`ui/primitives` 的 `ViewSwitcher`（barrel 已导出，`index.ts:47-48`）
- Produces：`data-testid="motion-intensity"`（**新 DOM 契约**，写进 `@ai-context`）；三段文案（建议 `节能` / `标准` / `丰富`，逐字照 §8.5 的档名）

- [ ] **Step 1: 写组件**（`<ViewSwitcher options={…} value={intensity} onChange={select} ariaLabel="动效强度" testId="motion-intensity" />`；文件头写清「为什么不自建 `<button>`」= 棘轮域 + 复用 `ed-btn` 类名空间）
- [ ] **Step 2: 接进 `SettingsPage`**（在「功能预览」`GroupTitle` 之前插一个 `GroupTitle>外观`+ 面板；**不改**既有 10 个面板的任何一行）
- [ ] **Step 3: 八门禁 + 提交**（⚠️ 必须**额外**跑一次 `npx vitest run src/ui/primitives/nativeButton.ratchet.test.ts`，并把「新增文件未加计数」的读数写进报告）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **当前档反映在 DOM**：三个段元素的 `aria-pressed` 恰一个 `"true"`，且它是 `intensity` 对应的那个 | **M1**：把 `value={intensity}` 改成常量 `"standard"` | **M1 后期望**：切到 `rich` 后没有段是 `true` ⇒ 红 |
| **V2** | **点击写通道 + 持久化**：点「丰富」⇒ `document.documentElement.dataset.motion === "rich"` **且** `localStorage.getItem("motion:intensity") === "rich"`（**双断言**：只看 DOM 会被「只 setState 不 apply」骗过） | **M2**：把 `select` 改成只 `setIntensity` 不调 `writeIntensity` | **M2 后期望**：localStorage 为 `null` ⇒ 红 |
| **V3** | **三段与真源同源**：渲染出的段数 == `MOTION_INTENSITIES.length`，且每段文案与档位一一对应 | **M3**：给 `MOTION_INTENSITIES` 加第 4 档 | **M3 后期望**：段数 3 ≠ 4 ⇒ 红（与 T6 V7 的 CSS 侧判据**双向互补**） |
| **V4** | **零行内 style**：组件渲染出的**每个**元素 `getAttribute("style")` 为 `null`（`ViewSwitcher` 批 5 已保证，本判据防回归） | **M4**：给容器加 `style={{ marginTop: 8 }}` | **M4 后期望**：非 null ⇒ 红 |
| **V5** | **棘轮未加计数**：`nativeButton.ratchet.test.ts` 全绿，且 `FROZEN_NATIVE_BUTTON_TOTAL` 仍 **393**、键数仍 **114** | **M5**：把组件改成裸 `<button>` | **M5 后期望**：红（且报出新文件路径） |
| **V6** | `SettingsPage` 测试面（若有）全绿 + 页面仍渲染 10 个既有面板（`data-testid`/文案级结构断言，**只增不减**） | —（回归类） | exit 0 |

**提交信息**：`feat(settings): 加动效强度三段控件`（subject 13 字）

**诚实边界**：① 本组件是**薄适配器**（20 行）而不是"新控件" —— 收益是零棘轮计数、零新类名、零行内 style；代价是**段控件的可定制性受 `ViewSwitcher` 约束**（例如不支持图标段）；② `SettingsPage` **今天零 `data-testid`** ⇒ V6 的"仍渲染 10 个既有面板"只能靠文案/结构断言，**脆弱性已登记**；③ 「用户改档后真的感觉不同」**不可机器判据**（同 T6 的诚实边界 ①）。

---

### Task 8: 双基调（`data-tone` + 两个缓动 token + `CustomEase` 具名 ease）

> **依据**：R3.4 逐字。§8.3 两张面：**精密仪器** = `power3.inOut`（匀速段更长、沿轴线、带刻度感）· **活的纸** = `power2.out` / 自定义「洇开」曲线（**带惯性沉降、不是回弹**）。

**目标**：新建 `app/src/motion/tone.ts`（基调登记表 + 具名 ease 定义 + `toneEaseVar()`）；在 `gen-tokens.mjs` 加两个缓动 token（`--ed-ease-instrument` / `--ed-ease-paper`）⇒ 重生成；在 `engine.ts` 里 `CustomEase.create` 注册具名 ease。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/motion/tone.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤70** |
| `app/src/motion/tone.test.ts` | **不存在（新建）** | — | 否 | 新建（jsdom：要 `gsap.parseEase`），预算 **≤200** |
| `app/scripts/gen-tokens.mjs` | T5 后 ~300 | 否（`.mjs` 不在门禁视野） | 否 | `EASING_TOKENS` 追加 2 项 |
| `app/src/ui/tokens.css` / `tokens.gen.ts`（生成物） | T5 后 ~130 / ~90 | 否 | 否 | 重生成 |
| `app/src/motion/engine.ts` | T3 建（~15） | 否 | 否 | 加 `CustomEase.create` 两行 |

**Interfaces:**
- Produces（**冻结快照**，被波 B/C 的每个动效落点消费）：
  ```ts
  export const MOTION_TONES = ["instrument", "paper"] as const;
  export type MotionTone = (typeof MOTION_TONES)[number];
  /** token 名（不含 --ed- 前缀）—— tokens.css 里由 EASING_TOKENS 定义 */
  export const TONE_EASE_TOKEN: Readonly<Record<MotionTone, string>> = { instrument: "ease-instrument", paper: "ease-paper" };
  /** GSAP 具名 ease（经 CustomEase.create 注册；同名的 CSS 侧值见 tokens.css） */
  export const TONE_EASE_NAME: Readonly<Record<MotionTone, string>> = { instrument: "power3.inOut", paper: "ed-paper-bleed" };
  export function toneEaseVar(tone: MotionTone): string;   // => "var(--ed-ease-instrument)"
  export function toneEase(tone: MotionTone): string;      // => GSAP 侧实参（string 或已注册名）
  ```
- ⚠️ **`data-tone` 是「每个动效落点显式声明」的属性**（R3.4 登记面），**不是** `<html>` 级属性；本任务只**定义**基调与缓动，**落点接线在波 B/C**。

- [ ] **Step 1: `tone.ts`**（`@ai-context` 逐字引 §8.3；**写清「具名 ease 的 CSS 侧与 GSAP 侧同源」的机理：CSS 用 `cubic-bezier(...)` 近似、GSAP 用 `CustomEase` 精确，两者**共享同一个「不是回弹」的性质**，由 V3 的单调性判据钉住）
- [ ] **Step 2: `gen-tokens.mjs` 加 2 个缓动 token**（`--ed-ease-instrument` = `cubic-bezier(0.4, 0, 0.2, 1)`（`power3.inOut` 的等效近似，**注释里写明这是近似**）；`--ed-ease-paper` = 「洇开」曲线的 `cubic-bezier` 近似，**必须单调不减**）⇒ `node scripts/gen-tokens.mjs`
- [ ] **Step 3: `engine.ts` 注册具名 ease**（`CustomEase.create("ed-paper-bleed", "<曲线控制点串>")`；**放在 `registerPlugin` 之后**）
- [ ] **Step 4: 八门禁 + 提交**（生成物必须同提交）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **token 存在且名字对**：`toneEaseVar("instrument") === "var(--ed-ease-instrument)"`、`toneEaseVar("paper") === "var(--ed-ease-paper)"`，且两者都在 `renderAll().css` 里**有定义**（值非空、非 `undefined` 串） | **M1**：把 `TONE_EASE_TOKEN.paper` 改成 `"ease-paper-v2"` | **M1 后期望**：`--ed-ease-paper-v2` 在生成物里查不到 ⇒ 红 |
| **V2** | **具名 ease 真注册**：导入 `engine.ts` 后 `typeof gsap.parseEase(TONE_EASE_NAME.paper) === "function"`（尖刺 S4.1：未注册时 `parseEase` 返回 `undefined` + stderr 警告 ⇒ **静默退化**） | **M2**：从 `engine.ts` 删掉 `CustomEase.create("ed-paper-bleed", …)` | **M2 后期望**：`parseEase` 返回 `undefined` ⇒ 红 |
| **V3** | **「不是回弹」= 单调不减**：对 `TONE_EASE_NAME` 的两个 ease，在 `t = 0..1` 取 101 个采样点，`parseEase(name)(t)` 序列**单调不减**且 `f(0)=0`、`f(1)=1`（§8.3 逐字「带惯性沉降、**不是回弹**」） | **M3**：把 `paper` 的 ease 换成 `back.out(1.7)`（回弹曲线） | **M3 后期望**：采样序列出现下降 ⇒ 红。⚠️ **这条是本任务最有牙的判据** —— 它把「不是回弹」从形容词变成可测性质 |
| **V4** | **基调集合闭合**：`MOTION_TONES` 恰 `["instrument","paper"]`，且 `TONE_EASE_TOKEN` / `TONE_EASE_NAME` 两表的**键集相等**（`Record<MotionTone, …>` 给编译期保证，运行期再断一次键数） | **M4**：给 `TONE_EASE_NAME` 少写 `paper`（用 `as` 强转绕过类型） | **M4 后期望**：键数 2 ≠ 1 ⇒ 红（**编译期 + 运行期双保险**） |
| **V5** | `line-limits --full` exit 0（T5 的 G4 新判据仍绿：`motion.css` 的 `--ed-*` 定义仍 **0** —— 本任务**只往生成器加**，不碰 `motion.css`）· `tsc` 0 错 · `vitest` 全绿 | — | 三条 exit 0 |

**提交信息**：`feat(motion): 落双基调缓动 token 与具名 ease`（subject 17 字）

**诚实边界**：① `power3.inOut` 的 **CSS 侧只是 `cubic-bezier` 近似**（CSS 没有 GSAP 的 ease 族）⇒ CSS 动效与 GSAP 动效在同一落点上会有**微小曲线差**；本批**接受**并在注释里写明（不引入第二套 ease 定义）；② `CustomEase` 的曲线控制点串是**手感参数**，本任务只保证「单调不减 + 端点正确」，**不保证视觉正确**；③ `data-tone` 的**落点接线不在本任务** ⇒ 本任务结束时 `data-tone` 在 `app/src` 里**仍是 0 命中**（这是预期的，不是遗漏；波 B/C 才接线）。

---

### Task 9: 位移上限 8px 的 JS 唯一出口 + 扩域守卫

> **依据**：R3.5 逐字 + `### 表 4` 的 **S4**（实测：`translate*()` 全仓 **0 处 >8px** ⇒ 扩域零白名单；`margin`/`left`/`top` 有 4 处 >8px 但**全是布局量** ⇒ 收窄域）。

**目标**：新建 `app/src/motion/shift.ts`（`SHIFT_MAX_PX = 8` + `clampShift()` + `SHIFT_BANNED_PROPERTIES`）；把 `style-seams.test.ts:182-188` 的位移判据**扩域到全仓 `app/src/**`**（只扫 `translate*()` 数值实参 —— 既有口径**逐字保留**），并**追加**一条「GSAP tween 的位移走 `motion/` 层唯一出口」的判据。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/motion/shift.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤50** |
| `app/src/motion/shift.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**（纯函数），预算 **≤150** |
| `app/src/ui/primitives/style-seams.test.ts` | T5 后 ~290 | ⚠️ **是** | 否 | 扩域（+≤8 行；**若会破 300 ⇒ 把扩域判据拆进新文件 `app/src/motion/shift.guard.test.ts`**，并在报告里写明为何拆） |

**Interfaces:**
- Produces（**冻结快照**，波 C 的每个位移 tween 都必须经它）：
  ```ts
  export const SHIFT_MAX_PX = 8;
  /** 把任意位移量夹到规格 §8.4 的 8px 上限内（超限是**运行时**安全网，不是许可证） */
  export function clampShift(px: number): number;
  /** 唯一允许 GSAP 动画化的属性白名单（R8.4 的代理判据常量；layout 属性一律不在内） */
  export const ANIMATABLE_PROPERTIES: readonly string[];
  ```
- ⚠️ `SHIFT_MAX_PX = 8` **与 `style-seams.test.ts:55` 的既有常量是同一个数字的两处落点** ⇒ 新增一条**对拍判据**（守卫里的常量 == `motion/shift.ts` 的常量），防两边分叉。

- [ ] **Step 1: `shift.ts`**（`@ai-context` 写清：Why = §8.4 末句 + `motion.css:23-27` 逐字「批 6 的 GSAP 时间线同样不得越过该上限」；边界 = 它是**上界**不是**目标值**，编排层的「远」靠时长与错开表达）
- [ ] **Step 2: 扩域**（`style-seams.test.ts` 的 `shiftViolations` 调用域从 `readdirSync(HERE).filter(.css)` 改成「全仓 `app/src/**` 的 `.css` + `.ts` + `.tsx`」，**正则与换算逻辑一字不改**，`%`/`calc()`/`var()` 仍跳过）；剥注释用**既有**的 `stripComments` 口径
- [ ] **Step 3: 对拍判据**（守卫常量 ↔ `motion/shift.ts`）
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **扩域后仍绿**：全仓 `translate*()` 数值实参**零处 >8px**（本计划者实测基线 = 10 处数值实参、最大 8px；执行者必须**自己复测并给逐条清单**） | **M1**：往 `app/src/views/session/SessionTriTrackView.tsx` 的行内 style 加 `transform: "translateY(12px)"` | **M1 后期望**：`violations` 非空 ⇒ 红（**证明扩域真的扫到了原语层之外**） |
| **V2** | **`clampShift` 行为**：`clampShift(0)=0` · `clampShift(8)=8` · `clampShift(9)=8` · `clampShift(-9)=-8` · `clampShift(NaN)` ⇒ **抛**（或返回 0，二选一并在注释里写明理由；判据按所选行为写） | **M2**：把 `clampShift` 的边界写成 `> SHIFT_MAX_PX` → `>= SHIFT_MAX_PX`（即 8 被夹成 8，看不出差别）⇒ 换成更锋利的写法：把 `Math.min(px, SHIFT_MAX_PX)` 改成 `Math.min(px, SHIFT_MAX_PX + 1)` | **M2 后期望**：`clampShift(9) === 9` ⇒ 红 |
| **V3** | **常量对拍**：`style-seams.test.ts` 的 `SHIFT_MAX_PX` == `motion/shift.ts` 的 `SHIFT_MAX_PX` | **M3**：把 `shift.ts` 的常量改成 10 | **M3 后期望**：两值不等 ⇒ 红（**防「两边各写一个 8」**） |
| **V4** | **`ANIMATABLE_PROPERTIES` 白名单**：集合恰 `{transform, translate, rotate, scale, opacity, filter}`（R8.4 逐字），**不含**任何 layout 属性 | **M4**：往白名单加 `"width"` | **M4 后期望**：与 R8.4 的逐字集合不等 ⇒ 红（该白名单被 T11 的属性集合审计消费） |
| **V4b** | **🔻 R11.4 的第二半：`motion/` 层位移常量 ≤ 8px**（`shift.ts` 导出的每一个位移常量/`clampShift` 的上界逐条 ≤ `SHIFT_MAX_PX`；**域 = `motion/` 层的导出面**，不是全仓） | **M4b**：在 `shift.ts` 加 `export const CARD_LIFT_PX = 12;` | **M4b 后期望**：红（**证明「`motion/` 层位移常量」这半也判到了**，而不是只判 CSS） |
| **V5** | `line-limits --full` exit 0（`style-seams.test.ts` 仍 ≤300 —— **报告必须给改后实测行数**） | — | exit 0 |

**提交信息**：`feat(motion): 加位移上限唯一出口与扩域守卫`（subject 17 字）

**诚实边界**：① 🔻 **本任务收窄了 R3.5 的判据域（已获 R11.4 追认，不再需要请裁）** —— **R11.4 逐字**：「裁决域 = **只判 `translate*()`（全仓实测 0 处 >8px，扩域零白名单可行）+ `motion/` 层的位移常量**；`margin|left|top` 的 >8px（实测 4 处**全是布局量**）**不判**」；理由逐字「§8.4 的『位移上限 8px』是关于**动画位移**的，把布局量拉进来会造**假阳性**；而『动画不得动 `margin/left/top`』已由 **R8.4 的属性集合审计**（⊆ transform 族）单独覆盖 ⇒ **无漏洞**」。⇒ 本任务的**登记义务**：把 4 处 >8px 读数（`components/NotePreviewView.tsx:64` `margin:10px` · `shell/TopBar.test.tsx:215` `top: 64px` · `ui/primitives/Toast.placement.test.tsx:103/104` `top: 64px`）**逐字写进守卫的注释**（作为「为什么不判」的现场证据），**不是**写进白名单；② `clampShift` 是**运行时安全网**：它**不能**防止有人绕过 `motion/` 层直接 `gsap.to(el, {y: 40})` —— 那条路径只能靠**波 C 的 code review** + 属性集合审计（T11）间接约束，**本任务不声称已封死**；③ 扩域后 `%` 形态（`translate(-50%,-50%)` 居中技巧、`translateX(±100%)` 骨架微光）**仍被跳过** —— 这是既有口径的**有意**保留（它们是居中/扫光，不是位移量），**逐字登记**；④ 本任务的 `style-seams.test.ts` 扩域若破 300 ⇒ 按 Files 表拆进 `app/src/motion/shift.guard.test.ts`（新文件 ⇒ 须自带 ≥2 条行为级判据 + 变异体）。

---

### Task 10: 确定性测试底座 + `matchMedia` 桩 + 纪律入册

> **依据**：R8.1（唯一正解 + 四个禁用项）· R8.3（`tl.to()` 返回 Timeline · **绝不可把 jsdom 的 `performance` 挂 `globalThis`**）· R3.2 的「桩必须实现 `addListener`/`removeListener`」· 尖刺 S3.4（GSAP 用例**不需要** `await sleep`，全同步断言）。

**目标**：新建 `app/src/test/motionHarness.ts`（确定性推进 helper + `matchMedia` 桩 + tween 计数 + 属性集合读取）；新建 `app/src/test/motionHarness.test.ts` 自证；在 `docs/standards/testing.md` 就地加注一段（≤20 行）指向 `motion.md`。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/test/motionHarness.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤120**。⚠️ 它是 `app/src/**` 的**非 test** `.ts` ⇒ **在六类棘轮的域内**（`app/src/test/` 不在排除名单里）⇒ **不得**含 `<button` / `#9ca3af` / `borderRadius: N` / `boxShadow:` / 三红 hex / 空态词 / 加载词（`emptyState/loading` 域另排除 `ui/icons/**`，不排除 `test/`） |
| `app/src/test/motionHarness.test.ts` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `docs/standards/testing.md` | **216** | 否（`.md` 不受门禁） | 否 | 加一小节「GSAP / 动效测试」，预算 +≤20 行 |
| `app/src/test/setup.ts` | **28** | 否 | 否 | 🔴 **不改**（不加全局 `matchMedia` 桩 —— 加全局桩会**改变既有 30 处「无 matchMedia」的事实**，可能让既有用例的降级路径静默改道） |

**Interfaces:**
- Produces（**冻结快照**，被 T11 与波 C 全部用例消费）：
  ```ts
  export function freezeAt<T extends gsap.core.Timeline>(tl: T, t: number): T;   // = tl.time(t)，唯一推进手段
  export function tweenCount(target: unknown): number;                            // = gsap.getTweensOf(target).length
  export function animatedProps(el: { style: CSSStyleDeclaration }): string[];    // 读 el.style 的属性集合（排序去重）
  export function installMatchMediaStub(opts: { reduce: boolean }): { restore(): void; listeners(): number };
  export function currentTransform(el: Element): string;                          // el.style.transform 的读取口（双断言的第二半）
  ```
  ⚠️ `freezeAt` 的形参类型**不得**用 `any`；`gsap.core.Timeline` 类型需从 `engine.ts` 转出（`export type { gsap }` 不够）⇒ **改为**在 `engine.ts` 里 `export type GsapTimeline = gsap.core.Timeline;`（T3 的接口里加一个类型导出，**若 T3 已提交 ⇒ 在 T10 里补这一行**，并在报告里注明依赖 T3 的哪次提交）。

- [ ] **Step 1: `motionHarness.ts`**（`@ai-context` 逐字写四条禁用项与其理由 + 「为什么不挂 `performance`」）
- [ ] **Step 2: `installMatchMediaStub`** —— 实现 `matches` / `media` / `addEventListener` / `removeEventListener` / **`addListener`** / **`removeListener`** / `dispatchEvent` / `onchange`；**必须**把 `addListener` 的调用计数暴露出来（供 V2 判据）；`restore()` 复原 `window.matchMedia` 的原值（**含"原本就没有"** ⇒ 复原成 `undefined` 并 `delete`）
- [ ] **Step 3: `motionHarness.test.ts` 自证三条**（见 Verification V1–V3）
- [ ] **Step 4: `docs/standards/testing.md` 加注**（一小节：确定性推进正解 / 四禁用 / 双断言 / `matchMedia` 桩必须实现 `addListener` / **指向 `motion.md`**；**不改**既有任何一节）
- [ ] **Step 5: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **逐字精度（R8.1 的复现）**：`power2` tween `{duration: 0.5, x: 0→100}` 在 `freezeAt(tl, 0.25)` 后 `currentTransform(el) === "translate3d(87.5px, 0px, 0px)"`（**逐字**） | **M1**：把 `freezeAt` 的实现换成 `gsap.updateRoot(t)`（尖刺实测：`globalTimeline._start` 偏移 **0→0.105→0.199**） | **M1 后期望**：`translate3d(87.5px,…)` 不再逐字成立 ⇒ 红（**证明正解不是随便挑的**） |
| **V2** | **桩走 legacy 分支**：`installMatchMediaStub({reduce:true})` 后，调用方（GSAP 或被测代码）经 `addListener` 订阅 ⇒ `listeners() >= 1`；且 `matches === true` 能被读到 | **M2**：把桩里的 `addListener` 删掉（只留 `addEventListener`） | **M2 后期望**：`listeners() === 0` ⇒ 红（**尖刺 S5.3 逐字：桩必须实现 `addListener`/`removeListener`**） |
| **V3** | **属性集合读取**：对 `gsap.to(el, {x: 50, opacity: 0.5, duration: 0})` 后的元素，`animatedProps(el)` ⊆ `{transform, translate, rotate, scale, opacity, filter}`；对照：`gsap.to(el, {width: 50, duration: 0})` 后集合**含** `"width"` | **M3**：把 V3 的对照句删掉（只留"⊆"那一半） | **M3 后期望**：判据退化为「任何集合都 ⊆」的**空真** ⇒ 用 CONTROL 自证：把被测 tween 换成 `width` 后**若仍绿** ⇒ 说明判据无牙 ⇒ **必须**保留对照句（**本条的变异体就是"删掉对照"**） |
| **V4** | **不得挂 `performance`**：`motionHarness.ts` 与 `motionHarness.test.ts` 里 `globalThis.performance =` / `Object.defineProperty(globalThis, "performance"` 命中 **0**（剥注释；阳性对照：同一个正则在 `tmp/` 的已知样本上报 1） | **M4**：在 harness 里加 `globalThis.performance = window.performance;` | **M4 后期望**：命中 1 ⇒ 红。⚠️ 若真跑 M4，**必须**在导出树里跑（尖刺实测：`Performance-impl.js:14` 自调用 ⇒ **栈溢出**，会把整个测试进程打挂） |
| **V5** | **棘轮未加计数**：`motionHarness.ts` 落进六类棘轮域 ⇒ 六条棘轮测试全绿、冻结值逐个不变 | **M5**：在 `motionHarness.ts` 里加一行 `const x = "#9ca3af";` | **M5 后期望**：`textRatchet` 红（**证明域谓词真的覆盖 `app/src/test/`**） |
| **V6** | `line-limits --full` exit 0 · `tsc` 0 错 · `vitest` 全绿（既有 1770 用例一条不少） | — | 三条 exit 0 |

**提交信息**：`test(motion): 加确定性推进底座与 matchMedia 桩`（subject 20 字）

**诚实边界**：① 本 harness 只解决**时序确定性**；**不解决**「jsdom 不做样式级联」这条根本限制（`getComputedStyle` 拿不到 transition/animation 的生效值）⇒ 观感类判据本批一律不做；② `installMatchMediaStub` 是**局部桩**（不是全局桩）⇒ 每个用例自己装、自己 `restore()`；**遗漏 `restore()` 会污染同文件后续用例** —— 已登记为使用纪律（harness 不做自动清理，因为 vitest 的 `afterEach` 注册会侵入调用方的生命周期）；③ `animatedProps` 读的是 `el.style` 的**内联属性集合**（尖刺实测口径）⇒ 它**不能**看到类规则里的属性。

---

### Task 11: 可中断/可反向的**唯一出口** + 判据模板 + 被动画属性集合审计（代理 60fps）

> **依据**：R8.2（双断言）· R8.4（属性集合代理）· R5 通则（每个签名动效**必须**给出 ① 起始态被持有 ② **可中断**（下一个输入接管，不排队）③ reduced-motion 下降级 ④ 三档行为 —— **四者缺一即不达标**）。

**目标**：新建 `app/src/motion/controls.ts`（**全仓唯一**创建「可中断、可反向、可 seek」动效的出口：`startControllable(el, vars)` 返回 `{ timeline, interrupt(), reverse() }`，内部强制 `overwrite: "auto"` 与 `paused` 友好的 timeline）；新建 `app/src/motion/controls.test.ts`（**判据模板**：双断言 + 反向 + 属性集合审计），作为波 C 六个签名动效的**复用底座**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/motion/controls.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤90** |
| `app/src/motion/controls.test.ts` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤220** |

**Interfaces:**
- Produces（**冻结快照**，波 C 的 #1–#6 全部经它建 timeline）：
  ```ts
  export interface Controllable {
    readonly timeline: GsapTimeline;
    interrupt(next?: () => void): void;   // 下一个输入接管：kill 当前 + 可选立即起下一个
    reverse(): void;                       // 反向（§8.6 #3/#6 的「可反向」）
    seek(t: number): void;                 // = timeline.time(t)（测试用）
  }
  export function startControllable(target: Element, vars: gsap.TweenVars, opts?: { paused?: boolean }): Controllable;
  export function assertAnimatable(props: readonly string[]): void;   // 属性集合 ⊆ ANIMATABLE_PROPERTIES
  ```
  🔴 **`overwrite: "auto"` 是本出口的核心**：R8.2 逐字「GSAP 3 默认 `overwrite:false` ⇒ 覆盖同属性时**旧 tween 仍在跑**，**只看 `style.transform` 会假绿**」。

- [ ] **Step 1: `controls.ts`**（`@ai-context` 逐字写 R8.2 的依据 + 为什么 `interrupt` 必须 `kill` 而不是「新 tween 覆盖」）
- [ ] **Step 2: `controls.test.ts` 的判据模板**（四条，全部用 `freezeAt` 而非 sleep）：
  1. **可中断（双断言）**：起 A（`x: 0→100`，dur 1）→ `freezeAt(tlA, 0.3)` → `interrupt()` 后起 B（`x: 0→50`）→ `freezeAt(tlB, 0.5)` ⇒ 断言 ① `gsap.globalTimeline.getChildren().length === 1`（或 `tlA.totalTime()` 冻结在 0.3）**且** ② `currentTransform(el)` 等于 B 在 0.5 处的值
  2. **可反向**：paused timeline 上 `reverse()` 后 `freezeAt(tl, 0.25)` 的值 == 正向 `freezeAt(tl, 0.25)` 的值（对称性）
  3. **属性集合审计**：对模板里的真实 tween 断言 `animatedProps(el)` ⊆ `ANIMATABLE_PROPERTIES`
  4. **reduced-motion 降级**：桩 `{reduce:true}` 下 `startControllable` **直接落终态**（`freezeAt(tl, 0)` 即终值），且不创建 tween（`tweenCount(el) === 0`）
- [ ] **Step 3: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **双断言（R8.2 本体）**：`interrupt()` 后旧 tween 的 `totalTime()` **冻结**（不再增长）**且** `getChildren().length` 不增；**同时** `currentTransform(el)` 等于新 tween 的值 | **M1**：把 `controls.ts` 的 `overwrite: "auto"` 删掉（回到 GSAP 默认 `false`），**并把 `interrupt` 的 `kill` 去掉**（改成「直接起新 tween 覆盖同属性」）⇒ 重跑 | **M1 后期望**：**只看 `style.transform` 的那一半仍然绿**（因为新 tween 写到同一属性上），而 `getChildren().length === 2`、旧 tween `totalTime()` 继续增长 ⇒ **单断言版本会假绿，双断言版本红**。⚠️ **这条变异是本任务存在的理由**，报告必须逐字给出两个读数 |
| **V2** | **可反向对称**：`reverse()` 后 `freezeAt(tl, 0.25)` 值 == 正向 `freezeAt(tl, 0.25)` 值 | **M2**：把 `reverse()` 实现成 `timeline.timeScale(-1)` 但**不** `play`（尖刺 S2.5 实测「根级 timeline 真回放有**首帧锚定瞬态** 0.048s」） | **M2 后期望**：值不对称（有瞬态）⇒ 红（**证明该判据能抓到"看起来反向其实没反向"**） |
| **V3** | **属性集合审计**：真实出口产出的 tween 只写 `{transform, translate, rotate, scale, opacity, filter}` 的子集 | **M3**：把模板里的 `vars` 从 `{x: 20, opacity: 0.5}` 改成 `{width: 200}`（尖刺实测：动 `width` 会写 `width`） | **M3 后期望**：`animatedProps` 含 `"width"` ⇒ 红 |
| **V4** | **reduced-motion 降级**：桩 `{reduce:true}` ⇒ 直接落终态且 `tweenCount(el) === 0` | **M4**：把降级分支去掉 | **M4 后期望**：创建了 tween 且起点是初值 ⇒ 红 |
| **V5** | **`assertAnimatable` 防真空对照**：喂已知违规样本（`["width"]`）必须**抛**；喂合法样本（`["opacity"]`）必须通过 | **M5**：把 `assertAnimatable` 实现成空函数 | **M5 后期望**：违规样本不抛 ⇒ 红 |
| **V6** | `line-limits --full` exit 0 · `tsc` 0 错 · `vitest` 全绿 | — | 三条 exit 0 |

**提交信息**：`feat(motion): 加可中断动效出口与判据模板`（subject 18 字）

**诚实边界**：① 🔴 **本任务交付的是"模板 + 唯一出口"，六个签名动效一个都还没落** —— 波 C 的每个动效**必须**经 `startControllable` 建 timeline，否则「可中断可反向」的判据形同虚设；这条是**波 C 的入场条件**；② 「可中断」在 jsdom 里判的是**状态机正确性**（旧 tween 死了、新 tween 掌权），**不是**「用户看到的接管」；③ **`Flip` 的几何位移**在本任务**不判**（R5.7 逐字：jsdom 里 bounds 全 0、位移增量恒 `translate3d(0px,0px,0px)`）—— 只判「Flip 已注册 + timeline 存在 + 属性集合 ⊆ transform 族」的**弱判据**，几何位移进 `## 诚实边界`。

---

### Task 12: 响应层七类动作回执（420 裸 `<button>` / 395 `div+onClick` / 118 `input+textarea` / 26 `checkbox` / 27 折叠）

> **依据**：§8.6.1 第 2 条逐字「点击 / 拖拽 / 悬停 / 键入 / 勾选 / 展开折叠 / 切换视图 —— 每一类都必须有**有质感的即时反馈**（"做完了"与"收到了"必须可区分）。**这是验收口径，不是形容词**：批 6 收口时逐类动作列出其响应层动效，缺一即不达标。」
> **实测底稿**（`recon-b` B11，本计划者未逐条复核 ⇒ 标注为**引自 recon-b**）：① 点击 `<button` **420 处 / 119 文件**、原语 `<Button` **109 处 / 42 文件**、含 `onClick=` 的非 `<button` 行 **395 处 / 135 文件**；② 拖拽 `onPointerDown`/`onDragStart`/`setPointerCapture` **4 处 / 3 文件**；③ 悬停 `onPointerEnter`/`onMouseEnter`/`onMouseLeave` **8 处 / 6 文件**；④ 键入 `<input`/`<textarea` **118 处 / 55 文件**；⑤ 勾选 `type="checkbox"` **26 处 / 21 文件**；⑥ 展开折叠 **27 处 / 13 文件**；⑦ 切换视图 **16 处 / 8 文件**。**今天「有回执」的只有两类半**（点击仅经原语 `Button` 的子集 · 切换视图仅 `ViewSwitcher` 段控件本身 · 悬停/拖拽仅 `ColumnResizer` 一个 0.15s 背景色）。

**目标**：把七类动作的响应层回执**落到真实元素形态上**，并且**零调用点改动**地覆盖大头 —— 分两级：
- **一级（原语层，109 处 `<Button>` 覆盖）**：补 `focus-visible` 焦点环落纸 + 按档位的按下幅度（`Button.css` 已有 120ms 四属性 transition 与 `:active translateY(1px)`）。
- **二级（元素级全局回执，覆盖 420 + 395 + 118 + 26 + 27 的大头）**：在 `motion.css` 里用**元素选择器 + 属性选择器**写回执规则 —— 🔴 **不新增任何 `.ed-*` 类名**（否则撞 `motion-coverage.test.ts:113-124` 的「未登记基类」判据），也**不给调用点加类**（420 处逐个改不可验收）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/ui/primitives/motion.css` | T6 后 ~130 | 否（`.css` 不在门禁视野） | 否 | 加元素级响应层规则（+≤80 行）+ 把这些选择器**加进唯一的 reduced-motion 名单** |
| `app/src/ui/primitives/Button.css` | **92** | 否 | 否 | 焦点环 + 档位幅度（+≤10 行） |
| `app/src/motion/responseCoverage.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**，预算 **≤200**（七类覆盖清单 + 计数 + 行为对拍） |

**Interfaces:**
- 🔴 **不得**新增 `motion.css` 的 `--ed-*` 定义（G4 改判后的 V1 判据）；**不得**新增 `.ed-*` 类名（`motion-coverage.test.ts:113-124`）；**不得**新增 `@media` 块（`style-seams.test.ts:192` 只数 reduced-motion 块，但 `Loading.test.tsx:204` / `ViewSwitcher.test.tsx:222` 的先例说明仓内对"第二块媒体查询"敏感 ⇒ **本任务不引任何新 `@media`**，`hover` 规则直接写 `:hover`，与既有 `Button.css` 一致）
- Produces：`data-testid`/类名契约**不变**（本任务**零 DOM 结构改动**）⇒ 三处棘轮台账（`statusLineBaseline`/`surfaceBaseline`/`textBaseline`）**零影响**

- [ ] **Step 1: 原语层（`Button.css`）** —— `:focus-visible` 的 `outline` / `outline-offset` 走 `var(--ed-*)` 语义（**零颜色字面量**，受 `style-seams.test.ts:238` 约束）+ 三档幅度（`html[data-motion="eco"] .ed-btn:active:not(:disabled) { transform: none; }` 等）
- [ ] **Step 2: 元素级全局回执（`motion.css`）** —— 四组规则，**全部用元素/属性选择器**：
  ```css
  /* 勾选落笔（规格 §8.1 响应层第 4 项）；今天 26 处全是原生 checkbox，无自定义原语 */
  input[type="checkbox"], input[type="radio"] { transition: accent-color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)); }
  /* 键入回执（118 处 input/textarea；今天零过渡，焦点环由浏览器原生 outline 提供） */
  input:not([type="checkbox"]):not([type="radio"]), textarea { transition: border-color …, outline-color …; }
  /* 点击/按下（420 处裸 button + 395 处 div+onClick 里的 role=button 子集） */
  button:not(.ed-btn), [role="button"]:not(.ed-btn) { transition: …; } button:not(.ed-btn):active { transform: translateY(1px); }
  /* 展开折叠（27 处；details/summary 这一支可零改动覆盖） */
  details > summary { transition: …; }
  ```
  ⚠️ 每条 `transition` 的时长/缓动**只许** `var(--ed-dur-*)` / `var(--ed-ease*)`（T14 的 G1 判据会逐字扫这个），位移**只许** `translateY(1px)`（≤8px，T9 的扩域守卫扫得到）
- [ ] **Step 3: 名单同步** —— 把新增的**每一处** `transition` 落点选择器加进 `motion.css` 的**唯一** reduced-motion 块（G6 改判后名单**可增长**；`motion-coverage.test.ts:139-146` 只对 `animation:` 落点强制，`transition` 落点靠 `style-seams.test.ts:190-200` 的基类 `toContain` + 本任务新增的判据覆盖）
- [ ] **Step 4: `responseCoverage.test.ts`**（七类清单 + 计数 + 行为对拍；见 Verification）
- [ ] **Step 5: 八门禁 + 两个提交**（原语层 / 元素级 + 守卫）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **七类覆盖齐备（静态守卫）**：对七类动作，`motion.css` + `primitives/*.css` 剥注释后**至少各有一条**规则命中该类今天的**真实元素形态**（点击 `button` ∨ `[role="button"]`；拖拽 `[role="separator"]`；悬停 `:hover`；键入 `input`/`textarea`；勾选 `input[type="checkbox"]`；折叠 `summary`；切换视图 `.ed-btn--segment`）。**必须附行为判据**（R1.4）⇒ V2 | **M1**：删掉「勾选」那一组规则 | **M1 后期望**：七类清单里「勾选」为 0 条 ⇒ 红 |
| **V2** | **行为对拍（真实渲染，防"规则在但打不到元素"）**：在 jsdom 里渲染四类代表控件的**真实宿主**（`GroupDeleteConfirm` 的 checkbox / `SessionDetailHeader` 的 title input / 一个裸 `<button>` 宿主 / `ColumnBar` 的 div+onClick），断言 `fireEvent.click` 后**语义仍正确**（`checked` 翻转 / `value` 变化 / `onClick` 被调用一次），且元素**没有**因为新规则被加上 `disabled` / `pointer-events` 之类的阻断属性 | **M2**：给 `button:not(.ed-btn)` 加 `pointer-events: none`（模拟"为动效顺手改了可交互性"） | **M2 后期望**：`onClick` **未被调用** ⇒ 红（**这条是本任务的安全网**：动效**不得**改变交互语义） |
| **V3** | **覆盖计数（见证余量，不许编造）**：断言「原语 `Button` 覆盖的点击点数 ≥ 109」与「元素级规则覆盖的形态数 = 4」（checkbox/radio · text · button/role=button · summary），并把**未覆盖余量**（`div+onClick` 里**无 `role`** 的那些、`ColumnResizer`/`NoteListRow`/`NoteTreeSection` 的拖拽三处、自建 tabbar）**逐条登记在测试文件里**（文本登记 + 一条 `expect(uncovered.length).toBe(登记值)` 的可红判据） | **M3**：把登记表的 `uncovered.length` 从实测值改成 0 | **M3 后期望**：红（**防"把余量写成 0"**） |
| **V4** | **reduced-motion 覆盖增长**：新增的每一处 `transition` 落点，其选择器都出现在 reduced-motion 块的名单里（探针：从新规则的选择器集合与块内名单做**集合包含**；**阳性对照**：`.ed-btn` 必须在名单里） | **M4**：把 `input[type="checkbox"]` 从名单里删掉 | **M4 后期望**：包含关系破裂 ⇒ 红 |
| **V5** | **零 DOM 结构改动**：本任务提交的 `git diff --numstat` **只含 `motion.css` / `Button.css` / 新建测试文件**；三个棘轮台账（`statusLineBaseline` / `surfaceBaseline` / `textBaseline`）**零 diff** | **M5**：顺手改 `AudioLevelMeter.tsx` 的 DOM | **M5 后期望**：`--numstat` 出现该文件 ⇒ 红（**V5 是提交门禁，不是测试用例**：由报告里的 `git diff --numstat` 逐条核对） |
| **V6** | `line-limits --full` exit 0 · `tsc` 0 错 · `vitest` 全绿（既有 1770 用例一条不少）· `nativeButton` / `textRatchet` / `surfaceRatchet` / `statusLineRatchet` / `emptyStateRatchet` / `loadingRatchet` **六条全绿** | — | 全绿 |

**提交信息**：① `feat(motion): 补原语层焦点环与档位幅度`（subject 16 字）② `feat(motion): 落元素级响应层回执与覆盖守卫`（subject 19 字）

**诚实边界**：① 🔴 **本任务不做「逐个调用点改造」** —— 420 处裸 `<button>` / 395 处 `div+onClick` / 118 处 input / 26 处 checkbox / 27 处折叠**一处都没改**；覆盖方式 = **元素级全局 CSS**（零调用点改动）。**收益 = 覆盖面**；**代价 = 不可对单点定制，且观感不可机器判据**（jsdom 不做样式级联、`getComputedStyle` 拿不到生效值）；② **`div+onClick` 里没有 `role="button"` 的那些**（`recon-b` 给了 `ColumnBar.tsx:16` 这个实例）**拿不到回执** —— 它们**不是**按钮语义，给它们加游标/回执需要先补无障碍语义（属**批 7/8**）⇒ **逐条登记，不在这里顺手补 `role`**（补 `role` 会改 DOM 契约，撞棘轮）；③ **拖拽三处**（`ColumnResizer` 已有 0.15s 背景色 · `NoteListRow` · `NoteTreeSection`）**零改动** ⇒ 「拖拽」这一类的回执**只有一个落点**，本任务**如实登记**（余量 = 2 处），**不声称拖拽已做满**；④ **悬停**的 8 处里原语层的 `Surface.css:75`/`Button.css:48` 已有 120ms，元素级新增的 `:hover` 只覆盖 `button`/`input`/`summary` ⇒ 自建 tabbar 的行高亮（`CommandPalette.tsx:186` 等）**仍零过渡**（登记）；⑤ **`@media (hover: hover)` 本任务不引**（避免新增媒体查询块）⇒ 触屏设备上 `:hover` 行为与现状一致。

---

### Task 13: 环境层四件 + `@keyframes` 桶边界

> **依据**：§8.1 环境层逐字「2–6s 循环｜应用在呼吸｜**探针摆动** · **采集脉冲** · **未确认段落墨度极缓慢起伏（幅度 2%）** · **到期刻度微光**」· §8.2「循环环境动效（骨架 / 探针 / 脉冲）⇒ **CSS keyframes**」· §8.6.1 `:566` 分桶裁定「**keyframes 桶只留 `Loading`/`Skeleton`/`Probe`**」（G5 不动）· §8.6.1 第 1 条「环境层**不得**降为纯背景、不得压到看不见；在「丰富」档**如实变丰富**（幅度与频率提高）」。

**目标**：在 `motion.css` 里落环境层四件（**新落点一律 `<既有基类>--<修饰>` 形状**，理由见 `## 陷阱` #B5-①），并同步 reduced-motion 名单。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/ui/primitives/motion.css` | T12 后 ~210 | 否（`.css` 不在门禁视野） | 否 | 加 3 个 `@keyframes` + 4 组落点规则（+≤100 行） |
| `app/src/ui/primitives/motion-coverage.test.ts` | T6 后 ~190 | 否（余 110） | 否 | 名单增长：新 `animation` 选择器逐字加入（+≤10 行） |
| `app/src/ui/primitives/Text.css` | **46** | 否（余 254） | 否 | 🔻 **R11.3**：加 `.ed-text--low-confidence` 落点规则（+≤8 行） |
| `app/src/motion/tone.ts`（T8 建，~70）或**新建** `app/src/motion/env.ts` | 70 / 新建 | 否 | 否 | 🔻 **R11.3 的「幅度 2% 具名常量」唯一落点**：`export const LOW_CONFIDENCE_INK_AMPLITUDE = 0.02;`（预算 ≤20 行；**并入 `tone.ts` 则零新文件**；若新文件则**必须** ≥2 条行为级判据 + 各自变异体，照 T8 的 `tone.test.ts` 形态） |
| `app/src/ui/primitives/Loading.css` | **79** | 否 | 否 | 🔴 **零改动**（`Loading.test.tsx:177` 恰 2 个 keyframes 是 **G5**；**G15 经本计划者实测不触发**） |
| `app/src/ui/primitives/Button.css` · `StatusLine.css` | **92** · **42** | 否 | 否 | 🔴 **零改动**（两处都禁 `@keyframes`） |
| 🔻 **落点接线（本任务只登记，不在此处改）**：`views/session/SessionTriTrackView.tsx`（**207**）与 `components/session-detail/SessionRawView.tsx`（**157**） | — | 否 | 否 | ⚠️ **写者队列冲突**：这两个文件分别属 **T25→T27→T31** 与 **T24→T28** 的队列，而波 A 必须**先于**波 B 完成 ⇒ **实际执行序 = 本任务落 seam（keyframes + `Text.css` 落点规则 + 名单 + 幅度常量 + 源序），段条目的 `className` 接线由 T25（三轨）与 T28（原文）各自完成**；**验收口径随之下沉**：本任务的 V4b/V4c（真接线判据）在波 A **必然红**（0 落点）⇒ 🔴 **本任务把 V4b/V4c 记为「未达成（依赖 T25/T28 的提交）」并逐字登记，不得写成已通过**；波 D 的兑现度表以 **T25/T28 完成后的读数**为准。**本任务的判据域 = seam 侧**（keyframes 幅度 / 名单 / 形状 / 常量存在性 / 常量与 CSS 对拍） |

**四件的落点（本计划定的形态；`<既有基类>--<修饰>` 是硬形状）**：

| # | 环境层项 | 形态 | 今天的落点 | 处置 |
|---|---|---|---|---|
| ① | **探针摆动** | 复用既有 `.ed-probe` + `ed-probe-swing`（`Loading.css:76`，**时长是硬编码 `2.4s` 非 token**）；**只加档位调制**（`html[data-motion="rich"] .ed-probe { animation-duration: … }` 等）| `Loading.css` 已有 | **不新增 keyframes**；**不碰 `Loading.css`**（G5）；档位规则写在 `motion.css` |
| ② | **采集脉冲** | 新 `@keyframes ed-capture-pulse` + 落点 `.ed-status--live-pulse`（`<基类 ed-status>--<修饰>` ✔） | **0 命中**（采集态本身是波 B 才建的面） | 本任务落 **seam**（keyframes + 类规则 + 名单）；**接线在波 B**（LIVE 仪表建起来之后） |
| ③ | **未确认段落墨度 2% 起伏 —— 🔻 R11.3 裁决：真接线，不落空壳 seam** | 新 `@keyframes ed-unconfirmed-breathe`（`opacity` 在 `0.98 ↔ 1` 之间，**幅度逐字 2%**）+ **落点 `.ed-text--low-confidence`**（`<既有基类 ed-text>--<修饰>` ✔，**`Text` 原语已有 `className` 透传槽** —— `Text.tsx:71`/`:95-104` 实测）| 🔴 **今天：`lowConfidenceClass()`（`components/structuredBlocks.ts:57-58`）生产调用点 0**（唯一引用 = 它自己的测试 + `motion-coverage.test.ts` 的排除名单）；`.ed-low-confidence` 的 CSS 规则**已随批 0-D Task 13 从 `App.css` 删除** | 🔴 **本件真接线（R11.3）**：① 落点 = `views/session/**` 的段条目 —— **三轨视图**（`SessionTriTrackView.tsx:164-166` 的正文 `<Text>`）与**原文视图**（`components/session-detail/SessionRawView.tsx:98-100` 的正文 `<Text>`）；② 判据源 = **`SessionSegment.confidence`**（`types/session.ts:29`，**数据今天就在类型里**）；③ **`lowConfidenceClass()` 必须变成真实生产调用点**（0 → 2）；④ 落点类名 = **`ed-text--low-confidence`**（`--` 形状 ⇒ `motion-coverage.test.ts:113-124` 自动放行、`:126-129` 的 5 名排除名单**零改动**）⇒ **本裁决不需要任何既有断言改动**；⚠️ **若实施者坚持用 `ed-low-confidence` 作 CSS 类名** ⇒ 会同时撞 `motion-coverage.test.ts:99`（12→13）、`:126-129`（`NON_PRIMITIVE_ED_NAMES` 5→4 + `:127` 长度）与 `:113-124`（未登记基类）⇒ **必须走 STOP 请裁（拟 G16）**，**不得**擅自改 |
| ④ | **到期刻度微光** | 新 `@keyframes ed-due-glow` + 落点 `.ed-surface--due-glow`（`<基类 ed-surface>--<修饰>` ✔）；琥珀逐字锁 **`--ed-due` 族**（R4.5） | **0 命中**（「到期刻度」这一视觉形态今天不存在 —— 波 B 才建） | 本任务落 seam；**接线在波 B/C**（#4 刻度生长） |

- [ ] **Step 1: 三个 `@keyframes`**（**只进 `motion.css`**；`Loading.test.tsx:177` 的「恰 2」、`Button.test.tsx:268` 与 `StatusLine.test.tsx:244` 的禁令把另三个文件排除；`motion.css` 不在它们的扫描域内 —— **执行者必须自己复测这三条仍绿**）
  🔻 **G15 的域判定（R11.3 ④ 要求「实施者必须先实测该断言的域」）**：**本计划者已实测**并给逐字证据 —— `Loading.test.tsx:49` 逐字 `const CSS = stripComments(readText("Loading.css"));`，而 `:177` 是 `expect(CSS.match(/@keyframes/g)).toHaveLength(2)` ⇒ **该断言的域 = `Loading.css` 单文件**，`motion.css` 的新增 keyframes **不会**让它红。⇒ **G15 的条件不成立、授权自动失效、G5 恢复适用（`Loading.test.tsx` 全文件零改动）**。⚠️ **实施者仍必须复测并给出自己的逐字读数**（R11.3 ④ 逐字要求；若实测结论与本计划者相左 ⇒ 先按 G15 走改判并 STOP 报控制方）。
- [ ] **Step 2: 四组落点规则**（②③④ 三条用新类；① 只用 `[data-motion]` 前缀调制既有 `.ed-probe`）—— 幅度与频率**只许**按 §8.6.1 第 1 条的方向（`rich` **提高**、`eco` **减弱/停**），**不得**把环境层压到看不见
  🔻 **③ 的落点规则落 `ui/primitives/Text.css`**（棘轮域外；`Text.css` 实测 **46** 行）：`.ed-text--low-confidence { animation: ed-unconfirmed-breathe … }`；**幅度 2% 必须具名**：在 `app/src/motion/` 里导出唯一常量 `LOW_CONFIDENCE_INK_AMPLITUDE = 0.02`（新文件或并入 T8 的 `tone.ts`），并由 Step 4 的守卫**对拍** `motion.css` 的 keyframes 极值差，**不许**在 CSS/TS 两处各写一个 `0.02`
- [ ] **Step 2b: 🔻 R11.3 真接线（本件的主体工作量）**
  ① `views/session/SessionTriTrackView.tsx` 与 `components/session-detail/SessionRawView.tsx` 的段正文 `<Text>` 上：`const lc = lowConfidenceClass(seg.confidence);` ⇒ 低置信时追加 `className="ed-text--low-confidence"`；
  ② **`lowConfidenceClass` 的 import 路径**：`views/**` **可以** import `components/**`（`architecture.guard.test.ts:119` 逐字「`components/**` 是复用面」）⇒ **不违反 A2③**；`SessionTriTrackView.tsx` 现有文件头「零 `@tauri-apps`」那一条（A3③）**不受影响**；
  ③ `low-4` 不参与：`ink-4` 的落点（原 T13 的方案）**作废** —— R11.3 的落点就是 `ed-text--low-confidence`；
  ④ 阈值沿用 `lowConfidenceClass` 既有的 `< 0.5`（**不许**自造第二阈值）
- [ ] **Step 3: 名单同步**（把 `.ed-status--live-pulse` / `.ed-text--low-confidence` / `.ed-surface--due-glow` 逐字加进 reduced-motion 块 ⇒ `motion-coverage.test.ts:139-146` 的「每处 `animation` 选择器都在名单里」绿）
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **桶边界**：`@keyframes` 定义**只在 `motion.css`**；`Loading.css` 仍恰 **2**、`Button.css` 与 `StatusLine.css` 仍 **0**（四条文件逐个断言；`Loading.test.tsx` 与两条原语测试**必须仍绿**） | **M1**：把 `ed-capture-pulse` 写进 `Loading.css` | **M1 后期望**：`Loading.test.tsx:177`（`toHaveLength(2)`）红 + 本判据红（**双红 ⇒ 桶边界有牙**） |
| **V2** | **名单覆盖（G7 照旧）**：新增的每一处 `animation:` 选择器**原文**都出现在 reduced-motion 块的名单里 | **M2**：把 `.ed-surface--due-glow` 从名单里删掉 | **M2 后期望**：`motion-coverage.test.ts:139-146` 红（**用的是既有判据，本任务只加名单**） |
| **V3** | **新落点形状合法**：`motion.css` 里新增的 `.ed-*` 类名**全部**形如 `<既有基类>--<修饰>` ⇒ `motion-coverage.test.ts:113-124` 的 `unregistered` 仍为 `[]`（**不新增基类**） | **M3**：把落点改成 `.ed-env-pulse`（新基类形状） | **M3 后期望**：`unregistered` 非空 ⇒ 红（**证明那条既有过滤器真的会拦**） |
| **V4** | **幅度逐字**：`ed-unconfirmed-breathe` 的 `opacity` 极值差 == **0.02**（2% 逐字，§8.1）== `LOW_CONFIDENCE_INK_AMPLITUDE`（**对拍**）；且**不含** `transform`（未确认段落的起伏**只动墨度**） | **M4**：把幅度改成 `0.05`；**M4b**：给 keyframes 加一句 `transform: translateY(1px)` | **M4 后期望**：差 ≠ 0.02 ⇒ 红；**M4b 后期望**：出现 `transform` ⇒ 红 |
| **V4b** | **🔻 R11.3 真接线（新增，本件最重要的判据）**：在 jsdom 里渲染一个含 `confidence: 0.3` 段的 `SessionDetail` 夹具 ⇒ 该段正文元素**带** `ed-text--low-confidence`；`confidence: 0.9` / `null` 的段**不带**（**双断言**：类名 + 计数） | **M4c**：把 `lowConfidenceClass(seg.confidence)` 换成常量 `""`（即「不接线」）⇒ 红；**M4d**：把阈值从 `< 0.5` 改成 `< 0.9` ⇒ 高置信段也被点亮 ⇒ 红 | **M4c 后期望**：0 处命中 ⇒ 红；**M4d 后期望**：计数从 1 变 2 ⇒ 红 |
| **V4c** | **调用点计数（0 调用点回归封条）**：`lowConfidenceClass` 在 `app/src/**` 的**生产**调用点 ≥ 2（剥注释；排除它自己的定义文件 `structuredBlocks.ts` 与所有 `*.test.*`） | **M4e**：把两处调用点改回不调用（落点只写死类名） | **M4e 后期望**：计数 2 → 0 ⇒ 红（**这条把 R11.3 的「0 调用点 → 真接线」变成可红判据**） |
| **V5** | **`--ed-*` 定义仍 0**：`motion.css` 剥注释后 `--ed-[a-z0-9-]+\s*:` 命中 **0**（T5 的 G4 新判据；本任务**只能加类规则与 keyframes**） | **M5**：为环境层加一个 `--ed-env-scale` 变量 | **M5 后期望**：命中 1 ⇒ 红（T5 V1 同步红） |
| **V6** | `line-limits --full` exit 0 · `tsc` 0 错 · `vitest` 全绿 · 六类棘轮全绿 | — | 全绿 |

**提交信息**：`feat(motion): 落环境层四件与 keyframes 桶边界`（subject 17 字）

**诚实边界**：① 🔻 **本件按 R11.3 已改为「真接线」，不再落空壳 seam** —— 环境层第 ③ 件的兑现度**本任务内必须逐条给出**（**四件逐条兑现度表**：① 探针摆动 = 既有落点 + 档位调制｜② 采集脉冲 = seam 落成、**接线在 T18**｜③ 未确认段落墨度 2% = **本任务真接线**（落点 2 处 + `lowConfidenceClass` 真调用 + 幅度具名常量）｜④ 到期刻度微光 = seam 落成、**接线在 T21**）；**不得**再出现「落 seam 但 0 调用点」被算作已交付（R11.3 收口要求逐字）；② **第 ②/④ 件的接线在波 B**（采集态与到期刻度的承载面还没建）⇒ 本任务结束时它们**仍是 seam**，报告须逐条区分「已接线 / 仅 seam + 去向任务号」；③ **环境层的观感（"在呼吸"）不可机器判据** ⇒ 本任务只判**幅度 / 频率 / 桶 / 名单 / 形状 / 类名落点**；④ `ed-probe-swing` 的 `2.4s` **硬编码**在本任务**不改成 token**（它在 `Loading.css`，G5 禁碰）—— 登记为「唯一的非 token 环境层时长」；⑤ **G15 的条件经本计划者实测不成立**（`Loading.test.tsx:49` 的 `CSS` 绑定 `Loading.css`）⇒ 本任务对 `Loading.test.tsx` **零改动**；该结论需实施者复测确认。

---

### Task 14: G1 / G2 / G3 / G6 改判（每条给旧断言原文 · 新断言 · 专属变异体 · 为什么更强）

> **依据**：R1.2（到期改判，不删除；**必须**附专属变异体；报告逐条点名四要素）· R4.2（G1/G2/G3 授权）· G6（`style-seams.test.ts:192` 改判）· `### 表 4` 的 **S5**（G3 的形态校准）· ⚠️ **G5 / G7 / G10 不动**。

**目标**：把四条「为批 6 预留」的既有断言改判为**等价或更强**的新判据，并各配一个专属变异体；**不 `skip`、不删除、不放宽为恒真**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/shell/TopBar.test.tsx` | **230** | 否（余 70） | 否 | **G1**：改 `:139-143` 那条 `it`（净增 ≤ +20） |
| `app/src/shell/TopBar.css` | **142** | 否 | 否 | 文件头 `:5-6` 的禁令**改判为条件式**（注释改写，+≤6 行） |
| `app/src/shell/ShellFallback.test.tsx` | **163** | 否（余 137） | 否 | **G2**：改 `:58-63`（净增 ≤ +15） |
| `app/src/ui/primitives/ViewSwitcher.test.tsx` | **225** | 否（余 75） | 否 | **G3**：改 `:222-223`（净增 ≤ +20；形态见 `### 表 4` S5） |
| `app/src/ui/primitives/style-seams.test.ts` | T9 后 ~296 | ⚠️ **是**（余 ~4） | 否 | **G6**：改 `:190-200`（净增 ≤ +4；**若会破 300 ⇒ 把新判据放进 T6 已建的 `motion-coverage.test.ts` 源序块**） |

**四条改判的逐条落笔（旧 → 新 → 变异体 → 为什么更强）**

| # | 旧断言原文（file:line，逐字） | 新断言（逐字） | 专属变异体 | 为什么更强 |
|---|---|---|---|---|
| **G1** | `app/src/shell/TopBar.test.tsx:139-143`：`it("③ 顶栏 CSS 里没有动效声明（批 6 才加）", () => { const banned = [/transition\s*:/, /animation\s*:/, /@keyframes/]; const hits = banned.filter((re) => re.test(CSS)).map(String); expect(hits, \`批 3 的顶栏 CSS 不得含动效（属批 6）：${hits.join(" / ")}\`).toEqual([]); });` | `it("③ 顶栏 CSS 的每条 transition/animation 都只用 token 且落点可被 reduced-motion 覆盖", () => { const decls = stripComments(CSS).split(";").filter(d => /(?:^\|[;\s])(?:transition\|animation)(?:-duration\|-name)?\s*:/.test(d)); expect(decls.length, "应为顶栏的响应层留至少一条回执（本批已加）").toBeGreaterThan(0); const raw = decls.filter(d => /\d+\s*ms\|\d+(?:\.\d+)?s/.test(d)); expect(raw, "时长必须走 var(--ed-dur-*)，不得写裸 ms/s").toEqual([]); const badEase = decls.filter(d => /cubic-bezier\|ease-(?:in\|out\|in-out)\b/.test(d) && !/var\(--ed-ease/.test(d)); expect(badEase, "缓动必须走 var(--ed-ease*)").toEqual([]); const cls = [...stripComments(CSS).matchAll(/\.(ed-[A-Za-z0-9_-]+)/g)].map(m => m[1]); const motion = stripComments(readFileSync(MOTION_CSS, "utf8")); for (const c of new Set(cls)) expect(motion, \`$\{c} 不在 reduced-motion 名单里 ⇒ 该类在 reduced-motion 下照旧动\`).toContain(\`.$\{c}\`); });` | **M-G1a**：在 `TopBar.css` 写 `transition: color 120ms ease-out;`（裸时长+裸曲线）⇒ 两条 `filter` 均非空 ⇒ 红。**M-G1b**：写 `transition: color var(--ed-dur-micro, 120ms) var(--ed-ease, …);` 但落点类**不在** reduced-motion 名单 ⇒ 第三条循环红 | 旧断言**只禁不导**（禁掉一切动效 ⇒ 批 6 要么违它、要么顶栏永远死的）；新断言**把"能用"与"用错"分开**：`decls.length > 0` 封住「把顶栏做成死的」这条退化路径，两条 `filter` 封住「绕过 token」，最后一条把**§8.6.1 第 4 条（无障碍优先）**从 `motion.css` 的单点守卫扩到**任何新增落点**。**四半各自可红**，旧断言只有一半（禁） |
| **G2** | `app/src/shell/ShellFallback.test.tsx:58-63`：`it("渲染一行文字且是 role=status；内联样式里没有动效（动效属批 6）", () => { … expect(el.getAttribute("style") ?? "").not.toMatch(/transition\|animation/); … });` | `it("渲染一行文字且是 role=status；内联样式里的动效只用 token", () => { … const style = el.getAttribute("style") ?? ""; const decls = style.split(";").filter(d => /(?:transition\|animation)/.test(d)); const bad = decls.filter(d => !/var\(--ed-(?:dur|ease)/.test(d)); expect(bad, \`内联动效只许 var(--ed-dur-*) / var(--ed-ease*)：${bad.join(" / ")}\`).toEqual([]); … });` | **M-G2**：`style={{ transition: "opacity 150ms" }}` ⇒ `bad` 非空 ⇒ 红 | 旧断言**把「行内 style 不得含动效」当终点**，但它真正要防的是**硬编码值**（`ShellFallback` 是首访加载态，`motion.css` 的 token 天然可用）⇒ 新断言**保留"角色/文案"那一半不动**，把动效那一半从「禁」改成「只许 token」。**更强**：旧断言在任何合法 token 用法上假红（逼人绕开守卫），新断言在**硬编码**上真红 |
| **G3** | `app/src/ui/primitives/ViewSwitcher.test.tsx:222-223`：`expect(VS_CSS, "本文件写了 @media（reduced-motion 必须只有 motion.css 一处）").not.toContain("@media");` + `expect(VS_CSS, "本文件写了动画落点（段控件是响应层，不是环境层）").not.toMatch(/(?:^\|[;\s])(?:-(?:webkit\|moz\|ms\|o)-)?animation(?:-name)?\s*:/);` | **两条原文逐字保留**（`@media` 与 `animation` 禁令**都必须继续成立** —— 前者与 `style-seams.test.ts:192` 同向，后者与 G5 的桶边界同向）+ **追加**：`const decls = stripComments(VS_CSS).split(";").filter(d => /transition\s*:/.test(d)); expect(decls.length).toBeGreaterThan(0); for (const d of decls) expect(d, "段控件的时长/缓动必须走 token").toMatch(/var\(--ed-(?:dur|ease)/);` | **M-G3**：把 `ViewSwitcher.css:47` 的 `var(--ed-dur-micro, 120ms)` 改成裸 `120ms` ⇒ 新追加那条红。⚠️ **反例守卫（必须绿）**：保持现状不改 ⇒ 全绿 | 见 `### 表 4` 的 **S5**：G3 的两条禁令**本来就不该被改**（它们守的是别的东西）。R4.2 逐字说「同款改判」指的是**意图**（把"禁动效"改成"只许 token + 可被覆盖"）⇒ 本仓的**已落地形态**是在**保留禁令**的前提下**追加 token 判据**。**更强**：旧版只有禁令（无正面判据 ⇒ 无法区分"没做"和"做对了"），新版**禁令 + 正面判据**双向 |
| **G6** | `app/src/ui/primitives/style-seams.test.ts:192`：`expect(clean.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);`（配套 `:194-199` 逐基类 `toContain`） | **块位置唯一不变**（仍 `toHaveLength(1)`，**原文逐字保留**）+ **追加两条**：① `expect(MOTION_ENTRIES.length, "名单只许增长（批 6 起环境层/响应层落点逐批加入）").toBeGreaterThanOrEqual(12);` ② **源序**：`expect(clean.search(/\[data-motion="(?:eco\|standard\|rich)"\]/), "档位块必须在 reduced-motion 块之前（§8.5：系统设置优先于档位）").toBeLessThan(clean.indexOf("@media (prefers-reduced-motion"));`（若行数不够 ⇒ ② 落 T6 的 `motion-coverage.test.ts` 源序块，**判据本体不变**） | **M-G6a**：删掉名单里的一条基类 ⇒ ① 红；**M-G6b**：把 `motion.css` 的档位块与 reduced-motion 块对调 ⇒ ② 红（与 T6 V6 同源，**两侧各有一份 ⇒ 更强**） | 旧断言**只锁"唯一性"**，对"名单能不能长"「优先级靠什么实现」都无话可说 ⇒ 批 6 一加落点就要么红、要么被迫放宽。新断言**把唯一性留住**（同一份 `toHaveLength(1)`），并把**增长方向**（≥12）与**优先级实现**（源序）变成可红判据。**更强**：`toHaveLength(1)` 是**双向**约束（多一个红、少一个也红），新加的两条又各自单向可红 ⇒ 净增两个独立失败模式 |

- [ ] **Step 1: 逐条按上表改**（**先改 G1、再 G2、再 G3、最后 G6**，每条改完立刻单跑该文件）
- [ ] **Step 2: 逐条跑专属变异体**（四条 × 至少一个变异；**导出树内做**；harness 带 `ran` 闸；禁 `--reporter=basic`）
- [ ] **Step 3: 改 `TopBar.css:5-6` 的文件头注释**（禁令 → 条件式；**只改注释，不改任何 CSS 规则** —— 顶栏的动效落点由 **T12 的元素级规则**经 `.ed-*` 或元素选择器覆盖；若顶栏需要自有 transition，**由本任务加**并同步 reduced-motion 名单）
- [ ] **Step 4: 八门禁 + 两个提交**（G1/G2 / G3/G6）

**Verification**

| # | 判据 | 变异体 | 期望 |
|---|---|---|---|
| **V1–V4** | 上表四条「新断言」各自绿，且**各自**在对应变异体下红（**逐条给读数**） | 上表 M-G1a/M-G1b · M-G2 · M-G3 · M-G6a/M-G6b | 每条：CONTROL 绿 + 变异红；报告逐条写明「旧断言原文 / 新断言 / 变异体 / 为什么更强」 |
| **V5** | **G5 / G7 / G10 零改动**：`Loading.test.tsx:177`/`:204`、`motion-coverage.test.ts:141`、`navHeight.consumption.test.ts:130-146` 的**文件级 diff 为 0** | — | `git diff --numstat` 对这三条路径**空** |
| **V6** | `line-limits --full` exit 0（四个被改文件全 ≤300）· `tsc` 0 错 · `vitest` 全绿（**用例只增不减**） | — | 三条 exit 0；报告给出四个文件的**改后实测行数** |

**提交信息**：① `test(shell): 改判顶栏与首访加载态动效断言`（subject 18 字）② `test(motion): 改判段控件与 reduced-motion 守卫`（subject 17 字）

**诚实边界**：① 四条改判**都是"更强"，但强度不等价**：G1 的第三条（落点在名单里）**弱于** G7 对 `animation` 落点的强制（`transition` 落点没有"逐处强制"的既有判据支撑）⇒ 本任务只做到「顶栏这一处的落点可覆盖」，**不声称全仓 transition 落点都已覆盖**；② 🔻 **G3 的形态偏离 R4.2 的字面（保留禁令而非替换）已获 R11.6 追认，不再需要请裁** —— **R11.6 逐字**：「✅ **追认**：**保留既有禁令**（与 `style-seams.test.ts:192`、G5 同向）+ **追加**『transition 值只许 token』的**正面判据**。⇒ §七 表的 **G3 改判为「保留禁令 + 追加正面判据」**（比原裁决**更强**）」；依据 = `### 表 4` 的 **S5**；③ G6 的 ②（源序）与 T6 V6 **是同一性质的两份判据**（有意冗余：一份在 `style-seams`、一份在 `motion-coverage`）⇒ 若 `style-seams.test.ts` 行数不允许，**只保留 T6 那一份**，并在报告里写明「G6 的源序判据落在 T6 的文件里」；④ **G12/G13/G14 已由 R11.2 授权**（见 `### 表 5` 的归属列已改正为 G 号：本任务的四条改判 **不含** 它们 —— 它们属 **T5**）。

---

### Task 15: G-1..G-4 补测（四条各补 1 个专属变异体；**证据型任务，零生产代码**）

> **依据**：R6.5 逐字「守卫自证缺口 **G-1..G-4** ✅ **承接**（独立任务，四条各补 1 个**专属变异体**）｜依据 `recon-c` C4：逐字定义在批 5 计划 `:1768-1775` D 表；判据今日全在位（`views/architecture.guard.test.ts:239-243` / `:244-248` / `:119-127` / `NotesReadingColumn.views.test.tsx:6-21`）」。
> **性质**：四条**判据本身已在位**，缺的只是「每条自己的牙」。故本任务**不新增常驻判据**，交付 = **四次变异重跑 + 逐条读数**。

**目标**：为四条各造一个**专属**变异（在导出树里），跑**含守卫文件**的测试面，证明「变异被抓住」；对抓不住的（G-1）**如实登记「该条从设计上就打不红自己」**并给出**由谁代守**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/views/architecture.guard.test.ts` | **260** | 否 | 否 | **零改动**（G-1/G-2/G-3 的判据文件） |
| `app/src/components/notes/NotesReadingColumn.views.test.tsx` | **280** | ⚠️ 余 20 | 否 | **零改动**（G-4 的判据文件） |
| `app/src/views/registry.test.ts` | （未单测） | 否 | 否 | **零改动**（G-1 的代守判据） |
| 产出 | — | — | — | `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/tmp/t15/**`（CONTROL 树 + 4 棵变异树 + `mutants-summary.json`） |

**四条变异设计（逐条给「变异 → 测试面 → 期望红在哪」）**

| # | 缺口（`recon-c` C4 逐字摘要） | 专属变异 | 测试面（**必须含守卫文件**） | 期望 |
|---|---|---|---|---|
| **G-1** | `architecture.guard.test.ts:239-243` 的 **A5①** 只读 `registry.ts` 里 `FROZEN_VIEW_KEYS` 的**文本**（`expect(frozen.includes('session: ["raw"'))`），**从不读 `SESSION_VIEWS[0].key`** ⇒ 该条从设计上就打不红自己 | 把 `views/registry.ts` 的 `SESSION_VIEWS[0]` 与 `NOTE_VIEWS[0]` 的 `key` 从 `"raw"` 改成 `"proof"`，**同时**把 `FROZEN_VIEW_KEYS` 的文本也改成 `proof`（⇒ A5① 依然绿） | 本变异**故意包含** `views/architecture.guard.test.ts` + `views/registry.test.ts` | 🔴 **A5① 绿（预期，记录为"无牙"）**；`views/registry.test.ts:81` 的 **G2①**（`noLoad.map(s => s.key)).toEqual(["raw"])`）**红**。⇒ 结论：G-1 的牙**由 G2① 代守**（`recon-c` C4 已逐字如此判定）；本任务只**补齐专属变异读数** |
| **G-2** | `:244-248` 的 **A5②**（两个宿主的「默认视图常驻 `display` 三元」）在批 5 的 10 条变异里**无一条以它为目标**；最接近的 `T14-M5` 的 `testFiles` **不含守卫文件** | 删掉 `components/notes/NotesReadingColumn.tsx` 的 `display: isDefault ? … : "none"` 三元（改成无条件渲染） | `components/notes/NotesReadingColumn.views.test.tsx` **+ `views/architecture.guard.test.ts`**（**这次带上守卫**） | A5② **红**（`${h} 没有常驻层的 display 三元`）+ F5 红 ⇒ **牙找到了：必须在测试面里带上守卫文件** |
| **G-3** | `:119-127` 的 **A2③**（`views/**` 不导入 `pages/**` / `shell/**`）**无 A2③ 目标的变异**；批 5 未造过 | 在 `app/src/views/session/SessionRawView.tsx` 顶部加 `import { columnSpec } from "../../shell/columnRegistry";` | `views/architecture.guard.test.ts` | A2③ **红**（`views/** 出现了向上层目录的导入`）⇒ 该条**有牙**，只是从没被喂过 |
| **G-4** | **F9**（`NotesReadingColumn.views.test.tsx:6-21` 的文件头 `@ai-context` 注释，**不是 `it`**）⇒ 它**不是判据**，是一条"由命令级零 diff + 冻结逐文件基线代守"的登记 | 在 `components/notes/NotesReadingColumn.tsx` 里改**一个字符**（例如把某处 `16` 改成 `17` —— 挑一个**既有用例不会行为级抓到**的排版值） | ① 该文件的既有测试面；② `tmp/t0/compare-perfile.mjs --frozen` 式**逐文件用例数对拍**（批 5 的工具，**不在库里** ⇒ 本任务用 `vitest --reporter=json` 的 `testResults[].assertionResults.length` 现场构造等价对拍） | ① **可能全绿**（若该字符不被任何用例抓到）⇒ **F9 的"牙"确实不在测试里**；② 用例数对拍**也不会红**（数量没变）。⇒ 结论：**G-4 的 F9 只由「命令级 `git diff --numstat` 零 diff」代守**；本任务**如实登记**，并**不**为它新造常驻判据（⚠️ 见「诚实边界①」：**不**做内容指纹冻结 —— 波 B/C 会合法改这些文件，冻结会在同批内立刻作废） |

- [ ] **Step 1: CONTROL** —— `git -c core.autocrlf=false archive -o <tmp>/t15/control.tar 6cbe964e` ⇒ 解包 ⇒ junction `node_modules` ⇒ 跑**四个相关测试文件**（含守卫）⇒ **必须全绿**（不绿先修树）
- [ ] **Step 2: 四棵变异树**（**每个变异新解一棵树**；不共享）
- [ ] **Step 3: 逐棵跑「测试面」**（`--reporter=json`；harness 记 `ran`：`testResults.length > 0` 且 `numTotalTests > 0`）
- [ ] **Step 4: 写 `tmp/t15/mutants-summary.json`**（四条：缺口 / 变异 / 测试面 / `ran` / 红在哪 / 结论「有牙 / 由谁代守 / 无牙」）
- [ ] **Step 5: 登记提交** —— 本任务**无生产代码改动**；若 Control 树暴露了必须登记的结论，走一个**只改文档/台账的提交**（例如在 `docs/standards/testing.md` 的「守卫自证」小节补一行，或在批次报告的 follow-up 单列；**不许**只写进 gitignored 报告而不留 durable 痕迹 —— R6.5 的接手价值就在这里）

**Verification**

| # | 判据 | 变异体 | 期望 |
|---|---|---|---|
| **V1** | CONTROL 树跑四个测试文件：`ran === true`（`numTotalTests > 0`）且 `numFailedTests === 0` | —（CONTROL 只证"跑得起来"） | 全绿；**若 CONTROL 不绿 ⇒ 先修树，不许继续** |
| **V2** | G-1：A5① **绿**（记录无牙）+ G2① **红** | 上面 G-1 的变异 | `mutants-summary.json` 里 G-1 的结论 = 「A5① 无牙，由 `views/registry.test.ts:81` 的 G2① 代守」 |
| **V3** | G-2：A5② **红**（且必须**在测试面里带 `views/architecture.guard.test.ts`** 的前提下） | 上面 G-2 的变异 | 读数含守卫文件的失败断言原文 |
| **V4** | G-3：A2③ **红** | 上面 G-3 的变异 | 读数含 `views/** 出现了向上层目录的导入：…` |
| **V5** | G-4：如实判定「F9 无测试级牙，由命令级零 diff 代守」 | 上面 G-4 的变异 | `mutants-summary.json` 里 G-4 的结论 = 「无牙（登记）」；**不得**把它写成"已验证" |
| **V6** | 四条**各自的** `ran === true`（防"0 用例被读成红/绿"，批 4 #30 的教训） | — | 四条全 `ran: true` |

**提交信息**：`docs(test): 登记 G-1..G-4 守卫自证结论`（subject 16 字；**若四条都是"变异重跑"、无 durable 结论可写 ⇒ 本任务的第 5 步改为零提交 + 在批次报告的 follow-up 单列，并在 T15 报告里写明"为何不提交"**）

**诚实边界**：① 🔴 **本任务不为 G-4 新造常驻判据** —— 内容指纹冻结（sha256）会在**波 B/C 合法改动这些文件时立刻作废**，属"造一条注定要拆的判据"；本计划**明确拒绝**这条路径（与「不设快照」的 R1.4 精神一致）；② G-1 的结论是**「该条设计上无牙」**，本任务**不修** `architecture.guard.test.ts`（修它 = 改波 A 清单外的既有断言）；③ 本任务的产出**全部在 gitignored 目录**⇒ 若最终无可 durable 落库的结论，**必须**在批次报告的 follow-up 里写明（否则 R6.5 的接手价值丢失）。

---

### Task 16: 文档就地更正（三处，逐字最小改动）

> **依据**：R6.4（`textBaseline.ts` **只许改 1 行**）· R6.6（`pinnable` 规格两处就地更正，**代码是权威**）· 规格 `:835` 逐字预警（`line-limit-exemptions.md` 的人工引用块**不在生成器视野内**，改它不会被门禁发现、也不会被门禁保护）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---:|---|---|---|
| `app/src/ui/primitives/textBaseline.ts` | **297** | ⚠️ **是（余 3）** | 否 | **只改 `:174` 一行**（`558` → `551`），**不许加行**；改后必须仍 **297** |
| `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` | **850** | 否（`.md` 不受门禁） | 否 | `:398` 与 `:647` 两处**就地加注**（原文一字不改） |
| `docs/standards/line-limit-exemptions.md` | **232** | 否（`.md`） | 否 | `:224` 的人工引用块三个行数更正为实测值 |

**改动逐字**

| # | 位置 | 旧文 | 新文 |
|---|---|---|---|
| ① | `app/src/ui/primitives/textBaseline.ts:174` | `* ⚠️ T16-B **未动本表**：迁移时越界值一律**原样留在行内**（R2：只登记，交批 5/6）⇒ 558/120 不变。` | `* ⚠️ T16-B **未动本表**：迁移时越界值一律**原样留在行内**（R2：只登记，交批 5/6）⇒ 551/120 不变。`（**只把 `558` 改成 `551`，其余字符逐字不动**） |
| ② | 规格 `:398` 的那一行**之后**加一条加注（**不改原文那一行**） | `> **② \`pinnable\` 是计划取的默认、无消费方**：规格给了字段但**未给逐行值** ⇒ 批 3 全行写 \`false\`，**今天没有任何消费方**（登记给批 6，与列折叠动效一起定）。` | 加注：`> **🔻 批 6 就地更正（2026-09-13；上格原文一字未改）**：上格「批 3 全行写 \`false\`」**与代码不符** —— 实测 \`app/src/shell/columnRegistry.ts:50\` 的 \`notes-outline\` 是 **\`true\`**，且该文件 \`:16-18\` 的注释自称「除笔记大纲列…为 \`true\`」。**代码是权威**：批 3 的实际取值 = **除 \`notes-outline\` 外全 \`false\`**。消费方仍为 **0**（\`pinnable\` 在生产代码里只被声明、不被读取）⇒ 本批（列折叠 Flip）**只登记消费方缺口，不接线**。` |
| ③ | 规格 `:647` 的那一行（批 3 收口行）里含「批 3 全行 `false`，无消费方」 | 同 ② 的原文表述 | 在该行**之后**加同一条加注（内容与 ② 一致，措辞可略） |
| ④ | `docs/standards/line-limit-exemptions.md:224` | `> - 接缝 / 导出面 / 守卫：\`motion.css\` **74** · \`index.ts\` **45** · \`style-seams.test.ts\` **271** · \`style-contract.test.ts\` **214** · \`motion-coverage.test.ts\` **147**` | `> - 接缝 / 导出面 / 守卫：\`motion.css\` **74** · \`index.ts\` **48** · \`style-seams.test.ts\` **288** · \`style-contract.test.ts\` **296** · \`motion-coverage.test.ts\` **147**`（**逐值按 T5/T9/T14 提交后的实测重写**；`motion.css` 若因 T5 删块而变化，也一并按实测写） |

- [ ] **Step 1: 逐条改**（改完立刻用 `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` 量 ① 的行数）
- [ ] **Step 2: 事实对拍**（② 的「代码是权威」必须现测一次：读 `shell/columnRegistry.ts` 的 `notes-outline` 行，断言 `pinnable: true`）
- [ ] **Step 3: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **行数不变**：`textBaseline.ts` 改后实测 == **297**（`ReadAllLines` 口径 + `node scripts/line-limits.mjs --full` exit 0） | **M1**：在 `:174` 前后**多加一行**注释 | **M1 后期望**：实测 **298** ⇒ 本任务的探针判据红（⚠️ 门禁**不会**红 —— 298 仍 ≤300 ⇒ **这正是本判据存在的理由**） |
| **V2** | **事实对拍（②③ 的依据）**：读 `app/src/shell/columnRegistry.ts`，`notes-outline` 那一行的 `pinnable` 值是 **`true`**；且该文件 `:16-18` 的注释含「笔记大纲列」 | **M2**：把 `columnRegistry.ts` 的 `notes-outline` 改成 `pinnable: false` | **M2 后期望**：勘误句的事实基础消失 ⇒ 探针红（⇒ 证明勘误不是照抄 `recon-b` 的结论，而是**当次实测**） |
| **V3** | **引用漂移同步**：`line-limit-exemptions.md:224` 的 5 个行数**逐个等于**当次实测（探针：对 5 个路径跑 `countLines()` 并在 `.md` 里 `toContain`） | **M3**：把 `style-contract.test.ts` 的登记值写回 214 | **M3 后期望**：探针红（**该块不在生成器视野内 ⇒ 只有这条探针守它**） |
| **V4** | `docs-check` exit 0（规格与 `line-limit-exemptions.md` 都是 active 文件；**加注不得引入失效相对链接**） | — | exit 0 + 五项全 ✅ |
| **V5** | `tsc --noEmit` 0 错（① 只改注释，但它是 `.ts` ⇒ 必须编译）· `vitest` 全绿 | — | exit 0 / exit 0 |

**提交信息**：`docs(spec): 更正 pinnable 取值与字号越界读数`（subject 18 字）

**诚实边界**：① ④ 是**裁决未点名**的改动（R6.10 把登记表相关项列为"非批 6"）—— 但 T5/T9/T14 **确实改了**其中的文件 ⇒ 人工引用块必须同步（规格 `:835` 逐字预警）⇒ **报告必须写明这一条不在授权清单内**；② ①②③ 三处**都是加注/单值更正，不改任何结论与表格结构**；③ `pinnable` 的**消费方缺口**本任务**只登记**（接线归波 C 的列折叠 Flip）。

---

## 陷阱（承批 1–5 的陷阱 + 本批专属，逐条入账）

> 承批 1–5 的 32+ 类陷阱**全部继续适用**（`## Global Constraints` 的「仪器纪律」「变异体与守卫纪律」「提交纪律」三节已把最常踩的收进去）。下面只列**本批专属**与**最容易在本批踩到**的那些。每条给：**现象 → 根因 → 处置**。

### B1 · 引擎与测试底座

1. **🔴 gsap 在 Vitest 下是「双实例」** —— 现象：`useGSAP()` **防不住** StrictMode 双 tween（裸 `useEffect` = 2 个 tween，`useGSAP()` **也是 2 个**），卸载后 `transform` 残留。根因：`gsap` 的 `exports["."]` 把 `import → index.js`（ESM）与 `require → dist/gsap.js`（CJS）分成**两个物理文件**，而 `@gsap/react@2.1.2` **没有 `exports`** 字段、`main` 指 CJS（内部 `require('gsap')`）⇒ Vitest external 后它拿到 **CJS 运行时**、app 拿到 **ESM 运行时**，两个 `_context` ⇒ `context.revert()` **静默空转、无任何警告**。**处置**：`app/src/motion/engine.ts` 顶层 `gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`（实测后 StrictMode = **1 个 tween**、卸载后 `transform=""`、tween 数 0）。**浏览器构建不受影响**（Vite 认 `module` 字段）—— **这是测试底座独有的坑**。
2. **`tl.to()` 返回 `Timeline` 本身，不是 `Tween`** —— 现象：`const tw = tl.to(...); tw.totalTime()` 拿到的是整条时间线的时间，用于「旧 tween 冻结」判据会**永远为真**（假绿）。**处置**：要拿 tween 句柄用 `tl.to(...).getChildren()` 或直接用 `gsap.to(...)`。
3. **🔴 绝不可把 jsdom 的 `performance` 挂到 `globalThis`** —— `jsdom` 的 `Performance-impl.js:14` **自调用** ⇒ **栈溢出**，整个测试进程挂掉（表现为"测试文件全灭"而不是"一条红"）。**处置**：harness 与用例都**不得**写 `globalThis.performance = …`；T10 V4 就是这条的机器判据。
4. **`gsap.updateRoot(t)` / `ticker.tick()` / `ticker.sleep()` / `await sleep()` 全都不能用作推进手段** —— 实测：`updateRoot` 会被漂移的 `globalTimeline._start` 偏移（0→0.105→0.199）；`ticker.tick()` 墙钟驱动、紧循环推进≈0；`ticker.sleep()` 只要被新建 tween 唤醒就立刻恢复墙钟推进（frame 0→1，100ms 后 `x=27.1`）；`await sleep(40)` 实测 `5.6 / 18`、另一处 `97 / 90.9`（不可复现）。**处置**：只用 `gsap.timeline({paused:true})` + `tl.time(t)`（`power2` tween 在 `tl.time(0.25)`（dur 0.5、x:0→100）⇒ `translate3d(87.5px,0px,0px)` **逐字精确**）。
5. **`gsap.matchMedia()` 在 jsdom 默认可抛** —— `TypeError: _win.matchMedia is not a function`（jsdom 30.0.1 **没有** `window.matchMedia`）。**处置**：生产代码**必须**自带 `typeof window.matchMedia !== "function"` 守卫；测试桩**必须**实现 `addListener`/`removeListener`（GSAP 走 legacy 分支，只实现 `addEventListener` **不会被调用**）。
6. **`gsap` 的插件**默认**静默退化** —— 未 `registerPlugin(CustomEase)` 时 `gsap.parseEase("自定义名")` 返回 `undefined`（只有一条 stderr 警告），动画**照跑**（走默认 ease）。**处置**：任何依赖自定义 ease 的判据**必须**先断 `typeof parseEase(name) === "function"`（T8 V2）。
7. **`Flip` 在 jsdom 里几何零可观测** —— `Flip.getState` 的 `bounds` **全 0**、改 `position/left/top` 后仍全 0、`Flip.from()` 返回**真 Timeline** 但位移增量**恒 `translate3d(0px,0px,0px)`**、`Flip.fit()` 退化成 `width:0px;height:0px`。**处置**：**不许**为 Flip 写几何验收用例（写了也是假绿）；只用「结构契约 + Flip 已注册 + timeline 存在 + 属性集合 ⊆ transform 族」的**弱判据** + headless/登记。
8. **`ScrollToPlugin` 的 `window` 目标不可用** —— 读数恒 0，且抛 `Not implemented: Window's scrollTo() method`。**处置**：判据收敛到**元素级** `scrollTop`/`scrollLeft`（实测可精确断言 0/52.5/90/120）。
9. **`ScrollToPlugin` 的滚动是"真实滚动"** ⇒ 观感面（平滑度/帧率）**不可判**；且滚动会触发 `scroll` 监听 ⇒ 与「页面保活挂载」（红线 2）交互时**可能**唤醒常驻页面。**处置**：波 B/C 接线时**先查**该滚动容器上有没有既有 `scroll` 监听。

### B2 · 判据与变异体

1. **可中断判据只看 `style.transform` 会假绿** —— GSAP 3 默认 `overwrite:false` ⇒ 覆盖同属性时**旧 tween 仍在跑**。**处置**：**双断言**（`globalTimeline.getChildren().length` 或旧 tween `totalTime()` 冻结 **且** `style.transform`）；T11 V1 就是这条的机器证明（**它的变异体故意让单断言版本假绿**）。
2. **`ran` 闸不可省** —— 没有它时「全绿」与「全红」都不可信（批 4 #30：`--cache.dir` 是 vitest 4 的废弃参数 ⇒ exit 1 且 **0 用例**，被误读成"判据集体失效"）。**处置**：harness 解析 `--reporter=json` 的 `testResults.length` 与 `numTotalTests`；`ran === false` ⇒ 输出「仪器异常」，**不判红也不判绿**。
3. **🔴 vitest 4.1.11 的 json reporter 没有 `numTotalTestFiles` 字段** —— 文件数**只能**用 `testResults.length`（本批派发书已点名；本计划者实测 `undefined`）。写 `expect(j.numTotalTestFiles).toBe(184)` 会**永远红**。
4. **`--reporter=basic` 在 Vitest 4 已移除** ⇒ 用它产出的是「伪装的红」= 假证明。**处置**：一律 `--reporter=json --outputFile=…`。
5. **「0 命中」必须先证仪器** —— 本轮实测教训：`git check-ignore <path>/`（**带斜杠**）报 exit 0 是**假阳性**（`.gitignore:48` 是空行）⇒ 判"是否被忽略"必须用**不带斜杠**的 `git check-ignore <path>`。**处置**：任何 0 命中结论附「阳性对照 + 无意义串对照」两个读数。
6. **文本扫描型判据会被注释骗过** —— 本仓已有 4+ 起实例。**处置**：先剥注释（正解先例 `ui/primitives/sliceScan.ts` 的 `stripComments`），且**保留行号**（朴素的 `stripComments` + `split('\n')` 会让行号漂移 —— `motion.css` 的 74 行会被读成 31 行）。
7. **`@vitest-environment jsdom` 是"全文件文本扫描"** —— 注释里写出这条指令串也会让它真按 jsdom 跑。**处置**：想断言"本文件运行在 node 环境"时，注释里**不要**出现完整指令串。
8. **变异体实验必须与全量测试串行** —— `KnowledgeGraphView.test.tsx` 是**负载敏感 flake**（批 3 复现过、批 4 判定"已加固、未复现"）⇒ 并发会让变异读数不可信。

### B3 · 包体与首屏

1. **装 GSAP 后首屏必须"构造性地不变"** —— 但**不要假设它自动成立**：`manualChunks` **只切文件、一字节不降**（`check-bundle-budget.mjs:205` 逐字），首屏下降**全部**来自 `import()` 切断静态边。**处置**：T4 的 ③″（`engine.ts` 不在 `main.tsx` 静态闭包内）是这条的机器闸。
2. **chunk 名不是稳定标识**（v0.22 `:549` 陷阱 #110）—— 判 chunk 增删必须用**模块级字面量归属**或**逐块字节闭合核算**；只比名字会同时产生**假 ADDED + 假 REMOVED**。**处置**：报告里的 chunk 台账逐块给「名字 + 字节 + 归属模块」。
3. **`Δ` 恰为 0 时先当仪器故障** —— 先自证仪器能测出已知差异，再下结论；**< ~2 kB 的 Δ 必须用同源真构建对比**（rollup 的 CSS 拼接顺序非确定性，批 4 实测同源两树差 9 B）。
4. **`--no-build` 在导出树必失败**（`dist` 不入库）⇒ 导出树内要跑预算守卫必须先在树内 build；T4 的 ①② 在导出树里**永不运行**（`### 表 4` S2 的已知代价）。

### B4 · token 与守卫

1. **`motion.css` 的 `:root{}` 删除要"只删块、不删邻居"** —— `:58-74` 的注释块（含「伪元素必须逐字列出」的 T11 评审 Critical 说明）与 reduced-motion 块**必须逐字保留**。**处置**：T5 Step 2 明确「只删 `:37-56`」，并在提交前 `git diff` 逐行核对（**只应有删除，不应有修改**）。
2. **删除后「删块即生效」依赖 19 处消费点的同值兜底字面量** —— 只要有一处写成 `var(--ed-dur-micro)`（无兜底），删块就会**静默改变行为**。**处置**：T5 V3（命中数相等）。
3. **`style-seams.test.ts:179` 与 `gen-tokens.test.mjs:114` 是同一个数字的两处落点** —— 只改一处会留下一颗哑弹。**处置**：`### 表 5` 已点名 #3；`pill` 的「真源 ↔ 唯一消费者」对拍由 T5 V4 补上。
4. **生成物永不手改** —— `tokens.css` / `tokens.gen.ts` 由 `renderAll()` 产出，手改会被 `tokens.drift.test.ts` 判失败。**处置**：每次改 `gen-tokens.mjs` 后**必须**跑 `node scripts/gen-tokens.mjs` 并**同提交**带上两个产物。
5. **`.mjs` 与 `.css` 不在行数门禁视野**（`SOURCE_EXT = /\.(ts|tsx|rs)$/`，实测）—— 所以 `gen-tokens.mjs` / `motion.css` **涨行不会被拦**。**处置**：只给预算、不设硬判据；若超 300，**如实登记为"门禁视野外"**，不要假装被守住，也不要为它们自造门禁。

### B5 · reduced-motion 与 `@keyframes` 桶

1. **🔴 新增 `.ed-*` 类名的形状是被既有守卫管住的** —— `motion-coverage.test.ts:113-124` 只放行四种形状：**含 `--`（修饰类）· 含 `__`（BEM 子元素）· `<既有基类>-…` · 是登记的 12 个基类之一**。⇒ 起一个**新基类名**（如 `.ed-env-pulse`）会当场红，而改 `:99` 的 `toHaveLength(12)` 属**清单外既有断言**。**处置**：本批新增的环境层落点**一律用 `<既有基类>--<修饰>` 形状**（`.ed-status--live-pulse` / `.ed-text--ink-4` / `.ed-surface--due-glow`）。
2. **`@keyframes` 只能进 `motion.css`** —— `Loading.css`（`Loading.test.tsx:177` 恰 2）、`Button.css`（`Button.test.tsx:268` 禁）、`StatusLine.css`（`StatusLine.test.tsx:244` + `statusLineRatchet.test.ts:167` 禁）**三个文件都禁止新增**；而 G5 逐字「桶边界不变」⇒ 新循环动效**只能**写进 `motion.css`。**处置**：T13 Step 1 + V1。
3. **`animation-duration` / `animation-iteration-count` 不是可继承属性** —— 覆盖写在宿主元素上，**伪元素拿不到**（headless Chromium `--force-prefers-reduced-motion` 实测：`.ed-skeleton` 元素是 `0.001s/1` ✅，而 `.ed-skeleton::after` 仍是 `1.2s / infinite` ❌）。**处置**：名单里**伪元素必须逐字列出**（G7 不动，照它加名单）。
4. **`app/src` 内只许一条 reduced-motion 块** —— 新增落点**不能**开第二块媒体查询，只能**加进同一块的名单**（G6 改判后名单可增长）。同理，**`@media (hover: hover)` 之类的新媒体查询块本批不引**。
5. **源序即优先级** —— §8.5 逐字「系统 `prefers-reduced-motion` **优先于档位**」在 CSS 里靠**后写覆盖**实现 ⇒ 档位块**必须在** reduced-motion 块**之前**；顺序写反 ⇒ 用户选的档位会**盖掉**系统无障碍设置（**违反 §8.6.1 第 4 条**）。**处置**：T6 的源序守卫 + T14 的 G6 ②。

### B6 · 本批特有的产品面陷阱

1. **🔴 「未确认段落墨度 2% 起伏」今天没有 DOM 落点** —— 两个候选挂点都是 0 生产调用点：`ink-4`（`Text` 的 tone，被 R6.2/批 4 裁决冻结在 0）与 `lowConfidenceClass()` 产出的 `ed-low-confidence`（本轮实测：**该函数只被它自己的测试引用**，且**全仓无对应 CSS 规则** —— 批 0-D Task 13 删掉了 `App.css` 的那条）。**处置**：T13 落 seam + **逐字登记 0 调用点**；**不许**把"落了 seam"说成"环境层第 ③ 件已交付"。
2. **「到期刻度」与「采集态 LIVE 仪表」今天连形态都不存在**（`recon-b` B4/B3 双侧自证）⇒ 签名动效 #3/#4 与相变两态**必须先建承载面**（波 B）。
3. **「时间码回跳」的第三轨素材（音频）可得性未知** ⇒ R5.5 的前置探针**判否即 STOP**，**不得造假播放头**。
4. **`[[ts:ms]]` 回链今天把 ms 用在 `title` 文案里、点击时丢弃 ms 只跳会话**（`NoteMarkdown.tsx`，**实测 266 行 ≠ recon-b 的 244**）⇒ 波 B 的「第一件事」就是把这个 ms 接上（**产品兑现点：每句话可追溯**）。
5. **列折叠 Flip 的物理前提今天不成立** —— 折叠是 `folded ? <ColumnBar width:26> : <面板 width={col.width}>` 的**条件渲染两棵不同子树**（**7 处页面同形**），宽度走**行内 style 且无 transition**、`ColumnBar.tsx` **39 行 0 处 transition** ⇒ **无共享元素可测差**。**处置**：R5.7 —— **先改结构（同一宿主 + 宽度变化）再上 Flip**；若结构代价超预算 ⇒ **STOP 报告 + 给出绿色方案实测**（不要两条都硬做）。
6. **`data-motion` / `data-tone` / `data-shell-phase` 在 `app/src` 今天全部 0 命中**（含 `documentElement` **0 命中**）⇒ 三者的**写入方都是本批新增**；`data-theme` 则**永不被写**（R2.5）⇒ 写 CSS 时**不要**用 `[data-theme]` 做前提。

### B7 · 棘轮与域

1. **六类棘轮的域 = `app/src/**` 减 `*.test.ts(x)` 减 `ui/primitives/**`（部分再减 `ui/icons/**`）** ⇒ **`app/src/motion/**` 与 `app/src/test/**` 的新生产文件都在域内**！⇒ 新代码里出现 `<button` / `#9ca3af` / `borderRadius: 6|12|14|999|2` / `border: 1px solid #e5e7eb` / `boxShadow:` / 三红 hex / 空态八词 / 加载文案 **⇒ 棘轮立刻红**。**处置**：每个新增生产文件的任务都跑一遍六条棘轮（本计划的每个任务节都写了这条）。
2. **`app/src/components/**` 的新组件不得渲染裸 `<button>`** —— `nativeButton.ratchet` 的 `FROZEN_NATIVE_BUTTON_BY_FILE`（114 键 / 和 393）会因为**新文件**红。**处置**：T7 复用 `ViewSwitcher` 原语（原语在排除域内）。
3. **`dialogMigration.e.test.ts` 恰 300 行（零余量）** ⇒ **禁止再碰**；它承载 `DIALOG_20` / `NON_MIGRATED_14` 两条硬守卫，且**登记为「不迁」的 14 个文件不得出现子串 `ui/primitives`**（`:252-253`）⇒ 波 A 一个都不碰它们（T12 的元素级 CSS **不改源码**，故不触这条守卫）。
4. **`style-contract.test.ts:219-236` 读 `motion.css` 当 token 真源** —— 这是 `### 表 5` 点名的清单外连带项 #1；**漏掉它 ⇒ T5 必红**。
5. **`docs/standards/` 的索引与 `docs/adr/` 的索引都是 `docs-check` 的判据面** —— 新增 `motion.md` / `ADR-035-*.md` 必须**同提交**加进行表（索引覆盖默认只 warn、`--strict` 才 exit 1 ⇒ 判据必须按**输出文本**判，不能只看 exit code）。
6. **仓库根的 `tmp/` 未被 gitignore** —— `git check-ignore tmp` = **exit 1**（⚠️ 带斜杠的 `git check-ignore tmp/` 报 exit 0 是**假阳性**）。本批已发生过一次事故（recon-b/recon-c 把探针写进根 `tmp/`）。**处置**：临时文件只写批次 `tmp/<unit>/`；**新建任何目录前先不带斜杠地 check-ignore**。

---

### B8 · 承前陷阱（`progress.md` §七 的 **P-1 – P-18** 逐条并入；出处已注明）

> 口径：P-1..P-18 是**本批已实测/已发生**的陷阱，**逐条并入本计划**（承批 1–5 的 32+ 类之外的本批专属面）。每条给「**现象 → 处置**」；**出处**列照 `progress.md` §七 原样。

| # | 现象（逐字要点） | 处置 | 出处 |
|---|---|---|---|
| **P-1** | 🔴 **`grep` 工具（ripgrep）对 `.superpowers/**` 返回假 0 命中** —— ripgrep 尊重 `.gitignore`，而 `.gitignore:29` = `.superpowers/` | 台账文件一律用 **node 直读**；派发指令里禁止用 `grep` 工具搜 `.superpowers/` | PB1 |
| **P-2** | 🔴 **`git check-ignore <path>/`（带结尾斜杠）返回假阳性 exit 0** | 一律用**不带斜杠**的路径；新建目录前先验 | recon-c/recon-b 的 `tmp/` 事故 + 控制方自核 |
| **P-3** | 🔴 **`gsap` 双实例** ⇒ `useGSAP()` **防不住 React 19 StrictMode 双 tween**（`@gsap/react` 无 `exports`、`main` 指 UMD ⇒ Vitest external 后拿到 CJS 实例，`context.revert()` **静默空转**） | 全仓唯一入口 `motion/engine.ts` 顶层 `registerPlugin(useGSAP, …)`（`## 陷阱` #B1-① 详述） | spike S3 |
| **P-4** | `gsap.timeline().to()` 返回 **Timeline 本身**，不是 Tween | 要 tween 用 `getChildren()` / `gsap.to`（`## 陷阱` #B1-②） | spike S2 |
| **P-5** | **不可把 jsdom 的 `performance` 挂到 `globalThis`**（`Performance-impl.js:14` 自调用 ⇒ 栈溢出） | 只挂 `window`/`document`/`navigator`/rAF/cAF/getComputedStyle | spike S2 |
| **P-6** | 确定性推进的**假正解**：`gsap.updateRoot(t)`（被漂移的 `_start` 偏移）· `ticker.tick()`（墙钟）· `ticker.sleep()`（新建 tween 会同步唤醒）· `await sleep()` | 只用 `gsap.timeline({paused:true})` + `tl.time(t)`（R8.1） | spike S2 |
| **P-7** | **可中断判据只看 `style.transform` 会假绿**（GSAP 3 默认 `overwrite:false` ⇒ 旧 tween 仍在跑） | **双断言**：tween 计数 + 属性值（R8.2 / T11 V1） | spike S2 |
| **P-8** | **jsdom 无 `window.matchMedia`**；`gsap.matchMedia().add()` 抛 `TypeError`；桩**必须**实现 `addListener`/`removeListener`（GSAP 走 legacy 分支） | hook 自带守卫；桩按 legacy 形态写（T10 V2） | spike S2/S4 |
| **P-9** | **vitest 4.1.11 无 `numTotalTestFiles` 字段** | 文件数用 `testResults.length` | recon-c C3 |
| **P-10** | **Flip 在 jsdom 几何零可观测**（bounds 全 0、位移恒 `translate3d(0px,0px,0px)`）；**`window` 级 `scrollTo` 不可用**（元素级可用且精确） | 只写弱判据 + 逐字登记（T33 V8 / T25 V1） | spike S2 |
| **P-11** | **装 gsap 即顶红 `manualChunks.test.ts:272`**（设计如此，自带正解指引） | 按指引修（G8 / T3 Step 3） | recon-a A9 · recon-c C5 |
| **P-12** | **`style-seams.test.ts:179` 的「motion.css `--ed-*` 总数恒等 10」** 会在真源迁移后必红 | G4 改判为 0（T5 Step 4） | recon-a A9 |
| **P-13** | **PS 5.1 会吞内联 `node -e` 的引号/正则**（PB1 本轮触发 2 次 ParserError，非被测代码问题） | 一律先落 `.mjs` 再跑 | PB1 |
| **P-14** | **正对照必须在「应命中的样本」上真命中**，否则主仓的「0 命中」一文不值（PB1 首轮自己的对照样本写错导致假 0） | 每条 0 命中判据自带正/负对照 | PB1 |
| **P-15** | 🔴 **asset protocol 的 `Accept-Ranges` 只在「请求带 `Range`」的分支里加**；**不带 Range 的 200 分支会把整个文件读进内存**（`asset.rs:217-219` `Vec::with_capacity(len)` + `read_to_end`） | 前端**禁止** `fetch()` 音频，只许 `<audio src>`；**加守卫**（T25 V6） | 音频运行时探针 |
| **P-16** | 🔴 **只有已 finalize 的会话 WAV 可播**（data 长度创建时写 0，唯一回填点是 `finalize()`） | 录制中禁用播放并如实提示（`StatusLine`，**非 toast**）（T25 V5） | 同上 |
| **P-17** | 🔴 **`segments[].start_ms` 今天**不能**直接当 `currentTime`** —— WAV 轴 = 已写样本数÷16000 纯追加无静音填充，而 `start_ms` 走墙钟 − `total_paused_ms`；**静默窗根本不产包（D2，无上界）** ⇒ 必然分叉；`samples_written` 私有无 getter 未序列化 | R5.5-b：后端采「补静音使 WAV 轴 ≡ 会话轴」+ 纯函数化 + 失效安全 + `aligned` 自证量；历史录音如实降级（**T23 整节**） | 同上 |
| **P-18** | **asset URL 形态 = `http://asset.localhost/<encodeURIComponent(绝对路径)>`**（`use_https_scheme: false`），与 CSP `media-src` 精确对上 ⇒ 零 CSP/scope 改动 | 计划里写死这一形态，别用 `asset://` 猜（T22/T24 的接口注释） | 同上 |

### B9 · 本批 P2 新增陷阱（本单元实测／实测推导，逐条入账）

1. 🔴 **「标签不许说谎」要管到 UI 文案** —— `probe-audio-availability` 顺带④逐字指出 `NoteMarkdown.tsx` 的 `title` 自称「点击查看视频对应片段」而实现只跳会话；同族问题在本批会再出现两处：① 历史录音的 `aligned === false` **不等于**「未对齐」（**是"无时间基准、不能保证"**）⇒ UI 文案必须是「无时间基准，定位为近似」，**不得**写「未对齐」；② `--ed-nav-h-live` 的 58px 若被写成 `var(--ed-nav-h, 56px)`（T18 V4 的变异体）会**静默退回 56px** —— 它不会报错、只会"看起来对"。**处置**：凡"如实提示"一律写成**可判据的文案串**（T25 V4 / T18 V4）。
2. 🔴 **两个动效抢同一属性 = 静默假绿** —— R11.3 的低置信墨度（CSS `animation` 动 `opacity`）与 T28 的显影（GSAP 内联 `transform`）**落在同一个元素**上；若显影顺手也动 `opacity`，`style` 行内优先 ⇒ **CSS 动画的观感被吃掉**，而两条判据**各自都会绿**。**处置**：T28 V7 的"属性互不覆盖"判据（**这类冲突在本批至少还有两处**：Modal/Toast 的 `presence` 与 GSAP 的进出场、`motion.css` 的响应层 `transition` 与 GSAP 写的同属性值 —— `motion.css:29-34` 的边界⑤逐字已给出机理）。
3. **`.css` 的累积追加会撞"≤300 自律"** —— `motion.css` 要过 T5/T6/T12/T13/T19/T29 **六次**追加；门禁**看不见** `.css`（R11.8 第 1 条）⇒ 它是**无护栏**的长跑。**处置**：T29 明写拆文件路径（`motion.phase.css`）+ 该守卫的 `readdirSync(HERE).filter(.css)` 会**自动纳入**新 CSS（`motion-coverage.test.ts:33` 实测）。
4. **`App.tsx`（590）是硬限前的高危文件** —— 它今天 590 行，`>600` 零容忍；相位通道的接线**每多一行都在逼近红线**。**处置**：T17 取「相位由页面自写」的备选方案，`App.tsx` **净增 ≤8 行**并有 V5 的净增行数判据（**先例：批 3 T5 的"阈值改判 ⇒ 测试底座连带"同族，都是"改动落在别人以为安全的地方"**）。
5. **同一个函数名的两处真源断言会分叉** —— G9（`tokens.drift.test.ts:52`）与 G14（`gen-tokens.test.mjs:114`）是 `radiusScale` 的**两处独立钉值**（R11.8 第 5 条）⇒ 只改一处会留下一颗哑弹。**处置**：T5 必须**同任务同提交**处理两处（`### 表 5` #3 的 G 号列已改正）。
6. **裁决里的数字会过期** —— 本轮实测撞到两处：① R5.7 说「**7 处**页面同形」，本计划者实测 **8 处** ColumnBar 渲染点；② R5.5-b 说 `audio_store.rs`「**213 行**」，本计划者实测 **212**；③ `recon-a` A2 的「全仓 `58px` 0 命中」在本计划者的仪器下是 **2 命中**（`SelectionActionMenu.test.tsx:51/56` 的 `258px` 子串）。⇒ **处置**：以**代码为本轮实测**为准 + 逐条登记到 `## 待裁决清单`，**不得**为了对齐裁决而改代码或改计划里的读数。
7. **`motion-coverage.test.ts` 的 `NON_PRIMITIVE_ED_NAMES` 是一个"会过期的排除名单"** —— 它把 `ed-low-confidence` 等 5 个名字排除在"选择器域"之外，而 `:126-129` 的失败信息**逐字自带改判指引**（「真成了 CSS 类就该从排除名单摘掉」）。⇒ **本批的正确路线是"不撞它"**（R11.3 的落点取 `--` 形状 ⇒ 零改动）；若实施者选择撞它（用 `ed-low-confidence` 作类名）⇒ 需 **G16 级授权**（三处改动：`BASE_CLASSES` 12→13 / `NON_PRIMITIVE_ED_NAMES` 5→4 / `:99` 与 `:127` 的长度）⇒ **STOP 请裁**。
8. **`views/**` 的零 `@tauri-apps` 边界（A3③）会拦住"最自然的写法"** —— 播放头最自然的实现是"视图里 `invoke` + `convertFileSrc`"，但 `architecture.guard.test.ts:166-168` **含 `import type`** 全禁。⇒ **处置**：T24 的注入槽（与 `imageUrl` 同构）是**唯一**正解；**不要**为了省一层而放宽这条既有断言。

---

## 波 B · 承载面（T17–T26）

> **本节由 P2 续写单元定稿**。覆盖 **R4.1–R4.5** 与 **R5.4 / R5.5 / R5.5-b** 的三条探针回收裁决（PB1 `probe-audio-availability.md`(545) · PB2 `probe-fsrs-interval.md`(500) · `probe-audio-runtime.md`(405)）。**波内可并行见 `## 波次总表` 的单写者约束**。
> 🔴 **本波的两条前置探针已由控制方跑完并回收**（PB1 判「是」⇒ 不 STOP、走真实音频；PB2 判「走 (b) 加只读字段」⇒ 不走 STOP、不自造）⇒ **本波不再有"探针判否即 STOP"的分支**，改为**按探针回收裁决执行**（R5.4 的 PB2 段 + R5.5 的 PB1/PB5-b 段）。
> 🔴 **本波必须重跑 `cargo test --test app_lib_tests`**（本批动 Rust，R0.1 第 1 条 / R8.9）并给逐字读数（基线：`running 2306 tests` ⇒ `2300 passed; 0 failed; 6 ignored`）。
> ⚠️ **`NON_MIGRATED_14` 命中项**：本波唯一落进该清单的文件是 **`app/src/components/CaptureOverlayPanel.tsx`（164，在清单内）** ⇒ **本波对它零改动**（`dialogMigration.e.test.ts:252-253` 还要求清单内文件**不得出现子串 `ui/primitives`**）⇒ LIVE 仪表**一律新建**（`shell/LiveBar.tsx` + `components/Waveform.tsx`），**不改** `CaptureOverlayPanel` / `AudioLevelMeter`（R4.3 的「优先新建」逐字）。

---

### Task 17: 相变态通道 `data-shell-phase` + `--ed-nav-h-live: 58px`

> **依据**：R4.1（`--ed-nav-h` **保持 56px 不动**，新增 `--ed-nav-h-live: 58px`）· R4.4（相变态通道 `data-shell-phase="capture|review|idle"`）· R3.1 的同族先例（`data-motion` 写 `<html>`）· R11.8 第 4 条（`documentElement` 今天 **0 命中** ⇒ 全新能力）。

**目标**：新建 `app/src/shell/shellPhase.ts`（三纯函数 + 一个 hook，照 `motion/intensity.ts` 的形态）承载 **`data-shell-phase`**；在 `gen-tokens.mjs` 的真源里加 **`navHeightLive: 58`** ⇒ `tokens.css` 出 `--ed-nav-h-live: 58px`；在 `App.tsx` 的 `MainShell` 里接线（**净增 ≤8 行**）。

**🔴 R4.1 的可执行性（本计划者用两个正则逐字复核，实测可判）**：`shell/navHeight.consumption.test.ts` 的三条判据对 `--ed-nav-h-live` **天然免疫** —— ① `FALLBACK_PX = /var\(\s*--ed-nav-h\s*,\s*(\d+)px\s*\)/g`（`:90`）与 `FALLBACK_ANY = /var\(\s*--ed-nav-h\s*,/g`（`:92`）都要求在 `--ed-nav-h` 之后**紧跟逗号**，而 `var(--ed-nav-h-live, 58px)` 在此处是 `-live` ⇒ **不匹配**；② `TOKEN_DECL = /--ed-nav-h\s*:\s*(\d+)px/`（`:94`）同样不匹配 `--ed-nav-h-live:`；③ `FORBIDDEN = [/height:\s*56\b/, /top:\s*56\b/, /100vh\s*-\s*56px/]`（`:36`）与 `58` 无关。⇒ **`navHeight.consumption.test.ts` 零改动、仍全绿**（复现命令：`cd app; npx vitest run src/shell/navHeight.consumption.test.ts`）。
> ⚠️ **前提**：`tokens.css` 里 `--ed-nav-h` 的声明**必须排在** `--ed-nav-h-live` **之前**（否则 `TOKEN_DECL` 的**首个**匹配可能落在别处；本计划者的复核显示两者不可能互相匹配，但**顺序是零成本的保险**）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/shell/shellPhase.ts` | **不存在（新建）** | — | 否 | 新建，预算 **≤70**；⚠️ 在六类棘轮域内（`app/src/shell/**`）⇒ 0 处 `<button` / 裸色值 / 裸圆角 / `boxShadow` / 空态词 / 加载词 |
| `app/src/shell/shellPhase.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**（纯函数 + 注入宿主元素），预算 **≤180** |
| `app/scripts/gen-tokens.mjs` | **269** | 否（`.mjs` 不在门禁视野） | 否 | `SCALE_SOURCE` 加 `navHeightLive: 58` + `renderCss` 加 1 行（预算 ≤330） |
| `app/src/ui/tokens.css`（生成物） | **100** | 否 | 否 | 重生成（+1 行） |
| `app/src/ui/tokens.gen.ts`（生成物） | **61** | 否 | 否 | 重生成 |
| **`app/src/App.tsx`** | **590** | ⚠️ **是**（余 **10**） | 否 | 🔴 **硬限 600**（`>600` 零容忍）⇒ **净增 ≤8 行**；只加「读相位 + 两个属性」的接线，**不得**顺手重构 `MainShell` |
| `app/src/shell/navHeight.consumption.test.ts` | **165** | 否 | 否 | 🔴 **零改动**（R4.1 的验收就是「它零改动仍绿」；G10 不动） |

**Interfaces:**
- Produces（**冻结快照**，被 T18/T19/T29 与波 C 消费）：
  ```ts
  export const SHELL_PHASES = ["idle", "capture", "review"] as const;
  export type ShellPhase = (typeof SHELL_PHASES)[number];
  /** 逐字：capture|review|idle（规格 §6.3） */
  export const SHELL_PHASE_ATTR = "data-shell-phase";
  export function applyShellPhase(phase: ShellPhase, el?: HTMLElement | null): void;
  export function useShellPhase(phase: ShellPhase): void;   // 挂载/变更时写 <html>，卸载时清回 "idle"
  export function readShellPhase(el?: HTMLElement | null): ShellPhase | null;
  ```
  ⚠️ 与 T6 的 `applyIntensity` **同款三处降级**：无 `document` / 无 `el` / 非法值 ⇒ 静默不动、不抛（node 环境下 `useShellPhase` 必须可调用）。

- [ ] **Step 0: 开工自证**（`git status --porcelain` 期望仅 `?? docs/tech-debt/`；`node scripts/line-limits.mjs --full` exit 0）
- [ ] **Step 1: token 真源 + 重生成**（`gen-tokens.mjs` 的 `SCALE_SOURCE` 加 `navHeightLive`；`node scripts/gen-tokens.mjs`；**两个产物同提交**）
  ⚠️ **`--ed-nav-h` 的声明必须仍排在 `--ed-nav-h-live` 之前**；值 **56 一字不改**（R4.1 逐字）。
- [ ] **Step 2: `shellPhase.ts`**（`@ai-context` 写清：Why = §6.3 的三态是**壳层级**的相变，CSS 侧要一条选择器就能改 chrome 形态；副作用 = 写 `<html data-shell-phase>`；边界 = 三处降级 + **卸载清回 `idle`**（否则切页后壳层停在 review 态 = 零 chrome 卡死））
- [ ] **Step 3: `shellPhase.test.ts`**（node 环境；用一个注入的 stub 元素断言 `applyShellPhase` 写真属性、非法值不动、`readShellPhase` 往返一致）
- [ ] **Step 4: `App.tsx` 接线**（`MainShell` 里：`useShellPhase(phase)`，`phase` 由既有状态派生 —— **采集态**取既有的采集进行中布尔、**复习态**取「复习会话进行中」布尔；**不得新增 state、不得新增 effect**，只在既有渲染路径上加 ≤8 行）
  ⚠️ **复习态的判定源**：`pages/ReviewPage.tsx` 的 `session` 是**页面内 state**（`App.tsx` 看不见）⇒ **接线形态**：`ReviewPage` 把一个**可选回调** `onSessionPhaseChange?: (active: boolean) => void` 上抛，`App.tsx` 收进一个既有 state 位；**若 `App.tsx` 因此超 8 行 ⇒ STOP**（备选：把相位写入下沉到 `ReviewPage` 内部的 `useShellPhase(...)` 调用 —— 页面自己知道相位，**零 App.tsx 改动** ⇒ **本计划取这个备选**：`ReviewPage` 与采集面板各自 `useShellPhase`，`App.tsx` **只加 1 行 `useShellPhase("idle")` 兜底默认值**）
- [ ] **Step 5: 八门禁 + 两个提交**（token / 通道+接线）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **token 落值**：`tokens.css` 含 `--ed-nav-h: 56px;` **与** `--ed-nav-h-live: 58px;`（两句同时存在、56 未变） | **M1**：把真源的 `navHeightLive` 改成 `60` 并重生成；**M1b**：把 `navHeight` 改成 `58` | **M1 后期望**：`--ed-nav-h-live: 58px` 缺失 ⇒ 红；**M1b 后期望**：`navHeight.consumption.test.ts` 的 `:142-152` 兜底绑定判据红（**证明 56 是被真源绑住的**） |
| **V2** | **`navHeight.consumption.test.ts` 零改动仍绿**（`git diff --numstat -- app/src/shell/navHeight.consumption.test.ts` **空** + 该文件 exit 0） | —（**这是 R4.1 的验收本体**；反向变异见 V1b 的 M1b） | 空 diff + exit 0 |
| **V3** | **相位写入真属性**：jsdom 下 `applyShellPhase("review", el)` ⇒ `el.getAttribute("data-shell-phase") === "review"`；`SHELL_PHASES` 恰 `["idle","capture","review"]`；**node** 环境下不传 `el` 且无 `document` ⇒ 不抛 | **M3**：把属性名写成 `data-phase`；**M3b**：把 `SHELL_PHASES` 改成 `["idle","capture","review","live"]` 而不加 CSS/判据 | **M3 后期望**：`data-shell-phase` 为 `null` ⇒ 红；**M3b 后期望**：T6 V7 式的「三处集合闭合」判据红（本任务**必须**加这条：`SHELL_PHASES` 的取值集合 == `motion.css` 里 `[data-shell-phase="…"]` 的取值集合） |
| **V4** | **卸载清回**：`unmount()` 后 `el.getAttribute("data-shell-phase")` 为 `"idle"`（**不是**残留 `"review"`） | **M4**：把 cleanup 里的清回删掉 | **M4 后期望**：残留 `"review"` ⇒ 红（**这条防「切走后壳层永久零 chrome」**） |
| **V5** | **`App.tsx` ≤600**：`[System.IO.File]::ReadAllLines(...).Count ≤ 600`，且 `line-limits --full` exit 0；`git diff --numstat -- app/src/App.tsx` 的**新增行 ≤8** | **M5**：往 `MainShell` 里加 12 行 | **M5 后期望**：净增 12 > 8 ⇒ 本判据红（⚠️ 600 硬限**未必**因此破 ⇒ **这正是本判据存在的理由**） |
| **V6** | `line-limits --full` exit 0 · `docs-check` exit 0 · `tsc --noEmit` 0 错 · `vitest run` 全绿（**既有 1770 用例一条不少**）· `check-command-registry` **312/312/0**（本任务不动 Rust）· 六类棘轮全绿 | —（门禁类） | 全绿 |

**提交信息**：① `feat(tokens): 新增采集态顶栏高度 token`（subject 17 字）② `feat(shell): 落壳层相变态通道`（subject 13 字）

**诚实边界**：① 「相位是否真的**切对了**」在 jsdom 里只能判**属性与集合**，判不了「采集时顶栏真的变 58px」（jsdom 不做样式级联、`getComputedStyle` 拿不到生效值）⇒ **像素面进 `## 诚实边界`**；② `useShellPhase` 是**文档级副作用**（写 `<html>`），与「页面保活挂载」（红线 2）无冲突，但**多窗口变体（`?float=1` / `?overlay=1`）各自独立** —— 与 T6 的 `data-motion` 同款限制，**本批不处理跨窗口同步**（登记）；③ 本任务**不建 LIVE 仪表**（归 T18）、**不写相位 CSS**（归 T19）⇒ 本任务结束时 `data-shell-phase` **有写入方、无消费方**（CSS 规则尚不存在）—— 这是**有意的两步**（先通道后样式），报告须逐字写明，**不得**声称「相变两态已交付」。

---

### Task 18: 采集态 LIVE 仪表（`Waveform` + `LiveBar`）

> **依据**：R4.3 逐字「采集态**波形**用 **div 条阵列**建，**禁止 SVG**（`no-inline-svg.test.ts` 明禁内联 SVG）；今天只有 `AudioLevelMeter.tsx`(88) 的 12 段离散色块，全仓 `波形|waveform` **0 命中**」· §6.3 逐字「采集态 = 58px **LIVE 仪表（波形 + 计时 + 暂停/标记/停止）**」· R4.3 的 ⚠️「改 `AudioLevelMeter` 的 DOM 会**动三处棘轮台账**（`statusLineBaseline` 3 / `surfaceBaseline` 1 / `textBaseline` 3）⇒ **优先新建** `Waveform` 而不改既有组件的 DOM」。

**目标**：新建 `app/src/components/Waveform.tsx`（**div 条阵列**，`live:audio-level` 驱动的滚动波形）+ `app/src/shell/LiveBar.tsx`（58px，波形 + 计时 + 暂停/标记/停止四件）与各测试；**不改** `AudioLevelMeter.tsx`、**不改** `CaptureOverlayPanel.tsx`（**在 `NON_MIGRATED_14` 内**）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/Waveform.tsx` | **不存在（新建）** | — | 否 | 新建，预算 **≤150**（R4.3 逐字）；⚠️ `app/src/components/**` **在 `nativeButton.ratchet` 域内** ⇒ 🔴 **不得渲染裸 `<button>`**（`FROZEN_NATIVE_BUTTON_BY_FILE` 114 键/和 393 会因**新文件**红）⇒ 波形本身**零交互**（纯展示），按钮全在 `LiveBar` |
| `app/src/components/Waveform.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `app/src/shell/LiveBar.tsx` | **不存在（新建）** | — | 否 | 新建，预算 **≤150**；滞止条数 ≤ 58px 高（**行内 style 只用于布局**，ADR-033 §4） |
| `app/src/shell/LiveBar.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤220** |
| `app/src/components/AudioLevelMeter.tsx` | **88** | 否 | 否 | 🔴 **零改动**（**动它会连带三处棘轮台账**，R4.3 逐字） |
| `app/src/components/CaptureOverlayPanel.tsx` | **164** | 否 | 🔴 **是（在 `NON_MIGRATED_14` 内）** | 🔴 **零改动** |
| `app/src/components/LiveActivityPanel.tsx` | **513** | 否（>300 已登记豁免） | 否 | 🔴 **零改动**（R5.2 逐字：改它的模板会动三处棘轮台账 + 它已登记 301–600 档） |

**Interfaces:**
- Consumes：T17 的 `ShellPhase`；IPC 事件 `live:audio-level`，载荷 `{ rms: number; clipping: boolean }`（`components/AudioLevelMeter.tsx:19-22` 逐字，后端每 200ms 一块）
- Produces（**冻结快照**）：
  ```tsx
  // components/Waveform.tsx —— 纯展示：div 条阵列（禁 SVG）
  export interface WaveformProps { readonly rms: number; readonly clipping: boolean;
    readonly bars?: number; readonly height?: number; readonly testId?: string; }
  export default function Waveform(props: WaveformProps): ReactElement;
  // shell/LiveBar.tsx —— 58px 仪表：波形 + 计时 + 暂停/标记/停止
  export interface LiveBarProps { readonly elapsedMs: number; readonly paused: boolean;
    readonly onTogglePause: () => void; readonly onMark: () => void; readonly onStop: () => void; }
  export default function LiveBar(props: LiveBarProps): ReactElement;
  ```
- ⚠️ **`LiveBar` 的三个回调由容器注入**（`App.tsx` 或 `ClassroomPage` 的既有采集控制通道）⇒ **本任务不新建 IPC**。**若注入点需要改 `App.tsx` / `pages/ClassroomPage.tsx`（281）超过 ≤10 行 ⇒ STOP 报控制方**（`App.tsx` 余量只剩 10 行，T17 已用掉一部分）。

- [ ] **Step 1: `Waveform.tsx`**（`@ai-context` 写清：Why div 条阵列 = `no-inline-svg.test.ts` 明禁内联 SVG（该守卫是**全文件文本扫描**型 ⇒ **注释与测试名里提到 `<svg` 必须用拼接写法** `"<" + "svg"`）；副作用 = 无（纯受控件，**不订阅事件**）；边界 = `rms` 越界夹取、`bars ≤ 0` 时不渲染条）
- [ ] **Step 2: `Waveform.test.tsx`**（三条：条数 == `bars`；`clipping` 时末两段取 `--ed-stamp` 族类名（**零颜色字面量**，受 `style-seams.test.ts:238` 约束）；`rms` 变化 ⇒ 点亮的条数单调不减）
- [ ] **Step 3: `LiveBar.tsx`**（58px：`height: var(--ed-nav-h-live, 58px)`；波形 + `fmtMs(elapsedMs)` 计时（**经 `utils/fmt.ts` 的唯一出口**）+ 暂停/标记/停止三键；🔴 **按钮一律经 L1 原语 `Button`**（`shell/**` **不在** `nativeButton.ratchet` 的排除域内 ⇒ 裸 `<button>` 会加计数）
- [ ] **Step 4: `LiveBar.test.tsx`**（三条：高度走 `var(--ed-nav-h-live, 58px)`；三键各自的 `onClick` 各被调用一次；`paused` 时暂停键的 `aria-pressed` 为 `true`）
- [ ] **Step 5: 接线**（`LiveBar` 在采集相位下渲染 —— **由 T19 的相位 CSS 决定显隐**，本任务只保证「渲染即 58px」；⚠️ **若接线要动 `App.tsx` > 8 行 ⇒ STOP**，改用 `pages/ClassroomPage.tsx` 侧渲染）
- [ ] **Step 6: 八门禁 + 两个提交**（Waveform / LiveBar）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **div 条阵列（禁 SVG）**：`Waveform.tsx` 渲染出的根元素 `querySelectorAll("svg").length === 0` **且** 条元素是 `div`（`tagName === "DIV"`）**且** 条数 == `bars`；**同时**跑 `src/ui/icons/no-inline-svg.test.ts` 必须绿 | **M1**：把一条条换成 `<svg>` | **M1 后期望**：① `no-inline-svg.test.ts` 红；② V1 的 `querySelectorAll("svg")` 非 0 ⇒ 红（**两条独立红**） |
| **V2** | **条数与点亮单调**：`rms` 从 `0.01` → `0.3` 单调增时，点亮条数**单调不减**；`rms = 0` ⇒ 点亮 0 条（**双断言**：条数 + 类名集合） | **M2**：把映射里的 `Math.round` 换成 `Math.floor` 并放大系数 10× | **M2 后期望**：单调性破（中段平台跳变）⇒ 红 |
| **V3** | **零颜色字面量**：`Waveform.tsx` 与 `LiveBar.tsx` 剥注释后 `#` + 3/6 位 hex **0 命中**，颜色一律 `var(--ed-*)` | **M3**：写 `background: "#0d9488"` | **M3 后期望**：命中 1 ⇒ 红（与 `style-seams.test.ts:238` 同向） |
| **V4** | **58px 走新 token**：`LiveBar` 的根元素 `style.height === "var(--ed-nav-h-live, 58px)"`（**逐字**）；且 `motion.css`/`LiveBar` 里**不出现**裸 `56`（`FORBIDDEN` 同款三条正则） | **M4**：改成 `var(--ed-nav-h, 56px)` | **M4 后期望**：V4 红 **且** T17 V2 的「`navHeight.consumption.test.ts` 零改动」仍绿 ⇒ **说明这条是本任务自己的判据、不是别人的**；报告必须给这两个读数 |
| **V5** | **棘轮未加计数**：`nativeButton.ratchet.test.ts` 全绿，`FROZEN_NATIVE_BUTTON_TOTAL` 仍 **393**、键数仍 **114**；`textRatchet` / `surfaceRatchet` / `statusLineRatchet` / `emptyStateRatchet` / `loadingRatchet` 五条全绿 | **M5**：在 `LiveBar.tsx` 里把三个键改成裸 `<button>` | **M5 后期望**：红并报出新文件路径（**证明域谓词覆盖 `shell/**` 与 `components/**`**） |
| **V6** | **既有组件零改动**：`git diff --numstat -- app/src/components/AudioLevelMeter.tsx app/src/components/CaptureOverlayPanel.tsx app/src/components/LiveActivityPanel.tsx` **空**（R4.3 的「优先新建」验收） | — | 空 diff |
| **V7** | `line-limits --full` exit 0（四个新文件全 ≤300）· `tsc` 0 错 · `vitest` 全绿（用例只增不减） | — | exit 0 |

**提交信息**：① `feat(motion): 新建波形组件（div 条阵列）`（subject 18 字）② `feat(shell): 落采集态 LIVE 仪表条`（subject 15 字）

**诚实边界**：① **「波形看起来像波形」不可机器判据**（jsdom 无排版、无合成器）⇒ 本任务只判**条数 / 单调性 / 类名 / 高度 / 零色值**；观感面进 `## 诚实边界`（headless 抽检可做但**不得**升格为判据）；② **与 `AudioLevelMeter` 的关系是"并存"不是"替换"** —— 本任务结束时既有 VU 条**仍在**（它挂在 `LiveActivityPanel` 里），**新建**的 LIVE 仪表条是采集相位的顶栏形态；「谁在什么相位显示」由 T19 的相位 CSS 决定 ⇒ **本任务不删任何既有 UI**（红线 3「不砍任何已接线功能」）；③ `elapsedMs` 的**时间源**（墙钟 vs 后端事件）本任务**不引入**（由容器注入）⇒ 真正的「计时」精度不在本任务判据内；④ **`LiveBar` 不订阅 `live:audio-level`**（订阅在容器侧或 `LiveBar` 内部由容器注入的 `rms`）—— **订阅形态二选一，实施者必须在报告的 `@ai-context` 里写清选了哪个及理由**；⚠️ 若选「`LiveBar` 内部订阅」，**必须**照 `AudioLevelMeter.tsx:50-56` 的 `unlisten` 清理范式（`void unlisten.then((fn) => fn())`）。

---

### Task 19: 复习态零 chrome + 相变交叉淡入（**不 animate height** = 硬判据）

> **依据**：§6.3 逐字「复习态 = **零 chrome** / 域导航**隐藏** / **单列，卡片居中 640**」· §8.4 逐字「**相变 chrome 用绝对定位交叉淡入，不 animate height**」· R4.4 逐字「这是**硬判据**：守卫断言相变容器**不含** `height` transition/animate」· R4.2 的 G1/G2 改判由 **T14** 落地（本任务只消费其结果）。

**目标**：在 `motion.css` 追加**相位块**（`html[data-shell-phase="…"] .ed-topbar { … }` 等；**必须写在档位块之后、reduced-motion 块之前**，源序见 T6/R3.1）与**交叉淡入**规则（`position: absolute` + `opacity` + `transition: opacity`）；把相位选择器加进唯一的 reduced-motion 名单；新建守卫 `app/src/shell/shellPhase.guard.test.ts`。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/ui/primitives/motion.css` | T13 后 ~300（**预算上限**） | 否（`.css` 不在门禁视野；⚠️ **仍按 ≤300 自律**，R11.8 第 1 条） | 否 | 加相位块 + 交叉淡入（**+≤40 行**）；⚠️ **写者队列 T13 → T19 → T29** |
| `app/src/shell/TopBar.css` | **142** | 否（余 158） | 否 | **只加相位相关的一处**（若相位规则全放 `motion.css` ⇒ 本文件**零改动** 是允许的；两者**不得重复定义**） |
| `app/src/shell/shellPhase.guard.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**（纯文本判定），预算 **≤160** |
| `app/src/ui/primitives/motion-coverage.test.ts` | T13 后 ~200 | 否（余 ~100） | 否 | 名单增长（相位选择器**不含** `animation:` ⇒ G7 不强制；但 reduced-motion 名单**仍须逐字列出**，见 Step 3） |
| `app/src/pages/ReviewPage.tsx` | **231** | 否（余 69） | 否 | 只加 `useShellPhase(session ? "review" : "idle")` **1 行**（T17 Step 4 的备选方案） |

- [ ] **Step 1: 相位块**（`motion.css`；**源序 = 档位块 → 相位块 → reduced-motion 块**）
  ```css
  /* ★ 相变态（规格 §6.3 + §8.4）。三种相位：常态 / 采集 / 复习。
     🔴 交叉淡入用绝对定位 + opacity —— **绝不 animate height**（§8.4 逐字）。 */
  html[data-shell-phase="capture"] .ed-topbar,
  html[data-shell-phase="review"] .ed-topbar { /* 隐藏 A′ 顶栏（复习态 = 零 chrome；采集态 = 换成 LIVE 仪表条） */ }
  html[data-shell-phase="review"] .ed-review-card { /* 单列居中 640（既有 maxWidth: 640 在 ReviewSessionPanel.tsx:121，本条只保证"单列"） */ }
  ```
  ⚠️ **不得**在相位块里定义任何 `--ed-*` 变量（G4 改判后的判据 = `motion.css` 的 `--ed-*` 定义**恒 0**）。
  ⚠️ **`transition: height` / `animation: … height` 一律禁止**（R4.4 的硬判据）；宽度/高度变化**只能**瞬跳或走 `Flip`（波 C 的 T33）。
- [ ] **Step 2: 交叉淡入**（chrome 的进出用 `position: absolute` + `opacity` + `transition: opacity var(--ed-dur-card, 220ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1))`；**绝对定位**是「不 animate height」的实现手段 —— 两态叠在同一格上交叉淡化，布局高度**一格都不变**）
- [ ] **Step 3: 名单同步**（把相位选择器涉及的类（`.ed-topbar` 等）逐字加进唯一的 reduced-motion 块；⚠️ `.ed-topbar` 是 `shell/**` 的类、**不在** `BASE_CLASSES` 的 12 名里 ⇒ 加进名单**不会**触发 `motion-coverage.test.ts:106-111` 的「死条目」判据**当且仅当**它有 `animation:` 声明；本任务的相位块**只声明 `transition`** ⇒ 🔴 **不要把纯 `transition` 落点塞进名单**（会被当死条目）—— **正确做法 = 只把「有 `animation:` 的落点」加名单**（G7 的口径逐字：`animation` 声明才强制），`transition` 落点的可覆盖性由 T14 的 G1 第三条与 `style-seams.test.ts:190-200` 承担）
- [ ] **Step 4: 守卫 `shellPhase.guard.test.ts`**（四条判据见 Verification；**全部为静态判据 + 一条行为判据**，R1.4）
- [ ] **Step 5: `ReviewPage.tsx` 接线**（`useShellPhase(session ? "review" : "idle")` **1 行**）
- [ ] **Step 6: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **🔴「不 animate height」硬判据（R4.4 本体）**：`motion.css` 与 `TopBar.css` 剥注释后，相位相关规则块内**不含** `height` 与 `max-height`，且**全文件**不出现 `transition: …height` / `animation: …height` / `@keyframes` 体内含 `height`（正则：`/(?:transition|animation)[^;{}]*\b(?:max-)?height\b/` **0 命中**，且相位块的规则体内 `height` **0 命中**） | **M1**：给相位容器加 `transition: height var(--ed-dur-card, 220ms)`；**M1b**：加 `animation: ed-phase-grow …` 且 keyframes 里有 `height` | **M1 后期望**：正则命中 1 ⇒ 红；**M1b 后期望**：命中 ≥1 ⇒ 红（**双变异证明这条判据有两个独立齿**） |
| **V2** | **交叉淡入确实是绝对定位 + opacity**：相位块里隐藏/显示的容器规则**含** `position: absolute` **且含** `opacity` **且含** `transition: opacity …var(--ed-dur-`（三半同时成立） | **M2**：把 `position: absolute` 换成 `display: none` | **M2 后期望**：V2 红（**`display:none` 是"没有交叉淡入"**）；同时提醒：`display:none` 下**没有过渡** ⇒ 相位切换变瞬变 |
| **V3** | **源序（三块）**：`motion.css` 里「档位块行号 < 相位块行号 < reduced-motion 块行号」（**T6 的源序判据只覆盖前两者**，本任务扩到三块） | **M3**：把相位块挪到 reduced-motion 块之后 | **M3 后期望**：源序破 ⇒ 红（**证明用户档位/相位不会盖掉系统无障碍设置**） |
| **V4** | **零 chrome 的判据（行为级，R1.4 要求静态守卫必须配行为判据）**：jsdom 下渲染 `ReviewPage` 的复习态 ⇒ `<html data-shell-phase="review">` **且** 顶栏节点存在但相位选择器命中（**断言 `document.documentElement.getAttribute("data-shell-phase")` 与顶层 `data-testid="topbar"` 仍在 DOM**） | **M4**：把 `useShellPhase` 的调用删掉 | **M4 后期望**：`data-shell-phase` 为 `null` ⇒ 红 |
| **V5** | **`--ed-*` 定义仍 0**：`motion.css` 剥注释后 `--ed-[a-z0-9-]+\s*:` **0 命中**（T5 的 G4 判据；本任务只能加类规则） | **M5**：在相位块里加 `--ed-phase-fade: 220ms` | **M5 后期望**：命中 1 ⇒ 红（T5 V1 同步红） |
| **V6** | **`motion.css` 仍 ≤300**（R11.8 第 1 条的自律口径）+ `line-limits --full` exit 0 | — | 实测行数 ≤300（报告给逐字读数） |
| **V7** | `tsc` 0 错 · `vitest` 全绿 · **T14 的 G1/G2 已落地且仍绿**（本任务**不改** `TopBar.test.tsx` / `ShellFallback.test.tsx`） | — | 全绿 + 那两个文件 `git diff --numstat` 空 |

**提交信息**：`feat(motion): 落相变态 chrome 与交叉淡入`（subject 16 字）

**诚实边界**：① 🔴 **「零 chrome」的观感不可机器判据** —— jsdom 不计算媒体查询、不做样式级联 ⇒ V4 只证明**相位属性与 DOM 仍在**，**不证明**「用户真的看不到顶栏」；像素证据只能 headless（照 DISPATCH-TEMPLATE §二的三条硬纪律），**本批不做 headless 的必须性**（登记）；② 「单列卡片居中 640」**今天已成立**（`ReviewSessionPanel.tsx:121` 的 `maxWidth: 640` + `margin: "0 auto"`）⇒ **本任务不重造它**，只保证复习态的**列结构**不被壳层破坏；③ 相位块**只写 `transition`**、不写 `animation` ⇒ **不进 reduced-motion 名单**（进了会被 `motion-coverage.test.ts:106-111` 判死条目）—— 这条**与 T13 的「新增落点逐字进名单」不矛盾**：T13 的三件是**循环 `animation`**，本任务是**一次性 `transition`**；④ 「采集态顶栏换成 LIVE 仪表条」的**显隐**在本任务用 CSS 完成，**但 `LiveBar` 的挂载点在 T18** ⇒ 两任务之间**存在一个"CSS 就位但仪表未挂"的窗口**（同一波内，登记）。

---

### Task 20: `Flashcard.intervalDays` 只读字段（Rust 5 处，含 **G11**）

> **依据**：**R5.4 的探针回收裁决（PB2）逐字** —— 走 **(b)「`Flashcard` += 1 个只读字段」**；字段名 **`intervalDays`**（camelCase）；**精度双域**（`review_card` = **精确值** / 行派生 = **整天粒度**）；**最小改动集 = Rust 4 文件 / 5 处**；**命令注册计数不变**（312/312/0）；**不触碰 §10 的 schema/迁移面**；**`types_contract_tests.rs:34` = G11（授权，只许追加）**。

**目标**：给 `Flashcard` 加 1 个只读字段 `interval_days`（线格式键 `intervalDays`），三处结构体字面量补齐 + `review_card` 处**显式覆写**为精确值；前端类型加**可选** `intervalDays?: number`（**零夹具改动**）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src-tauri/src/types_note.rs` | **278** | 否（余 22） | 否 | `Flashcard` 加 1 字段（`pub interval_days: f32`；**放在 `created_at` 之后** ⇒ 键序 = 末尾，**既有 10 键的相对顺序一字不动**） |
| `app/src-tauri/src/db_flashcards.rs` | **292** | ⚠️ **是**（余 **8**） | 否 | `:43-54` `create_card` 字面量补值 + `:275-287` `row_to_card` 供值（**净增 ≤8 行；超 ⇒ STOP**） |
| `app/src-tauri/src/commands_flashcards.rs` | **266** | 否（余 34） | 否 | `:206-210` 返回体**显式覆写** `interval_days: outcome.interval_days` |
| `app/src-tauri/src/types_contract_tests.rs` | **129** | 否 | 否 | 🔴 **G11**：`:34` 的字面量**追加** `interval_days: …` + 期望串**追加** `"intervalDays":…`；🔴 **只许追加、不许删除任何既有字段/键** |
| `app/src/types/notes.ts` | **277** | 否（余 23） | 否 | `Flashcard` 加 `/** 后端给的真实间隔（天）；review_card 精确 / 队列派生整天粒度 */ intervalDays?: number;`（**可选** ⇒ 0 处既有夹具要改 —— PB2 Q3 实测 5 处夹具只在**必填**时才要改） |
| `app/src-tauri/src/db_flashcards.rs` 的 `CARD_COLUMNS` / 全部 SQL 文本 / `db_migrations.rs` | — · — | — | 否 | 🔴 **零改动**（PB2 Q3 逐字：不新增表、不改既有字段、不改既有 SQL 语义、`flashcards` 零 `ALTER TABLE`） |

**Interfaces:**
- Produces（**两个精度域必须显式声明**，PB2 逐字）：
  - ① **`review_card` 路径 = 精确值**（`outcome.interval_days: f32`，当场覆写；⚠️ 该函数用 `..card` 结构体更新语法 ⇒ **不显式覆写会漏出 `row_to_card` 的旧值**，这是 PB2 点名的陷阱）
  - ② **行派生路径（`list_due_cards` / `get_card` / `card_by_fragment` / `list_cards_by_group` / `find_card_by_front`）= 整天粒度**（`row_to_card` 由 `due_at − stateJson.lastReviewMs` 反推，`max(round(…),1)`）
  - ③ **新卡** = 无间隔（`0.0`）；`lastReviewMs == 0` ⇒ 派生值**无意义** ⇒ 派生路径必须返回 `0.0`（**不得**返回 `due_at/86400000` 这种"发明出来的数字"）

- [ ] **Step 0: 开工自证**（`cd app/src-tauri; cargo test --test app_lib_tests` 基线 `2306 running / 2300 passed / 0 failed / 6 ignored`）
- [ ] **Step 1: `types_note.rs` 加字段**（含**逐字注释**：两个精度域 + 「前端透传不解析 `stateJson`」的契约不变）
- [ ] **Step 2: `db_flashcards.rs` 两处供值**（`create_card` = `0.0`；`row_to_card` = 反推整天；**把反推写成一个小纯函数** `interval_days_from(due_at, state_json) -> f32` 放在同文件，便于单测；⚠️ 余量只有 8 行 ⇒ **若超 ⇒ 把该纯函数拆进新文件 `db_flashcard_interval.rs`** 并按 DISPATCH-TEMPLATE §二用 `#[path]` + `pub(crate) mod` 声明）
- [ ] **Step 3: `commands_flashcards.rs` 显式覆写**（`Ok(Flashcard { state_json, due_at: outcome.due_at_ms as i64, interval_days: outcome.interval_days, ..card })`）
- [ ] **Step 4: 单测**（在 `db_flashcards_tests.rs` 或新文件：新卡 ⇒ `0.0`；`reps=0`/`lastReviewMs=0` ⇒ `0.0`；正常卡 ⇒ `round((due_at − lastReviewMs)/86400000)` 且 `≥1`；**劣化输入**（`lastReviewMs > due_at`、`due_at` 为负）⇒ 不 panic、返回 `0.0`）
- [ ] **Step 5: G11 改判**（`types_contract_tests.rs:34`；**只追加**）+ 前端类型加可选字段
- [ ] **Step 6: 门禁 + 提交**（`cargo test --test app_lib_tests` **必跑** + `node scripts/check-command-registry.mjs` 期望 **仍 312/312/0**）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **线格式**：`types_contract_tests.rs` 的 `Flashcard` 期望串**逐字**含 `"intervalDays"`，且**既有 10 键逐字仍在、相对顺序不变**（G11 的「只许追加」） | **M1**：把新字段从期望串里删掉；**M1b**：把任一既有字段（如 `dueAt`）从期望串里删掉 | **M1 后期望**：整串不等 ⇒ 红；**M1b 后期望**：**也**红（G11 逐字要求两侧各一个变异体） |
| **V2** | **精确值路径（①域）**：调用 `review_card` 后返回体的 `intervalDays` == 当次 `ScheduleOutcome.interval_days`（**不是** `row_to_card` 的整天值） | **M2**：把显式覆写删掉（回到 `..card` 结构体更新语法） | **M2 后期望**：返回的是**旧值**（陈旧间隔）⇒ 红（**PB2 点名的陷阱，这条是本任务最有价值的一条判据**） |
| **V3** | **整天粒度（②域）**：`list_due_cards` 返回体里 `intervalDays` 的**恒等式** `dueAt − ??? ` 不可直接用 ⇒ 改为断言 `intervalDays == round((due_at − derived_last_review_ms)/86_400_000).max(1)` 由**夹具构造**（不读前端 `stateJson`） | **M3**：把 `row_to_card` 的派生写成 `(due_at / 86_400_000)`（丢掉 `lastReviewMs`） | **M3 后期望**：哨兵夹具（`lastReviewMs` 非 0）上不等 ⇒ 红 |
| **V4** | **新卡/劣化输入**：新卡 `intervalDays === 0.0`；`lastReviewMs == 0` ⇒ `0.0`；`lastReviewMs > due_at` ⇒ `0.0` 且**不 panic** | **M4**：把 `0.0` 兜底改成 `1.0` | **M4 后期望**：新卡读 `1.0` ≠ `0.0` ⇒ 红（**这条防"发明一个数字"**，AGENTS.md「不发明数字」） |
| **V5** | **注册计数不变**：`node scripts/check-command-registry.mjs` ⇒ `✅ 定义 312 / 注册 312 / 重复 0`（exit 0） | —（PB2 逐字：加字段不产生新条目） | 312/312/0 |
| **V6** | **零 schema 面**：`git diff --numstat -- app/src-tauri/src/db_migrations.rs` **空**；`CARD_COLUMNS` 与全部 SQL 文本**零 diff** | —（R5.4 逐字「不新增表、不改既有字段、不改既有 SQL 语义」） | 空 diff |
| **V7** | `cargo test --test app_lib_tests` **exit 0** 且**逐字读数**（`running ? tests` ⇒ `0 failed`）· `cargo clippy` **错误数不增**（基线 15）· `tsc` 0 错 · `vitest` 全绿 | —（门禁类） | 全绿；报告给逐字读数 |
| **V8** | **前端零夹具改动**：`git diff --numstat` 里**不含** `ReviewPage.test.tsx` / `ReviewSessionPanel.test.tsx` / `ModelCardCreateDialog.test.tsx` / `PromoteCardButton.test.tsx` / `RouteInfoPopover.test.tsx` | **M8**：把 TS 侧字段改成**必填** `intervalDays: number` | **M8 后期望**：`tsc --noEmit` 报 5 处夹具缺字段 ⇒ 红（**证明"可选"是有判据支撑的选择，不是随手写的**） |

**提交信息**：`feat(flashcards): 暴露只读真实间隔字段`（subject 15 字）

**诚实边界**：① 🔴 **本任务触碰规格 §3 红线 6**（**第三处经批准的例外**）⇒ **必须**同提交/同批完成三件套：**规格 §3 就地加注**（归 **T35**）· **`ADR-035` 的「后端契约例外」节回填**（归 **T35**）· **`cargo test` 真跑**（本任务 V7）；② **不触碰 AGENTS.md §10 的「SQLite schema / 迁移」**（PB2 实测：`flashcards` 建表后零 `ALTER TABLE`、`CARD_COLUMNS` 与 SQL 文本全不动）—— 但 **`types_contract_tests.rs` 是"返回契约"变更**，属 §3 例外登记面，**不是** §10 面；③ **`interval_days` 的 f32 原值只到「天」的精度**，前端**不得**把它当"下一次复习的确切时刻"（确切时刻看 `dueAt`）—— 这条必须写进 TS 侧注释与 `ADR-035`；④ **`Flashcard` 是 6 条命令的共享返回类型** ⇒ 本字段会同时出现在 `quiz_group_cards` / `create_model_card` / `list_group_cards` / `model_card_from_note` 的返回里（PB2 Q3 影响面逐字）—— **本批只消费 `list_due_cards` 与 `review_card` 两处**，其余四处**如实登记为"顺带变化"**。

---

### Task 21: 到期刻度视觉（#4 的承载面）

> **依据**：R5.4 逐字「承载：`pages/ReviewPage.tsx`(231) + `components/review/ReviewSessionPanel.tsx`(231)（**部件存在**）；今天**只有纯文字「共 N 张到期」**，**「到期刻度」视觉形态 0 命中**」· R5.4 的**禁止项**「**禁止**前端用 `dueAt` 差值或字符数**自造**「真实间隔」」。

**目标**：新建 `app/src/components/review/DueScale.tsx`（**到期刻度的视觉载体**：以 `count_due_cards` 的计数为长度的刻度尺 + 单卡刻度），把 `ReviewPage` 的「共 N 张到期」从纯文字升级为**文字 + 刻度**；**刻度长度只许来自后端给的计数/间隔字段**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/review/DueScale.tsx` | **不存在（新建）** | — | 否 | 新建，预算 **≤140**；⚠️ `components/**` 在 `nativeButton.ratchet` 域内 ⇒ **零裸 `<button>`**（纯展示） |
| `app/src/components/review/DueScale.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `app/src/pages/ReviewPage.tsx` | **231** | 否（余 69） | 否 | 接入刻度（「共 N 张到期」那一行的**下方或同行**加 `<DueScale …>`；**不删既有文案**） |
| `app/src/pages/ReviewPage.test.tsx` | **172** | 否 | 否 | **只追加**断言（既有 3 例逐字不动） |

**Interfaces:**
- Consumes：`count_due_cards`（`→ i64`，既有）· **T20 的 `intervalDays`**（单卡刻度用；**只有 `list_due_cards` 的返回里有** ⇒ 队列内的单卡刻度用整天粒度）
- Produces（**冻结快照**）：
  ```tsx
  export interface DueScaleProps {
    /** 到期卡张数（来自 count_due_cards；**唯一**的"有多少"真源） */
    readonly due: number;
    /** 本轮队列的间隔（可选；来自 list_due_cards 的 intervalDays，整天粒度） */
    readonly intervals?: readonly number[];
    readonly testId?: string;
  }
  export default function DueScale(props: DueScaleProps): ReactElement;
  ```
  🔴 **`intervals` 缺失时不得退化出"看起来精确"的刻度** —— 缺省渲染**计数刻度**（纯 N 段），**不猜间隔**。

- [ ] **Step 1: `DueScale.tsx`**（`@ai-context` 写清：Why = §8.6 #4 的承载面；数据真源 = 后端计数 + `intervalDays`；**副作用 = 无**；边界 = `due === 0` ⇒ 渲染空刻度（**不是**空态文案 —— 空态归调用点）；`intervals` 里的 `0.0`（新卡）⇒ 该段画成"无间隔"档而不是 0 长度）
- [ ] **Step 2: `DueScale.test.tsx`**（见 Verification）
- [ ] **Step 3: `ReviewPage.tsx` 接入**（刻度与「共 N 张到期」**同源**：都读同一个 `scopeDue`；**不得**新增一次 `count_due_cards` 调用）
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **计数真源唯一**：`DueScale` 渲染的刻度段数 == **传入的 `due`**；`due = 0` ⇒ 0 段；`due = 7` ⇒ 7 段（**双断言**：段数 + `data-testid` 上的 `data-due`） | **M1**：把段数写成常量 `5` | **M1 后期望**：`due=7` 时 5 ≠ 7 ⇒ 红 |
| **V2** | **不得自造间隔**：剥注释后 `DueScale.tsx` 与 `ReviewPage.tsx` 里**不出现** `dueAt` 减法 / `stateJson` 解析 / `intervalDays` 之外的间隔推算（正则：`/stateJson\s*\./`、`/dueAt\s*[-+]/`、`/86_?400_?000/` **0 命中**） | **M2**：加一行 `const days = (c.dueAt - c.createdAt) / 86400000;` | **M2 后期望**：命中 1 ⇒ 红（**这条把 R5.4 的明文禁止变成守卫**） |
| **V3** | **缺 `intervals` 时不假装精确**：不传 `intervals` ⇒ 刻度只有计数段、**不含**任何按天刻度的标记（断言 `querySelectorAll("[data-interval]").length === 0`） | **M3**：缺省时按 `due` 造出等差数列当间隔 | **M3 后期望**：`[data-interval]` 非 0 ⇒ 红 |
| **V4** | **既有文案不删**：`ReviewPage` 的既有「共 N 张到期」文案**逐字仍在**（**只增不减**） | —（回归类） | `ReviewPage.test.tsx` 既有 3 例逐字通过 + 新例绿 |
| **V5** | **无第二次 IPC**：`ReviewPage.tsx` 里 `count_due_cards` 的调用点数量**不变**（实测 2 处：`:72`/`:73`） | **M5**：在 `DueScale` 里自己 `invoke("count_due_cards")` | **M5 后期望**：调用点数 2 → 3 ⇒ 红（**且 `DueScale` 会因此需要 `@tauri-apps` import ⇒ 违反 C14② 的"纯展示"口径**） |
| **V6** | 六类棘轮全绿 · `line-limits` exit 0 · `tsc` 0 错 · `vitest` 全绿 | — | 全绿 |

**提交信息**：`feat(review): 建到期刻度视觉承载面`（subject 15 字）

**诚实边界**：① **「刻度好不好看」不可机器判据** ⇒ 本任务判**段数 / 属性 / 零自造 / 零新增 IPC**；② **本任务只建"承载面"**，生长/回缩动效归 **T30**（波 C 的 #4）⇒ 本任务结束时刻度是**静止的**（**这是有意的两步**）；③ `ReviewPage` 的到期计数是**轮询式**（`load()` 在 `token` 变化时重拉，`ReviewPage.tsx:86`）⇒ 刻度**不会**在评分过程中实时更新 —— **本批不改刷新模型**（登记：真正的实时刻度需要事件总线，而 `ReviewPage.tsx:9-12` 逐字说明「flashcards/review_logs **不在** `useDbRefresh` 五域事件总线」）。

---

### Task 22: `session_audio_path` 只读命令（**312 → 313**）

> **依据**：R5.5 的 PB1 回收裁决逐字 —— 「新增 1 个只读命令（**本批唯一的**新增** IPC）**：入参 `session_id: i64`，返回可播放的 asset URL 的 `Option<String>`（无音频 ⇒ `None`；形态照既有先例 `commands_images.rs:55` 的 `session_images_base_url`）；注册点 `app_commands.rs:335` 邻近。🔴 **安全红线（AGENTS.md §4）**：① **必须**校验入参；② **必须**把路径限定在应用数据目录内（**不许**把任意路径透传给 asset protocol ⇒ 目录穿越）；③ 命令名与 `check-command-registry` 计数同步：**312 → 313**」。
> 🔻 **本计划者对本条的一处形态校订（需控制方追认，见 `## 待裁决清单` #7）**：返回体取 **`Option<SessionAudioRef>`**（`{ path, aligned, durationMs }`）而不是裸 `Option<String>` —— 因为 **R5.5-b 第 3 条**同时要求把 `aligned` 自证量送到 UI（「历史录音必须能如实区分…**禁止**用一个恒为 `true` 的字段充当这个标记」，且「实现形态由计划定」），而**裸 `Option<String>` 装不下它**；把 `aligned` 塞进**第二条命令**会破坏「**本批唯一新增 IPC**」与「312→313」两条硬约束。⇒ **命令名、入参、注册点、计数、安全三条全部逐字不变**，只有**出参形状**从 `String` 变为带 `path` 的结构体（**仍是"路径字符串"，前端仍走 `convertFileSrc(path)`**，与 `commands_images.rs:55` 的先例同形）。

**目标**：新建 `session_audio_path`（Rust）：入参校验 + 路径由**后端**构造（前端**不传路径**）+ 目录边界双保险（照 `commands_images.rs:89-105` 的 `canonicalize` + 前缀校验先例）+ 读 T23 的 sidecar 判定 `aligned` + 注册 + 计数 313。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src-tauri/src/commands_audio.rs` | **83** | 否（余 217） | 否 | 加 `SessionAudioRef` 载荷 + 1 个 `#[tauri::command]`（+≤90 行，含单测则拆到 `commands_audio_tests.rs`） |
| `app/src-tauri/src/app_commands.rs` | **478** | 否（>300 已登记豁免） | 否 | `:335-336` 的音频段**追加 1 行** `crate::commands_audio::session_audio_path,` |
| `app/src-tauri/src/commands_audio_tests.rs` | **不存在（新建，若无）** | — | 否 | 新建（若有则追加），预算 **≤150** |
| `app/src-tauri/tauri.conf.json` | **43** | 否 | 否 | 🔴 **零改动**（PB1 逐字：CSP `media-src` 与 asset scope 已就绪 ⇒ **AGENTS.md §10 的 `tauri.conf.json` 审查面不触发**） |

**Interfaces:**
- Produces：
  ```rust
  /// 会话音频引用（只读；前端 convertFileSrc(path) 得可播放 URL）。
  #[derive(Debug, Clone, serde::Serialize, PartialEq)]
  #[serde(rename_all = "camelCase")]
  pub struct SessionAudioRef {
      /// 应用数据目录内的**绝对路径**（`{data_dir}/session-audio/{id}.wav`）
      pub path: String,
      /// 该录音的 WAV 轴是否与会话轴对齐（T23 的 sidecar；**无 sidecar ⇒ false**，禁止恒 true）
      pub aligned: bool,
      /// 音频时长（毫秒；由已写样本数换算，`None` = 未知/未 finalize）
      pub duration_ms: Option<u64>,
  }
  #[tauri::command]
  pub fn session_audio_path(state: State<'_, AppState>, session_id: i64)
      -> Result<Option<SessionAudioRef>, String>;
  ```
- ⚠️ **未 finalize 的 WAV 的判定（R5.5-b 约束 3）**：`aligned` 之外还要能判「**这条能不能播**」—— 判据 = **RIFF/data 长度字段非 0**（`audio_store.rs:76` 创建时写 0、`:100-110` 唯一回填点）。⇒ **`durationMs` 为 `None` 即表示"未 finalize"**；**也可以**在 `SessionAudioRef` 里加 `playable: bool`（**二选一，实施者定，但必须在 `@ai-context` 里写清哪一个是"可播"的唯一判据**）。

- [ ] **Step 1: 命令实现**（`session_id <= 0` ⇒ `Err("无效的会话 id")`；路径由 `state.data_dir.join("session-audio").join(format!("{}.wav", id))` **构造**；不存在 ⇒ `Ok(None)`；**双保险**：`canonicalize` 后 `starts_with(canonicalize(data_dir.join("session-audio")))`，越界 ⇒ `Err("路径越界拒绝")`）
- [ ] **Step 2: sidecar 读取**（T23 产出的 `{id}.wav.meta.json`；**缺失 ⇒ `aligned = false`**（历史录音**不得**被当作已对齐）+ `durationMs = None`）
- [ ] **Step 3: 注册 + 计数**（`app_commands.rs:336` 之后加 1 行 ⇒ `node scripts/check-command-registry.mjs` 期望 `313/313/0`）
- [ ] **Step 4: Rust 单测**（`session_id = 0` / 负数 ⇒ Err；无文件 ⇒ `Ok(None)`；有文件 ⇒ `Ok(Some(ref))` 且 `ref.path` 在 `session-audio` 目录内；**目录穿越**：构造一个指向 `%APPDATA%` 之外的 symlink/相对路径样本 ⇒ Err）
- [ ] **Step 5: 八门禁 + 提交**（`cargo test --test app_lib_tests` **必跑**）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **入参校验**：`session_id = 0` 与 `-1` ⇒ `Err`；**Rust 单测**逐条 | **M1**：删掉 `id <= 0` 的校验 | **M1 后期望**：`0` 走向 `format!("{}.wav", 0)` ⇒ 返回 `Ok(None)` 而不是 Err ⇒ 红 |
| **V2** | **路径限定在应用数据目录内（安全红线）**：返回的 `path` 的 `canonicalize` **必须以** `data_dir/session-audio` 的 `canonicalize` 为前缀；越界样本 ⇒ `Err("路径越界拒绝")` | **M2**：把 `canonical_path.starts_with(&canonical_base)` 整条删掉，并把路径改成 `session_id.to_string()` 直接拼（接受任意 id 串） | **M2 后期望**：越界样本不再 Err ⇒ 红（**这条是 AGENTS.md §4 的机器判据**） |
| **V3** | **无音频 ⇒ `None`**（不是空串、不是死路径）：目录里无 `{id}.wav` ⇒ `Ok(None)` | **M3**：无文件时返回 `Ok(Some(ref))` 且 path 指向不存在的文件 | **M3 后期望**：红（**防"前端拿到死路径"**，PB1 Q2-③ 逐字） |
| **V4** | **`aligned` 不得恒 true**：无 sidecar（历史录音）⇒ `aligned == false`；有 sidecar 且 `aligned: true` ⇒ `true` | **M4**：把缺省 `aligned` 写成 `true` | **M4 后期望**：红（**R5.5-b 逐字「禁止用一个恒为 true 的字段充当这个标记」**） |
| **V5** | **注册计数 312 → 313**：`node scripts/check-command-registry.mjs` ⇒ `✅ 定义 313 / 注册 313 / 重复 0`（exit 0） | **M5**：加了命令但**不**注册 | **M5 后期望**：脚本报「漏注册 1」⇒ exit 1（**证明注册面是被守卫看着的**） |
| **V6** | **零 `tauri.conf.json` 改动**：`git diff --numstat -- app/src-tauri/tauri.conf.json` **空**；`Cargo.toml` / `Cargo.lock` **零 diff**（零新增依赖，PB1 逐字） | — | 空 diff |
| **V7** | `cargo test --test app_lib_tests` exit 0 + 逐字读数 · `clippy` 错误数不增（15）· 其余门禁全绿 | — | 全绿 |

**提交信息**：`feat(audio): 新增会话音频路径只读命令`（subject 18 字）

**诚实边界**：① 🔴 **asset URL 的形态**（`http://asset.localhost/<encodeURIComponent(绝对路径)>`，P-18）**不在 Rust 侧构造** —— 后端只给**绝对路径**，前端 `convertFileSrc` 拼（与既有 5 处图片调用点同形）⇒ **本任务不声称"URL 已可用"**，只声称「路径通道已通」；② 🔴 **`<audio>` 的真实播放与 seek 在本环境不可验证**（jsdom 无媒体栈 · headless Edge 不说 `asset:` 协议 · 真机/WebView2 用户已裁决跳过，R5.5-b 逐字）⇒ 本任务**只能**判「命令返回形状 + 路径边界 + sidecar 判定」，**不得**出现「播放已可用」类表述；③ **`aligned` 的语义是「不能保证对齐」而不是「一定没对齐」**（历史录音无法判定 ⇒ 取保守值）—— 这条必须写进 `@ai-context` 与 UI 文案，**不得**让 UI 说"这条录音没有对齐"；④ **适用范围硬边界**：**只有实时采集会话有音频**；导入会话的音轨在 `%TEMP%` 且导入结束即删、`sessions` 表无源视频路径 ⇒ **对导入会话本命令恒 `Ok(None)`**（PB1 Q1-④ 逐字）—— UI 必须**如实区分**（见 T24/T25）。

---

### Task 23: WAV 轴 ≡ 会话轴（**R5.5-b 根治方案**，本批最深的一处后端改动）

> **依据**：R5.5-b 的三条裁决逐字（① **补静音使 WAV 轴 ≡ 会话轴**；② **纯函数 + 失效安全**；③ **`aligned` 自证量**）+ 可行性复核逐字（「改动面 = **1 个签名（加 `timestamp_ms: i64`）+ 1 个调用点（`:163`）+ 1 个纯函数（空档 → 补零样本数）+ 1 个「下一期望时间戳」字段**；**不需要新数据面、不需要新依赖、不需要迁移**」）。
> 🔴 **触发 AGENTS.md §10 的额外审查面**：`live_session*.rs` 在 §10 名单内 ⇒ **本任务必须在报告里显式给出 §10 审查记录**（先例：批 3 T4 对 `tauri.conf.json` 做过，且从 gitignored 报告提升为 durable 记录）。
> 🔴 **跨批影响**：ADR-013 是暂停语义的既有承载文档 ⇒ **本任务必须就地加注**（新增「WAV 轴与会话轴的对齐」一节）。

**目标**：把补静音做成**纯函数**（新建 `app/src-tauri/src/audio_align.rs` + `audio_align_tests.rs`）；`SessionAudioWriter::write_chunk` 加 `timestamp_ms` 入参并在写前补等长静音；**失效安全**（时间戳缺失/非单调 ⇒ 退回纯追加 + `aligned = false`，**不丢样本、不阻断主链路**）；`finalize` 写 sidecar（`aligned` 自证量）；更正 `audio_store.rs:3` 的 `@ai-context`；ADR-013 加注。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src-tauri/src/audio_align.rs` | **不存在（新建）** | — | 否 | 新建（**纯逻辑、零 IO、零依赖**），预算 **≤120**；由 `audio_store.rs` 用 `#[path = "audio_align.rs"] pub(crate) mod audio_align;` 声明（DISPATCH-TEMPLATE §二；**跨模块引用 ⇒ 必须 `pub(crate)`**） |
| `app/src-tauri/src/audio_align_tests.rs` | **不存在（新建）** | — | 否 | 新建，预算 **≤200**（**≥7 条边界单测**，R5.5-b 逐字） |
| `app/src-tauri/src/audio_store.rs` | **212** | 否（余 88） | 否 | `write_chunk` 签名 + 对齐簿记 + `finalize` 写 sidecar + `:3` 的 `@ai-context` 就地更正 |
| `app/src-tauri/src/audio_store_tests.rs` | **137** | 否 | 否 | 追加（既有用例**逐字不动**；`write_chunk` 的旧调用点全部要改签名 —— ⚠️ **这是既有测试的必要连带**，见「诚实边界⑤」） |
| `app/src-tauri/src/live_session_loop.rs` | **410** | 否（>300 已登记豁免） | 否 | `:162-164` 的调用点加 `chunk.timestamp_ms`（**±2 行**）；⚠️ **AGENTS.md §10 名单内** |
| `docs/adr/ADR-013-live-session-preload-and-playback-pause.md` | **90** | 否 | 否 | **就地加注**「WAV 轴与会话轴的对齐」一节（**上格原文一字不改**，+≤25 行） |

**Interfaces:**
- Produces（**冻结快照**）：
  ```rust
  /// 采样率契约（与 `audio_store::SAMPLE_RATE` 同源；本模块不重复定义 16000）
  /// 一个空档应补多少个静音样本；`None` = **失效安全**（不补，退回纯追加）
  pub fn silence_gap_samples(prev_end_ms: Option<i64>, next_ts_ms: Option<i64>) -> Option<usize>;
  /// 块序列 → 逐块的「写入前应补静音样本数」（纯函数；单测与自证的主入口）
  pub fn alignment_plan(chunks: &[(Option<i64>, usize)]) -> Vec<Option<usize>>;
  /// 对齐簿记（`SessionAudioWriter` 的字段集合；`aligned` 是**自证量**）
  pub struct AlignBook { pub aligned: bool, pub first_ts_ms: Option<i64>, pub last_end_ms: Option<i64> }
  ```
  **语义（逐字写进 `@ai-context`）**：`aligned` 的**初始值 = true**，但**只要遇到一次**「时间戳缺失」或「时间戳回退」就**永久置 `false`**（本次会话内不再恢复）；`aligned == false` ⇒ **后续块一律纯追加**（不补静音），**样本一个不丢**。
- ⚠️ **`prev_end_ms` 的来源**：`last_end_ms = first_ts_ms + samples_written/16`（**由已写样本数推**，不额外存时间戳）；`first_ts_ms` = **首个带时间戳的块**的 `timestamp_ms`（= R5.5-b 的 T0）。

- [ ] **Step 1: `audio_align.rs`**（三个导出；`@ai-context` 写清：Why = R5.5-b 的 D2「静默窗不产包、无上界」⇒ 不补静音则播放头会漂到分钟级；副作用 = **无**（纯函数）；边界 = ① `next_ts_ms < prev_end_ms` ⇒ `None`（回退）② 空档 **> 上限**（如 `MAX_GAP_MS = 10 * 60 * 1000`）⇒ `None`（**超大空档**：宁可不补也不写几百 MB 静音 —— **这是本计划定的策略，须控制方追认**）③ `timestamp_ms` 为负 ⇒ `None`）
- [ ] **Step 2: `audio_align_tests.rs`（≥7 条边界单测，逐条对应 R5.5-b 的清单）**
  ① **首块**（`prev_end_ms = None`，`next = Some(t)`）⇒ 补 `0`（**T0 由首块锚定**）② **连续块**（`next == prev_end`）⇒ `0` ③ **单空档**（`next = prev_end + 200`）⇒ `200 * 16` 样本 ④ **多空档**（连续三块各有空档）⇒ 逐块独立、总数守恒 ⑤ **超大空档**（> 上限）⇒ `None` ⑥ **时间戳回退/乱序** ⇒ `None` ⑦ **缺 `timestamp_ms`** ⇒ `None` ⑧ **（对拍）** 用 `alignment_plan` 逐块计划跑一遍，结果与「逐块调用 `silence_gap_samples`」**逐元素相等**（防止批量与增量两条路径分叉）
- [ ] **Step 3: `audio_store.rs` 接线**（`write_chunk(&mut self, samples: &[f32], timestamp_ms: Option<i64>)`：先按 `silence_gap_samples` 补零、再写样本、最后更新 `last_end_ms`；**补静音失败/不补时不影响样本写入**；`finalize` 里写 `{id}.wav.meta.json`：`{ "version": 1, "aligned": bool, "firstTsMs": Option<i64>, "samplesWritten": u64 }`）
- [ ] **Step 4: 调用点**（`live_session_loop.rs:163` ⇒ `w.write_chunk(&chunk.samples, Some(chunk.timestamp_ms as i64));`；⚠️ `AudioChunk.timestamp_ms` 是 `u64`（`capture/audio_loopback.rs:42` 的类型）⇒ **转换处必须处理越界**（`i64::try_from(...).ok()`））
- [ ] **Step 5: `audio_store.rs:3` 的 `@ai-context` 就地更正**（旧文逐字「实时链路**当前不落盘**（已核查）——本模块按会话落 WAV」**自相矛盾** ⇒ 改为「实时链路**已落盘**（接线点 `live_session.rs:258-262` 创建 · `live_session_loop.rs:162-164` 每 200ms 写块 · `:391-397` finalize）」；**旧句保留一行作历史注记 + 标注更正日期**）
- [ ] **Step 6: ADR-013 加注**（新增「WAV 轴与会话轴的对齐」一节：D1–D6 偏差清单 + 本批的补静音方案 + `aligned` 的语义 + **历史录音不对齐** 的如实声明；**上格原文一字不改**）
- [ ] **Step 7: 🔴 §10 额外审查记录**（报告必含，逐条：① `live_session*.rs` 与 `capture/` 属隐私敏感面；② 本次改动**只加静音填充**、**不改采集语义**、**不新增系统调用**、**不改变文件位置与权限**；③ **不新增依赖**（`Cargo.lock` 692 包零变化）；④ **不影响暂停语义**（暂停期 `write_chunk` 仍完全不被调用 ⇒ 补静音逻辑在暂停期不执行）；⑤ 回滚 = 还原 1 个签名 + 1 个调用点 + 删 2 个新文件）
- [ ] **Step 8: 门禁 + 两个提交**（纯函数+单测 / 接线+加注）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **空档补静音（行为级）**：给 `write_chunk` 喂 `(t0)` → `(t0+200ms)` → `(t0+600ms)` 三块（各 3200 样本）⇒ 文件字节数 == `44 + (3200 + 3200 + 200*16 + 3200 + 400*16) * 2`（**逐字算式**）且 `samples_written` 相等 | **M1**：把 `silence_gap_samples` 恒返回 `Some(0)` | **M1 后期望**：字节数少 ⇒ 红（**证明补静音真的写了字节**） |
| **V2** | **失效安全：时间戳缺失 ⇒ 纯追加 + `aligned = false`，且样本一个不丢**：喂 `(Some(t0))` → `(None)` → `(Some(t0+1s))` ⇒ `aligned == false`；样本总数 == 三块之和（**没有任何补零**）；**写盘未中断** | **M2**：时间戳缺失时**跳过该块**（丢样本）；**M2b**：时间戳缺失后**继续补静音** | **M2 后期望**：样本数少 ⇒ 红（**R5.5-b 逐字「不得丢样本」**）；**M2b 后期望**：`aligned` 仍 `true` 或仍补零 ⇒ 红 |
| **V3** | **失效安全：非单调 ⇒ 同上**：`(Some(t0+1s))` → `(Some(t0+500ms))` ⇒ `aligned == false` 且**回退块照常写入**（不被丢弃、不产生负长度） | **M3**：回退时 `saturating_sub` 造出 0 长度并**保留 `aligned = true`** | **M3 后期望**：`aligned` 仍 `true` ⇒ 红 |
| **V4** | **`aligned` 自证量不得恒 true**：sidecar 缺省 `aligned = false`（历史录音）；**只有**「全程有单调时间戳」的会话 ⇒ `true` | **M4**：`finalize` 写 sidecar 时恒写 `aligned: true` | **M4 后期望**：T22 的 V4 红（**跨任务互证**）+ 本任务的 sidecar 断言红 |
| **V5** | **批量 ≡ 增量（对拍）**：`alignment_plan` 的输出与逐块调用 `silence_gap_samples` **逐元素相等**（≥7 条夹具各跑一次） | **M5**：把批量的边界处理改成「只对第 1 条用 `prev_end_ms = None`，其余用块起点」 | **M5 后期望**：某条夹具上不等 ⇒ 红 |
| **V6** | **超大空档不写巨量静音**：空档 > `MAX_GAP_MS` ⇒ `None`（不补）且 `aligned = false` | **M6**：把上限删掉 | **M6 后期望**：一条 1 小时的"空档"当场分配 115 MB 缓冲 ⇒ 红（**该变异必须在小上限的夹具上跑，避免真分配**） |
| **V7** | **`@ai-context` 不再自相矛盾**：`audio_store.rs` 剥注释后**不再**含「实时链路当前不落盘」的**断言式**表述（改为历史注记 + 更正说明）；且文件含「已落盘」与三个接线点行号 | **M7**：把更正句删掉、还原旧句 | **M7 后期望**：探针报「仍含旧断言」⇒ 红 |
| **V8** | **ADR-013 加注齐备**：新增节含 `aligned` / 补静音 / **历史录音不对齐** 三个关键串，且**上格原文的 diff 为纯新增**（`git diff` 里**不出现以 `-` 开头的既有行**） | **M8**：删掉「历史录音不对齐」那一句 | **M8 后期望**：探针报缺 1 串 ⇒ 红 |
| **V9** | **§10 审查记录存在**：报告里含逐条 §10 记录（5 条），且 `live_session_loop.rs` 的 diff **只有 `:162-164` 一处**（`git diff --numstat` 的新增 ≤2 行） | —（报告级判据） | 记录齐备 + diff ≤2 行 |
| **V10** | `cargo test --test app_lib_tests` exit 0 + 逐字读数（**本任务的单测数必须被数出来**）· `clippy` 不增（15）· `line-limits` exit 0（两个新 `.rs` ≤300）· `tsc`/`vitest`/`docs-check`/`registry` 全绿 | — | 全绿 |

**提交信息**：① `feat(audio): 新建 WAV 与会话轴对齐纯函数`（subject 18 字）② `fix(audio): 写块按时间戳补静音对齐`（subject 16 字）

**诚实边界**：① 🔴 **补静音后的"对齐"只保证 WAV 轴 ≡ 会话轴**，**不保证**「`segments.start_ms / 1000 == audio.currentTime` 在真机上成立」—— 后者还取决于 D3/D4/D5/D6（每次暂停丢未满块 ≤300ms / 停止丢尾块 ≤200ms / 逐包重采样亚样本余数，**量级未实测**）⇒ **本任务收掉 D1/D2（最主要的两条），D3–D6 逐字登记为残余**；② **D2 的实际量级仍是【推断】**（`probe-audio-runtime` 附 A 逐字：本机不能运行）⇒ 报告**不得**写"实测漂移 X ms"；③ **sidecar 新增了一个磁盘文件**（每个会话 1 个小 JSON）⇒ 它**不在**清理逻辑的扫描面内（`cleanup` 只删 `.wav`，`audio_store.rs:155` 的 `extension() == "wav"` 过滤）⇒ **孤儿 sidecar 会随会话删除而残留** —— 如实登记（与 PB1 登记的"删会话不删音频"同族）；④ **`write_chunk` 的签名变更是对既有测试的必要连带**（`audio_store_tests.rs` 的 4 处 `write_chunk` 调用点必须改签名）⇒ 这属**必要连带**（同 T5 的「算术后果」口径），**报告必须逐条点名**，且**不改任何断言的期望值**（只改调用形态）；⑤ **超大空档的上限 `MAX_GAP_MS` 是本计划定的手感/安全参数**（R5.5-b 未给值）⇒ 须控制方追认，见 `## 待裁决清单` #8；⑥ **本任务不改暂停语义**（R5.5-b 澄清逐字「**暂停本身不产生偏移**」）⇒ `live_session_pause.rs`（353）**零改动**。

---

### Task 24: `SessionViewSlot` 注入槽（音频引用的**唯一**过桥点）

> **依据**：`views/registry.ts:37` 逐字「会话视图槽：全部由**容器**注入 ⇒ 视图自身零 `invoke`、零 `@tauri-apps`（C14②）」+ `architecture.guard.test.ts:166-168` 的 **A3③**（`views/**` 生产文件**含 `import type` 在内**零 `@tauri-apps` 边）。⇒ 🔴 **播放头所需的两样东西（`invoke("session_audio_path")` 与 `convertFileSrc`）都在 `@tauri-apps` 面上 ⇒ 它们只能在 `components/**` 容器侧出现，视图侧只收注入值。**

**目标**：给 `SessionViewSlot` **追加可选槽**（音频引用 + 播放位置/聚焦回调），并在容器侧（`components/session-detail/**`）新建**唯一**的取数 + URL 拼接模块；**`views/**` 的 A3③ 判据保持绿**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/views/registry.ts` | **109** | 否（余 191） | 否 | `SessionViewSlot` **追加** 3 个**可选**只读槽（**既有 9 个字段一字不动、顺序不变**）；⚠️ **不新增运行时 import**（该文件的 A2①②③ 判据都在守它） |
| `app/src/components/session-detail/useSessionAudio.ts` | **不存在（新建）** | — | 否 | 新建（**唯一** `invoke` + `convertFileSrc` 点），预算 **≤120** |
| `app/src/components/session-detail/useSessionAudio.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `app/src/components/session-detail/SessionViewHost.tsx` | **136** | 否（余 164） | 否 | 把槽透传给非默认视图（`slot` 对象已整体透传 ⇒ **可能零改动**；若需合并新槽 ⇒ `useMemo` 里合并，+≤8 行） |
| `app/src/components/session-detail/SessionViewHost.test.tsx` | **250** | 否（余 50） | 否 | **只追加**（既有槽夹具用 `as` 或 `satisfies` 构造 ⇒ 可选槽不破坏它们；报告须复核） |

**Interfaces:**
- Produces（**追加到 `SessionViewSlot`，全部可选**）：
  ```ts
  /** 音频引用（null=无音频；undefined=尚未取到）。**只允许容器侧填充**。 */
  readonly audio?: SessionAudioState | null;
  /** 播放头位置（毫秒，会话轴）；null=无播放头 */
  readonly playheadMs?: number | null;
  /** 请求跳到某毫秒（视图 → 容器；容器负责 setState + 播放头动效） */
  readonly onSeekMs?: (ms: number) => void;
  ```
  ```ts
  export interface SessionAudioState {
    /** 可播放 URL（`convertFileSrc(path)` 的产物）；null=路径不可得 */
    readonly url: string | null;
    /** WAV 轴是否与会话轴对齐（T23/T22；false ⇒ UI 必须如实降级） */
    readonly aligned: boolean;
    /** 只有已 finalize 的 WAV 才可播（T22 的 durationMs 判据） */
    readonly playable: boolean;
    readonly durationMs: number | null;
  }
  ```
- 🔴 **`useSessionAudio` 的三条硬约束**：① **只用 `<audio src>`，禁止 `fetch()` 取音频**（R5.5-b 约束 2：不带 `Range` 的 200 分支会把 115 MB 读进内存 ⇒ **新守卫见 T25 V6**）；② **录制中禁用播放**（`playable === false` ⇒ UI 禁用 + 一行 `StatusLine kind="error"`，**不是** toast）；③ **失败静默降级**（`invoke` 抛 ⇒ `audio = { url: null, aligned: false, playable: false, durationMs: null }`，**不阻断页面**）。

- [ ] **Step 1: `registry.ts` 加三个可选槽**（`readonly ...?`；`@ai-context` 写清 Why = 播放头必须在 `views/**` 的零 `@tauri-apps` 边界内工作 ⇒ 取数与 URL 拼接**只能**在容器侧）
- [ ] **Step 2: `useSessionAudio.ts`**（`invoke<SessionAudioRef | null>("session_audio_path", { sessionId })` ⇒ `convertFileSrc(ref.path)` ⇒ 组装 `SessionAudioState`；**幂等**：`sessionId` 不变不重取；`invoke` 抛 ⇒ 降级对象）
- [ ] **Step 3: `SessionViewHost` 透传**（若 `slot` 已整体透传 ⇒ 只加 `@ai-context` 一行；否则在 `createElement(LazyView, slot)` 前 `useMemo` 合并）
- [ ] **Step 4: 八门禁 + 提交**（**必须**额外跑 `npx vitest run src/views/architecture.guard.test.ts` 并给读数 —— A2③/A3③ 是**本任务的风险面**）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **A3③ 仍绿**：`npx vitest run src/views/architecture.guard.test.ts` 全绿（`views/**` 生产文件 0 条 `@tauri-apps` 边，**含 `import type`**） | **M1**：在 `views/session/SessionTriTrackView.tsx` 顶部加 `import { convertFileSrc } from "@tauri-apps/api/core";` | **M1 后期望**：A3③ 红（**证明这条边界有牙，且本任务没越界**） |
| **V2** | **A2③ 仍绿**：`views/**` 不导入 `pages/**` / `shell/**` | **M2**：在 `views/session/SessionTriTrackView.tsx` 加 `import { columnSpec } from "../../shell/columnRegistry";` | **M2 后期望**：A2③ 红 |
| **V3** | **槽契约向后兼容**：既有 9 个槽字段**逐字仍在且顺序不变**（探针：读 `registry.ts` 的 `SessionViewSlot` 接口体，断言既有 9 个字段名的**相对顺序**不变 + 新增 3 个在**末尾**） | **M3**：把 `detail` 挪到末尾 | **M3 后期望**：顺序判据红（**这条防"顺手重排"**，`types_contract_tests.rs` 的同类精神） |
| **V4** | **降级对象**：`invoke` 抛 ⇒ `audio.url === null && audio.playable === false`，**页面仍渲染**（不含未捕获异常） | **M4**：把 `catch` 删掉 | **M4 后期望**：渲染抛 ⇒ 红 |
| **V5** | **URL 由 `convertFileSrc` 拼**：`audio.url` 的形态 == `convertFileSrc(path)` 的返回值（jsdom 下 `convertFileSrc` 不存在 ⇒ **桩必须注入**；⚠️ 不得把 jsdom 的 `performance` 挂 `globalThis`） | **M5**：改成 `url = ref.path`（裸路径当 URL 用） | **M5 后期望**：`url` 不以 `http://asset.localhost/` 开头 ⇒ 红 |
| **V6** | `tsc` 0 错 · `vitest` 全绿（用例只增不减）· 六类棘轮全绿 · `line-limits` exit 0（新文件 ≤300） | — | 全绿 |

**提交信息**：`feat(session): 加音频引用注入槽与取数钩子`（subject 18 字）

**诚实边界**：① 🔴 **本任务不渲染任何播放头**（归 T25）⇒ 结束时 `audio` 槽**有值但无消费者**（**有意的两步**，报告须写明）；② **`convertFileSrc` 在 jsdom 里不存在**（它是 `window.__TAURI_INTERNALS__` 的方法）⇒ 测试**必须**注入桩；**桩不得** 挂 `performance`（R8.3）；③ **`aligned === false` 的 UI 语义在本任务不定**（视图侧怎么显示归 T25）—— 本任务只保证**这个布尔真的传到了视图侧**且**不恒 false/true**；④ 「导入会话无音频」在本任务的落点是 `invoke` 返回 `Ok(None)` ⇒ `audio = { url: null, … }`；**UI 如何区分"导入会话"与"采集会话但音频被清理"** ⇒ 本任务**不引入新的会话类型判据**（`Session.kind` 今天只有 `photo`/video 类，**没有"导入"标记** —— 这是 PB1 登记的边界）⇒ **走"有音频/无音频"二分**，**不猜来源**。

---

### Task 25: 时间轨 + 播放头（`SessionTriTrackView` 的注入式扩展）

> **依据**：R5.5 逐字「承载面 = **转写段的毫秒时间轴轨道 + 播放头**（数据零新面：`segments[].start_ms/end_ms`）」+ 判据边界逐字「**元素级 `scrollTo` 可用且精确**（`scrollTop` 逐点 0/52.5/90/120）⇒ 播放头定位判据可做；**`window` 目标不可用**」+ PB1 Q4-a 逐字「**"时间轨"这一半今天已经存在且已可进入**（`SessionTriTrackView.tsx` 批 5 已交付）—— **但它没有播放头**…也**不渲染图片**」。

**目标**：在 `views/session/SessionTriTrackView.tsx` 上加「**共享的可视时间轴**」（今天三轨是**并排列、无共享刻度**）+ **播放头**（读注入的 `playheadMs`，元素级 `scrollTo` 定位）+ **优雅降级**（音频不可得/加载失败 ⇒ 时间轨仍可用、播放头退化为「当前聚焦段」指示器 + 一行 `StatusLine kind="error"`）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/views/session/SessionTriTrackView.tsx` | **207** | 否（余 93） | 否 | 加时间轴尺 + 播放头（+≤80 行；⚠️ **写者队列 T25 → T27 → T31**） |
| `app/src/views/session/SessionTriTrackView.test.tsx` | **239** | 否（余 61） | 否 | 追加（既有 5 例**逐字不动**） |
| `app/src/components/session-detail/TimeRail.tsx`（或并入视图文件） | **不存在（新建）** | — | 否 | 新建，预算 **≤120**；⚠️ 若放 `components/**` ⇒ 零裸 `<button>`；**若放 `views/session/**` ⇒ 零 `@tauri-apps`** |
| `app/src/ui/primitives/StatusLine.tsx` | **94** | 否 | 否 | 🔴 **零改动**（降级提示**复用**既有 `StatusLine kind="error"`） |

- [ ] **Step 1: 时间轴尺**（一条横向 ms 轴：总长 = `max(segments.end_ms, screens.last_seen_ms, ocr.timestamp_ms)`（**派生口径必须逐字登记**）；刻度用 `fmtMs` 的唯一出口）
- [ ] **Step 2: 播放头**（`playheadMs` 注入；定位用**元素级** `scrollTo({ left })`（**不用 `window`**）；滚动容器上**先查**有没有既有 `scroll` 监听（`## 陷阱` #B9-③ 的纪律））
- [ ] **Step 3: 降级**（`audio.url === null || !audio.playable || loadFailed` ⇒ ① 时间轨**仍可用**；② 播放头退化为「当前聚焦段」指示器（`activeMs` 由用户输入驱动）；③ **一行** `<StatusLine kind="error">`（**不是 toast**，R5.5-b 逐字）；④ `aligned === false` ⇒ 该行文案改为「**无时间基准，定位为近似**」（**不得**说"未对齐"）
- [ ] **Step 4: `<audio src>` 元素**（**只许 `<audio src={audio.url}>`**；`preload="metadata"`；**禁止 `fetch()`**）
- [ ] **Step 5: 八门禁 + 两个提交**（轨 / 播放头+降级）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **元素级 `scrollTo` 精确**（尖刺实测的可判部分）：设 `scrollLeft` 目标 `0/52.5/90/120` 四点 ⇒ 逐点 `scrollLeft` **逐字相等**；**且**断言 `window.scrollTo` **未被调用**（spy） | **M1**：把元素级 `scrollTo` 换成 `window.scrollTo` | **M1 后期望**：jsdom 抛 `Not implemented: Window's scrollTo()` 且读数恒 0 ⇒ 红（尖刺实测） |
| **V2** | **播放头位置 = 注入值**：`playheadMs = 52500` ⇒ 播放头元素的 `data-ms === 52500`（**双断言**：位置样式 + `data-ms`） | **M2**：把播放头位置写成常量 0 | **M2 后期望**：`data-ms` 仍 0 ⇒ 红 |
| **V3** | **降级（音频不可得）**：`audio = { url: null, … }` ⇒ ① 时间轨**仍在 DOM**（`data-testid` 存在）；② 恰 **1** 个 `StatusLine kind="error"`（**不是** toast：断言 `querySelector('[data-testid*="toast"]') === null`）；③ 播放头元素仍在（退化为聚焦指示器） | **M3**：把降级分支写成 `return null`（整块不渲染） | **M3 后期望**：时间轨消失 ⇒ 红（**R5.5-b 逐字「时间轨仍可用」**） |
| **V4** | **`aligned === false` 的文案**：渲染出的提示文案含「**无时间基准**」/「**近似**」，**不含**「未对齐」「未同步」这类**断言式**措辞 | **M4**：把文案改成「本录音未对齐」 | **M4 后期望**：红（`## 陷阱` #B9-① 的「标签不许说谎」） |
| **V5** | **未 finalize ⇒ 禁用播放**：`playable === false` ⇒ 播放控件 `disabled` **且** 有**一行** `StatusLine kind="error"`（**不是** toast） | **M5**：把 `playable` 判断删掉 | **M5 后期望**：红（**R5.5-b 约束 3**） |
| **V6** | 🔴 **禁止 `fetch()` 音频（硬守卫）**：`app/src/**` 剥注释后，**任何**对音频 URL 的 `fetch(` **0 命中**；仪器双侧自证（现状实测：`app/src` 的 `fetch(` **总命中 0** ⇒ **基线即为 0，本任务必须保持 0**） | **M6**：在 `useSessionAudio.ts` 加 `await fetch(audio.url)` | **M6 后期望**：命中 1 ⇒ 红（**R5.5-b 约束 2 的机器判据**：200 分支会把 115 MB 读进内存） |
| **V7** | **`<audio>` 属性契约**（R5.5-b 逐字「判据只许用可测部分…`<audio>` 的**属性契约**（`src`/`preload`/`onTimeUpdate` 绑定存在）」）：渲染出的 `<audio>` 有 `src`、有 `preload`、且 `onTimeUpdate` 处理器已绑定（jsdom 里断言 `onTimeUpdate` 不为 null 或 `addEventListener("timeupdate")` 被调用） | **M7**：把 `onTimeUpdate` 删掉 | **M7 后期望**：绑定缺失 ⇒ 红 |
| **V8** | **视图层零 `invoke`**：`views/session/SessionTriTrackView.tsx` 与新建的 `TimeRail`（若在 `views/**`）里 `invoke(` / `@tauri-apps` **0 命中**（剥注释；阳性对照：`components/session-detail/useSessionAudio.ts` 必须命中） | **M8**：在视图里直接 `invoke("session_audio_path")` | **M8 后期望**：命中 1 ⇒ 红 + A3③ 红（**两处互证**） |
| **V9** | `line-limits` exit 0（`SessionTriTrackView.tsx` ≤300 —— **报告给改后实测行数**）· `tsc` 0 错 · `vitest` 全绿（既有 5 例逐字通过） | — | 全绿 |

**提交信息**：① `feat(session): 加共享时间轴尺`（subject 13 字）② `feat(session): 加播放头与音频降级提示`（subject 17 字）

**诚实边界**：① 🔴 **真实媒体播放与 seek 在本环境不可验证**（jsdom 无媒体栈；headless Edge 不说 `asset:` 协议；真机/WebView2 用户已裁决跳过）⇒ V7 判的是**属性契约**，**不是**「真的能播/能 seek」；**报告不得**出现「播放已可用」「seek 已验证」；② **`window` 级滚动不可用是尖刺实测**（读数恒 0 + 抛 `Not implemented`）⇒ 本任务**只用元素级**；③ **总时长的真源是派生的**（`max(end_ms)`）—— 有音频时 `durationMs` 也在，**两者可能不等**（D3–D6 残余）⇒ UI 用**哪一个**必须定一个真源并写明（**本计划取「有音频且有 `durationMs` ⇒ 用 `durationMs`；否则用派生值」**）；④ **本任务不改 `views/registry.ts` 的清单**（`tritrack` 早已注册，`views/registry.ts:76`）⇒ **零新增视图**；⑤ **播放头的"掠过几帧缩略"不在本任务**（归 T31）。

---

### Task 26: `[[ts:ms]]` 接上 ms（产品兑现点）

> **依据**：R5.5 逐字「**今天最接近的东西** = `NoteMarkdown.tsx:213-225` 的 `[[ts:ms]]` 回链 span —— 它**把 ms 用在 title 文案里、点击时丢弃 ms 只跳会话** ⇒ 本动效的**第一件事**就是把这个 ms 接上（这是「每句话可追溯」的产品兑现点）」+ R5.5 顺带登记④同款。
> **本计划者实测（R11.7 口径）**：`components/NoteMarkdown.tsx` = **266** 行；`[[ts:ms]]` 处理器在 **`:212-231`**（PB1/recon-b 写的 `213-225` 是**批 5 T12 之前的旧读数**，本计划者逐行复核为 `:212-231`）。

**目标**：让 `[[ts:ms]]` 的点击**真的把 ms 传出去**（今天 `onClick` 只 `onOpenSession?.(note.session_id)`）；**追加可选回调**，不改既有签名 ⇒ **零既有断言改动**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/NoteMarkdown.tsx` | **266** | 否（余 34） | 否 | 加 1 个**可选** prop `onOpenSessionAt?: (sessionId: number, ms: number) => void;` + `onClick` 分支（+≤8 行） |
| 调用点（`NotePreviewView.tsx` / 笔记页宿主） | **未逐文件实测**（报告须补） | — | 否 | 注入 `onOpenSessionAt`（**取数在调用点**：它再经 T25 的 `onSeekMs` 落到播放头）；**调用点若为 `notes/**` 且超预算 ⇒ STOP 报控制方** |

**Interfaces:**
- Produces：
  ```ts
  /** `[[ts:ms]]` 回链：跳会话**并**把 ms 一起带出去（缺省时退回既有 onOpenSession） */
  onOpenSessionAt?: (sessionId: number, ms: number) => void;
  ```
  ⚠️ **`title` 文案与实现必须一致**（`:225` 逐字「⏱ 跳转到会话 … 处 —— 点击查看视频对应片段」）⇒ 接上 ms 后**该文案才第一次成为真话**；若控制方要求改文案，**必须**同步改（本计划**不改文案**：它描述的行为**接上 ms 后即成立**）。

- [ ] **Step 1: `NoteMarkdown.tsx` 加可选回调 + `onClick` 分支**（`onOpenSessionAt ? onOpenSessionAt(note.session_id, ms) : onOpenSession?.(note.session_id)`）
- [ ] **Step 2: 调用点接线**（把 ms 送到「会话详情 + 聚焦 ms」的通路；⚠️ 会话侧今天的深链机制是 `focusGroupId` 式的 prop 消费 —— **本计划取最小通路**：调用点保存 `pendingSeekMs`，`SessionViewHost` 的宿主把它传给 `tritrack` 视图的 `playheadMs`/`onSeekMs` 槽）
- [ ] **Step 3: 测试**（`NoteMarkdown.test.tsx` 或新建：`[[ts:52500]]` 点击 ⇒ `onOpenSessionAt` 收到 `(sessionId, 52500)`；**不传** `onOpenSessionAt` ⇒ 退回 `onOpenSession`（**向后兼容**））
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **ms 真的传出去**：渲染 `[[ts:52500]]` ⇒ 点击 ⇒ `onOpenSessionAt` 被调用**恰一次**，实参 == `(sessionId, 52500)`（**双断言**：调用次数 + 实参） | **M1**：把 `onClick` 改回只 `onOpenSession?.(note.session_id)` | **M1 后期望**：`onOpenSessionAt` 0 次调用 ⇒ 红（**这就是"今天的行为"**） |
| **V2** | **向后兼容**：不传 `onOpenSessionAt` ⇒ 点回链仍调 `onOpenSession(sessionId)`（既有行为**一字不变**） | **M2**：把分支写成只在有 `onOpenSessionAt` 时才调任何回调 | **M2 后期望**：`onOpenSession` 不再被调用 ⇒ 红 |
| **V3** | **ms 逐字保真**：`[[ts:0]]` / `[[ts:1]]` / `[[ts:59999]]` / `[[ts:3600000]]` 四个边界 ⇒ 收到的 ms **逐字**等于方括号里的整数（**不得**经 `Math.floor(ms/1000)*1000` 之类的截断） | **M3**：把 `ms` 换成 `sec * 1000` | **M3 后期望**：`[[ts:59999]]` 收到 `59000` ≠ `59999` ⇒ 红（**today 的 `title` 正是按秒截断的 —— 这条防"把 display 的截断带进语义"**） |
| **V4** | **非 ts 链接不受影响**：普通 `[a](https://x)` ⇒ 仍渲染 `<a href>`、**不**调任何 session 回调 | —（反例守卫，必须绿） | 绿 |
| **V5** | **`NoteMarkdown.tsx` ≤300**（改后实测）· `tsc` 0 错 · `vitest` 全绿（用例只增不减）· `line-limits` exit 0 | — | 全绿 + 逐字行数读数 |

**提交信息**：`feat(notes): 时间戳回链接上毫秒定位`（subject 16 字）

**诚实边界**：① **本任务只把 ms 送到"聚焦"通路**，**不保证**「到了会话页真的会跳播放头」—— 那一段由 T24/T25 的槽接线承担（**跨文件的两步**，报告须写明依赖）；② **`[[ts:ms]]` 的产出方**（笔记生成时写入 ms 的那一端）**本任务不检查**（若上游写的是错的值，接上 ms 也只是把错值传得更远）—— 登记为**上游数据质量**问题（不在批 6 面）；③ **`title` 文案按秒显示（`${min}:${secStr}`）与语义 ms 不一致**是**既有的、有意的**（显示截断 ≠ 语义截断）⇒ 本任务**不动显示格式**。

## 波 C · 6 个签名动效（T27–T33）

> **本节由 P2 续写单元定稿**，逐条覆盖 **R5.1–R5.7**（形态照裁决，**结论一字不改**）。
> 🔴 **R5 通则（每个动效四者缺一即不达标）**：① **起始态被持有**（可反向的状态源）② **可中断**（下一个输入接管，**不排队**）③ **reduced-motion 下正确降级**（**跳终态**）④ **三档（节能 / 标准 / 丰富）下的三档行为**。⇒ **本波每个任务节的 Verification 表必须含四行对应判据**（`V持有` / `V中断` / `V降级` / `V三档`），**缺一即该任务不达标**（§8.6.1 第 1/3 条 + §11-10）。
> 🔴 **入库条件**：全部动效**必须**经 **T11 的 `startControllable`** 建 timeline，否则「可中断可反向」的判据形同虚设；**确定性推进只用** `gsap.timeline({paused:true})` + `tl.time(t)`（**禁用** `updateRoot`/`ticker.tick()`/`ticker.sleep()`/`await sleep()`，R8.1）；**可中断判据必须双断言**（tween 计数 **且** 属性值，R8.2）。
> 🔴 **`data-tone` 的落点登记（R3.4）**：本波每个动效落点必须显式声明基调 —— **#1/#3/#4/#5 → `instrument`**（有读数）· **#2/#6 → `paper`**（有文字）· **列折叠 Flip → `instrument`**（列是"读数"面）。
> 🔴 **三档的落点在前端不在 CSS**：CSS 侧的档位倍数在 T6 已落；GSAP 侧读档必须经 **`motion/intensity.ts` 的 `readIntensity()`**（或由容器注注入），**每个动效的 `startControllable` 调用点必须显式传档**，且**档位变化时必须重新取值**（`eco` ⇒ **直接跳终态**）。

---

### Task 27: #1 对齐（三轨按 `data-ms` 共轴 + 非对齐轨位移偏移 ≤8px）

> **依据**：R5.1 逐字「形态裁定：『错位』= 三轨条目按 `data-ms` 共轴时，非对齐轨施加**位移偏移**（**上限 8px**，见 R3.5），交互动效把它们滑到对齐位 + 同 ms 条目高亮共轴关系。**第三轨 = OCR**（§8.6 批 5 加注逐字）。反向 = 再次触发（对齐 → 错位）或切走再回。可中断 = 新输入接管」。
> ⚠️ R5.1 逐字「规格未定义『错位语义』的**形态** ⇒ 本裁决**即为**定义，实施者**不得**另行发明；若与用户本意不符，用户可否决」⇒ 进 `## 待裁决清单` #1。

**目标**：在已建的时间轴尺（T25）之上，把三轨条目按 `data-ms` **共轴**；触发「对齐」时非对齐轨条目**滑到对齐位**（位移 ≤8px，经 `motion/shift.ts` 的 `clampShift`），同 ms 的三个条目**高亮共轴关系**；**可反向**、**可中断**。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/views/session/SessionTriTrackView.tsx` | T25 后 ~285 | ⚠️ **接近**（须实测） | 否 | 加对齐动效（+≤15 行）；🔴 **若破 300 ⇒ 把动效抽成 `views/session/useTriTrackAlign.ts`**（新文件）⇒ 视图只留调用 |
| `app/src/views/session/useTriTrackAlign.ts` | **不存在（新建）** | — | 否 | 新建（**唯一**的 `startControllable` 调用点 + 状态源），预算 **≤110** |
| `app/src/views/session/useTriTrackAlign.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤220** |
| `app/src/views/session/SessionTriTrackView.test.tsx` | **239**（T25 后更高） | 否（余 61） | 否 | **只追加**（既有 5 例逐字不动） |
| 🔴 **`views/**` 不得静态 import `motion/engine.ts`** | — | — | — | R11.1 连带②：**需要 `useGSAP` 的组件自身必须在动态 import 链上** ⇒ `tritrack` 视图**是**动态 import 的（`registry.ts:76` 的 `load: () => import(...)`）⇒ **可以**用 `await import("../../motion/engine")`；**但不得**改成静态 import（否则 `engine.ts` 进首屏闭包 ⇒ T4 V2/V2b 红） |

**R5 通则四条的落点（本任务的答案，逐条给机制）**

| 条 | 机制（写进 `@ai-context`） |
|---|---|
| ① **起始态被持有** | `aligned: boolean` **是持有的 state**（不是一次性 tween 的副作用）；`aligned === false` ⇒ 渲染时**立即**把非对齐轨的偏移写回（`clampShift(±8)` 的静态值），**再触发** ⇔ 从**当前** `aligned` 反向播到另一端 |
| ② **可中断** | 每次触发都 `interrupt()`（T11 的出口负责 `kill` 旧 timeline）+ 用新档位/新 `aligned` 重建；**不排队**（第 3 次点击不会等前两次播完） |
| ③ **reduced-motion 降级** | `installMatchMediaStub({reduce:true})` 或 `readIntensity() === "eco"` ⇒ **直接落终态**（`aligned` 的静态渲染值），**不创建 tween**（`tweenCount(el) === 0`） |
| ④ **三档行为** | `eco` = 跳终态（零时长）；`standard` = 时长为 `--ed-dur-card`(220ms) 档、位移 8px；`rich` = 时长加长（`--ed-dur-reveal`(500ms) 档 + 错开 `stagger` 更明显）、位移**仍 ≤8px**（R3.5 是**上限**，`rich` 只加时长与错开） |

- [ ] **Step 1: `useTriTrackAlign.ts`**（`@ai-context` 逐字写 R5.1 的「错位语义」定义 + 四条的机制 + 「第三轨 = OCR 不是笔记」）
- [ ] **Step 2: 视图接线**（三轨条目按 `data-ms` 分组；同 ms 组加高亮类（**必须是 `<既有基类>--<修饰>` 形状**）；非对齐轨条目加偏移（**只经 `clampShift`**））
- [ ] **Step 3: 测试**（四行判据，见 Verification）
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **共轴 + 同 ms 高亮**：同 ms 的三个条目（transcript/screen/ocr）都带共轴高亮类；DOM 顺序固定 **转写 → 画面 → OCR**（`compareDocumentPosition`，**既有判据**） | **M1**：把第三轨换成 `screens` | **M1 后期望**：OCR 条目不参与共轴 ⇒ 红（**R5.1 逐字「第三轨 = OCR」**） |
| **V2（持有）** | **起始态被持有**：`aligned` 在两次触发之间**可读且正确**；从 `true` 触发 ⇒ 偏移到 `false` 态；再触发 ⇒ 回到 `true` 态（**往返两次**都断静态值） | **M2**：把 `aligned` 改成每次触发都从常量 `false` 开始 | **M2 后期望**：第二次触发后仍停在 `false` 态 ⇒ 红（**证明"可反向"靠的是持有态而不是重放**） |
| **V3（中断，双断言）** | `interrupt()` 后 ① `gsap.globalTimeline.getChildren().length` 不增（或旧 tween `totalTime()` 冻结）**且** ② 目标元素 `style.transform` 等于**新** tween 的值 | **M3**：去掉 `interrupt()`（直接起新 tween） | **M3 后期望**：① 变 2 ⇒ 红（**只看 `style.transform` 的那一半仍绿 ⇒ 单断言假绿，这正是 R8.2 的实证**） |
| **V4（降级）** | `reduce:true` ⇒ `tweenCount(el) === 0` **且** 元素偏移已是**终态**静态值 | **M4**：降级分支不写静态值（只"不播动画"） | **M4 后期望**：偏移停在起始值 ⇒ 红（**"跳终态"≠"不播"**） |
| **V5（三档）** | 三档下 `timeline.duration()` 与 `stagger`：`eco` = 0（或不建 timeline）；`standard` = 220ms 档；`rich` > `standard`；**三档的位移上限都 ≤ 8px**（逐档断言） | **M5**：把 `rich` 的位移改成 `12px` | **M5 后期望**：红（**R3.5 的 8px 是上限，不是 standard 档专属**） |
| **V6** | **位移只经唯一出口**：`useTriTrackAlign.ts` 里出现的位移数值**全部**经 `clampShift(...)`（探针：文件里 `translate` / `x:` / `y:` 的数值实参**都**在 `clampShift` 调用内） | **M6**：直接写 `gsap.to(el, { y: 8 })` | **M6 后期望**：红（**证明 T9 的唯一出口真的被用起来了**） |
| **V7** | **首屏不受影响**：`motion/engine.ts` **仍不在** `main.tsx` 静态闭包内（T4 的 V2 复跑绿）；`useTriTrackAlign.ts` 里对 engine 的引用是 `await import(...)` | **M7**：改成静态 `import { gsap } from "../../motion/engine";` | **M7 后期望**：T4 V1/V2 红 + T4 V2b 红 |
| **V8** | `line-limits` exit 0（**新文件 ≤300**；若 `SessionTriTrackView.tsx` 破 300 ⇒ 抽取已完成，报告给两个文件的实测行数）· `tsc` 0 错 · `vitest` 全绿 | — | 全绿 |

**提交信息**：`feat(motion): 落三轨对齐签名动效`（subject 15 字）

**诚实边界**：① **「错位」的形态是本裁决的定义**（规格未定义）⇒ 与用户本意不符时**用户可否决**（`## 待裁决清单` #1）；② **jsdom 里三轨"真的错开多少像素"零可观测**（无排版）⇒ V5 判的是 **`clampShift` 的实参与 timeline 参数**，不是渲染结果；③ **「同 ms」的判定用 `data-ms` 严格相等** —— 真实数据里两条轨**极少**完全同 ms（`probe-audio-availability` 的 `screens.first_seen_ms` 与 `segments.start_ms` 是两条独立时间戳）⇒ 本动效在真实数据上**可能很少被触发**（登记为产品面的已知限制，**本批不改共轴容差**：引入容差 = 发明一个规格没有的数字）。

---

### Task 28: #2 显影编排（落点 = **课后** `SessionRawView`；节奏 = **字符率近似**）

> **依据**：R5.2 逐字「落点裁定 = **课后**（`SessionRawView.tsx` 的 `detail.segments.map`，`:87-102`）。采集期落点（`LiveActivityPanel` 513 行）**登记转批 7**…『节奏 = 语速函数』的**唯一可用近似** = `text.length / (end_ms - start_ms)`（**字符率，不是音节率**）。🔴 **必须在文件头逐字写明「这是字符率近似；规格未定义语速函数」**，且**不得**在任何报告/文档里声称它是真实语速」。
> 🔴 **复用 R11.3 的落点**：`SessionRawView.tsx:87-102` 的段正文 `<Text>` **同时**承载 T13/R11.3 的 `ed-text--low-confidence`（低置信墨度起伏）⇒ **两个动效共用一个元素**，本任务必须保证二者**不互相覆盖**（`animation` 与 GSAP 写的内联属性不冲突：前者动 `opacity`，后者动 `transform`/`color`）。

**目标**：把「原文」视图的转写段**逐段显影**（编排层 400–900ms）：段的入场节奏按**字符率近似**错开；**可中断**（用户滚动/切换视图接管）；**可反向**（折叠/重播）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/session-detail/SessionRawView.tsx` | **157** | 否（余 143） | 否 | 加 `data-tone="paper"` + 显影挂载点（+≤20 行）；⚠️ 写者队列 **T24 → T28**（**T24 不动本文件** ⇒ 实际唯一写者） |
| `app/src/components/session-detail/useRevealChoreography.ts` | **不存在（新建）** | — | 否 | 新建（**唯一** `startControllable` 调用点 + 字符率纯函数），预算 **≤130** |
| `app/src/components/session-detail/useRevealChoreography.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤220** |
| `app/src/components/session-detail/SessionRawView.test.tsx`（若不存在 ⇒ 新建） | **未实测**（报告须补） | — | 否 | 追加/新建 |

**节奏函数（本计划的唯一定义；🔴 文件头逐字写「**这是字符率近似；规格未定义语速函数**」）**
```ts
/** 字符率近似（**不是语速**）：字/毫秒。规格未定义语速函数 ⇒ 本函数是本批的唯一可用近似。 */
export function charRate(text: string, startMs: number, endMs: number): number;   // = text.length / max(endMs - startMs, 1)
/** 逐段错开时长（编排层 400–900ms 总量内；档位只许改总时长，不许改"顺序"） */
export function revealDelays(segments: readonly {text:string;start_ms:number;end_ms:number}[], tier: MotionIntensity): number[];
```

| 条 | 机制 |
|---|---|
| ① **起始态被持有** | `revealEpoch: number` 是**持有的 state**（每次"重播"递增）；渲染时按 `revealEpoch` 决定从**初态**（`opacity: 0` 由 CSS 类给，GSAP 只负责把它推到终态）还是**终态**开始 ⇒ 折叠/展开**可反向** |
| ② **可中断** | 用户滚动/切视图/再次进入 ⇒ `interrupt()`（kill 当前 timeline）+ 立即落终态（**不排队**） |
| ③ **reduced-motion 降级** | ⇒ 全部段落**直接终态**（`opacity: 1`），`tweenCount === 0` |
| ④ **三档行为** | `eco` = 跳终态；`standard` = 总时长落在 **400–900ms**（§8.1 编排层）；`rich` = 总时长加长（**上界 900ms 仍是硬上限**）且错开更明显 |

- [ ] **Step 1: `useRevealChoreography.ts`**（两个纯函数 + 一个 hook；`@ai-context` **逐字**写「字符率近似；规格未定义语速函数」）
- [ ] **Step 2: 视图接线**（段落容器加 `data-tone="paper"`；每段 `data-seg-id` 锚点；**不改** `:87-102` 的既有 DOM 结构与文案）
- [ ] **Step 3: 测试**（四行判据）
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **字符率近似（纯函数）**：`charRate("abcdef", 0, 3000) === 0.002`（**逐字**）；`endMs === startMs` ⇒ **不抛**且返回 `text.length / 1`；空文本 ⇒ `0` | **M1**：把分母改成 `(endMs - startMs) / 1000`（"每秒字符数"） | **M1 后期望**：值与逐字期望不等 ⇒ 红（**证明量纲被钉住**） |
| **V2** | 🔴 **文件头逐字声明**：`useRevealChoreography.ts` 的**文件头注释**逐字含「**字符率近似**」与「**规格未定义语速函数**」两个串；**且全仓**（`app/src/**` + 本计划 + 报告）**不出现**「真实语速」「实际语速」这类断言（探针：剥注释后 `语速` 的**每一处**命中都必须与「未定义/近似」同句） | **M2**：把声明句删掉 | **M2 后期望**：探针报缺 2 串 ⇒ 红 |
| **V3（持有）** | **起始态被持有**：`revealEpoch` 变化 ⇒ 段落从初态重播（`opacity` 初值由类给、终值由 GSAP 给）；再变一次 ⇒ 仍从初态开始（**往返两次**都断） | **M3**：把 `revealEpoch` 换成 `useState(0)` 但从不更新 | **M3 后期望**：第二次不重播 ⇒ 红 |
| **V4（中断，双断言）** | 起 timeline → `tl.time(0.1)` → `interrupt()` ⇒ ① `getChildren().length` 不增 **且** ② 段落 `opacity` 是**终值**（"立即落终态"） | **M4**：去掉 `interrupt()` 的"落终态"那一半（只 kill） | **M4 后期望**：`opacity` 停在中间值 ⇒ 红 |
| **V5（降级）** | `reduce:true` ⇒ 所有段落 `opacity === "1"` 且 `tweenCount === 0` | **M5**：降级分支只跳过 `play()` | **M5 后期望**：创建了 tween ⇒ 红 |
| **V6（三档）** | `standard` 的总时长 ∈ **[400, 900]ms**（§8.1 编排层区间，**逐档断言**）；`rich` > `standard` **且仍 ≤900**；`eco` = 跳终态 | **M6**：把 `rich` 总时长设成 `1200ms` | **M6 后期望**：> 900 ⇒ 红（**"丰富"不等于"越界"**） |
| **V7** | **与 R11.3 的共存**：低置信段落**同时**带 `ed-text--low-confidence`（CSS `animation` 动 `opacity`）**与**显影的 GSAP 内联 `transform` ⇒ 断言两者**互不覆盖**（类名仍在 **且** `style.transform` 有值） | **M7**：把显影改成 `gsap.to(el, { opacity: 1 })`（与 CSS animation 抢同一属性） | **M7 后期望**：红（**防"两个动效抢属性"** —— 这正是 `## 陷阱` #B10 登记的坑） |
| **V8** | **落点正确（课后而非采集期）**：`LiveActivityPanel.tsx`（513）`git diff --numstat` **空**；显影落点在 `SessionRawView.tsx` | **M8**：把显影接进 `LiveActivityPanel` | **M8 后期望**：diff 非空 ⇒ 红（**R5.2 逐字「采集期落点登记转批 7」**） |
| **V9** | `line-limits` exit 0 · `tsc` 0 错 · `vitest` 全绿 · **六类棘轮全绿**（`SessionRawView.tsx` 在棘轮域内） | — | 全绿 |

**提交信息**：`feat(motion): 落课后显影编排签名动效`（subject 16 字）

**诚实边界**：① 🔴 **「字符率」不是语速** —— 规格未定义语速函数（R5.2 逐字）⇒ 本批交付的是**一个可复现的近似**，**报告与文档一律不得声称它是真实语速**；② **`text.length` 对中日文 ≈ 字数、对英文 ≈ 字母数** ⇒ 同一段时长下英文段"看起来更慢"（**逐字登记，不修正**：修正需要语言判定，属发明）；③ **jsdom 里"显影看起来如何"不可判** ⇒ 只判**时长/顺序/opacity 值/中断状态**；④ **「滚动接管」的中断源**在本任务用**容器注入的回调**（滚动监听在采集期的 `LiveActivityPanel` 已是既有形态）；若注入点不可得 ⇒ **降级为「切视图接管」**并如实登记。

---

### Task 29: #3 相变凝固（与波 B 的相变两态**同批**）

> **依据**：R5.3 逐字「『波形收束成直线』的载体 = R4.3 的 `Waveform`（今天连波形都不存在，**必须**先建）；『琥珀退去』= R4.5；『导航淡入』= §6.3 的域 Tab 行（**绝对定位交叉淡入**）。可反向逐字成立（§8.6「可反向」）；冻结进度**必须**是持有的状态量」。
> R4.5 逐字：「相变凝固的『琥珀退去』= 采集态 LIVE 仪表/暂停徽标的 **`--ed-due` 族**元素在转入常态时**墨度退到常态档**。**不许**新造琥珀值」。

**目标**：采集态 → 常态的相变里，「波形收束成直线」（`Waveform` 的条高归一到同一基线）+「琥珀退去」（`--ed-due` 族元素墨度退到常态档）+「导航淡入」（`.ed-topbar` 交叉淡入）；**冻结进度是持有的状态量**、**可反向**（常态 → 采集态）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/Waveform.tsx` | T18 建（~150） | 否 | 否 | 加「收束」受控 prop（`settled?: boolean`）+ `startControllable` 接入（+≤20 行） |
| `app/src/shell/usePhaseFreeze.ts` | **不存在（新建）** | — | 否 | 新建（**持有的 `freeze: number`（0..1）** + 唯一 `startControllable` 调用点），预算 **≤120** |
| `app/src/shell/usePhaseFreeze.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤220** |
| `app/src/ui/primitives/motion.css` | T19 后 ~340（**已超 300 预算** ⇒ 见下） | 否（`.css` 不在门禁视野） | — | 加「琥珀退去」的 `--ed-due` 族墨度覆盖（+≤15 行） |
| `app/src/components/Waveform.test.tsx` | T18 建 | 否 | 否 | 追加（既有三例逐字不动） |

> ⚠️ **`motion.css` 的行数预算告急（T5→T6→T12→T13→T19→T29 六次追加）**：`.css` 不在门禁视野，但 R11.8 第 1 条要求「`motion.css` 仍按 ≤300 自律」。**若 T29 时实测 >300 ⇒ 拆成 `motion.css` + `motion.phase.css`（新文件，同目录）并在 `motion-coverage.test.ts` 的 `CSS_FILES` 域内自动纳入**（该守卫用 `readdirSync(HERE).filter(.css)` ⇒ **新 CSS 自动进域**）；**如实登记**、**不必** STOP。

| 条 | 机制 |
|---|---|
| ① **起始态被持有** | `freeze: 0..1` 是**持有的 state**（不是 tween 的进度读回）；反向 = 从当前 `freeze` 播回 0 |
| ② **可中断** | 相变中途再次切相位 ⇒ `interrupt()` + 从**当前** `freeze` 起新 timeline（**不排队**；`## 陷阱` #B10 的"从当前值接管"） |
| ③ **reduced-motion 降级** | ⇒ `freeze` 直接落终值（0 或 1），不建 tween |
| ④ **三档行为** | `eco` = 跳终态；`standard` = `--ed-dur-card`(220ms) 档；`rich` = `--ed-dur-reveal`(500ms) 档 + 三段（波形/琥珀/导航）错开更明显 |

- [ ] **Step 1: `usePhaseFreeze.ts`**（`@ai-context`：Why = 相位切换必须**可反向**且**可中断**；副作用 = 无；边界 = 无 `Waveform` 时仍可动；**`freeze` 的消费者是 3 个**（`Waveform` 条高 / `--ed-due` 族类的墨度 / `.ed-topbar` 的 `opacity`））
- [ ] **Step 2: `Waveform` 的收束**（`settled`/`freeze` ⇒ 所有条**同一高度**；**只动 `transform`/`scaleY` 与 `opacity`**，**不许动 `height`**（R8.4 的属性集合审计））
- [ ] **Step 3: 琥珀退去**（`motion.css`：`html[data-shell-phase="idle"]` 下，采集态的 `--ed-due` 族元素墨度退到常态档；🔴 **逐字锁定 `--ed-due` 族、不许新造琥珀值**）
- [ ] **Step 4: 导航淡入**（复用 T19 的交叉淡入，本任务只驱动 `freeze`）
- [ ] **Step 5: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **波形收束成直线**：`freeze === 1` ⇒ 所有条元素的**同一属性**（`transform`/`scaleY`）取值**全等**（集合大小 1）；`freeze === 0` ⇒ 取值**不全等**（≥2 个不同值） | **M1**：`freeze` 只改 `opacity` 不改条高 | **M1 后期望**：`freeze=1` 时条高集合仍 >1 ⇒ 红 |
| **V2** | **琥珀退去（逐字锁族）**：退去动效引用的颜色 token **全部**在 `--ed-due` 族内（探针：`motion.css` 的退去规则里出现的 `--ed-*` 颜色变量 ∈ `{--ed-due, --ed-due-*, …}`）；**且**全仓**不出现**新的琥珀字面量（`#f59e0b` / `#d97706` / `#b45309` 在 `motion.css` 与 `usePhaseFreeze.ts` **0 命中**） | **M2**：在退去规则里写 `color: #d97706` | **M2 后期望**：命中 1 ⇒ 红（**R4.5 逐字「不许新造琥珀值」**） |
| **V3（持有）** | **冻结进度被持有**：相变到一半（`tl.time(0.1)`）读取 `freeze` ⇒ `0 < freeze < 1`；**从该值反向**触发 ⇒ 终值回到 0（**往返断言**） | **M3**：把 `freeze` 换成 `tl.progress()` 的即时读回（不持有） | **M3 后期望**：反向时从 0 而不是从中途起 ⇒ 值序列不连续 ⇒ 红 |
| **V4（中断，双断言）** | 相变中途反向 ⇒ ① `getChildren().length` 不增 **且** ② 三个消费者（波形/琥珀/导航）的属性值**都**朝反向走（不是只有一个） | **M4**：只 `kill` 不重建（三个消费者停在中间值） | **M4 后期望**：属性值不再变化 ⇒ 红 |
| **V5（降级）** | `reduce:true` ⇒ `freeze` 落终值、`tweenCount === 0` | **M5**：降级分支不写终值 | **M5 后期望**：停在中间 ⇒ 红 |
| **V6（三档）** | 三档的 timeline 总时长：`eco` = 0；`standard` ≈ 220ms 档；`rich` > `standard` | **M6**：把 `eco` 设成 220ms | **M6 后期望**：红（**"节能档只留响应层"§8.5 逐字**） |
| **V7** | **属性集合审计**：本动效写的所有 CSS 属性 ⊆ `ANIMATABLE_PROPERTIES`（**特别：不含 `height`**） | **M7**：用 `height` 做收束 | **M7 后期望**：`animatedProps` 含 `"height"` ⇒ 红（**同时 T19 V1 的"不 animate height"也红**） |
| **V8** | `line-limits` exit 0 · `tsc` 0 错 · `vitest` 全绿 · `motion-coverage.test.ts` 全绿（新 CSS 若拆出 ⇒ 自动进域，名单仍须完整） | — | 全绿 |

**提交信息**：`feat(motion): 落相变凝固签名动效`（subject 15 字）

**诚实边界**：① **「波形收束成直线」在 jsdom 里只能判"属性全等"**（无排版）⇒ 观感面进 `## 诚实边界`；② **退去的"琥珀"是墨度档变化还是颜色插值** —— 本计划取**墨度档**（R4.5 逐字「墨度退到常态档」）⇒ **不改色值、只改墨度**（`opacity` 或 tone 类）；若实施者取颜色插值 ⇒ **必须**仍只用 `--ed-due` 族（V2 会红）；③ **本任务与 T19 共用一个相位通道** ⇒ 两任务之间**存在"相位 CSS 就位但冻结动效未接"的窗口**（同波内，登记）；④ **反向（常态→采集）**今天**没有真实入口**（用户从复习/常态**回**采集是靠"再开一次采集"而不是"切回采集相位"）⇒ V3 的反向用**测试驱动**的相位翻转，**真实交互路径的登记**见 `## 诚实边界`。

---

### Task 30: #4 刻度生长（复习面既有部件 + **精确** `intervalDays`）

> **依据**：R5.4 逐字「『答『忘了』则回缩』的驱动源 = `review_card` 的返回（前端已知的下一到期）」+ PB2 回收逐字「② **行派生路径 = 整天粒度**…**UI 上「答『忘了』则回缩」必须用 ① 的精确值**」+ PB2 Q5 逐字「`:92` **没有泛型、没有赋值** ⇒ `review_card` 的返回值**今天被前端整份丢弃**」。

**目标**：到期刻度（T21 的 `DueScale`）**生长**（到期越多/间隔越长 ⇒ 刻度越长）+ 评分后**回缩**（答「忘了」⇒ 刻度回缩）；回缩的驱动源 = **`review_card` 返回的 `intervalDays` 精确值**（⇒ **必须接住返回值** —— 今天 `ReviewSessionPanel.tsx:92` 丢弃它）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/review/DueScale.tsx` | T21 建（~140） | 否 | 否 | 加 `growTo`（受控）+ `startControllable` 接入（+≤25 行） |
| `app/src/components/review/useScaleGrowth.ts` | **不存在（新建）** | — | 否 | 新建（持有的 `length: number` + 唯一 timeline），预算 **≤110** |
| `app/src/components/review/ReviewSessionPanel.tsx` | **231** | 否（余 69） | 否 | 🔴 **`:92` 接住返回值**（`const updated = await invoke<Flashcard>("review_card", …)`）+ 把 `updated.intervalDays` 传给刻度（+≤12 行）；⚠️ 写者队列 **T30 → T32** |
| `app/src/components/review/ReviewSessionPanel.test.tsx` | **110** | 否 | 否 | **只追加**（既有用例逐字不动；⚠️ 今天 `invoke` 是 mock ⇒ 必须让 mock 返回带 `intervalDays` 的对象，**这不是改断言**而是**补 mock 的返回值形态** —— 报告须点名） |
| `app/src/components/review/DueScale.test.tsx` | T21 建 | 否 | 否 | 追加 |

| 条 | 机制 |
|---|---|
| ① **起始态被持有** | `length: number`（刻度长度，0..1 归一）是**持有的 state**；新到的 `intervalDays` **不是**直接设终值，而是**从当前值播向新值** ⇒ 可反向（把旧值播回去） |
| ② **可中断** | 连续评分 ⇒ 每次 `interrupt()` + 从**当前长度**起新 timeline（**不排队**；`## 陷阱` #B10） |
| ③ **reduced-motion 降级** | ⇒ `length` 直接落新值、`tweenCount === 0` |
| ④ **三档行为** | `eco` = 跳终态；`standard` = `--ed-dur-card`(220ms) 档；`rich` = `--ed-dur-reveal`(500ms) 档 + 生长带动"刻度微光"（T13 的 seam）更明显 |

- [ ] **Step 1: `useScaleGrowth.ts`**（`@ai-context`：Why = 「答忘了则回缩」是 §8.6 #4 的语义核心；**数据真源 = `review_card` 的 `intervalDays`（精确域）**；边界 = `intervalDays` 为 `undefined`（旧后端/mock）⇒ **不生长**（保持当前长度 + 不抛））
- [ ] **Step 2: 接住返回值**（`ReviewSessionPanel.tsx:92`；⚠️ **只改这一行的赋值形态，不改 `invoke` 的参数与时机**）
- [ ] **Step 3: 刻度生长/回缩接线**
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **返回值被接住**：以 mock 返回 `{ intervalDays: 10 }` 的 `review_card` 评分 ⇒ 面板**确实消费**了它（断言刻度的目标长度由 `10` 驱动，而不是由 `due` 计数驱动） | **M1**：把 `:92` 改回不赋值（丢弃返回值） | **M1 后期望**：刻度不动 ⇒ 红（**这就是 today 的行为**，PB2 Q5 逐字） |
| **V2** | **精确域（「忘了」⇒ 回缩）**：mock 依次返回 `intervalDays: 30` → `1`（`again`）⇒ 刻度从长回缩到短（**方向断言**：终值 < 起始值的 1/2） | **M2**：用 `dueAt` 差值算"间隔" | **M2 后期望**：本任务的「零自造」探针红（`dueAt\s*[-+]` 命中）+ T21 V2 红 |
| **V3** | **`intervalDays` 缺失 ⇒ 不生长**：mock 返回没有该字段的对象 ⇒ 刻度保持当前长度、**不抛**、**不猜** | **M3**：缺失时用 `0.0` 直接设长度 | **M3 后期望**：刻度被清零 ⇒ 红（**"缺失"≠"间隔为 0"**） |
| **V4（持有）** | 生长到一半（`tl.time(0.1)`）后读 `length` ∈ (0,1)；再给一个**更小**的目标 ⇒ 从**当前长度**反向播（**不跳回起点**） | **M4**：每次新目标都 `setLength(0)` 再播 | **M4 后期望**：值序列出现 0 ⇒ 红 |
| **V5（中断，双断言）** | 连续两次评分 ⇒ ① `getChildren().length` 不增 **且** ② 最终 `length` == 第二次的目标值 | **M5**：去掉 `interrupt()` | **M5 后期望**：① 变 2 ⇒ 红 |
| **V6（降级）** | `reduce:true` ⇒ `length` 直接等于新目标、`tweenCount === 0` | **M6**：降级分支不动 `length` | **M6 后期望**：停在旧值 ⇒ 红 |
| **V7（三档）** | 三档时长逐档断言（`eco` 0 / `standard` 220 档 / `rich` 500 档）；**三档的目标长度都相同**（档位只改时长，**不改语义**） | **M7**：把 `rich` 的目标长度也放大 | **M7 后期望**：目标长度不等 ⇒ 红（**"丰富"不得篡改读数**） |
| **V8** | `ReviewSessionPanel.tsx` ≤300（改后实测）· `tsc` 0 错 · `vitest` 全绿（**既有 110 行的用例逐字通过**）· `line-limits` exit 0 | — | 全绿 |

**提交信息**：`feat(motion): 落刻度生长与回缩动效`（subject 15 字）

**诚实边界**：① **「回缩」只对"本轮正在评的那张卡"可见** —— `ReviewPage` 的总到期数**不会**实时更新（`ReviewPage.tsx:86` 的 `token` 门控，且 `flashcards` 域**不在**事件总线，`:9-12` 逐字）⇒ **UI 上必须把刻度绑在"当前卡的间隔"而不是"总到期数"**，否则会出现"回缩了但总数字没变"的**自相矛盾观感**（登记为产品面限制）；② **`ReviewSessionPanel.test.tsx` 的 mock 需要补返回字段** ⇒ 这属**必要连带**（mock 形态），**不是**改断言；报告须点名；③ **jsdom 里"刻度长度"只能判数值**（无排版）⇒ 观感面进 `## 诚实边界`。

---

### Task 31: #5 时间码回跳（播放头沿时间轨滑到目标位置 + 掠过几帧缩略）

> **依据**：R5.5 逐字「承载面 = 转写段的毫秒时间轴轨道 + 播放头；『掠过几帧缩略』= `screens` 缩略图（`session_images_base_url` 已存在，`useSessionDetailData.ts:4-8` 逐字）」+ PB1 Q5-c 逐字「**缺**：① tritrack / proof 视图的图片接缝未接（`imageUrl` 槽存在、0 调用点于该视图）；② **"给定 activeMs ⇒ 取最近 N 帧"的逻辑零实现** ——【推断】这**不需要后端**：`screens[].image_ref` + `first_seen_ms` 已够，一条前端纯函数即可」+ 「④ **【未能判定】**『最近一帧』的判据口径…**需 #5 自己定为单一真源**」。

**目标**：`[[ts:ms]]`（T26）或轨上点击 ⇒ 播放头**沿时间轨滑到目标位置**（元素级 `scrollTo` + GSAP 位移，可中断可反向）；滑动过程中**掠过几帧缩略**（`screens` 的 `thumb/` 图，经 `imageUrl` 槽）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/views/session/SessionTriTrackView.tsx` | T27 后 ~285 | ⚠️ **接近**（须实测） | 否 | 只加"接 `imageUrl` 槽 + 掠过条"（+≤15 行）；🔴 破 300 ⇒ 抽 `views/session/ThumbStrip.tsx` |
| `app/src/views/session/usePlayheadJump.ts` | **不存在（新建）** | — | 否 | 新建（**持有的 `targetMs`** + 唯一 timeline + 元素级 `scrollTo`），预算 **≤140** |
| `app/src/views/session/usePlayheadJump.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤220** |
| `app/src/views/session/screensFor.ts` | **不存在（新建）** | — | 否 | 新建（**纯函数**：「给定 `activeMs` ⇒ 最近 N 帧」的**单一真源**），预算 **≤60** |
| `app/src/views/session/screensFor.test.ts` | **不存在（新建）** | — | 否 | 新建，**node 环境**（纯函数），预算 **≤150** |
| `app/src/hooks/useSessionDetailData.ts` | **237** | 否（余 63） | 否 | ⚠️ **可能零改动**（`imageUrl` 槽已由容器提供；本任务**只需视图侧接槽**） |

**「最近一帧」的判据口径（PB1 留的未决项 ⇒ 🔴 本计划定为单一真源，进 `## 待裁决清单` #9）**
```ts
/** activeMs → 掠过用的缩略图（**单一真源**）。
 *  口径：取 first_seen_ms ≤ activeMs 的**最后一屏**；若没有，取 first_seen_ms 最小的那一屏。
 *  只返回 image_ref ≠ null 的屏；不超过 max 张。 */
export function screensAround(screens: readonly SessionScreen[], activeMs: number, max: number): readonly SessionScreen[];
```

| 条 | 机制 |
|---|---|
| ① **起始态被持有** | `targetMs: number \| null` 是**持有的 state**；再次跳转 = 从**当前位置**滑向新目标（可反向：跳回更早的 ms） |
| ② **可中断** | 连点两个 `[[ts:ms]]` ⇒ `interrupt()` + 从当前位置起新 timeline（**不排队**） |
| ③ **reduced-motion 降级** | ⇒ `targetMs` **瞬移**（无滑动）+ 掠过条**只渲染目标那一帧** |
| ④ **三档行为** | `eco` = 瞬移；`standard` = 滑动 `--ed-dur-card`(220ms) 档 + 掠过 3 帧；`rich` = 滑动 `--ed-dur-reveal`(500ms) 档 + 掠过 6 帧（**帧数上界由 `max` 硬限**） |

- [ ] **Step 1: `screensFor.ts`**（纯函数 + 口径注释；`@ai-context` 写清「这是本批定的单一真源，PB1 未判定」）
- [ ] **Step 2: `usePlayheadJump.ts`**（滑动 = GSAP 位移（**≤8px 的"掠过"位移**经 `clampShift`）+ **元素级** `scrollTo`；🔴 **不用 `window`**）
- [ ] **Step 3: 视图接线**（接 `imageUrl` 槽渲染掠过条；**只渲染 `thumb/`**（`LiveImageStrip.tsx:24-26` 的 `thumbOf` 同款口径））
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **`screensAround` 口径（纯函数）**：`activeMs` 落在第 3 屏区间 ⇒ 返回以第 3 屏结尾的最近 `max` 屏（**逐例断言**）；`activeMs` 早于所有屏 ⇒ 返回 `first_seen_ms` 最小的屏；`image_ref === null` 的屏**被跳过**；空数组 ⇒ `[]` | **M1**：改成"返回所有屏" | **M1 后期望**：长度 ≠ max ⇒ 红 |
| **V2** | **元素级 `scrollTo`（不用 window）**：`scrollLeft` 目标点逐字（0/52.5/90/120 四点）；`window.scrollTo` **未被调用**（spy） | **M2**：换成 `window.scrollTo` | **M2 后期望**：读数恒 0 + jsdom 抛 `Not implemented` ⇒ 红 |
| **V3** | **掠过帧数与档位**：`standard` ⇒ 掠过条**恰 3** 个 `img`（且 `src` 含 `thumb/`）；`rich` ⇒ 恰 6；`eco` ⇒ 恰 1 | **M3**：把 `thumb/` 换成 `full/` | **M3 后期望**：`src` 不含 `thumb/` ⇒ 红（**`full/` 是大图 ⇒ 掠过会拉 115MB 级图集里的原图**） |
| **V4（持有）** | 跳转到 30s 后再跳回 10s ⇒ `targetMs` 序列 = [30000, 10000]（**持有**），且第二次是从**当前位置**反向滑 | **M4**：第二次跳转前把 `targetMs` 重置为 `null` | **M4 后期望**：中间出现瞬移 ⇒ 红 |
| **V5（中断，双断言）** | 连点两点 ⇒ ① `getChildren().length` 不增 **且** ② 最终 `targetMs` == 第二点 | **M5**：去掉 `interrupt()` | **M5 后期望**：① 变 2 ⇒ 红 |
| **V6（降级）** | `reduce:true` ⇒ 无滑动（位移 0）+ 掠过条只有 1 帧 + `tweenCount === 0` | **M6**：降级分支仍播滑动 | **M6 后期望**：建了 tween ⇒ 红 |
| **V7（三档）** | 三档时长/帧数逐档断言（0/220ms/500ms；1/3/6 帧） | **M7**：`rich` 帧数设成 20 | **M7 后期望**：> `max` 硬限 ⇒ 红 |
| **V8** | **`views/**` 仍零 `@tauri-apps`**：A3③ 绿；本任务的 URL 全来自 `imageUrl` 槽 | **M8**：在 `usePlayheadJump.ts` 里 import `convertFileSrc` | **M8 后期望**：A3③ 红 |
| **V9** | `line-limits` exit 0（新文件 ≤300；视图文件 ≤300）· `tsc` 0 错 · `vitest` 全绿 | — | 全绿 |

**提交信息**：`feat(motion): 落时间码回跳与掠过缩略`（subject 16 字）

**诚实边界**：① **「掠过几帧缩略」是"翻图"不是"视频抽帧"** —— 缩略图来自 `screens` 的归档 webp（每屏一张），**帧率由屏数决定**（PB1 逐字：`full/<ms>.webp` + `thumb/` 双层约定）；② **「最近一帧」的口径是本批定的**（PB1 明确「未判定，需 #5 自己定为单一真源」）⇒ 进 `## 待裁决清单`；③ **真实 seek 不可验证**（同 T25）⇒ 本任务判的是**播放头位置与掠过条**，**不是**"音频真的跳了"；④ **`screens` 为空的会话**（图文/无关键帧）⇒ 掠过条为空、**播放头仍滑动**（登记）。

---

### Task 32: #6 记忆浮现（墨色洇开 + **字距用 `x` 而非 `letterSpacing`** + 剪报底纹左刷 + 评分按钮浮起）

> **依据**：R5.6 逐字「四件动效逐字：**墨色洇开** · **字距极轻收敛（用 `x` 而非 `letterSpacing`** —— §8.6 表逐字）· **剪报底纹左刷** · **评分按钮随后浮起**。实测：今天揭晓是**整棵子树瞬切、零 transition/keyframes**；`Text.css:15-20` 的『墨度 + letter-spacing』钩子**已备好但 0 调用点** ⇒ 本批**必须**把该钩子接上（否则 §8.6.1 第 3 条的接缝承诺落空）。🔴 『用 `x` 而非 `letterSpacing`』是**硬判据**：守卫断言揭晓动效**不含** `letterSpacing` 动画（避免 layout）」。
> **本计划者实测**：`Text.css:15-20` 的钩子逐字存在（`letter-spacing: 0;` + `transition: color … , letter-spacing …`）；`app/src` 的 `letterSpacing` 命中 **5 处**（`components/ColumnBar.tsx` 1 · `pages/SettingsPage.tsx` 1 · `ui/primitives/Text.test.tsx` 3）⇒ **本任务不得新增第 6 处**。

**目标**：`ReviewSessionPanel` 的揭晓（`!revealed → revealed`，今天整棵子树瞬切）落四件动效：① 墨色洇开（`back` 块的颜色/墨度）② **字距极轻收敛（用 GSAP 的 `x` 位移 + `scaleX` 表达，禁用 `letterSpacing`）** ③ 剪报底纹左刷（`background` 的 `background-position`/伪元素 `scaleX`）④ 评分按钮随后浮起（`opacity` + `y ≤8px`）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `app/src/components/review/ReviewSessionPanel.tsx` | T30 后 ~245 | 否（余 ~55） | 否 | 揭晓四件的挂载点（+≤35 行）；⚠️ 写者队列 **T30 → T32** |
| `app/src/components/review/useRevealMemory.ts` | **不存在（新建）** | — | 否 | 新建（持有的 `revealedProgress: number` + 唯一 timeline + 四段的时序），预算 **≤150** |
| `app/src/components/review/useRevealMemory.test.tsx` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤240** |
| `app/src/ui/primitives/Text.css` | **46**（T13 后 ~54） | 否 | 否 | ⚠️ **钩子已存在、本任务不新增 `letter-spacing` 动画**；只在必要时把 `transition` 的**时长**换成正确档（**默认零改动**） |
| `app/src/components/review/ReviewSessionPanel.test.tsx` | T30 后 ~130 | 否 | 否 | **只追加** |

| 条 | 机制 |
|---|---|
| ① **起始态被持有** | `revealed`（既有 state）+ `revealedProgress: 0..1`（新增持有量）；**收起**（`setRevealed(false)`，评分后必经路径）⇒ 反向播回 0 |
| ② **可中断** | 揭晓动画中途按评分/切卡 ⇒ `interrupt()` + 立即落终态（**不排队**） |
| ③ **reduced-motion 降级** | ⇒ 四件**全部直接终态**（`revealed === true` 的静态形态）、`tweenCount === 0` |
| ④ **三档行为** | `eco` = 跳终态；`standard` = 总时长落在编排层 400–900ms 内（四件错开）；`rich` = 时长加长（**仍 ≤900ms**）+ 错开更明显 |

- [ ] **Step 1: `useRevealMemory.ts`**（四段时序；🔴 **`x` 而非 `letterSpacing`** 的理由逐字写进 `@ai-context`：`letter-spacing` 是 **layout 属性**，动它会让整段重排 ⇒ 违反 R8.4 的属性集合代理判据；`x` 走合成层）
- [ ] **Step 2: 视图挂载点**（`back` 块 / 剪报底纹 / 评分按钮三处加 `data-*` 锚点 + 接 `revealedProgress`）
- [ ] **Step 3: 接上 `Text.css:15-20` 的钩子**（「墨度 + 字距」这条接缝的**兑现**方式：墨度走 `color`（CSS transition 已备），**字距那半改用 `x`** ⇒ **必须**在注释里写清「接缝的 letter-spacing 半被 `x` 取代，理由是 layout」）
- [ ] **Step 4: 八门禁 + 提交**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 🔴 **硬判据（R5.6）：不含 `letterSpacing` 动画**：`useRevealMemory.ts` 与 `ReviewSessionPanel.tsx` 剥注释后 `letterSpacing` **0 命中**（**基线**：全仓 5 处，本任务**不得**新增 ⇒ 全仓仍 **5**）；**同时**断言被动画属性集合**不含** `letter-spacing` | **M1**：把字距收敛写成 `gsap.to(el, { letterSpacing: "-0.01em" })` | **M1 后期望**：① 全仓命中 5 → 6 ⇒ 红；② `animatedProps` 含 `letter-spacing` ⇒ 红（**两条独立齿**） |
| **V2** | **四件都真的动**：`revealedProgress` 从 0 → 1 的过程中，四个目标元素**各至少有一个属性**在变（**四段各自的采样点**：`tl.time(0.2/0.4/0.6/0.9)` 各断一个元素）；**且**四段的**开始时刻互不相同**（错开） | **M2**：把评分按钮那一段删掉 | **M2 后期望**：第 4 个元素全程无变化 ⇒ 红 |
| **V3** | **墨色洇开是真属性变化**：`back` 块的 `color` 或 `opacity` 在采样点之间**取值不同** | **M3**：把那一段改成 `duration: 0` 的瞬变 | **M3 后期望**：两个采样点取值相同 ⇒ 红 |
| **V4** | **剪报底纹左刷的方向**：底纹元素的 `background-position-x` 或 `scaleX` 的 origin 是**左侧**（`transform-origin` 含 `left` 或 `0%`），且采样点取值**单调**朝一个方向 | **M4**：把 `transform-origin` 改成 `right` | **M4 后期望**：方向/原点判据红（**"左刷"是 R5.6 逐字**） |
| **V5（持有）** | 评分 ⇒ `setRevealed(false)`（既有路径）⇒ `revealedProgress` 回到 0 **且** 四件元素回到起始形态（**反向**） | **M5**：评分后不重置 `revealedProgress` | **M5 后期望**：下张卡的揭晓从终态开始（"看不出浮现"）⇒ 红 |
| **V6（中断，双断言）** | 揭晓中途评分 ⇒ ① `getChildren().length` 不增 **且** ② 四件属性**都**落终态 | **M6**：去掉 `interrupt()` | **M6 后期望**：① 变 2 ⇒ 红 |
| **V7（降级）** | `reduce:true` ⇒ 四件直接终态、`tweenCount === 0` | **M7**：降级只跳过 `play()` | **M7 后期望**：建了 tween ⇒ 红 |
| **V8（三档）** | 三档总时长：`eco` 0；`standard` ∈ [400,900]；`rich` > `standard` 且 ≤900 | **M8**：`rich` 设 1000ms | **M8 后期望**：>900 ⇒ 红 |
| **V9** | **属性集合审计**：本动效写的属性 ⊆ `ANIMATABLE_PROPERTIES`（**特别：不含 `height` / `letter-spacing` / `width`**） | **M9**：用 `height` 做"洇开" | **M9 后期望**：红 |
| **V10** | `ReviewSessionPanel.tsx` ≤300（改后实测）· `tsc` 0 错 · `vitest` 全绿（既有用例逐字通过） | — | 全绿 |

**提交信息**：`feat(motion): 落记忆浮现四件动效`（subject 14 字）

**诚实边界**：① 🔴 **`Text.css:15-20` 的「字距」接缝在本批被"接上但改了实现"** —— 接缝的 `letter-spacing` 那半**不会被用于动画**（R5.6 的硬判据），改用 `x`；⇒ **必须**在 `Text.css` 与 `useRevealMemory.ts` 两处注释里写明「接缝的 letter-spacing 半被 `x` 取代，理由是 layout 成本」—— **否则**下一个人会以为接缝没被用；② **「剪报底纹」今天的载体**（`--ed-mark-clip` / `NoteMarkdown` 的 blockquote）**不在复习面板里** ⇒ 复习面板的"底纹"是**本任务新建的一个视觉层**（`@ai-context` 必须写清它不是既有资产）；③ **jsdom 里"洇开"不可判** ⇒ 只判**属性集合 / 采样点差异 / 方向 / 时长**；④ **`letterSpacing` 的 5 处基线必须在本任务后仍为 5** —— 报告给逐字读数。

---

### Task 33: 列折叠 Flip（🔴 **先 STOP 实测结构代价**）

> **依据**：R5.7 逐字「🔴 **今天的物理前提不成立**：折叠是 `folded ? <ColumnBar width:26> : <面板 width={col.width}>` **条件渲染两棵不同子树**（**7 处页面同形**），宽度走**行内 style 且无 transition**，`ColumnBar.tsx` 39 行 0 处 transition ⇒ **无共享元素可测差**。**裁决：先改结构，再上 Flip** —— 折叠改为『**同一宿主容器 + 宽度变化**』…**判据的诚实边界**：jsdom 里 `Flip.getState` 的 `bounds` **全 0**、改 `position/left/top` 后仍全 0、`Flip.from()` 返回真 Timeline 但位移增量**恒 `translate3d(0px,0px,0px)`**、`Flip.fit()` 退化成 `width:0px;height:0px` ⇒ **几何位移零可观测**。⇒ 机器判据只能用「结构契约（同宿主）+ Flip 已注册 + timeline 存在 + 属性集合 ⊆ transform 族」的**弱判据**；**几何位移只能登记/headless**，报告里**逐字写明**。⚠️ **若改结构代价超预算（7 处页面同形改动）⇒ STOP 报告 + 给出绿色方案实测**，不要两条都硬做」。

**🔴 本任务的第一产出 = 一份 STOP-first 的代价实测（Step 0），不是代码。** 本计划者已经做了**部分**预先实测（下表），实施者**必须自己复测并补齐**：

| # | 落点（**本计划者实测 = 8 处，不是裁决写的 7 处** —— 见 `## 待裁决清单` #10） | 折叠态渲染 | 既有断言是否钉住"根元素 == column-bar"？ |
|---|---|---|---|
| 1 | `pages/GoalsPage.tsx:92` | `<ColumnBar …/>` | 🔴 **是** —— `GoalsPage.test.tsx:62` 逐字 `expect(leftColumn(container.firstElementChild)?.getAttribute("data-testid")).toBe("column-bar")` |
| 2 | `components/ChatSidebar.tsx:193` | `{col.folded ? <ColumnBar …/> : panel}`（**唯一的三元形态**） | 🔴 **是** —— `ChatSidebar.test.tsx:84` 同款断言；**且** `ChatSidebar.tsx:188-190` 的注释逐字警告「顶层 fragment 的两个子元素都是页面根 flex 的直接子元素（**多包一层会改变宽度分配**）」 |
| 3 | `components/ClassroomSourceColumn.tsx:85` | `<ColumnBar …/>`（文件头逐字「顶层恰好返回**一个**元素」） | 未实测（报告须补） |
| 4 | `components/NoteReadingView.tsx:188` | `<ColumnBar …/>` | 未实测 |
| 5 | `components/notes/NotesListColumn.tsx:83` | `<ColumnBar …/>`（文件头逐字「顶层**必须**返回 **fragment**」） | 部分：`NotesReadingColumn.outline.test.tsx:129-150` 只断**存在/不存在**（**不钉根元素**）⇒ **可存活** |
| 6 | `components/notes/NotesGroupsColumn.tsx:58` | `<ColumnBar …/>` | 未实测 |
| 7 | `pages/SessionsPage.tsx:279` | `<ColumnBar …/>` | 未实测 |
| 8 | `pages/KnowledgePage.tsx:249` | `<ColumnBar …/>` | 未实测 |
| — | **文本级守卫**：`shell/columnConsumption.test.ts:71` 逐字 `expect(c.includes("<ColumnBar"), "折叠态未渲染 ColumnBar 窄条").toBe(true)` | — | **只在 `ChatSidebar.tsx` 上判**，且判的是**子串存在** ⇒ 「同宿主 + 内部仍渲染 `<ColumnBar>`」**可以存活** |

**Files（**只有 Step 0 判定「代价可接受」时才动**）：**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| 上述 8 个落点文件 | 见 `## 波次总表` 的行数表 | `NotesReadingColumn.tsx` **290** ⇒ ⚠️ **余 10**（但它在名单里是"列容器"，**不在**上述 8 个渲染点内 —— 报告须复核） | 否 | 加"同一宿主"包装（每处 +≤6 行） |
| `app/src/shell/useColumnFlip.ts` | **不存在（新建）** | — | 否 | 新建（唯一 `Flip` 调用点 + 唯一 timeline），预算 **≤130** |
| `app/src/shell/useColumnFlip.test.ts` | **不存在（新建）** | — | 否 | 新建，jsdom，预算 **≤200** |
| `app/src/shell/columnConsumption.test.ts` | **126** | 否（余 174） | 否 | 🔴 **本任务预期零改动**（`<ColumnBar` 子串仍在）；**若必须改 ⇒ STOP 请裁** |
| `app/src/components/ChatSidebar.test.tsx` · `app/src/pages/GoalsPage.test.tsx` | **152** · **66** | 否 | 否 | 🔴 **若结构改造导致 `:84` / `:62` 红 ⇒ 那就是"代价超预算"的证据** ⇒ **STOP**（**不得**为了绿而改这两条既有断言：它们不在 G1–G15 的授权清单里） |

- [ ] **Step 0（🔴 本任务的真正第一步）: 代价实测 + STOP 判定**
  ① 逐处读 8 个落点，填上表的「既有断言是否钉住根元素」列（**每处给 file:line + 逐字断言行**）；
  ② **判定**：把"同宿主 + 宽度变化"套到**每一处**，列出**会变红的既有断言清单**；
  ③ 若清单**非空** ⇒ 🔴 **STOP 报告**，并把**绿色方案**（下表 A/B/C）**实测出来**（读数 + 复现命令 + 代价），**一次报控制方裁决**；
  ④ 若清单**为空** ⇒ 继续 Step 1–4。
- [ ] **Step 1: `useColumnFlip.ts`**（`Flip.getState(host)` → 切 `folded` → `Flip.from(state, { … })`；**持有的 `folded`**；`interrupt()`；reduced-motion ⇒ 跳终态；三档 ⇒ 时长/错开）
- [ ] **Step 2: 结构改造**（逐处：`<div data-flip-host style={{ width: folded ? 26 : col.width }}>{folded ? <ColumnBar/> : panel}</div>` —— ⚠️ **这一行正是「多包一层」**，与 `ChatSidebar.tsx:188-190` 的既有注释直接冲突 ⇒ 该处的代价必须在 Step 0 里被点名）
- [ ] **Step 3: 弱判据测试**（**不许**写几何断言）
- [ ] **Step 4: 八门禁 + 提交（或 0 提交 + STOP 报告）**

**三条候选路径（Step 0 必须给这三条的实测代价）**

| 路径 | 做法 | 预期代价 | 本计划者的**预判**（**未实测**，须 Step 0 确认） |
|---|---|---|---|
| **A（R5.7 的字面）** | 8 处改「同宿主 + 宽度变化」 | 8 个源码文件 + **至少 2 处既有断言必红**（`GoalsPage.test.tsx:62` · `ChatSidebar.test.tsx:84`）⇒ **需 G16 级授权** | 🔴 **代价超预算** ⇒ 大概率 STOP |
| **B（零结构改造，`data-flip-id` 跨元素匹配）** | 面板与 `ColumnBar` **各带** `data-flip-id="col-<key>"`，`Flip.from(Flip.getState([panel, bar]), { targets: [bar] })` —— **Flip 的 `data-flip-id` 正是为"元素身份在 DOM 变更中改变"设计的**（同一 flip-id 的旧元素 bounds 会应用到新元素） | 8 处各 +1 个属性 + 1 个 hook 调用；**不动三元结构 ⇒ 0 条既有断言红** | ✅ **绿色**（但 **R5.7 逐字要求"先改结构"** ⇒ 走 B 必须**请裁**） |
| **C（不做，只登记）** | 折叠保持瞬跳；把 §8.4 的「除非走 Flip」记为**未交付** | 0 | ✅ 最省，但**用户面 9 项里的 Flip 一项未兑现** |

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V0** | 🔴 **STOP 判定的产物**：报告里含「8 处落点 × 既有断言」的**逐处表格**（file:line + 逐字断言）+「会变红的断言清单」+「A/B/C 三条路径的实测代价（读数 + 命令）」 | —（报告级判据；**这是本任务的第一交付**） | 逐处齐备；**缺一处即不达标** |
| **V1** | **Flip 已注册**：`typeof Flip.getState === "function"`（T3 的注册，本任务只消费） | **M1**：从 `engine.ts` 的 `registerPlugin` 摘掉 `Flip` | **M1 后期望**：`Flip.getState` 不可用 ⇒ 红 |
| **V2** | **结构契约（弱判据）**：折叠前后，**宿主元素是同一个 DOM 节点**（`before === after`，引用相等）；且宿主的 `data-flip-id`（或 `data-testid`）**不变** | **M2**：把宿主换成一个新节点（回到"两棵子树"形态） | **M2 后期望**：引用不等 ⇒ 红（**这是"同宿主"唯一可判的部分**） |
| **V3** | **timeline 存在 + 属性集合 ⊆ transform 族**：`Flip.from(...)` 返回的是**真 Timeline**（有 `duration()`），且其写出的属性 ⊆ `ANIMATABLE_PROPERTIES`（**注意：`Flip` 会写 `width`/`height`** ⇒ 🔴 **本判据必须实测后按实况写**：若 `Flip.from` 确实写 `width`，则**如实登记为"属性集合判据在 Flip 上不成立"**，并**把 `width` 加进 T11 白名单之外的单列例外**（**这本身就是一条必须报控制方的发现**） | **M3**：把 `Flip.from` 换成 `gsap.to(host, { width: … })` | **M3 后期望**：属性集合判据（按其实际口径）红 |
| **V4（持有）** | `folded` 是持有的 boolean；连续两次折叠 ⇒ 往返到原状态（**引用与宽度属性都往返**） | **M4**：把 `folded` 换成一次性 tween 副作用 | **M4 后期望**：第二次折叠后状态不回 ⇒ 红 |
| **V5（中断，双断言）** | 折叠动画中途再点 ⇒ ① `getChildren().length` 不增 **且** ② 宿主宽度属性 == 新的目标值 | **M5**：去掉 `interrupt()` | **M5 后期望**：① 变 2 ⇒ 红 |
| **V6（降级）** | `reduce:true` ⇒ 无 tween、宽度**瞬跳**到目标 | **M6**：降级分支仍建 timeline | **M6 后期望**：建了 tween ⇒ 红 |
| **V7（三档）** | `eco` = 瞬跳；`standard` = `--ed-dur-card` 档；`rich` = `--ed-dur-reveal` 档 | **M7**：`eco` 仍播 220ms | **M7 后期望**：红 |
| **V8** | 🔴 **几何位移零可观测 = 逐字登记**：报告里**逐字**写明「按 R5.7/尖刺 S2.6：jsdom 里 `Flip.getState` 的 `bounds` 全 0、位移增量恒 `translate3d(0px,0px,0px)`、`Flip.fit()` 退化成 `width:0px;height:0px` ⇒ **本任务不写几何断言**」 | —（登记型判据） | 逐字在场 |
| **V9** | `line-limits` exit 0（8 个落点文件 + 新文件全 ≤300；**`NotesReadingColumn.tsx` 290 若被触及 ⇒ 特别核对**）· `tsc` 0 错 · `vitest` 全绿（**既有 1770 用例一条不少**） | — | 全绿 |

**提交信息**（**仅在 Step 0 判定代价可接受或控制方选定 B 之后**）：`feat(motion): 落列折叠 Flip 动效`（subject 14 字）；**STOP 分支零提交**（只出报告）。

**诚实边界**：① 🔴 **几何位移本任务永远不可验证**（R5.7 逐字）⇒ 报告**逐字写明**，**不得**出现"折叠动画已验收"；② **落点是 8 处不是 7 处**（本计划者实测；`## 待裁决清单` #10）；③ **路径 B（`data-flip-id`）与 R5.7 的"先改结构"字面冲突** ⇒ 若走 B **必须请裁**；④ **本任务极可能以 STOP 收尾** —— 那**不是失败**：R5.7 逐字要求「若改结构代价超预算 ⇒ STOP 报告 + 给出绿色方案实测」，**本任务的第一交付就是那份实测**；⑤ **`Flip` 会写 layout 属性（`width`/`height`）** 这一点与 R8.4 的属性集合代理判据**天然冲突** —— 这是**本批最重要的待报发现之一**（见 `## 待裁决清单` #11），**不得**为了让判据绿而放宽 R8.4。

## 波 D · 收口（T34–T36）

> **本节由 P2 续写单元定稿**，逐条覆盖 R 系列 §九 的波 D 清单。**波 D 无生产代码改动**（只改文档/台账 + 产出测量与评审件）⇒ **三节的 Verification 以「命令 + exit + 逐字读数」为主**，变异体只在改判类判据上给。

---

### Task 34: 终态测量（八门禁 + **`cargo test` 本批必跑** + 真实构建取锁 + 首屏 Δ 归因）

> **依据**：R1.5（每任务八门禁）· R0.1 第 1 条 ③（`cargo test` **本批必须真跑**，**不得**把「未跑」写成「已跑」）· R8.9 · `## Global Constraints` 的「真实构建的取锁协议」与「首屏/可达性的判据形态（三件套）」。

**目标**：在**冻结提交**（波 C 最后一个提交）上跑**八门禁**并逐条给「命令 + exit + 逐字读数」；跑**一次真实构建**（取锁）并给 **`app/dist` mtime + 入口 chunk 名 + 首屏三件套读数（原始读数 / Δ / 机理核查）**；给**五类棘轮 + 六类棘轮**的终态计数。

**Files:**

| 对象 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| **0 个生产文件** | — | — | — | 本任务**只读**；产出全部写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/tmp/t34/**` |
| `app/dist`（不入库） | — | — | — | 真实构建重写；**自采 mtime** |
| 登记表（若新文件 >300 才需要） | `docs/standards/line-limit-exemptions.md` **232** | 否 | 否 | 🔴 **预期零改动**（新文件一律 ≤300）；**若需要登记 ⇒ 说明有任务违反了绑定约束 ⇒ STOP 报告** |

**八门禁（逐条命令 + exit + 读数）**

| # | 命令 | 期望 | 备注 |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | exit 0 · `>600` **0** · 301–600 档与登记条目**同步** | 新 `.ts/.tsx/.rs` 全部 ≤300 ⇒ **登记条目数不增** |
| 2 | `node scripts/docs-check.mjs` | exit 0 · 五项全 ✅ | ⚠️ 按**输出文本**判（索引覆盖只 warn） |
| 3 | `node scripts/check-command-registry.mjs` | exit 0 · **定义 313 / 注册 313 / 重复 0** | T22 的唯一新增命令 |
| 4 | `cd app; npx tsc --noEmit` | exit 0 · **0 错** | ⚠️ **必须单独跑** |
| 5 | `cd app; npx vitest run --reporter=json --outputFile=<tmp>/vitest-final.json` | exit 0 · `numFailedTests 0` · **`testResults.length` ≥ 184** | ⚠️ `numTotalTestFiles` 字段**不存在** ⇒ 文件数读 `testResults.length` |
| 6 | `node scripts/check-bundle-budget.mjs`（**真实构建，先取锁**） | exit 0 · 首屏 gzip **≤200 kB** | 取锁协议逐字照 `## Global Constraints`；**取不到锁不许硬跑** |
| 7 | `node scripts/bundle-eager-graph.mjs` | exit 0 · 首屏静态可达源文件数 + npm 包数 | **`vendor-gsap` 不得在首屏**（T4 的 ①② 在此**真跑**） |
| 8 | `cd app/src-tauri; cargo test --test app_lib_tests` | exit 0 · `running ? tests` ⇒ `0 failed` | 🔴 **本批必跑**（R0.1）；并跑 `cargo clippy` 判**错误数不增**（基线 15） |
| ＋ | `git status --porcelain` | **仅 `?? docs/tech-debt/`** | R6.9 的零动作验收 |

**首屏三件套（**永不使用裸绝对数**）**：① 工具原始读数（首屏 chunk 逐个给「名字 + 原始字节 + gzip」）② **Δ（相对 `6cbe964e` 的冻结值：318,299 B / gzip 100,485 B = 100.49 kB / 3 chunk）** ③ **机理核查**（`pages/**` 新增几个 · npm 包新增几个 · **新进首屏集合 = []?**）。
⚠️ 本批的 Δ 是**构造性的**：GSAP 只经 `import()` ⇒ 首屏 chunk 个数应仍是 **3**、`vendor-gsap-*` **只在懒 chunk 里**；`manualChunks` **只切文件、一字节不降**。
⚠️ **Δ 恰为 0 时先当仪器故障**；**< ~2 kB 的 Δ 必须用同源真构建对比**（rollup 的 CSS 拼接顺序非确定性，批 4 实测同源两树差 9 B）。
⚠️ **chunk 名不是稳定标识**（v0.22 `:549`）⇒ 判 chunk 增删必须用**模块级字面量归属**或**逐块字节闭合核算**。

- [ ] **Step 0: 冻结与自证**（`git log --oneline -1` 记下**冻结提交 sha**；`git status --porcelain` 期望仅 `?? docs/tech-debt/`）
- [ ] **Step 1: 跑门禁 1–5、7、8**（逐条落盘读数到 `tmp/t34/gates.md`）
- [ ] **Step 2: 取锁 + 真实构建 + 门禁 6**（锁体写 `createdAt/pid/purpose`；`finally` 删锁；自采 `(Get-Item app/dist/index.html).LastWriteTime`）
- [ ] **Step 3: `app/dist` provenance + 首屏三件套**（写 `tmp/t34/first-screen.md`）
- [ ] **Step 4: 五类/六类棘轮终态**（`nativeButton` / `textRatchet` / `surfaceRatchet` / `statusLineRatchet` / `emptyStateRatchet` / `loadingRatchet` + `zIndex.guard` —— **逐条给冻结值与实测计数**）
- [ ] **Step 5: 登记提交**（本任务**只改文档/台账**；若无 durable 改动 ⇒ **零提交 + 报告**）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **八门禁逐条 exit 0 + 逐字读数**（上表 8 行，每行给命令、exit、输出摘录） | —（门禁类） | 8 行齐备；**任一条缺失或写成"未跑"⇒ 不达标** |
| **V2** | **`cargo test` 真跑且给逐字读数**（`running N tests` ⇒ `test result: ok. N-M passed; 0 failed; M ignored`） | — | 读数在场；**不得**出现"沿用基线读数"这类代替 |
| **V3** | **首屏 Δ 三件套齐备**（原始 / Δ / 机理）+ **`app/dist` mtime + 冻结提交 sha** | — | 四要素齐备 |
| **V4** | **`vendor-gsap` 不在首屏**（T4 的 ①② 在真实产物上真跑）：`dist/assets/vendor-gsap-*.js` **存在** **且** `firstScreen.chunks` **不含**它 | **M1**（在导出树/工作树内）：把 `engine.ts` 的静态 import 加到 `main.tsx` ⇒ 重建 | **M1 后期望**：`firstScreen.chunks` 出现 `vendor-gsap-*`、首屏 gzip 显著上升 ⇒ V4 红（**证明这条判据在真实产物上有牙**） |
| **V5** | **脏树自检**：`git status --porcelain` 恰 `?? docs/tech-debt/` 一行 | — | 一行 |
| **V6** | **无新增豁免登记**：`git diff --numstat -- docs/standards/line-limit-exemptions.md` **空**（或**只有** `:224` 人工块的行数更正 —— 那属 **T16/T35**） | — | 空 / 仅人工块 |

**提交信息**：`docs(batch6): 记录批 6 终态门禁读数`（subject 16 字；**若无 durable 内容 ⇒ 零提交**）

**诚实边界**：① **真实帧率不可测**（jsdom 无合成器）⇒ 「60fps」**只能**出现在「未测」与「代理判据」两处，🔴 **收口不得出现「60fps 已达成」类表述**（R8.4 逐字）；② **真实媒体播放 / seek / Flip 几何位移 / `window` 级滚动 / 真机观感** 一律**不可验证**（R8.4 的「只能登记」清单）⇒ 本任务**不得**为它们造判据；③ 真实构建**只能串行**（取锁协议是**人工约定**，`check-bundle-budget.mjs` **无锁机制**）⇒ 若拿不到锁，**如实登记「未跑」**并给出退避时间线；④ **`cargo clippy` 的判据是「错误数不增」**（基线 15），**不是** exit 0。

---

### Task 35: 文档回写（规格 9 节就地加注 + `ADR-035` 定稿 + 索引 + `v0.22.md` 批 6 节七段 + 台账）

> **依据**：R0.1 第 1 条 ①②（**规格 §3 就地加注** + **`ADR-035` 单列「后端契约例外」节**）· R6.7/R6.8（`motion.md` 与 `ADR-035`）· `progress.md` §一 · R5.5-b（**ADR-013 加注**、**适用范围写进 §7.2 加注**）· R6.2（**§4.3 与 `:214` 加注**）· `## 波次总表` 的「收口回写八节」。

**目标**：把批 6 的所有**决策与实测**落到 durable 载体：规格 **§3 / §4.3 / §6.2 / §6.3 / §8 / §10 / §11 / §12 / §14** 就地加注（**上格原文一字不改**）· **`ADR-035` 定稿**（含「后端契约例外」节回填）· `docs/adr/README.md` 索引 · `docs/standards/motion.md` 收口（**串 ↔ 代码对拍**）· **`docs/versions/v0.22.md` 批 6 节（七段结构）** · `docs/standards/line-limit-exemptions.md:224` 人工块行数更正 · `ADR-013` 的对齐加注（T23 已落，本任务复核）。

**Files:**

| 文件 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` | **850** | 否（`.md` 不受门禁） | 否 | **9 节就地加注**（见下表，逐节给锚点行号；**原文一字不改**，全部**追加**） |
| `docs/adr/ADR-035-l4-motion-grammar-and-engine.md` | T2 建（~300 计划） | 否（`.md`） | 否 | **定稿**（决策节按实况修订 + **例外节回填**实测读数 + 登记节补批 6 结论） |
| `docs/adr/README.md` | **60** | 否 | 否 | T2 已加一行；本任务**复核**（不重复加） |
| `docs/adr/ADR-013-live-session-preload-and-playback-pause.md` | **90** | 否 | 否 | T23 已加注；本任务**复核** + 把最终读数补进 |
| `docs/standards/motion.md` | T1 建（≤260） | 否 | 否 | 收口：把「不可用判据清单」与**实盘**对齐（逐条给"本批未做/仪器不可达"的读数） |
| `docs/versions/v0.22.md` | **646** | 否 | 否 | 追加**批 6 节（七段结构）**；`v0.22.md:35` 的「动效规范章节放批 8」**就地加注消歧**（R6.7） |
| `docs/standards/line-limit-exemptions.md` | **232** | 否 | 否 | `:224` 人工引用块的 5 个行数按**终态实测**重写（与 T16 的口径一致） |

**规格九节的就地加注台账（🔴 每节给锚点 + 加注要点；**全部追加、原文不改**）**

| 节 | 锚点（本计划者实测行号） | 加注要点（**逐条必须带读数或去向**） |
|---|---|---|
| **§3 红线与例外** | `:127`（红线 6）+ `:129-134`（E1/E2 表） | 🔴 **新增第三处例外 E3**：`Flashcard` += `intervalDays`（只读字段，不新增表/不改既有字段/SQL 语义）**+ `session_audio_path` 只读命令 + `audio_store` 的补静音与 `aligned` 自证量**；四列齐备（**原因 / 影响面 / 回滚 / 依据**）；回滚 = 还原 1 字段 + 1 命令 + 1 签名（**逐字给**） |
| **§4.3** | `:203`（D 显影四档墨度）+ `:214`（条件③） | **R6.2 加注**：`ink-4` 保持 0 生产调用点；条件③「审校模式」今日无此模式 ⇒ 登记 **批 7/8**；并**更正** R11.3 的落点（环境层第 ③ 件走 `lowConfidenceClass` + `ed-text--low-confidence`，**不是** `ink-4`） |
| **§6.2 列契约** | `:372`（节首）+ `pinnable` 两处（`:398`/`:647`，T16 已更正） | `pinnable` 的**消费方仍为 0**（本批 Flip 未接线消费 ⇒ 若 T33 走 STOP/C 分支则**逐字登记"未接线"**） |
| **§6.3 相变两态** | `:411-417`（表） | 落地读数：`data-shell-phase` 三态通道 + `--ed-nav-h-live: 58px` + `LIVE 仪表`（`Waveform`/`LiveBar`）+ **复习态零 chrome 的实现路径**（相位 CSS）+ **`navHeight.consumption.test.ts` 零改动仍绿**这条实测 |
| **§8 全节** | `:485`（节首）… `:573`（8.7） | **实现面回填**：8.1 四层逐层给落点；8.2 引擎 = `gsap@3.15.0` + 唯一入口 + **双实例陷阱**；8.4 的「不 animate height」= 已判据化（T19 V1）；8.5 三档 + 源序；**8.6 六个签名动效逐条给兑现度**（与 T36 的表一致，**不得**两处不一致） |
| **§10 批次划分** | `:637`（节首）+ **批 6 行 `:658`** | 在批 6 行**之后**追加「实际交付」一行（**含 9 项验收的实际结果 + 未兑现项去向**）；**原文一字不改** |
| **§11 验收口径** | `:669`（节首）+ **§11-5 `:741`** / **§11-9 `:760`** / **§11-10 `:766`** | 逐条给**机器判据的落点文件名 + 本批实测读数**：§11-5 = `motion-coverage.test.ts`（名单）+ T13 的四件；§11-9 = T4 的闭包判据 + 首屏 Δ；§11-10 = 六个签名动效的**四行判据**（持有/中断/降级/三档） |
| **§12 仍未决与登记不排期** | `:777`（节首） | **R0.2**：本批**未触碰**四项（逐字给「0 个被做」的自证）；并登记本批新增的登记项（`aligned` 残余 D3–D6 · 导入会话无音频 · 跨窗口同步 · 孤儿 sidecar · `Flip` 的 `width/height` 与 R8.4 的冲突） |
| **§14 文档与提交** | `:823`（节首）+ `:836`（`docs/standards/` 动效章节） | 🔴 **`docs-check` 的 `:836` 与 `v0.22.md:35` 的批次冲突就地消歧**（R6.7：**本批已做**）；并登记 `ADR-035` 已写、`ADR-019` 缺号不补 |

**`v0.22.md` 批 6 节的七段结构（**逐字命名，照批 3/4/5 三节**）**：① **交付** ② **验收（+八门禁终态）** ③ **规格漂移纠正** ④ **过程中纠正的计划错误** ⑤ **诚实代价** ⑥ **未做登记（逐条带归属批次）** ⑦ **提交清单**。

- [ ] **Step 1: 规格九节就地加注**（逐节：先读锚点上下文 → **追加**加注块 → 复跑 `docs-check`）
- [ ] **Step 2: `ADR-035` 定稿**（例外节回填 T20/T22/T23 的实测；决策节把「白名单」措辞改成 R11.1 的闭包判据；登记节补 T33 的结论）
- [ ] **Step 3: `motion.md` 收口**（T1 的 V2「8 个纪律串」探针复跑；「不可用判据清单」逐条加本批读数）
- [ ] **Step 4: `v0.22.md` 批 6 节（七段）** + `:35` 加注消歧
- [ ] **Step 5: `line-limit-exemptions.md:224` 人工块行数更正**（按终态实测）
- [ ] **Step 6: 门禁 + 三个提交**（规格+ADR / `v0.22` / 台账）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **九节齐备**：规格里**每一节**的加注块都能被探针找到（探针：按节标题定位 + 断言该节**之后**存在含「🔻 批 6」的加注块；**9 节逐条**） | **M1**：删掉 §11 的加注块 | **M1 后期望**：探针报「缺 §11」⇒ 红 |
| **V2** | **原文一字不改**：九节的 `git diff` **只含新增行**（**不出现以 `-` 开头的既有行**，除加注块自身的行尾空白修正） | **M2**：顺手把 §6.3 表格的「58px」改成「58 px」 | **M2 后期望**：diff 出现 `-` 行 ⇒ 红 |
| **V3** | **`ADR-035` 例外节已回填**：该节**不再含**「待回填」三字 **且** 含 `intervalDays` / `session_audio_path` / `aligned` 三个串；四列表头齐备 | **M3**：把回填内容删回「待回填」 | **M3 后期望**：T2 的 V3（例外节四列 + 待回填）语义翻转 ⇒ 红（**T2 的判据在收口后要按"已回填"重述 —— 报告须点名这条改判**） |
| **V4** | **`docs-check` exit 0 且五项全 ✅**（尤其「索引覆盖完整」）；**`v0.22.md:35` 的加注消歧在场** | **M4**：删掉 `v0.22.md:35` 的加注 | **M4 后期望**：探针报缺 ⇒ 红 |
| **V5** | **七段结构齐备**：`v0.22.md` 批 6 节含七个逐字小节名（①–⑦） | **M5**：删掉「诚实代价」段 | **M5 后期望**：探针报缺 1 段 ⇒ 红 |
| **V6** | **§10 批 6 行的"实际交付"与 T36 的 9 项兑现度表逐条一致**（探针：两处的 9 项结论**逐条相等**） | **M6**：把 §10 的一处写成"已交付"而 T36 写"未兑现" | **M6 后期望**：逐条对拍不等 ⇒ 红（**防两处口径分叉**） |
| **V7** | `line-limit-exemptions.md:224` 的 5 个行数**逐个等于**终态实测（T16 V3 的探针复跑） | **M7**：把一个值写回旧数 | **M7 后期望**：探针红 |

**提交信息**：① `docs(spec): 回填批 6 规格加注与例外登记`（subject 17 字）② `docs(versions): 补 v0.22 批 6 节`（subject 14 字）③ `docs(standards): 校正台账行数引用`（subject 13 字）

**诚实边界**：① **`v0.22.md` 的批 6 节是"人写的结论"** ⇒ 它**不认证**任何判据（判据在测试里）；② **规格加注不改任何既有结论**（**只追加**）⇒ 若发现某节原文**本身有错**，**只加注不改原文**（先例：R6.6 的 `pinnable`）；③ **`docs/product/ui-ux-system.md` / `theme.md` 的四层动效 / 三档强度**在 §14 仍留批 8（`progress.md` §一 逐字「🟡 待裁：是否批 6 一并回写」）⇒ **本任务不写它们**，只在 `v0.22` 的「未做登记」里点名；④ 三处 `ADR-035` 判据的**语义翻转**（T2 V3 的「待回填」在收口后必然失效）⇒ 报告**必须**点名这条改判并给出新的正向判据（**含**三个关键串）。

---

### Task 36: 用户面 9 项验收的兑现度表 + 二分清单 + 全批收口评审

> **依据**：R0.1 第 2 条逐字「**验收面 = 9 个**（6 个签名动效 + 相变两态 + 承载面 3 项里的 LIVE 仪表/波形 与 到期刻度 与 播放头/时间轨）。逐条给兑现度，**未兑现的必须逐条带「为什么」与去向」**· R0.1 第 3 条逐字「批 6 收口**必须**给出「动效系统已交付什么、未交付什么」的**二分清单**，**不得**笼统声称「已交付」」（**B9 中间态声明在本批作废**）· R11.3 逐字「环境层 **4 件逐条给兑现度**（**3 件有真实落点 + 第 4 件本裁决后**也有真实落点**），**不得**再出现「落 seam 但 0 调用点」被算作已交付」。

**目标**：产出三件 durable 物：① **9 项验收的兑现度表**（逐项：结论 / 判据文件:行 / 变异性证据 / 未兑现的原因与去向）② **「已交付 / 未交付」二分清单**（含**环境层 4 件**的逐条兑现度）③ **全批收口评审件**（照批 5 母本八节：三条硬约束的判据与读数 / 八门禁终态表 / 逐任务提交轨迹 / R 系列的实际结果 / 诚实代价 / 未验证（诚实单列）/ follow-ups（逐条具名归属）/ 与计划的偏差）。

**Files:**

| 对象 | 实测行数 | ≥290 贴边？ | 在 `NON_MIGRATED_14`？ | 动作 |
|---|---|---:|---|---|
| **0 个生产文件** | — | — | — | 本任务**只读**；产出写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/task-36-report.md` + `closing-review.md`（**gitignored ⇒ 永不 `git add -f`**） |
| `docs/versions/v0.22.md` | **646**（T35 后更长） | 否 | 否 | **T35 已写批 6 节** ⇒ 本任务只**复核一致性**（不重复写） |

**9 项兑现度表（骨架；**实施者必须逐项填实数**）**

| # | 验收项 | 判据落点（file:line） | 兑现度（**本计划给出的预期，实施者按实况改**） | 未兑现的原因 / 去向 |
|---|---|---|---|---|
| 1 | **#1 对齐** | T27 的 V1–V8 | 🟡 **部分**：「三轨共轴 + 同 ms 高亮 + 中断/反向/降级/三档」可判；**真实数据上"同 ms"极少成立** | 共轴容差 = 规格未给数字 ⇒ **不发明**；去向：产品裁决 |
| 2 | **#2 显影编排** | T28 的 V1–V9 | 🟡 **部分**：编排可判；**节奏是字符率近似而非真实语速**（规格未定义语速函数） | 逐字登记；去向：批 7/8 若定义语速函数 |
| 3 | **#3 相变凝固** | T29 的 V1–V8 | ✅ **可判**（波形收束 / 琥珀退去 / 导航淡入三件） | — |
| 4 | **#4 刻度生长** | T30 的 V1–V8 | ✅ **可判**（**含精确 `intervalDays` 驱动的回缩**） | 总到期数不实时（事件总线缺）⇒ 登记 |
| 5 | **#5 时间码回跳** | T25 + T31 的 V1–V9 | 🟡 **部分**：播放头位置/掠过帧/`<audio>` 属性契约可判；**真实播放与 seek 不可验证** | 仪器不可达（R5.5-b 逐字）⇒ 登记 |
| 6 | **#6 记忆浮现** | T32 的 V1–V10 | ✅ **可判**（**含「不含 `letterSpacing`」硬判据**） | — |
| 7 | **相变两态（§6.3）** | T17 + T18 + T19 的 V1–V7 | 🟡 **部分**：通道/58px token/仪表结构/零 chrome 的实现路径可判；**像素观感不可判** | jsdom 不做样式级联 ⇒ 登记 |
| 8 | **LIVE 仪表 / 波形** | T18 的 V1–V7 | ✅ **可判**（div 条阵列 + 禁 SVG + 单调性 + 58px 走新 token） | 观感面登记 |
| 9 | **播放头 / 时间轨** | T25 的 V1–V9 | 🟡 **部分**（同 #5） | 同 #5 |
| ＋ | **列折叠 Flip**（**不在 9 项内**，但 R5.7 要求给结论） | T33 的 V0–V9 | 🔴 **大概率 STOP / 部分** | R5.7 的结构代价（8 处 + ≥2 条既有断言必红）⇒ 去向：控制方 + 用户裁决（路径 A/B/C） |
| ＋ | **环境层 4 件**（**R11.3 单独要求**） | T13 的 V1–V6 + T25/T28 的接线判据 | ① 探针摆动 ✅（既有落点 + 档位调制）② 采集脉冲 ✅（T18 接线）③ **未确认段落墨度 2%** ✅（**R11.3 真接线**：`lowConfidenceClass` 0→2 调用点 + 两处落点）④ 到期刻度微光 ✅（T21/T29 接线） | **逐条给「有真实落点」的证据**；🔴 **不得**出现「落 seam 但 0 调用点」被算作已交付 |

**二分清单（骨架）**
- **已交付（动效系统）**：GSAP 引擎与唯一入口 · **懒加载闭包判据** · 动效 token 单一真源（10 变量 + `pill`）· 四层纲领的**判据面** · 三档强度（通道 + 持久化 + UI 入口 + 源序）· 双基调（token + 具名 ease + 单调性）· reduced-motion 覆盖率 100%（名单 + 源序）· 响应层七类回执（**元素级覆盖，零调用点改造**）· 环境层四件（**R11.3 后四件都有真实落点**）· 确定性测试底座 · 可中断/可反向唯一出口 + 属性集合代理判据 · 6 个签名动效（**逐条带"可判/部分可判"标记**）· 相变两态 + 时间轨/播放头/到期刻度三个承载面 · **只读后端契约（3 项：`intervalDays` / `session_audio_path` / WAV 轴对齐）**。
- **未交付 / 未验证（逐条带去向）**：真实 60fps · Flip 几何位移 · 真实媒体播放与 seek · `window` 级滚动 · 真机/WebView2 观感 · 视图密度观感 · 切视图卡顿 · 惰性挂载的运行时内存 · 暗档 `data-theme` 实际生效 · 拖动三处里的两处 · 无 `role` 的 `div+onClick` · `ink-4` 接线 · 字号越界 551 · `docs/tech-debt/` · 跨窗口档位/相位同步 · **导入会话无音频承载面** · 孤儿 sidecar · D3–D6 残余漂移量级。

- [ ] **Step 1: 收集每个任务的报告读数**（逐任务：判据 ↔ 变异体 ↔ 期望/实际 + `ran` 闸读数）
- [ ] **Step 2: 填 9 项兑现度表 + 环境层 4 件**（**逐项必须指到 file:line**）
- [ ] **Step 3: 写二分清单**（**逐条带去向**）
- [ ] **Step 4: 全批收口评审八节**（照批 5 母本）
- [ ] **Step 5: 与 §10/§11 的加注逐条对拍**（T35 V6 的探针复跑）+ 登记提交（**若无 durable 结论 ⇒ 零提交 + 报告**）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **9 项逐条有结论**：表里 9 行**每行**都含「结论 / 判据 file:line / 未兑现的原因（若未兑现）/ 去向（若未兑现）」四要素；**没有一行**是「已交付」而**没有**判据指针 | **M1**：把第 5 项的判据指针删掉 | **M1 后期望**：探针报「第 5 项无判据指针」⇒ 红 |
| **V2** | **环境层 4 件逐条**（R11.3 收口要求）：四件**每件**都给「落点 file:line + 是否有真实调用点 + 判据」；🔴 **探针**：对「第 ③ 件」断言 `lowConfidenceClass` 的**生产调用点 ≥ 2**（T13 V4c 的探针复跑） | **M2**：把两处落点的调用改回不调用 | **M2 后期望**：调用点 0 ⇒ 红（**这就是 R11.3 要封的那条路**） |
| **V3** | **二分清单不含"笼统已交付"**：清单里**每一条**"已交付"都带判据落点；**每一条**"未交付/未验证"都带**去向**（批次号或"用户裁决"） | **M3**：加一条「动效系统已交付」无落点 | **M3 后期望**：探针报「无落点」⇒ 红（**R0.1 第 3 条逐字禁止笼统声称**） |
| **V4** | **收口回写八节齐备**（一–八逐节在场） | **M4**：删掉「六、未验证」 | **M4 后期望**：探针报缺 1 节 ⇒ 红 |
| **V5** | **与 T35 的 §10/§11 加注逐条一致**（T35 V6 的探针复跑绿）· **`## 诚实边界` 的两类严格分离**（「仪器不可达」与「本批未做」**各有归属、无混写**） | **M5**：把一条"仪器不可达"写进"本批未做" | **M5 后期望**：探针报分类不符 ⇒ 红 |

**提交信息**：`docs(batch6): 登记验收兑现度与收口结论`（subject 17 字；**若无 durable 结论 ⇒ 零提交 + 报告单列**）

**诚实边界**：① 🔴 **本任务是"给结论"不是"给认证"** —— 9 项里「可判」的部分只到**判据层**，**观感/帧率/真机**一律进「未验证」；② **兑现度表里的「✅ 可判」不等于「用户满意」** ⇒ 报告**不得**把"判据绿"写成"体验已验证"；③ **`Flip` 一项极可能以 STOP 收尾** ⇒ 它**不在 9 项内**，但必须在 §12 的登记与 `v0.22` 的「未做登记」里**逐字点名**；④ **评审件本身是人写的** ⇒ 它的一致性由 T35 V6 / 本任务 V5 的**机械对拍**保证，其余靠评审。

---

## 待裁决清单

> **口径**：本节列出**需要控制方/用户裁决**的条目（**P1 已裁的六条已进 `rulings.md §十一`，不在此重复**）。每条给：**冲突/未决点 · 本计划的默认执行形态 · 为什么需要裁 · 不裁的后果**。
> ⚠️ **P1 单元已提出的四条 + 本单元新增七条 = 共 11 条**；其中 **#1–#6 已有裁决或已追认**（列出仅为**留痕与反向可查**），**#7–#11 是本单元新增、尚未裁决**。

| # | 来源 | 冲突/未决点 | 本计划的默认执行形态 | 为什么需要裁 | 不裁的后果 |
|---|---|---|---|---|---|
| **1** | **R5.1**（`rulings.md:135`）+ §十-4 | **#1 对齐的「错位语义」**：规格只给一句、代码无对应物 ⇒ R5.1 的裁决**即为定义**（三轨按 `data-ms` 共轴 + 位移偏移 ≤8px + 第三轨 = OCR） | 照 R5.1 执行（T27） | R5.1 逐字「若与用户本意不符，**用户可否决**」 | 错位语义若不符用户本意 ⇒ T27 的形态作废（**但判据结构可复用**） |
| **2** | **R5.5 / PB1**（`rulings.md:355`）+ §十-6 | **#5 的 seek 残余风险**：Tauri **只在带 `Range` 的请求上**补 `Accept-Ranges` ⇒ 首请求若不带 Range，Chromium 可能判 streaming | **逐字登记 + 不声称「seek 已验证」**（T22/T25 的诚实边界） | 本环境**不可验证**（jsdom 无媒体栈 · headless Edge 不说 `asset:` 协议 · 真机/WebView2 用户已裁决跳过） | 若写成"seek 可用"⇒ **违反"标签不许说谎"**；若不写 ⇒ 下游误以为未做 |
| **3** | **PB1 逐字** | **导入会话无承载面**：音轨在 `%TEMP%/entropy-import-{id}/audio.wav` 且**导入结束即 `remove_dir_all`**、`%TEMP%` **不在** asset scope、`sessions` 表**无源视频路径列** | **UI 如实二分**（有音频 ⇒ 可播放；无音频 ⇒ 只读时间轨 + 一行提示）；**不猜来源** | 「看视频学习」是主场景之一 ⇒ 该场景的 #5 **今天无承载面** | 用户会以为"所有会话都能回听" ⇒ **产品承诺与实现不符** |
| **4** | **R6.9**（`rulings.md:353`）+ §十-3 | **`docs/tech-debt/`**（191,980 B / 1555 行 / 未入库未忽略） | **零动作**（全批 `git status` 恒为 `?? docs/tech-debt/` 一行） | 待用户裁决（删/入库/移走） | 若被别的单元 `git add -A` 扫入 ⇒ **191 KB 技术债报告进库** |
| **5** | **T7**（P1 的 S1 族） | **`MotionIntensityControl` 是否必须自建三段控件**：`app/src/components/**` 在 `nativeButton.ratchet` 域内 ⇒ 裸 `<button>` 会让冻结表因**新文件**红 | **复用 `ViewSwitcher` 原语**（20 行适配器） | R3.3 要求「走既有 `ed-btn` 段控件类名空间 + `aria-pressed` + 零行内 style」—— `ViewSwitcher` **逐字满足**；但"新组件"的字面要求未被满足 | 若控制方要求自建 ⇒ 需处理棘轮（`SPLIT_MOVES` 或冻结表）⇒ **属清单外既有断言改动** |
| **6** | **T33 / R5.7** | **列折叠 Flip 的结构代价**：裁决写「**7 处**页面同形」，本计划者实测 **8 处**；其中 **≥2 处**的既有断言**钉住"折叠态根元素 == column-bar"**（`GoalsPage.test.tsx:62` · `ChatSidebar.test.tsx:84`），而 `ChatSidebar.tsx:188-190` 的注释**逐字反对"多包一层"** | **T33 先 STOP 实测**，给出 A（改结构，需 G16 授权）/ B（`data-flip-id` 跨元素匹配，零断言改动，**但偏离 R5.7 的"先改结构"字面**）/ C（不做，只登记）三条的代价 | R5.7 逐字「若改结构代价超预算 ⇒ **STOP 报告 + 给出绿色方案实测**」 | 硬做 A ⇒ **撞两条既有断言 + 一条源码内注释的明确警告** |
| **7** | 🔻 **本单元新增** | **`session_audio_path` 的出参形状**：R5.5-b 写 `Option<String>`，但 R5.5-b 第 3 条**同时**要求把 `aligned` 自证量送到 UI（且「实现形态由计划定」）—— 裸 `String` 装不下它，而加第二条命令会破坏「本批唯一新增 IPC」与「312→313」 | **保持 1 条命令、计数 313**；出参改 `Option<SessionAudioRef>`（`{ path, aligned, durationMs }`，`path` 仍是**绝对路径**、前端仍走 `convertFileSrc`，与 `commands_images.rs:55` 先例同形） | 这是对**裁决字面**的唯一偏离（**命令名/入参/注册点/计数/安全三条全部不变**） | 若不追认 ⇒ 要么 `aligned` 丢失（历史录音被假装精确）、要么多一条 IPC（破 313 与"唯一新增"两条硬约束） |
| **8** | 🔻 **本单元新增** | **超大空档的上限 `MAX_GAP_MS`**：R5.5-b 要求「超大空档」处置，但**未给值**；不设上限则一段 1 小时静默会写 **115 MB** 静音 | 设 `MAX_GAP_MS = 10min`（超限 ⇒ `None` + `aligned = false`，**不补**） | 这是**手感/安全参数**，规格与裁决都没给 ⇒ 属"发明数字"的边界 | 不裁 ⇒ 实施者各写一个值；或按"不发明"原则**完全不补** ⇒ 超大静默窗又回到 D2 的无上界漂移 |
| **9** | 🔻 **本单元新增** | **#5 的「最近一帧」口径**：PB1 Q5-c 逐字「**【未能判定】**"最近一帧"的判据口径…**需 #5 自己定为单一真源**」 | `screensAround()`（`views/session/screensFor.ts`）：取 `first_seen_ms ≤ activeMs` 的**最后一屏**；无 ⇒ 取最早一屏；只取 `image_ref ≠ null` | 口径决定"掠过哪几帧" ⇒ **直接影响观感**，且无既有实现可援引 | 不裁 ⇒ 掠过帧的选取不可复现（**判据仍绿**，只是观感可能不符本意） |
| **10** | 🔻 **本单元新增** | **R5.7 的「7 处」与实测的「8 处」不一致**：本计划者实测 ColumnBar 渲染点 = `SessionsPage:279` · `KnowledgePage:249` · `GoalsPage:92` · `ChatSidebar:193` · `ClassroomSourceColumn:85` · `NoteReadingView:188` · `NotesListColumn:83` · `NotesGroupsColumn:58`（**8 处**；`NotesReadingColumn.tsx:190` 是注释） | **以代码为准（8 处）**，并在 T33 的 Step 0 里**逐处复核** | 裁决的数字若被当作清单，`git status`/评审会漏掉一处 | 漏一处 ⇒ 「所有折叠都有 Flip」这句话不成立 |
| **11** | 🔻 **本单元新增（**本批最重要的技术发现之一**）** | 🔴 **`Flip` 会写 layout 属性（`width`/`height`）**，与 **R8.4 的属性集合代理判据**（被动画属性 ⊆ `{transform, translate, rotate, scale, opacity, filter}`）**天然冲突** | T33 的 V3 **按实况写**：若 `Flip.from` 确实写 `width` ⇒ **如实登记为"属性集合判据在 Flip 上不成立"**，**不得**为了让判据绿而放宽 R8.4 | 这是"两条已批准要求互相排斥"的实例（`## Global Constraints` 的计划级冲突处理逐字要求 STOP + 绿色方案实测） | 硬做 ⇒ 要么 R8.4 被静默放宽（**判据失去意义**），要么 Flip 无法落地 |
| **12** | 🔻 **本单元新增（补登）** | **R5.5-b 的行数读数**：裁决写 `audio_store.rs`「**213 行**」，本计划者实测 **212**（`ReadAllLines` 口径）；另 `recon-a` A2 的「全仓 `58px` 0 命中」在本计划者仪器下是 **2 命中**（`SelectionActionMenu.test.tsx:51/56` 的 `258px` **子串**） | **以代码为准**（212 / 生产代码 0 处裸 `58px`） | 这两处不影响任何结论，但**读数必须可追溯** | 沿用旧读数 ⇒ 下游"前后对比"的基线错位 |

---

## 诚实边界

> **口径（R 系列 §九 + R0.1 第 3 条）**：🔴 **严格区分两类** —— **「仪器不可达」**（本环境物理上测不了 ⇒ **只能登记**，**不许**编造弱判据）与 **「本批未做」**（做得了但本批不做 ⇒ **逐条带去向批次**）。**B9 的「只有接缝、没有纲领」中间态声明在本批作废**（R0.1 第 3 条逐字）。

### 一、仪器不可达（**本批未测、且本环境测不了**；每条的「可能的将来仪器」也一并给出）

| # | 项 | 为什么测不了（逐字依据） | 本批的替代判据（**代理，不是等价**） |
|---|---|---|---|
| 1 | **真实 60fps** | jsdom 里 `performance.getEntriesByType` / `PerformanceObserver` / `requestIdleCallback` **全 `undefined`**，无 paint、无 layout-shift，`getBoundingClientRect` 恒 0，rAF 实测 **9 帧/205ms（≈39fps）**（spike S2/S4） | **被动画属性集合 ⊆ `{transform, translate, rotate, scale, opacity, filter}`**（R8.4 / T11）；🔴 收口**不得**出现「60fps 已达成」 |
| 2 | **Flip 的几何位移** | `Flip.getState` 的 `bounds` **全 0**、改 `position/left/top` 后仍全 0、`Flip.from()` 的位移增量**恒 `translate3d(0px,0px,0px)`**、`Flip.fit()` 退化成 `width:0px;height:0px`（spike S2.6） | 只判**结构契约（同宿主）+ Flip 已注册 + timeline 存在**（T33 V2/V3）；**几何位移只能 headless/登记** |
| 3 | **真实媒体播放与 seek** | jsdom **无媒体栈**；headless Edge **不说 `asset:` 协议**；真机/WebView2 **用户已裁决跳过**（R5.5-b 逐字） | `<audio>` 的**属性契约**（`src`/`preload`/`onTimeUpdate`）+ Rust 单测（路径边界）+ 纯函数（ms → 位置）（T22/T25） |
| 4 | **`window` 级滚动** | 读数恒 0，且抛 `Not implemented: Window's scrollTo() method`（spike S2） | **元素级** `scrollTo`（实测可精确断言 `scrollTop` 0/52.5/90/120）（T25 V1 / T31 V2） |
| 5 | **真机 / WebView2 观感** | 同上（用户裁决跳过） | 无代理；**只登记** |
| 6 | **视图密度观感** | jsdom 无排版 | 无代理；T25/T27/T31 只判**结构属性** |
| 7 | **切视图卡顿** | 无合成器、无真实 chunk 加载时序 | 无代理；**只登记**（惰性挂载的**运行时内存**效果同族） |
| 8 | **惰性挂载的运行时内存效果** | 同上 | 无代理；只判**挂载数/卸载数**（批 5 的既有判据） |
| 9 | **暗档 `data-theme` 实际生效** | `tokens.css:79` **定义**了它、**全仓 0 处写入方**（R2.5 实测）⇒ 暗档**今天永不生效** | 只登记（批 7/8）；本批新增 CSS **一律 `var(--ed-*)`、不假设亮档** |
| 10 | **jsdom 不做样式级联** | `getComputedStyle` **拿不到** `transition`/`animation` 的生效值（本仓多起实测） | 判**源码文本 + 类名 + DOM 属性**（静态守卫**必须**配行为判据，R1.4） |
| 11 | **三档「看起来不一样」** | jsdom 无排版、几何无差异（spike S4.2②） | 判**档位映射 + DOM 属性 + 源序 + 时长参数**（T6 V7 / 波 C 各任务的 V三档） |
| 12 | **环境层「在呼吸」的观感** | 同上 | 判**幅度（2% 逐字）/ 频率 / 桶 / 名单 / 形状 / 类名落点**（T13） |
| 13 | **`<audio>` 对 `asset:` URL 的 seek 精度** | 见 #3；**Tauri 侧 Range 支持是【实测源码】，Chromium 侧是【推断·强】**（R5.5-b 约束 1） | 逐字登记 + **不声称已验证** |
| 14 | **D2（静默窗）/ D6（逐包重采样余数）的实际量级** | 探针**禁 `cargo`** ⇒ 「不对应」是【实测源码】，**量级是【推断】**；且**漂移分布今天不存在**（`docs/archive/2026-09-05/asr-eval-first-report.md:35` 逐字） | T23 的**纯函数单测**（补静音的**构造性**正确）+ **禁止**写"实测漂移 X ms" |

### 二、本批未做（**做得了，本批不做**；逐条带去向）

| # | 项 | 为什么本批不做 | 去向 |
|---|---|---|---|
| 1 | **逐个调用点的响应层改造**（420 裸 `<button>` / 395 `div+onClick` / 118 input / 26 checkbox / 27 折叠） | 覆盖方式 = **元素级全局 CSS**（**零调用点改动**，T12）；逐个改不可验收 | **不排期**（T12 的覆盖已足够；单点定制属批 7/8 的按需） |
| 2 | **拖拽三处里的两处**（`NoteListRow` / `NoteTreeSection`） | `ColumnResizer` 已有 0.15s 背景色；另两处**零改动** | 批 7/8（需先补无障碍语义） |
| 3 | **无 `role` 的 `div+onClick`**（如 `ColumnBar.tsx:16`） | 「不是按钮语义」⇒ 给它们加回执**要先补 `role`**，而补 `role` 会**改 DOM 契约**（撞棘轮） | 批 7/8 |
| 4 | **暗档接线**（`data-theme`） | R2.5：本批**零动作** | 批 7/8 |
| 5 | **`ink-4` 接线 / §4.3 条件③（审校模式）** | R6.2：**不承接**；审校模式是**新交互模式**，不属动效批 | 批 7/8 |
| 6 | **`Text` 字号越界 551 处 / 120 文件** | R6.3：跨 120 文件、11 文件/25 处在 `NON_MIGRATED_14` 内 ⇒ 单批不可验收 | **批 8 治理收口**（本批只保证新代码不新增） |
| 7 | **`docs/tech-debt/`** | R6.9：**挂起待用户裁决** | **用户裁决** |
| 8 | **跨窗口档位/相位同步**（`?float=1` / `?overlay=1`） | 多窗口变体各自独立；无跨窗口通道 | 批 7/8（需先定窗口模型） |
| 9 | **导入会话的音频承载面** | PB1：音轨在 `%TEMP%` 且导入结束即删、`sessions` 表无源视频路径列 | **产品裁决**（见 `## 待裁决清单` #3） |
| 10 | **删除会话时的音频级联**（今天删会话**不删音频**） | PB1 顺带③：独立技术债、需产品裁决 | **产品裁决** |
| 11 | **孤儿 sidecar**（T23 新增的 `{id}.wav.meta.json` 不在 `cleanup` 的 `.wav` 过滤面内） | 本批新增面 ⇒ 与「删会话不删音频」同族 | 与 #10 一并裁决 |
| 12 | **D3–D6 的残余漂移**（每次暂停 ≤300ms · 停止尾块 ≤200ms · 逐包重采样亚样本） | R5.5-b 的裁决只根治 D1/D2；D3–D6 **量级未实测** | 批 7/8（需后端补测或真机） |
| 13 | **`docs/product/ui-ux-system.md` / `theme.md` 的四层动效 / 三档强度回写** | §14 逐字仍留批 8（`progress.md` §一 标 🟡 待裁） | 批 8（或用户另裁） |
| 14 | **列折叠 Flip（若 T33 走 STOP/C 分支）** | R5.7 的结构代价（见 `## 待裁决清单` #6） | 控制方 + **用户裁决** |
| 15 | **环境层第 ③ 件的"落点是否算真接线"** | R11.3 已裁「真接线」；**电（本批）接线在 T25/T28**，T13 只落 seam | 已定（**报告不得把 T13 的 seam 写成已交付**） |

### 三、措辞纪律（收口前逐条复查）

1. 🔴 **「60fps」只能出现在「未测」与「代理判据」两处** —— **禁止**「60fps 已达成」类表述（R8.4 逐字）。
2. 🔴 **不得出现**「播放已可用」「seek 已验证」「已真机确认」（R5.5-b 逐字）。
3. 🔴 **`charRate` 不得被称为"真实语速"**（R5.2 逐字：它是**字符率近似**，规格未定义语速函数）。
4. 🔴 **`aligned === false` 不得被描述为"未对齐"** —— 它是「**无时间基准、不能保证**」（历史录音无法判定）。
5. 🔴 **「落了 seam」≠「已交付」** —— 环境层第 ② / ④ 件在 T13 结束时**仍是 seam**，只有 T18/T21/T29 接线后才算（R11.3 收口要求逐字）。
6. 🔴 **「判据绿」≠「体验已验证」** —— 9 项兑现度表里的「✅ 可判」只到判据层。

---

## 收口回写八节（波 D 的交付形态；照批 5 母本）

> **落地位置**：`docs/versions/v0.22.md` 的**批 6 节**（**七段结构**，T35 Step 4）+ 批次报告 `task-36-report.md` / `closing-review.md`（**gitignored ⇒ 永不 `git add -f`**）。**下面八节是收口评审件的骨架**（与 `v0.22` 的七段互为印证：第三段的「规格漂移纠正」对应本节第四段，「过程中纠正的计划错误」对应本节第八段）。

1. **三条硬约束的判据与读数**（R0.1 第 1 条的 ① 规格加注 / ② `ADR-035` 例外节 / ③ `cargo test` 真跑）—— 逐条给**文件:行 + 命令 + 读数 + 提交 sha**。
2. **八门禁终态表**（T34 的 8 行，逐行给命令 / exit / 逐字读数）+ **首屏三件套**（原始 / Δ / 机理）+ `app/dist` mtime + 冻结提交 sha。
3. **逐任务提交轨迹**（T1–T36：任务号 / 提交 sha / subject / 该提交的门禁读数 / 备注「哪一行是在哪次提交落库的」）—— ⚠️ 共享文件（`scripts/line-limits.mjs` / `docs/standards/line-limit-exemptions.md`）的改动归属必须用 `git log -p -- <file>` **核对后**再写（DISPATCH-TEMPLATE §三第 2 条的教训逐字）。
4. **R 系列的实际结果**（R0.1–R11.8 **逐条**：照做 / 追认后偏离 / 未触发的条件授权（**G15**）/ 新增授权（**G11–G14**）/ 新增候选（**G16**））—— **不得**只写"全部照做"。
5. **诚实代价**（本批**真实付出**的代价：`App.tsx` 逼近 600 · `motion.css` 六次追加逼出拆文件 · `style-seams.test.ts` 的三任务串行队列 · 六个新前端目录/文件 · 1 条新 IPC 与 3 项后端只读改动 · 每次真实构建都要**人工取锁** · `docs/tech-debt/` 全程占着 `git status`）。
6. **未验证（诚实单列）** —— **逐条**复制 `## 诚实边界` 的第一类（14 条），**不得**合并同类项、**不得**删减。
7. **follow-ups（逐条具名归属）** —— 每条给「事项 / 归属批次 / 触发条件 / 接手所需的读数」；**至少**覆盖：`Flip` 的 `width/height` 与 R8.4 的冲突 · D3–D6 残余 · 导入会话音频 · 删会话不删音频 + 孤儿 sidecar · 跨窗口同步 · `ADR-019` 缺号 · `docs/product/` 的四层回写 · 暗档接线 · `ink-4` / 审校模式 · 字号越界 551 · 五类棘轮余量 · `bundle-eager-graph` 的 `import type` 口径。
8. **与计划的偏差（本节自陈）** —— 逐条给「计划原文 / 实际做法 / 为什么 / 谁批的（裁决号或 STOP 记录）/ 是否已回写文档」。🔴 **本单元（P2）已在编制期产生的偏差必须在这里留痕**：R11.3 的接线**下沉到 T25/T28**（写者队列冲突）· T33 的落点**8 处 ≠ 7 处** · `session_audio_path` 的**出参形状校订** · `MAX_GAP_MS` / `screensAround` 两个**新造常量与口径** · G15 **未触发** · `motion-coverage.test.ts` 的 **G16 候选**。
