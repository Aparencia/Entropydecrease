# 批 0-C2 前端超限文件拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 5 个 >600 行的前端文件拆到 **≤300 行**（AGENTS.md §3 的硬限，不允许豁免），且**行为等价** —— 这是批 0 验收门槛 1「15 个 >600 行文件 → 0」的前半段（后半段是 `0-C3` 的 Rust 10 个）。

**Architecture:** 每次只动**一个文件**，按「读结构 → 抽出明确职责的单元 → 新文件 ≤300 行 → 原文件 ≤300 行 → 跑全量门禁 → 刷新登记表 → 从棘轮名单删行」推进。抽出的形态**优先 hook / 纯展示子组件**（本仓既有范式：`useNoteSelectionActions`、`SessionListRow`、`NoteHeaderActions`、`GroupRowContextMenu` 都是这么抽出来的），编排层留在原文件。

**Tech Stack:** React 19 · TypeScript 5.8 · Vite 7 · Vitest 4（全局 `environment:"node"`，按文件 `// @vitest-environment jsdom`）· Tauri 2（`invoke`）

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§10 批 0 行「拆 4 个超限文件」、§11 验收口径第 1 条）· 规格 §37 的拆件顺序：**NotesPage → NoteListView → SessionDetailPanel → ClassroomPage**（本计划按该顺序推进，`SessionListPanel` 与之并列）

## Global Constraints

- **红线是硬的**：每个被拆文件的**最终行数 ≤300**，每个新文件也 **≤300**。行数口径 = `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count`（即 `node scripts/line-limits.mjs`）。⚠️ **不要用 `Get-Content` 数行**（本机 PS 5.1 + 码页 `gb2312` 会按 GBK 解码而**少算**）。
- **行为等价**：拆分是**纯重构** —— 不改任何用户可见行为、不改文案、不改 CSS 类名、不改 DOM 结构、不改事件语义、不改 `invoke` 的参数与时机。**不顺手改 bug、不顺手换 emoji**（emoji 替换是批 4 的事）。
- **★ 门禁现在每次提交都跑数值一致性**：`.husky/pre-commit` = `node scripts/line-limits.mjs --full && node scripts/docs-check.mjs`。⇒ **每个拆分提交都必须同时带上刷新后的登记表**，否则 `(e)` 会拦下你的提交。刷新命令：
  ```powershell
  node scripts/line-limits.mjs --write
  ```
  （`--write` 会按路径**保留**人工维护的「豁免理由 / 拆分计划」两列与「已拆分 / 登记移除记录」节，不会丢人工文字。）
- **★ 每拆完一个文件，必须从棘轮名单删掉它**：`scripts/line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 里删掉该路径，否则 `(b)` 会报「冻结名单里的文件已回到 600 以内」。**这是「15 → 0」进度的唯一可见载体，不要漏。**
- **不往未拆完的 >600 文件里加代码**（v0.22 红线）：本计划的性质是**减行**，故与红线不冲突；但**不要把新逻辑塞进还没拆的文件**。
- 单文件 ≤300 行 · 新文件必须含 `@ai-context`（业务背景 / 副作用 / 边界）· 禁止 `any` · **零新增依赖**（`package.json` 的 `dependencies`/`devDependencies` 不得变化）。
- 行尾 LF；**不要用 `git stash`**（本仓库无 `.gitattributes` 且 `core.autocrlf=true`，0-A 实际踩到过：会把源码变 CRLF 并让 Vite 拒绝转换）。
- 提交信息遵循 Conventional Commits，**subject ≤50 字**（commitlint 已生效）。
- ⚠️ **判定原生命令结果用 `2>file` 或 `$LASTEXITCODE`，不要用 `2>&1 |`**（PowerShell 5.1 会把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1）。
- ⚠️ **切勿运行 `git gc --prune=now`**（悬空备份 commit 是万一丢改动时唯一的找回途径）。

### 每个拆分任务的统一作业模式（Task 1–5 共用，逐条照做）

> 每个任务 = **一个文件**，一个**独立的实施者**，一次**任务评审**。不要合并多个文件到一个任务（评审者无法在一次评审里同时判断五个文件的等价性）。

1. **先读结构分析的实测结论**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-<file>.md`（含顶层单元与行号、依赖、提议边界、状态归属、风险、验证建议）。**计划里该任务的「拆分边界」节就是据它写的**；若你读代码后发现与分析不符，**以代码为准并在报告里指出**。
2. **记录拆前基线**：该文件行数（`ReadAllLines` 口径）、`npx vitest run` 的用例数与结果、`npx tsc --noEmit` 的 exit。
3. **抽出单元 → 新建文件**：新文件含 `@ai-context`；**公共 API（props / 导出名 / 事件语义）保持兼容**，消费点按需改动 import。
4. **跑门禁**（在 `app/` 下）：
   ```powershell
   npx tsc --noEmit            # 期望 exit 0
   npx vitest run              # 期望全绿；用例数不得减少
   ```
5. **刷新登记表并从棘轮名单删行**：
   ```powershell
   node scripts/line-limits.mjs --write
   # 然后手工从 scripts/line-limits.mjs 的 FROZEN_OVER_LIMIT 删掉本文件的路径
   node scripts/line-limits.mjs --full      # 期望 exit 0，且 >600 计数比拆前少 1
   ```
6. **行为等价的证明**（写进报告）：现有测试全绿 + 用例数不减；对**测试未覆盖**的路径，给出你的**人工核对清单**（至少：事件处理器仍绑定、条件渲染分支仍可达、CSS 类名未变、`invoke` 参数与时机未变）。
7. **提交**（一个文件一个提交）：
   ```powershell
   git add <新文件…> <原文件> docs/standards/line-limit-exemptions.md scripts/line-limits.mjs
   git commit -m "refactor(ui): 拆 <原文件> 至 ≤300 行"
   ```
8. **报告**（路径见各任务）：拆前/拆后行数对照（含每个新文件）· 新文件的 `@ai-context` 摘要 · 门禁输出与 exit · **人工核对清单**及结论 · 登记表与棘轮名单的改动 · 顾虑（尤其**你没能验证的**地方）。

---

### Task 3: 拆 `app/src/components/SessionDetailPanel.tsx`（656 → ≤300）

> **本节的边界取自只读结构分析的实测结论**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-session-detail-panel.md`（402 行，含每个单元的行号、依赖、8 个新文件的预计行数与分步净减表）。**开工先读它**；若你读代码后发现与分析不符，**以代码为准并在报告里指出**。

**Files:**
- Modify: `app/src/components/SessionDetailPanel.tsx`
- Create（**最小可行路径 = 前 4 个**；全做完则 8 个）：
  - `app/src/components/session-detail/SessionScreenCards.tsx`（~175 行）
  - `app/src/hooks/useSessionDetailData.ts`（~180 行）
  - `app/src/components/session-detail/SessionDetailHeader.tsx`（~150 行）
  - `app/src/components/session-detail/SessionRefineSection.tsx`（~130 行）
  - 可选：`SessionQualityCard.tsx`（~55）· `SessionTranscriptPane.tsx`（~50）· `SessionGlossarySection.tsx`（~55）· `SessionWebView.tsx`（~40）
- Consumes: 分析报告；唯一消费者 `app/src/pages/SessionsPage.tsx`（L17 import / L313 使用）
- Produces: 上述新文件；`SessionDetailPanel` 的 **props 契约不变**

**★ 关键事实（分析实测，决定了本任务的形态）**
- **只拆 `SessionWebView` + `SessionPass2Section` 只能到 ~582 行**（退出 600 硬限，但**仍远超 ≤300**）⇒ 必须追加数据面 hook + 头部 + 屏卡流。
- **该文件 0 个专属测试文件** ⇒ 行为等价**没有自动化保障**，只能靠人工走查（见 Step 5）。
- 该文件**零 `.ed-*` 类名、全部 inline style**；拆分会把旧色值从 1 个文件扩散到 9 个 ⇒ 后续 `ui/tokens.css` 化漏改概率大增（见 Step 5 的核对项）。

- [ ] **Step 1: 基线**（`app/` 下）
```powershell
[System.IO.File]::ReadAllLines((Get-Item 'src/components/SessionDetailPanel.tsx').FullName,[System.Text.Encoding]::UTF8).Count   # 期望 656
npx tsc --noEmit        # 期望 exit 0
npx vitest run          # 记下用例数（本文件无专属测试，但全量必须不降）
```

- [ ] **Step 2: 依次抽出（每步一个提交，逐步验证）**
顺序与净减（以分析报告的分步表为准）：
1. `SessionScreenCards.tsx`（原 L482–603 附近，屏卡流 ≈122 行 + toast/框选）
2. `useSessionDetailData.ts`（quality/glossary/baseUrl + `ocrBlocksByScreen` memo + 4 条 `listen` + 懒触发 + 深链快照）
3. `SessionDetailHeader.tsx`（改名 + `degradedBanner` + `fusing` + 操作）
4. `SessionRefineSection.tsx`（工具条 3 按钮 + `SecondPassPanel` / `ProofreadPanel` 挂载）
   做完这 4 步应 ≈**250 行**（合规）。若想更薄，再依次做 5–8（全做完 ≈155 行）。
每步结束跑 `npx tsc --noEmit` + `npx vitest run`，**并提交**（`refactor(ui): 拆 SessionDetailPanel 第 N 步 — <抽出的单元>`）。

- [ ] **Step 3: 登记表与棘轮（全部抽完后）**
```powershell
node scripts/line-limits.mjs --write
# 从 scripts/line-limits.mjs 的 FROZEN_OVER_LIMIT 删掉 'app/src/components/SessionDetailPanel.tsx'
node scripts/line-limits.mjs --full     # 期望 exit 0，>600 计数少 1
```

- [ ] **Step 4: 控制方已裁决的 4 个决策点**（照此执行，不要另行发挥）
- **D1 `viewMode` 不进 hook**：保留原处那 6 行切换 effect。
- **D2 命名改为 `SessionRefineSection`**（原登记名 `SessionPass2Section` 名不副实：内容还含 `ProofreadPanel`）。抽出后请**同步更新登记表里该文件的「拆分计划」文字**（人工列，生成器按路径保留）。
- **D3 `SecondPassPanel` 的 `onChanged` 现状未传 ⇒ 拆分后仍不传**（等价优先，不要"顺手补上"）。
- **D4 规格 §227 同时列了 `SessionTranscriptPane` 与 `SessionSegmentsTimeline`，但本文件只有一块转写时间轴**（L460–480）⇒ **按单一文件实现**（`SessionTranscriptPane.tsx`），并把「规格此处疑似重复命名」写进报告。

- [ ] **Step 5: 行为等价的人工核对清单**（本文件无测试，这一步是**主要**证据，逐条给结论）
1. **DOM 锚点未变**：`seg-${sessionId}-${id}`（原 L470）与 `ocr-${sessionId}-${firstSeenMs}`（原 L502）的**字符串格式逐字不变** —— 它们的唯一消费者在 `SessionsPage.tsx:133`，改了就会静默失联。
2. **陈旧闭包防护仍在**：精修事件监听依赖 `onRefreshDetailRef` 模式（且原代码带 `eslint-disable exhaustive-deps`）——迁 hook 时**必须保留 ref 模式**，否则 `session:refined` 的屏卡回填会**静默失效**。
3. **性能不回归**：`ocrBlocksByScreen` 的 memo **必须留在 hook/面板层并以 prop 传 `Map`**；下沉到子组件会重算，O(n×m) 回归。
4. **两处 `auto_refine_session` 的失败文案不得合并**（懒触发是静默、按钮显示「精修失败」）。
5. **不要顺手加「粘性头」**：规格所述的 sticky header 本文件**并未实现**（L273–334 无 `position:sticky`）—— 保持现状。
6. **零 `.ed-*` 类名**：拆分后逐一确认新文件同样不含 `.ed-*`（全 inline style），并**在报告里列出扩散后的旧色值清单**（供后续 token 化参考）。

- [ ] **Step 6: 提交与报告**
提交（Step 2 已逐步提交，此处是收口提交）：`refactor(ui): 拆 SessionDetailPanel 至 ≤300 行`（含新文件 + 原文件 + 登记表 + `scripts/line-limits.mjs`）。
报告写到：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/task-3-report.md`，含拆前/拆后行数对照（原文件 + 每个新文件）· Step 5 六条的逐条结论 · 门禁 exit · 登记表与棘轮改动 · D1–D4 的落实 · 顾虑。

---

<!-- 其余文件的拆分任务（NotesPage / NoteListView / SessionListPanel / ClassroomPage）待各自的结构分析落地后按同一模式逐节补入，
     内容取自 .superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-*.md 的实测结论，不含占位符。
     补入前不得派发对应任务的实施者。 -->

---

## 收尾任务：工具维护与登记表收敛（Task 6）

**为什么它是本批的一部分**：`scripts/line-limits.mjs` 现在 **299 行、上限 300**（余量只剩 1 行），而本批要并入的 `autoReason` 续行改进**必然越线** ⇒ 必须在「写紧」与「拆文件」之间做出选择；同时登记表的「已拆分 / 登记移除记录」节里已积压了被后续实测否证的旧结论。

**Files:**
- Modify: `scripts/line-limits.mjs`（或拆出新文件）
- Modify: `docs/standards/line-limit-exemptions.md`（生成物，跑 `--write` 刷新）
- Test: `node scripts/line-limits.mjs` / `--full` / `--write`

**Interfaces:**
- Consumes: 前 5 个任务已把 5 个文件拆到 ≤300，且已从 `FROZEN_OVER_LIMIT` 删行
- Produces: 收口的工具（仍 ≤300 行、仍只有一处口径实现）与刷新后的登记表

- [ ] **Step 1: 先决定 300 行怎么让出来**（两选一，**先量后选**）

`autoReason` 的改进是：让它**续读 `@ai-context` 的后续物理行**直到句末或空行（现只取第一个物理行 ⇒ 43 条自动理由里 16 条在连接符处截断）。
```powershell
# 先量清楚现在多少行、改进要加多少行
[System.IO.File]::ReadAllLines((Get-Item 'scripts/line-limits.mjs').FullName,[System.Text.Encoding]::UTF8).Count
```
- **方案 A（写紧）**：合并重复分支、缩短注释。评审要求：**不得**为了腾行数而删掉解释 Why 的注释或降低可读性 —— 若做不到，选 B。
- **方案 B（拆文件）**：把**生成器**（`writeTable` 与它的三个助手 `parseReasons` / `autoReason` / `parseHistory`）拆到 `scripts/line-limits-write.mjs`，从 `line-limits.mjs` 导入共享的测量（`scanTree` / `countLines` / 常量），入口保持 `node scripts/line-limits.mjs --write` 不变（在前者里转发）。**理由**：查（门禁每次跑）与写（维护工具）职责不同，且查的那份更该保持精瘦。
  无论选哪个：**口径实现仍必须只有一处**（`countLines`），且 `--full` 仍不得写表。

- [ ] **Step 2: 实现 `autoReason` 续行**
把只取首个物理行改为**续读直到空行 / 注释块结束**，并去掉 markdown 加粗标记与块注释收尾（保持现有清洗逻辑）。理由：登记表是生成物，改进后**重跑一次 `--write` 即可整体刷新**，零人工成本。

- [ ] **Step 3: 收敛「已拆分 / 登记移除记录」节**
该节现 16 条，其中至少一条已被当前实测否证（`EnrichPanel.tsx` 记「299 ≤300 登记移除」，复核实测 **324**）。请：① 逐条核对与当前实测是否一致；② 对**被否证**的条目就地标注更正（写明复核值与日期），**不要删**（它是历史证据链）；③ 该节由人工维护、生成器逐字保留，故直接改文本即可。

- [ ] **Step 4: 刷新与验证**
```powershell
node scripts/line-limits.mjs --write
node scripts/line-limits.mjs --full     # 期望 exit 0
node scripts/line-limits.mjs             # 期望 exit 0
node scripts/docs-check.mjs              # 期望 exit 0
```
并确认：>600 计数 = **10**（本批拆掉 5 个前端文件后的剩余，全部属 `0-C3`）· 登记表条目数与实测一致 · 那 16 条被截断的理由已变完整（随机抽 3 条与文件 `@ai-context` 对照）。

- [ ] **Step 5: 幂等与提交**
```powershell
node scripts/line-limits.mjs --write
git diff --stat -- docs/standards/line-limit-exemptions.md   # 期望空（连跑两次字节相同）
```
提交：`chore(scripts): 生成器理由续行与登记表收敛`（若拆了文件，加一个 `refactor(scripts): 拆出登记表生成器`）。⚠️ 改 `package.json` 以外的一切都不需要动依赖。

---

## 完成本计划后的状态

- 5 个前端 >600 文件全部 **≤300 行**（`ClassroomPage.tsx` / `SessionDetailPanel.tsx` / `NoteListView.tsx` / `SessionListPanel.tsx` / `NotesPage.tsx`）
- `FROZEN_OVER_LIMIT` 只剩 **10 条**（全部是 `0-C3` 的 Rust 文件）
- 登记表 100% 一致（`--full` 绿），「已拆分」节已收敛
- `scripts/line-limits.mjs` 仍 ≤300 行、仍只有一处口径实现

## 未做（登记）

- **`0-C3`（Rust 10 个 >600 文件）**：`lib.rs` 1025 / `types.rs` 1017 / `live_session_frame.rs` 974 / `commands_ai_refine.rs` 751 / `db_goals.rs` 707 / `commands_goals.rs` 673 / `ai_refine_task.rs` 670 / `note_filter.rs` 642 / `artifact_templates.rs` 632 / `video_profile.rs` 628。含 `lib.rs`（AGENTS.md §10 需额外审查：Tauri command 注册边界）。
- **4 个扫描域外文件**（`0-C1` 登记）：`app/src-tauri/build.rs` 152 · `app/src-tauri/examples/capture_ocr_diag.rs` 208 · `app/vite.config.ts` 40 · `app/vitest.config.ts` 23 —— 均 ≤300，但不归红线管辖（扫描域只有 `app/src` + `app/src-tauri/src` 的 `.ts/.tsx/.rs`）。若要扩域须另立批次。
- **CI 的 `app-rust` 预存失败**：本地以 CI 同一条命令实测 `cargo clippy -- -D warnings` = exit 101 / 15 个 error（**与本批无关**）。CI 在修好前不能充当 `(e)` 的兜底（本地门禁已能守）。
- **`docs/tech-debt/` 未入库**、**Starter Kit 双重身份**（`docs/` 既是对外可复制模板又是本项目活文档）—— 均为 `0-C1` 登记项。

## 自审记录

**规范覆盖**：本计划对应规格 §10 批 0 行的「拆超限文件」与 §11 验收口径第 1 条；拆分顺序沿用规格 §37（NotesPage → NoteListView → SessionDetailPanel → ClassroomPage）。
**数字来源**：5 个文件的行数（724 / 656 / 654 / 604 / 602）与 `FROZEN_OVER_LIMIT` 的 15 条均由批 0-C1 以 `ReadAllLines` 口径全量实测得出，并与 `docs/standards/line-limit-exemptions.md`（生成物）一致。
**占位符扫描**：本文件当前**只含不依赖结构分析的部分**（头部、全局约束、统一作业模式、收尾任务、完成状态、未做、自审）。**5 个文件的拆分任务尚未写入** —— 它们必须依据只读结构分析（`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-*.md`）的实测结论逐节补入，**补入前不得派发任何实施者**（否则实施者会自行发明边界）。