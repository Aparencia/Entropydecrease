# 批 0-D L1 原语层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `app/src/ui/` 下**新建** 9 类 L1 原语（`Button` · `Surface` · `Text` · `Modal` · `ConfirmDialog` · `Toast` · `EmptyState` · `Loading` · `StatusLine`）+ 4 件硬前置配套（阴影定值 · 字阶 CSS 变量 · 剪报前景裁决 · z-index 守卫），使**批 4 的迁移**与**批 6 的动效**都能"一次改对所有地方"；本批**不迁移任何现有调用点**，界面外观零变化是设计意图（规格 §10「批 0–1 期间界面几乎不变」）。

**Architecture:** 原语层是**新的第三层**（现只有组件层与 token 层）：`app/src/ui/primitives/` 一个子域，沿用 `app/src/ui/icons/` 的「子域 + 单一 `index.ts` 导出面」范式。每个原语 = **一个实现文件 + 一个同名 CSS + 一个测试**（PascalCase 组件名 / camelCase 纯模块，与 `zIndex.ts` / `tokens.ts` 一致）。**样式用 CSS 类而非内联 style**：`:hover` / `:active` / `:focus-visible` / `@keyframes` / `@media (prefers-reduced-motion)` 都无法写进内联 style，而规格 §8.6.1 要求原语**内置交互态 + 预留动效接缝**。颜色与字阶**一律经 CSS 变量消费 token**，`primitives/**/*.css` 内**零颜色字面量**。共享内核两件：`usePresence`（卸载时机；Modal/ConfirmDialog/Toast 共用）与 `useFocusTrap`（Modal/ConfirmDialog 共用）。z-index 一律 `zIndex("…")` 从六档标尺取（规格 §4.2①：标尺是 TS 模块**不是** CSS 变量）。

**Tech Stack:** Tauri 2 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7 · Vitest 4（全局 `environment: "node"`，组件测试文件首行 `// @vitest-environment jsdom`）· 复用批 0-A 的 token 层与批 0-B 的图标层

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§4.1/§4.2 视觉基座 · §5.1–5.3 L1 原语层 · §8.1–8.6.1 动效纲领 · §10 批次划分 · §11 验收口径 · §14 文档与提交）

**输入材料（开工前四份，优先级即此序）**
1. `.superpowers/sdd/2026-09-11-frontend-redesign-batch0d-primitives/recon.md`（473 行现状盘点；**本计划的全部数字与落点取自它**，其 §10 是一页速查）
2. `.superpowers/sdd/2026-09-11-frontend-redesign-batch0d-primitives/progress.md`（本批台账：范围、用户裁决、纪律）
3. 规格对应节（§5 / §8.1–8.6.1 / §10 / §11）
4. `.superpowers/sdd/DISPATCH-TEMPLATE.md`（实施者纪律）· `.superpowers/sdd/REVIEW-TEMPLATE.md`（评审者纪律）

## Global Constraints

- **本批范围（控制方裁决 A）**：**已落地不重做** —— z-index 标尺（`app/src/ui/zIndex.ts`）· token 层（`tokens.ts` / `tokens.css` / `tokens.gen.ts` / `contrast.ts`）· 图标集（`app/src/ui/icons/`，批 0-B，**含 `IconName` 联合类型可被原语消费**）。本批新建 9 类原语 + 4 件配套（阴影 · 字阶 CSS 变量 · 剪报前景裁决 · z-index 守卫）。
- **★ 本批不迁移任何现有调用点**（规格 §10：20 弹层 / 44 空态 / 85 加载 / 196 错误行 / 4 toast / 2 confirm 的替换是**批 4**）。**不修改任何现有组件的行为**，唯一例外是 Task 13 的两处「清死代码」（`app/src/App.css` 删除 · `ChatMessageList.tsx:147` 死 `animation` 声明删除）—— 两者都**不改变渲染结果**，属清死代码而非行为变更。
- **行数红线**：**新文件一律 ≤300 行**（`scripts/line-limits.mjs` 的 `SCAN_DIRS` 含 `app/src`，`ui/` 受管辖；`SOURCE_EXT = /\.(ts|tsx|rs)$/` **不含 `.css`** ⇒ CSS 由 Task 14 的守卫测试补上同一条 300 行上限）。口径 = `[System.IO.File]::ReadAllLines($p,[System.Text.Encoding]::UTF8).Count` = `countLines()`。⚠️ **不要用** `Get-Content`（本机 PS 5.1 + 码页 `gb2312` 会按 GBK 解码、**少算可达 56 行**）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数。**每个原语独立小文件**（规格红线 §3.5）；**不往 >300 行的文件里加代码**。
- ⚠️ **口径冲突（本计划显式标注）**：`recon.md` §1.1 自述「行数取 `Get-Content().Count`」——**那正是 AGENTS.md §3.1 禁用且少算的口径**。实测两例：`app/src/ui/tokens.css` recon 记 67 / 实测 **69**；`app/src/ui/icons/no-inline-svg.test.ts` recon 记 52 / 实测 **61**（该文件含大量中文注释，GBK 解码吞行）。⇒ recon 的**结论**（`ui/` 全部「≤300」）仍成立且余量巨大，但**任何行数判定必须用 `countLines()` 重测**，不得引用 recon §1.1 的数字。同理：控制方裁决 Task 13 时写的「`App.css` 103 行」与实测 **123 行**不符（口径同源问题），**以 123 为准**。
- **零新增依赖（硬约束）**：`@testing-library/react@16.3.2` · `@testing-library/dom@10.4.1` · `jsdom@30.0.1` · `vitest@4.1.11` **已在**（实测 `app/package.json` devDependencies 全文，recon §6.3）。**缺 `@testing-library/jest-dom` 与 `@testing-library/user-event`** ⇒ **优选用原生断言**（`expect(el.getAttribute("aria-modal")).toBe("true")` / `expect(screen.queryByTestId("x")).toBeNull()`），交互用 `fireEvent`，**一律不新增依赖**。**若某个原语确实无法测，先报控制方，不要自行加依赖。**
- **测试环境**：`app/vitest.config.ts` 全局 `environment: "node"` ⇒ **组件测试文件首行必须写 `// @vitest-environment jsdom`**（`app/src/test/setup.ts` 只桩了 `Range` 几何，**`matchMedia` / `ResizeObserver` / `requestAnimationFrame` 无桩**）。纯逻辑测试留在 node 环境。
- **可复用测试范式三种**（recon §6.1）：**A 整对象钉值 + 结构不变量**（`zIndex.test.ts`）· **B 规范硬数字机器化 + 反例守门**（`contrast.test.ts`，含「旧值必须不达标」）· **C 直接 import 实现生成口径**（`tokens.drift.test.ts` 直接 import `../../scripts/gen-tokens.mjs`，并用 `normalizeEol` 归一）。⚠️ 本仓无 `.gitattributes` 且 `core.autocrlf=true` ⇒ **禁止逐字节换行断言**。
- **Node 内建类型面**：`app/tsconfig.json` **没有 `@types/node`**，只有 `app/src/node-builtins.d.ts` 手写的**最小声明** —— `node:fs` 仅 `readFileSync / readdirSync / statSync`，`node:path` 仅 `dirname / join / relative / sep`，`node:url` 仅 `fileURLToPath`。**守卫测试只能用这些符号**（`existsSync` / `writeFileSync` 等会 TS2307）；确需扩充时**显式扩写该 `.d.ts`**（禁 `any`），并在报告里点名。
- **每个新 `.ts`/`.tsx` 文件必须含 `@ai-context`**（业务背景 / 副作用 / 边界）；**禁止 `any`**；新增 CSS 文件顶部也要有一行「为什么存在 + 不得出现颜色字面量」的注释。
- **提交纪律与并行纪律直接照 `.superpowers/sdd/DISPATCH-TEMPLATE.md` 执行**（不要把该文件的条文复制进本计划）：§一 硬约束 · §二 门禁纪律（含 `pre-commit` = `line-limits --full` + `docs-check` + `check-command-registry` 三条）· §三 提交与协作纪律（`git add <显式路径>`、禁 `git add -A` / `stash` / `checkout --` / `--no-verify`、共享文件 `git diff --cached --stat` 复核、并行碰撞协议 `Start-Sleep -Seconds 90` 重试最多 5 次、**判门禁要在提交树上判**）· §五 报告与收尾（**临时文件只许进批次 `tmp/`**，不许放仓库根）。
- **门禁（每步都要跑，全绿才算完成）**：仓库根 `node scripts/line-limits.mjs --full` · `node scripts/docs-check.mjs` · `node scripts/check-command-registry.mjs`；`app/` 下 `npx tsc --noEmit` · `npx vitest run`。**基线：104 文件 / 811 用例**（本计划编写时实测：`Test Files 104 passed (104) · Tests 811 passed (811)`，exit 0）—— 用例数**只许增不许减**。新增/改动 CSS 或入口 import 的 Task（**1 / 13**，Task 14 收口复核）**额外跑 `npm run build`**（`tsc && vite build`）。
- **★ 交付形态与「出生即用标尺」**：所有原语在 `z-index` 上**必须**用 `zIndex("modal" | "modalNested" | "toast")`（规格 §4.2① · recon §7.3 的共享档位表），**不得写裸数字**；Task 2 的守卫让这条从纪律变成机器判据。
- **★ token 消费纪律**：原语只许用 CSS 变量（`var(--ed-*)`）与 `zIndex()`。⚠️ **陷阱**：`varRef()` / `cssVar()` 的入参类型是 `ColorTokenName`（16 个颜色名的字面量联合）—— **`varRef("shadow-2")` 编译期就报错**。阴影与字阶变量**只在 CSS 里用 `var()` 消费**（`primitives/**/*.css`），**本批不改 `tokens.ts` 的门面签名**。
- **★ 交互态承载方式（本计划的架构裁决，AFR-1）**：`recon §8.2` 实测 —— CSS `:hover` / `:active` 在**活代码里 0 处**（6+2 处全在死文件 `App.css`）· `:focus*` / `:disabled` **各 0** · `aria-disabled` **0** · `tabIndex` 全仓 **1 处** · 可点性主要信号是 `cursor:"pointer"`（306 行/126 文件）· 禁用视觉降级**只有 1 处**。⇒ **本批是在零基础上建立交互态契约**。裁决：**用 CSS 类**（`.ed-*` + `.ed-*--*` 修饰符，扁平、可 grep、无 CSS-in-JS、无新依赖），**不用**现有 13 个文件那种「`onMouseEnter` + 局部 state」写法（那会让批 6 被迫逐处改）。**唯一例外**：z-index 走内联 `style={{ zIndex: zIndex("…") }}`（标尺是 TS 模块，见上）。
- **动效：单属性 ≤200ms 的交互反馈一律 CSS `transition`**（规格 §8.2 判据 + §8.4 的 `--dur-micro 120ms`）；**循环环境动效才用 `@keyframes`**（今天全仓 `@keyframes` **0 个**，本批起要有）。**`prefers-reduced-motion` 优先**（今天全仓 **0 处**）：`motion.css` 里一条媒体查询覆盖全部 `.ed-*` 类，且 `usePresence` 自己带 `matchMedia` 守卫（规格 §8.4 明写：reduced-motion 下不会有 `transitionend`，缺兜底会「关不掉的弹层」）。
- **动效时长接缝（AFR-2）**：批 6 才落地 `--ed-dur-*` / `--ed-ease` token（0-A 计划自审已把「时长/缓动」推迟到批 6）。本批在 `primitives/motion.css` 里**按规格 §8.4 的名字与数值**先定义：`--ed-dur-micro: 120ms` · `--ed-dur-overlay-in: 200ms` · `--ed-dur-overlay-out: 160ms` · `--ed-dur-toast-in: 180ms` · `--ed-dur-toast-out: 140ms` · `--ed-dur-skeleton: 1200ms` · `--ed-ease: cubic-bezier(0.2, 0, 0, 1)`，并注明「**批 6 的 token 真源落地后整块删除**」；所有引用点写 `var(--ed-dur-x, <同值字面量>)` ⇒ 删块即生效、深导入也不失效。
- **三处曾列为「待控制方拍板」的项，已由控制方 2026-09-11 追加裁决全部拍定 —— 照下面的定案执行，不要再按旧默认**（旧文本「本批不接线 / 三形态待定 / 危险用色待定」已作废）：
  1. **`ui/tokens.css` 入口接线 = 本批必须接线（Task 1 Step 3 落地）**：实测 `import "*.css"` 全仓只有 `app/src/main.tsx:5` 的 `note-mark.css`，`tokens.css` **从未被 import**（recon §9.11）⇒ 不接线的话，本批原语里 `var(--ed-shadow-2)` / `var(--ed-dur-micro)` 这类引用**在运行时根本没有值**（原语等于没生效）。做法：`app/src/main.tsx` 加一行 `import "./ui/tokens.css";`（该文件只定义 `:root` / `[data-theme="dark"]` 的自定义属性、**无任何选择器** ⇒ **零视觉变化**，不违反「本批不改观感」）+ 一条**防回归守卫断言**（断言 `main.tsx` 含该 import）。⚠️ 这是「让原语真能用」的最小前提，**不是接线迁移** —— 现有组件改用 token 仍是批 4。
  2. **`Loading` 的形态 = 三命名导出** `Loading` / `Skeleton` / `Probe`（Task 11 已按此写，并补了三者的**可判定语义边界**与消费场景 —— 免得批 4 把三个词混用）。
  3. **危险/错误语义 = 不新增 token**：`StatusLine` 的 `error` 用 `--ed-stamp` 作**文字色**（**显式契约**见 Task 12），`ConfirmDialog` 的破坏性确认**按钮保持中性**（`variant="secondary"`），危险信号由**标题旁的印章标记 + 级联影响清单**承载。**反例守卫**见 Task 14 Step 1 第 4 条（`--ed-stamp` 不得出现在任何 `background*` 声明里 —— 规格 §4.1「绝不用于按钮」）。

### 每个原语任务的统一作业模式（Task 3–12 共用，逐条照做）

> ⚠️ **本批与 0-C2/0-C3 的关键差别**：那两批是**纯搬运**（等价性靠机械对拍），**本批是新建代码** —— 等价性不再是判据。验收转为：**接口契约 + 单元测试（先红后绿）+ 行数红线 + 交互态齐全 + 不往未迁移的旧组件里加逻辑**（`progress.md` §三）。

1. **先读契约**：本任务的整节 + 上一节「落点与文件清单」+ 你要消费的原语的**已完成**接口（`Consumes` 一栏给了确切签名）。**你只写自己任务的产出文件**；不改别的原语、不改任何现有组件。
2. **先写测试（先红）**：按范式 A/B/C 写 `*.test.tsx`（jsdom）或 `*.test.ts`（node）。测试文件首行必须 `// @vitest-environment jsdom`（组件/hook）—— **纯函数与 CSS 文本守卫留 node**。跑一次确认**因"模块不存在/断言不成立"而红**，把红的原因写进报告。
3. **实现**：单一职责、≤300 行、**不 import 上层**（原语不得 import `components/` `pages/` `hooks/` 里的任何东西；组内互引用走相对文件路径 `./Text`，**不 import barrel**，避免循环依赖）；导出面以本任务 `Produces` 为准，**不擅自加参数**。
4. **交互态与接缝自检**：逐条对照本任务「交互态与接缝清单」与下面「动效接缝验收（四条硬约束）」，在报告里**逐条给结论**（做了什么 / 落在哪个类或 `data-*` 属性上）。
5. **门禁**：`npx tsc --noEmit` → `npx vitest run`（**用例数不减**）→ 仓库根 `node scripts/line-limits.mjs --full` · `node scripts/docs-check.mjs` · `node scripts/check-command-registry.mjs`。新增/改动 CSS 或入口 import 的任务加跑 `npm run build`。
6. **提交**：`git add <显式路径…>` → `git diff --cached --stat` 复核只含自己的文件 → `git commit -m "<type>(ui): …"`（Conventional Commits，subject ≤50 字，动词开头）。**一步一个提交**，禁止 `git add -A`。
7. **报告 + 独立评审**：报告写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch0d-primitives/task-<N>-report.md`；**每个 Unit = 一个独立实施者 + 一份独立任务评审**，评审报告写同目录 `task-<N>-review.md`，两者**分别照 `.superpowers/sdd/DISPATCH-TEMPLATE.md` 与 `.superpowers/sdd/REVIEW-TEMPLATE.md` 执行**（评审者只读 + 只写自己那份报告，禁止改源码/git 写操作）。报告必含：实测行数（`countLines()` 口径，逐个文件）· 每步 commit 号 · 门禁输出与 exit · 交互态清单逐条结论 · **你没能验证的地方**（诚实单列）。

### 动效接缝验收（规格 §8.6.1 四条硬约束 —— **每个原语 Task 的验收清单都含这四条**，逐字适用）

1. **配重：两个主场、交互优先** —— 响应层（80–180ms）与"用户动作触发的编排层"是第一优先；环境层（2–6s）保持可感知的生命感、不得降为纯背景。⇒ **原语必须内置交互态**，不能只"长得对"。
2. **每个用户动作都要有即时回执**（点击 / 拖拽 / 悬停 / 键入 / 勾选 / 展开折叠 / 切换视图）："收到了"与"做完了"必须可区分。
3. **可中断、可反向是硬指标**：下一个输入要能**接管**当前动效，不排队。⇒ 原语必须**预留动效接缝**（否则批 6 只能回头改每一处调用点）。
4. **"活"不得以无障碍为代价**：`prefers-reduced-motion` **优先于**强度档位；键盘路径（Tab 顺序 / 焦点可见 / Esc 退出）与"活"冲突时**无障碍优先**。

**逐类接缝表（每个 Task 的「交互态与接缝清单」即取自本表对应行，验收时逐条打勾）**

| 原语 | 必须内置的接缝 | 本批落点 |
|---|---|---|
| `Button` | hover / active / focus-visible / disabled 四态 + 按下微陷 | `Button.css` 的 `:hover` `:active` `:focus-visible` `:disabled` + `[aria-disabled="true"]` |
| `Surface` | hover 升起 / 边框墨度 | `Surface.css` 的 `.ed-surface--interactive:hover`（升起 = `--ed-shadow-1` + `translateY(-1px)`） |
| `Text` | 墨度与字距的可动画钩子 | `Text.css` 的 `transition: color … , letter-spacing …` + `.ed-text--*` 墨度类 |
| `Modal` · `ConfirmDialog` | 进出场 presence 钩子（200/160，**出场比进场快**）+ 遮罩淡入 | `[data-phase]` 三态 + `usePresence` + `--ed-dur-overlay-in/out` |
| `Toast` | 进出场 180/140 + **可打断** | `[data-phase]` 三态 + `usePresence` + `--ed-dur-toast-in/out` + 「新消息接管、不排队」状态机 |
| `EmptyState` · `Loading` · `StatusLine` | 骨架微光 / 探针的 `@keyframes` 钩子 | `Loading.css` 的 `ed-skeleton-shimmer` / `ed-probe-swing`；`EmptyState` 入场类；`StatusLine` `role` + 浮现类 |

### 落点与文件清单（本计划已定；依 recon §5.2 的两条先例取「子域 + index 导出面」）

**目录**：`app/src/ui/primitives/`（新建）。第二条先例（扁平直放 `app/src/ui/`）**未采纳**：9 类 × (实现 + CSS + 测试) ≈ 30 个文件会把现为「5 个扁平模块 + 1 个子目录」的 `ui/` 冲垮，而 `icons/` 已证明子域 + 单一导出面可行且让「换实现」只需改一个文件。

| 文件 | 职责 | 行数预算 | 任务 |
|---|---|---|---|
| `ui/primitives/motion.css` | 动效接缝变量块（批 6 删除）+ 唯一一条 `prefers-reduced-motion` 块 | ~55 | T3 |
| `ui/primitives/Text.tsx` + `Text.css` | 墨度 × 字阶的唯一出口 | ~75 + ~65 | T3 |
| `ui/primitives/Surface.tsx` + `Surface.css` | 面（底 / 边框 / 圆角 / 阴影）唯一出口 | ~70 + ~55 | T4 |
| `ui/primitives/Button.tsx` + `Button.css` | 按钮四态契约（**本批最有价值的产出之一**） | ~95 + ~85 | T5 |
| `ui/primitives/usePresence.ts` | 卸载时机内核（`transitionend` + 超时兜底 + `matchMedia` 守卫） | ~95 | T6 |
| `ui/primitives/useFocusTrap.ts` | 焦点陷阱 / 打开聚焦首元素 / 关闭归还焦点 | ~85 | T7 |
| `ui/primitives/ime.ts` | `isImeComposing()`（规格 §5.2 第三条的接缝，本批只建不接） | ~25 | T7 |
| `ui/primitives/Modal.tsx` + `Modal.css` | 弹层唯一实现（`createPortal` + `role="dialog"` + `aria-modal`） | ~200 + ~80 | T7 |
| `ui/primitives/ConfirmDialog.tsx` + `ConfirmDialog.css` | 危险确认（级联影响清单） | ~120 + ~50 | T8 |
| `ui/primitives/Toast.tsx` + `Toast.css` | 进出场 180/140 + 可打断 | ~145 + ~75 | T9 |
| `ui/primitives/EmptyState.tsx` + `EmptyState.css` | 空态 + 主行动按钮 | ~90 + ~55 | T10 |
| `ui/primitives/Loading.tsx` + `Loading.css` | `Loading` / `Skeleton` / `Probe` 三形态 | ~110 + ~85 | T11 |
| `ui/primitives/StatusLine.tsx` + `StatusLine.css` | 状态行（三红归一） | ~95 + ~60 | T12 |
| `ui/primitives/index.ts` | 公共导出面（+ `import "./motion.css"`） | ~40 | T3 建、T4–T12 各加一行 |
| `ui/zIndex.guard.test.ts` | **棘轮守卫**：裸数字 z-index 只许减少 | ~130 | T2 |
| `ui/primitives/style-contract.test.ts` | CSS 守卫：每个 `.css` ≤300 行 · 零颜色字面量 · 全部类都在 reduced-motion 名单里 | ~70 | T14 |

> **测试文件与实现同目录**（先例：`ui/icons/no-inline-svg.test.ts`、`ui/zIndex.test.ts`）；**测试文件同样受 ≤300 行管辖**（`line-limits.mjs` 不排除测试）⇒ 控制单测规模，超了先拆断言组。

### 派发顺序与并行纪律

| Task | 内容 | 依赖 | 可否并行 |
|---|---|---|---|
| 1 | token 补齐（阴影 · 字阶 CSS 变量 · `--due` 修正 · `tokens.css` 入口接线） | — | **先做且不并行**（改生成器与产物） |
| 2 | z-index 守卫（棘轮） | — | ✅ 可与 T3–T13 任意并行（只新增 1 个文件） |
| 3 | `Text`（建 `index.ts` / `motion.css`） | T1 | ❌ 与 T4–T12 串行（共享 `index.ts` 一行导出面） |
| 4 | `Surface` | T1 · T3 | 同上 |
| 5 | `Button` | T1 · T3 · T4 | 同上 |
| 6 | `usePresence` | T1 | 同上 |
| 7 | `Modal`（+ `useFocusTrap` + `ime`） | T1 · T3 · T4 · T5 · T6 | 同上 |
| 8 | `ConfirmDialog` | T7 | 同上 |
| 9 | `Toast` | T1 · T3 · T6 | 同上 |
| 10 | `EmptyState` | T3 · T5 | 同上 |
| 11 | `Loading` | T1 | 同上 |
| 12 | `StatusLine` | T3 | 同上 |
| 13 | 清死代码（`App.css` 删除 + `chatBlink` 死声明 + 两条注释改指） | — | ✅ 可与 T2–T12 任意并行（不碰 `index.ts`） |
| 14 | 收尾（ADR-033 · `ui-ux-system.md` 原语章节 · 规格回写 · 登记记录 · CSS 守卫 · 全批次门禁） | 全部 | ❌ 最后 |

> **T3–T12 为何串行**：每个都要往同一个 `app/src/ui/primitives/index.ts` 追加一行导出（共享文件），并行会造成 `git add` 与 `git commit` 交错污染（`DISPATCH-TEMPLATE.md` §三已列 0-C 期 10 次实测事故）。**T2 / T13 与任何任务都不共享文件，可安全并行**，但**同一时刻最多一个实施者动 `index.ts`**。

---

### Task 1: token 补齐（阴影定值 · 字阶 CSS 变量 · `--due` 修正 · 剪报前景裁决 · 入口接线）

> **为什么第一个做**：原语要消费它们（规格 §4.2②「必须在批 0-D 落地前定值」；0-A 计划的 0-D 硬前置①②③）。**顺序不可倒**：先定 token 再动原语。本任务另外承担两件被控制方 2026-09-11 追加裁决的事：**`--due` 亮档第二次对比度修正**（Global Constraints 引用）与 **`ui/tokens.css` 入口接线**。

**Files:**
- Modify: `app/scripts/gen-tokens.mjs`（**唯一真源**；颜色值只许出现在这里）
- Regenerate（只能由脚本写）: `app/src/ui/tokens.css` · `app/src/ui/tokens.gen.ts`
- Modify: `app/scripts/gen-tokens.test.mjs`（加字阶/阴影/`--due` 断言）
- Modify: `app/src/ui/contrast.test.ts`（加「剪报底 × 墨」组合断言 + `--due` 新值断言 + `ink-4` 禁止组合的反例守门）
- Modify: `app/src/ui/tokens.drift.test.ts`（加**入口接线守卫**：断言 `main.tsx` import 了 `./ui/tokens.css`）
- Modify: `app/src/main.tsx`（加一行 `import "./ui/tokens.css";`）
- Modify: `docs/product/ui-ux-system.md`（`:186` / `:204` 的 `--ed-shadow-card` 处置 + 新增「剪报底纹上只用 `ink-3` 及更深」规则）
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§4.2 补字阶变量命名与换算 · §4.1 补 `--due` 第二次修正 · §4.4 补剪报前景裁决与禁止组合）

**Interfaces:**
- Consumes: 无（本批第一个任务）；现状 `typeScale` 是 6 个人类可读串（`tokens.gen.ts:49`），CSS 消费不了
- Produces（T3–T14 依赖，名字逐字固定）:
  - `--ed-shadow-1` / `--ed-shadow-2`（**两档各一值**：`:root` 投影 / `[data-theme="dark"]` 反相白描边）
  - `--ed-type-1-size` … `--ed-type-6-size` · `--ed-type-N-line` · `--ed-type-N-weight`（**18 个变量**，`N` = `TYPE_SCALE` 下标 + 1）
  - **`--ed-due` 亮档新值**（`#A05F10` → 求解所得，见 Step 6；暗档 `#E0A44B` 不动）
  - **`app/src/main.tsx` 接线 `./ui/tokens.css`**（此后 `ui/primitives/**` 的 `var(--ed-*)` 在运行时才有值）
  - `TYPE_SCALE: readonly { size: number; line: number; weight: number }[]`（生成器导出，6 档）· `SHADOW_TOKENS`（生成器导出，2 档 · 两档值 + usage）
  - `SCALE_TOKENS.typeScaleVars`（TS 产物，结构化字阶，供 `Text`/`StatusLine` 的字面量兜底与断言）

- [ ] **Step 1: 生成器加结构化字阶真源（消掉无单位行高）**

在 `app/scripts/gen-tokens.mjs` 的 `SCALE_SOURCE` **之前**插入：

```js
/**
 * 字阶结构化真源（规范 §4.2）—— CSS 变量与人读串**同源派生**，不允许各写一份。
 * 第 3 档原为无单位行高 `1.9`，其余为 px（两种写法并存会让 CSS 无法统一消费）；
 * 换算依据：15.5px × 1.9 = 29.45px ⇒ 取一位小数 **29.5px**（0.5px 是可用精度，
 * 差 0.05px 不影响任何排版判定，且比 29px 更接近真实行高）。
 */
export const TYPE_SCALE = [
  { size: 25, line: 34, weight: 600 },
  { size: 17, line: 24, weight: 600 },
  { size: 15.5, line: 29.5, weight: 400 },
  { size: 13, line: 20, weight: 400 },
  { size: 12, line: 18, weight: 500 },
  { size: 11.5, line: 16, weight: 500 },
];

/**
 * 阴影 token（规范 §4.2② · 2026-09-11 用户裁决「纸感双层暖墨」，提交 `44b6e05a`）。
 * **暗档不用投影**，改白色反相描边（沿用 `docs/product/ui-ux-system.md:204` 的既有做法）——
 * 暗底上的黑色投影看不见，只会让面板边缘糊成一团。
 */
export const SHADOW_TOKENS = [
  { name: "shadow-1", light: "0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)", dark: "0 0 0 1px rgba(255,255,255,.06)", usage: "低层：菜单 / 浮层 / 小卡（亮档投影；暗档反相描边）" },
  { name: "shadow-2", light: "0 2px 4px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.14)", dark: "0 0 0 1px rgba(255,255,255,.06)", usage: "高层：Modal / 浮窗（亮档投影；暗档反相描边）" },
];
```

同时把 `SCALE_SOURCE.typeScale` 那一行改成**派生**（并删除原有的手写串数组）：

```js
  typeScale: TYPE_SCALE.map((t) => `${t.size}px/${t.line}px·${t.weight}`),
```

并把 `bg-raised` 的 `usage` **如实化**（0-A 交接清单第 1① 条点名要清掉的「引用未定义变量」状态）：

```js
  { name: "bg-raised", light: "#FFFFFF", dark: "#24211E", usage: "弹层 / 菜单 / 浮窗（亮档另加 --ed-shadow-1）" },
```

同一文件里改 `--due` 的亮档值（**第二次对比度修正**，控制方 2026-09-11 裁决；求解规则与实测比值见 Step 6 —— **不要凭感觉取色，按该规则求解后回填**）：

```js
  { name: "due", light: "#9E5E10", dark: "#E0A44B", usage: "到期刻度 / 低置信点线 / 记忆语义文字（亮档两次对比度修正：#B26A12 4.06:1 → #A05F10 → 本值；最终值以剪报底余量 ≥0.05 为准）" },
```
⚠️ 暗档 `#E0A44B` **不动**（暗档剪报底上 7.4863:1，达标）。计划的预解值为 **`#9E5E10`**（见 Step 6 的求解规则与实测：剪报底 4.5799 / 纸 4.9556 / 面 5.1694）—— 实施者须用 `contrastRatio()` **独立复核**；若你的求解给出**更小的加深量**且仍满足「三个底都 ≥4.5 且剪报底余量 ≥0.05」，以你的为准并写进报告。

- [ ] **Step 2: 生成 CSS 变量（字阶 18 个 + 阴影两档）**

`renderCss()` 的 `:root` 块里，在「间距」之前插入字阶、在「圆角」之后插入阴影：

```js
  /* 字阶（规范 §4.2）：--ed-type-<n>-{size,line,weight}，n 与 TYPE_SCALE 下标同序（1 起） */
${TYPE_SCALE.map((t, i) => [
  `  --ed-type-${i + 1}-size: ${t.size}px;`,
  `  --ed-type-${i + 1}-line: ${t.line}px;`,
  `  --ed-type-${i + 1}-weight: ${t.weight};`,
].join("\n")).join("\n")}

  /* 阴影（规范 §4.2②）：亮档投影；暗档在 [data-theme="dark"] 里改为反相白描边 */
${SHADOW_TOKENS.map((t) => `  --ed-${t.name}: ${t.light}; /* ${t.usage} */`).join("\n")}
```

`[data-theme="dark"]` 块里，在颜色行之后追加：

```js
${SHADOW_TOKENS.map((t) => `  --ed-${t.name}: ${t.dark};`).join("\n")}
```

`renderTs()` 里 `SCALE_TOKENS` 增加一行（结构化字阶，供原语的字面量兜底与断言）：

```js
  typeScaleVars: ${JSON.stringify(TYPE_SCALE)},
```

- [ ] **Step 3: 接线 `ui/tokens.css` 到应用入口 + 防回归守卫**

> 控制方裁决：「本批必须接线」。理由：实测 `import "*.css"` 全仓只有 `app/src/main.tsx:5` 的 `note-mark.css`，`tokens.css` **从未被任何入口 import** ⇒ 不接线的话原语里的 `var(--ed-shadow-2)` / `var(--ed-dur-micro)` 等在运行时**根本没有值**（未定义的 CSS 变量静默失效，不报错 —— `app/src/ui/tokens.ts:12` 已警告过这一类）。这是「让原语真能用」的最小前提，**不是接线迁移**（现有组件改用 token 仍是批 4）。

`app/src/main.tsx` 改为（**只加 2 行：注释 + import**，其余逐字不动；tokens 必须排在 `note-mark.css` 之前 —— 它是基座层）：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// 设计系统 token（ADR-032）：只定义 :root / [data-theme="dark"] 的自定义属性，无选择器 ⇒ 零视觉变化
import "./ui/tokens.css";
// v0.16.1：正文多色荧光笔样式（remarkMarkHighlight 注入类名 note-mark[-{colorId}]）
import "./note-mark.css";
```

在 `app/src/ui/tokens.drift.test.ts` 追加守卫（该文件已是 node 环境 + 已 `import { readFileSync }`，直接复用 `HERE`）：

```ts
describe("token 接线守卫", () => {
  it("应用入口 import 了 ui/tokens.css（未接线则所有 var(--ed-*) 运行时无值）", () => {
    const main = readFileSync(join(HERE, "..", "main.tsx"), "utf8");
    expect(main, "main.tsx 必须 import ./ui/tokens.css（见批 0-D 控制方裁决）").toContain('import "./ui/tokens.css";');
  });
});
```

- [ ] **Step 4: 重新生成 + 跑漂移守卫**

```powershell
cd app
node scripts/gen-tokens.mjs            # 写盘（覆盖 tokens.css / tokens.gen.ts）
node scripts/gen-tokens.mjs --check    # 期望 exit 0（无漂移）
npx vitest run src/ui/tokens.drift.test.ts scripts/gen-tokens.test.mjs
```
期望：`tokens.css` 里出现 18 个 `--ed-type-*` 与两档 `--ed-shadow-1/2`，且 `--ed-due` 亮档为新值；`tokens.gen.ts` 里出现 `typeScaleVars`；`"15.5px/1.9·400"` 已被 `"15.5px/29.5px·400"` 取代。⚠️ **产物禁止手改**（`tokens.drift.test.ts` 会红）。

- [ ] **Step 5: 给生成器测试加断言（范式 B：规范硬数字机器化 + 反例守门）**

在 `app/scripts/gen-tokens.test.mjs` 追加（`import` 行同步加 `TYPE_SCALE, SHADOW_TOKENS`）：

```js
describe("字阶 CSS 变量（0-D 硬前置②）", () => {
  it("6 档 × size/line/weight 共 18 个变量都在，且与 TYPE_SCALE 一一对应", () => {
    const { css } = renderAll();
    expect(TYPE_SCALE).toHaveLength(6);
    for (const [i, t] of TYPE_SCALE.entries()) {
      const n = i + 1;
      expect(css, `第 ${n} 档 size`).toContain(`--ed-type-${n}-size: ${t.size}px;`);
      expect(css, `第 ${n} 档 line`).toContain(`--ed-type-${n}-line: ${t.line}px;`);
      expect(css, `第 ${n} 档 weight`).toContain(`--ed-type-${n}-weight: ${t.weight};`);
    }
    // 18 个变量名一个不多一个不少
    expect(css.match(/--ed-type-\d-(size|line|weight)/g)?.length).toBe(18);
  });

  it("无单位行高已消灭（反例守门：/1.9 不得回归）", () => {
    expect(SCALE_SOURCE.typeScale.join("|")).not.toContain("/1.9");
    expect(SCALE_SOURCE.typeScale[2]).toBe("15.5px/29.5px·400");
    expect(SCALE_SOURCE.typeScale[2]).toContain(`${TYPE_SCALE[2].line}px`);
  });
});

describe("阴影 token（规范 §4.2②）", () => {
  it("两档齐全，值逐字等于用户裁决", () => {
    expect(SHADOW_TOKENS.map((t) => t.name)).toEqual(["shadow-1", "shadow-2"]);
    expect(SHADOW_TOKENS[0].light).toBe("0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)");
    expect(SHADOW_TOKENS[1].light).toBe("0 2px 4px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.14)");
  });

  it("暗档不是投影而是反相白描边，且两档各写一次", () => {
    const { css } = renderAll();
    for (const t of SHADOW_TOKENS) {
      expect(t.dark).toBe("0 0 0 1px rgba(255,255,255,.06)");
      expect(css).toContain(`--ed-${t.name}: ${t.light};`);
      expect(css).toContain(`--ed-${t.name}: ${t.dark};`);
    }
  });

  it("usage 串不得含注释终止符（会被写进 CSS 注释）", () => {
    for (const t of SHADOW_TOKENS) expect(t.usage).not.toContain("*/");
  });

  it("产物里不再出现「引用未定义变量」的说明（0-A 交接第 1① 条）", () => {
    const { css, ts } = renderAll();
    expect(css).not.toContain("0-D 前定值");
    expect(ts).not.toContain("0-D 前定值");
  });
});
```

- [ ] **Step 6: 剪报底纹的「底 × 墨」实测 + `--due` 求解 + `ink-4` 禁止组合的反例守门**

> 控制方 2026-09-11 裁决把原来的「两条不达标一律上报」**拆成两种处置**：`--due` **改值**（它承载「记忆语义文字」，而"记忆语义 + 剪报底纹"是预期会同时出现的组合；§4 已有 `#B26A12 → #A05F10` 的先例）；`--ed-ink-4` **不动值、明令禁止组合**（3:1 例外是 ADR-032 的既有裁决，改它影响 256 行弱化文本，收益远小于影响面）。

**(a) `--due` 亮档求解（不要凭感觉取色）**

求解规则（写进报告）：在保持色相的前提下把 RGB 三通道按**同一系数** `f` 缩放（`hex(round(ch × f))`），取满足**全部三条**的**最小加深量**：
1. 对 `--bg-canvas #FBFAF8` ≥ 4.5:1；2. 对 `--bg-surface #FFFFFF` ≥ 4.5:1；3. 对 `--ed-mark-clip #F4F1E9` ≥ **4.55:1**（= 4.5 底线 **+ 0.05 余量** —— `#A05F10` 正是"卡在 4.4950"的反例，hex 量化与将来底色微调都会吃掉没有余量的值）。

计划者按此规则预解（**实施者须用 `contrastRatio()` 独立复核并记录最终值**）：

| 候选 | 系数 | 剪报底 | 纸 | 面 | 结论 |
|---|---|---|---|---|---|
| `#A05F10`（现行） | 1.000 | **4.4950** | 4.8638 | 5.0736 | ❌ 剪报底低于 4.5 |
| `#9F5F10` | 0.995 | 4.5175 | 4.8880 | 5.0989 | ❌ 余量仅 0.0175（不满足规则 3） |
| **`#9E5E10`** | **0.990** | **4.5799** | **4.9556** | **5.1694** | ✅ **采用**（最小且满足三条） |

⇒ 生成器里 `due.light` 写 **`#9E5E10`**；若你的求解给出更小的加深量且满足三条，以你的为准。

**(b) 组合断言（达标组合写 `toBeGreaterThanOrEqual`，不达标组合写反例守门）**

先用 `contrastRatio()` 实测，把 8×2 个比值写进报告。计划者预计算（供对照）：

| 亮档（底 = `mark-clip #F4F1E9`） | 实测 | 判定 |
|---|---|---|
| `ink-1` 15.4197 · `ink-2` 10.1204 · `ink-3` **4.5454** | — | ✅ ≥4.5（ink-3 余量仅 0.045） |
| `stamp` 5.7679 · `ok` 4.6310 · `link` 5.3968 | — | ✅ ≥4.5 |
| `due` **4.5799**（改值后） | — | ✅ ≥4.5（改值前 4.4950 ❌） |
| **`ink-4` 2.8489** | — | ❌ **禁止组合**（低于 §4.3 给它自己的 3:1 例外） |

| 暗档（底 = `mark-clip #221F1B`） | 实测 | 判定 |
|---|---|---|
| `ink-1` 14.5564 · `ink-2` 10.7931 · `ink-3` 5.5052 · `ink-4` 3.0480 | — | ✅（ink-4 ≥3，过渡态例外在暗档成立） |
| `stamp` 4.6533 · `ok` 5.9688 · `due` 7.4863 · `link` 5.8732 | — | ✅ ≥4.5 |

```ts
describe("剪报底纹上的文字（底 × 墨组合 · 规范 §4.4）", () => {
  const by = (n: string) => COLOR_TOKENS.find((t) => t.name === n);
  const clipOf = (theme: "light" | "dark") => by("mark-clip")![theme];
  // 裁决：剪报底纹只改背景，文字仍用所在层级的 --ed-ink-*（不新增前景 token，2026-09-11 控制方）
  const AA: ReadonlyArray<readonly [string, "light" | "dark"]> = [
    ["ink-1", "light"], ["ink-1", "dark"],
    ["ink-2", "light"], ["ink-2", "dark"],
    ["ink-3", "light"], ["ink-3", "dark"],
    ["stamp", "light"], ["stamp", "dark"],
    ["ok", "light"], ["ok", "dark"],
    ["due", "light"], ["due", "dark"],
    ["link", "light"], ["link", "dark"],
    ["ink-4", "dark"],   // ink-4 是过渡态：只须 ≥3（§4.3）；**亮档不在名单里 —— 见下面反例守门**
  ];
  for (const [name, theme] of AA) {
    it(`${theme} · ${name} / 剪报底`, () => {
      const floor = name === "ink-4" ? 3 : 4.5;
      expect(contrastRatio(by(name)![theme], clipOf(theme)), `${theme} ${name}/剪报底`).toBeGreaterThanOrEqual(floor);
    });
  }

  // ★ 反例守门（范式 B，同 `#B26A12` 的写法）：把「禁止组合」钉成机器判据 ——
  // 将来若有人把 ink-4 的文字放到剪报底纹上，这条断言就是那份"为什么不行"的证据。
  it("规范：ink-4 亮档不得用于剪报底纹（实测低于其 3:1 过渡态例外）", () => {
    expect(contrastRatio(by("ink-4")!.light, clipOf("light"))).toBeLessThan(3);
  });

  it("规范：due 亮档第二次修正——刚被替换掉的 #A05F10 在剪报底上仍不达标（防回归）", () => {
    expect(contrastRatio("#A05F10", clipOf("light"))).toBeLessThan(4.5);
    expect(contrastRatio(by("due")!.light, clipOf("light"))).toBeGreaterThanOrEqual(4.5);
  });
});
```

⚠️ `app/src/ui/contrast.test.ts:86-91` 的既有 `due` 用例必须**同批更新**：新值断言（纸 / 面 / **剪报底** 三处 ≥4.5）+ 两条反例守门（`#B26A12` 仍 <4.5【保留原断言】、`#A05F10` 在剪报底上 <4.5【新增】）。

- [ ] **Step 7: 回写两份文档（AGENTS.md §6：文档与代码同提交）**

1. `docs/product/ui-ux-system.md`：
   - `:186` 附近注明 —— `--ed-shadow-card`（亮/暗各一）**被 `--ed-shadow-1` 取代，新值 = `0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)`**；`:204` 的暗档做法（`0 0 0 1px rgba(255,255,255,.06)`）**上升为 `--ed-shadow-1/2` 的暗档统一策略**。
   - **新增一条写死的规则**（控制方裁决）：「**剪报底纹上只用 `ink-3` 及更深（`ink-2` / `ink-1`）；`ink-4` 禁止用于剪报底纹**」——理由：`ink-4` 的 3:1 例外只在阅读面上成立（剪报底上实测 2.8489，暗档 3.0480）。
   - ⚠️ 该文档属 **AGENTS.md §10 需额外审查**文件 ⇒ **文档改动与本任务代码同提交**（控制方裁决 B）。
2. 规格 `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`：
   - §4.2 补「**字阶 CSS 变量命名 = `--ed-type-<n>-{size,line,weight}`（`n` 与 `typeScale` 同序）**；第 3 档无单位行高 `1.9` 统一为 `29.5px`（15.5 × 1.9 = 29.45，四舍五入）」；
   - §4.1 的 `--due` 行补「**第二次对比度修正**：`#A05F10` → `#9E5E10`（剪报底 4.4950 → 4.5799；纸 4.9556 / 面 5.1694）」——**并注明这是 `--due` 的第二次修正**（第一次是 `#B26A12 → #A05F10`）；
   - §4.4 补「**剪报底纹只改背景，文字用所在层级的 `--ed-ink-*`；不新增前景 token**；**`ink-4` 禁止用于剪报底纹**」+ 本步的实测比值表。
3. **★ 硬编码旧值 `#A05F10` 的全仓清点（必须做，否则文档与真源分叉）** —— 实施者跑 `Select-String -Path (Get-ChildItem docs,app -Recurse -Include *.md,*.ts,*.mjs,*.css -Exclude node_modules).FullName -Pattern "A05F10"`，按下表处置（**计划者已预先清点，实测 8 个活文件命中**）：

| 命中位置 | 处置 |
|---|---|
| `app/scripts/gen-tokens.mjs:49` | **改**（Step 1，真源） |
| `app/src/ui/tokens.css:21` · `app/src/ui/tokens.gen.ts:31` | **改**（Step 4 重新生成，禁止手改） |
| `app/src/ui/contrast.test.ts:86-90` | **改**（Step 6，新值断言 + 两条反例守门） |
| `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md:145`（§4.1 表行）与 `:164`（第一次修正的注记） | **改**（本 Step，表行换新值 + 注记追加「第二次修正」） |
| `docs/adr/ADR-032-frontend-design-system-tokens.md:26`（「已修正为 `#A05F10`」） | **不改** —— ADR 是**决策历史记录**，第一次修正的记载保持原样；**第二次修正记在 ADR-033**（控制方明确要求写进 ADR-033） |
| `docs/superpowers/plans/2026-09-11-frontend-redesign-batch0a-design-system.md:95/235-239/560/1015` | **不改** —— 0-A 是**已执行完毕的历史计划**，其代码块是当时快照；真源是生成器 |
| `docs/versions/v0.22.md:83` | **不改** —— 版本文档是历史快照（`docs-check` 亦按此口径忽略 versions 的部分检查）；由批 8 的版本记录承接 |
| 仓库根 `tmp/**`（他人在飞的临时树） | **不碰** |

- [ ] **Step 8: 门禁 + 提交**

```powershell
cd app
npx tsc --noEmit          # 0 错
npx vitest run            # 全绿，用例数 > 811
npm run build             # tsc && vite build 必须绿（本任务改了 CSS 产物 + 入口 import，构建是最直接的验证）
cd ..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs ; node scripts/check-command-registry.mjs
git add app/scripts/gen-tokens.mjs app/scripts/gen-tokens.test.mjs app/src/ui/tokens.css app/src/ui/tokens.gen.ts app/src/ui/contrast.test.ts app/src/ui/tokens.drift.test.ts app/src/main.tsx docs/product/ui-ux-system.md docs/superpowers/specs/2026-09-11-frontend-redesign-design.md
git diff --cached --stat      # 复核只含这 9 个路径
git commit -m "feat(ui): 定阴影两档与字阶 CSS 变量并接线 tokens.css（0-D 硬前置①②）"
```

**验收**
- [ ] `--ed-shadow-1/2` 两档值逐字等于控制方裁决；暗档为反相白描边
- [ ] 18 个字阶变量落地，`1.9` 已换算为 `29.5px` 且换算依据写在注释里
- [ ] **`--ed-due` 亮档新值经求解得出**（预解 `#9E5E10`）且**三处实测都 ≥4.5**：剪报底 **≥4.55**（余量 ≥0.05 为硬要求）/ 纸 / 面 —— 三个比值逐条写进报告
- [ ] **`--ed-ink-4` 未被改动**；`ink-4 × 剪报底` 的**反例守门断言已落地**（`toBeLessThan(3)`），且 `ui-ux-system.md` 写死了「剪报底纹上只用 `ink-3` 及更深」
- [ ] **`app/src/main.tsx` 已接线 `./ui/tokens.css`**（排在 `note-mark.css` 之前），且 `tokens.drift.test.ts` 的接线守卫断言绿；`npm run build` 绿
- [ ] `tokens.drift.test.ts` 绿（产物 == 生成器输出）；`gen-tokens.mjs --check` exit 0
- [ ] 产物里**不再出现对未定义变量的引用说明**（0-A 交接第 1① 条闭环）
- [ ] `ui-ux-system.md` 与规格已回写（含「**`--due` 第二次对比度修正**」的注记）；两者与代码**同提交**
- [ ] 动效接缝四条硬约束：本任务不涉交互态（token 层），但**不得引入任何硬编码时长** —— 时长属批 6
- [ ] 报告：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0d-primitives/task-1-report.md`

---

### Task 2: z-index 守卫（棘轮测试 · 0-A 硬前置③）

> **独立、可并行**。控制方裁决：先例抄 `app/src/ui/icons/no-inline-svg.test.ts`（同目录、同「只允许减少」的棘轮形态）。目标：让「Modal/Toast **出生即用标尺**」（0-A 交接第 1③ 条）从纪律变成机器判据。

**Files:**
- Create: `app/src/ui/zIndex.guard.test.ts`（node 环境；**不要**写 `@vitest-environment jsdom`）

**Interfaces:**
- Consumes: `node:fs` 的 `readFileSync/readdirSync/statSync` · `node:path` 的 `join/relative/sep/dirname` · `node:url` 的 `fileURLToPath`（**只有这些符号可用**，见 Global Constraints）
- Produces: 一份只允许缩短的冻结名单 `FROZEN_NUMERIC_ZINDEX: readonly string[]`（签名 = `相对 app/src 的正斜杠路径::该行 trim 后的原文`）

- [ ] **Step 1: 写守卫（三个 `it`）**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * @ai-context **棘轮守卫**：裸数字 z-index 只许减少（ADR-032 决策 5 的执行手段）。
 *
 * Why：批 0-A 交付了六档标尺 `zIndex()`，但全仓仍有 43 文件 / 58 行 `zIndex:<数字>`
 * （recon §10），且值域分裂成 10…61 与 900…1150 两个不相交段。批 4 会整段迁移，
 * 而守卫要保证「迁移期不得新增」——否则标尺会退化成「又一套并存的东西」。
 *
 * 副作用：只读磁盘（遍历 app/src）。不修改任何文件。
 * 边界：① 排除 `*.test.ts(x)`（测试夹具里的 `zIndex: 0` 是 React Flow 节点字段，不是样式）；
 *       ② 同时扫 `.css` 的 `z-index:` —— 原语层不得把层级写进 CSS（标尺是 TS 模块，规格 §4.2①）。
 * 批 4 迁完后本名单会自然缩短，届时第 2 个 it 会要求把过期项删掉。
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
```

扫描与断言（三步：收集 → 差集 → 断言）：

```ts
function collect(dir: string, out: string[] = []): string[] { /* readdirSync + statSync 递归 */ }
function numericZIndex(): string[] {   // 返回 `相对路径::trim行`，已排序
  // .ts/.tsx：/zIndex\s*:\s*-?\d+/ ；排除 /\.test\.(ts|tsx)$/
  // .css    ：/z-index\s*:\s*-?\d+/
}
```

冻结名单**必须由实施者用守卫自己的首次输出逐行填入**（先跑一次看 `added` 明细，再原样粘进 `FROZEN_NUMERIC_ZINDEX` 并保持排序）——**不要**凭估计写死：这是 0-B 的经验（`no-inline-svg.test.ts` 的名单由该步实测输出决定）。

```ts
describe("z-index 棘轮", () => {
  it("不得新增裸数字 z-index（只允许减少）", () => {
    const added = numericZIndex().filter((s) => !FROZEN_NUMERIC_ZINDEX.includes(s));
    expect(added, `新增了裸数字 z-index（请改用 zIndex("<档名>")）：\n${added.join("\n")}`).toEqual([]);
  });

  it("冻结名单没有过期项（批 4 迁完要及时删）", () => {
    const current = new Set(numericZIndex());
    const stale = FROZEN_NUMERIC_ZINDEX.filter((s) => !current.has(s));
    expect(stale, `这些行已不含裸数字 z-index，请从名单删除：\n${stale.join("\n")}`).toEqual([]);
  });

  it("名单非空且已排序（防空名单把棘轮静默关掉）", () => {
    expect(FROZEN_NUMERIC_ZINDEX.length).toBeGreaterThan(0);
    expect([...FROZEN_NUMERIC_ZINDEX]).toEqual([...FROZEN_NUMERIC_ZINDEX].sort());
    expect(new Set(FROZEN_NUMERIC_ZINDEX).size).toBe(FROZEN_NUMERIC_ZINDEX.length);
  });
});
```

- [ ] **Step 2: 核验基线数量与两处口径**

计划者实测（供你对照，**以你的守卫输出为准**）：`app/src/**/*.tsx` 命中 `zIndex:\s*-?\d+` 共 **61 行**，其中 **3 行在 `app/src/components/CanvasNodes.test.tsx:38,41,44`**（React Flow 节点字段 `zIndex: 0`，被测试排除规则滤掉）⇒ 非测试 **58 行 / 43 文件**，与 `recon §10` 的「`zIndex:<num>` 58 lines / 43 files」**完全吻合**；**CSS 侧 0 命中**（`app/src` 三个 CSS 文件全无 `z-index`）。⇒ 你的冻结名单应为 **58 条**（若不等，先查是不是并行任务改了代码，再写报告）。

- [ ] **Step 3: 门禁 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run src/ui/zIndex.guard.test.ts; npx vitest run; cd ..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs
git add app/src/ui/zIndex.guard.test.ts
git commit -m "test(ui): z-index 棘轮守卫（裸数字只许减少）"
```

**验收**
- [ ] 三个 `it` 全绿；**故意插一行 `zIndex: 999` 到任意组件时第 1 个 `it` 必红**（把这次实验的输出写进报告，然后撤销）
- [ ] 冻结名单 58 条（或与实测一致），第 3 个 `it` 保证它不会退化成空名单
- [ ] 测试文件 ≤300 行（约 130 行）；`@ai-context` 齐全；无 `any`
- [ ] 动效接缝四条硬约束：本任务不涉交互态与动效（纯守卫），验收为**不引入任何运行时改动**
- [ ] 报告：`.../task-2-report.md`

---

### Task 3: `Text` —— 墨度 × 字阶的唯一出口（**并建 `index.ts` 与 `motion.css`**）

**Files:**
- Create: `app/src/ui/primitives/Text.tsx` · `app/src/ui/primitives/Text.css` · `app/src/ui/primitives/Text.test.tsx`
- Create: `app/src/ui/primitives/motion.css`（**一次写全**：动效接缝变量块 + 唯一一条 reduced-motion 块，覆盖全部 11 个 `.ed-*` 类 —— 后续任务**不再改本文件**）
- Create: `app/src/ui/primitives/index.ts`（导出面 + `import "./motion.css"`）

**Interfaces:**
- Consumes: `SCALE_TOKENS.typeScaleVars`（字面量兜底）· CSS 变量 `--ed-type-N-*` / `--ed-ink-*` / `--ed-font-*`（**不存在时用 `var(..., 字面量)` 兜底**，先例 `app/src/ui/icons/Icon.tsx:19`）
- Produces（T4–T14 依赖，签名逐字固定）:
  - `TextSize = 1 | 2 | 3 | 4 | 5 | 6` · `TextTone = "ink-1" | "ink-2" | "ink-3" | "ink-4" | "stamp" | "ok" | "due" | "link" | "inherit"` · `TextFont = "ui" | "body" | "mono"` · `TextTag = "span" | "p" | "div" | "label" | "strong" | "em" | "h1" | "h2" | "h3"`
  - `TextProps = { size?: TextSize; tone?: TextTone; font?: TextFont; truncate?: boolean; as?: TextTag; className?: string; style?: CSSProperties; children: ReactNode }`
  - `Text(props: TextProps): JSX.Element` —— 默认 `size=4`（13/20·400）· `tone="ink-2"`（正文基准）· `font="ui"` · `as="span"`
  - `motion.css` 的变量名：`--ed-dur-micro` `--ed-dur-overlay-in` `--ed-dur-overlay-out` `--ed-dur-toast-in` `--ed-dur-toast-out` `--ed-dur-skeleton` `--ed-ease`

- [ ] **Step 1: 写失败测试（jsdom）**

`Text.test.tsx` 首行 `// @vitest-environment jsdom`。断言**类名契约**与**结构与语义**（不用 jest-dom）：

```tsx
// ① 默认：span + size4 + ink-2 + ui 字体
// ② size/tone 逐档映射到类：for (const s of [1,2,3,4,5,6]) 渲染后 className 含 `ed-text--s${s}`
// ③ as="h2" 渲染出 H2 标签且携带同一组类
// ④ font="mono" 含 ed-text--mono；font="body" 含 ed-text--font-body
// ⑤ truncate 含 ed-text--truncate
// ⑥ children 原样渲染（含中文与嵌套元素）
```
关键断言写法（示例）：`expect(el.tagName).toBe("SPAN")` · `expect(el.className).toContain("ed-text--s4")` · `expect(screen.getByText("正文").getAttribute("class")).toContain("ed-text--ink-3")`。

- [ ] **Step 2: 写 `motion.css`（一次写全，后续任务不再动它）**

```css
/* motion.css —— 原语层的动效接缝。
   ① 本块变量按规格 §8.4 命名与取值先落地；批 6 的动效 token 真源完成后【整块删除】
      （所有引用点写的是 var(--ed-dur-x, 同值字面量)，删块即生效，无需改任何规则）。
   ② 唯一一条 prefers-reduced-motion 块：今天全仓 0 处（recon §8.1），本批起要有。
   ③ 本文件不得出现任何颜色字面量。 */
:root {
  --ed-dur-micro: 120ms;
  --ed-dur-overlay-in: 200ms;
  --ed-dur-overlay-out: 160ms;
  --ed-dur-toast-in: 180ms;
  --ed-dur-toast-out: 140ms;
  --ed-dur-skeleton: 1200ms;
  --ed-ease: cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .ed-btn, .ed-surface, .ed-text, .ed-modal-overlay, .ed-modal, .ed-confirm,
  .ed-toast, .ed-empty, .ed-loading, .ed-skeleton, .ed-probe {
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
```
⚠️ 名单里**已经写全 11 个类**（含本批后面才实现的 `Modal`/`Toast`/…）—— 未实现的选择器无害，换来「后续任务永不改本文件」。Task 14 的守卫断言「每个 `.ed-*` 类都在名单里」。

- [ ] **Step 3: 实现 `Text.tsx` + `Text.css`**

```tsx
/**
 * @ai-context L1 原语：文本。**墨度 × 字阶的唯一出口**。
 *
 * Why：现状 `fontSize:` 1274 行/143 文件 · `fontWeight` 230/96 · 弱化灰 `#9ca3af` 256 行/100 文件
 * （recon §2），字阶与墨度逐处手写；规格 §4.2 的 6 档字阶与 §4.3 的四档墨度必须能被**一处**驱动。
 * 副作用：无（纯展示组件，不读 store、不发请求）。
 * 边界：颜色与字号只走 CSS 变量（`var(..., 字面量)` 兜底，先例 Icon.tsx:19）；本文件不写颜色字面量。
 */
```
类名组装：`["ed-text", `ed-text--s${size}`, `ed-text--${tone}`, `ed-text--font-${font}`, truncate && "ed-text--truncate", className].filter(Boolean).join(" ")`。
标签：`const Tag = as;` （`as` 是 9 个字面量的联合 —— TS 5.8 支持联合标签的 JSX；**若 `tsc` 报错，退路是 `createElement(as, { className: cls, style }, children)`，仍不得用 `any`**）。

`Text.css`：

```css
/* Text —— 墨度 × 字阶。颜色/字号/字重一律 var(--ed-*)，本文件零颜色字面量。 */
.ed-text {
  font-family: var(--ed-font-ui, "Inter", "Segoe UI Variable", "Microsoft YaHei UI", system-ui, sans-serif);
  /* 接缝（§8.6.1 第 3 条）：墨度与字距是批 6「记忆浮现」的可动画属性，先纳入 transition */
  transition: color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              letter-spacing var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1));
}
.ed-text--s1 { font-size: var(--ed-type-1-size, 25px);   line-height: var(--ed-type-1-line, 34px);   font-weight: var(--ed-type-1-weight, 600); }
.ed-text--s2 { font-size: var(--ed-type-2-size, 17px);   line-height: var(--ed-type-2-line, 24px);   font-weight: var(--ed-type-2-weight, 600); }
.ed-text--s3 { font-size: var(--ed-type-3-size, 15.5px); line-height: var(--ed-type-3-line, 29.5px); font-weight: var(--ed-type-3-weight, 400); }
.ed-text--s4 { font-size: var(--ed-type-4-size, 13px);   line-height: var(--ed-type-4-line, 20px);   font-weight: var(--ed-type-4-weight, 400); }
.ed-text--s5 { font-size: var(--ed-type-5-size, 12px);   line-height: var(--ed-type-5-line, 18px);   font-weight: var(--ed-type-5-weight, 500); }
.ed-text--s6 { font-size: var(--ed-type-6-size, 11.5px); line-height: var(--ed-type-6-line, 16px);   font-weight: var(--ed-type-6-weight, 500); }
.ed-text--ink-1 { color: var(--ed-ink-1); }  .ed-text--ink-2 { color: var(--ed-ink-2); }
.ed-text--ink-3 { color: var(--ed-ink-3); }  .ed-text--ink-4 { color: var(--ed-ink-4); }
.ed-text--stamp { color: var(--ed-stamp); }  .ed-text--ok { color: var(--ed-ok); }
.ed-text--due { color: var(--ed-due); }      .ed-text--link { color: var(--ed-link); }
.ed-text--inherit { color: inherit; }
.ed-text--font-body { font-family: var(--ed-font-body, "Source Han Serif SC", "Songti SC", SimSun, serif); }
.ed-text--font-mono { font-family: var(--ed-font-mono, "JetBrains Mono", Consolas, ui-monospace, monospace); font-variant-numeric: tabular-nums; }
.ed-text--truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```
⚠️ **`ink-4` 的边界**：它是过渡态（面对 3.22:1）—— CSS 里加一行注释写明「不得承载唯一关键信息；任何交互立即升到 `ink-2`；剪报底纹上禁止使用（Task 1 Step 6 上报项）」。

- [ ] **Step 4: 建 `index.ts`**

```ts
/**
 * @ai-context L1 原语层的**唯一公共导出面**（同 `ui/icons/index.ts` 范式）。
 * Why：批 4 之后全站从这里 import；收敛导出面使「换实现」只改这一个文件。
 * 副作用：`import "./motion.css"` —— 导入本层即带上动效接缝与 reduced-motion 块。
 * 边界：**深导入单个原语时不会带上 reduced-motion 块**；组内互引用请走相对路径（`./Text`），不要 import 本文件。
 */
import "./motion.css";

export { Text } from "./Text";
export type { TextFont, TextProps, TextSize, TextTag, TextTone } from "./Text";
```

- [ ] **Step 5: 门禁 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run src/ui/primitives ; npx vitest run; cd ..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs
git add app/src/ui/primitives
git commit -m "feat(ui): L1 原语 Text 与动效接缝（motion.css）"
```

**交互态与接缝清单（逐条给结论）**
- [ ] **墨度可动画**：`color` 纳入 `transition`，墨度类 `.ed-text--ink-*` 可被一条类切换驱动（批 6 的「记忆浮现」/「未确认段落墨度起伏 2%」有落点）
- [ ] **字距可动画**：`letter-spacing` 纳入 `transition`（§8.6 第 6 个签名动效明写「用字距而非 x」）
- [ ] **无闲置动效**：`Text` 自身不做循环动画（环境层属具体消费方与批 6）
- [ ] **无障碍**：`prefers-reduced-motion` 由 `motion.css` 覆盖；`Text` 不改语义标签（`as` 决定）

**验收**
- [ ] 6 档字阶 × 9 档墨度 × 3 档字体全部有对应类与测试；默认值 = `s4` + `ink-2` + `ui`
- [ ] 三个新文件均 ≤300 行；`@ai-context` 齐全；**无 `any`**；CSS 内**零颜色字面量**（`var()` 兜底值也不许是色值）
- [ ] 动效接缝四条硬约束：① 内置交互态（墨度/字距 transition）② 每个动作有回执（本原语不承载动作，回执在消费方）③ 可中断（属性 transition 天然可被下一次类切换接管）④ reduced-motion 优先（`motion.css` 覆盖）
- [ ] 报告：`.../task-3-report.md`

---

### Task 4: `Surface` —— 面（底 / 边框 / 圆角 / 阴影）的唯一出口

**Files:**
- Create: `app/src/ui/primitives/Surface.tsx` · `Surface.css` · `Surface.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`（加 2 行导出）

**Interfaces:**
- Consumes: T3 的 `index.ts` 结构 · CSS 变量 `--ed-bg-{sunken,canvas,surface,raised}` / `--ed-border` / `--ed-border-strong` / `--ed-radius-{stamp,control,panel,overlay}` / `--ed-shadow-1` / `--ed-space-*`
- Produces:
  - `SurfaceLevel = "sunken" | "canvas" | "surface" | "raised"` · `SurfaceRadius = "stamp" | "control" | "panel" | "overlay"` · `SurfaceTag = "div" | "section" | "article" | "aside" | "li"`
  - `SurfaceProps = { level?: SurfaceLevel; radius?: SurfaceRadius; bordered?: boolean; interactive?: boolean; padded?: boolean; as?: SurfaceTag; className?: string; style?: CSSProperties; testId?: string; children: ReactNode }` —— 默认 `level="surface"` · `radius="panel"` · `bordered=true` · `interactive=false` · `padded=false` · `as="div"`
  - `Surface(props: SurfaceProps): JSX.Element`

- [ ] **Step 1: 写失败测试（jsdom）**：① 默认类 `ed-surface ed-surface--surface ed-surface--r-panel ed-surface--bordered` ② `level="raised"` 加 `--raised` ③ `interactive` 加 `--interactive` ④ `bordered={false}` 不含 `--bordered` ⑤ `as="section"` → `SECTION` ⑥ `testId` 落到 `data-testid`
- [ ] **Step 2: 实现 + CSS**

```css
/* Surface —— 面。radius 6/8/10/12 混用（recon §2.1）在本层收敛为四档 token。 */
.ed-surface { background: var(--ed-bg-surface); border-radius: var(--ed-radius-panel, 8px); }
.ed-surface--bordered { border: 1px solid var(--ed-border); }
.ed-surface--sunken { background: var(--ed-bg-sunken); }
.ed-surface--canvas { background: var(--ed-bg-canvas); }
.ed-surface--raised { background: var(--ed-bg-raised); box-shadow: var(--ed-shadow-1); }
.ed-surface--r-stamp { border-radius: var(--ed-radius-stamp, 3px); }
.ed-surface--r-control { border-radius: var(--ed-radius-control, 5px); }
.ed-surface--r-panel { border-radius: var(--ed-radius-panel, 8px); }
.ed-surface--r-overlay { border-radius: var(--ed-radius-overlay, 10px); }
.ed-surface--padded { padding: var(--ed-space-12, 12px); }
/* 接缝（§8.6.1）：hover 升起 + 边框墨度。位移 1px ≪ §8.4 的 8px 上限 */
.ed-surface--interactive {
  cursor: pointer;
  transition: box-shadow var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              border-color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              transform var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1));
}
.ed-surface--interactive:hover { box-shadow: var(--ed-shadow-1); border-color: var(--ed-border-strong); transform: translateY(-1px); }
.ed-surface--interactive:active { transform: translateY(0); }
.ed-surface--interactive:focus-visible { outline: 2px solid var(--ed-ink-1); outline-offset: 2px; }
```
⚠️ 文档里写明：`interactive` 是**可点面**的接缝（卡片可提拔/hover 升起）；**本轮不迁移任何现有卡片**，消费者在批 4/5。

- [ ] **Step 3: 门禁 + 提交**（同 T3 的六条命令；commit `feat(ui): L1 原语 Surface（面的四档收敛）`）

**交互态与接缝清单**
- [ ] **hover 升起**：`--interactive:hover` → `--ed-shadow-1` + `translateY(-1px)`（暗档自动退化为反相描边，"升起"感由边框墨度承载）
- [ ] **边框墨度**：`--ed-border` → `--ed-border-strong`
- [ ] **按下回执**：`:active` 回落到 `translateY(0)`（"收到了"与"做完了"可区分）
- [ ] **焦点可见**：`:focus-visible` 焦点环（ink-1 = 「焦点环落纸」，暗档自动反相）
- [ ] **无障碍**：reduced-motion 由 `motion.css` 覆盖；`interactive` 只加视觉，**不加 `tabIndex`**（键盘可达性由消费方用真实 `<button>`/`<a>` 承载 —— 现状 `tabIndex` 全仓 1 处，不得靠 `div` 假装可点）

**验收**
- [ ] 四档 level / 四档 radius / bordered / interactive / padded 全部有类与测试；**类名总数与 CSS 行数记入报告**
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量
- [ ] 动效接缝四条：① 内置（hover/active/focus-visible）② 回执（1px 位移 + 边框墨度）③ 可中断（属性 transition 可被下一次 hover 接管）④ reduced-motion 优先
- [ ] 报告：`.../task-4-report.md`

---

### Task 5: `Button` —— 四态契约（**本批最有价值的产出之一**）

> 背景（必须让实施者知道今天有多空白，recon §8.2）：CSS `:hover` / `:active` 在活代码 **0 处** · `:focus*` / `:disabled` **各 0** · `aria-disabled` **0** · 禁用视觉降级全站 **1 处** · `<button` 510 行/121 文件 · `const *Btn*` 样式常量 86 行/60 文件。

**Files:**
- Create: `app/src/ui/primitives/Button.tsx` · `Button.css` · `Button.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: CSS 变量（`--ed-ink-1` `--ed-bg-surface` `--ed-bg-sunken` `--ed-border-strong` `--ed-radius-control` `--ed-font-ui` `--ed-type-{4,5,6}-*`）
- Produces:
  - `ButtonVariant = "primary" | "secondary" | "ghost"`（**无 `danger`** —— 见 Global Constraints「待拍板 3」）· `ButtonSize = "sm" | "md" | "lg"`
  - `ButtonProps = { children: ReactNode; onClick?: () => void; variant?: ButtonVariant; size?: ButtonSize; disabled?: boolean; busy?: boolean; type?: "button" | "submit" | "reset"; block?: boolean; title?: string; icon?: ReactNode; className?: string; testId?: string }` —— 默认 `variant="secondary"` · `size="md"` · `type="button"`
  - `Button(props: ButtonProps): JSX.Element`

- [ ] **Step 1: 写失败测试（jsdom，覆盖四态 + 语义契约）**
  - 默认：`type="button"`（**防表单误提交**）、类含 `ed-btn ed-btn--secondary ed-btn--md`
  - `variant="primary"` / `size="lg"` / `block` 的类映射
  - **disabled**：`el.hasAttribute("disabled")` 为真 + 点击 `onClick` 不被调用
  - **busy**：`aria-busy="true"` + `aria-disabled="true"` + **不设** `disabled`（保留焦点）+ 点击不触发
  - `icon` 槽渲染在文案前；`title` 透传；`testId` → `data-testid`
- [ ] **Step 2: 实现 + CSS（四态是核心）**

```css
/* Button —— 四态契约（§8.6.1 接缝表第一行）。本文件零颜色字面量。 */
.ed-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--ed-space-8, 8px);
  font-family: var(--ed-font-ui, sans-serif); border: 1px solid transparent;
  border-radius: var(--ed-radius-control, 5px); cursor: pointer; background: transparent;
  transition: background-color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              border-color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              transform var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1));
}
.ed-btn--sm { padding: 2px 8px;  font-size: var(--ed-type-6-size, 11.5px); line-height: var(--ed-type-6-line, 16px); font-weight: var(--ed-type-6-weight, 500); }
.ed-btn--md { padding: 4px 12px; font-size: var(--ed-type-5-size, 12px);   line-height: var(--ed-type-5-line, 18px); font-weight: var(--ed-type-5-weight, 500); }
.ed-btn--lg { padding: 8px 16px; font-size: var(--ed-type-4-size, 13px);   line-height: var(--ed-type-4-line, 20px); font-weight: var(--ed-type-4-weight, 400); }
.ed-btn--block { width: 100%; }
.ed-btn--primary   { background: var(--ed-ink-1); color: var(--ed-bg-surface); border-color: var(--ed-ink-1); }
.ed-btn--secondary { background: var(--ed-bg-surface); color: var(--ed-ink-1); border-color: var(--ed-border-strong); }
.ed-btn--ghost     { background: transparent; color: var(--ed-ink-2); }
/* ① hover */
.ed-btn--primary:hover:not(:disabled)   { background: var(--ed-ink-2); border-color: var(--ed-ink-2); }
.ed-btn--secondary:hover:not(:disabled) { background: var(--ed-bg-sunken); border-color: var(--ed-ink-3); }
.ed-btn--ghost:hover:not(:disabled)     { background: var(--ed-bg-sunken); color: var(--ed-ink-1); }
/* ② active：按下微陷（1px ≪ §8.4 位移上限 8px） */
.ed-btn:active:not(:disabled) { transform: translateY(1px); }
/* ③ focus-visible：焦点环落纸（全仓首个 :focus-visible） */
.ed-btn:focus-visible { outline: 2px solid var(--ed-ink-1); outline-offset: 2px; }
/* ④ disabled / busy：属性 + 视觉降级（现状全站仅 1 处降级） */
.ed-btn:disabled, .ed-btn[aria-disabled="true"] { cursor: not-allowed; opacity: .55; transform: none; box-shadow: none; }
```
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): L1 原语 Button（hover/active/focus-visible/disabled 四态）`）

**交互态与接缝清单**
- [ ] **hover**：底色 / 边框墨度（三档各自成立，`primary` 用 `ink-1 → ink-2` 的墨度推进）
- [ ] **active（按下微陷）**：`translateY(1px)`
- [ ] **focus-visible**：2px `--ed-ink-1` 焦点环 + 2px offset（**暗档自动反相**；不吃 hover 态）
- [ ] **disabled**：原生 `disabled` + `opacity .55` + `cursor: not-allowed`（本批首次让"禁用"有视觉降级）
- [ ] **busy**：`aria-busy` + `aria-disabled` 但**保留焦点与 Tab 顺序**（避免"点了没反应、焦点也丢了"）
- [ ] **无障碍优先**：`:focus-visible` 与 hover 冲突时焦点环永远可见；reduced-motion 由 `motion.css` 覆盖

**验收**
- [ ] 三档 variant × 三档 size 全部有类与测试；四态各至少 1 条测试
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量；**CSS 内不得出现 `z-index`**
- [ ] 动效接缝四条：① 内置（四态）② 回执（按下位移 + 底色变化）③ 可中断（属性 transition；快速连点不排队）④ reduced-motion 优先
- [ ] 报告：`.../task-5-report.md`

---

### Task 6: `usePresence` —— 卸载时机内核（Modal / ConfirmDialog / Toast 共用）

> 规格 §8.4：**只负责卸载时机**（GSAP 不管这个）；`transitionend` 监听 + **超时兜底**（reduced-motion 下不会有 `transitionend`，缺兜底会「关不掉的弹层」）；`matchMedia` **必须自带守卫**（vitest 全局 node 环境、`setup.ts` 无 matchMedia 桩，recon §6.2 已核实）。

**Files:**
- Create: `app/src/ui/primitives/usePresence.ts` · `usePresence.test.tsx`（jsdom，`renderHook`）
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: 无（只依赖 React）
- Produces（T7/T8/T9 依赖，签名逐字固定）:
  - `PresencePhase = "enter" | "entered" | "exit"`
  - `TransitionEndLike = { readonly target: unknown; readonly currentTarget: unknown }`（React 的 `TransitionEvent` **结构上满足**它，故可直接挂 `onTransitionEnd`）
  - `PresenceOptions = { exitMs?: number; timeoutSlackMs?: number; reducedMotionQuery?: string }` —— 默认 `exitMs=160` · `timeoutSlackMs=80` · `reducedMotionQuery="(prefers-reduced-motion: reduce)"`
  - `Presence = { mounted: boolean; phase: PresencePhase; onTransitionEnd: (e: TransitionEndLike) => void; reducedMotion: boolean }`
  - `usePresence(open: boolean, options?: PresenceOptions): Presence`

**状态机（必须逐条实现 + 逐条测试）**

| 输入 | 行为 |
|---|---|
| `open=false` 初始 | `mounted=false`，`phase="exit"`（不渲染） |
| `open` false→true | `mounted=true`，`phase="enter"`；下一 tick（effect）切 `"entered"` ⇒ 触发 CSS transition |
| 已 `entered`，`open` true→false | `phase="exit"`，**仍 `mounted=true`**；启动兜底计时器 `exitMs + timeoutSlackMs` |
| 出场期间收到 `onTransitionEnd`（`target === currentTarget`） | 清计时器，`mounted=false` |
| 出场期间 `open` 又回 true（**可反向**） | 清计时器，回到 `"entered"`（不重新进场，避免闪） |
| 兜底计时器到点（`transitionend` 永不到达） | `mounted=false`（**"关不掉的弹层"防线**） |
| `reducedMotion === true` | 直跳终态：进场立即 `"entered"`、出场立即 `mounted=false`（不等 transitionend） |
| `event.target !== event.currentTarget`（子元素冒泡） | 忽略 |
| 卸载 | 清计时器与 `matchMedia` 监听 |

- [ ] **Step 1: 写失败测试（`renderHook` + `vi.useFakeTimers()`，**不需要真 DOM 事件**）**

利用 `TransitionEndLike` 是结构类型这一点，直接构造事件对象：

```tsx
const el = {} as unknown;                       // 测试里不需要真元素
const ev = { target: el, currentTarget: el };   // 同引用 = 本节点自身的事件
act(() => result.current.onTransitionEnd(ev));
```
覆盖：初始不挂载 · 打开后 `enter → entered` · 关闭后仍挂载且 `phase="exit"` · `transitionend` 后卸载 · **无 `transitionend` 时兜底到点后卸载**（推进 `exitMs + slack`）· 出场期间反向（`open` 回 true）⇒ `mounted` 保持 true 且 `phase="entered"` · `target !== currentTarget` 被忽略 · **`matchMedia` 不存在时 `reducedMotion === false` 且不抛错**（node 环境天然无 `matchMedia`）· `matchMedia` 命中时直跳终态（测试用 `vi.stubGlobal("matchMedia", …)` 造一个最小实现，`afterEach` 用 `vi.unstubAllGlobals()`）。

- [ ] **Step 2: 实现（≤95 行）**：`matchMedia` 守卫写成 `typeof window === "undefined" || typeof window.matchMedia !== "function" ? false : window.matchMedia(q).matches`，并**用 `useState` + effect 订阅 `change`**（监听器同样带守卫）；计时器 `useRef` + `useEffect` 清理（先例 `app/src/hooks/useTransientToast.tsx:45-50` 的「cleanup 里直接读 ref」写法 —— 那里修过一个"清空快照=死守卫"的 bug，**照它的写法**）。
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): usePresence 卸载时机内核（transitionend + 超时兜底）`）

**验收**
- [ ] 上表 **9 行状态机逐行有测试**（报告里给「行 → 用例名」对照表）
- [ ] `matchMedia` 三态（不存在 / 不命中 / 命中）各有用例；**node 环境下不抛错**
- [ ] 两个新文件 ≤300 行；`@ai-context`；无 `any`
- [ ] 动效接缝四条：① 内置（phase 三态即接缝本体）② 回执（由消费方的 `[data-phase]` CSS 承载）③ **可中断可反向**（出场反向用例）④ reduced-motion 优先（直跳终态 + CSS 双保险）
- [ ] 报告：`.../task-6-report.md`

---

### Task 7: `Modal` —— 弹层唯一实现（建立三条全仓新契约）

> **本批缺口最大的一类**（recon §8.3）：`role="dialog"` **0 命中** · `aria-modal` **0** · `createPortal` **0** · `usePresence` **0** · 关闭调用点 61 行/22 文件 · 早退式卸载（无出场路径）11 行/10 文件。本任务把这三条从 0 变成 1。

**Files:**
- Create: `app/src/ui/primitives/useFocusTrap.ts` · `useFocusTrap.test.tsx`
- Create: `app/src/ui/primitives/ime.ts` · `ime.test.ts`（**node 环境**，纯函数）
- Create: `app/src/ui/primitives/Modal.tsx` · `Modal.css` · `Modal.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: T6 的 `usePresence` · T3 的 `Text` · T5 的 `Button` · `zIndex()`（`app/src/ui/zIndex.ts`）· CSS 变量 `--ed-overlay` + `--ed-overlay-alpha` + `--ed-radius-overlay` + `--ed-shadow-2` + `--ed-bg-raised` + `--ed-border`
- Produces:
  - `useFocusTrap(active: boolean, panelRef: RefObject<HTMLElement | null>): void` + `FOCUSABLE_SELECTOR: string` + `focusablesIn(root: HTMLElement): HTMLElement[]`
  - `isImeComposing(event: { nativeEvent?: { isComposing?: boolean }; keyCode?: number }): boolean`
  - `ModalSize = "s" | "m" | "l"` · `ModalTier = "modal" | "modalNested"`
  - `ModalProps = { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: ModalSize; tier?: ModalTier; closeOnOverlay?: boolean; closeOnEsc?: boolean; testId?: string }` —— 默认 `size="m"`（520）· `tier="modal"`（300）· 两者默认 `true`
  - `Modal(props: ModalProps): JSX.Element | null`

- [ ] **Step 1: `ime.ts`（规格 §5.2 第三条的接缝；本批只建不接，批 4 消费）**

```ts
/**
 * @ai-context 中文输入法组合态守卫（规格 §5.2：「Enter 提交必须带 IME 组合守卫」）。
 * Why：现状全库仅 1/9 处有守卫（recon §7.3 标注未独立复测）—— 中文输入法下回车确认候选词
 * 会直接触发危险动作。副作用：无（纯函数）。边界：WebView2 = Chromium，isComposing 可靠；
 * keyCode 229 是旧式回退（部分环境组合期只给 229）。
 */
export function isImeComposing(event: { nativeEvent?: { isComposing?: boolean }; keyCode?: number }): boolean {
  return event.nativeEvent?.isComposing === true || event.keyCode === 229;
}
```
测试 3 例（node）：`isComposing:true` → true · `keyCode:229` → true · 普通回车（`isComposing:false, keyCode:13`）→ false。

- [ ] **Step 2: `useFocusTrap.ts`（jsdom 可测）**

```ts
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function focusablesIn(root: HTMLElement): HTMLElement[] { /* querySelectorAll + 过滤不可见(offsetParent===null 且非 fixed) */ }
export function useFocusTrap(active: boolean, panelRef: RefObject<HTMLElement | null>): void
```
行为（逐条测）：打开时记住 `document.activeElement` → 焦点给**面板内第一个可聚焦元素**，没有则给面板本身（面板 `tabIndex={-1}`）；`Tab` / `Shift+Tab` 在面板内循环（`preventDefault()` 后手动 `.focus()` —— **jsdom 不实现 Tab 导航，必须手动**）；关闭时把焦点归还给「仍在文档里」的那个元素（`document.contains(el)` 守卫）；监听器在 cleanup 里摘除。

- [ ] **Step 3: `Modal.tsx` + `Modal.css`**

结构（`createPortal` 到 `document.body`；`typeof document === "undefined"` 时返回 `null`）：

```tsx
const presence = usePresence(open, { exitMs: 160 });
useFocusTrap(open && presence.mounted, panelRef);
if (!presence.mounted) return null;
return createPortal(
  <div className="ed-modal-overlay" data-phase={presence.phase} data-testid={testId ? `${testId}-overlay` : undefined}
       style={{ zIndex: zIndex(tier) }}
       onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) onClose(); }}>
    <div className="ed-modal ed-modal--m" role="dialog" aria-modal="true" aria-labelledby={titleId}
         data-phase={presence.phase} ref={panelRef} tabIndex={-1}
         onTransitionEnd={presence.onTransitionEnd}>
      <div className="ed-modal-head">
        <Text as="h2" id={titleId} size={2}>{title}</Text>
        <Button variant="ghost" size="sm" onClick={onClose} testId={testId ? `${testId}-close` : undefined}>关闭</Button>
      </div>
      <div className="ed-modal-body">{children}</div>
      {footer ? <div className="ed-modal-foot">{footer}</div> : null}
    </div>
  </div>,
  document.body,
);
```
要点（**每条都要有测试**）：
- `titleId = useId()`；`aria-labelledby` 指向它 ⇒ **测试断言"引用存在且文本等于 title"**（`document.getElementById(panel.getAttribute("aria-labelledby")!).textContent`），**不要硬编码 id**
- 遮罩点击关闭走 `onMouseDown` + `target === currentTarget`（防"从面板内按下、在遮罩上松开"误关 —— 仓内先例 `BrowserChrome.tsx:135` 的 `stopPropagation` 防误关）
- ESC：模块级 `openModalStack`，**只有栈顶（最内层）响应**（同一 `document` 上多个监听器都会跑，靠栈顶判定才确定）；关闭后出栈
- `tier` 决定 `zIndex("modal")` / `zIndex("modalNested")`（**不得写裸数字**）
- `onTransitionEnd` 挂**面板**；CSS 保证同一元素上 opacity / transform **等时长**（否则 presence 的"首个 transitionend 即完成"会提前收尾 —— 写进 CSS 注释）
- **不做** body 滚动锁（现状 20 个弹层也没有；属批 4 观察项，登记在「未做」）

`Modal.css`：

```css
/* Modal —— 遮罩 + 面板。遮罩基色/透明度/圆角/阴影全部走 token（规格 §5.2）。 */
.ed-modal-overlay {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  /* 遮罩 = --ed-overlay 按 --ed-overlay-alpha 压暗（不写 rgba 字面量：颜色只许出现在生成器里） */
  background: color-mix(in srgb, var(--ed-overlay) calc(var(--ed-overlay-alpha, 0.34) * 100%), transparent);
  transition: opacity var(--ed-dur-overlay-in, 200ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1));
}
.ed-modal-overlay[data-phase="enter"], .ed-modal-overlay[data-phase="exit"] { opacity: 0; }
.ed-modal-overlay[data-phase="exit"] { transition-duration: var(--ed-dur-overlay-out, 160ms); }
.ed-modal {
  position: relative; display: flex; flex-direction: column; max-height: 85vh; max-width: calc(100vw - 48px);
  background: var(--ed-bg-raised); border: 1px solid var(--ed-border);
  border-radius: var(--ed-radius-overlay, 10px); box-shadow: var(--ed-shadow-2);
  /* 同一元素上的过渡属性必须【等时长】—— presence 以首个 transitionend 收尾 */
  transition: opacity var(--ed-dur-overlay-in, 200ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)),
              transform var(--ed-dur-overlay-in, 200ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1));
}
.ed-modal[data-phase="enter"] { opacity: 0; transform: translateY(8px); }   /* 位移 8px = §8.4 上限 */
.ed-modal[data-phase="entered"] { opacity: 1; transform: translateY(0); }
.ed-modal[data-phase="exit"] { opacity: 0; transform: translateY(4px); transition-duration: var(--ed-dur-overlay-out, 160ms); }
.ed-modal--s { width: 380px; }  .ed-modal--m { width: 520px; }  .ed-modal--l { width: 720px; }
.ed-modal-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ed-space-8, 8px); padding: var(--ed-space-12, 12px) var(--ed-space-16, 16px); border-bottom: 1px solid var(--ed-border); }
.ed-modal-body { padding: var(--ed-space-16, 16px); overflow: auto; }
.ed-modal-foot { display: flex; justify-content: flex-end; gap: var(--ed-space-8, 8px); padding: var(--ed-space-12, 12px) var(--ed-space-16, 16px); border-top: 1px solid var(--ed-border); }
.ed-modal:focus-visible { outline: 2px solid var(--ed-ink-1); outline-offset: 2px; }
```
- [ ] **Step 4: `Modal.test.tsx` 覆盖**：不 `open` 时不渲染（`queryByTestId` 为 null，且 `document.body` 无 portal 节点）· 打开后 `screen.getByRole("dialog")` 成功 · `getAttribute("aria-modal") === "true"` · `aria-labelledby` 指向的节点文本 == title · 打开时焦点在面板内 · `fireEvent.keyDown(document, { key: "Escape" })` → `onClose` 调用 · ESC 在 `closeOnEsc={false}` 时不调用 · `mouseDown` 遮罩（`fireEvent.mouseDown(overlay)`）→ `onClose`；在面板内 `mouseDown` 不触发 · 关闭后 `transitionend` 前仍挂载、之后卸载 · **`zIndex` 断言**：面板的父遮罩 `style.zIndex === String(Z_TIER.modal)`（`modalNested` 同理）· Tab 循环（`fireEvent.keyDown(document, {key:"Tab"})` 后 `document.activeElement` 仍属面板）
- [ ] **Step 5: 门禁 + 提交**（commit `feat(ui): L1 原语 Modal（role=dialog + 焦点陷阱 + 进出场）`）

**交互态与接缝清单**
- [ ] **进出场 presence 钩子 200/160（出场比进场快）**：`[data-phase]` 三态 + `--ed-dur-overlay-in/out`
- [ ] **遮罩淡入**：`.ed-modal-overlay` 独立 opacity 过渡
- [ ] **可中断/可反向**：出场期间 `open` 回 true ⇒ 回到 `entered`（T6 用例 + 本任务集成用例）
- [ ] **无障碍优先**：`role="dialog"` + `aria-modal` + `aria-labelledby` + 焦点陷阱 + ESC + 焦点归还（**键盘路径优先于动效**）
- [ ] **reduced-motion**：`usePresence` 直跳终态 + `motion.css` 覆盖

**验收**
- [ ] 三条全仓新契约（`createPortal` / `role="dialog"` / `aria-modal`）**首次出现且被测试钉住**（在报告里给出 `Select-String` 命中数从 0→N 的对照）
- [ ] 五个新文件（含 2 个测试）逐个 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量、零 `z-index`
- [ ] 动效接缝四条硬约束逐条给结论
- [ ] 报告：`.../task-7-report.md`

---

### Task 8: `ConfirmDialog` —— 危险确认（级联影响清单）

> 规格 §5.3：高危不可逆（组删除 / 体系级联 / 采集弃置 / 毕业结算）走确认框，**框内必须列明级联影响与保留项**（例：「将删除 1 个组 · 3 条排序记录 · **笔记 7 篇保留**」）。现状两类调用（`window.confirm` 8 行/6 文件 + Tauri `confirm()` 15 行/12 文件）**均为命令式、无 DOM 容器可挂动画**（recon §2）。

**Files:**
- Create: `app/src/ui/primitives/ConfirmDialog.tsx` · `ConfirmDialog.css` · `ConfirmDialog.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: T7 的 `Modal`（`size="s"`）· T5 的 `Button` · T3 的 `Text` · `--ed-stamp` / `--ed-ink-3` / `--ed-bg-sunken`
- Produces:
  - `ConfirmImpact = { readonly text: string; readonly keep?: boolean }`（`keep: true` = 保留项，用正向语气渲染）
  - `ConfirmDialogProps = { open: boolean; title: string; message?: ReactNode; impacts?: readonly ConfirmImpact[]; confirmLabel?: string; cancelLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void; testId?: string }` —— 默认 `confirmLabel="确认"` · `cancelLabel="取消"`
  - `ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null`

- [ ] **Step 1: 写失败测试**：`open=false` 不渲染 · `open=true` 渲染 `role="dialog"`（经 Modal）· **`impacts` 逐条渲染且 `keep:true` 的项带 `ed-confirm-keep` 类**（规格 §5.3 的硬要求：保留项必须列明）· 确认按钮调 `onConfirm` / 取消按钮调 `onCancel` · `busy=true` 时两个按钮都不可点 · ESC/遮罩按 Modal 语义走 `onCancel`（**破坏性动作不得因误点遮罩而被"确认"**）· **印章标记**：`tone` 默认渲染一枚 `ed-confirm-seal`（`--ed-stamp` 文字色，`aria-hidden`），**按钮本身保持 `variant="secondary"`**（控制方 2026-09-11 裁决③：`--ed-stamp` 绝不用于按钮）
- [ ] **Step 2: 实现 + CSS**（`.ed-confirm-impacts` 无序列表 + `li[data-keep]` 用 `--ed-ok` 前缀「›」；`.ed-confirm-seal` 用 `--ed-stamp`）
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): L1 原语 ConfirmDialog（级联影响清单）`）

**交互态与接缝清单**
- [ ] **presence 钩子 + 遮罩淡入**：全部由 `Modal` 承载（本原语**不得**自建 portal / 自建 z-index）
- [ ] **键盘优先**：ESC = 取消；危险按钮**不得**是默认聚焦元素（打开后焦点落在「取消」上 —— 危险动作不能因一个回车就发生）
- [ ] **reduced-motion**：经 Modal 与 `motion.css` 覆盖
- [ ] **禁用视觉降级**：`busy` 走 `Button` 的 `aria-disabled` + 降级

**验收**
- [ ] `impacts`（含 `keep`）有测试；`busy` 有测试；两个按钮的 `variant` 断言为 `secondary`
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量
- [ ] 动效接缝四条逐条给结论（本原语的接缝全部继承自 Modal）
- [ ] 报告：`.../task-8-report.md`

---

### Task 9: `Toast` —— 进出场 180/140 + **可打断**

> 现状 4 套自建 toast（recon §3.2）：`App.tsx` 全局（3.5s，**zIndex 未设**）· `SessionsPage.tsx` 页级（3s，`zIndex:100`）· `SessionScreenCards.tsx` 面板级（4s）· `useTransientToast.tsx` hook 式（3s，`zIndex:200`）。**四套只有进、没有出场**（都靠 `setTimeout` 直接 `setState(null)` 卸载）。

**Files:**
- Create: `app/src/ui/primitives/Toast.tsx` · `Toast.css` · `Toast.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: T6 的 `usePresence(open && !closing, { exitMs: 140 })` · T3 的 `Text` · T5 的 `Button`（`action` 槽）· `zIndex("toast")` · `--ed-bg-raised` / `--ed-shadow-2` / `--ed-ok` / `--ed-stamp` / `--ed-ink-2` / `--ed-radius-panel`
- Produces:
  - `ToastKind = "info" | "ok" | "err"`
  - `ToastAction = { readonly label: string; readonly onClick: () => void }`（规格 §5.3 的「撤销 toast 10s」入口；**本批只建槽位，不实现撤销栈**）
  - `ToastProps = { open: boolean; message: ReactNode; kind?: ToastKind; durationMs?: number; action?: ToastAction; onDismiss: () => void; testId?: string }` —— 默认 `kind="info"` · `durationMs=3000`（`durationMs <= 0` = 不自动消失）
  - `Toast(props: ToastProps): JSX.Element | null`

**可打断状态机（逐条实现 + 逐条测试）**

| 情形 | 行为 |
|---|---|
| `open` true | `phase="enter"` → `entered`（`--ed-dur-toast-in 180ms`）；进入 `entered` 后启动 `durationMs` 计时 |
| 计时到点 | 内部 `closing=true` ⇒ `phase="exit"`（140ms）；出场结束后 `onDismiss()` **只调用一次**（`dismissedRef` 防重） |
| **显示中 `message`/`kind` 变化** | **接管**：清计时、若在 `exit` 则取消出场回 `entered`、重新计时（**不排队、不新开一条**） |
| `durationMs` 变化 | 重新计时 |
| `action.onClick` | 触发后**既不自关、也不清/不重排计时器**（到点仍会走退场并回调一次）⇒ **调用方须在 `onClick` 里自己置 `open=false`**（撤销场景要用户看见结果）。⚠️ 2026-09-11 T9 评审后按实测行为定稿：原措辞"由调用方的 `open` 决定"会被读成"点了就自动关" |
| 父级 `open=false` | 直接走出场（父级已知情，**不再**调 `onDismiss`） |
| 卸载 | 清计时器（照 `useTransientToast.tsx:45-50` 的 cleanup 写法） |

- [ ] **Step 1: 写失败测试（jsdom + fake timers）**：进入后 `role="status"` 存在 · `kind="err"` 时 `aria-live="assertive"`、其余 `"polite"` · `durationMs` 到点后先 `exit`（仍挂载）再卸载并**恰好一次** `onDismiss` · **打断用例**：出场期间改 `message` ⇒ 仍挂载、`data-phase` 回到 `entered`、旧计时器不再触发卸载 · **不排队用例**：连续改 3 次 message，`vi.getTimerCount()` 始终为 1 · `action` 渲染按钮且点击调 `onClick` 但**不卸载**、**计时器不受影响**（推送时钟到 `durationMs` ⇒ 仍先 `exit`、兜底到点后卸载且 `onDismiss` 恰一次） · `zIndex` 断言 = `String(Z_TIER.toast)` · **退场时长两真源对拍**：`Toast.tsx` 的 `EXIT_MS` == `motion.css` 的 `--ed-dur-toast-out`（前者还决定 `usePresence` 的兜底窗口 +80ms）
- [ ] **Step 2: 实现 + CSS**（`.ed-toast` 固定右下 `position: fixed; right: 18px; bottom: 18px`，三档 kind 配色走 token，`[data-phase]` 三态 + `.ed-toast-action`）
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): L1 原语 Toast（进出场 180/140 且可打断）`）

**交互态与接缝清单**
- [ ] **进出场 180/140**（`--ed-dur-toast-in/out`）
- [ ] **可打断**：新消息接管当前动效（**不排队**）—— 这是 §8.6.1 第 3 条的直接落点，**必须有用例**
- [ ] **即时回执**：`action` 槽让"做完了"可区分（撤销 10s 的接缝，规格 §5.3）
- [ ] **无障碍**：`role="status"`；`err` 用 `aria-live="assertive"`（**唯一**有资格打断屏幕阅读器的档）；reduced-motion 经 `usePresence` + `motion.css`

**验收**
- [ ] 上表 **7 行状态机逐行有测试**；"恰好一次 `onDismiss`" 有专门用例
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量、零 `z-index`
- [ ] 动效接缝四条逐条给结论
- [ ] 报告：`.../task-9-report.md`

---

### Task 10: `EmptyState` —— 空态 + 主行动按钮

> 现状：无组件；等价物是 40 行/28 文件的散落灰字（recon §2）；首启路径**无主行动按钮**（规格 §5.1）。**无容器、无 `data-*` 锚点 ⇒ 无法挂入场动画**（recon §8.3）。

**Files:**
- Create: `app/src/ui/primitives/EmptyState.tsx` · `EmptyState.css` · `EmptyState.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: T3 的 `Text` · T5 的 `Button`（`ButtonVariant`）· `Icon` / `IconName`（`../icons`）· `--ed-ink-3` / `--ed-space-*` / `--ed-dur-reveal` 未落地 ⇒ 入场用 `var(--ed-dur-micro, 120ms)`（**不新造时长**）
- Produces:
  - `EmptyStateAction = { readonly label: string; readonly onClick: () => void; readonly variant?: ButtonVariant; readonly disabled?: boolean }`
  - `EmptyStateProps = { title: string; description?: ReactNode; icon?: IconName; action?: EmptyStateAction; secondary?: ReactNode; compact?: boolean; testId?: string }`
  - `EmptyState(props: EmptyStateProps): JSX.Element`

- [ ] **Step 1: 写失败测试**：标题/描述渲染 · `icon` 渲染出 `<svg>` 且 `aria-hidden` · **`action` 渲染一个真实 `<button>` 且点击调 `onClick`**（规格 §5.1「首启路径无主行动按钮」的落点）· 无 `action` 时不渲染按钮 · `compact` 切换类 · `testId` 落位
- [ ] **Step 2: 实现 + CSS**（`.ed-empty` 容器 + `.ed-empty__*` 三段 + 入场 hook 类 `.ed-empty-enter`（透明度 0 → 1，`var(--ed-dur-micro,120ms)`）；图标用 `Icon`，尺寸 24）
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): L1 原语 EmptyState（含主行动按钮）`）

**交互态与接缝清单**
- [ ] **入场点**：`.ed-empty-enter` 类提供入场过渡（**接缝存在即可**，批 6 换成编排层动效）
- [ ] **主行动按钮**：走 `Button`（四态自动继承 —— 这是"叶子原语被组合原语复用"的第一次实证）
- [ ] **环境层不抢注意力**：空态自身**不做循环动画**（§8.6.1 第 1 条：环境层永远不抢注意力）
- [ ] **无障碍**：装饰图标 `aria-hidden`；标题是文本节点（不靠图形传达信息）；reduced-motion 由 `motion.css` 覆盖

**验收**
- [ ] 有 `action` / 无 `action` 两条路径都有测试；`icon` 走图标层（**不得内联 `<svg>`** —— Task 2 的棘轮只管 z-index，但 0-B 的 `no-inline-svg` 棘轮会抓）
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量
- [ ] 动效接缝四条逐条给结论
- [ ] 报告：`.../task-10-report.md`

---

### Task 11: `Loading` / `Skeleton` / `Probe` —— 加载三形态

> 现状：无组件；`加载中|正在加载|载入中|Loading` 83 行/31 文件；`骨架|Skeleton` 仅 6 行/5 文件（**全站 0 骨架屏**）；`@keyframes` **全仓 0 个** ⇒ **微光无处可写**（recon §2/§8.3）。规格 §1 第 11 条：「骨架=已知结构，探针=时长未知」。

**Files:**
- Create: `app/src/ui/primitives/Loading.tsx` · `Loading.css` · `Loading.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: T3 的 `Text` · `--ed-bg-sunken` / `--ed-bg-surface` / `--ed-radius-control` / `--ed-dur-skeleton`
- **生产者的语义边界（控制方裁决 —— 一句可判定的规则，批 4 迁移时按此选，不得混用）**：
  | 组件 | 一句话规则 | 消费场景（批 4 的实测靶子） |
  |---|---|---|
  | `Skeleton` | **知道要出现什么形状**（几行 / 几块）⇒ 用骨架微光占位那个形状 | `app/src/components/GoalDetail.tsx:83` 的「加载中…」一行灰字 → 3 行骨架 |
  | `Loading` | **不知道形状，但需要一句文字说明在等什么**（时长未知）⇒ 文案 + 探针 | `app/src/components/ClassroomCapturePanel.tsx:125-127`「⏳ 正在下载模型（~650MB）…」 |
  | `Probe` | **不需要文字的最小单元**：单点脉冲，可嵌进按钮 / 行内 / 被 `Loading` 内部复用 | `app/src/components/GroupDeleteConfirm.tsx:96` 的 `data-testid="group-delete-loading"` 单行灰字 |
  ⇒ 判定顺序：**先问"形状已知吗"**（是 → `Skeleton`），**再问"要文字吗"**（要 → `Loading`），**都不要 → `Probe`**。
- Produces（三命名导出 —— 控制方 2026-09-11 裁决「同意默认」）:
  - `LoadingProps = { label?: ReactNode; inline?: boolean; testId?: string }` —— 默认 `label="加载中…"`
  - `SkeletonProps = { lines?: number; width?: number | string; height?: number; testId?: string }` —— 默认 `lines=1` · `height=12`
  - `ProbeProps = { label?: string; testId?: string }`
  - `Loading` / `Skeleton` / `Probe` 三个组件

- [ ] **Step 1: 写失败测试**：`Loading` 默认文案「加载中…」+ `role="status"`；`inline` 切换类；`Skeleton lines={3}` 渲染 3 个骨架条（`getAllByTestId` 计数）；`height` 落到行内 style；`Probe` 有 `aria-hidden` 装饰与 `ed-probe` 类；**三者的 `@keyframes` 名字在 CSS 里各出现一次**（直接读 `Loading.css` 文本断言 —— node 与 jsdom 都能跑）
- [ ] **Step 2: 实现 + CSS（本批唯一的 `@keyframes` 产地）**

```css
/* Loading / Skeleton / Probe —— 循环环境动效用 @keyframes（§8.2 判据：不占 JS 主线程，
   reduced-motion 一条媒体查询即静态）。本文件零颜色字面量。 */
.ed-loading { display: inline-flex; align-items: center; gap: var(--ed-space-8, 8px); }
.ed-skeleton { position: relative; overflow: hidden; background: var(--ed-bg-sunken);
               border-radius: var(--ed-radius-control, 5px); }
.ed-skeleton::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ed-bg-surface) 60%, transparent), transparent);
  animation: ed-skeleton-shimmer var(--ed-dur-skeleton, 1200ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)) infinite;
}
@keyframes ed-skeleton-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.ed-probe { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ed-ink-3);
            animation: ed-probe-swing 2.4s ease-in-out infinite; }   /* 2.4s 落在环境层 2–6s（§8.1） */
@keyframes ed-probe-swing { 0%, 100% { transform: translateX(-2px); opacity: .45; } 50% { transform: translateX(2px); opacity: 1; } }
```
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): L1 原语 Loading/Skeleton/Probe（含首个 @keyframes）`）

**交互态与接缝清单**
- [ ] **骨架微光**：`ed-skeleton-shimmer` `@keyframes`（**全仓第一个**，`recon §8.1`：`@keyframes` 现为 0）
- [ ] **探针**：`ed-probe-swing`，周期 2.4s **落在环境层 2–6s**、幅度 4px（不抢注意力）
- [ ] **环境层不得退为纯背景**（§8.6.1 第 1 条）：微光与探针是"闲置时也有生命感"的落点，**不得**写成一次性动画
- [ ] **reduced-motion**：`motion.css` 让两者静止（`animation-iteration-count: 1`）—— 静态态必须是"看起来正常"的骨架/圆点，不能是空白
- [ ] **无障碍**：`Loading` 带 `role="status"` 与可读文案；`Probe` 装饰性 `aria-hidden`

**验收**
- [ ] 三个组件各有测试；`@keyframes` 名字与周期（1200ms / 2.4s）在 CSS 里被断言钉住
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量
- [ ] 动效接缝四条逐条给结论（**本任务是"闲置时也要有生命感"的唯一直接落点**）
- [ ] 报告：`.../task-11-report.md`

---

### Task 12: `StatusLine` —— 状态行（三红归一）

> 现状：无组件；错误行 175 行/98 文件，三红并存（`#dc2626` 138 次 / `#b91c1c` 37 / `#ef4444` 2，recon §2.1）；`#fef2f2` 错误块底 30 行/23 文件；错误常在列表最底部（**视觉盲区**，规格 §5.1）。

**Files:**
- Create: `app/src/ui/primitives/StatusLine.tsx` · `StatusLine.css` · `StatusLine.test.tsx`
- Modify: `app/src/ui/primitives/index.ts`

**Interfaces:**
- Consumes: T3 的 `Text`（`tone`）· T5 的 `Button`（`action` 槽）· `--ed-stamp` / `--ed-due` / `--ed-ok` / `--ed-ink-3` / `--ed-bg-sunken`
- **★ 用色显式契约（控制方 2026-09-11 裁决，写成契约而非隐含约定）**：
  - `error → **文字色** var(--ed-stamp)`；`warn → var(--ed-due)`；`ok → var(--ed-ok)`；`info → var(--ed-ink-3)`（四者都已由 `gen-tokens.test.mjs` 断言两档 ≥4.5:1）
  - **`--ed-stamp` 只作文字色 / 边框色，绝不作任何按钮或元素的 `background`**（规格 §4.1 的 token 注释原文：「全站唯一非中性色，**绝不用于按钮**」）⇒ 本原语**不得渲染任何按钮底色**；`action` 槽由调用方传 `<Button variant="secondary">`，`Button.css` 内 `--ed-stamp` 出现次数必须为 **0**。
  - 该契约由 **Task 14 Step 1 第 4 条守卫**机器化（扫描 `background*` 声明里的 `var(--ed-stamp)`）。
- Produces:
  - `StatusKind = "error" | "warn" | "info" | "ok"`
  - `StatusLineProps = { kind?: StatusKind; children: ReactNode; detail?: ReactNode; action?: ReactNode; testId?: string }` —— 默认 `kind="info"`
  - `StatusLine(props: StatusLineProps): JSX.Element`

- [ ] **Step 1: 写失败测试**：四档 kind 的类映射逐个断言 · **`role` 契约**：`error` → `role="alert"`，其余 → `role="status"` · `detail` 渲染为次级文本 · `action` 渲染 · 默认 `kind="info"` · 类名里**不含任何 hex**（文本断言）· **`error` 档不得渲染任何 `<button>`**（契约的反面：按钮由 `action` 槽外部传入，且 `--ed-stamp` 不作底色）
- [ ] **Step 2: 实现 + CSS**（`.ed-status` 容器 + `.ed-status--{error,warn,info,ok}` 四档**文字色**；`.ed-status-detail` 用 `Text tone="ink-3"`。⚠️ 四档规则一律写 `color:`，**不得写 `background:`**）
- [ ] **Step 3: 门禁 + 提交**（commit `feat(ui): L1 原语 StatusLine（三红归一）`）

**交互态与接缝清单**
- [ ] **浮现钩子**：`.ed-status` 带 `transition: color/opacity var(--ed-dur-micro, 120ms)`（批 6 的「错误浮现/消退」有落点）
- [ ] **即时回执**：`role="alert"` 让错误即刻可被感知（"收到了"）；`action` 承载"怎么办"
- [ ] **不抢注意力**：无循环动画（环境层纪律）
- [ ] **无障碍**：`role` 二值契约 + 颜色不是唯一信号（前缀文案/图标由消费方给）；reduced-motion 由 `motion.css` 覆盖

**验收**
- [ ] 四档 kind × `role` 契约全有测试；`detail`/`action` 槽有测试
- [ ] **`--ed-stamp` 用色契约成立**：CSS 里只出现在 `color:`（报告里给 `Select-String` 证据），`error` 档不渲染任何带底色的按钮
- [ ] 三个新文件 ≤300 行；`@ai-context`；无 `any`；CSS 零颜色字面量
- [ ] 动效接缝四条逐条给结论
- [ ] 报告：`.../task-12-report.md`

---

### Task 13: 清死代码（`App.css` 删除 + `chatBlink` 死声明 + 两条注释改指）

> **独立、可并行**（不碰 `primitives/index.ts`）。两件都属**清死代码/死引用**，不改变任何渲染结果 ⇒ **可放同一 Task**（控制方裁决）。

**Files:**
- Delete: `app/src/App.css`
- Modify: `app/src/utils/colorPalette.ts:16`（注释）· `app/src/components/NoteColorPicker.tsx:7`（注释）
- Modify: `app/src/components/ChatMessageList.tsx:147`（删死 `animation` 声明）

**已核实的事实（计划者本会话复测，实施者用同样命令复核）**
- `App.css` 实测 **123 行**（`countLines()` 口径）/ **1,994 字节** / **CRLF** / **含 GBK 编码的中文注释**（按 UTF-8 读会得到 22 个替换字符）—— 规格 §2 基线已写「`App.css` 是未 import 的死文件**且非合法 UTF-8**」。⚠️ 控制方裁决初稿写的「103 行」来自 `Measure-Object -Line`（**只数非空行**）—— `AGENTS.md §3.1` **明令禁止的三种口径之一**；**以 `countLines()` 的 123 为准**并写进报告。⇒ **一句注记（写给后续所有人）：任何行数判定只用 `countLines()` / `ReadAllLines`，不要用 `Get-Content`、`Measure-Object -Line` 或字节 `0x0A` 计数。**
- 全仓 `App.css` 引用**只有 2 处，都在注释里**：`app/src/utils/colorPalette.ts:16`（「与 App.css prefers-color-scheme 对齐」）· `app/src/components/NoteColorPicker.tsx:7`（「跟随 App.css 的 prefers-color-scheme」）—— **无任何 `import`**。
- **唯一的 `.ed-*` 类**在 `App.css:119`（`.ed-low-confidence`）；它的**类名产者仍在** `app/src/components/structuredBlocks.ts:58`（`lowConfidenceClass()`），测试在 `app/src/components/structuredBlocks.test.ts:85`。
- `app/src` 的 CSS 文件共 3 个：`ui/tokens.css`（生成物，活）· `App.css`（死）· `note-mark.css`（**活**：`main.tsx:5` import —— **不要碰**）。
- `ChatMessageList.tsx:147` 的 `animation: "chatBlink 1s infinite"` 引用的 `@keyframes chatBlink` **全仓不存在**（`@keyframes` 全仓 0 命中）⇒ 现状效果 = **静态的 6×14 青色方块**，删声明后渲染**完全一致**。

- [ ] **Step 1: 删除前核验（三条命令，输出写进报告）**

```powershell
Select-String -Path (Get-ChildItem app/src -Recurse -Include *.ts,*.tsx,*.html,*.css).FullName -Pattern "App\.css" -SimpleMatch
# 期望：只剩 colorPalette.ts:16 与 NoteColorPicker.tsx:7 两条【注释】；无 import
Select-String -Path (Get-ChildItem app/src -Recurse -Include *.ts,*.tsx,*.css).FullName -Pattern "ed-low-confidence"
# 期望：App.css:119（将删）· structuredBlocks.ts:58（产者，保留）· structuredBlocks.test.ts:85（断言，保留）
Select-String -Path (Get-ChildItem app -Recurse -Include index.html,*.config.ts).FullName -Pattern "App\.css" -SimpleMatch
# 期望：0 命中（构建入口与配置都不引用它）
```
- [ ] **Step 2: 删文件 + 改两条注释**

删 `app/src/App.css`（`git rm app/src/App.css`）。两条注释改成指向**真正的来源**：

```ts
// app/src/utils/colorPalette.ts:16
/** 主题模式（暗档由 [data-theme="dark"] 与 ui/tokens.css 的 --ed-* 变量承载） */
```
```ts
// app/src/components/NoteColorPicker.tsx:7
 *              跟随 [data-theme="dark"] 的 --ed-* token。受控组件——选中态/清除
```
⚠️ **这是本次删除唯一有内容风险的连带面**：两处都是**注释**，改的是"文件已不存在"的失指；不得顺手改这两处代码逻辑。
- [ ] **Step 3: 删死 `animation` 声明（`ChatMessageList.tsx:147`）**

把该行改成（**只删 `animation` 一项，其余属性逐字不动**）：

```tsx
<span style={{ display: "inline-block", width: 6, height: 14, background: "#0d9488", verticalAlign: "text-bottom", marginLeft: 2 }} />
```
⚠️ **不**顺手补 `@keyframes chatBlink`（那是**加新动效**，属批 6）；**不**顺手把 `#0d9488` 换成 token（那是批 4 的迁移面）。报告里写明"属清死代码，非行为变更"，并给出前后渲染等价论证（引用的 keyframes 不存在 ⇒ 浏览器静默忽略 ⇒ 现状即静态）。
- [ ] **Step 4: 门禁（四连 + `vite build`）+ 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run; npm run build; cd ..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs ; node scripts/check-command-registry.mjs
git add app/src/utils/colorPalette.ts app/src/components/NoteColorPicker.tsx app/src/components/ChatMessageList.tsx
git diff --cached --stat     # 期望 3 个修改路径；删除路径由上面的 git rm 单独暂存
git diff --cached --stat --diff-filter=D   # 期望恰好 1 个路径：app/src/App.css
git commit -m "chore(ui): 删死文件 App.css 与 chatBlink 死动画声明"
```
⚠️ **禁止 `git add -A` / `git add .`**（`DISPATCH-TEMPLATE.md` §三）：删除用 `git rm <该文件>` 单独暂存，三个修改文件逐个显式 add。
- [ ] **Step 5: 删除后的三项记录（写进报告）**
  1. `recon §8.2` 的「CSS `:hover`/`:active` 6+2 处**全在死文件**」⇒ 删除后**全仓 0 处**；本批新原语是它们的第一批合法产地。
  2. `.ed-low-confidence` 从「死文件里的孤儿规则」变成「**不存在样式定义**」——与该类今天的效果**完全等价**（`App.css` 从未被 import）；产者 `structuredBlocks.ts` 与它的测试**保持不动**（该模块整体无生产调用方，已登记为 `TD-2026-09-11-AG`，属批 1/4 范围）。
  3. 全仓 CSS 文件从 3 → 2（+ 本批新增的 `primitives/*.css`）；`App.css` 是本仓唯一**非 UTF-8** 源文件，删除顺带清掉该隐患。

**验收**
- [ ] 三条删除前核验命令的输出已记入报告（且与上面"已核实的事实"一致）
- [ ] 4 个路径一个提交；`git status` 无残留（`App.css` 不在工作树）
- [ ] `npx tsc --noEmit` 0 错 · `npx vitest run` **104 文件 / ≥811 用例全绿** · **`npm run build` 绿**（这是 CSS 死文件删除最直接的验证）
- [ ] 动效接缝四条：本任务**不新增**任何动效；验收为「删掉的 `animation` 声明从未生效（等价）」+「不误加新 keyframes」
- [ ] 报告：`.../task-13-report.md`

---

### Task 14: 收尾（ADR-033 · 规范回写 · 守卫补强 · 全批次门禁）

**Files:**
- Create: `docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md` · Modify `docs/adr/README.md`（索引行）
- Create: `app/src/ui/primitives/style-contract.test.ts`
- Modify: `docs/product/ui-ux-system.md`（**新增「L1 原语层」章节**）
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§5 标注已落地 · §10 批 0 的 ADR 归属 · §14 文档表）
- Modify: `docs/standards/line-limit-exemptions.md`（「已拆分 / 登记移除记录」节追加本批记录）
- （`app/src/main.tsx` 的入口接线**已按控制方裁决移到 Task 1 Step 3**，本任务不再重复改它，只在验收里复核。）

- [ ] **Step 1: 写 `style-contract.test.ts`（CSS 守卫，node 环境）**

**四个断言**（都直接读盘，先例 `no-inline-svg.test.ts`）：
1. `app/src/ui/primitives/**/*.css` 每个文件 **≤300 行**（`line-limits.mjs` 的 `SOURCE_EXT` 不含 `.css`，这条守卫补上管辖）；
2. **零颜色字面量**：`/#[0-9a-fA-F]{3,8}\b/` 与 `/\brgba?\(/` 与 `/\bhsla?\(/` 全部 0 命中（颜色只许出现在 `app/scripts/gen-tokens.mjs`）；
3. **reduced-motion 覆盖率 100%**：`motion.css` 里出现的 `.ed-*` 类集合 ⊇ 其余 CSS 文件里出现的 `.ed-*` 类集合（规格 §11 验收 5）；
4. **★ `--ed-stamp` 不得作底色**（控制方裁决 ③ 的反例守卫，规格 §4.1「绝不用于按钮」）：逐条解析 `app/src/ui/primitives/**/*.css` 的声明块，**凡属性名以 `background` 开头且值里含 `var(--ed-stamp)` 即失败**（打印 `文件:行号` 与整条声明）；另断言 `Button.css` 内 `--ed-stamp` 出现次数为 **0**。实现提示：按行扫描 `属性: 值;` 即可（本层 CSS 全部单行声明，无需真 CSS parser；**不要**为此引入依赖），并在注释里写清"这是一条反例守卫，不是通用 CSS linter"。

- [ ] **Step 2: 写 ADR-033（L1 原语层与视图层契约）**

结构照 `ADR-032`（背景 / 决策 / 后果 / 替代方案与否决理由），决策至少含：
1. **原语层位置与导出面**：`app/src/ui/primitives/`，唯一入口 `index.ts`；组内互引用走相对路径，**不 import barrel**。
2. **消费纪律**：只许 `var(--ed-*)` + `zIndex()`；`primitives/**/*.css` 零颜色字面量；**不 import 上层**（`components/` `pages/` `hooks/`）。
3. **交互态承载方式**：CSS 类（不是内联 style、不是 `onMouseEnter` + 局部 state）——附 recon §8.2 的零基础实测（`:hover`/`:active`/`:focus*`/`:disabled` 活代码 0 处、`aria-disabled` 0、`tabIndex` 1）。
4. **动效接缝契约**：`[data-phase]` 三态 + `usePresence`（`transitionend` + 超时兜底 + `matchMedia` 守卫）+ 时长变量名与 §8.4 的数值（批 6 真源落地后删块）。
5. **依赖方向**：领域 → 视图 → 容器 → 原语（规格 §7.1）；**原语不得反向依赖**。
6. **弹层三条新契约**：`role="dialog"` + `aria-modal` + `createPortal` + 焦点陷阱 + 焦点归还（批 4 的 20/20 验收线）。
7. **token 前置在本批补齐**：`--ed-shadow-1/2` 定值（亮投影 / 暗反相描边）· 18 个字阶 CSS 变量 · **`ui/tokens.css` 已接线到 `app/src/main.tsx`**（未接线则原语的 `var(--ed-*)` 运行时无值）· **`--due` 亮档第二次对比度修正**（`#B26A12 → #A05F10 →` 本批新值；附两次修正的实测比值）· **`--ed-ink-4` 禁止用于剪报底纹**（3:1 例外只在阅读面上成立）。
8. **本批不迁移调用点**：迁移属批 4，且 z-index 必须按**叠放段**整段推进（0-A 交接第 3 条）。
9. **登记（非本批）**：ADR-034 / 035 的题目与归属 —— 本计划据规格 §10 的批次内容推定为：**ADR-034 = L2 壳层与列契约（批 3 落地时）**；**ADR-035 = L4 动效纲领与引擎（批 6 接入 GSAP 时）**；**ADR-010 修订为退役**属**批 1**（规格 §10 批 1 明写）。⚠️ 这三条归属是**计划者按批次内容推定**，若控制方另有安排以控制方为准（写进 ADR 的「登记」节，不写成已裁决）。

- [ ] **Step 3: `ui-ux-system.md` 新增「L1 原语层」章节**

现状：该文档**全篇无原语章节**（recon §7.2⑥，grep「原语/Modal/EmptyState/ConfirmDialog/StatusLine/Toast」命中 0）。新增一节，内容 = 原语清单（9 类 + 各自一句话职责）· 交互态契约（四态/升起/墨度/出现场）· 动效接缝与 reduced-motion 承诺 · z-index 六档的消费方式（`zIndex()` 而非裸数字）· token 消费纪律（零颜色字面量）。**不要**把规格 §6–§8 的壳层/视图/动效纲领整段搬来（那是批 8 的回写范围，见「未做」）。

- [ ] **Step 4: 规格回写（只改本批确实改变的事实）**
  - §5.1/§5.2：标注「L1 原语已落地（批 0-D），消费在批 4」；Modal 契约补「尺寸三档 = `.ed-modal--s|m|l`（380/520/720）」与 `tier`（modal / modalNested）。
  - §10 批 0 行：把「4 条 ADR」标注为 **ADR-032 ✅ · ADR-033 ✅（批 0-D）· ADR-034/035 顺延至批 3/6**。
  - §14 文档表：`ui-ux-system.md` 行补「批 0-D 已落：阴影命名关系 + L1 原语章节；四层动效/三档强度/断点与窗口仍留批 8」。
- [ ] **Step 5: `docs/standards/line-limit-exemptions.md` 追加本批记录**

在「已拆分 / 登记移除记录」节追加一条：本批新增 N 个文件（逐个给实测行数）**全部 ≤300，无需登记**；`--full` 后 `301–600 档` 计数与「登记条目」数不变。⚠️ **先跑 `node scripts/line-limits.mjs --full`；绿则不要跑 `--write`**（避免把并行任务的在飞行连带提交 —— `DISPATCH-TEMPLATE.md` §三第 2 条的 10 次实测事故）。**只追加人工记录行**。
- [ ] **Step 6: 全批次门禁复核 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run; npm run build; cd ..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs ; node scripts/check-command-registry.mjs
# 逐个复核本批新增文件的行数（口径唯一有效，见 Global Constraints）
Get-ChildItem app/src/ui/primitives -Recurse -Include *.ts,*.tsx,*.css | ForEach-Object { "$([System.IO.File]::ReadAllLines($_.FullName,[System.Text.Encoding]::UTF8).Count)`t$($_.Name)" } | Sort-Object -Descending
git add docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md docs/adr/README.md app/src/ui/primitives/style-contract.test.ts docs/product/ui-ux-system.md docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/standards/line-limit-exemptions.md
git diff --cached --stat
git commit -m "docs(adr): ADR-033 原语层契约 + 规范回写（批 0-D 收口）"
```
（`app/src/main.tsx` 的入口接线已按控制方裁决落在 **Task 1 Step 3**，本提交不再包含它。）

**验收**
- [ ] `style-contract.test.ts` **四条**守卫全绿，且**故意塞一个 `#fff` 到一个原语 CSS 里时第 2 条必红**、**故意把 `background: var(--ed-stamp)` 塞进一个原语 CSS 时第 4 条必红**（两次实验输出写进报告后撤销）
- [ ] ADR-033 落盘 + `docs/adr/README.md` 索引 1:1（`node scripts/docs-check.mjs` 绿）；ADR 内**含 `--due` 第二次对比度修正**与 `ink-4` 禁止组合的记录
- [ ] `ui-ux-system.md` 有原语章节；规格三处回写到位；豁免表记录行已追加且 `--full` 绿
- [ ] **复核** `app/src/main.tsx` 仍含 `import "./ui/tokens.css";`（Task 1 落的线未被回退）
- [ ] 五条门禁 + `npm run build` 全绿；`git status` 干净（只剩历史遗留的 `?? docs/tech-debt/`）
- [ ] 动效接缝四条：本任务不新增原语；验收为**守卫把"reduced-motion 覆盖率 100%"变成机器判据**（规格 §11 验收 5）
- [ ] 报告：`.../task-14-report.md`

---

## 完成本批后的状态

- `app/src/ui/primitives/`（新建）下有 **9 类原语**：`Text` · `Surface` · `Button` · `Modal` · `ConfirmDialog` · `Toast` · `EmptyState` · `Loading`（含 `Skeleton`/`Probe`）· `StatusLine`，各自「实现 + CSS + 测试」三件套，**逐个 ≤300 行**，唯一导出面 `index.ts`。
- **三条全仓新契约从 0 变成 1**：`createPortal` · `role="dialog"` + `aria-modal` + `aria-labelledby` · 焦点陷阱与焦点归还（规格 §5.2 的四个必补能力中除 IME 接线外的三条）。
- **交互态从零基础建立**：`:hover` / `:active` / `:focus-visible` / `:disabled` 在活代码里**首次出现**（今天分别 0 / 0 / 0 / 0）；`aria-disabled` 首次使用；禁用态首次有视觉降级（今天全站 1 处）。
- **动效接缝就位**：`usePresence`（`transitionend` + 超时兜底 + `matchMedia` 守卫）· `[data-phase]` 三态协议 · **全仓第一批 `@keyframes`**（骨架微光 / 探针）· **全仓第一条 `prefers-reduced-motion`**（今天 0 处）· 时长变量名与 §8.4 数值一致（批 6 换真源时整块删除）。
  - ⚠️ **口径订正（2026-09-11，本批实测证伪）**：本批**第一个 `@keyframes` 是 `EmptyState` 的 `ed-empty-in`**（`0e5e78ab`，早于 `Loading` 的 `174b1893`）⇒「全仓第一批 `@keyframes`」不成立；这里的 reduced-motion 块只是 **`app/src` 内第一条**（仓库根 `website/components/dive/ChronosDemo.tsx:59` 早有 JS 侧 `matchMedia("(prefers-reduced-motion: reduce)")`）⇒「全仓第一条」也不成立。**权威表述见 `app/src/ui/primitives/motion.css:10-12` 与 ADR-033**；上面那行是计划写作时刻的快照，保留原样、不改写历史。
- **token 缺口补齐**：`--ed-shadow-1/2`（亮投影 / 暗反相描边）· 18 个字阶 CSS 变量（含 `1.9 → 29.5px` 的换算记录）· **`ui/tokens.css` 已接线到 `app/src/main.tsx`**（原语的 `var(--ed-*)` 从此在运行时有值）· **`--due` 亮档第二次对比度修正**（求解所得新值，三个底都 ≥4.5 且剪报底留 ≥0.05 余量）· **`--ed-ink-4` 禁止用于剪报底纹**（不新增 token，写成规范条款 + 反例守门断言）。
- **三条棘轮/守卫上线**：裸数字 z-index（58 行冻结，只许减少）· `ui/primitives/**/*.css` 的 300 行 / 零颜色字面量 / reduced-motion 覆盖率三合一守卫 · `--ed-stamp` 不得作底色的反例守卫。
- **死代码清理**：`app/src/App.css`（123 行、非 UTF-8）删除；`ChatMessageList.tsx:147` 的死 `animation` 声明删除；两处失指注释改指真实来源。
- **界面外观零变化** —— 没有任何现存组件改用新原语（消费在批 4）。这是设计意图（规格 §10）。

## 未做（登记）

- **全部调用点迁移**（20 弹层 / 44 空态 / 85 加载 / 196 错误行 / 4 toast / 2 confirm / Button·Surface·Text 的上千处内联 style）：**批 4**（规格 §10）。本批只交付被迁移的靶子。
- **`ui/tokens.css` 的入口接线**：**已由 Task 1 Step 3 按控制方裁决完成**（`main.tsx` 那 1 行 + `tokens.drift.test.ts` 的接线守卫）⇒ 本项**不再是遗留**；但**现有组件改用 token 仍是批 4**（本批只让原语能用）。
- **`docs/tech-debt/` 里的 `TD-2026-08-31-C`**（`App.css` 死样式）与 `TD-2026-09-11-AG`（`structuredBlocks.ts` 整模块无生产调用方）：前者由本批 Task 13 **实质闭环**，但 `docs/tech-debt/` **未入库**（`git status` 显示 `?? docs/tech-debt/`）⇒ 本批不改它，只在报告与 ADR-033 记录闭环关系；后者仍 open（属批 1/4）。
- **`docs/versions/v0.16.1.md:158` 的未决项**（「`App.css` 从未被引入……需单独裁决」）：版本文档是历史快照，**不改**；由批 8 的版本记录承接。
- **动效 token（`--ed-dur-*` / `--ed-ease`）的真源**：仍属**批 6**（0-A 计划自审已推迟）。本批只在 `primitives/motion.css` 落地同名的临时块，**批 6 落地真源时须整块删除**并把它并入 `app/scripts/gen-tokens.mjs`。
- **GSAP 与四层动效、三档强度、6 个签名动效**：批 6（规格 §10）。
- **IME 守卫的接线**：`ime.ts` 只建不接（本批无表单）。批 4/5 在每个「Enter 提交」处消费 `isImeComposing()`。
- **`Loading` 的骨架屏落地到 31 个加载点**：批 4。
- **Modal 的 body 滚动锁 / 焦点陷阱的可配置项（初始聚焦元素重定向）**：现状 20 个弹层也没有滚动锁 ⇒ 不在本批；若批 4 发现需要，另立条目。
- **`ui-ux-system.md` / `theme.md` 的完整回写**（四层动效、三档强度、断点与窗口、图标节措辞）：**批 8**（规格 §14）。本批只补**因本批代码而产生**的事实：阴影命名关系 · L1 原语章节 · 「剪报底纹上只用 `ink-3` 及更深」规则 · `--due` 第二次修正。
- **两条对比度处置的后续**（控制方 2026-09-11 已裁决，不再是遗留项）：`--due` 改值由 Task 1 落地；`ink-4 × 剪报底` 由「规范条款 + 反例守门断言」管住。**旧值 `#A05F10` 的全仓清点与逐处处置表见 Task 1 Step 7 第 3 条**（其中 ADR-032 / 0-A 计划 / `docs/versions/v0.22.md` 三处**刻意不改** —— 它们是决策历史与已执行计划，改它们等于重写历史）。
- **`--ed-shadow-card` 的存量消费方**：实测 0 处代码引用（只在 `ui-ux-system.md` 文档里），故本批只改文档、不留兼容别名。
- **规格 §5.2 的 IME「现状 1/9 处」基数**：recon §9.5 标为**未核实**，本批不据此改任何数字。

## 自审记录

**规范覆盖（逐条对照 §11 验收口径）**：第 2 条（手写弹层 → `Modal`；`role="dialog"` 20/20）—— 本批交付被迁移的靶子与三条新契约，20/20 的**达成**在批 4；第 3 条（五类重复各 1 个原语）—— 本批交付 9 类原语的**唯一实现**，收敛在批 4；第 4 条（CSS 变量覆盖语义色/字阶/间距/圆角/时长/缓动）—— 本批补齐**字阶**与**阴影**，**时长/缓动**归批 6（0-A 计划已登记该分口径）；第 5 条（`prefers-reduced-motion` 覆盖率 100%）—— 本批首次引入并由 Task 14 守卫机器化；第 11 条（`tsc`/`vitest` 全绿）—— 每个 Task 末尾各验证一次 + `npm run build` 三处（T1/T13/T14）。

**占位符扫描**：无 TBD / TODO / 「类似 Task N」；每个原语的接口契约、类名、CSS 关键规则、测试要点、门禁命令与提交信息**逐条写出**。**唯一需要实施者填写的空**：Task 2 的 `FROZEN_NUMERIC_ZINDEX` 名单 —— 它**必须**由守卫自己的首次输出决定（预写就等于伪造基线；先例 0-B 计划同一处理）。另有三处**实测待复核**（都给了计划者的预计算值，实施者须用 `contrastRatio()` / `countLines()` 独立复核）：Task 1 Step 6 的 `--due` 新值（预解 `#9E5E10`）与 8×2 个对比度比值 · Task 1 Step 5 的 18 个变量落地情况 · 各文件的最终行数。

**控制方 2026-09-11 追加四条裁决的落实位置（逐条对照，勿漏）**：① 对比度**分两种处置** —— `--due` **改值**（Task 1 Step 1 写入生成器 + Step 6 求解与断言 + Step 7 规格/ADR 注明「第二次修正」）、`--ed-ink-4` **禁止组合**（Task 1 Step 6 反例守门 + Step 7 写进 `ui-ux-system.md`）；② `ui/tokens.css` **必须接线**（Task 1 Step 3 的 `main.tsx` 一行 + `tokens.drift.test.ts` 守卫；Task 14 只复核）；③ `Loading/Skeleton/Probe` **语义边界 + 消费场景**（Task 11 Interfaces 的判定表）；④ `--ed-stamp` **用色显式契约 + 反例守卫**（Task 12 Interfaces/验收 + Task 14 Step 1 第 4 条）。三处曾标「待控制方拍板」的项已全部拍定，Global Constraints 已按定案重写、旧默认文本已删除。

**类型一致性（跨 Task 交叉检查过的接缝）**：`TextTone` 的 9 个成员 ↔ `Text.css` 的 9 个墨度类 + `inherit` · `TextSize` 1–6 ↔ `--ed-type-N-*` ↔ `SCALE_TOKENS.typeScaleVars` 下标（1 起） · `PresencePhase` 三态 ↔ `[data-phase]` 三个 CSS 选择器（Modal/ConfirmDialog/Toast 共用同一协议） · `TransitionEndLike` 的 `target/currentTarget` ↔ React `TransitionEvent` 结构兼容（故可直接挂 `onTransitionEnd`）· `ButtonVariant` 三档 ↔ `EmptyStateAction.variant` 复用同一联合类型（**无 `danger`**，与「危险/错误语义不新增 token」的裁决一致）· `ModalSize` ↔ `.ed-modal--s|m|l` ↔ 规格 §5.2 的 380/520/720 · `StatusKind` 四档 ↔ `.ed-status--*` ↔ `role` 二值契约 · 时长变量名七件（`--ed-dur-micro/overlay-in/overlay-out/toast-in/toast-out/skeleton` + `--ed-ease`）在 `motion.css` 定义一次、在 Modal/Toast/Loading/Text/Surface/Button 的 CSS 里以 `var(名, 同值)` 引用。

**与 recon 的三处口径冲突（已在 Global Constraints 显式标注）**：① recon §1.1 自称用 `Get-Content().Count` 量行数 —— 那是 AGENTS.md §3.1 禁用且**少算**的口径（实测 `tokens.css` 67→69、`no-inline-svg.test.ts` 52→61）；本计划**不引用** recon §1.1 的任何行数结论，只引用它的**命中数**（grep 类）。② 控制方裁决初稿的「`App.css` 103 行」来自 `Measure-Object -Line`（非空行口径，同属禁用口径），实测 **123 行**，Task 13 以 123 为准并复测。③ recon §7.2③ 把「`--ed-mark-clip` 前景色未定义」列为硬前置 —— 控制方 2026-09-11 裁决**撤销**了它（**不新增前景 token**，文字用所在层级 `--ed-ink-*`），并进一步把该组合的实测结果**分两种处置**：`--due` 改值、`ink-4` 禁止组合（本计划的 Task 1 Step 6/7 即照此写）。

**未采纳的替代方案（记录在案）**：① 原语落点用 `app/src/ui/` 扁平直放（recon §5.2 的第二条先例）—— 否决：9 类 × 3 文件会把 `ui/` 冲垮，且失去 `icons/` 已证明的单一导出面。② 交互态用「`onMouseEnter` + 局部 state」—— 否决：那正是现状 13 个文件的写法，会让批 6 被迫逐处改，且写不出 `:focus-visible` 与 `@keyframes`。③ 一个 `primitives.css` 承载全部原语样式 —— 否决：T3–T12 会串行改写同一文件，与「文件随职责走」和并行纪律冲突。④ 字阶一次性改名为语义档（`--ed-text-body` 等）—— 否决：控制方裁决明确要求**数值命名法**（`--ed-type-<n>-*`，与 `--ed-ink-1..4` / `--ed-space-*` 一致）。

**一处需要控制方知情的架构取舍**：原语用 **CSS 类**（本仓首次大规模 `className`，今天全仓只有 4 处 `className=`）而非内联 style。理由是 `:hover` / `:focus-visible` / `@keyframes` / `@media (prefers-reduced-motion)` **无法内联表达**，而 §8.6.1 四条硬约束要求这些能力。代价：批 4 迁移期会出现「内联 style + 新原语类」两种写法并存的窗口（与 token 迁移期并存同性质），已在 ADR-033 记录。

**报告与评审的落点（每个 Unit 一对一）**：实施者报告 `.superpowers/sdd/2026-09-11-frontend-redesign-batch0d-primitives/task-<N>-report.md`；独立任务评审报告同目录 `task-<N>-review.md`。**14 个 Task = 14 个实施者 Unit（Task 2 与 13 可与他任务并行）+ 14 份独立任务评审**，分别照 `.superpowers/sdd/DISPATCH-TEMPLATE.md` 与 `.superpowers/sdd/REVIEW-TEMPLATE.md` 执行 —— 本计划**不复制**那两个模板的条文。
