# 批 8 地基与两条能力实施计划（L5：`line-limits` 拆件 + 末尾换行盲区 + 两条「规格已交·实现未做」的能力 + 观感仪器收编 + 治理余项）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **本文件是「六段单文件」**：`## 波次总表` 之后依次是 **段 8a · 地基与治理（T1–T5）**、**段 8b · 主线一：两条能力（T6–T11）**、**段 8c · 主线二：观感收编（T12–T16）**、**段 8d · 主线三：治理余项（T17–T20）**、**段 8f · 用户裁决项落地（T24–T28）**、**段 8e · 收口（T21–T23）**，然后是 `## 已裁决项（U1–U4 已裁 / U5 沿用跳过）`、`## 陷阱`、`## 诚实边界`、`## 收口回写八节`。**每段各自跑完整八闸**；**8a–8d、8f 任何一段都不得以「全批收口」结束**（承批 7 §C7.1 的段边界纪律）。

**Goal:** 把批 7 明文外推给批 8 的三条主线真正落地，并在**不新增产品面风险**的前提下把「地基」补齐：**① 地基与治理** —— `scripts/line-limits.mjs`（恰 300 行）拆件 + 「末尾换行 / EOL 盲区」判据落地 + 批 7 残留的 5 处入库文档更正 + 常设纪律入库；**② 主线一：两条「规格已交、实现未做」的能力** —— 笔记「带证据三轨」（规格 §7.4，**走派生序号 + 零新 IPC**）与「审校模式」（规格 §4.3，**纯 CSS 变量重绑 + 模式位**）；**③ 主线二：观感/像素面「收编，不立项」** —— 把批 3 埋在 gitignored `tmp/` 里的真像素面仪器搬进 `scripts/`、参数化、并逐条对准侦察 A 的 **14 条观感欠账**；**④ 主线三：治理余项** —— CI 挂载脚本域门禁 · `validate-all.mjs` 化石处置 · `SURFACE_TAG_REGISTRY` 键改 `(file, tier)` · `subject ≤50` 的牙 · 散文对拍探针转正；**⑤ 段 8f：四项用户裁决的落地**（**U1 音频两条都修 · U2 凭据槽代码路径移除 · U3 `docs/tech-debt/` 归档 · U4 观感仪器按需入口**；**U5 沿用跳过**）。

**Architecture:** 六段、**段内可并行、跨段串行**（8b/8c/8d 依赖 8a 腾出的脚本与文档落点；**8f（用户裁决项）必须先于 8e**；8e 独占收口窗口）。**地基先行**：`line-limits.mjs` 的拆件是「末尾换行盲区」修法的**前置**（控制方 §2 主线三 G1 逐字：先拆它），而 8c 的仪器入库必须先于 8c 的一切读数（仪器不在盘上就没有读数面）。**两条能力走零新 IPC / 零 schema 路线**（控制方 §2 A1：证据数据已在既有 `get_session_detail` 里；A2：段级身份走**派生序号**）；🔴 **段 8f 是本批唯一有 Rust 改动的段**（U1/U2 的用户裁决）。**一切门禁与变异体实验一律串行**（承 §C6.1 / P9：并行 ⇒ 两边各假红一条）。

**Tech Stack:** Tauri 2.11.5 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6 · Vitest 4.1.11（全局 `environment: "node"`；组件测试首行必须 `// @vitest-environment jsdom`）· Node 24（`scripts/*.mjs` 门禁）· **零新增依赖**（本批不装任何包）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（**§3 红线 6 `:118-137`** · **§4.3 `:214-245`（审校模式的规格定义本体）** · **§7.2 `:491+`** · **§7.4 `:538-575`（带证据三轨的输入契约）** · **§10 批 8 行 `:800`** · **§11 验收口径 `:809-912`** · **§11-6 `:895-907`** · **§13 `:978+`** · **§14 `:1000-1029`**）

**控制方裁决指针（硬输入，不许重新论证、不许削弱、不许绕过）:** 本地路径 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/controller-rulings.md`（**§0 用户前提 · §1 范围 · §2 三条主线的施工序 · §3 纪律 · §4 批 7 残留待更正**；**最高约束**）。同目录另有 `controller-synthesis.md`（四路侦察的决策简报：§A 观感仪器 / §B 两条能力 / §C 欠账核对 / §D 治理债）、四份侦察原文（`recon-A-visual-verification.md` 639 行 · `tmp/recon-B-spec-impl-prereqs.md` 494 行 · `recon-C-backlog-reconciliation.md` 253 行 · `recon-D-governance-debt.md` 493 行）与 **`user-decisions.md`（U1–U5，需用户拍板）**。⚠️ **该目录整体 gitignored、永不入库**，故此处**不给相对链接**（先例：批 4 计划曾因一条指进 `.superpowers/` 的相对链接让导出树 `docs-check` 必红，修复提交 `0228a013`）—— 需要读裁决的读者请在本地工作树按上述路径打开。

**输入材料（开工前六份，优先级即此序）**

1. **控制方裁决 `controller-rulings.md`**（§0/§1/§2/§3/§4；本计划的**最高行动依据**）
2. **`user-decisions.md` 的 U1–U5** —— 🔴 **U1–U4 已由用户裁决（2026-09-13）并排进 `段 8f`（T24–T28）**；**U5 沿用「跳过」**。逐条接手指令见 `## 已裁决项`
3. **本计划的 `## 实测基线`**（计划者 2026-09-13 在 `dev@711ad639` 实跑五道可跑门禁 + 逐文件 `countLines()` 亲测；**下游任何任务都不得引用侦察里"批 7 收口"时点的行数/字节读数**）
4. 规格对应节（上列 `Spec` 的全部节；**§7.4 与 §4.3 是主线一的输入契约**）
5. **格式母本**：[批 7 未接线计划](./2026-09-13-frontend-redesign-batch7-unwired.md)（2,612 行；本计划的章节骨架、Global Constraints 写法、任务卡格式、`### 每个任务的统一作业模式`、`## 实测基线`、`## 陷阱`、`## 诚实边界`、`## 收口回写八节` 全部照它）· 姊妹计划 [批 6 动效](./2026-09-12-frontend-redesign-batch6-motion.md) · [批 5 视图层](./2026-09-12-frontend-redesign-batch5-view-layer.md)
6. **批 7 裁决台账 `.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/rulings.md`（2,457 行 / §C0–§C63）** —— 🔴 **教训来源**；🔴 **章节不是数字顺序**（实际序 = §零 → §C1–§C11 → §C12–§C28 → §C31–§C54 → §C55–§C63，其中 §C29/§C30 插在 §C54 之后、§C18 在 §C30 之后）。**只读头部会漏掉 P-31～P-34 与 C55–C63**。本批已由只读子单元**全文件逐段通读**，抽取件在 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/sub-rulings-extract.md`（305 行）

**🔴 本版最重要的三条（读别处之前先读这三条）**

1. **用户前提（最高优先级，§0）**：**批 8 只提交本地仓库，暂不推送远端** —— **`git push` 一律禁止**；派单与作业书里**不得**出现「推送由控制方做」这类批 7 措辞，**也不得**以「批 7 已推」为由推定批 8 也可推。
2. **主线一的两条能力都走「零新 IPC / 零 schema / 零 Rust」**（控制方 §2 A1/A2 逐字）：`get_session_detail`（`app/src-tauri/src/commands_session.rs:137` → `:164`）**已返回 `segments` + `ocr_blocks`**；段级身份走**派生序号**，**明确不开**「新增段级身份」与「新 command」。⇒ 规格 §7.4 §D 的「必须另裁」**在批 8 不再是阻塞**（裁决见 §2 A1/A2），**但规格必须就地加注**（否则下一个读者还会按 §D 的字面读）。
3. **观感面是「收编」不是「立项」**（控制方 §2 主线二 V1）：批 3 的 `viewport-probe.mjs`（**19,286 B / 299 行**，实测）已是成品级真像素面仪器 ⇒ 动作 = **搬出 gitignored `tmp/` + 判据参数化 + 对准 14 条欠账**，**不是**新造仪器；🔴 **profile 必须落 `$env:TEMP`**（批 3 陷阱 #19；侦察阶段又踩过一次：**1,241 文件 / 32.4 MB**）。

---

## Global Constraints

### 一、用户前提（🔴 **最高优先级，违反即批次失败**）

1. 🔴 **只本地提交，暂不推送远端**：`git push`（含 `--force` / 任何远端写操作）**一律禁止**；推进远端**须用户另行明示**。本批的**唯一强制约束**是「提交留在本地、工作树可复现」。
2. 🔴 **U1–U4 已由用户裁决（2026-09-13，控制方下传）⇒ 已排进 `段 8f`（T24–T28）**；**U5 沿用「跳过」**。裁决摘要（**逐条落到单元**）：

   | # | 用户裁决 | 落到哪个单元 | 关键约束（逐字） |
   |---|---|---|---|
   | **U1** | 🔴 **a = 都修** | **T27**（配置通道）+ **T28**（删会话删音频）—— **拆成 2 个单元**（不同文件、不同风险面） | ① `AudioStoragePanel` 的**假开关要变成真通道**（`AudioStoreConfig` 现有 **10 处构造点、无 JSON/env 通道** ⇒ `status.enabled` **恒 true**）⇒ **开一条真配置通道**（配置落盘或 env）+ 幂等 + 边界 + 判据；② **删会话要删音频** ⇒ 动 `app/src-tauri/src/commands_session.rs`（**§10 相邻**）+ 处理「删除失败 / 部分删除」边界 |
   | **U2** | 🔴 **c = 删除** | **T25** | 🔴 **必须区分两件事**：**「移除 `"default"` 作为合法槽位的读写路径（代码级）」**（**做**）与 **「物理抹除用户已存的密钥数据」**（**不做**）⇒ 两者**分开写、分开判据**；⚠️ **登记风险**「仅有 `default` 槽的真机用户凭据会失效（需重填）」—— **本环境测不了**（真机跳过）⇒ 进诚实边界 |
   | **U3** | 🔴 **a = 归档到 `docs/archive/`** | **T26** | 🔴 **按 `docs/archive/README.md` 的 6 步日收工 SOP 落地**（不是「一个 `git mv`」）：**当日日期夹**（**取实际执行日**，不是 `review-2026-09-11.md` 里的 09-11）+ **从 `2026-09-09/tech-debt.md` 继承滚动清单** + 当日 README + 活跃区索引更新 + **`docs-check` 扫描数变化必须实测归因** |
   | **U4** | 🔴 **d = 入库 + 按需入口 + 写死触发条件** | **T12**（入库那一半）+ **T24**（入口与触发条件那一半） | 仪器落 `scripts/`；**正式调用形态**（`npm run check:visual` 或等价手工入口）+ **文档写死触发条件**（如「动了 `ui/primitives/**` / token / `.css` 时必须跑」）+ 🔴 **profile 落 `$env:TEMP` 写进仪器头注（硬要求，非选项）**；🔴 **不接 husky、不进 CI**（U4-b/c **用户未选**） |
   | **U5** | **沿用「跳过」**（控制方按建议默认） | **不排单元** | 批 8 的验收表述**逐字写明「未覆盖 IPC 壳 / WebView2」**；真机 pass 的 **7 条继续登记、不假装完成** |
3. **`docs/tech-debt/` 的形态（U3 裁决 = 归档 ⇒ 本批**处置它**，且**只做归档**）**：🔴 **在 T26 落地之前**，全批 `git status --porcelain` 的**预期**是**恒为一行 `?? docs/tech-debt/`**（本计划者实测，2026-09-13）；**T26 落地之后**，该目录**不再存在**（内容进 `docs/archive/<执行日>/`）⇒ 🔴 **`git status` 的预期变为「空」**，且 `docs-check` 的读数**会变**：
   - **本计划者实测（归档前）**：`docs-check` = **扫描 281 / 检查 181**（工作树，**含未跟踪的 `docs/tech-debt/`**）；**提交树**读到 **280 / 180** 时**必须逐字归因到它**。🔻 **E8-12 时点更正（2026-09-13，E8 复测）**：**当前真值 = 282 / 182**（`5852cdc4` 入库后 +1/+1）⇒ 本行与下一行的 4 个数字**一律按「旧时点读数」读**，**不得**再当判据基线（见 `## E8` §E8.12）。
   - 🔴 **归档后的读数必须实测、不得推断**（控制方的预测 = **扫描 281 → 282 · 检查 181 → 181**，依据 `scripts/docs-check.mjs:108-110` 的 `INCLUDE_ARCHIVE` 分支：归档文件**进 `files`（扫描）但不进 `activeFiles`（检查）**）⇒ **T26 的 Verification 第 1 条就是这条实测**；**不符 ⇒ 给旧值 / 新值 + 归因**。🔻 **E8-11 更正（2026-09-13）**：该预测建立在**旧基线 281/181** 上；现基线 **282 / 182** ⇒ **修正预测 = 扫描 284 / 检查 181**（结构算术：`files` 282 −1 +3 = 284；`activeFiles` 182 −1 +0 = 181），**仍必须实测**。
   - 🔴 **引用只写必要片段**、**不得**把它的正文写进任何入库文档（`## 诚实边界 §三` 逐字保留这条纪律）。


### 二、范围（控制方 §1/§2；规格 §10 批 8 行 `:800` 逐字）

- **规格 §10 批 8 行逐字**：`| **8 治理收口** | 豁免表终态 · 回写 ui-ux-system.md / theme.md · 新增动效规范章节 · 需求池同步 | 11 条验收全达标 |`（**本计划者逐字复核于 `:800`**）。
  - 🔴 **两处按加注读**（规格 `:1019-1025` 逐字）：① 「**新增动效规范章节**」**已在批 6 落地**（`docs/standards/motion.md`，`bffed928`）⇒ **留批 8 的是 `docs/product/ui-ux-system.md` / `theme.md` 的四层动效 / 三档强度回写**；② 「**11 条验收全达标**」= §11 的 11 条**整册验收**，**不是批 8 的行内验收** ⇒ 本批**只兑现其中与三条主线直接相关的部分**，其余**逐条登记去向**（见 `## 诚实边界 §二`），**不得**声称「11 条全达标」。
- **本批的「三条验收」= 三条主线的验收**（本计划的定义，**明确写死以便收口对账**）：
  1. **主线一**：**「带证据三轨」有实现（模型 + 视图 + 容器取数，E1/E2/E3 三条口径各有机器判据）** 且 **「审校模式」有实现（模式位 + 纯 CSS 覆盖 + 三出口）**；
  2. **主线二**：**观感仪器已入库且可复跑**，且 **14 条观感欠账逐条有读数或具名归属**（**「有读数」≠「已统一/已修好」**）；
  3. **主线三**：**四条治理余项各自落地或明确关账**（CI 挂载 · `validate-all.mjs` · `SURFACE_TAG_REGISTRY (file,tier)` · `subject ≤50` · 散文探针转正）。
- 🔴 **另计（不并入三条主线，但 T22 必须单列其兑现度）**：**段 8f 的四项用户裁决**（**U1 音频两条 · U2 凭据槽代码路径 · U3 `docs/tech-debt/` 归档 · U4 观感按需入口**）—— 各自的验收见 **T24–T28**；🔴 **它们的范围是「用户裁决」给的，不是本计划自行扩大的**（2026-09-13 控制方下传）。
- 🔴 **本批的非目标清单（违反即任务失败）**
  1. 🔴 **`docs/tech-debt/` 只做「归档」这一件事**（U3 = a）：**不删除、不写进 `.gitignore`、不改其内容**（内容**零改动** —— 归档 = 换路径 + 进跟踪）；🔴 **不引用其正文**（除 T26 报告里「本文件系归档自 `docs/tech-debt/`」这一句必要的来源说明）。
  2. 🔴 **音频两条按 U1 = a 做**：`AudioStoragePanel` **开真配置通道** + **删会话连音频** ⇒ 见 **T27 / T28**；🔴 **不得**只做半边（「都修」是用户裁决的**整体**）。
  3. 🔴 **凭据槽 `"default"` 按 U2 = c 做，但只做「代码路径移除」**：**不得物理抹除**用户已存的密钥数据；见 **T25** 的两条分开判据。
  4. **不做真机 / WebView2 冒烟**（U5 沿用「跳过」）：**不得**把任何 jsdom / headless Edge 读数写成「真机验证通过」。
  5. **不开 `NON_MIGRATED_14` 例外**（承 §C2.1）：那 **14 个文件**（`dialogMigration.e.test.ts:115-122` 是机器真源）本批**一律不动**，包括**不得**以「子组件间接引用」的形式把 `ui/primitives` 引进去。
  6. 🔴 **不动生成物**：`app/src/ui/tokens.css`（**生成物**，`:2` 逐字「由 scripts/gen-tokens.mjs 生成，请勿手改」，守卫 `tokens.drift.test.ts:25-28`）· `docs/standards/line-limit-exemptions.md`（**生成物**，`:3-4` 逐字「本文件是生成物」）。**审校模式的 CSS 覆盖落在新建的 `app/src/ui/proofread.css`**（控制方 §2 B1 裁决），**不碰 `gen-tokens.mjs`（400 行）与 `Text.css`（66 行）**。
  7. 🔴 **不新增 `NoteViewSlot` 的可选槽**（承 §C10.3）：第三视图若需要额外 props，**只许走包装件 / 容器侧**（先例 `NoteCardFlowWithSeek.tsx` 46 行）。
  8. 🔴 **不写第 3 支手写 markdown 解析器**（规格 §7.4 §D4 逐字）：证据列**必须**复用 `utils/markdownLine.ts` / `NoteMarkdown` 的既有渲染链。
  9. 🔴 **不改 `.husky/pre-commit` 的命令链**：本批把「末尾换行判据」并进 `line-limits.mjs` 的 `--full`（**执行者天然存在**：pre-commit 与 CI 的无条件 job 都已在跑它），把脚本域门禁挂进 **CI 的无条件 job** ⇒ **pre-commit 零改动**（该文件是共享文件，零改动 = 零风险）。🔴 **U4 的按需入口也不进 husky**（用户**未选** U4-b）。
  10. 🔴 **不扩 `line-limits` 的扫描域**（`scripts/**/*.mjs` 与 `app/vite.config.ts` 仍在域外）：扩域是**一条独立的门禁政策变更**，控制方未裁 ⇒ **只登记 + 具名归属**（见 `## 诚实边界 §二`）。
  11. 🔴 **不进 CI 的观感仪器**（U4 的接线形态 = d）：**不接 husky、不进 CI、不加 CI job** —— 只做「`npm run check:visual`（或等价手工入口）+ 文档写死触发条件」。


### 三、三条主线的施工序（控制方 §2，逐字不削弱）

| 序 | 内容 | 为什么这个序 |
|---|---|---|
| **1** | **先拆 `scripts/line-limits.mjs`**（恰 300 行 · 余 0） | 🔴 控制方 §2 **G1** 逐字：「末尾换行盲区」的修法**天然属于它**，而三个门禁脚本**全都恰 300** ⇒ 拆件是修法的前置 |
| **2** | **两条能力**（A 纯函数片 → A 视图片 → B 模式位片 → B 入口片） | 两条都**零新 IPC / 零 schema**（§2 A1/A2/B1）；A 的宿主面（`NotesReadingColumn.tsx` 300 · `.views.test.tsx` 300）与 B 的入口面（`TopBar.test.tsx` 299）**都是贴边件 ⇒ 先拆件** |
| **3** | **观感收编**（仪器入库 → 参数化 → 对准 14 条欠账） | 仪器不在 `scripts/` 里就没有读数面；读数需要**新鲜构建** ⇒ 必须排在**独占窗口**里（与收口互斥） |
| **4** | **治理余项**（CI 挂载 · 化石 · 登记制 · 提交信息牙 · 探针转正） | 全是**共享文件 / 门禁面**改动 ⇒ 排在功能落地之后，避免与在飞单元抢 `.github/**` 与 `commitlint.config.js` |
| **5** | **收口**（八门禁终态 + 三条验收 + 二分清单 + 收口评审 + 独立复核） | 独占窗口、串行真跑（承 §C6.1） |

### 四、控制方裁决 → 本批执行形态（压缩表；**结论一字不改**）

| # | 裁决要点（压缩） | 本批执行形态（任务 / 判据 / 登记） |
|---|---|---|
| **§0.1** | 只本地提交、不推远端 | 全批；**每条任务卡「提交信息」节末尾都写死 `不 push`** |
| **§0.2** | 需用户裁决项须给足描述信息 | `user-decisions.md`（控制方已写）；🔴 **U1–U4 已裁并排进段 8f；U5 沿用跳过** ⇒ 见 `## 已裁决项` |
| **§1** | 范围：主表 47 行核对结果；**「已修却仍被当成待办」4 条不得排进批 8** | **非目标**：`usePlayheadJump` 清理 · `update_fragment_group` · 深链视图记忆 · `ai_protocol.rs` 的 `AiEnhance*`（**逐条在 `### 表 4` 给实测**） |
| **§1** | **2 条「前提不成立」**：`@types/katex`（在 `dependencies` 且是 `rehype-katex@7.0.1` 的硬传递依赖）· `position:"fixed"` 的潜在陷阱（判据件**先剥注释** ⇒ 头注字面量进不了 `CROSS_LINE_34`） | **只做措辞勘误/关账**（T3 的文档面 + T16 的登记面），**不排实施单元** |
| **§2 A1** | 两条能力都走**零新 IPC** 路线（`get_session_detail` 已返回 `segments` + `ocr_blocks`） | **T6/T8/T10**（A 三片）；**不得**新开 command |
| **§2 A2** | 段级身份走**派生序号**（(a)）；**明确不开** (b) 与 §D3 的新 command | **T6**（模型片）；**T3** 把该裁决加注进规格 §7.4 §D2/§D3 |
| **§2 A3** | 「三轨」的实现口径 = **笔记段落轨 + 转写段轨（`session_segments.id`）+ OCR 块轨（`session_ocr_blocks.id`）**；🔴 **规格未逐字给** ⇒ **必须把该定义以「原文 + 就地加注」写进规格 §7.4** | **T6**（定义进代码注释 + 判据）+ **T6 的规格加注半**（与 T21 的终态回写对拍） |
| **§2 A4** | E2 的**容差取值属实现批**；**必须写进判据而非注释**，报告给**取值依据** | **T6** 的 Step 3 + V2（容差常数具名导出 + 边界两侧断言） |
| **§2 A5** | 复用既有渲染链（`utils/markdownLine.ts` / `NoteMarkdown`）；**不得新写第 3 支手写 markdown 解析器** | **T8**（视图）与 **T10**（容器）的唯一实现路径 |
| **§2 B1** | CSS 覆盖落点 = **新建专用 CSS 文件**（`app/src/ui/proofread.css`）；**不动 `gen-tokens.mjs`、不动 `Text.css`**；**同时**把「§4.3⑤ 点名的落点是生成物」以原文 + 就地加注写进规格 §4.3 | **T9**（CSS）+ **T11**（规格 §4.3 加注） |
| **§2 B2** | `proofread` 一名**已被 LLM 文本校对占用**（实测 46 处 / 11 文件）⇒ 新功能的 `data-*` **必须换名**：用 **`data-proofread-mode`**，**不得**用 `data-proofread`；规格 §4.3 加注**消歧** | **T9**（属性名常量）+ **T11**（规格消歧加注） |
| **§2 V1** | 观感：**收编**批 3 的仪器（搬出 gitignored `tmp/` + 判据参数化 + 对准 14 条欠账）；落点 `scripts/` | **T12**（入库）→ **T13/T14/T15**（读数） |
| **§2 V1** | **必须随仪器登记其盲区**：验的是 **WebView2 引擎不是 IPC/窗口层** · headless 默认 `prefers-reduced-motion: reduce`（**可覆写**）· headless 滚动条占位 `0` · 必须用 `Emulation.setDeviceMetricsOverride` · `--dump-dom` **抓不到** | **T12** 的仪器头注 + 判据；**读数任务的诚实边界必须逐条复述** |
| **§2 V2** | 🔴 **Edge/browser profile 必须落 `$env:TEMP`，绝不许落仓内**（批 3 陷阱 #19；侦察阶段又踩过一次 **1,241 文件 / 32.4 MB**）⇒ **写进仪器头注 + 作业书** | **T12**；**T12 的 V1 判据含「跑完仓内零新增 profile 目录」** |
| **§2 V3** | **是否常驻门禁 / 是否进 CI** ⇒ 属用户裁决 | 🔴 **用户已裁 = U4-d**：**入库 + 按需入口 + 写死触发条件**；**不接 husky、不进 CI** ⇒ **T24**（见 `## 已裁决项 · U4`） |
| **§2 V4** | `docs/standards/` 下**无** `ui-ux-system.md` / `theme.md` / `motion-*.md` —— 它们在 **`docs/product/`** ⇒ 回写落点以此为准 | **T13/T15** 的落点；**T7 的 `Files` 表逐条按此写** |
| **§2 G1** | 🔴 **先拆 `line-limits.mjs`** | **T1** → **T2** |
| **§2 G2** | **不补 `scripts/**` glob**：`pr-check.yml` 的 `on:` **无 `paths`**，第 6 个 job `line-limits`（实测 `:178`）**既无 `needs` 也无 `if`** ⇒ **把脚本域门禁挂进这个无条件 job** | **T17** |
| **§2 G3** | `scripts/validate-all.mjs`（62 行）是**重写前的化石**（`client/` / `server/*` 全不存在；头注自陈 Electron 期布局；且是 `session-route.mjs` 的 `rule-build-validation` 路由目标）⇒ **单列一个单元（删 / 重写 / 改路由 —— 三选一，含代价）** | **T18**（本计划取「**删 + 改路由**」，代价与替代一并给出） |
| **§2 G4** | `SURFACE_TAG_REGISTRY` 登记行键从 `file` 改成 **`(file, tier)`**（**只改 3 处**；legacy 和锁等不变量保留）；🔴 **实施前必须复测不变量** | **T19**（含不变量复测 + 变异体） |
| **§2 G5** | 新输入：① 🔴 **`--dist` 会开启懒侧判定 ⇒ 陈旧产物可假绿** ② **`shift-` 族的 212 B 死预算** ③ **18 族实测已超各自上限、合计 +203 B** ④ `dom-compare.mjs` 写过被跟踪目录再删 | **①→ T14 的登记 + `## 陷阱` P-37**；**②③→ T14 的读数/登记**；**④→ `## 陷阱`（承 P-21 同族）** |
| **§2 G6** | `check-exemption-prose.mjs` 是否转正为闸 ⇒ **单列**；🔴 **不并入八闸的集合**（保持批 7 定的对账基线） | **T17 的第 3 步**（只挂 CI step；**八闸终态表仍是 8 行 + 附闸单列**） |
| **§3.1** | 只本地提交、不推远端 | 同 §0.1 |
| **§3.2** | 🔴 **新增陷阱 P-34**：一切「全仓 / 全树 / 0 命中」扫描，**域一律取 `git ls-files`（入库域）**；与 **R8.7** 配套：**必须声明域是否为入库域** | `## 陷阱` 的 **P-34** 条 + `### 表 3` 的仪器口径 |
| **§3.3** | **P-31 / P-32 / P-33 全部沿用**（`--outputFile` 读前查 mtime · `Set-Content -Encoding UTF8` 写 BOM ⇒ 用 node `writeFileSync` · `ref` 操作走脚本 + 断言退出码 + 回读） | `## Global Constraints · 仪器纪律` + 全批 |
| **§3.4** | 🔴 **回写类提交的三道判据**：`−` 列 = 0 · **纯空白行删除 = 0** · **标题/锚子序列对拍**（被删/被改 = 0） | **T3/T11/T15/T21** 的 Verification 表逐条落地；🔻 **E8-5 适用域更正（控制方 §10.1 逐字，2026-09-13）**：「`−` 列 = 0」**只适用于「纯追加型回写」**（在既有文本里只增不改），🔴 **不适用于 (a) 替换型**（代码散文改数字等）**与 (b) EOL / 空白修正型**（末尾换行归一）⇒ 这两类的正确判据 = **语义等价证明**：**替换型** ⇒ hunk 只含**被替换的那几行** + **常数 / 判据零改动**；**EOL/空白型** ⇒ **`git diff -w --numstat` 输出为空** + **`countLines()` 前后逐字相等** + **空白行 Δ = 0** + **逐文件字节证明**（`工作树(归一后) == git show HEAD:<p> + 恰好一个 0x0A`）⇒ 全文与实测见 `## E8 · 机器期望的系统扫描` **§E8.5** |
| **§3.5** | 数字必须带**口径与时点**；🔴 集合差主张**必须列交集与差集**，**不许只给计数** | 全批：任务卡的「读数三要素」= 命令 + 口径 + 时点 |
| **§3.6** | 🔴 **判据必须验牙口**：每条三条全答（变异体是什么 / 真改变行为吗 / 红在具名断言吗）；**答不全者标「牙口未证」** | **每个任务卡的 `Verification` 表**（第 2 列 = 专属变异体；第 3 列 = 期望） |
| **§3.7** | 批 7 的 **7 条「牙口未证」是批 8 的判据加固输入**（最实质：V3 逐文件对拍的「红」是 exit code 且日志 `exit=1` 与 `failed=0` 自相矛盾；**源码探针只打印、零 `expect`**） | **本批的判据设计纪律**：① 任何「红」必须落在**具名断言**上；② **源码探针必须带 `expect`**（`batch7UiWiring.test.tsx:203-216` 是最低可接受形态：**正控 + 负控 + 断言**） |
| **§3.8** | `--reporter=basic` 已移除 · `numTotalTestFiles` 不存在（读 `testResults.length`）· `git archive` **必须 `-o` 落盘** + `-c core.autocrlf=false` | `## 仪器纪律` + 收口单元 |
| **§4** | 批 7 残留的 5 处入库文档待更正（**并入文档回写单元，不单独出提交**） | **T3**（4 处规格 + 1 处代码内散文）；**T3 的 `Files` 表逐字给出** |

### 五、🔴 冻结值基线表（**本计划者 2026-09-13 在 `dev@711ad639` 实测**；口径与时点见左列）

> **读数三要素（§3.5）**：口径 = `countLines()` / 文本直读 / 门禁脚本自报；时点 = **2026-09-13，工作树 `git status --porcelain` = 仅 `?? docs/tech-debt/`**；域 = 见各行「域」列。**探针**：`.superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/p1-lines.mjs` / `p2-frozen.mjs` / `p3-frozenkeys.mjs` / `p4-census.mjs` / `p5-lazy-eol.mjs` / `p6-matrix.mjs` / `p7-blast.mjs` / `p8-rest.mjs`（全部只读，落盘件同名 `.txt`）。**复现命令**：`node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/p<1..8>-*.mjs`。

| 冻结键 | 现值（**本计划者实测**） | 上限 / 语义 | 本批是否触碰 |
|---|---|---|---|
| `FROZEN_MUTED_GRAY_TOTAL` / `_FILES` | **63** / **43**（`textBaseline.ts:32/:35`；逐文件表 `:56` 的 Σ = **63** ✅ 自洽） | 双向钉死（`toBe` + `<=`）· **只许降** | ⚠️ 间接（T6/T9/T11 的新 UI 不得新增 `#9ca3af`） |
| `FROZEN_FONT_OOB_TOTAL` / `_FILES` / `ANCHOR` | **551** / **123** / 锚 `action-center/ActionCenterPanel.tsx = 19`（`textBaseline.ts:38/:41/:49`；逐文件表 `:176` 的 Σ = **551** ✅、键数 **123** ✅） | 双向钉死 · **只许降** | ⚠️ **T3 的散文更正**（`:19` 写 `551/122`、`:174` 写 `551/120` —— **两处都过期**，真值 `551/123`）；T6/T9/T11 的新 UI 不得新增 <12px 字号 |
| `FROZEN_BORDER_TOTAL` / `BY_FILE` / `BORDER_ANCHOR` | **201** / **99 键**（Σ = **201** ✅）/ 锚 `entries: 99 · ActionCenterPanel.tsx = 8`（`surfaceBaseline.ts:86/:89/:255`） | 上界（`<=`）· 今天贴住 ⇒ **余量 0** | ⚠️ 间接（T8/T9/T11 的浮层一律用 token / `<Surface>`） |
| `FROZEN_RADIUS_OUTLIER_TOTAL` / `BY_FILE` / `RADIUS_OUTLIER_ANCHOR` | **254** / **107 键**（Σ = **254** ✅）/ 锚 `entries: 107 · KnowledgeSystemWizard.tsx = 9`（`surfaceBaseline.ts:143/:146/:256`） | 上界 ⇒ **余量 0** | 🔴 **`App.tsx` 有键 = 1**（T9 要动 `App.tsx` ⇒ 不得新增越界圆角）；T8/T9/T11 同 |
| `FROZEN_SHADOW_TOTAL` / `BY_FILE` / `SHADOW_ANCHOR` | **24** / **24 键**（Σ = **24** ✅）/ 锚 `entries: 24 · NoteRowContextMenu.tsx = 1`（`surfaceBaseline.ts:204/:207/:257`） | 上界 ⇒ **余量 0** | ⚠️ 间接（浮层 `boxShadow` 一律走 `var(--ed-shadow-1)`） |
| `FROZEN_SURFACE_TAG_TOTAL` / `SURFACE_TAG_FROZEN_LEGACY_COUNT` / `SURFACE_TAG_ANCHOR` | **47** / **14** / `entries: 29 · TaskConversationView.tsx = 3`（`surfaceBaseline.ts:248/:271/:277`；登记表 `surfaceResidual.ts:178` 起始） | 三连通严格相等 + **legacy 和锁** | 🔴 **T19 改登记行键为 `(file, tier)`**（**不变量全部保留**：legacy 只许降 / 和恒 14 / Σ 登记 = Σ 实测 = 47 / 锚同步） |
| `FROZEN_NATIVE_BUTTON_TOTAL` / `BY_FILE` / `SPLIT_MOVES` | **392** / **114 键**（Σ = **392** ✅）/ `SPLIT_MOVES` 现存条目（`nativeButtonBaseline.ts:57/:60/:63/:185`） | **上界**（刻意设计的棘轮，**不得改等号** §C9.7）· `FROZEN_BTN_STYLE_CONST_LINES = 56` / `_FILES = 44` | 🔴 **`shell/TopBar.tsx` 有键 = 2**（T11 的入口按钮**必须** `Button` 原语）；`App.tsx` **无键**（T9 不得新增原生 `<button>`） |
| `FROZEN_RED_TOTAL` / `FROZEN_RED_BY_FILE` | **113**（`statusLineBaseline.ts:92`；逐文件表 `:22`） | 双向钉死 | 本批零触碰（引用，未复测） |
| `emptyStateRatchet` `FROZEN_REST` / `_TOTAL` | 5 键 / **5**（`emptyStateRatchet.test.ts:150/:159`） | 区间恰等于实测 + 总数恰 5 | 本批零触碰（引用） |
| `FROZEN_NUMERIC_ZINDEX` / `ZINDEX_ACCOUNTS` | 3 条（`zIndex.guard.test.ts:109`；注册表 `:75`） | 集合差 + 无过期项 | 本批新浮层一律 `zIndex("popover")` ⇒ **零新增裸数字** |
| `buttonMigration` `MIGRATED_SITES` / `MIGRATED` | **99** / **35 文件**（`buttonMigration.test.ts:168/:205`；`BUTTON_SHAPES` 键数 == 35） | 逐文件 JSON 相等 + 总数相等 | 本批的新文件**不进普查**（`MIGRATED` 是固定 35 文件名单）；T11 动 `TopBar.tsx`（**不在 35 内**）⇒ **零触碰** |
| `dialogMigration.e` `CROSS_LINE_34` / `NON_MIGRATED_14` | 34 / **14**（`dialogMigration.e.test.ts:84/:115`，文件**恰 300 行**） | 盘上对拍 + 文本级禁 `ui/primitives` | 🔴 **本批零改动**（§C5.2 + 非目标 5）；**T19 只改 `surfaceResidual.ts` / `surfaceTagRegistry.test.ts`，不碰它** |
| `FROZEN_VIEW_KEYS` / registry | `note = ["raw","cardflow"]`（`registry.ts:134` 区）· registry **311 / 311 / 0**（门禁实跑） | 视图键冻结 + IPC 三向一致 | 🔴 **T8 加第三项**（`NOTE_VIEWS` + `FROZEN_VIEW_KEYS.note` **两处同改**，`registry.test.ts` 对拍）；T10/T8 **不动 registry 数字** |
| `line-limits` 登记条目 / `FROZEN_OVER_LIMIT` | **121 条** / `>600 = 0`（门禁实跑 exit 0；`FROZEN_OVER_LIMIT` 实测为空） | 只许降 | 🔴 **T1 拆件不得改任何读数**；**T2 的末尾换行归一不改 `countLines()`** ⇒ 表数值**一字不动** |
| `lazyBudget.json` | **37 chunk / 637,501 B**（总上限 = 637,501，**零余量**）· **38 族** · Σ 逐族上限 = **638,029** | 总上限**只许降**；逐族可「同提交重冻」（§C32.3） | ⚠️ **T12–T15 的真构建会改懒侧字节** ⇒ 若越界则**同提交重冻受影响族**（总量不得抬高）+ 逐键 diff |
| 首屏预算 | **105.95 kB gzip**（余 **94.05 kB**；原始 332,301 B；入口 `index-BHuUeQPz.js`） | 200 kB（`performance.md:28`） | 同上 |

### 六、门禁基线表（**本计划者 2026-09-13 串行实跑**；标注「引用」者未重跑）

| 门禁 | 命令 | 本计划者实跑读数 | 出处 |
|---|---|---|---|
| ① 行数 | `node scripts/line-limits.mjs --full` | **exit 0** · `>600 硬限 0（棘轮内）· 301–600 档 121 · 登记条目 121` | **实跑** |
| ② 文档 | `node scripts/docs-check.mjs` | **exit 0** · `扫描 281 个 Markdown 文件（检查 181 个…）` + 五条 ✅（🔻 **E8-12 时点更正：现读数 = 扫描 282 / 检查 182**） | **实跑**（工作树；**含未跟踪的 `docs/tech-debt/`**） |
| ③ IPC 注册 | `node scripts/check-command-registry.mjs` | **exit 0** · `定义 311 / 注册 311 / 重复 0` | **实跑** |
| ④ 类型 | `cd app; npx tsc --noEmit` | **exit 0 · 0 错** | **实跑** |
| ⑤ 首屏 + 懒侧 | `node scripts/check-bundle-budget.mjs --no-build` | **exit 0** · 首屏 **105.95 kB**（余 94.05）· 懒侧 **37 个 / 637,501 B** ⇒ **⏭ 未判**（`--no-build` 裸跑只判首屏） | **实跑** |
| ⑤b 懒侧逐族 | `--no-build --dist app/dist --json` + 自算 | 37 chunk / 637,501 B · **未归族 []** · **超上限族 18 / 38 · Δ 合计 +203 B（全部在 64 B 容差内）** · **零 chunk 却有上限的族 = `shift-`（212 B）** | **实跑（自算）** |
| ⑥ 首屏可达图 | `node scripts/bundle-eager-graph.mjs` | **exit 0** · `首屏静态可达应用源文件：111` · `首屏拉入的 npm 包：7` | **实跑** |
| 附 散文对拍 | `node scripts/check-exemption-prose.mjs` | **exit 0** · `散文「**311 条**」== 门禁「定义 311」` · `App.tsx 登记 549 == countLines 549` | **实跑**（该脚本自述**非门禁、只能手工跑**） |
| ⑦ 前端用例 | `cd app; node node_modules/vitest/vitest.mjs run --reporter=json` | **引用**：`229 文件 / 2225 用例 / 2224 passed / 1 failed`（唯一红 = `SessionDetailPanel` 的 **W1**，**负载敏感**、单跑 ×3 全绿） | **引用**批 7 `task-22-report.md:65-66`（树 `c0bff722`，2026-09-13）；**本批的 8e 必须自己重跑（冷 + 热两次）** |
| ⑧ Rust | `cd app/src-tauri; cargo test --test app_lib_tests` | **引用**：`running 2360 tests` → `2354 passed / 0 failed / 6 ignored` | **引用**同上 `:68`；🔴 **修正（U1/U2 裁决后）：本批有 Rust 改动（T25/T27/T28）⇒ 8e 必须真跑** |
| 附 clippy | `cd app/src-tauri; cargo clippy --all-targets` | **引用**：批 6 基线 lib warnings **15** | 批 6 收口读数；🔴 **本批有 Rust 改动 ⇒ 8e 跑一次并给集合差异**（`-D warnings` 下 `unused_imports` 会变 error：**条数相同 ≠ 集合相同**） |

> 🔴 **本批不新增门禁成员**（八闸集合不变；`check-exemption-prose` 只以 **CI step** 转正，**不入八闸对账**）。🔴 **一切门禁与变异体实验一律串行**（§C6.1 / P9）；**任何「并行跑出来的红」不得当缺陷登记**。
> 🔴 **时点注（必读，否则下游会把「+1」误读成回升）**：上表 ② 的 **281 / 181** 是**本计划文件入库之前**的读数；**本计划文件本身入库后**（`5852cdc4`）工作树读数 = **282 / 182**（**+1 扫描 +1 检查**，本计划者**已实测**：新增一个 `docs/superpowers/plans/*.md` 会同时进 `files` 与 `activeFiles`）⇒ 下游对账时：**提交树基线（含本计划文件）= 282 / 182**，**不含本计划文件 = 281 / 181**；两者差额**必须归因到本计划文件本身**。🔴 **T26 的归档会再改这个数**（预测 282 → 283？—— **不推断，T26 必须实测**；控制方给的预测 282/181 是**归档前基线**下的口径）。🔴🔴 **常设提醒（E8-12 立此为本批反面教材，2026-09-13）**：**凡引用 `docs-check` 的「扫描 / 检查」计数，必须注明时点**；且🔴 **计划文件自身入库会使两个计数各 +1** —— 本批**共 30 行**写了过时的 `281 / 181`（其中 **26 行已就地更正**，**12 张卡 + 4 处全局**：`T2 / T3 / T4 / T5 / T6 / T11 / T12 / T14 / T16 / T18 / T21 / T26` + `Global Constraints 一/六 与 表 1` + `已裁决项 U3`，逐条位置见 `## E8` §E8.12），**与 E8-1/E8-3/E8-4 同源**（计划期未把「计划自身入库」的副作用算进去）⇒ **此后所有批次的计划编制：凡写计数器期望值，一律写「时点 + 该时点之后的已知 Δ」**。
> 🔴 **⑦ 的 1 条红（W1）的处理纪律**：按 **R-FLAKE** 三条（≥3 次重复 + 与可观测量相关 + 该文件不在写集内）**缺一 ⇒ 只写「未判定」**；**不得**在报告里写「全绿」。

### 七、提交纪律（🔴 **承 §C18.2：共享文件走 blob 构造，不走暂存区**）

- **🔴 全批禁止 `git push`**（用户前提）；也**禁止** amend / rebase / force push / `git add -A` / `git add .` / `git stash` / `git checkout -- <path>` / `git restore <path>`（**只许 `git restore --staged`**）/ `git clean` / `git reset --hard` / `git add -f`（🔴 `.superpowers/**` **永不** `git add -f`）。
- **共享文件**（`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` · `docs/versions/v0.22.md` · `docs/standards/line-limit-exemptions.md` · `docs/standards/testing.md` · `docs/standards/performance.md` · `.github/workflows/pr-check.yml` · `commitlint.config.js`）**一律不走 `git add` 整份、不走 `--only`**，改用 **blob 构造 + `update-index --cacheinfo`**：
  ```
  git show HEAD:<path>            # ① 取 LF 规范版本（不看工作树）
  （在 tmp 里只改自己那几行）
  git hash-object -w <tmp>        # ② 造 blob
  git update-index --cacheinfo 100644,<blob>,<path>   # ③ 只把该 blob 放进索引
  git diff --cached --stat        # ④ 自证：只有自己的 hunk
  git commit                      # ⑤ 不带 --only
  ```
- ✅ **廉价前置检查（先做）**：`git diff HEAD -- <shared path>` —— **只有自己的 hunk** ⇒ 两种方式都行；**出现别人的 hunk** ⇒ 🔴 **必须**用 blob 构造（或 **STOP 报控制方**）。
- ✅ **新建文件**：`git add -- <path>` 后 `git commit`（🔴 **不要** `--only`）；**普通改动**：`git add -- <自己的路径…>`（**不要** `git add -A`）。
- ✅ **提交后强制自证**：`git show --name-only --oneline -1` ⇒ **只能列出自己的路径**；**同时核 parent 必须是当前 HEAD**（承 §C41.3 / §C52.5）。
- ⚠️ **创建任何目录前先 `git check-ignore <path>`（不带斜杠）验证**：根 `tmp/` **未被 gitignore** ⇒ **临时文件只许写 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/<unit>/`**。
- ⚠️ **`--write` 只在「无并行在飞改动」的独占窗口跑**；本批**首选不跑** `line-limits --write`（T2 的末尾换行归一**不改行数** ⇒ 表数值一字不动 ⇒ **无需跑**）。
- 🔴 **`--no-verify` 默认禁用**；仅当承 §C14.3 的四条全部成立时，才允许在**单个**提交上使用，且**必须在该任务报告里逐字登记**（原文见批 7 计划 `## Global Constraints`）。本批**设计为零处需要**：唯一一次「中间态撞钩子」的风险点是 T2（改 `line-limits.mjs` 的行为但表数值不变）与 T19（改判据件）—— 两者**都不改豁免表数值** ⇒ **钩子不会红**；若实测红 ⇒ **STOP 报控制方**。
- **Conventional Commits**：`<type>(<scope>): <subject>`；🔴 **subject ≤ 50 字、动词开头、无结尾句号**；本批在 **T20** 给它装上机器牙（`commitlint` 的 `subject-max-length`），**T20 之后所有提交都受它约束**。

### 八、仪器纪律（承批 1–7 的 34 类陷阱；本批最常踩的逐条列出）

1. 🔴 **本机没有 `pwsh` 二进制**，shell 是 **Windows PowerShell 5.1**（码页 `gb2312`）⇒ **中文串一律不经 PowerShell 字符串层**；读文本/JSON 一律 `node <script.mjs>`。
2. 🔴 **绝不用 `2>&1 |`**（PS 5.1 把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1）。判 exit 用 `$LASTEXITCODE` 或 `2>file`。
3. 🔴 **`>` / `2>` 写 UTF-16LE** ⇒ 落文本用 node `writeFileSync(p, s, "utf8")`；读回 PS 重定向产物必须 `readFileSync(p, "utf16le")`。
4. 🔴 **PowerShell 单行 + 嵌套引号会 `SyntaxError`**（批 6/7 各踩过；**本计划者本轮又踩 1 次**）⇒ **判据一律给可粘贴的脚本文件路径**，不写长 `node -e "…"` 单行。
5. 🔴 **一切「全仓 / 全树 / 0 命中」扫描的域一律取 `git ls-files`（**P-34**）**；**禁止递归扫工作树**（本计划者实测：对 `.superpowers/**` 递归 walk **直接 120 s 超时** —— 导出树副本污染）。**与 R8.7 配套**：除点名仪器 + 双侧自证 + 先剥注释外，**必须声明域是否为入库域**。
6. 🔴 **「0 命中」的阴性对照必须排除探针自身与其引用者**（承 §C62.8）：`zzz_no_such_symbol_zzz` **已入库**（命中 3 文件）⇒ **明令作废**；本批一律用**每次现造的随机串**（本计划者的对照串 = `zZZ_no_such_symbol_batch8_xyz`，实测 **0 命中**）。
7. 🔴 **`countLines(absPath)` 是「读盘」而不是「读文本」**（`scripts/line-limits.mjs:48-52` 的唯一实现）⇒ **必须传路径**；把文件正文当参数传进去会得到 `ENOENT` 且**错误信息里会回显文件正文**（本计划者踩中 1 次，浪费一轮）—— 登记为 **P-35**。
8. 🔴 **行号锚会随入库文档更新而漂移**：规格 §7.4 的整段锚在批 7 收尾的两次文档提交（`3bb681df` / `53bd0759`）之后**整体 +2**（侦察 B 的 `:536/:544/:545` → 本计划者实测 `:538/:546/:547`），且 `design.md` 由 **1030 → 1035 行**。⇒ **每处锚必须以「动手前当场重测」为准**，且**写锚时必须带口径与时点**（登记为 **P-36**）。**本计划全文的行号锚均已按本计划者的实测重推**（见 `### 表 5`）。
9. **`.superpowers/**` 在 `grep` 工具 / `git grep` / `git check-ignore` 三个仪器里都不可靠**（P-26）⇒ 一切台账读写只经 node `fs` 直读。
10. **`git archive` 取不到未跟踪文件**，解包树里没有 `.git`；**必须** `git -c core.autocrlf=false archive -o <tmp>/x.tar <commit>`（**先落盘再解包**，P-29）。
11. **`--no-build` 在导出树必失败**（`dist` 不入库）⇒ 导出树内要跑预算守卫必须先在树内 build。
12. **`--outputFile` 按 cwd 解析**（P-27）；**`--outputFile` 异步写盘**（P-31）⇒ **读任何 `--outputFile` 产物前先查 mtime**；🔴 **`numTotalTestFiles` 字段不存在**（文件数读 `testResults.length`）。
13. **Node 24 拒绝 `spawn('npx.cmd')`**（`EINVAL`）⇒ 跑 vitest 用 **`node node_modules/vitest/vitest.mjs run`（cwd = `app/`）**；含空格/中文的路径**不能经 `shell:true`**。🔻 **E8-13 口径实测（2026-09-13，E8 探针 11）**：🔴 **本条的适用域 = 「从 Node 子进程 spawn `npx`」，不是「在 shell 里敲 `npx`」** —— 实测三态：① **PowerShell 直接跑 `npx tsc --noEmit`（cwd = `app/`）⇒ exit 0**（10.9 s；`npx --no -- commitlint --version` 也 **exit 0** ⇒ 19.8.0）② Node 24 `spawnSync('npx', …)` ⇒ **ENOENT**、`spawnSync('npx.cmd', …)` ⇒ **EINVAL**（P4 复现）③ `spawnSync('npx.cmd', …, {shell:true})` ⇒ **exit 0**（11.16.0）。⇒ 🔴 **本计划里 16 处 `npx`（T3/T4/T5/T6/T8/T9/T10/T11/T16/T20/T22/T27 的 Step 与 Verification）一律不是勘误**（它们都是「给操作者在 PowerShell 里粘贴的一行」）⇒ **不得**一律改成 `node node_modules/...` 直调；只有**写进 `.mjs` / Node 脚本**的调用才必须用直调形态。
14. **jsdom 无 `Element.prototype.scrollTo`**（`window.scrollTo` 是 function 但**静默不动**）⇒ 断言一律用 `vi.spyOn` 数调用。
15. 🔴 **`motion/engine.guard.test.ts` 的图遍历读原始文本、不剥注释**（P-12）⇒ 在任何首屏文件（`App.tsx` / `main.tsx` / `shell/**`）里写注释时，**不得**出现 `import ... from "..."` 形态的示例代码。
16. 🔴 **一切 `ref` 操作走 node 脚本 + 断言退出码 + 回读 `rev-parse`**（P-33）；**不得在 PowerShell 一行内传参做 ref 操作**。
17. ⚠️ **写提交信息文件一律用 node `fs.writeFileSync(p, s, "utf8")`**（P-32：`Set-Content -Encoding UTF8` 会写 BOM ⇒ commitlint 读成 `subject may not be empty`）。
18. ⚠️ **块注释里不得写 `**N**/M` 或 `app/src/**/`**（P22/P23：`**/` 含 `*/` ⇒ **提前闭合块注释** ⇒ `tsc` 报 `Expected ";"`）；**凡改注释散文必须真跑一次 `tsc`**。

### 九、变异体与守卫纪律（承批 4/5/6/7，逐条适用）

1. **变异体实验一律在导出副本里做**；**绝不许在 `app/src/**` 上「改→跑→还原」**（正解 = **每个变异新解一棵树**）。
2. **CONTROL 必须在冻结提交树上取**；**harness 必须把「跑到了断言（用例数 >0）」与「跑红了」分开判**。
3. 🔴 **禁 `--reporter=basic`**（Vitest 4 已移除 ⇒ 「伪装的红」= 假证明）；用 `--reporter=json --outputFile=…`。🔻 **E8-14 实测（2026-09-13，E8 探针 11，Vitest 4.1.11）**：① ✅ **`--reporter=json` 可用** —— `node node_modules/vitest/vitest.mjs run src/ui/zIndex.test.ts --reporter=json --outputFile=<绝对路径>` ⇒ **exit 0**（721 ms），产物落盘、`testResults.length = 1` · `numTotalTests = 7` · `success = true`；🔴 **`numTotalTestFiles` 字段确认不存在**（与 §3.8 逐字一致）、文件数只能读 `testResults.length`；② ✅ **负控**：`--reporter=basic` ⇒ **exit 1** + `Startup Error · Failed to load custom Reporter from basic`（**启动期**报错，不是用例失败 ⇒ 正是「伪装的红」的机理）；③ ⚠️ **P-27 / P-31 仍适用**：`--outputFile` 必须**绝对路径**（相对路径按 cwd 解析，会把产物写到仓外）、读前**先查 mtime**。
4. **变异体实验不得与全量测试并发**（P9）。
5. 🔴 **本批的变异体必须「真的改变行为」**：**不得**用等价变异体；**期望比对要红在具名断言上**（`ran > 0` 只是旁证）；**注入必须自证「恰 1 次」**。
6. **反例守卫（必须绿的反向变异）与必红的变异体分开列**；**新造的每个守卫/棘轮必须给「防真空阳性对照」**；**基线常量不可手工改宽**。
7. 🔴 **判据设计纪律（§C53.5 逐字）**：**往返/功能型判据天然对「键的取值时机」免疫** —— 因为**写入与读取用同一个（错的）键时，往返照样成功**。⇒ 凡「某值的**取样时点**」构成语义的（去重前/后、normalize 前/后、默认值填充前/后），**必须另加一条源码级 / 顺序级判据**。**本批的三处适用点**：T6 的双分母取样时点 · T9 的 CSS 覆盖块**源序**（必须在 `[data-theme="dark"]` 之后）· T12 的 profile 目录**在启动前**设定。
8. 🔴 **锚点由变异体裁定，不由推理裁定（§C17.3）**：凡写「某变异体的期望红点」这类锚，**必须在导出树里真跑那个变异体**，把**实际变红的 `文件:行:断言名`** 抄进报告。**不许**由阅读推断。

### 十、报告与临时文件

- 报告写 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`（**该目录整体 gitignored ⇒ 永不 `git add -f`**）。探针 / 日志 / 基线 / 解包树一律写同目录 **`tmp/<unit>/`**。
- **报告必含七项**：① 八门禁逐条（命令 + exit + 读数）；② **本任务触碰的冻结键表**（§C9.12）；③ **本任务期望的门禁中间值 + 为何**；④ 诚实边界（**严格区分「仪器不可达」与「本批未做」**）；⑤ 权威读数带 **提交 sha + `app/dist` mtime**；⑥ 「**只能登记**」清单（**不许编造弱判据**）；⑦ **§10 额外审查点名**（若改了 `.github/**` / SQLite schema / `tauri.conf.json` / `docs/product/` / `docs/adr/`）。
- 🔴 **报告里凡写「实测 = X」，X 必须是仪器读出来的数**（承 §C31.2）；取自声明值须写「**表值 X（常量）**」并另给实测。

### 每个任务的统一作业模式（本批全部任务共用，逐条照做）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与八条门禁，把读数写进报告的「开工读数组」；**先看 `git status --porcelain`，不是自己的路径一律不碰**。
2. **文件占用检查**：本轮是**多单元共用一棵工作树**；开工前把自己要改的路径与 `tmp/` 里的在飞声明比对，冲突 ⇒ 只读轮询 90 s × ≤5，窗口不关 ⇒ 报控制方。
3. **依赖必须「已提交」而不是「工作树已改」**。
4. **一次只切一处**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
5. **验收判据 = 「既有测试逐条原样通过」+「新增用例只增不减」**；本批**授权改动**的既有断言**仅限** `### 表 6` 逐条点名的那些 ⇒ **表外任何改动 ⇒ STOP 并报控制方**。
6. **每条新判据自带变异体**（导出副本、带 CONTROL、禁 `--reporter=basic`、harness 带 `ran` 闸、注入自证恰 1 次）。
7. **报告必含**：见上「报告与临时文件」的七项。
8. **提交**：`git diff --stat` 复核只含自己的文件 → 共享文件走 blob 构造；普通改动 `git add -- <自己的路径…>` 后 `git commit`（🔴 不带 `--only`）；**🔴 不 push**。subject 人工数到 ≤50。
9. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 命令 + 代价）**，一次报控制方。

---

## 实测基线（计划者 2026-09-13 在 `dev@711ad639` 实跑 + 逐文件亲测；下游一切目标与排序都从此派生）

> **出处**：`HEAD = 711ad639`（分支 `dev`）· **工作树 `git status --porcelain` = 仅 `?? docs/tech-debt/` 一行** · `app/dist/index.html` mtime = **2026/9/13 12:17:24**（**本计划者未重建**，`--no-build` 读数）· 全部读数采集于 **2026-09-13**（本轮会话）。
> 🔴 **锚的实测口径（本计划全文适用，登记为 P-36 的落地）**：① 行号 = **真文件行号**（剥注释时**抹等长空白保行号**，**绝不整段删除**——批 7 的 24 条锚偏移即由此而来）；② 行数 = **`countLines(absPath)`**（`scripts/line-limits.mjs:48-52` 唯一实现）；③ 一切「全仓」类计数**域 = `git ls-files`（1614 文件，实测）**；④ 每条读数带**命令 + 口径 + 时点**。

### 表 1 · 本计划者实跑的门禁（逐条命令 + exit + 读数原文）

| # | 命令 | exit | 读数（逐字） |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `✅ line-limits（--full · 数值一致）：>600 硬限 0（棘轮内）· 301–600 档 121 · 登记条目 121` |
| 2 | `node scripts/check-command-registry.mjs` | **0** | `✅ 命令注册一致：定义 311 / 注册 311 / 重复 0` |
| 3 | `node scripts/docs-check.mjs` | **0** | `docs-check: 扫描 281 个 Markdown 文件（检查 181 个，archive 快照与豁免清单除外）` + 五条 ✅（🔻 **E8-12 时点更正：现读数 = 扫描 282 / 检查 182**） |
| 4 | `cd app; npx tsc --noEmit` | **0** | （无输出 = 0 错） |
| 5 | `node scripts/check-bundle-budget.mjs --no-build` | **0** | 首屏 **105.95 kB**（原始 332,301 B；余 94.05 kB）· 懒侧 **37 个 / 637,501 B** ⇒ `⏭ 未判` |
| 6 | `node scripts/bundle-eager-graph.mjs` | **0** | `首屏静态可达应用源文件：111` · `首屏拉入的 npm 包：7`（`@gsap/react` · `@tauri-apps/api` · `@tauri-apps/plugin-dialog` · `gsap` · `react` · `react-dom` · `views`） |
| 7 | `node scripts/check-exemption-prose.mjs` | **0** | `✅ 散文「**311 条**」== 门禁「定义 311」（…:44）` · `✅ App.tsx 登记 549 == countLines 549（…:23）` |
| 8 | `git status --porcelain` / `git rev-parse --short HEAD` | **0** | 仅 `?? docs/tech-debt/` / `711ad639`（分支 `dev`） |

**🔴 本计划者未跑的门禁**：全量 `vitest` · `cargo test` / `cargo clippy` · **真实构建**（`check-bundle-budget` 不带 `--no-build`）。它们的基线**逐字引用批 7 的 `task-22-report.md`（§3.1 表，树 `c0bff722`，2026-09-13）**，并在 `## Global Constraints · 门禁基线表` 逐条标注「引用」；🔴 **8e 的收口单元必须在无并发的独占窗口逐条真跑**（含冷/热两次 vitest，承 WARM-CACHE）。

### 表 2 · 冻结值真值（本计划者实测；`### 表 1`/`表 2` 的复现命令 = `p2-frozen.mjs` / `p3-frozenkeys.mjs` / `p6-matrix.mjs` / `p8-rest.mjs`）

| 棘轮 / 守卫 | 常数（实测） | 键数 | Σ（实测） | Σ 与常数逐字相等？ | 判据口径 |
|---|---|---|---|---|---|
| 弱化灰 | `FROZEN_MUTED_GRAY_TOTAL=63` · `_FILES=43` | 43 | **63** | ✅ | **双向钉死** |
| 字号越界 | `FROZEN_FONT_OOB_TOTAL=551` · `_FILES=123` | 123 | **551** | ✅ | **双向钉死** |
| 边框 | `FROZEN_BORDER_TOTAL=201` | 99 | **201** | ✅ | 上界（今天贴住） |
| 越界圆角 | `FROZEN_RADIUS_OUTLIER_TOTAL=254` | 107 | **254** | ✅ | 上界（今天贴住） |
| 阴影 | `FROZEN_SHADOW_TOTAL=24` | 24 | **24** | ✅ | 上界（今天贴住） |
| `<Surface>` 调用点 | `FROZEN_SURFACE_TAG_TOTAL=47` · `SURFACE_TAG_FROZEN_LEGACY_COUNT=14` · `ANCHOR.entries=29` | 29 登记行（9 条 legacy） | **47** | ✅（legacy 和 **14** ✅） | 三连通 + 和锁 |
| 原生按钮 | `FROZEN_NATIVE_BUTTON_TOTAL=392` · `_BTN_STYLE_CONST_LINES=56` · `_FILES=44` | 114 | **392** | ✅ | **只判上界**（不得改等号） |
| 三红 | `FROZEN_RED_TOTAL=113` | — | （引用，未复测） | — | 双向钉死 |
| 空态余量 | `FROZEN_REST_TOTAL=5` | 5 键 | 恰等于实测 | — | 区间 + 总数 |
| z-index | `FROZEN_NUMERIC_ZINDEX` 3 条 | 3 | 3 | — | 集合差 + 无过期项 |
| buttonMigration | `MIGRATED_SITES=99` · `MIGRATED` 35 · `BUTTON_SHAPES` 35 | 35 | **99** | — | 逐文件 + 总数 + `STILL_REFERENCED` |
| dialogMigration.e | `CROSS_LINE_34`=34 · `NON_MIGRATED_14`=14 | 14 | — | — | 盘上对拍 + 文本级禁 `ui/primitives` |

### 表 3 · 贴边件与落点（**本计划者全树实测**；口径 = `countLines()`，域 = `app/src/**/*.{ts,tsx}`）

**域规模：579 文件 · ≥300 = 35 · 295–299 = 21 · 恰 300 = 6 · >600 = 0**（与入库表 `line-limit-exemptions.md:253-260` **逐条零差异**）。

**🔴 恰 300（余 0，加一行就红）= 6 个**：`components/KnowledgeDetailPanel.tsx` · **`components/notes/NotesReadingColumn.tsx`** · **`components/notes/NotesReadingColumn.views.test.tsx`** · `hooks/useLiveCaptureControl.tsx` · `ui/primitives/dialogMigration.e.test.ts` · `views/session/SessionTriTrackView.tsx`。
**🔴 余 1（299）= 8 个**：`components/ClassroomCapturePanel.tsx` · `components/FeedFragmentList.test.tsx` · `components/FeedFragmentList.tsx` · `components/RefineLaunchDialog.tsx` · **`shell/TopBar.test.tsx`** · **`ui/primitives/style-seams.test.ts`** · **`ui/primitives/textBaseline.ts`** · `views/session/useTriTrackAlign.test.tsx`。
**🔴 域外同样「恰 300」的 3 个 `.mjs`**：**`scripts/line-limits.mjs`** · `scripts/check-command-registry.mjs` · `scripts/check-bundle-budget.mjs`（**三者都不在 `SOURCE_EXT` 视野内，但 AGENTS.md §3 的 300 行纪律照用**）。

**本批落点逐个（`countLines()` 实测 + 冻结键矩阵）**

| 文件 | 行数 | 余量 | 冻结键（mutedGray / fontOob / border / radius / shadow / nativeBtn） | 本批角色 |
|---|---:|---:|---|---|
| `app/src/App.tsx` | **549** | 已登记 | — / — / — / **1** / — / — | 🔴 T9 唯一写者（快捷键 + 模式位 hook）；**净增 ≤ +12** |
| `app/src/shell/TopBar.tsx` | **117** | 183 | — / — / — / — / — / **2**（**满**） | 🔴 T11 唯一写者（入口按钮**必须** `Button` 原语） |
| `app/src/shell/TopBar.test.tsx` | **299** | **1** | — | 🔴 **T7 必须先拆它**（余 1 ⇒ 任何追加前先拆） |
| `app/src/components/notes/NotesReadingColumn.tsx` | **300** | **0** | — | 🔴 **T7 拆件**；T10 加第三视图加载器 |
| `app/src/components/notes/NotesReadingColumn.views.test.tsx` | **300** | **0** | — | 🔴 **T7 拆件**；T10 加行为判据 |
| `app/src/pages/NotesPage.tsx` | **295** | 5 | — | T10 唯一写者（**净增 ≤ +5，设计 +3**） |
| `app/src/views/registry.ts` | **137** | 163 | — | T8 唯一写者（`NOTE_VIEWS` + `FROZEN_VIEW_KEYS.note` **两处同改**） |
| `app/src/views/note/noteCardModel.ts` | **106** | 194 | — | T6 的**范式源**（`data-*` 挂顶层块的 remark 插件，`:89-104`） |
| `app/src/components/noteMarkdownComponents.tsx` | **277** | 23 | — / — / **1** / **2** / — / — | T8 的**唯一既有接缝**（per-block `components` 映射） |
| `app/src/components/NoteMarkdown.tsx` | **203** | 97 | — / — / — / **1** / — / — | T8 只经 `remarkPluginsExtra`（**只许追加**） |
| `app/src/utils/markdownLine.ts` | **100** | 200 | — | T8/T10 的复用件（§7.4 §D4 点名）；⚠️ 含 **6 个原始 hex**（见 `### 表 4`） |
| `app/src/shell/shellPhase.ts` | **57** | 243 | — | 🔴 T9 的**逐字范式**（属性名常量 `:26` · 守卫 `:29` · `setAttribute` `:39` · hook `:52-56`） |
| `app/src/shell/shellPhase.guard.test.ts` | **224** | 76 | — | 🔴 T9 的**源序判据范式**（`:128-146` 三块 `indexOf` 逐序） |
| `app/src/ui/tokens.css` | **119** | 生成物 | — | 🔴 **禁改**（`tokens.drift.test.ts:25-28` 断 `onDisk === renderAll().css`）；`--ed-ink-4` 亮 `:14` / 暗 `:105` |
| `app/src/ui/primitives/Text.css` | **66** | 234 | — | 🔴 **不动**（§2 B1）；`:43` 同时服务两档主题 ⇒ 变量重绑即通吃 |
| `app/src/ui/contrast.test.ts` | **169** | 131 | — | T9 **只许新增**（断**静态 token 值**、不读 `data-proofread-mode`） |
| `app/src/ui/contrast.test.ts` 的 ink-4 断言 | `:100` / `:106` / `:136` | — | — | 同上 |
| `app/src/ui/primitives/textBaseline.ts` | **299** | **1** | 常数与逐文件表 | ⚠️ **T3 只改散文两行**（`:19` / `:174`）⇒ **净增必须 = 0** |
| `app/src/ui/primitives/surfaceResidual.ts` | **211** | 89 | `SURFACE_TAG_REGISTRY` `:178` 起 | T14（登记）+ **T19**（键改） |
| `app/src/ui/primitives/surfaceTagRegistry.test.ts` | **145** | 155 | 五颗牙 `:100-135` | **T19**（建表 / 二档分支） |
| `app/src/ui/primitives/nativeButtonBaseline.ts` | **193** | 107 | `:57/:60/:63/:185` | 本批零改动（只读参照） |
| `app/src/components/batch7UiWiring.test.tsx` | **218** | 82 | — | T14 的**判据范式**（`:203-216` 源码探针**带正控 + 负控 + 断言**） |
| `scripts/line-limits.mjs` | **300** | **0**（域外） | — | 🔴 **T1 拆件**；T2 加判据 → **必须写在拆后的件里** |
| `scripts/check-exemption-prose.mjs` | **112** | 188 | — | T17 转正（只挂 CI step）；自述「非门禁」 |
| `scripts/validate-all.mjs` | **62** | — | — | **T18**（化石处置） |
| `scripts/session-route.mjs` | **238** | — | — | **T18** 改 `:76` 的路由目标 |
| `.github/workflows/pr-check.yml` | **197** | — | — | 🔴 **T17 唯一写者**；`:178` = `line-limits` job（**无 `needs` / 无 `if`**，`:192` / `:197` 两条 step） |
| `commitlint.config.js` | **22** | — | — | 🔴 **T20 唯一写者**；`rules` 在 `:8-21`，**无 `header-max-length` 覆盖** ⇒ 取 preset 的 **100** |
| `.husky/pre-commit` | **20** | — | — | 🔴 **本批零改动**（`:20` = 三条命令的 `&&` 链） |
| `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` | **1035** | — | — | 写者队列 **T3 → T11 → T21**（严格串行） |
| `docs/versions/v0.22.md` | **1036** | — | — | T21（批 8 节） |
| `docs/standards/line-limit-exemptions.md` | **262** | 生成物 | — | 🔴 **T2 不改数值**（末尾换行不改 `countLines()` ⇒ 表一字不动）；**禁止 `--write`** |
| `docs/standards/testing.md` | **229** | — | — | 写者队列 **T4 → T12**（§八在 `:177`，`## 检查清单` 在 `:190`） |
| `docs/standards/performance.md` | **185** | — | — | **T14**（懒侧口径与陈旧度登记）；`:36-51` 是懒侧门禁节 |

### 表 4 · 观感/像素面 14 条欠账的**现状核对**（本计划者实测；`✓` = 我复核在盘）

| # | 欠账 | 本计划者实测锚 | 归属任务 |
|---|---|---|---|
| 1 | **两套模式常量并存**（「归一 = 逻辑归一；观感统一未做」） | `app/src/utils/markdownLine.ts`（**100**）`:50 PREVIEW_MODE` / `:61 COMPACT_MODE`；`:10` 逐字「观感统一未做，归批 8」 | T13 |
| 2 | **两条链 7 档样式差异**（6 档不同、`li` 唯一相同；`### x` / `> x` **DOM 形态都不同**） | `markdownLine.ts:50-58` vs `:61-70`（`h3 :53` vs `:64` · `quote :54`（预览侧有、紧凑侧**缺档**）· `h4`（紧凑侧 `:65`、预览侧**缺档**）· `p :56` vs `:67`） | T13 |
| 3 | **`markdownLine.ts` 含 6 个原始 hex 且在零颜色字面量守卫域外** | 值出现在 `:53`（`#0f766e`）· `:54`（`#b45309` `#fffbeb` `#fde68a`）· `:55`（`#4b5563`）· `:56`（`#374151`）· `:64` `:65` `:66` `:67`；守卫域 = **`ui/primitives/*.css`**（`style-seams.test.ts:55` 定义 `COLOR_LITERAL` · `:248` 逐字「守卫① 原语 CSS 零颜色字面量（色值只许在 `ui/tokens.css` 与 `app/scripts/gen-tokens.mjs`）」） | T16（登记 + 具名归属） |
| 4 | **`Surface` 逐处迁移的可见变化**（圆角 `6→8` 9 处 · 边框冷灰→暖纸 · 20 处阴影换 token · 遮罩统一 · 弱化文本墨度 2.54:1 → 5.13:1） | 棘轮真值见 `### 表 2`；既有登记在 `surfaceBaseline.ts` / `surfaceResidual.ts` | T14 |
| 5 | **批 7 的七条新展示面零观感验收、零同名测试** | `app/src/components/batch7UiWiring.test.tsx`（**218**）`:35-43` 的 `COMMANDS` 七条 + `:203-216` 源码探针 | T15 |
| 6 | **D 组六条展示面「设计决定」而非裁决（充分性未判）** | `v0.22.md` 与批 7 台账逐字；**机器不可判 ⇒ 只能出图 + 人判** | T15（出图）+ `## 诚实边界` |
| 7 | 🔴 **掉地项：`AiConversationDock` 的方向性投影登记给批 5，而批 5 已收口** | `surfaceResidual.ts:101` 逐字（`-8px 0 24px` 是**方向性**边缘投影…「属观感变化，登记给批 5」） | 🔴 **T16（本批认领 + 明确归属，不得再掉一次）** |
| 8 | `Text` 字号越界存量（**551 / 123**） | `textBaseline.ts:38/:41/:49`；**散文两处过期**（`:19` 写 `551/122` · `:174` 写 `551/120`） | T3（散文）+ T14（读数） |
| 9 | 弱化灰存量（**63 / 43**） | `textBaseline.ts:32/:35` | T14 |
| 10 | 圆角 `26 / 5 / 4` 三档**不在任何棘轮内** | `surfaceResidual.ts:31` 逐字（圆角按映射表就地 `6 → 8`）· `surfaceResidual.ts:72` 逐字「控件形态按类别整体裁定，不逐文件登记」 | T16（登记 + 具名归属） |
| 11 | **暗档 `data-theme` 实际生效**（今天只有定义、无写入方） | `tokens.css:98`（`[data-theme="dark"]` 块）· `motion.md` 的不可判清单 | T16（登记；**仪器不可达**） |
| 12 | 真实帧率 / Flip 几何位移 / 切视图卡顿 | `motion.md:150-176` 的不可判清单（**只登记、不编造弱判据**） | T16（登记） |
| 13 | 三档「看起来不一样」 | 同上 | T16（登记） |
| 14 | 真机 1280×800 / 最小尺寸夹取（`tauri.conf.json`） | `tauri.conf.json`（**43**）；**真机由用户裁决跳过** | 🔴 **U5 沿用「跳过」**（见 `## 已裁决项 · U5`）—— 只登记、7 条不假装完成 |

> **5 条新发现**（侦察 A）在本表的落位：#3（`markdownLine.ts` 的 6 hex 无守卫）· #5（七条展示面零同名测试）· #7（**掉地项**）· #10（圆角三档无棘轮）· 以及「批 7 T22 收口件不在盘上」——🔴 **最后一条已被控制方 §A.6 驳回**（时序假警报：扫描时 T22 正在飞行中；本计划者实测 **`task-22-report.md` 现已落盘**，378 行）⇒ **不作为批 8 的输入**（登记为 `## 诚实边界 §三` 的措辞纪律）。

### 表 5 · 锚的实测与漂移登记（**P-36 的落地表**；本计划全文的锚以此为准）🔻 **E8 复测（2026-09-13）**：本表读数采集于 `711ad639`；此后 T3 的三个提交使 `design.md` 由 **1035 → 1053 行（+18）**，本表的**全部规格锚已再次漂移** —— 🔴 **当前真值见文末 `### 表 5b`**（规格锚 +2 ~ +18；`:241` 与 §4.3 段未漂）；`git ls-files` 域也已由 **1,614 → 1,616**（+本计划 +T1 的 `scripts/lib/lineScan.mjs`）

| # | 控制方/侦察给的锚 | **本计划者实测锚** | 差 | 依据 |
|---|---|---|---|---|
| D-1 | 规格 §7.4 标题 `:536` | **`:538`**（`### 7.4 笔记「带证据三轨」—— 批 7 规格章`） | **+2** | `design.md` 实测 **1035** 行（侦察 B 记 1030）；`countLines()` |
| D-2 | §7.4 的 E1 行 `:544` | **`:546`** | **+2** | 逐行打印 |
| D-3 | §7.4 的 E2 行 `:545` | **`:547`** | **+2** | 同上 |
| D-4 | §7.4 的 E3 行 `:546` | **`:548`** | **+2** | 同上 |
| D-5 | §7.4 §B 四类 fixture `:552-555` | **`:554-557`** | **+2** | 同上 |
| D-6 | §7.4 §C 两态 `:559-563` | **`:561-563`** | **+2** | 同上 |
| D-7 | §7.4 §D `:565-568` | **`:565-570`**（`:567` 根因 · `:568` 两条路 · `:569` 唯一段级引用 · `:570` §D4） | 部分 | 同上（§D 标题 `:565` **未漂**） |
| D-8 | §7.4 §E `:572` / 诚实边界 `:573` | **`:574`** / **`:575`** | **+2** | 同上 |
| D-9 | 控制方 §4 的「规格 `:540`（出处与状态行）」 | **`:540`** ✅ **未漂** | 0 | 同上 |
| D-10 | 控制方 §4 的「§7.4 `:545`（E2 行）」 | **`:547`** | **+2** | 同上 ⇒ **控制方该格用的是漂移前编号** |
| D-11 | §11-6 的 `:901`（批 7 收口加注） | **`:903`**（实测行）+ **`:905-906`**（T21 的口径更正注） | **+2** | 同上 |
| D-12 | §4.3 条件③原文 `:220` | **`:220`** ✅ | 0 | 同上 |
| D-13 | §4.3 批 7 加注 `:233-243`（含 ⑤ 在 `:241`） | **`:233-245`**（⑤ **`:241`** ✅ · 规则⑦ `:243` · 补时点 `:243-244` · 不得合并结案 `:245`） | 尾部 +2 | 同上 |
| D-14 | §3 红线 6 `:127` · 例外表 `:129/:133/:134` | **`:127` / `:129` / `:133` / `:134`** ✅ | 0 | 同上 |
| D-15 | AGENTS.md §10 清单 `:112-118` · 标题 `:110` | **`:110`** ✅ 标题 · 清单 **`:111-118`**（`:112` tauri.conf · `:113` lib.rs/main.rs · `:114` windows.rs · `:115` live_session*/capture · `:116` schema · `:117` `.github/workflows/` · `:118` `docs/product/`、`adr/`） | 清单首行 | 逐行打印（`AGENTS.md` = **126** 行） |
| D-16 | `commands_session.rs` 的 `get_session_detail` `:137` → `:164` | **`:137`** ✅ → **`:164`** ✅（`:146` `list_segments` · `:147` `list_ocr_blocks`） | 0 | 逐行打印（文件 **447** 行） |
| D-17 | `artifact.rs:62-69` / `:64` · `:66` · `:68` | **`:62` `pub struct BlockRefs`** · **`:64` `segment_id`** · **`:66` `ocr_block_id`** · **`:68` `frame_ms`** ✅（**但语义是「产物块引用」，不是证据 id 的定义处** —— 控制方 §4 第 3 条） | 0 | 逐行打印（文件 **146** 行） |
| D-18 | `pr-check.yml` 的 `line-limits` job `:178` | **`:178`** ✅（**无 `needs` / 无 `if`**；step `:191-192` / `:196-197`） | 0 | 逐行打印（文件 **197** 行） |
| D-19 | `textBaseline.ts:19` 写 `122` · `:174` 写 `120` | **`:19` 逐字含 `551/122`** ✅ · **`:174` 逐字含 `551/120 不变`** ✅（常数 `:41` = **123**） | 0 | 逐行打印（文件 **299** 行） |
| D-20 | `motionHarness.ts:50` 的「jsdom 不做样式级联」 | 🔴 **真身路径 = `app/src/test/motionHarness.ts`**（`app/src/motion/motionHarness.ts` **不存在**） | 路径更正 | `fs.existsSync` 双侧 |
| D-21 | 批 7 计划的「jsdom 不做样式级联」 | **批 7 计划 `:2560`** ✅ | 0 | 逐行打印 |
| D-22 | 批 3 仪器 `viewport-probe.mjs`（19,286 B） | **19,286 B / 299 行** ✅ · 姊妹件 `scrollbar-cdp.mjs` **4,688 B / 106 行** | 0 | `Buffer.byteLength` + `split("\n")` |
| D-23 | 批 7 `task-22-report.md` 不在盘上 | 🔴 **在盘**（**378 行**，含 §8 的懒侧重冻与 §四 的 `--dist` 风险登记）⇒ **侦察 A 的 STOP(a) 已被控制方驳回，成立** | 状态更正 | `countLines()` |

---

## 波次总表

> **五段、各自收口**。**段内可并行，跨段串行**（8b/8c/8d 依赖 8a；8e 独占收口窗口）。
> **依赖列 = 必须「已提交」而不是「工作树已改」**。**`NON_MIGRATED_14` 全批只读**。

### 段 → 任务号

| 段 | 主题 | 任务号 | 状态 |
|---|---|---|---|
| **段 8a · 地基与治理** | `line-limits.mjs` 拆件 · 末尾换行/EOL 判据 · 批 7 残留文档更正 · 常设纪律入库 · 段门禁自证 | **T1 – T5**（5 个） | ✅ 本文件已写完 |
| **段 8b · 主线一：两条能力** | A 纯函数片 → A 视图片 → A 容器片 → B 模式位片 → B 入口片（三件贴边件先拆） | **T6 – T11**（6 个） | ✅ 本文件已写完 |
| **段 8c · 主线二：观感收编** | 仪器入库（搬出 tmp + 参数化 + 卫生）→ 读数三片 → 措辞/掉地/登记片 | **T12 – T16**（5 个） | ✅ 本文件已写完 |
| **段 8d · 主线三：治理余项** | CI 挂载（G2+G6）· `validate-all.mjs` 化石（G3）· `(file,tier)` 登记键（G4）· `subject ≤50` 的牙 | **T17 – T20**（4 个） | ✅ 本文件已写完 |
| **段 8e · 收口** | 版本/规格终态回写 · 八门禁终态 + 三条验收 + 二分清单 + 收口评审 · 独立复核 | **T21 – T23**（3 个） | ✅ 本文件已写完 |
| **段 8f · 用户裁决项落地（U1–U4）** | U2 凭据槽代码路径移除 · U3 `docs/tech-debt/` 归档（SOP 6 步）· U4 观感仪器按需入口 + 触发条件 · U1 音频配置通道 · U1 删会话删音频 | **T24 – T28**（5 个） | ✅ 本文件已写完（2026-09-13 追加） |

> **🔴 编号纪律**：**8a 固定占用 T1–T5**，8b/8c/8d/8e/8f 依次连续编号，**不得重排或复号**。
> **🔴 段边界不可破**：**每段必须自己跑完八闸并出段终态读数**（T5 / T11 / T16 / T20 / T22 / T28）；**8a–8d、8f 任何一段都不得写成「批 8 已交付」**。
> **🔴 分段规模**：8a 5 · 8b 6 · 8c 5 · 8d 4 · **8f 5** · 8e 3 ⇒ **6 段 / 28 个任务**（批 7 的 7a = 12 个、7b = 10 个，规模过大 ⇒ 本批按控制方要求拆成 6 段、**每段 ≤6**）。
> **🔴 段间序（修正版）**：**8a → 8b/8c/8d 并行 → 8f → 8e**。**8f 必须在 8e 之前**，理由有两条：① **T26 的归档会改 `docs-check` 的读数** ⇒ 收口必须读**归档后**的终态；② **T27/T28 是本批唯一的 Rust 改动** ⇒ 收口必须覆盖它们（**cargo 不再「零改动」**，见 T22 的修订行）。

### 段 8a 任务一览（T1–T5）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T1** | **拆 `scripts/line-limits.mjs`**（**恰 300 / 余 0**）：`countLines` / `scanTree` / 表解析 → 新建 `scripts/lib/lineScan.mjs`；CLI 与判据留在主件 | — | ✅ 与 T3/T4 | **`scripts/line-limits.mjs`（300 → 预算 ≤190）** · 新建 `scripts/lib/lineScan.mjs`（预算 ≤150） | 1 |
| **T2** | **末尾换行 / EOL 盲区判据**：① 先归一 **10 个**末尾无 `0x0A` 的源文件（**不改 `countLines()`** ⇒ 豁免表数值一字不动）② 在拆后的 `line-limits.mjs` 里加 `--full` 的第 (f) 条判据 + 变异体 | T1 | ❌ 与 T1 串行（同文件） | **`scripts/line-limits.mjs`** · 10 个源文件（各 **+1 字节**：`components/NoteEditView.tsx`(412) · `components/RefineWorkbench.tsx`(497) · `components/useNoteAttention.ts`(69) · `pages/NotesPage.tsx`(295) · `ui/primitives/emptyStateRatchet.test.ts`(296) · `src-tauri/src/ai_provider.rs`(312) · `ai_provider_tests.rs`(266) · `asr_pass2.rs`(250) · `commands_knowledge_cards.rs`(170) · `commands_video.rs`(356)） | 2 |
| **T3** | **批 7 残留的入库文档更正 5 处**（控制方 §4 表；**纯文档/散文，零代码语义**） | — | ✅ 与 T1/T2/T4 | **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（1035）** · `app/src/ui/primitives/textBaseline.ts`（299，**净增 0**） | 2 |
| **T4** | **常设纪律入库**：`docs/standards/testing.md` 补三小段（**R-FLAKE 三条件 · WARM-CACHE 冷热双跑 · P9 并行假红签名**，不改任何判据）+ `.superpowers/sdd/DISPATCH-TEMPLATE.md` 更新（**gitignored ⇒ 不入库，只登记**） | — | ✅ 与 T1/T2/T3 | **`docs/standards/testing.md`（229，+≤18 行）** · `.superpowers/sdd/DISPATCH-TEMPLATE.md`（99，不入库） | 1 |
| **T5** | **8a 段门禁自证**：八闸**串行**真跑 + 逐条读数 + 「8a 段终态」声明（**不得**写成批 8 已交付） | T1–T4 | ❌ 最后 | 0 生产代码（产出 `tmp/t5/**` + `task-5-report.md`） | 0 |

**预估 8a 提交数 = 6**（T1×1 · T2×2 · T3×2 · T4×1）。

### 段 8b 任务一览（T6–T11）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T6** | **A · 纯函数片**：新建 `views/note/noteEvidenceModel.ts`（`[[ts:ms]]` 锚点抽取 + ms 最近邻 + **容差** + tie-break + **显式失配标记** + **双分母**）+ 单测 + 四类/两态 fixture 纯数据；**规格 §7.4 的 §D2/§D3 加注半**（本任务与 T3 的规格写者队列串行） | — | ✅ 与 T7/T9 | 新建 `app/src/views/note/noteEvidenceModel.ts`（预算 ≤220）· 新建 `noteEvidenceModel.test.ts` · 新建 `noteEvidence.fixtures.ts` · `docs/.../design.md`（§7.4 加注） | 2 |
| **T7** | **拆件片（三件贴边件）**：`notes/NotesReadingColumn.tsx`（**300**）· `notes/NotesReadingColumn.views.test.tsx`（**300**）· `shell/TopBar.test.tsx`（**299**）—— **纯搬迁、逐字节对拍** | — | ✅ 与 T6/T9 | **`components/notes/NotesReadingColumn.tsx`（300）** · **`NotesReadingColumn.views.test.tsx`（300）** · **`shell/TopBar.test.tsx`（299）** · 新建 3 个被抽出的件 | 3 |
| **T8** | **A · 视图片**：新建 `views/note/NoteEvidenceTrackView.tsx`（吃 `NoteViewSlot`）+ **注册表第三项**（`NOTE_VIEWS` + `FROZEN_VIEW_KEYS.note` **两处同改**）+ 视图侧判据 | T6 · T7 | ❌ 与 T10 串行（同 `registry.ts`） | 新建 `views/note/NoteEvidenceTrackView.tsx` · **`app/src/views/registry.ts`（137）** · `registry.test.ts`（145）· `registryResolution.test.ts`（256）· `architecture.guard.test.ts`（260）· `architecture.slots.test.ts`（100） | 2 |
| **T9** | **B · 模式位片**：新建 `shell/proofreadMode.ts`（照 `shellPhase.ts` 57 行范式）+ 新建 `ui/proofread.css`（**变量重绑**，排 `[data-theme="dark"]` **之后**）+ `App.tsx` 的快捷键 / `Esc` 两出口 | T7 | ✅ 与 T6/T8 | 新建 `app/src/shell/proofreadMode.ts`（预算 ≤80）· 新建 `app/src/ui/proofread.css`（预算 ≤40）· **`app/src/App.tsx`（549，净增 ≤ +12）** · 新建 `proofreadMode.test.ts` / `.dom.test.tsx` · `ui/contrast.test.ts`（169，**只增**） | 2 |
| **T10** | **A · 容器片**：新建 `hooks/useNoteEvidence.ts`（`get_session_detail` 取数只能在容器侧发生）+ `NotesPage.tsx` 注入 + `NotesReadingColumn` 第三视图加载器 + 行为判据 | T8 · T7 | ❌ 独占（跨 4 文件） | 新建 `app/src/hooks/useNoteEvidence.ts` · **`pages/NotesPage.tsx`（295，净增 ≤ +5）** · `components/notes/NotesReadingColumn.tsx` · `NotesReadingColumn.views.test.tsx` · `views/note/noteViews.test.tsx`（298，净增 ≤ +2） | 2 |
| **T11** | **B · 入口片 + 规范回写**：`TopBar.tsx` 的入口按钮（**必须 `Button` 原语**）+ `TopBar.css` + `docs/product/ui-ux-system.md` 回写（§10 面）+ **规格 §4.3 的两处加注**（生成物落点 + `proofread` 消歧） | T9 · T7 | ✅ 与 T10 | **`app/src/shell/TopBar.tsx`（117）** · `app/src/shell/TopBar.css`（149）· **`shell/TopBar.test.tsx`（299 → 拆后 +）** · **`docs/product/ui-ux-system.md`（282，§10）** · `docs/.../design.md`（§4.3 加注） | 2 |

**预估 8b 提交数 = 13**。

### 段 8c 任务一览（T12–T16）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T12** | **观感仪器入库（收编）**：把 `batch3-shell/tmp/viewport-probe.mjs`（**19,286 B / 299 行**）搬成 `scripts/viewport-probe.mjs` + **判据参数化**（任意选择器的解算样式/几何）+ **profile 落 `$env:TEMP`** + 盲区写进头注 + 自检（视口 / dpr / 定块 / 文本哨兵 / **阳性 + 阴性对照**）+ `docs/standards/testing.md` §九（仪器与盲区登记） | — | ✅ 与 T16 | 新建 `scripts/viewport-probe.mjs`（`scripts/**` **不在行数门禁视野内**，仍按 ≤300 自持）· `docs/standards/testing.md`（写者队列 T4 → T12） | 2 |
| **T13** | **对准欠账 #1/#2**：两条链的 **7 档 × 3 属性**读数矩阵（两套模式常量 + 样式差异）—— **只出读数与判定表，不做「观感统一」**（目标值是人的决定） | T12 | ✅ 与 T14/T15 | 0 生产代码（产出 `tmp/t13/**` + 报告；读数进 T21 的 `v0.22` 批 8 节） | 0–1 |
| **T14** | **对准欠账 #4/#8/#9 + 懒侧陈旧度登记**：`Surface` 逐处可见变化（圆角/边框/阴影/遮罩/墨度对比度）· 字号越界与弱化灰**存量读数**（对照棘轮）· **18 族超上限 +203 B 与 `shift-` 死预算**登记进 `docs/standards/performance.md` · **`--dist` 假绿**登记 | T12 | ✅ 与 T13/T15 | **`docs/standards/performance.md`（185）**（唯一写者） | 1 |
| **T15** | **对准欠账 #5/#6（批 7 七条展示面）**：先做 **`invoke` 假体可行性 spike**（判据 = 壳层不崩进错误边界 + 元素数阈值）；**成立** ⇒ 出图取证；**不成立** ⇒ 登记残余 + 逐字写明 | T12 | ✅ 与 T13/T14 | 0 生产代码（产出 `tmp/t15/**` + 报告 + PNG） | 0–1 |
| **T16** | **欠账 #3/#7/#10/#11/#12/#13 的登记片（doc/comment-only）**：`markdownLine.ts` 的 6 hex · **`AiConversationDock` 掉地项认领** · 圆角三档无棘轮 · 暗档/帧率/三档观感「仪器不可达」· **`motionHarness.ts:50` 与 `motion.md` 的措辞收窄（jsdom **做**级联）** + 批 7 计划 `:2560` 的就地加注 | — | ✅ 与 T12–T15 | **`app/src/test/motionHarness.ts`（147，净增 0）** · **`docs/standards/motion.md`（229，+加注）** · `app/src/utils/markdownLine.ts`（100，**只加注释**）· `app/src/ui/primitives/surfaceResidual.ts`（211）· `docs/superpowers/plans/2026-09-13-frontend-redesign-batch7-unwired.md`（2612，**原文 + 就地加注**） | 2 |

**预估 8c 提交数 = 7**。

### 段 8d 任务一览（T17–T20）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T17** | **CI 挂载（G2 + G6）**：把脚本域门禁挂进 `pr-check.yml` 的**无条件 job**（`:178` 的 `line-limits`），并**单列** `check-exemption-prose.mjs` 为一个 step；🔴 **不补 `scripts/**` glob**、🔴 **不并入八闸集合** | T1 · T2 | ✅ 与 T18/T19/T20 | **`.github/workflows/pr-check.yml`（197，§10）** | 1 |
| **T18** | **`validate-all.mjs` 化石处置（G3）**：**删** `scripts/validate-all.mjs`（62）+ **改** `scripts/session-route.mjs:76` 的路由目标（`rule-build-validation` 的 owner 由「脚本」改为「现执行者指针」） | — | ✅ 与 T17/T19/T20 | **删 `scripts/validate-all.mjs`（62）** · **`scripts/session-route.mjs`（238）** | 1 |
| **T19** | **`SURFACE_TAG_REGISTRY` 键改 `(file, tier)`（G4）**：只改 3 处（`surfaceResidual.ts` 的类型 + `surfaceTagRegistry.test.ts` 的建表与二档分支）；**先复测不变量**（域 327 / 47 标签 / 29 行 / Σ47 / legacy 9 行和 14） | — | ✅ 与 T17/T18/T20 | **`app/src/ui/primitives/surfaceResidual.ts`（211）** · **`app/src/ui/primitives/surfaceTagRegistry.test.ts`（145）** | 2 |
| **T20** | **`subject ≤50` 的牙**：`commitlint.config.js` 加 `'subject-max-length': [2, 'always', 50]`；🔴 **不得**改 `header-max-length` | — | ✅ 与 T17/T18/T19 | **`commitlint.config.js`（22）** | 1 |

**预估 8d 提交数 = 5**。

### 段 8e 任务一览（T21–T23）

| Task | 内容 | 依赖 | 可否并行 | 改的文件 | 预估提交 |
|---|---|---|---|---|---|
| **T21** | **版本与规格终态回写**：`docs/versions/v0.22.md` 的**批 8 节**（七段结构）+ 规格的终态加注（§10 批 8 行 / §11-6 / §12 / §14）+ **观感读数归档** | **T1–T20 + T24–T28**（🔴 **8f 必须先于收口**） | ✅ 与 T22 | **`docs/versions/v0.22.md`（1036）** · **`docs/.../design.md`（1035）** | 2 |
| **T22** | **全批收口**：八闸**串行**真跑（vitest **冷 + 热两次** + **cargo test**）+ 三条验收兑现度表 + 二分清单 + 收口评审 | **T1–T21 + T24–T28** | ❌ 最后 | 0 生产代码（产出 `tmp/t22/**` + `task-22-report.md` + `closing-review.md`） | 0–1 |
| **T23** | **独立复核**（非交付方）：三路独立复跑 + 二分清单双向抽查 + 变异体复核 + 诚实边界核对 | T22 | ❌ 最后 | 0（产出 `batch8-independent-review.md`） | 0 |

**预估 8e 提交数 = 3**。

### 段 8f 任务一览（T24–T28；**用户裁决项落地 U1–U4**）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T24** | **U4 · 观感仪器的按需入口 + 写死触发条件**（U4-d）：`app/package.json` 加 `check:visual` script + `docs/standards/testing.md` 的**触发条件**（动了 `ui/primitives/**` / token / `.css` 时必须跑）+ 把「不进 husky、不进 CI」写死 | T12 | ✅ 与 T25/T26/T27/T28 | **`app/package.json`（43）** · `docs/standards/testing.md`（写者队列 T4 → T12 → T24） | 1 |
| **T25** | **U2 · 凭据槽 `"default"` 的代码路径移除**（c；🔴 **只移除「作为合法槽位的读写路径」**，**不物理抹除**已存密钥） + **两条分开判据** + ⚠️ **风险登记**（仅有 `default` 槽的真机用户需重填；**本环境测不了**） | — | ✅ 与 T24/T26/T27/T28 | **`app/src-tauri/src/commands_ai_providers.rs`**（+ `app_setup.rs` 的启动迁移路径，**实测后确定**）· 其单测件 | 1–2 |
| **T26** | **U3 · `docs/tech-debt/` 归档**（a；🔴 **按 `docs/archive/README.md` 的 6 步 SOP**，**不是**一个 `git mv`）：当日日期夹 + 继承 `2026-09-09/tech-debt.md` 的滚动清单 + 当日 README + 活跃区索引 + 🔴 **`docs-check` 扫描数变化实测归因** | — | ✅ 与 T24/T25/T27/T28（但 **必须先于 T22**） | 新建 `docs/archive/<执行日>/README.md` + `tech-debt.md` + `review-2026-09-11.md` · `docs/archive/README.md`（索引）· **移除 `docs/tech-debt/`** | 1 |
| **T27** | **U1·A · 音频配置通道（假开关 → 真通道）**：`AudioStoreConfig` 现有 **10 处构造点、无 JSON/env 通道** ⇒ 开一条真通道 + 幂等 + 边界 + 判据；`AudioStoragePanel` 的状态**变成用户可改** | — | ✅ 与 T24/T25/T26 | **`app/src-tauri/src/audio_store.rs`（284）** · `commands_audio.rs` · `live_session.rs`（构造点）· **`app/src/components/AudioStoragePanel.tsx`** · 其单测件 | 2 |
| **T28** | **U1·B · 删会话连音频**：`commands_session.rs` / `commands_session_delete.rs` 的级联清理**加音频**（**含文件系统删除**）+「删除失败 / 部分删除」边界 + 内存库/临时目录单测 + **段 8f 收口** | T27（同 `audio_store` 面） | ❌ 最后 | **`app/src-tauri/src/commands_session.rs`（447，§10 相邻）** · **`commands_session_delete.rs`（75）** · 其单测件 | 2 |

**预估 8f 提交数 = 7–8**；**全批预估 41–42 个提交**（6 + 13 + 7 + 5 + 3 + 7~8）。

> **🔴 热点文件的单写者约束**
> | 文件 | 唯一写者队列 | 说明 |
> |---|---|---|
> | `scripts/line-limits.mjs`（299 → 拆后 ≤190 → 再加判据） | **T1 → T2** | 严格串行；T2 的判据**必须**写在拆后的件里 |
> | `scripts/lib/lineScan.mjs`（新建） | **T1** 建立 → **T2** 只许加 EOL 谓词 | 保持 `countLines` 单实现（`check-exemption-prose.mjs` 仍经 `line-limits.mjs` 取口径） |
> | `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（1035） | **T3 → T6 → T11 → T21** | 🔴 四个写者，**严格串行**；每段只加注、不改历史原文 |
> | `docs/standards/testing.md`（229） | **T4 → T12 → T24** | 三段不同章节，仍**串行** |
> | `app/src/components/notes/NotesReadingColumn.tsx`（300） | **T7**（拆件）→ **T10**（加载器） | T7 拆后必须留 ≥ +25 头寸 |
> | `NotesReadingColumn.views.test.tsx`（300） | **T7**（拆件）→ **T10**（判据） | 同上 |
> | `shell/TopBar.test.tsx`（299） | **T7**（拆件）→ **T11**（判据） | T7 拆后必须留 ≥ +20 头寸 |
> | `app/src/App.tsx`（549） | **T9 唯一** | 净增 ≤ **+12**；**不得**新增原生 `<button>`（无键 ⇒ 出现即红）与越界圆角（有键 = 1） |
> | `app/src/shell/TopBar.tsx`（117） | **T11 唯一** | 🔴 `nativeButton` 键 = **2 = 上限（满）** ⇒ 入口**必须** `Button` 原语 |
> | `app/src/views/registry.ts`（137） | **T8 唯一** | `NOTE_VIEWS` 与 `FROZEN_VIEW_KEYS.note` **两处同改** |
> | `app/src/ui/primitives/surfaceResidual.ts`（211） | **T16**（登记）→ **T19**（键改） | 串行 |
> | `app/src/ui/primitives/surfaceTagRegistry.test.ts`（145） | **T19 唯一** | 建表 + 二档分支 |
> | `.github/workflows/pr-check.yml`（197） | **T17 唯一** | §10 面；共享文件 ⇒ blob 构造 |
> | `commitlint.config.js`（22） | **T20 唯一** | 🔴 该提交**自己**也受新规则约束（subject 必须 ≤50） |
> | `docs/standards/performance.md`（185） | **T14 唯一** | 懒侧口径 + 陈旧度登记 |
> | `app/src/ui/contrast.test.ts`（169） | **T9 唯一**（**只增**） | 断静态 token 值，**不得**改写既有三条 ink-4 断言 |
> | `app/package.json`（43） | **T24 唯一**（**只加 `scripts` 一行**） | 🔴 **不得**改 `dependencies` / `devDependencies`（那会动 lockfile 与覆盖闸） |
> | `app/src-tauri/src/audio_store.rs`（284）· `commands_audio.rs` · `live_session.rs`（构造点） | **T27**（配置通道）→ **T28**（级联删除只读它） | 同一 Rust 面 ⇒ 串行 |
> | `app/src-tauri/src/commands_session.rs`（447）· `commands_session_delete.rs`（75） | **T28 唯一** | 🔴 **§10 相邻**（删会话的清理面）；报告必须点名 |
> | `app/src-tauri/src/commands_ai_providers.rs` | **T25 唯一** | 🟡 **§10 相邻**（凭据面，但不在 §10 的七条清单里）⇒ 报告点名 |
> | `docs/archive/**`（19 个日期夹，最新 `2026-09-09`） | **T26 唯一** | 🔴 **除最新一日外禁止修改既有归档文件**（`README.md:47-53` 逐字） |
> | `.husky/pre-commit`（20）· `docs/standards/line-limit-exemptions.md`（262）· `app/src/ui/primitives/dialogMigration.e.test.ts`（300）· `app/src/ui/tokens.css`（119） | **无人**（全批零改动） | 任何任务若发现「必须改它们才能绿」⇒ **STOP** |
>
> **可安全并行（8a）**：T1 ∥ T3 ∥ T4 → T2 → T5。
> **可安全并行（8b）**：T6 ∥ T7 ∥ T9 → T8 ∥ T11 → T10 → （段收口并入 T10 的报告）。
> **可安全并行（8c）**：T12 → T13 ∥ T14 ∥ T15 ∥ T16。
> **可安全并行（8d）**：T17 ∥ T18 ∥ T19 ∥ T20。
> **可安全并行（8f）**：T24 ∥ T25 ∥ T26 ∥ T27 → T28。
> **必须串行（全批的硬链）**：**T1 → T2**（同文件）· **T7 → T8/T10/T11**（贴边件腾行数）· **T12 → T13/T14/T15/T24**（仪器不在盘上没有读数面）· **T27 → T28**（同 Rust 面）· **8f 全部 → T22**（T26 会改 `docs-check` 读数；T27/T28 是本批唯一 Rust 改动）· **T21 → T22 → T23**（收口链）。

---
## 段 8a · 地基与治理（T1–T5）

> 以下每个任务节都含：**目标** · **🔴 冻结值预算表（§C9.12）** · **Files** · **Interfaces** · **Steps** · **Verification 表（判据 ↔ 专属变异体 ↔ 期望）** · **提交信息** · **诚实边界**。
> 🔴 `NON_MIGRATED_14` 的机器真源 = `app/src/ui/primitives/dialogMigration.e.test.ts:115`（**该文件恰 300 行**）；**8a 的 5 个任务一个都不落在其中**（逐条核对见各任务的 `Files` 表）。

---

### Task 1: 拆 `scripts/line-limits.mjs`（**恰 300 / 余 0**；控制方 §2 G1）

> **为什么第一个做**：它是**本批治理线的第一道施工约束**（G1 逐字：「末尾换行盲区」的修法天然属于它，而三个门禁脚本全都恰 300）。不先拆，T2 一步也动不了；且它是**全仓行数纪律的唯一实现**（`countLines` 被 `scripts/check-exemption-prose.mjs` 与多个判据件引用），拆错会连带污染所有行数读数。

**目标**：把 `scripts/line-limits.mjs`（**300 行**）拆成 **CLI 主件 + `scripts/lib/lineScan.mjs`（纯函数 / 表解析 / 扫描）**，并**逐字保持三条读数不变**：`--full` 的 `>600 硬限 0 · 301–600 档 121 · 登记条目 121`、`exit 0`、以及 `countLines(absPath)` 的**语义与导出路径**。**搬迁只搬不改**（§C9.19 第 1 条）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（本计划者实测） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `>600 硬限` / `301–600 档` / `登记条目` | **0 / 121 / 121**（门禁实跑 exit 0） | 只许降或持平 | 逐字保持 | **否**（V1 双向对拍） |
| `FROZEN_OVER_LIMIT` | 实测**为空** | 只许降 | **不动** | **否** |
| `countLines()` 语义 | `s.split("\n").length - (endsWith("\n") ? 1 : 0)`（`:48-52`） | 唯一实现 | **语义一字不改**；只换**居住文件**并在原路径 re-export | ⚠️ **是（若 re-export 漏了）** ⇒ V3 |
| 六棘轮 `FROZEN_*`（全部） | 见 `### 表 2` | 只许降或持平 | **本任务不触碰任何棘轮** | **否** |
| `check-command-registry` | **311 / 311 / 0**（实跑） | 本任务不动 registry | — | **否** |
| 行数门禁视野 | `SCAN_DIRS = ['app/src','app/src-tauri/src']` · `SOURCE_EXT = /\.(ts\|tsx\|rs)$/`（`:22-23`） | **本任务不扩域**（非目标 10） | 逐字保留 | **否** |

**Files:**
- 改 **`scripts/line-limits.mjs`（300 → 预算 ≤190 行）** 🔴 恰 300 ⇒ **本任务必须先拆后改**
- 新建 `scripts/lib/lineScan.mjs`（预算 **≤150 行**；搬 `countLines` / `scanTree` / 豁免表行解析 / `HARD_LIMIT` / `SOFT_LIMIT` / `FROZEN_OVER_LIMIT`）
- **`NON_MIGRATED_14`**：本任务 2 个文件**都不在其中**（它们不在 `app/src/**`）
- 🔴 **不得**改 `.husky/pre-commit:20`、**不得**改 `docs/standards/line-limit-exemptions.md`（生成物）

**Interfaces:**
- Consumes：无（本任务是地基）
- Produces：`scripts/lib/lineScan.mjs` 的 `countLines(absPath)` · `scanTree()` · `parseExemptionRows()`（**签名与语义逐字不变**）；`scripts/line-limits.mjs` **保持模块导出面与拆件前逐字相同（7 名）**（re-export）—— 🔴 **这是本任务唯一的对外契约**，破了会让 T2/后续全部行数读数失真。🔻 **E8-2 勘误（2026-09-13，T1 实测，树 `547ffa1f`）**：原写「**继续导出 `countLines`**（re-export，**供 `check-exemption-prose.mjs` 与判据件使用**）」—— 🔴 **两处都不准确**：① 只导 `countLines` 会**静默收窄另外 6 名** ⇒ 必须 7 名全导（见 `Step 3`）；② `scripts/check-exemption-prose.mjs` **不经主件取口径**（它在自己的 `:26-27` 有 `countLines` 的私有副本 `countLinesText`，本批 **P-41**）⇒ 该脚本**不是**本契约的消费者（E8 复测：`git ls-files` 1,616 文件中 `countLines` 的**真 importer = 0** ⇒ 这是**潜在契约**，不是现存契约）

- [ ] **Step 0: 先量基线（三件套）**
  ```powershell
  cd "D:\Program own\aicode\work space\Entropydecrease"
  node scripts/line-limits.mjs --full      # 期望 exit 0 · 0 / 121 / 121
  node scripts/check-command-registry.mjs  # 期望 exit 0 · 311/311/0
  node scripts/check-exemption-prose.mjs   # 期望 exit 0（它经 line-limits 取 countLines 口径）
  ```
  🔴 **三件都要逐字抄进报告的「开工读数组」**（`### 表 1` 是本计划者的读数，**实施者必须自己重跑**）。

- [ ] **Step 1: 判定切割线（先读全文再切）**
  `countLines`（`:48-52`）· `scanTree`（`:55+`）· 豁免表解析（`OVER_PREFIX` `:40-41` 区）· `check()` 的 `(a)–(e)` 判据（`:120+`）· `writeTable()`（**只在 `--write` 分支**）· 主入口判定（`fileURLToPath(import.meta.url) === resolve(process.argv[1])`，**文件尾**）。
  🔴 **切割原则**：**纯函数与解析进 `lib/`；进程级副作用（argv / `process.exit` / `console` / 主入口）留主件**（AGENTS.md §3.1「纯逻辑与副作用物理分离」）。
- [ ] **Step 2: 搬进 `scripts/lib/lineScan.mjs`（纯搬迁）**
  逐字搬 `countLines` / `scanTree` / `HARD_LIMIT` / `SOFT_LIMIT` / `FROZEN_OVER_LIMIT`（**真实值，不许改数**）/ 豁免表行解析；新件头加 `@ai-context: 自 scripts/line-limits.mjs 拆出（批 8 T1，控制方 §2 G1）；口径与语义逐字不变 —— countLines 仍是全仓行数的唯一实现。`
  🔴 **不改任何一个字符**（尤其 `countLines` 的两行实现与它的注释边界说明）。
- [ ] **Step 3: 主件改成 import + re-export**
  🔴 **保持 `scripts/line-limits.mjs` 的模块导出面与拆件前逐字相同（7 名）**：`export { countLines, scanTree, parseTable, FROZEN_OVER_LIMIT, HARD_LIMIT, SOFT_LIMIT, TABLE_PATH } from "./lib/lineScan.mjs";`（**保住既有 import 路径** —— 先例：批 7 T15 的 `mdLineHtml` 迁出时保留 re-export）。🔻 **E8-2 勘误（2026-09-13，T1 实测，树 `547ffa1f`）**：原写「只点名 re-export `countLines`」⇒ 照做会**静默收窄另外 6 个导出名**（T1 实测 `scanTree` / `parseTable` / `FROZEN_OVER_LIMIT` / `HARD_LIMIT` / `SOFT_LIMIT` / `TABLE_PATH` 一度全部 `undefined`）⇒ 更正为**逐字保持 7 名**；🔴 并补记「`countLines` 的 re-export **全仓 0 个 importer**（域 = `git ls-files`）⇒ 它是**潜在契约**，不是现存契约」（E8 复测精确口径：真 importer 0；含该字样 3 文件 = `check-exemption-prose.mjs:27` 与 `app/src/ui/primitives/dialogMigration.a1.test.ts:61` 的**各自私有同名副本** + `app/src/views/session/SessionCardFlowView.tsx:41` 的**注释引用**）。
- [ ] **Step 4: 三条读数逐字对拍**
  `node scripts/line-limits.mjs --full` ⇒ **exit 0 且输出串逐字相同**；`node scripts/check-exemption-prose.mjs` ⇒ **exit 0**（它经主件取口径 ⇒ 同时证明 re-export 生效）。
- [ ] **Step 5: 纯搬迁的机械等价证据（§C14.7 / §C26.4）**
  🔴 **唯一有效判据 = 输出逐字节对拍**：把 `lib/lineScan.mjs` 的正文与 `git show HEAD:scripts/line-limits.mjs` 的对应行区间做**归一换行后的逐字节比较**（**允许的差异只有 `import` / `export` 行**）；🔴 **「我照抄了」不算证据**。
  ⚠️ **不跑 `--write`**（首选不跑；本任务不产生行数变化，跑它只会把并行在飞的中间态冻结进表）。
- [ ] **Step 6: 提交**
  ```powershell
  git add -- scripts/line-limits.mjs scripts/lib/lineScan.mjs
  git diff --cached --stat     # 只许这两个路径
  git commit -m "refactor(scripts): 拆 line-limits 为 CLI 与 lineScan 两件"
  git show --name-only --oneline -1   # 自证：只有这两个路径；parent 必须是当前 HEAD
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属，翻回旧行为 ⇒ 必须红） | 期望 |
|---|---|---|---|
| **V1** | `node scripts/line-limits.mjs --full` **exit 0** 且输出串与 `### 表 1` 第 1 行**逐字相同**（`>600 硬限 0（棘轮内）· 301–600 档 121 · 登记条目 121`） | **M1**：把 `lib/lineScan.mjs` 的 `FROZEN_OVER_LIMIT` 从真实值改成 `[]`（若原为空则改成塞入一条假路径） | **M1 后期望**：`--full` 的 `(c)` 判据在**具名输出**上红（`❌ line-limits（--full）：N 处问题` + 逐条问题行）⇒ `exit 1` |
| **V2** | **搬迁的机械等价**：`lib/lineScan.mjs` 的正文与 `git show HEAD:scripts/line-limits.mjs` 对应区间**逐字节相同**（归一换行；差异只允许 `import`/`export` 行） | **M2**：把 `countLines` 的 `- (s.endsWith("\n") ? 1 : 0)` 删掉 | **M2 后期望（🔻 E8-1 勘误后的真红点，2026-09-13 由 T1 在导出树实跑，树 `547ffa1f`；日志 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/t1/log-mutants.txt` 的 M2a/M2c）**：① **V2 的逐字节对拍报差异** —— 具名断言「**✗ ⑤ 逐字节对拍：未声明差异 = 1 处**」，差异锚 = **`原 :51`**（`旧\|   return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);` → `新\|   return s.split('\n').length;`）② **`--full` 由 exit 0 变 exit 1**，首行 **`❌ line-limits（--full）：123 处问题`**，首个问题行 **`· (c) 超过 300 行但未登记：app/src/components/KnowledgeDetailPanel.tsx（301 行）→ 运行 --write 补登并填写豁免理由`**（注：`301` = 变异后读数，基线该文件为 **300**）。🔻 **E8-1 勘误（控制方 §5，T1 实测）**：**原写「`check-exemption-prose.mjs` 的 `App.tsx 登记 549 == countLines 549` 变红（具名行）⇒ exit 1」—— 🔴 该期望不成立**：该脚本**不 import `scripts/line-limits.mjs`**（它在自己的 `:26-27` 有私有副本 `countLinesText`，**P-41**）⇒ M2 实测它 **exit 0 全绿**（`tmp/t1/log-mutants.txt` M2b = 「绿 ❌ 牙口未证」）。**「牙长在哪条具名断言上」必须由变异体裁定，不由推理裁定**（§九.8 / §C17.3） |
| **V3** | **re-export 契约**：`node -e "import('./scripts/line-limits.mjs').then(m=>console.log(typeof m.countLines))"` ⇒ `function`；且 `check-exemption-prose.mjs` **exit 0** | **M3**：删掉主件的 `export { countLines }` 行 | **M3 后期望（🔻 E8-1 勘误后的真红点，2026-09-13 由 T1 在导出树实跑，树 `547ffa1f`；日志 `tmp/t1/log-mutants.txt` 的 M3a/M3c）**：① **V3 的 import 探针** `typeof m.countLines` 由 `function` → **`undefined`**（**7 名全部** `undefined`：`scanTree` / `parseTable` / `FROZEN_OVER_LIMIT` / `HARD_LIMIT` / `SOFT_LIMIT` / `TABLE_PATH` 同时消失），**探针进程 exit 1** ② **`--full` 仍 exit 0**（主件不再 import `countLines`，它只用于 re-export ⇒ 门禁读数不受影响）。🔻 **E8-1 勘误（控制方 §5，T1 实测）**：**原写「`check-exemption-prose.mjs` 报模块导出缺失 ⇒ 该进程非零退出」—— 🔴 该期望不成立**（同 V2 的 P-41 机理）⇒ M3 实测它 **exit 0**（M3b = 「绿 ❌ 牙口未证」） |
| **V4** | `node scripts/check-command-registry.mjs` **exit 0 · 311/311/0**（无关读数不动） | — | 逐字读数 |
| **V5** | **行数**：`scripts/line-limits.mjs` ≤ **190** 且 `scripts/lib/lineScan.mjs` ≤ **150**（口径 = `countLines()`；**`.mjs` 在行数门禁视野外 ⇒ 本判据由任务报告手工给读数**） | — | 逐字读数 + 🔴 报告须写明「**这是任务自持预算，不是门禁判据**」 |

**提交信息**：`refactor(scripts): 拆 line-limits 为 CLI 与 lineScan 两件`（**subject 31 字**）

**诚实边界**：① `.mjs` **不在行数门禁视野内**（`SOURCE_EXT` 只吃 `.ts/.tsx/.rs`）⇒ ≤190/≤150 **是任务自持预算，没有任何机器守卫**（本批**不扩域**，见非目标 10）；② 本任务**不产生任何行为变化**（V1/V2/V4 全是「读数逐字持平」型判据）；③ `writeTable()` 的 `--write` 分支**本批不跑** ⇒ 它只被 V2 的逐字节对拍**间接**覆盖，**没有行为级判据**（登记为残余）。

---

### Task 2: 末尾换行 / EOL 盲区判据（**先归一 10 个文件，再加判据**）

> **依据**：规格 §13 `:983` 与批 7 §C51.7① 的登记（`commands_video.rs` 的末尾换行被吞而 `countLines()` 不变 ⇒ **门禁与豁免表都看不见**）。**控制方 §2 G1** 的施工序要求「先拆 `line-limits.mjs`」正是为这条修法腾地方。

**目标**：① **先把 10 个末尾无 `0x0A` 的源文件各补 1 个末尾换行**（**`countLines()` 不变** ⇒ 豁免表 **121 条数值一字不动**）；② 在**拆后**的 `line-limits.mjs` 里给 `--full` 加**第 (f) 条判据**：**扫描域内每个非空文件必须以 `0x0A` 结尾**（**不管 CRLF 还是 LF**，只判「末尾恰有 1 个 `0x0A`」）；③ 判据**自带变异体**（删掉某个文件的末尾换行 ⇒ 必须红在具名输出上）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（本计划者实测） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 豁免表 121 条**数值列** | 全部与实测一致（`--full` exit 0） | 只许降 | 🔴 **一字不动**（末尾换行**不改 `countLines()`** ⇒ 逐文件行数不变 ⇒ `(e)` 判据不会红） | **否**（V2 逐字节对拍表文件） |
| 10 个文件的**行数** | `NoteEditView.tsx` **412** · `RefineWorkbench.tsx` **497** · `useNoteAttention.ts` **69** · `NotesPage.tsx` **295** · `emptyStateRatchet.test.ts` **296** · `ai_provider.rs` **312** · `ai_provider_tests.rs` **266** · `asr_pass2.rs` **250** · `commands_knowledge_cards.rs` **170** · `commands_video.rs` **356** | 各自登记值 | **只加 1 字节**（每文件 `+1 B`）；行数**逐字不变** | **否**（V1 逐文件前后对拍） |
| `>600` / `301–600` / 登记条目 | **0 / 121 / 121** | 持平 | 持平 | **否** |
| 六棘轮 `FROZEN_*` | 见 `### 表 2` | 只许降或持平 | **不触碰**（补末尾换行**不改任何字面量计数**） | **否** |
| `check-command-registry` | **311 / 311 / 0** | — | 不动 | **否** |

**Files:**
- 改 **`scripts/line-limits.mjs`**（承接 T1 的拆件；加 (f) 判据 + 头注口径说明）
- 改 **10 个源文件**（**仅末尾各 +1 个 `0x0A`**）：`app/src/components/NoteEditView.tsx` · `app/src/components/RefineWorkbench.tsx` · `app/src/components/useNoteAttention.ts` · `app/src/pages/NotesPage.tsx` · `app/src/ui/primitives/emptyStateRatchet.test.ts` · `app/src-tauri/src/ai_provider.rs` · `app/src-tauri/src/ai_provider_tests.rs` · `app/src-tauri/src/asr_pass2.rs` · `app/src-tauri/src/commands_knowledge_cards.rs` · `app/src-tauri/src/commands_video.rs`
- 🔴 **`non_migrated_14` 核对**：`NoteEditView.tsx` 在 `NON_MIGRATED_14` 里！ ⇒ 🔴 **本任务对它的改动只有「文件末尾加 1 字节」，不涉及任何源代码内容、不引入任何 `ui/primitives` 引用** ⇒ **不违反 §C2.1**（该纪律管的是**守卫范围与 import**，不是文件系统字节）。**报告必须逐字写明这一条**，并把 `git diff --stat` 的读数（该文件 **+1 行 / −1 行**形态）抄进报告。
- 🔴 **不得**改 `docs/standards/line-limit-exemptions.md`（生成物）；**不得**改 `.husky/pre-commit`

**Interfaces:**
- Consumes：T1 的 `scripts/lib/lineScan.mjs`（`scanTree()` 给出的域内文件清单）
- Produces：`--full` 的**第 (f) 条判据**（输出形态 = `❌ line-limits（--full · 末尾换行）：N 处问题` + 逐条 `· 末尾无换行：<path>`）；🔴 **既有五条判据的输出形态一字不改**

- [ ] **Step 0: 先量基线**
  ```powershell
  node scripts/line-limits.mjs --full                      # 期望 exit 0 · 0/121/121
  node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/t2/eol.mjs   # 自造探针：域内末尾无 0x0A 的文件清单（期望 10 条）
  ```
  ⚠️ **探针必须用 `readFileSync(p)` 取 Buffer 判 `b[b.length-1] !== 0x0a`**（**不许**用文本 + `endsWith` —— 那会把 `\r\n` 与 `\n` 混谈）。
- [ ] **Step 1: 归一 10 个文件（各 +1 字节）**
  🔴 **用 node `fs` 追加**（`writeFileSync(p, s + "\n")` 会**重写整文件** ⇒ 必须逐字节保留原内容：**读 Buffer + `Buffer.concat([buf, Buffer.from([0x0a])])` + `writeFileSync(p, buf)`**）。
  🔴 **逐文件对拍**：补前 / 补后 `countLines()` **必须相等**；文件字节数 **必须 +1**；🔻 **E8-4 勘误（2026-09-13，T2 干跑 + 真跑实测，证据 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/t2/diff-audit.json`）**：`git diff --cached --numstat` **必然是 `1 1`（每文件 1 增 1 删）**，**不是**「1 insertion / 0 deletion」—— 给「末尾无换行」的文件补末尾换行时 git **必须重写末行**（旧侧带 `\ No newline at end of file`）⇒ 🔴 **任何正确实现都拿不到 `−0`**（详见 §E8.5 的适用域规则）；正确判据见 **V1**（**语义等价证明**，非 `−` 列计数）。
- [ ] **Step 2: 加 (f) 判据（写在拆后的主件里）**
  在 `check()` 的既有 `(a)–(e)` 之后追加 `(f)`（**只加不改**）：对 `scanTree()` 的域内文件逐个判 `末尾恰有 1 个 0x0A`；**空文件跳过**；命中即 `problems.push(\`(f) 末尾无换行：${path}\`)`。
  🔴 **口径写进头注**：本判据**只判末尾 `0x0A`**，**不判行尾风格**（CRLF 是本仓常态：`commands_video.rs` 实测 **355 个 `0x0D` / 355 个 `0x0A`** ⇒ 写成「必须 LF 行尾」会让**整仓 RED**）。
- [ ] **Step 3: 判据自证（两态）**
  ① **归一侧**：`--full` ⇒ **exit 0**（无 (f) 问题）；② **违规侧**：在**导出副本**里删掉任一文件的末尾换行 ⇒ **exit 1** 且输出含该路径。
- [ ] **Step 4: 提交（两次原子提交）**
  ```powershell
  # 提交 1：纯空白归一（10 个文件，+10 行 / −10 行 ⇒ numstat 每文件 `1 1`；🔻 E8-4 勘误：原写「−0 行」）
  git add -- app/src/components/NoteEditView.tsx app/src/components/RefineWorkbench.tsx app/src/components/useNoteAttention.ts app/src/pages/NotesPage.tsx app/src/ui/primitives/emptyStateRatchet.test.ts app/src-tauri/src/ai_provider.rs app/src-tauri/src/ai_provider_tests.rs app/src-tauri/src/asr_pass2.rs app/src-tauri/src/commands_knowledge_cards.rs app/src-tauri/src/commands_video.rs
  git diff --cached --stat          # 期望 10 files changed, 10 insertions(+), 10 deletions(-)（🔻 E8-4 勘误：原写 0 deletions(-)；`--numstat` 每文件 1 1）
  git commit -m "style(repo): 补 10 个源文件的末尾换行"
  # 提交 2：判据
  git add -- scripts/line-limits.mjs
  git commit -m "feat(scripts): line-limits 新增末尾换行判据"
  ```
  🔴 **不 push**；两次提交**都不带 `--only`**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 🔻 **E8-4 勘误后的实质判据（2026-09-13；原判据「`−` 列为 0 + 纯空白行删除 = 0」在 EOL 修正型上数学不可达）**：**判据形态 = 语义等价证明，四条全答**：① **`git diff -w --numstat` 输出为空**（空白无关差异 = 0）② 10 个文件的 `countLines()` **补前 == 补后**（逐文件）+ **`git show HEAD:<p>` 的 `countLines()` 也相等** ③ **纯空白行删除 = 0** 且 **空白行 Δ = 0**（逐文件，§C61.2 的第二道判据）④ **逐文件字节证明**：**`工作树(归一后) == git show HEAD:<p> + 恰好一个 0x0A`**（同时给出「字节数各 +1」与 **`numstat` 每文件 `1 1`**；🔴 **`−` 列 = 10，不是 0** —— 见 §E8.5） | **M1**：把某个文件的末尾**多加一个**换行（`\n\n`） | **M1 后期望**：该文件 `countLines()` **+1** ⇒ `(e)` 判据红（`(e) 行数不一致：<path> 声明 N / 实测 N+1 → 运行 --write`）⇒ **具名输出**（这条同时证明「一个没换行不可见、两个才可见」的机理）。🔻 **E8b-8 补前提（2026-09-13，E8b）**：🔴 **可达性前提 = 目标必须是「已登记」件** —— `(e)` 只对**豁免表登记条目**命中（`scripts/line-limits.mjs:170`：`registered` 里取 `declared`）；若取**未登记**件，+1 行**不触发 `(e)`**（只会触发 `(c)` 或什么也不触发）⇒ **本条须点名已登记目标**（如 `app/src/App.tsx` 登记 549） |
| **V2** | **豁免表不动**：`git status --porcelain -- docs/standards/line-limit-exemptions.md` **空**；`--full` **exit 0**（`(e)` 全绿） | — | 逐字读数 |
| **V3** | **判据有牙**：在**导出副本**里删掉 `app/src/pages/NotesPage.tsx` 的末尾换行 ⇒ `--full` **exit 1** | **M3**（即上述注入；**注入自证：该文件的最后一个字节由 `0x0a` 变为 `0x3b`（`;`），改动了恰 1 处**） | **M3 后期望**：`exit 1` + 输出含 `(f) 末尾无换行：app/src/pages/NotesPage.tsx`（**具名**） |
| **V4** | **CRLF 不被误杀**：`app/src-tauri/src/commands_video.rs`（全 CRLF）与任一 LF 文件**都判绿** | **M4**：把判据改成「最后两字节必须是 `0x0d 0x0a`」 | **M4 后期望**：全部 LF 文件（如 `scripts/line-limits.mjs` 自身若在域内…**不在域内** ⇒ 改用域内任一 LF 文件）红 ⇒ **证明判据不是「CRLF 专用」**（这是一条**反向守卫**：必须绿的反向变异在 M4 下**必须红**，从而证明原判据不偏袒任一风格） |
| **V5** | `check-command-registry` **311/311/0** · `docs-check` **exit 0（282/182；🔻 E8-12 时点更正：原写 281/181）** | — | 逐字读数 |

**提交信息**：① `style(repo): 补 10 个源文件的末尾换行`（**subject 20 字**）② `feat(scripts): line-limits 新增末尾换行判据`（**subject 26 字**）

**诚实边界**：① 本判据**只覆盖「末尾 `0x0A` 存在性」**，**不覆盖**「混用 CRLF/LF」（本计划者**未做**全树 EOL 混用普查 ⇒ 混用规则**没有**落地，登记为 `## 诚实边界 §二`）；② 「末尾换行归一」是**10 个已跟踪文件的字节级改动** ⇒ 若某个在飞单元正在编辑这 10 个文件之一，会产生**语义无冲突但 diff 相交**的情形 ⇒ 开工前必须按统一作业模式第 2 条做**文件占用检查**；③ 本判据**不改 `countLines()`**（改口径会牵动全仓 121 条登记值 —— 那是**未被裁决**的动作）。

---

### Task 3: 批 7 残留的入库文档更正 5 处（控制方 §4 表；**纯文档 / 散文**）

> **依据**：控制方 `controller-rulings.md` **§4 表**逐行。🔴 **并入批 8 的文档回写，不单独出提交**（本任务一次做完 4 处规格 + 1 处代码内散文）。

**目标**：按 **「原文 + 就地加注」（本批文档回写的唯一合法形态，规格 §11-7 的 T21 补轮逐字）** 更正 5 处：
1. **规格 `:540`（§7.4 出处与状态行）**：现逐字含「🔴 **全仓 `NoteEvidenceTrack*` = 0 命中**」（**该行自身含该符号** ⇒ 自我指涉假命题）⇒ 加注收窄为「**`app/src/**`（生产 + 测试）= 0**」，形态**照 `:905-906`**（T21 已在该处做过同一更正：`app/src/**` 之外 RAW **16** 行 / 剥注释 **6** 行 / **3** 文件，全在 `docs/**`）。
2. **规格 §4.3⑤（`:241`）**：现逐字点名 `ui/tokens.css` 作覆盖落点 ⇒ 加注「**该文件是生成物**（`tokens.css:1-4` 逐字「请勿手改」；守卫 `tokens.drift.test.ts:25-28` 断 `onDisk === renderAll().css`）⇒ **批 8 的实际落点 = 新建 `app/src/ui/proofread.css`**（控制方 §2 B1）」。
3. **规格 §7.4 的 E2 行（`:547`）**：现用 `artifact.rs:62-69` 支撑「证据本体 = `session_segments.id` / `session_ocr_blocks.id`」⇒ 加注「🔴 **实测该处是 `BlockRefs`**（产物块引用结构、**session 维度**、**0 IPC 出口**）⇒ **照字面读会误判成「必须新开 command」**（这正是 §D3 的由来）；**证据 id 的定义处** = `app/src/types/session.ts` 的 `SessionSegment.id` / `SessionOcrBlock.id` 与表 `session_segments` / `session_ocr_blocks`；**前端取数走既有 `get_session_detail`**（`commands_session.rs:137` → `:164`）」。
4. **规格 §7.4 §D2/§D3（`:568` / `:569`）**：现逐字写「**必须控制方另裁，不在执行单元权限内**」⇒ 加注**本批裁决**：**走 (a) 派生序号；明确不开 (b) 新增段级身份与「新 command」**（控制方 §2 A2 逐字）。
5. **`app/src/ui/primitives/textBaseline.ts` 的两处过期散文**：`:19` 逐字含 `551/122` · `:174` 逐字含 `551/120 不变` ⇒ 更正为 **`551/123`**（真值 = 常数 `:41` = 锚 `:49` = 逐文件表 Σ/键数，**本计划者实测三向一致**）。🔴 **净增必须 = 0**（该文件 **299 行 / 余 1**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_FONT_OOB_TOTAL` / `_FILES` / `ANCHOR_FONT_OOB` | **551 / 123 / `{count:19, files:123}`**（`textBaseline.ts:38/:41/:49`；表 Σ = **551**、键数 **123** ✅） | 双向钉死 | 🔴 **不动常数、不动逐文件表、不动锚** —— **只改两行散文里的数字** | **否**（V3 逐字：常数与表的前后 `git diff` **零 hunk**） |
| `textBaseline.ts` 行数 | **299**（余 1） | 300 | 🔴 **净增 = 0**（就地改写两行） | ⚠️ **是（若加行）** ⇒ V4 |
| 其余五族的逐文件表 | 见 `### 表 2` | 只许降 | **不触碰** | **否** |
| `docs-check` 扫描 / 检查 | 🔻 **E8-12 时点更正（2026-09-13）＝ 282 / 182**（原写 281 / 181 —— 那是**本计划文件入库之前**的读数；口径见 `## E8` §E8.12）（实跑） | 只许持平或更好 | 规格加注会**增加行数但不增加文件数** ⇒ 计数**不变** | **否**（V5 逐字对拍） |
| §C9.12 的三道回写判据（§3.4） | — | — | ① `−` 列 = 0 ② **纯空白行删除 = 0** ③ **标题 / 锚子序列对拍**（被删 / 被改 = 0） | **否**（V1/V2） |

**Files:**
- 改 **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（1035 行）** —— 4 处加注（`:540` · `:241` · `:547` · `:568/:569`）
- 改 **`app/src/ui/primitives/textBaseline.ts`（299 行，净增 0）** —— `:19` / `:174` 两处散文
- 🔴 **`NON_MIGRATED_14`**：两个文件**都不在其中**
- 🔴 **共享文件**：规格文件**必须走 blob 构造 + `update-index --cacheinfo`**（写者队列 T3 → T6 → T11 → T21）

**Interfaces:**
- Consumes：无
- Produces：规格 §7.4 §D2/§D3 的**裁决加注**（T6 依赖它来写实现注释）；§4.3⑤ 的**落点加注**（T9/T11 依赖它）

- [ ] **Step 0: 先量基线**
  ```powershell
  node scripts/check-exemption-prose.mjs   # 期望 exit 0
  node scripts/docs-check.mjs              # 期望 exit 0 · 扫描 282 / 检查 182（🔻 E8-12 时点更正：原写 281/181）
  node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/p3-frozenkeys.mjs  # 复核两处散文的真身行号
  ```
  🔴 **动手前必须自己重测 5 处锚**（规格的锚在批 7 收尾后**整体 +2**，见 `### 表 5` D-1～D-11）；**与本计划不符 ⇒ 按实测走**并在报告里逐字给出旧锚 / 新锚。
- [ ] **Step 1: 规格 4 处加注（一次做完，1 个提交）**
  逐处**只加注、不改历史原文**（形态照 T21 在 `:905-906` 的做法：`> - 🔻 **口径更正（2026-09-13 · 批 8 T3；上一行的…，原文保留）**：…`）。
  🔴 **三道回写判据（§3.4）**：`git diff` 的 **`−` 列 = 0** · **纯空白行删除 = 0** · **标题 / 锚子序列对拍**（既有标题与既有锚串**被删 / 被改 = 0**）。
- [ ] **Step 2: `textBaseline.ts` 两处散文（1 个提交，净增 0）**
  `:19`：`551/122` → `551/123`（并保留它现有的历史箭头链，**只改最后一个数**）；`:174`：`551/120 不变` → `551/123 不变`。🔻 **E8-6 时点注（2026-09-13，E8 复测）**：**本 Step 已被 T3 执行完毕**（提交 `c5b5a8ec`，`+2/−2`，净增 0）；现盘上真值 = `:19` 逐字含 `**604/124 → 576/122 → 551/123**` · `:174` 逐字含 `551/123 不变` ⇒ 🔴 **后续读者请勿再「改一遍」**（这是 §1 的「已修却仍被当成待办」同族）；本卡保留原文以便追溯「要求什么」。
  🔴 改完**必须** `wc`/`countLines` 复测 = **299**，并跑 `cd app; npx tsc --noEmit`（**P22/P23：改注释散文必须真跑一次 `tsc`**）。
- [ ] **Step 3: 提交（2 次）**
  ```powershell
  # 规格（共享文件 ⇒ blob 构造，见"提交纪律"）
  git show HEAD:docs/superpowers/specs/2026-09-11-frontend-redesign-design.md > <tmp>/spec.md
  # 在 <tmp>/spec.md 里只加自己那 4 处注
  git hash-object -w <tmp>/spec.md
  git update-index --cacheinfo 100644,<blob>,docs/superpowers/specs/2026-09-11-frontend-redesign-design.md
  git diff --cached --stat     # 只许这一个路径
  git commit -m "docs(specs): 更正批 7 残留下游五处锚与口径"
  # 代码内散文
  git add -- app/src/ui/primitives/textBaseline.ts
  git commit -m "docs(ui): 更正字号越界的过期散文为 551/123"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **回写三判据**：规格那个提交的 `git show --numstat` ⇒ `−` 列 **0**；**纯空白行删除 = 0**（自造脚本逐行对拍「剥注释后去纯空白行」的规范形 D3，承 §C55.2）；**既有标题 / 锚子序列对拍 ⇒ 被删 = 0 / 被改 = 0** | **M1**：把 `### 7.4` 的标题行整行删掉（模拟「改历史原文」） | **M1 后期望**：标题子序列对拍报 1 处缺失 ⇒ 判据红（**证明这三道判据不是空真**） |
| **V2** | **`docs-check` 不变**：`node scripts/docs-check.mjs` **exit 0** · 扫描 **282** / 检查 **182**（🔻 E8-12：原写 281 / 181） | — | 逐字读数 |
| **V3** | **常数与逐文件表零改动**：`git diff HEAD~1 -- app/src/ui/primitives/textBaseline.ts` 的 hunk **只含 `:19` 与 `:174` 两行**（逐字给 hunk 头）；`FROZEN_FONT_OOB_TOTAL=551` · `_FILES=123` · `ANCHOR_FONT_OOB` 三处**逐字节未动** | **M3**：把 `FROZEN_FONT_OOB_FILES` 改成 `122`（让散文「自洽」） | **M3 后期望（🔻 E8-3 勘误后的真锚，2026-09-13 由 T3 用变异体实跑）**：红在 **`textRatchet.test.ts:232`**（`expect(Object.keys(FROZEN_FONT_OOB_BY_FILE)).toHaveLength(FROZEN_FONT_OOB_FILES);` —— **键数断言**）与 **`:239`**（`expect(ANCHOR_FONT_OOB.files).toBe(FROZEN_FONT_OOB_FILES);`）两条**具名断言**上 —— 证明「改散文就能自洽」这条路**不存在**。🔻 **E8-3 勘误（控制方 §10，T3 实测）**：**原写「`:239` … 与 `:236` 的键数断言同时红」—— 🔴 卡锚偏 4 行**：`:236` 实为 `expect(Object.keys(FROZEN_FONT_OOB_BY_FILE).length).toBe(ANCHOR_FONT_OOB.files);`（断的是 **vs `ANCHOR_FONT_OOB`**，把常数 `123→122` **不会**让它红）⇒ 更正为 **`:232`**（**保留** `:239`）。**锚点由变异体裁定，不由推理裁定**（§九.8 / §C17.3） |
| **V4** | `textBaseline.ts` 实测 **299 行**（净增 0）且 `cd app; npx tsc --noEmit` **exit 0** | — | 逐字读数 |
| **V5** | `check-exemption-prose.mjs` **exit 0**（`App.tsx 549 == 549` 仍成立） | — | 逐字读数 |

**提交信息**：① `docs(specs): 更正批 7 残留下游五处锚与口径`（**subject 22 字**）② `docs(ui): 更正字号越界的过期散文为 551/123`（**subject 22 字**）

**诚实边界**：① 本任务**不产生任何代码语义变化**（V3 用「hunk 只含两行散文」证明）；② 规格的 4 处加注是**加注而非修订** ⇒ 规格里**仍然存在**「全仓 = 0 命中」与「点名 `ui/tokens.css`」的**原文**，只有紧邻的加注把它们收窄 ⇒ **读者若跳读仍会误读**（这是「原文 + 就地加注」体例的**已知代价**，本仓已 3 次承认为唯一合法形态）；③ `textBaseline.ts` **余 1 行** ⇒ 任何后续增量都会红，**本任务设计为净增 0**。

---

### Task 4: 常设纪律入库（`docs/standards/testing.md` 三小段 + 作业书更新）

> **依据**：侦察 D §12.3 缺口 2 的最小修法（「把 `§C24.2` + `§C24.3` + P9 写进 `docs/standards/testing.md`（三小段，不改任何判据）」）。🔴 **这三条纪律今天只活在 gitignored 的 `rulings.md` 与入库的版本记录里** —— 版本记录**不是规范**（`docs/standards/**` 全域检索「负载敏感 / flake / 未判定 / R-FLAKE」实测 **0 命中**）。

**目标**：① 在 `docs/standards/testing.md` 的 `### 第八部分：GSAP / 动效测试（L4 动效层）`（实测 `:177`）与 `## 检查清单`（实测 `:190`）之间插入 **`### 第九部分：门禁执行与稳定性纪律（批 8 立项）`**，三小段：**R-FLAKE 三条件** · **WARM-CACHE 冷热双跑** · **P9 并行假红的签名与「不得当缺陷登记」**；🔴 **不改任何既有判据、不动任何既有段落正文**；② 更新 `.superpowers/sdd/DISPATCH-TEMPLATE.md`（**99 行，gitignored ⇒ 不入库，只在报告里登记改了哪几节**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 / `FROZEN_*`** | 见 `### 表 2` | 只许降或持平 | 🔴 **一个都不触碰**（本任务只改 `.md`） | **否**（核账：`docs/**` 不在任何棘轮域内） |
| `docs-check` 扫描 / 检查 | 🔻 **E8-12 时点更正（2026-09-13）＝ 282 / 182**（原写 281 / 181 —— 那是**本计划文件入库之前**的读数；口径见 `## E8` §E8.12） | 只许持平或更好 | 改**既有文件** ⇒ 两个计数**都不变** | **否**（V2） |
| `line-limits` 读数 | **0 / 121 / 121** | 持平 | `.md` 不在扫描域 ⇒ 不变 | **否** |
| `check-exemption-prose` | **exit 0** | — | 不动豁免表 | **否** |
| `docs/standards/testing.md` 行数 | **229** | 无门禁（`.md` 无行数门禁） | **+≤18 行**（三小段） | **否**（但报告须给前后行数） |

**Files:**
- 改 **`docs/standards/testing.md`（229 → ≤247）** —— 只插入 `### 第九部分`（**共享文件 ⇒ 写者队列 T4 → T12**，走 blob 构造）
- 改 `.superpowers/sdd/DISPATCH-TEMPLATE.md`（**99 行，gitignored，不入库**）
- 🔴 **`NON_MIGRATED_14`**：两个文件都不在其中

**Interfaces:**
- Consumes：`rulings.md` §C24.2 / §C24.3 / §C6.1 与 §C45.3（**逐字要点见抽取件 `tmp/plan-writer/sub-rulings-extract.md` §2**）
- Produces：`docs/standards/testing.md` 的 `### 第九部分`（T12 追加 `### 第十部分` 时必须在它**之后**）

- [ ] **Step 0: 先量基线**：`node scripts/docs-check.mjs`（282/182；🔻 E8-12 时点更正：原写 281/181）· `countLines("docs/standards/testing.md")`（229）· 抄 `### 第八部分` 与 `## 检查清单` 的**真身行号**（本计划者实测 `:177` / `:190`；**动手前自己重测**）。
- [ ] **Step 1: 写 `### 第九部分`（三小段，逐字带出处）**
  ```md
  ### 第九部分：门禁执行与稳定性纪律（批 8 立项）

  **R-FLAKE（判「某红是 flake」的三条件，缺一 ⇒ 只写「未判定」）**：① **≥3 次重复**读数 ② **与某个可观测量的相关性**（如 transform 耗时 / 缓存冷热）③ **该文件不在本次写集内**的证据。
  **WARM-CACHE**：全量 `vitest` **冷 / 热两次**都要跑、两次读数**都**登记；**不得**只贴一次「0 failed」就当全量无红。
  **P9（并行假红）**：**门禁与变异体实验一律串行**；任何并行跑出来的红**不得**当缺陷登记，其签名必须带**测试名 + 超时阈值 + 错误串形态**并注明「串行复跑通过」；Rust 侧与 JS 侧**分开列**。
  ```
  🔴 **三段的每一句都必须能在 `rulings.md` 里指到逐字出处**（§C24.2 `:815-818` · §C24.3 `:820-822` · §C6.1 `:158-160` + §C45.3 `:1459-1464`）；**报告逐条给「本节句子 ↔ 出处行号」对照**。
- [ ] **Step 2: 更新作业书（不入库）**
  `.superpowers/sdd/DISPATCH-TEMPLATE.md`：把上述三条 + **P-31/P-32/P-33/P-34** 写进它的纪律节；🔴 **该文件在 gitignored 目录内 ⇒ 不进任何提交**；报告里只登记「改了哪几节 / 加了哪几条」。
- [ ] **Step 3: 提交（1 次，blob 构造）**
  ```powershell
  git show HEAD:docs/standards/testing.md > <tmp>/testing.md
  # 在 <tmp>/testing.md 里插入第九部分
  git hash-object -w <tmp>/testing.md
  git update-index --cacheinfo 100644,<blob>,docs/standards/testing.md
  git diff --cached --stat      # 只许这一个路径
  git commit -m "docs(standards): 补门禁稳定性纪律三小段"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **只加不改**：`docs/standards/testing.md` 的 diff **只有 `+` 列**（`−` 列 = 0）、**纯空白行删除 = 0**、**既有标题子序列对拍被删 = 0** | **M1**：把 `### 第八部分` 的标题行改写一个字符 | **M1 后期望**：标题子序列对拍报「被改 = 1」⇒ 判据红 |
| **V2** | `node scripts/docs-check.mjs` **exit 0** · 扫描 **282** / 检查 **182**（🔻 E8-12：原写 281 / 181）（**两个计数都不变** —— 证明「改既有文件不增计数」） | — | 逐字读数 |
| **V3** | **纪律与出处可对拍**：报告给出「第九部分每句 ↔ `rulings.md` 行号」对照表，**逐句可指** | **M3**：把 R-FLAKE 的「三者缺一 ⇒ 不得判为 flake」改成「缺一也可判」 | **M3 后期望**：**判据红在「报告的对拍表」上**（本任务的「判据」是文档一致性 ⇒ 它的牙 = **评审者按行号逐句核对**，见 `## 陷阱` 的「牙口未证」纪律）⚠️ **本条登记为「牙口未证」**（无机器断言） |
| **V4** | `node scripts/line-limits.mjs --full` **exit 0 · 0/121/121**（`.md` 不入域） | — | 逐字读数 |

**提交信息**：`docs(standards): 补门禁稳定性纪律三小段`（**subject 19 字**）

**诚实边界**：① 🔴 **V3 是「牙口未证」** —— 本任务的交付物是**规范文本**，它的正确性**没有机器判据**，只能由评审者按出处逐句核对；**不得**声称「纪律已落地」等同于「以后不会再犯」；② `DISPATCH-TEMPLATE.md` **在 gitignored 目录内** ⇒ 它的更新**不进版本控制**、**可能随目录清理丢失**（这是**已登记的已知代价**，本批不改变该目录的 gitignore 状态）；③ 本任务**不新增任何门禁**。

---

### Task 5: 8a 段门禁自证（**不得**写成批 8 已交付）

> **依据**：承批 7 §C7.1 —— **每段必须自己跑完八闸并出段终态读数**；**段收口 ≠ 全批收口**。

**目标**：在**无并发的独占窗口**里**串行**真跑八闸 + 附闸，逐条抄读数，给出 **8a 段终态**声明（**只声明 8a 的交付面**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 八闸全部 | 见 `### 表 1` | **只许更好或持平** | **只读** | **否**（任何回升逐条解释） |
| `lazyBudget.json` | 37 / 637,501 B | **只许降** | 只读（**不跑真构建 ⇒ 懒侧不判**） | **否** |

**Files:** 0 生产代码（产出 `tmp/t5/**` + `task-5-report.md`）

- [ ] **Step 0: 独占窗口确认**：`git status --porcelain`（期望只有 `?? docs/tech-debt/`）+ 检查 `tmp/` 里的在飞声明（**有在飞单元 ⇒ 退避 90 s × ≤5，窗口不关 ⇒ 报控制方**）。
- [ ] **Step 1: 串行跑八闸**（**逐条、不并发**；命令与期望见 `### 表 1`）：
  ```powershell
  node scripts/line-limits.mjs --full          # exit 0 · 0/121/121
  node scripts/check-command-registry.mjs      # exit 0 · 311/311/0
  node scripts/docs-check.mjs                  # exit 0 · 282/182（🔻 E8-12 时点更正：原写 281/181）
  node scripts/check-bundle-budget.mjs --no-build   # exit 0 · 首屏 105.95 kB · 懒侧 ⏭ 未判
  node scripts/bundle-eager-graph.mjs          # exit 0 · 111 / 7
  node scripts/check-exemption-prose.mjs       # exit 0
  cd app; npx tsc --noEmit                     # exit 0
  cd app; node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=<abs>/t5/vitest.json
  ```
  🔴 **vitest 必跑**（8a 改了 `line-limits.mjs` 与 10 个源文件）⇒ **读 `--outputFile` 前先查 mtime**（P-31）；文件数读 `testResults.length`。
  🔴 **Rust 不跑**（**段 8a Rust 零语义改动** —— 🔻 **E8b-1 勘误（2026-09-13，E8b 实测）**：原写「段 8a **零 Rust 改动** ⇒ 报告须给 `git log --oneline <8a 起点>..HEAD -- app/src-tauri` **为空**的证据」—— 🔴 **该主张不成立**：实测 `git log --oneline 7c1fcc41..HEAD -- app/src-tauri` **非空**（`f1742399` 归一了 **5 个 `.rs`** 的末字节：`ai_provider.rs` / `ai_provider_tests.rs` / `asr_pass2.rs` / `commands_knowledge_cards.rs` / `commands_video.rs`），`git diff --stat` = **`5 files changed, 5 insertions(+), 5 deletions(-)`**。🔴 **真证据形态（比原形态硬）** = ① `git diff -w --numstat 7c1fcc41..HEAD -- app/src-tauri` **输出为空**（零空白无关差异 = 零语义改动）② **5/5 逐字节证**：`git hash-object --path=<p>` 让 git 自己 clean ⇒ == 旧 blob（`f1742399~1:<p>`）**+ 恰一个 `0x0A`** ③ `countLines` 旧/新**逐字全等**（312/266/250/170/356）⇒ **结论「cargo 不跑」仍成立，改的是证据形态、不是结论**；🔴 **为什么必须改**：EOL 归一型改动会让 `git log <path>` **非空**、让 `git diff` **有 hunk**，却**零语义改动**（承 `## E8` §E8.5 的 EOL 型判据；登记为 **P-45b**）⚠️ **全批有 Rust 改动（T25/T27/T28）⇒ 那是 8e 的事**）。
- [ ] **Step 2: 写 `task-5-report.md`**：八闸逐条（命令 + exit + 读数）+ 与 `### 表 1` 的**逐条对账表** + **8a 段终态声明**（逐字：「**本声明只覆盖段 8a；批 8 尚未交付**」）。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 八闸逐条有「命令 + exit + 逐字读数」，且与 `### 表 1` **逐条对账**（任何差异逐条解释） | — | 逐字读数 |
| **V2** | `line-limits --full` 读数与 8a 开工基线**逐字相同**（`0 / 121 / 121`） | 🔻 **E8b-2 勘误（2026-09-13，E8b）：原一格期望自相矛盾 ⇒ 拆两颗注入**。原写「**M2**：在导出副本里给任一文件加 1 行 ⇒ **M2 后期望**：`301–600 档` **121 → 122** 且 `(e)` 判据报「行数不一致」」—— 🔴 **一次注入不可兼得**：`(c)` 只在目标**未登记**时命中（`scripts/line-limits.mjs:158`），`(e)` 只在目标**已登记**时命中（`:170`）。**M2-a**：给**未登记且恰 300 行**的件（`app/src/components/KnowledgeDetailPanel.tsx`，实测 **300**）加 1 行；**M2-b**：给**已登记**件（`app/src/App.tsx`，登记 **549**）加 1 行 | **M2-a 后期望**：`(c) 超过 300 行但未登记：app/src/components/KnowledgeDetailPanel.tsx（301 行）`（**具名**）**且** `301–600 档` **121 → 122**；**M2-b 后期望**：`(e) 行数不一致：app/src/App.tsx 声明 549 / 实测 550 → 运行 --write`（**具名**）**且档位不变**；两颗各 `exit 1`。🔴 **红点由实跑裁定，不由推理**（承批 7 `### 表 6b` E-25 与 E8-1/E8-3/E8-4 四次教训） |
| **V3** | `vitest` 的**文件数 / 用例数**与批 7 终态（**229 / 2225**）对拍：`ADDED / LOST / SHRUNK` 三类逐条列名；🔴 **LOST 与 SHRUNK 必须逐条归因** | — | 逐字读数（8a 预期：**LOST 0 · SHRUNK 0 · ADDED 0**，用例数不变） |
| **V4** | **段边界声明**：报告逐字含「本声明只覆盖段 8a」 | **M4**：把声明改成「批 8 已交付」 | **M4 后期望**：**评审者按 `## 收口回写八节` 的措辞纪律判红** ⇒ ⚠️ **本条登记为「牙口未证」**（无机器断言） |

**提交信息**：**0–1**（报告在 gitignored 目录 ⇒ 默认 **零提交**；若必须落一条只读快照 ⇒ 需控制方授权）

**诚实边界**：① 本任务**不跑真构建** ⇒ **懒侧预算未判**（`⏭`），**不得**写成「懒侧达标」；② `cargo` **不跑**（**段 8a Rust 零语义改动** —— 🔻 **E8b-1 勘误（2026-09-13）**：原写「段 8a **零 Rust 改动**」🔴 **不成立**（该段**有** 5 个 `.rs` 的末字节归一 = `f1742399`）；正确形态 = `git diff -w --numstat` 为空 + 字节证 + `countLines` 全等，逐条见 **`Step 1` 的 E8b-1**）⇒ Rust 侧读数仍是**批 7 的引用值**（⚠️ 全批的 Rust 面由 T22 覆盖）；③ V4 无机器牙（段边界是**文本主张**）。

---
## 段 8b · 主线一：两条能力（T6–T11）

> **控制方 §2 的裁决是本节的全部依据**：**A1**（零新 IPC —— 证据已在 `get_session_detail` 里）· **A2**（段级身份走**派生序号**）· **A3**（「三轨」= 笔记段落 + 转写段 + OCR 块，**必须写进规格**）· **A4**（E2 容差**写进判据**）· **A5**（复用既有渲染链）· **B1**（CSS 落点 = 新建 `app/src/ui/proofread.css`）· **B2**（`data-proofread-mode`，**不得**用 `data-proofread`）。
> 🔴 **两条能力的判据纪律**：功能型判据**抓不住「在哪一步取键」**（§C53.5 逐字）⇒ 本段的三个取样时点（**双分母的计数时点** · **tie-break 比较键的取样时点** · **CSS 覆盖的生效层级**）**必须各有一条源码级 / 顺序级判据**。

---

### Task 6: A · 纯函数片（`views/note/noteEvidenceModel.ts`）+ 规格 §7.4 §D 的裁决加注

> **为什么先做它**：控制方 §2 与侦察 B 一致认定它是**最小第一步** —— **零新 IPC / 零 schema / 零 Rust**（同时绕开 §D2 与 §D3 两条裁决），且**只新增文件**（不碰任何贴边件）。它一次钉住 **E1/E2/E3 三条口径的全部可判部分**。

**目标**：新建 `app/src/views/note/noteEvidenceModel.ts`（**纯函数**）：① `[[ts:ms]]` **锚点抽取**（段落级）② **ms 最近邻** + **容差**（`EVIDENCE_TOLERANCE_MS`，**具名导出**，取值依据写进判据与注释）③ **tie-break**（`start_ms` 升序 → 同值取 `id` 升序；**不得依赖数组顺序**）④ **显式失配标记**（容差内无候选 ⇒ 返回 `{kind:"no-evidence"}`，**不许静默取最近的一个**）⑤ **双分母**（分母甲 = 派生段落总数 · 分母乙 = 带锚点段落数）。**配套**：单测 + 四类无锚点 fixture + 精修前后两态 fixture（**纯数据**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（本计划者实测） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_MUTED_GRAY_BY_FILE["views/note/noteEvidenceModel.ts"]` | **无键**（新文件） | 无键 ⇒ **出现即红** | 🔴 **不得出现 `#9ca3af`** | **是（若出现）** ⇒ V5 |
| `FROZEN_FONT_OOB_BY_FILE`（同上） | **无键** | 出现即红 | 🔴 **不得出现 <12px 的 `fontSize`**（本件是**纯逻辑件**，预期**零 `fontSize`**） | **是（若出现）** ⇒ V5 |
| `FROZEN_BORDER_BY_FILE` / `RADIUS_OUTLIER_BY_FILE` / `SHADOW_BY_FILE`（同上） | **无键** | 出现即红 | 🔴 纯函数件 ⇒ **零样式字面量** | **是（若出现）** ⇒ V5 |
| `FROZEN_NATIVE_BUTTON_BY_FILE`（同上） | **无键** | 出现即红 | 🔴 **零 `<button>`** | **是（若出现）** ⇒ V5 |
| 测试件与 fixtures 件 | **不进棘轮域**（域减 `*.test.ts(x)`） | — | `noteEvidenceModel.test.ts` 与 `noteEvidence.fixtures.ts` ⚠️ **后者不进域（不是 `*.test.*`）** ⇒ **它也必须零字面量** | **是（若出现）** ⇒ V5 |
| 其余冻结族（六棘轮 + `<Surface>` + registry） | 见 `### 表 2` | — | **一个都不触碰** | **否** |

**Files:**
- 新建 `app/src/views/note/noteEvidenceModel.ts`（预算 **≤220 行**；纯函数 + 类型 + 具名常量）
- 新建 `app/src/views/note/noteEvidenceModel.test.ts`（预算 ≤260 行）
- 新建 `app/src/views/note/noteEvidence.fixtures.ts`（预算 ≤180 行；**四类无锚点 + 精修两态**的纯数据）
- 改 **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（1035）** —— §7.4 的 **§A3 三轨定义加注**（控制方 §2 A3 逐字要求：「**实现单元必须把该定义以「原文 + 就地加注」写进规格 §7.4**」）
- 🔴 **`NON_MIGRATED_14`**：三个新文件都不在其中；规格文件不在 `app/src/**`
- 🔴 **不得**新建 IPC（§2 A2）· **不得**碰 `app/src-tauri/**`（零 Rust）· **不得**碰 `views/registry.ts`（归 T8）

**Interfaces（本任务对下游的契约，逐字）**
```ts
// @ai-context 批 8 T6（规格 §7.4 §A/§B/§C）：笔记「带证据三轨」的**模型层唯一实现**。
//   「三轨」的口径（控制方 §2 A3）：笔记段落轨（本件派生的段落序号）+ 转写段轨（session_segments.id）
//   + OCR 块轨（session_ocr_blocks.id）。证据本体是 **id**，段落锚点只有 **ms** ⇒ 故 E2 降级为 ms 最近邻。
export interface EvidenceAnchor { readonly paragraphIndex: number; readonly ms: number }
export interface EvidenceCandidate { readonly id: number; readonly startMs: number }        // 转写段
export interface OcrEvidenceCandidate { readonly id: number; readonly timestampMs: number } // OCR 块
export interface EvidenceLine { readonly paragraphIndex: number; readonly text: string }
export const EVIDENCE_TOLERANCE_MS: number;   // 🔴 具名导出；**取值依据必须写在判据里**（§2 A4）
export const NO_EVIDENCE_MARK: string;        // 显式失配标记的**唯一串**（不许散落字面量）
export function extractAnchors(paragraphs: readonly EvidenceLine[]): readonly EvidenceAnchor[];
export function nearestSegment(anchorMs: number, candidates: readonly EvidenceCandidate[], toleranceMs?: number): EvidenceCandidate | null;
export function nearestOcrBlock(anchorMs: number, candidates: readonly OcrEvidenceCandidate[], toleranceMs?: number): OcrEvidenceCandidate | null;
export type EvidenceMatch =
  | { readonly kind: "hit"; readonly anchor: EvidenceAnchor; readonly segment: EvidenceCandidate; readonly ocr: OcrEvidenceCandidate | null }
  | { readonly kind: "no-evidence"; readonly anchor: EvidenceAnchor };
export function evidenceFor(anchor: EvidenceAnchor, segments: readonly EvidenceCandidate[], ocr: readonly OcrEvidenceCandidate[], toleranceMs?: number): EvidenceMatch;
export interface Coverage { readonly byDerived: number; readonly byAnchored: number }  // E3 双分母，**并列**
export function coverageOf(lines: readonly EvidenceLine[], matches: readonly EvidenceMatch[]): Coverage;
```

- [ ] **Step 0: 先量基线 + 立影响面**
  ```powershell
  node scripts/line-limits.mjs --full          # exit 0 · 0/121/121
  cd app; npx tsc --noEmit                     # exit 0
  node scripts/docs-check.mjs                  # exit 0 · 282/182（🔻 E8-12 时点更正：原写 281/181）
  ```
  🔴 **并复测三处针法**（`NoteEvidenceTrack` / `data-evidence-for` / `data-evidence-id` 在 **`git ls-files` 入库域**的命中）：本计划者实测 = **`app/src/**` 0 处 / 0 文件**；`app/src` 之外 = RAW 16 行 / 剥注释 6 行 / 3 文件（**全在 `docs/**`，含规格自身的加注**）⇒ 🔴 **报告不得写「全仓 0 命中」**（**自我指涉假命题**，见 `### 表 5` D-11 与控制方 §4 第 1 条）。
- [ ] **Step 1: 定容差（**先定值，再写实现**）**
  容差取值必须**有依据且可复算**。建议形态（实施者可改，**但必须给依据**）：以**转写段的典型时长**为锚 —— 从 `session_segments` 的 `start_ms`/`end_ms` 分布取一个**保守上界**，并**在判据里逐字写出**「为何是这个数」（例如「≤ 一个典型段的时长 ⇒ 命中率与可解释性折中」）。🔴 **E2① 逐字要求「必须写进判据而非注释」** ⇒ `noteEvidenceModel.test.ts` 必须有**至少一条 `expect`** 直接引用 `EVIDENCE_TOLERANCE_MS`（**不是**只在注释里提它）。
- [ ] **Step 2: 实现五个函数（自底向上：类型 → 纯函数 → 组合）**
  🔴 **tie-break 的实现纪律**：**先按容差过滤，再按 `startMs` 升序、同值按 `id` 升序排序，取首个**（**不得**依赖输入数组顺序、**不得**用 `Array.prototype.sort` 的稳定性做隐式契约 —— 必须显式比较 `id`）。
- [ ] **Step 3: 双分母的**取样时点**（🔴 §C53.5 的适用点 ①）**
  `coverageOf` **必须**在「段落已派生」**之后**、在「匹配结果已定」**之后**取样：`byDerived = lines.length` · `byAnchored = extractAnchors(lines).length`。🔴 **实现顺序写死**（先 `lines` → 再 `anchors` → 再 `matches` → 最后 `coverage`），并**另加一条源码顺序判据**（V3）。
- [ ] **Step 4: 四类无锚点 + 两态 fixture（纯数据）**
  逐类一份：① `OcrDirect`（图文会话；段落**全部无锚点**）② `Web`（网页正文；**未接线变体的唯一覆盖面**）③ **手动笔记**（无发射路径；**另断言：用户编辑不得被自动补锚点**）④ **`anchor_timestamps=false`**（同输入两态：`true` ⇒ 有锚点段 > 0；`false` ⇒ **锚点 0 个、证据列 0 个、`data-evidence-for` 仍逐段在**）；⑤/⑥ **精修前 / 精修后**两态（**同一套断言**，差值逐条归因到 §C 契约）。
- [ ] **Step 5: 规格 §7.4 加注（§2 A3 的硬要求）**
  在 §7.4 的 §A（`:542` 区）加一条：`> - 🔻 **批 8 T6 就地加注（2026-09-13；上一行原文保留）—— 「三轨」的实现口径（控制方 §2 A3）**：**笔记段落轨（`data-evidence-for` 挂在其上）+ 转写段轨（`session_segments.id`）+ OCR 块轨（`session_ocr_blocks.id`）**。🔴 规格原文**未逐字给这三条** ⇒ 以本注为准；证据本体是 **id**、段落锚点只有 **ms** ⇒ E2 的「降级为 ms 最近邻」是**类型上的必然**，不是实现偷懒。`
  🔴 **共享文件 ⇒ blob 构造**（写者队列 **T3 → T6 → T11 → T21**）。
- [ ] **Step 6: 提交（2 次）**
  ```powershell
  git add -- app/src/views/note/noteEvidenceModel.ts app/src/views/note/noteEvidenceModel.test.ts app/src/views/note/noteEvidence.fixtures.ts
  git commit -m "feat(notes): 新增带证据三轨的模型层纯函数"
  # 规格（blob 构造，见"提交纪律"）
  git commit -m "docs(specs): 加注三轨口径为段落与转写与 OCR"
  ```
  🔴 **不 push**；两次都**不带 `--only`**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **E2 三件（功能型）**：① **容差边界两侧**（恰好 = 容差 ⇒ 命中；容差 + 1 ms ⇒ **不命中**）② **数组次序无关性**（同一集合喂**两种不同次序** ⇒ **同一输出**）③ 失配 ⇒ `kind === "no-evidence"` | **M1a**：把 `nearestSegment` 的 `<= tolerance` 改成 `< tolerance`；**M1b**：把「容差内无候选」分支改成「取最近的一个」并返回 `hit` | **M1a**：边界用例红在**具名 `expect`**（`恰好等于容差必须命中`）；**M1b**：失配用例红在**具名 `expect`**（`容差内无候选必须出显式无证据标记`）；两条都**真的改变行为**；**注入自证恰 1 次** |
| **V2** | **tie-break 确定序**：多个候选同 ms 或同距离 ⇒ 取 `start_ms` 升序 → 同值取 `id` 升序 | **M2**：把比较器改成只比 `startMs`（去掉 `id` 的次键），并让 fixture 里存在**两个同 `startMs` 不同 `id`** 的候选 | **M2 后期望**：该用例红（**具名**：`同 ms 时必须取 id 最小者`）⇒ 证明次键**不是装饰** |
| **V3** | 🔴 **源码顺序判据（§C53.5 适用点①）**：`noteEvidenceModel.ts` 里 `coverageOf` 的**取样顺序**必须逐序出现（`paragraphIndex` → `extractAnchors` → `evidenceFor` → `coverageOf` 的键），照 `shellPhase.guard.test.ts:128-146` 的 `indexOf` 三块逐序形态写 | **M3**：把 `byAnchored` 改成 `matches.filter(m => m.kind === "hit").length`（**先匹配后计数** ⇒ 分母恒等于命中数） | **M3 后期望**：**功能型判据可能仍绿**（这正是 §C53.5 的机理）⇒ **只有 V3 的源码顺序判据红**（具名断言）⇒ **本用例的存在理由由它自己证明** |
| **V4** | **E3 双分母并列**：`coverageOf` 的返回同时含 `byDerived` 与 `byAnchored`，且**两个数在同一组输入下可以不同** | **M4**：让 `coverageOf` 的 `byAnchored` 也返回 `lines.length`（两分母合一） | **M4 后期望**：`无锚点段落全部计入分母乙` 的用例红（**具名**）⇒ 证明「禁止只报一个数」有牙 |
| **V5** | **新文件的冻结键**：`noteEvidenceModel.ts` / `noteEvidence.fixtures.ts` 在两个域内的**命中数全为 0**（`frozen.mjs` 式自测：mutedGray / fontOob / border / radius / shadow / nativeBtn **各 0**） | **M5**：往 `fixtures.ts` 里塞一行 `fontSize: 11`（越界档） | **M5 后期望**：`textRatchet.test.ts` 🔻 **E8b-5 勘误（2026-09-13，E8b）：原写「报的具名断言 = `冻结表的逐文件之和 ≠ 冻结总数`」= `:231`，🔴 该断言与本源变异体的作用面无关** —— `:231` 比的是 `sumOf(FROZEN_FONT_OOB_BY_FILE)`（**冻结表内部 Σ**）vs 常数，**往源码塞字面量不改冻结表** ⇒ `:231` **恒绿**。🔴 **真红点** = **`:225`**（`全仓 <12px 字号已从基线 551 涨到 552`，② 总数 ≤ 冻结总数）+ **`:261`**（`域内实测总数与冻结总数不符`，⑥）；若塞进**冻结表外的文件**则另有 **`:244`**（`这些文件有 <12px 字号但不在冻结表里（新增越界字号）`，⑤）⇒ 证明「新文件出现字面量就会红」（**以实跑为准**） |
| **V6** | **四类 + 两态 fixture 全部有断言**：逐类一条 `it`，`anchor_timestamps=false` 那条**必须与 `true` 态同输入对拍** | **M6**：删掉 `false` 态那一条 `it` | **M6 后期望**：**用例数对拍**（8e/T22 的逐文件 LOST 对拍）报 `LOST = 1` ⇒ 红在**具名文件**上（这条同时是 `## 陷阱` 的 P-「只测默认配置 = 假绿」的落地） |

**提交信息**：① `feat(notes): 新增带证据三轨的模型层纯函数`（**subject 22 字**）② `docs(specs): 加注三轨口径为段落与转写与 OCR`（**subject 24 字**）

**诚实边界**：① 本任务**只交模型层** —— **没有视图、没有注册表第三项、没有容器取数**（T8/T10 才做）⇒ **不得**声称「带证据三轨已交付」；② 容差**数值本身是设计决定**（规格 §E③ 逐字「不定数值」）⇒ 报告必须给**取值依据**，且**不得**把它写成「规格规定的值」；③ 四类 fixture 里的 **`Web` 类今天没有生产发射路径**（`note_body_source.rs:24-27` 是 `#[allow(dead_code)]` 预留变体）⇒ 它测的是**未接线变体**，**不得**写成「覆盖了网页正文的真实路径」；④ 精修后两态的「锚点消失」是**设计行为**（§C 契约）⇒ 判据**必须**走失配分支，**不得**报成缺陷。

---

### Task 7: 拆件片（三件贴边件：`NotesReadingColumn.tsx` 300 · `.views.test.tsx` 300 · `TopBar.test.tsx` 299）

> **依据**：控制方 §2 的施工序（B 的**入口按钮必须后置**，因为 `TopBar.test.tsx` **299 / 余 1**）+ 侦察 B 的风险 4（A 的四步里最可能撞守卫的两件是 `NotesReadingColumn.tsx` 与它的测试件，**各 300 / 余 0**）。🔴 **本任务必须先于 T8/T10/T11**。

**目标**：把三件贴边件**纯搬迁**地拆到**留足头寸**：`NotesReadingColumn.tsx` **300 → ≤275**（留 ≥25 给 T10）· `NotesReadingColumn.views.test.tsx` **300 → ≤275**（留 ≥25）· `TopBar.test.tsx` **299 → ≤275**（留 ≥20 给 T11）。**搬迁只搬不改**（§C9.19 第 1 条）：**行为零变化、文案零变化、判据零变化**。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 三件的**行数** | **300 / 300 / 299** | ≤300（>300 必登记；>600 硬限） | 🔴 **拆后必须 ≤275**（**留头寸**，不许只降 1 行） | **否**（V1 逐件读数） |
| `FROZEN_*_BY_FILE` 的**逐键**（三件现有的键） | 本计划者实测：三件在**六族里全部无键**（`### 表 3`） | — | **无键可搬**；但**新家会进域** ⇒ 🔴 **新家的六族键必须各为 0** | ⚠️ **是（若新家带字面量）** ⇒ V4 |
| 六棘轮 Σ | mutedGray **63** · fontOob **551** · border **201** · radius **254** · shadow **24** · nativeBtn **392** | **逐字不变** | **搬迁守恒**（源键减少 / 新键增加 ⇒ **总量不变**；本任务预计**两侧都 0**） | **否**（V4 给逐键 diff） |
| `SPLIT_MOVES` / `MIGRATED_SITES` | 1 条存量 / **99 / 35 文件** | 只按守恒 | 🔴 **不涉原生 `<button>` ⇒ 零新增** | **否** |
| `lazyBudget.json`（37 / 637,501 B）· 首屏（105.95 kB） | 见 `### 表 5` | 只许降 | ⚠️ **拆件会改 chunk 边界** ⇒ **同提交重冻受影响族**（总量不得抬高）+ 逐键 diff | ⚠️ **是（若越界）** ⇒ V5 |

**Files:**
- 改 **`app/src/components/notes/NotesReadingColumn.tsx`（300 → ≤275）** —— 拆法（**按可判据的切割线，不许凭感觉**）：
  ① **加载器与键常量**（`:71-73` 的 `CARD_FLOW_KEY` / `CARD_FLOW_LOAD` + `:172` 的 lazy 映射工厂）→ 新建 `app/src/components/notes/readingColumnLoaders.ts`；
  ② 若仍 >275：**展示性子件**（通知行 / 空态 / 边框容器等**无状态**片段）→ 新建 `app/src/components/notes/NotesReadingColumn.parts.tsx`。
- 改 **`app/src/components/notes/NotesReadingColumn.views.test.tsx`（300 → ≤275）** —— 把**共享夹具与宿主挂载工具**抽到新建 `app/src/components/notes/readingColumnTestKit.tsx`
- 改 **`app/src/shell/TopBar.test.tsx`（299 → ≤275）** —— 把**源码读取器与常量**（`APP_CODE` 式 helper）抽到新建 `app/src/shell/topBarTestKit.ts`
- 🔴 **`NON_MIGRATED_14`**：三件**都不在其中**（逐字核对：它们分别是 `components/notes/**` 与 `shell/**`；14 条全在 `components/**` 的具名清单里，**零交集**）
- 🔴 **路径锚更正（承 §C55.4 的教训）**：`NotesReadingColumn.tsx` 的真身是 **`app/src/components/notes/NotesReadingColumn.tsx`**；`app/src/views/note/NotesReadingColumn.tsx` **不存在**（本计划者实测）

**Interfaces:**
- Consumes：三件现有的**全部对外契约**（`NotesReadingColumn` 的 props 面一个字不改）
- Produces：三个新件（`readingColumnLoaders.ts` · `NotesReadingColumn.parts.tsx` · `readingColumnTestKit.tsx` · `topBarTestKit.ts`）—— 🔴 **它们是 T10/T11 的落点**

- [ ] **Step 0: 先量基线 + 三件逐字节冻结**
  ```powershell
  node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/p1-lines.mjs   # 期望三件 = 300 / 300 / 299
  cd app; node node_modules/vitest/vitest.mjs run src/components/notes/NotesReadingColumn.views.test.tsx src/shell/TopBar.test.tsx --reporter=json --outputFile=<abs>/t7/before.json
  ```
  🔴 **跑完必须查 `before.json` 的 mtime**（P-31）并把**用例数**抄进报告。
- [ ] **Step 1..3: 逐件纯搬迁（每件一个提交）**
  🔴 **纯搬迁的机械等价证据（§C14.7 / §C26.4：唯一有效判据 = 输出逐字节对拍）**：每件搬迁后，把**新家的正文**与 `git show HEAD:<原件>` 的对应行区间做**归一换行后的逐字节比较**（允许差异只有 `import` / `export` 行）；**并**给出**结构快照对拍**（DOM 结构 / 渲染文本逐字节）。🔴 **「我照抄了」不算证据**。
  🔴 **每个提交的门禁读数必须与拆前逐字持平**（`line-limits` / `tsc` / 该件的用例数）。
  🔴 **`--write` 不跑**（本任务**不改任何已登记文件的行数**吗？ —— **改**：三件都不是「301–600 档」的登记对象（它们 ≤300）⇒ **豁免表不动**；报告须逐字说明这一点并给 `git status --porcelain -- docs/standards/line-limit-exemptions.md` 为空的证据）。
- [ ] **Step 4: 提交（3 次）**
  ```powershell
  git commit -m "refactor(notes): 抽出阅读列的加载器与展示性子件"
  git commit -m "test(notes): 抽出阅读列视图测试的共享夹具"
  git commit -m "test(shell): 抽出顶栏测试的源码读取器"
  ```
  🔴 **不 push**；三次都**不带 `--only`**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **行数**：三件实测 **≤275 / ≤275 / ≤275**，且**都 >300 − 25 的语义头寸**（即**真正腾出了头寸**，不是降 1 行交差） | **M1**：把某一处搬迁**回滚**（把抽出的片段粘回原件） | **M1 后期望**：该件行数回到 **≥300** ⇒ 判据红（**具名读数**） |
| **V2** | **纯搬迁的机械等价**：三件各自的**新家正文**与 `git show HEAD:<原件>` 对应区间**逐字节相同**（差异只允许 `import`/`export`）；**且**结构快照对拍逐字节相同 | **M2**：把 `NotesReadingColumn.parts.tsx` 里某一处 `className` 改一个字符 | **M2 后期望**：逐字节比较报差异 + **结构快照对拍**报差异（两条具名判据同时红） |
| **V3** | **行为零变化**：`NotesReadingColumn.views.test.tsx` 与 `TopBar.test.tsx` 的**用例数**与拆前**逐字相同**（读 `assertionResults.length`）；全量 `vitest` 的 `LOST = 0 · SHRUNK = 0` | — | 逐字读数（含 `before.json` / `after.json` 两份 + mtime） |
| **V4** | **冻结键守恒**：四个新件在六族的键**各为 0**；六棘轮 Σ **逐字不变**（63 / 551 / 201 / 254 / 24 / 392） | **M4**：往 `NotesReadingColumn.parts.tsx` 里塞一处 `border: "1px solid #e5e7eb"` | **M4 后期望**：`surfaceRatchet.test.ts` 的「常量 == Σ表」与「实测 == 冻结值」两条**红在具名断言**上（`surfaceBaseline.ts` 的路径会被报出来） |
| **V5** | **懒侧与首屏**：若拆件改了 chunk 边界 ⇒ `check-bundle-budget` 的真构建读数**逐族逐键 diff** 给出；总量 **≤ 637,501 + 64** | — | 逐字读数 + 逐族 diff（**越界才重冻**，且总量不得抬高） |
| **V6** | `cd app; npx tsc --noEmit` **exit 0** + `node scripts/line-limits.mjs --full` **exit 0 · 0/121/121** | — | 逐字读数 |

**提交信息**：① `refactor(notes): 抽出阅读列的加载器与展示性子件`（**subject 22 字**）② `test(notes): 抽出阅读列视图测试的共享夹具`（**subject 18 字**）③ `test(shell): 抽出顶栏测试的源码读取器`（**subject 16 字**）

**诚实边界**：① 本任务**不产生任何可运行的新行为**（V2/V3 全是「逐字节持平」型判据）；② 四个新件**进棘轮域**（它们不是 `*.test.*`）⇒ 新件里的任何颜色 / 字号 / 边框字面量**都会立刻红**（这是**有意**的：测试夹具也不该带样式字面量）；③ `TopBar.test.tsx` 拆到 ≤275 后，T11 的追加仍可能把它推近 300 ⇒ **T11 必须自己复测**（本任务只保证「留 ≥20 头寸」，**不保证 T11 的追加量**）。

---

### Task 8: A · 视图片（`NoteEvidenceTrackView.tsx` + 注册表第三项）

> **依据**：规格 §7.4 §A 的 E1（**每段**都有 `data-evidence-for`（含无锚点段）∧ **只有带锚点段**才渲染证据列）+ §D4（**不得新写第 3 支手写 markdown 解析器** ⇒ 复用既有渲染链）。

**目标**：新建 `app/src/views/note/NoteEvidenceTrackView.tsx`（吃 `NoteViewSlot`），把 T6 的模型渲染成**笔记段落 + 证据列**；并在 `views/registry.ts` 加**第三项视图**（`NOTE_VIEWS` + `FROZEN_VIEW_KEYS.note` **两处同改**）。🔴 **`NoteViewSlot` 一字不改**（非目标 7）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_VIEW_KEYS.note` | `["raw","cardflow"]`（`registry.ts:134` 区） | 冻结声明 | 🔴 **加第三项**（`"evidence"`）⇒ 与 `NOTE_VIEWS` **两处同改** | **是（若只改一处）** ⇒ V2（G1 对拍） |
| `FROZEN_BORDER_BY_FILE["views/note/NoteEvidenceTrackView.tsx"]` | **无键**（新文件） | 出现即红 | 🔴 **首选 `border: "1px solid var(--ed-border)"`（token 直写 ⇒ 零字面量 ⇒ 零棘轮动作）**；**若**选 `<Surface>` ⇒ 🔴 **同提交走 §C9.5 三步**（加登记行 + 抬 `FROZEN_SURFACE_TAG_TOTAL` 47 → 48 + 同步 `SURFACE_TAG_ANCHOR.entries` 29 → 30）+ 报告逐键 diff | **是**（若两者都忘了）⇒ V4 |
| `FROZEN_RADIUS_OUTLIER_BY_FILE` / `SHADOW_BY_FILE` / `MUTED_GRAY` / `FONT_OOB` / `NATIVE_BUTTON`（新文件） | **无键** | 出现即红 | 圆角走 `var(--ed-radius-*)` · 阴影走 `var(--ed-shadow-1)` · 字号 ≥12px 或走 `Text size` 档 · **零原生 `<button>`** | **是（若出现）** ⇒ V4 |
| `registry` IPC 面 | **311 / 311 / 0** | 不动 | 🔴 **视图注册不是 IPC 注册** ⇒ `check-command-registry` 不变 | **否**（V5） |
| 其余四族 + `buttonMigration` | 见 `### 表 2` | — | **不触碰**（新文件不进 `MIGRATED` 35 名单） | **否** |

**Files:**
- 新建 `app/src/views/note/NoteEvidenceTrackView.tsx`（预算 ≤240 行）
- 改 **`app/src/views/registry.ts`（137）** —— `NOTE_VIEWS`（`:110` 区）+ `FROZEN_VIEW_KEYS.note`（`:134` 区）
- 改 `app/src/views/registry.test.ts`（145）· `app/src/views/registryResolution.test.ts`（256）—— 期望值同步（**只增不减**）
- 改 `app/src/views/architecture.guard.test.ts`（260）· `app/src/views/architecture.slots.test.ts`（100）—— 视图计数与槽对拍（**若实测不需要改则零改动**，报告须给「逐字复核后无需改」的证据）
- 新建 `app/src/views/note/NoteEvidenceTrackView.test.tsx`（预算 ≤220 行）
- 🔴 **`NON_MIGRATED_14`**：以上文件都不在其中
- 🔴 **不得**改 `views/registry.ts` 的 `NoteViewSlot`（`:80-85` 的 4 字段）

**Interfaces:**
- Consumes：T6 的 `noteEvidenceModel.ts`（全部导出）· `NoteViewSlot`（**4 字段，一字不改**）
- Produces：视图键 `"evidence"`；DOM 契约：**每个段落节点**带 `data-evidence-for="{paragraphIndex}"`；**只有带锚点段**渲染证据列；证据列的每个候选带 `data-evidence-id="{id}"`；失配段带 `NO_EVIDENCE_MARK`（**T10 的行为判据测它**）

- [ ] **Step 0: 先量基线**：`node scripts/check-command-registry.mjs`（311/311/0）· `node scripts/line-limits.mjs --full`（0/121/121）· `cd app; npx tsc --noEmit`（0 错）· 🔴 **重测 `registry.ts` 的两处真身行号**（本计划者实测 `NOTE_VIEWS` 在 `:110`、`FROZEN_VIEW_KEYS` 在 `:134`）。
- [ ] **Step 1: 写视图（复用既有渲染链）**
  🔴 **渲染链的复用形态（§2 A5）**：① **不得**新写 markdown 解析器；② 段落注入 `data-evidence-for` 的**唯一合法接缝** = `noteMarkdownComponents.tsx`（per-block `components` 映射，**277 行 / 余 23**）**或** `NoteMarkdown` 的 `remarkPluginsExtra`（`:92` 逐字「**只许追加、不许替换**」）；③ 若需要新 remark 插件 ⇒ **照 `noteCardModel.ts:89-104` 的范式**（只挂 `block.data.hProperties`、**只遍历顶层、零 markdown 词法**）。
  🔴 **本任务的取舍**：**优先零改动既有渲染链**（证据列在**视图自己的容器里**渲染，段落数据由模型层派生）⇒ 若实施者判断必须改 `noteMarkdownComponents.tsx` ⇒ **必须**先复核它的冻结键（border **1** / radius **2**，**均只许降或持平**）并在预算表里补一行。
- [ ] **Step 2: 注册表两处同改 + 判据件期望值同步**
  🔴 **`FROZEN_VIEW_KEYS` 与 `NOTE_VIEWS` 是 G1 双向对拍的**（`registry.test.ts`）：**只改一处必红**。
- [ ] **Step 3: 视图侧判据**
  DOM 级：① `data-evidence-for` **逐段**在（含无锚点段）② 证据列**只在带锚点段**上 ③ 失配段出**显式标记** ④ **无锚点段零「无证据」告警**（E1 反向）。
- [ ] **Step 4: 提交（2 次）**
  ```powershell
  git commit -m "feat(notes): 新增带证据三轨的视图片"
  git commit -m "feat(views): 注册笔记第三视图并同步冻结键"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **E1 双向**：① 有锚点段 ⇒ **必有**证据列 ② 无锚点段 ⇒ **必无**证据列且**无「无证据」告警** | **M1**：把所有段都渲染证据列（含无锚点段） | **M1 后期望**：用例红在**具名 `expect`**（`无锚点段落不得出现证据列或告警`） |
| **V2** | **注册表双向对拍（G1）**：`registry.test.ts` 的 `keysFor` ↔ `FROZEN_VIEW_KEYS` 逐字相等；`registryResolution.test.ts` 的 `load()` 能解析出**真实模块** | **M2**：只改 `NOTE_VIEWS` 不改 `FROZEN_VIEW_KEYS` | **M2 后期望**：`registry.test.ts` 红在**具名断言**（键集不相等） |
| **V3** | 🔴 **`NoteViewSlot` 一字不改**：`git diff` 对 `registry.ts:80-85` **零 hunk**；`architecture.slots.test.ts` 的 tsc 探针**仍绿**（视图 props ⊆ slot） | **M3**：给 `NoteEvidenceTrackView` 加一个独立 prop（slot 外） | **M3 后期望**：`architecture.slots.test.ts` 的 tsc 探针报 **TS2769**（**具名编译错**）⇒ 红 |
| **V4** | **新文件冻结键全 0**（六族）+ `<Surface>` 若使用则**三连通**（Σ 登记 = Σ 实测 = 常数；锚同步） | **M4**：在视图里写 `border: "1px solid #e5e7eb"` | **M4 后期望**：`surfaceRatchet.test.ts` 的双向判据红（**具名**） |
| **V5** | `check-command-registry` **311/311/0** · `line-limits --full` **0/121/121** · `tsc` **0 错** | — | 逐字读数 |
| **V6** | **走查零命中（P-34 域）**：`data-evidence-for` 在 **`app/src/**`** 由 0 → **>0**（正控），`app/src` 之外**只许出现在 `docs/**`** | — | 逐字读数（🔴 **不得**写「全仓 0 命中」） |

**提交信息**：① `feat(notes): 新增带证据三轨的视图片`（**subject 17 字**）② `feat(views): 注册笔记第三视图并同步冻结键`（**subject 21 字**）

**诚实边界**：① 本任务的视图**只吃 slot 的 4 个字段** ⇒ **证据数据本身还进不来**（T10 才注入）⇒ **不得**声称「第三视图可用」；② 视图的**观感**（列宽 / 对齐 / 密度）**未测**（像素面归 T12–T15）；③ 若实施者发现「必须给 `noteMarkdownComponents.tsx` 加行」⇒ 它 **277 / 余 23** ⇒ **净增 ≤ +23 且不得新增冻结字面量**，否则 **STOP 报控制方**。

---

### Task 9: B · 模式位片（`shell/proofreadMode.ts` + `ui/proofread.css` + `App.tsx` 两出口）

> **依据**：规格 §4.3 的**批 7 加注 = 规格定义本体**（`:233-245`）：① 入口 = 阅读面全局开关 + 可发现入口按钮（`⌘/Ctrl+Shift+R`）② 作用域 = **随焦点走** ③ 退出 = **三条等价出口**（再按快捷键 / 点按钮 / `Esc`）④ `data-*` 形态写在 `<html>` 根、**缺省不落属性** ⑤ **纯 CSS 一层**（变量重绑）⑦ **不得合并结案**。
> 🔴 **控制方 §2 B1/B2 的改写**：CSS 落点 = **新建 `app/src/ui/proofread.css`**（不碰生成物）；属性名 = **`data-proofread-mode`**（**不得**用 `data-proofread` —— 该名已被 LLM 文本校对占用，实测 **46 处 / 11 文件**）。

**目标**：① 新建 `app/src/shell/proofreadMode.ts`（**照 `shellPhase.ts` 57 行的逐字范式**：属性名常量 · 取值守卫 · `applyProofreadMode` / `readProofreadMode` / `useProofreadMode`；**退出走 `removeAttribute`** 以满足「缺省不落属性」）；② 新建 `app/src/ui/proofread.css`（`html[data-proofread-mode="on"] { --ed-ink-4: var(--ed-ink-3); }` + 契约注释）；③ `App.tsx` 加**第三条 window 级 keydown**（`Ctrl/⌘+Shift+R` 切换；`Esc` 退出）+ 一行 hook 调用。🔴 **入口按钮归 T11**（`TopBar.test.tsx` 余 1）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（本计划者实测） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_RADIUS_OUTLIER_BY_FILE["App.tsx"]` | **1** | 1（**满**） | 🔴 `App.tsx` **不得**新增越界圆角字面量（本任务只加 keydown / hook / 常量） | **是（若出现）** ⇒ V5 |
| `FROZEN_NATIVE_BUTTON_BY_FILE["App.tsx"]` | **无键** | 出现即红 | 🔴 **零 `<button>`**（按钮在 T11 的 `TopBar.tsx`，且用 `Button` 原语） | **是（若出现）** ⇒ V5 |
| `FROZEN_FONT_OOB_BY_FILE` / `BORDER` / `SHADOW` / `MUTED_GRAY`（`App.tsx` 与新件） | `App.tsx` 全**无键**；两个新件无键 | 出现即红 | 🔴 新件零字面量；`App.tsx` 零新增 | **是（若出现）** ⇒ V5 |
| `App.tsx` 行数 | **549** | 已登记（>300）· 本任务自持 **净增 ≤ +12** | 加 1 个 effect（~10 行）+ 1 行 hook 调用 | **否**（V6 读数） |
| `tokens.css`（生成物） | **119** | **禁改** | 🔴 **零改动**（覆盖写在**新 CSS 文件**里） | **是（若改）** ⇒ V3（`tokens.drift.test.ts` 红） |
| 首屏 / CSS 计数 | 首屏 **105.95 kB**（JS，CSS 不计入判据）· CSS **4 个** | 首屏 200 kB | 🔴 新增 1 个 CSS 文件 ⇒ **CSS 计数 4 → 5**（**只报告，不入判据**）；`bundle-eager-graph` 的「源 111」**可能 +1**（CSS 边） | **否**（不入判据）但**必须在报告里逐字登记两处读数变化** |
| `contrast.test.ts` 的三条 ink-4 断言（`:100` / `:106` / `:136`） | 断**静态 token 值**、**不读** `data-proofread-mode` | **不得改写** | 🔴 **只许新增**用例（覆盖块存在性 + 特异性） | **否**（V4 逐字：三条原断言零改动） |

**Files:**
- 新建 `app/src/shell/proofreadMode.ts`（预算 ≤80 行）
- 新建 `app/src/ui/proofread.css`（预算 ≤40 行；**`.css` 不在行数门禁视野**）
- 改 **`app/src/App.tsx`（549 → ≤561）** —— 第三条 keydown + `useProofreadMode` 调用
- 改 `app/src/main.tsx`（**13 行**）—— 加一行 `import "./ui/proofread.css";`（🔴 **必须在 token CSS 之后**；🔻 **E8-8 锚勘误（2026-09-13，E8 复测）**：token CSS 的 import 在 **`:5`**（`:4` 是它的注释行）⇒ 原写「`:4` 的 token CSS」**错 1 行**；判据仍以 **V3 的 `indexOf` 逐序**为准，本锚只是指路）
- 新建 `app/src/shell/proofreadMode.test.ts`（node 环境）· `app/src/shell/proofreadMode.dom.test.tsx`（`// @vitest-environment jsdom`）
- 改 `app/src/ui/contrast.test.ts`（169，**只增**）
- 🔴 **`NON_MIGRATED_14`**：以上文件都不在其中

**Interfaces:**
- Consumes：`shellPhase.ts` 的范式（**不 import 它**，只照结构写）· `motion/env.ts` 的「默认永不写非法值」纪律（`:26` 区）
- Produces：`export const PROOFREAD_MODE_ATTR = "data-proofread-mode";` · `export type ProofreadMode = "on" | "off";` · `export function applyProofreadMode(mode: ProofreadMode, el?: HTMLElement | null): void`（`off` ⇒ `removeAttribute`）· `export function readProofreadMode(el?: HTMLElement | null): ProofreadMode | null` · `export function useProofreadMode(): readonly [ProofreadMode, () => void]`（**卸载清回**）

- [ ] **Step 0: 先量基线 + 复测快捷键占用**
  ```powershell
  node scripts/check-command-registry.mjs    # 311/311/0
  cd app; npx tsc --noEmit                   # 0 错
  ```
  🔴 **复测 `Ctrl+Shift+R` 是否空闲**：本计划者实测 `App.tsx:303`（`Ctrl+Shift+A`）· `App.tsx:320`（`Ctrl+K`）· `hooks/useClassroomFloat.ts:68`（`Ctrl+Shift+F`）· `hooks/useClassroomShortcuts.ts:30`（`Ctrl+Shift+S`）· `NoteEditView.tsx:166`（`ctrlKey && shiftKey` **只吃 ArrowUp/Down**）⇒ **`Ctrl+Shift+R` 未见占用**；**动手前自己重测**（域 = `app/src/**` 的 `.ts/.tsx`）。
- [ ] **Step 1: 写 `proofreadMode.ts`（照 `shellPhase.ts` 的六件结构）**
  属性名常量 · 取值守卫（**只接受 `"on"` / `"off"`**）· host 解析（`document.documentElement`）· 写入（`on` ⇒ `setAttribute`；`off` ⇒ **`removeAttribute`**）· 读回 · hook（挂载即应用 + **卸载清回 `off`**）。
  🔴 **头注必须逐字写明消歧**：「本模式 = **阅读面审校模式**（规格 §4.3 条件③）；**与既有的 LLM 文本校对（`proofread_estimate` / `proofread_run` / `ProofreadPanel`）无关** —— 故属性名取 **`data-proofread-mode`**，**不得**用 `data-proofread`（控制方 §2 B2）」。
- [ ] **Step 2: 写 `proofread.css`（纯 CSS 一层）**
  ```css
  /* @ai-context 批 8 T9（规格 §4.3 条件③ + 控制方 §2 B1）：审校模式的**唯一覆盖点**。
     Why 新建文件而不是改 ui/tokens.css：后者是 **生成物**（手改会被 tokens.drift.test.ts 判红）。
     Why 不改 .ed-text--ink-4 规则：条件是「档位覆盖」，变量重绑一次即通吃（含暗档）。
     边界：本规则的选择器特异性 (0,1,1) **高于** [data-theme="dark"] 的 (0,1,0) ⇒ 与源序无关。 */
  html[data-proofread-mode="on"] {
    --ed-ink-4: var(--ed-ink-3);
  }
  ```
  🔴 **必须**在 `main.tsx` 的 token CSS import **之后**再 import 本文件（顺序**双保险**：特异性 + 源序）。
- [ ] **Step 3: `App.tsx` 两出口（快捷键 + `Esc`）**
  照 `:301-310` 与 `:318-327` 两条既有 keydown 的形态写第三条；🔴 **不得**改那两条的既有文本（`CommandPalette.test.tsx:199` 用正则读 `App.tsx` 的 `Ctrl+K` 那一行）。
- [ ] **Step 4: 判据（四类）**
  ① **三出口**：快捷键 / 按钮（T11 落地后补）/ `Esc` 各一条 ⇒ 断 `<html>` 上属性**出现 / 被摘掉**（**不是**写成 `"off"`）；② **覆盖块存在 + 特异性**（CSS 文本级）；③ 🔴 **源码顺序判据**（§C53.5 适用点②）：`main.tsx` 里 `proofread.css` 的 import **必须**在 token CSS **之后**（`indexOf` 逐序）；④ **不得合并结案**：`lowConfidenceClass` 的调用点数与 `data-proofread-mode` 的存在性**互不推出**（解耦断言）。
- [ ] **Step 5: 提交（2 次）**
  ```powershell
  git commit -m "feat(shell): 新增审校模式的模式位通道"
  git commit -m "feat(ui): 落审校模式的墨度覆盖与快捷键"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **三出口的机器面**：进模式 ⇒ `<html>` 有 `data-proofread-mode="on"`；`Esc` / 再按快捷键 ⇒ 属性**被 `removeAttribute` 摘掉**（`el.hasAttribute(...) === false`） | **M1**：把 `off` 分支改成 `setAttribute(ATTR, "off")` | **M1 后期望**：`退出后必须不落属性` 的用例红（**具名**）⇒ 直接证明「缺省不落属性」这条规格纪律有牙 |
| **V2** | **覆盖规则存在**：`app/src/ui/proofread.css` 的文本含 `html[data-proofread-mode="on"]` 块，且块内把 `--ed-ink-4` 绑到 `var(--ed-ink-3)`（**文本级**，照 `shellPhase.guard.test.ts:107-118` 的 `bodyOf` 手法） | **M2**：把 `var(--ed-ink-3)` 改成 `#5b5750`（硬编码一个深色） | **M2 后期望**：`覆盖必须走变量重绑（不得硬编码色值）` 用例红（**具名**） |
| **V3** | 🔴 **源码顺序（§C53.5 适用点②）**：`main.tsx` 里 `./ui/tokens.css` 的 `indexOf` **<** `./ui/proofread.css` 的 `indexOf`；**且**两条 import 都 `>= 0`（**反空真**） | **M3**：把两条 import 位置对调 | **M3 后期望**：顺序用例红（**具名**）；⚠️ 同时登记：**因为特异性已足够**，M3 在**真浏览器里可能仍生效** ⇒ 本判据是**顺序纪律**而非「唯一生效条件」（诚实边界③） |
| **V4** | **生成物零改动 + 既有对比度断言零改动**：`git diff` 对 `app/src/ui/tokens.css` **零 hunk**；`contrast.test.ts:100/:106/:136` 三条 **逐字节未改**（只新增用例） | **M4**：手改 `app/src/ui/tokens.css` 加一行覆盖 | **M4 后期望**：`tokens.drift.test.ts:25-28` 红（`onDisk === renderAll().css` 全等断言，**具名**） |
| **V5** | **冻结键全 0**（两个新件 + `App.tsx` 无新增） | **M5**：在 `proofreadMode.ts` 里加一行 `fontSize: 11` | **M5 后期望**：`textRatchet.test.ts` 的 Σ 一致性判据红（**具名**；🔻 **E8b-5 补名（2026-09-13，E8b）**：具名断言 = **`:225`** 与 **`:261`**（`:244` 仅当目标不在冻结表内）；🔴 **不得**指向 `:231` —— 见 T6 的 V5/M5 同款勘误） |
| **V6** | `App.tsx` 行数 **≤561** · `tsc` **0 错** · `check-command-registry` **311/311/0** · `line-limits --full` **0/121/121** | — | 逐字读数（含 `App.tsx` 前后行数） |
| **V7** | **解耦断言（§4.3⑦「不得合并结案」）**：一条用例断言「`lowConfidenceClass` 的调用点数」与「`data-proofread-mode` 的存在性」**互不推出** | **M7**：把解耦断言改成「两者都必须为真」 | **M7 后期望**：解耦用例红（**具名**）⇒ 它守的正是「不得用 `lowConfidenceClass` 宣称条件③已兑现」 |

**提交信息**：① `feat(shell): 新增审校模式的模式位通道`（**subject 17 字**）② `feat(ui): 落审校模式的墨度覆盖与快捷键`（**subject 19 字**）

**诚实边界**：① 🔴 **「墨度真的变深」在 jsdom 里不可判** —— `var()` **不解析**（实测回字面量 `"var(--brand)"`）⇒ 本任务的判据是**文本级 + 属性级**，**判不到解算后的对比度**；真解算值归 T12–T15 的 CDP 读数；**不得**写「已升到 ≥4.5:1」；② **作用域**（不含 `RichEditorView` 与弹层外外壳）**没有 DOM 级判据**（jsdom 量不到计算墨度）⇒ 登记为「只登记」；③ **V3 的诚实说明**：覆盖规则的特异性 **(0,1,1) > (0,1,0)** ⇒ **即使 import 顺序反了，真浏览器里覆盖仍生效** ⇒ V3 守的是**顺序纪律**（可读性与一致性），**不是唯一生效条件**；④ 本任务**不做**入口按钮（T11）⇒ 「三出口」里的**按钮出口**在 T9 结束时**尚未存在**，V1 只覆盖两个出口 + 一个**待 T11 补齐**的占位断言。

---

### Task 10: A · 容器片（`useNoteEvidence.ts` + `NotesPage` 注入 + 第三视图加载器）

> **依据**：控制方 §2 A1（**证据数据已在既有 `get_session_detail` 里** ⇒ **取数只能在容器侧发生**：`views/**` 有一条**整目录硬边界**——生产文件含 `import type` 在内**零 Tauri 边**）+ 侦察 B 的落点建议（`NotesPage.tsx` **余 5** ⇒ 把取数落**新 hook**，页面只加「import + 调用 + 传 prop」三行）。

**目标**：① 新建 `app/src/hooks/useNoteEvidence.ts`（按 `note.session_id` 调 `get_session_detail` ⇒ 把 `segments` + `ocr_blocks` 交给 T6 的模型 ⇒ 产出视图所需的证据面）；② `NotesPage.tsx` 注入（**净增 ≤ +5，设计 +3**）；③ `NotesReadingColumn`（T7 拆后的件）加**第三视图的本地加载器**（照 `CARD_FLOW_KEY` / `CARD_FLOW_LOAD` 的 `:71-73` 先例）+ 常驻 / 惰性两分支；④ 行为判据。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `pages/NotesPage.tsx` 行数 | **295** | 300（余 **5**） | 🔴 **净增 ≤ +5**（设计 +3：import + 调用 + 传 prop） | **是（若超 5）** ⇒ V1 |
| `views/note/noteViews.test.tsx` 行数 | **298** | 300（余 **2**） | 🔴 **净增 ≤ +2**（若判据放不下 ⇒ **另立新文件**） | **是（若超 2）** ⇒ V1 |
| `components/notes/NotesReadingColumn.tsx`（T7 拆后） | T7 后 **≤275** | 300 | 加加载器 + 两分支（**预算 ≤ +25**，T7 已留头寸） | **是（若超 300）** |
| 六棘轮（新 hook） | 新件**无键** | 出现即红 | 🔴 hook 是纯逻辑件 ⇒ **零样式字面量 / 零 `<button>`** | **是（若出现）** ⇒ V3 |
| `FROZEN_VIEW_KEYS.note` / registry | T8 后 **3 项** | 冻结声明 | 🔴 **本任务不改注册表**（第三项已在 T8 落地） | **否** |
| `check-command-registry` | **311 / 311 / 0** | 不动（**零新 IPC**） | 🔴 只**消费**既有 `get_session_detail` | **否**（V4） |

**Files:**
- 新建 `app/src/hooks/useNoteEvidence.ts`（预算 ≤160 行）
- 改 **`app/src/pages/NotesPage.tsx`（295 → ≤300；设计 +3）**
- 改 **`app/src/components/notes/NotesReadingColumn.tsx`（T7 后 ≤275 → ≤300）**
- 改 **`app/src/components/notes/NotesReadingColumn.views.test.tsx`（T7 后 ≤275 → ≤300）** —— F5/F6 行为判据（**原文不丢 + 惰性卸载**）
- 改 `app/src/views/note/noteViews.test.tsx`（298 → ≤300；**放不下就另立新文件**）
- 🔴 **`NON_MIGRATED_14`**：以上文件都不在其中
- 🔴 **不得**改 `app/src-tauri/**`（**零 Rust**）· **不得**新增 IPC（§2 A2）

**Interfaces:**
- Consumes：T6 的模型 · 既有 IPC `get_session_detail`（`app/src-tauri/src/commands_session.rs:137` → `:164`；前端类型 `app/src/types/session.ts` 的 `SessionSegment` / `SessionOcrBlock` / `SessionDetail`）· `pages/SessionsPage.tsx:132` 的既有调用先例
- Produces：`useNoteEvidence(sessionId: number | null | undefined): { readonly status: "idle" | "loading" | "ready" | "error"; readonly matches: readonly EvidenceMatch[]; readonly coverage: Coverage | null }`；视图的第三项加载器

- [ ] **Step 0: 先量基线**：`node scripts/check-command-registry.mjs`（311/311/0）· `cd app; npx tsc --noEmit`（0 错）· 🔴 **复测三件真身行数**（`NotesPage.tsx` 295 · `noteViews.test.tsx` 298 · `NotesReadingColumn.tsx` T7 后的值）。
- [ ] **Step 1: 写 `useNoteEvidence.ts`（容器侧取数）**
  🔴 **形状**：`status` 四态（含 `error`）+ **不抛异常**（失败 ⇒ `error` + `matches: []`，**UI 降级不白屏**）；🔴 **降级完备**（AGENTS.md §3.4）：无 `session_id` 的笔记 ⇒ `idle`，**不得**发起 IPC。
  🔴 **性能/防御**：同一 `sessionId` 的重复挂载**不得**重复取数（用 `useRef` 缓存键）；**超时/失败一律降级**。
- [ ] **Step 2: `NotesPage.tsx` 三行注入（净增 = 3）**
  `import { useNoteEvidence } …` + 一次调用 + 把结果作为 prop 传给阅读列（**不新增 `NoteViewSlot` 可选槽** —— 走 T7 的 `readingColumnLoaders.ts` / 包装件形态，先例 `NoteCardFlowWithSeek.tsx`）。
- [ ] **Step 3: 第三视图加载器 + 常驻/惰性两分支**
  照 `CARD_FLOW_KEY` / `CARD_FLOW_LOAD`（`:71-73`）的**本地加载器**形态（**不 import 注册表**）；🔴 **默认视图仍是 `raw` 且常驻不卸载**（规格 §11-6 的「原文不丢」判据）。
- [ ] **Step 4: 行为判据（F5/F6 同族）**
  ① 点第三视图 ⇒ 渲染证据面（mock `invoke`：**断言命令名与载荷逐字**）② **切回 `raw` ⇒ 原文不丢**（既有 F5 判据不许降级）③ **惰性卸载**：未选中的视图**不挂载**（既有 F6 判据不许降级）。
- [ ] **Step 5: 提交（2 次）**
  ```powershell
  git commit -m "feat(notes): 新增证据取数 hook 并在笔记页注入"
  git commit -m "feat(notes): 阅读列接入证据视图并补行为判据"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **行数三件**：`NotesPage.tsx` **≤300** · `noteViews.test.tsx` **≤300** · `NotesReadingColumn(±).tsx` **≤300**；且 `NotesPage.tsx` 的净增 **≤ +5** | **M1**：在 `NotesPage.tsx` 里内联写取数逻辑（把 hook 摊平） | **M1 后期望**：行数 >300 ⇒ `line-limits --full` 的 🔻 **E8b-4 勘误（2026-09-13，E8b）：判据号原写 `(d)`，应作 `(c)`**（`(c)` = 「超过 300 行但未登记」，`scripts/line-limits.mjs:158`；`(d)` 是「登记表条目**指向不存在的文件** / **已回落至 300 行以内**」，`:163-164` ⇒ 与本变异体无关）判据红（`>300 未登记`，**具名输出**）；🔴 **可达性前提**：目标必须在变异后**仍「未登记」**——实测 `NotesPage.tsx` = **295 行**（≤300 ⇒ 未登记 ✅），本任务净增 ≤+5 后仍 ≤300，M1 摊平 hook 后 >300 ⇒ `(c)` 命中 ✅ |
| **V2** | **IPC 面零变化**：`check-command-registry` **311/311/0**；🔻 **E8b-3 勘误（2026-09-13，E8b）**：原写「`git log --oneline <8b 起点>..HEAD -- app/src-tauri` **为空**」—— 🔴 **该形态会被 EOL 归一型改动误伤**（8a 实测：`git log` **非空**、`git diff --stat` = `5 files changed, 5 insertions(+), 5 deletions(-)`，而 `git diff -w --numstat` **为空** ⇒ 零语义改动；**这是 E8-5 翻车的同一根因**）⇒ **改用同一硬形态**：`git diff -w --numstat <8b 起点>..HEAD -- app/src-tauri` **输出为空** + 逐文件**字节证**（`git hash-object --path=<p>` == 旧 blob + 恰一个 `0x0A`）+ `countLines` **相等** | **M2**：在 `useNoteEvidence` 里改调一个不存在的命令名 | **M2 后期望**：行为判据的 `invoke` 断言红（**具名**：命令名逐字不符）；`check-command-registry` **仍绿** ⇒ **证明这道判据不是 registry 的重复** |
| **V3** | **新 hook 的冻结键全 0** | **M3**：在 hook 里加 `fontSize: 11` | **M3 后期望**：`textRatchet.test.ts` 的 Σ 一致性红（**具名**；🔻 **E8b-5 补名（2026-09-13，E8b）**：具名断言 = **`:225`**（`全仓 <12px 字号已从基线 551 涨到 552`，② 总数 ≤ 冻结总数）与 **`:261`**（`域内实测总数与冻结总数不符`，⑥）—— 🔴 **不得**指向 `:231`：该行比的是**冻结表内部 Σ vs 常数**，往源码加字面量**不动冻结表** ⇒ 恒绿） |
| **V4** | **三态/四态完备 + 降级**：无 `session_id` ⇒ **不发 IPC**；IPC 失败 ⇒ `error` 且 **UI 不崩**（渲染仍在） | **M4**：让 IPC 失败时 `throw` | **M4 后期望**：`失败必须降级为 error 而不是抛出` 用例红（**具名**） |
| **V5** | **既有 F5/F6 判据逐字不变**：`NotesReadingColumn.views.test.tsx` 的「原文不丢」「惰性卸载」两条**断言原文零改动**（diff 给 hunk） | **M5**：把第三视图改成默认且常驻 | **M5 后期望**：F5/F6 红（**具名**）⇒ 证明「新视图不得改变默认视图」有牙 |
| **V6** | `tsc` **0 错** · `line-limits --full` **0/121/121** · `docs-check` **exit 0** | — | 逐字读数 |

**提交信息**：① `feat(notes): 新增证据取数 hook 并在笔记页注入`（**subject 21 字**）② `feat(notes): 阅读列接入证据视图并补行为判据`（**subject 22 字**）

**诚实边界**：① 本任务**不做真机** ⇒ 「点开第三视图」的证据是 **jsdom + `invoke` mock 级**，**不得**写成「真机可见」；② **精修后的段落必然走失配分支**（§C 契约）⇒ 头图的「覆盖率」在两个分母下都会偏低，这是**设计行为**；③ 证据列的**观感**（列宽 / 溢出 / 长文本换行）**未测**（归 T12–T15）；④ 若 `NotesPage.tsx` 的 +3 行放不下 ⇒ **STOP 报控制方**（不许把取数塞回视图层 —— 那会破 `views/**` 的零 Tauri 边硬边界）。

---

### Task 11: B · 入口片（`TopBar` 按钮 + 规范回写 + 规格 §4.3 两处加注）

> **依据**：规格 §4.3①（「一个**可发现的入口按钮**」，快捷键 `⌘/Ctrl+Shift+R`）+ 控制方 §2 B1/B2（CSS 落点与命名消歧的**规格加注**）+ §2 V4（回写落点在 **`docs/product/`**，不是 `docs/standards/`）。

**目标**：① 在 `TopBar.tsx` 的 `right` 插槽加**入口按钮**（🔴 **必须 `Button` 原语**：`shell/TopBar.tsx` 的 `nativeButton` 键 = **2 = 上限（满）**）；② `TopBar.css` 的按钮样式（token 化）；③ 在 **`TopBar.test.tsx`**（T7 拆后）补判据；④ 回写 **`docs/product/ui-ux-system.md`**（**§10 面**）：把「审校模式」的定义与可及性裁决写进规范（规格 §4.3 逐字「**必须写进规范**」）；⑤ 规格 §4.3 的**两处加注**（生成物落点 + `proofread` 消歧）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（本计划者实测） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_NATIVE_BUTTON_BY_FILE["shell/TopBar.tsx"]` | **2** | **2（满）** | 🔴 **入口必须 `Button` 原语（barrel `ui/primitives`）** ⇒ 本键**不动**（2 仍是 2） | 🔴 **是（若写裸 `<button>`）** ⇒ V2（`FROZEN_NATIVE_BUTTON_TOTAL` 392 是上界、**Σ = 392 已贴住** ⇒ +1 即红） |
| `FROZEN_BORDER_BY_FILE["shell/TopBar.tsx"]` / `RADIUS` / `SHADOW` | **无键** | 出现即红 | 按钮样式一律走 token（`Button` 原语的 variant/size + `TopBar.css` 的 token） | **是（若出现）** ⇒ V3 |
| `FROZEN_BTN_STYLE_CONST_LINES` / `_FILES` | **56 / 44** | 只许降或持平 | 🔴 **不得**新增 `const *Btn*` 样式常量（承 §C0.6 的新文件门槛） | **是** ⇒ V3 |
| `buttonMigration` `MIGRATED` / `MIGRATED_SITES` | **35 文件 / 99** | 只按守恒 | 🔴 `shell/TopBar.tsx` **不在** 35 名单内 ⇒ **加 `<Button>` 不进普查**（报告须给「不在名单」的证据） | **否**（V4） |
| `shell/TopBar.test.tsx` 行数 | T7 后 **≤275** | 300 | 加判据（预算 ≤ +25） | **是（若超）** ⇒ V1 |
| `docs/product/ui-ux-system.md` 行数 | **282** | 无门禁（`.md`） | 加「审校模式」节（**§10 面 ⇒ 报告点名**） | **否** |
| `docs-check` 扫描 / 检查 | 🔻 **E8-12 时点更正（2026-09-13）＝ 282 / 182**（原写 281 / 181 —— 那是**本计划文件入库之前**的读数；口径见 `## E8` §E8.12） | 持平或更好 | 改**既有文件** ⇒ 两个计数不变 | **否**（V6） |

**Files:**
- 改 **`app/src/shell/TopBar.tsx`（117）** —— `right` 插槽加入口按钮（`Button` 原语；`App.tsx:336-339` 已有两个常驻状态件先例）
- 改 `app/src/shell/TopBar.css`（149）—— 按钮样式（token）
- 改 **`app/src/shell/TopBar.test.tsx`（T7 后 ≤275）** —— 按钮出口判据（**并与 T9 的 V1 占位断言合并**）
- 改 **`docs/product/ui-ux-system.md`（282，§10）** —— 审校模式节（**必须写进规范**，规格 §4.3 逐字）
- 改 **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（1035）** —— §4.3 的两处加注（`:241` 生成物 + `:235`/`:238` 的 `data-proofread-mode` 消歧）
- 🔴 **`NON_MIGRATED_14`**：以上文件都不在其中（`docs/*` 不在 `app/src/**`）

**Interfaces:**
- Consumes：T9 的 `useProofreadMode` / `PROOFREAD_MODE_ATTR`（**经 `App.tsx` 的 props 或 context 传到 `TopBar`** —— 🔴 **不得**让 `TopBar` 自己去写 `<html>` 属性，保持**单一写入方**纪律）
- Produces：入口按钮（`data-testid` 具名，供判据选元素）

- [ ] **Step 0: 先量基线**：`node .superpowers/sdd/.../tmp/plan-writer/p6-matrix.mjs`（复测 `shell/TopBar.tsx` 的六族键 = 本计划者实测 `nativeBtn 2`、其余全无键）· `countLines("app/src/shell/TopBar.test.tsx")`（T7 后）。
- [ ] **Step 1: 按钮（`Button` 原语 + 单一写入方）**
  🔴 **三件硬约束**：① **`Button` 原语**（大小写 B）② **零内联 `<svg>`** ③ **零 `const *Btn*` 样式常量**（承 §C0.6）。
  🔴 **可发现性**：按钮必须带 **可读 label / `title`**（「审校模式」+ 快捷键提示），且**与 `Esc` / 快捷键的等价退出**一致（规格 §4.3③）。
- [ ] **Step 2: 判据（按钮出口 + 三出口合流）**
  `TopBar.test.tsx`：① 按钮存在且有可读文案 ② 点击 ⇒ `<html>` 上属性出现 ③ **再点 ⇒ 属性被摘掉** ④ `Esc` 与快捷键仍等价。
- [ ] **Step 3: 规范回写（`docs/product/ui-ux-system.md`，§10 面）**
  新增一节：**审校模式的定义**（入口 / 作用域 / 三出口 / `data-proofread-mode` 形态 / **不新增 token** · 条件③ 的「进入审校模式时全部升到 ≥4.5:1」）+ **逐字登记「本节的实现落点 = `app/src/ui/proofread.css`（**不是**生成物 `ui/tokens.css`）」**。
  🔴 **§10 额外审查点名**（AGENTS.md §10：`docs/product/`）⇒ 报告必须点名。
- [ ] **Step 4: 规格 §4.3 两处加注（blob 构造）**
  ① `:241` 后加注：**该处点名的 `ui/tokens.css` 是生成物**（`tokens.css:1-4` + `tokens.drift.test.ts:25-28`）⇒ **批 8 的实际落点 = 新建 `app/src/ui/proofread.css`**（控制方 §2 B1）；
  ② `:238`–`:240` 后加注：**属性名改为 `data-proofread-mode`**（控制方 §2 B2：`proofread` 一名已被 LLM 文本校对占用，实测 **46 处 / 11 文件** ⇒ 同名不同物，**必须消歧**）。
- [ ] **Step 5: 提交（2 次）**
  ```powershell
  git commit -m "feat(shell): 顶栏新增审校模式入口按钮"
  git commit -m "docs(product): 回写审校模式并加注落点与命名"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **行数**：`TopBar.test.tsx` **≤300**；`TopBar.tsx` **≤300**（现状 117） | — | 逐字读数 |
| **V2** | 🔴 **原生按钮零增**：`FROZEN_NATIVE_BUTTON_TOTAL` **392** 不变、`BY_FILE` 的 `shell/TopBar.tsx` **仍 = 2** | **M2**：把入口按钮写成裸 `<button>` | **M2 后期望**：`nativeButton.ratchet.test.ts` 的「全仓原生 `<button>` 已从基线 392 涨到 393」断言红（**具名 + 报出文件**） |
| **V3** | **样式字面量零增**：`shell/TopBar.tsx` 的 border/radius/shadow 键**仍无键**；`FROZEN_BTN_STYLE_CONST_LINES` **56** 不变 | **M3**：在 `TopBar.tsx` 里写 `const iconBtnStyle = {...}` | **M3 后期望**：`FROZEN_BTN_STYLE_CONST_LINES` 判据红（**具名**） |
| **V4** | **不在 35 名单**：报告给出 `buttonMigration.test.ts` 的 `MIGRATED` 名单**不含 `shell/TopBar.tsx`** 的逐字证据（`MIGRATED_SITES` **99** 不变） | — | 逐字读数 |
| **V5** | **三出口合流**：按钮 / 快捷键 / `Esc` 三条**都能出**，且退出后属性被摘掉 | **M5**：让按钮点击只 `apply("on")` 不切换 | **M5 后期望**：`再点必须能退出` 用例红（**具名**） |
| **V6** | `docs-check` **exit 0** · 扫描 **282** / 检查 **182**（🔻 E8-12：原写 281 / 181）（不变）· `tsc` **0 错** · `line-limits --full` **0/121/121** | — | 逐字读数 |
| **V7** | **回写三判据（§3.4）**：`docs/product/ui-ux-system.md` 与规格那两个 hunk 的 `−` 列 = **0** · 纯空白行删除 = **0** · 标题/锚子序列对拍被删/被改 = **0** | **M7**：把规格 §4.3 的既有加注行删掉 | **M7 后期望**：子序列对拍报「被删 = 1」⇒ 红 |

**提交信息**：① `feat(shell): 顶栏新增审校模式入口按钮`（**subject 17 字**）② `docs(product): 回写审校模式并加注落点与命名`（**subject 20 字**）

**诚实边界**：① 🔴 **`docs/product/ui-ux-system.md` 是 AGENTS.md §10 的「额外审查文件」** ⇒ 本任务**必须在报告里点名**，并由评审者复核「只加节、不改既有结论」；② 入口按钮的**观感**（图标 / 位置 / 与既有状态件的视觉平衡）**未测**（归 T12–T15）；③ 「按钮出口」的判据是 **jsdom 点击级**，**不得**写成真机验证；④ 规格 §4.3 的两处加注**不修改原文** ⇒ 「点名 `ui/tokens.css`」与「`data-proofread`」两个旧表述**仍留在规格正文里**，只有紧邻加注纠正它们（**体例的已知代价**）。

---
## 段 8c · 主线二：观感收编（T12–T16）

> **控制方 §2 主线二逐字**：**收编，不立项** —— 把批 3 的仪器搬出 gitignored `tmp/`（实物实测 **19,286 B / 299 行**）+ **判据参数化** + 对准观感欠账（侦察 A 的 **14 条**，含 5 条新发现）。落地位置 = **`scripts/`**（与 `check-*` 同族，入库）。
> 🔴 **本段的诚实边界必须逐条复述仪器的盲区**（§2 V1）：验的是 **WebView2 引擎、不是 IPC/窗口层** · headless 默认 `prefers-reduced-motion: reduce`（**可覆写**，`Emulation.setEmulatedMedia`）· headless 滚动条占位 **0** · 必须用 `Emulation.setDeviceMetricsOverride` · `--dump-dom` **抓不到**（实测 0 字节）。
> 🔴 **`profile` 必须落 `$env:TEMP`**（§2 V2；`mkdtempSync(join(tmpdir(), …))` 是正解）⇒ **写进仪器头注**，且 **T12 的判据含「跑完仓内零新增 profile 目录」**。

---

### Task 12: 观感仪器入库（**收编**：搬出 `tmp/` + 参数化 + 卫生 + 自检）

> **依据**：控制方 §2 V1/V2 + 侦察 A §4.0（仪器成熟度逐条：加载**真实产物 `app/dist`** + 本地只读静态服务器 + **真 CDP 精密视口** + 判据强度分层 + **仪器自检** + **诚实边界写在文件头** + CLI/exit code）。🔴 **`ADR-034:109` 逐字承认这条判据的仪器「不入库」** —— 本任务补的正是这个洞。

**目标**：① 把 `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/viewport-probe.mjs`（**19,286 B / 299 行**）搬成 **`scripts/viewport-probe.mjs`**（**入库**；`scripts/**` **不在行数门禁视野内**，仍按 ≤300 自持）；② **判据参数化**：从「1024 无溢出」扩成「**读任意选择器的解算样式 / 几何**」（`--probe '<selector>:<prop>,…'` + `--json`）；③ **卫生**：profile 落 `$env:TEMP`（`mkdtempSync`）+ 跑完删；④ **盲区写进头注**（五条 + 「不可替代真机冒烟」）；⑤ **自检**（视口 / dpr / 500px 定块 / 文本哨兵 / **阳性 + 阴性对照**）；⑥ `docs/standards/testing.md` 追加 `### 第十部分`（仪器的调用形态与盲区登记）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 / `FROZEN_*`** | 见 `### 表 2` | 只许降或持平 | 🔴 **一个都不触碰**（新增的 `.mjs` **不在**行数门禁域、也不在棘轮域 —— 棘轮域 = `app/src/**` 的 `.ts/.tsx`） | **否**（核账：`scripts/**` 在全部六族的域外，逐字给证据） |
| `line-limits` 读数 / 豁免表 | **0 / 121 / 121** · 表 **262 行** | 持平 | 🔴 `.mjs` 入 `scripts/` **不改任何读数**（`SCAN_DIRS` 只含 `app/src` 与 `app/src-tauri/src`） | **否**（V3） |
| `docs-check` 扫描 / 检查 | 🔻 **E8-12 时点更正（2026-09-13）＝ 282 / 182**（原写 281 / 181 —— 那是**本计划文件入库之前**的读数；口径见 `## E8` §E8.12） | 持平或更好 | 改**既有文件** `testing.md` ⇒ 计数不变 | **否**（V4） |
| `lazyBudget.json` / 首屏 | 37 / 637,501 B · 105.95 kB | 只许降 | 🔴 本任务**只读**产物（**不跑真构建**） | **否** |
| 仓内文件数（**卫生判据**） | `git status --porcelain` = 仅 `?? docs/tech-debt/` | **跑完必须仍是这一行** | 🔴 profile 落 `$env:TEMP`；**跑完删** | **是（若落仓内）** ⇒ V1（**批 3 陷阱 #19 的复现判据**） |

**Files:**
- 新建 **`scripts/viewport-probe.mjs`**（**搬迁 + 参数化 + 头注 + 自检**；预算 ≤300 行）
- 改 **`docs/standards/testing.md`**（T4 后；追加 `### 第十部分：观感 / 像素面仪器（批 8 收编）`）
- 🔴 **不得**改 `app/package.json`（**npm script 的加入 = T24 的活**，U4 已裁为 d）· **不得**改 `.github/**`
- 🔴 **不得**把任何临时产物写进被跟踪目录（P-21）

**Interfaces:**
- Consumes：`app/dist`（**真实构建产物**；`--no-build` 语义 **不适用**于本仪器 —— 它**必须**读真实产物）· 本机 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）· Node 24 内建 `WebSocket`
- Produces：**CLI 契约**（逐字写进头注与 `testing.md`）：
  ```text
  node scripts/viewport-probe.mjs --width 1024 --height 640 --dist app/dist [--port 9490] \
       [--json <out.json>] [--probe '<selector>:<cssProp>'] [--screenshot <out.png>]
  退出码：0 = ②③ 判据与自检全过；1 = 有溢出或自检失败；2 = 产物缺失 / 端口失败 / profile 失败
  ```

- [ ] **Step 0: 先量基线（并证伪「不需要它」）**
  ```powershell
  node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/p1-lines.mjs   # 复核仪器行数
  node -e "const fs=require('fs');const p='.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/viewport-probe.mjs';console.log(Buffer.byteLength(fs.readFileSync(p)),'B')"
  Get-Item app/dist/index.html | Select-Object LastWriteTime
  ```
  🔴 **判据**：仪器**必须**在盘（**19,286 B**）、`app/dist` **必须**存在且 **mtime 在 `app/src` 最新源之后**（否则读数无效 ⇒ **先重建**，且**必须独占窗口**）。
- [ ] **Step 1: 搬迁 + 头注（不行为改动）**
  🔴 **逐字搬**，只加：① **头注的盲区五条**（§2 V1 逐字）② **profile 卫生**（`mkdtempSync(join(tmpdir(), "ed-probe-"))`，`finally` 删除）③ **`--probe` / `--json` / `--screenshot` 三个参数**（**判据参数化**）。
  🔴 **判据强度分层照搬**：① 仅供参考 vs ②③ 判据 vs ④ 仪器自检（**逐条保留原注释**）。
- [ ] **Step 2: 参数化读数的实现**
  `--probe '<selector>:<cssProp>'` ⇒ 走 `Runtime.evaluate` 取 `getComputedStyle` / `getBoundingClientRect`，结果进 `--json`（**每条读数带 `viewport` / `dpr` / `emulatedMedia` 三项元数据** —— 没有元数据的读数**不得**当判据）。
- [ ] **Step 3: 自检 + 双对照**
  ① 视口 `innerWidth === width` ② `dpr === 1`（或 `--dpr` 给定值）③ 500px 定块 ④ 文本哨兵 ⑤ **阳性对照**（已知选择器必须命中）⑥ **阴性对照**（**每次现造的随机串**，承 §C62.8：`zzz_no_such_symbol_zzz` 已入库作废）。
- [ ] **Step 4: 干跑一次（独占窗口 + 真产物）**
  ```powershell
  node scripts/viewport-probe.mjs --width 1024 --height 640 --dist app/dist --json .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/t12/probe.json
  git status --porcelain    # 🔴 期望仍只有 ?? docs/tech-debt/
  ```
- [ ] **Step 5: `docs/standards/testing.md` 的第十部分（blob 构造；写者队列 T4 → T12）**
  内容：**调用形态**（CLI 逐字）· **前置**（真实产物 + 独占窗口 + 串行）· **盲区五条** · **「不可替代真机冒烟」** 逐字声明 · **profile 落 `$env:TEMP`** 硬要求。
- [ ] **Step 6: 提交（2 次）**
  ```powershell
  git add -- scripts/viewport-probe.mjs
  git commit -m "feat(scripts): 收编观感像素探针并参数化判据"
  # testing.md（blob 构造）
  git commit -m "docs(standards): 登记观感仪器形态与盲区"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 🔴 **卫生（批 3 陷阱 #19）**：跑完 `git status --porcelain` **仍只有** `?? docs/tech-debt/`；`$env:TEMP` 下**无残留** profile 目录 | **M1**：把 profile 目录改回仓内（`join(ROOT, "tmp/edgeprofile")`） | **M1 后期望**：`git status --porcelain` 出现新目录 ⇒ **判据红**（这条**就是**侦察阶段踩过的坑：**1,241 文件 / 32.4 MB**） |
| **V2** | **仪器自检有牙**：阴性对照（**现造随机串**）⇒ **0 命中**；阳性对照 ⇒ **>0 命中**；视口 / dpr / 定块 / 哨兵四项**全过** | **M2**：把 `--width` 传给页面但**不**调 `Emulation.setDeviceMetricsOverride`（用 `--window-size` 代替） | **M2 后期望**：仪器的 `innerWidth === width` 自检**红**（实测：`--window-size=800` ⇒ `innerWidth=776`）⇒ **证明自检不是装饰** |
| **V3** | **门禁读数逐字持平**：`line-limits --full` **0/121/121** · `check-command-registry` **311/311/0** · `line-limit-exemptions.md` **零改动** | — | 逐字读数 |
| **V4** | `docs-check` **exit 0** · 扫描 **282** / 检查 **182**（🔻 E8-12：原写 281 / 181）（不变） | — | 逐字读数 |
| **V5** | **参数化真的能读解算值**：`--probe` 读出的 `var()` 已解算（如 `--ed-radius-panel` ⇒ **`8px`**）、几何非 0（如某元素 `120x60` 级） | **M5**：把 `Runtime.evaluate` 换成读 `element.style`（内联样式） | **M5 后期望**：对**走类规则**的元素读数变成空串 ⇒ 判据红（**具名**：`解算值必须来自 getComputedStyle`） |
| **V6** | **盲区五条在头注里逐字在**（文本级断言可放 `testing.md` 或探针自检里） | **M6**：删掉「验的是 WebView2 引擎而不是 IPC/窗口层」那一条 | **M6 后期望**：⚠️ **牙口未证**（文本存在性可判，但「是否写全」需评审）⇒ **报告须标「牙口未证」**（§3.6） |

**提交信息**：① `feat(scripts): 收编观感像素探针并参数化判据`（**subject 21 字**）② `docs(standards): 登记观感仪器形态与盲区`（**subject 18 字**）

**诚实边界**：① 🔴 **本仪器验的是 WebView2 的引擎，不是 IPC / 窗口层** ⇒ **不能**替代真机冒烟（U5）；② headless 默认 `prefers-reduced-motion: reduce` ⇒ **判据必须显式覆写**（`Emulation.setEmulatedMedia`），否则只验到**降级路径**；③ **headless 滚动条占位 = 0** ⇒ 依赖滚动条宽度的读数**不可用**（姊妹件 `scrollbar-cdp.mjs` **4,688 B / 106 行** 可作将来收编对象，**本批不收**）；④ `--dump-dom` **抓不到**（实测 0 字节）⇒ 读数只走 CDP 或「画进页面再截图」；⑤ **R5/R6（真 WebView2 像素）本批不做**（需改码 + 构建 + 触 §10）；⑥ **是否常驻门禁 ⇒ 属 U4**（本任务**只入库、不接线**）。

---

### Task 13: 对准欠账 #1/#2（两条链的 7 档 × 3 属性读数矩阵）—— **只出读数，不做统一**

> **依据**：`markdownLine.ts:10` 逐字「**归一 = 逻辑归一；观感统一未做，归批 8**」+ 侦察 A §5.11（「R1 够，缺的是**人给目标值**」）。

**目标**：用 T12 的仪器对**同一段 markdown** 在两处渲染（笔记预览链 / 精修工作台链）各读一次 `fontSize` / `marginTop` / `marginBottom` / `color` ⇒ 产出 **7 档 × 3 属性的对拍矩阵**，**逐档标「相同 / 不同」**，并把「**统一到哪个值**」写成**待裁决项**（**人的决定，机器不判**）。🔴 **本任务不修改任何样式**（`markdownLine.ts` 的两个模式常量**一字不改**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 + 生成物** | 见 `### 表 2` | — | 🔴 **零改动**（本任务只跑仪器 + 写报告） | **否**（核账：只读） |
| `utils/markdownLine.ts` 行数 | **100** | 300 | **零改动** | **否** |
| `app/dist` 新鲜度 | mtime **2026-09-13 12:17:24** | — | 🔴 读数**必须**在新鲜产物上取；若重建 ⇒ **独占窗口**并登记新 mtime | **是（若旧产物）** ⇒ 报告的读数**作废** |

**Files:** 0 生产代码（产出 `tmp/t13/**` + `task-13-report.md` + 矩阵表）
- 🔴 **不得**改 `app/src/utils/markdownLine.ts`、`NotePreviewView.tsx`、`RefineWorkbench.tsx`

- [ ] **Step 0: 确认产物新鲜 + 独占窗口**：`Get-Item app/dist/index.html` 的 mtime **必须晚于** `app/src` 最新源；否则先重建（串行）。
- [ ] **Step 1: 造同一段语料**：构造一份覆盖 **7 档**（`h2` / `h3` / `h4` / `quote` / `li` / `p` / `pStained`）的 markdown，**两处各渲染一次**（笔记预览链 = 印样正文；工作台链 = 精修工作台）。
- [ ] **Step 2: 读矩阵**：逐档逐属性取 `getComputedStyle` 的解算值；🔴 **每条读数带 `viewport` / `dpr` / `emulatedMedia` 元数据**。
- [ ] **Step 3: 写报告**：矩阵 + **6/7 有差异**的复核结论（本计划者的静态读数：`h3` `:53` vs `:64` · `h4` 一侧缺档 · `quote` 一侧缺档 · `p` `:56` vs `:67` · `li` **唯一相同**）+ **两处 DOM 形态差异**（`### x` 预览侧渲染成 `<p>`、工作台侧成 `<h4>`；`> x` 预览侧是引用块、工作台侧是 `<p>`）+ **「统一目标值」待裁决**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **读数有效**：每条读数带三项元数据；仪器自检（T12 的 V2）全过 | **M1**：在旧 `app/dist` 上取读数 | **M1 后期望**：读数与源码不一致（**可用源码静态值对拍证伪**）⇒ **报告判据红**（🔴 **这正是 `--dist` 假绿的同族机理**，见 `## 陷阱` P-37） |
| **V2** | **矩阵完整**：7 档 × 3 属性**无空格**；「相同 / 不同」判定逐格给出 | **M2**：只读 6 档交差 | **M2 后期望**：矩阵行数对拍红（**具名：`7 档必须齐`**） |
| **V3** | **零生产文件改动**：`git status --porcelain` 仍只有 `?? docs/tech-debt/` | — | 逐字读数 |

**提交信息**：**0**（读数进报告；汇总进 T21 的 `v0.22` 批 8 节）—— 若判据文件必须入库 ⇒ **另立新文件**，**不碰 `markdownLine.ts`**。

**诚实边界**：① 🔴 **「观感统一」本身不是可判据** —— 本任务只能给「**差在哪**」，**给不出「该统一成什么」**（目标值是**设计决定**）；② 读数取自 **headless Edge**（WebView2 引擎的近似），**不是** WebView2 本体；③ 配图行（`- ![alt](src)`）**不在模式常量里**（`NotePreviewView.tsx` 的容器侧分支）⇒ **它不出现在矩阵里**，须在报告里**逐字声明**。

---

### Task 14: 对准欠账 #4/#8/#9 + 懒侧陈旧度与 `--dist` 假绿登记

> **依据**：控制方 §2 G5（新输入 ①`--dist` 假绿 ②`shift-` 死预算 ③18 族超上限）+ 侦察 A §5.2/§5.6。

**目标**：① 用仪器读 `Surface` 逐处可见变化的**机器面**（圆角 `6→8` **9 处** · 边框暖色 · 阴影 token · 遮罩色 · **弱化文本对比度可算**）；② 读**字号越界存量**（棘轮 **551 / 123**）与**弱化灰存量**（**63 / 43**）的**实际分布**（仪器已能直接观察到 `11.5px` / `11px` 档）；③ 把 **18 族超上限 +203 B**、**`shift-` 212 B 死预算**、**`--dist` 假绿**三条**登记进 `docs/standards/performance.md`**（**只登记，不改门禁**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（本计划者实测） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `lazyBudget.json` | 37 / **637,501 B** / 38 族 / **Σ 逐族上限 638,029** | 总上限**只许降** | 🔴 **本任务不改它**（**只登记**三条读数）；若 T9/T10 的真构建越界 ⇒ **由那些任务在同提交重冻** | **否**（V3 逐字节：`git diff` 对 `lazyBudget.json` **零 hunk**） |
| `performance.md` 行数 | **185** | 无门禁（`.md`） | **+≤20 行**（三条登记） | **否** |
| 六棘轮（本任务只读） | 见 `### 表 2` | — | **零改动** | **否** |

**Files:**
- 改 **`docs/standards/performance.md`（185 → ≤205）** —— 懒侧门禁节（`:36-51`）追加三条登记（**遍历写者 = T14 唯一**）
- 🔴 **不得**改 `scripts/check-bundle-budget.mjs`（**恰 300**）· **不得**改 `scripts/lazyBudget.json` · **不得**改 `.github/**`

- [ ] **Step 0: 先量基线**：`node .superpowers/sdd/.../tmp/plan-writer/p6-matrix.mjs`（复核 18 族 / +203 B / `shift-` 212 B 三条读数）· `node scripts/check-bundle-budget.mjs --no-build`（首屏 105.95）。
- [ ] **Step 1: 读 `Surface` 与存量的机器面**（仪器 `--probe`）：圆角 / 边框色 / 阴影 / 遮罩色 / 墨度对比度（**WCAG 公式可算** ⇒ 这批**不需要真机**）+ 字号分布（`11.5px` / `11px` 档的**实测处数**）。
  🔴 **读数逐条带元数据**；与棘轮常数**对拍**（551 / 123 · 63 / 43）⇒ **差异必须逐条归因**。
- [ ] **Step 2: 写 `performance.md` 的三条登记**（**只加不改**）：
  ① **逐族上限陈旧度**：**18 / 38 族**实测超各自上限、**Δ 合计 +203 B**（全部在 **64 B 容差**内 ⇒ **闸判定不变**）⇒ 登记为**批 9+ 的逐族重冻输入**；
  ② **`shift-` 死预算**：该族 **零 chunk** 却有 **212 B** 上限；🔴 **清理它会降低 Σ 上限（符合「只许降」）**，但**若 `shift-*` chunk 复现，它会变成未归族而被闸抓到** ⇒ **清理需有意的判断**；
  ③ 🔴 **`--dist` 假绿**：`JUDGE_LAZY = !NO_LAZY && (!NO_BUILD || has("--dist"))`（代码实测 `:71`）⇒ **`--no-build --dist <目录>` 会开启懒侧判定** ⇒ **陈旧产物可当受判对象而「绿」**（承批 7 T22 的同一登记；本批**不改脚本**，只登记）。
- [ ] **Step 3: 提交（1 次，blob 构造）**
  ```powershell
  git commit -m "docs(standards): 登记懒侧逐族陈旧度与 dist 假绿"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **三条读数的口径完整**：18/38 · +203 B · 容差 64 B · `shift-` 212 B **逐字**；且给出**复现命令**（`--no-build --dist app/dist --json` + 自算脚本） | **M1**：把「+203 B」写成「18 族各超 203 B」 | **M1 后期望**：评审按**逐族表**核对 ⇒ 红；⚠️ **本条登记为「牙口未证」**（无机器断言） |
| **V2** | **只加不改**：`performance.md` 的 diff `−` 列 = 0 · 纯空白行删除 = 0 · 既有小标题子序列被删/被改 = 0 | **M2**：把 `:41` 的「最后一次重冻已落地」那段删掉 | **M2 后期望**：子序列对拍报「被删 = 1」⇒ 红 |
| **V3** | `lazyBudget.json` **零 hunk**；`check-bundle-budget`（真构建口径）读数不变 | — | 逐字读数 |
| **V4** | `node scripts/docs-check.mjs` **exit 0** · **282 / 182**（🔻 E8-12 时点更正：原写 281 / 181） | — | 逐字读数 |

**提交信息**：`docs(standards): 登记懒侧逐族陈旧度与 dist 假绿`（**subject 21 字**）

**诚实边界**：① **18 族的「陈旧」不是缺陷** —— 闸判定用的是「上限 + 64 B 容差」，三条红条件**均未触发**；② 本任务**不改**逐族上限（改它会让总量上限变化 ⇒ 需**同提交重冻**的纪律与逐键 diff，属**改字节的那些任务**的职责）；③ 对比度**可算但不等于「好看」**；④ `Modal` 退场的**手感**不可判（`motion.md` 已裁「只登记」）。

---

### Task 15: 对准欠账 #5/#6（批 7 七条展示面：**先 spike 夹具可行性，再决定出图**）

> **依据**：侦察 A §5.4/§5.5（**七条展示面 7/7 未测**，且它们的**形态是设计决定而非裁决**）+ §4.1 证据 D（**注入 `invoke` 假体机械可行**，但「一律回 null」会**打崩壳层进错误边界**：元素数 **199 → 19**、`innerHTML` 27,246 → **1,766**，栈首 `Cannot read properties of null (reading 'pausedReason')`）。

**目标**：① **先做 spike**：注入 `window.__TAURI_INTERNALS__` 假体 + **逐命令形状正确的夹具**（壳层启动实测需 **13 条命令**：`plugin:event|listen` · `health_status` · `structure_model_status` · `ocr_device_status` · `video_profiles` · `list_domain_fine` · `list_windows` · `prepare_live_session` · `asr_streaming_model_status` · `model_download_status` · `float_state` · `live_session_status` · `diag_snapshot`）；🔴 **判据 = 壳层不崩进错误边界（元素数 ≥ 基线量级）+ 七条面各自可达**；② **成立** ⇒ 逐面出图（PNG）+ 几何读数；**不成立** ⇒ **登记为残余**并**逐字写明卡在哪一条夹具**（**不许**编造弱判据）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 / 门禁** | 见 `### 表 1`/`### 表 2` | — | 🔴 **零改动**（本任务**只读产物 + 注入运行时假体**，**不改任何源文件**） | **否**（V3） |
| 仓内文件数（卫生） | `git status --porcelain` = 仅 `?? docs/tech-debt/` | 必须仍是这一行 | 🔴 探针与产物**只写 `tmp/t15/`**；profile 落 `$env:TEMP` | **是（若落仓内）** ⇒ V3 |

**Files:** 0 生产代码（产出 `tmp/t15/**` + `task-15-report.md` + PNG + 几何 JSON）

- [ ] **Step 0: 基线确认**：`app/dist` 新鲜 + 仪器可用（T12）。
- [ ] **Step 1: spike（最小成本、先判可行性）**：13 条启动命令的夹具 + **七条面各自的一条入口命令**（`analyze_session_command` / `delete_session_images_all` / `finish_session` / `get_decision` / `refine_session` / `update_knowledge_system` / `update_fragment_group`）。
  🔴 **夹具形状从 `app/src/components/batch7UiWiring.test.tsx:35-43` 的 `COMMANDS` 与 `app/src/types/` 的类型反推**（**不猜**）。
- [ ] **Step 2: 判据**：壳层元素数 **≥ 基线量级**（参照：真实产物在无 Tauri 时实测 **199 元素**；一律回 `null` 时崩到 **19**）⇒ 达到量级 = spike 成立。
- [ ] **Step 3: 出图（仅当 spike 成立）**：七条面各 1–2 张 PNG + 几何读数（面板位置 / 宽度 / 溢出）⇒ 交给**人**判「设计充分性」。
- [ ] **Step 4: 报告**：spike 结论 + 图 + **逐字声明「夹具数据下的观感 ≠ 真实数据下的观感」**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **spike 判据**：壳层**不崩进错误边界**（元素数 ≥ 基线量级；页面**不含**「界面出错了（已捕获，不再白屏）」） | **M1**：把夹具改成**一律回 `null`** | **M1 后期望**：元素数 **199 → ~19** 且页面出现错误边界文案 ⇒ **判据红**（这条**就是**侦察 A 实测过的失效形态，**有实测读数背书**） |
| **V2** | **七条面各自可达**：逐面给出「入口可见 + 数据渲染」的读数（或**逐条**登记「卡在哪条夹具」） | **M2**：删掉 `get_decision` 的夹具 | **M2 后期望**：该面渲染错误态 ⇒ **该面的判据红**（其余面不受影响 ⇒ 证明判据是**逐面**的） |
| **V3** | **零源文件改动 + 卫生**：`git status --porcelain` 仅一行；`git diff` 对 `app/**` **零 hunk** | — | 逐字读数 |

**提交信息**：**0**（出图与读数是**取证材料**，进报告；**不产出可交付代码**）。

**诚实边界**：① 🔴 即使出图成功，量到的是**夹具数据下的观感** —— 真实数据的长度 / 空态分布会改变布局 ⇒ **不得**写成「七条面观感已验收」；② 🔴 **「设计充分性」机器不可判** ⇒ 出图是**给控制方/用户看的**，**本任务不下结论**；③ 13+ 条夹具**本身是要维护的资产**（本批**不入库**，只作为一次性 spike 的产物）；④ 若 spike **不成立** ⇒ **登记残余**，**不得**退化成「用 DOM 属性充当观感判据」（侦察 A §5.11 已判：机器**不可判**）。

---

### Task 16: 欠账 #3/#7/#10/#11/#12/#13 的登记片 + jsdom 措辞收窄（**doc/comment-only**）

> **依据**：控制方 §2 G5④ + 侦察 A §3.3（`motionHarness.ts:50` 与批 7 计划 `:2560` 的「jsdom 不做样式级联」**不准确** —— 实测**级联正确**，真正的限制是 `var()` 不解析 / 简写不展开 / 几何全 0 / 伪元素不支持；**结论仍成立，理由句必须收窄**）+ §A.7（`AiConversationDock` **掉地项**：控制方**认领并转批 8**，**不得再掉一次**）。

**目标**（**纯文档 / 注释，零行为改动**）：
1. **`app/src/test/motionHarness.ts`（147，净增 0）**：把 `:50` 的「不解决 jsdom 做**样式级联**」**收窄**为「**jsdom 做级联**（类规则 / ID / 子选择器 / 继承 / `!important` 实测全生效）；**不可得的是**：`var()` 不解析（回字面量）· 简写→长写不展开（`transition-duration` 读成 `0s`）· **几何全 0** · 伪元素 / 伪类不命中」；
2. **`docs/standards/motion.md`（229）**：同一处口径加注（**规范层**）；
3. **批 7 计划（2,612 行）的 `:2560`**：**原文 + 就地加注**（历史计划**不许改原文**）；
4. **`app/src/utils/markdownLine.ts`（100）**：给 6 个原始 hex 加**就地登记注释**（「继承自迁移前实现；`utils/**` **不在**零颜色字面量守卫域内（守卫域 = `ui/primitives/*.css`，`style-seams.test.ts:248`）⇒ **本批只登记，不改值**（改值 = 观感变化，属像素面）」）；
5. **`app/src/ui/primitives/surfaceResidual.ts`（211）**：① **`AiConversationDock` 掉地项**：把 `:101` 的「登记给批 5」**就地更正**为「**批 8 已认领**；本批**不迁**（换 token 会丢方向性暗示 = 观感变化 ⇒ 需人的裁决）；**具名归属 = 控制方（§A.7）**」；② **圆角 `26/5/4` 三档无棘轮**：加一行登记（「不在任何棘轮内，无守卫」）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_SHADOW_BY_FILE["components/AiConversationDock.tsx"]` | **1** | 1（**满**） | 🔴 **不迁、不改值**（只改 `surfaceResidual.ts` 的理由文案） | **否**（V4：`git diff` 对 `AiConversationDock.tsx` **零 hunk**） |
| `SHADOW_RESIDUAL` / `BORDER_RESIDUAL` / `RADIUS_RESIDUAL` 的**条目与 count** | 见 `surfaceResidual.ts:40/73/100` | 逐条**只许降**（条目消失 = 红） | 🔴 **只改 `reason` 文案**，**不动 `file` / `kind` / `count`** | **是（若动 count）** ⇒ V4 |
| `FROZEN_SHADOW_TOTAL` / `RADIUS_OUTLIER_TOTAL` / `BORDER_TOTAL` | **24 / 254 / 201** | 只许降或持平 | **不动** | **否** |
| `motionHarness.ts` 行数 | **147** | 300 | 🔴 **净增 0**（就地改写那一句；若必须加行 ⇒ 先复核余量） | **否**（V2 读数） |
| `markdownLine.ts` 行数 | **100** | 300 | 加注释（**≤ +6**） | **否** |
| `mutedGray` / `fontOob` 等六族 | 见 `### 表 2` | 只许降或持平 | 🔴 **改注释不得引入新的字面量**（`#9ca3af` / `fontSize`）—— ⚠️ `motionHarness.ts:50` 的改写**会提到 `transition-duration` / `0s`**（**不是** `fontSize` ⇒ 不入棘轮），但**必须**跑一次 `tsc`（**P22/P23：改注释散文必须真跑 `tsc`**） | **是（若出现 `#9ca3af` 或越界 `fontSize`）** ⇒ V5 |
| 五棘轮的**剥注释口径** | 全部判据件**先剥注释** | — | 🔴 本任务**全是注释** ⇒ **按设计应当零影响**（**这正是一条可自证的判据**） | **否**（V5） |

**Files:**
- 改 `app/src/test/motionHarness.ts`（147，**净增 0**）
- 改 `docs/standards/motion.md`（229，加注）
- 改 `docs/superpowers/plans/2026-09-13-frontend-redesign-batch7-unwired.md`（2612，**原文 + 就地加注**）
- 改 `app/src/utils/markdownLine.ts`（100，**只加注释**）
- 改 `app/src/ui/primitives/surfaceResidual.ts`（211，**只改 reason 文案 + 加一行登记**）
- 🔴 **`NON_MIGRATED_14`**：不在其中（`AiConversationDock.tsx` **不在** 14 内 —— 逐字核对）

- [ ] **Step 1..5: 五处逐条落地**（一次做完，**2 个提交**：`docs/` 一个、`app/src` 注释一个）
  🔴 **「注释-only」的自证（本任务最有力的判据）**：把每个改动文件的 diff **剥注释后去纯空白行**（§C55.2 的 **D3 规范形**）⇒ **非注释改动行 = 0 / 0**。
- [ ] **Step 6: 提交（2 次）**
  ```powershell
  git commit -m "docs(standards): 收窄 jsdom 级联措辞并认领掉地项"
  git commit -m "docs(ui): 登记未守住则色字面量与圆角三档"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **D3 规范形（§C55.2）**：每个文件的「**剥注释后去纯空白行**」规范形比较 ⇒ **改动行 = 0 / 0**；🔴 **必须同时给「纯空白行增删数」**（承 §C61.2：**删除 = 0**） | **M1**：🔻 **E8b-6 勘误（2026-09-13，E8b）：原写「把 `surfaceResidual.ts:101` 的 `count: 1` 改成 `count: 0`」—— 该行没有 `count` 字段 ⇒ 变异体不可注入**（`surfaceResidual.ts:101` = `SHADOW_RESIDUAL` 第一条 `{ file: "components/AiConversationDock.tsx", kind: "exception", reason: … }`，`SHADOW_RESIDUAL` 的形状是 `{file, kind, reason}`，**无 count**）⇒ **落点更正**为 **`app/src/ui/primitives/surfaceBaseline.ts:208`** 的 `FROZEN_SHADOW_BY_FILE["components/AiConversationDock.tsx"]` **1 → 0**（这才是 `count: 1` 的真身） | **M1 后期望**：① D3 规范形报「非注释改动 = 1」⇒ 红；② 🔻 **第二证据更正**：原写「`surfaceTagRegistry.test.ts` 的登记一致性判据红」—— 🔴 **该件只 import `SURFACE_TAG_REGISTRY`**（`surfaceTagRegistry.test.ts:38` ← `surfaceResidual.ts:178` 的 `<Surface>` 标签表），**与 `SHADOW_RESIDUAL` / `FROZEN_SHADOW_BY_FILE` 无关** ⇒ 换成 **`surfaceRatchet.test.ts` 的两条**：`Σ 冻结表 ≠ FROZEN_SHADOW_TOTAL(24)` 与「实测 vs 冻结值」逐文件红（**两条独立具名证据**）。🔴 **红点由实跑裁定，不由推理**（§C17.3 / E-25） |
| **V2** | **行数**：`motionHarness.ts` **仍 147**（净增 0）；`markdownLine.ts` **≤106**；`surfaceResidual.ts` **≤212** | — | 逐字读数 |
| **V3** | **三处措辞收窄逐字在**：`motionHarness.ts:50` / `motion.md` / 批 7 计划 `:2560` **三处都能指到「jsdom 做级联、不可得的是几何与 `var()`」** | **M3**：只改两处、漏掉批 7 计划 | **M3 后期望**：三处对拍红（**具名：三处缺一**） |
| **V4** | **登记表不变量**：`SHADOW_RESIDUAL` 的条目数 / 逐条 `file`+`kind`+`count` **逐字节未变**；`AiConversationDock.tsx` **零 hunk** | — | 逐字读数 + 逐键 diff |
| **V5** | **剥注释口径下零影响**：六棘轮的 Σ **逐字不变**（63 / 551 / 201 / 254 / 24 / 392）；`cd app; npx tsc --noEmit` **exit 0** | **M5**：在注释里写一行 `fontSize: 11` | **M5 后期望**：`textRatchet.test.ts` **仍绿**（因为**先剥注释**）⇒ 🔴 **这条「绿」是预期的**；**同时**必须跑 `tsc` —— 若注释写法触发 P22（`**/`）⇒ **`tsc` 红**（**这才是本任务真正的牙**） |
| **V6** | `line-limits --full` **0/121/121** · `docs-check` **exit 0 · 282/182（🔻 E8-12 时点更正：原写 281/181）** | — | 逐字读数 |

**提交信息**：① `docs(standards): 收窄 jsdom 级联措辞并认领掉地项`（**subject 23 字**）② `docs(ui): 登记未守住则色字面量与圆角三档`（**subject 19 字**）

**诚实边界**：① 🔴 **`markdownLine.ts` 的 6 个 hex 本批只登记、不改值** —— 改值 = **观感变化** ⇒ 属像素面 + 需人的目标值；② **`AiConversationDock` 的方向性投影**本批**只认领、不迁移** ⇒ 「掉地」被**终止**（有具名归属），但**问题本身未解决**；③ 暗档 `data-theme` 实际生效 / 真实帧率 / Flip 几何位移 / 切视图卡顿 / 三档「看起来不一样」**五条**在 `motion.md` 的不可判清单里 ⇒ **本任务只登记，不编造弱判据**（`motion.md:15` 逐字）；④ 批 7 计划的加注**不改原文** ⇒ 那句不准确的措辞**仍在**批 7 计划正文里。

---

## 段 8d · 主线三：治理余项（T17–T20）

> **控制方 §2 主线三的四个裁决**：**G2**（不补 glob，把脚本域门禁挂进**无条件 job**）· **G3**（`validate-all.mjs` 化石单列一个单元，三选一含代价）· **G4**（`SURFACE_TAG_REGISTRY` 键改 `(file, tier)`，只改 3 处）· **G6**（`check-exemption-prose` 单列、**不并入八闸**）。**§G5 的 `subject ≤50` 缺牙**由 T20 补。
> 🔴 **本段两个文件是「共享文件」**（`.github/workflows/pr-check.yml` 与 `commitlint.config.js`）⇒ 提交走 blob 构造 + `git diff --cached --stat` 自证。

---

### Task 17: CI 挂载（G2 + G6）：脚本域门禁挂进**无条件 job**

> **依据**：控制方 §2 G2 逐字（`pr-check.yml` 的 `on:` **无 `paths`**；第 6 个 job `line-limits`（实测 `:178`）**既无 `needs` 也无 `if`** ⇒ **每次都跑**）⇒ **把脚本域门禁挂进这个无条件 job**；🔴 **不补 `scripts/**` glob**（补 glob 是治错了地方，且会引入「新路径同样不被看见」的二次缺口）。

**目标**：① 在 `pr-check.yml` 的 `line-limits` job（`:178`）里**追加两个 step**：`check-bundle-budget --no-build`（**首屏**；懒侧**不判** —— 口径要求新鲜构建）与 **`check-exemption-prose.mjs`**（G6 的**单列转正**）；② 🔴 **不新增 job**、**不改 `on:`**、**不改 paths-filter**、**不改 `.husky/pre-commit`**。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 + 三件恰 300 的脚本** | 见 `### 表 2` | — | 🔴 **零改动**（本任务只改 `.yml`） | **否**（V3 逐字：`git diff` 对 `scripts/**` **零 hunk**） |
| 八闸集合 | 8 条（`### 表 1` / `### 表 2`） | **不得扩** | 🔴 **`check-exemption-prose` 只进 CI step，不进八闸对账**（G6 逐字） | **是（若并入八闸）** ⇒ V4（评审按集合对拍） |
| `line-limits` / `check-command-registry` 的 CI 读数 | 与本地同口径（`--full` / 三向一致） | 持平 | **不动这两条 step 的命令** | **否** |
| `.husky/pre-commit`（20 行） | 三条命令的 `&&` 链 | — | 🔴 **零改动** | **否**（V3：`git diff -- .husky/` **零 hunk**） |

**Files:**
- 改 **`.github/workflows/pr-check.yml`（197 → ≤215）** 🔴 **AGENTS.md §10 的「CI/CD」面 ⇒ 报告必须点名**
- 🔴 **不得**改 `.husky/pre-commit` · **不得**改任何 `scripts/**` · **不得**改 `package.json`

**Interfaces:**
- Consumes：既有无条件 job 的 `line-limits`（`:178`）与其两个 step（`:191-192` / `:196-197`）
- Produces：两条新 step（**逐字命令**：`node scripts/check-bundle-budget.mjs --no-build` 与 `node scripts/check-exemption-prose.mjs`）

- [ ] **Step 0: 先量基线 + 复核 job 结构**：逐行打印 `pr-check.yml`，确认 `:178` 的 `line-limits` job **确无 `needs` / `if`**（本计划者实测：其余四个 job 均带 `needs: changes` + `if:`）。
- [ ] **Step 1: 追加两个 step（最小 diff）**
  🔴 **`--no-build` 的语义必须写进 step 名**（如 `name: First-screen budget (no-build; lazy side judged only on fresh builds)`），**避免读成「懒侧也判了」**。
- [ ] **Step 2: 本地等价演练**（**不必跑 CI**）：在本地**按 step 的逐字命令**各跑一次，读数抄进报告。
- [ ] **Step 3: 提交（1 次，blob 构造）**
  ```powershell
  git commit -m "ci(workflows): 脚本域门禁挂进无条件 job"
  ```
  🔴 **不 push**（🔴 尤其：本批**禁止**任何远端写操作）。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **job 结构不变**：`line-limits` job **仍无 `needs` / `if`**；总 job 数**不变**；`on:` 块**逐字节未变** | **M1**：给 `line-limits` job 加一个 `if:` | **M1 后期望**：判据红（**具名**：`该 job 必须保持无条件`）⇒ 直接证明「挂了门禁也永远跑不到」这条失效模式被守住 |
| **V2** | **两条新 step 的命令逐字**：`check-bundle-budget.mjs --no-build`（**不带 `--dist`** ⇒ 不触发假绿）与 `check-exemption-prose.mjs` | **M2**：把命令改成 `--no-build --dist app/dist` | **M2 后期望**：判据红（**具名**：`--dist 会开启懒侧判定 ⇒ 陈旧产物假绿`）⇒ 与 P-37 同源 |
| **V3** | **零旁路改动**：`git diff` 对 `scripts/**` / `.husky/**` / `package.json` **零 hunk** | — | 逐字读数 |
| **V4** | **八闸集合不扩**：报告的八闸终态表**仍是 8 行**，`check-exemption-prose` **单列在「附闸」** | — | 逐字读数 |
| **V5** | 本地按 step 命令实跑：`check-bundle-budget --no-build` **exit 0**（首屏 105.95）· `check-exemption-prose` **exit 0** | — | 逐字读数 |

**提交信息**：`ci(workflows): 脚本域门禁挂进无条件 job`（**subject 17 字**）

**诚实边界**：① 🔴 **本批不验证 CI 真的跑起来**（**禁止 push** ⇒ 无法触发远端；本地只能**按 step 命令等价演练**）⇒ 报告必须逐字写明「**CI 面未实测**」；② 懒侧判据**不进 CI**（它要求**新鲜构建**，成本 = 一次前端构建 ≈ 分钟级；且懒侧口径要求**串行**）⇒ 首屏与懒侧的**执行者不对称**是**有意的**；③ `windows-latest` runner 上 Edge 预装（若将来收编观感仪器进 CI ⇒ 见 U4）。

---

### Task 18: `validate-all.mjs` 化石处置（G3）：**删 + 改路由**

> **依据**：控制方 §2 G3 逐字（该脚本 **62 行**，`client/` **5 步**、`server/ai-gateway`、`server/sync-service` **全不存在**；头注自陈「与 `client/package.json` 的 check 聚合门禁对齐，覆盖四个子项目」= **Electron 期布局**；且它是 `scripts/session-route.mjs` 的 `rule-build-validation` 路由目标 ⇒ **一条会话路由规则指向跑不起来的脚本**）。

**目标**（三选一的**代价表**见下，本计划取 **(a) 删 + 改路由**）：① **删 `scripts/validate-all.mjs`**；② 把 `scripts/session-route.mjs:76` 的 `rule-build-validation` 的 owner 从「脚本」改成**现执行者指针**（`type: "memory"`, `path: null`，描述 = 「构建验证的现执行者 = `.husky/pre-commit`（本地）+ `.github/workflows/pr-check.yml`（CI）；本规则不再指向脚本」）；③ **实测证据**：`patterns.json` **不存在**（本计划者实测：`patterns.json` / `.qoder/patterns.json` / `.superpowers/patterns.json` 均不存在）⇒ **路由是休眠的** ⇒ 无「已路由记录」需迁移。

**🔴 三选一的代价表（控制方要求「含代价」）**

| 选项 | 代价 | 破坏面 | 本计划是否取 |
|---|---|---|---|
| **(a) 删 + 改路由** | 丢掉一个（**从未能跑**的）「一键全量验证」入口；`session-route.mjs` 需 1 处改动 | **最小**（1 删 + 1 改；无新文件、无新门禁） | ✅ **取** |
| (b) 重写为「本仓真实门禁的串行外壳」 | 与 `.husky/pre-commit` + CI 的**无条件 job** 形成**第三个真源** ⇒ 三处清单会漂移；需 ≤300 行 + 判据 + 维护 | 中（新真源） | ❌ 不取（**单一真源**优于「多一个入口」） |
| (c) 只改路由、保留化石 | 化石**继续存在** ⇒ 「门禁已有执行者」的**错觉**继续（这正是批 7 被它误导的机理） | 最小但**不解决** | ❌ 不取 |

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 + 门禁** | 见 `### 表 1`/`### 表 2` | — | 🔴 **零改动**（`.mjs` 在行数门禁域外；棘轮域 = `app/src/**`） | **否**（V3） |
| `line-limits` 读数 / 豁免表 | **0 / 121 / 121** · 262 行 | 持平 | 🔴 `scripts/validate-all.mjs` **不在豁免表里**（它是 `.mjs`）⇒ **表不动** | **否**（V3 逐字） |
| `docs-check` 扫描 / 检查 | 🔻 **E8-12 时点更正（2026-09-13）＝ 282 / 182**（原写 281 / 181 —— 那是**本计划文件入库之前**的读数；口径见 `## E8` §E8.12） | 持平 | 本任务**不改 `docs/**`**（`CHANGELOG.md` / `v0.22.md` / `performance.md` 里的历史提及**一律不改** —— **历史记录不改**，§C10.6） | **否** |

**Files:**
- **删 `scripts/validate-all.mjs`（62 行）**
- 改 **`scripts/session-route.mjs`（238）** —— `:76` 的 `owner`（**只改这 3 行**）
- 🔴 **不得**改 `docs/**` 里对该脚本的历史提及（`CHANGELOG.md` · `docs/standards/performance.md:47` · `docs/versions/v0.22.md` · 批 0-C1/批 2/批 7 计划）—— **历史记录不改**；**若要留痕 ⇒ 只在本任务的报告与 T21 的批 8 节里**

**Interfaces:**
- Consumes：`session-route.mjs` 的 `ROUTING_RULES`（`:38` 起）与 `rule-build-validation`（`:61-79`）
- Produces：`rule-build-validation` 的新 owner（`type: "memory"`, `path: null`）

- [ ] **Step 0: 复核三件事**：① `git ls-files` 里 `client/` 与 `server/ai-gateway` / `server/sync-service` **不存在**（本计划者实测：均缺失）② `patterns.json` **不存在**（⇒ 路由休眠）③ `validate-all.mjs` 的唯一入库引用 = `scripts/session-route.mjs`（+ 若干**历史文档**）。
- [ ] **Step 1: 删除 + 改路由**
- [ ] **Step 2: 自证**：`node scripts/session-route.mjs --status` ⇒ **不报错**（🔴 它需要 `patterns.json`；实测会打印「未找到 patterns.json，请先运行 session-detect.mjs」并**非零退出** ⇒ **报告必须逐字记录这个退出码**，并说明「这是**既有**行为，与本次改动无关」—— 或在**不依赖 patterns.json 的路径**上验证 `ROUTING_RULES` 的静态可读性）。
- [ ] **Step 3: 提交（1 次）**
  ```powershell
  git rm -- scripts/validate-all.mjs
  git add -- scripts/session-route.mjs
  git commit -m "chore(scripts): 删除化石 validate-all 并改路由"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **零悬空引用**：`git ls-files` 域内，`validate-all` 的**非历史文档**引用 = **0**（扫描域 = `scripts/**` + `package.json` + `.husky/**` + `.github/**` + `app/**`；**历史文档单独列出并声明「不改」**） | **M1**：在 `scripts/` 里留一处 `execFileSync("...validate-all.mjs")` | **M1 后期望**：判据红（**具名**：`scripts/** 不得再引用已删脚本`） |
| **V2** | **路由指向真实物**：`ROUTING_RULES` 里**没有任何** `path` 指向不存在的文件（逐条 `fs.existsSync`） | **M2**：把 owner 改成指向另一个不存在的路径 | **M2 后期望**：判据红（**具名**：`owner.path 必须存在或为 null`）⇒ 这条判据**同时**防住「换成另一个化石」 |
| **V3** | `line-limits --full` **0/121/121** · `docs-check` **exit 0 · 282/182（🔻 E8-12 时点更正：原写 281/181）** · `check-command-registry` **311/311/0** | — | 逐字读数 |
| **V4** | **历史文档零改动**：`git diff --stat` 只含两个路径（1 删 1 改） | — | 逐字读数 |

**提交信息**：`chore(scripts): 删除化石 validate-all 并改路由`（**subject 20 字**）

**诚实边界**：① 🔴 **`session-route.mjs` 的运行时行为本批无法端到端验证** —— 它需要 `patterns.json`（**不存在**）且它依赖 `session-detect.mjs` 的会话数据 ⇒ 本任务的验证是**静态可证性**（引用面 + owner 存在性），**不是**「跑通路由」；② 删掉化石后**「一键全量验证」的入口不存在** ⇒ 人类入口 = `.husky/pre-commit`（本地）+ CI 的无条件 job（T17）；**若将来需要**统一入口 ⇒ 那是**新决策**（选项 (b) 的代价已在表里给出）；③ 历史文档里的「`validate-all.mjs`」提及**仍然是死的字符串**（**有意不改** —— 历史记录不改）。

---

### Task 19: `SURFACE_TAG_REGISTRY` 键改 `(file, tier)`（G4）

> **依据**：控制方 §2 G4 逐字（「登记行键从 `file` 改成 **`(file, tier)`**（**只改 3 处**，legacy 和锁等不变量保留）；🔴 **实施前必须复测不变量**」）+ 侦察 D §3（机理：`file` 键唯一（重复即 `REG_DUP` 红）+ legacy `count` 是 `≤` 上界 + legacy 和锁 **14** ⇒ **同一 legacy 文件内新增一处 `<Surface>` 只剩「抬 legacy 面」这条路**，而那条路被 §C9.5/§C35.2 **明文封死**；残值 **2 处**：`LiveImageStrip.tsx` / `VersionPanel.tsx`）。

**目标**：把登记行的键从 `file` 改成 **`(file, tier)`**，使**同一个文件可以有两行**（`tier:"legacy"`（`≤` 上界、计入 legacy 和锁）+ `tier:"new"`（**恰等于**实测、计入总数））⇒ **开出「legacy 文件内新增 `<Surface>` 调用点」的合法路径**，**且不变量全部保留**。**只改 3 处**：① `surfaceResidual.ts` 的条目类型（`legacy?: true` → 三态 `tier`）② `surfaceTagRegistry.test.ts:50-55` 的建表（键 + `REG_DUP` 语义）③ `:114-124` 的二档分支（按 `tier` 而不是 `LEGACY.has(file)`）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（**实施前必须复测**） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_SURFACE_TAG_TOTAL` | **47** | 只许按「实测登记条目数」同步 | 🔴 **本任务不改它的值**（只改**键的语义**） | **是（若值变了）** ⇒ V2（三连通） |
| `SURFACE_TAG_FROZEN_LEGACY_COUNT` | **14** | **只许降** | 🔴 **不动**（legacy 9 行的值之和是硬锁） | **是** ⇒ V2 |
| `SURFACE_TAG_ANCHOR` | `{ entries: 29, file: "components/TaskConversationView.tsx", value: 3 }` | 随登记条目同步 | 🔴 **不动**（条目数仍 29） | **是** ⇒ V2 |
| `SURFACE_TAG_REGISTRY` 行数与 Σ | **29 行 / Σ = 47**（9 行 legacy，其和 = **14**） | 只许按 §C9.5 三步增 | 🔴 **行数与 Σ 都不动**（本任务只换键形态） | **是** ⇒ V2 |
| 域内实测 | **327 文件 / 47 个 `<Surface>` 开标签 / 29 个命中文件** | — | **不动** | **是（若实测变了）** ⇒ V1（先复测） |
| 六棘轮其余五族 | 63 / 551 / 201 / 254 / 24 | 只许降或持平 | **不触碰** | **否** |

**Files:**
- 改 **`app/src/ui/primitives/surfaceResidual.ts`（211）** —— 条目类型 + 9 行 legacy 的字段写法（**值一字不改**）
- 改 **`app/src/ui/primitives/surfaceTagRegistry.test.ts`（145）** —— 建表（`:50-55`）+ 二档分支（`:114-124`）
- 🔴 **不得**改 `surfaceRatchet.test.ts`（261）· **不得**改任何 `FROZEN_*` 的值 · **不得**改 `dialogMigration.e.test.ts`（**恰 300**）
- 🔴 **`NON_MIGRATED_14`**：两个文件都在 `ui/primitives/**`（**域外**），不在 14 内

**Interfaces:**
- Consumes：`surfaceScan.ts` 的域谓词（`:74`）与提取器（`:37-54`）
- Produces：`SurfaceTagRegistryEntry` 的新形态（`tier: "legacy" | "new"` 取代 `legacy?: true`）；**对外不变量**：legacy 行的值**只许降** · legacy 和 **恒 14** · 未登记文件 **= 0** · 新行 **恰等于**实测 · 锚**同步**

- [ ] **Step 0: 🔴 先复测不变量（控制方硬要求）**
  ```powershell
  node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/t19/surface-invariants.mjs
  # 期望逐字：域内文件数 327 · <Surface> 开标签 47 · 命中文件 29 · 登记行 29 · Σ 登记 47 · legacy 行 9 · legacy 和 14
  ```
  🔴 **读数与上表不符 ⇒ STOP**（先查因；**不得**自行调数）。
- [ ] **Step 1: 改条目类型（`surfaceResidual.ts`）**
  把 `legacy?: true` 扩成 **`tier: "legacy" | "new"`**（**显式必填**优于可选：可选字段的「漏写 = 新行」在两种语义间摇摆）；9 行 legacy 逐行加 `tier: "legacy"`，其余 20 行加 `tier: "new"`。🔴 **`file` / `count` / `reason` 三列一字不改**。
- [ ] **Step 2: 改建表（`surfaceTagRegistry.test.ts`）**
  键 = **`` `${file}|${tier}` ``**；`REG_DUP` 的语义改为「**同 `(file,tier)` 重复**」；🔴 **保留**「键按字典序」与「同键累加」两条既有断言。
- [ ] **Step 3: 改二档分支**
  按 `tier` 而不是 `LEGACY.has(file)` 分流：`legacy` ⇒ `n > count` 红（**且 `n === 0` 红**，保留既有「已迁空请收紧」的牙）；`new` ⇒ `n !== count` 红。
- [ ] **Step 4: 提交（2 次）**
  ```powershell
  git commit -m "refactor(ui): 登记行键改为文件与档位二元组"
  git commit -m "test(ui): 登记表判据按档位分流并复核不变量"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **不变量复测（Step 0 的读数）逐字成立**：327 / 47 / 29 / 29 / 47 / 9 / 14 | **M1**：把某条 legacy 行的 `count` +1 | **M1 后期望**：legacy 和 **14 → 15** ⇒ `surfaceTagRegistry.test.ts:110` 的**具名断言**红（`legacy 登记值之和 ≠ 14（T17-B 迁移面只许收紧，不许腾挪）`） |
| **V2** | **三连通 + 锚**：`Σ 登记值 === FROZEN_SURFACE_TAG_TOTAL === Σ 实测`；锚（条目数 29 + 锚文件值 3）同步 | **M2**：在注册表里加一条**不**抬总数的行 | **M2 后期望**：Σ 登记 **≠** 常数 ⇒ `:101` 的具名断言红 |
| **V3** | 🔴 **新能力真的开了口**：**构造一个假想场景**（在 `LiveImageStrip.tsx` 这类 legacy 文件里新增一处 `<Surface>`）⇒ 允许加**一行 `tier:"new"`** 并同步总数与锚 ⇒ **全绿**；而**旧机制下这条路必然红** | **M3**：回到旧机制（键 = `file`）复跑同一场景 | **M3 后期望**：`REG_DUP` 红（**具名**：`登记表的键必须按字典序` / 重复键）⇒ **证明修法真的改了机制**（🔴 **这条必须真跑**，不许推断 —— §C17.3） |
| **V4** | **legacy 面的两处残值仍被冻结**：`LiveImageStrip.tsx` / `VersionPanel.tsx` 的 `legacy-registry-frozen` 残值**仍是 1 / 1**（本任务**不迁它们**） | — | 逐字读数 |
| **V5** | `line-limits --full` **0/121/121**（`surfaceResidual.ts` **211** · `surfaceTagRegistry.test.ts` **145** 均在 300 以内）· `tsc` **0 错** | — | 逐字读数 |

**提交信息**：① `refactor(ui): 登记行键改为文件与档位二元组`（**subject 18 字**）② `test(ui): 登记表判据按档位分流并复核不变量`（**subject 20 字**）

**诚实边界**：① 🔴 **修法只开「机制上的合法路径」，不迁任何残值** —— 两处 legacy 残值**仍然存在**（真正迁移它们需要**同提交抬 `FROZEN_SURFACE_TAG_TOTAL` + 加新行**，那是**另一个任务**，本批不排）；② **改判据件本身**是有先例的（批 5 T15a 的判据修正曾被控制方追认）⇒ 本任务**必须**由评审者逐条复核「不变量一条没松」；③ V3 的假想场景**必须在导出副本里跑**（不许在 `app/src/**` 上「改→跑→还原」）。

---

### Task 20: `subject ≤50` 的牙（`commitlint`）

> **依据**：控制方 §2 G5 + 侦察 D §5（`commitlint.config.js` 实测 **22 行**，只覆盖 `type-enum` / `subject-case:[0]` / `body-max-line-length:[0]` / `footer-max-line-length:[0]` ⇒ **无 `header-max-length` 覆盖** ⇒ 取 preset 的 **100**（含 `type(scope): ` 前缀）⇒ **钩子对 ≤50 无牙**）。🔴 **`subject-max-length` 规则已存在**（`@commitlint/rules` 的 `subject-max-length` **只取 `parsed.subject`**，**不含前缀**）⇒ 与 AGENTS.md §5 的「subject ≤50 字」**同口径**，且执行者（`.husky/commit-msg`）**已就位** ⇒ **零接线成本**。

**目标**：在 `commitlint.config.js` 的 `rules` 加**一行**：`'subject-max-length': [2, 'always', 50],`。🔴 **不得**改 `header-max-length`（那会把 `type(scope): ` 前缀算进去 ⇒ 实际只允许 ~25–35 字 ⇒ **与规范口径不同**，且会当场拦掉本仓大量既有风格的提交）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 + 门禁** | 见 `### 表 1`/`### 表 2` | — | 🔴 **零改动**（`commitlint.config.js` 在仓根，不在任何扫描域） | **否**（V3） |
| `commitlint.config.js` 行数 | **22** | 无门禁 | **+1 行** | **否** |
| 🔴 **本条提交自己的 subject** | —— | **必须是新规则允许的**（≤50） | 提交信息须人工数到 ≤50 | **是（若超）** ⇒ 钩子**当场拒提交**（这条**自证**最有说服力） |

**Files:**
- 改 **`commitlint.config.js`（22 → 23）** —— `rules` 里加一行（**共享文件 ⇒ blob 构造**）
- 🔴 **不得**改 `.husky/commit-msg`（**执行者已就位**）· **不得**改 `.releaserc.json`

- [ ] **Step 0: 先量基线**：`node -e "console.log(require('@commitlint/config-conventional').default.rules['header-max-length'])"`（**期望 `[2,'always',100]`** —— 证明「今天只按 100 判」）+ 抄 `commitlint.config.js` 的现状。🔻 **E8-9 勘误（2026-09-13，E8 复跑）**：**原写 `require('@commitlint/config-conventional').rules[...]`（无 `.default`）—— 🔴 该命令当场抛 `TypeError: Cannot read properties of undefined (reading 'header-max-length')`**（该 preset 是 ESM：`package.json` 的 `"type":"module"` ⇒ `require()` 得到 `{__esModule, default}`）⇒ 已更正为 **`.default.rules`**（实测返回 `[2,"always",100]`）；🔴 附带实测：**`subject-max-length` 不在 preset 的 rules 里**（`.default.rules['subject-max-length']` = `undefined`），但**规则实现存在**（`node_modules/@commitlint/rules/lib/subject-max-length.js` 在盘）⇒ T20 的「零接线成本」结论**仍成立**，只是**必须显式加规则行**。
- [ ] **Step 1: 加一行规则**
- [ ] **Step 2: 三向验证（**必须真跑**）**
  ```powershell
  # ① 合法（≤50）⇒ exit 0
  node -e "require('fs').writeFileSync('<tmp>/m1.txt','docs(plan): 加注三轨口径为段落与转写与 OCR\n','utf8')"
  npx --no -- commitlint --edit <tmp>/m1.txt ; echo "m1 exit=$LASTEXITCODE"
  # ② 超限（>50）⇒ 非零
  node -e "require('fs').writeFileSync('<tmp>/m2.txt','docs(plan): 这一条提交信息的主题刻意写得非常长以便触发新装上的长度牙齿 hereby-exceeding-fifty\n','utf8')"
  npx --no -- commitlint --edit <tmp>/m2.txt ; echo "m2 exit=$LASTEXITCODE"
  ```
  🔴 **写提交信息文件一律用 node `writeFileSync(p, s, "utf8")`**（P-32：**BOM 会让 commitlint 读成 `subject may not be empty`**）。
- [ ] **Step 3: 提交（1 次，blob 构造）**：🔴 本提交的 subject **必须 ≤50**（**自己撞自己的牙**是最强的自证）。
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **牙有牙**：`subject` = 50 字 ⇒ `exit 0`；**51 字** ⇒ **非零** + 输出含 `subject must not be longer than 50 characters`（**具名**） | **M1**：把规则值从 50 改成 100 | **M1 后期望**：51 字那条**转为通过** ⇒ 判据红（**证明判据读的是这个常数**） |
| **V2** | 🔴 **口径正确（不含前缀）**：`type(scope): ` 前缀 **不计入** 50（用一条「前缀 21 字 + subject 49 字」的样本 ⇒ **通过**；「subject 51 字」⇒ **拒**） | **M2**：改成 `'header-max-length': [2,'always',50]` | **M2 后期望**：**前缀 + subject 的总长**被判 ⇒ 「前缀 21 + subject 49」的样本**被拒** ⇒ 判据红（**证明两条款不是同一件事**） |
| **V3** | **零旁路**：`git diff` 只含 `commitlint.config.js`；`.husky/commit-msg` 零 hunk | — | 逐字读数 |
| **V4** | **对既有风格零冲击**：报告给出「近 400 条提交的 `subject > 50 = 0`」的**引用读数**（侦察 D 的实测；🔴 标注「引用，未独立复跑」） | — | 逐字读数 |

**提交信息**：`ci(commitlint): 给提交主题装上五十字上限`（**subject 19 字**）

**诚实边界**：① 计数是 `String.length`（UTF-16 单元）⇒ 中日韩字符算 1、**emoji 算 2** ⇒ 「50 字」对中文成立、对 emoji **偏严**；② 本任务**不改**任何既有提交（历史不追溯）；③ **对 `docs(versions): …` 系长句是真牙**（🔻 **E8-10 勘误（2026-09-13，E8 独立复跑：`git log --format=%s` 全史 1,357 条，subject 一律**去掉 `type(scope): ` 前缀后**再数）**：**原写「历史上有 4 条 subject > 50，最长 56」—— 🔴 实测不成立**：真值 = **70 条 subject > 50 字，最长 94**（例：`53 字 | 批 5 文档行数纠偏（NotesPage 571/GroupSidebar 444/App 439 实测）`、`56 字 | v0.20.10 批 5 交付记录——复习域页独立（…）`）；🔴 **而「最近 400 条」窗口内 = 0 条**（与 V4 的引用读数逐字一致，V4 因此**已核实**）⇒ 更正后**两条不再自相矛盾**）；④ **本条生效后，本批余下所有提交都受它约束**（T20 之后的任务必须自己数）。

---
## 段 8e · 收口（T21–T23）

> **三条主线的验收 + 全批收口 + 独立复核**。🔴 **收口必须在无并发的独占窗口串行真跑**（承 §C6.1 / P9）；🔴 **本段的三条验收 = `## Global Constraints 二` 定义的「三条主线的验收」**（**不是**规格 §11 的 11 条整册验收 —— 那 11 条**逐条登记去向**）。

---

### Task 21: 版本与规格终态回写（`v0.22.md` 批 8 节 + 规格终态加注 + 观感读数归档）

**目标**：① 在 `docs/versions/v0.22.md` 写**批 8 节**（**七段结构**，照批 3–批 7 的先例：交付 / 验收 / 规格漂移纠正 / 过程中纠正的计划错误 / 诚实代价 / 未做登记（逐条带归属批次）/ 提交清单）；② 规格的**终态加注**（§10 批 8 行 `:800` 的就地加注 + §11-6 的回写 + §14 的文档清单行）；③ **观感读数归档**（T13/T14/T15 的读数表与图，**只入 `v0.22` 的读数摘要 + 报告指针**；PNG 与 JSON 留 gitignored 报告目录）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 + 八闸** | 见 `### 表 1`/`### 表 2` | — | 🔴 **零改动**（只改 `.md`） | **否**（V3） |
| `docs-check` 扫描 / 检查 | 🔻 **E8-12 时点更正（2026-09-13）＝ 282 / 182**（原写 281 / 181 —— 那是**本计划文件入库之前**的读数；口径见 `## E8` §E8.12） | 持平或更好 | 改既有文件 ⇒ 计数不变 | **否**（V2） |
| 规格写者队列 | **T3 → T6 → T11 → T21** | — | 🔴 **本任务是最后一个写者** | **否**（V2 逐字） |

**Files:**
- 改 **`docs/versions/v0.22.md`（1036）** —— 追加批 8 节（**七段结构**）
- 改 **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（1035）** —— 3 处终态加注（§10 `:800` · §11-6 `:903` 区 · §14 的文档清单行）
- 🔴 **两处都是共享文件 ⇒ blob 构造**；🔴 **历史原文一律不改**（§C10.6 / §C58.3）

- [ ] **Step 1: 写 `v0.22.md` 批 8 节（七段，逐段给读数与 sha）**
  🔴 **必须逐字登记**（否则下游会读错）：① 懒侧基线的**两个时点**（批 7 收口 `637,501` 的由来 + 本批是否重冻）；② **八闸终态**（命令 + exit + 读数 + 时点 + `app/dist` mtime）；③ **三条验收的兑现度**（逐条给机器读数）；④ **观感读数的适用边界**（夹具数据 vs 真实数据 · headless Edge vs WebView2）；⑤ **未做清单逐条带归属批次**。
- [ ] **Step 2: 规格的 3 处终态加注**（**原文 + 就地加注**）
- [ ] **Step 3: 提交（2 次，blob 构造）**
  ```powershell
  git commit -m "docs(versions): 回写批 8 的交付与验收终态"
  git commit -m "docs(specs): 加注批 8 的三条主线终态"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **回写三判据（§3.4）**：两个文件的 diff `−` 列 = **0** · 纯空白行删除 = **0** · 标题/锚子序列对拍被删/被改 = **0** | **M1**：把 `v0.22` 里批 7 节的某个标题改写 | **M1 后期望**：子序列对拍红（**具名**） |
| **V2** | `docs-check` **exit 0** · 扫描 **282** / 检查 **182**（🔻 E8-12：原写 281 / 181） | — | 逐字读数 |
| **V3** | **零代码改动**：`git diff --stat` 只含两个 `.md` | — | 逐字读数 |
| **V4** | **数字带口径与时点**：批 8 节里每个数字都有「命令 / 口径 / 时点」；🔴 **集合差主张必须列交集与差集**（承 §C58.4/C63.3） | **M4**：把「24 → 11」式的集合差只写计数 | **M4 后期望**：评审按「必须列交集与差集」判红 ⇒ ⚠️ **牙口未证**（无机器断言） |

**提交信息**：① `docs(versions): 回写批 8 的交付与验收终态`（**subject 19 字**）② `docs(specs): 加注批 8 的三条主线终态`（**subject 17 字**）

**诚实边界**：**「与计划的偏差」一节必须自陈编制期已产生的偏差**（见 `## 收口回写八节 §8` 的清单），**不得**只写「按计划执行」。

---

### Task 22: 全批收口（八闸**串行**真跑 + 三条验收 + 二分清单 + 收口评审）

**目标**：在**无并发的独占窗口**里：① **串行**真跑八闸（**含真实构建** ⇒ 懒侧判据**这一次必须判**）；② **vitest 冷 + 热两次**（WARM-CACHE）；③ 三条验收**逐条给机器读数**；④ **二分清单**（「已交付 / 未交付」逐条 + 未交付的归属批次）；⑤ 收口评审件（`task-22-report.md` + `closing-review.md`）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 八闸全部 | 见 `### 表 1` | **只许更好或持平** | **只读** | **是（任何回升）** ⇒ 逐条解释 |
| `lazyBudget.json` | **37 / 637,501 B** | **只许降**（逐族可同提交重冻，**总量不得抬高**） | 真构建后若越界 ⇒ **控制方授权后重冻**（**一条提交**）；否则只读 | **是（若越界且未处置）** |
| vitest 文件/用例数 | **229 / 2225**（引用批 7 终态） | **只增不减** | 逐文件对拍 ⇒ `LOST` / `SHRUNK` 逐条归因 | **是（未归因的丢失）** |
| `cargo` | **2360 / 2354 passed / 6 ignored**（**引用**批 7 终态，树 `c0bff722`） | **只增不减** | 🔴 **修正（2026-09-13，U1/U2 裁决后）**：本批**不再是「零 Rust 改动」** —— **T25 / T27 / T28 三处改 Rust** ⇒ **必须真跑** `cd app/src-tauri; cargo test --test app_lib_tests`（**cwd = `app/src-tauri`**）+ 逐条说明用例增减；`cargo clippy --all-targets` 只须登记（**改动面外的读数不追**） | **是（若用例数减）** ⇒ V4 |

**Files:** 0 生产代码（产出 `tmp/t22/**` + `task-22-report.md` + `closing-review.md`）

- [ ] **Step 0: 独占窗口 + 取锁**（真构建必须串行；锁文件住 `.superpowers/**`）：`New-Item -ItemType File -Path <lock> -ErrorAction Stop` ⇒ 占用则退避 30 s × ≤6；`finally` 释放。
- [ ] **Step 1: 串行八闸 + 真构建**（**逐条、不并发**；含 `node scripts/check-bundle-budget.mjs`（**不带 `--no-build`**）⇒ **这一次懒侧真判**）。
- [ ] **Step 2: vitest 冷 + 热**（**两次都登记**；读 `--outputFile` 前查 mtime；文件数读 `testResults.length`）。
- [ ] **Step 3: 三条验收 + 二分清单 + 收口评审**（**报告必含**：① 八闸逐条；② 冻结键表；③ 期望中间值 + 为何；④ 诚实边界；⑤ 读数带 sha + mtime；⑥ 「只能登记」清单；⑦ §10 点名）。
- [ ] **Step 4: 诚实单列**：**逐条复制** `## 诚实边界` 第一类（**仪器不可达**）与第二类（**本批未做**），**不得合并同类项、不得删减**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **三条验收逐条有机器读数**（主线一 = A/B 的实现判据全绿 + 注册表第三项；主线二 = 仪器的自检 + 14 条欠账逐条有读数/归属；主线三 = 四条治理项的落地读数） | **M1**：把注册表第三项删掉 | **M1 后期望**：`registry.test.ts` 的 G1 对拍红（**具名**）⇒ 「主线一已交付」**不成立** |
| **V2** | **八闸读数逐条 + 与 `### 表 1` 对账**（任何回升逐条解释）；`exit` 与**具名输出**同时给 | — | 逐字读数 |
| **V3** | **懒侧真判**：`judged = true`（**不是 `⏭`**）+ `unlisted = []` + 逐族红 0（或越界已授权重冻） | **M3**：用 `--no-build --dist app/dist` 跑（**假绿通道**） | **M3 后期望**：`judged` 仍为 `true` 但**产物可能陈旧** ⇒ 🔴 **这正是 P-37**：报告**必须**同时给 `app/dist` 的 mtime 与源码 sha ⇒ **mtime 早于源码 ⇒ 读数作废** |
| **V4** | 🔴 **Rust 侧真跑（修正：本批**有** Rust 改动）**：`cd app/src-tauri; cargo test --test app_lib_tests` ⇒ **exit 0**；`passed` **≥ 2354**（对照引用基线逐条说明增减）；并在报告里给出三个 Rust 改动单元（**T25 / T27 / T28**）各自的提交 sha | **M4**：把 T28 新增的音频删除那一段注释掉 | **M4 后期望**：`删会话后音频必须不存在` 的 Rust 用例红（**具名**）⇒ 「Rust 侧已覆盖」**不成立** |
| **V5** | **二分清单双向抽查**（由 T23 做）：6 条随机抽 ⇒ 逐条可指到证据 | — | 逐字读数 |

**提交信息**：**0–1**（报告在 gitignored 目录 ⇒ 默认**零提交**）

**诚实边界**：① **懒侧判据需要新鲜构建** ⇒ 若本步跑不动构建，**懒侧只能写「未判」**；② **真机不可达**（U5 沿用跳过）⇒ 三条验收里凡涉及真机的部分**只能登记**；③ **W1 那类负载敏感红**：按 **R-FLAKE** 三条判定，**缺一 ⇒ 只写「未判定」**。

---

### Task 23: 独立复核（**非交付方**）

**目标**：由**未参与交付**的单元：① **三路独立复跑**（八闸的关键三条 + 一次真构建 + 一次目标测试）；② **二分清单双向抽查 ≥6 条**；③ **变异体复核**（至少 3 条：T9 的 M1、T19 的 M1、T20 的 M1）；④ **诚实边界核对**（逐条查「有没有把不可达写成已达成」）；⑤ 出 `batch8-independent-review.md`。

**🔴 冻结值预算表（§C9.12）**：**本任务只读** —— 六棘轮 / 八闸 / `lazyBudget.json` 全部**零改动**；**唯一产出 = 一份报告**（在 gitignored 目录）。

**Files:** 0（产出 `batch8-independent-review.md`）

- [ ] **Step 1: 独立复跑**（**串行**）· **Step 2: 二分清单抽查 ≥6 条（双向）** · **Step 3: 变异体复核 ≥3 条**（**在导出副本里**）· **Step 4: 诚实边界核对** · **Step 5: 出报告并报控制方**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **复跑读数与交付方逐字一致**（不一致 ⇒ 逐条列差异） | — | 逐字读数 |
| **V2** | **抽查覆盖率**：二分清单**双向各 ≥3 条**（「已交付」侧抽 3 · 「未交付」侧抽 3） | **M2**：只抽查「已交付」侧 | **M2 后期望**：抽查覆盖率判据红（**具名**：两个方向各 ≥3） |
| **V3** | **变异体复核**：至少 3 条独立重放，逐条给 `文件:行:断言名`（**§C17.3：锚点由变异体裁定**） | **M3**：把 T20 的规则值改回 100 后重放 51 字样本 | **M3 后期望**：该样本**转为通过** ⇒ 复核判据红（**证明牙是真的**） |
| **V4** | **诚实边界核对**：逐条检查 `## 诚实边界` 的两类是否被误写（**尤其**「真机」「观感」「覆盖率」三类措辞） | — | 逐字读数（⚠️ **牙口未证**：靠人读） |

**提交信息**：**0**

**诚实边界**：复核者是**人/单元**，**不是**独立第三方；它的价值在于**不复用交付方的中间产物**（尤其**不复用其 JSON 读数**）。

---

## 段 8f · 用户裁决项落地（T24–T28）

> **依据**：用户 2026-09-13 的裁决（**U1 = a 都修 · U2 = c 删除（只移除代码路径）· U3 = a 归档 · U4 = d 入库 + 按需入口 + 写死触发条件**；**U5 沿用跳过**）+ 控制方的落地要点（`user-decisions.md` 顶部的裁决表）。
> 🔴 **本段是本批唯一的「范围扩大」段** ⇒ **它是唯一有 Rust 改动的段**（T25 / T27 / T28）⇒ **T22 的 `cargo` 行不再能写「零改动」**（见 T22 的修订行）。

---

### Task 24: U4 · 观感仪器的按需入口 + 写死触发条件（**不接 husky、不进 CI**）

**目标**：① `app/package.json` 加**一个** script：`"check:visual": "node ../scripts/viewport-probe.mjs …"`（**逐字命令以 T12 的 CLI 契约为准**）；② `docs/standards/testing.md` 的第十部分补**触发条件**（🔴 **写死**：「**动了 `app/src/ui/primitives/**` / token（`tokens.gen.ts` / `gen-tokens.mjs`）/ 任何 `.css` 时必须跑**」+ 「**跑前必须真构建**」+ 「**串行**」）；③ 把「**不进 husky、不进 CI**」**写进文档与仪器头注**（U4-b/c **用户未选**）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **全部六棘轮 + 八闸** | 见 `### 表 1`/`### 表 2` | — | 🔴 **零改动**（改 `package.json` 的 `scripts` 段与 `.md`） | **否**（V3） |
| `app/package.json` 的 `dependencies` / `devDependencies` | **逐字现状**（`:14-30` / `:31-…`） | 🔴 **不得改** | 🔴 **只加 `scripts` 一行** —— 改依赖会动 `package-lock.json` 与 `manualChunks` 的覆盖闸 | **是（若改依赖）** ⇒ V3（覆盖闸红） |
| `app/package-lock.json` | **5543 行** | **不得改** | 加 script **不改 lock** | **否**（V3 逐字节） |
| `docs/standards/testing.md` 行数 | **229**（T4/T12 后略增） | 无门禁 | **+≤12 行** | **否** |

**Files:**
- 改 **`app/package.json`（43）** —— `scripts` 里加 `check:visual`
- 改 **`docs/standards/testing.md`** —— 第十部分补「调用形态 + **触发条件** + 不进 husky/CI」（**写者队列 T4 → T12 → T24**；blob 构造）
- 🔴 **不得**改 `.husky/**` · **不得**改 `.github/**` · **不得**改 `scripts/viewport-probe.mjs`（若 CLI 契约需要微调 ⇒ **回 T12**，**不在本任务**）

- [ ] **Step 0: 先量基线**：`cd app; npm run` 的现有 script 清单 + `node -e "const p=require('./app/package.json'); console.log(Object.keys(p.scripts))"`。
- [ ] **Step 1: 加 script（一行）**：🔴 **路径必须相对 `app/`**（npm script 的 cwd = 包目录）⇒ 用 `node ../scripts/viewport-probe.mjs`；🔴 **不得**用 `shell: true` 语义的写法（P4）。
- [ ] **Step 2: 文档写死触发条件**（三条：**改了什么必须跑** / **跑前真构建** / **串行**）。
- [ ] **Step 3: 提交（1 次）**
  ```powershell
  git add -- app/package.json
  git commit -m "build(app): 加观感探针的按需入口"
  # testing.md（blob 构造）
  git commit -m "docs(standards): 写死观感探针的触发条件"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **入口可用**：`cd app; npm run check:visual -- --width 1024 --height 640` ⇒ **exit 0**（且跑完 `git status` 无新目录） | **M1**：把 script 的路径写成 `scripts/viewport-probe.mjs`（少一层 `../`） | **M1 后期望**：`npm run` 报 **`Cannot find module`** ⇒ **非零退出**（**具名**） |
| **V2** | **触发条件逐字在**：`testing.md` 含「动了 `ui/primitives/**` / token / `.css` 时必须跑」+「**不进 husky、不进 CI**」 | **M2**：把触发条件改成「可选」 | **M2 后期望**：⚠️ **牙口未证**（文本存在性可判、语义强度需评审）⇒ 报告标注 |
| **V3** | **依赖面零改动**：`git diff` 对 `app/package.json` **只含 `scripts` 段的一行**；`app/package-lock.json` **零 hunk**；`manualChunks.test.ts` 的覆盖闸绿 | **M3**：顺手把一个 `devDependencies` 挪进 `dependencies` | **M3 后期望**：`manualChunks.test.ts` 的覆盖闸红（**具名**） |
| **V4** | `.husky/pre-commit`（20）与 `.github/**` **零 hunk** | — | 逐字读数 |

**提交信息**：① `build(app): 加观感探针的按需入口`（**subject 15 字**）② `docs(standards): 写死观感探针的触发条件`（**subject 18 字**）

**诚实边界**：① 🔴 **「按需入口」不等于「会被执行」** —— 用户**未选** husky/CI ⇒ **没有人自动跑它**；本任务的交付是「**有正式形态 + 明确触发条件**」，**不是**「门禁已覆盖」；② `npm run check:visual` 的**真跑成本** = 真实构建（分钟级，且**串行**）⇒ 触发条件里**必须**写明；③ 本任务**不验证** CI 面（无 CI 改动）。

---

### Task 25: U2 · 凭据槽 `"default"` 的**代码路径**移除（🔴 **只移除路径，不抹数据**）

> **依据**：用户裁决 **U2 = c（删除）** + 控制方的边界要求：🔴 **写成「移除 `"default"` 作为合法槽位的读写路径（代码级）」**，**不得**顺手物理抹除用户已存的密钥数据 —— **两者要在计划里分开写、分开判据**。

**目标**：① **移除代码路径**：让 `"default"` **不再是**合法的 provider 槽位（读路径不再把它当合法值、写路径不再可能落成它）；② 🔴 **不触碰**已存数据：**不做**「删除 `"default"` 槽的数据」这件事（那是**另一件事**，**用户裁决未授权**）；③ ⚠️ **风险登记**：**仅有 `default` 槽的真机用户凭据会失效（需重填）** —— **本环境测不了**（真机跳过）⇒ 进 `## 诚实边界`。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| **六棘轮 + 前端门禁** | 见 `### 表 1`/`### 表 2` | — | 🔴 **零前端改动**（若只改 Rust ⇒ 前端读数全持平） | **否**（V4） |
| `check-command-registry` | **311 / 311 / 0** | **不得变**（**不加也不删 command**） | 🔴 **只改 `provider_scope` / 读取路径的语义**，**不新增/删除 IPC** | **是（若动注册面）** ⇒ V3 |
| `cargo test --test app_lib_tests` | **2360 / 2354 passed / 6 ignored**（**引用**批 7 终态） | **只增不减** | Rust 单测**只增**（新判据） | **是（若用例数减）** ⇒ V2 |
| SQLite schema / 迁移 | `db_migrations.rs` **573** | 🔴 **不得动** | 🔴 **零迁移**（本任务**不删数据** ⇒ 无 schema 动作） | **是（若加迁移）** ⇒ V3 |

**Files:**
- 改 **`app/src-tauri/src/commands_ai_providers.rs`**（+ **`app_setup.rs` 的启动迁移路径** —— **实测后确定**：`batch 1` 的登记逐字提到「读兜底与启动迁移仍在」）+ 其单测件
- 🔴 **`NON_MIGRATED_14`**：不涉（Rust 面）· **不得**改 `db_migrations.rs` · **不得**改 `app_commands.rs`（**不动 IPC 注册**）
- 🟡 **§10 相邻点名**：**AI 凭据面**（不在 §10 的七条清单里，但**涉密**）⇒ 报告必须点名 + 评审复核

- [ ] **Step 0: 先量基线 + 定位真身（**必做**）**
  ```powershell
  cd app/src-tauri; cargo test --test app_lib_tests ai_provider 2>..\..\<tmp>\cargo-err.txt ; echo "exit=$LASTEXITCODE"
  node <tmp>\scan-default-slot.mjs     # 自造探针：入库域内 "default" 作为槽位的读写路径逐处清单
  ```
  🔴 **探针必须区分三件事**：① `"default"` **字面量**（可能出现在别处）② 它作为**槽位键**的使用 ③ 用户数据的**物理存储键**。
- [ ] **Step 1: 移除「合法槽位」的语义**（**逐处**）：读路径不再把 `"default"` 当合法值；写路径**不可能**落成它（守卫 + 显式拒绝）。
- [ ] **Step 2: 🔴 数据面「零动作」的自证**：`git diff` 里**没有任何**删除/迁移用户凭据数据的代码；报告逐字写「**本次不抹除任何已存数据**」。
- [ ] **Step 3: 单测（只增）**：① 写路径**拒绝** `"default"`（具名断言）② 读路径**不再返回** `"default"` 作为合法槽位 ③ **已存数据的物理键仍在**（一条断言证明「没删数据」）。
- [ ] **Step 4: 提交（1–2 次）**
  ```powershell
  git commit -m "fix(ai): 移除默认凭据槽作为合法槽位的路径"
  ```
  🔴 **不 push**；🔴 **报告必须点名「凭据面」并给风险登记**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **写路径拒绝**：以 `"default"` 为槽位的写入 ⇒ **被拒绝**（具名断言） | **M1**：把守卫去掉 | **M1 后期望**：该用例红（**具名**） |
| **V2** | 🔴 **数据未被抹除**：一条断言证明「已存在的凭据数据**仍在**存储里」（**键与值都可读**） | **M2**：顺手加一段「启动时删除 `default` 键」的代码 | **M2 后期望**：`已存数据必须仍在` 用例红（**具名**）⇒ 这条**正是**「分开写、分开判据」的落地 |
| **V3** | **IPC 面零变化**：`check-command-registry` **311/311/0**；`git diff` 对 `app_commands.rs` / `db_migrations.rs` **零 hunk** | **M3**：🔻 **E8b-7 勘误（2026-09-13，E8b）：原写「把 `provider_scope` 的默认值改成新命令」—— 变异体不可达且对象错位**：① `provider_scope` 是**凭据 scope 键**、**不是命令**（`app/src-tauri/src/ai_provider.rs:197-199` 逐字 `pub fn provider_scope(provider_id: &str) -> String { format!("provider:{}", provider_id) }`）；② `scripts/check-command-registry.mjs`（**301 行**）对 `provider_scope` **0 命中** ⇒ 它判的是**命令名三向一致**，本条变异**动不了它**；③ `provider_scope` 住在 `ai_provider.rs` / `commands_ai_providers.rs`，**不在** V3 判据的 `git diff` 路径表（`app_commands.rs` / `db_migrations.rs`）内 ⇒ **两侧判据都不动**。⇒ **换成打在本判据作用面上的注入**：在 `app/src-tauri/src/app_commands.rs` 的 `generate_handler!` 里**增/删一条 command**（TS 侧 `COMMANDS` 不同步） | **M3 后期望**：`check-command-registry` **三向一致性红**（**具名**：报出那条多/缺的命令名）**且** `git diff` 对 `app_commands.rs` **非空** ⇒ 判据红。🔴 **红点由实跑裁定，不由推理** |
| **V4** | 前端读数全持平（`tsc` / `line-limits` / `vitest` 文件与用例数不减） | — | 逐字读数 |
| **V5** | **风险登记在案**：报告逐字含「仅有 `default` 槽的真机用户凭据会失效（需重填）；**本环境测不了**（真机跳过）」 | — | 逐字读数（⚠️ **牙口未证**） |

**提交信息**：`fix(ai): 移除默认凭据槽作为合法槽位的路径`（**subject 19 字**）

**诚实边界**：① 🔴 **「删除」的读法 = 移除代码路径**，**不是**抹除用户数据（**用户裁决未授权后者**）；② 「仅有 `default` 槽的真机用户凭据会失效」**本环境测不了**（真机跳过，U5）⇒ **只能登记**；③ 本任务**不改 schema / 不加迁移**（零数据面动作 ⇒ 可逆性最高）。

---

### Task 26: U3 · `docs/tech-debt/` 归档（🔴 **按 `docs/archive/README.md` 的 6 步 SOP，不是 `git mv`**）

> **依据**：用户裁决 **U3 = a（归档到 `docs/archive/`）** + 控制方读 `docs/archive/README.md`（**114 行**）后的实测要点。🔴 **本单元工作量明显大于一个 `git mv`**：含**当日日期夹 + 继承滚动清单 + 当日 README + 活跃区索引 + 扫描数归因**。

**目标**（**六步 SOP**，`README.md:29-38` 逐条）：
1. **整理昨日债务**：读 `docs/archive/2026-09-09/tech-debt.md`（**最新一日**）⇒ 已偿改 `closed`（注偿还提交）、未偿继承 `carried`；
2. **识别今日新债务**：扫今日提交的 `TODO` / `FIXME` / `HACK` / 妥协方案 ⇒ 登记 `open`；
3. **筛选今日已实施文档**（确认**已入库**）⇒ 移入**今日归档夹**；
4. **写当日 README**：归档清单 + 债务摘要；
5. **更新活跃区索引**：链接改指归档路径 + 标 `[ ] 已归档`（`docs/archive/README.md`）；
6. **原子提交**：`docs(archive): archive YYYY-MM-DD`；🔴 add 时**列明归档夹与涉及文件，禁止 `-A` 目录级 add**。

**🔴 本任务的两条实测关键（控制方已给，**实施者必须复核**）**
- 🔴 **`docs/tech-debt/review-2026-09-11.md` 是未跟踪文件**（`git ls-files` 不含、**191,980 B**）⇒ **它没有 git 历史可保留** ⇒ **`git mv` 不适用**；实施形态 = **`git add` 到新路径**，并在报告里**逐字说明「无历史可保留」**（否则会被读成「没用 `git mv`」的违规）。
- 🔴 **`docs-check` 的精确影响**（`scripts/docs-check.mjs:108-110`）：`if (INCLUDE_ARCHIVE) return true;` ⇒ 归档后该文件**进 `files`（扫描）但不进 `activeFiles`（检查）** ⇒ 🔻 **E8-11 预测更正（2026-09-13，E8 复测：基线已由 281/181 变为 282/182；`activeFiles` 的排除口径是「路径**段** = `archive`」而非子串）+ 结构算术**：`files` 282 **−1**（`docs/tech-debt/` 里的那份移走）**+3**（`docs/archive/<执行日>/` 下 README + tech-debt + 移入的审查报告）**= 284**；`activeFiles` 182 **−1**（移入 archive 的那份不再算活跃）**+0**（新增两份都在 archive 内）**= 181** ⇒ **修正预测 = 扫描 284 / 检查 181**（**原写 281 → 282 / 181 → 181 是旧基线下的推断**）。🔴 **仍必须实测确认**（不符 ⇒ 报告给旧值 / 新值 + **归因**）。
- 🔴 **归档日期 = 实际执行日**（机制 = `YYYY-MM-DD` 子夹名）⇒ **不要**用 `review-2026-09-11.md` 文件名里的 **09-11**（那是**审查日期**）。🔴 **若实施者认为机制有歧义 ⇒ 在报告里单列并说明**，**不要自己拍板**。
- 🔴 **空白日不建夹**（`README.md:53` 逐字）⇒ **09-10 ~ 09-12 没有夹是正常的，不要补**。
- 🔴 **只读约束**（`:47-53`）：**除最新一日外禁止修改既有归档文件** ⇒ 本任务**只许**新建今日夹 + 改 `docs/archive/README.md`（索引）。
- ✅ **「审查报告」属可归档类**（先例：`docs/archive/2026-09-06/asr-v020-review.md`）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值（**本计划者实测**） | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `docs-check` **扫描 / 检查** | 🔻 **E8-11 复测（2026-09-13）现基线 = 282 / 182**（工作树；含未跟踪的 `docs/tech-debt/review-2026-09-11.md`；原写 281 / 181 —— 那是**本计划文件入库之前**的读数） | 只许**如实登记变化** | 🔴 **预期变为 284 / 181**（结构算术见 Files 节；**必须实测**）；**这一步是本任务唯一的「读数变化」** | ⚠️ **是（读数会变）** ⇒ V1 给旧值 / 新值 + 归因 |
| `git status --porcelain` | **仅 `?? docs/tech-debt/` 一行** | — | 🔴 归档后**应为空**（`docs/tech-debt/` 消失；新文件已入库） | ⚠️ **是（预期行为）** ⇒ V2 |
| `docs/archive/**` | **19 个日期夹**（最新 `2026-09-09`） | 🔴 **除最新一日外禁止修改** | **只新建今日夹 + 改索引** | **是（若改了旧夹）** ⇒ V4 |
| `docs/archive/2026-09-09/tech-debt.md` | **最新一日**（**权威清单来源**） | 可读；**可改？** ⚠️ 滚动规则逐字要求「无新增债务的归档日**仍须继承**昨日清单」⇒ 继承**写进今日夹**，**不改昨日夹** | 🔴 **只读**（继承 = 抄进今日夹） | **是（若改它）** ⇒ V4 |
| 六棘轮 / 八闸其余 | 见 `### 表 1`/`### 表 2` | 持平 | **零代码改动** | **否** |

**Files:**
- 新建 **`docs/archive/<执行日>/README.md`**（归档清单 + 债务摘要）
- 新建 **`docs/archive/<执行日>/tech-debt.md`**（🔴 **从 `2026-09-09/tech-debt.md` 继承** + 今日新增 `open` + 状态流转）
- 新建（**由未跟踪文件搬入**）**`docs/archive/<执行日>/review-2026-09-11.md`**（**内容零改动**、191,980 B 逐字节）
- 改 **`docs/archive/README.md`（114）** —— 活跃区索引 + `[ ] 已归档` 标记
- 🔴 **删除 `docs/tech-debt/`**（移入后目录应为空/不存在）
- 🔴 **`NON_MIGRATED_14`**：不涉

- [ ] **Step 0: 先量基线（三条，**必测**）**
  ```powershell
  node scripts/docs-check.mjs                     # 期望：exit 0 · 扫描 282 / 检查 182（🔻 E8-12 时点更正：原写 281/181）
  node -e "const{execFileSync}=require('child_process');console.log(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}))"
  node -e "const fs=require('fs');console.log(Buffer.byteLength(fs.readFileSync('docs/tech-debt/review-2026-09-11.md')))"   # 期望 191980
  node -e "console.log(require('fs').readdirSync('docs/archive'))"                                                          # 期望含 2026-09-09，无 09-10~09-12
  ```
- [ ] **Step 1: 读 `docs/archive/2026-09-09/tech-debt.md` 与 `docs/archive/README.md`**（**只读**）⇒ 抽出「未偿（`carried`）」清单。
- [ ] **Step 2: 建今日夹 + 三件文件**（README / tech-debt / 搬入的审查报告）—— 🔴 **审查报告内容零改动**（`Buffer` 逐字节对拍）。
- [ ] **Step 3: 更新索引**（`docs/archive/README.md`）。
- [ ] **Step 4: 移除 `docs/tech-debt/`**（🔴 用 `git add` 新路径 + 删旧目录；**不得**用 `git mv` 声称保留历史 —— **该文件无历史**）。
- [ ] **Step 5: 复测 `docs-check`**（**实测结论写进报告**；与预测 284/181 不符（🔻 E8-11/E8-12：基线 282/182）⇒ 给旧值/新值 + 归因）。
- [ ] **Step 6: 原子提交（1 次）**
  ```powershell
  git add -- docs/archive/<执行日>/README.md docs/archive/<执行日>/tech-debt.md docs/archive/<执行日>/review-2026-09-11.md docs/archive/README.md
  git diff --cached --stat          # 🔴 逐条列明；**禁止 -A 目录级 add**
  git commit -m "docs(archive): archive 2026-09-13"
  git show --name-only --oneline -1
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 🔴 **`docs-check` 的读数变化实测归因**：归档后**逐字**给出「扫描 N / 检查 M」；**与预测（🔻 E8-11/E8-12：284 / 181，基线 282 / 182）不符 ⇒ 给旧值 / 新值 + 归因** | **M1**：把归档文件放进 `docs/archive/` **之外**（如 `docs/` 根） | **M1 后期望**：**扫描与检查都 +1** ⇒ 与预测不同 ⇒ **证明 `INCLUDE_ARCHIVE` 分支真的是「只进扫描」** |
| **V2** | **工作树终态**：`git status --porcelain` = **空**（`docs/tech-debt/` 消失、新文件已入库） | — | 逐字读数（**空输出就是判据**） |
| **V3** | 🔴 **归档内容零改动**：`review-2026-09-11.md` 的字节数与 sha256 **归档前后逐字相同**（**191,980 B**） | **M3**：把该文件的标题行改一个字符 | **M3 后期望**：字节/sha256 对拍红（**具名**） |
| **V4** | **归档纪律**：`git diff` **只含**今日夹的 3 个新文件 + `docs/archive/README.md`；**既有 19 个日期夹零 hunk** | **M4**：顺手改 `2026-09-09/tech-debt.md` | **M4 后期望**：判据红（**具名**：`除最新一日外禁止修改归档文件`） |
| **V5** | **滚动清单继承**：今日 `tech-debt.md` **含**上一日未偿项（逐条对拍）+ 今日新增 `open` 项 | **M5**：今日清单为空 | **M5 后期望**：继承对拍红（**具名**：`最新归档必有权威清单`） |
| **V6** | **`docs(archive)` 的 6 步齐全**：报告里六步**逐条**有落点 | — | 逐字读数（⚠️ **牙口未证**） |

**提交信息**：`docs(archive): archive 2026-09-13`（**subject 14 字**；🔴 **日期用实际执行日**）

**诚实边界**：① 🔴 **该文件没有 git 历史可保留**（它从未入库）⇒ 「无历史可保留」**必须**写进报告；② 归档**不改变**该报告的**内容**，也不代表其**结论被追认**（它是一份**审查报告**）；③ 归档后 `git status` 变干净 ⇒ 🔴 **本计划中一切「`git status` 恒为一行」的表述，从本任务起按「应为空」读**（`## Global Constraints 一` 已写明）；④ 🔴 **H7 的其余 3 项**在归档后**仍有唯一来源**（路径变成 `docs/archive/<执行日>/review-2026-09-11.md`）⇒ **后续批次引用时必须用新路径**（这条要写进 T21 的 `v0.22` 批 8 节）。

---

### Task 27: U1·A · 音频配置通道（**假开关 → 真通道**）

> **依据**：用户裁决 **U1 = a（都修）** + 控制方的落地要点：`AudioStoreConfig` 现全仓 **10 处构造点、无 JSON/env 通道** ⇒ `status.enabled` **恒 `true`** ⇒ 需要**开一条真配置通道**（**配置落盘或 env**）+ **幂等** + **边界** + **判据**。

**目标**：① 给 `AudioStoreConfig` 开一条**真配置通道**（**首选：配置落盘**，与既有 `video_profile_memory.json` 同族的本地 JSON；备选：env）⇒ `enabled` **可由用户改**且**重启后保持**；② `AudioStoragePanel` 的开关**变成真的**（点它 ⇒ 落盘 ⇒ 重启后状态仍对）；③ **幂等 + 边界**（文件缺失 / 损坏 / 部分字段缺失 / 并发写）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `check-command-registry` | **311 / 311 / 0** | 🔴 **不得变**（**本任务不加 IPC**） | 🔴 **走既有 command**（若必须新增 ⇒ **STOP 报控制方** —— 那会触 §10 与 IPC 注册面） | **是（若加 command）** ⇒ V3 |
| `cargo test --test app_lib_tests` | **2360 / 2354 passed / 6 ignored**（引用） | 只增不减 | 新增单测（**只增**） | **是（若减）** ⇒ V2 |
| SQLite schema | `db_migrations.rs` **573** · **26 条 `ALTER TABLE`** | 🔴 **不得动** | 🔴 **配置走 JSON 落盘，不进 SQLite**（零迁移） | **是（若加迁移）** ⇒ V3 |
| `app/src/components/AudioStoragePanel.tsx` | **实测行数由实施者当场取**（🔴 **本任务前必测**） | 300 | 改开关的落点（**净增 ≤ +20**；若贴边 ⇒ **先拆件**） | **是（若 >300）** ⇒ V4 |
| 六棘轮（前端） | 见 `### 表 2` | 只许降 | 🔴 面板的按钮**必须** `Button` 原语、样式走 token（**不得**新增原生 `<button>` / 颜色字面量） | **是（若出现）** ⇒ V4 |

**Files:**
- 改 **`app/src-tauri/src/audio_store.rs`（284）** —— `AudioStoreConfig` 的构造 / 载入 / 保存（**新增路径**）+ 幂等 + 边界
- 改 **`app/src-tauri/src/commands_audio.rs`** 与 **`app/src-tauri/src/live_session.rs`（构造点，实测定位）** —— 三个生产构造点**改为读配置通道**
- 改 **`app/src/components/AudioStoragePanel.tsx`** —— 开关**变成真的**（落盘 + 状态回读）
- 改/新建 Rust 单测件（**只增**）
- 🔴 **不得**动 `db_migrations.rs` · **不得**加 IPC（`app_commands.rs` 零改动）

- [ ] **Step 0: 先量基线（**必做：10 处构造点逐处定位**）**
  ```powershell
  node <tmp>\scan-audio-config.mjs   # 入库域内 AudioStoreConfig 的全部构造点 + default() 调用 + 现有读写路径
  cd app/src-tauri; cargo test --test app_lib_tests audio 2>..\..\<tmp>\cargo-err.txt ; echo "exit=$LASTEXITCODE"
  ```
  🔴 控制方给的是「**全仓 10 处构造点 · 无 JSON/env 通道**」（侦察 C 读数）⇒ **实施者必须自己重数**并把逐处清单写进报告（**不许抄**）。
- [ ] **Step 1: 配置通道（首选落盘）**：文件位置**必须在应用数据目录**（AGENTS.md §4：文件系统访问限定应用数据目录）；🔴 **幂等**（重复载入/保存不改变结果）；🔴 **损坏/缺失的降级**（缺字段 ⇒ 用默认值，**不得** panic / 空 catch）。
- [ ] **Step 2: 三个构造点改为读通道**（`commands_audio.rs` / `live_session.rs` 等，**逐处**）。
- [ ] **Step 3: 面板真起来**：开关 ⇒ 落盘 ⇒ **状态从通道回读**；🔴 **不得**只改 UI 显示（那正是今天的「死 UI」）。
- [ ] **Step 4: 单测（只增，覆盖四点）**：① 缺文件 ⇒ 默认值 ② 损坏 ⇒ 降级不崩 ③ 保存后读回 == 保存值 ④ **幂等**（连存两次 == 存一次）。
- [ ] **Step 5: 提交（2 次）**
  ```powershell
  git commit -m "feat(audio): 给音频存储配置开一条落盘通道"
  git commit -m "feat(ui): 音频存储面板的开关读取真实配置"
  ```
  🔴 **不 push**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **真通道（端到端、机器可判）**：`enabled=false` 落盘 ⇒ **重新载入配置** ⇒ 仍为 `false`（**这是「跨重启」的机器代替品**；🔴 **不得**写成「重启后仍生效」的真机结论） | **M1**：把载入函数改成永远返回 `default()` | **M1 后期望**：`保存后读回 == 保存值` 用例红（**具名**） |
| **V2** | **幂等 + 边界**：① 缺文件 ⇒ 默认值 ② 损坏 JSON ⇒ **降级不 panic** ③ 连存两次 == 存一次 | **M2**：把损坏分支改成 `unwrap()` | **M2 后期望**：损坏用例**崩**（非零退出 / panic）⇒ 判据红（**具名**） |
| **V3** | **IPC / schema 零变化**：`check-command-registry` **311/311/0**；`git diff` 对 `db_migrations.rs` / `app_commands.rs` **零 hunk** | **M3**：把配置写进 SQLite 新表 | **M3 后期望**：`git diff` 对 `db_migrations.rs` 非空 ⇒ 判据红（**具名**：**配置不进 SQLite**） |
| **V4** | **前端零冻结键新增**：面板的行数 ≤300；六族键零新增；`Button` 原语 | **M4**：把开关写成裸 `<button>` | **M4 后期望**：`nativeButton.ratchet.test.ts` 红（**具名**） |
| **V5** | `cd app; npx tsc --noEmit` **0 错** · `line-limits --full` **0/121/121** · `cargo test` 用例数**不减** | — | 逐字读数 |

**提交信息**：① `feat(audio): 给音频存储配置开一条落盘通道`（**subject 19 字**）② `feat(ui): 音频存储面板的开关读取真实配置`（**subject 20 字**）

**诚实边界**：① 🔴 **「跨重启保持」的判据是机器代替品**（重新载入同一文件）⇒ **不得**写成「已真机确认」（真机跳过，U5）；② **配置落盘位置**在应用数据目录 ⇒ 报告的读数必须给**绝对路径的形态**（**不得**把用户目录写进入库文档）；③ **删会话不删音频**这条**不在本任务**（T28）；④ 本任务**不改**音频**存储格式**，只改**是否存储**的开关。

---

### Task 28: U1·B · 删会话连音频（**级联清理 + 边界**）+ 段 8f 收口

> **依据**：用户裁决 **U1 = a（都修）** + 控制方的落地要点：**删会话要删音频**（现只级联清转写段与 OCR 块）⇒ 需动 `app/src-tauri/src/commands_session.rs`（**§10 相邻**）+ 处理「**删除失败 / 部分删除**」边界。🔴 **隐私面优先**：数据不出本机的承诺下，用户删了会话却留着音频与承诺冲突。

**目标**：① 删会话时**级联删除音频文件**（`.wav` 与 sidecar `{id}.wav.meta.json`）；② **边界**：「删除失败」「部分删除」**不得**让整个删会话失败（会话记录必须删掉；失败项登记/上报）；③ **单测**（内存库 + 临时目录，**不依赖真实模型/真实音频**）；④ **段 8f 收口**（八闸串行 + 段终态声明）。

**🔴 冻结值预算表（§C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `check-command-registry` | **311 / 311 / 0** | 🔴 **不得变** | 🔴 **不新增 command**（删会话的清理是**既有命令内部**的行为） | **是（若加 command）** ⇒ V3 |
| `cargo test --test app_lib_tests` | **2360 / 2354 passed / 6 ignored**（引用） | **只增不减** | 新增单测（只增） | **是（若减）** ⇒ V2 |
| SQLite schema / 迁移 | **573 行 / 26 条 `ALTER TABLE`** | 🔴 **不得动** | 🔴 只用**既有** `sessions` / `session_segments` / `session_ocr_blocks` 的级联路径 + 文件系统删除 | **是（若加迁移）** ⇒ V3 |
| `commands_session.rs`（**447**）· `commands_session_delete.rs`（**75**） | 实测行数（🔴 **本任务前必测**） | 300 / 300 | 🔴 **两件都在 300 以内**，但都**接近登记面** ⇒ **净增 ≤ +25 且必须复测** | **是（若 >300）** ⇒ V4 |
| 首屏 / 懒侧 | 105.95 kB · 37 / 637,501 B | 只许降 | 🔴 本任务**纯 Rust** ⇒ 前端读数**逐字持平** | **否** |

**Files:**
- 改 **`app/src-tauri/src/commands_session.rs`（447，🔴 §10 相邻）** —— 级联清理加音频
- 改 **`app/src-tauri/src/commands_session_delete.rs`（75）** —— 同一清理链（**实测后确定落点**）
- 改/新建 Rust 单测件（**只增**；用 `Db::open(":memory:")` + 临时目录）
- 🔴 **不得**动 `db_migrations.rs` · **不得**动 `app_commands.rs`（IPC 注册面）

- [ ] **Step 0: 先量基线（**三条**）**
  ```powershell
  node <tmp>\scan-session-delete.mjs    # 入库域内：删会话路径的级联清单（表 + 文件）+ audio 命中的真身
  cd app/src-tauri; cargo test --test app_lib_tests session 2>..\..\<tmp>\cargo-err.txt ; echo "exit=$LASTEXITCODE"
  node .superpowers/sdd/2026-09-13-frontend-redesign-batch8/tmp/plan-writer/p1-lines.mjs   # 复核两件行数
  ```
  🔴 控制方给的是「`commands_session.rs` 与 `commands_session_delete.rs` 的 `audio` 命中**各 0**」（侦察 C 双侧实测）⇒ **实施者自己重测**并给逐处清单。
- [ ] **Step 1: 级联清理加音频**：删会话 ⇒ ① 既有级联（转写段 / OCR 块 / 事件 / 屏卡）② **新增：音频文件 + sidecar**；🔴 **路径必须从应用数据目录解析**（**不得**拼用户输入）。
- [ ] **Step 2: 边界（控制方逐字要求）**：**删除失败** ⇒ **不**让事务回滚掉会话删除（**部分删除**是允许的终态）⇒ **必须**把失败项**登记/上报**（`Result` 里给计数或日志），🔴 **不得**空 catch / 静默忽略（AGENTS.md §4）。
- [ ] **Step 3: 单测（只增）**：① 正常删除 ⇒ 文件确实不存在 ② **删除失败**（文件只读 / 不存在）⇒ 会话仍被删掉 + 失败被上报 ③ **部分删除**（多文件里一个失败）⇒ 终态可解释 ④ 音频不存在 ⇒ **不报错**（幂等）。
- [ ] **Step 4: 提交（2 次）**
  ```powershell
  git commit -m "fix(session): 删除会话时级联清理音频文件"
  git commit -m "test(session): 覆盖音频删除的失败与部分删除边界"
  ```
  🔴 **不 push**；🔴 **报告必须点名 §10 相邻面**。
- [ ] **Step 5: 段 8f 收口**：八闸**串行**真跑 + 与 `### 表 1` 对账 + **段 8f 终态声明**（🔴 **不得**写成「批 8 已交付」）。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 🔴 **隐私面（本任务的核心）**：删会话后，**音频文件与 sidecar 都不存在**（**具名断言**，用临时目录） | **M1**：把新增的音频删除那一段注释掉 | **M1 后期望**：`删会话后音频必须不存在` 用例红（**具名**） |
| **V2** | **边界**：① 文件不存在 ⇒ **不报错**（幂等）② 删除失败 ⇒ **会话仍被删掉** + 失败**被上报** ③ 部分删除 ⇒ 终态可解释 | **M2**：把失败分支改成 `let _ = fs::remove_file(..)`（**空忽略**） | **M2 后期望**：`失败必须被上报` 用例红（**具名**）⇒ 直接守 AGENTS.md §4「空 catch / 忽略错误」 | 
| **V3** | **IPC / schema 零变化**：registry **311/311/0**；`db_migrations.rs` / `app_commands.rs` **零 hunk** | — | 逐字读数 |
| **V4** | **行数**：`commands_session.rs` ≤ 300？—— **实测为 447（已登记 301–600 档）** ⇒ 判据改成 **净增 ≤ +25 且豁免表数值同批同步**（**改文件的那个单元在自己提交里更新**，承 §C14.2） | **M4**：给该文件 +30 行且不改豁免表 | **M4 后期望**：`line-limits --full` 的 `(e)` 判据红（**具名**：`行数不一致 … → 运行 --write`） |
| **V5** | **Rust 用例数不减**：`cargo test --test app_lib_tests` 的 `passed` **≥ 2360 − 0**（**逐条说明新增**） | — | 逐字读数 |
| **V6** | **段 8f 收口**：八闸逐条 + 段终态声明（**不含**「批 8 已交付」） | — | 逐字读数 |

**提交信息**：① `fix(session): 删除会话时级联清理音频文件`（**subject 19 字**）② `test(session): 覆盖音频删除的失败与部分删除边界`（**subject 22 字**）

**诚实边界**：① 🔴 **「音频已删」的证据是临时目录级的单测** ⇒ **不得**写成「真机验证」；② **「部分删除」是一个允许的终态**（控制方逐字）⇒ **不得**声称「要么全删要么全不删」；③ **孤儿 sidecar**（`{id}.wav.meta.json` 不在 `cleanup` 的 `.wav` 过滤面内）是**同一根因的另一面** ⇒ 本任务**必须**把它一并纳入（**若实测发现它在另一条链上** ⇒ 报告登记 + 具名归属，**不得**顺手扩大范围）；④ 本任务的 UI 面**零改动** ⇒ **不得**声称「用户能看见删除结果」（真机不可达）。

---

## 已裁决项（U1–U4 **已由用户裁决并排进段 8f**；U5 沿用「跳过」）

> **状态变更（2026-09-13）**：本节原为 `## 阻塞于用户裁决`（U1–U5 待裁）。🔴 **控制方下传用户裁决后，U1–U4 已解除阻塞并排进 `段 8f`（T24–T28）**；**U5 由控制方按建议默认沿用「跳过」**。下表逐条写「**裁决内容 + 落到哪个单元 + 遗留的诚实边界**」。

| # | 用户裁决 | 🔴 **落到哪个单元** | 遗留的诚实边界（**必须进 T22 的验收表述**） |
|---|---|---|---|
| **U1** | 🔴 **a = 都修** | **T27**（音频配置通道：假开关 → 真通道）· **T28**（删会话连音频 + 失败/部分删除边界）—— **拆成 2 个单元** | ① 「跨重启保持」是**机器代替品**（重新载入同一文件），**不得**写成真机确认；② 「音频已删」是**临时目录级单测**，**不得**写成真机验证；③ 「部分删除」是**允许的终态** |
| **U2** | 🔴 **c = 删除** | **T25**（**只移除「`"default"` 作为合法槽位的读写路径」**；🔴 **不物理抹除**已存密钥） | ① ⚠️ **「仅有 `default` 槽的真机用户凭据会失效（需重填）」本环境测不了**（真机跳过）；② 「删除」的读法**仅指代码路径** |
| **U3** | 🔴 **a = 归档到 `docs/archive/`** | **T26**（**6 步 SOP**：当日夹 + 继承滚动清单 + 当日 README + 索引 + 扫描数归因） | ① 该文件**无 git 历史可保留**（从未入库）；② 归档**不追认其结论**；③ 归档后 **`git status` 应为空**、**`docs-check` 读数会变**（🔻 **E8-11/E8-12 更正**：原写「预测 282/181」⇒ 基线已由 281/181 变为 **282/182**，故预测 = **284 / 181**，**必须实测**） |
| **U4** | 🔴 **d = 入库 + 按需入口 + 写死触发条件** | **T12**（入库 / 参数化 / 卫生 / 盲区）+ **T24**（`npm run check:visual` + 触发条件 + **不进 husky / 不进 CI**） | ① **「有正式入口」≠「会被执行」**（无人自动跑）；② 真跑成本 = **真实构建 + 串行** |
| **U5** | **沿用「跳过」**（控制方按建议默认） | **不排单元** | 🔴 7 条真机类（真机 / WebView2 冒烟 · 1280×800 与最小 1024×640 · 真实帧率 · Flip 几何位移 · 暗档实际生效 · 音频对齐量级 · 跨窗口相位同步）**继续登记、不假装完成**；**T22 的验收表述逐字写「未覆盖 IPC 壳 / WebView2」** |

> 🔴 **衔接纪律**：**U1–U4 的落地单元（T24–T28）必须全部先于 T22 完成**（否则收口读数会因 T26 的归档与 T27/T28 的 Rust 改动而失效）。
> 🔴 **未被用户裁决覆盖的其它用户面**（如 `docs/product/ui-ux-system.md` 的剩余回写、安装包体积预算）**仍在 `## 诚实边界 §二` 里逐条带去向**，**不得**借 U1–U4 的裁决顺手扩大范围。


---

## 陷阱（承批 1–7 的陷阱 + 本批专属，逐条入账）

> **编号体系警告**（承批 7 抽取件的实测）：批 7 文件里陷阱编号有**两套写法** —— 作业书原文用 **`P18`/`P19`/`P20`/`P21`（无连字符）**，新登记的用 **`P-27`…`P-34`（带连字符）**；检索**两套都要查**。🔴 **`P-24` / `P-25` 在批 7 文件里 0 命中 = 真实缺号**（**不是**我读漏）。

### A · 承前陷阱（P-1 – P-18：**只列名 + 引用位**；定义在通用作业书 / 批 6 台账）

`P3`（`>` / `2>` 写 UTF-16LE）· `P4`（Node `spawn('npx.cmd')` = EINVAL）· `P8`（禁 `git restore <path>` / `git checkout -- <path>`；**允许** `git restore --staged`）· **`P9`（并发门禁互为假红 —— 本批最常踩）** · `P10`（`line-limits --write` 会连带落库别人的在飞行）· `P-12`（`engine.guard` 图遍历**读原始文本、不剥注释** ⇒ 注释造**幻影静态边**）· `P15`（`git archive | tar` 坏档）· `P16`（摘 junction 的正确形态）· `P17`（`--outputFile` **按 cwd 解析**）· `P18`（禁在导出树对 `app/node_modules` 建 junction）。

### B · 批 6/7 新增陷阱（P-19 – P-34，**逐条带机理 + 防范**）

| # | 机理 | 触发条件 | 防范（本批怎么写死的） |
|---|---|---|---|
| **P-19** | **递归删除会穿透 junction/symlink**，删到链接目标的内容 | 用 `fs.rmSync(recursive)` / `Remove-Item -Recurse` / `rmdir /s` 删含 junction 的导出树 | 删树前**先摘 reparse point**（`fs.rmdirSync(<link>)`）；**摘除前后断言目标目录条目数不变**（⚠️ `Test-Path` 的「存在」≠「非空」）。**本批：导出树一律复制 `node_modules`、零 junction** |
| **P-20** | `app/node_modules` 是**可重建的共享资源**，被清空即全批前端门禁失效 | 误穿透清理 | 在 `app/` 跑 `npm ci` 恢复，恢复后**复验 `tsc` + 至少一个 vitest 文件**。**本批：每个导出树任务都在报告里记 `node_modules` 条目数（前后相等）** |
| **P-21** | **往被跟踪目录写临时产物** —— 即使事后删除，产物存在的几分钟也足以卡住别人的提交（husky 扫工作树） | 把探针/快照/临时 config 写进 `app/**`、`scripts/**`、`docs/**`、**仓库根** | 🔴 **除 `.superpowers/sdd/<batch>/tmp/<unit>/` 外没有任何允许写临时文件的地方**；旧版本内容用 `git show <commit>:<path>` 或 `git archive -o <tmp>/x.tar`。**本批：`## Global Constraints 七` 写死；且根 `tmp/` 未被 gitignore（实测）** |
| **P22** | 块注释里写「Markdown 粗体紧跟斜杠」 ⇒ `**393**/114` 的 `**/` 含 `*/` ⇒ **提前闭合注释** ⇒ `tsc` 报 `Expected ";"` | 在 TS/TSX 块注释（**含计划预授权文本**）里写 `**N**/M` | 改写成 `**393 处 / 114 文件**`；🔴 **凡改注释散文必须真跑一次 `tsc`**（**本批 T3/T9/T16 都改注释** ⇒ 逐任务写进 Verification） |
| **P23** | **路径通配符同理**：`app/src/**` 紧邻 `/` 会造出 `*/` | 注释里写 `app/src/**/` 之类 | 同上 |
| **P-26** | `grep` 工具 / `git grep` / `git check-ignore` **对 `.superpowers/**` 三个仪器全不可靠** | 对该 gitignored 目录做检索或忽略态判定 | **一切读写只经 node `fs`**（本计划者**全批遵守**：所有探针都是 `.mjs`） |
| **P-27** | **`vitest --outputFile` 按 cwd 解析** ⇒ 在 `app/` 里跑会创建 `app/.superpowers/` | 在非仓根 cwd 跑带 `--outputFile` 的 vitest | 写产物用**显式绝对路径**；跑完**核 `git status --porcelain`** 无意外目录 |
| **P-28** | **读原始源码文本的判据会被注释满足** ⇒ 注释里出现某串就让断言恒真（**真空真 / 假阴性**） | 判据形如「源码里必须出现某串」而未剥注释 | 先**剥注释（抹等长空白保行号）**；**并自带一条「注释里写了但代码没有 ⇒ 必红」的变异体**（🔴 **本批：T9 的 V1/V3、T16 的 V5 都按这条写**） |
| **P-29** | `git archive \| tar` **管道直连会产出坏档** | 直接管道解包导出树 | **先 `-o` 落盘再解包**（`git -c core.autocrlf=false archive -o <tmp>/tip.tar <commit>`） |
| **P-30** | **「同名假活」**：命令撤下后，**同名但不同物的普通内部函数**仍命中 ⇒ 误判「命令还在」 | 核「某命令是否已删净」时用**裸名字**检索 | 必须区分**命令入口**与**同名普通函数**；**两个方向都要查** |
| **P-31** | vitest **`--outputFile` 异步写盘** ⇒ 读到的可能是**上一跑**的读数 | 跑完立刻读 `--outputFile` 产物 | 🔴 **读任何 `--outputFile` 产物前先查 mtime**（**本批 T5/T7/T22 的 vitest 步骤都写死这一条**） |
| **P-32** | PowerShell 5.1 的 **`Set-Content -Encoding UTF8` 写出 BOM** ⇒ commitlint 读成 `subject may not be empty` 并拒提交 | 用 PowerShell 写提交信息文件 | **写提交信息一律用 node `fs.writeFileSync(p, s, "utf8")`**（**本批 T20 的 Step 2 写死**） |
| **P-33** | 🔴 **`update-ref` 静默失败**：PowerShell 传参解析错 ⇒ 命令未生效而**未查 `$LASTEXITCODE`** ⇒ 表面成功、ref 未动 | 在 PowerShell 一行内传参做 ref 操作 | **一切 ref 移动走 node / 文件脚本 + 断言退出码 + 成功后立即 `git rev-parse HEAD` 回读** |
| **P-34** | **`.superpowers/**` 的「导出树副本」会污染任何「全仓」扫描** —— 它们在 gitignore 里但在**文件系统**里 | 递归扫工作树做「全仓/全树/0 命中」统计（批 7 实测：工作树 **194,487** 文件，其中导出树 **172,184**） | 🔴 **域一律取 `git ls-files`（入库域）**，**不得递归扫工作树**；与 **R8.7** 配套：**必须声明域是否为入库域**。🔴 **本计划者的亲历证据**：对 `.superpowers/**` 递归 walk **直接 120 s 超时**（本轮的第一次探针尝试就是这么失败的） |

### C · 本批新增陷阱（P-35 – P-40，**本计划者实测 / 控制方 §2 G5 登记**）+ 🔻 **P-45 / P-45b（E8b 补登，2026-09-13：`## E8b` §E8b.5）**

| # | 机理 | 触发条件 | 防范 |
|---|---|---|---|
| **P-35** | 🔴 **`countLines(absPath)` 是「读盘」而不是「读文本」**（`scripts/line-limits.mjs:48-52` 的唯一实现）⇒ 把**文件正文**当参数传进去会得到 `ENOENT`，**且 Node 的错误信息里会回显整份文件正文**（看起来像「脚本读到了内容却报不存在」） | 任何自造探针误把 `readFileSync(p)` 的**返回值**传给 `countLines` | 🔴 **调用 `countLines` 必须传路径**；探针里统一写 `const L = (p) => countLines(isAbsolute(p) ? p : join(ROOT, p))`（**本计划者的 `p1-lines.mjs` 就这么写的**） |
| **P-36** | 🔴 **行号锚会随入库文档的更新整体漂移**：批 7 收尾的两次文档提交（`3bb681df` / `53bd0759`）之后，规格 §7.4 的整段锚**整体 +2**（侦察 B 的 `:536/:544/:545` → 实测 `:538/:546/:547`），且 `design.md` 由 **1030 → 1035 行** | 直接引用侦察/控制方的行号（**尤其是跨提交的转述**） | 🔴 **动手前当场重测**；写锚**必须带口径与时点**；**剥注释时抹等长空白保行号**（**绝不整段删除** —— 批 7 的 24 条锚偏移就是这么来的）。**本批的落地表 = `### 表 5`（D-1…D-23）** |
| **P-37** | 🔴 **`--dist` 会开启懒侧判定 ⇒ 陈旧产物可假绿**（代码实测：`JUDGE_LAZY = !NO_LAZY && (!NO_BUILD \|\| has("--dist"))`，`check-bundle-budget.mjs:71`） | 用 `--no-build --dist <目录>` 跑门禁（文件头**只**警告了裸 `--no-build`） | 🔴 **一切懒侧读数必须同时登记 `app/dist` 的 mtime 与源码 sha**；**mtime 早于源码 ⇒ 读数作废**。**本批：T13 的 V1、T17 的 V2、T22 的 V3 都用它** |
| **P-38** | 🔴 **逐族上限的陈旧度零可见性**：`--json` 的 `lazy` 栏**只有 `count` / `chunks` / `totalBytes`** ⇒ **18 / 38 族实测超各自上限（Δ 合计 +203 B）在门禁输出里完全看不见**（因为闸判的是「上限 + 64 B 容差」） | 只读门禁的 ✅/❌，不读逐族明细 | 逐族超限必须**自算**（`chunks × lazyBudget.families` 的前缀匹配）并**登记**（**T14**）；🔴 **不得**把「闸绿」读成「逐族都在上限内」 |
| **P-39** | 🔴 **`shift-` 是零 chunk 的死族，却仍占 212 B 上限** ⇒ **Σ 逐族上限（638,029）比总量上限（637,501）高 528 B**，其中 212 B 是**死预算** | 把 Σ 逐族上限当作「还有空间」 | 🔴 **不得**把 Σ 逐族上限当可用余量（**除 64 B 容差外零余量**）；清理死族会**降低** Σ（符合「只许降」），但**若该族 chunk 复现 ⇒ 它会变成未归族而被闸抓到**（**T14** 的登记） |
| **P-40** | 🔴 **`validate-all.mjs` 化石 = 假执行者**：它让批 7 把「`validate-all.mjs` 的 steps 清单」列为懒侧守卫的消费点之一，而该脚本**自身跑不起来**（`client/` 5 步 + `server/*` 全不存在）；**且 `session-route.mjs` 有一条路由指向它** ⇒ 「门禁已有执行者」的**错觉** | 用「某清单里提到了它」当「它有执行者」的证据 | 🔴 **执行者必须实测**（运行一次、看 exit code）；**「被引用」≠「被执行」**。**本批 T18 处置它、T17 补真执行者** |

### D · 常设消歧与措辞纪律（收口前逐条复查）

1. 🔴 **「批 8」重载消歧**（承 §C9.0 的同族纪律）：`docs/archive/**` 里的「批 8」大量指 **v0.20.13 的历史批次**（与本条前端重设计的批 8 **同名不同物**）⇒ **每次引用 grep 结论前必须先判定它属哪条批次**。
2. 🔴 **`docs/tech-debt/` 不是本批的产物** ⇒ **不得**声称「本文档由本批创建」；**不得**引用其正文；**不得**建议其去向（U3）。
3. 🔴 **「0 命中」必须点名仪器 + 双侧自证 + 先剥注释 + 声明域是否为入库域**（R8.7 + P-34）；**阴性对照必须排除探针自身与其引用者**（本批用**现造随机串**）。
4. 🔴 **绝不写「全仓 `NoteEvidenceTrack*` = 0 命中」**（**自我指涉假命题**：该行自身含该符号）⇒ 正确表述 = 「**`app/src/**`（生产 + 测试）= 0**」。
5. 🔴 **「落了 seam」≠「已交付」**（批 6 纪律）；本批同理：**「仪器入库」≠「观感已验收」** · **「读了扩散矩阵」≠「观感已统一」** · **「夹具出图」≠「展示面观感达标」**。
6. 🔴 **「D 组的六条展示面是设计决定而非裁决」** ⇒ T15/T21/T22 **不得**把它写成「按规格实现」。
7. 🔴 **`upstream` 的读数不得直接当判据输入**：凡引用侦察 / 控制方 / 历史台账的数字，**必须**写「**引自 §C/报告，未独立复核**」或**当场复核**（承 §C36.2）。

---
## 诚实边界

> **口径**（承批 7 §C6.4 + 控制方 §3.6）：🔴 **严格区分两类** —— **「仪器不可达」**（本环境物理上测不了 ⇒ **只能登记**，**不许**编造弱判据）与 **「本批未做」**（做得了但本批不做 ⇒ **逐条带去向批次**）。

### 一、仪器不可达（**本批未测、且本环境测不了**；每条的「可能的将来仪器」也一并给出）

| # | 项 | 为什么测不了（**本计划者的实测依据**） | 本批的替代判据（**代理，不是等价**） |
|---|---|---|---|
| 1 | **真机 / WebView2 冒烟** | 用户裁决**沿用跳过**（U5） | **无代理**；**只登记**。⇒ 本批一切「端到端」**止于 jsdom / Rust 单测 / headless Edge** |
| 2 | **观感「好不好看」/「设计是否充分」** | 观感是**人的判断**；机器只能给「差在哪」 | T12–T15 出**读数 + 图**供人判；🔴 **不得**把读数写成「已达标」 |
| 3 | **`var()` 的解算值（jsdom 侧）** | 实测：`getComputedStyle().getPropertyValue("--brand")` **回字面量** `"var(--brand)"`（不解析）⇒ T9 判不到「墨度真的变深」 | **文本级 + 属性级**判据（T9 的 V2/V3）；**真解算值**归 T12–T15 的 CDP 读数 |
| 4 | **任何几何 / 排版（jsdom 侧）** | 实测：`getBoundingClientRect` / `offset*` / `client*` / `scroll*` **全 0**；`elementFromPoint` / `Range.*Rects` **不存在** | 几何类一律走 **CDP**（T12 起）；jsdom 里只判**结构 / 属性 / 类名** |
| 5 | **真实帧率 / 布局抖动** | jsdom 无 paint / 无合成器；`rAF` 实测 ≈ **39 fps** | 无代理（批 6 的「属性集合 ⊆ transform 族」**不适用**于本批 —— 本批不加动效）；**只登记** |
| 6 | **`Flip` 真实写入 `width`/`height`** | jsdom 无布局引擎 ⇒ `bounds` 全 0、位移增量恒 `translate3d(0px,0px,0px)` | 规格 `:927` 的弱判据（结构契约 + 已注册 + timeline + 属性集合）；**只登记** |
| 7 | **暗档 `data-theme` 实际生效** | `[data-theme="dark"]` 今天**只有定义、无写入方**（`motion.md` 逐字） | **只登记**（T16 的登记片） |
| 8 | **三档「看起来不一样」** | jsdom 无排版、几何无差异 | 只判**档位映射 + DOM 属性 + 源序 + 时长参数**；**只登记** |
| 9 | **音频对齐的 ±200ms 块粒度 / `aligned` 的 D3–D6 量级** | 真机 / 音频面不可达；规格 `:969①` 自陈「量级未实测、漂移分布今天不存在」 | **只登记**；🔴 **不得**声称毫秒级定位（`NoteMarkdown` 与 `utils/html.ts` 的边界注释**逐字保留**） |
| 10 | **跨窗口档位 / 相位同步** | 多窗口各有独立 webview（`shellPhase.ts:10-11` 逐字）；真机不可达 | **只登记**（U5 的 7 条真机类之一） |
| 11 | **`aria` / 键盘可达性的「实际体验」** | jsdom 无焦点环 / 无屏幕阅读器 | 只判 **DOM 属性与可聚焦性**；**只登记** |
| 12 | **中文输入法的回车提交** | jsdom 无 IME | 无代理；**只登记** |
| 13 | **惰性挂载的「运行时内存效果」** | jsdom 无真实内存压力 | 只判**挂载 / 卸载的 DOM 在场性**；**只登记** |
| 14 | **`Modal` 退场手感** | 时长 / 缓动的主观感受**不可判** | 只判时长参数 + 属性集合；**只登记** |
| 15 | **headless 滚动条占位** | 实测 **0** ⇒ 依赖滚动条宽度的观感读数**不可用** | 姊妹件 `scrollbar-cdp.mjs`（**4,688 B / 106 行**）可作将来收编对象（**本批不收**） |
| 16 | **WebView2 的字体回退与窗口装饰** | 仪器跑的是 **headless Edge（Chromium 内核）**，**不是** WebView2 | **只登记**（这是仪器头注里的第一条盲区） |
| 17 | **R5 / R6（真 WebView2 像素）** | 需**改码 + 构建**（触 §10）⇒ 本批禁 | 侦察 A 已给证据链（`CapturePreview` / 仓内 WGC）；**本批只登记** |
| 18 | **`--dump-dom`** | 实测 stdout **0 字节**（Edge 是 GUI 子系统程序） | 读数只走 **CDP** 或「画进页面再截图」 |
| 19 | **`node_modules` 完整性 / 依赖图** | 本批零依赖改动 | 只登记「`npm ci` 可复原」（P-20） |
| 20 | **渲染观感（`v0.22` / 规格的 Markdown）** | 无渲染器 | `docs-check` 只判**链接 / 文件名 / 索引** ⇒ **内容正确性靠人工评审** |

### 二、本批未做（**做得了，本批不做**；逐条带去向）

| # | 项 | 为什么本批不做（**依据**） | 去向 |
|---|---|---|---|
| 1 | **音频两条**：① `AudioStoragePanel` 假开关 → **真配置通道** ② **删会话连音频** | 用户裁决 **U1 = a（都修）** ⇒ **已排进 T27 / T28** | 🔴 **已排期**（见 `## 已裁决项 · U1`）；遗留边界：机器代替品 + 临时目录级单测 + 「部分删除」是允许终态 |
| 2 | **旧 provider 凭据槽 `"default"`** 的**代码路径**移除 | 用户裁决 **U2 = c** ⇒ **已排进 T25** | 🔴 **已排期**（见 `## 已裁决项 · U2`）；🔴 **只移除路径，不抹数据**；边界：「仅有 `default` 槽的真机用户需重填」**测不了** |
| 3 | **`docs/tech-debt/` 的归档** | 用户裁决 **U3 = a** ⇒ **已排进 T26**（**6 步 SOP**） | 🔴 **已排期**（见 `## 已裁决项 · U3`）；🔴 **本计划中一切「`git status` 恒为一行」的表述，T26 之后按「应为空」读** |
| 4 | **观感仪器的自动化接线**（husky / CI） | 用户裁决 **U4 = d** ⇒ **只做「入库 + 按需入口 + 写死触发条件」（T12 + T24）**；🔴 **b/c 未选** | 🔴 **不做**：husky 接线与 CI 接线**用户未选** ⇒ 若将来要 ⇒ 新批次（成本 = 真构建 + 串行 + CI 环境 WebView2） |
| 5 | **真机 pass 整组（7 条）** | 用户裁决 **U5 沿用「跳过」**（控制方按建议默认） | 🔴 **不排期**；7 条**继续登记、不假装完成**；T22 的验收表述**逐字写「未覆盖 IPC 壳 / WebView2」** |
| 6 | **两处页内 seek 未接**（`AiRefineCard` / `NoteAiDialog`） | §C49.3 判为**另一条线**（工作台/对话框**内部**跳转，与主链不同源）；本计划者实测两文件对 `ts-ms\|seek\|onSeek\|data-ts` 的命中 **各 0** | **批 9**（§10 面若有改动则需点名） |
| 7 | **trim 不一致**（Rust `db_colors.rs:61-72` 的 `.map(str::trim)` vs 前端 `noteHelpers.ts:8-15` / `useNotesListData.ts:123-127` **均不 trim**） | 改前端解析会**动读端语义** ⇒ 需单独授权 + 回归网 | **批 9**（**现网无影响**：唯一写端已 trim —— **引用读数**） |
| 8 | **5 个粘滞字段的 `{value,key}` 形态改造** | 会让 `CommandPalette.kb.test.tsx` 的正则失配（**§C9.9 只授权「只增」**）；收益边际（批 5 C6 已修「陈旧值复触发」） | **批 9 或用户另裁** |
| 9 | **H7 的其余 3 项**（`docs/Foresight/ux-market-convention-audit.md:109` 的 4 子句 − T20 已做的 1） | 台账写「其余 5 项」**与原文不符**（实测**恰 4 子句**）⇒ **条数须先改正**；范围超出 `get_decision` 详情面 | **批 9**（**先改正条数**；🔴 **不得**当成整条审计的清理许可） |
| 10 | **Foresight 的其余 P2/P3**（会话计时 G4 · 体系 H3/H4/H10–H13 · AI F4–F9 · 反馈 I） | 域太大 ⇒ **需先按域裁剪** | **批 9+**（需控制方裁「承接哪几个域」） |
| 11 | **安装包体积 / KaTeX 59 个字体（1,072.95 kB；仅留 `.woff2` 可省 816.78 kB）** | 要改**第三方 CSS 的 `src:` 列表**（构建后处理，本批无此工具链）；且**对 200 kB 的 JS 预算作用面为 0** | **批 9+**（需产品裁决预算与做法） |
| 12 | **`.gitignore` 的 `build/` 未锚定** | 与本批三条主线无因果；改它需一次全树核查（`app/src/build/**` 的取反已在） | **批 9 治理** |
| 13 | **构建日志 `Circular chunk` 无门禁看管** | 需在真实构建后加一条日志断言（引入构建依赖） | **批 9 治理** |
| 14 | **`line-limits` 的 `--staged` 模式** | 属门禁机制改动（批次 3 起就有依据，batch 7 又 +2 次事故）⇒ 需控制方授权 | **批 9 治理**（本批非目标 10 的同族） |
| 15 | **`scripts/**/*.mjs` 与 `app/vite.config.ts` 不在 `line-limits` 扫描域**（E5） | 🔴 **扩域会立刻红**（三个恰 300 的脚本）⇒ 是**一条独立的门禁政策变更**，控制方未裁；且本批**不新增门禁成员** | **批 9**（**先拆后扩**：T1 已拆 `line-limits`，另两个仍需先拆） |
| 16 | **`@types/katex` 的归类**（在 `dependencies`；是 `rehype-katex@7.0.1` 的**硬传递依赖** ⇒ 删了它**仍会被装**） | 「挪到 `devDependencies`」是**语义 no-op** ⇒ **判为 0 单元 + 关账措辞** | **关账**（**不改 `package.json`** —— 本批非目标级别的克制；T3 的文档面不再重复登记） |
| 17 | **`position:"fixed"` 的「潜在陷阱」措辞** | **机理被否证**：判据件 `dialogMigration.e.test.ts:133` 的 `strip()` **先剥注释** ⇒ 头注里的字面量**进不了 `CROSS_LINE_34`** | **本批关账**（措辞勘误，见 `## 陷阱 D`；**不排实施单元**） |
| 18 | **`flushSave` 的返回类型未升级为 `Promise<boolean>`**（E7）与 **`RichEditorView` 内的 Ctrl+E / 完成按钮不阻断**（E8） | 两条是**同一因果链**（不升级返回类型 ⇒ 阻断做不到）；改 `NoteEditHandle` 是**接口契约变更** | **批 9**（**一个单元**：接口卫生；🔴 **前置 = E7**） |
| 19 | **「重挂载恢复 `scrollTop`」的真实性**（E9） | jsdom 的 `scrollingElement` **不滚动**（批 5 T17 已留探针证明探针本身有效） | **只登记**（需真机） |
| 20 | **`ClassroomPage` 零自动化覆盖**（E11） | 需真机 / 像素面 | **批 9**（或随真机 pass 组） |
| 21 | **`docs/product/theme.md` 与 `ui-ux-system.md` 的「四层动效 / 三档强度 / 断点与窗口」回写** | 规格 `:1008` 逐字留批 8，但**本批只回写「审校模式」那一节**（T11 的 §10 面动作） | **批 9**（**剩余部分**；🔴 **不得**声称「§14 的四行已全部回写」） |
| 22 | **`ADR-034` 的两条 §登记**（会话详情头改粘性 · 笔记工具栏三层合并为单行） | 「真实粘性」前置 = **真机**；「三层合并」要动**三个无测试面文件** | **批 9**（真机 pass 组 / 治理收口） |
| 23 | **`ADR-019` 缺号** | `docs/adr/README.md:47` 逐字「**不补、不复用，只登记**」 | **只登记**（**零动作**） |
| 24 | **漂移红集（负载敏感 flake）的成员表与判定纪律入库** | 需**冷 / 热两次全量 vitest** + 成员会随运行漂移 ⇒ 本批只在 `testing.md` 补**纪律三小段**（T4） | **批 9**（成员表的机器面） |
| 25 | **`Text` 字号越界 551 处 / 123 文件的**迁移** | 批 4 起只冻结不迁移；本批只保证「新代码不新增」 | **批 9+**（需产品裁决值分布） |
| 26 | **`markdownLine.ts` 的 6 个原始 hex** 的**改值** | 改值 = **观感变化**（像素面 + 需人的目标值） | **批 9+**（T16 只登记） |
| 27 | **`AiConversationDock` 的方向性投影**迁移 | 换 token 会丢「从右边滑出来」的暗示 = **观感变化** | **批 9+**（**T16 已认领** ⇒ **不再掉地**，但**未解决**） |
| 28 | **圆角 `26 / 5 / 4` 三档入棘轮** | 需先定「哪几档算越界」；`surfaceResidual.ts:31` 逐字承认按映射表就地处理 | **批 9+**（T16 只登记） |
| 29 | **`30 个 `EOL` 混用普查**（CRLF vs LF 混用） | 本批只做「末尾 `0x0A` 存在性」（T2）；混用规则**未普查** | **批 9 治理** |
| 30 | **`Foresight` 的 `H7` 之外的历史欠账**（`docs/archive/**` 里的 v0.20.13「批 8」同名不同物） | 同名不同物 ⇒ 需**逐条判定批次归属** | **批 9+**（引用前必须判定批次） |

> 🔴 **未做项的读法**：上表**不是**「批 8 失败」，而是**范围纪律**（控制方 §1 明确「批 8 规模 ≈ 19–23 个工程单元」，本计划用 **23 个任务**覆盖三条主线 + 地基 + 收口；**表二的 30 条**是**明确排除**的）。

### 三、措辞纪律（收口前逐条复查）

1. 🔴 **不得**写「批 8 已交付」除非 T22 的八闸与三条验收**全部**有读数 —— **8a–8d 的段收口都不得这样写**。
2. 🔴 **「带证据三轨已实现」** 只有在 ① 模型层判据全绿 ② 视图注册第三项 ③ 容器注入可达 ④ **精修后走失配分支** 四条**全为真**时才可说；**不得**用「模型层已交付」代表整条能力。
3. 🔴 **「审校模式已实现」** 的判据是**文本级 + 属性级 + 顺序级**，**判不到解算后的对比度** ⇒ **不得**写「已升到 ≥4.5:1」；真解算值归观感读数。
4. 🔴 **「观感已验收」** 四个字**本批一律不得出现** —— 本批只给「**读数 + 归属**」；「设计充分性」需人判。
5. 🔴 **「全仓 `NoteEvidenceTrack*` = 0 命中」** 是**假命题**（自我指涉）⇒ 一律写「**`app/src/**`（生产 + 测试）= 0**」。
6. 🔴 **「懒侧达标」** 必须带 `judged = true` + **真构建** + `app/dist` mtime；裸 `--no-build` 的读数是「**未判**」。
7. 🔴 **「CI 已挂载门禁」** 只能写「**step 已加、本地等价演练通过**」—— **CI 面未实测**（本批禁止 push）。
8. 🔴 **「`validate-all.mjs` 已处置」** = 「**删了 + 路由改了**」，**不是**「已有统一入口」。
9. 🔴 **「`subject ≤50` 已收紧」** = 「**钩子会拦**」，**不是**「历史提交已合规」。
10. 🔴 **「`(file,tier)` 机制已修」** = 「**合法路径已开**」，**不是**「legacy 残值已迁」（两处残值**仍在**）。
11. 🔴 **引用任何侦察 / 控制方 / 历史台账的数字** ⇒ 必须写「**引自 §C/报告，未独立复核**」或当场复核。

---

## 收口回写八节（T22 的交付形态；照批 7 母本）

> **落地位置**：`docs/versions/v0.22.md` 的**批 8 节**（**七段结构**，T21 的 Step 1）+ 批次报告 `task-22-report.md` / `closing-review.md`（**gitignored ⇒ 永不 `git add -f`**）。**下面八节是收口评审件的骨架**。

1. **三条验收的判据与读数**（**主线一**：带证据三轨 + 审校模式各条判据的绿；**主线二**：仪器自检 + 14 条欠账逐条的读数或归属；**主线三**：CI 挂载 / 化石处置 / `(file,tier)` / `subject ≤50` 四条）—— 逐条给**命令 + 读数 + 提交 sha**。
2. **八门禁终态表**（T22 的 8 行，逐行给命令 / exit / 逐字读数）+ **首屏 + 懒侧两个独立读数**（三件套：**原始 / Δ（相对 `### 表 1`）/ 机理**）+ `app/dist` **mtime** + 冻结提交 sha + **`judged` 字段**（懒侧必须 `true`）。
3. **逐任务提交轨迹**（T1–T23：任务号 / 提交 sha / subject / 该提交的门禁读数 / 备注「哪一行是在哪次提交落库的」）—— ⚠️ **共享文件**（规格 · `v0.22` · `testing.md` · `performance.md` · `pr-check.yml` · `commitlint.config.js`）的改动归属必须用 `git log -p -- <file>` **核对后**再写。
4. **控制方裁决的实际结果**（§0 用户前提 · §1 范围 · §2 A1–A5/B1–B2/V1–V4/G1–G6 · §3 纪律 1–8 · §4 表五行 **逐条**：照做 / 追认后偏离 / 未触发的条件授权 / 新增偏离）—— **不得**只写「全部照做」。🔴 **必须单列**：§4 表的**五处文档更正的实际落点**（T3）+ **G1 的施工序是否被遵守**（T1 → T2）+ **G3 的处置选项与实际代价**（T18 取 (a)）+ **G6 的「不入八闸」是否被遵守**（T17）。
5. **诚实代价**（本批**真实付出**的代价）：`line-limits` 拆件 + 10 个文件的字节级归一 · 三件贴边件拆件（**测试夹具进棘轮域**）· 两条能力的**实现面**（模型 + 视图 + 容器 + 模式位 + CSS + 入口）· 观感仪器的**入库与其盲区** · **`validate-all.mjs` 的删除**（丢掉一个从未能跑的入口）· `pr-check.yml` 的 **+2 step**（CI 分钟成本）· **`commitlint` 收紧后对长 subject 的真牙** · **U1–U5 五条阻塞**导致的三条主线**无法完全收口**。
6. **未验证（诚实单列）** —— **逐条**复制 `## 诚实边界` 的第一类（**20 条**），**不得**合并同类项、**不得**删减。
7. **follow-ups（逐条具名归属）** —— 每条给「事项 / 归属批次 / 触发条件 / 接手所需的读数」；**至少**覆盖：🔴 **U1–U4 的落地单元（T24–T28）的遗留边界**（各自的接手指令见 `## 已裁决项`）· **U5 的 7 条真机类** · 两处页内 seek · trim 不一致 · 5 个粘滞字段 · H7 其余 **3** 项（**条数须先改正**；🔴 **原文路径已变为 `docs/archive/<执行日>/review-2026-09-11.md`**）· Foresight 其余 P2/P3 · 安装包体积 · `.gitignore` 的 `build/` 锚定 · `Circular chunk` 日志断言 · `--staged` 模式 · **扫描域扩张（E5）** · `flushSave` 契约链（E7/E8）· `scrollTop` 重挂载 · `ClassroomPage` 覆盖 · **`ui-ux-system.md` / `theme.md` 的剩余回写** · `ADR-034` 的两条 §登记 · `ADR-019` 缺号 · 漂移红集成员表 · `Text` 字号迁移 · `markdownLine` 的 6 hex · `AiConversationDock` 迁移 · 圆角三档 · EOL 混用普查 · **观感接线的 husky/CI 形态（U4-b/c，用户未选）**。
8. **与计划的偏差（本节自陈）** —— 逐条给「计划原文 / 实际做法 / 为什么 / 谁批的（裁决号或 STOP 记录）/ 是否已回写文档」。🔴 **编制期已产生的偏差必须先留痕**：
   ① **控制方 §4 的 E2 锚用的是漂移前编号**（`:545` = 实测 `:547`）⇒ 本计划**按实测锚执行**（`### 表 5` 的 D-3/D-10）；
   ② **控制方 §4 第 1 条的「规格 `:540`」与 §7.4 的其余锚不同源**（`:540` **未漂**，`:544/:545` **漂了 +2**）⇒ 本计划**逐条重测**；
   ③ **G1 的「末尾换行盲区」落点**：控制方要求「先拆 `line-limits.mjs`」⇒ 本计划把判据**并进拆后的 `line-limits.mjs` 的 `--full`**（**执行者天然存在**），**不新建 `check-eol.mjs`**（侦察 D 曾建议新建 —— **两条路线都成立，本计划取前者**，理由见 T2）；
   ④ **G3 的三选一**：本计划取 **(a) 删 + 改路由**（代价表见 T18），**不取** (b) 重写为串行外壳（会造成**第三个真源**）；
   ⑤ **T9 的 CSS 生效机制**：控制方要求「纯 CSS 一层」⇒ 本计划用**变量重绑 + 特异性 (0,1,1) > (0,1,0)**，并把 `main.tsx` 的 import 顺序作为**顺序纪律判据**（**不是**唯一生效条件 —— 诚实边界见 T9）；
   ⑥ **T12 的仪器接线**：因 **U4 未裁**，本计划只做「入库 + 参数化 + 卫生」⇒ **`package.json` / `.github/**` 零改动**；
   ⑦ **T14 的懒侧三条登记**：控制方 §2 G5 要求「登记」，本计划**只登记不改门禁**（改门禁会动**恰 300** 的 `check-bundle-budget.mjs`）；
   ⑧ **T8 的 `<Surface>` 取舍**：本计划**首选 token 直写**（零棘轮动作），若实施者选 `<Surface>` ⇒ **必须同提交走 §C9.5 三步**；
   ⑨ 🔴 **批 7 的 T22 收口件「不在盘上」** 这条（侦察 A 的 STOP(a)）**已被控制方 §A.6 驳回**（时序假警报），本计划者实测 `task-22-report.md` **现已落盘（378 行）** ⇒ **不作为批 8 输入**；
   ⑩ **计划规模**：批 7 的计划是 **2,612 行 / 22 任务**；本计划按控制方要求拆成 **5 段 / 23 任务**，**每段 3–6 个任务**（避免批 7 的「74 个提交 + 18 例转述错误」的规模问题）。

---

## E8 · 机器期望的系统扫描（2026-09-13 · 计划勘误与全量复核）

> **立此节的依据**：控制方 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/controller-rulings.md` **§5 / §10**。🔴 **E8-1 / E8-3 / E8-4 是同一类** —— **计划卡里写下的「机器期望」从未在计划期真跑过**（分别是「期望红点」「期望行号锚」「期望 diff 形态」，**三条都被实施单元用真跑推翻**），与批 7 `### 表 6b` **E-25** 逐字同源（「**锚点由变异体裁定，不由推理裁定**」）。
> **执行单元** = E8（`docs/**` 唯一写者）· **时点** = 2026-09-13 · **采集树** = HEAD `42d53366`（T1 / T2 / T3 / T4 已落地）· **域** = `git ls-files`（**1,616 文件**；P-34）。
> **全文证据** = `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/task-e8-report.md`（**表 A / 表 B 完整版**）· **探针** = 同目录 `tmp/e8/probe*.mjs`（11 支，**只读**）与同名 `.txt`（落盘读数）。
> 🔴 **本节的数字全部由探针读出**；凡「引用」而非自测者，逐条标注来源。

### E8.0 · 扫描模式与域（**完备性自证**）

**抽取的五类「机器期望」**（正则 + 逐卡通读双路）：**(1) 期望红点**（`⇒ 红` / `期望：…红` / `M<n> 后期望`）· **(2) 期望行号锚**（`文件:行` 形态）· **(3) 期望 diff / numstat 形态**（`N insertions(+), M deletions(-)`）· **(4) 期望读数**（`应为 N` / `= N 行` / `exit 1` / `扫描 N / 检查 M` / `exit 0`）· **(5) 期望集合关系**（`恰好 N 个` / `0 命中` / `与被删 / 被改 = 0` / `Σ` 相等）。

**判定「计划期是否真跑过」的规则**（本节的判据）：一条断言若**对盘上既有物**（既有仪器 / 既有测试 / 既有文件 / git 行为 / 既有常量）作出**可当场测量的事实主张**，则必须有来源（计划里标明「实跑 / 实测 / 计划者实测」+ 仪器名 ⇒ 视为**已跑**；**只写结论无来源 ⇒ 视为未跑**）；若断言的对象是**本任务将要新建的代码 / 判据**（如 T6+ 的 M 列对新件的变异体），它是**判据的设计要求**而非对盘上事实的主张 ⇒ 计入「牙口归该任务实施期自证」，**不列入「未跑」集合**，但其**点名的既有断言**必须当场核对存在性与逐字措辞（已做，见表 B 的 B-17）。

**命中数与处置分布**（**表 B 是本单元的核心交付**）：

| 类 | 抽取条数 | 已跑（有来源） | 未跑 ⇒ **当场跑了**（真值写入本计划） | 未跑 ⇒ 🔴 **改为「待测」** |
|---|---:|---:|---:|---:|
| (1) 期望红点 | 14 | 5 | 6 | **3**（B-23 / B-24 / B-25） |
| (2) 期望行号锚 | 96 | 74 | **22**（B-11 / B-12 / B-18 等） | 0 |
| (3) diff / numstat 形态 | 4 | 0 | **4**（E8-4 / B-4 / B-5） | 0 |
| (4) 期望读数 | 41 | 12 | **29**（含 E8-12 的 26 行 + B-6/B-7/B-9/B-13/B-16） | 0 |
| (5) 集合关系 | 12 | 4 | **8**（B-14 / B-15 / B-19 / B-20 / B-21 / B-22 等） | 0 |
| **合计** | **167** | **95** | **69** | **3** |

🔴 **完备性自证（「如何确认没漏」）**：① **抽取面** = 检索 `⇒ 红|期望|应为|= [0-9]+ 行|exit [01]|insertions|deletions|命中|恰好|Σ|:\d+` 全部形态，**逐条人工归档到上表五类**；② **反向抽查** = 对**全部 28 张卡**逐卡通读 `Verification` / `Steps` / `冻结值预算表` 三处（不依赖正则），**28/28 覆盖**；③ **双向对账** = 「卡片里出现的 `文件:行` 锚」与「探针真身行号」**双向**比对（96 条锚中 **22 条为计划期可跑但未跑**，已跑部分见 表 A）；④ **未覆盖声明**：🔴 **本单元不跑变异体导出树、不跑全量 vitest、不跑 cargo、不跑真实构建** ⇒ 凡依赖这三类仪器的期望**一律进「待测」列**（**3 条**），**不得**用推理代替（这正是三次翻车的成因）。

### E8.1 · E8-1 勘误：Task 1 的 M2 / M3「期望红点」写错（已就地更正）

**位置**：`### Task 1` 的 `Verification` 表 **V2 / V3 两格**（`:568` / `:569`）。
**错在哪**：两格的期望红点都写「`check-exemption-prose.mjs` 变红」—— 🔴 **该脚本不 import `scripts/line-limits.mjs`**：它在 `scripts/check-exemption-prose.mjs:26-27` 有 `countLines` 的**私有副本 `countLinesText`**（**P-41**）⇒ T1 实测它 **exit 0 全绿**，**期望不成立**。
**更正为**（T1 在导出树用变异体实跑，树 `547ffa1f`）：**M2 的真红点** = ① V2 的逐字节对拍断言「**✗ ⑤ 逐字节对拍：未声明差异 = 1 处**」（差异锚 = **`原 :51`**）② `--full` **exit 0 → 1**、`❌ line-limits（--full）：123 处问题`、首个问题行 `· (c) 超过 300 行但未登记：app/src/components/KnowledgeDetailPanel.tsx（301 行）→ 运行 --write 补登并填写豁免理由`；**M3 的真红点** = V3 的 import 探针 `typeof m.countLines`：`function` → **`undefined`**（7 名全丢），**探针 exit 1**。**证据** = `tmp/t1/log-mutants.txt`（M2a/M2b/M2c/M3a/M3b/M3c；其中 M2b/M3b 逐字记为「绿 ❌ 牙口未证」）。

### E8.2 · E8-2 勘误：Task 1 的 re-export 指令不完整（已就地更正）

**位置**：`### Task 1` 的 `Interfaces` 的 `Produces`（`:530`）与 `Step 3`（`:548`）。
**错在哪**：只点名 re-export **`countLines`** ⇒ 照做会**静默收窄另外 6 个导出名**（T1 实测 `scanTree` / `parseTable` / `FROZEN_OVER_LIMIT` / `HARD_LIMIT` / `SOFT_LIMIT` / `TABLE_PATH` 一度全部 `undefined`）。
**更正为**：**保持 `line-limits.mjs` 的模块导出面与拆件前逐字相同（7 名）**，并补记「🔴 `countLines` 的 re-export **全仓 0 importer**（`git ls-files` 域）⇒ 它是**潜在契约**，不是现存契约」。**E8 复测精确口径**：域 **1,616** 文件中含该字样者 **3 个** —— `scripts/check-exemption-prose.mjs:27` 与 `app/src/ui/primitives/dialogMigration.a1.test.ts:61` 是**各自的私有同名副本**（**P-41 的第三个实例**）、`app/src/views/session/SessionCardFlowView.tsx:41` 只是**注释引用** ⇒ **真 importer = 0**。

### E8.3 · E8-3 勘误：卡片锚偏 4 行（已就地更正）

**位置**：`### Task 3` 的 `V3`（`:712`）。**错在哪**：写「键数断言在 `textRatchet.test.ts:236`」。**T3 用变异体实跑**（常数 `123→122`）：**红在 `:239`（卡命中）与 `:232`**。**更正为 `:232`（并保留 `:239`）**。🔴 **附带更正**：`:236` 实为 `expect(Object.keys(FROZEN_FONT_OOB_BY_FILE).length).toBe(ANCHOR_FONT_OOB.files);` —— 它断的是 **vs `ANCHOR_FONT_OOB`**，**改常数不会让它红**。**E8 逐字复核**（探针 2）：`:232` = `expect(Object.keys(FROZEN_FONT_OOB_BY_FILE)).toHaveLength(FROZEN_FONT_OOB_FILES);` · `:239` = `expect(ANCHOR_FONT_OOB.files).toBe(FROZEN_FONT_OOB_FILES);` ✅。

### E8.4 · E8-4 勘误：`−` 列期望在数学上不可达（已就地更正）

**位置**：`### Task 2` 的 `Step 1`（`:613`）· `Step 4` 提交块（`:621` / `:623`）· `Verification` **V1**（`:635`）。
**错在哪**：写 `git diff --stat` = `10 files changed, 10 insertions(+), 0 deletions(-)`。🔴 **数学上不可达**：给「末尾无换行」的文件补末尾换行时 git **必须重写末行**（旧侧带 `\ No newline at end of file`）⇒ 该行**必然 1 增 1 删**；**任何正确实现都拿不到 `−0`**。
**更正为**：**`10 insertions(+), 10 deletions(-)`（每文件 `1 1`）**，并把 V1 的判据形态换成**实质判据**：🔴 **`git diff -w --numstat` 输出为空** + **`countLines()` 前后逐字相等** + **空白行 Δ = 0** + **逐文件字节证明**（`工作树(归一后) == git show HEAD:<p> + 恰好一个 0x0A`）。**证据** = `tmp/t2/diff-audit.json`（`gitDiffNumstat` 10×`1 1` · `gitDiffIgnoreWhitespaceNumstat` = `[]` · `blankLineDelta` 全 0 · `newEqualsOldPlusOneLf` 全 true）。🔴 **注意本卡自相矛盾处已消解**：`:598` 逐字写的是「该文件 **+1 行 / −1 行**形态」（**正确**），与 `:623` 的「0 deletions」冲突 ⇒ 以 `:598` 为准。

### E8.5 · 规则的一般化（**控制方 §10.1 逐字**）

> **「`−` 列 = 0」只适用于「纯追加型回写」**（在既有文本里**只增不改**，如文档就地加注）。
> 🔴 **不适用于两类**：**(a) 替换型**（代码散文改数字等）· **(b) EOL / 空白修正型**（T2 的末尾换行归一）。
> 这两类的正确判据 = **语义等价证明**：
> · **替换型** ⇒ **hunk 只含被替换的那几行** + **常数 / 判据零改动**
> · **EOL / 空白型** ⇒ 🔴 **`git diff -w --numstat` 输出为空** + **`countLines()` 前后逐字相等** + **空白行 Δ = 0** + 逐文件**字节级证明**（`工作树(归一后) == git show HEAD:<p> + 恰好一个 0x0A`）

🔴 **本条同时解释了 T3 的 `c5b5a8ec`（`−2`）为何合规**，以及**为何不能要求它改成 0**。**适用域登记**：`## Global Constraints 四` 的 **§3.4 行**（`:116`）已就地加注本规则并指向本节；**凡本计划后续批次再写「`−` 列 = 0」的判据，必须先判定该提交属**纯追加 / 替换 / EOL 修正**三型中的哪一型**。

### E8.6 · 表 A · 已核实（有来源）

> 口径：全部由 `tmp/e8/probe*.mjs` 读出（**只读**）；「来源」列给仪器 / 文件。**域**（凡「全仓」）一律 `git ls-files`（1,616）。

| # | 断言 / 值 | 来源 |
|---|---|---|
| A-1 | **八闸可跑件**：`line-limits --full` **exit 0 · 0/121/121** · `check-command-registry` **exit 0 · 311/311/0** · `docs-check` **exit 0 · 282/182** · `tsc` **exit 0** · `check-bundle-budget --no-build` **exit 0 · 首屏 105.95 kB · 懒侧 37 / 637,501 B（⏭ 未判）** · `bundle-eager-graph` **exit 0 · 111 / 7** · `check-exemption-prose` **exit 0** | 探针 6（串行复跑，2026-09-13） |
| A-2 | **冻结常数 11 族逐条命中**：mutedGray **63 / 43 键** · fontOob **551 / 123 键**（BY_FILE 键 **123** · Σ **551** · 锚 `ActionCenterPanel.tsx = 19`）· border **201 / 99 键** · radius **254 / 107 键** · shadow **24 / 24 键** · surfaceTag **47 / 14**（登记 **29 行** · Σ **47** · legacy **9 行**、和 **14** · 锚 `entries 29 / TaskConversationView 3`）· nativeBtn **392 / 114 键** · `BTN_STYLE_CONST_LINES/FILES` **56 / 44** · red **113** · 空态 **5** · z-index **3** · buttonMigration **99 / 35** · `CROSS_LINE_34` **34** / `NON_MIGRATED_14` **14** · `FROZEN_VIEW_KEYS.note = ["raw","cardflow"]` | 探针 4 / 8 / 9 / 10（直读基线件） |
| A-3 | **表 3 域统计**：`app/src/**/*.{ts,tsx}` **579 文件 · ≥300 = 35 · 295–299 = 21 · 恰 300 = 6 · >600 = 0**；恰 300 六件与 299 八件**名单逐字一致** | 探针 4（与 `p1-lines.txt:2` 逐字相同） |
| A-4 | **逐文件冻结键**：`App.tsx` radius **1** / nativeBtn **无键** · `shell/TopBar.tsx` nativeBtn **2**（满）· 三件贴边件（`NotesReadingColumn.tsx` / `.views.test.tsx` / `TopBar.test.tsx`）**六族全无键** · `noteMarkdownComponents.tsx` border **1** / radius **2** · `NoteMarkdown.tsx` radius **1** / border **无键** · `AiConversationDock.tsx` shadow **1** | 探针 8 |
| A-5 | **T2 的归一证据**：10 文件 `git diff --numstat` 各 **`1 1`** · `-w --numstat` = **空** · `blankLineDelta` 全 **0** · `newEqualsOldPlusOneLf` 全 **true** · `countLines` == HEAD 侧 countLines | `tmp/t2/diff-audit.json` |
| A-6 | **T1 的导出面与语义**：7 名类型串与拆件前**逐字相同** · `countLines(absPath)` 读盘语义自证 **true**（对本文件实测 **187**，T1 树） | `tmp/t1/log-v1v3v4-readings.txt` |
| A-7 | **P-41 私有副本**：`check-exemption-prose.mjs:26-27` 的 `countLinesText` + 私有 `countLines(abs)`；该脚本**不 import 主件** | 探针 2（逐行直读） |
| A-8 | **P-37 依据**：`scripts/check-bundle-budget.mjs:71` 逐字 `const JUDGE_LAZY = !NO_LAZY && (!NO_BUILD || has("--dist"));` | 探针 2 |
| A-9 | **G2 的 job 结构**：`pr-check.yml` **恰 6 个 job**；`line-limits` 在 **`:178`**、**无 `needs` / 无 `if`**；其余四 job 的 `needs:` 在 **:51 / :72 / :144 / :163**、`if:` 在 **:52 / :73 / :145 / :164**；两个 step 在 **:191-192 / :196-197** | 探针 5 / 探针 2 |
| A-10 | **T18 的引用面**：`validate-all` 在域 `scripts/** + package.json + .husky/** + .github/** + app/**` 内命中的入库文件 = **2**（`scripts/session-route.mjs:76` 的路由 + 待删脚本自身）⇒ 与「唯一入库引用 = session-route.mjs + 历史文档」一致 | 探针 7 |
| A-11 | **`docs-check` 的口径**：忽略清单 = `docs/.docscheckignore`（**模式表为空**）· `activeFiles` 按**路径段** `archive` 排除（**不是**子串：`templates/archive-template.md` 仍计活跃）· `INCLUDE_ARCHIVE` 在 **`:109`**（`:108-110` 为整支） | 探针 5 / 9 / 10 |
| A-12 | **T26 的结构算术分量**：工作树 `docs/**/*.md` **282** · 含 `archive` **段** **100** ⇒ 活跃 **182**（**与门禁自报逐字一致**）· `docs/tech-debt/` 现 **1 个文件** `review-2026-09-11.md`（**191,980 B**，未跟踪） | 探针 6 / 10 / 2 |
| A-13 | **T12 的期望解算值**：`tokens.css` 的 `--ed-radius-panel` 现文 = **`8px`** | 探针 7 |
| A-14 | **表 4 的三条直读**：`markdownLine.ts` 的 6 个原始 hex 在 **`:53`（`#0f766e`）`:54`（`#b45309` `#fffbeb` `#fde68a`）`:55`（`#4b5563`）`:56`（`#374151`）`:64` `:65` `:66` `:67`** · `batch7UiWiring.test.tsx:35-43` 的 `COMMANDS` **七条**逐字 + `:203-216` **正控(`list_decisions`) + 负控(`zzz_no_such_command_zzz`) + 断言** · `motionHarness.ts:50` 与批 7 计划 `:2560` 逐字 | 探针 2 / 7 |
| A-15 | **快捷键占用**：`Ctrl+Shift+R` 在 `app/src/**` 的 `.ts/.tsx` **0 命中**（T9 的 Step 0 复测仍须自己做） | 探针 2 |
| A-16 | **T20 的基线**：preset `header-max-length` = **`[2,"always",100]`**（须经 `.default.rules`）· `subject-max-length` **不在 preset** 但规则实现在盘 | 探针 7 |
| A-17 | **`AudioStoreConfig` 的面**：标识符 **出现 10 处 / 4 文件**（`audio_store.rs` 3 · `audio_store_tests.rs` 3 · `commands_audio.rs` 3 · `live_session.rs` 1）；**生产构造点 3 处**（`commands_audio.rs:71` / `:85` / `live_session.rs:261`，全走 `::default()`）；`default()` 在 `audio_store.rs:53-56` 硬写 **`enabled: true`** ⇒ 「假开关恒 true」**成立** | 探针 5 / 7 |
| A-18 | **T27 的落点行数**：`AudioStoragePanel.tsx` = **94 行**（余 206）· `commands_session.rs` = **447** · `commands_session_delete.rs` = **75** · `app/package-lock.json` = **5543** | 探针 7 |
| A-19 | **T19 的前置事实**：`surfaceTagRegistry.test.ts` 的 `LEGACY` 由 **`SURFACE_TAG_REGISTRY.filter(e => e.legacy === true)`** 派生（⇒ 键改 `(file,tier)` 时该派生式必须同步） | 探针 10 |
| A-20 | **T26 的归档前置**：`docs/archive/` 日期夹 **19 个**、最新 **`2026-09-09`**；无 `09-10 ~ 09-12` 夹 | 探针 2 |
| A-21 | **T5/T13/T15/T26 的卫生判据基线**：此刻 `git status --porcelain` = **仅 `?? docs/tech-debt/` 一行**（T2/T4 已提交，工作树干净；⚠️ T2 在飞期间曾为 13 个 ` M`） | 探针 6 |
| A-22 | **域口径**：`git ls-files` = **1,616**（1,614 `711ad639` → +本计划 = 1,615 → +T1 的 `scripts/lib/lineScan.mjs` = 1,616） | 探针 2 |
| A-23 | **负控串现况**：`zzz_no_such_symbol_zzz` 命中 **4** 文件（3 + **本计划自身**，自指涉）⇒ §C62.8 的「作废」结论**仍然成立且更强** | 探针 2 |
| A-24 | **`--reporter=json` 可用**（Vitest 4.1.11）：单文件跑 **exit 0**、产物落盘、`testResults.length = 1`、`numTotalTests = 7`、**`numTotalTestFiles` 字段不存在**；负控 `--reporter=basic` ⇒ **exit 1** + `Startup Error · Failed to load custom Reporter from basic` | 探针 11 |
| A-25 | **表 1 ⑦ / ⑧ 与 clippy**（vitest **229/2225** · cargo **2360/2354/6**）—— **引用**批 7 `task-22-report.md:65-68`（树 `c0bff722`）⇒ **保留**，卡内已写「8e 必须真跑」 | 引用（未独立复跑） |

### E8.7 · 表 B · 🔴 未跑 ⇒ 已处置（**本单元的核心交付**）

> **处置列**：**「当场跑了」= 本单元（或已落地的实施单元）真跑后把真值写进本计划**；**「待测」= 需导出树 / 全量 vitest / cargo / 真实构建 ⇒ 卡内标「待测 + 由哪个任务在实施期测」**。🔴 **全表无「推理出来的期望值」残留**。

| # | 断言（位置） | 原值 | 处置 | 依据 |
|---|---|---|---|---|
| B-1 | T1 **V2 / M2** 期望红点（`:568`） | 「`check-exemption-prose.mjs` 变红 ⇒ exit 1」 | **当场跑了**（T1 导出树变异体）⇒ 真值 = 对拍 `✗ ⑤ 逐字节对拍：未声明差异 = 1 处`（锚 `原 :51`）+ `--full` **exit 1** / `❌ line-limits（--full）：123 处问题` / 首行 `(c) … KnowledgeDetailPanel.tsx（301 行）` | `tmp/t1/log-mutants.txt` M2a/M2b/M2c |
| B-2 | T1 **V3 / M3** 期望红点（`:569`） | 「报模块导出缺失 ⇒ 非零退出」 | **当场跑了** ⇒ 真值 = import 探针 `typeof m.countLines` `function → undefined`（**7 名全丢**）、探针 **exit 1**；`--full` 仍 exit 0 | 同上 M3a/M3b/M3c |
| B-3 | T3 **V3 / M3** 行号锚（`:712`） | `textRatchet.test.ts:236` | **当场跑了**（T3 变异体）⇒ **`:232`**（保留 `:239`） | 控制方 §10 + 探针 2 逐字 |
| B-4 | T2 `:613` / `:621` / `:623` numstat 形态 | `1 insertion(+)` 且 `0 deletion` | **当场跑了**（T2 干跑 + 真跑）⇒ `10 insertions(+), 10 deletions(-)`、每文件 `1 1` | `tmp/t2/diff-audit.json` |
| B-5 | T2 **V1** 的判据形态（`:635`） | 「`−` 列 = 0 + 纯空白行删除 = 0」 | **当场跑了** ⇒ 换成 **§E8.5 的 EOL 型语义等价证明**（四条） | 控制方 §10.1 + `diff-audit.json` |
| B-6 | T20 **Step 0** 命令与期望（`:1718`） | `require('@commitlint/config-conventional').rules['header-max-length']` ⇒ `[2,'always',100]` | **当场跑了** ⇒ 🔴 该命令**抛 `TypeError`**（ESM 需 `.default`）；**真值 `[2,"always",100]`**，命令已更正；附测 `subject-max-length` 不在 preset | 探针 7 |
| B-7 | T20 **诚实边界③**（`:1744`） | 「历史上有 4 条 subject > 50，最长 56」 | **当场跑了** ⇒ 真值 **70 条（去前缀）/ 最长 94**（全史 1,357 条）；**近 400 条 = 0** ⇒ 与 V4 的引用读数一致（**V4 因此升级为已核实**） | 探针 8 |
| B-8 | T26 的 `docs-check` 预测（`:50` / `:1974` / `:1984` / `:2009` / `:2023` / `:2157`） | `282 / 181`（旧基线口径） | **当场跑了**（基线 + 段口径 + 结构算术）⇒ **修正 = 284 / 181**（基线 282 / 182）；**仍须 T26 实测** | 探针 6 / 10 |
| B-9 | T27 的 `AudioStoragePanel.tsx` 行数（`:2049` / `:2055`） | 「实测行数由实施者当场取」 | **当场跑了** ⇒ **94 行** | 探针 7 |
| B-10 | **全计划的 `docs-check` 计数**（**26 行 / 12 卡 + 4 处全局**） | `281 / 181` | **当场跑了** ⇒ **282 / 182**（逐条位置见 §E8.12） | 探针 6 |
| B-11 | 规格锚（表 5 D-1…D-11 + T3 / T6 / T11 / T21 卡内锚） | `:538` / `:540` / `:546` / `:547` / `:548` / `:554-557` / `:561-563` / `:565-570` / `:574` / `:575` / `:800` / `:903` | **当场跑了** ⇒ 真值见 **`### 表 5b`**（`design.md` **1035 → 1053 行**） | 探针 3 |
| B-12 | T9 的 `main.tsx :4`（`:1076`） | 「必须在 `:4` 的 token CSS 之后」 | **当场跑了** ⇒ token CSS 在 **`:5`**（`:4` 是注释行） | 探针 9 |
| B-13 | `proofread` 占用面（T9 Step 1 头注 / T11 Step 4） | 「实测 **46 处 / 11 文件**」 | **当场跑了** ⇒ 原值**无法复现**（**未标口径**）；真值二口径：全域（大小写敏感，`git ls-files`）= **181 处 / 31 文件**、`app/src/**` 的 `.ts/.tsx` = **13 处 / 3 文件**（`ProofreadPanel.tsx` / `ProofreadToggle.tsx` / `SessionDetailPanel.test.tsx`）⇒ **结论不变**（同名已被 LLM 校对占用，必须 `data-proofread-mode`） | 探针 3 |
| B-14 | §C62.8 的作废负控串 | 「已入库（命中 3 文件）」 | **当场跑了** ⇒ 现 **4 文件**（+**本计划自身**）⇒ **不得**复用该串（本批一律**现造随机串**） | 探针 2 |
| B-15 | E8-2 的「`countLines` 全仓 0 importer」 | 「1,615 文件逐行扫，代码文件命中 0」 | **当场跑了** ⇒ 精确口径：**真 importer 0**；含字样 **3 文件**（2 私有副本 + 1 注释）；域 **1,616** | 探针 3 |
| B-16 | 表 5 的域口径 | 「`git ls-files`（**1614** 文件，实测）」 | **当场跑了** ⇒ **1,616**（归因见 A-22） | 探针 2 |
| B-17 | 各卡 M 列**点名的既有具名断言**（T6 V5 · T7 V4 · T9 V4 · T11 V2 · T16 V1 · T19 V1/V2 · T22 V1） | 「红在具名断言」 | **当场跑了（存在性 + 逐字）** ⇒ 全部命中：`textRatchet.test.ts:231` 的 `冻结表的逐文件之和 ≠ 冻结总数（表被局部改动过）` · `surfaceTagRegistry.test.ts:101`（`Σ 登记值 … ≠ FROZEN_SURFACE_TAG_TOTAL`）与 `:110`（`legacy 登记值之和 … ≠ 14（T17-B 迁移面只许收紧，不许腾挪）`）· `nativeButton.ratchet.test.ts:199`（`全仓原生 <button> 已从基线 … 涨到 …`）· `tokens.drift.test.ts:25` · `surfaceRatchet.test.ts`（261 行，在盘） | 探针 7 |
| B-18 | 冻结键**逐文件**值（T7 / T8 / T9 / T11 / T16 的冻结值预算表） | 见 表 A-4 | **当场跑了** ⇒ **逐条命中**（**无一处需改**） | 探针 8 |
| B-19 | 表 2 的 11 族常数 | 见 表 A-2 | **当场跑了** ⇒ **逐条命中** | 探针 4 / 8 / 9 / 10 |
| B-20 | 表 3 的域统计与两份名单 | 579 / 35 / 21 / 6 / 0 | **当场跑了** ⇒ **逐字一致** | 探针 4 |
| B-21 | T12 **V5** 的 `--ed-radius-panel ⇒ 8px` | `8px` | **当场跑了** ⇒ `tokens.css` 现文 = `8px` | 探针 7 |
| B-22 | T27 的「10 处构造点 · `status.enabled` 恒 true」 | 10 处构造点 | **当场跑了** ⇒ 口径更正：**出现 10 处 / 4 文件**，其中**生产构造点 3 处**（全 `::default()`）+ 测试 2 处；`default()` 硬写 `enabled: true` ⇒ **实质结论成立** | 探针 5 / 7 |
| B-23 | T13 / T14 的仪器读数（7 档矩阵 · `Surface` 逐处 · **18/38 族 +203 B** · `shift-` 212 B） | 见卡 | 🔴 **待测 + 由 T12（仪器入库）→ T13 / T14 在实施期测**（**需真实产物 + 独占窗口**；卡内 Step 0 已有复跑要求）。**可当场跑的分量已跑**：`lazyChunkCountMax=37` · `lazyTotalGzipBytesMax=637,501` · **38 族** · **Σ 逐族上限 638,029**（差 **528**）· `shift-` = **212 B** ⇒ **逐条命中** | 探针 3 + `p6-matrix.txt:60-61` |
| B-24 | T19 **V3** 的「修法真的开了口」（旧机制下 `REG_DUP` 红） | 「必须真跑，不许推断」（卡内已写死） | 🔴 **待测 + 由 T19 在实施期测**（**需导出副本 + 改判据件**）；卡内既有要求**保留不动** | 卡内既有纪律（§C17.3） |
| B-25 | T2 **V4 / M4**（CRLF 反向守卫「必须绿的反向变异在 M4 下必须红」） | 见卡 | 🔴 **待测 + 由 T2 的判据维护者在导出副本里测**（T2 已落地，(f) 判据现文在 `scripts/line-limits.mjs:173-181`）；E8 可证部分：判据**判字节不判文本**（`:180` 逐字 `b[b.length - 1] !== 0x0a`）⇒ 机理上**不偏袒任一风格** | 探针 3 逐行 |
| B-26 | T5 **Step 1** 与全计划的 **`npx`**（`:809` / `:810` / `:888` … **共 16 处**） | 「`cd app; npx tsc --noEmit`」 | **当场跑了** ⇒ 🔴 **不是勘误**：PowerShell 直调 `npx tsc --noEmit` **exit 0**（10.9 s）、`npx --no -- commitlint --version` **exit 0**；**只有从 Node spawn 才失败**（`spawnSync('npx')` = **ENOENT**、`'npx.cmd'` = **EINVAL**、`{shell:true}` = exit 0）⇒ **不得**一律改成直调；口径已写进 `## Global Constraints 八.13` | 探针 11 |
| B-27 | `--reporter=json`（`:158` / `:810` / `:960`） | 「用 `--reporter=json --outputFile=…`」 | **当场跑了** ⇒ ✅ **可用**（exit 0、产物落盘、`testResults.length` 可读）；负控 `basic` ⇒ exit 1；**P-27 / P-31 仍适用**；结论已写进 `## Global Constraints 九.3` | 探针 11 |

### 表 5b · 锚漂移真值（2026-09-13 复测；`## E8` §E8.8）

> 🔴 **本计划全文的规格锚以本表为准**（`### 表 5` 的读数采集于 `711ad639`；T3 的三个提交后 `design.md` **1035 → 1053 行**）。**口径** = 逐行直读（探针 3）；**时点** = 2026-09-13 · HEAD `42d53366`。

| # | 计划原锚（表 5 / 卡内） | **当前真值** | 差 | 说明 |
|---|---|---|---|---|
| 5b-1 | §7.4 标题 `:538` | **`:540`** | +2 | `### 7.4 笔记「带证据三轨」—— 批 7 规格章` |
| 5b-2 | §7.4「出处与状态」行 `:540` | **`:542`** | +2 | 仍含自我指涉的「全仓 `NoteEvidenceTrack*` = 0 命中」原文（T3 已就地加注收窄） |
| 5b-3 | E1 行 `:546` | **`:553`** | +7 | §A 表 |
| 5b-4 | **E2 行 `:547`** | **`:554`** | **+7** | 🔴 **T3 的 E2 出处更正就落在此处** |
| 5b-5 | E3 行 `:548` | **`:555`** | +7 | |
| 5b-6 | §A 标题 | **`:549`** | — | |
| 5b-7 | §B「四类 fixture」`:554-557` | **`:562` 起** | +8 | |
| 5b-8 | §C「两态」`:561-563` | **`:571` 起** | +10 | |
| 5b-9 | §D `:565-570` | **`:577` 起**（`:586` = T3 的「不开 (b) / §D3」加注） | +12 | §D2/§D3 的**裁决加注落点 = `:586`**（T3 已落） |
| 5b-10 | §E `:574` / 诚实边界 `:575` | **`:590`** / **`:591`** | +16 | |
| 5b-11 | §4.3 标题 `:214` · **⑤ `:241`** | **`:214`** ✅ · **`:241`** ✅ | **0** | 🔴 **`§4.3` 段与 ⑤ 未漂**（T3 的加注落在 **`:246-247`**，在 ⑤ 之后） |
| 5b-12 | §10 批 8 行 `:800` | **`:818`** | **+18** | 🔴 **这是漂移最大的一处** |
| 5b-13 | §11-6 / `:903` / `:905-906` | **`:921` 区**（`§11-6` 文内引用在 `:807`） | +18 | T21 / T3 的加注在 §11-6 段 |
| 5b-14 | §13 `:978+` · §14 `:1000-1029` | **`:996`** · **`:1018`** | +18 | |
| 5b-15 | `AGENTS.md` §10 清单 `:112-118` | **`:110` 标题 · `:111-118` 清单** | 0 | （探针 2 逐字命中 `:112` = `tauri.conf.json`） |
| 5b-16 | `pr-check.yml` 的 `line-limits` job `:178` | **`:178`** ✅ | 0 | 两个 step `:191-192` / `:196-197` ✅ |
| 5b-17 | `textBaseline.ts:19` 写 `122` · `:174` 写 `120` | 🔴 **已被 T3 更正**：`:19` = `… → 576/122 → 551/123` · `:174` = `551/123 不变` | 状态变更 | 见 `### Task 3` 的 `Step 2` 的 E8-6 时点注 |
| 5b-18 | 规格引用 `v0.22.md:561` | **`:565`** | +4 | 「笔记「带证据三轨」→ 批 7（必须先写规格）」 |
| 5b-19 | 表 5 域口径 1614 | **1,616** | +2 | 见 A-22 |
| 5b-20 | `scripts/line-limits.mjs` = 300（拆前）· T1 交付 **187** | 🔴 **现 204**（T2 的 (f) 判据 +17 行已入库）· `scripts/lib/lineScan.mjs` = **122** | 状态变更 | T1 预算 ≤190 ✅ / ≤150 ✅ 仍成立 |

### E8.9 · 时点基线（T1–T4 落地后的现读数；**下游一律以此为准**）

| 项 | 计划原读数 | **现真值（2026-09-13 · `42d53366`）** | 归因 |
|---|---|---|---|
| `docs-check` | 281 / 181 | **282 / 182** | +本计划（+1/+1） |
| `git ls-files` | 1,614 | **1,616** | +本计划 +`scripts/lib/lineScan.mjs` |
| `scripts/line-limits.mjs` | 300 → T1 交付 187 | **204** | T2 的 `(f)` 判据已入库（`aa93655c`） |
| `docs/standards/testing.md` | 229 | **235** | T4 的 `### 第九部分` 已入库（`42d53366`） |
| 10 个归一文件 | 末尾无 `0x0A` | **全部已归一**（复测 0 个仍缺） | T2 的 `f1742399` |
| `textBaseline.ts` 散文 | `551/122` · `551/120` | **`551/123` · `551/123`** | T3 的 `c5b5a8ec` |
| `design.md` | 1,035 | **1,053** | T3 的三个文档提交 |
| `git status --porcelain` | 仅 `?? docs/tech-debt/` | **仍为这一行**（T2/T4 提交后窗口干净） | — |

### E8.10 · `npx` 的口径（**新增陷阱候选 P-42**）

🔴 **「Node 24 拒绝 `npx`」的适用域 = 从 Node 子进程 spawn，不是 shell 里敲**。三态实测（探针 11）：

| 形态 | 结果 |
|---|---|
| PowerShell 直调 `npx tsc --noEmit`（cwd = `app/`） | **exit 0**（10.9 s） |
| PowerShell 直调 `npx --no -- commitlint --version` | **exit 0**（`@commitlint/cli@19.8.0`） |
| Node `spawnSync('npx', …)` | **ENOENT** |
| Node `spawnSync('npx.cmd', …)` | **EINVAL**（**P4 复现**） |
| Node `spawnSync('npx.cmd', …, {shell:true})` | **exit 0**（11.16.0） |

⇒ 🔴 **本计划的 16 处 `npx` 一律不是勘误**（它们都是「给操作者粘贴进 PowerShell 的一行」）；🔴 **只有写进 `.mjs` / Node 脚本的调用**才必须用 `node node_modules/...` 直调形态。**已就地写进 `## Global Constraints 八.13`**。

### E8.11 · T26 的 `docs-check` 预测修正（**已就地更正**）

**原预测**（旧基线口径）：扫描 `281 → 282` · 检查 `181 → 181`。
**现基线**：**282 / 182**（实测，探针 6）。**结构算术**（分量全部实测，探针 10）：`files` = 282 **−1**（`docs/tech-debt/` 那份移走）**+3**（`docs/archive/<执行日>/` 下 README + tech-debt + 移入的审查报告）= **284**；`activeFiles` = 182 **−1**（移入 archive 的那份不再活跃）**+0**（新增两份都在 archive 内，按**路径段**排除）= **181**。
⇒ 🔴 **修正预测 = 扫描 284 / 检查 181**，**仍然必须由 T26 实测**（预测 ≠ 读数）。

### E8.12 · `281 / 181` 全量扫描（控制方追加任务）

**扫描形态**（正则全扫，探针见 report）：`281`、`181`、`281/181`、`281 / 181`、`扫描 281 个`。**命中总数 = 30 行**；其中 🔴 **26 行需更正、已全部就地更正为 `282 / 182`**（并在原处留 🔻 标记）；余 **4 行**（`:163` 时点注 · `:1974` / `:1984` / `:2023`）本就带时点说明，**只补口径、不改数**。

| 位置 | 卡片 / 章节 | 形态 |
|---|---|---|
| `:49` / `:50` | `Global Constraints 一`（U3 的形态节） | 扫描 281 / 检查 181 · 预测 281 → 282 / 181 → 181 |
| `:151` | `Global Constraints 六` 门禁基线表 ② | `扫描 281 个 Markdown 文件（检查 181 个…）` |
| `:163` | **时点注**（原文正确；已加**常设提醒**） | 281 / 181 |
| `:249` | `## 实测基线` 表 1 行 3 | `扫描 281 个 … （检查 181 个…）` |
| `:639` / `:665` / `:681` / `:711` | **Task 2 / Task 3**（V5 · 预算表 · Step 0 · V2） | `exit 0（281/181）` 等 |
| `:733` / `:747` / `:775` | **Task 4**（预算表 · Step 0 · V2） | `281 / 181` |
| `:805` | **Task 5 Step 1**（控制方点名的第三处） | `# exit 0 · 281/181` |
| `:888` | **Task 6 Step 0** | `# exit 0 · 281/181` |
| `:1214` / `:1256` | **Task 11**（预算表 · V6） | `281 / 181` |
| `:1284` / `:1340` | **Task 12**（预算表 · V4） | `281 / 181` |
| `:1424` | **Task 14 V4** | `**281 / 181**` |
| `:1517` | **Task 16 V6** | `exit 0 · 281/181` |
| `:1601` / `:1629` | **Task 18**（预算表 · V3） | `281 / 181` |
| `:1762` / `:1785` | **Task 21**（预算表 · V2） | `281 / 181` |
| `:1974` / `:1984` / `:2000` / `:2009` / `:2023` | **Task 26**（Files · 预算表 · Step 0 · Step 5 · V1） | 预测 282/181 等 |
| `:2157` | `## 已裁决项` **U3** 行 | `（预测 282/181，必须实测）` |

🔴 **归入「系统性」结论**：本缺陷与 **E8-1 / E8-3 / E8-4 同源** —— 🔴 **计划期没有把「计划文件自己入库」这个副作用算进去**（而 §六 的时点注**已经知道**这件事，却没有把它传导到 12 张卡的预算表）⇒ 这是**「知道规则但没机械化执行」**的形态，与「机器期望从未真跑过」是**同一根因的两个面**。

### E8.13 · 常设提醒（**立此为本批反面教材**）

1. 🔴 **凡引用 `docs-check` 的「扫描 / 检查」计数，必须注明时点**；且 🔴 **计划文件自身入库会使两个计数各 +1**。
2. 🔴 **凡写「机器期望」（期望红点 / 期望行号锚 / 期望 diff 形态 / 期望读数 / 期望集合关系），必须附「本期望的实测来源」**；无来源者**一律写「待测」**，并写明**由哪个任务在实施期测**。
3. 🔴 **锚点由变异体裁定，不由推理裁定**（§C17.3 / 批 7 `表 6b` E-25）。
4. 🔴 **引用既有仪器的行为前，先实测 import 关系**（**P-41**：同名私有副本会伪造因果链）。
5. 🔴 **写回写类判据前，先判定提交属「纯追加 / 替换 / EOL 修正」哪一型**（**§E8.5**）。

### E8.14 · 诚实边界（本单元）

1. 🔴 **本单元不跑**：变异体导出树 · 全量 vitest · cargo · 真实构建 ⇒ 依赖这四类仪器的期望**一律标「待测」**（**3 条**：B-23 / B-24 / B-25），**不得**由推理补值。
2. 🔴 **表 A / 表 B 的「已跑」有三种来源，必须分清**：① **E8 本次当场跑**（探针 1–11）② **已落地的实施单元跑的**（T1 / T2 / T3，来源为 `tmp/t1` / `tmp/t2`，其树为 `547ffa1f` / `T2 工作树`）③ **引用**（批 7 报告 / 侦察 A；**逐条标注**）。🔴 **②类读数的时点早于本单元**，其「现真值」栏已按 §E8.9 逐条更新。
3. 🔴 **本单元只改 `docs/**`**（本计划文件 + 报告）；**未改** `scripts/**` / `app/**` / `.github/**` / `app/src-tauri/**`（`scripts/line-limits.mjs:176` 引用「卡片 `:615`」⇒ 🔴 **为保住该跨引用，本单元对既有正文的全部改动都做了「同形替换」（原地不增删行）**；**行数 2319 → 2547**，**增量 228 行全部是本节的追加**，**`:615` 逐字未动**）。
4. 🔴 **26 行的状态代换是「直接更正期望值 + 就地留痕」**（不是「原文 + 加注」两行式）—— 因为**机器期望是计划工件、不是历史记录**（控制方 §10.2 的裁定）；每处都带 🔻 标记与依据指针。
5. ⚠️ **`npx` / `--reporter` 两条结论的域**：探针 11 跑在**本机（Windows / PowerShell 5.1 / Node 24.18 / Vitest 4.1.11）**；CI 的 `ubuntu-latest` 上 `npx` 是 shell 脚本、**结论可能不同** ⇒ **不得**把本节的 `npx` 结论搬到 CI 面。
6. ⚠️ **未复核项（如实登记）**：表 A-25（vitest 229/2225 与 cargo 2360/2354）**未独立复跑**（引用批 7）；`AGENTS.md` 的 `:112-118` 清单**只抽验了首行**。

## E8b · 针对性补扫（2026-09-13 · 只扫两类：**「集合为空」类事实主张** + **变异体格的「一次注入可达性」**）

> **立此节的依据**：控制方 `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/controller-rulings.md` **§14.2 / §14.3 / §14.4** —— 🔴 **E8 的「五类机器期望」系统扫描（28/28 卡通读 + 167 条抽取）漏了两类**：**(a)** 「本段/本任务**零 X 改动**」这类**关于范围的事实主张**（它**不是**「期望红点/锚/读数」的形态 ⇒ 落在五类之外）；**(b)** 变异体格的「**该期望在一次注入下是否可达**」（E8 只修了 Task 1 的 M2/M3，**没有逐卡检查可达性**）。
> **执行单元** = E8b（`docs/**` 写者；计划文件 + 报告）· **时点** = 2026-09-13 · **采集树** = HEAD `ea2d0762`（**8a 已关闭**，10 条提交；工作树 = 仅 `?? docs/tech-debt/`）· **域** = `git ls-files`（**1,616 文件，入库域**；P-34）。
> **全文证据** = `.superpowers/sdd/2026-09-13-frontend-redesign-batch8/task-e8b-report.md` · **探针** = 同目录 `tmp/e8b/probe*.mjs`（8 支，**只读**）与同名 `.json` 落盘读数。
> 🔴 **本节的数字全部由探针读出**；凡「引用」而非自测者逐条标注来源。🔴 **本节不含任何「推理出来的期望值」**。

### E8b.0 · 扫描模式与域（**完备性自证**）

| 类 | 抽取模式（正则，**双路 = 正则全扫 + 28 卡逐卡通读**） | 命中 | 逐条判定集 |
|---|---|---:|---:|
| **①** 「集合为空 / 零改动」类**事实主张** | `零 *X* 改动` · `本(任务\|段\|批)不(改\|碰\|触碰\|动\|新增\|引入\|涉及)` · `git log … -- <path> 为空` · `git diff … (零 hunk\|只含\|为空)` · `git status --porcelain 仍只有` · `集合相等\|Δ 0\|逐字未动` · `不改\|不新增文件` —— **10 形态**（`probe1`）⇒ 108 行；收紧为**可充当证据**的 **7 形态**（`probe4`）⇒ **69 行**（剔除落在 `## E8` 节内的 6 行 ⇒ **卡片正文 63 行**） | **63 行 / 30 条主张** | **30**（表 E8b.1） |
| **②** 变异体格「一次注入可达性」 | `Verification` 表内含 `**M<n>**` 的行（**逐卡逐格**，不靠正则判语义）⇒ `probe6` | **86 格 / 28 卡** | **86**（表 E8b.2） |

🔴 **完备性自证（「如何确认没漏」）**：① **双向对账** = 「正则抽出的 63 行」与「逐卡通读 `Verification` / `Steps` / `冻结值预算表` / `诚实边界` / `Files` 五处得到的主张」**双向比对**，正则多出者逐条剔除、逐卡通读多出者逐条补入；② **28/28 卡覆盖** = `### Task 1` – `### Task 28` **逐卡点名**（🔴 **精确口径**：**类② 的 E8b.3 表按卡给全 28 个任务号**；**类① 的 E8b.1 表覆盖 21 张有此类主张的卡**，其余 **7 张（T4/T6/T7/T11/T14/T19/T23）经逐卡通读确认无此类主张** —— 逐卡 0 命中对照表见下）；③ **跨引用反查** = 对「已在本计划别处被更正过的主张」（E8-1/E8-3/E8-4/E8-12）**逐条重测**，确认本次不再重复登记；④ 🔴 **未覆盖声明**：本单元**不跑**变异体导出树 / 全量 `vitest` / `cargo` / 真实构建 ⇒ 类② 的判定是**静态可达性**（**内部自洽 + 具名目标存在性 + 作用面归属**），**不是实跑结论**；⑤ 🔴 **域声明** = 一切「全仓 / 0 命中」扫描的域**一律 `git ls-files`（入库域，1,616）**，**禁止递归扫工作树**（`.superpowers/**` 的导出树副本实测 172,184 / 194,487 文件 ⇒ P-34）。

**逐卡 0 命中对照表（完备性自证的证据）**：

| 卡 | 类① 收紧网行数 | 类① 判定集条数 | 类② 格数 |
|---|---:|---:|---:|
| T1 | 7 | 2 | 3 |
| T2 | 4 | 3 | 3 |
| T3 | 2 | 1 | 2 |
| T4 | 1 | 0 🔴 | 2 |
| T5 | 4 | 2 | 2 |
| T6 | 0 | 0 🔴 | 6 |
| T7 | 3 | 0 🔴 | 3 |
| T8 | 1 | 1 | 4 |
| T9 | 1 | 1 | 6 |
| T10 | 3 | 1 | 5 |
| T11 | 0 | 0 🔴 | 4 |
| T12 | 2 | 1 | 4 |
| T13 | 1 | 1 | 2 |
| T14 | 2 | 0 🔴 | 2 |
| T15 | 3 | 1 | 2 |
| T16 | 3 | 2 | 3 |
| T17 | 4 | 3 | 2 |
| T18 | 1 | 1 | 2 |
| T19 | 1 | 0 🔴 | 3 |
| T20 | 1 | 1 | 2 |
| T21 | 2 | 1 | 2 |
| T22 | 1 | 1 | 3 |
| T23 | 0 | 0 🔴 | 2 |
| T24 | 1 | 1 | 3 |
| T25 | 2 | 2 | 3 |
| T26 | 3 | 2 | 4 |
| T27 | 1 | 1 | 4 |
| T28 | 1 | 1 | 3 |
| **合计** | **63** | **30** | **86** |

🔴 **读法（三档，不得混用）**：**(i) 收紧网 0 行的卡 = 3**（**T6 / T11 / T23** —— 它们的 `Verification` / `Steps` 里连「零改动 / 零 hunk / 为空」的字样都没有）；**(ii) 判定集 0 条的卡 = 7**（**T4 / T6 / T7 / T11 / T14 / T19 / T23**）；**(iii) 类② 0 格的卡 = 0**（28/28 卡都有 ≥2 格）。
🔴 **为什么 T4 / T7 / T14 / T19 落在「收紧网有行、判定集 0 条」**（**边界声明**）—— 它们的命中是**两类不属本类的句子**：① `CLAIM-VERBATIM` 的「**棘轮 Σ / 用例数逐字不变**」（`T7:940` / `T7:981` / `T7:982` / `T14:1396` / `T16:1516` / `T26:2025` / `T1:530/545/548/550/567` 等）—— 那是**读数主张**（E8 的类 (4)/(5) 已核），**不是**「某个**路径集合**为空」；② `CLAIM-NOT-TOUCH` 的**纪律句**（`T4:781` 「不得声称『纪律已落地』」· `T19:1648` 「本任务不改它的值」· `T10:1148` 「本任务不改注册表」）—— 它们的**作用域不是路径**，无法用 `git diff` 检验。🔴 **本类的边界 = 「可用 `git diff` / `git status` / `git log` 直接检验的『路径/范围型集合为空』主张」**；读数型与纪律型**不收**（避免与 E8 重复登记）。


### E8b.1 · 类① 逐条表（**30 条**：成立 6 · 🔴 不成立 2 · 待测 22）

> **判定口径**（🔴 **承 E8-5 的教训，本表一律用实质判据**）：**成立 / 不成立** 只用 `git diff -w --numstat`（**忽略空白**，零空白无关差异 = 零语义改动）+ **字节证**（`git hash-object --path=<p>` 让 git 自己 clean ⇒ == 旧 blob + 恰一个 `0x0A`）+ `countLines()` **前后相等**；🔴 **绝不用 `git log <range> -- <path>` 非空/为空当判据**（EOL 归一型改动会让它非空却零语义改动）。
> 🔴 **可核验性**：「成立/不成立」两列只在 **8a（T1–T5，已落地 10 条提交，`7c1fcc41..ea2d0762`）** 上有真 diff 可测；**T6–T28 尚未执行** ⇒ 一律「待测 + 点名由哪个任务测」，**不得**由推理补值。

| # | 卡片:行 | 主张（逐字要点） | 测法（原写 → **本单元实测/应采用**） | 判定 | 依据 / 修法 |
|---|---|---|---|---|---|
| C1-1 | T1 `:518` | 本任务**不触碰任何棘轮** | 门禁读数 + 真 diff | ✅ **成立** | T1 的提交 `547ffa1f` 的 `--name-only` = **恰 2 件、全在 `scripts/`** ⇒ 零棘轮面 ✅ |
| C1-2 | T1 `:519` | 本任务**不动 registry** | 真 diff | ✅ **成立** | `app/src/views/registry.ts`（`FROZEN_VIEW_KEYS` 在 `:134`）在 `7c1fcc41..HEAD` **零改动** ✅（🔴 注意：registry 的真身 = `app/src/views/registry.ts`，**不是** `app/src/shell/registry.ts`） |
| C1-3 | T2 `:589` | 豁免表 121 条**数值列一字不动** | `(e)` 不红 + 逐字节对拍表文件 | ✅ **成立** | `docs/standards/line-limit-exemptions.md` 在 8a **零改动**（`-w --numstat` 亦空）✅ |
| C1-4 | T2 `:592` | **不触碰**六棘轮（补末尾换行**不改任何字面量计数**） | 真 diff | ✅ **成立（语义面）** | ⚠️ **但字节面被触碰**：`f1742399` 归一了 `app/src/ui/primitives/emptyStateRatchet.test.ts`（棘轮件）的**末字节** ⇒ 🔴 **这正是 E8-5 的同一根因**；卡内括注已把主张**收窄到「字面量计数」** ⇒ 语义面成立（`countLines` 296→296、字节证 = 旧 blob + 恰一个 `0x0A`）✅ |
| C1-5 | T2 `:598` | `NoteEditView.tsx` 的改动**只有「文件末尾加 1 字节」**，不涉任何源代码内容 | 真 diff | ✅ **成立** | 字节证：`工作树(归一后) == f1742399~1 的 blob + 恰一个 0x0A` = **true**；`countLines` 412→412 ✅ |
| C1-6 | T3 `:712` | `textBaseline.ts` 的 hunk **只含 `:19` 与 `:174` 两行**（常数与逐文件表零改动） | `git diff HEAD~1 -- <p>` 给 hunk | ✅ **成立** | 实测（`c5b5a8ec~1` vs `c5b5a8ec`）：`--numstat` = `2 2`，`-U0` 的 hunk 头**恰为 `@@ -19 +19 @@` 与 `@@ -174 +174 @@`** ✅ 逐字吻合 |
| C1-7 | **T5 `:813`** | **段 8a 零 Rust 改动**；报告须给 `git log --oneline <8a 起点>..HEAD -- app/src-tauri` **为空**的证据 | 🔴 **原测法错** → **硬形态** | 🔴 **不成立** | **实测**：`git log --oneline 7c1fcc41..HEAD -- app/src-tauri` = **非空**（`f1742399` 归一 **5 个 `.rs`**：`ai_provider.rs` / `ai_provider_tests.rs` / `asr_pass2.rs` / `commands_knowledge_cards.rs` / `commands_video.rs`）、`git diff --stat` = **`5 files changed, 5 insertions(+), 5 deletions(-)`**。**真值** = `git diff -w --numstat` **为空** + **5/5 字节证**（== 旧 blob + 恰一个 `0x0A`）+ `countLines` **全等**（312/266/250/170/356）⇒ **Rust 零语义改动** ⇒ 结论「cargo 不跑」**成立**（**改的是证据形态，不是结论**）⇒ **已就地更正（E8b-1）** |
| C1-8 | **T5 `:827`** | 诚实边界②：`cargo` 不跑（**段 8a 零 Rust 改动**） | 同 C1-7 | 🔴 **不成立** | 同 C1-7 的同一主张的**第二处**（E8 与 E8b 的扫描都把它算作 `:813` 之外的一处）⇒ **已就地更正（E8b-1）** |
| C1-9 | **T10 `:1186`** | **IPC 面零变化**：`git log --oneline <8b 起点>..HEAD -- app/src-tauri` **为空** | 🔴 **同一错测法** → **硬形态** | **待测**（由 T10 在实施期测） | 🔴 **形态必改**（EOL 归一型改动会误伤 —— 8a 已实证）⇒ **已就地更正（E8b-3）**为 `git diff -w --numstat` 为空 + 字节证 + `countLines` 相等 |
| C1-10 | T8 `:1042` | `NoteViewSlot` **一字不改**：`git diff` 对 `registry.ts:80-85` **零 hunk** | `git diff` 零 hunk | **待测**（T8） | 🔴 **「零 hunk」是 EOL 脆弱的**：若该区间所在文件被归一末字节，`git diff` 会出 hunk 而零语义改动（8a 已实证：`--stat` 非零 / `-w` 空）⇒ **建议改用 `-w --numstat` + 字节证**（见 §E8b.2 的一般化修法） |
| C1-11 | T9 `:1123` | **生成物零改动**：`git diff` 对 `app/src/ui/tokens.css` **零 hunk** | `git diff` 零 hunk | **待测**（T9） | 同 C1-10 的 EOL 脆弱性（另有 `tokens.drift.test.ts:25-28` 的 `onDisk === renderAll()` 作**语义级**第二证据 ⇒ 该格**双保险** ✅） |
| C1-12 | T12 `:1337` | **卫生**：跑完 `git status --porcelain` **仍只有** `?? docs/tech-debt/` | `git status --porcelain` | **待测**（T12） | 形态对（`git status` 判的是工作树状态，不受 EOL 归一影响 —— **归一者已提交**）⇒ 保留 |
| C1-13 | T13 `:1378` | **零生产文件改动**：`git status --porcelain` 仍只有 `?? docs/tech-debt/` | `git status --porcelain` | **待测**（T13） | 保留；⚠️ T26 归档 `docs/tech-debt/` 后该行会消失 ⇒ **跨任务前提**已在 T26 `:2032` 诚实边界③ 登记 |
| C1-14 | T15 `:1460` | **零源文件改动**：`git status --porcelain` 仅一行；`git diff` 对 `app/**` **零 hunk** | `git status` + `git diff` | **待测**（T15） | 同 C1-10 的 EOL 脆弱性（`app/**` 面） |
| C1-15 | T16 `:1472` | **纯文档 / 注释，零行为改动** | D3 规范形（剥注释后去纯空白行） | **待测**（T16） | 判据形态**正确**（D3 是语义级，不是 `git diff` 级）✅ 保留 |
| C1-16 | T16 `:1483` | 不改 `AiConversationDock` 值（`git diff` 对 `AiConversationDock.tsx` **零 hunk**） | `git diff` 零 hunk | **待测**（T16） | 同 C1-10（建议加 `-w` 形态）；🔴 另见 E8b-6：该格的变异体 M1 **落点写错** |
| C1-17 | T17 `:1542` | 全部六棘轮 + 三件恰 300 的脚本**零改动** | `git diff` 对 `scripts/**` 零 hunk | **待测**（T17） | 同 C1-10 |
| C1-18 | T17 `:1545` | `.husky/pre-commit` **零改动** | `git diff -- .husky/` 零 hunk | **待测**（T17） | 同 C1-10 |
| C1-19 | T17 `:1571` | **零旁路改动**：`git diff` 对 `scripts/**` / `.husky/**` / `package.json` **零 hunk** | `git diff` 零 hunk | **待测**（T17） | 同 C1-10 |
| C1-20 | T18 `:1630` | **历史文档零改动**：`git diff --stat` **只含两个路径**（1 删 1 改） | `git diff --stat` | **待测**（T18） | 「只含 N 个路径」形态对（**枚举**而非「为空」）⇒ 保留 |
| C1-21 | T20 `:1739` | **零旁路**：`git diff` **只含** `commitlint.config.js`；`.husky/commit-msg` 零 hunk | `git diff` | **待测**（T20） | 前半「只含」✅；后半「零 hunk」同 C1-10 |
| C1-22 | T21 `:1786` | **零代码改动**：`git diff --stat` **只含两个 `.md`** | `git diff --stat` | **待测**（T21） | 前半 ✅（枚举形态）；建议补一句「`.md` 的 EOL 归一不算语义改动」 |
| C1-23 | T22 `:1806` | 🔴 **本批不再是「零 Rust 改动」**（T25/T27/T28 三处改 Rust） | — （已有修正注） | **待测**（T22） | 这是**反向主张**（断言**有**改动）⇒ 与 C1-7 同源、**已是修正后的正确形态** ✅ 保留 |
| C1-24 | T24 `:1900` | **依赖面零改动**：`git diff` 对 `package.json` **只含 `scripts` 段的一行**；`package-lock.json` **零 hunk** | `git diff` | **待测**（T24） | 前半「只含」✅；后半同 C1-10（⚠️ `package-lock.json` 5543 行，**末字节归一的风险面大**） |
| C1-25 | T25 `:1919` | 🔴 **零前端改动**（若只改 Rust ⇒ 前端读数全持平） | V4 读数 | **待测**（T25） | 形态对（读数级）✅ 保留 |
| C1-26 | T25 `:1950` | **IPC 面零变化**：`git diff` 对 `app_commands.rs` / `db_migrations.rs` **零 hunk** | `git diff` 零 hunk | **待测**（T25） | 同 C1-10；🔴 另见 E8b-7：该格的变异体 M3 **不可达** |
| C1-27 | T26 `:1988` | 六棘轮 / 八闸其余 **零代码改动** | V6 读数 | **待测**（T26） | 形态对 ✅ 保留 |
| C1-28 | T26 `:2026` | **既有 19 个日期夹零 hunk** | `git diff` | **待测**（T26） | 同 C1-10；⚠️ 量最大（19 个夹）⇒ 若任一被归一末字节会**假红** |
| C1-29 | T27 `:2082` | **IPC / schema 零变化**：`git diff` 对 `db_migrations.rs` / `app_commands.rs` **零 hunk** | `git diff` | **待测**（T27） | 同 C1-10 |
| C1-30 | T28 `:2242` | **本批零依赖改动** | 只登记「`npm ci` 可复原」 | **待测**（T28） | ⚠️ 与 C1-24 有**重叠主张**（`package.json` / `package-lock.json`）⇒ 两处须给同一读数 |

**分布**：**成立 6**（C1-1 … C1-6，全部为 **8a 已落地**段）· 🔴 **不成立 2**（C1-7 / C1-8，**同一主张的两处**）· **待测 22**（C1-9 … C1-30，全部为 **T6–T28 未执行**段）。

### E8b.2 · 类① 的修法（**一般化**；🔴 两类证据形态一律换硬形态）

**(1) 强制替换（已就地落地）**：凡用「`git log <range> -- <path>` **为空**」作证据的卡片 —— 本计划**恰 2 处**（`T5:813` / `T10:1186`）⇒ **一律改为**：
```
① git diff -w --numstat <range> -- <path>      # 必须输出为空（零空白无关差异 = 零语义改动）
② git hash-object --path=<p> <p>               # 让 git 自己 clean（P-44）== 旧 blob + 恰一个 0x0A
③ countLines() 前后逐字相等                     # 口径唯一 = scripts/line-limits.mjs 的 countLines()（P-35：会读盘）
```
🔴 **并就地加注说明为什么**（E8b-1 / E8b-3）：**EOL 归一 / 末尾换行这类改动会让 `git log <path>` 非空、让 `git diff` 有 hunk，却零语义改动** —— 本仓**已实测**：`git log` 非空 ∧ `git diff --stat` = `5 files changed, 5 insertions(+), 5 deletions(-)` ∧ `git diff -w --numstat` **空**（三态同现）⇒ 🔴 **「`git log` 为空」是三类里最弱的一条**。

**(2) 推广（**未逐处改写，登记为纪律**）**：凡「`git diff <range> -- <path>` **零 hunk**」作证据的格（本计划 **14 条**：C1-10/11/14/16/17/18/19/21/24/26/28/29 等）—— 🔴 **同属 EOL 脆弱形态**（8a 实证：`--stat` 非零而 `-w --numstat` 空）⇒ **实施期一律以 `git diff -w --numstat` 输出为空为准**；若某件**必须**逐字节不动（如生成物 `tokens.css`）⇒ **用既有语义级判据**（`tokens.drift.test.ts` 的 `onDisk === renderAll()`）**而不是** `git diff` 零 hunk。🔴 **判型三步**（承 §E8.5）：**纯追加型 / 替换型 / EOL 修正型** —— 只有**纯追加型**才可以用「`−` 列 = 0」。

**(3) 与既有条目的关系**：本节**不新立判据**、**不新增门禁成员**；它只把 §E8.5 已裁定的 EOL 型语义等价证明**从 T2 一格推广到全计划的「零改动」类主张**。

### E8b.3 · 类② 逐格表（**86 格 / 28 卡**；🔴 **改了 8 格**）

> **判定口径**：该格期望的红点**能否用一次注入同时满足**？判定的三个静态维度 = **(i) 期望之间是否互斥**（如同时要求「档位不变」与「档位 +1」）· **(ii) 变异体是否可注入**（点名的落点/字段**真的存在**吗）· **(iii) 具名判据是否在该变异体的作用面上**（点名断言读的输入被变异体改到了吗）。
> 🔴 **本表的「✅ 可达」是静态可达性，不是实跑结论** —— 逐格的**红点仍由实跑裁定**（承批 7 `### 表 6b` **E-25** 与批 8 **E8-1 / E8-3 / E8-4** 四次教训）。

| 卡片 | 格 | 变异体 | 一次注入可达性 | 处置 / 依据 |
|---|---|---|---|---|
| T1 | `:567` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T1 | `:568` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T1 | `:569` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T2 | `:635` **V1** | **M1** | 🔴 **改**（补前提） | `(e)` 只对**已登记**件命中（`line-limits.mjs:170`）⇒ 原格未写「目标须已登记」，取未登记件则不触发 `(e)` ⇒ 已就地补前提（E8b-8） |
| T2 | `:637` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T2 | `:638` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T3 | `:710` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T3 | `:712` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T4 | `:774` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T4 | `:776` **V3** | **M3** | ✅ 可达（牙口除外） | 卡内已自报「牙口未证」⇒ 保留（无机器断言，不得由推理补值） |
| T5 | `:821` **V2** | **M2** | 🔴 **改**（不可达 ⇒ 拆两颗） | 一格同时要求「档位 121→122」（目标须**未登记**才触发 `(c)`）与「`(e)` 行数不一致」（目标须**已登记**）⇒ 一次注入不可兼得 ⇒ 已就地拆为 M2-a/M2-b（E8b-2） |
| T5 | `:823` **V4** | **M4** | ✅ 可达（牙口除外） | 卡内已自报「牙口未证」⇒ 保留 |
| T6 | `:915` **V1** | **M1a/M1b** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T6 | `:916` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T6 | `:917` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T6 | `:918` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T6 | `:919` **V5** | **M5** | 🔴 **改**（具名断言作用面无关） | 原点名 `textRatchet.test.ts:231`「冻结表的逐文件之和 ≠ 冻结总数」= **冻结表内部 Σ vs 常数**；往源码加字面量**不动冻结表** ⇒ 恒绿 ⇒ 已换为 `:225` + `:261`（新文件另有 `:244`）（E8b-5） |
| T6 | `:920` **V6** | **M6** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T7 | `:979` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T7 | `:980` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T7 | `:982` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T8 | `:1040` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T8 | `:1041` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T8 | `:1042` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T8 | `:1043` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T9 | `:1120` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T9 | `:1121` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T9 | `:1122` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T9 | `:1123` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T9 | `:1124` **V5** | **M5** | 🔴 **改**（具名不精确） | 同 T6:919 的机理；「Σ 一致性」会被读成 `:231` ⇒ 已点名 `:225` + `:261`（E8b-5） |
| T9 | `:1126` **V7** | **M7** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T10 | `:1185` **V1** | **M1** | 🔴 **改**（判据号错） | 原写 `(d)`，但 `>300 未登记` 是 **`(c)`**（`line-limits.mjs:158`）；`(d)` 是「登记表条目指向不存在的文件 / 已回落至 300 以内」（`:163-164`）⇒ 已更正并补前提（E8b-4） |
| T10 | `:1186` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T10 | `:1187` **V3** | **M3** | 🔴 **改**（具名不精确） | 同上，已点名 `:225` + `:261`（E8b-5） |
| T10 | `:1188` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T10 | `:1189` **V5** | **M5** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T11 | `:1252` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T11 | `:1253` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T11 | `:1255` **V5** | **M5** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T11 | `:1257` **V7** | **M7** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T12 | `:1337` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T12 | `:1338` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T12 | `:1341` **V5** | **M5** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T12 | `:1342` **V6** | **M6** | ✅ 可达（牙口除外） | 卡内已自报「牙口未证」⇒ 保留 |
| T13 | `:1376` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T13 | `:1377` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T14 | `:1421` **V1** | **M1** | ✅ 可达（牙口除外） | 卡内已自报「牙口未证」⇒ 保留 |
| T14 | `:1422` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T15 | `:1458` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T15 | `:1459` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T16 | `:1512` **V1** | **M1** | 🔴 **改**（变异体不可注入 + 第二证据无关） | `surfaceResidual.ts:101` **无 `count` 字段**（`SHADOW_RESIDUAL` = `{file,kind,reason}`）⇒ 落点改为 `surfaceBaseline.ts:208`；`surfaceTagRegistry.test.ts` 只 import `SURFACE_TAG_REGISTRY`（与 `SHADOW_RESIDUAL` 无关）⇒ 换成 `surfaceRatchet.test.ts` 的两条（E8b-6） |
| T16 | `:1514` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T16 | `:1516` **V5** | **M5** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T17 | `:1569` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T17 | `:1570` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T18 | `:1627` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T18 | `:1628` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T19 | `:1688` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T19 | `:1689` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T19 | `:1690` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T20 | `:1737` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T20 | `:1738` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T21 | `:1784` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T21 | `:1787` **V4** | **M4** | ✅ 可达（牙口除外） | 卡内已自报「牙口未证」⇒ 保留 |
| T22 | `:1820` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T22 | `:1822` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T22 | `:1823` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T23 | `:1847` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T23 | `:1848` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T24 | `:1898` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T24 | `:1899` **V2** | **M2** | ✅ 可达（牙口除外） | 卡内已自报「牙口未证」⇒ 保留 |
| T24 | `:1900` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T25 | `:1948` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T25 | `:1949` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T25 | `:1950` **V3** | **M3** | 🔴 **改**（变异体不可达 + 对象错位） | `provider_scope` 是**凭据 scope 键**（`ai_provider.rs:197-199`）不是命令；`check-command-registry.mjs` 对它 **0 命中**；且它不在 V3 的 `git diff` 路径表内 ⇒ 两侧判据都不动 ⇒ 换成打在 `app_commands.rs` 注册面上的注入（E8b-7） |
| T26 | `:2023` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T26 | `:2025` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T26 | `:2026` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T26 | `:2027` **V5** | **M5** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T27 | `:2080` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T27 | `:2081` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T27 | `:2082` **V3** | **M3** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T27 | `:2083` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T28 | `:2136` **V1** | **M1** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T28 | `:2137` **V2** | **M2** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |
| T28 | `:2139` **V4** | **M4** | ✅ 可达 | 变异体直接作用在该判据的**输入面**（具名仪器 / 具名断言 / 具名读数）⇒ **静态可达**；🔴 **红点仍由实跑裁定**（§C17.3 / E-25） |

**汇总**（逐卡格数与改动数）：

| 卡 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14 | T15 | T16 | T17 | T18 | T19 | T20 | T21 | T22 | T23 | T24 | T25 | T26 | T27 | T28 | 合计 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 格数 | 3 | 3 | 2 | 2 | 2 | 6 | 3 | 4 | 6 | 5 | 4 | 4 | 2 | 2 | 2 | 3 | 2 | 2 | 3 | 2 | 2 | 3 | 2 | 3 | 3 | 4 | 4 | 3 | **86** |
| 🔴 改 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | **8** |

🔴 **8 格更正的性质分三类**：**(A) 不可达 ⇒ 拆注入（1 格）**：`T5:821`（M2）—— 一格同时要求「档位 `121 → 122`」与「`(e)` 报行数不一致」，而前者要求目标**未登记**、后者要求目标**已登记** ⇒ **一次注入不可兼得**（**这正是控制方 §14.3 的 E8-6**，T5 的两颗注入处置**正确**，本单元把它**写进计划**并补上两颗各自的具名红点）· **(B) 变异体不可注入 / 作用面无关（3 格）**：`T16:1512`（点名行**无该字段** + 第二条证据**换面**）· `T25:1950`（`provider_scope` **不是命令**且判据脚本对它 **0 命中**）· `T6:919`（点名断言 `:231` 比的是**冻结表内部 Σ**，与「加源码字面量」**无关**）· **(C) 判据号 / 具名不精确 / 前提缺失（4 格）**：`T10:1185`（`(d)` → **`(c)`**）· `T9:1124` / `T10:1187`（点名到 `:225` + `:261`）· `T2:635`（补「目标须**已登记**」前提）。

🔴 **可达性的依据（保留格的通用前提，逐格已写入上表）**：变异体**直接作用在该判据的输入面**上 —— ① 同名仪器（`line-limits` / `registry` / `textRatchet` / `surfaceRatchet` / `nativeButton.ratchet` / `tokens.drift` / `docs-check`）② 同名具名断言（卡内已点名到 `文件:行:断言`）③ 同名读数（`testResults.length` / `assertionResults.length` / sha256 / 字节数）。**凡不满足这三者的格，已在上表逐条更正。**

### E8b.4 · 勘误索引（**已就地落进计划正文**；🔴 **机器期望是计划工件、不是历史记录 ⇒ 直接更正 + 就地留痕**）

| # | 落点（卡片:行） | 原写 | 实测 / 更正为 |
|---|---|---|---|
| **E8b-1** | **T5 `:813`** + **T5 `:827`** | 「段 8a **零 Rust 改动**」⇒ 要 `git log --oneline <8a 起点>..HEAD -- app/src-tauri` **为空**的证据 | 🔴 **不成立**（实测**非空** = `f1742399`，5 个 `.rs`，`--stat` = `5 files changed, 5 insertions(+), 5 deletions(-)`）⇒ **段 8a Rust 零语义改动** + 硬形态三条（`-w --numstat` 空 · 5/5 字节证 · `countLines` 全等 312/266/250/170/356）⇒ 结论「cargo 不跑」**成立** |
| **E8b-2** | **T5 `:821`**（V2 / M2） | 一格：「档位 `121 → 122`」**且**「`(e)` 行数不一致」 | 🔴 **一次注入不可兼得** ⇒ 拆 **M2-a**（未登记件 `KnowledgeDetailPanel.tsx` 300→301 ⇒ `(c)` + 档位 121→122）与 **M2-b**（已登记件 `App.tsx` 549→550 ⇒ `(e)`，档位不变）；**红点由实跑裁定** |
| **E8b-3** | **T10 `:1186`**（V2） | `git log --oneline <8b 起点>..HEAD -- app/src-tauri` **为空** | 🔴 **同 E8-5 的错形态** ⇒ 改为 `git diff -w --numstat` 输出为空 + 字节证 + `countLines` 相等（EOL 归一型改动会误伤原形态） |
| **E8b-4** | **T10 `:1185`**（V1 / M1） | 期望红在 **`(d)`** 判据（`>300 未登记`） | 🔴 判据号错 ⇒ **`(c)`**（`line-limits.mjs:158`）；`(d)` = 「登记表条目指向不存在的文件 / 已回落至 300 以内」（`:163-164`）⇒ 并补可达性前提（目标须仍**未登记**；实测 `NotesPage.tsx` = 295） |
| **E8b-5** | **T6 `:919`**（V5 / M5）+ **T9 `:1124`** + **T10 `:1187`** | 点名具名断言 = `textRatchet.test.ts:231`（`冻结表的逐文件之和 ≠ 冻结总数`） | 🔴 **作用面无关**：`:231` 比 `sumOf(FROZEN_FONT_OOB_BY_FILE)`（**冻结表内部 Σ**）vs 常数，**往源码加字面量不动冻结表** ⇒ **恒绿**。真红点 = **`:225`**（② 总数 ≤ 冻结总数）+ **`:261`**（⑥ 域内实测总数 vs 冻结总数）；新文件另有 **`:244`**（⑤） |
| **E8b-6** | **T16 `:1512`**（V1 / M1） | 「把 `surfaceResidual.ts:101` 的 `count: 1` 改成 `count: 0`」**且**「`surfaceTagRegistry.test.ts` 的登记一致性判据红」 | 🔴 ① `surfaceResidual.ts:101` = `SHADOW_RESIDUAL` 第一条 `{file, kind, reason}`，**无 `count` 字段** ⇒ 不可注入 ⇒ 落点改 **`surfaceBaseline.ts:208`** 的 `FROZEN_SHADOW_BY_FILE["components/AiConversationDock.tsx"]` **1 → 0**；② 第二证据改 **`surfaceRatchet.test.ts`** 的两条（`surfaceTagRegistry.test.ts:38` 只 import `SURFACE_TAG_REGISTRY`，与 shadow 面无关） |
| **E8b-7** | **T25 `:1950`**（V3 / M3） | 「把 `provider_scope` 的默认值改成新命令 ⇒ registry 三向一致性红」 | 🔴 **不可达 + 对象错位**：`provider_scope` 是**凭据 scope 键**（`ai_provider.rs:197-199` 逐字 `format!("provider:{}", provider_id)`），**不是命令**；`check-command-registry.mjs`（301 行）对它 **0 命中**；且它不在 V3 的 `git diff` 路径表内 ⇒ 换成打在 `app_commands.rs` 注册面上的注入 |
| **E8b-8** | **T2 `:635`**（V1 / M1） | 「某个文件的末尾多加一个换行 ⇒ `(e)` 判据红」 | 🔴 **前提缺失**：`(e)` 只对**已登记**条目命中（`line-limits.mjs:170`）⇒ 必须点名**已登记目标**（如 `App.tsx` 登记 549），否则 +1 行不触发 `(e)` |

### E8b.5 · 仪器坑（**E8b 自捉 2 条 —— 都是「空输出当证据」的伪造面**）

#### P-45 · 🔴 **cmd.exe 吃掉 `^` ⇒ `git diff A^ B` 静默退化为 `git diff A A`（空输出）⇒ 伪造「零改动」证据**
**E8b 自捉（本单元探针 2 的第一轮）**：`execSync("git show f1742399^:app/src-tauri/src/ai_provider.rs")` **没有报错**，却返回了**归一后**的内容（13990 B，`rev-parse f1742399^:<p>` 竟等于 `HEAD` 的 blob）。机理：Node 的 `execSync` 在 Windows 上经 **`cmd.exe /d /s /c`**，而 **`^` 是 cmd 的转义符** ⇒ 它被吃掉，`f1742399^:<p>` 退化成 **`f1742399:<p>`**（**该提交自己的内容**）；同理 `git diff f1742399^ f1742399` 退化成 **`git diff f1742399 f1742399` ⇒ 空输出**。
🔴 **危害**：**「输出为空」这条证据可以被参数变形凭空造出来** —— 命令 exit 0、无 stderr、输出为空，看起来正是「零改动」的铁证，而它其实**什么都没比**。🔴 **与 E8-5 是同一族**（都是「用弱形态充当零改动证据」），但更隐蔽：E8-5 至少**非空**（只是被误判为反证），P-45 是**把「没比」伪装成「比了且相等」**。
🔴 **防范**：① 🔴 **绝不在经 shell 的命令串里写 `^`** —— 用 **`~1`** 或**显式 40 位 sha**；② 🔴 **凡 ref 表达式一律走 node 侧 `execFileSync("git", [args])`（不经 shell）或先 `rev-parse` 成 sha 再拼**；③ 🔴 **凡「输出为空」类证据，必须同时断言「两个被测对象的 sha 不相等且都解析成功」**（40 hex 断言）—— **本单元探针 3 即按此写**（`assertSha()` 对每个 ref 断言 `/^[0-9a-f]{40}$/`）。🔴 **与 P-33 同族**（ref 操作走 node + 断言退出码 + 回读 `rev-parse`）。

#### P-45b · 🔴 **`git log <range> -- <path>` 非空 ≠ 有语义改动（E8-5 的一般化）**
**依据 = 本仓实测三态同现**：`7c1fcc41..HEAD -- app/src-tauri` 上 `git log --oneline` **非空** ∧ `git diff --stat` = **`5 files changed, 5 insertions(+), 5 deletions(-)`** ∧ `git diff -w --numstat` **输出为空** ⇒ **Rust 零语义改动**。
🔴 **纪律**：**「某段 / 某任务零 X 改动」类主张，一律用 `git diff -w --numstat`（忽略空白）为空 + 字节证（`git hash-object --path`）+ `countLines()` 相等三条**；🔴 **不得**用 `git log <path>` 非空/为空、**也不得**用 `git diff` 零 hunk（EOL 归一型改动会让两者都失真）。**逐文件字节证必须经 `git hash-object --path`**（P-44：工作树 CRLF vs 存储 LF ⇒ 直接对拍会造假红）。

### E8b.6 · 诚实边界（本单元）

1. 🔴 **本单元不跑**：变异体导出树 · 全量 `vitest` · `cargo` · 真实构建 ⇒ 类② 的 **86 格判定全部是「静态可达性」**（互斥性 / 可注入性 / 作用面），**不是实跑结论**；每一格的 **红点仍由实跑裁定**（§C17.3 / E-25）。🔴 **本单元不得被读成「86 格已验红点」。**
2. 🔴 **类① 的「成立 / 不成立」只在 8a 上有真 diff 可测**（T1–T5 已落地）；**22 条「待测」是 T6–T28 的前瞻主张** —— 它们的**值**要等那些任务执行后才有意义，本节只保证**测法形态正确**（凡错的已改）。
3. 🔴 **本单元只改 `docs/**`**（本计划文件 + 报告）；**未改** `scripts/**` / `app/**` / `.github/**` / `app/src-tauri/**`。🔴 **为保住 `scripts/line-limits.mjs:176` 逐字引用的「卡片 `:615`」以及全计划的既有锚，本单元对**既有正文**的全部 8 类更正一律做「同形替换」（原地不增删行）** —— `git diff --numstat` = **12/12**（**零净增行**），**总行数 2547 不变**，`:615` **逐字未动**；**增量全部落在本节的文末追加**（文末之后无下游锚 ⇒ 不制造 P-36 型漂移）。🔴 **这是对派单「加一行 🔻」的有意偏离**（承 E8 §E8.14③ 的同一做法），理由是**加行会使 `:615` 之后的全部锚与 `## E8` §E8.12 的 30 行位置表整体漂移**；**留痕以 `🔻 E8b-N` 标记就地保存**，未丢失。
4. ⚠️ **类② 的「可达」判定的强度有限**：它排除的是**明显不可达**（互斥 / 字段不存在 / 作用面无关），**不能**排除「跑起来才发现红在别处」。🔴 **凡本表标 ✅ 的格，实施期仍须按 §九.8 真跑并把实红抄进报告。**
5. ⚠️ **`(c)` / `(d)` / `(e)` / `(f)` 的语义以 `scripts/line-limits.mjs`（**现 204 行**）的现文为准**（`:158` `(c)` · `:163-164` `(d)` · `:170` `(e)` · `:180` `(f)`）；🔴 行号带时点（**2026-09-13 · `ea2d0762`**），后续批次须当场重测（P-36）。
6. ⚠️ **登记面**：`P-45` / `P-45b` 已就地加注进 `## 陷阱` 的 `### C` 标题行（**同形替换，未加行**）；🔴 **它们与 P-41（同名私有副本伪造因果链）同族 —— 都是「仪器看起来做了那件事，其实没做」**。
