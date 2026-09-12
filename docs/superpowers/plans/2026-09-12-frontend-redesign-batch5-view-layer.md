# 批 5 视图层实施计划（L3：`ViewSpec` + `views/registry` + `ViewSwitcher` 原语 + 会话 5 视图 + 笔记 3 视图 + 惰性挂载 + flushSave 守卫）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把规格 §7 的 **L3 视图层**从零建起来并接进产品：**`ViewSpec` 带可执行加载器 `load`**（C1）· **`views/registry.ts` 单一注册表**（只被两个懒页 import）· **`ViewSwitcher` 原语**（进 barrel）· **会话 4+1 视图**（三轨对齐 / 印样 / 原文 / 卡片流 + 保留既有「笔记预览」）· **笔记 3 视图**（原文 / 卡片流 / 带证据三轨——第三轨是 C2 的条件项）· **模块级惰性挂载**（`React.lazy` + `Suspense`，默认视图常驻）· **编辑态切视图 `flushSave` 守卫（失败则阻断 + 就近提示）**。规格 §10 批 5 行的验收逐字为：**「各 ≥2 种形式可用；原文不丢」**。

**Architecture:** 本批**不改数据层、不改壳层架构、不装 GSAP、不新增依赖、不动 `src-tauri/**`**。改动只发生在四处：① **拆件**（`SessionDetailPanel.tsx` 297 → ≤150、`SessionScreenCards.tsx` 193 抽单卡、`NotesPage.tsx` 300 → ≤285）；② **地基**（`ui/primitives/ViewSwitcher.{tsx,css}`、`views/registry.ts`、`views/useViewMemory.ts`）；③ **视图组件**（`views/session/**`、`views/note/**`）；④ **接线 + 守卫**（两个宿主、`style-contract.test.ts` 的新增枚举块、`views/architecture.guard.test.ts`）。**唯一公共入口仍是 `ui/primitives/index.ts`（barrel）**；视图层的一切能力都经容器注入（§7.1 依赖方向：领域 → 视图 → 容器 → 原语，**禁止反向**）。

**Tech Stack:** Tauri 2 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6 · Vitest 4（全局 `environment: "node"`；组件测试首行必须 `// @vitest-environment jsdom`）· Node 24（`scripts/*.mjs` 门禁）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（**§1 的 L3 五条（第 19–23 条）** · **§7 全节（§7.1 四部件与依赖方向 / §7.2 对象×视图矩阵 / §7.3 三条硬约束）** · §8.4 的两个时长 token · **§8.6.1 第 3 条的响应层接缝** · §10 批 5 行 · §11 验收 6/9/11 · §12 · §13 三行风险）

**控制方裁决（硬输入，不许重新论证）：** 批 5 侦察底稿目录（**gitignored，不入库** —— 本地路径 `.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/`）下的 **`rulings.md` 的 C1–C15 + 附 A + 附 B**（**最高依据**）、`recon.md`（607 行）、`decisions.md`（468 行）。**该目录整体不入库**（AGENTS.md §0 的仓库口径：`.superpowers/` 只在本地工作树可见），故此处**不给出相对链接** —— 需要读裁决的读者请在本地工作树按上述路径打开（批 4 计划曾因一条指进 `.superpowers/` 的相对链接让导出树 `docs-check` 必红，先例见其修复提交 `0228a013`）。

**输入材料（开工前六份，优先级即此序）**

1. **本计划的 §实测基线**（计划者在 `dev@091d1c3d` 实跑八条门禁得到；**下游任何任务都不得引用侦察里"批 4 未收口"时点的读数**——那些会被本批基线整体替换）
2. **控制方裁决 C1–C15 + 附 B**（本计划的**行动依据**；每条裁决的落点见 §裁决落点表，**不许削弱、不许绕过**）
3. 规格对应节（§1 L3 五条 / §7 / §8.4 / §8.6.1 / §10 / §11 / §12 / §13）
4. 兄弟计划 [批 4](./2026-09-12-frontend-redesign-batch4-primitives.md) 的 **Global Constraints · 统一作业模式 · §收口回写八节**（本计划的格式母本）与 [批 3](./2026-09-11-frontend-redesign-batch3-shell.md) 的 §收口回写（壳层契约与 `--nav-h` 口径）
5. 批 4 台账（gitignored）`.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/progress.md` 的 **§四 陷阱 #25–#32** · **§五 23 条 T18 回写清单** · **§八**，与同目录 `rulings.md` 的 **B1–B22**
6. `.superpowers/sdd/DISPATCH-TEMPLATE.md`（实施者纪律）· `.superpowers/sdd/REVIEW-TEMPLATE.md`（评审者纪律）

---

## Global Constraints

- **本批范围（规格 §10 批 5 行逐字）**：「`viewRegistry` + `ViewSwitcher` + 会话 4 视图 + 笔记 3 视图 + 惰性挂载 + flushSave 守卫」；验收列逐字：「各 ≥2 种形式可用；原文不丢」。
- **★ 本批的六个非目标（违反即任务失败）**
  1. **不动后端数据模型、不动 `src-tauri/**`**（规格 §3 红线 6：「后端数据模型零改动 —— 除下列两处经批准的例外」，**本批不新增例外**）。C2 的探针**只读 IPC 清单**，不写 Rust。
  2. **不做 3 套 markdown 渲染器归一**（C8）：`ChatMessageMarkdown` → `NoteMarkdown` 的归并、`NotePreviewView` 手写解析器的替换**全部转批 7**。
  3. **不碰 `NON_MIGRATED_14` 的排版**（C7）：`RichEditorView.tsx` / `NoteEditView.tsx` 在名单内 ⇒ 本批这两个文件**零改动**；两条守卫（`dialogMigration.e.test.ts` ② / `buttonMigration.test.ts` ④）**一字不改且绿**。
  4. **不做 `Surface` 域两条**（C12）：DOM 属性透传（+3 处）与「透明容器接受多一层底」（+28 处）**转批 7**。
  5. **不做「笔记工具栏三层合并」**（C13）：**转批 8**（与 C10 的字面差异见 §待裁决清单 ①）。
  6. **不装 GSAP、不做动效纲领**（C14①/§8.6.1）：本批只把 `ViewSwitcher` 的**响应层接缝**（`--ed-dur-micro` 120ms）落到位；**三档强度 / 双基调 / 6 个签名动效属批 6**。
- **★★ C1–C15 是硬输入（不许重新论证、不许绕过）**

  | # | 裁决摘要（逐字要点） | 本批的执行形态 |
  |---|---|---|
  | **C1** | 注册表住 `app/src/views/registry.ts`；`ViewSpec` 用 **`load: () => Promise<{ default: ComponentType<Props> }>`** 取代规格 §7.1 的 `Component` 静态字段与 `lazy` 布尔；宿主用 `React.lazy` + `Suspense`（复用 `ShellFallback`）；**同步改规格 §7.1 字段清单** | **T6**（注册表）+ **T5**（原语）+ **T10/T14**（宿主）；硬要求①→**T15** 的图级判据；②→**T0/T10/T18** 的双证据；③→**T18** 的懒 chunk 台账；④`manualChunks` **不动** |
  | **C2** | 会话三轨 = **转写 / 画面 / OCR 文字**（零新数据面、不碰 Rust）；笔记「带证据三轨」**先做只读数据可行性探针**（存在 ⇒ 3 视图；不存在 ⇒ 2 视图 + 加注规格 §7.2 与 §11-6 + 登记批 7）；**不许空壳视图**；§8.6 签名动效 1 就地加注「第三轨 = OCR」 | **T1**（探针）+ **T7**（三轨视图）+ **T13**（条件项）+ **T18**（加注） |
  | **C3** | 抽单卡子件 `SessionScreenCard`（纯展示 ≤120）供两视图复用；`SessionScreenCards` 退化为「每屏一卡的列表容器」；**前置原子提交**先补 1 条行为级判据；抽件后**锚点集合不变**；框选态留容器；**新文件不得给五类棘轮加任何计数** | **T3**（两个提交）；锚点口径见 §待裁决 ②（该文件 `data-testid` 实测 **0 处**） |
  | **C4** | `flushSave` 失败**不改接口**：调用方 `try { await flushSave() } catch { 阻断 }`；`catch` ⇒ **不切视图 + 保持编辑态 + `ViewSwitcher` 旁渲染一行 `StatusLine kind="error"`（不用 toast）**；`NoteEditHandle` 升级登记批 8；**显式登记未做**：`RichEditorView` 的 Ctrl+E / 完成按钮路径仍不阻断；错误行宿主在**非 `NON_MIGRATED_14`** 的层 | **T14**（守卫 + 提示）；判据三条 + 登记两条 |
  | **C5** | 键 = **`view:default:{objectType}`**，`objectType ∈ {"session","note"}`（**不含 `kind`**）；web 会话保持早退分支（不渲染切换器 ⇒ 不写记忆）；**新建 `useViewMemory`**（≤70 行，注入 `Storage`，照 `utils/draftStore.ts` 范式）；**不复用 `useColumnLayout`**；🔴 **显式改判旧裁决 D1**：`SessionDetailPanel.tsx:64` 的 `useEffect(() => setViewMode("raw"), [sessionId])` **仅在该 `objectType` 没有记忆时生效** | **T6**（hook）+ **T10**（会话接线，含 `:64` 改判）+ **T18**（回写 v0.22「过程中纠正的计划错误」段） |
  | **C6** | `focus*` 只做**最小收敛**：5 个粘滞字段（`focusSessionId`/`focusNoteId`/`focusNoteSearch`/`focusSystemId`/`focusGroupId`）补 `onFocus*Consumed` 复位回调，**声明形态与类型一律不动** ⇒ `CommandPalette.kb.test.tsx:173-181` 继续绿；`{value,key}` 全量统一登记批 7/8；**必须改正** `useNotesDeepLink.ts:18` 的注释；`App.tsx` **584/600 ⇒ 新增后必须 ≤600，超了先拆（不许登记）** | **T16**（1 提交） |
  | **C7** | 批 5 **不碰** `NON_MIGRATED_14` 的排版；编辑态提示落**宿主层**（`NoteReadingView.tsx` / `NotesReadingColumn.tsx`，**都不在名单内**）；两条守卫**一字未改且绿**；残留登记：`RichEditorView` 内部若要显示保存错误**做不到** ⇒ 登记批 7/8；**撞墙则回退该处 + 登记 + 不改守卫 + 点名上报** | **T14** + **T15**（守卫域自证）+ **T18**（登记） |
  | **C8** | **不做归一**，规格 §12 就地加注「批 5 未承接，转批 7」；**防止「3 套变 4 套」**：笔记卡片流的派生器**不得手写 markdown 解析器** —— 必须复用既有 `react-markdown` 栈，文件头显式命名「**结构派生器，批 7 归一**」；判据 = 全站 `react-markdown` **运行时** import 数**不增加**（今天 2 处） | **T12**（`noteCardModel.ts` 的 remark 插件 + `NoteMarkdown` 的**只追加**槽）+ **T12/T15** 的计数判据 + **T18**（加注） |
  | **C9** | **拆件作第一批任务**：`SessionDetailPanel.tsx`（297）先拆（抽出原文视图 + 视图切换器组），主文件降到 **≤150**；`NotesPage.tsx`（300）**先拆**才允许任何改动；`ChatPage.tsx`（579/600）**本批不动**（在计划里写明）；**不许动豁免表**；每个拆件**独立原子提交**、`line-limits --full` exit 0；无测试面的被拆文件**先补行为级判据再拆** | **T2/T3/T4**（5 个提交）+ **Global Constraints 的贴边表** |
  | **C10** | 留批 5 = **#2 #3 #11 #13 #14 #18**（+#1 只做「预留」见 C11）；转批 6 = **#5 #6 #8 #12**；转批 7 = **#4 #7 #9 #10 #15**；转批 8 = **#17 #20**；不属批 5 = **#19**；**#16 = 只裁不动**（C7）。**两处修正**：① #12 确定转批 6（本批不用 toast 做阻断提示）；② **#11 留批 5 但只作为判据口径** —— 首屏判据必须**同时**给「工具口径（89）」与「TS 编译器 API 剔 `import type` 的真实边（65）」，并写明用哪个口径下结论；**不修工具** | **T16**（#13）+ **T17**（#11 口径 + #14）+ §待裁决 ①（#3 的冲突）+ **T18**（#2 的粘性读数入账） |
  | **C11** | 批 5 在正文列头部（`ViewSwitcher` **下方**）**预留一个固定的错误区槽位**（结构与样式钩子），**不重排**已有 `StatusLine` 调用点的位置；实现与像素判定转**批 8**；规格 §5.1 就地加注 | **T10/T14**（槽位）+ **T18**（加注） |
  | **C12** | `Surface` 域两条**都转批 7**（DOM 透传 +3 / 透明容器 +28） | 本批**零动作**；只在 §收口回写登记 |
  | **C13** | 批 5 做 `SessionDetailHeader.tsx`（161）的**粘性头**（sticky + `top` 值来自 token）；**先补 1 条行为级判据**（该文件无同名测试），判据形态 = 静态结构级 —— **jsdom 测不出真实粘性**，这一点必须写进「未验证」；「笔记工具栏三层合并」**转批 8**；规格 §6.2 与 ADR-034 加注⑦ 就地加注去向 | **T11**（1 提交）+ **T18**（加注） |
  | **C14** | 新建 `app/src/views/`（`session/` + `note/` 子目录）；文件名与行数预算照侦察表；**加两条**：① `ViewSwitcher` **必须进 barrel** 且在 `style-contract.test.ts` 的枚举里（ADR-033 §1/§4），**零行内 style**，覆盖 §8.6.1 第 3 条的响应层接缝（`--dur-micro` 120ms）⇒ **首屏 Δ 真实构建后登记**；② 每个视图组件的**第一条判据**是「**不 invoke**」（注入 spy 断言 `invoke` 零调用） | **T5**（原语；口径见 §待裁决 ③）+ **T7–T9/T12/T13**（每视图的「不 invoke」）+ **T15**（图级：`views/**` 零 `@tauri-apps` import） |
  | **C15** | **每个新生产文件 ≥2 条行为级判据，每条各带自己的变异体**（不设快照、不设源码文本断言）；变异体纪律照批 4：**每变异新解一棵树 · CONTROL 在冻结提交树上取 · harness 把「跑到了断言（用例数 >0）」与「跑红了」分开判 · 禁 `--reporter=basic`**；「只能登记」（不许编造弱判据）：`scrollTop` 恢复真实性 · sticky 真实粘性 · 视图密度观感 · 切视图卡顿 · 真机/WebView2 · 惰性挂载的运行时内存效果 | 每个任务的 **Verification** 表逐条给「判据 ↔ 变异体 ↔ 期望」；「只能登记」清单见 §诚实边界 |
- **★ 附 B 的七条硬约束（逐条落成判据或「只能登记」）**
  1. **首屏预算**：`check-bundle-budget` **必须真实构建**（执行单元自己跑）· **首屏 Δ=0 是构造性的**（新视图只被懒页 import）+ `ViewSwitcher` 进 barrel 的小额增量要**登记 Δ 与机理**。
  2. **零新增依赖**（批 4 B10 延续）· **零新增豁免登记** · 新文件一律 **≤300**。
  3. **三条硬约束**（规格 §7.3）：原文永远保留 · 非默认视图**模块级**惰性（`React.lazy`）· 编辑态切视图先 `flushSave` 失败则阻断（C4）。**机器判据见 §三条硬约束的机器判据**。
  4. **新文件的 UI 不得给五类棘轮加计数**（`textRatchet` / `surfaceRatchet` / `emptyStateRatchet` / `loadingRatchet` / `statusLineRatchet` 各查一次）。
  5. **B1/B2 守卫不动**（C7）· **`NON_MIGRATED_14` 不得新增 import 原语层**。
  6. **既有断言不许改**（唯一例外需先请裁；**本批预计 0 条** —— 见 §待裁决 ③ 的类名空间方案，它把这条**做到逐字成立**）。
  7. **报告必含**：八门禁逐条（命令 + exit code + 读数）· **B9 的中间态声明**（见下）· 诚实边界（区分「仪器不可达」与「本批未做」）· 首屏读数带 **dist mtime + 提交号**。
- **★ B9 的中间态声明（每个任务的报告必须逐字写这句）**：**本批交付的是「结构与内容」；手感（三档强度 / 双基调 / GSAP）在批 6。** `ViewSwitcher` 只落 §8.6.1 第 3 条的**响应层接缝**（`--ed-dur-micro` 120ms 的 `transition`），**不装 GSAP、不写 `@keyframes`**；验收**不得**声称动效系统已交付。
- **★ 原语层的三条铁律（ADR-033，违反即返工）**
  1. **`ui/primitives/index.ts` 是唯一公共入口**；组内互引用走相对路径，**调用点不得深导入**（深导入**不带** `motion.css`）。
  2. **不得用行内 `style` 覆盖类语义**（ADR-033 §4）：`style` 只许用于**布局**（宽高、flex、间距）与批 6 的动效接缝。
  3. **`ViewSwitcher` 的类名走既有 `ed-btn` 基类命名空间**（容器 `.ed-btn-group` + 段 `.ed-btn--segment`）：理由与代价见 §待裁决 ③（**这是本批「既有断言 0 改动」的关键**）。
- **★ 行数纪律（唯一有效口径）**：单文件 **≤300 行**（**全部行数、含空行**），口径 = `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` == `scripts/line-limits.mjs` 的 `countLines()`。⚠️ **绝不使用** `Get-Content`（本机 PS 5.1 按 GBK 解码，**少算可达 56 行**）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（`NotesPage.tsx` 末尾**不带换行**，会少算 1）。
  - **新文件 ≤300 且不许 `--write` 登记**（301–600 档要登记；>600 必须硬拆）。`line-limits.mjs` 的 `FROZEN_OVER_LIMIT` **当前是空数组**（实测 `scripts/line-limits.mjs:32-33`），即 >600 是零容忍。
  - **🔴 计划里每个任务给的「预算行数」是估算，不是绑定约束**；**绑定约束是 ≤300 且不新增豁免登记**。⇒ 实施者**不得为落进预算而删判据**；超预算**登记即可**，但**超过 300 必须拆**。
- **★ 六个贴边文件（动手前先量，别等门禁红）**

  | 文件 | 实测 | 余量 | 纪律 |
  |---|---|---|---|
  | `app/src/pages/NotesPage.tsx` | **300/300** | **0** | 🔴 **不许加一行**：C9 要求**先拆**（T4），拆到 ≤285 才允许 T16 的 `focus*` 接线 |
  | `app/src/ui/primitives/dialogMigration.e.test.ts` | **300/300** | **0** | 🔴 **禁止再碰**（批 4 T18 逐字「300/300（余量 0 ⇒ 禁止再碰）」）；它承载 `DIALOG_20` / `NON_MIGRATED_14` 的守卫 |
  | `app/src/ui/primitives/textBaseline.ts` | **299** | 1 | 🔴 本批**零改动**（batch4 #5 的 558 处字号越界**转批 6**） |
  | `app/src/ui/primitives/loadingRatchet.test.ts` | **299** | 1 | 🔴 本批**零改动**（棘轮只读） |
  | `app/src/components/SessionDetailPanel.tsx` | **297** | 3 | 🔴 **本批核心改动点**：T2 先拆到 **≤150**，再由 T10 接线 |
  | `app/src/pages/ChatPage.tsx` | **579/600** | 21 | 🔴 **本批不动它**（C9 逐字；批 4 台账曾把它记作 578 = `7457c7f1` 时点的陈旧读数，**579 是权威**，附 A 已就地更正） |
  | （参考）`app/src/components/SessionScreenCards.tsx` | 193 | — | T3 抽单卡后**必须仍 ≤300**（预算 ≤150） |
  | （参考）`app/src/components/SessionDetailHeader.tsx` | 161 | — | T11 加粘性后**必须 ≤300**（预算 ≤180） |
  | （参考）`app/src/components/notes/NotesReadingColumn.tsx` | 166 | — | T14 变笔记视图宿主后**必须 ≤300**（预算 ≤260） |
  | （参考）`app/src/components/NoteMarkdown.tsx` | 244 | — | T12 加一个**只追加**槽后**必须 ≤300**（预算 ≤270） |
  | （参考）`app/src/App.tsx` | **584/600** | 16 | T16 的 `focus*` 收敛后**必须 ≤600**（超了先拆，不许登记） |
  | （参考）`app/src/ui/zIndex.guard.test.ts` | 262 | — | 本批**零改动**（新代码不得写裸数字 z-index） |
- **改造后必须平齐的门禁基线（`dev@091d1c3d`，计划者本轮实跑；见 §实测基线）**

  | 门禁 | 基线 |
  |---|---|
  | `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 122 · 登记条目 122** |
  | `node scripts/docs-check.mjs` | exit 0（扫描 276 / 检查 176，五项全 ✅） |
  | `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** |
  | `cd app; npx tsc --noEmit` | exit 0（0 错）· ⚠️ **必须单独跑**（vitest 用 esbuild 剥类型、不做类型检查） |
  | `cd app; npx vitest run` | exit 0 · **166 文件 / 1608 用例 / 0 失败 / 0 skip**；**本批判据 = 既有用例逐文件「一条不许少」**（基线快照 `.superpowers/.../tmp/t0/vitest-perfile.txt`），新增只增不减 |
  | `node scripts/check-bundle-budget.mjs` | exit 0 · 首屏 **100.30 kB**（100,297 B gzip）· 预算 200 kB · 余量 **99.70 kB** · 懒 **22 个 575.16 kB**（不计入）· CSS 62.63 kB（**不计入判据，只报告**） |
  | `node scripts/bundle-eager-graph.mjs` | exit 0 · **89 文件（源 76 + CSS 13）· npm 包 4**；**TS 编译器 API 剔 `import type` 的真实边 = 65**（C10 #11 要求的**双口径**） |
  | Rust（`cd app/src-tauri; cargo test --test app_lib_tests`） | **本批零 Rust 改动**的预期：`git log 091d1c3d..HEAD -- app/src-tauri` **必须为空** ⇒ 判据仍是批 3 收口的 **2300 / 0 / 6**。⚠️ **不得**把「未跑」写成「已跑」；**会碰 Rust 的任务 = 0**（C2 的探针只读 IPC 清单：`app_commands.rs` 与 `invoke_handler` 的**只读** grep） |
- **★ 每条读数必须带出处与时刻**：本批开工时 `app/dist/index.html` 的 mtime = **2026-09-12 19:54:33**、入口 `index-4qKuUwYr.js`（108,099 B）= 批 4 T18 的产物。**任何「前后对比」的首屏读数都必须写明 `app/dist` 的 mtime + 对应提交 sha**；`check-bundle-budget.mjs` **不打印 mtime**（实测其 provenance 只有「dist 路径 + 入口 chunk 名 + 逐 chunk 字节」）⇒ **mtime 由执行单元自采**：`(Get-Item app/dist/index.html).LastWriteTime`。
- **★ 真实构建的取锁协议（本仓**没有**工具级锁 —— 这是单元约定）**
  - 事实（**实测**）：`Select-String -Path scripts/check-bundle-budget.mjs -Pattern "lock"` ⇒ **0 命中**；全仓 `**/build.lock` ⇒ **0 命中**；脚本默认 `spawnSync("npm", ["run","build"], …)`（`:294-297`）。批 4 报告里的「取锁 `tmp/build.lock`」是**并行单元之间的人工约定**，不是脚本能力。
  - 约定（**照批 4 沿用**）：跑真实构建前先取锁 —— `$lock = ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\build.lock"`；`New-Item -ItemType File -Path $lock -ErrorAction Stop`（**已存在即抛**）⇒ 占用则退避重试（30s × ≤6）；`finally { Remove-Item $lock -Force }`。**取不到锁不许硬跑**（`app/dist` 是本批 T0/T18 的 provenance，两个构建并发会让 Δ 无法归因）。
- **★ 首屏/可迁移性的判据形态（一律三件套，永不使用裸绝对数）**：① 工具原始读数（**注明口径**）② **Δ（相对 `091d1c3d`）** ③ **机理核查**（`pages/**` 新增几个 · npm 包 0 新增 · **新进首屏集合 = []**）。**真实静态边用 TS 编译器 API 剔 `import type`**（C10 #11）。
- **★ 仪器纪律（承批 1/2/3/4 的 32 类陷阱，本批逐条适用；下面只列本批最常踩的）**
  1. **任何「0 命中」/「不存在」结论必须点名仪器**，并先证明该仪器能命中一个已知存在的串、且对无意义串报 0（**双侧自证**）。
  2. **禁用裸 `includes()` / 子串 grep 判连通性**（批 1 实测 6 例误判）。
  3. **文本扫描型判据必须先剥注释**（正解先例 `app/src/shell/TopBar.test.tsx:34`、`sliceScan.stripComments`）；**中文串一律不经 PowerShell 字符串层**（PS 5.1 按 GBK 误解码 ⇒ 假 0 命中）。
  4. **PowerShell 单行 + 嵌套引号会 `SyntaxError`**（批 3 W29）⇒ 本计划**所有判据都给可粘贴的脚本文件路径**，不写 `node -e "…"` 单行。
  5. **`git archive` 取不到未跟踪文件**，解包树里没有 `.git`（`git grep` 静默 0 命中）；**导出树必须用 `git -c core.autocrlf=false archive`**（否则 CRLF 让测试解析失败 ⇒ 假读数），**junction 借 `node_modules`，删树前先摘点**。
  6. **`--no-build` 在导出树必失败**（`dist` 不入库）⇒ 导出树内要跑预算守卫必须先在树内 build。
  7. **`Δ` 恰为 0 时先当仪器故障**（先自证仪器能测出已知差异，再下结论）；**< ~2 kB 的 Δ 必须用同源真构建对比**，不能拿不同时点的仓内 `dist` 相减（rollup 的 CSS 拼接顺序非确定性，批 4 实测同源两树差 9 B）。
  8. **`--outputFile` 按仓库根解析**；含空格/中文的路径不能经 `shell:true`（批 4 陷阱 #29）。
- **★ 变异体与守卫纪律（C15 + 批 4 附纪律，逐条适用）**
  1. **变异体实验一律在导出副本里做**；**绝不许在 `app/src/**` 上「改→跑→还原」**（批 3 两起、批 4 #28 一起；正解 = **每个变异新解一棵树**）。
  2. **CONTROL 必须在冻结提交树上取**（批 4 #28 家族：脏树上 `dialogMigration.e.test.ts` 曾假红 1 条）。
  3. **harness 必须把「跑到了断言（用例数 >0）」与「跑红了」分开判**（批 4 #30：`--cache.dir` 是 vitest 4 的废弃参数 ⇒ exit 1 且 **0 用例**，被误读成「判据集体失效」）。**没有 `ran` 闸的变异体实验，「全绿」与「全红」都不可信。**
  4. **禁 `--reporter=basic`**（Vitest 4 已移除 ⇒ 产出「伪装的红」= 假证明）。
  5. **不许 `eval` / `new Function` / `Function(...)`**；类型噪音用 `s.charAt(i)` 或显式类型收口，**不许** `@ts-expect-error` / `any` / 关类型检查。
  6. **每条新判据自带变异体**（CONTROL 只证「跑得起来」）；**反例守卫（必须绿的反向变异）与必红的变异体分开列**。
  7. **新造的每个守卫/棘轮必须给「防真空阳性对照」**：喂一个**已知存在**的样本必须命中、喂无意义串必须不命中；**基线常量不可手工改宽** —— 用 `FROZEN == sum(entries)` 式不变式 + 锚 + 反向对照（改动冻结表而盘上不变 ⇒ 必须红）。
- **★ 提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`（本仓**多 agent 并行**，裸 `git commit` 会扫走别人已暂存的条目）。**新建文件必须两步**：`git add -- <path>` 再 `--only`。**禁止**：`git add -A` · `git add .` · `git stash` · `git checkout --` · `git restore` · `git clean` · `git reset --hard` · `--no-verify` · `git add -f`。Conventional Commits：`<type>(<scope>): <subject>`，**subject ≤50 字**、动词开头、无结尾句号（**抄命令前人工数字符数**）。
- **★ 计划级冲突的处理**：实施中发现**两条已批准要求互相排斥**时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 命令 + 代价）**，一次报控制方裁决；**不要自行取舍，也不要两条都硬做**。本批已预判四处（§待裁决清单），遇到新的照此办理。
- **★ 报告与临时文件**：报告写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`（**该目录整体 gitignored ⇒ 永不 `git add -f`**）。探针/日志/基线/解包树一律写同目录 `tmp/` 下的**子目录**，**不许放仓库根**。
- **★ 每个任务结束都要跑完八条门禁**，并在报告里给出**逐条命令 + 观测输出 + exit code**；缺一条即视为未完成。

---

## 实测基线（计划者 2026-09-12 在 `dev@091d1c3d` 实跑；下游一切目标与排序都从此派生）

> **出处**：`HEAD = 091d1c3d`（`docs(spec): close out primitives batch four`）· **工作树** `git status --porcelain` **仅 `?? docs/tech-debt/`** · `app/dist/index.html` **mtime 2026-09-12 19:54:33**（入口 `index-4qKuUwYr.js` 108,099 B）· 全部读数采集于 **2026-09-12 20:1x–20:2x**。

### 表 1 · 八门禁（逐条命令 + 读数）

| # | 命令 | exit | 读数 |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `✅ line-limits（--full · 数值一致）：>600 硬限 0（棘轮内）· 301–600 档 122 · 登记条目 122` |
| 2 | `node scripts/docs-check.mjs` | **0** | 扫描 **276** 个 Markdown（检查 **176**）· 五项全 ✅（相对链接 / `file://` 目标 / 文件名 / 索引覆盖 / 模板源与实例一致） |
| 3 | `node scripts/check-command-registry.mjs` | **0** | `✅ 命令注册一致：定义 312 / 注册 312 / 重复 0` |
| 4 | `cd app; npx tsc --noEmit` | — | **计划者未复跑**（本批不改类型面；由各任务自跑，判据 = **0 错**） |
| 5 | `cd app; npx vitest run`（json reporter，落 `tmp/planner/vitest-baseline.json`） | **0** | **166 文件 / 1608 用例 / 0 失败 / 0 skip**（`numTotalTestSuites 570 · numTotalTests 1608 · numPassedTests 1608`）⇒ **与批 4 终态逐字相同** |
| 6 | `node scripts/check-bundle-budget.mjs --no-build` | **0** | 首屏 3 chunk：`index-4qKuUwYr.js` 108,099 B → gzip 35,374 B · `vendor-react-lr0dg1MX.js` 192,536 → 60,375 · `vendor-tauri-UIF4jgRy.js` 17,143 → 4,548 ⇒ **合计原始 317,778 B · gzip 100,297 B = 100.30 kB**、**余量 99.70 kB**（预算 200 kB）· **懒 22 个 575,163 B = 575.16 kB** · CSS 3 个 62,625 B = 62.63 kB（不计入） |
| 7 | `node scripts/bundle-eager-graph.mjs` | **0** | 入口 `app\src\main.tsx` · **首屏静态可达源文件 89** · **npm 包 4**（`@tauri-apps/api` · `@tauri-apps/plugin-dialog` · `react` · `react-dom`）· ⚠️ 该工具**把 `import type` 计成静态边**（C10 #11 的口径缺陷，**本批不修**） |
| 8 | Rust（`cargo test --test app_lib_tests`） | — | **计划者未跑**（本批零 Rust 改动）⇒ 判据 = 批 3 收口的 **2300 / 0 / 6**；**任何任务若 `git log 091d1c3d..HEAD -- app/src-tauri` 非空 ⇒ STOP**（违反规格 §3 红线 6） |

### 表 2 · 本批落点实测（计划者逐文件 `ReadAllLines` 亲测 + 只读探针）

| 对象 | 文件 | 行数 | 今天的事实（要点） |
|---|---|---|---|
| 会话面板 | `components/SessionDetailPanel.tsx` | **297** | `viewMode: "raw"｜"preview"` 状态在 `:61`；**复位 effect 在 `:63-64`**（注释逐字「裁决 D1：viewMode 状态留面板」）；web 早退 `:93-105`；手写 2 按钮切换组 `:162-182`；`preview` 分支 `:200-205`；`raw` 分支 `:206-287`；**0 个 `data-testid`**、**0 处 `invoke`** |
| 会话详情头 | `session-detail/SessionDetailHeader.tsx` | **161** | `data-testid` 2 处（`session-title-input` `:101` · `session-rename-open` `:119`）；唯一 IPC `update_session_title` `:64`；**全仓 `position: "sticky"` 0 处**，`sticky` 一词唯一出现在该文件 `:12` 的注释「本组件不含 position:sticky（粘性头未实现，勿顺手加）」 ⇒ **C13 落地时必须同改这句注释**（标签不许说谎，批 3 A5/R-3 先例） |
| 屏卡 | `session-detail/SessionScreenCards.tsx` | **193** | **0 个 `data-testid`**；唯一 DOM 锚点 = `id={\`ocr-${sessionId}-${s.first_seen_ms}\`}`（`:89`）；框选态 `selectingScreen` 由 `useSessionDetailData` 跨视图持有（`:66` 注释） |
| 会话数据 hook | `hooks/useSessionDetailData.ts` | **237** | 返回 13 项（`quality`/`glossary`/`baseUrl`/`ocrBlocksByScreen`/`refining`/`refineMsg`/`deepTaskId`/`setDeepTaskId`/`startRefine`/`selectingScreen`/`setSelectingScreen`/`panelToast`/`showPanelToast`/`clearPanelToast`）；`ocrBlocksByScreen` 的双指针时间对齐在 `:132-146` |
| 会话页 | `pages/SessionsPage.tsx` | **332** | **右栏滚动容器在 `:306`**（`flex:1; minWidth:0; overflowY:auto; padding:16`）⇒ **sticky 的滚动祖先**；面板挂在 `:312-324`；`focusSessionId` effect `:144-146` |
| 会话类型 | `types/session.ts` | **313** | `SessionDetail = { session, segments, ocr_blocks, screens }`（`:69-75`）⇒ **C2「零新数据面」的数据源** |
| 笔记页 | `pages/NotesPage.tsx` | **300**（**末尾无换行**） | 三栏编排层；`MiddleView = "notes"｜"inbox"` `:56`；**既有测试面** `pages/NotesPage.test.tsx`（120 行 / **2 用例**：编辑完成即时刷新 + ESC 先 flush 再刷新）；`data-testid` **0 处** |
| 笔记右栏 | `components/notes/NotesReadingColumn.tsx` | **166** | 纯展示适配器（`@ai-context` 逐字「不含业务逻辑」）；顶层 div `:96` = `flex:1; minWidth:0; display:flex; overflow:hidden`；**已 import `Text` 原语**（`:39`，唯一使用点 `:160`）；**0 `data-testid` / 0 `invoke`** |
| 阅读视图 | `components/NoteReadingView.tsx` | **340**（已登记 301–600 档） | `editing ? editor : <NoteMarkdown …/>` 在 `:306-323`；**无 status / error prop** |
| markdown 渲染 | `components/NoteMarkdown.tsx` | **244** | `ReactMarkdown` `:155-242`；插件链硬编码 `:159-160`；`components` 表 `:161-239`（自定义渲染器**普遍 `...props` 透传** ⇒ `hProperties.className` 能落到 DOM）；**props 只有 5 个字段**（无 `components`/`remarkPlugins` 槽）；测试面 `NoteMarkdown.test.tsx`（91 行 / **6 用例**） |
| 编辑句柄 | `components/NoteEditView.tsx` · `RichEditorView.tsx` | 412 · 409 | `export interface NoteEditHandle { flushSave: () => Promise<void>; getContent: () => string }`（`NoteEditView.tsx:33-36`）；`flushLatest` 真身 `hooks/useNoteAutosave.ts:89-95`（**抛异常**、`if (!dirtyRef.current) return`）；**两者都在 `NON_MIGRATED_14`** ⇒ 本批**零改动** |
| 编辑器出口 | `hooks/useNotesPageEditing.ts` | **81** | ESC 块 `:60-74`（`catch { /* 保存失败不阻断退出 */ }`）⇒ **本批不改它的语义**（登记） |
| 深链 hook | `hooks/useNotesDeepLink.ts` | **106** | `:18-20` 注释逐字「清空责任在 App（本页无 `onFocus*Consumed` 回调）」与实现不符 ⇒ **C6 要求必改**；消费点 `:59`/`:85`/`:88`/`:97-103` |
| 原语 barrel | `ui/primitives/index.ts` | **45** | 13 个值导出 + `import "./motion.css"`；**本批加 `ViewSwitcher` 两行** |
| 类名契约守卫 | `ui/primitives/style-contract.test.ts` | **236** | ① CSS 接线守卫（每个 `primitives/*.css` 必须被同名模块 import；`CSS_FILES.length >= 10`）② `CONTRACTS` **12 行** + `toHaveLength(12)` ③ PresencePhase 三方对拍 ⇒ **本批只新增枚举块与判据，不动既有数字**（§待裁决 ③） |
| reduced-motion 守卫 | `ui/primitives/motion-coverage.test.ts` | **147** | `BASE_CLASSES` **12 条** + `toHaveLength(12)`；`:113-123` 的规则逐字排除「修饰类 `--` / BEM 子元素 `__` / `<基类>-…`」⇒ **`ed-btn-group` / `ed-btn--segment` 不触发**（本批 0 改动） |
| seams 守卫 | `ui/primitives/style-seams.test.ts` | **288** | `:190` 断言 reduced-motion 块覆盖 **12 个 `.ed-*` 基类**；`:238` 守卫① = **`primitives/*.css` 零颜色字面量**（⇒ `ViewSwitcher.css` 必须只用 `var(--ed-*)`） |
| 五类棘轮 | `textRatchet` 266 · `surfaceRatchet` 287 · `emptyStateRatchet` 296 · `loadingRatchet` **299** · `statusLineRatchet` 191（+ 各自 `*Baseline.ts`） | — | **域 = `app/src/**` 递归 − `*.test.ts(x)` − `ui/primitives/**`**（`emptyState/loading/nativeButton` 另排除 `ui/icons/**`）⇒ **`app/src/views/**` 的新文件在域内**：任何 `<button>` / `#9ca3af` / `borderRadius: N` / `border: 1px solid #e5e7eb` / `boxShadow:` / 三红 hex / 裸空态文案 / 裸加载文案命中 ⇒ **棘轮必红**（本批的自动化硬约束） |
| z-index 守卫 | `ui/zIndex.guard.test.ts` | **262** | 递归扫 `.tsx?`/`.css`，`INLINE_PATTERN = /zIndex\s*:\s*-?\d+/`、`CSS_PATTERN = /z-index\s*:\s*-?\d+/` ⇒ 新代码的层级一律走 `zIndex("raised")` |
| 层级标尺 | `ui/zIndex.ts` | — | 六档逐字：`raised 10`（**吸顶头 / 粘性列头 / 粘性工具栏**）/ `panel 100` / `popover 200` / `modal 300` / `modalNested 400` / `toast 500` |
| 原语导出面 | `ui/primitives/StatusLine.tsx` 94 · `EmptyState.tsx` 170 · `Button.tsx` 132 · `Surface.tsx` 98 · `Text.tsx` 119 · `Modal.tsx` 225 | — | `StatusLineProps` 7 字段（`kind`/`children`/`detail`/`action`/`testId`）；`EmptyStateProps` 9 字段（`title`/`description`/`icon`/`action`/`secondary`/`compact`/`align`/`testId`）；`Surface.css` 的类名族 = `.ed-surface` + `--bordered/--sunken/--canvas/--surface/--raised/--r-{stamp,control,panel,overlay,pill}/--padded/--interactive` |
| 图标注册表 | `ui/icons/index.ts` · `paths.ts` | — | `export { Icon }` + `ICON_NAMES: readonly string[]` + `export type { IconName }`（由注册表键**派生**）；`IconProps = { name: IconName; size?: 16｜20｜24; label?: string; className?: string }` |
| markdown 插件先例 | `utils/remarkMarkHighlight.ts` | — | **`data.hName` + `data.hProperties.className` 注入类名**的既有先例（`:25` 逐字注释「hName/hProperties 是 mdast-util-to-hast 应用 data 的通道」）⇒ **C8 的「结构派生器」照此形态写**（自声明最小节点形状、不引外部类型包） |
| 壳层等待态 | `shell/ShellFallback.tsx` | **56** | `export function ShellFallback()`（无 props，返回 `<Loading label="正在载入…" testId="shell-fallback" />`）+ `SlotErrorBoundary` ⇒ **`Suspense` 的 fallback 复用它** |
| 导航注册表 | `shell/navRegistry.ts` | **111** | `:14` 逐字「不描述视图（**视图在批 5**）」⇒ 视图层**不属 `shell/`** |
| 依赖面 | `app/package.json` | 41 | `dependencies` **14** / `devDependencies` **10**（含 `@testing-library/react ^16.3.2`）；**无 `jest-dom`、无 `user-event`** ⇒ 断言只用原生 DOM API、交互只用 `fireEvent` |
| 测试基建 | `app/vitest.config.ts` | 23 | `environment: "node"` · `setupFiles: ["src/test/setup.ts"]` · `include: ["src/**/*.test.ts","src/**/*.test.tsx","scripts/**/*.test.mjs"]` · `testTimeout: 15000` |

### 表 3 · 三个「今天已存在但我不能直接复用」的机制（本批必须绕开或改造）

| 机制 | 出处（逐字要点） | 为什么不能直接复用 | 本批形态 |
|---|---|---|---|
| 页级惰性 + 保活 | `App.tsx` 的 `PageSlot`：首访挂载 + `display:none` 常驻，`mountedPages` **只增不减** | 它是**保活**不是**卸载**，与 §7.3② 「非默认视图惰性挂载 + 卸载」相反 | 视图级用 `React.lazy` + `Suspense`；**默认视图**用「常驻 + `display:none`」（§7.3② 的「默认视图常驻」） |
| 列记忆执行器 | `hooks/useColumnLayout.ts`（108 行）：键前缀写死 `layout:col-width:` / `layout:col-fold:`，被 `shell/columnKeys.freeze.test.ts` 钉死为**恰 `["col-fold","col-width"]`** | 键前缀、数值语义（`min/max/autoFoldBelow`）、列语义 API 都绑死 | **新建** `views/useViewMemory.ts`（键前缀 `view:default:`，注入 `Storage`） |
| 条件渲染式惰性 | `KnowledgePage.tsx:329-332`（`{middleView === "canvas" && <KnowledgeCanvasView/>}`） | 只省**运行时内存**、不省字节（模块已在页 chunk 里）；且体系域**登记不排期**（§1 决策 21） | 视图级一律 `React.lazy`（**模块级**惰性） |

### 表 4 · 规格漂移（计划期实测，逐条在 T18 就地回写；**原文一律保留 + 加注**）

| # | 规格原文 | 实测 | 处置 |
|---|---|---|---|
| **S1** | §7.1 `ViewSpec` 字段逐字 = `{ key, label, icon, appliesTo, Component, lazy }` | `Component` 是静态字段、`lazy` 是布尔 | **C1 已裁**：改判为 `load: () => Promise<{ default: ComponentType<Props> }>` ⇒ T18 在 §7.1 就地加注（原文保留 + 写清「批 5 把它升级为可执行加载器」） |
| **S2** | §7.2 会话行逐字「现有唯一形式 = 列表行 → 详情文档」 | 实测今天**已是 2 种**（`raw` / `preview` 带可见切换器） | T18 加注（否则本批规模估算虚高）；本批是在 2 之上加 4 |
| **S3** | §8.6 签名动效 1 逐字「转写/画面/**笔记**三轨从错位滑到对齐」 | 与 C2 的会话三轨口径（转写/画面/**OCR**）不一致 | T18 就地加注「第三轨 = OCR；『笔记轨』未交付的原因与去向」+ 写进 v0.22 批 5 的「规格漂移纠正」段（**批 6 的动效纲领按加注后的口径执行**） |
| **S4** | §12「3 套 markdown 渲染器归一 \| 可并入批 4 → 已裁定不并入批 4 ⇒ 登记去向：批 5 或批 7」 | C8 裁「不并入批 5」 | T18 加注「批 5 未承接，转批 7」（与批 4 B8 同向） |
| **S5** | §6.2「本次改动」列含「笔记工具栏三层合并为单行」 | C13 裁「转批 8」 | T18 加注去向（与 §待裁决 ① 的冲突一并登记） |
| **S6** | §5.1 逐字「错误常在列表最底部（视觉盲区）」 | C11 裁「批 5 只预留槽位」 | T18 加注「位置重排归批 8」 |
| **S7** | §11-6 逐字「会话与笔记各 **≥2 种**展示形式可用，原文形态不丢」 | 会话今天 2 种、笔记 1 种 | 本批终态：会话 **5** 种（原文/三轨/印样/卡片流/笔记预览）· 笔记 **2 或 3** 种（原文/卡片流/[带证据三轨]）⇒ 两种情形都 ≥2 ✅ |

---

## 裁决回执与批 4 交接项归属（计划期两条 STOP 已裁 + 五处登记）

> 计划者在落笔中报了两条 STOP（裁决互斥 / 判据退化为空真），**控制方已回执**（同一轮会话，2026-09-12 20:5x；**该次改判由控制方以 `rulings.md` 的 C16 入册，不属本计划文件的职责**）。本节 = 回执的落笔形态，**上文 Global Constraints 与下文任务表均按此执行**。

### 1. 两条 STOP 的裁定与落笔

| # | STOP | 控制方裁定（回执要点） | 本计划的落笔 |
|---|---|---|---|
| **V1** | C10 与 C13 对交接项 **#3「笔记工具栏三层合并」**归属互斥（C10 逐字「留批 5 = **#2 #3 #11 #13 #14 #18**」vs C13 逐字「「笔记工具栏三层合并」**转批 8**」） | **按 C13**：**#3 转批 8，不进批 5**；**不设「默认不启用」的条件任务**（「只会变成日后的噪声」）；C10 汇总行的 #3 系**控制方笔误**，以 C13 为准；规格 §6.2 与 ADR-034 加注⑦ 的加注去向写**批 8** | **本计划无 T20、无条件任务**；§「批 4 交接项归属表」的 #3 标 **转批 8** 并注明笔误；T18 的加注去向 = 批 8 |
| **V2** | C3 逐字要求的「`data-testid` 集合不变」在今天**退化为空真**（`SessionScreenCards.tsx` 的 `data-testid` 实测 **0 处**） | **批准强化口径**：目标不变（抽件后行为等价必须有判据钉住），实现换成 **id 锚点集合 + 卡片计数 + 逐字文案 + 展开态行为**，带阳性对照；**不许**退成「渲染不报错」这类弱判据 | **T3** 的安全网判据按强化口径写（见 T3 的 Verification 表） |

### 2. 三处登记（控制方批准，逐条带条件）

| # | 事项 | 批准条件 | 落笔 |
|---|---|---|---|
| **R-1** | **懒 chunk `22 → 27 或 28`**（C1③ 与 §7.3② 的算术差） | ① **逐 chunk 归属台账**（哪个视图 → 哪个 chunk → 字节）；② **禁止把 28 写成 27**（实测是几写几，并写明「另一值出现的条件」）；③ 首屏判据仍要**真实构建 + Δ 与机理**，且机理里要说清「`preview` 从页 chunk 迁出会让页 chunk 变小、**总懒字节基本不变**」 | **T1** 建台账口径 · **T10** 落 `preview` 惰性 · **T18** 出终态读数 |
| **R-2** | **`ViewSwitcher` 类名复用 `ed-btn` 基座** | ① `ViewSwitcher.tsx` / `.css` **文件头写清为什么复用**（段控件本质是成组的按钮；复用可避免改 `motion-coverage.test.ts` 与 `style-seams.test.ts` 的既有计数 ⇒ 本批对既有断言的改动数保持 **0**）；② `style-contract.test.ts` **只新增**枚举块 + 自己的判据，**不动** `CONTRACTS` 的 12；③ 把它作为**诚实代价**写进计划（「段控件的类名落在按钮基座命名空间里」是语义折中）；④ **若实现中发现必须改 `Button` 的 `variant` 枚举或 `Button.css` 语义 ⇒ STOP 报控制方**，不许自行扩面 | **T5** 的文件头注释 + **T18 的诚实代价**段 |
| **R-3** | **C10 #11 的双口径**（工具 89 / TS-API 真实边 65） | 首屏与可达性判据必须**同时**给两个口径，并写明**用哪个口径下结论**；**不修工具** | **T1**（脚本搬进本批 `tmp/t1/`）· **T17**（口径入账）· **T18**（终态双口径读数） |

### 3. 事实更正（三处，逐条给读数；**都属控制方前提/侦察表的笔误，记在账上**）

| # | 更正 | 读数与复现命令 |
|---|---|---|
| **F-1** | 派发书写的「格式模板 = 批 4 计划 **1715 行**」是**它被 T18 追加 §收口回写之前的时点值**；实测 **1964 行** | `(Get-Item docs/superpowers/plans/2026-09-12-frontend-redesign-batch4-primitives.md).Length` + `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` ⇒ **1964**。⇒ **本计划引用批 4 计划一律按「节名 + 逐字引文」，不用行数** |
| **F-2** | `check-bundle-budget.mjs` **没有任何锁机制**（控制方把它当成工具能力了 —— 属批 4 台账 §四 #32「控制方前提也可能是错的」的第 3 例） | `Select-String -Path scripts/check-bundle-budget.mjs -Pattern "lock"` ⇒ **0 命中**；`Get-ChildItem -Recurse -Filter "build.lock"` ⇒ **0 命中**；脚本默认 `spawnSync("npm", ["run","build"], …)`（`:294-297`）；**它也不打印 `dist` mtime**（provenance 只有 dist 路径 + 入口 chunk 名 + 逐 chunk 字节） ⇒ 取锁 = **单元约定**（Global Constraints 已写显式协议），**mtime 由执行单元自采** |
| **F-3** | C13 点名的 `NotesListToolbar.tsx` 在盘上**不存在**；真身是 **`app/src/components/NoteListToolbar.tsx`（95 行）** | `Test-Path app/src/components/notes/NotesListToolbar.tsx` ⇒ **False**；`Test-Path app/src/components/NoteListToolbar.tsx` ⇒ **True**（`data-testid="batch-mode-toggle"` 在 `:56`）。三层真身 = `NoteListToolbar`(95) + `NoteListView.tsx:149-163` 的工具条行 + `NotesListColumn` 的三形态切换 |

### 4. 批 4 交接项归属表（20 条；**照 C10 采纳 + V1 的改判**，逐条给本批动作）

> 编号口径 = 侦察 `recon.md` §7 的 20 行（与 `decisions.md` D10 的 20 行**编号一致**，#20 两侧指向不同项但**都转批 8**，故结论不受影响）。

| # | 交接项（要点） | 归属 | 本批动作（任务 / 判据 / 登记） |
|---|---|---|---|
| 1 | **错误行的「位置」问题**（规格 §5.1 逐字「错误常在列表最底部（视觉盲区）」） | **留批 5（只做「预留」）** | **T10/T14** 在正文列头部 `ViewSwitcher` **下方**预留固定错误区槽位（C11）；**不重排**既有 `StatusLine` 调用点；**T18** 加注规格 §5.1 |
| 2 | **「会话详情头改粘性」**（ADR-034 加注⑦） | **留批 5** | **T11**（含 1 条行为判据）；**T18** 收口读数 |
| 3 | **「笔记工具栏三层合并为单行」** | **转批 8**（**C13 为准；C10 汇总行的 #3 系控制方笔误**） | **本批零动作**；**T18** 在规格 §6.2 与 ADR-034 加注⑦ 写明去向 = 批 8 + 登记 F-3 的文件名更正 |
| 4 | 3 套 markdown 渲染器归一 | **转批 7**（C8） | **T12** 防「3 套变 4 套」（react-markdown 运行时站点数不增）；**T18** 加注 |
| 5 | `Text` 的 558 处字号越界 | **转批 6**（C10） | **本批零动作**（`textBaseline.ts` 299/300 ⇒ 禁碰） |
| 6 | token 真源补 `pill` 档四处 | **转批 6**（C10） | **本批零动作** |
| 7 | `Surface` DOM 属性透传（+3）/ 透明容器多一层底（+28） | **转批 7**（C12） | **本批零动作**；§收口回写登记 |
| 8 | `pinnable` 的消费方 | **转批 6**（C10） | **本批零动作** |
| 9 | `SURFACE_CLASSES` 自计数守卫升级 | **转批 7**（C10） | **本批零动作**（`ui/primitives/**` 只读） |
| 10 | `MIN_CALLS` 与 T15 探针表逐格对拍 | **转批 7**（C10） | **本批零动作** |
| 11 | `bundle-eager-graph.mjs` 把 `import type` 计成静态边 | **留批 5（只作为判据口径，不修工具）** | **R-3**：**T1** 搬 `eager-graph-tsapi.mjs` 进 `tmp/t1/`；**T15** 的图级判据给双口径；**T18** 终态双口径 |
| 12 | `Toast` 的 `belowNav` 堆叠失效 | **转批 6**（C4 选用 `StatusLine` 而非 toast ⇒ 确定转批 6） | **本批不用 toast 做阻断提示**（T14 的提示 = 就近 `StatusLine`） |
| 13 | `--ed-nav-h` 兜底 56px 无绑定判据 | **留批 5** | **T17**：扩域到 `ui/primitives/Toast.css` + **新增「兜底值 == token 真源」判据**（不只扫裸 56） |
| 14 | `Modal` 滚动位置不恢复 | **留批 5** | **T17**：抽一个纯函数 `saveScroll/restoreScroll` + `Modal` 解锁时恢复；**真实性只能登记**（C15） |
| 15 | 五类棘轮余量 | **转批 7**（C10）；**但本批必须当硬约束** | 每个新 UI 文件的 Verification 各跑五条棘轮（**不得加计数**，附 B.4） |
| 16 | `b1-non-migrated` 9 处 + `NON_MIGRATED_14` | **留批 5（只裁不动）** | **C7**：本批不碰这 14 个文件的排版；**T15** 立「`views/**` 零原语深导入 / 零 `@tauri-apps`」的图级判据；**T18** 登记「批 5/7 若要迁须先裁守卫范围」 |
| 17 | 11 锚定菜单的退出语义（含捕获相 ESC） | **转批 8**（C10） | **本批零动作**（B1/B2 守卫不放开 ⇒ 无事可做） |
| 18 | 20 弹层中 15 个无测试覆盖 | **留批 5（作为测试面输入，不作为任务）** | 每个新组件 **≥2 条能红的行为级判据**（C15）；**T2/T3/T11** 对三个无测试面的被拆/被改文件**先补安全网** |
| 19 | `docs/tech-debt/review-2026-09-11.md`（191 KB，未入库） | **不属批 5**（待用户裁决） | **本批零动作**；`git status` 必须始终只有它一个 `??` |
| 20 | （两条读法都指向同一去向）11 锚定菜单退出语义 / W27 提交树不自洽窗口 | **转批 8**（C10） | **本批遵守 W27 纪律**：多单元并行时「等提交、不要只等工作树文件」+ `--write` 紧挨提交且只提交自己那几行 |

---

## 任务总表与派发顺序

> **依赖列 = 必须「已提交」而不是「工作树已改」**（批 3 的 DISPATCH-TEMPLATE §三）。**并行列 = 同一时刻可否有第二个实施者动它**。

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） |
|---|---|---|---|---|
| **T0** | 批 5 基线冻结 + CONTROL 冻结树 + 贴边/守卫读数（**零生产代码**） | — | ✅ 与 T1 | 0（产出 `tmp/t0/**`） |
| **T1** | **探针**：C2 笔记↔证据数据可行性（只读 IPC）+ C8 的 `react-markdown` 站点 + C10#11 双口径脚本 + 懒 chunk 台账（**零生产代码**） | — | ✅ 与 T0 | 0（产出 `tmp/t1/**`） |
| **T2** | **拆件 A**：`SessionDetailPanel` 安全网判据（提交 1）→ 抽出 `SessionRawView` + `SessionViewHost` + `SessionAuxBlocks`（提交 2，主文件 ≤150） | T0 | ✅ 与 T3/T4（文件集不相交） | **`components/SessionDetailPanel.tsx`** · 新建 3 件 · 新测试 |
| **T3** | **拆件 B**：`SessionScreenCards` 安全网判据（提交 1）→ 抽 `SessionScreenCard` 单卡（提交 2） | T0 | ✅ 与 T2/T4 | **`session-detail/SessionScreenCards.tsx`** · 新建 `SessionScreenCard.tsx` · 新测试 |
| **T4** | **拆件 C**：`NotesPage.tsx`（300）拆到 **≤285** | T0 | ✅ 与 T2/T3 | **`pages/NotesPage.tsx`** · `components/notes/NotesReadingColumn.tsx`（接收挪出的行）· `NotesPage.test.tsx`（只增不减） |
| **T5** | **地基 A**：`ViewSwitcher` 原语（`tsx` + `css` + barrel + `style-contract.test.ts` 新枚举/新判据 + 测试） | T0 | ✅ 与 T6/T7–T9/T12 | **`ui/primitives/index.ts`** · **`ui/primitives/style-contract.test.ts`** · 新建 2 件 + 新测试 |
| **T6** | **地基 B**：`views/registry.ts`（`ViewSpec` + `load` + `viewsFor`）+ `views/useViewMemory.ts` | T0 | ✅ 与 T5/T7–T9/T12 | 新建 2 件 + 2 个新测试 |
| **T7** | 会话视图 A：`SessionTriTrackView`（三轨对齐；C2） | T6 | ✅ 与 T8/T9/T12 | 新建 1 件 + 新测试 |
| **T8** | 会话视图 B：`SessionProofView`（印样） | T6 | ✅ 与 T7/T9/T12 | 新建 1 件 + 新测试 |
| **T9** | 会话视图 C：`SessionCardFlowView`（卡片流；复用单卡） | T3 · T6 | ✅ 与 T7/T8/T12 | 新建 1 件 + 新测试 |
| **T10** | **会话接线**：`SessionViewHost` 接入面板 + 视图记忆 + **默认视图常驻** + 惰性挂载 + web 早退保持 + **C11 槽位** + **C5 的 `:64` 改判** | T2 · T5 · T6 · T7 · T8 · T9 | ❌ 串行（独占 `SessionDetailPanel.tsx` / `SessionsPage.tsx`） | **`components/SessionDetailPanel.tsx`** · **`pages/SessionsPage.tsx`** · `session-detail/SessionViewHost.tsx` · 新测试 |
| **T11** | 杂项 A：`SessionDetailHeader` 行为判据 + **粘性头**（C13） | T2 | ✅ 与 T10/T12（文件不相交） | **`session-detail/SessionDetailHeader.tsx`** · 新测试 |
| **T12** | **笔记视图 A**：`NoteMarkdown` **只追加**槽 + `noteCardModel`（结构派生器）+ `NoteCardFlowView`（C8） | T6 | ✅ 与 T7–T11 | **`components/NoteMarkdown.tsx`** · 新建 2 件 + 新测试 |
| **T13** | **笔记视图 B**：`NoteEvidenceTrackView`（**条件项**，V5 裁决驱动） | T1 · T6 · T12 | ✅ | 新建 1 件 + 新测试（或**零代码登记提交**） |
| **T14** | **笔记接线**：`NotesReadingColumn` 变视图宿主 + **`flushSave` 阻断 + 就近 `StatusLine`**（C4/C7）+ C11 槽位 | T4 · T5 · T6 · T12 · T13 | ❌ 串行（独占 `NotesReadingColumn.tsx`） | **`components/notes/NotesReadingColumn.tsx`** · 新测试 |
| **T15** | **三条硬约束 + 依赖方向的架构守卫**（图级判据；C14②/C1①） | T5 · T6 · T10 · T14 | ❌ 最后（判据覆盖两侧宿主） | 新建 `views/architecture.guard.test.ts` |
| **T16** | `focus*` 最小收敛（C6）+ `useNotesDeepLink` 注释更正 + `App.tsx` ≤600 | T4 · T14 | ✅ 与 T17 | **`App.tsx`** · **`hooks/useNotesDeepLink.ts`** · `NotesPage.tsx`（拆后接线）· `SessionsPage.tsx` · `KnowledgePage.tsx` · 新测试 |
| **T17** | 杂项 B：`--ed-nav-h` 兜底绑定判据（C10#13）+ `Modal` 滚动恢复（C10#14）+ C10#11 口径入账 | T0 | ✅ 与 T16 | **`shell/navHeight.consumption.test.ts`** · `ui/primitives/Modal.tsx`（+ `Modal.css`）· 新测试 |
| **T18** | **验收测量 + 收口**（三条硬约束读数 + 八门禁 + 规格回写 + 台账 + follow-ups） | 全部 | ❌ 最后 | 规格 · `docs/versions/v0.22.md` · 本计划文件 · `ADR-033` · `ADR-034` · `docs/adr/README.md`（如需） |

> **🔴 热点文件的单写者约束**
> | 文件 | 唯一写者 | 窗口 |
> |---|---|---|
> | **`components/SessionDetailPanel.tsx`** | **T2**（拆件）→ **T10**（接线） | 两者**必须串行**；T11 不许碰它 |
> | **`pages/NotesPage.tsx`**（300/300） | **T4**（拆件）→ **T16**（`focus*` 接线） | 两者**必须串行**；T14 不许碰它 |
> | **`pages/SessionsPage.tsx`** | **T10**（视图规格注入）· **T16**（`onFocusSessionConsumed`） | 串行；T10 先提交 |
> | **`App.tsx`**（584/600） | **T16** | 其余任务**零改动**；超 600 ⇒ 先拆（不许登记） |
> | **`ui/primitives/index.ts`** | **T5** | 唯一一处加 `ViewSwitcher` 导出 |
> | **`ui/primitives/style-contract.test.ts`** | **T5** | 只许**新增**枚举块/判据，**不许改** `CONTRACTS` 的 12 |
> | **五类棘轮 + 各自 `*Baseline.ts` + `motion-coverage` / `style-seams` / `zIndex.guard` / `dialogMigration.e`（300/300）** | **无人**（全批只读） | 任何任务若发现「必须改它们才能绿」⇒ **STOP**（见 §Global Constraints 的计划级冲突处理） |
> | **`components/NoteMarkdown.tsx`** | **T12** | 只加一个**只追加**槽 + 一个类型导出 |
> | **`components/notes/NotesReadingColumn.tsx`** | **T14** | T4 只许「把 NotesPage 的行挪进来」，不许改它的插槽语义 |
> | **`session-detail/SessionScreenCards.tsx`** | **T3** | T9 只**消费**抽出的单卡，不许改容器 |
> | **`session-detail/SessionDetailHeader.tsx`** | **T11** | T2 只搬不作（拆件时它已在独立文件里） |
> | **`ui/primitives/Modal.tsx`** | **T17** | 其余任务零改动 |
>
> **可安全并行**：T0 ∥ T1 · T2 ∥ T3 ∥ T4 · T5 ∥ T6 · {T7,T8,T9,T11,T12} 互不相交 · T16 ∥ T17。
> **必须串行**：T0/T1 → T2/T3/T4 → T5/T6 → {T7,T8,T9} → T10 → T15 → T18；T4 → T12 → T13 → T14 → T15。
> **T18 最后**；**T15 必须在 T10 与 T14 之后**（它的图级判据要覆盖两侧宿主）。

### 每个改造任务的统一作业模式（Task 2–17 共用，逐条照做）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与八条门禁，把读数写进报告的「开工读数组」；**先看 `git status --porcelain`，不是自己的路径一律不碰**（批 3 两起并行事故的教训）。
2. **文件占用检查**：本轮是**多单元共用一棵工作树**；开工前把自己要改的路径与 `tmp/` 里的在飞声明比对，冲突 ⇒ 只读轮询 90s × ≤5，窗口不关 ⇒ 报控制方。
3. **一次只切一处**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
4. **验收判据是「既有测试逐条原样通过」+「新增用例只增不减」**；**本批对既有断言的授权改动数 = 0**（V3 的类名空间方案使附 B.6 逐字成立）⇒ **任何既有断言改动 ⇒ STOP 并报控制方**。
5. **每条新判据自带变异体**（在导出副本里做，带 CONTROL，禁 `--reporter=basic`，harness 带 `ran` 闸）；**变异体必须证明「这条判据自己能红」**，不许用一个 CONTROL 代表全部。
6. **报告必含**：① 逐条命令 + 观测输出 + exit code 的八门禁；② **B9 的显式声明**——逐字写出「**本批交付的是结构与内容；手感（三档强度/双基调/GSAP）在批 6**」；③ **诚实单列「你没能验证的地方」**（逐条写清是「仪器不可达」还是「本批未做」）；④ 首屏读数必须带 **dist 的 mtime + 对应提交**；⑤ **五类棘轮的「未加计数」读数**（各跑一次）。
7. **提交**：`git diff --stat` 复核只含自己的文件 → 新建文件先 `git add -- <path>` → `git commit --only -m "<msg>" -- <显式路径…>`（subject 人工数到 ≤50）。
8. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 复现命令 + 代价）**，一次报控制方裁决。

---

### Task 0: 批 5 基线冻结 + CONTROL 冻结树 + 本批全部读数（**只产读数，不写生产代码**）

> **为什么第一个做**：① 本批每个任务的「前后对比」都要用**同一把尺子**（八门禁 + 逐文件用例数 + 首屏 provenance）；② 变异体实验的 **CONTROL 必须在冻结提交树上取**（批 4 #28 家族：脏树上 `dialogMigration.e.test.ts` 曾假红 1 条）⇒ 先把 `091d1c3d` 的导出树建好并跑绿一次；③ T15 的架构守卫要把「今天的 89 / 65」当锚。**本任务不改任何仓库文件。**

**Files:**
- 产出（**全部 gitignored，不入库**）：`.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/tmp/t0/{baseline.md,vitest-perfile.txt,raw/,control/,compare-perfile.mjs,variant-harness.mjs}`
- **不修改任何仓库文件**

**Interfaces:**
- Consumes：`scripts/{line-limits,docs-check,check-command-registry,check-bundle-budget,bundle-eager-graph}.mjs` · `app/src/**`（只读）
- Produces：① 基线读数表（表 1 的**自跑**版本）② `vitest-perfile.txt`（**166 行**：`相对 app/ 的路径 + 用例数`）③ `compare-perfile.mjs`（逐文件对拍脚本，**要求 LOST=0 / SHRUNK=0，并把 `app/scripts/*.test.mjs` 的路径规范化写进注释**）④ `variant-harness.mjs`（变异体 harness 骨架：**`ran` 闸** = 解析 `Tests\s+(\d+) failed \| (\d+) passed` 拿到用例数；`ran === false` ⇒ 输出 `⚠️ 仪器异常`，**不判红也不判绿**）⑤ CONTROL 导出树（跑绿一次）

- [ ] **Step 0: 开工自证（写进 `tmp/t0/baseline.md` 首段）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
git log --oneline -3            # 期望：091d1c3d / 199da54b / 18d56cbc
git status --porcelain          # 期望：仅一行 "?? docs/tech-debt/"
git rev-parse HEAD              # 期望：091d1c3d89415a9ed2e7f1f637cf627e206ec625
git branch --show-current       # 期望：dev
```

- [ ] **Step 1: 八门禁读数（逐条命令 + 原始输出落 `tmp/t0/raw/`）**

```powershell
node scripts/line-limits.mjs --full          *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t0\raw\line-limits.txt"
node scripts/docs-check.mjs                  *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t0\raw\docs-check.txt"
node scripts/check-command-registry.mjs      *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t0\raw\registry.txt"
node scripts/bundle-eager-graph.mjs          *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t0\raw\eager.txt"
node scripts/check-bundle-budget.mjs --no-build *> ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t0\raw\budget.txt"
(Get-Item app/dist/index.html).LastWriteTime  # provenance：dist mtime（脚本不打印它）
cd app; npx tsc --noEmit; cd ..
```
> ⚠️ **`*>` 是 PS 5.1 的正确重定向写法**（`>` 写 UTF-16LE 会让 Node `JSON.parse` 失败）；退出码用 `$LASTEXITCODE` 采集，**不要用 `cmd /c "… & echo EXIT=%ERRORLEVEL%"`**（`%ERRORLEVEL%` 在解析期展开 ⇒ 报上一条命令的码，批 4 实测两处假 0）。

- [ ] **Step 2: 全量 vitest 基线 + 逐文件对拍脚本**

```powershell
cd app
npx vitest run --reporter=json --outputFile="../.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/tmp/t0/raw/vitest-full.json"
```
用 `tmp/t0/compare-perfile.mjs` 把 json 转成 `tmp/t0/vitest-perfile.txt`（**相对 `app/` 的路径 + 用例数**，按路径排序）。**判据**：`numTotalTestSuites 570 · numTotalTests 1608 · numPassedTests 1608 · numFailedTests 0 · numPendingTests 0`，**文件数 166**。

- [ ] **Step 3: CONTROL 冻结树（变异体实验的唯一 CONTROL 来源）**

```powershell
$tmp = ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t0"
New-Item -ItemType Directory -Force "$tmp\control" | Out-Null
git -c core.autocrlf=false archive -o "$tmp\control.tar" 091d1c3d
tar -xf "$tmp\control.tar" -C "$tmp\control"
# junction 借 node_modules（删树前先摘点：Remove-Item <junction> 而不是递归删）
cmd /c mklink /J "$tmp\control\app\node_modules" "$(Resolve-Path app\node_modules)"
cd "$tmp\control\app"; npx vitest run 2>&1 | Select-Object -Last 12; cd "D:\Program own\aicode\work space\Entropydecrease"
```
**判据**：CONTROL 树 **166 文件 / 1608 用例 / 0 失败**（与仓内基线逐字相同）。**不绿就先修树**（`core.autocrlf=false` 是必需的，批 4 实测 CRLF 让 2 个测试文件解析失败、全量读成假读数）。

- [ ] **Step 4: 贴边表复核（本计划的 §Global Constraints 贴边表逐格重测）**

```powershell
foreach ($f in @(
  'app/src/pages/NotesPage.tsx','app/src/ui/primitives/dialogMigration.e.test.ts',
  'app/src/ui/primitives/textBaseline.ts','app/src/ui/primitives/loadingRatchet.test.ts',
  'app/src/components/SessionDetailPanel.tsx','app/src/pages/ChatPage.tsx',
  'app/src/components/session-detail/SessionScreenCards.tsx','app/src/components/session-detail/SessionDetailHeader.tsx',
  'app/src/components/notes/NotesReadingColumn.tsx','app/src/components/NoteMarkdown.tsx',
  'app/src/App.tsx','app/src/ui/primitives/style-contract.test.ts','app/src/ui/zIndex.guard.test.ts'
)) { "{0,4}  {1}" -f [System.IO.File]::ReadAllLines((Join-Path (Get-Location) $f),[Text.Encoding]::UTF8).Count, $f }
```
**判据**：与本计划表 2 的读数**逐格相同**；不同 ⇒ 以本次读数为准并登记（**不许**用 `Get-Content`）。

- [ ] **Step 5: 守卫域复核（五类棘轮 + 7 个递归域守卫，全绿是「不加计数」判据的前提）**

```powershell
cd app
npx vitest run src/ui/primitives/motion-coverage.test.ts src/ui/primitives/style-seams.test.ts src/ui/primitives/style-contract.test.ts src/ui/primitives/nativeButton.ratchet.test.ts src/ui/primitives/loadingRatchet.test.ts src/ui/primitives/statusLineRatchet.test.ts src/ui/primitives/emptyStateRatchet.test.ts src/ui/primitives/textRatchet.test.ts src/ui/primitives/surfaceRatchet.test.ts src/ui/zIndex.guard.test.ts
```
**判据**：**10 文件 / 96+7 用例全绿**（计划者实测：前 9 个 = 9 文件 / 96 用例；`zIndex.guard` = 7 用例）。

- [ ] **Step 6: 变异体 harness 骨架（`ran` 闸 + 新树 + CONTROL）**

写 `tmp/t0/variant-harness.mjs`（**不入库**）：① `git -c core.autocrlf=false archive` 出新树；② junction `node_modules`；③ 施加变异（**由调用方给一个 patch 函数**）；④ 跑**指定测试文件**；⑤ **解析 `Tests\s+(\d+) failed \| (\d+) passed` ⇒ `ran = (failed + passed) > 0`**；⑥ 输出 `{variant, ran, failed, passed, red}`；`ran===false` ⇒ `⚠️ 仪器异常`。**禁 `--reporter=basic`**。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | Step 0 四条 | 与期望逐字相同（HEAD `091d1c3d`；`git status` 仅 `?? docs/tech-debt/`） |
| V2 | Step 1 六条 | `line-limits --full` **exit 0 · 0/122/122** · `docs-check` **exit 0（276/176，五项 ✅）** · registry **exit 0 · 312/312/0** · `tsc --noEmit` **exit 0 · 0 错** · eager **exit 0 · 89/4** · budget `--no-build` **exit 0 · 100.30 kB / 余量 99.70 / 懒 22 个** |
| V3 | Step 2 | **166 文件 / 1608 用例 / 0 失败**；`vitest-perfile.txt` 行数 = **166** |
| V4 | Step 3 | CONTROL 树 **166/1608/0**；`tmp/t0/control` 存在且可复跑 |
| V5 | Step 4 | 13 个贴边读数与本计划表 2 逐格一致（不一致者逐条登记） |
| V6 | Step 5 | **10 文件全绿**；把每个文件的用例数逐条抄进 `baseline.md`（后续任务对照用） |
| V7 | Step 6 | `variant-harness.mjs` 在 CONTROL 树上跑一次「无变异」⇒ `ran=true · red=false`；再跑一次**故意让测试文件路径不存在**的变异 ⇒ `ran=false · ⚠️ 仪器异常`（**证明 `ran` 闸本身有牙**） |
| V8 | `git status --porcelain` | **与 Step 0 逐字相同**（本任务零写盘） |

**依赖**：无。**可并行**：与 T1。

---

### Task 1: 探针（C2 笔记↔证据数据可行性 + C8 的 markdown 站点 + C10#11 双口径 + 懒 chunk 台账）（**只产读数**）

> **为什么第二个做**：① **C2 逐字**要求「先做一个**只读数据可行性探针**（Rust 侧 IPC 与数据模型：是否存在**逐段级**「笔记 ↔ 证据」关联的读取路径）；存在 ⇒ 交付 3 视图；不存在 ⇒ 交付 2 视图 + 加注规格 §7.2 与 §11-6 + 登记批 7」——**它决定 T13 是否交付**；② C8 的判据是「全站 `react-markdown` import 数不增加」⇒ 先把**今天的 2 处**钉成读数；③ C10 #11 要求首屏判据**同时**给两个口径 ⇒ 把批 4 的 TS-API 探针搬进本批；④ R-1 要求逐 chunk 归属台账。**本任务不改任何仓库文件、不碰 `app/src-tauri/**`（只读 grep）。**

**Files:**
- 产出（**gitignored**）：`tmp/t1/{c2-evidence-probe.md,c8-markdown-sites.md,eager-dual-caliber.md,lazy-chunks.md,eager-graph-tsapi.mjs,membership.mjs}`
- **不修改任何仓库文件**（`eager-graph-tsapi.mjs` 从批 4 的 gitignored 目录**复制**：源 `.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/t1/eager-graph-tsapi.mjs`（99 行），**不许改源文件**）

**Interfaces:**
- Consumes：`app/src-tauri/src/app_commands.rs`（只读）· `app/src-tauri/src/**`（只读 grep）· `app/src/types/{session,notes}.ts` · `app/dist/assets/*.js`（只读）· `scripts/bundle-eager-graph.mjs`
- Produces：① **C2 结论**（「存在/不存在逐段级证据读取路径 + 命令名 + 表名」的可复现读数）② `react-markdown` 运行时站点清单（期望 **2**）③ 双口径读数（工具 **89** / TS-API **65**）④ 懒 chunk 台账（**22 个**，逐 chunk 名 + 字节）与「独有字面量」归属方法

- [ ] **Step 0: C2 探针（只读 IPC；三条独立证据，缺一条不算结论）**

```powershell
# ① 命令清单里与「笔记 ↔ 证据/会话/段」有关的读取路径
Select-String -Path app/src-tauri/src/app_commands.rs -Pattern "evidence|segment|note" -Encoding utf8 |
  ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" } | Select-Object -First 80
# ② 数据模型侧：是否存在逐段级关联表/字段
Select-String -Path app/src-tauri/src/*.rs,app/src-tauri/src/**/*.rs -Pattern "note_evidence|evidence_segment|note_segment|CREATE TABLE" -Encoding utf8
# ③ 前端侧：今天有没有任何 invoke 读取「笔记 ↔ 证据」
Select-String -Path app/src/**/*.ts,app/src/**/*.tsx -Pattern "evidence" -Encoding utf8
```
**判据（写进 `c2-evidence-probe.md`）**：给出**逐段级**关联的**是/否**，并附：① 命中的命令名（若有）② 命中的表名/字段（若有）③ **仪器自证**：同一支 grep 在**已知存在**的串（如 `note_id`）上必须命中、在**无意义串**（如 `zzz_no_such_symbol_zzz`）上必须 0 命中。**若结论为「不存在」⇒ T13 转为零代码的登记提交**（见 T13）。

- [ ] **Step 1: C8 的 `react-markdown` 站点基线（运行时口径）**

```powershell
cd app
Select-String -Path src/**/*.ts,src/**/*.tsx -Pattern 'from "react-markdown"' -Encoding utf8 | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
```
**判据**：**恰 2 处**（`components/NoteMarkdown.tsx:18` · `components/ChatMessageMarkdown.tsx:8`），且**都是运行时 import**（非 `import type`）。`remark-*` / `rehype-*` 的站点同样只应出现在这两个文件里（逐条列出）。**这条是 T12 判据的锚**。

- [ ] **Step 2: C10#11 的双口径（把批 4 的探针搬进本批）**

```powershell
$t1 = ".superpowers\sdd\2026-09-12-frontend-redesign-batch5-view-layer\tmp\t1"
Copy-Item ".superpowers\sdd\2026-09-12-frontend-redesign-batch4-primitives\tmp\t1\eager-graph-tsapi.mjs" "$t1\eager-graph-tsapi.mjs"
node scripts/bundle-eager-graph.mjs
node "$t1\eager-graph-tsapi.mjs"
node "$t1\eager-graph-tsapi.mjs" --keep-type-only     # 对照：含 import type 的口径
```
**判据**：工具口径 **89 文件 / 4 包**；TS-API 剔类型边口径 **65 源文件 / 4 包**；`--keep-type-only` 口径 **63**（批 4 的读数，若不同则逐条给机理）。**结论口径写死**：本批一切「首屏静态可达」结论**用 TS-API 剔 `import type` 的真实边口径**，工具口径并列报告（C10 #11 逐字）。

- [ ] **Step 3: 懒 chunk 台账 + 归属方法（R-1 的锚）**

```powershell
Get-ChildItem app/dist/assets/*.js | Sort-Object Length -Descending |
  ForEach-Object { "{0,9}  {1}" -f $_.Length, $_.Name }
```
写 `tmp/t1/lazy-chunks.md`：**22 个懒 chunk** 的「名 + 字节」全表（首屏 3 个单列），并写清**归属方法**：每个新视图组件里放一个**独有字面量**（如 `data-testid="session-tritrack-view"` 的字符串），构建后在 `dist/assets/*.js` 里 grep 该字面量 ⇒ 记录它**只**命中哪个 chunk（**这是 T18 逐 chunk 归属台账的机器形态**）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | Step 0 的三条 grep + 双侧自证 | 结论明确（存在/不存在）；**仪器双侧自证**各一行读数；**若「不存在」⇒ 在报告里点名 T13 转为登记提交** |
| V2 | Step 1 | `react-markdown` 运行时站点 = **2**（逐条给 `文件:行`）；`remark`/`rehype` 站点清单完整 |
| V3 | Step 2 | 工具 **89/4** · TS-API **65/4** · `--keep-type-only` **63**；**写明本批结论用哪个口径** |
| V4 | Step 3 | 懒 chunk 表 **22 行** + 首屏 3 行；归属方法（独有字面量 → chunk）写清并**在今天的产物上先自证一次**（拿一个已知字面量，如 `shell-fallback`，验证方法可行） |
| V5 | `git status --porcelain` | 与开工时逐字相同（**零写盘**；`app/src-tauri/**` 零改动） |

**依赖**：T0（同批基线）。**可并行**：与 T0。

---

### Task 2: 拆件 A —— `SessionDetailPanel`（安全网判据 + 抽出原文视图 / 视图切换组 / 辅助块；**两个原子提交**）

> **为什么第三个做**：C9 逐字「`SessionDetailPanel.tsx`（**297/300**）**先拆**（抽出原文视图 + 视图切换器组），主文件降到 **≤150**」+ 硬要求②「对**无测试面**的被拆文件（`SessionDetailPanel` / `SessionScreenCards`）**先补行为级判据再拆**」。**实测该文件无同名测试、全仓无任何测试 import 它**（`Select-String` 全测试目录 0 命中）⇒ 安全网是**必须**的第一步。

**Files:**
- Create（提交 1）：`app/src/components/SessionDetailPanel.test.tsx`（**≤200 行**；`// @vitest-environment jsdom` 首行）
- Create（提交 2）：`app/src/components/session-detail/SessionRawView.tsx`（**预算 200**，会话「原文」视图：转写时间轴 + 屏卡 + 术语表 + 图集）· `app/src/components/session-detail/SessionViewHost.tsx`（**预算 150**，**本任务里只做「行为等价搬移」**：把现有手写 2 按钮切换组 + `preview`/`raw` 分支搬进来，**不引入注册表**）· `app/src/components/session-detail/SessionAuxBlocks.tsx`（**预算 120**，导出 `SessionQualityCard`（可信度总览）+ `SessionAuxPanels`（`showPass2`/`showProofread` 两个裁决面板与其 state/effect））
- Modify（提交 2）：`app/src/components/SessionDetailPanel.tsx`（**297 → ≤150**）

**Interfaces:**
- Consumes：`types/session.ts` 的 `SessionDetail`/`SessionScreen`/`SessionOcrBlock`/`QualityReport`/`GlossaryTerm` · `hooks/useSessionDetailData.ts` 的 13 项返回 · `utils/fmt.ts` 的 `fmtMs` · `ui/primitives` 的 `Text` · `components/ImageGallery` · `components/NotePreviewView` · `components/SpeakerSwitchCard`
- Produces：
  - `SessionRawView`：`interface Props { detail: SessionDetail; baseUrl: string; ocrBlocksByScreen: ReadonlyMap<number, SessionOcrBlock[]>; selectingScreen: number | null; onSelectScreen: (firstSeenMs: number | null) => void; panelToast: { screenKey: number; msg: string } | null; onShowToast: (screenKey: number, msg: string) => void; onClearToast: () => void; }` —— **数据全注入、零 `invoke`、零 `@tauri-apps`**（`convertFileSrc` 不进来：屏卡的图片 URL 由 T9 起改为容器注入的 `imageUrl()`；**本任务先保持 `SessionScreenCards` 原样**，它的 `convertFileSrc` 留给 T3/T10）
  - `SessionViewHost`（**过渡形态**）：`interface Props { viewMode: "raw" | "preview"; onViewModeChange: (m: "raw" | "preview") => void; autoRefineTaskId: number | null; onRefineTaskStarted?: (sessionId: number, taskId: number) => void; children: ReactNode; }` —— `children` = 原文视图节点（由面板传入），`preview` 分支仍在**本文件**内（T10 再改注册表驱动）
  - `SessionAuxBlocks`：`SessionQualityCard({ quality })` + `SessionAuxPanels({ sessionId, showPass2, showProofread, onClosePass2, onCloseProofread })`
- **DOM 顺序契约（逐字不变）**：`SessionDetailHeader` → `SessionQualityCard` → `SpeakerSwitchCard` → **切换器行（含 `SessionRefineSection`）** → `refineMsg` 行 → 视图区 → 两个裁决面板。**任何一层包装元素的增减都要在报告里点名**（`NotesReadingColumn` 的 `@ai-context` 有同类先例：「顶层必须是原来那个 div……多包一层会改变三栏宽度分配」）。

- [ ] **Step 1（提交 1）: 先立安全网判据 —— `SessionDetailPanel.test.tsx`（4 条，各带变异体）**

用**手工 fixture**（`SessionDetail` 对象字面量）渲染面板，**mock `hooks/useSessionDetailData` 的最小表面**（或直接用真 hook + mock `@tauri-apps/api/core` 的 `invoke`，取**前者**：与本仓既有测试风格一致、更快）：

| # | 判据 | 变异体（必须红） |
|---|---|---|
| P1 | **默认视图是原文**：不点任何按钮，`detail.segments` 的每段都在 DOM 里（用段锚点 `#seg-{sessionId}-{segId}` 计数 = `segments.length`） | 把默认视图改成 `preview` ⇒ 红 |
| P2 | **切换器存在且会切**：点「笔记预览」⇒ `NotePreviewView` 被渲染（mock 成 `<div data-testid="note-preview-view"/>`），且原文区**不再可见**（本任务仍是互斥渲染；**T10 会改成常驻**） | 把 `setViewMode("preview")` 删掉 ⇒ 红 |
| P3 | **web 会话早退**：`detail.session.kind === "web"` ⇒ 渲染 `WebArticleView`（mock 成 `data-testid="web-article-view"`）且**切换器 0 个** | 删早退分支 ⇒ 红 |
| P4 | **深链**：`autoRefineTaskId` 非空 ⇒ 切到 `preview` 且调用 `onAutoTaskConsumed` **恰 1 次** | 删 `onAutoTaskConsumed?.()` ⇒ 红 |

提交：`test(sessions): pin session detail panel before split`（**43 字符**）

- [ ] **Step 2（提交 2）: 抽件（行为等价；**逐块搬移，不改一行逻辑**）**

抽件顺序（**逐次实测行数**，写进报告）：
- **E1**：`:206-287` 的 `raw` 分支（转写时间轴 / `SessionScreenCards` / 术语表 / `ImageGallery`）→ `SessionRawView.tsx`；`btn`（`:31`）、`SOURCE_LABEL`（`:33-37`）**随它搬走**
- **E2**：`:162-193` 的切换器行（`as const` 数组 + `.map` 按钮 + `<SessionRefineSection>`）→ `SessionViewHost.tsx` 的**过渡形态**
- **E3**：`:120-155` 可信度总览 → `SessionAuxBlocks.tsx` 的 `SessionQualityCard`
- **E4**：`:73-77` 的 `showPass2`/`showProofread`（state + effect）与 `:289-294` 的两面板 → `SessionAuxBlocks.tsx` 的 `SessionAuxPanels`
- **兜底（若四次抽完主文件仍 >150，**不许登记、不许抬预算**）**：继续抽 ① `refineMsg` 行（`:194-198`）并入 `SessionAuxPanels`；② `SpeakerSwitchCard` 行（`:159` + import）并入 `SessionAuxBlocks`；③ `<SessionDetailHeader …/>` 的 6 个 props 收进一个 `headerProps` 对象（`:110-117`）。**每次抽完立刻跑 Step 3 的行数检查。**

提交：`refactor(sessions): split raw view out of detail panel`（**48 字符**）

- [ ] **Step 3: 行数 + 既有断言 + 五类棘轮 + 八门禁**

```powershell
foreach ($f in @('app/src/components/SessionDetailPanel.tsx','app/src/components/session-detail/SessionRawView.tsx','app/src/components/session-detail/SessionViewHost.tsx','app/src/components/session-detail/SessionAuxBlocks.tsx')) { "{0,4}  {1}" -f [System.IO.File]::ReadAllLines((Join-Path (Get-Location) $f),[Text.Encoding]::UTF8).Count, $f }
node scripts/line-limits.mjs --full
cd app; npx tsc --noEmit; npx vitest run src/components/SessionDetailPanel.test.tsx; npx vitest run
cd ..; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/SessionDetailPanel.test.tsx` | **4 用例全绿**；**4/4 判据各带自己的变异体**（新树 + CONTROL + `ran=true`；M1–M4 如期红） |
| V2 | Step 3 的行数脚本 | `SessionDetailPanel.tsx` **≤150**（起点 297）· 三个新件各 **≤300**（预算 200/150/120） |
| V3 | `node scripts/line-limits.mjs --full` | **exit 0 · `>600` 0 · 301–600 档 122 · 登记条目 122**（**零新增登记**） |
| V4 | `git diff --numstat -- app/src/components/SessionDetailPanel.tsx` | 有改动；**抽查 3 处被搬代码块的逐字对拍**（搬移 = 复制，不是重写）：报告里贴 `git show` 的块级 diff |
| V5 | `cd app; npx vitest run` | **既有 166 文件 / 1608 用例逐文件一条不少（LOST=0 SHRUNK=0）** + 本任务新增 1 文件 / 4 用例 |
| V6 | 五类棘轮（命令见 T0 Step 5） | **全绿**（新件不得给棘轮加计数） |
| V7 | `node scripts/bundle-eager-graph.mjs` | **89 / 4**（Δ=0：新件只被懒页静态可达） |
| V8 | `git show --stat HEAD~1`（提交 1） | **只含 `app/src/components/SessionDetailPanel.test.tsx` 一个路径** |
| V9 | 报告含「B9 声明 + 未验证单列 + dist mtime」 | 三项齐全 |

**依赖**：T0。**可并行**：T3、T4。**写者窗口**：`SessionDetailPanel.tsx` 由本任务与 T10 串行；本任务提交后 T10 才能动它。

---

### Task 3: 拆件 B —— `SessionScreenCards` 安全网判据 + 抽 `SessionScreenCard` 单卡（**两个原子提交**；C3 + V2 的强化口径）

> **为什么与 T2 同批**：C3 逐字「抽**单卡子件** `SessionScreenCard`（纯展示，≤120 行）供两个视图复用；`SessionScreenCards` 退化为「每屏一卡的列表容器」……**前置原子提交**：先给 `SessionScreenCards` 补 **1 条行为级判据**（它今天无测试、且测试文件 0 import）作安全网，再抽件」。**V2 已批准强化口径**（该文件 `data-testid` = 0 处 ⇒ 「集合不变」是空真）。

**Files:**
- Create（提交 1）：`app/src/components/session-detail/SessionScreenCards.test.tsx`（**≤220 行**，jsdom）
- Create（提交 2）：`app/src/components/session-detail/SessionScreenCard.tsx`（**≤120 行**，纯展示单卡）
- Modify（提交 2）：`app/src/components/session-detail/SessionScreenCards.tsx`（**193 → ≤150**：保留 `h3` 头 / 空态 / `screens.map` 容器 / **框选态 `selectingScreen` + `BoxSelectOverlay`** / 单屏 toast）

**Interfaces:**
- Consumes：`types/session.ts` 的 `SessionScreen`/`SessionOcrBlock` · `utils/fmt.ts` 的 `fmtMs` · `ui/primitives` 的 `Text` · `components/BoxSelectOverlay`
- Produces：`SessionScreenCard`：`interface Props { sessionId: number; kind: string | null; screen: SessionScreen; ocrBlocks: readonly SessionOcrBlock[]; imageUrl: (imageRef: string | null) => string | null; toast: { screenKey: number; msg: string } | null; onShowToast: (screenKey: number, msg: string) => void; onClearToast: () => void; }` —— **零 state、零 effect、零 IPC**（`<details>` 的展开态走原生 DOM，不是 React state）；**框选 overlay 不在单卡里**（C3 逐字「框选截取状态仍留容器（`selectingScreen` 不复制）」）
- 容器把 `convertFileSrc(`${baseUrl}/${s.image_ref}`)` 收口成 `imageUrl()` 再注入单卡 ⇒ **单卡零 `@tauri-apps` import**（T9 的卡片流可直接复用）

- [ ] **Step 1（提交 1）: 安全网判据（**V2 的强化口径**，4 条 + 阳性对照）**

| # | 判据（**今天的行为**，抽件后必须逐字不变） | 变异体（必须红） |
|---|---|---|
| S1 | **id 锚点集合恰等**：`screens.map` 逐屏产出 `id="ocr-{sessionId}-{first_seen_ms}"`，集合逐字等于 fixture 的期望集合（**这是 C3「锚点集合不变」的强化落点**） | 删一个屏的锚点 / 改锚点格式 ⇒ 红 |
| S2 | **卡片数 = `screens.length`**（每屏一块，无隐藏空卡） | 少渲染一屏 ⇒ 红 |
| S3 | **逐字文案**：h3 标题、空态文案（`screens.length === 0` 时）、正文文本按 fixture **逐字**断言 | 改任一字 ⇒ 红 |
| S4 | **展开态行为**：`<details>` 的 `open` 在点击 `summary` 后翻转（原生行为），且块级明细里的 OCR 文本仍在 DOM | 把 `<details>` 换成 `<div>` ⇒ 红 |
| **附注（防真空）** | 本文件今天 **0 个 `data-testid`** ⇒ 「data-testid 集合不变」是**空真**；本判据用 **id 锚点**顶上。**若日后新增 `data-testid`，集合判据自动生效**：在测试里加一条 `expect(testIds()).toEqual(FROZEN_TESTIDS)`（`FROZEN_TESTIDS` 初始为空数组，**新增即必须同步**并触发一次评审） | 新增 testid 而不同步冻结表 ⇒ 红 |

提交：`test(sessions): pin screen cards before split`（**42 字符**）

- [ ] **Step 2（提交 2）: 抽件（行为等价）**

- 把 `:83-190` 的每屏块（屏头 / 标题 / 正文 / 标签 / 结构徽标 / 配图+单屏 toast / 块级明细 `details`）搬进 `SessionScreenCard.tsx`；
- 容器保留：`h3` 头（`:72-77`）、空态（`:78-82`）、`screens.map`（改为 `<SessionScreenCard … />`）、`BoxSelectOverlay` 与 `selectingScreen` 的成对渲染（`:129-177` 里与框选相关的那部分）；
- **`data-testid` 集合保持不变（今天为空集）**，id 锚点仍由**容器**给出（锚点挂在卡片容器上，`SessionScreenCard` 不自己造 id ⇒ 抽件后断言 S1 不变）。

提交：`refactor(sessions): extract single screen card`（**43 字符**）

- [ ] **Step 3: 行数 + 棘轮 + 八门禁**（同 T2 Step 3 的形态）

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/session-detail/SessionScreenCards.test.tsx` | **S1–S4 全绿**（提交 1 后即为绿 —— 它钉的是**今天**的行为）；**抽件后同一条命令仍全绿**（这就是「行为等价」的判据） |
| V2 | 4 个变异体（每变异新树 + CONTROL + `ran=true`） | **4/4 如期红**；另加 1 条**反例守卫**（只加注释/只改缩进 ⇒ 必须绿） |
| V3 | 行数脚本 | `SessionScreenCards.tsx` **≤150**（起点 193）· `SessionScreenCard.tsx` **≤120** |
| V4 | `cd app; npx vitest run` | **既有 166 文件 / 1608 用例逐文件一条不少（LOST=0 SHRUNK=0）** + 本任务新增 1 文件 / 4 用例 |
| V5 | 五类棘轮 | 全绿（`SessionScreenCard.tsx` 用 `Text` 不用裸 `<button>`/裸灰字/裸边框字面量） |
| V6 | `node scripts/bundle-eager-graph.mjs` | **89 / 4**（Δ=0） |
| V7 | `git show --stat HEAD~1`（提交 1） | 只含 `SessionScreenCards.test.tsx` |

**依赖**：T0。**可并行**：T2、T4。**写者窗口**：`SessionScreenCards.tsx` 归本任务；T9 只消费 `SessionScreenCard.tsx`。

---

### Task 4: 拆件 C —— `NotesPage.tsx`（300 → ≤290；C9 的「先拆才允许任何改动」）

> **为什么必须**：C9 逐字「`NotesPage.tsx`（**300/300**）**先拆**才允许任何改动」；本批对它的唯一后续改动是 T16 的 `focus*` 接线（预计 +4~5 行）⇒ 不先拆就必然破 300。

**Files:**
- Modify：`app/src/pages/NotesPage.tsx`（**300 → ≤290**）· `app/src/utils/colorPalette.ts`（接收搬出的派生函数）
- Modify（只增不减）：`app/src/pages/NotesPage.test.tsx`（**2 用例不许少**）
- Modify（**追加判据，不新建文件**）：`app/src/utils/colorPalette.test.ts`（**已存在**；追加 ≤60 行 / 3 条判据；**既有用例一条不许少**）

**Interfaces:**
- Consumes：`utils/colorPalette.ts` 既有的 `resolveNoteColor`（同为「笔记色板」的真源）· `hooks/useNotesSealedFilter` 返回的 `filterSealed`
- Produces（`utils/colorPalette.ts` 新增两个**纯函数**）：
  - `export function visibleNotesOf(notes: readonly Note[], groupFilter: number | null, filterSealed: (n: readonly Note[]) => Note[]): Note[]`
  - `export function buildNoteColorMap(visibleNotes: readonly Note[], groups: readonly NoteGroup[], tagColors: Readonly<Record<string, string>>): Record<number, string | null>`
  - **边界**：两函数都**不读** `localStorage`、**不调** `invoke`、**不改**入参（返回新对象/新数组）

- [ ] **Step 1: 搬 `NotesPage.tsx:176-193` 的三个 `useMemo`（`visibleNotes` / `groupMap` / `noteColors`）到 `utils/colorPalette.ts`**

- `visibleNotes` 的过滤逻辑（`:179-182`）逐字搬进 `visibleNotesOf`（`groupFilter === null ? notes : notes.filter(n => n.group_id === groupFilter)` 再 `filterSealed`）；
- `groupMap`（`:185`）作为 `buildNoteColorMap` 的内部 `new Map`；
- `noteColors`（`:187-193`）逐字搬进 `buildNoteColorMap`（仍调 `resolveNoteColor(n, n.group_id != null ? groupMap.get(n.group_id) : null, tagColors)`）；
- 页面侧改为：`const visibleNotes = useMemo(() => visibleNotesOf(list.notes, groupFilter, filterSealed), [list.notes, groupFilter, filterSealed]);` + `const noteColors = useMemo(() => buildNoteColorMap(visibleNotes, list.groups, list.tagColors), [visibleNotes, list.groups, list.tagColors]);`（**净减约 15 行**）
- **不许**改 `NotesListColumn` / `NotesReadingColumn` 的 props（`noteColors` 的消费者一字不动）。

- [ ] **Step 2: 行数 + 既有用例 + 八门禁**

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | 行数脚本 | `NotesPage.tsx` **≤290**（起点 300；**末尾无换行**，必须用 `ReadAllLines` 口径） |
| V2 | `cd app; npx vitest run src/pages/NotesPage.test.tsx src/components/notes/NotesReadingColumn.outline.test.tsx src/utils/colorPalette.test.ts` | **2 + 6 + N 全绿**；`NotesPage.test.tsx` 的**用例数不许少**（`update_note` 先于 `get_note` 的既有断言逐字保留） |
| V3 | `colorPalette.test.ts` 的 3 条判据 + 变异体 | ① `groupFilter` 生效 ② `filterSealed` 生效（用一个恒真/恒假的桩各测一次）③ 色板优先级（笔记显式 > 组继承 > 标签 > 默认）；**3/3 各带变异体如期红** |
| V4 | `cd app; npx vitest run` | **既有 166 文件 / 1608 用例逐文件一条不少（LOST=0 SHRUNK=0）** + 本任务新增 3 条 |
| V5 | `node scripts/line-limits.mjs --full` | exit 0 · **0/122/122**（零新增登记） |
| V6 | 五类棘轮 + `zIndex.guard` | 全绿（`utils/colorPalette.ts` 新代码不得引入被计数字面量） |
| V7 | `node scripts/bundle-eager-graph.mjs` | **89 / 4**（Δ=0：`utils/**` 已在首屏，无新增文件） |

**依赖**：T0。**可并行**：T2、T3。**写者窗口**：`NotesPage.tsx` 由本任务与 T16 串行；本任务提交后 T16 才能动它。
**与 D9 的偏差登记**：D9 建议「把右栏装配的一块挪进 `NotesReadingColumn`」；本计划改搬进 **`utils/colorPalette.ts`**，理由 = `noteColors` 被**两个列**共用（挪进右栏会造出第二份派生），而 `colorPalette.ts` 已是 `resolveNoteColor` 的真源 ⇒ **语义归属更准且净减行数更多**。**在 T18 的「与计划的偏差」里登记。**

---

### Task 5: 地基 A —— `ViewSwitcher` 原语（C14① + R-2 的类名空间）

> **为什么在地基批**：C1 逐字「宿主用 `React.lazy` + `Suspense`」的**切换入口**就是它；C14① 逐字「`ViewSwitcher` **必须进 `ui/primitives/index.ts` barrel** 且在 `style-contract.test.ts` 的枚举里（ADR-033 §1/§4），**零行内 style**，并覆盖 §8.6.1 第 3 条的响应层接缝（`--dur-micro` 120ms）⇒ **它的首屏 Δ 要真实构建后登记**」。

**Files:**
- Create：`app/src/ui/primitives/ViewSwitcher.tsx`（**≤150 行**）· `app/src/ui/primitives/ViewSwitcher.css`（**≤80 行**）· `app/src/ui/primitives/ViewSwitcher.test.tsx`（**≤300 行**，jsdom 首行注释）
- Modify：`app/src/ui/primitives/index.ts`（**45 → ≤60**：`export { ViewSwitcher } from "./ViewSwitcher";` + `export type { ViewSwitcherOption, ViewSwitcherProps } from "./ViewSwitcher";`）· `app/src/ui/primitives/style-contract.test.ts`（**236 → ≤300：只新增**一个类名枚举块 + 它自己的判据）

**Interfaces:**
- Consumes：`ui/icons` 的 `Icon` + `IconName`（B6 的负判据：**不许 emoji、不许裸字符串**）
- Produces：
  ```ts
  export interface ViewSwitcherOption { readonly key: string; readonly label: string; readonly icon?: IconName }
  export interface ViewSwitcherProps {
    readonly options: readonly ViewSwitcherOption[];
    readonly value: string;
    readonly onChange: (key: string) => void;
    readonly ariaLabel: string;          // 必填：容器的可访问名（不靠视觉）
    readonly disabled?: boolean;         // 异步守卫期间由宿主门控（T14）
    readonly testId?: string;
  }
  ```
- **语义（写进文件头的 `@ai-context`）**：容器 `role="group"` + `aria-label`；每段 `<button type="button" className="ed-btn ed-btn--segment" aria-pressed={active}>`；**roving tabindex**（选中项 `tabIndex=0`，其余 `-1`）+ `ArrowLeft`/`ArrowRight`/`Home`/`End` 移动焦点；**不用 `role="tab"`**（理由：面板是被条件挂载/卸载的，不是常驻 tabpanel ⇒ `aria-pressed` 说实话；规格 §7.1 只写「分段控件」）。
- **类名空间（R-2 的落点，必须在 `ViewSwitcher.tsx` 与 `ViewSwitcher.css` 的文件头写清）**：容器 `.ed-btn-group` + 段 `.ed-btn--segment` —— **复用 `ed-btn` 基座命名空间**，理由三条：① 段控件本质是**成组的按钮**（元素就是 `<button>`）；② `motion-coverage.test.ts:113-123` 的规则**逐字排除**「含 `--`」与「`<基类>-…`」⇒ 不动 `BASE_CLASSES`、不动 `motion.css` 名单、不动 `style-seams.test.ts:190` 的 12 个基类计数 ⇒ **本批对既有断言的改动数保持 0**（附 B.6 逐字成立）；③ **诚实代价（必须写进 T18 的「诚实代价」段）**：「段控件的类名落在按钮基座命名空间里」是一次**语义折中** —— 它换来的是不改两处既有守卫。

- [ ] **Step 1: `ViewSwitcher.css`（零颜色字面量；`--dur-micro` 接缝）**

- 类：`.ed-btn-group`（`display:inline-flex; gap:2px; padding:2px; border-radius:var(--ed-radius-control,5px); background:var(--ed-bg-sunken)`）· `.ed-btn--segment`（`border:1px solid transparent; background:transparent; color:var(--ed-ink-3); transition: background var(--ed-dur-micro,120ms), color var(--ed-dur-micro,120ms), border-color var(--ed-dur-micro,120ms)`）· `.ed-btn--segment[aria-pressed="true"]`（`background:var(--ed-bg-raised); color:var(--ed-ink-1); border-color:var(--ed-border)`）· `.ed-btn--segment:hover:not([aria-pressed="true"]):not(:disabled)`（`background:var(--ed-bg-canvas)`）· `.ed-btn--segment:disabled`（`opacity:.6; cursor:default`）
- **硬约束**：① **零颜色字面量**（`style-seams.test.ts:238` 的守卫①扫**全部** `primitives/*.css`）；② **不写 `z-index`**；③ **位移 ≤8px**（本文件不应有 transform）；④ **不写媒体查询**（reduced-motion 由 `motion.css` 的唯一块统一覆盖；`.ed-btn` 已在名单里，段类与基类同元素 ⇒ 已被覆盖 —— 这正是规格 §11-5 逐字「修饰类（`--`）与子元素类**不进名单** …… 它们与基类同在一个元素上、已被同一条规则覆盖」的形态）。
- `ViewSwitcher.tsx` 顶部必须有 `import "./ViewSwitcher.css";`（`style-contract.test.ts` 的 CSS 接线守卫按 `ownerOf()` 反查同名宿主）。

- [ ] **Step 2: `ViewSwitcher.tsx`（零行内 style）**

- 受控组件；`onChange` **只在 key 变化时**调用（点当前项不回调）；
- 键盘：容器上不做事件委托，**每段自己 `onKeyDown`**（`ArrowLeft/ArrowRight/Home/End` 计算目标索引 ⇒ `refs[i].focus()` + **不**自动 `onChange`，遵循 roving tabindex 惯例）；
- `disabled` ⇒ 段 `disabled` 且**不**触发 `onChange`；
- **不许**出现 `style={{…}}` 覆盖底色/边框/位移（ADR-033 §4）。

- [ ] **Step 3: barrel + `style-contract.test.ts` 的**新增**枚举块**

- `index.ts` 两行导出（**只加不改**）；
- `style-contract.test.ts` **新增**（不动既有 6 个 `it`、不动 `CONTRACTS` 的 12）：
  ```ts
  /** 批 5（C14①）：ViewSwitcher 的类名枚举 —— 复用 ed-btn 基座（见 ViewSwitcher.tsx 文件头） */
  const VIEW_SWITCHER_CLASSES: readonly string[] = ["ed-btn-group", "ed-btn--segment"];
  ```
  + 两条新判据：① `ViewSwitcher.tsx` 产出的每个类都在 `ViewSwitcher.css` 里有规则；② `ViewSwitcher.tsx` 里 **`style={` 命中 0 处**（零行内 style）+ `import "./ViewSwitcher.css";` 在位。

- [ ] **Step 4: 判据 + 变异体（每条各一棵新树 + CONTROL + `ran` 闸）**

| # | 判据（行为级） | 变异体（必须红） |
|---|---|---|
| W1 | 渲染 N 个段；`aria-pressed="true"` **恰一个**且等于 `value` | 把 `aria-pressed` 写成常量 ⇒ 红 |
| W2 | 点击第 k 段 ⇒ `onChange` **恰 1 次**、实参 = 第 k 个 key；点**当前**段 ⇒ **0 次** | 把 `onChange(opt.key)` 写成 `onChange(value)` ⇒ 红 |
| W3 | 键盘：`ArrowRight` 把焦点移到下一段（`document.activeElement` 断言）；`Home`/`End` 到首/尾；**焦点移动不触发 `onChange`** | 删 keydown 处理 ⇒ 红 |
| W4 | 选中段与未选中段的 `className` 不同，且根/段上 **`style` 属性不存在**（`element.getAttribute("style") === null`） | 加 `style={{background:…}}` ⇒ 红 |
| W5 | `disabled` ⇒ 点击**不**触发 `onChange`，且段带 `disabled` | 删 `disabled` 门 ⇒ 红 |
| W6 | 每个段有可访问名（文本 = `label`；`icon` 只作装饰 ⇒ `aria-hidden` 或不影响名）且**可聚焦**（`tabIndex` 按 roving 规则） | 去掉 `label` 文本且不给 `aria-label` ⇒ 红 |
| W7 | `icon` 走 `ui/icons`：传一个**不存在**的图标名在类型层就报错（`tsc --noEmit` 红）；运行期渲染出 `svg`（**不是 emoji**） | 把 `icon` 写成 emoji 字符串 ⇒ `tsc` 红 |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/ui/primitives/ViewSwitcher.test.tsx` | W1–W6 **全绿**；**6/6 判据各带变异体如期红**（W7 由 `tsc` 承担） |
| V2 | `cd app; npx tsc --noEmit` | **0 错**（含 W7 的反向：emoji 字符串不可赋给 `IconName`） |
| V3 | `cd app; npx vitest run src/ui/primitives/style-contract.test.ts src/ui/primitives/motion-coverage.test.ts src/ui/primitives/style-seams.test.ts` | **全绿**；且 `git diff --numstat` 在这三个文件上：`motion-coverage` / `style-seams` **不在提交路径里**（`git show --stat HEAD` 不含它们）、`style-contract` 的**删除行数 = 0** |
| V4 | `cd app; npx vitest run` | **既有 166 文件 / 1608 用例逐文件一条不少（LOST=0 SHRUNK=0）** + 本任务的新增用例 |
| V5 | **真实构建**（取锁协议；见 Global Constraints） | `node scripts/check-bundle-budget.mjs` **exit 0**；**首屏 Δ 与机理**（期望：**小额正 Δ**，量级参照批 4 T9 的整层原语 +2.16 kB ⇒ 单个分段控件应远小于此；**超预算即红**）；报告写 **dist mtime + 入口 chunk 名 + 提交 sha** |
| V6 | `node scripts/bundle-eager-graph.mjs` + `tmp/t1/eager-graph-tsapi.mjs` | 工具口径与真实边口径**双读数**；新增进首屏的集合**逐条具名**（`ViewSwitcher.tsx` + `ViewSwitcher.css` 预期 +2） |
| V7 | 五类棘轮 + `zIndex.guard` | 全绿（`ui/primitives/**` 在棘轮域外，`zIndex.guard` 域内但新代码无裸值） |

**依赖**：T0。**可并行**：T6、T7–T9、T12。**写者窗口**：`ui/primitives/index.ts` 与 `style-contract.test.ts` **本任务独占**。

---

### Task 6: 地基 B —— `views/registry.ts`（`ViewSpec` + `load` + `viewsFor`）+ `views/useViewMemory.ts`（C1/C5）

> **为什么与 T5 同批**：C1 的四个硬要求（① 只被两个懒页 import ② 首屏 Δ=0 双证据 ③ 懒 chunk 台账 ④ `manualChunks` 不动）全部落在这两个文件上；C5 的键口径落在 `useViewMemory`。

**Files:**
- Create：`app/src/views/registry.ts`（**≤120 行**）· `app/src/views/useViewMemory.ts`（**≤70 行**）· `app/src/views/registry.test.ts`（**≤300 行**，node 环境）· `app/src/views/useViewMemory.test.ts`（**≤200 行**，node 环境，注入内存 `Storage` 桩）

**Interfaces:**
- Consumes：`ui/icons` 的 `IconName` · `types/session` 的 `SessionDetail`/`SessionOcrBlock` · `types/notes` 的 `Note` · `ui/zIndex` 不涉及
- Produces（`registry.ts`）：
  ```ts
  export type ObjectType = "session" | "note";
  export interface ViewSpec<P> {
    readonly key: string;
    readonly label: string;
    readonly icon: IconName;
    readonly appliesTo: ObjectType;
    /** 非默认视图：**模块级惰性**加载器（C1）。默认视图**不提供** —— 它由容器同步渲染并常驻（§7.3②） */
    readonly load?: () => Promise<{ default: ComponentType<P> }>;
  }
  export interface SessionViewSlot { readonly detail: SessionDetail; readonly imageUrl: (imageRef: string | null) => string | null; readonly ocrBlocksByScreen: ReadonlyMap<number, SessionOcrBlock[]>; readonly selectingScreen: number | null; readonly onSelectScreen: (firstSeenMs: number | null) => void; readonly panelToast: { screenKey: number; msg: string } | null; readonly onShowToast: (screenKey: number, msg: string) => void; readonly onClearToast: () => void; readonly autoRefineTaskId: number | null; readonly onRefineTaskStarted?: (sessionId: number, taskId: number) => void; }
  export interface NoteViewSlot { readonly note: Note; readonly onTaskToggle: (newContent: string) => void; readonly onOpenSession?: (sessionId: number) => void; readonly onImageOpen: (src: string, title?: string) => void; }
  export function viewsFor(objectType: "session"): readonly ViewSpec<SessionViewSlot>[];
  export function viewsFor(objectType: "note"): readonly ViewSpec<NoteViewSlot>[];
  export function keysFor(objectType: ObjectType): readonly string[];
  export const FROZEN_VIEW_KEYS: Readonly<Record<ObjectType, readonly string[]>>;
  ```
  - **会话 spec 顺序（`[0]` = 默认）**：`raw`（「原文」，无 `load`）→ `tritrack`（「三轨对齐」，`load: () => import("./session/SessionTriTrackView")`）→ `proof`（「印样」）→ `cardflow`（「卡片流」）→ `preview`（「笔记预览」，`load: () => import("../components/NotePreviewView")`；**R-1：非默认 ⇒ 必须惰性**）
  - **笔记 spec 顺序**：`raw`（「原文」，无 `load`）→ `cardflow`（「卡片流」）→ `evidence`（「带证据三轨」，**T13 条件项**；不交付时**不进表**）
  - **未知 `objectType` 运行期返回 `[]`**（B2 的判据：不是抛、不是默认全集）
  - **`load` 缺省语义**：恰有**一个** spec 无 `load`，且它必须是 `[0]`（默认视图）；其余每个都必须有 `load`
- Produces（`useViewMemory.ts`）：
  ```ts
  export const VIEW_MEMORY_PREFIX = "view:default:";
  export function viewMemoryKey(objectType: ObjectType): string;                  // `view:default:{objectType}`
  export function readViewMemory(objectType: ObjectType, validKeys: readonly string[], storage?: Storage): string | null;
  export function writeViewMemory(objectType: ObjectType, key: string, storage?: Storage): void;
  export function useViewMemory(objectType: ObjectType, defaultKey: string, validKeys: readonly string[], storage?: Storage): readonly [string, (k: string) => void];
  ```
  - **范式照 `utils/draftStore.ts`**（注入 `Storage`、纯函数可用内存桩在 node 下单测）；`localStorage` 抛异常（隐私模式）⇒ 返回默认值、**不崩**；存值不在 `validKeys` ⇒ 回退默认；**绝不写 `layout:` 前缀的任何键**（C5 + `shell/columnKeys.freeze.test.ts` 的前缀断言）。
  - **`views/registry.ts` 只允许被 `pages/SessionsPage.tsx` 与 `pages/NotesPage.tsx` 直接 import**（C1①；T15 立图级判据）。

- [ ] **Step 1: 写 `registry.ts`（纯数据 + 纯函数；`load` 只返回 `import()`）**

- 文件头 `@ai-context`：**为什么 `load` 对默认视图缺省**（默认视图必须常驻、不经 `React.lazy` ⇒ 注册表不静态引用任何视图组件；它仍持有默认视图的 key/label/icon ⇒ 仍是「按对象类型查可用视图的单一注册表」）；
- 反向引用：`import type { ComponentType } from "react"`（**只类型**）；`ViewSpec` 的 `P` 由调用点的 `viewsFor` 重载固定；
- **不得**静态 import 任何视图组件（否则首屏/懒 chunk 的边立刻失控 ⇒ T15 必红）。

- [ ] **Step 2: 写 `useViewMemory.ts`（≤70 行）**

- `viewMemoryKey` 是**唯一**构造键的地方（测试直接断言它逐字等于 `view:default:session` / `view:default:note`）；
- `read`/`write` 内的 `try/catch` 吞掉 `Storage` 异常并返回 `null` / 静默（**不 console.warn 刷屏**，理由写进注释）；
- `useViewMemory` 用 `useState` 初始化（**惰性初始化函数**，避免每次渲染读盘）+ `useCallback` 写。

- [ ] **Step 3: 判据 + 变异体**

| # | 判据（`registry.test.ts`） | 变异体（必须红） |
|---|---|---|
| G1 | **冻结表的三条不变式**：① `keysFor(t)` **逐字等于** `FROZEN_VIEW_KEYS[t]`（`session` = `["raw","tritrack","proof","cardflow","preview"]`；`note` = `["raw","cardflow"(,"evidence")]`）② **计数不变式**：`FROZEN_VIEW_KEYS[t].length === viewsFor(t).length`（`FROZEN == sum(entries)` 的同形）③ **锚**：`FROZEN_VIEW_KEYS[t][0] === "raw"`（默认视图在首位，C1/§7.3① 的结构锚） | 增删一个 spec 而不同步冻结表 ⇒ 红；把默认视图挪出首位 ⇒ 红 |
| G2 | `viewsFor(t)[0].load === undefined` ∧ **其余每个 spec 都有 `load`** ∧ 无 `load` 的恰 **1** 个 | 给默认视图加 `load`（或给非默认去掉）⇒ 红 |
| G3 | **每个 `load()` 都能解析出真实模块**：`const m = await spec.load(); expect(typeof m.default).toBe("function")` | 把 `load` 指向不存在的路径 ⇒ 红（**这条同时是「冻结表不可手工改宽」的牙**：假 key 无法满足它） |
| G4 | 每个 spec 的 `appliesTo` 与其被查询的类型一致（`viewsFor("note")` 里不出现会话视图） | 把某个 spec 的 `appliesTo` 改成 `"session"` ⇒ 红 |
| G5 | 未知类型：`viewsFor("system" as ObjectType)` ⇒ `[]`（不抛、不是全集） | 改成默认返回全集 ⇒ 红 |
| G6 | 每个 `icon` 是 `ICON_NAMES` 的成员（**不是 emoji、不是裸字符串**） | 塞一个 emoji ⇒ 红（`tsc` + 运行期双保险） |
| G7 | **`load` 是模块级惰性**：源码级判据 —— 每个非默认 spec 的 `load` 体内**恰有一个** `import(` 且**没有**静态 import 的视图组件（`registry.ts` 顶部 import 清单里 0 个 `views/session/**` 或 `views/note/**` 或 `components/NotePreviewView`） | 把 `load` 换成 `() => Promise.resolve({ default: X })` + 顶部静态 import ⇒ 红 |

| # | 判据（`useViewMemory.test.ts`） | 变异体（必须红） |
|---|---|---|
| M1 | 初始值 = `storage.getItem("view:default:session")`（有值则取之，无值取默认）；写后**重挂载恢复**同一值 | 把键写成 `view:default`（无类型）⇒ 红 |
| M2 | **两类互不串**：写 `session` 后 `note` 仍为默认 | 键不带 `objectType` ⇒ 红 |
| M3 | `Storage` 抛异常（注入会 throw 的桩）⇒ 返回默认值、**不崩**、写也不抛 | 删 `try/catch` ⇒ 红 |
| M4 | 存值不在 `validKeys`（被手改成垃圾）⇒ 回退默认 | 删校验 ⇒ 红 |
| M5 | **不写 `layout:` 前缀的任何键**：全程 `storage` 的键集合恰为 `{view:default:session}`（或 note） | 复用 `layout:` ⇒ 红（并与 `columnKeys.freeze.test.ts` 撞红） |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/views/registry.test.ts src/views/useViewMemory.test.ts` | G1–G7 + M1–M5 **全绿**；**12 条判据各带变异体如期红** |
| V2 | `cd app; npx tsc --noEmit` | 0 错 |
| V3 | `node scripts/bundle-eager-graph.mjs` + `tmp/t1/eager-graph-tsapi.mjs` | **89 / 65 不变**（Δ=0：`views/**` 此刻**还没有任何 import 者** ⇒ 不可达；这条是 C1 的构造性证据之一）；报告写「两口径 + 机理」 |
| V4 | `cd app; npx vitest run` | **既有 166 文件 / 1608 用例逐文件一条不少（LOST=0 SHRUNK=0）** + 本任务新增 2 文件 / 12 用例（G1–G7 + M1–M5） |
| V5 | `node scripts/line-limits.mjs --full` | exit 0 · 0/122/122（新文件 ≤300 且零登记） |
| V6 | `git show --stat HEAD` | 只含 4 个新文件（`registry.ts` / `useViewMemory.ts` / 两个测试） |

**依赖**：T0。**可并行**：T5、T7–T9、T12。

---

### Task 7: 会话视图 A —— `SessionTriTrackView`（三轨对齐；C2 的「零新数据面」）

> **为什么它是三轨**：C2 逐字「会话三轨 = **转写 / 画面 / OCR 文字**（`segments` / `screens` / `ocr_blocks` 全在 `SessionDetail` 里 ⇒ **零新数据面、不碰 Rust**，符合规格 §3 红线 6）」。

**Files:**
- Create：`app/src/views/session/SessionTriTrackView.tsx`（**≤280 行**）
- 测试：`app/src/views/session/sessionViews.test.tsx`（**≤300 行**，jsdom；**三个会话视图各一个 `describe`** —— 本任务加 `describe("SessionTriTrackView")`）
- 不修改任何既有文件

**Interfaces:**
- Consumes：`views/registry.ts` 的 `SessionViewSlot`（**只取** `detail` 一项：`detail.segments` / `detail.screens` / `detail.ocr_blocks`）· `ui/primitives` 的 `Text` / `EmptyState` · `utils/fmt.ts` 的 `fmtMs`
- Produces：`export default function SessionTriTrackView({ detail }: Pick<SessionViewSlot, "detail">)` —— **零 `invoke`、零 `@tauri-apps` import、零 state**（对齐是纯派生）

- [ ] **Step 1: 数据契约写死（规格未给，本计划定）**

- **三条轨的条目源**（全部来自 `detail`，**零新 invoke**）：`segments`（转写：`start_ms`/`end_ms`/`source`/`text`）· `screens`（画面：`first_seen_ms`/`last_seen_ms`/`title`/`image_ref`）· `ocr_blocks`（OCR 文字：`timestamp_ms`/`text`/`score`）
- **对齐口径**：三轨按**同一 `ms` 轴**升序合并渲染；同 `ms` 时**纵向顺序固定为 转写 → 画面 → OCR**（判据可断言）；
- **`ocr_blocks` 归属**：沿用 `useSessionDetailData` 已有的屏→块分组语义（`timestamp_ms ∈ [first_seen_ms, last_seen_ms)`），但**本视图只做「时间对齐展示」**，不复制分组 hook（分组由容器注入 `ocrBlocksByScreen` 是可选项；**本视图只用 `detail.ocr_blocks` 的 `timestamp_ms`**）；
- **空态**：`EmptyState`（`title` 说明「本会话三轨无内容」+ `description` 指向原文视图），**不是裸灰字**（否则 `emptyStateRatchet` 红）。

- [ ] **Step 2: 组件（纯展示）**

- 根元素：`data-testid="session-tritrack-view"`（T18 的 chunk 归属探针要用这个**独有字面量**）；
- 每条轨一个列（`data-track="transcript" | "screen" | "ocr"`），列内条目 `data-ms={ms}`；
- **不许**出现裸 `<button>`（`nativeButton.ratchet` 域含 `views/**`）；需要交互时用 `Button` 原语；
- 不得写裸色值/裸圆角/裸边框（五类棘轮）。

- [ ] **Step 3: 判据 + 变异体**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| T1 | **条目数**：`[data-track="transcript"]` 的子项数 = `segments.length`；`[data-track="screen"]` = `screens.length`；`[data-track="ocr"]` = `ocr_blocks.length` | 少渲染一条轨 ⇒ 红 |
| T2 | **纵向顺序**：同一 `ms` 的三个条目在 DOM 里的顺序 = 转写 → 画面 → OCR（用 `compareDocumentPosition` 或子序断言） | 交换两条轨的渲染顺序 ⇒ 红 |
| T3 | **空态走原语**：三个数组都空 ⇒ 渲染 `EmptyState`（`role`/标题断言），**且 0 个裸灰字节点** | 换成 `<p style={{color:"#9ca3af"}}>` ⇒ 红（双红：判据 + `emptyStateRatchet`） |
| T4 | **不 invoke 且不带 Tauri**：① `vi.mock("@tauri-apps/api/core")` 后渲染 ⇒ `invoke` **0 调用**；② 源码级：`views/**` 的 `@tauri-apps` import = 0 | 在视图里 `await invoke("get_session_detail")` ⇒ 红 |
| T5 | **时间码格式**：条目上的时间码与 `fmtMs` 输出逐字一致（防「自己实现一个格式化」） | 手写 `Math.floor(ms/1000)` ⇒ 红（格式不一致） |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/views/session/sessionViews.test.tsx` | T1–T5 全绿；**5/5 各带变异体如期红** + 1 条反例守卫（只改文案缩进 ⇒ 绿） |
| V2 | 行数脚本 | `SessionTriTrackView.tsx` **≤280** · `sessionViews.test.tsx` **≤300** |
| V3 | 五类棘轮（5 条命令） | **全绿**（新文件在域内 ⇒ 这是「不加剧」的机器判据） |
| V4 | `cd app; npx vitest run` | **既有 166 文件 / 1608 用例逐文件一条不少（LOST=0 SHRUNK=0）** + 本任务新增 5 条 |
| V5 | `node scripts/bundle-eager-graph.mjs` | **89 / 4**（Δ=0：`views/**` 仍无静态 import 者） |

**依赖**：T6。**可并行**：T8、T9、T12。

---

### Task 8: 会话视图 B —— `SessionProofView`（印样）

> **为什么需要写死契约**：规格 §7.2 只给了视图名「印样」，**没给数据契约**（侦察 §11.7 已登记）。

**Files:**
- Create：`app/src/views/session/SessionProofView.tsx`（**≤250 行**）
- 测试：`app/src/views/session/sessionViews.test.tsx`（**≤300 行**，jsdom；本任务加 `describe("SessionProofView")`）

**Interfaces:**
- Consumes：`SessionViewSlot` 的 `detail` + `imageUrl`（**容器注入的图片 URL 解析器** —— 视图**不许**自己 import `@tauri-apps/api/core` 的 `convertFileSrc`）
- Produces：`export default function SessionProofView({ detail, imageUrl }: Pick<SessionViewSlot, "detail" | "imageUrl">)`

- [ ] **Step 1: 契约写死（「印样」= 剪报/印张式静态排版，与本批的「卡片流」明确区分）**

- **一屏 = 一张印张**（`detail.screens` 逐项）：`data-testid="session-proof-view"` + 每张 `data-proof-sheet={first_seen_ms}`；
- 印张结构：**序号 + 区间时间码**（`fmtMs(first_seen_ms) – fmtMs(last_seen_ms)`）→ **配图**（`image_ref` 非空时 `<img src={imageUrl(ref)}>`）→ **该区间内的转写正文**（`segments` 里与之重叠的段，按 `start_ms` 升序，**连续正文流、不折行成卡片**）；
- **只读、零交互**：没有展开/收起、没有标签、没有结构徽标、没有框选（与 `SessionCardFlowView` 的差异写进两个文件的 `@ai-context`）；
- **`image_ref === null` ⇒ 不渲染 `<img>`**（降级：保留图注位）。
- 与 T9 的功能重叠**已由 C3 消解**：两者共用 `SessionScreenCard` 的**展示元素**吗？——**不共用**：印样是「连续正文流」形态，卡片流是「一屏一卡」；两者共用的只是**数据语义**（一屏一段区间），**代码真源是 `SessionScreenCard`（卡片流用）**，印样**不复用卡片**（避免为两个形态硬造一个「超级卡」）。**该判断必须在报告里逐字登记**（否则 C3 的「防重写」目标会被误读为「所有会话视图都必须用同一张卡」）。

- [ ] **Step 2: 判据 + 变异体**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| P1 | **印张数 = `screens.length`**（`[data-proof-sheet]` 计数） | 少渲染一张 ⇒ 红 |
| P2 | **`image_ref` 为空时不渲染 `<img>`**；非空时 `src` 逐字等于 `imageUrl(ref)` 的返回 | 无条件渲染 `<img>` ⇒ 红 |
| P3 | **正文按区间归属**：某印张内出现的转写文本集合 = 与该区间重叠的 `segments` 文本集合（逐字） | 把全部段都塞进每张印张 ⇒ 红 |
| P4 | **只读**：整块 **0 个 `<button>` / 0 个 `<details>`**（防止印样退化成卡片流的复制品） | 加一个展开按钮 ⇒ 红（双红：判据 + `nativeButton.ratchet`） |
| P5 | **不 invoke 且不带 Tauri**（同 T1 的 T4 形态） | 视图里直接 `convertFileSrc` ⇒ 红（源码级判据） |

**Verification**：与 T7 同形（V1 判据全绿 + 5/5 变异红；V2 行数 ≤250；V3 五类棘轮全绿；V4 全量 vitest `LOST=0 SHRUNK=0`；V5 eager 89/4 Δ=0）。

**依赖**：T6。**可并行**：T7、T9、T12。

---

### Task 9: 会话视图 C —— `SessionCardFlowView`（卡片流；复用 T3 抽出的单卡）

> **为什么复用**：C3 逐字「抽**单卡子件** `SessionScreenCard`（纯展示，≤120 行）供**两个视图复用**；`SessionScreenCards` 退化为「每屏一卡的列表容器」；新建 `SessionCardFlowView` = 另一种容器（不同密度/流式）」。

**Files:**
- Create：`app/src/views/session/SessionCardFlowView.tsx`（**≤200 行**）
- 测试：`app/src/views/session/sessionViews.test.tsx`（**≤300 行**，jsdom；本任务加 `describe("SessionCardFlowView")`）

**Interfaces:**
- Consumes：`components/session-detail/SessionScreenCard`（T3 产出）· `SessionViewSlot` 的 `detail` / `imageUrl` / `ocrBlocksByScreen`
- Produces：`export default function SessionCardFlowView(props: Pick<SessionViewSlot, "detail" | "imageUrl" | "ocrBlocksByScreen">)`
- **它与 `SessionScreenCards` 的差异（写死）**：① **无框选、无单屏 toast**（`selectingScreen` / `panelToast` **不进本视图的 props**）；② **无「结构徽标」与「块级明细」展开**（只留 时间码 + 图 + 正文摘要 + 标签）；③ 密度更高：`.ed-cardflow` 容器用 `display:flex; flex-direction:column; gap:var(--ed-space-8)`（**布局用行内 style 是允许的**，ADR-033 §4 只禁止用 `style` 覆盖原语类语义）；④ 每卡带 `data-card-flow-item` 锚点。

- [ ] **Step 1: 实现**（`screens.map` → `<SessionScreenCard … />`，逐卡只传它需要的四个 prop：`sessionId` / `kind` / `screen` / `ocrBlocks`；`toast` 传 `null` 且 `onShowToast` / `onClearToast` 传**空函数** ⇒ 单卡内部不会渲染 toast 触发钮？**不许**：单卡里若有无条件渲染的 toast 钮，则空函数会让它**可点但无反应** ⇒ **正确形态 = 给单卡一个 `interactive?: boolean`？** ❌ 那是档位。**正解**：单卡的 toast 相关渲染由 `toast !== null || onShowToast` 的存在性决定**不可靠** ⇒ 把 toast 相关 JSX 从单卡里**拿回容器**（`SessionScreenCards`），单卡只负责「卡的内容」）。
  > ⇒ **Step 1 的硬要求**：`SessionScreenCard` 的职责边界 = **卡内容**（时间码/标题/正文/标签/配图），**toast 与框选一律在容器里**；T3 抽件时若已把 toast 抽进单卡 ⇒ **本任务先把它移回容器**（列为 T9 的第 1 步，且必须重跑 T3 的 S1–S4 判据确认仍绿）。
- [ ] **Step 2: 判据 + 变异体**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| C1 | **卡片数 = `screens.length`**（`[data-card-flow-item]` 计数） | 少一张 ⇒ 红 |
| C2 | **复用证明**：把 `SessionScreenCard` mock 成 `data-testid="screen-card"` ⇒ 卡片流渲染的**恰是它**（`getAllByTestId("screen-card").length === screens.length`） | 自己写一份卡渲染（不 import 单卡）⇒ 红 |
| C3 | **零框选/零 toast**：整块 **0 个** `[data-testid*="toast"]` / 0 个 `BoxSelectOverlay` 痕迹（断言不渲染 `data-box-select` 之类） | 把框选搬进来 ⇒ 红 |
| C4 | **不 invoke 且不带 Tauri**（同 T7 的 T4 形态） | 直接 `convertFileSrc` ⇒ 红 |
| C5 | 高密度差异可断言：卡片流**不渲染**结构徽标（`data-screen-structure` 之类 0 命中），而 `SessionScreenCards`（T3 的容器）**仍渲染**（**跨文件对拍**，证明两者不是同一形态的两份拷贝） | 让两者渲染相同的 DOM 形状 ⇒ 红 |

**Verification**：同 T7 形态（V1 五条全绿 + 5/5 变异红；V2 行数 ≤200；V3 五类棘轮全绿；V4 **T3 的 S1–S4 仍全绿**；V5 eager 89/4 Δ=0）。

**依赖**：T3、T6。**可并行**：T7、T8、T12。

---

### Task 10: 会话接线 —— `SessionViewHost` 接注册表 + 视图记忆 + **默认视图常驻** + 惰性挂载 + web 早退 + C11 槽位 + C5 的 `:64` 改判

> **为什么是收口点**：C1 的四条硬要求、§7.3 的前两条硬约束、C5 的键口径与**显式改判**、C11 的槽位全在这里落地。**它必须等 T2（拆出宿主）、T5（原语）、T6（注册表/记忆）、T7–T9（三个视图）全部提交后才能开工。**

**Files:**
- Modify：`app/src/components/session-detail/SessionViewHost.tsx`（**过渡形态 → 注册表驱动**，**≤180 行**）· `app/src/components/SessionDetailPanel.tsx`（把 `viewMode` state 换成记忆 hook + 传 `views`/`slot`，**≤160 行**）· `app/src/pages/SessionsPage.tsx`（**332 → ≤345**：`import { viewsFor } from "../views/registry"` + 一处 `views={viewsFor("session")}`；**它已在 301–600 档登记 ⇒ 不新增豁免条目**，只登记行数变化）
- Create：`app/src/components/session-detail/SessionViewHost.test.tsx`（**≤280 行**，jsdom）

**Interfaces:**
- Consumes：`views/registry.ts` 的 `viewsFor("session")` / `SessionViewSlot` / `ViewSpec` · `views/useViewMemory.ts` 的 `useViewMemory` · `ui/primitives` 的 `ViewSwitcher` / `StatusLine` · `shell/ShellFallback` 的 `ShellFallback` · `SessionRawView`（T2）· `NotePreviewView`（经 `load` 惰性）
- Produces：`SessionViewHost` 的最终 props：
  ```ts
  interface Props {
    readonly views: readonly ViewSpec<SessionViewSlot>[];   // 由 SessionsPage 经面板注入（C1①）
    readonly slot: SessionViewSlot;                          // 注入给非默认视图
    readonly resident: ReactNode;                            // **默认视图**的同步元素（原文；常驻，不经 React.lazy）
    readonly objectType: "session";                          // 视图记忆的键口径（C5）
    readonly errorSlot?: ReactNode;                          // C11 预留槽
  }
  ```
- **行为契约（逐条对应裁决）**：
  1. `const [viewKey, setViewKey] = useViewMemory("session", views[0].key, keys)`；
  2. 渲染 `<ViewSwitcher options={views} value={viewKey} onChange={setViewKey} ariaLabel="会话视图" testId="session-view-switcher" />`；
  3. **紧跟其下一行固定错误区槽位** `<div className="ed-view-error-slot" data-view-error-slot="" />`（C11：**只预留结构与样式钩子**，批 5 不加 CSS 规则、**不重排**既有 `StatusLine` 调用点）；
  4. **默认视图常驻**：`<div style={{ display: viewKey === views[0].key ? undefined : "none" }}>{resident}</div>` —— **默认视图永远在 DOM 里**（§7.3① 的修回点：切到任何视图后原文 DOM 仍可达、挂载数不减）；
  5. **非默认视图模块级惰性**：只在 `viewKey !== views[0].key` 时渲染 `<Suspense fallback={<ShellFallback />}>{createElement(LazyOf(viewKey), slot)}</Suspense>`；切走 ⇒ 卸载（§7.3②）；
  6. `lazy` 映射用 `useMemo(() => new Map(views.map(v => [v.key, v.load ? lazy(v.load) : null])), [views])`（**默认视图的 `load` 缺省 ⇒ 不进这个表**）。
- **C5 的显式改判（必须逐字落进代码注释）**：`SessionDetailPanel.tsx:63-64` 的
  `// v0.5.0 M7：会话切换回到原料视图（裁决 D1：viewMode 状态留面板；数据面重置见 useSessionDetailData）`
  `useEffect(() => { setViewMode("raw"); }, [sessionId]);`
  ⇒ **改成「仅在该 `objectType` 没有记忆时复位」**：视图态迁移到 `useViewMemory` 后，该 effect **整条删除**（记忆 hook 的惰性初始化 + `validKeys` 校验已覆盖「无记忆 ⇒ 默认 `raw`」）；注释改为逐字：「批 5 C5：**显式改判**旧「裁决 D1」——视图态改由 `view:default:session` 记忆持有；**有记忆 ⇒ 用记忆值**（切会话不再静默丢弃用户选择）。**旧的「裁决 D1」在视图记忆范围内作废**（其余部分不受影响），见 v0.22「过程中纠正的计划错误」段。」**T18 必须把这条写进 `docs/versions/v0.22.md`。**
- **web 会话保持早退**（C5）：`detail.session.kind === "web"` 分支**一字不动**（不渲染切换器 ⇒ **不写记忆 ⇒ 污染面为 0**）；接线后**必须在测试里断言 web 会话下 `ViewSwitcher` 0 个**。
- **既有「笔记预览」视图**（R-1）：`preview` 进注册表且带 `load` ⇒ **它从页 chunk 迁出、成为独立懒 chunk**；报告必须给「页 chunk 变小 / 总懒字节基本不变」的机理读数。

- [ ] **Step 1: 重写 `SessionViewHost.tsx` 为注册表驱动**（保留 T2 的 DOM 顺序：切换器行 → `SessionRefineSection` → 槽位 → 视图区）
- [ ] **Step 2: 改 `SessionDetailPanel.tsx`**（删 `viewMode` state 与 `:64` effect；把 `views`/`slot`/`resident` 传进宿主；`useSessionDetailData({ detail, viewMode, … })` 的 `viewMode` 入参改传 `viewKey === "raw" ? "raw" : "preview"`？ **不许猜**：该 hook 的 `viewMode` 只用于「进入原料视图懒触发 `auto_refine_session`」的判定 ⇒ **保留语义**：传 `viewKey === views[0].key ? "raw" : "preview"`，并在报告里逐字说明这处映射的理由与等价性）
- [ ] **Step 3: `SessionsPage.tsx` 注入 `views={viewsFor("session")}`**（+ import 1 行 + prop 1 行；登记行数变化）
- [ ] **Step 4: 判据 + 变异体（**本批最关键的六条**）**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| H1 | **默认视图常驻（§7.3①）**：初始渲染 ⇒ 原文内容在 DOM（`getByTestId("session-raw-view")` 非空）；切到**每一个**非默认视图 ⇒ 该节点**仍在 DOM**（`queryByTestId` 非 null），且**挂载计数不减**（测试用探针：包一层计数组件或用 `useEffect` 计数桩） | 把默认视图也做成惰性/条件渲染 ⇒ 红 |
| H2 | **非默认视图惰性挂载 + 卸载（§7.3②）**：切到 `tritrack` ⇒ 目标视图挂载（`await findByTestId("session-tritrack-view")`）；切回 `raw` ⇒ 目标视图**不在 DOM** | 用 `display:none` 常驻所有视图 ⇒ 红 |
| H3 | **`Suspense` 边界在位**：懒 chunk 未解析时渲染 `ShellFallback`（`data-testid="shell-fallback"`）——用一个**永不 resolve** 的 `load` 桩注入 `views` 断言 | 删 `<Suspense>` ⇒ React 抛错（红） |
| H4 | **视图记忆（C5）**：切到 `proof` ⇒ `localStorage["view:default:session"] === "proof"`；**卸载重挂 ⇒ 恢复 `proof`**；**切会话（新 `detail.session.id`）⇒ 仍是 `proof`**（有记忆不复位） | 恢复 `:64` 的 `setViewMode("raw")` ⇒ 红；把键写成不带 objectType ⇒ 红 |
| H5 | **web 早退不写记忆（C5）**：`kind === "web"` ⇒ 切换器 0 个 ∧ `localStorage` 无 `view:default:session` | 在 web 分支渲染切换器 ⇒ 红 |
| H6 | **C11 槽位在位且为空**：`[data-view-error-slot]` 恰 1 个、`textContent === ""`，且位置在**切换器之后**（`compareDocumentPosition`） | 删槽位 ⇒ 红；把槽位放到切换器之前 ⇒ 红 |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/session-detail/SessionViewHost.test.tsx src/components/SessionDetailPanel.test.tsx` | H1–H6 + T2 的 P1–P4 **全绿**（**P2 需按新的常驻语义改写吗？—— 不许改**：T2 的 P2 断言「preview 时原文区不再**可见**」在常驻形态下仍成立（`display:none` 的父节点让内容不可见）⇒ **P2 必须原样绿**；若它红 ⇒ 说明常驻实现方式选错了，**修实现不修判据**） |
| V2 | 6 个变异体（每变异新树 + CONTROL + `ran=true`） | 6/6 如期红；另加 1 条反例守卫（`views` 数组顺序不变时行为不变 ⇒ 绿） |
| V3 | 行数脚本 | `SessionViewHost.tsx` ≤180 · `SessionDetailPanel.tsx` ≤160 · `SessionsPage.tsx` ≤345（**已在豁免表内，不新增条目**） |
| V4 | `node scripts/line-limits.mjs --full` | exit 0 · **0/122/122** |
| V5 | **真实构建**（取锁） | `check-bundle-budget` **exit 0**；**首屏 Δ 与机理**（期望 Δ=0：视图组件只被懒页 `import()` 可达；`ViewSwitcher` 的字节已在 T5 计入）；**懒 chunk 台账**（R-1）：`preview` 迁出后页 chunk 变小、**总懒字节基本不变**；逐 chunk 归属（本任务新增 `preview` chunk） |
| V6 | `node scripts/bundle-eager-graph.mjs` + TS-API 口径 | 首屏**双口径**读数；**新进首屏集合逐条具名**（期望 = `[]`） |
| V7 | `cd app; npx vitest run` | 166 文件 / 1608+N 用例 / 0 失败；**LOST=0 SHRUNK=0** |
| V8 | 五类棘轮 + `zIndex.guard` + `e.test.ts`/`buttonMigration.test.ts` | 全绿（后者证明 C7 的守卫一字未动） |

**依赖**：T2 · T5 · T6 · T7 · T8 · T9。**串行**：独占 `SessionDetailPanel.tsx` / `SessionsPage.tsx`（前者与 T2 串行，后者与 T16 串行）。

---

### Task 11: 杂项 A —— `SessionDetailHeader` 行为判据 + **粘性头**（C13）

> **为什么单独一个任务**：C13 逐字「批 5 做 `SessionDetailHeader.tsx`（161 行）的**粘性头**（sticky + `top` 值来自 token）；**先补 1 条行为级判据**（该文件无同名测试），判据形态 = 静态结构级（`position: sticky` ∧ `top` 来自 token）—— **jsdom 测不出真实粘性**，这一点必须写进「未验证」」。

**Files:**
- Create：`app/src/components/session-detail/SessionDetailHeader.test.tsx`（**≤220 行**，jsdom）
- Modify：`app/src/components/session-detail/SessionDetailHeader.tsx`（**161 → ≤180**：只加样式对象与一行注释，**不加逻辑**）

**Interfaces:**
- Consumes：`ui/primitives` 的 `Button` · `ui/zIndex` 的 `zIndex` · `types/session` 的 `SessionDetail`
- Produces：不改 props（**6 个字段一字不动**）；`data-testid` 两个锚点（`session-title-input` / `session-rename-open`）**一字不改**（文件头 `:11-12` 的契约逐字保留）

- [ ] **Step 1: 先补行为级判据（提交里与改动同批，但判据先写、先绿）**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| D1 | **行为级（先补）**：渲染 fixture ⇒ 标题文本在位；点 `session-rename-open` ⇒ 出现 `session-title-input`；`Escape` ⇒ 取消改名（输入框消失）；`update_session_title` 的 `invoke` 实参与**调用时机**不变（用 mock 记录） | 删 `cancelRename` ⇒ 红 |
| D2 | **静态结构级（C13）**：`getByTestId("session-header").getAttribute("style")` 里 `position: sticky` ∧ `top` 值形如 `var(--ed-…)` **（不许是裸数字）** | 把 `top` 写成 `"0"` / 写成裸像素 ⇒ 红 |
| D3 | **层级走标尺**：`zIndex` 来自 `zIndex("raised")`（段上的 `style.zIndex === String(zIndex("raised"))`） | 写裸 `zIndex: 10` ⇒ 红（`zIndex.guard` 第二个仪器同时红） |

- [ ] **Step 2: 落样式（**只加**这三个属性 + 注释）**

- `position: "sticky"` · `top: "var(--ed-space-4, 4px)"`（**token 来源**：`ui/tokens.css:--ed-space-4: 4px`；**理由**：右栏滚动容器 `SessionsPage.tsx:306` 自带 `padding:16`，粘性头贴住容器顶需要一点余量；**不新增 token**）· `zIndex: zIndex("raised")`（`ui/zIndex.ts` 的档位注释逐字就是「**吸顶头** / 粘性列头 / 粘性工具栏」）· `background: "var(--ed-bg-canvas)"`（防正文透出）；
- **改文件头 `:12` 的注释**（它今天逐字写「本组件不含 `position:sticky`（粘性头未实现，勿顺手加）」）⇒ 改为逐字：「批 5 C13：本组件**已**是粘性头（`position: sticky` + `top: var(--ed-space-4, 4px)` + `zIndex("raised")`）；**祖先链必须无 `overflow: hidden`**（实测滚动容器 = `SessionsPage.tsx:306` 的 `overflowY:auto`，中间无溢出层）」；
- **祖先链核验（必须做，写进报告）**：`SessionDetailHeader` ← `SessionDetailPanel` ← `SessionsPage.tsx:306`（`overflowY:auto`）← `:277`（无 overflow）← `App.tsx:159`（`overflow:hidden`，**在滚动容器之上，不影响**）⇒ **可粘**。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/session-detail/SessionDetailHeader.test.tsx` | D1–D3 全绿；3/3 各带变异体如期红 |
| V2 | `git diff --numstat -- app/src/components/session-detail/SessionDetailHeader.tsx` + 逐字 diff | 改动只含：① 3 个样式属性 ② 文件头注释 ③ 1 个 import（`zIndex`）—— **`invoke` 调用点与时机零 diff** |
| V3 | 行数脚本 + `line-limits --full` | ≤180 · exit 0 · 0/122/122 |
| V4 | `cd app; npx vitest run` | 166 文件 / 1608+N / 0 失败；LOST=0 SHRUNK=0 |
| V5 | 五类棘轮 | 全绿（`SessionDetailHeader.tsx` 在域内 ⇒ 不许新增裸 `<button>`/裸色值） |
| V6 | **未验证（必须写进报告）** | 「真实粘性」**jsdom 测不出**（不排版）；`top` 的 4px 观感、滚动时的背景遮挡、与 `SessionRefineSection` 的行内相对序 **全部归批 8 的像素探针** |

**依赖**：T2（它已把 header 调用点定形）。**可并行**：T10、T12（文件不相交）。

---

### Task 12: 笔记视图 A —— `NoteMarkdown` 的**只追加**槽 + `noteCardModel`（结构派生器）+ `NoteCardFlowView`（C8）

> **为什么这样切**：C8 逐字「笔记卡片流的派生器 **不得手写 markdown 解析器** —— 必须复用既有 `react-markdown` 栈（自定义组件映射产出卡片结构），并在文件头显式命名「**结构派生器，批 7 归一**」；判据 = 全站 `react-markdown` import 数**不增加**（今天 2 处）」。**实测**：`NoteMarkdown` 的 props 只有 5 个字段、插件链硬编码 ⇒ 卡片流要复用这套栈，**唯一通道**是给 `NoteMarkdown` 加一个**只追加**的槽。

**Files:**
- Create：`app/src/views/note/noteCardModel.ts`（**≤150 行**）· `app/src/views/note/NoteCardFlowView.tsx`（**≤180 行**）
- 测试：`app/src/views/note/noteViews.test.tsx`（**≤300 行**，jsdom；本任务加 `describe("noteCardModel")` 与 `describe("NoteCardFlowView")`）
- Modify：`app/src/components/NoteMarkdown.tsx`（**244 → ≤270**：① `export type RemarkPlugin = NonNullable<Options["remarkPlugins"]>[number];` ② props 加 **一个** `remarkPluginsExtra?: readonly RemarkPlugin[]` ③ 插件数组改为 `[…既有 4 个, ...(remarkPluginsExtra ?? [])]`）

**Interfaces:**
- Consumes：`utils/remarkMarkHighlight.ts` 的**形态先例**（自声明最小节点形状 + `data.hProperties.className`；`:25` 逐字「hName/hProperties 是 mdast-util-to-hast 应用 data 的通道」）· `ui/primitives` 的 `Surface` 类名族（`Surface.css`）
- Produces：
  ```ts
  // noteCardModel.ts —— 文件头第一行逐字：「结构派生器，批 7 归一」
  export type CardKind = "heading" | "para" | "list" | "quote" | "code" | "table" | "rule" | "media" | "other";
  export function cardKindOf(tag: string): CardKind;                  // 纯函数（AAA 可单测）
  export const CARD_SURFACE_CLASSES: readonly string[];               // ["ed-surface","ed-surface--bordered","ed-surface--surface","ed-surface--r-panel","ed-surface--padded"]
  export const noteCardPlugin: RemarkPlugin;                          // 只改**顶层** children 的 data.hProperties（hName 不动）
  ```
  - **实现要点**：插件只遍历 `tree.children`（**顶层**）⇒ 不给嵌套的 `p`/`ul` 加类（避免「卡中卡」）；每个顶层块 ⇒ `data.hProperties.className = [...CARD_SURFACE_CLASSES, ...(原 className ?? [])]`，并加 `data-card-kind`；
  - **类型来源**：`import type { RemarkPlugin } from "../../components/NoteMarkdown";` ⇒ **`views/**` 里 0 个 `react-markdown` import（连类型也不 import）**；
- Produces（`NoteCardFlowView`）：`export default function NoteCardFlowView({ note, onTaskToggle, onOpenSession, onImageOpen }: NoteViewSlot)` —— 渲染 `<div data-testid="note-card-flow" style={{display:"flex",flexDirection:"column",gap:"var(--ed-space-8,8px)"}}><NoteMarkdown note={note} searchQuery="" onTaskToggle={onTaskToggle} onOpenSession={onOpenSession} onImageOpen={onImageOpen} remarkPluginsExtra={[noteCardPlugin]} /></div>`
  - **零新 CSS 文件**（卡片样式复用 `ed-surface` 类族 ⇒ 不发散设计体系、不新增被守卫扫描的 CSS）；**零 `@tauri-apps`**、**零 `invoke`**。

- [ ] **Step 1: `NoteMarkdown.tsx` 的只追加槽（**不许**改既有插件链/组件映射/5 个既有 prop）**

- 新 prop 的 `@ai-context` 必须写清「**只许追加、不许替换**；唯一消费者是卡片流（C8）；替换式覆盖会同时动 GFM/数学/高亮三条既有语义 ⇒ 禁止」；
- 既有 6 条判据（`NoteMarkdown.test.tsx`）**必须原样绿**（不传新 prop ⇒ DOM 与今天逐字相同）。

- [ ] **Step 2: `noteCardModel.ts` + `NoteCardFlowView.tsx`**
- [ ] **Step 3: 判据 + 变异体**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| N1 | **卡片数 = 顶层块数**：fixture markdown（`## 标题` + 2 段 + 1 列表 + 1 代码块）⇒ `container.querySelectorAll("[data-card-kind]").length === 5` | 漏掉一个 `tag` 映射 ⇒ 红 |
| N2 | **嵌套不加类**：fixture 含 `> 引用` 内的段落 ⇒ 引用块内的 `<p>` **不带** `data-card-kind`（顶层才带） | 改成递归遍历所有节点 ⇒ 红 |
| N3 | **卡片类走 Surface 族**：每个卡片节点 `classList` 含 `ed-surface` 与 `ed-surface--bordered` | 只加 `data-card-kind` 不加类 ⇒ 红 |
| N4 | **`cardKindOf` 纯函数**：`cardKindOf("h2") === "heading"`、`"ul"→"list"`、`"pre"→"code"`、未知 tag ⇒ `"other"`（4 条断言） | 返回常量 ⇒ 红 |
| N5 | **C8 的防第 4 套解析器**：全站 `react-markdown` 运行时站点 **== 2**（`views/**` 内**含 type 也 0**）；`remark-*`/`rehype-*` 站点数不变 | 让 `NoteCardFlowView` 自己 `import ReactMarkdown` ⇒ 红 |
| N6 | **不改既有语义**：不传 `remarkPluginsExtra` ⇒ `NoteMarkdown` 的 DOM 与今天逐字相同（`NoteMarkdown.test.tsx` 6 条原样绿） | 把新槽做成「替换插件链」⇒ 既有 6 条红 |
| N7 | **不 invoke 且不带 Tauri**（同 T7 的 T4 形态） | 视图里直接 `invoke` ⇒ 红 |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/views/note/ src/components/NoteMarkdown.test.tsx` | N1–N7 全绿 + `NoteMarkdown` 既有 **6 用例**全绿；7/7 变异如期红 |
| V2 | 行数脚本 | `NoteMarkdown.tsx` **≤270** · `noteCardModel.ts` **≤150** · `NoteCardFlowView.tsx` **≤180** · 两个测试 ≤300 |
| V3 | `git diff --numstat -- app/src/components/NoteMarkdown.tsx` | **删除行数 = 0**（只追加 ⇒ 证明没动既有语义） |
| V4 | 五类棘轮 + `zIndex.guard` + `nativeButton.ratchet` | 全绿（**新增的 markdown 派生不得引入裸 `<button>`/裸色值/裸圆角**） |
| V5 | `cd app; npx vitest run` | 166 文件 / 1608+N / 0 失败；LOST=0 SHRUNK=0 |
| V6 | `node scripts/bundle-eager-graph.mjs` + TS-API | 双口径；**新进首屏集合 = []**（`views/**` 仍只被懒页可达） |

**依赖**：T6。**可并行**：T7–T11。**写者窗口**：`NoteMarkdown.tsx` 本任务独占。

---

### Task 13: 笔记视图 B —— `NoteEvidenceTrackView`（**条件项**；V5 的探针读数驱动）

> **为什么是条件项**：C2 逐字「笔记「带证据三轨」**先做一个只读数据可行性探针**……**存在 ⇒ 交付 3 视图；不存在 ⇒ 交付 2 视图（原文 + 卡片流）+ 就地加注规格 §7.2 与 §11-6 + 登记批 7**。**不许**做空壳视图」。

**Files（**仅当 T1 的 C2 探针结论为「存在逐段级证据读取路径」**）：**
- Create：`app/src/views/note/NoteEvidenceTrackView.tsx`（**≤280 行**）
- 测试：追加 `describe("NoteEvidenceTrackView")` 到 `app/src/views/note/noteViews.test.tsx`（**≤300 行**，jsdom）
- Modify：`app/src/views/registry.ts`（把 `evidence` spec 加进 `FROZEN_VIEW_KEYS.note` —— **同时改冻结表与实现**，G1/G3 双向钉住）

**Files（**结论为「不存在」时**）：**
- **零代码**：本任务改为**登记提交**（`docs(plan)`/零 `app/src` 改动），把探针读数与「去向 = 批 7」写进 `task-13-report.md`，并**留给 T18** 做规格 §7.2/§11-6 的就地加注。

**Interfaces（存在时）：**
- Consumes：`NoteViewSlot` 的 `note`（+ 探针点名的**逐段级关联**读取路径；**若它是一条新 invoke ⇒ 本任务 STOP**：规格 §3 红线 6「后端数据模型零改动」+ 本批无新增例外 ⇒ **只能消费既有读取路径**）
- Produces：`export default function NoteEvidenceTrackView(props: NoteViewSlot)` —— 渲染「笔记段落 × 来源证据」两列；**无证据的段落必须显式标记**（C2/decisions 逐字「无证据的段落 ⇒ 明确的『无证据』标记（**不是静默省略**）」）

- [ ] **Step 1: 若「存在」⇒ 判据 + 变异体**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| E1 | **段落数 = 派生段落数**（fixture 已知），且每段有 `data-evidence-for={段落序号}` | 漏一段 ⇒ 红 |
| E2 | **配对关系可断言**：有证据的段落其证据节点 `data-evidence-id` 与 fixture 的关联 id 逐字一致 | 把证据渲染成与段落无关的列表 ⇒ 红 |
| E3 | **无证据段落显式标记**：无证据段落渲染「无证据」标记节点（**0 个静默省略**） | 跳过无证据段落 ⇒ 红 |
| E4 | **不 invoke 且不带 Tauri**（同 T7 的 T4 形态） | 视图里直接取数 ⇒ 红 |
| E5 | **不改冻结表的手工放宽**：`FROZEN_VIEW_KEYS.note` 与 `viewsFor("note")` 双向相等 + 每个 `load` 解析到真实模块（G1/G3 的复用） | 只在冻结表里加 key 而实现不加 ⇒ 红 |

**Verification**：同 T7 形态（判据全绿 + 5/5 变异红；行数 ≤280；五类棘轮全绿；全量 vitest `LOST=0 SHRUNK=0`；eager 双口径 Δ 与机理）。
**「不存在」时**：V1 = `git show --stat HEAD` **不含 `app/src/**`**；V2 = 报告内含探针读数（命令 + 原始输出）+ 「去向 = 批 7」+ 「规格 §7.2/§11-6 的加注待 T18 落笔」两条。

**依赖**：T1 · T6 · T12。**可并行**：与 T10/T11。

---

### Task 14: 笔记接线 —— `NotesReadingColumn` 变视图宿主 + **`flushSave` 阻断 + 就近 `StatusLine`**（C4/C7）+ C11 槽位

> **为什么它是本批最有价值的判据所在**：C4 逐字「调用方 `try { await flushSave() } catch { 阻断 }`；`catch` ⇒ **不切视图 + 保持编辑态 + 在 `ViewSwitcher` 旁渲染一行 `StatusLine kind="error"`**（**不用 toast**）。**不改 `NoteEditHandle` 接口**」+ C7 逐字「编辑态提示落**宿主层**（`NoteReadingView.tsx` 340 行 / `NotesReadingColumn.tsx` 166 行，**都不在名单内**）」。

**Files:**
- Modify：`app/src/components/notes/NotesReadingColumn.tsx`（**166 → ≤260**：加 `views` prop、记忆 hook、守卫、`ViewSwitcher`、就近 `StatusLine`、C11 槽位、惰性宿主；**顶层 div 的 `flex:1; minWidth:0; display:flex; overflow:hidden` 一字不改**，新增的列包装放在它**内部**）
- Create：`app/src/components/notes/NotesReadingColumn.views.test.tsx`（**≤300 行**，jsdom）
- Modify（**只增不减**）：`app/src/pages/NotesPage.tsx`（把 `views={viewsFor("note")}` 传下去；**T4 已拆出余量**）

**Interfaces:**
- Consumes：`views/registry.ts`（`viewsFor("note")` / `NoteViewSlot`）· `views/useViewMemory.ts` · `ui/primitives` 的 `ViewSwitcher` / `StatusLine` / `Text` · `shell/ShellFallback` · `NoteEditHandle.flushSave`（**经既有 `editorRef` prop，不改接口**）
- Produces（新增 props 2 个，其余 21 个字段一字不动）：
  ```ts
  readonly views: readonly ViewSpec<NoteViewSlot>[];   // 由 NotesPage 注入（C1①）
  // 复用的既有 prop：selected / editing / setEditing / editorRef / …
  ```
- **行为契约**：
  1. `const keys = views.map(v => v.key)`；`const [viewKey, setViewKey] = useViewMemory("note", views[0].key, keys)`；
  2. `const [viewError, setViewError] = useState<string | null>(null)`；`const [pending, setPending] = useState(false)`；
  3. **切换守卫（C4 的 (b)）**：
     ```ts
     const changeView = async (key: string) => {
       if (key === viewKey) return;
       setPending(true); setViewError(null);
       try { await editorRef.current?.flushSave?.(); }        // 非编辑态 ⇒ undefined ⇒ 直接通过
       catch (e) { setViewError(`保存失败，未切换视图：${e}`); setPending(false); return; }  // 阻断：不切 + 保持编辑态
       setViewKey(key); setPending(false);
     };
     ```
  4. `<ViewSwitcher options={views} value={viewKey} onChange={changeView} ariaLabel="笔记视图" disabled={pending} testId="note-view-switcher" />`；
  5. **紧邻切换器**：`{viewError && <StatusLine kind="error" testId="note-view-error">{viewError}</StatusLine>}`（**就近、`role="alert"`、可测**）；
  6. **其下方固定 C11 槽位**：`<div className="ed-view-error-slot" data-view-error-slot="" />`；
  7. **默认视图常驻**：`<div style={{ display: viewKey === views[0].key ? undefined : "none" }}>{/* 现有 NoteReadingView 装配 */}</div>` —— **`NoteReadingView` 的 19 个 props 与插槽构造一字不改**；
  8. **非默认视图惰性**：`<Suspense fallback={<ShellFallback />}>{createElement(lazy, slot)}</Suspense>`，`slot` = `{ note: selected, onTaskToggle, onOpenSession, onImageOpen }`；
  9. **空态分支（`selected === null`）**：`Text` 空态**保持原样**，切换器**不渲染**（无对象 ⇒ 无视图，故**不写记忆**）。
- **不改的东西（必须在报告里逐条点名「零 diff」）**：`NoteEditHandle` 接口 · `useNotesPageEditing.ts` 的 ESC 路径语义（`catch { /* 保存失败不阻断退出 */ }` 逐字保留）· `RichEditorView` / `NoteEditView`（`NON_MIGRATED_14`，**零改动**）· `NoteReadingView.tsx`（**零改动**：错误行落在宿主层，不落它）。
- **显式登记未做（C4 硬要求②）**：`RichEditorView` 的 Ctrl+E / 完成按钮路径**仍不阻断**（今天就是 fire-and-forget，**不是本批引入的回归**）；`flushSave` 返回类型升级（`Promise<void>` → `Promise<boolean>`）**登记批 8 的接口卫生 follow-up**。

- [ ] **Step 1: 改 `NotesReadingColumn.tsx`**（按上列 9 条）
- [ ] **Step 2: `NotesPage.tsx` 传 `views`**（+1 import +1 prop）
- [ ] **Step 3: 判据 + 变异体（**本批的核心判据**）**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| F1 | **阻断（§7.3③ 的判据，C4 逐字）**：注入一个 `flushSave` **reject** 的 `editorRef` ⇒ ① `ViewSwitcher` 的 `value`（`aria-pressed` 为真的那个）**未变** ② 目标视图**未挂载** ③ `role="alert"` 错误行渲染 | 把 `catch` 分支改成继续切换 ⇒ 红（**这是「能红」的主证**） |
| F2 | **正向**：`flushSave` resolve ⇒ 切换发生 + 目标视图挂载 + **无**错误行 | 无条件 `return` ⇒ 红 |
| F3 | **非编辑态直通**：`editorRef.current === null` ⇒ 切换**不被阻塞**（`await undefined` 直接通过） | 加「必须有 editorRef 才允许切」的门 ⇒ 红 |
| F4 | **提示不用 toast**：全过程 **0 个 toast 节点**（`data-testid*="toast"` 0 命中） | 改用 `useTransientToast` ⇒ 红（C4 明确拒绝 toast） |
| F5 | **原文常驻（§7.3①）**：切到 `cardflow` ⇒ `NoteReadingView` 的内容仍在 DOM（`queryByText(正文片段)` 非 null）+ 挂载计数不减 | 条件渲染替换 ⇒ 红 |
| F6 | **惰性 + 卸载（§7.3②）**：切到 `cardflow` ⇒ 其挂载；切回 ⇒ 其**不在 DOM** | `display:none` 常驻 ⇒ 红 |
| F7 | **C11 槽位**：`[data-view-error-slot]` 恰 1 个、空、位置**在切换器之后** | 删/移位 ⇒ 红 |
| F8 | **空态不写记忆**：`selected === null` ⇒ 切换器 0 个 ∧ `localStorage` 无 `view:default:note` | 空态也渲染切换器 ⇒ 红 |
| F9 | **既有断言不改**：`NotesPage.test.tsx`(2) · `RichEditorView.test.tsx`(16) · `RichEditorView.fallback.test.tsx`(1) · `NotesReadingColumn.outline.test.tsx`(6) **原样全绿** | 改任一条 ⇒ 红（**若红 ⇒ STOP，不许改判据**） |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/notes/NotesReadingColumn.views.test.tsx src/components/notes/NotesReadingColumn.outline.test.tsx src/pages/NotesPage.test.tsx src/components/RichEditorView.test.tsx src/components/RichEditorView.fallback.test.tsx` | F1–F9 全绿；9/9 变异如期红 + 1 条反例守卫（改文案缩进 ⇒ 绿） |
| V2 | `git diff --numstat` 逐文件 | `useNotesPageEditing.ts` / `NoteEditView.tsx` / `RichEditorView.tsx` / `NoteReadingView.tsx` **不在提交路径里**（**C7 的机器形态**）；`dialogMigration.e.test.ts` 与 `buttonMigration.test.ts` **零 diff 且绿** |
| V3 | 行数脚本 + `line-limits --full` | `NotesReadingColumn.tsx` **≤260** · `NotesPage.tsx` **≤300**（T4 拆后 + 本次接线）· exit 0 · **0/122/122** |
| V4 | `cd app; npx vitest run` | 166 文件 / 1608+N / 0 失败；**LOST=0 SHRUNK=0** |
| V5 | **真实构建**（取锁） | `check-bundle-budget` exit 0 · 首屏 Δ 与机理（期望 Δ=0）· 懒 chunk 台账 +1（笔记卡片流；若 T13 交付则 +2） |
| V6 | `node scripts/bundle-eager-graph.mjs` + TS-API | 双口径；**新进首屏集合 = []** |
| V7 | 五类棘轮 | 全绿 |
| V8 | **未验证（必须写进报告）** | 真实「切视图卡顿」· 视图密度观感 · `scrollTop` 恢复 · 真机 —— **全部只能登记**（C15） |

**依赖**：T4 · T5 · T6 · T12 · T13。**串行**：独占 `NotesReadingColumn.tsx`；`NotesPage.tsx` 与 T16 串行。

---

### Task 15: 三条硬约束 + 依赖方向的**架构守卫**（`views/architecture.guard.test.ts`；C1① + C14②）

> **为什么要一个专属守卫**：C1① 逐字要求「`views/registry.ts` **只许被 `SessionsPage.tsx` / `NotesPage.tsx` import**（**写成判据**：`views/**` 不进 eager 集、`App.tsx`/`shell/**` 不得 import 它）」；C14② 逐字要求「每个视图组件的**第一条判据**是「**不 invoke**」（注入 spy 断言 `invoke` 零调用，§7.1 的依赖方向是本批**唯一可机器验证的架构约束**）」。**图级判据必须比单点 spy 更强**：本任务把「依赖方向」变成**整目录级**的机器判据。

**Files:**
- Create：`app/src/views/architecture.guard.test.ts`（**≤300 行**，node 环境；**只读源码**，与 `dialogMigration.e.test.ts` 同族）

**Interfaces:**
- Consumes：`node:fs` 的递归遍历（`app/src/views/**`）· `scripts/bundle-eager-graph.mjs --json`（**运行期不调用它**：本守卫只做**源码级**判据；产物级读数归 T18）
- Produces：**五条图级判据 + 各自的正/负对照**：

| # | 判据（源码级，**先剥注释**） | 阳性对照（必须命中） | 变异体（必须红） |
|---|---|---|---|
| A1 | **`views/**` 不被任何首屏可达文件 import**：扫描 `App.tsx` + `shell/**` + `ui/primitives/**`（+ 它们的静态闭包不必展开：只需断言**这些目录里 0 处** `from "../views` / `from "./views`） | 同一支扫描器在 `pages/SessionsPage.tsx` 上**必须**命中 `from "../views/registry"` | 在 `App.tsx` 加一行 `import { viewsFor } from "./views/registry"` ⇒ 红 |
| A2 | **`views/registry.ts` 的直接导入者恰 2 个**：`pages/SessionsPage.tsx` 与 `pages/NotesPage.tsx`（全仓扫 `from "…views/registry"` ⇒ 集合恰等） | 两个页面各自命中 | 让 `SessionViewHost.tsx` 直接 import 注册表 ⇒ 红 |
| A3 | **`views/**` 零 `@tauri-apps` import**（含 `import type`）：依赖方向「视图不得直接调 Tauri 命令」的**整目录形态** | 同一支扫描器在 `components/session-detail/SessionScreenCards.tsx`（今天有 `convertFileSrc`）**必须**命中 | 在某视图里 `import { invoke } from "@tauri-apps/api/core"` ⇒ 红 |
| A4 | **默认视图不经惰性**：`registry.ts` 的 `[0]` spec **无 `load`** ∧ 其余每个都有（与 T6 的 G2 同源，此处按**源码形态**再钉一次：`load` 体内恰一个 `import(`） | `registry.ts` 命中 `load: () => import(` | 给默认 spec 加 `load` ⇒ 红 |
| A5 | **三条硬约束的可断言部分（合取）**：① 默认视图（`views[0].key`）在 `registry.ts` 里是 `raw` ② `SessionViewHost.tsx` 与 `NotesReadingColumn.tsx` 里都出现 `views[0].key` 的**常驻渲染**（`display:` 三元）③ 两个宿主里都出现 `data-view-error-slot` | 两个宿主各命中一次 | 删掉任一处常驻渲染/槽位 ⇒ 红 |

- [ ] **Step 1: 写守卫（**仪器双侧自证**：每个扫描器都要有「域内必命中」与「无意义串必 0 命中」两条自证，写在同一文件里）**
- [ ] **Step 2: 变异体（每变异新树 + CONTROL + `ran` 闸；A1–A5 各 1 个必红 + 每支扫描器各 1 个反例守卫）**

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/views/architecture.guard.test.ts` | A1–A5 全绿；**5/5 变异如期红**；**每支扫描器的双侧自证各 1 条**（域内命中 + 无意义串 0 命中）；**反例守卫**（把某个视图文件里的注释写成 `import { invoke } from "@tauri-apps/api/core"` ⇒ **必须绿**，证明剥注释生效） |
| V2 | 行数脚本 | ≤300 |
| V3 | `cd app; npx vitest run` | 166 文件 / 1608+N / 0 失败；LOST=0 SHRUNK=0 |
| V4 | 报告含「本守卫**不能**证明什么」 | 逐条：① 不能证明**运行时**不加载（那是产物级，见 T18）② 不能证明视图不通过**间接**依赖取数 ③ 不能替代每视图的 spy 判据（C14② 仍逐组件要求） |

**依赖**：T5 · T6 · T10 · T14（被判对象必须已落地）。**串行**：本任务之后才允许 T18。

---

### Task 16: `focus*` 最小收敛（C6）+ `useNotesDeepLink` 注释更正 + `App.tsx` ≤600

> **为什么必须做且必须「最小」**：C6 逐字「只给 **5 个粘滞字段**（`focusSessionId` / `focusNoteId` / `focusNoteSearch` / `focusSystemId` / `focusGroupId`）补 `onFocus*Consumed` 复位回调（照 4 个已一次性字段的既有形态），**声明形态与类型一律不动** ⇒ `CommandPalette.kb.test.tsx:173-181` 的既有断言**继续绿**」+「`useNotesDeepLink.ts:18` 的注释逐字「清空责任在 App（本页无 `onFocus*Consumed` 回调）」与 `App.tsx` 实现**不符** ⇒ **必须改正**（标签不许说谎，批 3 A5/R-3 先例）」+「`App.tsx` **584/600** ⇒ 新增行后必须 ≤600，超了就先拆（不许登记）」。

**Files:**
- Modify：`app/src/App.tsx`（**584 → ≤600**：5 处 `setFocusX(null)` 复位 + 5 个 `onFocus*Consumed` 透传）· `app/src/hooks/useNotesDeepLink.ts`（**106 → ≤120**：注释更正 + 一个新的 `onConsumed?: () => void` option，在消费成功后调用一次）· `app/src/pages/NotesPage.tsx`（+1 prop 透传）· `app/src/pages/SessionsPage.tsx`（+1 prop + 消费后 `onFocusSessionConsumed?.()` 调用；**与 T10 串行**）· `app/src/pages/KnowledgePage.tsx`（+1 prop，`focusSystemId`）
- Create：`app/src/hooks/useNotesDeepLink.test.ts`（**≤200 行**，node + 内存 `Storage`；若同名测试已存在 ⇒ **追加**）

**Interfaces:**
- Produces（**声明形态一字不动** —— 仍是 `const [focusX, setFocusX] = useState<…>(null)`）：
  - `NotesPage`：`onFocusNoteConsumed?: () => void`（**`focusNoteId` / `focusNoteSearch` / `focusGroupId` 共用一个回调**，D6(b) 逐字「可共用一个 ⇒ 实际 +1~2」）
  - `SessionsPage`：`onFocusSessionConsumed?: () => void`
  - `KnowledgePage`：`onFocusSystemConsumed?: () => void`
  - `App.tsx`：`onFocusNoteConsumed={() => { setFocusNoteId(null); setFocusNoteSearch(null); setFocusGroupId(null); }}` 等 3 组
- **保留不动**：`focusReviewGroupId` / `focusRefineTaskId` / `focusChatTaskId` / `focusChatId`（**已是一次性**，正解形态）· `createSystemSignal`（单调计数器，**设计如此**）· `focusNoteSearch` 的 `{noteId, search, key}` 载荷（收敛的**正面范式**）
- **`useNotesDeepLink.ts:18-20` 的注释改为逐字**：「边界——消费后由本 hook 调用 `onConsumed`（App 侧清空 `focusNoteId`/`focusNoteSearch`/`focusGroupId`，**批 5 C6 起本页有该回调**，故这句不再说「本页无回调」）；effect 只由 prop 值变化触发，同值重设不重跑；定时器登记入 ref 以便卸载统一清理（cleanup 读 effect 建立时的**快照**，勿改成读 `.current` 最新值）。」

- [ ] **Step 1: 接线（5 个字段，**只加复位、不改声明**）**
- [ ] **Step 2: 注释更正 + 判据 + 变异体**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| K1 | **既有断言继续绿（C6 的硬判据）**：`cd app; npx vitest run src/shell/CommandPalette.kb.test.tsx` ⇒ **17 用例全绿**，且 `git diff --numstat -- src/shell/CommandPalette.kb.test.tsx` **为空** | 把 `const [focusNoteId, set` 改成解构/改名 ⇒ 红（既有断言自己会抓） |
| K2 | **消费后归零**：`focusNoteId` 有值 ⇒ 笔记深链消费后 `onFocusNoteConsumed` **恰调用 1 次**（hook 级测试，注入 spy） | 删 `onConsumed?.()` ⇒ 红 |
| K3 | **连续两次跳同一对象都能触发**（最小收敛的收益）：同值重设 ⇒ 第二次仍消费（因为 App 已把它置 `null`） | 不清空 ⇒ 红 |
| K4 | **注释与实现一致**：`useNotesDeepLink.ts` 的 `@ai-context` 里出现 `onConsumed` 且**不再出现**「本页无 `onFocus*Consumed` 回调」 | 留着旧句 ⇒ 红 |
| K5 | **`App.tsx` ≤600** | 加行超 600 ⇒ 红（且**不许**登记） |

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/CommandPalette.kb.test.tsx src/hooks/useNotesDeepLink.test.ts src/pages/NotesPage.test.tsx` | K1–K4 全绿（**K1 的既有 17 用例一字未改且全绿**） |
| V2 | 5 个变异体 | 5/5 如期红 |
| V3 | 行数脚本 + `line-limits --full` | `App.tsx` **≤600** · 其余 ≤300 · exit 0 · **0/122/122** |
| V4 | `git diff --numstat -- app/src/shell/CommandPalette.kb.test.tsx` | **空**（既有断言零改动） |
| V5 | `cd app; npx vitest run` | 166 文件 / 1608+N / 0 失败；LOST=0 SHRUNK=0 |
| V6 | `node scripts/bundle-eager-graph.mjs` | 89 / 4（Δ=0：改的都是首屏内文件的少量行） |

**依赖**：T4 · T14（`NotesPage` 必须先拆）。**可并行**：T17。

---

### Task 17: 杂项 B —— `--ed-nav-h` 兜底绑定判据（C10#13）+ `Modal` 滚动恢复（C10#14）+ C10#11 口径入账

> **为什么这两条留在批 5**：C10 逐字「留批 5 = #2 #3 #11 #13 #14 #18」——其中 #3 已由 V1 改判转批 8；**#13 与 #14 在本任务落地**，#11 只作判据口径（R-3）。

**Files:**
- Modify：`app/src/shell/navHeight.consumption.test.ts`（**64 → ≤110**：扩域 + 新判据；**既有 3 个 `it` 一字不改**）
- Modify：`app/src/ui/primitives/Modal.tsx`（**225 → ≤260**：解锁时恢复滚动）+ `app/src/ui/primitives/Modal.css`（如需）
- 测试：**追加**到既有 `app/src/ui/primitives/Modal.scroll-lock.test.tsx`（**已存在**；追加 ≤60 行 / 3 条判据；**既有 6 用例一条不许少**）

**Interfaces:**
- Consumes：`ui/tokens.css:73` 的 `--ed-nav-h: 56px`（**token 真源**）· `ui/primitives/Toast.css:60` 的 `top: calc(var(--ed-nav-h, 56px) + 8px)`（**今天唯一在 `ui/primitives/**` 里的兜底**）
- Produces：
  - **#13 的三条判据**（写进 `navHeight.consumption.test.ts`）：① **既有**：`SHELL_FILES` 里不得出现裸 56（一字不改）② **扩域**：把 `ui/primitives/Toast.css` 加进扫描域（`REQUIRED` 命中、`FORBIDDEN` 不命中）③ **新判据（兜底绑定）**：`ui/primitives/*.css` 里每个 `var(--ed-nav-h, <N>px)` 的 `<N>` **必须等于** `ui/tokens.css` 里 `--ed-nav-h: <M>px` 的 `<M>`（**这条直接堵住 `Toast.css:56` 注释自己承认的洞**：「兜底 56px 与 `TopBar.css` 的 `var(--ed-nav-h, 56px)` 同值（两处兜底漂移不会有任何报错）」）
  - **#14**：`ui/primitives/scrollMemory.ts`？ **不新增文件**：把两个纯函数放在 `Modal.tsx` 内部（**导出给测试**：`export function saveScroll(host: { scrollTop: number }): number` / `export function restoreScroll(host: { scrollTop: number }, saved: number): void`），`Modal` 在**加锁时**记录、**解锁时**恢复。

- [ ] **Step 1: #13（判据加固；一条一行式扩域 + 一条新判据）**

| # | 判据 | 变异体（必须红） |
|---|---|---|
| J1 | 扩域后 `Toast.css` 在扫描域内且 `REQUIRED`（`--ed-nav-h`）命中 | 把 `Toast.css` 的 `var(--ed-nav-h, 56px)` 改成裸 `top: 64px` ⇒ 红 |
| J2 | **兜底绑定**：`Toast.css` 的兜底 `56` == `tokens.css` 的 `56` | 把 `Toast.css` 的兜底改成 `48px` ⇒ 红（**这条在今天是绿的、且改坏了必红** ⇒ 有牙） |
| J3 | **反空真**：扫描域非空（域内至少 1 个 `--ed-nav-h` 命中）+ 无意义串 0 命中 | 把域清空 ⇒ 红 |

- [ ] **Step 2: #14（`Modal` 滚动恢复）**

- 行为：`Modal` 打开时对 `document.body`（或实际滚动宿主）记录 `scrollTop`，关闭/解锁时恢复；
- **判据形态照 C15 的「只能登记」边界**：纯函数级判据 = 「`restoreScroll(fakeHost, 120)` ⇒ `fakeHost.scrollTop === 120`」，**不许**声称「已在浏览器验证滚动位置恢复」；
- **既有 `Modal` 判据（`Modal.test.tsx` / `Modal.scroll-lock.test.tsx`）必须原样绿**。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/navHeight.consumption.test.ts src/ui/primitives/Modal.test.tsx src/ui/primitives/Modal.scroll-lock.test.tsx` | J1–J3 + 既有 Modal 判据全绿；3/3 变异如期红 |
| V2 | `git diff --numstat -- app/src/shell/navHeight.consumption.test.ts` | **删除行数 = 0**（只加域与判据，既有 3 个 `it` 一字未改） |
| V3 | 行数脚本 + `line-limits --full` | 两个文件 ≤ 预算 · exit 0 · 0/122/122 |
| V4 | `cd app; npx vitest run` | 166 文件 / 1608+N / 0 失败；LOST=0 SHRUNK=0 |
| V5 | **C10#11 的口径入账** | 报告里写清：「本批一切首屏/可达性结论**用 TS-API 剔 `import type` 的真实边口径**；工具口径并列报告；**工具不修**」 |
| V6 | **未验证** | 真实滚动的恢复手感（jsdom 不排版）⇒ 归批 8 像素探针；`Modal` 的滚动宿主在多弹层并发时的行为未验 |

**依赖**：T0。**可并行**：T16。

---

### Task 18: 验收测量 + 收口（**只改文档；发现缺陷 ⇒ STOP 点名到任务**）

> 本任务的**逐节产出即本计划末尾的「§收口回写」八节**（照批 4 的形态：**上文一律保留不改**，本节只做终态读数与归账）。

**Files:**
- Modify：`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（**原文保留 + 就地加注**：§7.1 字段清单（C1）· §7.2 会话/笔记矩阵（S2/S5）· §7.3 三条硬约束的判据落点 · §8.6 签名动效 1（C2）· §6.2（C13/V1 的批 8 去向）· §5.1（C11 的槽位）· §11-6（V5 的 2 或 3 视图）· §12（C8 的批 7 去向））
- Modify：`docs/versions/v0.22.md`（新增「批 5（视图层）」节：交付面 · 八门禁 · 诚实代价 · **「过程中纠正的计划错误」段（C5 的 D1 改判）** · 「规格漂移纠正」段（C2 的第三轨 = OCR） · 未做与去向）
- Modify：`docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md`（**加注**：C14① 的 `ViewSwitcher` 落点 + R-2 的类名空间与诚实代价 + C4 的 flushSave 未做项）
- Modify：`docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md`（**加注**：C13 的「笔记工具栏三层合并」去向 = 批 8；`SessionDetailHeader` 粘性已做）
- Modify：本计划文件（追加 §收口回写八节）
- **不修改 `app/src/**`**（发现缺陷 ⇒ **STOP 点名到任务**，不许在收口提交里顺手改代码）

- [ ] **Step 1: 三条硬约束的终态读数**（判据表见 §三条硬约束的机器判据）
- [ ] **Step 2: 八门禁终态**（逐条命令 + exit code + 读数；vitest 给**逐文件**对拍结论；首屏给 **dist mtime + 入口 chunk 名 + 提交 sha + Δ 与机理**）
- [ ] **Step 3: C1–C15 的落点台账**（§裁决落点表的「实际结果」列）
- [ ] **Step 4: 规格加注的存在性 + 原文未删改核对**（diff 级：**删除行必须是 0**）
- [ ] **Step 5: 提交轨迹**（`git rev-list --count <第一个提交>^..HEAD` 的**含左端点**口径 + 逐提交 sha/subject/文件数）
- [ ] **Step 6: follow-ups 表**（逐条带归属：批 6 / 批 7 / 批 8）
- [ ] **Step 7: 诚实代价 + 未验证（单列）+ 与计划的偏差（自陈）**

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | §三条硬约束的机器判据 全部重跑 | 三条各自 ≥2 条判据全绿（读数逐条落表） |
| V2 | 八门禁 | 8/8 exit 0（Rust 一条如实写「未跑 + 零改动证据」）；`vitest` 逐文件 **LOST=0 SHRUNK=0**（基线 166/1608） |
| V3 | 真实构建（取锁） | 首屏 **exit 0**；**Δ 与机理**；**懒 chunk 台账逐 chunk 归属**（R-1：**实测几写几**，并写明另一值出现的条件） |
| V4 | `git show --numstat HEAD` | **只有文档路径**；**若含任何 `app/src/**` ⇒ 违规** |
| V5 | 规格 diff 级核对 | 8 处加注在位 ∧ **规格删除行 = 0** |
| V6 | 报告含「未验证」单列 | 真机/WebView2 **用户已裁决跳过** · 像素/粘性/滚动/卡顿/内存归批 8 · 逐条写清是「仪器不可达」还是「本批未做」 |

**依赖**：全部。**串行**：最后。

---

## 裁决落点表（**C1–C15 逐条 → 任务 / 判据 / 约束**；收口单元在 T18 填「实际结果」列）

> 口径：**每条裁决至少 2 条判据或 1 条判据 + 1 条只登记声明**（派发书的硬要求）。「只登记」= 明确写出「不验、不判、不许编造弱判据」的项。

| # | 裁决要点 | 任务 | 判据（编号） | 只登记 / 约束 |
|---|---|---|---|---|
| **C1** | 注册表落点 + `load` 取代 `Component`/`lazy` + `React.lazy`/`Suspense` | T6 · T10 · T15 | **G2/G3/G7**（默认无 `load`、其余有、`load` 解析真实模块、`load` 只含一个 `import(`）· **H2/H3**（惰性挂载 + 卸载、`Suspense` fallback）· **A2/A4**（唯一导入者、默认不经惰性） | ① 首屏 Δ=0 = **构造性 + 实测双证据**（T6 V3 构造成立 + T10 V5 真实构建）② 懒 chunk 台账 = **R-1**（实测几写几）③ `manualChunks` **不动**（T12 V6/T18 V3 的机理读数）④ 规格 §7.1 加注 = T18 |
| **C2** | 会话三轨 = 转写/画面/OCR；笔记先探针 | T1 · T7 · T13 · T18 | **T1 的 T1–T5**（三轨条目数/纵向顺序/空态/不 invoke/时间码）· **E1–E5**（笔记证据视图，条件项）· §12/S3 的加注存在性（T18 V5） | **NotesEvidence 的观感与真实配对语义**只登记；「不许空壳视图」= 探针为「不存在」时 T13 **零代码**（V1 断言提交不含 `app/src/**`） |
| **C3** | 抽单卡 + 前置安全网 + 锚点集合不变 + 框选留容器 + 不加剧棘轮 | T3 · T9 | **S1–S4 + 阳性对照**（V2 已批准的强化口径）· **C1/C2/C3/C5**（复用证明、零框选/零 toast、形态差异）· 五类棘轮全绿（T3 V5） | ①「`data-testid` 集合不变」在今天是**空集** ⇒ 用 id 锚点顶上并**附注**（V2 已裁）② `SessionScreenCards` 的**滚动手感**只登记 |
| **C4** | 不改接口 + 就近 `StatusLine` 阻断 + 不用 toast + 显式登记未做 | T14 | **F1**（reject ⇒ 值未变 + 目标未挂载 + `role="alert"`）· **F2/F3**（正向 + 非编辑态直通）· **F4**（0 toast）· **F9**（既有断言原样绿） | ① 登记未做：`RichEditorView` 的 Ctrl+E / 完成按钮**仍不阻断**（T14 报告逐字）② 登记未做：`flushSave` 返回类型升级 → **批 8 接口卫生**③ 错误行的**位置重排** → 批 8（C11） |
| **C5** | 键口径 `view:default:{objectType}` + web 早退 + 新建 hook + **改判旧 D1** | T6 · T10 | **M1–M5**（键形状/互不串/异常兜底/垃圾值回退/不写 `layout:`）· **H4/H5**（记记忆/切会话不复位/web 不写）· **A5②**（常驻渲染在位） | ① `:64` 的 `useEffect` **整条删除**（不是「加条件」）—— 理由与等价性写进报告 ② `objectType` **不含 `kind`** 的代价（web/photo/video 共享一份记忆）**只登记** |
| **C6** | 5 个粘滞字段最小收敛 + 注释更正 + `App.tsx` ≤600 | T16 | **K1**（`CommandPalette.kb.test.tsx` 17 用例一字未改且绿）· **K2/K3**（消费后归零、连续两次可触发）· **K4**（注释与实现一致）· **K5**（≤600） | ① `{value,key}` 全量统一 → **批 7/8 的 durable**（报告登记）② 5 个粘滞字段「是否有意粘滞」的**意图**不可判定（登记） |
| **C7** | 不碰 `NON_MIGRATED_14`；提示落宿主层；守卫一字未改 | T14 · T15 · T18 | **V2 的机器形态**（`useNotesPageEditing.ts` / `NoteEditView.tsx` / `RichEditorView.tsx` / `NoteReadingView.tsx` **不在提交路径**；两条守卫**零 diff 且绿**）· **F1**（提示在宿主层） | ① 残留登记：`RichEditorView` 内部若要显示保存错误**做不到** → 批 7/8 ② 若撞墙 ⇒ 回退 + 登记 + 不改守卫 + 点名上报（照批 4 T16-B 先例） |
| **C8** | 不归一 + 防「3 套变 4 套」+ 派生器显式命名 | T12 · T18 | **N5**（`react-markdown` 运行时站点 == 2；`views/**` 含 type 也 0）· **N6**（不传新槽 ⇒ DOM 逐字相同、既有 6 用例绿）· **N1/N2**（顶层块成卡、嵌套不加类） | ① 卡片**观感**（密度/断行）只登记 ② 「批 7 归一」的落点写进 `noteCardModel.ts` 文件头第一行（判据：该行存在） |
| **C9** | 拆件在前 + 每个拆件独立原子提交 + 无测试面先补判据 + 新文件 ≤300 + 不许动豁免表 | T2 · T3 · T4 | **V2 行数**（297→≤150 / 193→≤150 / 300→≤290）· **P1–P4**（面板安全网）· **S1–S4**（屏卡安全网）· `line-limits --full` 逐提交 exit 0 且 **122/122**（零新增登记）· `ChatPage.tsx` **不在任何提交路径** | ① 拆件的**行为等价**由「安全网判据在拆前拆后都绿」证明（不是靠人工走查）② `ChatPage` 不动 = **登记**（C9 逐字） |
| **C10** | 20 条交接项归属 + 两处修正 | T16 · T17 · T18 · 本计划 §裁决回执 | #13 → **J1–J3** · #14 → **Modal 的纯函数判据 + 既有判据绿** · #11 → **V5 的双口径入账** · #1 → **H6/F7**（槽位）· #2 → **D1–D3** · #3 → **转批 8（V1 的改判）** | 其余 13 条**逐条登记去向**（§裁决回执 §4 的表）；**#19 不属批 5**（`git status` 必须始终只有它一个 `??`） |
| **C11** | 只预留槽位、不重排、加注 | T10 · T14 · T18 | **H6**（会话：恰 1 个、空、在切换器之后）· **F7**（笔记：同形） | ① 槽位的**像素位置与可达性** → 批 8（登记）② 既有 `StatusLine` 调用点**一处未动**（`git diff` 断言） |
| **C12** | `Surface` 两条转批 7 | — | **零动作** | §收口回写的 follow-ups 表逐条登记（含 +3 / +28 的读数） |
| **C13** | 粘性头 + jsdom 测不出 + 工具栏合并转批 8 | T11 · T18 | **D1–D3**（行为 + 静态结构 + 层级）· V2 的**逐字 diff 约束** | ① **真实粘性不可验** ⇒ 只登记（含祖先链核验读数）② 「笔记工具栏三层合并」→ **批 8**（V1；含 F-3 的文件名更正） |
| **C14** | 目录/文件名/行数预算 + ① barrel/枚举/零行内 style/`--dur-micro` + ② 每视图「不 invoke」 | T5 · T7–T9 · T12 · T13 · T15 | **W1–W3/W4**（原语：受控值、回调、零行内 style）· **W7**（图标走注册表）· **V3 的 `style-contract` 只增 + 删除行 0** · **A3**（`views/**` 零 Tauri）· 各视图的 **T4/C4/P5/N7/E4** 判据 | ① **`ViewSwitcher` 的首屏 Δ**：T5 V5 真实构建后登记（**不是 0**，机理 = barrel 已在首屏）② R-2 的**类名空间折中**写进 T18 的「诚实代价」 |
| **C15** | 每新文件 ≥2 条行为级判据 + 各带变异体 + 四条变异体纪律 | 全部 | 每个任务的 Verification 表**逐行**给出「判据 ↔ 变异体 ↔ 期望」；T0 的 `variant-harness.mjs` 提供 **`ran` 闸**；CONTROL 在 `tmp/t0/control`（冻结树） | **只能登记（不许编造弱判据）**：`scrollTop` 恢复真实性 · sticky 真实粘性 · 视图密度观感 · 切视图卡顿 · 真机/WebView2 · **惰性挂载的运行时内存效果**（字节面可测、内存面不可测） |

---

## 三条硬约束的机器判据（规格 §7.3；**本批的验收主轴**）

| 约束（§7.3 逐字） | 判据① （结构 / 图级） | 判据② （行为） | 判据③ （反向对照 / 登记） |
|---|---|---|---|
| **① 原文视图永远保留** | **A5①**（`registry.ts` 的 `[0].key === "raw"`）· **G2**（默认视图无 `load` ⇒ 不经惰性） | **H1**（会话：切到每个非默认视图后 `session-raw-view` **仍在 DOM** + 挂载计数不减）· **F5**（笔记：切到 `cardflow` 后原文内容仍在 DOM） | 反向：把默认视图也做成惰性/条件渲染 ⇒ **H1/F5 必红**。**今天已违反的形态必须修回**：`SessionDetailPanel.tsx:200-206` 的 `viewMode === "preview" ? <NotePreviewView/> : <>…</>` 互斥卸载 ⇒ **T10 改成「默认视图常驻 + 非默认惰性」**（修复动作与判据同批） |
| **② 非默认视图模块级惰性** | **A1**（`views/**` 不被 `App.tsx`/`shell/**`/`ui/primitives/**` import）· **A2**（`registry.ts` 直接导入者恰 2 个页面）· **G7**（`load` 体内恰一个 `import(`，注册表顶部无视图组件静态 import） | **H2/F6**（切到非默认 ⇒ 挂载；切走 ⇒ **不在 DOM**）· **H3**（`Suspense` + `ShellFallback` 在位） | 产物级（**报告读数，非 vitest**）：真实构建后 `dist/assets` 懒 chunk **22 → 实测值**（R-1：**逐 chunk 归属台账**；期望 27 或 28，**实测几写几**）· 反向：把 `load` 换成静态 import ⇒ **G7/A4 必红** |
| **③ 编辑态切视图先 `flushSave`、失败则阻断** | **F9**（既有断言原样绿 ⇒ 语义只在「切视图」这一条路径上被修正） | **F1**（reject ⇒ 值未变 + 目标未挂载 + `role="alert"`）· **F2**（resolve ⇒ 切换发生）· **F3**（非编辑态直通） | 反向：把 `catch` 分支改成继续 ⇒ **F1 必红**；**显式登记未做**：`RichEditorView` 的 Ctrl+E / 完成按钮路径仍不阻断（C4②，**不是本批引入的回归**） |

---

## 每个新组件的「不 invoke」判据（C14②；逐组件一行）

> **形态**：`vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))` ⇒ 渲染组件 ⇒ `expect(invoke).not.toHaveBeenCalled()`；**加强形态**（T15 的 **A3**）：`views/**` 整目录 **0 个 `@tauri-apps` import（含 `import type`）**，且扫描器在 `components/session-detail/SessionScreenCards.tsx`（今天确有 `convertFileSrc`）上必须命中（**阳性对照**）。

| 新组件 | 任务 | 判据编号 | 备注 |
|---|---|---|---|
| `ui/primitives/ViewSwitcher.tsx` | T5 | （原语不取数：**W1–W6** 全部只碰 props） | 原语层不在 `views/**` 的 A3 域内 ⇒ 由 `tsc` + 零行内 style 判据兜住 |
| `views/session/SessionTriTrackView.tsx` | T7 | **T4** | 数据全来自 `detail` props |
| `views/session/SessionProofView.tsx` | T8 | **P5** | 图片 URL 经容器注入的 `imageUrl()` |
| `views/session/SessionCardFlowView.tsx` | T9 | **C4** | 复用 `SessionScreenCard`（它自己也不 import Tauri） |
| `views/note/noteCardModel.ts`（派生器） | T12 | **N5**（+ A3） | **纯 AST 变换**：不取数、不渲染 |
| `views/note/NoteCardFlowView.tsx` | T12 | **N7** | 复用 `NoteMarkdown` |
| `views/note/NoteEvidenceTrackView.tsx`（条件项） | T13 | **E4** | 只消费容器注入的 `note`（+ 探针点名的既有读取路径） |
| `components/session-detail/SessionScreenCard.tsx`（单卡） | T3 | 五类棘轮全绿 + **零 `@tauri-apps`**（T9 的 C4 复用证明覆盖） | `convertFileSrc` 由容器收口成 `imageUrl()` |
| `components/session-detail/SessionViewHost.tsx` | T10 | **H1–H6**（它自身不 invoke；`views`/`slot` 全注入） | 会话侧无编辑态 ⇒ 无 flushSave 守卫（C4 只适用笔记侧） |

---

## 规模与预算（照派发书 H；**行数是估算，绑定约束是 ≤300 + 零新增登记**）

### 1. 新增生产文件（**13 个基础 + 1 个条件项**）

| # | 文件 | 任务 | 预算行数 |
|---|---|---|---|
| 1 | `app/src/ui/primitives/ViewSwitcher.tsx` | T5 | ≤150 |
| 2 | `app/src/ui/primitives/ViewSwitcher.css` | T5 | ≤80 |
| 3 | `app/src/views/registry.ts` | T6 | ≤120 |
| 4 | `app/src/views/useViewMemory.ts` | T6 | ≤70 |
| 5 | `app/src/views/session/SessionTriTrackView.tsx` | T7 | ≤280 |
| 6 | `app/src/views/session/SessionProofView.tsx` | T8 | ≤250 |
| 7 | `app/src/views/session/SessionCardFlowView.tsx` | T9 | ≤200 |
| 8 | `app/src/views/note/noteCardModel.ts` | T12 | ≤150 |
| 9 | `app/src/views/note/NoteCardFlowView.tsx` | T12 | ≤180 |
| 10 | `app/src/components/session-detail/SessionScreenCard.tsx` | T3 | ≤120 |
| 11 | `app/src/components/session-detail/SessionRawView.tsx` | T2 | ≤200 |
| 12 | `app/src/components/session-detail/SessionViewHost.tsx` | T2→T10 | ≤180 |
| 13 | `app/src/components/session-detail/SessionAuxBlocks.tsx` | T2 | ≤120 |
| 14 | `app/src/views/note/NoteEvidenceTrackView.tsx`（**条件项**） | T13 | ≤280 |
| | **小计** | | **约 1,510–2,070 行**（13 个基础 + 1 条件项） |

> **与 decisions 规模表的差异（如实登记）**：规模表给的是「12–13 个」，本计划 **13 个基础文件**（拆件产物从 1 个变成 3 个：`SessionRawView` + `SessionViewHost` + `SessionAuxBlocks`）—— 理由是 **C9 的「主文件降到 ≤150」**在只抽一个 `SessionRawView` 时达不到（逐块行数实测见 T2 Step 2 的四步抽件 + 兜底项）。**没有为了凑数而拆**：`SessionViewHost` 与 `SessionAuxBlocks` 各自有独立职责（视图宿主 / 顶部与尾部信息块与面板）。**T18 的「与计划的偏差」要如实写这条。**

### 2. 新增测试文件（**11 个新文件 + 2 项追加**；全 ≤300、不得登记）

> **口径**：本仓的约定是「**同名测试文件**」（每个生产文件一个 `<Name>.test.*`）；下表的「追加」项**已实测存在同名既有测试**（`app/src/utils/colorPalette.test.ts` · `app/src/ui/primitives/Modal.scroll-lock.test.tsx`）⇒ **判据加进既有文件，不新建**（既有用例一条不许少）。

| # | 文件 | 任务 | 预算行数 | 形态 |
|---|---|---|---|---|
| 1 | `app/src/components/SessionDetailPanel.test.tsx` | T2（+T10 的 P2 复跑） | ≤200 | 新建 |
| 2 | `app/src/components/session-detail/SessionScreenCards.test.tsx` | T3 | ≤220 | 新建 |
| 3 | `app/src/components/session-detail/SessionViewHost.test.tsx` | T10 | ≤280 | 新建 |
| 4 | `app/src/components/session-detail/SessionDetailHeader.test.tsx` | T11 | ≤220 | 新建 |
| 5 | `app/src/ui/primitives/ViewSwitcher.test.tsx` | T5 | ≤300 | 新建 |
| 6 | `app/src/views/registry.test.ts` | T6 | ≤300 | 新建 |
| 7 | `app/src/views/useViewMemory.test.ts` | T6 | ≤200 | 新建 |
| 8 | `app/src/views/session/sessionViews.test.tsx`（**三个会话视图各一个 `describe`**） | T7 · T8 · T9 | ≤300 | 新建 |
| 9 | `app/src/views/note/noteViews.test.tsx`（派生器 + 卡片流 + 条件项证据视图各一个 `describe`） | T12 · T13 | ≤300 | 新建 |
| 10 | `app/src/components/notes/NotesReadingColumn.views.test.tsx` | T14 | ≤300 | 新建 |
| 11 | `app/src/views/architecture.guard.test.ts` | T15 | ≤300 | 新建 |
| 12 | `app/src/hooks/useNotesDeepLink.test.ts` | T16 | ≤200 | 新建（盘上无同名测试） |
| 13 | `app/src/utils/colorPalette.test.ts` | T4 | 追加 ≤60 | **追加**（文件已存在） |
| 14 | `app/src/ui/primitives/Modal.scroll-lock.test.tsx` | T17 | 追加 ≤60 | **追加**（文件已存在） |
| | **小计** | | **约 1,200–1,800 行 / 11 个新文件 + 2 项追加** | |

> **与派发书估算（8–10 个文件）的差异（如实登记）**：本计划 **11 个新文件**。多出来的来自两条硬约束：① 本仓的**同名测试文件**约定（不合并 ⇒ 5 个「拆件/守卫」任务各自一个安全网/等价性测试文件）；② 把 `colorPalette.test.ts` 与 `Modal.scroll-lock.test.tsx` 的判据**追加进既有文件**（这一步已经是为压缩文件数做的处置）。**行数仍落在 1,200–1,800 区间内**，且全部 ≤300、零登记。**T18 的「与计划的偏差」要如实写这条。**

### 3. 迁移的既有文件（**11 个主表 + 5 个附带小改**；逐个给「改后约束」）

| # | 文件 | 现行 | 改后约束 | 任务 |
|---|---|---|---|---|
| 1 | `components/SessionDetailPanel.tsx` | **297** | **≤150**（先拆）→ T10 后 **≤160** | T2/T10 |
| 2 | `session-detail/SessionScreenCards.tsx` | 193 | **≤150**（退化为容器） | T3 |
| 3 | `session-detail/SessionDetailHeader.tsx` | 161 | **≤180**（只加 3 个样式属性 + 1 import + 注释） | T11 |
| 4 | `components/notes/NotesReadingColumn.tsx` | 166 | **≤260**（变笔记视图宿主；顶层 div 属性一字不改） | T14 |
| 5 | `components/NoteReadingView.tsx` | **340**（已登记） | **零改动**（不得增长；提示落宿主层） | T14（零 diff 断言） |
| 6 | `pages/NotesPage.tsx` | **300** | 先拆 **≤290** → T16 后 **≤300** | T4/T16 |
| 7 | `pages/SessionsPage.tsx` | 332（已登记 301–600 档） | **≤345**（**不新增豁免条目**，只在报告登记行数变化） | T10/T16 |
| 8 | `App.tsx` | **584** | **≤600**（超了先拆、不许登记） | T16 |
| 9 | `ui/primitives/index.ts` | 45 | **≤60**（+2 行导出） | T5 |
| 10 | `ui/primitives/style-contract.test.ts` | **236** | **≤300**；**只新增**枚举块 + 判据，**删除行 = 0** | T5 |
| 11 | `components/NoteMarkdown.tsx` | 244 | **≤270**；**只追加**一个槽 + 一个类型导出，**删除行 = 0** | T12 |
| 附 1 | `hooks/useNotesDeepLink.ts` | 106 | **≤120**（注释更正 + `onConsumed`） | T16 |
| 附 2 | `shell/navHeight.consumption.test.ts` | 64 | **≤110**；**只加**域与新判据，**删除行 = 0** | T17 |
| 附 3 | `ui/primitives/Modal.tsx` | 225 | **≤260**（+ 两个纯函数 + 解锁恢复） | T17 |
| 附 4 | `utils/colorPalette.ts` | — | **只新增**两个纯函数（不得改 `resolveNoteColor` 的既有语义） | T4 |
| 附 5 | `hooks/useNotesPageEditing.ts` | 81 | **零改动**（ESC 语义一字不改） | T14（零 diff 断言） |

### 4. 预计提交数（**17 + 1 条件项 = 18**）

| 阶段 | 提交数 | 内容 |
|---|---|---|
| 拆件（C9） | **5** | T2 提交 1（面板安全网）· T2 提交 2（拆件）· T3 提交 1（屏卡安全网）· T3 提交 2（抽单卡）· T4（NotesPage 拆件） |
| 地基（C1/C5/C14①） | **2** | T5（`ViewSwitcher`）· T6（注册表 + 记忆） |
| 会话视图 + 接线 | **4** | T7 · T8 · T9 · T10 |
| 笔记视图 + 接线 | **3**（+1 条件项） | T12 · [T13] · T14 |
| 硬约束守卫 | **1** | T15 |
| 杂项 | **3** | T11（粘性）· T16（`focus*`）· T17（nav-h + Modal） |
| 收口 | **1** | T18 |
| **合计** | **17（+1）= 18** | 对照：批 3 = 22 · 批 4 = 49 |

> **与派发书估算（12–18）的关系**：本计划落在**上限 18**。多出来的 1–2 个来自 **C3 与 C9 明令的「安全网前置原子提交」**（2 个）与 **C13 的粘性头判据提交**（1 个）；**不许为压进 12–18 而合并原子提交**（C9 硬要求①逐字「每个拆件是**独立原子提交**」）。

---

## 风险表（≥5 条，每条给「怎么早发现」的判据候选）

| # | 风险 | 触发条件 | 早发现判据 | 归属任务 |
|---|---|---|---|---|
| **R1** | **首屏超预算**（`viewRegistry` 落点把 5 个视图 + markdown 栈拉进首屏） | 注册表被 `App.tsx`/`shell/**` import；或视图被静态 import；或 `load` 被写成静态引用 | **A1/A2/A4**（图级，vitest 内）· **G7**（`load` 只含 `import(`）· **T5/T10 V5 的真实构建**（`check-bundle-budget` exit 0 + Δ 与机理）· 工具/TS-API **双口径**读数 | T5 · T6 · T10 · T15 · T18 |
| **R2** | **原文被卸载**（今天 `preview` 支就已违反） | 把 `raw` 从默认位挪走；或对新视图「一刀切惰性」（连默认也惰性） | **A5①/G2**（默认视图无 `load` 且是 `[0]`）· **H1/F5**（切到任何视图后原文 DOM 仍在 + 挂载计数不减）· 反向变异（默认视图也惰性 ⇒ 必红） | T6 · T10 · T14 |
| **R3** | **编辑态丢数据**（`flushSave` 失败仍切换） | 直接把 `editing` 与视图切换耦合；或沿用「失败也退出」的旧语义 | **F1**（reject ⇒ 值未变 + 目标未挂载 + `role="alert"`）· **F9**（`NotesPage.test.tsx` / `RichEditorView.test.tsx` 原样绿）· 反向变异（`catch` 改成继续 ⇒ 必红） | T14 |
| **R4** | **贴边文件爆行**（`NotesPage` 300/300 · `SessionDetailPanel` 297/300 · `App.tsx` 584/600） | 视图接线直接写进这三个文件 | 每个任务开工前的 `ReadAllLines` 读数 + **逐提交** `line-limits --full` exit 0 + 「先拆后加」的原子提交顺序（T4 → T16；T2 → T10） | T2 · T4 · T10 · T16 |
| **R5** | **懒 chunk 互窜 / 归属不可核算**（两个视图落进同一个 chunk；或 `preview` 迁出后页 chunk 反而变大） | `load` 指向同一模块；或共享件被 rollup 提进页 chunk | **R-1 的逐 chunk 归属台账**（每个视图的独有字面量只命中自己的 chunk）· **T10 V5** 的「页 chunk 变小 / 总懒字节基本不变」机理读数 · **G3**（每个 `load` 解析真实模块） | T9 · T10 · T14 · T18 |
| **R6** | **新视图给五类棘轮加计数** | 新文件里出现 `<button>` / `#9ca3af` / `borderRadius: N` / `1px solid #e5e7eb` / `boxShadow:` / 三红 hex / 裸空态或加载文案 | **五类棘轮全绿**（每个任务 V 表必跑；`views/**` 与 `components/**` 都在域内）· 反向变异（在某个新视图里塞一个 `<button>` ⇒ 必红） | T3 · T7–T9 · T12–T14 |
| **R7** | **守卫被绕过 / 被改窄**（本批唯一的高危治理风险） | 为了让新代码绿而改五类棘轮、`motion-coverage`、`style-seams`、`zIndex.guard`、`dialogMigration.e` 或既有断言 | **`git diff --numstat` 的删除行数 = 0** 判据（`style-contract` / `NoteMarkdown` / `navHeight`）· **提交路径白名单**（五类棘轮 + `e.test.ts` + `motion-coverage` + `style-seams` **不在任何提交里**）· **K1/V2 的「既有用例一字未改」** | 全部 · T18 |
| **R8** | **条件项被当成已交付**（笔记第 3 视图） | 探针判否却仍写「笔记 3 视图」 | **V5（C2）的探针读数**（命令 + 原始输出）· T13 的「不存在 ⇒ 零代码提交」路径 · T18 的 §11-6 加注 | T1 · T13 · T18 |

---

## 诚实边界（**必须写进 T18 的「未验证」单列；区分「仪器不可达」与「本批未做」**）

1. **只能登记（仪器不可达，不许编造弱判据 —— C15 逐字）**：`scrollTop` 重挂载恢复的**真实性** · sticky 的**真实粘性** · 视图密度/印样/卡片流的**观感** · 切视图的**卡顿** · **真机 / WebView2**（用户已裁决跳过；**任何报告都不得出现「已在真机确认」类表述**） · 惰性挂载的**运行时内存效果**（字节面可测、内存面不可测）。
2. **本批未做（明确转批，不是遗漏）**：3 套 markdown 归一（→批 7）· `focus*` 的 `{value,key}` 全量统一（→批 7/8）· `flushSave` 接口升级（→批 8）· 错误行的**位置重排**（→批 8）· `Surface` 两条（→批 7）· 「笔记工具栏三层合并」（→批 8）· 五类棘轮余量（→批 7）· `bundle-eager-graph` 工具本身（→批 8，**本批只并列双口径**）。
3. **像素/排版归批 8**：jsdom **不排版、不加载样式表**（`vitest.config.ts` 的 `css` 默认 false）⇒ 本批一切「观感变化」都只有**类级/属性级/源码级**证据。
4. **产物级判据只在报告里**：`dist/assets` 的懒 chunk 台账依赖一次**真实构建**；净克隆/CI 无 `dist` ⇒ 它**不能**是 vitest 判据（本批不做 `skipIf` 的假绿测试）。
5. **本批零 Rust 改动**：`git log 091d1c3d..HEAD -- app/src-tauri` 必须为空；C2 的探针**只读** IPC 清单。
6. **未复核批 4 台账的全部读数**：只抽验了与本批直接相关的行数/首屏/门禁；其余原样转引（含批 4 的 2 处已更正读数：`ChatPage` 579、`SessionScreenCards` 的 `data-testid` = 0）。

---

## 自审记录（计划者自查，不属执行范围）

- **规格覆盖**：§1 的 L3 五条（19 四部件 → T5/T6/T10/T14 · 20 本批视图 → T7–T9/T12/T13 · 21 范围纪律 → **其余域零动作**并登记 · 22 三条硬约束 → §三条硬约束的机器判据 · 23 视图记忆 → T6/T10/T14）· §7.1 依赖方向 → T15 的 A1–A3 + 每视图的「不 invoke」· §7.2 矩阵 → 会话 5 视图 / 笔记 2–3 视图 · §7.3 三条 → 同上 · §8.4/§8.6.1 的 `--dur-micro` 接缝 → T5 · §10 批 5 行 → 全批 · §11-6 → T18 · §11-9 → T5/T10 的真实构建 · §12 → T18 加注 · §13 三行风险 → §风险表 R1/R2/R3。
- **非目标覆盖**：不碰 `src-tauri/**`（T18 的 `git log` 断言）· 不做 markdown 归一（T12 的 N5/N6）· 不碰 `NON_MIGRATED_14`（T14 的零 diff 断言）· 不做 `Surface` 两条（C12 零动作）· 不做工具栏合并（V1）· 不装 GSAP（零 `@keyframes`、零依赖变更）。
- **裁决覆盖**：C1–C15 逐条在 §裁决落点表有任务 + 判据编号 + 只登记项；**没有任何一条被削弱或绕过**；两条计划期 STOP 已由控制方回执（§裁决回执），**T20 已按回执删除**。
- **类型一致性**：`ViewSpec<P>` / `SessionViewSlot` / `NoteViewSlot` / `RemarkPlugin`（从 `NoteMarkdown` 导出）/ `ViewSwitcherProps` / `ViewSwitcherOption` / `CardKind` 七处类型**只有一种写法**；`viewsFor` 用重载（session / note）而**不用 `any`**；`load` 的缺省语义（默认视图无 `load`）在 G2/A4/§三条硬约束三处同源。
- **占位符扫描**：全文**无未填占位符**、**无「类似 Task N」式引用**；每个任务都有自己的 Files / Interfaces / Steps / Verification；两处「Verification 同 T7 形态」的引用（T8、T13）**都同时给了本任务独有的判据编号与行数预算**，不是空引用。
- **计划预算 vs 硬限**：所有新文件给了预算；绑定约束（**≤300 + 零新增豁免登记**）写在 Global Constraints；**新增生产文件 13+1**（比规模表多 1–2，理由已写在 §规模与预算 §1 的注里，T18 需如实登记）。
- **风险最高处已就地标注**：T10（默认视图常驻 + `preview` 迁懒 chunk + `:64` 改判）· T14（`flushSave` 阻断，本批最有价值的判据）· T3（空真判据的强化，V2 已裁）· T5（类名空间折中，R-2 已裁）· T12（`NoteMarkdown` 的只追加槽，`删除行 = 0` 是硬判据）。
- **待裁决项**：**无**（两条 STOP 已回执；V3/V4 已按回执落笔；C2 的条件项由 T1 的探针读数驱动，属**执行期读数**而非待裁）。

---

## 收口回写（Task 18 —— 留给收口单元）

> 本节由**收口单元**在 Task 18 追加。上文一律**保留不改**，本节只做**终态读数**与**归账**。
> **格式要求**（照批 3/批 4）：一律给「命令 + exit code + 原始读数 + 出处（HEAD sha / `app/dist` mtime / 采集时刻）」。

### 一、三条硬约束的判据与读数
（① 原文永远保留：默认视图无 `load` 的读数 + 两个宿主的「切换后原文 DOM 仍可达 + 挂载计数」用例数 ② 非默认视图模块级惰性：A1–A5/G7 的读数 + **懒 chunk 逐 chunk 归属台账**（R-1：**实测值**；写明 27 与 28 各自出现的条件）③ 编辑态切视图 `flushSave` 阻断：F1–F3 的读数 + 未做项登记）

> **终态（`HEAD = b4edf8e4` · 采集 **2026-09-12 22:57:07–23:03 +08:00** · 全部在**同一次全量 `vitest run`（exit 0）**内跑过）**：**三条合计 9 条判据全绿**。出处：`tmp/t18/measurements.md` §1（六组读数包，gitignored 不入库）。

| 硬约束（规格 §7.3 逐字） | 判据（结构 / 图级） | 判据（行为） | 反向对照（变异体，**必须带任务号**） | 读数 / exit |
|---|---|---|---|---|
| **① 原文视图永远保留** | **结构 1** `SESSION_VIEWS[0].key === "raw"` ∧ `NOTE_VIEWS[0].key === "raw"`（自写结构探针）· **结构 2（G2）** 默认视图**不带 `load`**、非默认 **5/5 全带**（`app/src/views/registry.test.ts`，**12 用例**） | **H1** 会话：切到**每一个**非默认视图后原文节点仍在 DOM ∧ 挂载计数不减 · **F5** 笔记：切到 `cardflow` 后正文仍在 DOM ∧ 原文子树节点**同一性**不变 | **T10-M1**（`{resident}` → `{isDefault ? resident : null}`）⇒ `6 failed / 9 passed`，红含 **H1**；**T14-M5**（默认视图改回互斥条件渲染 = 旧 `SessionDetailPanel:200-206` 形态）⇒ `1 failed / 10 passed`，**唯一红 = F5** | `session[0].key="raw"` ✅ · `note[0].key="raw"` ✅ · `session[0].hasLoad=false` · `note[0].hasLoad=false` · **H1 11/11** · **F5 11/11** · exit 0 |
| **② 非默认视图模块级惰性** | **A1** `views/**` 首屏静态可达 = **0**（工具 + TS-API **双口径**）· **A2** 生产运行时导入者**恰 2**（`pages/NotesPage.tsx` / `pages/SessionsPage.tsx`）+ `views/** → registry` 生产侧 **7 条边全是 `import type`**（运行时边 0）· **G7** 每个 `load` 体内**恰 1 个** `import(` ∧ 注册表顶部**0 个**视图组件静态 import（4 条 import 逐字全是 `import type`） | **H2** 切到 ⇒ 挂载 / 切走 ⇒ **不在 DOM** · **H3** `Suspense` + `ShellFallback` 在位 · **F6** 笔记侧惰性 + 卸载 + 记忆恢复 | **T10-M2c**（惰性视图 sticky 常驻 ∧ 去掉默认视图门控）⇒ `failed 1 / passed 14`，**仅 H2 红**；**T10-M3**（删 `<Suspense>` 包裹）⇒ `failed 5 / passed 10`，红含 **H3**；**T14-M6**（`display:none` 代替卸载）⇒ `failed 1 / passed 10`，**唯一红 = F6** | `load` 内 `import(` **5/5 恰为 1** · 顶部运行时 import **0** · **H2/H3/F6 各 11/11** · 懒 chunk **22 → 31** · exit 0 |
| **③ 编辑态切视图先 `flushSave`、失败则阻断** | **F9** 既有断言原样绿（**文件头 `@ai-context` 注释，不是 `it`**） | **F1** reject ⇒ 值未变 + 目标未挂载 + `role="alert"` + 记忆未写 · **F2** resolve ⇒ 切换发生 + 目标挂载 + 无错误行 · **F3** 非编辑态直通（`editorRef.current === null`）· **F4** 阻断全过程 **0 个 toast 节点**（并证选择器有牙） | **T14-M1**（把 `catch` 分支改成「保存失败也继续切换」= C4 逐字禁止形态）⇒ `Tests 1 failed \| 10 passed (11)`，**唯一红 = F1** | **F1–F4 各 11/11 passed** · exit 0；**未做项登记**见下 |

**① 的产物级佐证**：会话侧「常驻」字面量落在**懒 chunk** 而非首屏 —— `"session-resident-view" -> SessionsPage-BCLQ3FuS.js(1)` · `"note-resident-view" -> NotesPage-CTJSvFrT.js(1)`，**两者都不在首屏 3 个 chunk 里**。

**② 的懒 chunk 逐 chunk 归属台账（R-1，**实测几写几**）**：BEFORE = `tmp/t1/lazy-chunks.md` @`2559a3fd`（入口 `index-4qKuUwYr.js`；**22 懒 / 1,790,753 B**），AFTER = 本批真实构建 @`b4edf8e4`（入口 `index-Bn5oI23G.js`；**31 懒 / 1,805,017 B**）。
- **逐块具名（10 条全部有归属，10/10 闭合）**：`SessionTriTrackView` 2,155（T7）· `SessionProofView` 2,058（T8）· `SessionCardFlowView` 1,351（T9）· `NoteCardFlowView` 1,489（T12）· `SessionNotePreview` 11,472（T6b 的会话槽适配器）· **`registry` 4,943**（T6 的注册表 + T5 的 `ViewSwitcher`）· `NoteMarkdown` 6,564（T12）· `SessionScreenCard` 332（T3）· `fmt` 634（工具小块）· `RefineLaunchDialog` 19,250（**再分组，非本批代码**）。
- **措辞口径（必须照此读）**：**「真新增 9 块 + 1 次共享块再分组（1 拆 2）」**，**不是**「ADDED 10 / REMOVED 1」。**闭合核算**：`50,248（ADDED 10）− 21,149（REMOVED 1）− 14,835（保留 21 个的字节变化）= +14,264 B` = 实测净 Δ **逐字节相等**；**再分组核算**：`21,149 = 19,250（RefineLaunchDialog 独立）+ 1,899（useTransientToast 迁入新共享块）` ✅ **无字节丢失**（两个源文件在批 5 区间**零提交**，`git log` 已证）。
- **「27 与 28 各自出现的条件」（计划原问，按实测回答）**：计划假设「**每个新视图恰产生 1 个懒 chunk**」⇒ `22 + 5 = 27`（笔记「带证据三轨」**不**交付 = C2 判否）或 `22 + 6 = 28`（**交付**）。**实测 = 31 ⇒ 该假设不成立**：除 4 个视图本体 chunk 外，rollup 还产生了 **5 个共享块**（`SessionNotePreview` 适配器 / `registry` / `NoteMarkdown` / `SessionScreenCard` / `fmt`），并触发了 1 次共享块再分组（净 0 个新模块）⇒ **27/28 是「22 + 视图数」的下界式估算，不是可复现判据**；**终态一律报 31**。
- **BEFORE 为何不用活树 `app/dist`**：T16 的警告在本批得到正面确认 —— T18-A 构建**前**的活树 dist（34 `.js` / 懒 31 / 入口 `index-Bn5oI23G.js` / mtime `14:49:49.490Z`）与 T16 自己声明的产物**三者逐字相同** ⇒ **它已含本批代码**，当 before 会得到 **Δ=0 的假读数**。BEFORE 因此改用 T1 台账，并在**导出树 @`2559a3fd`** 内**独立跑了一次真实构建**复核（构建 exit 0 / wall **11.5 s** / `789 modules`）：**22 懒 / 1,790,753 B 与 T1 台账逐字节相等**（`only in T1 = []` · `only in mine = []` · 同键不同字节 `[]` · 首屏集合逐字相同）。

**③ 的未做项登记（逐条带归属）**：① **`RichEditorView` 的 Ctrl+E / 完成按钮路径仍不阻断**（今天就是 fire-and-forget，**不是本批引入的回归**，C4② 逐字禁止顺手扩大面）→ **批 8**；② **`flushSave` 返回类型未升级**（不改 `NoteEditHandle` 接口）→ **批 8 接口卫生**；③ **`RichEditorView` 内部若要显示保存错误做不到**（它自带 `status` state 保持原样）→ **批 7/8**；④ **错误行的位置重排**（批 5 **只预留槽位**，C11）→ **批 8**；⑤ **提示形态**：`catch` ⇒ 不切视图 + 保持编辑态 + **就近一行 `StatusLine kind="error"`**（**不用 toast**），宿主在**非 `NON_MIGRATED_14`** 的层（`NoteReadingView.tsx` / `NotesReadingColumn.tsx`）⇒ **两条 B1/B2 守卫一字未改且绿**（C7）。

⚠️ **ID 撞名警告（引用变异体时必须带任务号）**：**T10 的 `M1`**（默认视图条件渲染）= 约束①的反向对照（6 条红）；**T14 的 `M1`**（`catch` 分支继续切换）= 约束③的反向对照（唯一红 F1）。**不是同一个变异体。**
⚠️ **两条「无专属变异体」的判据**：**F9 是文件头注释而不是 `it`**（断的是**跨文件**的「既有断言未被动过」⇒ 单文件变异体无法表达；计划对它的反向形态写明「改任一条 ⇒ 红（**若红 ⇒ STOP，不许改判据**）」）· **A5①/A5②** 没有以自己为目标的变异记录（该性质分别由 **G2** 与 **F5/H1** 守着）。四条守卫自证缺口（G-1 A5① · G-2 A5② · G-3 A2③ · G-4 F9）逐条四要素见 `tmp/t18/measurements.md` §9.1，**只登记、不在收口提交里补测**（收口禁改代码），去向 **批 6/7**。

### 二、八门禁终态表
（逐条命令 + exit code + 读数；vitest 必须给**既有 166 文件 / 1608 用例逐文件一条不少**的比对结论；首屏必须给 **dist mtime + 入口 chunk 名 + 提交 sha + Δ 与机理**；eager 给**工具与 TS-API 双口径**；Rust 如实写「未跑 + `git log` 空」）

> **采集 provenance**：`HEAD = b4edf8e4f06669cf1062ccc43482f97ea99f700e` · 分支 `dev` · 八门禁采集窗口 **2026-09-12 22:57:07 – 22:58:51 +08:00** · 真实构建产出 `app/dist/index.html` mtime **`2026-09-12T14:58:51.595Z`**（= 22:58:51 +08:00）· 入口 chunk **`index-Bn5oI23G.js`** · 取锁 `LOCK_ACQUIRED attempt=1` / `LOCK_RELEASED`，事后 `Test-Path tmp/build.lock` = **False** · 原始输出全部落在 `tmp/t18/raw/**`（25 个文件）。

| # | 门禁 | 命令（逐字） | exit | 读数 | 原始输出 |
|---:|---|---|---:|---|---|
| 1 | 行数 | `node scripts/line-limits.mjs --full` | **0** | `>600` 硬限 **0**（棘轮内）· 301–600 档 **122** · 登记条目 **122** ✅ 与基线**逐字一致**（**零新增登记**）；`--write` 复跑 **逐字节零 diff**（sha256 `3790451a…` 前后相同）⇒ **豁免表不在本收口提交路径里** | `raw/line-limits-full.txt` |
| 2 | 文档 | `node scripts/docs-check.mjs` | **0** | 扫描 **277** / 检查 **177** · **五项全 ✅**（相对链接 · `file://` 目标 · 文件名规范 · 索引覆盖 · 模板源与实例）—— **本收口提交新增的链接全部可达** | `raw/docs-check.txt` |
| 3 | 命令注册 | `node scripts/check-command-registry.mjs` | **0** | 定义 **312** / 注册 **312** / 重复 **0** ✅ 与基线**逐字一致** | `raw/command-registry.txt` |
| 4 | 类型 | `cd app; npx tsc --noEmit` | **0** | **0 错**（`raw/tsc.txt` 仅 171 B，**全部是** `npm warn Unknown env config "manage-package-manager-versions"`，无一行 TS 诊断） | `raw/tsc.txt` |
| 5 | 测试 | `cd app; npx vitest run` | **0** | **`testResults.length` = 184 文件** / `numTotalTestSuites` **647**（= `describe` 块数，**不是文件数**）/ 用例 **1770** · passed **1770** · failed **0** · pending **0** · todo **0** · `success` **true**；运行窗口 **47.11 s**（控制台逐字 `Test Files 184 passed (184)` / `Tests 1770 passed (1770)`） | `raw/vitest-full.json`（697,940 B）· `raw/vitest-metrics.json` |
| 6 | 真实构建 | `node scripts/check-bundle-budget.mjs`（**取锁** `tmp/build.lock`） | **0** | 见下「首屏账」 | `raw/budget-build.txt` · `raw/budget-nobuild.json` · `raw/build-summary.json` |
| 7 | 首屏图 | `node scripts/bundle-eager-graph.mjs` **+** `tmp/t1/eager-graph-tsapi.mjs` | **0 / 0** | **工具口径 91** 文件（**源 77 + CSS 14**）/ npm 包 **4** · **TS-API 真实边口径 66（结论口径）** · `--keep-type-only` **77** 自证（⇒「91 − 66 = 25」确由 **14 CSS + 11 条纯类型边**构成） | `raw/eager-tool.txt` · `raw/eager-tool.json` · `raw/eager-tsapi.json` · `raw/eager-analysis.txt` |
| 8 | Rust | — | — | **未跑**（逐字见下） | `raw/rust-zero-change.txt` |

**门禁 5 的「既有用例一条不少」比对结论**：`node …/tmp/t0/compare-perfile.mjs <本次 JSON 绝对路径> --frozen` ⇒ **exit 0**。基准指纹逐字 = **166 行 · sha256 `AD789A809C5F2E59`（全串 `AD789A809C5F2E59EBEABF4DFE3967E60B4B50979AFCDFD7292D6088B2D91C18`）· 1608 用例 · HEAD `2559a3fd` · 采集 2026-09-12 21:08/21:12 +08:00**；候选 = **184 文件 / 1770 用例** ⇒ **`LOST=0 SHRUNK=0 GROWN=4 ADDED=18`**。**闭合核算**：`166 + 18 = 184` ✅ · `1608 + 24(GROWN 增量) + 138(ADDED 用例和) = 1770` ✅。
- **GROWN=4**：`ui/primitives/navHeight.consumption.test.ts` 3→6 · `ui/primitives/Modal.scroll-lock.test.tsx` 6→9 · `ui/primitives/style-contract.test.ts` 6→10 · `utils/colorPalette.test.ts` 40→43。
- **ADDED=18（逐个用例数）**：`useNotesDeepLink.test.ts`(8) · `SessionDetailPanel.test.tsx`(4) · `NotesPage.groupFilter.test.tsx`(2) · `views/architecture.guard.test.ts`(17) · `views/architecture.slots.test.ts`(2) · `views/registry.test.ts`(12) · `views/registryResolution.test.ts`(10) · `views/useViewMemory.test.ts`(13) · `NotesReadingColumn.views.test.tsx`(11) · `SessionDetailHeader.test.tsx`(9) · `SessionScreenCards.test.tsx`(6) · `SessionViewHost.test.tsx`(11) · `surfaceTagRegistry.test.ts`(5) · `ViewSwitcher.test.tsx`(14) · `SessionCardFlowView.test.tsx`(6) · `SessionProofView.test.tsx`(5) · `SessionTriTrackView.test.tsx`(5) · `noteViews.test.tsx`(9)。
- ⚠️ **仪器口径（必记）**：`numTotalTestFiles` **不存在** —— vitest **4.1.11** 的 JSON 顶层键只有 `numTotalTestSuites, numPassedTestSuites, numFailedTestSuites, numPendingTestSuites, numTotalTests, numPassedTests, numFailedTests, numPendingTests, numTodoTests, snapshot, startTime, success, testResults`（`hasOwnProperty` = false、`typeof` = `undefined`）⇒ **文件数一律用 `testResults.length`**。
- **相对 T16 的一次变化**：`numPendingTests` **1 → 0**（`skipped` 归零），**全部由批 5 收口的两个守卫提交解释**（`1d4023e4` + `b4edf8e4`：+2 文件 / +19 用例 / skipped 1→0；闭合式 `1750 + 19 + 1 = 1770`）。

**首屏账（门禁 6；dist mtime + 入口 chunk 名 + 提交 sha + Δ 与机理）**：`check-bundle-budget.mjs` **exit 0** · **首屏 JS 合计 gzip `100,485 B = 100.49 kB`**（原始 **318,299 B**；预算 200 kB ⇒ **余量 99.52 kB**）· 首屏 3 chunk = `index-Bn5oI23G.js` **108,620 B** + `vendor-react-lr0dg1MX.js` 192,536 B + `vendor-tauri-UIF4jgRy.js` 17,143 B · **懒 chunk 31 个 · gzip 583,980 B（583.98 kB，不计入预算）** · **CSS 3 个 · 63,229 B = 63.23 kB 原始 / 14.51 kB gzip（不计入判据，只报告）** · `index.html` 1,558 B · 字体（仅报告）`.ttf` 20 个 513,664 B / `.woff` 20 个 303,116 B / `.woff2` 19 个 256,168 B · vite 自报 `803 modules transformed` / `built in 3.67s` / 一条 `(!) Some chunks are larger than 500 kB`（`vendor-editor` 608.38 kB，**批 4 起既有、非本批引入**）。
- **Δ 与机理（基线 = `091d1c3d` 冻结值，出处 `progress.md:46,123`）**：首屏原始 **317,778 → 318,299 B（+521 B / +0.16%）** ⇒ **全部落在入口 chunk**（108,099 → 108,620 B），`vendor-react` / `vendor-tauri` **逐字节不变**；gzip **100,297 → 100,485 B（+188 B / +0.19%）**；**首屏 chunk 个数 3 → 3（Δ = 0，构造性成立；新进首屏集合 = `[]`）**；懒 chunk **22 → 31（+9）**、gzip **575.16 → 583.98 kB（+8.82 kB / +1.53%）**；CSS **62.63 → 63.23 kB（+599 B）**（与 T5 的「首屏 CSS 16,568 → 17,172（**+604 B**）」同源）。
- **`ViewSwitcher` 的首屏 Δ（C14① 的落点，**实测否证计划判词**）**：**JS Δ = 0 B + CSS +604 B** —— **T5 的时点读数**（当时 dist = 25 个 `.js`）：字面量 `ed-btn-group`/`ed-btn--segment` 在**全部 25 个 JS 里 0 命中**、只在**首屏 CSS** 里命中（首屏 CSS 16,568 → 17,172 = **+604 B**）⇒ rollup 把 `ViewSwitcher` 的 **JS tree-shake 掉了**（当时无任何调用点）；**终态**（34 个 `.js`）该字面量命中**懒 chunk** `registry-C-RvXIfE.js` —— 即**前后对照锚由 0 变为命中**，而**首屏 JS 仍无该模块**。**机理一句话：barrel 里有导出 ≠ 产物里有模块。**（总 CSS 口径：62.63 → 63.23 kB = **+599 B**，与 +604 B 同源，差额在 CSS 拼接/分块口径。）
- **eager 的三件套与 Δ（门禁 7）**：工具 **89 → 91 文件**（= 源 **76 → 77** + CSS **13 → 14**）· **TS-API 真实边 65 → 66** · npm 包 **4 → 4** ⇒ **+2 全部是 `ui/primitives/ViewSwitcher.tsx` + `ViewSwitcher.css`**（**唯一**新增的 barrel 导出）；**`app/src/views/**` 首屏可达 = 0**、`views/registry*` = **0**、`pages/SessionsPage*`/`pages/NotesPage*` = **0**（两者都在懒 chunk 内）⇒ **没有任何页面被静态拉回首屏**。

**门禁 8（Rust）逐字声明**：`git log --oneline 091d1c3d..HEAD -- app/src-tauri` ⇒ **空**（无输出）；`git log --oneline 4905d4d8..HEAD -- app/src-tauri` ⇒ **空**（无输出）⇒ **本批零 Rust 改动**（Global Constraints 非目标 1：不动 `src-tauri/**`）⇒ 判据仍是批 3 收口的 **2300 / 0 / 6**，但**本批未复跑 `cargo test`**。⚠️ **不得**把「未跑」写成「已跑」；⚠️ **不得**把 2300/0/6 当作本批读数（它是**继承值**）。

### 三、逐任务提交轨迹
（`Task → commit sha → subject → 文件数`；**提交数用 `A^..B` 含左端点口径**并写明起止；如实列出区间内的非本批提交）

**提交数（含左端点口径，逐条实测 `git rev-list --count`）**

| 区间 | 读数 | 含义 |
|---|---:|---|
| `4905d4d8^..HEAD` | **88**（`HEAD = b4edf8e4`；**本节所在的收口提交落下去后 = 89**） | 含左端点（`4905d4d8` = 批 4 计划提交，起算点） |
| `4905d4d8..HEAD` | **87**（收口后 **88**） | 不含左端点；`88 = 87 + 1` ✅ 自洽 |
| `091d1c3d..HEAD` | **39** | 批 4 收口之后至今 |
| **`091d1c3d..2559a3fd`** | **9** ★ | **「批 4 收口后追加」的真实 9 条**（4 修复 + 4 文档 + 1 计划）—— **不是** `091d1c3d..7d541254`（那只有 **5** 条） |
| **`2559a3fd..b4edf8e4`** | **30** ★ | **批 5 本批** T0–T17 的全部提交（不含收口提交） |
| `ad9d80d2^..HEAD` | **30**（收口后 **31**） | 批 5 全批含收口提交的含左端点口径（`ad9d80d2^` ≡ `2559a3fd`） |
| 自洽 | `9 + 30 = 39` ✅ | = `091d1c3d..HEAD` |

**「区间内的非本批提交」逐段列出（`4905d4d8^..HEAD` = 89 的分解）**：批 4 本体含计划与收口 **49**（`4905d4d8^..091d1c3d`）· 批 4 收口后追加 **9**（`091d1c3d..2559a3fd`，逐条：`ed07d491` `8a2dd5e1` `531eb93f` `cd85e4c3` `7d541254` `6038bb42` `11018f40` `2901511f` `2559a3fd`；按 Conventional Commits 类型 = **`test` ×5 + `docs` ×4**）· 批 5 **31**（`ad9d80d2^..HEAD`）⇒ `49 + 9 + 31 = 89` ✅。**边界链（批 4 收口 → 批 5 第一个任务提交）**：`2559a3fd docs(spec): fix row index in batch four correction` → `ad9d80d2 test(sessions): pin detail panel before split`。

**逐任务轨迹（批 5 本批 30 条，oldest-first；文件数/增删 = 本仓库实测 `git show --numstat <sha>` 汇总）**

| # | Task | sha | subject | 文件数 | +/− |
|---:|---|---|---|---:|---|
| 1 | T2 前置安全网 | `ad9d80d2` | `test(sessions): pin detail panel before split` | 1 | +164/−0 |
| 2 | T4 | `e579df63` | `refactor(notes): move derivations to colorPalette` | 3 | +98/−19 |
| 3 | T3 前置安全网 | `4bee9d7a` | `test(sessions): pin screen cards before split` | 1 | +218/−0 |
| 4 | T2 拆件主体 | `0bf849d2` | `refactor(sessions): split raw view out of detail panel` | 4 | +467/−228 |
| 5 | T3 抽单卡 | `06116283` | `refactor(sessions): extract single screen card` | 2 | +55/−10 |
| 6 | T4 | `343b38f0` | `test(notes): pin page wiring of note derivations` | 1 | +89/−0 |
| 7 | T2 · C18 棘轮重同步 | `f193808d` | `test(ui): resync ratchet baselines after split` | 5 | +17/−16 |
| 8 | **T2 收口回执**（T18-A 的 §4.2 把它记为 T5 的第 2 提交；**台账 `progress.md` §十二 记为 T2 的提交 4** —— 本表从台账，因为它的内容是 `SessionViewHost.tsx` 的圆角落档、属 T2 拆件面） | `d48fca57` | `refactor(sessions): snap switcher radius to control token` | 3 | +20/−6 |
| 9 | T5 | `afd35439` | `feat(ui): add ViewSwitcher segmented control` | 5 | +458/−0 |
| 10 | T5 | `ca19275a` | `test(ui): pin ViewSwitcher barrel export` | 1 | +16/−0 |
| 11 | T5 | `3c739c74` | `test(ui): narrow ViewSwitcher class token scan` | 1 | +10/−4 |
| 12 | T5（第 4 提交） | `927aedf8` | `test(ui): drop inline svg from switcher probe` | 1 | +9/−3 |
| 13 | T6a | `b2d5d477` | `feat(views): add view memory and slot contracts` | 3 | +333/−0 |
| 14 | T7 | `f191ab9b` | `feat(views): add session tri-track alignment view` | 2 | +435/−0 |
| 15 | T9 | `a41e9438` | `feat(views): add session card flow view` | 2 | +377/−0 |
| 16 | T7 判据复核 | `02dd20ba` | `test(views): assert both no-invoke faces at once` | 1 | +21/−10 |
| 17 | T8 | `d4794227` | `feat(views): add session proof view` | 2 | +383/−0 |
| 18 | T11 | `a36145c5` | `feat(session-detail): make detail header sticky` | 2 | +212/−2 |
| 19 | T8 判据修正 | `e73b3616` | `test(views): pin proof caption slot not wording` | 1 | +11/−3 |
| 20 | T12 | `6d49bb21` | `feat(views): add note card flow view` | 4 | +463/−2 |
| 21 | T15a | `cc49b09c` | `fix(ui): add call-site registry channel to surface ratchet` | 5 | +388/−83 |
| 22 | T6b | `556515b8` | `feat(views): register view specs with session slot adapter` | 4 | +481/−0 |
| 23 | T17 | `7deeb274` | `test(shell): bind nav-h fallback to token source` | 1 | +101/−0 |
| 24 | T17（第 2 提交） | `c927d547` | `fix(primitives): restore scroll position on modal unlock` | 2 | +103/−1 |
| 25 | T14 | `dadd2515` | `feat(notes): host views with flushSave guard` | 2 | +483/−79 |
| 26 | T14（C19 授权的 2 行） | `a9f8fe97` | `feat(notes): inject note view specs into page` | 1 | +2/−0 |
| 27 | T10（重落地） | `5f39cefe` | `feat(session-detail): wire views to registry` | 6 | +460/−139 |
| 28 | T16 | `c652f67f` | `fix(deep-link): reset sticky focus* after consume` | 7 | +233/−27 |
| 29 | T15 | `1d4023e4` | `test(views): guard architecture graph and slot props` | 2 | +355/−0 |
| 30 | T15 收口修复 | `b4edf8e4` | `test(views): create slot probe dir in exported trees` | 1 | +6/−1 |
| — | **T13** | *（无）* | **零提交**（C2/C17①：条件项判否 ⇒ 交付「为什么不做」的登记） | 0 | 0 |
| — | **T18-A** | *（无）* | **零提交**（只产 `tmp/t18/**` 读数包） | 0 | 0 |
| — | **T18-B（本节所在提交）** | *（自引用，无法写入本节）* | `docs(batch5): close out view layer readings` | 见下 | 见下 |
| **合计（本批 30 条）** | | | | **76 次文件触碰**（含跨提交重复） | **+6,468 / −633** |

**轨迹核对结论**：① **T13 零提交** ✅ 与台账一致（`progress.md` 逐字「**零提交**（开工 `6d49bb21` → 收工 `c927d547`）」—— 第 20 → 第 24 号之间确无 T13 的提交）。② **T10 / T14 各含 STOP 后重落地**：`5f39cefe`（T10 最终落地，6 文件 **+460/−139**）、`dadd2515` + `a9f8fe97`（T14 两提交，第二提交 = **C19 授权的 `NotesPage.tsx` 2 行**）。③ **收口前 HEAD（`b4edf8e4`）的 `git show --stat` 只含测试路径**（`app/src/views/architecture.slots.test.ts` **+6/−1**），**不含任何生产文件**。④ **计划估算「预计提交 17（+1 条件项）」vs 实测 30** ⇒ 计划估计偏低 **+12**，机理 = 多数任务按「安全网 / 实现 / 收口」拆成 2–4 个原子提交（T5 单独 4 条、T2/T3/T4/T14 各 2–3 条）。

**本收口提交（T18-B）的 stat 与「删除行 = 0」自证**：`git show --stat HEAD` **只含 `docs/**`**（规格 / `docs/versions/v0.22.md` / 本计划 / `docs/adr/ADR-033` / `docs/adr/ADR-034`）；`git diff --numstat HEAD^ HEAD` ⇒ **删除列全部为 0**（逐文件读数见 `tmp/t18b/**` 与 `task-18b-report.md`）；`docs/standards/line-limit-exemptions.md` **不在提交路径里**（`--write` 复跑逐字节零 diff ⇒ 本批**零新增登记**）。

### 四、C1–C15 的实际结果
（逐条：裁决摘要 → 实际做法 → 证据（文件 / 守卫 / 读数）；**照 §裁决落点表的顺序**，不重排、不合并）

> **口径**：C1–C15 照 §裁决落点表的顺序逐条填「实际结果」（**不重排、不合并**）；**C16–C19 是裁决文件在计划冻结后的追加裁决**（`rulings.md` 的 C16 / C17 补录 / C18 / C19），按其编号顺序附在本节末，**不改 C1–C15 的次序**。

| # | 裁决摘要 | 实际做法（终态） | 证据（文件 / 守卫 / 读数） |
|---|---|---|---|
| **C1** | 注册表落点 + `load` 取代 `Component`/`lazy` + `React.lazy`/`Suspense` | 落 `app/src/views/registry.ts` **109 行**；`ViewSpec = { key, label, icon, appliesTo, load? }`；宿主 `SessionViewHost` 用 `React.lazy` + `Suspense`（复用 `ShellFallback`） | **G2/G3/G7**（`views/registry.test.ts` 12 用例 · `views/registryResolution.test.ts` 10 用例）· **H2/H3** 各 11/11 · **A1/A2/A4** 全绿 · **首屏 Δ=0 构造性 + 实测**（构造：`views/**` 首屏可达 0；实测：真实构建 exit 0 / 首屏 100.49 kB）· `manualChunks` **零改动** · 规格 §7.1 加注 ✅（本收口提交） |
| **C2** | 会话三轨 = 转写/画面/OCR；笔记「带证据三轨」先探针 | 会话 `tritrack` **已交付**（三轨 = `segments`/`screens`/`ocr_blocks`，**零新数据面**）；笔记侧按探针判否 **交付 2 视图**，`NoteEvidenceTrackView` **不做、不建空壳**（T13 **零提交**） | `views/session/SessionTriTrackView.tsx` **207 行** + `SessionTriTrackView.test.tsx` **5 passed** · `FROZEN_VIEW_KEYS.note = ["raw","cardflow"]` · 全仓 `NoteEvidenceTrack*` **0 命中** · 规格 §7.2 / §11-6 / §8.6 加注 ✅（本收口提交）· **R8 对拍**：全批**无**「笔记 3 视图已交付」表述 |
| **C3** | 抽单卡 + 前置安全网 + 锚点集合不变 + 框选留容器 + 不加剧棘轮 | 抽 `session-detail/SessionScreenCard.tsx` 供两视图复用；`SessionScreenCards` 退化为「每屏一卡的列表容器」；**先补安全网再抽件**（`4bee9d7a` 在前、`06116283` 在后） | **S1–S4 + 阳性对照**（V2 批准的强化口径：id 锚点集合 + 卡片计数 + 逐字文案 + 展开态）· `SessionScreenCards.test.tsx` **6 passed** · 框选态留容器（`selectingScreen` 不复制）· **五类棘轮全绿**（9 文件 / 97 用例 / exit 0）· 单卡独立成块 **332 B** |
| **C4** | 不改接口 + 就近 `StatusLine` 阻断 + 不用 toast + 显式登记未做 | `NotesReadingColumn` 的切视图路径改为 `try { await flushSave() } catch { 阻断 }`；`catch` ⇒ 不切视图 + 保持编辑态 + 就近 `StatusLine kind="error"` | **F1–F4 各 11/11 passed**（`NotesReadingColumn.views.test.tsx`）· **F4 断言「阻断全过程 0 个 toast 节点」并证选择器有牙** · 反向对照 **T14-M1** ⇒ 唯一红 F1 · **登记未做**：`NoteEditHandle` 返回类型未升级（批 8）· `RichEditorView` 的 Ctrl+E/完成按钮仍不阻断（批 8）· 错误行位置重排（批 8，C11） |
| **C5** | 键口径 `view:default:{objectType}` + web 早退 + 新建 hook + **改判旧 D1** | `useViewMemory.ts` **70 行（顶格）**，键 = `view:default:{objectType}`（`objectType ∈ {"session","note"}`，**不含 `kind`**）；web 会话保持早退（不渲染切换器 ⇒ 不写记忆）；**`SessionDetailPanel.tsx:64` 的 `useEffect(() => setViewMode("raw"), [sessionId])` 整条删除**（不是「加条件」） | `views/useViewMemory.test.ts` **13 passed**（M1–M5：键形状 / 互不串 / 异常兜底 / 垃圾值回退 / 不写 `layout:`）· **H4b**「切到非默认后**换会话** ⇒ 仍是记忆里的视图」11/11 · 等价性 = 记忆由 `useViewMemory` 承载、**无记忆时**才回退默认 · `objectType` 不含 `kind` 的代价（web/photo/video 共享一份记忆）**只登记** |
| **C6** | 5 个粘滞字段最小收敛 + 注释更正 + `App.tsx` ≤600 | 5 字段补 `onFocus*Consumed`（**声明形态与类型一律不动**，10 行 `useState` 逐行相同）；`useNotesDeepLink.ts:18` 的注释已改正；`App.tsx` **590/600** | **K1** `CommandPalette.kb.test.tsx` **9 passed** 且 `numstat` **空** ⇒ 既有断言一字未改 · **K2/K3**（消费后恰 1 次归零 · 连续两次跳同一对象都触发）· **K4**（注释与实现一致）· **K5**（≤600）· 5/5 变异体如期红、`ran` 全 true · `{value,key}` 全量统一 → **批 7/8 durable** |
| **C7** | 不碰 `NON_MIGRATED_14`；提示落宿主层；守卫一字未改 | 编辑态提示落 `NoteReadingView.tsx` / `NotesReadingColumn.tsx`（**都不在名单内**）；`useNotesPageEditing.ts` / `NoteEditView.tsx` / `RichEditorView.tsx` **不在提交路径** | 两条守卫（`dialogMigration.e.test.ts` ② / `buttonMigration.test.ts` ④）**零 diff 且绿**（各 15 / 9 用例）· `NON_MIGRATED_14` **零触碰** · 残留登记：`RichEditorView` 内部若要显示保存错误**做不到** → 批 7/8 |
| **C8** | 不归一 + 防「3 套变 4 套」+ 派生器显式命名 | 批 5 **不做** markdown 归一（转批 7）；`noteCardModel.ts` 复用既有 `react-markdown` 栈（自定义组件映射），文件头显式命名「**结构派生器，批 7 归一**」 | **N5**：`react-markdown` **运行时站点 == 2（不变）**、`views/**` 含 `import type` 也 **0 站点**、`remark-*`+`rehype-*` = **8（不变）** · **N6**（不传新槽 ⇒ DOM 逐字相同、既有 6 用例绿）· `NoteMarkdown.tsx` 244 → **266**（**只追加，删除行 = 0**）· 规格 §12 加注 ✅（含口径更正「**4 套活 + 1 套死**」） |
| **C9** | 拆件在前 + 独立原子提交 + 无测试面先补判据 + 新文件 ≤300 + 不许动豁免表 | `SessionDetailPanel.tsx` **297 → 148**（四步抽件：297→172→150→148，兜底项「refineMsg 行并入 AuxPanels」已用；T10 接线下沉到 **182**）· `NotesPage.tsx` **300 → 288** · `ChatPage.tsx` **本批不动**（579/600） | 每个拆件**独立原子提交**且 `line-limits --full` 逐提交 exit 0 · 无测试面文件**先补安全网**（P1–P4 在拆前拆后各跑一次，4 个变异体全 `ran=true · red=true`）· 新文件全部 ≤300 · **`122/122` 零新增登记** · `ChatPage.tsx` **不在任何提交路径** |
| **C10** | 20 条交接项归属 + 两处修正 | 留批 5 的 #2/#3/#11/#13/#14/#18 逐条落地（#3 按 C16/C13 改为**转批 8**）；#12 确定转批 6；#16 = 只裁不动（C7） | #13 → **J1–J3**（`navHeight.consumption.test.ts` **6 passed**）· #14 → `Modal` 的**纯函数判据** + 既有判据绿（`Modal.scroll-lock.test.tsx` **9 passed**）· #11 → **双口径入账**（工具 91 / TS-API 66；**不修工具**，修工具归批 8）· #1 → **H6/F7**（槽位）· #2 → **D1–D3**（粘性头）· **#19 不属批 5**（`git status --porcelain` 全程**只有** `?? docs/tech-debt/`） |
| **C11** | 只预留槽位、不重排、加注 | 两侧各**恰 1 个**空槽位（`class="ed-view-error-slot" data-view-error-slot=""`），**位于切换器之后**；**不重排**任何既有 `StatusLine` 调用点 | **H6** `SessionViewHost.tsx:121`（剥注释后 1；裸子串 2，第 32 行是注释引文）· **F7** `NotesReadingColumn.tsx:268`（自闭合空元素）· 守卫 `architecture.guard.test.ts:250-258` **2 passed** · 变异 **T15-M-A5**（删槽）与 **T15-M-A5c**（上移到切换器之前）⇒ 各 `failed 1 / passed 16`，红 = A5③；反向对照 **T15-R-A5b** ⇒ 17 passed 绿 · 像素位置 → **批 8** · 规格 §5.1 加注 ✅ |
| **C12** | `Surface` 两条转批 7 | **零动作** ✅（本批不扩 `SurfaceProps`、不动透明容器口径） | 读数已登记：**+3**（DOM 属性透传解锁的已点名处数）/ **+28**（透明边框容器处数）⇒ §七 follow-ups 具名批 7 · `ADR-033` §4 加注 ✅ |
| **C13** | 粘性头 + jsdom 测不出 + 工具栏合并转批 8 | `session-detail/SessionDetailHeader.tsx` **161 → 176**：`position: sticky` + `top: var(--ed-space-4)`（4 px）+ `zIndex("raised")`（10）；**先补 1 条行为级判据** | `SessionDetailHeader.test.tsx` **9 passed**（改前 5 passed / 4 failed ⇒ 改后 9/9）· **真实粘性不可验**（jsdom 无布局引擎）⇒ 只登记，批 8 · 「笔记工具栏三层合并」→ **批 8**（含 F-3 的文件名更正：`components/NoteListToolbar.tsx`）· 规格 §6.2 与 `ADR-034` §登记 加注 ✅ |
| **C14** | 目录/文件名/行数预算 + ① barrel/枚举/零行内 style/`--dur-micro` + ② 每视图「不 invoke」 | `app/src/views/`（`session/` + `note/`）建成；`ViewSwitcher.tsx` **135**（≤150）· `.css` **63**（≤80）· `.test.tsx` **225**；进 `ui/primitives/index.ts` barrel（**45 → 48**）并在 `style-contract.test.ts` 枚举里（**233 → 296**，用例 **6 → 10**，**只增不删**） | **W1–W3/W4**（受控值 / 回调 / 零行内 style）9/9 如期红 · **W7** 图标走注册表（类型层探针：非法名 ⇒ exit 2 + `TS2322` 指名 `IconName`）· **V3**（`style-contract` 只增 + 删除行 0）· **A3** `views/**` 零 Tauri（裸 0 / 声明级 0，阳性对照双侧命中）· 各视图不-invoke 判据（T4/C4/P5/N7/E4）· **① 的首屏 Δ 登记结果 = JS `0 B` + CSS `+604 B`** —— **计划的「不是 0」被实测否证** · **R-2 的类名空间折中已写进「诚实代价」（§五）** |
| **C15** | 每新文件 ≥2 条行为级判据 + 各带变异体 + 四条变异体纪律 | 各任务的 Verification 表**逐行**给出「判据 ↔ 变异体 ↔ 期望」；`ran` 闸（`ran===false` ⇒ 仪器异常）；CONTROL 在 `tmp/t0/control`（冻结树） | 全批变异体**只引用、不重跑**（T18-A 派发书逐字要求）；每条在 §一 标 `task-N-report.md:行` 与 `tmp/tN/**` 路径 · **「只能登记」六项**：`scrollTop` 恢复真实性 · sticky 真实粘性 · 视图密度观感 · 切视图卡顿 · 真机/WebView2 · **惰性挂载的运行时内存效果**（字节面可测、内存面不可测）⇒ 全部落在 §六 |
| **C16** | 计划期两条 STOP 的处置 + 两处控制方事实更正 | **STOP 1**：按 C13 裁 ⇒ #3 转批 8，C10 汇总行的 `#3` **作废**，**不启用** T20 条件任务。**STOP 2**：批准强化口径（`data-testid` 为空集 ⇒ 改 id 锚点集合 + 卡片计数 + 逐字文案 + 展开态 + 阳性对照）；**登记 1**：懒 chunk 必须实测（禁止把 28 写成 27）；**登记 2**：批准复用 `ed-btn` 基座 + 四条条件 | STOP 1 ✅（§裁决回执 §4 标「转批 8」）· STOP 2 ✅（`SessionScreenCards.test.tsx` **6 passed**，判据不退化为「渲染不报错」）· 登记 1 ✅（R-1 实测 **31**，逐块具名 10/10）· 登记 2 ✅（`Button` 的 `variant` 与 `Button.css` **零改动**；条件④「若必须改 ⇒ STOP」**未触发**）· 事实更正：`NoteListToolbar.tsx`（**95 行**）· `check-bundle-budget.mjs` **无锁机制** ⇒ 本批一律显式取锁 |
| **C17** | T1 探针带来的口径裁决（**补录**） | ① **C2 开关 = T13 零代码**（笔记 2 视图 + 登记 + 规格加注留 T18）② **C8 口径 = 「4 套活 + 1 套死」** ③ **计划两处出入以实测为准**（`--keep-type-only` 实为 **76**、dist mtime 实为 **20:48:57**）④ **各建各自测试文件** | ① ✅ 见 C2 行 ② ✅ 规格 §12 加注已按此写 ③ ✅ §八 的偏差表已记 ④ ✅ 三个 `*View.test.tsx` 各自存在、**`sessionViews.test.tsx` 盘上不存在**（计划那三处 Files 的更正见 §八 ⑩） |
| **C18** | 基线「只读」的**方向性**更正（迁移吃掉豁免 ⇒ 迁移者必须向下重同步） | **重同步由 T2 独占**（T3 及后续单元**不碰**任何 `*Baseline.ts` / 棘轮测试文件，只在报告里列「迁走了哪些字面量」供核对）；`f193808d` 一次落完 | 弱化灰 **64 → 63** / 文件 44 → **43**（删键）· 字号越界 **558 → 551**（键 8 → 1）· 边框 **226 → 223** + 锚 108 → 107 · 越界圆角 **261 → 260** + 锚 109 → 108 · 三红 **114 → 113** · **`FROZEN == Σentries` 保持** · 每族各带变异体（M1–M4 全红）+ **反例守卫 M5 绿** · 五类棘轮终态 **9 文件 / 97 用例 / exit 0** |
| **C19** | 笔记侧接线归属（计划 Task 14 Files vs 单写者约束）⇒ 授权 T14 改 `NotesPage.tsx` **2 行** | T14 第二个原子提交 `a9f8fe97` = `+2/−0`（`+1 import { viewsFor }` + `+1 prop views={viewsFor("note")}`），`--only` 显式路径、**改完立刻提交** | **四条条件全满足**：① 第二个原子提交且 `--stat` 只含该文件（**1 文件 +2/−0**）② **改后 288 ≤ 300**、**未动豁免表** ③ **偏差已登记**（「≤285 是 T4 拆件时点目标；+2 推到 287，T16 的 +1 到 288，仍 ≤300、零新增登记」）④ **保留 `views` 缺席时的退化分支**（单视图：原文、不渲染切换器、不写记忆，由 F8 类判据覆盖）· 一致性：两侧槽位形态与 T10 **逐字一致**，由 T15 的图级守卫跨两侧查 |

### 五、诚实代价
（`ViewSwitcher` 进 barrel 的首屏 Δ 与机理 · **R-2 的类名空间折中** · `preview` 迁懒 chunk 的字节重分配 · `SessionViewHost`/`SessionAuxBlocks` 多拆两个文件的行数账 · 既有断言的改动数 = **0**（这是本批最值得记的一笔））

**① 首屏账（gzip）**：**100.30 → 100.49 kB**（**100,297 → 100,485 B，+188 B / +0.19%**），入口 chunk 原始 **108,099 → 108,620 B（+521 B）**；**余量 99.52 kB**（预算 200 kB）。**首屏 chunk 个数 3 → 3（Δ = 0，构造性成立；新进首屏集合 = `[]`）**，但**入口 chunk 内容变了**。**CSS 62.63 → 63.23 kB（+599 B，不计入判据、只报告）**。**懒 chunk 22 → 31 个**、**583,980 B = 583.98 kB gzip**（原始 **1,805,017 B**，**不计入预算**；基线 1,790,753 B ⇒ **净 Δ = +14,264 B**）。

**② `ViewSwitcher` 进 barrel 的首屏 Δ 与机理（C14① **被实测否证**）**：**JS Δ = 0 B** + **CSS +604 B**。机理 = **rollup 把 `ViewSwitcher` 的 JS tree-shake 掉了**（T5 时点无任何调用点；T5 实测：`ed-btn-group`/`ed-btn--segment` 在**全部 25 个 `.js` 里 0 命中**、只在首屏 CSS 里命中，首屏 CSS 16,568 → 17,172 = **+604 B**）；终态（34 个 `.js`）该字面量命中**懒 chunk** `registry-C-RvXIfE.js` ⇒ **前后对照锚由 0 变为命中**，而**首屏 JS 仍无该模块**。**教训一句话：barrel 里有导出 ≠ 产物里有模块** —— 计划的判词（「不是 0，机理 = barrel 已在首屏」）**方向对、结论错**。

**③ 懒 chunk 的字节重分配（措辞必须照 E7 读）**：**「真新增 9 块 + 1 次共享块再分组（1 拆 2）」**，**不得**写成「ADDED 10 / REMOVED 1」（那会读成「新增 10 块代码、删掉 1 块代码」）。**逐块具名 10/10**：`SessionTriTrackView` 2,155 · `SessionProofView` 2,058 · `SessionCardFlowView` 1,351 · `NoteCardFlowView` 1,489 · `SessionNotePreview` 11,472 · **`registry` 4,943** · `NoteMarkdown` 6,564 · `SessionScreenCard` 332 · `fmt` 634 · `RefineLaunchDialog` 19,250。**再分组闭合**：`21,149（旧共享块 useTransientToast-*.js）= 19,250（RefineLaunchDialog 独立）+ 1,899（useTransientToast 迁入新共享块）` ✅ **无字节丢失**。**总闭合**：`50,248 − 21,149 − 14,835 = +14,264 B` = 实测净 Δ **逐字节相等**。**「页 chunk 变小、总懒基本持平」的读数**：`SessionsPage` 页 chunk **−10,288 B**（73,703 → 63,415）· `NotesPage` 页 chunk **−4,815 B**（161,732 → 156,917）；另有 `colorPalette` **+229 B**（T4 把笔记派生搬进 `utils/colorPalette.ts`，124 → 175 行）· `KnowledgePage` **+39 B**。

**④ R-2 的类名空间折中（语义代价，明确选中）**：`ViewSwitcher` 的容器 `.ed-btn-group` + 段 `.ed-btn--segment` **借用了按钮基座命名空间** —— 读到它的人会先以为它是 `Button` 的一个档位。**换来的收益**：`Button` 的 `variant` 枚举与 `Button.css` **零改动**、`motion-coverage.test.ts` 与 `style-seams.test.ts` 的**既有计数零改动** ⇒ **本批对既有断言的改动数 = 0**。

**⑤ 拆件多出两个文件的行数账**：C9 的「主文件 ≤150」在只抽一个 `SessionRawView` 时**达不到** ⇒ 拆件产物从 1 个变 **3 个**（`SessionRawView.tsx` **157** · `SessionViewHost.tsx` **136** · `SessionAuxBlocks.tsx` **127**），**没有为凑数而拆**（三者各有独立职责：原文视图 / 视图宿主 / 顶部与尾部信息块与面板）。**逐件终态与超支**：`SessionDetailPanel.tsx` **182**（> C9 的 ≤150，T2 拆到 148 后被 T10 接线下沉）· `NotesReadingColumn.tsx` **290**（> 预算 260，超 30）· `useViewMemory.ts` **70 = 顶格（余量 0）** · `navHeight.consumption.test.ts` **165**（预算 110）· `Modal.scroll-lock.test.tsx` **269**（追加预算 +60）· `NoteMarkdown.tsx` **244 → 266**。**口径：预算是估算，绑定约束是 ≤300 + 零新增豁免登记** ⇒ 全部合规（301–600 档 **122 → 122**、`FROZEN_OVER_LIMIT` 仍为空数组）。

**⑥ 本批最值得记的一笔：既有断言的改动数 = 0** —— `dialogMigration.e.test.ts`（15 用例）/ `buttonMigration.test.ts`（9 用例）**一字未改且绿**；`CommandPalette.kb.test.tsx` **9 passed** 且 `numstat` **空**；`Modal.scroll-lock.test.tsx` 的 `GROWN` 是**追加**（6 → 9）不是改写；`style-contract.test.ts` 是**只增枚举**（6 → 10，删除行 0）。**唯一被改的既有数字是五类棘轮基线的「向下重同步」**（C18 授权、T2 独占执行），且**每条被改的判据各带自己的变异体**。

**⑦ 拆件顺带迁移的三处可见/观感变化（登记，不是「写法变了、观感不变」）**：**字阶 `11 → 11.5` / `13 → 12`** · **弱化灰 `#9ca3af → ink-3`**（批 4 的 5.13:1 口径延续）· **圆角 `6 → 5`**（落 `--ed-radius-control` 档 —— 起因是 T2 一度把圆角改成 `4`「躲开冻结集合」被打回，纪律 #53：**棘轮读数分辨不了「躲开冻结集合」与「落到档位」**，只有逐处自审表能分辨；最终落到**真档位**）。**这些全部只有类级/属性级/源码级证据**（jsdom 不排版；真机已裁决跳过）⇒ **批 8 的像素探针才是判据**。

**⑧ 零新增依赖 / 零新增豁免登记 / 零 Rust 改动**：npm 包 **4 → 4**；`manualChunks.ts` **零改动**；301–600 档 **122 → 122**；`git log … -- app/src-tauri` **两条为空**（判据仍是批 3 的 2300/0/6，**未复跑**）。

**⑨ B9 的逐字中间态**：**「只有接缝、没有纲领」—— 三档强度 / 双基调 / GSAP 在批 6。** 批 5 交付的是**内容与结构**（视图层骨架 + 多视图可用 + `--ed-dur-micro` 120 ms 的响应层接缝 + 两处 `position: sticky`/`Suspense` 接缝），**手感未设计、未调参**；**验收不得把接缝当最终手感，也不得声称动效系统已交付**。

### 六、未验证（诚实单列，**不许含糊**）
（§诚实边界 逐条搬入；**真机/WebView2 用户已裁决跳过**；**不许出现「已在真机确认」类表述**）

> **口径**：逐条**区分「仪器不可达」与「本批未做」** —— 前者是**工具/环境限制**（本批造不出读数，换批次也造不出，除非换仪器），后者是**做得到、但不在本批范围/预算内**。**两类都不许含糊成「未验证」一笔带过**；**本批任何一条都不得被读成「已在真机确认」。**

**A. 仪器不可达（工具/环境限制，本批无法造出读数）**

| # | 项 | 为什么不可达 | 本批给了什么（替代读数） |
|---|---|---|---|
| **U1** | **真实粘性头的粘性**（C13） | **jsdom 无布局引擎** —— 无法验证滚动后元素是否真的吸顶 | 只给**静态结构级**判据（`SessionDetailHeader.test.tsx` 9 passed：`position: sticky` ∧ `top` 来自 token ∧ 层级）+ 祖先链核验；计划 §诚实边界已裁「只登记」 |
| **U2** | **真实滚动恢复**（`scrollTop`，T17） | **jsdom 的 `scrollingElement` 不滚动**（T17 已留 `probe-jsdom-scroll*.json` 证明**探针本身有效**、是环境不滚动） | 只给 `Modal` 的**纯函数**判据（原值快照 / 引用计数 / 解锁恢复调用）+ `Modal.scroll-lock.test.tsx` **9 passed** |
| **U3** | **惰性挂载的运行时内存效果** | 需要真机/DevTools 采样；本机无 headless 内存探针 | **字节面可测并已给**（懒 chunk 22 → 31 / 583.98 kB gzip / 页 chunk −10,288 与 −4,815 B）；**内存面不可测** ⇒ 计划 §裁决落点表与 C15 逐字列入「只能登记」 |
| **U4** | **切视图卡顿 / 视图密度观感 / 像素位置与可达性**（C11①） | 需真实渲染 + 人眼/性能采样（jsdom 不加载 CSS、不排版） | 只给类级/属性级/源码级证据；**批 8 的像素探针才是判据** |
| **U5** | **真机 / WebView2** | **用户已裁决本批跳过**（计划 V6 逐字） | 无替代读数；**不得**出现「已在真机确认」类表述 |
| **U6** | **`loadingRatchet.test.ts` 的「299」原始声明为何是 299** | 需追溯批 4 的中间树；本批**零 `checkout` 纪律**下不可达 | 终态 **181** 已由台账归因（批 4 收口把扫描器搬进新文件 `loadingScan.ts` = **101 行**） |
| **U7** | **`textBaseline.ts` 声明 299 → 实测 297 的机理** | 同上（需批 4 中间树） | **如实写「机理未判定」**，**不许为补这个数字去 checkout**（= T18-A 的 U-1） |
| **U8** | **首屏 gzip 残差（T5 的 ±1 B）的逐字节归因** | A 树的产物**已随清理删除** ⇒ 无法逐字节对拍 | 已给候选机理（rollup 的 **hash 级联**：入口含懒 chunk 的 `import()` 映射；A/C 两树 14/22 个懒 chunk 改名而字节不变），量级 < 批 4 同源噪声（9 B） |

**B. 本批未做（做得到，但不在本批范围/预算内）**

| # | 项 | 性质 | 说明 / 谁会做 |
|---|---|---|---|
| **N1** | **变异体复跑** | 本批未做（**派发书逐字禁止**：各单元的变异读数已留档，只引用 + 标出处） | 本批在 §一/§四 逐条标 `task-N-report.md:行` 与 `tmp/tN/**` 路径；**未独立复跑任何一个变异体** |
| **N2** | **门禁 8（Rust）** | 本批未做（零 Rust 改动已证，两条 `git log` 为空） | `cargo test` **未跑** ⇒ 2300/0/6 是**继承值** |
| **N3** | **视图的真实数据分布**（视图在真实库上会拿到什么形状的数据、空/满/极端比例） | 本批未做（需真实 SQLite + 真实会话/笔记数据；本批只做静态只读探针与注入式测试） | 判据面：各视图的空态/退化分支有测试，但**真实分布未验**；建议与批 7 的 `evidence` 视图前置功课合并 |
| **N4** | **真编辑器 handle 的接线**（`RichEditorView` 真实 `NoteEditHandle` 与 `flushSave` 的真接线） | 本批未做（判据用**注入替身 + `vi.mock`**） | F1–F4 断的是**宿主层语义**（注入的 `flushSave` reject/resolve），**不是真编辑器**；真编辑器接线 → **批 8 接口卫生**同批 |
| **N5** | **`onConsumed` 进 deps 带来的额外 IPC 次数** | 本批未做（T16 只证「消费后恰 1 次归零 / 连续两次可触发」，**未计 IPC 调用次数**） | → 批 7/8 未接线落地 pass 一并量 |
| **N6** | **`{value,key}` 全量统一**（C6） | 本批未做（**durable 登记批 7/8**） | 若届时要动，**必须先请裁改写 `CommandPalette.kb.test.tsx` 的既有断言** |
| **N7** | **`evidence` 视图**（笔记「带证据三轨」） | 本批未做（**C17① 的「缺数据前置」**：读取路径不存在） | → **批 7，且必须先写规格**（E2 降级为 ms 最近邻 · E1/E3 改「带锚点段落数」· 覆盖四类无锚点 fixture） |
| **N8** | **markdown 归一**（3 套 → 1） | 本批未做（C8；口径「**4 套活 + 1 套死**」） | → **批 7** |
| **N9** | **`RichEditorView` 的 Ctrl+E / 完成按钮仍不阻断** | 本批未做（C4②；**非本批引入的回归**，逐字禁止顺手扩大面） | → **批 8** |
| **N10** | **逐块 chunk 重排的逐字节归因**（每个保留 chunk 的字节变化为何是那个数） | 本批未做（只做了**净额闭合**与**10/10 归属**） | 已给的闭合：`50,248 − 21,149 − 14,835 = +14,264 B`；**逐字节**归因需逐 chunk 反编译级对拍 ⇒ 不属本批预算 |
| **N11** | **规格 8 处加注的落位核对（N5）与「规格删除行 = 0」** | **本收口提交已完成**（T18-A 只提供数字） | 逐条落点见 `task-18b-report.md` 的处置表；`git diff --numstat HEAD^ HEAD` 删除列全 0 |

### 七、follow-ups（逐条具名归属）
（C10 的 20 条 + 本批新增项，逐条给批次：批 6 / 批 7 / 批 8；至少含：`flushSave` 接口升级 · 错误行位置 · markdown 归一 · `focus*` 全量统一 · 五类棘轮余量 · `Surface` 两条 · 工具栏三层合并 · `bundle-eager-graph` 工具 · 「只能登记」六项）

**A. 批 6（动效系统）**

| 项 | 依据 / 读数 |
|---|---|
| **ADR-035 = L4 动效纲领与引擎**（GSAP + 四层 + 三档 + 双基调 + 6 个签名动效） | 批 5 **未新增任何 ADR**、**未装 GSAP**；接入**必须**用 `import()`（判据见批 2 计划 Task 5） |
| **token 真源补 `pill` 档四处**（`app/scripts/gen-tokens.mjs` · `ui/tokens.gen.ts` · `ui/tokens.css` · `ui/primitives/tokens.drift.test.ts:52`） | 批 4 的 `Surface radius="pill"` 走 `var()` 兜底；批 5 **零动作**（`views/**` 不消费 `pill`） |
| **`ink-4` 与 §4.3 条件③（审校模式 ≥4.5:1）** | 仓内**仍无实现**；批 5 的视图层一律 `ink-3`（5.13:1），**`ink-4` 0 使用** |
| **`Toast` 的 `belowNav` 堆叠缺陷**（批 4 交接 #12） | C4 选 `StatusLine` 而非 toast ⇒ 本批不消费该路径 |
| **相变两态（规格 §6.3）· 列折叠连续运动（Flip）· `pinnable` 定值** | 批 3/`ADR-034` §登记 的既有登记 |

**B. 批 7（未接线落地）**

| 项 | 依据 / 读数 |
|---|---|
| **笔记「带证据三轨」**（**必须先写规格**） | C17①：读取路径不存在 ⇒ 必须改规格（E2 降级为 ms 最近邻 · E1/E3 改「带锚点段落数」）并覆盖 `OcrDirect`/`Web`/手动笔记/`anchor_timestamps=false` 四类**无锚点 fixture** |
| **3 套 markdown 渲染器归一** | 口径「**4 套活 + 1 套死**」（`NoteMarkdown.tsx:18` · `ChatMessageMarkdown.tsx:8` · `utils/refineDiff.ts:78 mdLineHtml` · `structuredBlocks.ts`）；批 5 只保证**运行时站点 2 不变** |
| **`Surface` 两条**：① DOM 属性透传（解锁 **+3** 处）② 透明容器是否接受多一层底（**+28** 处） | D12；接受 ② 会要求**抬高** `surfaceRatchet` 两条冻结值（「只许降」倒退）⇒ 需一次**显式裁决** |
| **`{value,key}` 全量统一** | C6 durable；动它须先请裁改写 `CommandPalette.kb.test.tsx` 的既有断言 |
| **`RichEditorView` 内部若要显示保存错误** | C7 残留登记（它自带 `status` state 保持原样）；与批 8 的接口卫生同批 |
| **`evidence` 视图的缺数据前置 · 视图的真实数据分布** | 见 §六 N3/N7 |
| **`onConsumed` 进 deps 的额外 IPC 次数** | 见 §六 N5 |
| **`b1-non-migrated`（回退动作 **9** / 冻结处数 **14**）与 B1/B2 守卫范围** | **批 5/7 的前置裁决**：批 5 的编辑态提示落**宿主层**、`NON_MIGRATED_14` **零触碰**；要迁它们的排版**必须先由控制方裁决守卫范围** |

**C. 批 8（治理收口 / 像素 pass）**

| 项 | 依据 / 读数 |
|---|---|
| **笔记工具栏三层合并为单行** | C13 逐字转批 8（要动 `NotesPage` **288/300** + `NoteListView` **241** + `components/NoteListToolbar.tsx` **95** 三个**无测试面**文件） |
| **错误行的位置重排** | C11：批 5 **只预留槽位**（两侧各恰 1、空、在切换器之后）；位置与可达性判定需真实视口 |
| **`flushSave` 接口升级**（`NoteEditHandle` 返回类型 → `Promise<boolean>`） | C4① 的显式登记（本批**不改接口**以保住零既有断言风险） |
| **`RichEditorView` 的 Ctrl+E / 完成按钮仍不阻断** | C4② 的显式登记（**非本批引入的回归**） |
| **真机 / WebView2 验收**（含**像素/观感探针**：字阶 11→11.5 / 13→12 · `#9ca3af → ink-3` · 圆角 6→5 · 视图密度 · 切视图卡顿 · 槽位像素位置） | **用户已裁决本批跳过**；jsdom 不排版 ⇒ 只有类级/属性级证据 |
| **`bundle-eager-graph.mjs` 把 `import type` 计成静态边（工具本身）** | C10 修正②：批 5 **留批 5 但只作为判据口径**（双口径并列），**不修工具** ⇒ 修工具归批 8 |
| **`check-bundle-budget.mjs` 的两个已实测缺口**（嵌套输出路径静默假绿 · 把「非首屏」说成「仅动态可达」的假文案）+ **接 CI / pre-commit** | 批 2 登记；批 5 承其纪律（显式取锁）但**未接线** |
| **`docs/tech-debt/`（191 KB，未入库）的处置** | 待用户裁决；批 5 的 `git status` 全程只有 `?? docs/tech-debt/` |

**D. 守卫自证缺口（§9.1 的四条；**只登记、不在收口提交里补测** —— 收口禁改代码）**

| # | 缺口 | 该性质**由谁守**（有牙的判据） | 去向 |
|---|---|---|---|
| **G-1** | `architecture.guard.test.ts:239-243` 的 **A5①** 只读 `registry.ts` 里 `FROZEN_VIEW_KEYS` 的**文本**（`expect(frozen.includes('session: ["raw"'))`），**从不读 `SESSION_VIEWS[0].key`** ⇒ 该条从设计上就打不红自己（配套变异 `T15-M-A5d` 的红命中的是 **A4①·A4②**） | **G2** `views/registry.test.ts:81`（变异 `g2-default-gets-load` ⇒ `4 failed / 18 passed`，红含 G2①②）+ T18-A 的**独立结构实测**（`session[0].key==="raw"` ∧ `note[0].key==="raw"` ∧ 默认无 `load`） | **批 6/7**（若要自有牙齿 ⇒ 把 `SESSION_VIEWS[0].key` 也读进来做真对拍；**属代码改动**） |
| **G-2** | `architecture.guard.test.ts:244-248` 的 **A5②**（两个宿主的「默认视图常驻 display 三元渲染」）在 `tmp/t15/mutants-summary.json` 的 10 条变异里**无一条以它为目标**；最接近的 `T14-M5` 的 `testFiles` 只有 `["src/components/notes/NotesReadingColumn.views.test.tsx"]` ⇒ **守卫文件不在该变异的测试面内** | 行为级 **F5**（同一条 `T14-M5` ⇒ 唯一红 F5）· 会话侧由 **H1**（`T10-M1` ⇒ 6 条红含 H1）守 | **批 6/7**（若要自有牙齿 ⇒ 在**含守卫文件**的测试面里重跑该变异；**属变异重跑**） |
| **G-3** | `architecture.guard.test.ts:119` 的 **A2③**（`views/**` 不导入 `pages/**` / `shell/**`）无 A2③ 目标的变异；且该条的**前提已被实测收窄**（计划原以为零 `components/**`，实测 **4 条真实边**） | T18-A **独立复测今日读数 = 0 条边** + **仪器双侧自证**（同正则对 2 个阳性样本报 true、对 3 个阴性样本报 false）；判据仍在守卫里持续执行（2 passed） | **批 6/7**（若要自有牙齿 ⇒ 造一条「`views/**` import `pages/**`」的变异；**属变异重跑**） |
| **G-4** | **F9**（`NotesReadingColumn.views.test.tsx:6-21` 的文件头 `@ai-context` 注释，**不是 `it`**） | ① **冻结逐文件基线** `tmp/t0/compare-perfile.mjs --frozen`（本批 exit 0，**`LOST=0 SHRUNK=0`**）② **命令级零 diff 证据**（`task-14-report.md:71`：5 文件 **36 用例 / 0 失败**；复跑 6 文件 **38 用例 / 0 失败**；`git diff --numstat` **空**） | **批 6/7**（若要加强 ⇒ 把「四文件零 diff」做成**工具级断言** —— T0 的 `--frozen` 已经是这个形态，**本批已跑通**） |

**E. 本批新增的 follow-up（不在 C10 的 20 条内）**

| 项 | 依据 / 读数 | 归属 |
|---|---|---|
| **卡片插槽 API 若 T9 后续需要** ⇒ **在 T9 消费时设计**（**本批未预扩**） | T9 的卡片流复用 `SessionScreenCard`；批 5 **没有**为「卡片插槽」预建 API（避免无消费方的抽象） | **T9 后续消费时** |
| **`Text` 的 558 处字号越界** | 批 4 只冻结不迁；**本批拆件顺带迁 7 处 ⇒ 实测 551**（C18 重同步 `FROZEN_FONT_OOB_TOTAL` 558 → 551，键 8 → 1） | **批 5/6** |
| **五类棘轮余量（弱化灰 63/43 · 字号越界 551 · 边框 223 + 越界圆角 260 + 阴影 24）** | 批 4 §11-3 的 B11 中间态余量；批 5 只做**向下重同步**（不许抬高） | **批 5/7** |
| **`FROZEN_NUMERIC_ZINDEX` 等批 4 遗留项** | 见批 4 计划 §收口回写 §七 | **批 5/7** |
| **`numTotalTestFiles` 不存在** ⇒ 后续批次引用 vitest 文件数一律用 `testResults.length` | vitest **4.1.11** 实测（顶层键 12 个、`hasOwnProperty` false） | **全批次纪律**（已写进规格 §11-11 加注） |
| **「活跃树 `app/dist` 可能滞后一整个批次」** ⇒ 任何 before/after 必须**同源两棵树各跑一次真实构建** | T16 实测 + 陷阱 #103/#109；批 5 已按此执行（导出树 @`2559a3fd` 独立构建） | **全批次纪律** |
| **「chunk 名不是稳定标识」** ⇒ 判 chunk 增删必须用**模块级字面量归属**或**字节闭合核算** | 陷阱 #110（按名字 diff 会同时产生假 ADDED + 假 REMOVED） | **全批次纪律** |

### 八、与计划的偏差（本节自陈）
（实施中偏离计划处逐条列：哪一步 · 为什么 · 代价 · 谁批准。**必须含**：① 拆件产物从 1 个变 3 个（若执行期确实如此）② 懒 chunk 的**实测值**与 27/28 的关系 ③ T13 的实际路径（交付 3 视图 / 零代码登记）④ 任何被突破的行数预算（口径：**预算是估算，绑定约束是 ≤300 且不新增豁免登记**）⑤ 计划期错处（若有））

**逐条（22 条；每条给「哪一步 · 为什么 · 代价 · 谁批准/依据」）**

| # | 偏差 | 为什么 | 代价 / 读数 | 谁批准（依据） |
|---:|---|---|---|---|
| 1 | **拆件产物从 1 个变 3 个**（`SessionRawView` + `SessionViewHost` + `SessionAuxBlocks`） | C9 的「主文件 ≤150」在只抽一个 `SessionRawView` 时**达不到**（逐块行数实测见 Task 2 Step 2 的四步抽件） | 多 2 个文件的行数账（157 / 136 / 127）；**没有为凑数而拆**（三者各有独立职责） | 计划 §规模与预算 §1 的注已预告「T18 需如实登记」 |
| 2 | **懒 chunk 实测 31（期望 27 或 28）** | 计划的「每视图恰 1 个 chunk」假设不成立：另有 5 个共享块 + 1 次共享块再分组 | 逐块具名 **10/10 闭合**；**实测几写几** | C16 登记 1 逐字（禁止把 28 写成 27）；R-1 |
| 3 | **T13 的实际路径 = 零代码登记**（不是「交付 3 视图」） | 只读探针判**不存在**逐段级「笔记 ↔ 证据」读取路径 | 笔记侧 = **2 视图**；规格 §7.2/§11-6 就地加注；产品机会登记批 7 | **C2 + C17①**（逐字「不许做空壳视图」） |
| 4 | **计划「预计提交 17（+1 条件项）」→ 实测 30** | 多数任务按「安全网 / 实现 / 收口」拆成 2–4 个原子提交（T5 单独 4 条、T2/T3/T4/T14 各 2–3 条） | 提交数 **+12**；逐个 sha 见 §三 | 无（估算偏差，如实登记） |
| 5 | **测试文件从「共用 `sessionViews.test.tsx`」改为各自测试文件** | 计划 Task 7/8/9 的 Files 与「T7∥T8∥T9 可并行」**互斥**（三单元写同一文件必然丢更新） | **`sessionViews.test.tsx` 盘上不存在**；实盘 = `SessionTriTrackView.test.tsx` / `SessionCardFlowView.test.tsx` / `SessionProofView.test.tsx` | **C17④**（控制方补录裁决） |
| 6 | **「13 个新文件」台账按实测改写** | 计划 §规模与预算 §1 的口径与实盘不同（计划按「新增生产文件」计，实盘 `views/**` 17 文件 = 9 生产 + 8 测试） | 终态按 `views/**` **17 文件**（全部 ≤300，最大 273）报 | 计划 §规模与预算 §1 的注（「T18 需如实登记」） |
| 7 | **C14① 被实测否证**（计划：`ViewSwitcher` 进 barrel ⇒ 首屏 Δ**不是 0**、机理 = barrel 已在首屏） | 实测 **JS Δ = 0**（rollup tree-shake 进懒 chunk）+ **CSS +604 B** | 计划的判词**方向对、结论错** ⇒ 已写进 §五 ② | T5 的同源两树真实构建（`d48fca57` vs `927aedf8`） |
| 8 | **W4 与 Step 1/Step 3 互斥** | Step 1（不设状态类）+ Step 3（枚举恰 2 项）与 W4 第一条子句（选中段与未选中段 `className` 不同）不可同时成立 | W4 **强化**为「每段 `className` 逐字等于 `ed-btn ed-btn--segment`」+「根/段无 `style`」 | 控制方**裁决 1**（维持：`aria-pressed` 是状态的唯一权威） |
| 9 | **V3 与 Step 1③ 互斥** | 原口径与状态类形态冲突 | 口径改为「**新增 ≫ 删除 ∧ token 保序包含**」 | 台账 §二十五 的 V3 判据互斥裁决 |
| 10 | **A2③ 的 `components/**` 前提不成立** | 计划原以为 `views/**` 零 `components/**`，实测有 **4 条真实边**（`NoteMarkdown` ×2 · `SessionScreenCard` · `NotePreviewView`） | 判据收窄为「只禁 `pages/**` / `shell/**`」（今日独立复测 = **0 条边**，带仪器双侧自证） | 台账 §三十三（控制方）+ T15 落地 |
| 11 | **P2 与 H1 互斥** | 计划判词与源码不符 | P2 从「同步」改「异步」、从「存在性」改「可见性」 | T10 的 STOP → 三件全 GO |
| 12 | **`SPLIT_MOVES` 条目删除** | **迁移不是搬运**：两个原生 `<button>` 随切换器迁进 **L1 原语**（原语层在扫描域外）⇒ 计数**真的**由 1 降到 0 | **删除它 = 撤掉豁免、恢复逐文件棘轮的牙齿**；`FROZEN_NATIVE_BUTTON_TOTAL` 是**上界**（393），实测 **392** ⇒ 判据仍绿 | T10 的源码逐字说明 + `nativeButton.ratchet.test.ts` 6 passed |
| 13 | **`useViewMemory` 住面板** | C19 GO-3：`SessionDetailPanel` 仍持 `viewMode` state，记忆 hook 的调用点落在面板层 | 无（形态选择） | C19 的三项 STOP ⇒ **GO-3** |
| 14 | **三处预算超支**（`navHeight.consumption.test.ts` **165**/110 · `Modal.scroll-lock.test.tsx` **269**/+60 · `NotesReadingColumn.tsx` **290**/260） | 判据/接线需要真实行数 | **全部 ≤300、零新增豁免登记** | 口径：**预算是估算，绑定约束是 ≤300 + 不新增豁免登记** |
| 15 | **两处「拆件时点目标」被接线增量推翻**（`SessionDetailPanel` **182 > 150** · `NotesPage` **288 > 285**） | T2 拆到 148 后被 T10 的接线下沉；T4 拆到 285 后 T14 的 2 行 + T16 的 `focus*` 推到 288 | 均 ≤300、零新增登记 | **C19 四条条件③**逐字要求登记这条偏差 |
| 16 | **计划 Task 13 的 V1 归属判据不可用**（原写「提交统计不含 `app/src/**`」） | 多单元并行下「HEAD 的 stat」不属任何单元 | 改为「**零提交 + 暂存区空 + `git status` 无我产生的路径**」 | T13 的 `tmp/t13/zero-change-selfcert.md`（V1a–V1i）+ 台账 §二十七 |
| 17 | **计划 Task 15 的 A3 判据形态错**（整目录**裸子串** `includes("@tauri-apps")` 会让 6 个文件里 **5 个假红**） | 假阳性来自**注释**里的自述（「零 `@tauri-apps` import」） | 权威口径 = 剥注释 + 排除 `*.test.*` + 只匹配 import/export 声明 + **保留阳性对照** + 两读数并列 | 台账 §十八 的「A3 口径定案」（由 T15 实施） |
| 18 | **计划写「`CommandPalette.kb.test.tsx` 17 用例」是笔误** | 实测 **9** 个 `it`（另一文件 12） | 无（读数更正） | T16 主动点名 |
| 19 | **计划点名的 H1 锚点漂移**（计划 `:966` 写 `getByTestId("session-raw-view")`，**全仓 0 命中**） | 落地用 `data-testid="resident-probe"` | 双侧自证：前者 **0** 命中、后者 **5** 命中（**同仪器同次 grep**） | 台账 §三十四（E6 登记） |
| 20 | **贴边表 13 格中 2 格与实测不同**（`textBaseline.ts` 声明 **299** → 实测 **297**（**机理未判定**）· `loadingRatchet.test.ts` 声明 **299** → 实测 **181**（**已归因**：批 4 收口拆出 `loadingScan.ts` **101 行**）） | 计划贴边表取的是批 4 中途时点值 | **不为补数字去 `checkout`**（禁）⇒ 如实写「1 格已归因、1 格机理未判定」 | 派发书逐字 + T18-A 的 U-1 |
| 21 | **`architecture.slots.test.ts` 声明 95 → 实测 100** | **收口提交 `b4edf8e4` 自己**（`+6/−1`） | 时点值 vs 终态值之差 | T18-A 实测（`git show --numstat` 逐字 `6 1`） |
| 22 | **`useViewMemory` 预算 ≤70 → 实测 70（顶格余量 0）** | C5 的预算上限恰为 70 | **顶格**：任何后续 +1 行都会**越过预算**（但仍 ≤300） | 计划 §规模与预算（如实登记） |

**控制方前提错误的 6 例（记控制方账上；引用时按本表口径）**

| # | 前提 | 实测 | 影响 |
|---:|---|---|---|
| 1 | 本机有 `pwsh` | **不存在**（只有 PowerShell 5.1；PS 5.1 的 `>` 写 **UTF-16LE**） | 长脚本一律写成 `.mjs` 用 `node` 跑；文本产物一律用 `node` 读；落盘走 `cmd /c … > out` |
| 2 | vitest JSON 有 `numTotalTestFiles` | **字段不存在**（vitest **4.1.11**；顶层键 12 个、`hasOwnProperty` = false） | 文件数一律用 `testResults.length`；`numTotalTestSuites` = `describe` 块数（647，与文件数差 463） |
| 3 | 批 4 收口后追加 9 条的区间是 `091d1c3d..7d541254` | 该区间**只有 5 条**；正确端点 = `091d1c3d..2559a3fd`（**9 条**） | 批 5 的起算点与全批台账一致（`2559a3fd` = T0 的 `FROZEN_HEAD`） |
| 4 | 工作树「洁净」 | 全程只有 `?? docs/tech-debt/`（**这一条始终在场**） | 所有「零仓库改动」声明都必须把它排除在外再报 |
| 5 | 批 4 计划的 `1964` 行可用于引用 | 那是**被 T18 追加 §收口回写之前**的时点值 | 引用批 4 计划一律**按节名 + 逐字引文**，不用行数 |
| 6 | `scripts/check-bundle-budget.mjs` 有锁机制 | **没有任何锁机制**（也不打印 `dist` mtime） | 本批一律走**显式取锁协议**；provenance 由执行单元自采 |

**并记两条「非计划错、但必须记住」的口径事故**：① **计划 Task 7/8/9 的 Files 与并行互斥**（同第 5 条；C17④）· ② **活树 `app/dist` 可能滞后一整个批次**（T16 实测：构建**前**只有 25 个 `.js` / 懒 22 个 / **无任何批 5 视图 chunk** ⇒ **拿它当 before 会误记 +9 懒 chunk**）⇒ **纪律：任何 before/after 必须用同源两棵树各跑一次真实构建**（批 5 已按此在**导出树 @`2559a3fd`** 内独立构建并**逐字节复核 T1 台账**）。

