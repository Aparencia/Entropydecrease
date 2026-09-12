# 批 4 原语迁移实施计划（20 弹层 + z-index 六档 + 4 toast + 8 confirm + Button/Surface/Text + 五类重复）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把批 0-D 交付、批 3 一直不敢 import 的 **L1 原语层真正接进产品**：**20 个手写弹层 → `Modal`（`role="dialog"` + 焦点陷阱 + 进出场）**· **17 个裸 z-index 不同值 → 六档标尺**· **4 套自绘 toast → `Toast`**· **8 处 `window.confirm` → `ConfirmDialog`**· **`*Btn*` 常量族 → `Button`**，并把空态 / 加载态 / 错误行 / 弱化文本 / 卡片边框五类重复按**切片 + 棘轮**推进。规格 §10 批 4 行的两条验收逐字为：**`z-index ≤6`** 与 **`role="dialog"` 20/20**。

**Architecture:** 本批**不改数据层、不改壳层架构、不建视图层、不装 GSAP、不新增依赖**。改动只发生在三处：① `app/src/ui/primitives/**`（4 个能力缺口，逐缺口按 B6 阈值判）；② 调用点（把 `position:"fixed"; inset:0` 的手写遮罩换成 `<Modal>`、把裸 z-index 换成 `zIndex(...)`、把自绘 toast/confirm/按钮换成原语）；③ 守卫与棘轮（`ui/zIndex.guard.test.ts` 的冻结名单收口 + 三条新棘轮）。**唯一公共入口是 `ui/primitives/index.ts`（barrel）**，代价是可量化的：**+3.41 kB gzip JS（上界，实测）**，CSS 2.18 kB gzip **不进** 200 kB 判据。

**Tech Stack:** Tauri 2 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6 · Vitest 4（全局 `environment: "node"`；组件测试首行必须 `// @vitest-environment jsdom`）· Node 24（`scripts/*.mjs` 门禁）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（**§10 批 4 行** · §10 表后两条约束 · **§11 验收口径** · §5 / **§5.1 收敛账本** / **§5.2 Modal 契约** / §5.3 删除语义 / §5.4 拆件 · §4 的两条禁令 · §12 · §14）

**控制方裁决（硬输入，不许重新论证）：** 批 4 侦察底稿目录（**gitignored，不入库** —— 本地路径 `.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/`）下的 `rulings.md` 的 **B1–B10** 与末尾**四条跨批纪律**；侦察底稿为同目录 `recon.md`（765 行）+ `tmp/callsites.{md,json}`。**该目录整体不入库**（AGENTS.md §0 的仓库口径：`.superpowers/` 只在本地工作树可见），故此处**不给出相对链接** —— 需要读裁决的读者请在本地工作树按上述路径打开。

**输入材料（开工前六份，优先级即此序）**

1. **本计划的 §实测基线**（计划者在 `dev@42e88740` 实跑八条门禁 + 四支自建探针得到的全部读数；**下游任何任务都不得引用 recon 里"批 3 未收口"时点的读数**——那些会被本批基线整体替换）
2. `docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md`（**本批新增**；批 3 的 A1–A7 七处裁决的 durable 载体，T4/T9/T10 的判据直接引它）
3. `.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/`（侦察探针 `scan-callsites.mjs` / `classify.mjs` / `overlays.mjs` / `totals.mjs` + **计划者新增四支** `planner-baseline.mjs` / `planner-callsites.mjs` / `planner-tests.mjs` / `planner-widths.mjs` + 逐处清单 `callsites.md` / `planner-callsites.txt` / `vitest-baseline-42e88740.json`；**该目录 gitignored，不入库**）
4. 规格对应节（§4 / §5 / §10 / §11 / §12 / §14）与 `docs/product/ui-ux-system.md`（§十一「L1 原语层」章节；AGENTS.md §10 额外审查文件）
5. 兄弟计划 [批 3](./2026-09-11-frontend-redesign-batch3-shell.md) 的 **§收口回写**（**必读**：§八「批 4 的迁移点」是本批的输入清单，§六「未验证」是本批不许含糊的边界）· [批 0-D](./2026-09-11-frontend-redesign-batch0d-primitives.md) 的收口（原语层自身的落地口径）
6. `.superpowers/sdd/DISPATCH-TEMPLATE.md`（实施者纪律）· `.superpowers/sdd/REVIEW-TEMPLATE.md`（评审者纪律）

---

## Global Constraints

- **本批范围（规格 §10 批 4 行逐字）**：「20 弹层 / 44 空态 / 85 加载 / 196 错误行 / 4 toast / 2 confirm / Button/Surface/Text」；验收列逐字：「z-index ≤6；`role="dialog"` 20/20」。
- **★ 本批的四个非目标（违反即任务失败）**
  1. **不建视图层**（`ViewSpec` / `viewRegistry` / `ViewSwitcher` / 会话 4 视图 / 笔记 3 视图 / 惰性挂载 / flushSave 守卫）——**批 5**（规格 §7 / §10 批 5 行）。
  2. **不装 GSAP、不做动效纲领**（四层 / 三档强度 / 双基调 / 6 个签名动效 / 相变两态 / `--ed-dur-*` 真源迁移）——**批 6**（规格 §8 / §10 批 6 行）。**但"迁移即上线动效"是被接受的**（B9）：原语自带的 7 条 `transition` + 3 个 `@keyframes` 会随迁移生效，**本批不得压制它们**。
  3. **不改后端数据模型、不动 `src-tauri/**`**（本批零 Rust 改动 ⇒ `cargo test` 与 `clippy` 必须逐字持平）。
  4. **不并入「3 套 markdown 渲染器归一」**（B8 裁决）：规格 §12 那句「可并入批 4」是**许可不是命令** ⇒ **登记去向 = 批 5 或批 7**，本批一个字符都不动。
- **★★ B1–B10 是硬输入（不许重新论证、不许绕过）**
  | # | 裁决 | 本批的执行形态 |
  |---|---|---|
  | **B1** | **11 个锚定菜单不迁 `Modal`**，只把 z-index 落到 `popover`(200) | T4 改它们的 z-index；**T1 的登记表逐条列名**（不许从账本消失）；ADR-033 §7 的「不得自建第二套」**适用对象明确为对话框类** |
  | **B2** | **3 个采集/预览覆盖层不迁** | 规格 §11-2 的「≤6 档」**为它们写明例外并逐条登记**（`CaptureOverlayPanel` 甚至未声明 zIndex）；`zIndex.guard` 的冻结名单**收口到例外集**，不静默 |
  | **B3** | 验收按**规格的 20**（`role="dialog"` 20/20），**逐条列出这 20 个文件** | 本计划 §「20 的构成」= 侦察的 A14+B4+E2（**声明是可辩护的构成、不是规格原文**）；T8 立机器判据；ADR-033 的 **28** 并列登记，两口径对账归**批 8** |
  | **B4** | `Button` 范围 = `*Btn*` 常量族 + 新代码 + **新造「原生按钮棘轮」**；余量登记给批 5/7 | T1 落地棘轮（基线 **510 处 / 385 行 / 121 文件**）；T12 迁 **103 行 / 37 文件**（实测的 `style={xxxBtn}` 消费者）；余量 **≈407 处**登记 |
  | **B5** | **barrel 导入**（`import { … } from "../../ui/primitives"`） | 诚实代价 **+3.41 kB gzip JS（上界）** + 2.18 kB gzip CSS（**不进** 200 kB 判据）；每个任务的开工人数表里记这一笔；**深导入一律禁止** |
  | **B6** | 原语缺口**逐缺口判**：**同一缺口 ≥3 个调用点共用 ⇒ 改原语；<3 ⇒ 改调用点** | T2 处理 `Modal` 滚动锁（20 共用）+ `ConfirmDialog.tier`；T3 处理 `Toast` 位置槽（1 个消费者 ⇒ **特殊条款：只许加一个具名、有文档的 prop**）+ `EmptyState` 排版（44 共用 ⇒ **只许开一个受控排版档**，不许放开裸 `className`） |
  | **B7** | `ChatPage.tsx` **先拆件、再迁移**（两个原子提交） | T13-b 的 `ChatSplit` 任务（拆件，行为等价）→ 才允许改它；**T4 明确把 `ChatPage.tsx` 的 2 条裸 z-index 交给拆件任务** |
  | **B8** | markdown 归一**不并入** | 见非目标 4 |
  | **B9** | **接受「迁移即上线动效」**，但计划与验收必须**显式写出「只有接缝、没有纲领」** | 每个迁移任务的报告必须逐字写这句；T18 的验收不得声称动效系统已交付 |
  | **B10** | **零新增依赖** | 断言只用原生 DOM API（`getAttribute` / `textContent` / `toBeTruthy`），交互用 `fireEvent`；**不许** `jest-dom` / `user-event`（包不存在 ⇒ `tsc` 与 vitest 双红） |
- **★ 四条跨批纪律（rulings.md 末尾，逐条适用）**
  1. **变异体实验一律在导出副本里做**（`git -c core.autocrlf=false archive -o t.tar <sha>` 落盘 + junction 借 `node_modules`；**删树前先摘点**）；**绝不许在 `app/src/**` 上「改→跑→还原」**（批 3 已两起事故）。
  2. **变异体跑 vitest 绝不用 `--reporter=basic`**（Vitest 4 已移除 ⇒ 产出「伪装的红」= 假证明）；**每次必须带 CONTROL（未变异必须绿）**，且**每一条新判据都要有它自己的变异体**（CONTROL 只证「跑得起来」）。
  3. **不许 `eval` / `new Function` / `Function(...)`**；类型噪音用 `s.charAt(i)` 或显式类型收口，**不许** `@ts-expect-error` / `any` / 关类型检查。
  4. **判据口径优先用「Δ + 机理核查」，不用裸绝对数**；「真实静态边」用 **TS 编译器 API 剔掉 `import type`**（批 3 实测同一个「真实静态可达」被三方测出 38/39/49）。
- **★ 原语层的三条铁律（ADR-033，违反即返工）**
  1. **`ui/primitives/index.ts` 是唯一公共入口**；组内互引用走相对路径（`./Text`），**调用点不得深导入**（深导入**不带** `motion.css` ⇒ 壳层自足件在 reduced-motion 下照旧动 = 无障碍回归）。
  2. **不得用行内 `style` 覆盖类语义**（ADR-033 §4）：`Button`/`Surface`/`Text` 的四态与墨度权威在类；`style` 只许用于**布局**（宽高、flex、间距）与批 6 的动效接缝。**禁止**用 `style` 覆盖原语的底色 / 位移 / 边框。
  3. **`Modal` 是 Portal / 焦点陷阱 / ESC 栈的唯一持有者**：迁移后的弹层**不得**保留自己的遮罩、`document`/`window` 级 ESC 监听、焦点陷阱（ADR-033 §7）。**ESC 的最内层判定必须用 React 树深度**。
- **★ 两条批 0-D 实测新增的契约（批 4 必须遵守）**
  1. **退场相位禁指针事件**：`[data-phase="exit"]` ⇒ `pointer-events: none`（已落盘）。**JS 侧兜底窗口与 CSS 侧过渡时长必须同值**（`EXIT_MS` ↔ `var(--ed-dur-*-out, <同值>)` ↔ `motion.css`，三方对拍守卫在 `style-contract.test.ts`）——**改任何一个都要同步另一个**。
  2. **`Enter` 提交必须带 IME 组合守卫**：`isImeComposing()` 在批 0-D **只建不接** ⇒ 本批在每个「Enter 提交」处消费它（T3 至少覆盖 `Toast` 位置槽的落点文件与 T9 的 `CommandPalette`；其余 Enter 提交点由**各迁移任务顺手接**，逐条登进报告）。
- **★ 行数纪律（唯一有效口径）**：单文件 **≤300 行**（**全部行数、含空行**），口径 = `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` == `scripts/line-limits.mjs` 的 `countLines()`。⚠️ **绝不使用** `Get-Content`（本机 PS 5.1 按 GBK 解码，**少算可达 56 行**）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数。
  - **新文件 ≤300 且不许 `--write` 登记**（301–600 档要登记；>600 必须硬拆）。
  - **🔴 计划里每个任务给的"预算行数"是估算，不是绑定约束**；**绑定约束是 ≤300 且不新增豁免登记**（批 3 已有 4 例突破预算——`ShellFallback.test.tsx` 163/120 · `ClassroomRightPane.test.tsx` 138/120 · `TopBar.css` 142 · `columnConsumption.test.ts` 126——控制方裁定「**接受并回写预算**」，理由是「压回预算只能删判据覆盖面」）。⇒ **实施者不得为落进预算而删判据**；超预算**登记即可**，但**超过 300 必须拆**。
- **★ 三个贴边的文件（动手前先量，别等门禁红）**

  | 文件 | 实测 | 余量 | 纪律 |
  |---|---|---|---|
  | `app/src/pages/ChatPage.tsx` | **599/600** | **1** | **本批不许直接迁移**：B7 要求**先拆件**（T13-b），拆完再动；T4 的 2 条裸 z-index 也交给拆件任务 |
  | `app/src/pages/NotesPage.tsx` | **300/300** | **0** | 任何改动必须先拆件或**净增 0**；本批若必须动它 ⇒ 先把它拆到 ≤300 再改（拆件与迁移分成两个提交） |
  | `app/src/App.tsx` | **574/600** | 26 | **单写者**：只许 T10 动（AI toast → `Toast`）；T4 不许碰它（它的 `zIndex("toast")` 已经走标尺，无裸数字） |
  | `app/src/components/RefineWorkbench.tsx` | 471（已登记） | — | 面板 **1200 px** 双栏工作台；迁 `Modal size="l"`(720) 是**待裁决 #3**，T7 开工前必须有裁决 |
  | `app/src/shell/CommandPalette.tsx` | 219 | — | 迁移后**必须 ≤300**（现 219，预算 ≤220：删自建遮罩/Esc/焦点后应当**净减**） |
  | `app/src/ui/zIndex.guard.test.ts` | 184 | — | **T4 独占**；名单改动只许出现在 T4 的提交里 |
- **改造后必须平齐的门禁基线（`dev@42e88740`，计划者本轮实跑；见 §实测基线）**

  | 门禁 | 基线 |
  |---|---|
  | `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 123 · 登记条目 123** |
  | `node scripts/docs-check.mjs` | exit 0（5 项全 ✅） |
  | `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** |
  | `cd app; npx tsc --noEmit` | exit 0（0 错）· ⚠️ **必须单独跑**（vitest 不暴露 TS6133/TS2873，esbuild 只剥类型） |
  | `cd app; npx vitest run` | exit 0 · **143 文件 / 1370 用例 / 0 失败**；**本批判据 = 既有用例逐文件「一条不许少」**（基线快照 `tmp/vitest-baseline-42e88740.json`），新增只增不减 |
  | `cd app/src-tauri; cargo test --test app_lib_tests` | exit 0 · **2300 passed / 0 failed / 6 ignored**（本批不动 Rust ⇒ **必须逐字持平**） |
  | `node scripts/check-bundle-budget.mjs` | exit 0 · 首屏 **97.16 kB**（**B5 的 +3.41 kB 会吃掉一部分余量**）· 余量 102.85 kB · **CSS 不计入该判据，只报告** |
  | `cd app/src-tauri; cargo clippy --all-targets` | exit 0 · 判据 = **`诊断文本 @ 文件:行:列` 排序去重后的集合**；基线 **20 条位置**（**禁止比 sha256**：行尾/编码差异会假红） |
- **★ 每条读数必须带出处与时刻（批 3 三次翻车的直接教训）**：`app/dist` 在本批开工时是 **mtime `2026-09-12 14:06:11`**、入口 chunk `index-Cf249NJv.js`（99,860 B）的批 3 终态产物。**任何"前后对比"的首屏读数都必须写明 dist 的 mtime + 对应提交**；本批要改首屏构成（barrel 进图）⇒ **T1 与 T18 都必须跑一次真实构建**（`check-bundle-budget.mjs` 不带 `--no-build`），并在报告里贴出新的 mtime。
- **★ 首屏/可迁移性的判据形态（一律三件套，永不使用裸绝对数）**：① 工具原始读数（**注明口径**）② **Δ（相对 42e88740）** ③ **机理核查**（`pages/**` 新增几个 · npm 包 0 新增 · **新进首屏集合 = []**）。
- **★ 仪器纪律（承批 1/2/3 的 24 类陷阱，本批逐条适用；下面只列本批最常踩的）**
  1. **任何「0 命中」/「不存在」结论必须点名仪器，并先证明该仪器能命中一个已知存在的串、且对无意义串报 0。**
  2. **禁用裸 `includes()` / 子串 grep 判连通性**（批 1 实测 6 例误判：`refine_session` ⊂ `auto_refine_session`）。
  3. **文本扫描型判据必须先剥注释**（`app/src/shell/TopBar.test.tsx:34` 的正解先例）；**中文串一律不经 PowerShell 字符串层**（PS 5.1 按 GBK 误解码 ⇒ 假 0 命中）。
  4. **PowerShell 单行 + 嵌套引号会 `SyntaxError`**（批 3 的 W29）⇒ 本计划里**所有判据都给可粘贴的脚本文件路径**，不写 `node -e "…"` 单行。
  5. **`git archive` 取不到未跟踪文件**，解包树里没有 `.git`（`git grep` 静默 0 命中）⇒ 判「提交自洽」用「`git show --stat` 含本步全部路径 + 工作树在该提交点全绿」。
  6. **`--no-build` 在导出树必失败**（dist 不入库，exit 2）⇒ 导出树内要跑预算守卫必须先在树内 build。
  7. **无头浏览器一律 `--user-data-dir="$env:TEMP\…"`，用完删**（**不许在仓内建 profile**；批 3 累计清了 34 个 / ≈564 MB）。
  8. **`Δ` 恰为 0 时先当仪器故障**（先自证仪器能测出已知差异，再下结论）。
- **★ 提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`（本仓**多 agent 并行**，裸 `git commit` 会扫走别人已暂存的条目）。**新建文件必须两步**：`git add -- <path>` 再 `--only`。**禁止**：`git add -A` · `git add .` · `git stash` · `git checkout --` · `git restore` · `git clean` · `git reset --hard` · `--no-verify` · `git add -f`。Conventional Commits：`<type>(<scope>): <subject>`，**subject ≤50 字**、动词开头、无结尾句号（`commitlint` 沿用 100 上限 ⇒ **抄命令前人工数字符数**）。
- **★ 计划级冲突的处理**：实施中发现**两条已批准要求互相排斥**时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 命令 + 代价）**，一次报控制方裁决；**不要自行取舍，也不要两条都硬做**。本批已预判四处（§待裁决清单），遇到新的照此办理。
- **★ 既有断言的处置（本批唯一的两处授权改写，其余一律 STOP）**
  1. **弹层 `data-testid` 的机械改写**（`Modal` 的 testid 契约是三段式：`testId` · `${testId}-overlay` · `${testId}-close`）⇒ 迁移**必然**改名现有测试锚点（例 `task-launch-backdrop` → `task-launch-overlay`）。**授权**：迁移任务可在**同一次提交**里机械改写受影响测试的 testid 字面量，**前提**＝用例数不减、断言强度不降、每条改写过的断言**各有自己的变异体**；**任何非 testid 的断言改动 ⇒ STOP**。受影响文件清单见 T1 的登记表（**实测 15 个**，不是侦察说的 11 个）。
  2. **`shell/TopBar.test.tsx` 的三条断言**（`:182` `data-testid="ai-toast"` · `:183` `position: "fixed"` · `:184` `top: "calc(var(--ed-nav-h) + 8px)"` · `:185` `zIndex("toast")`，断言对象是 **`App.tsx` 的源码文本**）：T10 把 AI toast 交给 `Toast` 原语后，这四条里的**三条**（`:183/:184/:185`）**必然失效**（它们逐字要求自足形态）。**授权 T10 同提交改写**为**等价或更强**的判据（定位从 `App.tsx` 源码搬到原语层：`Toast.css` 的 fixed + `--ed-nav-h` 锚点、`Toast.tsx` 的 `zIndex("toast")`），并要求**每条各带变异体**；`:182`（testid）**必须保留**（`Toast` 的 `testId="ai-toast"` 仍落在容器上）。**若控制方选 §待裁决 #4 的选项 B，则 T10 整条改写取消**，改为「App.tsx 保留自足 toast」+ 登记与规格 §14 的冲突。
- **★ 报告与临时文件**：报告写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`（**该目录整体 gitignored ⇒ 永不 `git add -f`**）。探针/日志/基线/解包树一律写同目录 `tmp/` 下的**子目录**，**不许放仓库根**。
- **★ 每个任务结束都要跑完八条门禁**，并在报告里给出**逐条命令 + 观测输出 + exit code**；缺一条即视为未完成。

---

## 实测基线（计划者 2026-09-12 在 `dev@42e88740` 实跑；下游一切目标与排序都从此派生）

> **出处**：`HEAD = 42e88740`（`docs(spec): close out shell batch three`）· **工作树** `git status --porcelain` **仅 `?? docs/tech-debt/`** · `app/dist` **mtime 2026-09-12 14:06:11**（入口 `index-Cf249NJv.js` 99,860 B）· 全部读数采集于 **2026-09-12 14:1x–14:3x**。

### 表 1 · 八门禁（逐条命令 + 读数）

| # | 命令 | exit | 读数 |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `✅ >600 硬限 0（棘轮内）· 301–600 档 123 · 登记条目 123` |
| 2 | `node scripts/docs-check.mjs` | 0 | 扫描 **276** 个 Markdown（检查 **176**）· 四项 ✅（相对链接 / `file://` 目标 / 文件名 / 模板）· **一条告警**：`docs\adr\ADR-034-*.md` 未收录于 `docs\adr\README.md` ⇒ **T0 Step 0 清零**（告警不拦 exit 0，但不许留着） |
| 3 | `node scripts/check-command-registry.mjs` | 0 | 定义 **312** / 注册 **312** / 重复 **0** |
| 4 | `cd app; npx tsc --noEmit` | **0** | **0 错** |
| 5 | `cd app; npx vitest run` | **0** | **143 文件 / 1370 用例 / 0 失败**（37.81s）· 与批 3 收口读数**逐字相同** |
| 6 | `cd app/src-tauri; cargo test --test app_lib_tests` | — | 本批**计划者未复跑**（批 3 收口实测 **2300 / 0 / 6**；批 4 零 Rust 改动 ⇒ 判据仍是「逐字持平」，由各任务自跑） |
| 7 | `node scripts/check-bundle-budget.mjs --no-build` | **0** | 首屏 **97.16 kB**（`index` 32.24 + `vendor-react` 60.37 + `vendor-tauri` 4.55；原始 309,524 B / gzip 97,155 B）· 预算 200 kB · **余量 102.85 kB** · 懒 21 个 574.71 kB 不计入 · **CSS 3 个 52.27 kB 原始 / 12.58 kB gzip（不计入判据，只报告）** |
| 8 | `node scripts/bundle-eager-graph.mjs` | **0** | 首屏静态可达源文件 **67** · npm 包 **4**（`@tauri-apps/api` · `@tauri-apps/plugin-dialog` · `react` · `react-dom`）· **口径警告：该工具把 `import type` 也算作静态边**（批 3 实测假阳性 8→11 个） |

> **`cargo` 两条本批必须自立**：第 6 条（`cargo test`）计划者**未复跑**，由各任务自跑并逐字比对（**2300 / 0 / 6**）；clippy 判据 = **位置集合 20**（**禁比 sha256**：行尾/编码差异会假红，批 2 实测 BOM+CRLF vs LF 让 sha256 永远假红而集合逐行相同）。

### 表 2 · 迁移面实测（**本计划的核心数字**）

| 类别 | 处 | 行 | 文件 | 目标原语 | 出处 |
|---|---|---|---|---|---|
| 原生 `<button>` | **510** | 385 | **121** | `Button` | `node tmp/classify.mjs` |
| `const *Btn*` 样式常量 | — | **80** | **55** | `Button` | 同上（**B4 的"吸收"口径**） |
| **`style={xxxBtn}` 消费者** | — | **103** | **37** | `Button` | `node tmp/planner-callsites.mjs` §B（**B4 的真实迁移面**） |
| 自建弹层（同行 `fixed`+`inset:0`） | — | 48→**28** | 28 | `Modal` | `tmp/overlays.mjs` |
| 自建弹层（跨行容忍） | — | — | **34** | `Modal` | 同上（**34 − 20 = 14** 是本批的收口等式） |
| `role="dialog"` 现存 | **6** | 6 | 4 | — | `Modal.tsx`×1 · `CommandPalette.tsx`×1 · 三个原语测试×4 |
| 裸数字 `zIndex: \d+` | **58** | 58 | **43** | z-index 标尺 | `tmp/classify.mjs`（**17 个不同值** = 规格 §11-2 的 17） |
| `zIndex.guard` 冻结名单条目 | **58** | — | — | — | `ui/zIndex.guard.test.ts`（名单 `:56-115`；键 = `相对路径::该行 trim 原文`，**不含行号**） |
| `window.confirm(` | **8** | 8 | **6** | `ConfirmDialog` | `tmp/classify.mjs` |
| 自绘 toast | **4 套** | — | 4 | `Toast` | `App.tsx` · `pages/SessionsPage.tsx` · `hooks/useTransientToast.tsx` · `SessionListPanel.tsx` 消费 |
| 空态词 | — | **44** | **33** | `EmptyState` | `tmp/classify.mjs`（与规格 §5.1 逐字相等） |
| 加载态（既有口径） | — | **88** | **31** | `Loading`/`Skeleton` | 同上（与规格「85 处 / 30 文件」量级一致） |
| 加载态（**可见文案**，真迁移面） | — | **19** | **19** | `Loading` | 计划者探针；侦察口径为 18 |
| 错误行（文案 ∧ setter） | — | **190** | **80** | `StatusLine` | `tmp/classify.mjs` |
| 三红 hex | **179** | — | **100** | `StatusLine` | 同上 |
| 弱化灰 `#9ca3af` | **296** | — | **105** | `Text` | 同上（**§11-3 的"弱化文本"**） |
| `fontSize:\d` | **1273** | — | **144** | `Text` | 同上；**其中 <12px 越界 604 行 / 124 文件** |
| `borderRadius:\d` | **583** | — | **134** | `Surface` | 同上（11 个不同值，越界 6/12/14/999/2/0） |
| `1px solid #e5e7eb` | **180** | — | — | `Surface` | 同上（**§11-3 的"卡片边框"**；计划者探针 258 行 / 111 文件含复合写法） |
| `boxShadow:` | **38** | — | **38** | `Surface`（`--ed-shadow-1/2`） | 同上（**18 个不同值**） |
| **去重后独立位置** | **2805** | — | **173** | — | `tmp/totals.mjs`（扫描域 = `app/src/**` 非测试、非原语、非图标，**264** 个文件） |

### 表 3 · 20 个弹层的构成（**B3 要求逐条钉死；"这 20 个"就是本计划的 20**）

> 来源：`tmp/overlays.mjs` 的分桶（判据 = 文件内含 `position:"fixed"` ∧ `inset:0`，跨行容忍）。**声明**：A14+B4+E2 是**可辩护的构成，不是规格原文**（规格只写「20 弹层」）—— 本计划显式采纳它，并在 T8 用机器判据把这份清单钉进守卫。

| 桶 | # | 文件（计划者实测行数） | 面板宽 | 计划 `ModalSize` | 说明 |
|---|---|---|---|---|---|
| **A 对话框** | 1 | `components/ChatSaveNoteDialog.tsx`（149） | 380 | `s` | testid `chat-note-backdrop/dialog` |
| | 2 | `components/GoalPlanApprovalDialog.tsx`（179） | 560 | `l` | |
| | 3 | `components/GraduateDialog.tsx`（141） | 520 | `m` | |
| | 4 | `components/GroupCreateDialog.tsx`（135） | 340 | `s` | testid 被 `GroupSidebar.test.tsx` 引用 |
| | 5 | `components/GroupDeleteConfirm.tsx`（147） | 380 | `s` | testid 被 `RouteInfoPopover.test.tsx` 引用；**它是自定义确认框，不走 `ConfirmDialog`** |
| | 6 | `components/InterviewDialog.tsx`（282） | 520 | `m` | |
| | 7 | `components/KnowledgeConceptDialog.tsx`（164） | 480 | `m` | |
| | 8 | `components/KnowledgeDecisionForm.tsx`（240） | 520 | `m` | |
| | 9 | `components/KnowledgeModelDialog.tsx`（175） | 520 | `m` | |
| | 10 | `components/ModelCardCreateDialog.tsx`（97） | 380 | `s` | |
| | 11 | `components/ModelCardFromNoteDialog.tsx`（104） | 460 | `m` | 跨行口径新增项 |
| | 12 | `components/NoteAiDialog.tsx`（215） | 460/520 | `m` | 有 `kind==="menu"` 变体 |
| | 13 | `components/RefineLaunchDialog.tsx`（297） | 680 | `l` | |
| | 14 | `components/TaskLaunchDialog.tsx`（148） | 360 | `s` | testid 在 `ui/zIndex.guard.test.ts` 冻结名单里（T4 处理） |
| **B 工作台** | 15 | `components/KnowledgeSystemWizard.tsx`（278） | 560 | `l` | 规格 §5.2「L = 向导/工作台」 |
| | 16 | `components/ProofreadPanel.tsx`（222） | 680 | `l` | |
| | 17 | `components/RefineWorkbench.tsx`（471） | **1200** | **待裁决 #3** | 并排双栏 diff；`l`(720) 会压掉 480 px |
| | 18 | `components/SecondPassPanel.tsx`（303） | 720 | `l` | 与 `l` 逐字同宽 |
| **E 未归类** | 19 | `components/PracticeQuestionsOverlays.tsx`（249） | 560 | `l` | 形态 = 弹层类 |
| | 20 | `components/SopRunOverlay.tsx`（290） | 640 | `l` | 形态 = 弹层类 |
| | | **合计** | | | **20 文件 / 4290 行 / 最大 471** |

> **档位规则（供 T5–T8 逐条复核）**：**向上取档**（`≤380→s` · `≤520→m` · `≤720→l`）—— 宁可宽、不压内容；逐条 Δ 见上表（唯一例外是 #17，需裁决）。
> **不进这 20 的**：`shell/CommandPalette.tsx`（批 3 自足实现，**批 3 点名交给批 4**，T9 做；它今日已有 `role="dialog"`，**不计入 20/20**）。

### 表 4 · 不进 `Modal` 的 14 个浮层（**B1/B2 要求逐条登记，不许从账本消失**）

| 桶 | # | 文件 | 现 z-index | 本批动作 |
|---|---|---|---|---|
| **C 锚定菜单（11）** | 1 | `components/GroupRowContextMenu.tsx` | 60 / 61 | 只落 `zIndex("popover")`(200) |
| | 2 | `components/note-selection/SelectionActionMenu.tsx` | 60 / 61 | 同上；⚠️ **它是全仓唯一 `window` 捕获相 ESC 监听**（`:78`）—— 保留并登记 |
| | 3 | `components/NoteListBatchMenu.tsx` | 40 / 41 | 同上 |
| | 4 | `components/NoteMoveToGroupMenu.tsx` | 30 / 31 | 同上 |
| | 5 | `components/NoteRowContextMenu.tsx` | 60 / 61 | 同上 |
| | 6 | `components/RouteInfoPopover.tsx` | 30 / 31 | 同上 |
| | 7 | `components/SessionRowContextMenu.tsx` | 60 / 61 | 同上 |
| | 8 | `components/NoteEditView.tsx`（高亮气泡，透明层） | 30 / 31 | 同上 |
| | 9 | `components/RichEditorView.tsx`（高亮气泡，透明层） | 30 / 31 | 同上 |
| | 10 | `components/NoteLinkToSystem.tsx`（透明层） | 30 / 31 | 同上 |
| | 11 | `components/BrowserChrome.tsx`（`data-app-menu` 右键菜单） | 1000 | 同上（**侦察的 C 桶没算它，本计划补入**） |
| **D/E 覆盖层（3）** | 12 | `components/CaptureOverlayPanel.tsx` | **未声明**（子操作条 10） | **不迁**；例外登记（B2） |
| | 13 | `components/ScreenSelectOverlay.tsx` | 999（子层 20） | **不迁**；例外登记 |
| | 14 | `components/ImagePreviewOverlay.tsx` | 1000 | **不迁**；例外登记 |

> ⚠️ **口径更正（计划者实测）**：侦察把 `pages/ChatPage.tsx:504` 的发起菜单算进「11 个锚定菜单」；本计划**改用 `BrowserChrome.tsx`** 更准确（`ChatPage` 的发起菜单属于 B7 的拆件面，且它有 `data-app-menu` 同族标记）；两种数法都得到 **11**，**清单差异在 T1 登记表里保留双列**（C 桶 7 + 透明层 4 vs C 桶 7 + 透明层 3 + BrowserChrome）。
> **ESC 残留（ADR-033 §7 点名"批 4 必须一并处理"）**：`SelectionActionMenu.tsx:78` 的 **capture 相** `window` 监听 + 4 处元素级 React `onKeyDown`（`GroupSidebarRow.tsx:109` · `LinkEntityPicker.tsx:88` · `SessionDetailHeader.tsx:106` · `SessionListRow.tsx:188`）—— **B1 裁定这 11 个菜单不迁** ⇒ 这 5 处**继续存在**，本批的动作是**逐条登记 + 给出"何时会被 Modal 的 ESC 栈抢/抢不到"的说明**（T1 的登记表），**不在本批修**（改它们=改菜单退出语义，属批 5/8 的菜单收敛）。
> ⚠️ **口径差（计划者实测 vs ADR-033）**：ADR-033 记的是「`document`/`window` **冒泡相 15 处**」；计划者探针（`tmp/planner-tests.mjs`）在**非原语、非测试**域实测到 **14 个 `addEventListener("keydown")` 入口**（**13 冒泡 + 1 捕获**，另有 7 个入口**不处理 Escape**）。**两个口径的差量来自"是否把元素级/合成事件算进去"** ⇒ T1 的登记表**必须逐条列名并给两个计数**（不许只写一个数把它糊过去）。

### 表 5 · 迁移会改到的测试面（**计划者逐文件实测**）

| 触发原因 | 测试文件 | 数量 |
|---|---|---|
| 断言了**现存弹层 testid**（迁移后按 `Modal` 三段式改名） | `ChatSaveNoteDialog.test.tsx` · `GoalPlanApprovalDialog.test.tsx` · `GraduateDialog.test.tsx` · **`GroupSidebar.test.tsx`** · **`RouteInfoPopover.test.tsx`** · `InterviewDialog.test.tsx` · `KnowledgeDecisionForm.test.tsx` · `KnowledgeDetailPanel.test.tsx` · `ModelCardCreateDialog.test.tsx` · `RefineLaunchDialog.vision.test.tsx` · `TaskLaunchDialog.test.tsx` · **`ui/zIndex.guard.test.ts`** · `KnowledgeSystemWizard.test.tsx` · **`pages/KnowledgePage.test.tsx`** · `ui/primitives/Loading.test.tsx`（**误命中，不改**） | **15**（**侦察的 11 是漏项**：多 `GroupSidebar` / `KnowledgePage` / `RouteInfoPopover` 的实际引用） |
| `window.confirm` 被打桩 | `components/FeedFragmentList.test.tsx:143,155` | **1** |
| 批 3 的 toast 形态断言（**本批授权改写**，见 Global Constraints） | `shell/TopBar.test.tsx`（`:182-185`） · `shell/TopBar.persistent.test.tsx`（**不改**：只判 `dock-toggle`） | **1 改 / 1 不动** |
| 含 `getByTestId` / `data-testid` 字面量（面最广，逐任务自查） | **67 / 142** 个测试文件 | 67 |
| **无测试覆盖的迁移文件** | 121 个含 `<button>` 的文件里 **77 个**无同名测试 · 加载态 31 文件里 **30 个** · 空态 33 文件里 **30 个** · 错误行 80 文件里绝大多数无样式覆盖 | — |

> ⇒ **本批的最大风险不是"测试会红"，而是"改完没人能告诉你哪里坏了"**（Button/Surface/Text/StatusLine 几乎没有断言面）。⇒ 每个任务的 Verification 表**必须自带可失败的判据**，而不是靠"既有测试全绿"背书。

### 表 6 · 原语缺口（B6 的四个已知缺口 + 计划者复核）

| 缺口 | 事实（`文件:行` / 逐字） | 调用点数 | B6 判据 | 本批任务 |
|---|---|---|---|---|
| `Modal` 无 **body 滚动锁** | `Modal.tsx:34` 逐字「⑤ **不做 body 滚动锁**：现状 20 个弹层也没有（属批 4 的观察项，已登记在报告的「未做」）」 | **20**（共用） | **≥3 ⇒ 改原语** + 补行为测试 | **T2** |
| `ConfirmDialogProps` 无 **`tier`** | ADR-033 后果④逐字：「弹层内再弹拿不到 `modalNested`（**登记为批 4 观察项**）」；`ConfirmDialog.tsx:161-168` 调 `Modal` 时**不传 `tier`** | 实测：**0 个弹层内再弹的 `ConfirmDialog` 消费者**（8 处迁移全在页面/面板顶层） | **<3 ⇒ 改调用点**？—— 但"改调用点"在这里**不可表达**（消费者拿不到 `modalNested`），且它是 ADR-033 已登记的观察项 ⇒ **按原语缺口的特殊条款办**：加 `tier?: ModalTier`（**透传，不新增档位、不触发全枚举守卫**），并在 ADR-033 回写结清 | **T2** |
| `Toast` 无**位置槽**（`top/right` 写死） | `Toast.css` 的定位是固定的；`App.tsx:509` 的 `top: "calc(var(--ed-nav-h) + 8px)"` 在原语里**没有对应 prop** | **1**（`App.tsx`） | **<3 ⇒ 改调用点**，但唯一可行的"改调用点"是**行内 style 覆盖类语义 —— ADR-033 §4 逐字禁止** ⇒ **B6 特殊条款**：允许改原语，**只许加一个具名、有文档的 prop** | **T3** |
| `EmptyStateProps` 无 `className`/`style` | `EmptyState.tsx:35-36` 逐字「**契约就是 `EmptyStateProps` 这 7 个字段**……**不加** `className` / `style`」；44 处现存空态普遍带内联 `padding/textAlign/fontSize` | **44** | **≥3 ⇒ 改原语**，但**只许开一个受控的排版档位/布局槽**，**不许放开裸 `className`** | **T3** |

### 表 7 · 规格漂移（计划期实测，逐条在 T18 就地回写；**原文一律保留 + 加注**）

| # | 规格原文（`文件:行`） | 实测 | 处置 |
|---|---|---|---|
| **S1** | §5.1「`Button` \| **107 处 / 63 文件**」 | 该口径**不可考**：`btnStyle` 标识符全仓 **0 命中**；等价物 = `const *Btn*` 常量族 **80 行 / 55 文件**；真实 `<button>` 规模 **510 处 / 121 文件** | **B4 已改判**：计划显式写「口径变化 + 余量去向」，**不把 107/63 悄悄改成 80/55**（T1/T12/T18） |
| **S2** | §5.1「`Surface` \| 180 处 / 91 文件」·「`Text` \| 251 处 / 98 文件」 | `1px solid #e5e7eb` = **180 处** ✅（同一数字）；`#9ca3af` = **296 处 / 105 文件**（与 251/98 同量级、不同口径） | T17/T16 按实测口径推进；T18 回写「两处口径各自的判据」 |
| **S3** | §11-2「手写弹层 **20** → 全走 `Modal`」 vs §5.2「**28** 个手写弹层迁移后同样不得保留自己的遮罩」 | **20 / 28 / 34 三个数并存**（20 = 对话框 + 工作台；28 = 同行口径文件数；34 = 跨行口径） | **B3 已裁定**：验收按 **20**；28 并列登记；两口径对账归**批 8**。本计划 §表 3/表 4 给全 34 的归属 |
| **S4** | §5.1「`ConfirmDialog` \| **21 处** → 1」 | 实测 `window.confirm` **8 处 / 6 文件**；裸 `confirm(` 16 处 / 13 文件（混着 `@tauri-apps/plugin-dialog` 与同名非确认语义） | T11 只迁 **8 处**（可判定的命令式确认），其余登记；T18 回写 |
| **S5** | §5.1「`Loading` \| **85 处 / 30 文件**」 | 既有口径 **88 行 / 31 文件**；**可见文案 19 行 / 19 文件**（真迁移面） | T14 按可见文案口径迁移；T18 回写 |
| **S6** | §5.4 拆件表只列 4 个文件 | 本批只需拆 **`ChatPage.tsx`**（B7；599/600）与**可能**的 `NotesPage.tsx`（300/300） | T13-b / T18 回写 |
| **S7** | §12「3 套 markdown 渲染器归一 \| **可并入批 4**」 | **B8 已裁定不并入** | T18 回写（去向 = 批 5/7） |
| **S8** | §14「ADR-034/035 **顺延至批 3 / 批 6**」 | ADR-034 批 3 未写；控制方 14:20 裁定「**批 4 一开工就先补写**」 | **本计划的提交里已包含 `docs/adr/ADR-034-*.md`**（见 Task 0） |

---

## 待裁决清单（**控制方待裁决 —— 逐条在对应任务开工前裁决；未裁决的任务不受阻**）

> 每条给**两（或三）条走法 + 代价读数**。计划者**不自行拍板**（批 1–3 已多次证明"计划自己拍板的范围决策会被现实证伪"）。

| # | 事项 | 分歧点与实测 | 影响 | 建议（**仅供参考，不代替裁决**） |
|---|---|---|---|---|
| **R1** | **ADR-034 的归属**（§14 逐字 + 控制方 14:20 裁决原文） | §14 逐字：「**建议归属：批 4 开工前补写 ADR-034（壳层：导航注册表 / 列契约 / 断点 / 窗口尺寸 / 溢出两级），或并入批 8 的治理收口**；**由控制方裁决**，本行只登记不擅自补。」控制方 14:20 已裁决：「**不在批 3 补、也不并到批 8：批 4 一开工就先补写 `ADR-034`**」 | 本计划的提交是否携带 `docs/adr/ADR-034-*.md`；Task 0 的产物归属 | **走控制方 14:20 的裁决（选项 a）**：已直接起草 `docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md` 并随本计划提交；Task 0 只做**逐条对码**（ADR 的每条断言 → 落点守卫）。**若改判 (b)** ⇒ 代价：批 4 的迁移在**无 durable 契约**下开工（T4/T9/T10 的判据失去可引的规范载体），且 ADR-034 的起草内容要整体挪到批 8 重做一遍对码 |
| **R2** | **五类重复的「批 4 中间判据」** | **规格没给**：§10 批 4 行的验收列只有两条（`z-index ≤6`、`role="dialog"` 20/20）；§11-3「五类重复 → 各自 1 个原语」是**跨批次终局口径**。实测规模：空态 44/33 文件 · 加载 88/31 · 错误行 190/80 · 弱化文本 296/105 · 卡片边框 180/91；**127 / 148 个文件跨 ≥2 类**（如 `GoalDetail.tsx` 与 `AsrConfusionPanel.tsx` **同时是 6 类成员**） | **决定 T13–T17 的边界与验收**（本批是"全量清零"还是"切片 + 棘轮"），并直接决定批 4 的可验收性 | **(B) 切片 + 棘轮（推荐）**，理由与 B4（510 按钮）**同源**：全量约为 **330 文件次**改动、**无测试面**、且在 127 个多类文件上互相冲突 ⇒ **单批不可验收**。切片判据 = **① 本批其它任务已触碰的文件 ∪ ② `pages/**` 全部 ∪ ③ 该类中有同名测试文件的文件**（**机器可算**，实施者在开工时用 T1 的脚本产出清单）；每类新造一条棘轮冻结余量并登记去向（批 5/7）。**选项 (A) 全量**：代价 = 批 4 从"20 弹层 + 11 类收敛"膨胀为"≈330 文件"，**与 B7（ChatPage 必须拆件）和 B9（动效随迁上线）叠加后无法逐条变异验证**；收益 = §11-3 一次到位。**注意**：选 (B) 时 §11-3 的"各自 1 个原语"在批 4 结束时**不成立**，须由控制方在规格里写明中间态（否则批 8 的 11 条验收会引用一句已经变形的话） |
| **R3** | **B 桶 `RefineWorkbench.tsx` 迁不迁 `Modal`** | 它是 20 的成员（B3 的 A14+B4+E2 构成），但面板宽 **1200 px 并排双栏**，而 `Modal.css` 的 `--l` = **720 px**（`width: 720px` 硬值）。其余三个工作台都 ≤720（560 / 680 / 720）⇒ **只有它一个越界** | T7 能否收口；`role="dialog"` 20/20 的构成是否成立 | **(a) 迁入 `l`（推荐）**：符合 B3 的 20 构成 + 规格 §5.2 逐字「L 720（**向导/工作台**）」；代价 = 并排双栏被压 480 px，其"并排"模式实际退化为"差异"单栏（该组件已有单栏切换）；须在报告里登记这条**可见观感变化**（§10 逐字「观感从批 4 开始变」）。**(b) 不迁**：把 20 的构成改为 A14 + B3 + E2 + **1 个替补** —— 但**没有合格替补**（`ImagePreviewOverlay` 已被 B2 登记为"不迁的覆盖层"）⇒ **必须同时改判 B2 或 B3**，代价 = 推翻一条已裁决的硬输入 + 20/20 失去分子。**(c) 给 `Modal` 加一个具名宽度槽**：违反 **B6 的 ≥3 阈值**（只有 1 个消费者），且会打开 0-D 的设计冻结面 + 触发 `style-contract` 全枚举更新 ⇒ **需控制方显式豁免**。**兜底**：若 T7 实测 720 下双栏内容结构性不可读 ⇒ STOP 并带上 (b)/(c) 的代价读数 |
| **R4** | **`shell/TopBar.test.tsx` 三条断言的授权改写** | 批 3 T7 的 A3 守卫用 **`App.tsx` 源码文本**断言 toast 的自足形态（`:183` `position: "fixed"` · `:184` `top: "calc(var(--ed-nav-h) + 8px)"` · `:185` `zIndex("toast")`）；而批 3 自己的 §4.2 登记逐字写着「**批 4 迁移原语时整条交给 `Toast`**」⇒ **迁移必然让这三条失效** | T10 能否收口；"既有断言不许改"这条纪律是否被破坏 | **(A) 授权机械改写（推荐）**：把三条断言从"App.tsx 源码文本"搬到**原语层**（`Toast.css` 的 fixed 定位 + `--ed-nav-h` 锚点类；`Toast.tsx` 的 `zIndex("toast")`）——**等价或更强**（新判据同时覆盖所有 `Toast` 消费者），且**每条各带变异体**；`data-testid="ai-toast"` 那条**保留**。**:182 与 `TopBar.persistent.test.tsx` 不动**。**(B) 不改 guard** ⇒ 按 Global Constraints 的授权条款取消整条改写，代价 = `App.tsx` 保留自足 toast，**与批次 §4.2 的登记正面冲突**，且 `Toast` 原语的第一个真实消费者缺席（B5 的 barrel 收益与 reduced-motion 覆盖也拿不到） |

---

## 任务总表与派发顺序

> **依赖列 = 必须"已提交"而不是"工作树已改"**（批 3 的 DISPATCH-TEMPLATE §三）。**并行列 = 同一时刻可否有第二个实施者动它**。

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） |
|---|---|---|---|---|
| **0** | **ADR-034 逐条对码 + 两选项登记**（只产读数，不改生产代码） | — | ✅ 与 T1 | 0（产出 `tmp/t0/adr-034-coverage.md`） |
| **1** | **批 4 基线冻结 + 原生按钮棘轮（B4）** + 登记表（20 / 14 / 15 / 5 残留） | — | ✅ 与 T0 | 新建 `ui/primitives/nativeButtonBaseline.ts` + `nativeButton.ratchet.test.ts` |
| **2** | 原语缺口 A：`Modal` body 滚动锁 + `ConfirmDialog.tier` | T1 | ✅ 与 T3 | **`ui/primitives/Modal.tsx`** · `ConfirmDialog.tsx` · 两个新测试 · `docs/adr/ADR-033`（回写） |
| **3** | 原语缺口 B：`Toast` 位置槽（具名 prop）+ `EmptyState` 对齐槽 | T1 | ✅ 与 T2 | **`ui/primitives/Toast.{tsx,css}`** · **`EmptyState.{tsx,css}`** · **`ui/primitives/index.ts`** · `style-contract.test.ts` · `docs/adr/ADR-033` |
| **4** | **z-index 六档整段迁移**（58 处 / 43 文件 / 17 值）+ 冻结名单收口 | T2 · T3 | ❌ **串行**（独占 **`ui/zIndex.guard.test.ts`**） | 41 个文件（**不含 `ChatPage.tsx`**，见 T13-b）· `ui/zIndex.guard.test.ts` |
| **5** | 20 弹层 · **A 组 1**（7 文件） | T4 | ✅ 与 T6/T7 的文件集不相交 | 7 个弹层 + 5 个测试 + 新建 `dialogMigration.a1.test.ts` |
| **6** | 20 弹层 · **A 组 2**（7 文件） | T4 | ✅ 与 T5/T7 | 7 个弹层 + 4 个测试 + 新建 `dialogMigration.a2.test.ts` |
| **7** | 20 弹层 · **B 组工作台**（4 文件，含 R3） | T4 · **R3 裁决** | ✅ 与 T5/T6 | 4 个弹层 + 2 个测试 + 新建 `dialogMigration.b.test.ts` |
| **8** | 20 弹层 · **E 组**（2 文件）+ **20 清单机器判据** | T5 · T6 · T7 | ❌ 最后（判据覆盖全部 20） | 2 个弹层 + 新建 `dialogMigration.e.test.ts`（20 清单） |
| **9** | 壳层遗留：`CommandPalette`→`Modal`（+IME）· `ShellFallback`→`Loading`/`StatusLine` | T2 · T4 | ✅ 与 T5–T8 | `shell/CommandPalette.{tsx,css,test.tsx,kb.test.tsx,followups.test.tsx}` · `shell/ShellFallback.{tsx,test.tsx}` |
| **10** | **`Toast` 四套 → 1**（含 R4 的授权改写） | T3 · T4 | ❌ **独占 `App.tsx`** | **`App.tsx`** · `pages/SessionsPage.tsx` · `hooks/useTransientToast.tsx` · `components/SessionListPanel.tsx` · **`shell/TopBar.test.tsx`** |
| **11** | **`ConfirmDialog` 8 处 → 1**（6 文件，含 `impacts` 清单） | T2 · T3 | ✅ 与 T10/T12 | `AiProviderSettings.tsx` · `BackupPanel.tsx` · `FeedFragmentList.tsx` · `GoalDetail.tsx` · `NotePreviewView.tsx` · `VersionPanel.tsx` + 1 测试 |
| **12** | **`Button`：`*Btn*` 常量族迁移**（103 行 / 37 文件）+ 棘轮读数 | T1 · T5–T8 | ❌ 与 T13–T17 争同一批文件 | 37 个文件（**含 4 个弹层，须在 T5–T8 之后**） |
| **13** | **`EmptyState` 切片迁移 + 棘轮**（含 `ChatPage` 拆件 `13-b`） | T3 · T4 · **R2 裁决** | ✅ 与 T14/T15（切片文件集不相交时） | 切片文件集 + 新建 `emptyStateRatchet.test.ts`；**13-b**：新建 `ChatLaunchMenu.tsx` + 测试，**`ChatPage.tsx`** |
| **14** | **`Loading`/`Skeleton` 切片迁移 + 棘轮** | T4 · **R2** | ✅ 与 T13/T15 | 切片文件集 + 新建 `loadingRatchet.test.ts` |
| **15** | **`StatusLine` 切片迁移 + 棘轮**（含错误行的**位置**观察项） | T4 · **R2** | ✅ 与 T13/T14 | 切片文件集 + 新建 `statusLineRatchet.test.ts` |
| **16** | **`Text` 弱化文本切片 + 字号棘轮**（604 越界只冻结） | T4 · **R2** | ✅ 与 T15/T17 | 切片文件集 + 新建 `textRatchet.test.ts` |
| **17** | **`Surface` 卡片边框/圆角切片 + 棘轮** | T4 · **R2** | ✅ 与 T16 | 切片文件集 + 新建 `surfaceRatchet.test.ts` |
| **18** | **验收测量 + 收口**（20/20 + z-index + 八门禁 + 规格回写 + 台账 + follow-ups） | 全部 | ❌ 最后 | 规格 · `docs/versions/v0.22.md` · 豁免表（如需）· 本计划文件 · `docs/adr/ADR-033` |

> **🔴 热点文件的单写者约束**
> | 文件 | 唯一写者 | 窗口 |
> |---|---|---|
> | **`ui/zIndex.guard.test.ts`** | **T4** | T4 提交后冻结；T5–T8 **不许**出现在任何提交路径里 |
> | **`App.tsx`** | **T10** | T4 不碰（无裸数字）· T13-b **不许**碰 · 其余任务零改动 |
> | **`pages/ChatPage.tsx`** | **T13-b** | T4 把它排除在外（2 条裸 z-index 随拆件迁移） |
> | **`pages/NotesPage.tsx`**（300/300） | 需要时**先拆** | 任何任务在开工检查里发现要动它 ⇒ **STOP**，先立拆件提交 |
> | **`ui/primitives/index.ts`** | **T3** | T2 不得改它（`ModalTier` 已导出） |
> | **`ui/primitives/style-contract.test.ts`** | **T3** | 只有新增联合值时改 |
> | `ui/primitives/style-seams.test.ts` · `motion-coverage.test.ts` | T3（若新增类） | 迁移任务**不该**触发它们（迁移不新增原语类） |
> | 其余文件 | 见每个任务的 Files | 多任务共享的文件（如 `GoalDetail.tsx` 属 T11 与 T16）**必须串行**，且后开工者先跑一次占用检查 |
>
> **可安全并行**：T0 ∥ T1 · T2 ∥ T3 · T5 ∥ T6 ∥ T7（文件集不相交）· T16 ∥ T17（切片不相交时）。
> **必须串行**：T4 → {T5,T6,T7} → T8 · T4 → T9/T10/T11 · {T5–T8} → T12 · T18 最后。

### 每个改造任务的统一作业模式（Task 2–17 共用，逐条照做）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与八条门禁，把读数写进报告的「开工读数组」；**先看 `git status --porcelain`，不是自己的路径一律不碰**（批 3 两起并行事故的教训）。
2. **文件占用检查**：本轮是**多单元共用一棵工作树**；开工前把自己要改的路径与 `tmp/` 里的在飞声明比对，冲突 ⇒ 只读轮询 90s × ≤5，窗口不关 ⇒ 报控制方。
3. **一次只切一处**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
4. **验收判据是「既有测试逐条原样通过」+「新增用例只增不减」**；**唯一允许的既有断言改动**是 Global Constraints 授权的两类（弹层 testid 机械改写 · `TopBar.test.tsx` 三条），**其余任何既有断言改动 ⇒ STOP 并报控制方**。
5. **每条新判据自带变异体**（在导出副本里做，带 CONTROL，禁 `--reporter=basic`）；**变异体必须证明「这条判据自己能红」**，不许用一个 CONTROL 代表全部。
6. **报告必含**：① 逐条命令 + 观测输出 + exit code 的八门禁；② **B9 的显式声明**——逐字写出「**只有接缝、没有纲领**：三档强度 / 双基调 / GSAP 在批 6」；③ **诚实单列「你没能验证的地方」**（逐条写清是"仪器不可达"还是"本批未做"）；④ 首屏读数必须带 **dist 的 mtime + 对应提交**。
7. **提交**：`git diff --stat` 复核只含自己的文件 → 新建文件先 `git add -- <path>` → `git commit --only -m "<msg>" -- <显式路径…>`（subject 人工数到 ≤50）。
8. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 复现命令 + 代价）**，一次报控制方裁决。

---

### Task 0: ADR-034 逐条对码与冻结（只产读数；不写生产代码）

> **为什么第一个做**：`docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md` 是**本批随计划一起入库**的（待裁决 R1 已按控制方 2026-09-12 14:20 的裁决走 (a)）。它是**事后追记**的 ADR —— 它的权威性来自「与代码逐条对码」，而不是「事前批准」。**本任务就是把这件事做出来并留下证据**：ADR 的每一条决策 / 每一条「合规性验证」表项，都要在 `dev@42e88740` 的树上被点到具体文件与具体断言；**对不上的，逐条列出并 STOP 报控制方**（不许就地改 ADR 的文字去迁就现状 —— 那是把规范降级成描述）。

**Files:**
- Modify: `docs/adr/README.md`（**索引补一行** —— 计划者实测：`docs-check` 已就 ADR-034 未收录给出告警，**原文**「⚠️ 1 个文件未收录于本目录索引: docs\adr\ADR-034-l2-shell-navigation-and-column-contract.md」；**该告警不拦 exit 0，但必须清零**）
- 产出：`.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/t0/adr-034-coverage.md`（**不入库**）
- **除此之外不修改任何仓库文件**

**Interfaces:**
- Consumes：`docs/adr/ADR-034-*.md`（本批入库）+ `app/src/shell/*`（`navRegistry` / `columnRegistry` / `breakpoints` / `windowSize` / `TopBar` / `navHeight.consumption.test.ts` / `columnConsumption.test.ts` / `TopBar.test.tsx` / `TopBar.persistent.test.tsx` / `windowSize.test.ts` / `breakpoints.test.ts`）+ `app/src/ui/zIndex.guard.test.ts` + `app/src-tauri/tauri.conf.json`
- Produces：对码表（**给 T4/T9/T10 引用的规范锚**）+ 两选项的登记（R1）

- [ ] **Step 0: 把 ADR-034 收进索引（**唯一允许的仓内写操作**）**

在 `docs/adr/README.md` 的表末按既有格式追加一行（四列：ID · 链接 · 状态 · 日期）：

```markdown
| ADR-034 | [L2 壳层契约（导航注册表 · 列契约 · 断点 · 窗口尺寸 · 溢出两级）](./ADR-034-l2-shell-navigation-and-column-contract.md) | 已接受（批 4 开工前补写；决策本体为批 3 的 A1–A7） | 2026-09-12 |
```
```powershell
node scripts/docs-check.mjs      # 期望：告警清零（0 个文件未收录）
git commit --only -m "docs(adr): index adr-034 shell contract" -- docs/adr/README.md
```
> subject `docs(adr): index adr-034 shell contract` = **40** ✅

- [ ] **Step 1: 逐条对码（ADR 的 7 条决策 + 合规性验证表）**

写一个 Node 脚本（**放 `tmp/t0/`，不进仓**，口径：**剥注释**后判；**每一条断言都要能红**），对每条声明给「命中位置」或「MISS」：

| ADR 声明 | 期望的机器证据 |
|---|---|
| 8 个域 Tab + 齿轮（不是 9 Tab） | `navRegistry.ts` 的键集大小 = 8 + 一个 `settings` 目的地；`TopBar.tsx` 不出现第 9 个域 |
| `App.tsx` 不直连页面模块 | `App.tsx` 源码里 `pages/` 的 import 数 = **0** |
| `columnRegistry` 13 行规格 | `columnRegistry.ts` 的 `COLUMN_SPECS` 条目数 = **13** |
| `ColumnSpec` 7 字段 | `columnRegistry.ts` 的接口字段数 = **7**（含 `page`） |
| 键名 == 旧持久化键 | 7 个键逐字比对（与 `git show 742b892d:app/src/hooks/useColumnLayout.ts` 的键构造对拍） |
| 断点 6 个键 | `BREAKPOINTS` 键数 = **6**，且 `navFull=1180` / `navActionsFull=1400` 逐字 |
| 窗口 4 键 | `tauri.conf.json` 的 `width/height/minWidth/minHeight` = `1280/800/1024/640` |
| `--nav-h` 单一真源 | `gen-tokens.mjs` 里有 `navHeight`，且 `App.tsx` / 8 页 / dock 的旧 `56` = **0** |
| 六档标尺 | `ui/zIndex.ts` 的 `Z_TIER` 键数 = 6、值逐字 |
| 守卫文件存在且非空 | 上列 8 个 `*.test.*` 文件全部存在（**当场 `Get-ChildItem` 列目录，不靠"我记得"**） |

- [ ] **Step 2: 逐条给出「能红」的证据**

对 Step 1 表中**至少 4 条**做**变异体实验**（**在 `$env:TEMP` 的 `git archive` 导出副本里做**，junction 借 `node_modules`；**删树前先摘点**；**禁 `--reporter=basic`**；**每次带 CONTROL**）：
① `columnRegistry.ts` 删 1 行规格 ⇒ 条目数判据红；② `breakpoints.ts` 把 `navActionsFull` 改 1399 ⇒ 逐字判据红；③ `tauri.conf.json` 删 `minWidth` ⇒ 窗口四键判据红；④ `zIndex.ts` 值改一个 ⇒ 六档判据红。
**报告里逐条给：变异内容 / 期望红 / 实际读数 / CONTROL 是否绿 / 还原后 sha256 是否一致。**

- [ ] **Step 3: 对不上的逐条登记（这是本任务的**主要产出**）**

任何一条 MISS 或与 ADR 文字不符，**不许改 ADR 文字**，按下表登记并 **STOP 报控制方**：

```markdown
| # | ADR 声明（逐字） | 实测 | 判定 | 建议处置 |
|---|---|---|---|---|
| 1 | … | … | MISS / 相符 | 改 ADR 措辞（需控制方批准）/ 改代码（另立任务） |
```

- [ ] **Step 4: 登记 R1 的两选项**

报告末尾**逐字引用**规格 §14 那句与控制方 14:20 的裁决，并给出两选项与代价（见 §待裁决清单 R1），写明**本计划已按 (a) 执行**（ADR 已入库），**若控制方改判 (b)** 则 Task 0 的产物整体挪到批 8、且 T4/T9/T10 的规范锚要换成 §6.1/§6.2 原文。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V0 | `node scripts/docs-check.mjs` | exit 0 且 **「未收录于本目录索引」的告警清零**（Step 0 的提交之后；提交前该告警在，**作为"改前"读数贴进报告**） |
| V1 | `Test-Path docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md` | `True`（**当场列目录复核**，不用"我记得"） |
| V2 | `node tmp/t0/adr-034-coverage.mjs` | 全部条目输出 `OK` 或 `MISS`，**无 `SKIP`**；**且脚本自带阳性对照**（喂一条已知存在的声明必须 `OK`）+ **阴性对照**（喂无意义串必须 `MISS`） |
| V3 | 变异体 4 例（Step 2） | **4/4 红**，CONTROL 绿，还原后 sha256 逐字一致 |
| V4 | `git status --porcelain` | 与开工时**逐字相同**（Step 0 提交后仍应如此；若出现任何 ` M` 或 `??` 新增 ⇒ 自证失败） |
| V5 | `git show --stat HEAD~1`（或 Step 0 的提交 sha） | **只含 `docs/adr/README.md` 一个路径**（Step 0 是纯文档提交） |
| V6 | 报告含「对码表 + MISS 清单 + R1 两选项 + 未能验证项」 | 四项齐全 |

---

### Task 1: 批 4 基线冻结 + 原生按钮棘轮（B4）+ 四张登记表

> **为什么先做**：① **B4 明令新造「原生按钮棘轮」**（"否则永远迁不完"），而棘轮必须在**任何迁移之前**冻结基线，否则第一次迁移后基线就被污染；② 本批要**逐条登记**四张表（20 个弹层 / 14 个不迁浮层 / 15 个受影响测试 / 5 处 ESC 残留）——它们是 B1/B2/B3 的「不许从账本消失」的兑现；③ 后续每个任务的「前后对比」都用同一把尺子。
> **本任务不改任何生产代码**：只新增两个文件（一个数据模块 + 一个棘轮测试）。

**Files:**
- Create: `app/src/ui/primitives/nativeButtonBaseline.ts`（**≤160 行**：基线数据 + 冻结理由的 `@ai-context`）
- Create: `app/src/ui/primitives/nativeButton.ratchet.test.ts`（**≤200 行**）
- 产出（不入库）：`tmp/t1/baseline.md`（四张表 + 八门禁读数 + **真实构建的首屏读数**）

**Interfaces:**
- Consumes：`tmp/classify.mjs` / `tmp/planner-callsites.mjs` / `tmp/planner-tests.mjs`（读它们的输出，**不重写扫描逻辑**）
- Produces：`FROZEN_NATIVE_BUTTON_BY_FILE: Readonly<Record<string, number>>` + `FROZEN_NATIVE_BUTTON_TOTAL = 510` + `SPLIT_MOVES: readonly string[]`（默认空）；T12 消费它报余量，T13-b 的拆件提交消费 `SPLIT_MOVES`

- [ ] **Step 1: 先跑一遍「全员读数」，把原始输出落盘**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
New-Item -ItemType Directory -Force ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1" | Out-Null
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/classify.mjs        *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\classify.txt"
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/overlays.mjs        *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\overlays.txt"
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/totals.mjs          *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\totals.txt"
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/planner-callsites.mjs *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\callsites.txt"
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/planner-tests.mjs   *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\tests.txt"
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/planner-widths.mjs  *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\widths.txt"
```
> ⚠️ **`*>` 是 PS 5.1 的正确重定向写法**（`>` 写 UTF-16LE 会让 Node `JSON.parse` 失败）；若 `*>` 报错就用 `cmd /c "… > f"`。

- [ ] **Step 2: 写 `nativeButtonBaseline.ts`（数据 + 为什么这样冻结）**

```ts
/**
 * @ai-context 原生 `<button>` 的**冻结基线**（批 4 B4 裁决的落点）。
 *
 * Why 冻结在"文件 → 计数"粒度，而不是 zIndex.guard 那样的"逐行原文"粒度：
 *   ① 逐行冻结会得到 **385 条**条目 ⇒ 一个数据文件 >300 行，**直接违反本仓的行数红线**；
 *   ② 本批有**拆件**任务（B7：`ChatPage.tsx` 599/600 必须先拆）—— 逐行 key 会因为
 *      "同一行搬到了新文件"而从"命中"变成"新增"，产生**假红**；
 *   ③ 棘轮要防的是"永远迁不完"，而"永远迁不完"的正解是**总量与逐文件只减不增**，
 *      这两条在计数粒度上是**完整**的（逐文件防局部回潮、总量防全局回潮）。
 *
 * 副作用：无（纯数据，被 `nativeButton.ratchet.test.ts` 读）。
 * 边界：**基线只许被"拆件搬运"修改**（见 `SPLIT_MOVES`）——把计数从一个键挪到另一个键、
 *   总量逐字不变；**任何其它改动都是回潮**，判据会红。
 */
export const FROZEN_NATIVE_BUTTON_TOTAL = 510;

/** 相对 `app/src` 的路径 → 基线计数（批 4 开工实测：510 处 / 121 文件） */
export const FROZEN_NATIVE_BUTTON_BY_FILE: Readonly<Record<string, number>> = {
  // …由 Step 3 的脚本生成后粘贴（脚本输出即权威值，不许手抄）
};

/** 允许"搬运计数"的文件（拆件产物）：形如 "新文件|源文件"，两侧计数之和必须不变 */
export const SPLIT_MOVES: readonly string[] = [];
```

- [ ] **Step 3: 生成基线映射（脚本产出，不许手抄）**

写 `tmp/t1/gen-native-button-baseline.mjs`（**不入库**）：用与 `classify.mjs` **同一套剥注释逻辑**计数（整段扫描 + 偏移算行号，**不是逐行 `[\s>]`** —— 逐行会把 510 读成 385，recon §0.2 缺陷 1），输出可直接粘进 `nativeButtonBaseline.ts` 的对象字面量（键按字典序）。
**自检（必须打印）**：`total=510` · `files=121` · 阳性对照（`components/ImageGallery.tsx` 必 >0）· 阴性对照（`ui/primitives/Button.tsx` 必须 **0**，它是原语自身）。

- [ ] **Step 4: 写棘轮测试（4 条判据，每条都要能红）**

```ts
// @vitest-environment node
/**
 * @ai-context 原生按钮棘轮（批 4 B4）：**只许减少，不许新增**。
 * 判据四条：① 总量 ≤ 基线 ② 逐文件计数 ≤ 基线 ③ 基线里没有"文件不存在"的僵尸键
 *          ④ 拆件搬运守恒（SPLIT_MOVES 的两侧计数之和 == 基线的两个键之和）
 * 扫描口径与 classify.mjs 一致：**先剥注释**（块注释 + 整行 `//`；行尾 `//` 与字符串字面量不剥
 * —— T10-M-1 的已知边界，本棘轮据此**只判计数不判原文**，故该边界不影响结论）。
 */
```
> **三条硬要求**：① **判据必须能红**（Step 5 逐条变异）；② **注释里的 `<button` 不算命中**（剥注释后判 —— 仓内已有多次注释误伤）；③ **不许用 `eval` / `new Function`**（若为了避开 TS7053，用 `s.charAt(i)`）。

- [ ] **Step 5: 变异体（每条判据各一，导出副本里做，带 CONTROL）**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 在 `components/ImageGallery.tsx` 里**新增**一个 `<button>` ⇒ | ② 红（该文件超基线）+ ① 红（总量 511 > 510） |
| M2 | 把某文件的一个 `<button>` 改成 `<Button>` ⇒ | **全绿**（棘轮允许减少）—— 这是**反例守卫**：证明它不是"永远红"的假判据 |
| M3 | 注释里写一行 `// <button style={x}>` ⇒ | **全绿**（剥注释生效）—— 若红 ⇒ 剥注释器坏了 |
| M4 | 把 `baseline` 里一个文件的计数手动 -1 ⇒ | ③/④ 不红但 ① 不触发；**期望**：该文件仍 ≤ 基线 ⇒ 绿（说明基线上调不会误伤）；真正的监管在 M1 |
| M5 | 拆件：从 A 搬 3 个 `<button>` 到新文件 B **且不登记 `SPLIT_MOVES`** ⇒ | ①不红（总量不变）②红（B 不在基线） ⇒ **证明拆件必须登记** |

- [ ] **Step 6: 四张登记表（本任务的另一半产出）**

`tmp/t1/baseline.md` 里逐条写出：

1. **20 个弹层**（本计划 §表 3 的 20 行：`文件:行` + 面板宽 + 计划 `ModalSize`）；
2. **14 个不迁浮层**（本计划 §表 4 的 14 行：`文件` + 现 z-index + 理由 + **两种数法并列**：C 桶 7 + 透明层 4 vs C 桶 7 + 透明层 3 + `BrowserChrome`）；
3. **受影响测试 15 个**（本计划 §表 5；逐个给「它钉的是哪个 testid」+「迁移后新 testid」的映射草表）；
4. **5 处 ESC 残留**（`SelectionActionMenu.tsx:78` capture + 4 处元素级 `onKeyDown`）+ **全仓 keydown 台账**（本计划实测：**15 个冒泡相 ESC 文件 + 1 个捕获相 + 3 个非 ESC**；与 ADR-033 记的「15 处冒泡」并列，**口径差写在表里**）。

- [ ] **Step 7: 首屏真实构建（本批的"开工第一读数"）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/check-bundle-budget.mjs                                        # 真实构建
node scripts/bundle-eager-graph.mjs                                          # 工具口径
node scripts/bundle-eager-graph.mjs --json > ".superpowers\...\tmp\t1\eager.json"
```
**报告必须写**：新的 `app/dist` mtime + 入口 chunk 名 + 首屏 gzip + 余量 + CSS 读数（**CSS 不进判据，只报告**）。这是 T18 做 Δ 的锚点。

- [ ] **Step 8: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd "D:\Program own\aicode\work space\Entropydecrease"
git add -- app/src/ui/primitives/nativeButtonBaseline.ts app/src/ui/primitives/nativeButton.ratchet.test.ts
git commit --only -m "test(primitives): freeze native button ratchet" -- app/src/ui/primitives/nativeButtonBaseline.ts app/src/ui/primitives/nativeButton.ratchet.test.ts
```
> subject `test(primitives): freeze native button ratchet` = **44** ✅

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/nativeButton.ratchet.test.ts` | 4 用例全绿 |
| V2 | 同上 + **M1 变异体**（导出副本） | **红且点名到文件**；CONTROL（未变异）绿 |
| V3 | `node tmp/t1/gen-native-button-baseline.mjs` | `total=510` · `files=121` · 阳性对照命中 · `ui/primitives/Button.tsx` = 0 |
| V4 | `node -e "…读 nativeButtonBaseline.ts 的键数…"`（**写成脚本**） | 键数 **121**、`FROZEN_NATIVE_BUTTON_TOTAL === 510`、`SPLIT_MOVES.length === 0` |
| V5 | `node scripts/check-bundle-budget.mjs` | exit 0；**报告里贴新 dist 的 mtime + 入口 chunk**（本批的 Δ 锚） |
| V6 | 八门禁 | 逐条 exit 0；`vitest` 文件数 **144**（+1）/ 用例 **+4**；**既有 1370 逐文件不减**（对拍 `tmp/vitest-baseline-perfile.txt`） |
| V7 | `git status --porcelain` | 只含本任务 2 个路径 |
| V8 | `tmp/t1/baseline.md` | 四张表齐全（20 / 14 / 15 / 5）+ 两张口径差说明 |

---

### Task 2: 原语缺口 A —— `Modal` body 滚动锁 + `ConfirmDialog.tier`（B6）

> **B6 判据**：`Modal` 滚动锁 **20 个调用点共用 ⇒ 改原语**（`Modal.tsx:34` 逐字「不做 body 滚动锁……属批 4 的观察项」，本任务就是结清它）；`ConfirmDialog.tier` 是 ADR-033 后果④登记的观察项 ⇒ 加**透传**（不新增档位、不触发全枚举守卫）。
> **本任务是原语层改动，必须最先落地**（T3 并行）—— 迁移任务要用最终 API。

**Files:**
- Modify: `app/src/ui/primitives/Modal.tsx`（**现 188 行；预算 ≤235**）
- Modify: `app/src/ui/primitives/ConfirmDialog.tsx`（**现 192 行；预算 ≤215**）
- Create: `app/src/ui/primitives/Modal.scroll-lock.test.tsx`（**≤180 行**）
- Create: `app/src/ui/primitives/ConfirmDialog.tier.test.tsx`（**≤140 行**）
- Modify: `docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md`（在这两条观察项上**就地加注结清**，原文保留）

**Interfaces:**
- Consumes：`usePresence`（`mounted` 是"锁该生效"的真信号，**不是 `open`**）
- Produces：`ModalProps` **签名不变**（滚动锁是行为，不是 prop）；`ConfirmDialogProps` **新增 `tier?: ModalTier`**（默认 `"modal"`，透传给 `Modal`）
- ⚠️ **不许改 `ui/primitives/index.ts`**（`ModalTier` / `ConfirmDialogProps` 已导出；T3 独占该文件）

- [ ] **Step 1: 写失败的测试（先红）**

`Modal.scroll-lock.test.tsx`（首行 `// @vitest-environment jsdom`）四条：
① `open=true` ⇒ `document.body.style.overflow === "hidden"`；
② `open=false` 且**退场未结束**（未派发 `transitionend`）⇒ **仍锁**（`usePresence.mounted` 仍 true）；退场结束（派发 `transitionend`）⇒ **恢复原值**；
③ **嵌套**：两个 Modal 同开 ⇒ 关内层 ⇒ **仍锁**；关外层 ⇒ 恢复；
④ **恢复的是"原值"而不是空串**：开工前把 `document.body.style.overflow = "auto"` ⇒ 关完后仍是 `"auto"`；
⑤ **无 `transitionend` 的兜底路径**（reduced-motion / jsdom）：推进 `EXIT_MS + 80 + 1` ms ⇒ 恢复。
**跑一次确认红**（功能还没写）。

- [ ] **Step 2: 实现（引用计数 + 原值快照）**

```ts
/**
 * body 滚动锁（B6：20 个调用点共用 ⇒ 改原语）。
 * Why 引用计数：弹层内再弹（`tier="modalNested"`）时内层关闭**不能**解锁，否则背景会跳一下。
 * Why 快照原值：恢复成 "" 会抹掉别人（或宿主页）设过的 overflow —— 这是"看不见的破坏"。
 * Why 用 `presence.mounted` 而不是 `open`：`open=false` 后仍有 160ms 退场，那段时间面板还在屏上，
 *   提前解锁会让背景在弹层还在时就能滚（与 §5.2 第 2 条"退场相位必须禁指针事件"同源）。
 */
```
- 模块级 `let lockCount = 0; let savedOverflow: string | null = null;` + `useEffect` 依 `presence.mounted`。
- **只在浏览器环境生效**（`typeof document === "undefined"` 早退 —— 与 `Modal` 既有的 SSR 守卫同款）。

- [ ] **Step 3: `ConfirmDialog.tier` 透传**

```ts
/** 层级：弹层内再弹用 `modalNested`（ADR-033 后果④的观察项，批 4 结清） */
tier?: ModalTier;
```
`<Modal … tier={tier} />`，默认 `"modal"`。**文档注释必须写清"什么时候该传 `modalNested`"**（在被另一个 Modal 承载时）。

- [ ] **Step 4: 跑新测试 + 三个既有守卫**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/ui/primitives/Modal.test.tsx src/ui/primitives/Modal.exit.test.tsx src/ui/primitives/ConfirmDialog.test.tsx `
  src/ui/primitives/Modal.scroll-lock.test.tsx src/ui/primitives/ConfirmDialog.tier.test.tsx `
  src/ui/primitives/style-contract.test.ts src/ui/primitives/style-seams.test.ts src/ui/primitives/motion-coverage.test.ts
```
预期：全绿。**若 `style-contract` 红** ⇒ 说明无意中新增了联合值/类 ⇒ **回退该处**（本任务的契约是"签名不变 + 一个可选透传"）。

- [ ] **Step 5: 变异体（每条判据各一）**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 删掉解锁的 cleanup ⇒ | ②/⑤ 红 |
| M2 | 把引用计数换成布尔 ⇒ | ③ 红（关内层即解锁） |
| M3 | 恢复成 `""` 而不是快照值 ⇒ | ④ 红 |
| M4 | 把 `presence.mounted` 换成 `open` ⇒ | ② 红 |
| M5 | `ConfirmDialog` 不传 `tier` ⇒ | `ConfirmDialog.tier` 的"嵌套层拿 400"用例红 |

- [ ] **Step 6: 回写 ADR-033（就地加注，原文保留）**

在 `ADR-033` 的 **后果④** 与 **§5.2 的「未做：body 滚动锁」** 两处加短注：`✅ 批 4 T2 已结清（引用计数 + 原值快照；判据 <测试文件名>）`。

- [ ] **Step 7: 八门禁 + 提交**

```powershell
git commit --only -m "feat(primitives): add modal scroll lock and confirm tier" -- app/src/ui/primitives/Modal.tsx app/src/ui/primitives/ConfirmDialog.tsx app/src/ui/primitives/Modal.scroll-lock.test.tsx app/src/ui/primitives/ConfirmDialog.tier.test.tsx docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md
```
> subject `feat(primitives): add modal scroll lock and confirm tier` = **55** ❌ 超 50 ⇒ 用 `feat(primitives): lock body scroll in modal`（**42**）+ 提交体里说明 `ConfirmDialog.tier` 同提交。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/Modal.scroll-lock.test.tsx` | 5 用例全绿（且**未实现时 5 条全红**——报告里贴"先红"的输出） |
| V2 | `cd app; npx vitest run src/ui/primitives/ConfirmDialog.tier.test.tsx` | 2 用例全绿（默认 300 / 传 `modalNested` 得 400） |
| V3 | `cd app; npx vitest run src/ui/primitives/` | 原语层**全绿**（含 `style-contract` / `style-seams` / `motion-coverage`） |
| V4 | 变异体 M1–M5 | **5/5 红**，CONTROL 绿，sha256 还原一致 |
| V5 | `node scripts/line-limits.mjs --full` | exit 0；`Modal.tsx` ≤235 · `ConfirmDialog.tsx` ≤215（**>300 即返工**） |
| V6 | `grep`（正解脚本）：`Modal.tsx` 里 `overflow` 的读写各 1 处 | 无第三处；**不许出现 `!important`** |
| V7 | 八门禁 | 逐条 exit 0；`vitest` 用例 **+7**；既有 1370 逐文件不减 |
| V8 | `git show --stat HEAD` | 恰好 5 个路径 |

---

### Task 3: 原语缺口 B —— `Toast` 位置槽（具名 prop）+ `EmptyState` 对齐槽（B6）

> **B6 特殊条款（逐字）**：「凡「原语**结构上无法**表达」的（此处是它读不到壳层 token `--ed-nav-h`）⇒ **允许改原语，但只许加一个具名、有文档的 prop**；**绝不许**用行内 `style` 覆盖类语义」—— 这是 `Toast` 的位置槽；`EmptyState` 则是 44 个调用点共用 ⇒ **只许开一个受控的排版档位/布局槽，不许放开裸 `className`**。
> ⚠️ **本任务独占 `ui/primitives/index.ts` 与 `style-contract.test.ts`**（T2 不许碰）。

**Files:**
- Modify: `app/src/ui/primitives/Toast.tsx`（现 210 → 预算 **≤245**）
- Modify: `app/src/ui/primitives/Toast.css`（现 65 → 预算 **≤95**）
- Modify: `app/src/ui/primitives/EmptyState.tsx`（现 127 → 预算 **≤160**）
- Modify: `app/src/ui/primitives/EmptyState.css`（现 81 → 预算 **≤105**）
- Modify: `app/src/ui/primitives/index.ts`（现 45 → 预算 **≤50**；只加新类型的导出）
- Modify: `app/src/ui/primitives/style-contract.test.ts`（现 214 → 预算 **≤240**；**新联合值必须进全枚举锚**）
- Create: `app/src/ui/primitives/Toast.placement.test.tsx`（**≤150 行**）
- Create: `app/src/ui/primitives/EmptyState.align.test.tsx`（**≤130 行**）
- Modify: `docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md`（两条观察项就地加注）

**Interfaces:**
- `Toast` 新增：`placement?: ToastPlacement`，`export type ToastPlacement = "viewport" | "belowNav"`（默认 `"viewport"`）。
  - **语义写进文档**：`belowNav` = 贴在应用导航条下方（`top: calc(var(--ed-nav-h, 56px) + 8px)`），用于**常驻壳层**里的全局提示；`viewport` = 视口右上角，用于面板/页面级提示。
  - **实现走类**：`.ed-toast--below-nav`（**这是修饰类，按 ADR-033 不进 reduced-motion 名单**），**不许行内 `top`**。
- `EmptyState` 新增：`align?: EmptyStateAlign = "center" | "start"`（默认 `"center"` = 现形态）。**仅此一个**（`compact` 已有，`Text` 字阶是排版权威；任何一处还表达不了的排版 ⇒ **登记 + STOP 判是否 ≥3 共用**）。
- **不改**：`EmptyStateProps` 仍**不加** `className` / `style`（`EmptyState.tsx:35-36` 的边界逐字保留）。

- [ ] **Step 1: 先写失败的测试**

`Toast.placement.test.tsx`：① 默认渲染**不带** `--below-nav` 类；② `placement="belowNav"` ⇒ 容器类含 `ed-toast--below-nav`；③ **容器上没有行内 `top`**（`style.top === ""`）—— 防"用行内 style 绕过"；④ `Toast.css` 里该修饰类的 `top` 消费 `var(--ed-nav-h`（**读文件判，不是读 DOM**）；⑤ 三档 `kind` × 两档 `placement` 的类名笛卡尔积。
`EmptyState.align.test.tsx`：① 默认 `align="center"` 不带修饰类；② `align="start"` ⇒ 带；③ 渲染根元素**没有** `style` 属性；④ 图标/标题/说明/动作四个槽在两种对齐下都渲染。

- [ ] **Step 2: 实现（CSS 类，不用行内 style）**

`.ed-toast--below-nav { top: calc(var(--ed-nav-h, 56px) + 8px); }`（**同值兜底字面量**，与 `App.tsx` 今日的 `calc(var(--ed-nav-h) + 8px)` 逐字同源）；`.ed-empty--start { align-items: flex-start; text-align: start; }`。

- [ ] **Step 3: 更新 `style-contract.test.ts` 的全枚举锚**

新联合值（`ToastPlacement` 2 档 / `EmptyStateAlign` 2 档）必须进"**取值联合 ↔ CSS 类规则**"的全枚举表 —— **否则新档位可以"忘了写 CSS"而全绿**（这正是该守卫存在的理由）。

- [ ] **Step 4: 跑守卫 + 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | `Toast` 的 `belowNav` 用行内 `style={{top: …}}` 而不是类 ⇒ | ③ 红 |
| M2 | `.ed-toast--below-nav` 的 `top` 写死 `64px`（不消费 token）⇒ | ④ 红 |
| M3 | `index.ts` 漏导出 `ToastPlacement` ⇒ | `tsc --noEmit` 红（**vitest 不暴露**，必须单独跑） |
| M4 | `style-contract` 的全枚举表漏掉 `EmptyStateAlign` ⇒ | 该表断言红（若**不红** ⇒ 表没牙，本任务必须补） |
| M5 | `EmptyState` 的 `align="start"` 忘记写 CSS 类 ⇒ | 全枚举"每个成员都有对应规则"红 |

- [ ] **Step 5: 回写 ADR-033 + 八门禁 + 提交**

```powershell
git add -- app/src/ui/primitives/Toast.placement.test.tsx app/src/ui/primitives/EmptyState.align.test.tsx
git commit --only -m "feat(primitives): add toast placement and empty align" -- app/src/ui/primitives/Toast.tsx app/src/ui/primitives/Toast.css app/src/ui/primitives/Toast.placement.test.tsx app/src/ui/primitives/EmptyState.tsx app/src/ui/primitives/EmptyState.css app/src/ui/primitives/EmptyState.align.test.tsx app/src/ui/primitives/index.ts app/src/ui/primitives/style-contract.test.ts docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md
```
> subject `feat(primitives): add toast placement and empty align` = **50** ✅（**正好 50，数一遍**）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/Toast.placement.test.tsx src/ui/primitives/EmptyState.align.test.tsx` | 9 用例全绿（未实现时全红） |
| V2 | `cd app; npx vitest run src/ui/primitives/` | 全绿（含 `style-contract` 的新枚举） |
| V3 | `cd app; npx tsc --noEmit` | exit 0（**单独跑**：新类型的导出遗漏只有它看得见） |
| V4 | 变异体 M1–M5 | 5/5 红（M3 红在 `tsc`，其余红在 vitest） |
| V5 | 脚本判据：`Toast.css` 里 `--below-nav` 的 `top` 含 `var(--ed-nav-h`，且 `Toast.tsx` 里 **没有** `style={{ top` | 两条都真 |
| V6 | `node scripts/line-limits.mjs --full` | exit 0；四个原语文件均 ≤ 各自预算且 **≤300** |
| V7 | 八门禁 | 逐条 exit 0；用例 **+9**；既有 1370 逐文件不减 |
| V8 | 报告逐字写出 B9 中间态 | 「**只有接缝、没有纲领**」那句在报告里 |

---

### Task 4: z-index 六档整段迁移（58 处 / 43 文件 / 17 值 → 档位）

> **为什么必须"整段"**：ADR-033 §9 逐字「**必须按叠放段整段推进，不许零散替换** —— 叠放顺序是渲染的，而不是被设计的；段内混用标尺值与裸数字会让"谁在上面"变得不可推理」。
> **为什么必须由一个任务独占**：`ui/zIndex.guard.test.ts` 的冻结名单是**一个数组**，键 = `相对路径::该行 trim 原文`。任何迁移都会让它"出现过期项"（第 2 个 `it` 当场红）⇒ **多个并行任务改它必然互相覆盖**。本任务**独占**该文件，并在同一次提交里把 58 条全部收口。
> **本任务不改任何 UI 结构、不改任何逻辑**：只把裸数字换成 `zIndex("<档>")`，**逐处给 tier 与理由**。

**Files:**
- Modify: **41 个文件**（下表；**不含 `pages/ChatPage.tsx`** —— 它的 2 处随 B7 拆件迁移）
- Modify: `app/src/ui/zIndex.guard.test.ts`（现 184 → 预算 **≤200**：名单从 58 条收口到**例外集**）
- 产出（不入库）：`tmp/t4/zindex-map.md`（**58 行逐处表**：`文件:行` · 原值 · 新 tier · 理由 · 叠放关系）

**Interfaces:**
- Consumes：`zIndex(tier)`（`ui/zIndex.ts`，**不许改它的值**）
- Produces：全仓 `zIndex("…")` 的调用点集合；`ui/zIndex.guard.test.ts` 的 `FROZEN_NUMERIC_ZINDEX` 收口后的例外集（**应只剩 3 个覆盖层内部子层 / 或空**）

- [ ] **Step 1: 生成 58 行逐处表（脚本，别手抄）**

```powershell
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/planner-callsites.mjs *> ".superpowers\...\tmp\t4\zindex-raw.txt"
```
把 `### A.` 段的 58 行整理成表，**每行必须有 tier 与理由**。计划者的**映射规则（按叠放段单调）**：

| 现存值 | 目标 tier | 判定依据 | 涉及处数 |
|---|---|---|---|
| `10`（吸顶 / 容器内抬升） | `raised`(10) | 规格 §4.2 逐字「t1=10 吸顶」；**值不变** | 2 |
| `20` / `30` / `31` / `40` / `41` / `60` / `61`（锚定菜单与其透明点击层 / 卡片内下拉） | **`popover`(200)** | 规格 §4.2 逐字「t3=200 **锚定弹层/菜单**」；**层内相对序由 DOM 序保持**（点击层先渲染、面板后渲染 ⇒ 同值也正确） | 31 |
| `50` / `51`（对话框遮罩 + 面板） | **`modal`(300)** | 它们是 20 个弹层中的 3 个（`ChatSaveNoteDialog` / `TaskLaunchDialog` / `KnowledgeConceptDialog` / `KnowledgeModelDialog` / `KnowledgeDecisionForm` / `KnowledgeSystemWizard`）⇒ **迁移后本就该在 `modal` 档**；**映射成 `modal` 而不是 `popover`** 才能让"先 T4 后 T5–T8"的中间态保持单调（对话框永远在菜单之上） | 8 |
| `100`（`SessionsPage` 的页级层） | `panel`(100) | **值不变**；语义 = 页内常驻面板 | 1 |
| `200`（`useTransientToast`） | `popover`(200) | **值不变**（T10 迁 toast 时该文件会被重写） | 1 |
| `900`（`AiConversationDock`） | **`panel`(100)** | 批 3 登记逐字：「批 4 把面板迁到 `zIndex("panel")`（=100）后按六档标尺自然消解」 | 1 |
| `999` / `1000` / `1100` / `1150`（20 个弹层中的 11 个 + `ScreenSelectOverlay` + `BrowserChrome`） | 弹层 → **`modal`(300)** · `BrowserChrome` 菜单 → **`popover`(200)** · `ScreenSelectOverlay` → **例外（保持 999）** | 弹层迁 `Modal` 后由 `Modal` 自己写 `zIndex(tier)`；例外见 B2 | 15 |

> **⚠️ 逐处复核义务**：上表是**计划者的初判**，实施者必须逐处读上下文（它上面/下面是谁）后确认；**任何一处与初判不同 ⇒ 在 `zindex-map.md` 里写明理由**（这比"照抄计划"更有价值）。**遇到无法判定的（例如两个同级层相互覆盖的顺序不明）⇒ STOP 报控制方**。

- [ ] **Step 2: 逐段推进（**每段一次门禁**）**

段 ① `10`/`20` 段（`BoxSelectOverlay` / `CaptureOverlayPanel` 子层 / `GroupSidebarRow` / `ScreenSelectOverlay` 子层 / `SystemStatusBadge` / `WindowSelectCard`）→ 段 ② `30/31` 段（7 个透明层 + 气泡）→ 段 ③ `40/41`、`50/51`、`60/61` 段 → 段 ④ `100` / `200` / `900` → 段 ⑤ `999/1000/1100/1150` 段。
每段：改 → 跑 `npx vitest run src/ui/zIndex.guard.test.ts` + 该段涉及文件的测试 → 绿则下一段。

- [ ] **Step 3: 冻结名单收口**

把 `FROZEN_NUMERIC_ZINDEX` 从 **58 条**删到**只剩例外集**（预期 = `ScreenSelectOverlay:148` 一条；若 `CaptureOverlayPanel` 的子操作条也保留裸值则一并列明）。**每条保留项必须带一行注释说明"为什么它不能进六档"**（B2 要求：例外必须带理由，不许静默）。

- [ ] **Step 4: 例外登记进规格与 ADR**

`tmp/t4/zindex-map.md` 里单列「**例外表**」（3 个覆盖层 + 其内部子层）：`文件` · 值 · 理由（**系统交互面**：全屏框选 / 屏幕点选 / 图片查看）· 规格 §11-2 的例外判据。T18 会把它回写进规格。

- [ ] **Step 5: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 任一迁移处改回裸数字 ⇒ | `zIndex.guard` 第 1 个 `it` 红 |
| M2 | 名单里留一条已迁完的 ⇒ | 第 2 个 `it`（无过期项）红 |
| M3 | 把 `popover` 的菜单改成 `raised`(10) ⇒ | **本轮守卫不会红**（值合法）⇒ **必须另立结构判据**：`zindex-map.md` 的"逐处 tier"表用脚本对拍源码（`文件:行 → tier` 三元组集合相等）—— 这条**属于本任务必须补的判据**（否则"整段推进"只是口号） |
| M4 | 名单里插一条重复项 ⇒ | 第 3 个 `it` 红（排序/唯一性） |

- [ ] **Step 6: 八门禁 + 提交**

```powershell
git commit --only -m "refactor(ui): migrate bare z-index to tier scale" -- <41 个文件 + app/src/ui/zIndex.guard.test.ts>
```
> subject `refactor(ui): migrate bare z-index to tier scale` = **47** ✅（41 个路径写在 `--` 之后，命令会很长 —— **分行写，别用 `git add -A`**）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | 脚本 `tmp/t4/count-bare-zindex.mjs`（**新建，剥注释**） | 全仓裸 `zIndex: <数字>` **58 → 例外集条数**（预期 1–4）；**逐文件明细一并打印** |
| V2 | 脚本 `tmp/t4/tier-map.mjs` | 源码里的 `文件:行 → tier` 三元组集合 **==** `zindex-map.md` 的表（**集合相等，双向差集为空**） |
| V3 | `cd app; npx vitest run src/ui/zIndex.guard.test.ts` | 4 用例全绿；**名单条目数打印出来**（从 58 收口） |
| V4 | 变异体 M1–M4 | **4/4 红**（M3 红在 V2 的新判据上）；CONTROL 绿 |
| V5 | `cd app; npx vitest run` | 全绿；**既有 1370 逐文件不减**（z-index 是渲染属性，**不许有测试因此改断言** —— 若红 ⇒ STOP，说明某处叠放语义真的变了） |
| V6 | 八门禁 | 逐条 exit 0；首屏 Δ 记录（本轮只改属性值，**机理上不该进首屏**：新进首屏集合 = []） |
| V7 | `git show --stat HEAD` | 42 个路径，**无 `App.tsx` / 无 `ChatPage.tsx` / 无 `pages/NotesPage.tsx`** |
| V8 | `tmp/t4/zindex-map.md` | 58 行齐全 + 例外表 + **逐处理由**；与 V2 的表逐字一致 |

---

### Task 5: 20 弹层迁移 · A 组 1（7 文件）

> **本组是 `Modal` 的主战场**：7 个形态高度一致的对话框（`rgba` 遮罩 + `display:flex` 居中 + 白面板 + 右上关闭）。**迁移 = 删掉手写遮罩/居中/关闭/ESC/焦点，换成 `<Modal>`**，并给 `title`（`ModalProps.title` **必填**，用于 `aria-labelledby`）。
> **B3 的验收就在这一组里开始计分**：迁完一个，`role="dialog"` 的分子 +1。

**Files:**
- Modify: `app/src/components/ChatSaveNoteDialog.tsx`（149）· `GoalPlanApprovalDialog.tsx`（179）· `GraduateDialog.tsx`（141）· `GroupCreateDialog.tsx`（135）· `GroupDeleteConfirm.tsx`（147）· `InterviewDialog.tsx`（282）· `KnowledgeConceptDialog.tsx`（164）
- Modify（**授权范围内的 testid 机械改写**）：`ChatSaveNoteDialog.test.tsx` · `GoalPlanApprovalDialog.test.tsx` · `GraduateDialog.test.tsx` · `GroupSidebar.test.tsx` · `RouteInfoPopover.test.tsx` · `InterviewDialog.test.tsx`
- Create: `app/src/ui/primitives/dialogMigration.a1.test.ts`（**≤220 行**，7 个文件的判据）
- 产出（不入库）：`tmp/t5/before-after.md`（逐文件的 before/after：遮罩行号 · testid 映射 · 面板宽 vs 档位）

**Interfaces:**
- Consumes：`import { Modal, Button, Text } from "../../ui/primitives";`（**barrel**，B5）；`ModalProps`（T2 之后：**签名不变**）；`zIndex` **不再需要**（`Modal` 自己写层级）
- Produces：7 个文件的 `data-testid` 新契约（`testId` · `${testId}-overlay` · `${testId}-close`）；`dialogMigration.a1.test.ts` 供 T8 的 20 清单引用

- [ ] **Step 1: 逐文件开工人数表（先量后改）**

对 7 个文件逐个记录：`countLines()` · 遮罩行号 · 面板行号 · 现 `data-testid` 列表 · **面板声明宽**（对照 §表 3 的档位）· 该文件是否有同名测试。**任何与计划表 3 不符 ⇒ 以实测为准并登记**。

- [ ] **Step 2: 逐个迁移（**一次一个文件，改完立刻跑该文件的测试**）**

迁移的**统一形态**（以 `ChatSaveNoteDialog.tsx` 为例，其余同构）：

```tsx
// 删：<div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.18)" }}> …  </div>
// 删：面板上的 position/left/top/transform/width/boxShadow 等几何（改由 Modal 的 s/m/l 档给）
// 删：自建的 Esc / 点遮罩 / 焦点代码（若有）
// 留：表单与业务逻辑一行不改
<Modal
  open={open}
  onClose={onClose}
  title="保存到笔记"                  // ← 必填；无障碍名
  size="s"                            // ← 按 §表 3 的映射（本文件 380 → s）
  testId="chat-note-dialog"           // ← 面板；遮罩自动 = chat-note-dialog-overlay
>
  {/* 原面板内容原样搬进来（去掉外层定位样式） */}
</Modal>
```
**逐文件清单（计划者的档位建议 + 必须处理的既有 testid）**：

| 文件 | `size` | 旧 testid（要改的） | 新 testid（容器） | 备注 |
|---|---|---|---|---|
| `ChatSaveNoteDialog.tsx` | `s` | `chat-note-backdrop` · `chat-note-dialog` | `chat-note-dialog`（面板） | `chat-note-*` 其余子元素 testid **不动** |
| `GoalPlanApprovalDialog.tsx` | `l` | `plan-approval` | `plan-approval` | 560 → **l(720)**：宽度 +160，登记 |
| `GraduateDialog.tsx` | `m` | `graduate-dialog`（面板本身） | `graduate-dialog` | 值不变 |
| `GroupCreateDialog.tsx` | `s` | `group-create-dialog` | `group-create-dialog` | 340 → **s(380)**：+40 |
| `GroupDeleteConfirm.tsx` | `s` | `group-delete-confirm-backdrop` · `group-delete-confirm` | `group-delete-confirm` | ⚠️ **它自己就是确认框**：`impacts` 语义已内建（`group-delete-impact` / `group-delete-ack`），**不要**顺手改成 `ConfirmDialog`（T11 只迁 `window.confirm` 的 8 处） |
| `InterviewDialog.tsx` | `m` | `interview-dialog` | `interview-dialog` | 520 → m，档位不变 |
| `KnowledgeConceptDialog.tsx` | `m` | `concept-dialog` · `concept-dialog-close` | `concept-dialog` | `-close` 由 `Modal` 自动生成（**删手写关闭钮**）；480 → m(+40) |

> ⚠️ **`KnowledgeDecisionForm` 不在本组**（在 A 组 2）；它在 `GroupDeleteConfirm` 的同族里，**别串任务**。
> ⚠️ **`data-testid="…-close"`**：若调用点原本自带关闭钮 testid，迁移后**必须**用 `${testId}-close`（`Modal` 的契约）⇒ 测试同步改。

- [ ] **Step 3: 每个文件的「删干净」检查（这是本组最容易漏的）**

逐文件确认**四条**：① 无 `position: "fixed"` + `inset: 0` 的自建遮罩；② 无 `addEventListener("keydown"` / `window.onkeydown`；③ 无 `zIndex:` 裸数字；④ 无自建焦点管理（`autoFocus` 除外 —— 表单首字段的 `autoFocus` 是**业务**，`Modal` 的陷阱会先给面板，两者共存见 `Modal` 的用例）。

- [ ] **Step 4: 写 `dialogMigration.a1.test.ts`（7 个文件 × 4 条判据）**

判据（**剥注释后判**）：① 该文件 import 了 barrel 的 `Modal`（**不许深导入**：断言 import 源是 `"../../ui/primitives"`）；② 该文件**不含**自建遮罩特征（`position:"fixed"` ∧ `inset:0` / `inset: 0`）；③ 该文件**不含** `addEventListener("keydown"`；④ 该文件**不含**裸 `zIndex:\s*\d`。
外加**一条全局判据**：`role="dialog"` 的源码命中**只允许**出现在 `ui/primitives/Modal.tsx`（1 处）与 `shell/CommandPalette.tsx`（T9 之前为 1 处）—— **T8 会把它收紧到 1 处**。
**自检**：脚本必须打印扫描到的文件数与每个文件的 `countLines()`（防路径写错静默假绿）。

- [ ] **Step 5: 变异体（每条判据各一；每个文件至少覆盖一次）**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 某个文件把 `Modal` 换回自建遮罩（保留 `position:"fixed"; inset:0`）⇒ | ② 红 |
| M2 | 改回深导入 `from "../../ui/primitives/Modal"` ⇒ | ① 红 |
| M3 | 加一行 `useEffect(() => { document.addEventListener("keydown", h); })` ⇒ | ③ 红 |
| M4 | 写一个裸 `zIndex: 1000` ⇒ | ④ 红（**且 T4 的棘轮也红**：双向） |
| M5 | testid 从 `chat-note-dialog` 改成别的 ⇒ | 对应测试红（证明 testid 改写不是"随便改"） |

- [ ] **Step 6: B9 的中间态声明 + 八门禁 + 提交**

报告里**逐字**写：「本组迁移同时把 `Modal` 的 200/160ms 进出场带进真实界面 —— **这是接缝，不是纲领**：三档强度 / 双基调 / GSAP 全在批 6」。

```powershell
git commit --only -m "refactor(dialogs): migrate seven overlays to modal" -- <7 个组件 + 6 个测试 + dialogMigration.a1.test.ts>
```
> subject `refactor(dialogs): migrate seven overlays to modal` = **50** ✅

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/dialogMigration.a1.test.ts` | 29 条（7×4+1）全绿 |
| V2 | `cd app; npx vitest run <7 个组件的测试文件>` | 全绿；**用例数不减**（逐文件对拍 `tmp/vitest-baseline-perfile.txt`） |
| V3 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减；**唯一允许改的是 testid 字面量**（`git diff` 里逐 hunk 列给评审） |
| V4 | 脚本：全仓 `role="dialog"` 命中 | 迁移前 6 → 迁移后 **6 + 7 − 0**（源码侧计数会**上升**，因为每个调用点通过 `Modal` 渲染；**判据不是源码计数，而是 V1 的 ①+②**）—— 报告须写清这条口径 |
| V5 | 变异体 M1–M5 | 5/5 红，CONTROL 绿，sha256 还原一致 |
| V6 | 脚本：7 个文件的 `position: "fixed"` 命中 | **0**（若某文件本就有非弹层的 fixed，逐条说明并登记） |
| V7 | 八门禁 | 逐条 exit 0；首屏 Δ + 机理（这批文件**都是懒 chunk** ⇒ 期望首屏 Δ ≈ 0，**barrel 的 +3.41 kB 是唯一来源**，由 T10/T9 触发） |
| V8 | `git show --stat HEAD` | 14 个路径（7 + 6 + 1）；**无 `App.tsx` / 无 `ChatPage.tsx` / 无 `zIndex.guard`** |

---

### Task 6: 20 弹层迁移 · A 组 2（7 文件）

> 与 T5 **同构**（同一套作业模式、同一套判据形态、同一套 stop 纪律），差别只在文件集与两个特例：`TaskLaunchDialog` 的 testid 在 `zIndex.guard` 冻结名单里（T4 已处理，**本任务不许再动那个文件**）、`RefineLaunchDialog` 面板 680 → `l`。

**Files:**
- Modify: `app/src/components/KnowledgeDecisionForm.tsx`（240）· `KnowledgeModelDialog.tsx`（175）· `ModelCardCreateDialog.tsx`（97）· `ModelCardFromNoteDialog.tsx`（104）· `NoteAiDialog.tsx`（215）· `RefineLaunchDialog.tsx`（297）· `TaskLaunchDialog.tsx`（148）
- Modify（testid 机械改写）：`KnowledgeDecisionForm.test.tsx` · `KnowledgeDetailPanel.test.tsx` · `ModelCardCreateDialog.test.tsx` · `RefineLaunchDialog.vision.test.tsx` · `TaskLaunchDialog.test.tsx`
- Create: `app/src/ui/primitives/dialogMigration.a2.test.ts`（**≤220 行**）

**Interfaces:**
- Consumes：同 T5；另：`NoteAiDialog` 的 `kind === "menu"` 变体（宽 460）与普通变体（520）**同用 `m` 档**（取大者，避免两档宽度在同一组件里跳）
- Produces：`dialogMigration.a2.test.ts`

- [ ] **Step 1: 逐文件开工人数表**（同 T5 Step 1）
- [ ] **Step 2: 逐个迁移**（统一形态同 T5 Step 2）

| 文件 | `size` | 旧 testid | 新 testid | 备注 |
|---|---|---|---|---|
| `KnowledgeDecisionForm.tsx` | `m` | `decision-form` · `decision-form-close` | `decision-form` | 被 `KnowledgeDetailPanel.test.tsx` 也引用 |
| `KnowledgeModelDialog.tsx` | `m` | `model-dialog` · `model-dialog-close` | `model-dialog` | 有 `onKeyDown` Enter 提交 ⇒ **顺手接 `isImeComposing()`**（Global Constraints 的 IME 条款） |
| `ModelCardCreateDialog.tsx` | `s` | `model-card-dialog` | `model-card-dialog` | 380 → s |
| `ModelCardFromNoteDialog.tsx` | `m` | 无 | `model-card-from-note`（**新增**） | 460 → m(+60)；跨行口径的文件 |
| `NoteAiDialog.tsx` | `m` | 无 | `note-ai-dialog`（**新增**） | 460/520 → m |
| `RefineLaunchDialog.tsx` | `l` | 无（测试引用的 `vision-*` 是子元素） | `refine-launch-dialog`（**新增**） | 680 → l(+40)；**297 行**已接近 300 ⇒ **迁移必须净减**（删遮罩/关闭/几何） |
| `TaskLaunchDialog.tsx` | `s` | `task-launch-backdrop` · `task-launch-dialog` | `task-launch-dialog` | ⚠️ `ui/zIndex.guard.test.ts` 的冻结名单曾含 `task-launch-backdrop` 那一行（T4 已删）⇒ **本任务不许出现在该文件的提交路径** |

- [ ] **Step 3: 四条「删干净」检查**（同 T5 Step 3）
- [ ] **Step 4: 写 `dialogMigration.a2.test.ts`**（同 T5 Step 4 的四条判据 + 自检）
- [ ] **Step 5: 变异体**（同 T5 Step 5 的 M1–M4 + 一条本组专有：`TaskLaunchDialog` 恢复 `zIndex: 50` ⇒ ④ 红且 `zIndex.guard` 红）
- [ ] **Step 6: B9 声明 + 八门禁 + 提交**（subject `refactor(dialogs): migrate seven form overlays` = **50** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/dialogMigration.a2.test.ts` | 29 条全绿 |
| V2 | `cd app; npx vitest run <5 个受影响测试>` | 全绿；用例数不减 |
| V3 | 脚本：`RefineLaunchDialog.tsx` 的 `countLines()` | **≤297 且 < 迁移前**（净减 —— 它是本组唯一的行数风险） |
| V4 | 脚本：7 个文件裸 `zIndex:` | **0** |
| V5 | `cd app; npx vitest run src/ui/zIndex.guard.test.ts` | 4 用例全绿（**证明 T4 的收口没被本任务打回**） |
| V6 | 变异体 | 5/5 红 + CONTROL 绿 |
| V7 | 八门禁 | 逐条 exit 0；既有 1370 逐文件不减 |
| V8 | `git show --stat HEAD` | 13 个路径；**无 `ui/zIndex.guard.test.ts`** |

---

### Task 7: 20 弹层迁移 · B 组工作台（4 文件，含 **R3** 裁决）

> 四个**全屏面板/工作台**。**它们的共同难点是宽度**：三个 ≤720（560 / 680 / 720）能干净地落进 `--l`，**`RefineWorkbench` 是 1200 px 的并排双栏 diff** ⇒ **R3 必须先裁决**（见 §待裁决清单）。
> **兜底纪律**：若实施者实测 720 下双栏内容**结构性不可读**（不是"挤"，是"信息丢失"）⇒ **STOP**，把 720 下的实测（截图口径 / DOM 宽度 / 内容溢出）与 (b)/(c) 两条备选走法的代价一起报控制方。

**Files:**
- Modify: `app/src/components/KnowledgeSystemWizard.tsx`（278）· `ProofreadPanel.tsx`（222）· `SecondPassPanel.tsx`（303）· `RefineWorkbench.tsx`（471）
- Modify（testid 机械改写）：`KnowledgeSystemWizard.test.tsx` · `pages/KnowledgePage.test.tsx` · `RefineWorkbench.test.tsx`
- Create: `app/src/ui/primitives/dialogMigration.b.test.ts`（**≤200 行**）

**Interfaces:**
- Consumes：同 T5；`KnowledgeSystemWizard` 是**向导** ⇒ 规格 §5.2 逐字「L 720（**向导**/工作台）」
- Produces：`dialogMigration.b.test.ts`

- [ ] **Step 1: 逐文件开工人数表**（同 T5 Step 1；**必须记 4 个文件的面板声明宽**）
- [ ] **Step 2: 三个 ≤720 的按 T5 的统一形态迁移**

| 文件 | `size` | 旧 testid | 新 testid | 备注 |
|---|---|---|---|---|
| `KnowledgeSystemWizard.tsx` | `l` | `knowledge-wizard` · `wizard-close` | `knowledge-wizard` | 560 → l(+160)；**两个测试文件引用它** |
| `ProofreadPanel.tsx` | `l` | 无 | `proofread-panel`（新增） | 680 → l(+40)；222 行 |
| `SecondPassPanel.tsx` | `l` | 无 | `second-pass-panel`（新增） | **720 → l 逐字同宽**；303 行 ⇒ 迁移应净减 |

- [ ] **Step 3: `RefineWorkbench` 按 R3 的裁决执行**

- **若 (a)**：`size="l"`；**必做**：① 删掉面板上的 `width: "90vw"` / `maxWidth: 1200`（改由档位给）；② 检查内部两栏（`flex: 1` × 2）在 720 下是否仍可读；③ 报告里**登记这条可见变化**（并排 → 更接近单栏密度）；④ **`差异` 单栏模式必须仍可用**（它是并排不可读时的出路）。
- **若 (b)**：把 `RefineWorkbench` 从本批的 20 里剔除 ⇒ **必须同时改判 B2 或 B3** ⇒ 本任务**先 STOP**，等控制方给出新的 20 构成再继续。
- **若 (c)**：给 `Modal` 加具名宽度槽 ⇒ 那是 **T2/T3 的返工**（原语改动必须在迁移之前）⇒ 本任务**先 STOP**。

- [ ] **Step 4: 四条「删干净」检查**（同 T5 Step 3）
- [ ] **Step 5: 写 `dialogMigration.b.test.ts`**（四条判据 + 一条本组专有：**面板宽度不再由调用点声明**（4 个文件里 `width: "90vw"` / `maxWidth: 1200` / `width: 680` / `width: 720` 的命中 = 0））
- [ ] **Step 6: 变异体**（M1–M4 同 T5 + M5：把 `size` 从 `l` 改成 `m` ⇒ 面板宽度断言红）
- [ ] **Step 7: B9 声明 + 八门禁 + 提交**（subject `refactor(panels): migrate four workbenches to modal` = **50** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/dialogMigration.b.test.ts` | 17 条（4×4+1）全绿 |
| V2 | 脚本：4 个文件的面板宽度声明命中 | **0**（宽度权威移到 `Modal` 的档位） |
| V3 | `cd app; npx vitest run src/components/RefineWorkbench.test.tsx src/components/KnowledgeSystemWizard.test.tsx src/pages/KnowledgePage.test.tsx` | 全绿；用例不减 |
| V4 | `RefineWorkbench.tsx` 行数 | 迁移后 **< 471**（删掉自建遮罩/几何后必减；若 >471 ⇒ 说明夹带了新逻辑 ⇒ STOP） |
| V5 | 变异体 M1–M5 | 5/5 红 + CONTROL 绿 |
| V6 | 八门禁 | 逐条 exit 0；既有 1370 逐文件不减 |
| V7 | 报告含 R3 的处置（走 (a)/(b)/(c) + 720 下的实测） | 三选一明写，**不许含糊** |
| V8 | `git show --stat HEAD` | 8 个路径；无热点文件 |

---

### Task 8: 20 弹层迁移 · E 组（2 文件）+ **20 清单机器判据**

> 本任务是 **B3 的判据落点**：把「这 20 个」钉成一条**跨 20 文件的机器判据**，并把 ADR-033 的 **28** 并列登记（两口径对账归批 8）。
> **依赖 T5/T6/T7 全部提交**（判据覆盖 20 个文件，任一组未落地 ⇒ 本任务的判据必红）。

**Files:**
- Modify: `app/src/components/PracticeQuestionsOverlays.tsx`（249）· `SopRunOverlay.tsx`（290）
- Create: `app/src/ui/primitives/dialogMigration.e.test.ts`（**≤240 行**：2 个文件的判据 + **20 清单总判据**）
- Modify: `app/src/ui/primitives/dialogMigration.a1.test.ts` / `.a2` / `.b`（**只许改一处**：把各自的"局部清单"改为从 `.e` 导出的 `DIALOG_20` 取子集 —— 若这么做会引入跨文件 import 循环 ⇒ **不合并也可以**，由 `.e` 独立枚举 20）

**Interfaces:**
- Consumes：T5/T6/T7 的产物（20 个文件都已迁完）
- Produces：`DIALOG_20: readonly string[]`（**20 个相对路径，逐字**）+ 三条跨文件判据

- [ ] **Step 1: 两个 E 桶文件按 T5 的统一形态迁移**

| 文件 | `size` | 旧 testid | 新 testid | 备注 |
|---|---|---|---|---|
| `PracticeQuestionsOverlays.tsx` | `l` | 无 | `practice-overlays`（新增） | 560 → l(+160)；249 行；**它同时是空态 33 文件之一**（`EmptyState` 归 T13，**本任务不顺手做**，避免跨任务夹带） |
| `SopRunOverlay.tsx` | `l` | 无 | `sop-run-overlay`（新增） | 640 → l(+80)；290 行 ⇒ 迁移必须净减 |

- [ ] **Step 2: 写 20 清单总判据（B3 的核心交付）**

```ts
/**
 * @ai-context 20 个手写弹层的**收口判据**（B3：验收按规格的 20，且计划必须逐条列出这 20 个）。
 * 口径声明：**A14 + B4 + E2 = 20 是可辩护的构成，不是规格原文**（规格只写「20 弹层」）。
 * 对照口径：ADR-033 的 **28**（同行 `fixed`+`inset:0` 的文件数）与跨行口径 **34** 在本文件里
 *   **并列登记为常量**，两口径对账归**批 8** 治理收口（本批不改规格 §11-2 的数字）。
 */
export const DIALOG_20 = [ /* 20 条相对 app/src 的路径，逐字 */ ] as const;
export const ADR033_28 = [ /* 28 条 */ ] as const;
export const CROSS_LINE_34 = [ /* 34 条 */ ] as const;
```
三条判据：① `DIALOG_20` 的 **20 个文件全部**满足"import barrel 的 `Modal`/`ConfirmDialog`" + "无自建遮罩" + "无 keydown 监听"；② **集合关系**：`DIALOG_20 ⊆ CROSS_LINE_34` 且 `CROSS_LINE_34 − DIALOG_20 == 14`（**11 锚定菜单 + 3 覆盖层** —— 这 14 条的名单**逐字**写在常量里，与 §表 4 一致）；③ `ADR033_28 ⊆ CROSS_LINE_34` 且 `|ADR033_28| = 28`。
**自检**：三个数组都非空、无重复、排序一致；扫描域锚点（`ui/primitives/Modal.tsx` 必须在扫描域内）。

- [ ] **Step 3: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 从 `DIALOG_20` 删一个文件 ⇒ | ② 红（差集 ≠ 14） |
| M2 | 把 14 条里的一个锚定菜单也改成 `Modal` ⇒ | ② 红（差集 ≠ 14 —— **这条同时守住 B1**） |
| M3 | 把 `CROSS_LINE_34` 改成 33 条 ⇒ | ③ 或 ② 红 |
| M4 | 某个 E 桶文件恢复 `position:"fixed"; inset:0` ⇒ | ① 红 |

- [ ] **Step 4: B9 声明 + 八门禁 + 提交**（subject `test(primitives): pin the twenty dialog set` = **46** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/dialogMigration.e.test.ts` | 全部绿（**未迁完时必红** ⇒ 报告里贴"依赖未满足时的红"作为判据有牙的证据） |
| V2 | 脚本：全仓 `role="dialog"` 的**源码**命中 | **1 处**（`ui/primitives/Modal.tsx`）—— `CommandPalette` 若已由 T9 迁完则为 0；两条口径都打印 |
| V3 | `cd app; npx vitest run src/ui/primitives/dialogMigration.a1.test.ts src/ui/primitives/dialogMigration.a2.test.ts src/ui/primitives/dialogMigration.b.test.ts` | 全绿（20 个文件四个测试文件共 92 条） |
| V4 | 变异体 M1–M4 | 4/4 红 + CONTROL 绿 |
| V5 | 八门禁 | 逐条 exit 0；既有 1370 逐文件不减 |
| V6 | 报告 | **20 清单逐字列出**（`文件` + 行数 + `size` + testid），并写明 **28 / 34 的并列登记**与「消歧归批 8」 |
| V7 | `git show --stat HEAD` | 3 个路径 |

---

### Task 9: 壳层遗留 —— `CommandPalette` → `Modal`（+ `isImeComposing`）· `ShellFallback` → `Loading`/`StatusLine`

> **这两条是批 3 逐字点名的迁移点**：`shell/CommandPalette.tsx:12-31` 的文件头逐字写着「⚠️ **这里是批 4 的迁移点**：批 4 用 `Modal` 换掉本文件的遮罩与键盘代码，并把下面的 IME 判断换成原语层的 `isImeComposing()`；**本文件的 CSS 也整份随之删除**」；`shell/ShellFallback.tsx:6-7` 逐字写着「🔴 **本文件是批 4 的迁移点**：`ShellFallback` → `Loading`、失败卡片 → `StatusLine`（批 4 计划必须收编这两个组件，否则永远漏在这里）」。
> **本任务也把 B5 的 barrel 代价第一次真正带进首屏**（这两条都在首屏静态可达图里）⇒ **首屏读数必须由本任务测量并归因**。

**Files:**
- Modify: `app/src/shell/CommandPalette.tsx`（现 219 → 预算 **≤220**，**应当净减**）
- Delete: `app/src/shell/CommandPalette.css`（现 102 行；**整份删除**，批 3 已登记）
- Modify: `app/src/shell/CommandPalette.test.tsx`（172）· `CommandPalette.kb.test.tsx`（182）· `CommandPalette.followups.test.tsx`（90）
- Modify: `app/src/shell/ShellFallback.tsx`（现 60 → 预算 **≤80**）
- Modify: `app/src/shell/ShellFallback.test.tsx`（现 163）
- 产出（不入库）：`tmp/t9/before-after.md`（首屏双口径 Δ + 机理）

**Interfaces:**
- Consumes：`import { Modal, Loading, StatusLine, isImeComposing } from "../ui/primitives";`
- Produces：`CommandPalette` 的面板 `testId="command-palette"`（若原 testid 不同，**逐字保留原值**）；`ShellFallback` 的两个态改为原语
- ⚠️ **`CommandPalette` 的面板原本没有 `title`**（用的是 `aria-label`）⇒ `ModalProps.title` **必填** ⇒ **给一个用户可见标题**（如「命令面板」）；若控制方认为该面板不应有可见头部 ⇒ **STOP**（那是 `Modal` 契约的扩展，属 B6 的缺口判定，不许就地改原语）

- [ ] **Step 1: 先读两个文件头 + 三个测试，立影响面**

逐条列出：`CommandPalette` 自建的遮罩 / ESC / 自动聚焦代码行号 · 它的 IME 判断行号（`:117` 附近）· 三个测试里对 `role="dialog"` / 遮罩 / 聚焦的断言（**这些断言在迁移后应当仍然成立**，因为 `Modal` 提供同样能力 ⇒ **若必须改断言 ⇒ STOP**，只有 testid 例外）；`ShellFallback` 的 `role="status"` / `role="alert"` / `data-testid` 与 `ShellFallback.test.tsx` 对它们的断言。

- [ ] **Step 2: `CommandPalette` → `Modal`**

```tsx
<Modal open={open} onClose={onClose} title="命令面板" size="m" testId="command-palette">
  {/* 输入框 + 结果列表原样搬入；autofocus 由 Modal 的焦点陷阱给「首个可聚焦元素」= 输入框 */}
</Modal>
```
① 删自建遮罩与 `mousedown` 判据；② 删自建 ESC 监听（`:121`）与自动聚焦 effect；③ IME 判断换成 `isImeComposing(e)`（**同一个组合态语义**：`isComposing` 或 `keyCode === 229`）；④ **删 `CommandPalette.css` 并删它的 import**；⑤ 焦点归还由 `Modal`/`useFocusTrap` 负责（原登记 `:20-21`）。

- [ ] **Step 3: `ShellFallback` → `Loading` / `StatusLine`**

```tsx
export function ShellFallback() {
  return <Loading label="正在载入…" testId="shell-fallback" />;      // 保留 testid
}
// SlotErrorBoundary 的失败卡片：
return <StatusLine kind="error" testId="slot-error">此处加载失败——其余区域仍可使用；重启应用可恢复。</StatusLine>;
```
⚠️ **两处语义必须核对**：① 原 `role="status"` / `role="alert"` 分别由 `Loading` / `StatusLine` 提供（**逐字核原语的 role**，若不同 ⇒ 记录并 STOP 判是否改测试）；② 文案**一字不改**（批 3 的 T13-Minor3 刚把它从"可切换页面"改成现在这句 —— 那是**假陈述修正**的成果）。

- [ ] **Step 4: 首屏归因（本批 B5 的诚实代价读数）**

```powershell
node scripts/check-bundle-budget.mjs            # 真实构建
node scripts/bundle-eager-graph.mjs --json      # 工具口径
node .superpowers/.../tmp/review-t10/eager-ts.mjs   # 真实边口径（TS 编译器 API 剔 import type）
```
**报告必须给三件套**：① 工具口径（注明把 `import type` 也算边）② **Δ（相对 T1 的锚）** ③ **机理**（新进首屏集合 = `ui/primitives/**` 的 N 个文件 + `motion.css`；`pages/**` 新增 0；npm 包 4 → 4）。**把 B5 的诚实代价写成一句话**：「barrel 的代价实测 **+3.41 kB gzip JS（上界）+ 2.18 kB gzip CSS（不进 200 kB 判据）**；本任务是它的第一个真实触发点」。

- [ ] **Step 5: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 恢复 `CommandPalette` 的自建遮罩（哪怕只留 `position:"fixed"; inset:0`）⇒ | 新判据红 |
| M2 | 恢复它的 `window`/`document` ESC 监听 ⇒ | 新判据红（`role="dialog"` 唯一持有者） |
| M3 | 把 `isImeComposing` 换回裸 `e.key === "Enter"` ⇒ | 组合态用例红 |
| M4 | `ShellFallback` 改回自足 `<div style=…>` ⇒ | 新判据红（原语缺失） |
| M5 | 把 `StatusLine` 的 `kind` 从 `error` 改成 `info` ⇒ | 红色墨度断言红（若无此断言 ⇒ **补一条**：`kind="error"` 必须走 `--ed-stamp` 文字色） |

- [ ] **Step 6: B9 声明 + 八门禁 + 提交**（subject `refactor(shell): migrate palette and fallback to primitives` = **54** ❌ ⇒ 拆两条提交：`refactor(shell): use modal in command palette`（**42**）+ `refactor(shell): use loading and status line in fallback`（**52** ❌ ⇒ `refactor(shell): use primitives in shell fallback`（**46** ✅））

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `Test-Path app/src/shell/CommandPalette.css` | **False**（整份删除；当场 `Get-ChildItem` 复核目录） |
| V2 | 脚本：`CommandPalette.tsx` 的 `createPortal` / `addEventListener("keydown"` / `inset: 0` 命中 | **全 0**；且含 `isImeComposing` 调用 ≥1 |
| V3 | `cd app; npx vitest run src/shell/` | 全绿；**用例数不减**（`CommandPalette*` 三个文件 + `ShellFallback.test.tsx` 逐文件对拍基线） |
| V4 | 脚本：`role="dialog"` 全仓源码命中 | **1 处**（只剩 `ui/primitives/Modal.tsx`） |
| V5 | `node scripts/check-bundle-budget.mjs` | exit 0；**报告写新 dist mtime + 入口 chunk + 首屏 gzip + Δ + 机理三件套** |
| V6 | 变异体 M1–M5 | 5/5 红 + CONTROL 绿 |
| V7 | `node scripts/line-limits.mjs --full` | exit 0；`CommandPalette.tsx` **≤220 且净减** · `ShellFallback.tsx` ≤80 |
| V8 | 八门禁 | 逐条 exit 0；既有 1370 逐文件不减 |

---

### Task 10: `Toast` 四套 → 1（`App.tsx` AI toast + 页级 + hook 式）

> **规格 §5.1 逐字**：「`Toast` \| **4 套 → 1** \| 现状嵌在导航行里，徽标一出现即被裁切」。实测四套 = ① `App.tsx:484-506`（全局 AI toast，批 3 已搬到 fixed 覆盖层）② `pages/SessionsPage.tsx`（页内 `useState` + `setTimeout 3000`，`showToast` 被调用 14 处）③ `hooks/useTransientToast.tsx`（hook 式 3s）④ `components/SessionListPanel.tsx`（**消费 ③ 的实例**）。
> 🔴 **本任务独占 `App.tsx`**（热点，574/600），且**必然触发 R4 的授权改写**（批 3 的 A3 守卫断言的是"自足 toast"的源码文本）。

**Files:**
- Modify: `app/src/App.tsx`（574 → 预算 **≤600**；**只许净减或微增**）
- Modify: `app/src/pages/SessionsPage.tsx`（355）
- Modify: `app/src/hooks/useTransientToast.tsx`（75）
- Modify: `app/src/components/SessionListPanel.tsx`（298）
- Modify（**R4 授权范围**）：`app/src/shell/TopBar.test.tsx`（198）
- Create: `app/src/components/toastMigration.test.tsx`（**≤200 行**：四套都走原语的判据）
- 产出（不入库）：`tmp/t10/r4-rewrite.md`（三条断言的 before/after + 变异体）

**Interfaces:**
- Consumes：`import { Toast } from "./ui/primitives";`（`App.tsx` 的路径）/ `"../ui/primitives"`（其余）
- Produces：`data-testid="ai-toast"` **保留**（`Toast` 的 `testId` 落容器）；`placement="belowNav"`（T3 的新 prop）在 `App.tsx` 使用

- [ ] **Step 1: 先立影响面（含 R4 的三条断言原文）**

把 `shell/TopBar.test.tsx:180-197` 的四条断言**逐字抄进 `tmp/t10/r4-rewrite.md`**，并逐条给出"迁移后它为什么失效/如何保持"。同时列出四套 toast 的**时长差异**（现状 3s / 3.5s / 4s / 3s）—— 迁移时**逐处保留原时长**（`durationMs` 显式传），**不许统一成一个数**（那是行为变化，不是迁移）。

- [ ] **Step 2: `App.tsx` 的 AI toast → `Toast`**

```tsx
<Toast
  open={aiToast !== null}
  message={/* 原三档文案逐字 */ }
  kind={/* ok | err */ }
  durationMs={3500}                     // ← 逐字保留现状时长
  placement="belowNav"                  // ← T3 的具名 prop（读 --ed-nav-h）
  testId="ai-toast"                     // ← 原 testid 逐字保留
  onDismiss={() => setAiToast(null)}
/>
```
① 删自足的内联三档配色（原语按 `kind` 给墨度）；② 删 `top` / `zIndex("toast")` 的行内声明（层级与定位归原语）；③ ⚠️ **`action` 的语义**：`Toast` 的 `action.onClick` **既不自关也不动计时器**（`Toast.tsx` 边界⑤）⇒ 调用方**必须自己置 `open=false`**；本任务的 AI toast **没有 action** ⇒ 无事，但 `SessionsPage` 若有"撤销"类 action 则**必须**照此办。
④ **导入即触发 B5 的 barrel 代价** ⇒ 在报告里写明"首屏 +x kB 由本步引入"（与 T9 一起归因，别重复计算）。

- [ ] **Step 3: 页级 toast（`SessionsPage`）与 hook 式 toast（`useTransientToast`）**

- `useTransientToast.tsx`：**保留它的状态机与 API**（它是被复用的 hook），只把**渲染**换成 `<Toast>`；删除自绘的固定定位 JSX 与内联配色。⚠️ 它的 `zIndex: 200` 裸数字由 T4 已改（若 T4 已把它改成 `zIndex("popover")` ⇒ 本步**直接删除该行**，因为 `Toast` 自己给层级）。
- `SessionsPage.tsx`：把页内 `useState<Toast>` + `window.setTimeout` + 手写 JSX 换成 `useTransientToast`（或直接 `<Toast>`），**`showToast` 的 14 个调用点签名与文案一字不改**。

- [ ] **Step 4: R4 的授权改写（**只改这三条，其余一律 STOP**）**

| 原断言（`TopBar.test.tsx`） | 改写为 | 强度 |
|---|---|---|
| `:183` `APP_CODE` 含 `position: "fixed"` | **删**，改为断言 `Toast.css` 的 `.ed-toast` 是 `position: fixed`（原语层，**覆盖全部消费者**） | **更强** |
| `:184` `APP_CODE` 含 `top: "calc(var(--ed-nav-h) + 8px)"` | **删**，改为断言 `App.tsx` 里 `placement="belowNav"` **且** `Toast.css` 的 `.ed-toast--below-nav` 的 `top` 消费 `var(--ed-nav-h` | **更强**（原来只证明"App 写了这个串"，现在证明"整条链成立"） |
| `:185` `APP_CODE` 含 `zIndex("toast")` | **删**，改为断言 `Toast.tsx` 含 `zIndex("toast")` | 等价 |
| `:182` `data-testid="ai-toast"` | **保留不动** | — |

**每条改写各带变异体**；`TopBar.persistent.test.tsx`（只判 `dock-toggle`）**一个字都不动**（V8 会核）。

- [ ] **Step 5: `toastMigration.test.tsx`（四套 → 1 的机器判据）**

① 四套的实现文件**都不再有**自绘 toast 的固定定位 JSX（剥注释后 `role="status"` 只允许出现在原语与 `ShellFallback` 语境）；② 四个文件都 import 了 barrel 的 `Toast`（或经 `useTransientToast` 间接）；③ `durationMs` **逐处显式传**（防"统一成默认 3000"）；④ 全仓 `role="status"` 的源码命中集合 == 白名单（`ui/primitives/Toast.tsx` + `ui/primitives/Loading.tsx` + 测试）。
**自检**：打印每个被扫文件的 `countLines()`。

- [ ] **Step 6: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 恢复 `App.tsx` 的自足 toast ⇒ | ①② 红 + R4 的新断言红 |
| M2 | 把 `placement="belowNav"` 删掉 ⇒ | R4 的第二条红 |
| M3 | 某处不传 `durationMs`（用默认 3000）⇒ | ③ 红 |
| M4 | 在 `SessionsPage` 里再手写一个 `role="status"` 的 div ⇒ | ④ 红 |
| M5 | 把 `Toast.css` 的 `position: fixed` 删掉 ⇒ | R4 的第一条红 |

- [ ] **Step 7: B9 声明 + 八门禁 + 提交**

```powershell
git commit --only -m "refactor(ui): unify four toast implementations" -- app/src/App.tsx app/src/pages/SessionsPage.tsx app/src/hooks/useTransientToast.tsx app/src/components/SessionListPanel.tsx app/src/shell/TopBar.test.tsx app/src/components/toastMigration.test.tsx
```
> subject `refactor(ui): unify four toast implementations` = **46** ✅

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/toastMigration.test.tsx` | 全绿 |
| V2 | `cd app; npx vitest run src/shell/TopBar.test.tsx src/shell/TopBar.persistent.test.tsx` | 全绿；**`TopBar.persistent.test.tsx` 零改动**（`git diff --name-only` 不含它） |
| V3 | 脚本：`App.tsx` 的 `countLines()` | **≤600**（余量必须为正；若 ≥600 ⇒ STOP 先拆） |
| V4 | 脚本：全仓 `role="status"` 命中集合 | == 白名单（逐条打印） |
| V5 | 变异体 M1–M5 | 5/5 红 + CONTROL 绿 |
| V6 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减；**唯一允许改的断言是 R4 的三条**（逐 hunk 列给评审） |
| V7 | `node scripts/check-bundle-budget.mjs` | exit 0；首屏 Δ 必须与 T9 的读数**分列**（两条都触发 barrel，但**只计一次**——报告里写明"T9 已把 barrel 带进首屏，本任务不新增 barrel 字节"） |
| V8 | 八门禁 | 逐条 exit 0 |

---

### Task 11: `ConfirmDialog` 8 处 → 1（含 `impacts` 清单）

> **规格 §5.1 逐字**：「`ConfirmDialog` \| 21 处 → 1 \| `window.confirm` 在 WebView2 下**可能静默返回 false**」；§5.3 逐字：「高危不可逆（组删除 / 体系级联 / 采集弃置 / 毕业结算）⇒ 确认框，**框内必须列明级联影响与保留项**（例：「将删除 1 个组 · 3 条排序记录 · **笔记 7 篇保留**」）；**级联一律不给撤销**」。
> **实测只迁 8 处**（`window.confirm`）；裸 `confirm(` 的另外 8 处混着 `@tauri-apps/plugin-dialog` 与同名非确认语义 ⇒ **逐处判定并登记**（不许"看起来像就迁"）。

**Files:**
- Modify: `app/src/components/AiProviderSettings.tsx`（352，`:94` / `:120`）· `BackupPanel.tsx`（`:53`）· `FeedFragmentList.tsx`（`:163`）· `GoalDetail.tsx`（379，`:124` / `:125`）· `NotePreviewView.tsx`（312，`:158`）· `VersionPanel.tsx`（`:81`）
- Modify：`app/src/components/FeedFragmentList.test.tsx`（`:143,155` 打桩 `window.confirm`）
- Create: `app/src/components/confirmMigration.test.tsx`（**≤220 行**）
- 产出（不入库）：`tmp/t11/confirm-map.md`（8 处逐条：现状文案 · 危险级别 · `impacts` 清单 · `busy` 接线）

**Interfaces:**
- Consumes：`import { ConfirmDialog } from "../ui/primitives";` + `ConfirmDialogProps`（T2 之后含 `tier?`）
- Produces：6 个文件里各一个受控 `open` 状态 + `onConfirm`/`onCancel`/`busy` 接线

- [ ] **Step 1: 逐处判定「迁 / 不迁」（**这是本任务最容易犯错的一步**）**

写一个脚本列出**全部 16 处** `confirm(` 调用（8 处 `window.confirm` + 8 处裸 `confirm(`），逐处判：① 是否 `window.confirm`？② 若不是，是谁的 `confirm`（`@tauri-apps/plugin-dialog` / 局部函数）？③ 语义是不是"确认后执行一个不可逆动作"？**只有三个都成立才迁**；其余**逐条登记理由**（B2 式的"例外必须带理由"）。

- [ ] **Step 2: 逐个迁移（8 处 → 8 个 `ConfirmDialog`，一次一个）**

统一形态（以 `AiProviderSettings.tsx:94` 为例）：

```tsx
// 删：if (!window.confirm("删除后该 Provider 配置与密钥将永久清除，且不可恢复。确定删除？")) return;
// 改为：状态 + 受控弹层
const [pendingDelete, setPendingDelete] = useState<Provider | null>(null);
const [busy, setBusy] = useState(false);
<ConfirmDialog
  open={pendingDelete !== null}
  title="删除 Provider？"
  message="删除后该 Provider 配置与密钥将永久清除，且不可恢复。"   // ← 原文案逐字保留
  impacts={[{ text: "Provider 配置与密钥将永久清除" }, { text: "其它 Provider 不受影响", keep: true }]}
  confirmLabel="删除" cancelLabel="取消"
  busy={busy}
  onConfirm={() => void doDelete()}    // ← 原逻辑逐字搬入，前后加 busy
  onCancel={() => setPendingDelete(null)}
  testId="ai-provider-delete-confirm"
/>
```
**逐处必做三条**：① **原文案逐字保留**（它是用户可见文本，改它就是行为变化）；② **`impacts` 必填**（§5.3 的硬要求；若该动作**没有**级联影响 ⇒ 至少给一条保留项 `keep: true`，例「其它数据不受影响」）；③ **`busy` 接线**（动作进行中两个按钮不可点 —— `ConfirmDialog` 已实现，调用点必须真的把 `busy` 置起来，否则重复点击会重复执行）。

- [ ] **Step 3: `FeedFragmentList.test.tsx` 的处理**

它用 `vi.spyOn(window, "confirm")` 打桩 ⇒ 迁移后**打桩失效**。**授权改写**：把"桩返回 true/false"改成"点击确认/取消按钮"（`fireEvent.click`），**用例数与断言强度不减**；若该文件还有**非 testid 的断言**必须改 ⇒ **STOP**。

- [ ] **Step 4: `confirmMigration.test.tsx`（机器判据）**

① 6 个文件里 `window.confirm` 的命中 = **0**（剥注释后判）；② 6 个文件都 import 了 `ConfirmDialog`；③ 8 个迁移点都传了 `impacts`（`impacts={` 的出现次数 ≥ 迁移点数）；④ 全仓 `window.confirm` 的**剩余命中 == 登记的例外集**（预期 **0**，若有例外则逐条写明）。
**自检**：阳性对照（在人工夹具里写一个 `window.confirm(` 必须被命中）+ 阴性对照。

- [ ] **Step 5: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 某处恢复 `window.confirm` ⇒ | ①② 红 |
| M2 | 某处删掉 `impacts` ⇒ | ③ 红 |
| M3 | 某处不接 `busy`（动作中可重复点）⇒ | 新用例红（**本任务必须为"重复点击只执行一次"补一条用例**） |
| M4 | 把原文案改一个字 ⇒ | 文案断言红（**若原来没有文案断言 ⇒ 本任务补一条**） |

- [ ] **Step 6: B9 声明 + 八门禁 + 提交**（subject `refactor(ui): replace window confirm with dialog` = **48** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/confirmMigration.test.tsx` | 全绿 |
| V2 | 脚本：全仓 `window\.confirm\s*\(`（剥注释） | **0 命中**（阳性对照必须命中人工夹具） |
| V3 | `cd app; npx vitest run src/components/FeedFragmentList.test.tsx src/components/AiProviderSettings.test.tsx`（若有）`…` | 全绿；用例数不减 |
| V4 | 脚本：6 个文件的 `impacts={` 计数 | ≥ 该文件的迁移点数 |
| V5 | 变异体 M1–M4 | 4/4 红 + CONTROL 绿 |
| V6 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减；**唯一允许改的是 `FeedFragmentList.test.tsx` 的打桩方式**（逐 hunk 列给评审） |
| V7 | 八门禁 | 逐条 exit 0 |
| V8 | `tmp/t11/confirm-map.md` | 16 处逐条判定（迁 8 / 不迁 8 + 理由） |

---

### Task 12: `Button`：`*Btn*` 常量族迁移（103 行 / 37 文件）

> **B4 的范围与余量逐字**：本批走「`*Btn*` 常量族 + 本批新代码 + **棘轮冻结余量**」；规格 §5.1 的「107 处 / 63 文件」**口径不可考** ⇒ 计划显式改判为「**`const *Btn*` 常量族 80 行 / 55 文件；其中被 `style={xxxBtn}` 消费的 `<button>` 103 行 / 37 文件**」，余量（**510 − 103 ≈ 407 处**）登记给**批 5/7** 并附棘轮读数。
> **本任务必须在 T5–T8 之后**（37 个文件里有 4 个是刚迁完的弹层；先迁弹层再迁按钮，避免同一文件被两个任务先后重写）。

**Files:**
- Modify: **37 个文件**（`tmp/t1/callsites.txt` §B 的完整清单；含 `pages/GoalsPage.tsx`）
- Create: `app/src/ui/primitives/buttonMigration.test.ts`（**≤220 行**）
- 产出（不入库）：`tmp/t12/button-map.md`（37 文件逐条：删掉的常量 · 新 `Button` 的 `variant`/`size` · 余量读数）

**Interfaces:**
- Consumes：`import { Button } from "../ui/primitives";` + `ButtonProps{ variant?: primary|secondary|ghost, size?: sm|md|lg, disabled?, busy?, block?, icon?, title?, testId?, className?, style? }`
- Produces：37 个文件里 `*Btn*` 常量与 `style={xxxBtn}` 的命中归零（**未被消费的常量一并删除**）

- [ ] **Step 1: 生成逐处映射表（脚本）**

按 `tmp/t1/callsites.txt` §B 逐行列出 103 处，给每处填：① 原常量名与它的样式（padding / fontSize / background / color / cursor）；② **映射到哪一档 `variant` × `size`**（判定规则：有底色 ⇒ primary；白底带边框 ⇒ secondary；无边框无底色 ⇒ ghost；`fontSize` ≤12 ⇒ `sm`，13–14 ⇒ `md`，≥15 ⇒ `lg`）；③ 该文件剩余的其它原生按钮（**不动**，登记进余量）。
> ⚠️ **`cursor: "pointer"`**：现状 300 处内联 —— **`Button` 的四态与光标由类给**，迁移时**删掉**内联 `cursor`；**若某处的 `cursor: "pointer"` 挂在非 `<button>` 元素上 ⇒ 不属于本任务**（登记）。

- [ ] **Step 2: 逐文件迁移（一次一个文件）**

```tsx
// 删：const ghostBtn: React.CSSProperties = { padding: "4px 10px", fontSize: 12, cursor: "pointer", … };
// 删：<button style={ghostBtn} onClick={…}>修订建议</button>
// 改：<Button variant="ghost" size="sm" onClick={…}>修订建议</Button>
```
① **文案 / `onClick` / `disabled` / testid 一字不改**；② 若原来是 `disabled={busy}` ⇒ 改判 `busy={busy}`（**语义分离**：`Button` 的 `busy` 保留焦点与 Tab 序，不设原生 `disabled`）；③ 常量若在别处还被引用（如 spread 进别的对象）⇒ **保留并按兵不动**，只改被 `style={}` 消费的那些。

- [ ] **Step 3: `buttonMigration.test.ts`（三条判据）**

① 37 个文件里 `style={xxxBtn}` 的命中 = **0**；② 37 个文件里 `const *Btn*` 的**孤立常量**（无消费者）= 0（**允许残留"仍被别处引用"的常量**，逐条列白名单）；③ 棘轮读数：全仓原生 `<button>` 从 **510** 降到 **510 − 迁移处数**（**报告实测值**，并写进 `tmp/t12/button-map.md` 作为登记给批 5/7 的余量）。

- [ ] **Step 4: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 某文件恢复 `style={ghostBtn}` 的 `<button>` ⇒ | ①② 红 |
| M2 | 把 `variant="primary"` 改成 `"secondary"` ⇒ | **本轮不红**（观感无测试面）⇒ **必须补一条结构判据**：映射表（`文件:行 → variant/size` 三元组）用脚本与源码对拍 |
| M3 | 某处 `<Button>` 忘记删内联 `cursor` ⇒ | 若该文件的原生残留判据存在则红；**否则登记为"观感项、归批 8 像素探针"** |
| M4 | 棘轮基线被手改（510 → 520）⇒ | 基线常量断言红（T1 已钉 `FROZEN_NATIVE_BUTTON_TOTAL === 510`） |

- [ ] **Step 5: B9 声明 + 八门禁 + 提交**（拆两条：`refactor(ui): migrate button style constants`（**47** ✅）+ 余量登记提交）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/buttonMigration.test.ts src/ui/primitives/nativeButton.ratchet.test.ts` | 全绿 |
| V2 | 脚本：37 文件 `style={xxxBtn}` 命中 | **0**（逐文件打印） |
| V3 | 脚本：全仓原生 `<button>` 计数 | 报告**实测**数字 + **Δ（相对 510）** + 逐文件明细；**新计数必须 ≤ 510** |
| V4 | 映射表对拍脚本 | 源码的三元组集合 == `button-map.md` 的表（双向差集为空） |
| V5 | 变异体 M1–M4 | **能红的必须红**；M2/M3 的"不红"必须在报告里**明说**（不许假装有牙） |
| V6 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减 |
| V7 | 八门禁 | 逐条 exit 0；首屏 Δ + 机理（37 个文件多为懒 chunk） |
| V8 | `tmp/t12/button-map.md` | 103 处逐条 + 余量读数 + 去向（批 5/7） |

---

### Task 13: `EmptyState` 切片迁移 + 棘轮（含 `13-b` `ChatPage` 拆件）

> **§11-3 的口径**：「空态 / 加载 / 错误行 / 弱化文本 / 卡片边框 五类重复 → **各自 1 个原语**」是**跨批次终局口径**；批 4 的**中间判据见 §待裁决清单 R2**（本任务按 **(B) 切片 + 棘轮**执行；若控制方选 (A) 全量，本任务的切片即"全部 33 文件"，步骤不变、只是清单变长）。
> **切片判据（机器可算）**：`切片 = ① 本批已触碰文件 ∪ ② pages/** ∪ ③ 该类中有同名测试的文件`；**其余 = 棘轮冻结 + 余量登记**。
> **`13-b` 单列**：`ChatPage.tsx` **599/600**，B7 要求**先拆件、再迁移**（两个原子提交）。

**Files:**
- Create: `app/src/ui/primitives/emptyStateRatchet.test.ts`（**≤240 行**）
- Modify: 切片内的空态文件（基线 **44 处 / 33 文件**；切片外的登记）
- **13-b**：Create `app/src/components/chat/ChatLaunchMenu.tsx`（**≤160 行**）+ `ChatLaunchMenu.test.tsx`（**≤140 行**）；Modify `app/src/pages/ChatPage.tsx`（599 → **必须净减**）
- 产出（不入库）：`tmp/t13/slice.md`（切片清单 + 每处的 title/description/action 决策 + 棘轮读数）

**Interfaces:**
- Consumes：`EmptyState`（T3 之后：+ `align?`）；`Button`（T12 之后）
- Produces：`emptyStateRatchet.test.ts`（冻结余量 + 每处"必须走原语"的清单）

- [ ] **Step 1: 产出切片清单（脚本）**

```powershell
node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/t13/slice.mjs --kind empty
```
输出：**切片内文件**（逐条：`文件:行` · 现文案 · 是否有同名测试）· **切片外文件**（计数 + 名单）· 两者之和 == **44 处 / 33 文件**（自检：不等 ⇒ 脚本口径坏了）。

- [ ] **Step 2: 逐处迁移（每处三件事）**

```tsx
// 删：{loaded && cards.length === 0 && (<div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>还没有目标</div>)}
<EmptyState
  title="还没有目标"
  description="把想学的东西写下来，开始第一次冲刺"        // ← 新增的一句"下一步"（规格 §5.1 的病灶正是"没有出路"）
  icon="goals"
  action={{ label: "新建目标", onClick: openCreate }}      // ← 主行动：首启路径必须有
  compact={/* 列表行/侧栏内为 true */}
  align={/* 原 textAlign: "center" ⇒ center；"left" ⇒ start */}
/>
```
三条纪律：① **`title` 用原文案**（用户可见文本不许改写，除错别字）；② **`action` 必给**（除非该空态**结构上**没有出路 —— 那就给 `secondary` 一句提示，并在 `slice.md` 里写明理由）；③ **内联的 `padding`/`fontSize` 不再迁移**（由原语的 `compact` + `Text` 档位吸收；**任何一处仍表达不了的排版 ⇒ 记进 `slice.md` 的"原语缺口候选表"**，≥3 处共用 ⇒ 按 B6 回来改原语，**不许就地开 `className`**）。

- [ ] **Step 3: 棘轮（切片外余量）**

`emptyStateRatchet.test.ts`：① 切片清单为**显式数组**（逐字，供 `slice.mjs` 对拍）；② 切片外文件里"空态词"的命中**计数 ≤ 基线**（逐文件）；③ 新增文件不得含空态词（除非在切片清单里）；④ 全仓空态词**总数 ≤ 44**（**报告实测**）。
**自检**：阳性/阴性对照（人工夹具）。

- [ ] **Step 4（13-b）：`ChatPage.tsx` 先拆件**

① 把 `:480-520` 的发起菜单段（含 `:504/505` 的两条裸 z-index）拆到 `components/chat/ChatLaunchMenu.tsx`（**≤160 行**，行为等价：props 原样搬、文案原样、`data-testid="task-launch-menu"` 保留）；② **顺带**把它的裸 `zIndex: 30 / 31` 改成 `zIndex("popover")`（T4 未做这两处 —— 见 T4 的 Files 说明）；③ `ChatPage.tsx` **必须净减**（599 → 目标 ≤590）；④ **新文件 + 新测试**，`ChatPage.tsx` 的新增只允许 import + 一行 JSX。
**提交 1**：`refactor(chat): extract launch menu from chat page`（**49** ✅）
**Step 5（13-b 续）：再迁移**（此时才允许把 `ChatPage` 的空态/按钮换成原语）**提交 2**：`refactor(chat): migrate chat page empty states`（**46** ✅）

- [ ] **Step 6: 变异体**

| # | 变异 | 期望 |
|---|---|---|
| M1 | 切片内某处恢复手写空态 ⇒ | ① 红 |
| M2 | 棘轮基线调高 1 ⇒ | ② 红 |
| M3 | 新文件里写"暂无…"⇒ | ③ 红 |
| M4 | `ChatLaunchMenu` 的 props 少传一个 ⇒ | `tsc --noEmit` 红（**vitest 不暴露**） |
| M5 | 把 `ChatPage.tsx` 的拆件与迁移合并成一个提交 ⇒ | **流程违规**（报告里自陈；判据由 T18 核提交数） |

- [ ] **Step 7: B9 声明 + 八门禁 + 提交**

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/emptyStateRatchet.test.ts` | 全绿 |
| V2 | `node tmp/t13/slice.mjs --kind empty` | 切片内 + 切片外 == **44 处 / 33 文件**（自检通过） |
| V3 | 脚本：切片内文件的空态词命中 | **0**（逐文件打印） |
| V4 | `countLines()`：`ChatPage.tsx` **≤590 且 < 599** · `ChatLaunchMenu.tsx` ≤160 | 三条都真 |
| V5 | `cd app; npx vitest run src/pages/ChatPage.test.tsx`（若有）`src/components/**` | 全绿；用例不减 |
| V6 | 变异体 M1–M5 | 4/4 红 + M5 自陈；CONTROL 绿 |
| V7 | 八门禁 | 逐条 exit 0；既有 1370 逐文件不减；**提交数 = 2**（拆件 / 迁移） |
| V8 | `tmp/t13/slice.md` | 切片清单 + 逐处决策 + 棘轮读数 + **原语缺口候选表**（若有 ≥3 共用 ⇒ STOP 报 B6 判定） |

---

### Task 14: `Loading` / `Skeleton` 切片迁移 + 棘轮

> **§5.1 的病灶逐字**：「全站 **0 骨架屏**，长任务只有一行灰字」；规格 §5.1 的账本数 = 「85 处 / 30 文件」，实测既有口径 **88 行 / 31 文件**，而**真迁移面 = 可见文案 19 行 / 19 文件**（侦察口径 18）+ **布尔门控 9 行 / 5 文件**（占位渲染位）。
> **分工口径（规格 §1 决策 11 保留的两条旧规格）**：**骨架 = 已知结构**（列表/表格的占位 ⇒ `Skeleton`）· **探针 = 时长未知**（长任务 ⇒ `Probe`）· **一行灰字 = `Loading`**。**逐处按这个三角判定**，不许一律换成 `Loading`。

**Files:**
- Modify: 切片内的加载态文件（**19 个可见文案文件为底**；门控 5 文件视结构决定）
- Create: `app/src/ui/primitives/loadingRatchet.test.ts`（**≤220 行**）
- 产出（不入库）：`tmp/t14/slice.md`（19 处逐条：现状文案 · 目标原语 · 是否该用骨架屏 · 理由）

**Interfaces:**
- Consumes：`import { Loading, Skeleton, Probe } from "../ui/primitives";`（`LoadingProps{ label?, inline?, testId? }` · `SkeletonProps{ lines?, width?, height?, testId? }` · `ProbeProps{ label?, testId? }`）
- Produces：`loadingRatchet.test.ts`

- [ ] **Step 1: 切片清单 + 逐处三角判定**（脚本 `tmp/t14/slice.mjs --kind loading`，与 T13 同一支）
- [ ] **Step 2: 逐处迁移**

```tsx
// 删：if (!detail) return <div style={{ padding: 24, fontSize: 13, color: "#9ca3af" }}>加载中…</div>;
<Loading label="加载中…" />                       // ← 原文案逐字保留（它是用户可见文本）
// 列表/表格的占位（已知结构）：
if (!detail) return <Skeleton lines={4} />;        // ← 只有"结构已知"才用骨架屏
```
① **`label` 默认值是「加载中…」**（`Loading.tsx` 的契约）⇒ 文案一致时**不必显式传**，但**若原文案不同（如「成本预估加载中…」）⇒ 必须显式传**（不许被默认值吃掉）；② **`data-testid="group-delete-loading"` 是反例锚**（`Loading.tsx:8-14` 自述：它渲染的是**文字而不是加载态**）⇒ **判据要看内容，不要按 testid 判**；③ 若某处的"加载中"其实是**按钮内的忙碌态** ⇒ 应改 `Button busy`（**不是** `Loading`），登记进 `slice.md`。
- [ ] **Step 3: 棘轮**（切片外计数 ≤ 基线；总数 ≤ 88；新增文件不得含加载词）
- [ ] **Step 4: 变异体**（M1 恢复手写灰字 ⇒ 红 · M2 把 `label` 删掉导致文案变化 ⇒ 文案断言红 · M3 棘轮基线调高 ⇒ 红 · M4 把 `Skeleton` 用在结构未知处 ⇒ **需人工判**，登记）
- [ ] **Step 5: B9 声明 + 八门禁 + 提交**（subject `refactor(ui): migrate loading placeholders` = **43** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/loadingRatchet.test.ts` | 全绿 |
| V2 | `node tmp/t14/slice.mjs --kind loading` | 切片内 + 切片外 == **19（可见文案）+ 9（门控）= 28 行 / 24 文件**；**与既有口径 88 行的差额逐条说明** |
| V3 | 脚本：切片内文件的可见加载文案命中 | **0**（`Loading.tsx` 自身除外） |
| V4 | 脚本：`Skeleton` / `Probe` 的使用点 | 各 ≥1（**否则"0 骨架屏"这条病灶没被真的动过** ⇒ 报告须解释为什么） |
| V5 | 变异体 M1–M4 | 3/3 能红的都红 + CONTROL 绿；M4 的判定写进报告 |
| V6 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减 |
| V7 | 八门禁 | 逐条 exit 0；reduced-motion 覆盖率不变（**迁移不新增原语类** ⇒ `motion-coverage` 必须仍绿） |
| V8 | `tmp/t14/slice.md` | 19 处逐条三角判定 + 棘轮读数 + 余量去向 |

---

### Task 15: `StatusLine` 切片迁移 + 棘轮（含「错误行的位置」观察项）

> **§5.1 的病灶逐字**：「196 处 / 76 文件 · **三种红并存**；**错误常在列表最底部（视觉盲区）**」。实测：文案 ∧ setter = **190 行 / 80 文件**；三红 hex = **179 处 / 100 文件**；`role="alert"` = **0**。
> ⚠️ **两条必须写进报告的限度**：① `StatusLine` **无法自动解决"位置"问题** ⇒ 位置是**调用点的结构决策**，本任务**只登记**每处错误行的位置（顶部/内联/底部）与"是否在视觉盲区"，**不改布局**（改布局属批 5 的视图层）；② `StatusLine` 的接缝是**一次性 `transition`（无循环动画）**（ADR-033 的分桶裁定），迁移不会带来循环动效。

**Files:**
- Modify: 切片内文件（基线 **190 行 / 80 文件**）
- Create: `app/src/ui/primitives/statusLineRatchet.test.ts`（**≤240 行**）
- 产出（不入库）：`tmp/t15/slice.md`（逐处：`文件:行` · 文案 · 三红 hex · 位置分级 · 目标 `kind`）

**Interfaces:**
- Consumes：`StatusLineProps{ kind?: "error"|"warn"|"info"|"ok", children, detail?, action?, testId? }`（**`error` 用 `--ed-stamp` 作文字色；原语不渲染按钮** ⇒ "不能有按钮底色"是结构保证）
- Produces：`statusLineRatchet.test.ts`

- [ ] **Step 1: 切片清单 + 三红 hex 的去向（脚本）**

逐处判定 `kind`：`#e11d48/#dc2626/#ef4444/#b91c1c/#d32f2f/#c62828/#f43f5e`（**179 处**）—— 处于"错误提示"语境 ⇒ `error`；"警告/注意" ⇒ `warn`；"成功/完成" ⇒ `ok`；其余（品牌色 `#0f766e` / `#0d9488` 等）⇒ **不动**（它们不是语义状态色）。**逐值给一张对照表**（哪个 hex 判成哪一档、几处）。

- [ ] **Step 2: 逐处迁移**

```tsx
// 删：{err && <div style={{ color: "#dc2626", fontSize: 12, padding: 8 }}>{err}</div>}
{err && <StatusLine kind="error">{err}</StatusLine>}     // ← 文案逐字保留（不许改成"操作失败"之类）
// 需要"下一步怎么办"时：
<StatusLine kind="error" action={<Button size="sm" onClick={retry}>重试</Button>}>{err}</StatusLine>
```
⚠️ **`StatusLine` 不渲染按钮**（`action` 是纯插槽）⇒ 需要按钮时**由调用点给**（这保持了"错误色绝不进按钮底色"的结构保证）。

- [ ] **Step 3: 棘轮**（切片外三红 hex 计数 ≤ 基线；总数 ≤ 179；新增文件不得含三红 hex）
- [ ] **Step 4: 变异体**（M1 恢复手写红字 ⇒ 红 · M2 把 `kind="error"` 改成 `"info"` ⇒ 墨度断言红（**若无此断言 ⇒ 补一条：`error` 档必须走 `--ed-stamp` 文字色**）· M3 把按钮塞进 `action` 之外导致底色变红 ⇒ 结构判据红）
- [ ] **Step 5: 位置登记（本任务的第二产出）**：`tmp/t15/slice.md` 里给一张**位置分级表**（顶部 / 内联 / 列表底部）+ **"位于列表底部"的清单**（规格点名的视觉盲区）⇒ **T18 把它写进 follow-ups**（批 5 的视图层处理）。
- [ ] **Step 6: B9 声明 + 八门禁 + 提交**（subject `refactor(ui): migrate error lines to status line` = **48** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/statusLineRatchet.test.ts` | 全绿 |
| V2 | 脚本：切片内文件的三红 hex 命中 | **0**（逐文件打印）；**未迁移的逐值计数一并打印** |
| V3 | 脚本：`role="alert"` 的命中 | 迁移后 = `StatusLine` 的 N 处 + `ShellFallback` 的 1 处（**逐条列出**；原来全仓 0 ⇒ 这是**新增的无障碍收益**，写进报告） |
| V4 | 变异体 M1–M3 | 3/3 红 + CONTROL 绿 |
| V5 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减（⚠️ 侦察登记：**17 个测试文件含错误文案断言** ⇒ 逐个核对是否因 `children`/`detail` 拆分而失效，**若失效 ⇒ STOP**） |
| V6 | `cd app; npx vitest run src/ui/primitives/motion-coverage.test.ts` | 绿（`StatusLine` **不进 keyframes 桶**，这是 ADR-033 的分桶裁定） |
| V7 | 八门禁 | 逐条 exit 0 |
| V8 | `tmp/t15/slice.md` | 逐处表 + hex 对照表 + **位置分级表**（含"列表底部"清单） |

---

### Task 16: `Text` 弱化文本切片 + 字号棘轮（604 越界**只冻结**）

> **§11-3 的五类里，`Text` 对应的是「弱化文本」**（实测 `#9ca3af` **296 处 / 105 文件**）；规格 §5.1 的病灶逐字是「字号与两个灰手写组合，**对比度逐处失控**」。
> **字号越界（604 处 <12px / 124 文件）本批只上棘轮，不做迁移**：规格 §4.2 的规则是「**下界 12px** 约束正文与界面文字；**10px / 11px 一律消灭**」—— 那是 **604 处的观感一次性改**，且**无任何测试面**（`fontSize` 断言几乎为零）⇒ 按 R2 的切片原则收窄，**映射规则与规模在本任务里写清楚**，执行登记给批 5/6（批 6 会重排动效与字距，届时一并做更合理）。

**Files:**
- Modify: 切片内的弱化文本文件（基线 **296 处 / 105 文件**）
- Create: `app/src/ui/primitives/textRatchet.test.ts`（**≤260 行**：弱化文本冻结 + **字号越界冻结 604**）
- 产出（不入库）：`tmp/t16/slice.md`（逐处：`文件:行` · 原样式 · `tone` 目标 · 为什么不是 `ink-4`）

**Interfaces:**
- Consumes：`TextProps{ size?: 1..6, tone?: "ink-1"|"ink-2"|"ink-3"|"ink-4"|"stamp"|"ok"|"due"|"link"|"inherit", font?: "ui"|"body"|"mono", truncate?, as? }`
- Produces：`textRatchet.test.ts`（两条棘轮：弱化文本 + **字号越界 604**）

- [ ] **Step 1: 切片清单 + `tone` 判定（**这一步有可及性红线**）**

`#9ca3af` 在**白底**上实测对比度 ≈ **2.54:1**（远低于 4.5:1 正文线，而它就是"弱化文本"的现状）。判定规则：
| 语境 | 目标 | 依据 |
|---|---|---|
| 次要说明 / 元数据（**承载信息**） | `tone="ink-3"`（面 **5.13:1**） | 规格 §4.1 的「已重打分」档；**信息必须可读** |
| 占位符 / 禁用提示（**不承载关键信息**） | `tone="ink-4"`（面 **3.22:1**）+ **必须满足 §4.3 三条规则** | `ink-4` 是**过渡态**：① 不得承载唯一关键信息 ② 任何交互立即升到正文墨度 ③ 审校模式全部升到 ≥4.5:1 |
| **位于剪报底纹之上** | **只许 `ink-3` 及更深**（`ink-3`/`ink-2`/`ink-1`） | §4.4 写死的规则：`ink-4` 在剪报底亮档只有 **2.8489**，**连 3:1 例外都不满足** |
> ⚠️ **任何一处判不出语境 ⇒ 记进 `slice.md` 并 STOP 报控制方**（判错 = 把 3.22:1 用在关键信息上，这是 §13 风险表点名的风险）。

- [ ] **Step 2: 逐处迁移**（`fontSize` 一并换成 `size={n}` **当且仅当**该值落在六档字阶上；**不落在档上的（11/10.5/9/12.5…）本批不换**，只登记 —— 见 Step 4）
- [ ] **Step 3: 棘轮一（弱化文本）**：切片外 `#9ca3af` 计数 ≤ 基线；总数 ≤ 296；新增文件不得含该字面量
- [ ] **Step 4: 棘轮二（字号越界 604）**：`fontSize: (9|10|10.5|11|11.5)` 的**逐文件计数冻结**（只许减少）+ **总数 ≤ 604**；`tmp/t16/slice.md` 里写下**映射规则**（9/10/10.5/11/11.5 → **12**；11.5 仅在 `font="mono"` 时合法）与**规模**，供批 5/6 直接执行
- [ ] **Step 5: 变异体**（M1 恢复 `#9ca3af` ⇒ 红 · M2 把 `tone="ink-3"` 改成 `"ink-4"` 且该处**在剪报底内** ⇒ **必须红**（这条判据若不存在 ⇒ 补：剪报底容器内的 `Text` 不得用 `ink-4`）· M3 新增一个 `fontSize: 11` ⇒ 棘轮二红 · M4 把 `fontSize: 13`（合法档）改掉 ⇒ **不红**（反例守卫：棘轮只管越界档））
- [ ] **Step 6: B9 声明 + 八门禁 + 提交**（subject `refactor(ui): migrate muted text literals` = **43** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/textRatchet.test.ts` | 全绿（**两个棘轮各自的用例分开**，便于单点失败定位） |
| V2 | 脚本：切片内文件 `#9ca3af` 命中 | **0** |
| V3 | 脚本：全仓 `fontSize: (9|10|10.5|11|11.5)` 计数 | **≤604**，并打印**逐文件明细**（这是给批 5/6 的工作量底稿） |
| V4 | `cd app; npx vitest run src/ui/contrast.test.ts src/ui/primitives/style-contract.test.ts` | 绿（`ink-4` 的禁区规则**没有**被本任务放宽） |
| V5 | 变异体 M1–M4 | 3/3 该红的红 + M4 不红（反例守卫）+ CONTROL 绿 |
| V6 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减 |
| V7 | 八门禁 | 逐条 exit 0；首屏 Δ + 机理 |
| V8 | `tmp/t16/slice.md` | 逐处表 + `tone` 判定理由（**含"为什么不是 ink-4"**）+ **字号映射规则与 604 的规模** |

---

### Task 17: `Surface` 卡片边框 / 圆角切片 + 棘轮

> **§11-3 的五类里，`Surface` 对应「卡片边框」**（实测 `1px solid #e5e7eb` **180 处**；计划者探针含复合写法 258 行 / 111 文件）；规格 §5.1 的病灶逐字：「`1px solid #e5e7eb`，**radius 6/8/10/12 混用**」。实测 `borderRadius` **583 处 / 134 文件 / 11 个不同值**（越界值：`6×275` · `12×16` · `14×1` · `999×4` · `2×8` · `0×1`；四档 = **3 印章 / 5 控件与卡 / 8 面板 / 10 浮层**）。
> **阴影红线（规格 §4.1 逐字）**：「**批 4 迁移时不得临时硬编码阴影**」⇒ 38 处 `boxShadow` 一律换成 `--ed-shadow-1` / `--ed-shadow-2`（**暗档不用投影，改白色反相描边**），**不许**在调用点写 `boxShadow` 字面量。

**Files:**
- Modify: 切片内的边框/圆角/阴影文件
- Create: `app/src/ui/primitives/surfaceRatchet.test.ts`（**≤260 行**）
- 产出（不入库）：`tmp/t17/slice.md`（逐处：`文件:行` · 原 border/radius/shadow · 目标 `level`/`radius`/token · 判定理由）

**Interfaces:**
- Consumes：`SurfaceProps{ level?: "sunken"|"canvas"|"surface"|"raised", radius?: "stamp"|"control"|"panel"|"overlay", bordered?, interactive?, padded?, as?, className?, style?, testId? }`
- Produces：`surfaceRatchet.test.ts`

- [ ] **Step 1: 切片清单 + 值映射（脚本，逐值给对照表）**

| 现值 | 目标 | 依据 |
|---|---|---|
| `borderRadius: 3` | `radius="stamp"` | 规格 §4.2 四档 |
| `borderRadius: 4` / `5` | `radius="control"`(5) | 4 不在档上 ⇒ 就近取 5（Δ1，登记） |
| `borderRadius: 6` / `8` | `radius="panel"`(8) | 6 越界 ⇒ 8（Δ2，275 处 —— **本任务最大的观感变化**，登记） |
| `borderRadius: 10` | `radius="overlay"` | **值不变** |
| `borderRadius: 12` / `14` / `999` / `2` / `0` | **逐处判**：卡片/面板 ⇒ 对应档；`999`（药丸）⇒ **例外登记**（六档圆角里没有药丸形态 ⇒ 就地用 `style` 的布局口是**禁止**的 ⇒ 按 B6 判：≥3 处共用 ⇒ **回来改原语加一档**，<3 ⇒ 登记并保留字面量） | 规格 §4.2 只给四档 |

- [ ] **Step 2: 逐处迁移**（`<div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>` ⇒ `<Surface>`；**内容一行不动**）
  ⚠️ **`Surface` 的默认值**：`level="surface"` + `radius="panel"` + `bordered=true`（`style-contract` 已钉）⇒ **默认就是"卡片"**，不要画蛇添足传一堆等价参数。
- [ ] **Step 3: `boxShadow` 的归零**（38 处 ⇒ `--ed-shadow-1/2`；**迁移到 `Surface` 时由类给**，调用点删掉 `boxShadow` 字面量）
- [ ] **Step 4: 棘轮**（切片外 `1px solid #e5e7eb` / `borderRadius: 6|12|14|999|2` / `boxShadow: "` 的逐文件计数 ≤ 基线；总数 ≤ 各自基线；新增文件不得含这三类字面量）
- [ ] **Step 5: 变异体**（M1 恢复 `border: "1px solid #e5e7eb"` ⇒ 红 · M2 在调用点写 `boxShadow` 字面量 ⇒ 红（**阴影红线**）· M3 **用行内 `style` 覆盖 `Surface` 的底色** ⇒ 红（ADR-033 §4 的禁令；**这条判据本任务必须补**）· M4 新增一个 `borderRadius: 6` ⇒ 红）
- [ ] **Step 6: B9 声明 + 八门禁 + 提交**（subject `refactor(ui): migrate card surfaces to surface` = **47** ✅）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/surfaceRatchet.test.ts` | 全绿 |
| V2 | 脚本：切片内文件三类字面量命中 | **0**（逐文件打印） |
| V3 | 脚本：全仓 `boxShadow:` 计数 | **≤38**，并打印逐值分布（**18 个不同值 → 期望收敛**） |
| V4 | 脚本：调用点里 `style={{ …background… }}` 覆盖 `Surface` 的命中 | **0**（ADR-033 §4 的机器判据） |
| V5 | 变异体 M1–M4 | 4/4 红 + CONTROL 绿 |
| V6 | `cd app; npx vitest run` | 全绿；既有 1370 逐文件不减 |
| V7 | 八门禁 | 逐条 exit 0；首屏 Δ + 机理 |
| V8 | `tmp/t17/slice.md` | 逐处表 + 值映射对照表 + **`999` 药丸形态的 B6 判定结论** |

---

### Task 18: 验收测量 + 收口（**只改文档；发现缺陷 ⇒ STOP 点名到任务**）

> **本任务是批 4 的最后一个单元，只许改文档**：规格回写 · `docs/versions/v0.22.md` 批次节 · 本计划的 §收口回写 · `docs/adr/ADR-033`（若有遗留观察项）· 豁免表（**仅在 `--write` 有 diff 时**）。
> **铁律**：**不许为了让数字好看而改判据、压读数、或把未做的说成已做**。发现任何生产代码缺陷 ⇒ **STOP，点名到任务编号**（不修）。

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§5.1 / §10 批 4 行 / §11 / §12 / §14，**原文一律保留 + 加注**）
- Modify: `docs/versions/v0.22.md`（「批 4 · 原语迁移」节，**七段结构**）
- Modify: `docs/superpowers/plans/2026-09-12-frontend-redesign-batch4-primitives.md`（追加 §收口回写）
- Modify（条件）: `docs/standards/line-limit-exemptions.md`（**只在 `--write` 有 diff 时**）
- Modify（条件）: `docs/adr/ADR-033` · `docs/adr/ADR-034`（若 T0 发现 MISS ⇒ 只能加注、不能改结论）

**Interfaces:**
- Consumes：全部任务的报告 + `tmp/**` 的读数
- Produces：批 4 的 durable 交付记录

- [ ] **Step 1: 三条验收的机器判据（**逐条给命令 + 原始读数**）**

| # | 验收（规格 §10 批 4 行逐字） | 机器判据 | 必须给的读数 |
|---|---|---|---|
| ① | **`z-index ≤6`** | `cd app; npx vitest run src/ui/zIndex.guard.test.ts` + T4 的 `tier-map.mjs` | 裸 z-index **58 → N**（逐值分布）· **例外集逐条**（3 覆盖层 + 理由）· 六档标尺的 6 个值逐字 · 冻结名单 **58 → N** |
| ② | **`role="dialog"` 20/20** | `cd app; npx vitest run src/ui/primitives/dialogMigration.{a1,a2,b,e}.test.ts` | **20/20**（逐文件列表 + `size` + testid）· ADR-033 的 **28** 与跨行 **34** 并列 · **本批之后的浮层归属等式**：`34 − 20 = 14 = 11 锚定菜单 + 3 覆盖层` |
| ③ | §11-3 的**中间态**（R2 的裁决落地） | 五条棘轮各自的读数 | 五类**各自**的「切片内 → 0 / 切片外余量」+ 棘轮冻结数；**并显式写出"若控制方选 (A) 全量则余量清单在此"** |

- [ ] **Step 2: 八门禁（**在静止干净树上跑**，逐条命令 + exit code + 读数）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
node scripts/docs-check.mjs
node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\...\tmp\t18\cargo.txt"; cargo clippy --all-targets 2>"..\..\.superpowers\...\tmp\t18\clippy.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs
node scripts/bundle-eager-graph.mjs
```
**五条测量纪律（逐条照做）**：① 每个读数带 **HEAD sha + `app/dist` mtime + 采集时刻**；② vitest 判据 = **既有 1370 逐文件一条不许少**（对拍 `tmp/vitest-baseline-perfile.txt`）+ 新增只增不减；③ eager 用 **Δ + 机理**（**真实边用 TS 编译器 API 剔 `import type`**；工具口径并列注明）；④ 首屏**重新 build** 并注明出处、**CSS 不计入判据**（只报告）；⑤ cargo 的负载敏感用例（`ffmpeg::tests::run_captured_handles_large_output`）若超时 ⇒ **两种读数都报**并注明是负载。

- [ ] **Step 3: B1–B10 的落点台账（**逐条给"落到哪个文件/守卫/规格行"**）**

| # | 裁决 | 回写落点（必须具体到文件与节） |
|---|---|---|
| B1 | 11 锚定菜单不迁、只落 `popover` | 规格 §11-2 加注（例外）+ `ADR-033 §7` 的适用对象改为"对话框类" + T1 登记表 + T4 的 `zindex-map.md` |
| B2 | 3 覆盖层不迁、例外登记 | 规格 §11-2 的例外表 + T4 例外表 + T8 的 `CROSS_LINE_34 − DIALOG_20 == 14` 判据 |
| B3 | 验收按 20；28 并列登记 | 规格 §10 批 4 行 + §11-2 的注 + T8 的判据 + `docs/versions/v0.22.md`（消歧归批 8） |
| B4 | Button 范围 + 棘轮 | 规格 §5.1 的 Button 行（**口径变化 + 余量去向**）+ T1 的棘轮 + T12 的实测余量 |
| B5 | barrel + 诚实代价 | 本计划 §收口回写（+3.41 kB 上界 / CSS 不计入 / 测量方式 / dist 时刻）+ `ADR-033 §1` 的引用 |
| B6 | 缺口逐判（≥3 ⇒ 改原语） | 本计划 §表 6 + `ADR-033` 的**观察项条目**（阈值判据写进去）+ T2/T3 的四个结论 |
| B7 | `ChatPage` 先拆后迁 | 本计划的 T13-b + `docs/versions/v0.22.md`（两个提交号） |
| B8 | markdown 归一不并入 | 规格 §12 该行加注（去向 = 批 5/7） |
| B9 | 接受"迁移即上线动效" | 本计划 §收口回写 + `docs/versions/v0.22.md`：**逐字写出"只有接缝、没有纲领；三档强度/双基调/GSAP 在批 6"** |
| B10 | 零新增依赖 | `docs/versions/v0.22.md`（`package.json` 零 diff 的证据）+ 每个任务报告的自陈 |

- [ ] **Step 4: 提交数（**`A^..B` 含左端点口径**）**

```powershell
git rev-list --count 42e88740^..HEAD     # 含左端点（42e88740 是批 3 的收口提交，本批从它之后开始 ⇒ 起点应为 42e88740 的**下一个**提交）
git log --oneline 42e88740..HEAD | Measure-Object -Line
```
⚠️ **口径必须写明**：`docs/versions/v0.22.md` 逐字规定「本行的『12 个提交』= **含左端点**（`git rev-list --count A^..B`）……**本文档批次行一律采用「含左端点」口径（`A^..B`）**」。批 4 的起止 = `42e88740` 之后第一个提交 `..HEAD`；**报实数，不许为落进某个区间而合并提交**。

- [ ] **Step 5: 规格回写（原文保留 + 加注）**

- §5.1 的 Button / Surface / Text / Loading / ConfirmDialog 五行：各加注「**批 4 实测口径**」（S1–S5）；
- §10 批 4 行：加 ✅ 与两条验收的实测读数；**并在同处写 R2 的中间态**；
- §11-2：加 **20 的构成**（A14+B4+E2）+ 例外表（11 菜单 / 3 覆盖层）+ 28/34 的并列口径；
- §11-3：加注「批 4 的中间判据 = R2 的裁决」；
- §12：markdown 归一那行加注（B8）；
- §14：ADR-034 那行加注「✅ 批 4 已补写」（`docs/adr/ADR-034-*.md`）。

- [ ] **Step 6: `docs/versions/v0.22.md` 的批 4 节（七段结构）**

照批 0-A/0-B/批 1/批 2/批 3 的格式：**交付 / 验收 / 规格漂移纠正 / 过程中纠正的计划错误 / 诚实代价（含 B5 的 +3.41 kB 与 B9 的中间态）/ 未做登记 / 提交清单（`A^..B` 含左端点）**。

- [ ] **Step 7: follow-ups（逐条具名归属）**

**必须包含批 3 留下的 19 条里属于批 4 的那些**（批 3 计划 §收口回写 §七）：#2 **`bundle-eager-graph.mjs` 把 `import type` 计成静态边**（批 4 或独立小单元）· #3 **新判据必带变异体**（本计划已强制）· #9 **命令面板 / ShellFallback / AI toast / dock 裸 900**（本批 T9/T10/T4 已做）· #15 「会话详情头改粘性」「笔记工具栏三层合并」**需裁决（批 4/批 5）** · #16 markdown 归一（批 5/7）· #17 **ADR-034**（本批已做）。
**外加本批新登记的**：五类余量（各自计数 + 去向）· 11 锚定菜单的退出语义（含 capture 相 ESC 残留 5 处）· `Text` 的 604 处字号越界（映射规则已写，待批 5/6 执行）· `999` 药丸圆角（若判 <3 ⇒ 保留字面量）· 错误行的**位置**问题（批 5）· `docs/tech-debt/` 未跟踪（待用户裁决）。

- [ ] **Step 8: 收口自检 + 提交**

```powershell
git commit --only -m "docs(spec): close out primitives batch four" -- docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/versions/v0.22.md docs/superpowers/plans/2026-09-12-frontend-redesign-batch4-primitives.md docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md
```
> subject `docs(spec): close out primitives batch four` = **43** ✅

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | 三条验收的判据全部重跑 | ① z-index：裸值 **58 → N**（N ⊆ 例外集）· ② **`role="dialog"` 20/20** · ③ 五类中间态逐类给读数 |
| V2 | 八门禁 | 8/8 exit 0；`vitest` **既有 1370 逐文件一条不少**（脚本对拍，**不是只看总数**） |
| V3 | `git rev-list --count <起点>^..HEAD` | 报**实数**并写明「含左端点」口径；与各任务报告的提交号逐一对上 |
| V4 | 脚本：规格 §5.1/§10/§11/§12/§14 的加注存在性 + **原文未被删改** | 每处加注都在，且原文逐字仍在（**做一次 diff 级核对**：删掉的行必须是 0） |
| V5 | `node scripts/docs-check.mjs` | exit 0（新增链接全部可达；**新增的 ADR 必须进 `docs/adr/README.md` 索引**） |
| V6 | B1–B10 台账 | 10 条各有具体落点（文件 + 节），**无"已处理"之类的含糊话** |
| V7 | follow-ups 表 | 含批 3 的 #2/#15/#16/#17 四条 + 本批新增 ≥6 条，逐条有归属 |
| V8 | `git show --stat HEAD` | **只有文档路径**；**若含任何 `app/src/**` ⇒ 违规**（本任务只改文档） |
| V9 | 报告含「未验证」单列 | 真机/WebView2 未跑（用户已裁决跳过）· 像素证据归批 8 · `file://` 无 `__TAURI__` 的参考项 —— **逐条写清是"仪器不可达"还是"本批未做"**，**不许出现"已在真机确认"类表述** |

---

## 自审记录（计划者自查，不属执行范围）

- **规格覆盖**：§10 批 4 行的七类 → T5–T8（20 弹层）· T13（44 空态）· T14（85/88 加载）· T15（196 错误行）· T10（4 toast）· T11（2 confirm）· T12（Button）+ T16（Text）+ T17（Surface）；两条验收 → T18 ①②。§11 适用条目 → T18（1 行数红线由八门禁覆盖；2 弹层/z-index → ①②；3 五类 → R2 + 五条棘轮；4 CSS 变量/hex → **本批不新增 token 消费面**，只在 T16/T17 里让调用点落到既有 token；5 reduced-motion → T14 V7；11 三条命令 → 八门禁）。§5.2 的**四条批 0-D 新契约** → Global Constraints + T2/T3/T5–T8。§5.3 删除语义 → T11（`impacts` 必填）。
- **非目标覆盖**：不建视图层（全批无 `ViewSpec`/`viewRegistry`/`ViewSwitcher`）· 不装 GSAP（全批 CSS 断言里无新 `@keyframes`；`motion-coverage` 必须保持绿）· 零 Rust 改动（cargo 逐字持平）· 不并入 markdown 归一（全批零触碰）。
- **B1–B10 覆盖**：逐条落到 §Global Constraints 的表 + T18 Step 3 的落点台账。**没有任何一条被绕过**；B8/B9 的"登记/声明"义务分别落在 T18 Step 5 与每个任务 Step 6。
- **类型一致性**：`ModalProps`（T2 后签名不变）在 T5–T9 消费 · `ConfirmDialogProps.tier`（T2）在 T11 消费 · `ToastPlacement` / `EmptyStateAlign`（T3）在 T10/T13 消费 · `FROZEN_NATIVE_BUTTON_*` / `SPLIT_MOVES`（T1）在 T12/T13-b 消费 · `DIALOG_20` / `ADR033_28` / `CROSS_LINE_34`（T8）在 T18 消费。**无第五种写法。**
- **占位符扫描**：T5–T17 的"统一形态"代码块都是**骨架 + 逐条要点**（不是 `TBD`），每条要点都有对应 V 断言；**没有"类似 Task N"的引用**（T6/T7 明确写了"与 T5 同构"并各自列了自己的 Files/Verification）。
- **计划预算 vs 硬限**：每个新文件都给了预算行数，并在 Global Constraints 里**明写"预算是估算、绑定约束是 ≤300 且不新增豁免登记"**（批 3 已有 4 例突破预算被控制方接受）。
- **风险最高的四处已就地标注**：T7（R3 的 1200 → 720）、T10（R4 的三条断言改写）、T13-b（599/600 的拆件）、T16（`ink-4` 的可及性红线 —— 判错就是把 3.22:1 用在关键信息上）。
- **四处待裁决**：R1（ADR-034 归属，已按控制方 14:20 裁决执行）/ R2（五类中间判据 —— **本计划的实际边界**）/ R3（`RefineWorkbench` 宽度）/ R4（批 3 守卫的授权改写）。**R2 与 R3 不裁决则 T13–T17 与 T7 不能开工**。

---

## 收口回写（Task 18 —— 留给收口单元）

> 本节由**收口单元**在 Task 18 追加。上文一律**保留不改**，本节只做**终态读数**与**归账**。
> **格式要求**（照批 3）：一律给「命令 + exit code + 原始读数 + 出处（HEAD sha / `app/dist` mtime / 采集时刻）」。

### 一、三条验收的判据与读数
（① `z-index ≤6` 的裸值 58 → N + 例外集 ② `role="dialog"` 20/20 + 20 清单 + 28/34 并列 ③ 五类的中间态：切片内 → 0 / 切片外余量 / 棘轮冻结数）

> **读数出处**：`HEAD = 199da54b` · 干净树（`git status --porcelain` = 仅 `?? docs/tech-debt/`）· `app/dist` mtime **2026-09-12 19:54:33**（**本节真实构建产出**，`node scripts/check-bundle-budget.mjs`，非 `--no-build`）· 采集时刻 **2026-09-12 19:52–19:56**。

| # | 验收（规格 §10 批 4 行逐字） | 机器判据（命令 + exit） | 读数 | 判定 |
|---|---|---|---|---|
| ① | **`z-index ≤6`** | `node tmp/t4/count-bare-zindex.mjs`（exit 0） | **裸数字 z-index = 3 处 / 3 文件 / 3 个不同值**（原 **58 处 / 43 文件 / 17 值**）；逐值分布 = `10` · `999` · `1000`（**升序，各 1 处**）；逐处 = `components/CaptureOverlayPanel.tsx:144`(10) · `components/ImagePreviewOverlay.tsx:32`(1000) · `components/ScreenSelectOverlay.tsx:149`(999) | ✅ **N=3 ⊆ 例外集**（3 条 = 例外全集） |
| ① | 例外集逐条（B2，带理由） | `cd app; npx vitest run src/ui/zIndex.guard.test.ts`（exit 0，**7 用例**） | `ZINDEX_ACCOUNTS` 恰 **3** 条，且每条 `why` >20 字（判据 ④ 双向：注册表 ↔ 冻结名单一一对应 + 逐行对拍）：① `CaptureOverlayPanel` 采集覆盖层**子操作条**（嵌在全屏采集面内部，迁档会踢出「覆盖层内部层」语义）② `ImagePreviewOverlay` 系统交互面（迁 `modal(300)` 会让 92vw 大图落到对话框档之下）③ `ScreenSelectOverlay` 全屏十字光标屏幕点选（迁档会让采集面被任何弹层盖住） | ✅ 3/3 带理由 |
| ① | **六档标尺 6 个值（逐字）** | `app/src/ui/zIndex.ts` 的 `Z_TIER` | `raised 10` · `panel 100` · `popover 200` · `modal 300` · `modalNested 400` · `toast 500`（**恰 6 档**） | ✅ ≤6 档 |
| ① | **冻结名单 58 → N** | `zIndex.guard.test.ts` ①（只许减）+ ②（无过期项） | `FROZEN_NUMERIC_ZINDEX` **58 → 3 条**（T4 收到 5 = 例外 3 + B7 委托 2；**T13-b 已把 2 条委托收口** —— `ChatPage:504/505` 随「发起菜单」拆进 `components/chat/ChatLaunchMenu.tsx` 并改用 `zIndex("popover")`，注册表里的 `delegated` 档**整体结清**） | ✅ 名单 = 例外集 |
| ① | 分档去向（T4 的中间态，供审计） | `node …/tmp/t4/tier-map.mjs`（**⚠️ 见下方「仪器陈旧」说明**） | T4 当时：**53 处落档 / 40 文件**，分档 `{"panel":2,"raised":3,"popover":26,"modal":22}` + 例外 3 + 委托 2 | ⚠️ 见注 |
| ② | **`role="dialog"` 20/20** | `cd app; npx vitest run src/ui/primitives/dialogMigration.{a1,a2,b,e}.test.ts src/ui/zIndex.guard.test.ts`（exit 0） | **5 文件 / 77 用例全绿**（a1=6 · a2=31 · b=18 · e=15 · zIndex.guard=7）；`.e` 的三条清单判据：① `DIALOG_20` 20 个文件**全部只经原语**（barrel 含 `Modal` ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 `keydown` ∧ 无裸 z-index）；② `20/20` 的 `role="dialog"` **由原语唯一持有**（20 个文件 **0 命中** · `Modal.tsx` **恰 1 命中**）；③ `34 − 20 == 14` 且 14 = 11 锚定菜单 + 3 覆盖层（**盘上对拍**） | ✅ 20/20 |
| ② | **20 清单（逐文件 + `size` + `testId`）** | `node tmp/t18/dialog20.mjs`（exit 0；`DIALOG_20` **从 `.e` 的导出数组解析**，不手抄） | 1 `ChatSaveNoteDialog` s/`chat-note-dialog` · 2 `GoalPlanApprovalDialog` l/`plan-approval` · 3 `GraduateDialog` m/`graduate-dialog` · 4 `GroupCreateDialog` s/`group-create-dialog` · 5 `GroupDeleteConfirm` s/`group-delete-confirm` · 6 `InterviewDialog` m/`interview-dialog` · 7 `KnowledgeConceptDialog` **（未声明 ⇒ 默认 m）**/（未声明）· 8 `KnowledgeDecisionForm` m/`decision-form` · 9 `KnowledgeModelDialog` m/`model-dialog` · 10 `KnowledgeSystemWizard` l/`knowledge-wizard` · 11 `ModelCardCreateDialog` s/`model-card-dialog` · 12 `ModelCardFromNoteDialog` m/`model-card-from-note` · 13 `NoteAiDialog` m/`note-ai-dialog` · 14 `PracticeQuestionsOverlays` l/**（未声明）** · 15 `ProofreadPanel` l/`proofread-panel` · 16 `RefineLaunchDialog` l/`refine-launch-dialog` · 17 `RefineWorkbench` l/`refine-workbench` · 18 `SecondPassPanel` l/`second-pass-panel` · 19 `SopRunOverlay` l/`sop-run-overlay` · 20 `TaskLaunchDialog` s/`task-launch-dialog`。**`size` 分布 = s 5 · m 6 + 默认 1 · l 8**；**无 `<Modal>` 的文件 = 0** | ✅ 20/20 |
| ② | **ADR-033 的 28 与跨行 34 并列** | `.e` 的 ③ + 常量自检（长度/排序/去重/盘上存在） | **20**（验收口径）· **28**（ADR-033 同行口径，`ADR033_28`）· **34**（跨行容忍口径，`CROSS_LINE_34`）· **6**（`CROSS_LINE_ONLY_6` = 34−28）；**等式双向**：`28 ⊆ 34 ∧ \|28\| = 28 ∧ 28 == 34 − 6` ∧ `34 − 20 == 14`。28/34 由 `tmp/t8/overlay-lists.mjs` 在 `42e88740` 上**独立复现**（非抄计划） | ✅ 三口径并列 |
| ③ | **五类的中间态**（R2 的裁决落地 = B11「切片 + 棘轮」） | 五条棘轮各自的测试 + 基线常量（见下表） | 见下方**五类终态表** | ✅ **切片内清零 · 切片外余量带去向** |

**① 的仪器陈旧说明（必须读，否则会误判）**：`node tmp/t4/tier-map.mjs` **今日 exit 1（30 项问题）** —— 它校验的是 `tmp/t4/zindex-map.md` 里那份 **T4 时点（`8d84ecfe`）的逐处快照**（`file:line → tier` 三元组），而 T5–T8 把那 53 处迁移点**整段换成了 `<Modal>`**（那一行上已经不存在 `zIndex("…")` 字面量）⇒ 快照按定义失效，**不是**判据/守卫退化（守卫 `zIndex.guard.test.ts` 7/7 绿）。**存活读数 = `count-bare-zindex.mjs` 的 3 处 + 守卫的 3 条例外注册表**；本行的「分档去向」只作 **T4 当时的中间态记录**引用。

**五类终态表（每类：切片内 → 0 / 切片外余量 / 棘轮冻结数）**

| 类 | 目标原语 | 切片（B11 判据） | 切片内 | 切片外余量 | 棘轮冻结数（终态） | 证据 |
|---|---|---|---|---|---|---|
| 空态 | `EmptyState` | **28 文件**（①∪②∪③，`SLICE` 长度硬断言 28） | **0**（② 非例外命中 0） | **例外 8** 条 + **余量 5 文件**（`FROZEN_REST`，冻结值**恰等于实测值**） | 全仓命中 **≤44**（域内 44 行 / 33 文件） | `emptyStateRatchet.test.ts`（7 用例，含 ⑥a 探针双向对拍 / ⑥b 盘上可复算第二源） |
| 加载 | `Loading`/`Skeleton` | **14 文件** | **0**（迁移面 10 文件 0 命中 ∧ 含 `<Loading`） | **8** = 4 backlog 文件 + 3 `button-busy` + 1 例外 | `FROZEN_LOADING_TEXT_TOTAL = 8 == RESIDUAL.length`；冻结表 **18 键**被「迁移面(0) ∪ 残留面(1)」逐格钉死 | `loadingRatchet.test.ts`（8 用例；原 18 行/18 文件） |
| 错误行 | `StatusLine` | **49 文件**（`MIGRATED` 长度硬断言） | **0**（① 逐文件处数 ≥ `MIN_CALLS` 下界，8 个 >1 的键） | 三红字面量 **114 处 / 67 文件**（**剥注释口径**；未剥 116） | `FROZEN_RED_TOTAL = 114`；逐值 `#dc2626`×82 · `#b91c1c`×30 · `#ef4444`×2 | `statusLineRatchet.test.ts`（4 用例）+ `statusLineBaseline.ts` |
| 弱化文本 | `Text` | **100 文件**（行口径） | **0**（迁移 186 处） | **63 处 / 44 文件 / 7 类**（`interactive*` 35 · `ternary-no-equivalent` 10 · `nontext` 6 · `b1-non-migrated` 9 · `tag` 1 · `colorMap` 2 · C 类 2），逐条非空理由 | `FROZEN_MUTED_GRAY_TOTAL = 63`；**字号越界 558 处 / 120 文件只冻结不迁** | `textRatchet.test.ts`（16 用例，双棘轮各 6 牙 + 4 附则） |
| 卡片边框 | `Surface` | **111 文件**（边框族） | **0**（够格 21 处里实迁 14） | 边框 **226 处 / 108 文件** · 越界圆角 **261 / 109** · 阴影 **24 / 24** | `FROZEN_BORDER_TOTAL = 226` · `FROZEN_RADIUS_OUTLIER_TOTAL = 261` · `FROZEN_SHADOW_TOTAL = 24` · `FROZEN_SURFACE_TAG_TOTAL = 14` | `surfaceRatchet.test.ts`（25 用例，三族 × 6 + ⑦×2 + ⑧×2 + ⑨×1 + ⑩×2） |

> **四张表的读数工具（可复跑）**：`node tmp/t18/census2.mjs`（括号配对扫描，逐表项数 + 与 `ANCHOR.entries` / `FROZEN_*_TOTAL` 交叉核对）· `node tmp/t18/compare-perfile.mjs`（vitest 逐文件对拍）· `node tmp/t18/dialog20.mjs` · `node tmp/t18/ratchet-census.mjs`（v1，**已知会误算**：被注释里的 `}` 提前截断 ⇒ 保留作反例）。
> **③ 的「若控制方选 (A) 全量」余量清单在此**：五类的余量**逐条**写在各自的 `*Baseline.ts` 里（`RESIDUAL` 每条带非空理由，且「僵尸豁免」判据会红）—— 例：`textBaseline.RESIDUAL` **44 条**、`surfaceBaseline.SHADOW_RESIDUAL` **24 条**、`surfaceResidual.ts` 的边框/圆角残留 **31 + 13 条**、`emptyStateRatchet.EXCEPTIONS` **8 条**、`loadingBaseline.RESIDUAL` **8 条**、`statusLineBaseline.MIN_CALLS`（8 键）。**不必重新普查。**

### 二、八门禁终态表
（逐条命令 + exit code + 读数；vitest 必须给**既有 1370 逐文件一条不少**的比对结论）

> 全部在**静止干净树**上跑（`HEAD = 199da54b` · `git status --porcelain` 仅 `?? docs/tech-debt/`）· 采集时刻 **2026-09-12 19:52–19:56** · `app/dist` mtime **2026-09-12 19:54:33**（**真实构建**产出）。

| # | 命令 | exit | 读数 |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `✅ line-limits（--full · 数值一致）：>600 硬限 0（棘轮内）· 301–600 档 122 · 登记条目 122`（两侧相等；`--write` 复跑**零 diff**：文件 sha256 前后一致 ⇒ **豁免表不在收口提交路径里**） |
| 2 | `node scripts/docs-check.mjs` | **0** | 扫描 **276** 个 Markdown（检查 **176**）· ✅ 相对链接全部有效 · ✅ `file://` 引用目标均存在 · ✅ 文件名规范 · ✅ 索引覆盖完整 · ✅ 模板源与实例一致 |
| 3 | `node scripts/check-command-registry.mjs` | **0** | `✅ 命令注册一致：定义 312 / 注册 312 / 重复 0` |
| 4 | `cd app; npx tsc --noEmit` | **0** | **0 错**（输出只有 npm 的 env 警告） |
| 5 | `cd app; npx vitest run`（json reporter：`--reporter=json --outputFile=…/tmp/t18/raw/vitest-full.json`） | **0** | **166 文件 / 1608 用例 / 0 失败 / 0 skip**（`numTotalTests 1608 · numPassedTests 1608 · numFailedTests 0 · success true`） |
| 5-对拍 | `node tmp/t18/compare-perfile.mjs <json> tmp/t1/vitest-perfile.txt` | **0** | 基线（批 4 开工，`tmp/t1/vitest-perfile.txt`）= **143 文件 / 1370 用例** ⇒ **LOST = 0 · SHRUNK = 0**；`GROWN = 6` · `ADDED = 23`（逐条见下） |
| 6 | `node scripts/check-bundle-budget.mjs`（**真实构建**；取锁 `tmp/t18/build.lock` **第 1 次即取到**；`cmd /c npm run build`） | **0**（build 0 / budget 0） | `index-4qKuUwYr.js` 108,099 B → gzip 35,374 B（35.37 kB）· `vendor-react-lr0dg1MX.js` 192,536 B → 60,375 B · `vendor-tauri-UIF4jgRy.js` 17,143 B → 4,548 B · **首屏 JS 合计 原始 317,778 B · gzip 100,297 B = 100.30 kB** ⇒ **✅ 达标：余量 99.70 kB**（预算 200 kB）· 懒加载 **22 个 575,163 B = 575.16 kB**（不计入）· **CSS 3 个 62,625 B = 62.63 kB · gzip 14.42 kB**（**不计入判据，只报告**）· `index.html` 1,558 B · 字体 20/20/19 个（.ttf/.woff/.woff2，亦不计入） |
| 7 | `node scripts/bundle-eager-graph.mjs` | **0** | 入口 `app/src/main.tsx`：**89 文件 / 4 包**（`--json` 拆分 = `.ts`/`.tsx` **76** + `.css` **13**）· 包 = `@tauri-apps/api` · `@tauri-apps/plugin-dialog` · `react` · `react-dom` |
| 7-真实边 | `node tmp/t1/eager-graph-tsapi.mjs`（TS 编译器 API 剔 `import type`） | **0** | **65 应用源文件 / 4 包**（工具 89 − TS-API 65 = 24 = 13 份 CSS + 11 条 type-only 假阳性） |
| 8 | Rust（`cargo test --test app_lib_tests` / `cargo clippy`） | **未复跑** | **本批零 Rust 改动**：`git log 42e88740..HEAD -- app/src-tauri` = **空**（全批一条都没有）⇒ 判据仍是批 3 收口的 **2300 / 0 / 6**。⚠️ **不得**把本行读成「已跑且绿」。 |

**门禁 5 的逐文件对拍明细（V2 的硬要求：不是只看总数）**

- **消失文件 = 0（真 LOST）**。原始输出里有 1 条 `LOST: scripts/gen-tokens.test.mjs` —— **这是路径规范化产物，不是真丢**：该文件在 `app/scripts/` 下（不在 `app/src/`），基线与本次产物都把它记成**绝对路径**，两侧键形不同 ⇒ 逐字见 `tmp/t18/raw/vitest-compare.json` 的 `LOST` / `ADDED[0]`（同一路径，23 用例）。**与 T17-B、T13–T15 评审的结论逐字一致。**
- **SHRUNK（既有文件用例变少）= 0**。
- **GROWN（既有文件用例增加）逐条点名列全 —— 6 条**：`components/FeedFragmentList.test.tsx: 4 → 5`（T11，窗口确认→`ConfirmDialog` 后把「桩从未被调用」变成新断言）· `components/RefineWorkbench.test.tsx: 7 → 8`（修复单元：假绿换成结构判据 + 1 条 h3 路径）· `ui/primitives/Surface.test.tsx: 17 → 18`（T17-A，加 `pill` 档）· `ui/primitives/Text.test.tsx: 12 → 16`（T16-A，两槽正反两向）· `ui/primitives/style-seams.test.ts: 17 → 18`（T3，`SURFACE_CLASSES` 加类名）· `ui/zIndex.guard.test.ts: 4 → 7`（T4，新增 3 条判据）
- **ADDED（新增测试文件）共 23 个 / 227 用例**：**`ui/primitives/` 16 个（158 用例）** = `dialogMigration.{a1=6,a2=31,b=18,e=15}` · `buttonMigration=9` · `nativeButton.ratchet=6` · `Modal.scroll-lock=6` · `ConfirmDialog.tier=7` · `Toast.placement=6` · `EmptyState.align=8` · `loadingMigration=3` · `loadingRatchet=8` · `emptyStateRatchet=7` · `statusLineRatchet=4` · `textRatchet=16` · `surfaceRatchet=25`；**`components/` 3 个（30 用例）** = `confirmMigration=10` · `toastMigration=15` · `chat/ChatLaunchMenu.test=5`；**`shell/` 4 个（22 用例）** = `shellReset=5` · `columnKeys.freeze=3` · `shellPrimitives=8` · `commandPalette.modal=6`。**增量等式**：`1608 − 1370 = 238 = 227（23 个新文件的用例）+ 11（6 个既有文件的增长之和：1+1+1+4+1+3）` ✅（原始逐条见 `tmp/t18/raw/vitest-compare.json` 与 `added.txt`）

**门禁 6 的首屏 Δ 与机理（对本批计划基线 97.16 kB）**

- **基线 = 计划表 1 的 `97.16 kB` = 97,155 B gzip / 309,524 B 原始**（出处：批 4 开工时点 `HEAD=357ab117` 的真实构建，`dist` mtime 2026-09-12 14:39:21，入口 `index-Cf249NJv.js` 99,860 B）。
- **终态 = 100.30 kB（100,297 B gzip / 317,778 B 原始）⇒ Δ = +3,142 B gzip = +3.14 kB**（原始 +8,254 B；入口 chunk 99,860 → 108,099 B = **+8,239 B 原始**）。
- **机理（逐项有独立 A/B 证据，未做逐提交二分定位）**：
  - **T9 的 barrel + 原语层进首屏 = +2,159 B（ShellFallback 半程）+ 189 B（palette 半程）= +2,348 B**（四棵同源真构建：97,210 → 99,369 → 99,742 → 99,934 B）；真实边 **52 → 65（+13）= `ui/primitives/**` 全层**（barrel 1 条 + 12 个模块）· 工具 **67 → 90（+23）**（多 10 份原语 CSS）· `pages/**` **+0** · **npm 包 4 → 4**。**这是 B5 诚实代价的实测形态，且低于 B5 给出的上界 +3.41 kB。**
  - **T10 的 toast 首屏接入 = +373 B**（`b5c464af → 4a804a58` 同源真构建；barrel 已在首屏 ⇒ 本任务不新增 barrel 字节）。
  - **T16-B 的 `Text` 迁移 = −112 B（−0.11 kB）**；**T17-B 的 `Surface` 首次真进首屏 = +101 B（+0.10 kB）**（产物字符串实证：`ed-surface--bordered` 在迁前 `dist` 的 js 里 **0 命中** ⇒ 组件被 tree-shake；迁后 **1 命中** —— 「首次真用它」的代价）；**T16-A 的两槽 = +17 B**；**T17-A 结构性 0**。
  - **剩余 ≈ +357 B 未逐提交归因**（区间 `bde807dc` 的 99,934 B → `a9c7e300` 的 100,196 B 之间，属 T11/T12/T13/T14/T15 的调用点接入）。**本节明确声明：未做逐提交二分定位**（T16-A 报告 §8 第 4 条同样自陈未做）。⚠️ 纪律：**< ~2 kB 的 Δ 必须用同源真构建对比**，不能拿不同时点的仓内 `dist` 相减（T7–T12 评审实测：同源 HEAD 与 `bde807dc` 差 9 B，其中 `index.html` 18 B 纯 CRLF、两树 CSS 排序后 156 段完全相同 ⇒ 差异来自 rollup 的 CSS 拼接顺序，**非确定性**）。
- **CSS 不计入判据**（本节只报告）：**62.63 kB 原始 / 14.42 kB gzip**（3 个文件）。

**门禁 7 的 Δ 与机理（eager 静态可达图，三件套）**

| 口径 | 批 4 开工（`357ab117`/`42e88740` 口径） | 终态（`199da54b`） | Δ |
|---|---|---|---|
| 工具口径（含 `.css`、含 `import type`） | **67**（= 63 源 + 4 CSS） | **89**（= **76 源 + 13 CSS**） | **+22** |
| 真实边口径（TS 编译器 API 剔 `import type`，只数 `app/src` 源文件） | **52** | **65** | **+13** |
| npm 包 | **4** | **4** | **0** |

- **机理**：**+13 全部是 `ui/primitives/**` 全层**（T9 的 ShellFallback 半程把 barrel + 12 个原语模块静态拉进首屏）；工具口径多出的 9 = 原语层新增的 **9 份 CSS**（10 → 13？逐条见 T9 报告：工具 67 → 90 是多 13 + 10 份 CSS；CommandPalette 半程删 `CommandPalette.css` 后工具 90 → 89）。**`pages/**` 新增 0 · npm 包新增 0** ⇒ **没有任何页面被静态拉回首屏**。
- **终态 Δ（对 T17-B 的 89/65）= 0**：T17-B 与 T13–T15 修单元只改调用点与测试文件，未新增首屏可达模块。

### 三、逐任务提交轨迹
（`Task → commit sha → subject → 文件数`；**提交数用 `A^..B` 含左端点口径**并写明起止）

**口径（先写清，再报实数）**：`docs/versions/v0.22.md` 既定规矩 = **批次行一律「含左端点」**（`git rev-list --count A^..B`，`A` = 该批**第一个**提交）。批 4 的**第一个提交 = `4905d4d8`**（`docs(plan): 批 4 原语迁移实施计划（19 任务）`，其父 = 批 3 收口提交 `42e88740`，已实测 `git rev-parse 4905d4d8^ == 42e88740`）。**同口径校验**：批 3 的 `85d51d83^..42e88740` 实测 = **22**，与 v0.22 批 3 行的「22 个提交」逐字相符 ⇒ 口径无误。

| 命令 | 读数 | 说明 |
|---|---|---|
| `git rev-list --count 4905d4d8^..HEAD`（本批 **含左端点**，`HEAD = 199da54b`） | **48** | = `4905d4d8` 起至 `199da54b` 的全部提交（**48 = 48 个实施/评审/修复提交**，其中第 1 个是计划本身） |
| `git rev-list --count 4905d4d8^..<收口提交>` | **49** | **本收口提交自己算第 49 个**（sha 无法写进它自己的内容里 —— 自引用；批 3 先例同款） |
| `git rev-list --count 42e88740..HEAD` / `git log --oneline 42e88740..HEAD \| Measure-Object -Line` | **48** / **48** | 派发书点名的那两条命令；**不含左端点**（左端点 `42e88740` 是批 3 的收口提交） |
| `git rev-list --count 42e88740^..HEAD`（派发书点名） | **49** | 含左端点的字面读数 —— **它把批 3 的收口提交 `42e88740` 也算进来了** ⇒ **批 4 自己的提交数按 v0.22 口径读 `4905d4d8^..` 那一行**（48 / 收口后 49）。两个数都报，**不合并、不择优**。 |

**逐条轨迹（48 个；`文件数` = `git show --name-only --format="" <sha>` 的非空行数）**：

| # | sha | subject | 归属 | 文件数 |
|---|---|---|---|---|
| 1 | `4905d4d8` | `docs(plan): 批 4 原语迁移实施计划（19 任务）` | 计划（**+ ADR-034 补写**，同提交 2 路径） | 2 |
| 2 | `e4901247` | `docs(shell): 修批 3 收口评审 I-1 与 7 Minor` | **批 3 收口评审修复单元**（落在批 4 区间内，非批 4 交付） | 5 |
| 3 | `357ab117` | `test(primitives): freeze native button ratchet` | T1 基线冻结 + 按钮棘轮 | 2 |
| 4 | `783a62ae` | `test(shell): 补 index.html 与列键名守卫并加注 ADR-034` | 前置守卫单元（T0 的 G3/G5） | 3 |
| 5 | `6effbda5` | `test(shell): 列键名冻结的阴性样本改取自冻结点单` | 前置守卫单元（自纠） | 1 |
| 6 | `a9c63c0a` | `feat(primitives): lock body scroll in modal` | T2（`Modal` 滚动锁 + `ConfirmDialog.tier`） | 4 |
| 7 | `54b9b938` | `feat(primitives): add placement and align slots` | T3（**并携带 T2 的 ADR-033 加注** —— 索引串味，已登记） | 10 |
| 8 | `8d84ecfe` | `refactor(ui): migrate bare z-index to tier scale` | T4（58 处 / 43 文件 / 17 值 → 六档） | 42 |
| 9 | `f3b2b6ce` | `test(shell): 守卫B判据②改认字面量形态并收窄注释` | 前置守卫评审 follow-up | 1 |
| 10 | `a25ed2c6` | `docs(adr): ADR-034 加注钉单源并回写 B15 授权` | 前置守卫评审 follow-up | 1 |
| 11 | `0228a013` | `docs(plan): 修批 4 计划的 gitignored 链接` | T5 的**授权前置**（导出树 `docs-check` 必红的既存缺陷） | 1 |
| 12 | `57a78c7d` | `refactor(dialogs): migrate seven overlays to modal` | T5（A1 桶 7 弹层） | 8 |
| 13 | `09c49941` | `refactor(dialogs): migrate seven form overlays` | T6（A2 桶 7 弹层） | 8 |
| 14 | `cc6cdadd` | `refactor(panels): migrate 4 workbenches to modal` | T7（B 桶 4 工作台 + B12 的 720 实测） | 6 |
| 15 | `4c52cdd8` | `style(dialogs): drop decorative title emoji` | 回填单元（I-1 选 (a)：**11 处 / 13 串**） | 11 |
| 16 | `854c0af9` | `fix(refine): keep diff badge inside heading node` | 修复单元（T7 发现的真缺陷 + 假绿判据换掉） | 3 |
| 17 | `45ce9292` | `test(refine): pin right pane before negative assert` | 修复单元（判据防空真） | 1 |
| 18 | `0148b5ed` | `test(primitives): pin the twenty dialog set` | T8（E 桶 2 弹层 + **20 清单钉死**） | 3 |
| 19 | `b5c464af` | `refactor(shell): use primitives in shell fallback` | T9 半程 A（`ShellFallback`，**barrel 首次进首屏**） | 2 |
| 20 | `4a804a58` | `refactor(ui): unify four toast implementations` | T10（四套 toast → 3 + 1 例外；**B13/B15 四条断言改写**） | 7 |
| 21 | `bde807dc` | `refactor(shell): use modal in command palette` | T9 半程 B（`CommandPalette` → `Modal`；删 `CommandPalette.css`） | 7 |
| 22 | `0e17e666` | `refactor(ui): migrate button style constants` | T12-1（`*Btn*` 常量族 99 处 / 35 文件） | 35 |
| 23 | `5d485ff8` | `test(ui): pin button migration and ratchet down` | T12-2（判据 + 棘轮收紧） | 4 |
| 24 | `1a7762bd` | `refactor(ui): replace window confirm with dialog` | T11（8 处 `window.confirm` → `ConfirmDialog`） | 9 |
| 25 | `f6dd012f` | `refactor(ui): migrate provider settings buttons` | T12-3（补做，T11 让路后的 5 文件） | 5 |
| 26 | `ebac9d73` | `test(ui): pin exact confirm copy and baseline sum` | T7–T12 评审修复单元（I-1 第一版 + M-1） | 2 |
| 27 | `cbc15837` | `refactor(chat): extract launch menu from chat page` | T13-b 拆件（`ChatPage` 599 → 578 + 新件 77） | 6 |
| 28 | `37c068aa` | `refactor(ui): migrate empty state call sites` | T13 空态切片（28 文件） | 27 |
| 29 | `271a281c` | `refactor(ui): migrate loading placeholders` | T14-1（7 个非交集文件） | 9 |
| 30 | `9c2a00a4` | `test(ui): read confirm copy segments in DOM order` | 评审修复单元（I-1 第二版：按 DOM 序逐段恰等） | 1 |
| 31 | `8f5bd9f1` | `refactor(ui): migrate remaining loading placeholders` | T14-2（6 路径）+ **T13 的 2 个文件** —— 该提交**被 T13 误 `--amend`**（内容无缺失；归属与信息不实 ⇒ 登记，见 §八） | 8 |
| 32 | `c635c0bb` | `test(ui): strengthen empty state ratchet checks` | T13（棘轮收紧：区间 → 恰等） | 1 |
| 33 | `7457c7f1` | `refactor(ui): migrate error lines to status line` | T15 接管收口（**49 迁移 + 3 回退 + 4 判据/基线 + 1 文档 = 57 路径**） | 57 |
| 34 | `3ed9cfe9` | `feat(ui): add title and testid slots to text` | T16-A-1（`Text` 两槽，B16） | 2 |
| 35 | `93763ae7` | `test(ui): freeze muted text literal counts` | T16-A-2（`textBaseline` + `textRatchet`） | 2 |
| 36 | `2360c3d9` | `feat(ui): add pill radius tier to surface` | T17-A-1（**第 5 档 `pill`**，B17/B18） | 5 |
| 37 | `0bc09a41` | `test(ui): freeze surface literal counts` | T17-A-2（三条棘轮 240/270/24） | 2 |
| 38 | `f2a91eb6` | `test(ui): pin loading ratchet residue counts` | T13–T15 评审收口修单元 F1 | 1 |
| 39 | `5825fae3` | `test(ui): strip comments in status red ratchet` | F2（三红 116 → **114**）+ M-7（`MIN_CALLS`） | 2 |
| 40 | `451db3fb` | `test(ui): make empty state ratchet probe-free` | F3（⑥a/⑥b，净克隆零红） | 1 |
| 41 | `0b27540c` | `test(ui): tighten empty state align samples` | F4（反例样本经 `bodyOf` 取段器） | 1 |
| 42 | `9532b189` | `refactor(ui): migrate muted text in components` | T16-B-1（24 文件） | 24 |
| 43 | `be925809` | `refactor(ui): migrate muted text in pages` | T16-B-2（59 文件） | 59 |
| 44 | `a9c7e300` | `test(ui): tighten muted text baseline` | T16-B-3（249 → **63**，收紧） | 3 |
| 45 | `1ac129ae` | `refactor(ui): use shadow tokens at call sites` | T17-B-1（20 处阴影 → token） | 20 |
| 46 | `69489f9f` | `refactor(ui): migrate card borders to surface` | T17-B-2（14 处 → `<Surface>`） | 9 |
| 47 | `18d56cbc` | `refactor(ui): align card radii to panel tier` | T17-B-3（`6 → 8` 3 处） | 3 |
| 48 | `199da54b` | `test(ui): tighten surface baseline` | T17-B-4（三族收紧 + `FROZEN_SURFACE_TAG_TOTAL 0 → 14`） | 3 |
| 49 | *（本收口提交）* | `docs(spec): close out primitives batch four` | **T18** | 见 §八/V8 |

- **与各任务报告提交号逐一核对**：上表 48 条的 sha 全部取自 `git log --reverse 42e88740..HEAD`（原始输出见 `tmp/t18/raw/commits.tsv`），并与各 `task-*-report.md` 自陈的提交号逐条对上：T1 `357ab117` ✓ · T2 `a9c63c0a` ✓ · T3 `54b9b938` ✓ · T4 `8d84ecfe` ✓ · T5 `0228a013`+`57a78c7d` ✓ · T6 `09c49941` ✓ · T7 `cc6cdadd` ✓ · T8 `0148b5ed` ✓ · T9 `b5c464af`+`bde807dc` ✓ · T10 `4a804a58` ✓ · T11 `1a7762bd` ✓ · T12 `0e17e666`/`5d485ff8`/`f6dd012f` ✓ · T13 `cbc15837`/`37c068aa`/`c635c0bb` ✓ · T14 `271a281c`/`8f5bd9f1` ✓（**报告写的第二提交 sha 是 `0f9dbcc9`，那已被 amend ⇒ 现存 `8f5bd9f1`**）· T15 `7457c7f1` ✓ · T16-A `3ed9cfe9`/`93763ae7` ✓ · T16-B `9532b189`/`be925809`/`a9c7e300` ✓ · T17-A `2360c3d9`/`0bc09a41` ✓ · T17-B `1ac129ae`/`69489f9f`/`18d56cbc`/`199da54b` ✓ · 前置守卫 `783a62ae`/`6effbda5`/`f3b2b6ce`/`a25ed2c6` ✓ · 回填/修复 `4c52cdd8`/`854c0af9`/`45ce9292` ✓ · 评审修复 `ebac9d73`/`9c2a00a4` ✓ · T13–T15 收口修单元 `f2a91eb6`/`5825fae3`/`451db3fb`/`0b27540c` ✓。
- **两个不属于批 4 交付但落在区间内的提交（如实列出）**：`e4901247`（批 3 收口评审的 I-1/7 Minor 修复，并行单元在批 4 计划落库之后提交）· 以及 `4905d4d8` 本身（计划 + ADR-034）。**不为落进某个区间而合并/剔除提交**。
- **一处历史改写（如实登记，不重写历史）**：`8f5bd9f1` 是 `git commit --amend` 的产物（T13 误 amend 到 T14 的第二提交上，原 sha `0f9dbcc9`）。评审已实证：**内容无缺失 · 无第三方在飞改动丢失 · 历史线性未重写**（`git reflog` 无 `rebase`/`reset`/强推条目）。**处置 = 登记，不 reword、不 rebase。**
- **一处索引串味**：`54b9b938`（T3）携带了 **T2 的 ADR-033 加注**（T2 写了但未 `git add`，被并行写者带进共享索引）。**内容正确** ⇒ 登记，归因改写为「ADR-033 的 T2 加注由 `54b9b938` 落库」。

### 四、B1–B10 的实际结果
（逐条：裁决 → 实际做法 → 证据（文件/守卫/读数））

> **本节标题保留计划原样（`B1–B10`），实际覆盖 `B1–B22`**：本计划落笔时控制方只裁到 **B10**，B11–B22 是**其后陆续新增的 12 条裁决**（B11 五类切片 · B12 `RefineWorkbench` · B13/B15 守卫授权改写 · B14 `pinnable` · B16 `Text` 两槽 · B17 药丸/三棘轮 · B18 拆单元 · B19 `Text` 49 处处置 · B20 `Surface` 迁移面 · B21 守卫优先 · B22 两条口径冲突）。**标题不改的理由** = 本仓文档回写的一贯口径「原文保留 + 就地加注」，且改标题会让本节与计划上文的自审记录对不上号。

| # | 裁决（摘要） | 实际做法 | 证据（文件 / 守卫 / 读数） |
|---|---|---|---|
| **B1** | 11 锚定菜单不迁、只落 `popover` | **不迁 `Modal`；53 处落档里 26 处落 `popover(200)`**；11 个菜单逐条登记在案 | 规格 §11-2 加注的例外表（11 行 · 逐条理由）· `ADR-033 §7` 加注「适用对象 = 对话框类」· `ui/zIndex.guard.test.ts` 的 `FROZEN_NUMERIC_ZINDEX`（11 处菜单**已无裸值** ⇒ 不在名单）· `tmp/t4/zindex-map.md` §2 表 A · `dialogMigration.e.test.ts` ②（`NON_MIGRATED_14` 不得 import 原语） |
| **B2** | 3 覆盖层不迁、例外登记 | **3 条裸值保留**（`10` / `999` / `1000`）+ 逐条 `why` >20 字；`ScreenSelectOverlay` **只保留根**（子层迁 `raised`） | 规格 §11-2 例外表第 12–14 行 · `ZINDEX_ACCOUNTS`（唯一注册表）· 守卫 ④/⑤（注册表 ↔ 名单一一对应 + 逐行对拍）· `.e` ② 的 `34 − 20 == 14` |
| **B3** | 验收按 20；28 并列登记 | **20 = 验收**；**28 / 34 / 6 并列**；20 的构成 `A14+B4+E2` **钉在常量里** | `.e` 的 `DIALOG_20`/`ADR033_28`/`CROSS_LINE_34`/`CROSS_LINE_ONLY_6`/`NON_MIGRATED_14` 五数组 + 常量自检 + 三条集合判据 · 规格 §10 批 4 ↳ 行与 §11-2 加注 · `docs/versions/v0.22.md` 批 4 节（消歧归批 8 的**跨文档**对账仍留） |
| **B4** | `Button` 范围 + 棘轮 | **口径变化写明**：107/63 **不可考**（`btnStyle` 全仓 0 命中）⇒ 三口径并列（510/121 · 80/55 · 103/37）；迁 `*Btn*` 常量族 + 新代码 + **原生按钮棘轮**；**余量 ≈407 处登记批 5/7** | 规格 §5.1 的 Button 行加注 · `nativeButtonBaseline.ts`（`FROZEN_NATIVE_BUTTON_TOTAL 510 → 394` · 114 键）· `nativeButton.ratchet.test.ts`（6 用例，5 判据 5/5 有牙）· `buttonMigration.test.ts` ④（`FROZEN == sum(entries)` + `≤ PRE_T12`）· T12 的逐文件 Δ 之和 = −99 == 形状表总数 |
| **B5** | barrel 导入（+3.41 kB gzip 为诚实代价） | **走 barrel**；实测代价 **+2,348 B（T9 两半）**，**低于上界**；CSS 不计入判据（只报告 62.63 kB / 14.42 kB gzip） | 本节 §二 门禁 6/7 的 Δ 与机理 · `ADR-033 §1` 的引用（唯一公共入口）· `ui/primitives/index.ts` 未破 |
| **B6** | 缺口逐判（≥3 ⇒ 改原语；否则特殊条款） | **四个缺口逐条落地**：① `Modal` body 滚动锁（20 共用 ⇒ **改原语**）② `ConfirmDialog.tier`（**走特殊条款**，≥3 主判据实测不成立）③ `Toast.placement`（1 消费者 ⇒ 特殊条款，只加**一个具名 prop**）④ `EmptyState.align`（44 处 ⇒ 只开**一个受控排版档位**，**不放开裸 `className`**） | `Modal.scroll-lock.test.tsx`(6) · `ConfirmDialog.tier.test.tsx`(7) · `Toast.placement.test.tsx`(6) · `EmptyState.align.test.tsx`(8) · **ADR-033 后果④/⑤ 的加注**（含 T11 对「依据」的更正：真实依据 = 特殊条款）· **阈值判据已写进 ADR-033 后果⑤**：同一缺口 ≥3 调用点共用 ⇒ 改原语；「结构上无法表达」是唯一例外通道 |
| **B7** | `ChatPage` 先拆后迁 | **两个原子提交**：`cbc15837` 拆件（599 → **578** + 新件 `ChatLaunchMenu.tsx` **77** + 其测试 **79/5 用例**）→ `37c068aa` 再迁移；`ChatPage:504/505` 的 2 条裸 z-index **委托账已收口** | 守卫的第 7 个 `it`「`ChatPage` 的委托面已由 T13-b 收口（裸值消失 ∧ 新家改走六档）」· `SPLIT_MOVES` 守恒实测 3+2 == 5 · 报告 §0/§2.2（含 M-3 的行数更正） |
| **B8** | markdown 归一不并入（登记批 5/7） | **全批零触碰**；规格 §12 的行**已在 `42e88740`（批 3 收口）就地加注**并写明去向 | 规格 §12 该行加注（⚖️ 已裁定：不并入批 4 ⇒ 批 5 或批 7）—— **本次不重复加注**（V4 的存在性核对通过；见 §八 偏差 ⑨） |
| **B9** | 接受「迁移即上线动效」 | **逐字声明「只有接缝、没有纲领；三档强度 / 双基调 / GSAP 在批 6」**；未压制任何原语动效、未装 GSAP | 本计划本节 §五 · `docs/versions/v0.22.md` 批 4 节「诚实代价」· T2/T3/T4/T7/T8/T10/T13/T16-A/T17-A/T17-B 各自报告的 B9 段 |
| **B10** | 零新增依赖 | **全批 `app/package.json` / `package-lock.json` 零 diff**（零新增依赖）；`any` 0 | `git diff 4905d4d8^..HEAD -- app/package.json app/package-lock.json` = **空** · 各单元报告自陈 · `tsc --noEmit` 0 错 + 禁 `any` 纪律 |
| **B11** | 五类走切片 + 棘轮（**+ §11-3 必须加注中间态**） | **五条棘轮全部落地并按实测收紧**；**规格 §11-3 已就地加注中间态**（含「若选 (A) 全量的余量清单在此」+ 判据限度） | 规格 §11-3 加注 · 本节 §一 的五类终态表 · `emptyStateRatchet` / `loadingRatchet` / `statusLineRatchet` / `textRatchet` / `surfaceRatchet` 五个文件（含各自的防真空阳性对照 + 逐文件下界/牙齿 + 防僵尸豁免） |
| **B12** | `RefineWorkbench` 走 (a) 迁 `Modal --l`，**不可读则 STOP** | **走 (a)、未 STOP**：headless Chrome 真探针实测「720 下两栏 328×2 · 横向溢出 0 · 栏内 `clientH 451 / scrollH 680·800`」⇒ **全文可达 + 栏内独立滚动**；**观感变化逐条登记** | T7 报告 §3.2/§3.3 · 观感登记（面板 1137.59 → 720 = **−36.7%** · 两栏 553 → 328 = **−40.7%** · 每行 46 → 28 字 · 顺带修掉 720 下 32px 水平溢出）· `dialogMigration.b.test.ts`（18 用例）· `PANE_MAX_H = calc(85vh − 200px)`（有/无对照实测：无它则同步滚动静默失效） |
| **B13** | 批 3 三条 `TopBar.test.tsx` 断言授权改写 | **改写为原语层 / 渲染级断言**（**等价或更强**、各带变异体）；`TopBar.persistent.test.tsx` **一字未动** | T10 报告 §2 · 四条真身 = **`bde807dc:app/src/shell/TopBar.test.tsx:200-213`**（`:182–:185` 是 T9 之前的时点 —— 行号更正已进 `rulings.md` B13 末与本节）· M7–M11 变异体全红 |
| **B14** | `pinnable`：代码对、ADR 错 ⇒ 只加注 ADR | **未动 `columnRegistry.ts`、未动其 13 行映射判据**；ADR-034 加注①（`true` 1 行 / `false` 12 行，`notes-outline`） | `ADR-034` §2 下加注①（`+27/−0`，正文一字未改，`783a62ae`）· 本节 §一 未涉及 |
| **B15** | B13 授权**扩到 4 条**（含 `:182`） | **4 条逐条改写**：3 条搬原语层 + `:182` 改**渲染级**（渲染真实装配件 `AiToast`，断言 `getByTestId("ai-toast")` + role/aria-live/类名/`zIndex`/无行内 `top`）；**语义保住** | T10 报告 §2；`rulings.md` B15 末的行号更正；`ADR-034` 加注⑤ S-3 行的「时点差更正」（`a25ed2c6`，`+5/−4`） |
| **B16** | `Text` 只加 `testId` + `title` 两个受控槽 | **只加两个属性级槽**（交互类一律不加）；正反两向用例 | `Text.tsx`（89 → 119）· `Text.test.tsx`（12 → 16 用例）· `textBaseline`/`textRatchet` · 迁移实测用槽 **12 处**（`testId` 8 · `title` 5，一处同用） |
| **B17** | 三条棘轮 + 药丸按切片实测判（≥3 ⇒ 加档） | **切片内 `999` 实测 3 处 ⇒ 加第 5 档 `radius="pill"`**；值映射照计划；调用点零 `boxShadow` 字面量；**补了「行内 style 覆盖 Surface」机器判据（正反 fixture + 变异）** | `2360c3d9`（5 文件）· `Surface.css` 的 `var(--ed-radius-pill, 999px)` 兜底 · **规格 §4.2 加注**（第 5 档 + 3 处 + 代价）· `surfaceRatchet.test.ts` ⑦（域内 0 命中） |
| **B18** | T16/T17 一律拆「地基 A + 迁移 B」 | **四个单元（T16-A/B · T17-A/B）各自过门禁、各自独立评审**；`sliceScan.ts` 两侧**都未改**（零字节） | `3ed9cfe9`/`93763ae7`（A）· `9532b189`/`be925809`/`a9c7e300`（B）· `2360c3d9`/`0bc09a41`（A）· `1ac129ae`/`69489f9f`/`18d56cbc`/`199da54b`（B）· `sliceScan.ts`（76 行，`git diff` 为空）· **B18 附注**：`style-seams.test.ts` 归 T17-A 走 (B)，5 文件一并更新（`SURFACE_CLASSES` + `toHaveLength(13)`）—— 且**如实登记它是自计数式**（MS1b 实测绿） |
| **B19** | T16-B 的 49 处待裁决：B 类迁 / A 类逐处判 / C 类登记 | **B 类 16 处全迁** · **A 类 6 迁 / 26 登记**（品牌青/粉/靛蓝/三红无等价档）· **C 类 2 登记**；`tone` 一律 `ink-3`；**非弱化文本一处未动**；例外**带非空理由 + 防僵尸豁免** | `textBaseline.RESIDUAL`（44 条 / 7 类）· `tmp/t16b/migrated.md`（185 行 + 手工 1 处 = 186）· 变异体 8 棵（M1/M2/M3/M4/M5/M7 红 + M6 反例绿）· ⚠️ **「24 处非弱化文本」作废 ⇒ 属性级重扫实为 6 处**（见 §八 偏差 ②） |
| **B20** | T17-B 的迁移面判定（真面 172 + 三去向 + 非 Surface 圆角不迁 + 阴影走 token） | **只迁整圈 172 里够格的 21 处 → 实迁 14**；**57 分隔线 + 11 条件色不迁（登记）**；`6→8` **单独成提交**（`18d56cbc`）；`boxShadow` **20 处 → token（4 处有理由不改）**；棘轮**只降**并给对拍 | T17-B 报告 §4（`172 = 96+14+4+4+4+28+22`）· `surfaceResidual.ts`（31 + 13 条）· `SHADOW_RESIDUAL`（24 条）· `FROZEN_SURFACE_TAG_TOTAL 0 → 14` · 本节 §五「诚实代价」 |
| **B21** | **B1/B2 守卫优先于「顺手迁移」**（维持守卫、不放开） | **两处实例**：T12 放弃 2 文件 5 处 · T16-B 回退 **9 处**（`b1-non-migrated`，7 文件）；**T17-B 回退 0 条**（动手前就用名单过滤）⇒ 三处**均未改守卫** | `buttonMigration.test.ts` ④ + `dialogMigration.e.test.ts` ②（本批**零改动**）· `textBaseline` 的 `b1-non-migrated` 9 处 · T17-B §6 的 14 文件表（`ui/primitives` 命中数保持 **0**）· **follow-up**：批 5/7 要迁这 14 个文件的排版**必须先裁决守卫范围** |
| **B22** | T17-B 两条口径冲突：接受保守迁移面；**「254 处半径对齐」只落 9 处、维持现状** | **维持现状**：实迁 14（边框）/ 实改 9（`6→8`）；**不机械拉齐其余 245 处**；**172 / 254 两个数在回写时带分区与去向**；解锁路径登记为 follow-up | 本节 §八 偏差 ①/②（含完整分区）· 规格 §5.1 的 Surface 行加注 · `docs/versions/v0.22.md` 批 4 节「诚实代价」 |

> **另：`rulings.md` 里的三条「另裁」（不属于 B1–B22 编号，但同属控制方裁决）**：① **T3 的 STOP**：`EmptyState` **不再加第二个档位**（`align` 即 B6 授权的那一个）—— 落地为「只开 `align`」；② **T4/T5/T6 评审的 3 条 Important**：I-1 选 (a) **真去 emoji**（回填单元 `4c52cdd8`，**11 处 / 13 串**）、I-2 **只改文档**（实测零收严）、I-3 **T4 的有意值收敛必须 durable 登记**（落在本节 §一 ① 与规格 §11-2 加注）；③ **T13 的同行双语义撞车**：`AsrConfusionPanel.tsx:112-115` 归 T13 一次性拆（`Loading` + `EmptyState`，文案逐字不变），T14 排除该行的加载臂。

### 五、诚实代价
（**B5**：barrel 的 +3.41 kB 上界 + CSS 2.18 kB 不计入 + 实测 Δ 与 dist 出处 · **B9**：逐字写出「**只有接缝、没有纲领**」· 五类的观感变化规模（如 `borderRadius 6→8` 275 处、604 处字号**未动**）· 20 个弹层的档位宽度 Δ）

1. **B5 的 barrel 代价（实测，不是估算）**：**上界 +3.41 kB gzip JS**（控制方 B5 给的界），**实测 T9 两半 = +2,348 B gzip（+2.35 kB）**（ShellFallback 半程 +2,159 · palette 半程 +189），**低于上界**；**CSS 不计入 200 kB 判据**，本次真构建的 CSS = **62.63 kB 原始 / 14.42 kB gzip**（3 个文件）。**出处**：`app/dist` mtime **2026-09-12 19:54:33** @ `HEAD = 199da54b`，入口 chunk `index-4qKuUwYr.js`（108,099 B，sha256 前 16 位 `C00AFAE4C7100300`）；**测量方式 = `node scripts/check-bundle-budget.mjs`（真实 `npm run build`，取 `tmp/build.lock`，第 1 次即取到）**。**从计划基线 97.16 kB 到终态 100.30 kB = +3.14 kB**，逐项机理见 §二。
2. **B9 的逐字声明**：**「只有接缝、没有纲领」—— 三档强度 / 双基调 / GSAP 在批 6。** 批 4 **没有**交付动效系统：它只把 `usePresence` 的 `[data-phase]` 三态、`--ed-dur-*` 时长变量与 `motion.css` 的 reduced-motion 块**接到了真实调用点**上（14 个弹层 × 3 组、toast × 3、空态/加载/错误行各一组）⇒ **界面第一次真的会动**（规格 §10 逐字「观感从批 4 开始变」），但**手感未设计、未调参、未做双基调**。**验收不得把接缝当最终手感，也不得声称动效系统已交付。**
3. **五类的观感变化规模（逐条给数，含「未动」的那一半）**：
   - **卡片边框 / 圆角 / 阴影**：`1px solid #e5e7eb` **240 → 226 处**（迁 14 为 `<Surface>`）；`borderRadius: 6 → 8` **实改 9 处**（**而计划预估是 254 处** ⇒ 其余 **245 处维持现状**：控件 161 · NM14 25 · 交互 13 · 透明 13 · 间接 1 · 有底色 41 里含语义色条 30）；**20 处阴影值换 token（其中 1 处有损**：`AiConversationDock` 的方向性投影换成双向环境投影）；顺带的**颜色变化**：边框冷灰 `#e5e7eb` → 暖纸 `--ed-border #EAE7E0`（14 处）· 近白底 `#f8fafc/#f9fafb/#fafafa/#fcfcfd` → `--ed-bg-canvas #FBFAF8`（8 处）。
   - **弱化文本 `Text`**：**186 处**改由 `Text tone="ink-3"` 接管（对比度 2.54:1 → **5.13:1** 的那一支）；**63 处例外一处未动**；**字号越界 558 处 / 120 文件一处未动**（批 5/6 才做映射）；已知视觉 Δ = **行高由六档字阶类接管**（原 `line-height: normal`）—— 被迁元素上仍留 `fontSize`/`lineHeight`/`fontWeight: 600` 各 1–2 处的越界项（逐处写进 `RESIDUAL` 理由）；**`ink-4` 全程 0 使用**（§4.3 条件③在仓内无实现）。
   - **空态**：切片内 **33 → 5 处**内联灰字空态；`compact` 20 处 ⇒ 空气略收；字阶 11/12/13 → 第 3 档（15.5px）；`GoalDetail:257` 的 `span → 块级`；`AiProviderSettings` 新增主行动按钮。
   - **加载**：**10 个文件**的加载态由手写灰字 → `Loading`/`Skeleton`（**6 处骨架**：GoalDetail / RefineLaunchDialog / RefineWorkbench / ReviewSessionPanel / WebArticleView / ReviewPage）；`SessionListBody` 等 8 处余量未动。
   - **错误行**：**49 个文件**改走 `StatusLine`（`display:flex; gap:8px`）；**6 个文件的迁移被回退**（B21）；三红字面量剩 **114 处 / 67 文件**。
4. **20 个弹层的档位宽度 Δ（「向上取档」的代价，逐条）**：`GoalPlanApprovalDialog` **560 → 720**（+160）· `GroupCreateDialog` **340 → 380**（+40）· `KnowledgeConceptDialog` **480 → 520**（+40）· `KnowledgeSystemWizard` **560 → 720**（+160）· `ProofreadPanel` **680 → 720**（+40）· `ModelCardFromNoteDialog` **460 → 520**（+60）· `RefineLaunchDialog` **680 → 720**（+40）· `PracticeQuestionsOverlays` **560 → 720**（+160）· `SopRunOverlay` **640 → 720**（+80）· `TaskLaunchDialog` **360 → 380**（+20）· `NoteAiDialog` **460/520 → 520** · **`RefineWorkbench` 1200/90vw → 720（−480）**（B12 的可见变化：并排 → 单栏可读，两栏 553 → 328）；其余 8 个弹层档位不变。**附加**：遮罩统一 `rgba(26,26,26,.34)`（原 `0.45/0.18` 混用）· `max-height` 统一 `85vh` · 标题 emoji **11 处 / 13 串被去掉**（`🗑` 等语义字符保留）· 关闭钮由自绘改为 `Modal` 统一（`${testId}-close`）· `RefineWorkbench` 的底栏由左对齐 → 右对齐。
5. **T15 的守卫回退代价**：为守住 B1/B2，**6 个文件逐字回退**（3 个已提交的 + 3 个从未提交的）⇒ **迁移面 55 → 49**，**三红字面量回升 +6 行**（`emptyStateRatchet` 例外 5 → 8 条）。这是**明确选中**的代价（B21：代价不对称）。
6. **`Text` 的行高接管是**已知**视觉 Δ**：jsdom 不排版、本批无像素证据 ⇒ **批 8 的像素探针才是判据**（本节 §六 已列）。
7. **贴边文件（动它必须先拆）—— 控制方实测口径（`[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count`）**：`ui/primitives/dialogMigration.e.test.ts` **300/300（余量 0 ⇒ 禁止再碰）** · `ui/primitives/textBaseline.ts` **299** · `ui/primitives/loadingRatchet.test.ts` **299** · `ui/primitives/emptyStateRatchet.test.ts` **296** · `pages/NotesPage.tsx` **300/300** · `ui/primitives/surfaceRatchet.test.ts` **287** · `ui/primitives/textRatchet.test.ts` **266** · `pages/ChatPage.tsx` **578/600** · `shell/CommandPalette.tsx` **203/220**。**规则：动它们之前必须先拆件（或先提预算并登记）；`dialogMigration.e.test.ts` 余量 0 ⇒ 任何新增都必须先挪走一段。**（另有 `ui/primitives` 侧：`surfaceBaseline.ts` 258 · `surfaceResidual.ts` 82 · `statusLineRatchet.test.ts` 191 · `statusLineBaseline.ts` 93。）
8. **一条既有 flake 未消除**：`components/KnowledgeGraphView.test.tsx` 的负载敏感用例（**批 3 开工前就有**），本批多份报告各观测到 1 次、**孤立复跑均全绿** ⇒ 非本批引入，未定位根因。
9. **计划预算被突破的清单（不是违规，是记账）**：`Modal.scroll-lock.test.tsx` 202/180 · `dialogMigration.a2.test.ts` 268/220 · `dialogMigration.b.test.ts` 224/200 · `dialogMigration.e.test.ts` 286/240 · `confirmMigration.test.tsx` 297/220 · `buttonMigration.test.ts` 268/220 · `toastMigration.test.tsx` 235/200 · `nativeButton.ratchet.test.ts` 263/200 · `textRatchet.test.ts` 214/260（**在预算内**）· `loadingRatchet.test.ts` 292/220 → 299 · `emptyStateRatchet.test.ts` 287/260 → 296 · `zIndex.guard.test.ts` 284/200 · `surfaceRatchet.test.ts` 260/260（恰好达标）。**绑定约束（≤300 ∧ 不新增豁免登记）全部满足**；批 3 已有 4 例同类先例，口径一致：**预算是估算，不为落进预算删判据。**

### 六、未验证（诚实单列，**不许含糊**）
（真机/WebView2 未跑 · 像素归批 8 · 20 个弹层中无测试覆盖的那些（**逐条列名**）· `App.tsx` 无渲染级测试面 · 五类迁移的观感无断言面）

1. **真机 / WebView2：未跑 —— 用户已裁决跳过验证**（不是「本批未做」，是**已裁决**）。**本批任何地方都不得出现「已在真机确认」类表述**；顶栏/面板的像素证据即使存在（T7 的 `RefineWorkbench` 探针）也来自 **headless Chrome，不是 WebView2**。
2. **像素 / 排版：归批 8**。jsdom **不排版、不加载样式表**（`vitest.config.ts` 的 `css` false）⇒ 本批所有「观感变化」都只有**类级/属性级/源码级**证据；**本批无视觉回归基线**。逐项清单：`6→8` 的 9 处、边框暖色、`canvas` 底、20 处阴影 token 化（含 1 处有损）、`Text` 的行高接管、20 个弹层的档位宽度 Δ、`StatusLine` 的块级/间距、`ChatLaunchMenu` 的锚定几何、`align="start"` 的实际观感、`belowNav` 的 `top` 落点与 `right 16→18` 的 2px 差、`Modal` 退场 160ms 的手感、`iconBtn` 宽度 +12px、`RefineStrategyPicker` 胶囊 chip 变圆角矩形。
3. **20 个弹层中「无测试覆盖」的那些（逐条列名）**：20 个文件里**只有 5 个有同名测试**——有测试面的是 `ChatSaveNoteDialog.test.tsx` · `InterviewDialog.test.tsx` · `RefineWorkbench.test.tsx` · `KnowledgeSystemWizard.test.tsx` · `TaskLaunchDialog.test.tsx`；**无测试覆盖的 15 个**：`GoalPlanApprovalDialog` · `GraduateDialog` · `GroupCreateDialog` · `GroupDeleteConfirm` · `KnowledgeConceptDialog` · `KnowledgeDecisionForm` · `KnowledgeModelDialog` · `ModelCardCreateDialog` · `ModelCardFromNoteDialog` · `NoteAiDialog` · `PracticeQuestionsOverlays` · `ProofreadPanel` · `RefineLaunchDialog`（`RefineLaunchDialog.vision.test.tsx` 只测视觉开关，**不测弹层形态**）· `SecondPassPanel` · `SopRunOverlay`。**并且**：`.e` 的判据只钉**源码形态**（20 个调用点 0 命中 ∧ `Modal.tsx` 恰 1 命中），「这 20 个调用点**各自渲染出来**的元素真的带 `role="dialog"`」**没有逐点渲染级断言**；`PracticeQuestionsOverlays` / `SopRunOverlay` 这两个弹层**从未被任何测试渲染过**（这也是 `.e` 必须存在的理由）。
4. **`App.tsx` 无渲染级测试面**（仓内**没有** `App.test.tsx`）⇒ 顶栏/AI toast/命令面板在**真实装配**下的形态只有 T10 的 `ai-toast` 渲染级断言一条（B15 的改写产物）与真机证据（未跑）。`ChatPage` 同样没有 `ChatPage.test.tsx`。
5. **五类迁移的观感无断言面**：五条棘轮都是**字面量计数**（处数/行数/键数），**不是**「渲染出来好不好看」的判据；`FROZEN_SURFACE_TAG_TOTAL = 14` 只证「14 个 `<Surface>` 开标签存在」，不证它们「看起来是一张卡」。
6. **暗档（`[data-theme="dark"]`）的反相描边未接线（B9）**：`--ed-shadow-*` 的暗档值是白色反相描边，但**暗档开关在批 6 之前不存在** ⇒ 迁移后的 14 处 `<Surface>` 与 20 处 token 阴影**在暗档下无人能验**（本批只保证「值来自 token」）。
7. **棘轮对 `style={S}` 间接写法是假阴**（`surfaceRatchet` ⑦ 的已知边界，写在 `overridesSurface()` 的文档注释里）；同族的还有：`stripComments` 的「`/` 前是 `<` 即认为正则起点」启发式会把 `</StatusLine></div>` 误判成正则并抹掉中间标签（实测 `KnowledgeSampleView.tsx:135`）⇒ 依赖它的棘轮可能**少算**极少见形态的命中（**假阴性方向**，本批迁移脚本另用保守掩码）。
8. **`emptyStateRatchet` 的 ①「本批已触碰」无法在测试内复算**（需要 git 历史）⇒ 那一半只在 **gitignored 探针在场时**由 ⑥a 覆盖（净克隆里 `skipIf` 跳过，⑥b 用盘上可复算的第二源顶上）。
9. **`cargo` 未复跑**（本批零 Rust 改动）—— 判据 2300/0/6 是**批 3 的读数**，不是本批的。
10. **本机无 `pwsh`（只有 PS 5.1）** ⇒ 本节一切命令以 `powershell` 语义执行；`cmd /c "… & echo EXIT=%ERRORLEVEL%"` 是**错的**（`%ERRORLEVEL%` 在解析期展开，报的是**上一条命令**的退出码）—— 本节所有 exit code 均改用 `$LASTEXITCODE` 采集，**先前用该写法得到的两处 `EXIT=0` 已作废重测**。
11. **`tmp/t4/tier-map.mjs` 已陈旧（exit 1）**：它校验的是 T4 时点的逐处快照，T5–T8 之后按定义失效（**不是**守卫退化）⇒ 本节 §一 ① 的「分档去向」只作历史记录引用。
12. **未验证的老账（来自各单元，逐条保留）**：T7 的三个工作台**没有截图**（只有 `RefineWorkbench` 有）· 超长不可断 token 在两栏内的表现未实测 · `ConfirmDialog.tier` 的**真实消费者在批 4 结束时仍是 0**（T11 的 8 处全在顶层、不传 `tier`）· `Toast` 的 `belowNav` 档下 `--ed-toast-stack-offset` 失效（多条并发同 `top` 重叠，无判据、jsdom 也验不了）· `--ed-nav-h` 兜底 56px 与 `tokens.css:73` **无绑定判据**（两处各自漂移不会报错）· `Modal` 的滚动位置在 `overflow:hidden` 后**不恢复**（无 `position:fixed` + `scrollTop` 补偿）· `MIN_CALLS` **未与 T15 的探针表逐格对拍** · `loadingRatchet` 的 `describe` 标题仍写「冻结 18 → 第一提交 13」（历史标签，未随第二次收紧改名）· A 类 26 处的「无等价档」是**语义判断**不是机器证明 · `bundle-eager-graph` 把 `import type` 计成静态边（批 3 follow-up #2，本批未修）。

### 七、follow-ups（逐条具名归属）
（批 3 的 #2/#15/#16/#17 + 本批新增的可执行项，**每条给归属批次**）

**A. 批 3 留下的（逐条点名，逐条给本次处置）**

| 批 3 # | 项 | 本次处置 / 归属 |
|---|---|---|
| **#2** | **`bundle-eager-graph.mjs` 把 `import type` 计成静态边**（11 个假阳性文件）⇒ 修工具；**改它会改历史读数 ⇒ 必须新旧口径并列** | **本批未修**（工具口径 89 与真实边 65 **并列报告**，见 §二 门禁 7）⇒ **归属：批 5 或独立小单元**（同一批内同时提供新旧口径） |
| **#15** | 规格 §6.2「本次改动」里的 **`会话·详情头改粘性`** 与 **`笔记·工具栏三层合并为单行`**（= ADR-034 的 S-4） | **本批实测未做**（`git diff … \| Select-String '^\+.*(sticky\|粘性)'` 为空；`NotesPage.tsx` 无 `Toolbar`）⇒ **归属：批 5（视图层样板）**；若批 5 未做 ⇒ **回落批 8**。落点：`ADR-034 §登记` 加注⑦ |
| **#16** | **3 套 markdown 渲染器归一**（B8：不并入批 4） | **本批零触碰**（规格 §12 的行已在 `42e88740` 加注）⇒ **归属：批 5 或批 7** |
| **#17** | **`ADR-034`（壳层）未写** | **✅ 本批已做**：`4905d4d8` 补写 + `783a62ae` 五条加注与两条新守卫 + `a25ed2c6` 钉单源/回写 B15；已进 `docs/adr/README.md` 索引 ⇒ **结清**（剩余 **ADR-035** 仍顺延批 6） |
| 其他批 3 项（非点名但同源） | #9（命令面板/AI toast/dock 裸 900 → 批 4） | **✅ 已做**（`bde807dc` · `4a804a58` · `8d84ecfe`）· #3（新判据必带变异体）= 本批**强制执行**（5 条棘轮 + 20 弹层 + toast + confirm + button 全部各带变异体）· #1（门禁 `--staged` 模式）= **仍归批 8**（本批实测提交树不自洽窗口见 §三 的 `8f5bd9f1` 与 T11/T12 的让路） |

**B. 本批新增（逐条：内容 + 归属）**

| # | 项 | 归属 |
|---|---|---|
| B-1 | **五类棘轮余量**（各自的计数与去向）：空态 **例外 8 + 余量 5 文件** · 加载 **8**（4 backlog + 3 `button-busy` + 1 例外）· 错误行 **114 处 / 67 文件** · 弱化文本 **63 处 / 44 文件 / 7 类** · 卡片边框 **226 / 108 + 261 / 109 + 24** | **批 5/7**（五条棘轮已冻结、只许降；`RESIDUAL` 每条带理由 + 防僵尸判据） |
| B-2 | **11 锚定菜单的退出语义**（含 `SelectionActionMenu.tsx:78` 的 `window` **捕获相** ESC 残留 + 4 处元素级 `onKeyDown`：`GroupSidebarRow`/`LinkEntityPicker`/`SessionDetailHeader`/`SessionListRow`） | **批 5 或批 8**（B1 裁定不迁；改它们 = 改菜单退出语义） |
| B-3 | **`Text` 的 558 处字号越界**（`9px×6 · 10px×95 · 10.5px×16 · 11px×431 · 11.5px×10`）—— 映射规则已在 `tmp/t16a/slice.md` ⑤ | **批 5/6**（`11.5` 只在 `font="mono"` 时合法；其余 `9/10/10.5/11 → 12`） |
| B-4 | **`ink-4` 与 §4.3 条件③**（审校模式 ≥4.5:1 在仓内**无实现**）⇒ 本批 `tone` 一律 `ink-3`、`ink-4` **0 使用** | **批 5/6**（补「审校模式」之后 `ink-4` 才可能被合法使用） |
| B-5 | **`b1-non-migrated` 9 处（2.54:1 冻结）+ `NON_MIGRATED_14`**：批 5/7 若要迁这 14 个文件的排版，**必须先由控制方裁决 B1/B2 的守卫范围** | **批 5/7（前置裁决）** |
| B-6 | **token 真源补 `pill` 档的四处**：`app/scripts/gen-tokens.mjs` · `ui/tokens.gen.ts` · `ui/tokens.css` · `ui/tokens.drift.test.ts:52` 的 `toEqual([3,5,8,10])` | **批 5/6**（token 层；现走 `var(--ed-radius-pill, 999px)` 兜底） |
| B-7 | **`Surface` 的 DOM 属性透传**（`onClick`/`id`/`aria-*`/`data-*`/`dangerouslySetInnerHTML`/`ref`）⇒ 解锁 **3 处**已点名 + 未来 21 处 | **批 5 与视图层一并裁**（B22 第 3 条①） |
| B-8 | **透明容器是否接受多一层底**（+**28 处**） | **批 5**（B22 第 3 条②） |
| B-9 | **错误行的「位置」问题**（`StatusLine` 迁移只解决墨度/结构，错误仍在列表原位、可能落在视觉盲区） | **批 5** |
| B-10 | **`SURFACE_CLASSES` 自计数式守卫是否升级为真判据**（MS1b：拿掉 `pill` **且**同步把 13 改回 12 ⇒ 绿；完整性方向的牙在 `style-contract.test.ts` 的 `Record<SurfaceRadius,string>`） | **批 5/8**（评估，不是缺陷） |
| B-11 | **`MIN_CALLS` 与 T15 探针表逐格对拍**（M-7 的下界值由 `scan-statusline-calls.mjs` 扫出，未与 `tmp/t15rec/migrated-table.md` 对拍） | **批 5/8**（或下一个动 `StatusLine` 的单元） |
| B-12 | **`docs/tech-debt/review-2026-09-11.md`**（**191 KB** · mtime **2026-09-11 01:32** · `git log --all -- docs/tech-debt/` **0 命中** ⇒ **批 4 之前的既有未跟踪残留**，本批未触碰） | **待用户裁决**（批 3 follow-up #4 同款；`docs-check` 已用「故意不写链接」规避断链） |
| B-13 | **批 8 的像素探针是观感判据**（本批 §六 列出的全部像素项） | **批 8**（用户已裁决跳过真机验证 ⇒ 本批不做、也不声称） |
| B-14 | 其余零散项（逐条带出处）：`Toast` 的 `belowNav` 堆叠失效（多条并发同 `top`）· `--ed-nav-h` 兜底 56px 无绑定判据 · `Modal` 滚动位置不恢复 · `loadingRatchet` 的 `describe` 历史标签 · `textRatchet`/`surfaceRatchet` 的锚是「值 > 0 的具名文件」（迁移归零后需换锚）· `bundle-eager-graph` 的 `import type`（= 批 3 #2） | **批 5/6/8**（逐条已在 §六 列名） |

### 八、与计划的偏差（本节自陈）
（实施中偏离计划处逐条列：哪一步 · 为什么 · 代价 · 谁批准）

> 口径：**这里只写「实际 ≠ 计划」**，不重复 §四 的裁决落点。每条给「偏离 · 为什么 · 代价 · 批准」。**本批**所有未经批准的规模缩小都在此列明**，不许只换数字。

1. **计划预期的「`6→8` **254 处**观感变化」只落地 9 处**（**本批最大的计划-实际偏差**）。**为什么**：254 是**切片全域计数**，不是 Surface 形态计数；B20 第 3 条把迁移面限定为「有背景 ∧ 容器 ∧ 非交互 ∧ 直接形态 ∧ 非 `NON_MIGRATED_14`」⇒ 够格只有 21 处、实迁 **14**（`6→8` 实改 **9** = 6 处随 `<Surface radius="panel">` + 3 处就地改）。**完整分区（非重叠，合计 254）**：**控件 161** · **NM14 25** · **交互容器 13** · **透明容器 13** · **间接形态 1** · **有底色容器 41**（其中标准卡边框 11 = 迁 6 + 就地 3 + 余 2；**语义色提示条 30**）。⇒ **其余 245 处归批 5/7/8**（控件档 / 语义色条 / NM14）。**代价**：批 5 的 `Button` 迁移会**再碰一次**这些元素（两轮工作，但避免了两轮返工）。**批准**：控制方 **B22 裁决第 2 条：维持现状，不机械拉齐**（理由：161 处是控件、25 处被 B21 挡着、现在硬拉齐会与批 5 两轮返工，且是一次无测试面的 245 处观感变化）。
2. **计划「卡片边框 **172** 处」在 B20 第 3 条约束下只有 21 处够格、实迁 14**。**完整分区**：`172 = 控件 96 + NM14 14 + 锚定菜单 4 + 交互 4 + 条件底色 4 + 透明容器 28 + 有底色容器 22`（控件 96 = 控件标签 74 + 控件常量 22）。**另外两类结构上表达不了**：**单向分隔线 57 处**（`bordered` 只出整圈）· **三元条件边框色 11 处**（`interactive` 给不了任意状态色）⇒ **一处未动、只登记**。**代价**：边框迁移面比计划小 **158 处**（172 → 14）。**批准**：B20 第 3 条 + B22 第 1 条。
3. **`Text` 的「24 处非弱化文本」作废 ⇒ 属性级重扫实为 6 处**。**为什么**：T16-A 的**行级**归属把「同行 `background:` + `color:` 三元」记成了 background（例 `LearningLibraryEngineSection.tsx:104` 的 `#9ca3af` 其实在 `color:` 上）。**属性级**重扫 = `color` 241 · `background` **3** · `border` **2** · 常量/映射 **3** = **249** ✔。**代价**：无（**处置不变：一处未动**）；但**任何引用「24 处」的地方都改用 6 处**（规格 §5.1 的 `Text` 行加注已按属性级写）。**批准**：控制方追认（`task-16b-report.md` §2 脚注 · §9.6）。
4. **基线数字的漂移与机理（逐条给口径，不只换数字）**：
   - **弱化灰 `#9ca3af`**：计划 **296 行 / 105 文件** ⇒ 实测在 `42e88740` 上 **295/105**（计划的「296」是**手抄噪声**，与 T1 的 295 一致）⇒ 终态 **249/100**。
   - **字号越界**：计划 **604 处 / 124 文件** ⇒ 在 `42e88740` 上**逐字复现 604/124**；`8f5bd9f1` 时 **586/123**；终态 **558/120**。**上一轮探针的「576」不是口径差** —— 它的越界正则**漏了 `11.5`**（576 = 586 − 10；`regex-diff.mjs` 实测两条正则全量只差 1 处）。**`fontSize` 全量**：计划 1271–1273 ⇒ `42e88740` **1274** ⇒ 终态 **1123**。
   - **加载态**：计划者探针 **19 行 / 19 文件** ⇒ 实测 **18/18**，机理 = `p.includes("/ui/primitives/")` 在 **Windows 反斜杠**下恒假 ⇒ 域过滤**整个失效**（陷阱 #26）。
   - **`1px solid #e5e7eb`**：计划 **180 处**（精确写法）⇒ 在 `42e88740` 上**逐字复现 180**、含复合写法 **258 行 / 111 文件**；终态 **171 精确 / 226 含复合 / 108 文件**。
   - **`line-limits` 的 301–600 档**：计划 **123 / 123** ⇒ 终态 **122 / 122**，机理 = `components/SecondPassPanel.tsx` **303 → 289**（离开该档）。
5. **计划错处累计 ①–⑰（全表；`⑧–⑰` 是台账 §四 点名的那一段）**：
   - ① Task 5 的 **6 个「需改」测试文件实际 0 处需改**（全仓对这 9 个锚点零引用）；② Task 5 的 V5 把 `zIndex.guard` 记成 **4 用例**（实为 **7**，4 是 T4 之前的数）；③ Task 6 的 **M5 是一条无断言的空变异**（锚 `task-launch-backdrop` 自 T4 起已无引用）；④ Task 0 Step 2 的两处口径（六档值判据的真身是 `ui/zIndex.test.ts:16-25` 而非 guard；删规格行红在**模块加载期**）；⑤ 计划 `:13` 的 **gitignored 链接**（导出树 `docs-check` 必红）—— **✅ 已修 `0228a013`**；⑥ T1 发现：Step 5 的 **M4 期望写反**（基线 −1 实测红、且**必须**红）；⑦ T1 发现：**计划者探针在 Windows 下域过滤失效**（#26）；
   - ⑧ `SessionListPanel.tsx` **误记为第 4 套 toast 实现**（它只是 `showToast` 的消费者 ⇒ **零 diff、不在提交路径**）；⑨ Task 5 的「6 个测试文件需改」= 同上 ① 的另一次登记（T5 报告 §1/D1）；⑩ Task 6 的 M5 空变异（同上 ③）；⑪ Task 9 Step 2 的 **autofocus 前提错**（`Modal` 首个可聚焦元素是**关闭钮**，`Modal.test.tsx:200` 逐字钉着）；⑫ 任务总表把 T11 标为可与 T12 并行、**漏了 `AiProviderSettings.tsx` 双点名**；⑬ **B4 的 37 文件清单未扣除 B1/B2 的 14 条**（实测 2 文件 5 处）；⑭ Task 11 的「**16 处 `confirm(`**」与「`impacts{` ≥ 8」**两个数都不成立**（实测 `confirm(` 共 **24** = `window.confirm` 8 + 非 window 16；`impacts={` = **6**；8 处落在 **6** 个弹层实例上）；⑮ Task 13 的 Step 3 + V2 **与铁律①自相矛盾**；⑯ 施工图 §13.1/§13.2 **与守卫 ② 的文本口径互斥**；⑰ 施工图**未核对「文件是否本就 >300」**（施工图 23 个文件里 **8 个在 HEAD 上已 >300**）。
   - **另有两条同源错处（台账未编号，本节补登）**：⑱ Task 14 的 V2/V3 三个数**不可复现**（`19（可见）+ 9（门控）= 28 行 / 24 文件` 与 `总数 ≤ 88`；真值 **18/18**，「门控」用任何可辩护口径都复现不出 9/5）；⑲ Task 8 的 V3「四个测试文件共 **92** 条」实为 **70**（6+31+18+15）。
6. **`slice.md` §6 实际 6 条坑，派发书误写 8 条 —— 控制方引用错误，如实登记**。事实：`tmp/t17a/slice.md` §6 逐字只有 **6 条**（单向边框 57 · `6→8` 的 254 · 14 文件禁 import · 药丸档已就位 · `FROZEN_SURFACE_TAG_TOTAL=0` 会红 · 三族只许降）；T17-B **按 6 条执行**并点名「以免下游按 8 条找证据」。**代价**：无（内容无缺失、无截断）。**批准**：N/A（引用错误）。
7. **两条口径冲突由 T17-B 点名、控制方 B22 裁决**（同 1/2 条）：**接受保守迁移面 · 维持现状**；另登记两条**解锁路径**（`Surface` DOM 透传 / 透明容器是否接受多一层底）为 follow-up（见 §七 B-7/B-8）。
8. **提交历史的两处不实（不重写历史，只登记）**：① `8f5bd9f1` 是 **T13 误 `--amend`** 的产物（内容 = T14 的 6 路径 + T13 的 2 文件；**无内容缺失**；原 sha `0f9dbcc9` 只在 reflog）⇒ 处置 = **登记**（不 reword/rebase）；② `54b9b938`（T3）**携带了 T2 的 ADR-033 加注**（T2 写了未 `git add`）⇒ 归因改写为「由 `54b9b938` 落库」。**批准**：控制方对 ① 明示「接受并登记」。
9. **本次收口的三处「不做」（逐条给理由，避免被读成遗漏）**：① **规格 §12 的 markdown 归一那行不再重复加注** —— 它在 `42e88740`（批 3 收口）已就地写明 B8 的去向（「不并入批 4 ⇒ 批 5 或批 7」），**重复加注只会制造第二处真源**；V4 的存在性核对按「已在位」通过。② **`docs/standards/line-limit-exemptions.md` 不在收口提交路径里** —— `--write` 复跑**零 diff**（sha256 前后一致），符合「只在有 diff 时改」的条件。③ **`ui-ux-system.md` 不动** —— T17-A 复核：它**没有**「四档圆角」字样（其圆角表述是 2026-08-24 旧目标态、§十一 自陈「待批 8 统一回写」）⇒ 第 5 档 `pill` 的落点是**规格 §4.2**。
10. **一处「派发书口径错误」的更正**：控制方派发书写的「§6 的 8 条坑」（= 第 6 条）与「`tmp/t17a/slice.md` 是否被截断」的疑问 ⇒ 已逐字核对：**6 条，无截断**（陷阱 #32 的又一实例）。
11. **本任务自身的一处仪器自纠（如实登记）**：第一次 `cmd /c "… & echo EXIT=%ERRORLEVEL%"` 采集到的两处 exit 0 **是假的**（`%ERRORLEVEL%` 解析期展开）⇒ **已全部改用 `$LASTEXITCODE` 重测**；另有一次「按 `[n, rel]` 建 Map」的比较脚本 bug ⇒ `LOST=143` **假读数**，已修正为 **LOST=0（真）**（见 §二 门禁 5-对拍）。**两处都保留了作废记录**（`tmp/t18/raw/`）。
