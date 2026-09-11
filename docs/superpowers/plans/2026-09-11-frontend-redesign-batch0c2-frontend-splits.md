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

### Task 1: 拆 `app/src/pages/NotesPage.tsx`（602 → ≈276）

> **边界取自**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-notes-page.md`（395 行）。**开工先读它**；与代码不符时**以代码为准**并在报告里指出。

**Files:**
- Modify: `app/src/pages/NotesPage.tsx`
- Create：`hooks/useNotesSealedFilter.ts`(≈45) · `hooks/useNotesPageEditing.ts`(≈60) · `hooks/useNotesBatchActions.ts`(≈85) · `hooks/useNotesListData.ts`(≈115) · `hooks/useNotesDeepLink.ts`(≈105) · `components/notes/NotesOverlays.tsx`(≈55) · `components/notes/NotesReadingColumn.tsx`(≈110) · `components/notes/NotesListColumn.tsx`(≈105)
- Consumes: 分析报告；生产侧唯一消费者 `app/src/App.tsx:21`（渲染在 `App.tsx:338-359`，7 个 props）；测试 `NotesPage.test.tsx`（`render(<NotesPage/>)` **不传 props**）
- Produces: 上述 8 个新文件；`NotesPage` 的 props 契约不变

**★ 决定性事实**：组件本体 **533 行占 88.5%**，其中 **JSX 骨架 L440–601 = 162 行** ⇒ **只抽 hook 不可能达标**，必须同时抽 3 个展示组件（S6–S8）。分步：S1 sealed filter → S2 editing → S3 batchActions → S4 listData → S5 deepLink → S6 overlays → S7 readingColumn → S8 listColumn，**每步一个提交**，累计 ≈276（**估算 ±15%，每步必须用 `ReadAllLines` 复测**）。

**控制方裁决（分析提出的两个待拍板项）**
- **prop 面上限**：S7/S8 会是 20/24-prop 的**薄适配器** —— **允许**，但三条必须满足：① 只做「透传 + 一层组合」，**不含业务逻辑**；② 各自 ≤300 行；③ 文件头 `@ai-context` 写明「本文件是展示适配器，逻辑在 `<hook>`」并按语义分组列 prop。**理由**：为压 prop 数而发明上下文对象会改变渲染时机与记忆化语义，风险高于显式薄适配器。
- **是否补测**：**允许且鼓励补只读测试**，硬约束是 —— ① 只加断言型测试（render + 查询 + 断言），**不得为测试改动生产代码**；② **该测试必须能在拆分前就通过**（否则它测的是新行为，不是既有行为）。若某测试拆分前不通过 ⇒ 移出本任务并登记。

**Step: 等价核对（该页测试薄，这步是主要证据）**
1. **深链两入口必须仍共用一次 effect**：L154–193 现有注释明写「两入口共用一次列表重载/选中/滚动，**防双 effect 双拉取竞态**」⇒ **禁止**拆成两条 effect、**禁止**改 dep 数组 / `disposed` / `seq` 比对、**禁止**把 50ms 滚动定时器改回裸 `setTimeout`、**禁止**把硬编码 `sortMode:"updated-desc"` 改走 `load`。
2. **保活挂载**：App **未**给 NotesPage 传 `active`，`useDbRefresh` 注释明确「不设 active」⇒ **不得顺手加可见性门控**（隐藏期 `window` keydown 仍生效是**既有缺陷**，本批行为等价、原样保留）。
3. **快捷键顺序契约**：`editorRef` 必须仍指向真实实例（`NoteReadingView` 仅在 `editing=true` 时渲染 editor 槽 ⇒ 非编辑态为 `null`，这正是 `openAiDialog` 走 `?? selected.content` 的原因）；**ESC 的 `update_note` → `get_note` 顺序被 `NotesPage.test.tsx` 直接断言**；`SelectionActionMenu` 用 capture + `stopPropagation` 抢在页面 ESC 之前 ⇒ **S2 的 hook 调用点必须仍在组件体靠前位置（不晚于原 L209）**。
4. **`selectedRef` 有 3 个消费者**（`handleTaskToggle` / `handleNoteChanged` / ESC）⇒ **不能**整体下沉进编辑 hook，须「页面持有 + 注入」；`handleNoteChanged` 有 9 个下游 ⇒ 必须保持**单一实例**。
5. **列状态**：`useColumnLayout` 的 3 组 localStorage 键（`notes-groups`/`notes-list`/`notes-outline`）与 default/min/max/autoFoldBelow **逐字保留**；**J1-3（大纲折叠死局）/ J1-6（大纲宽度假可调）/ J1-8（56px 魔数）三个既有缺陷本批不修、原样保留**。
6. **DOM/CSS**：本页**零 className、零 `.ed-*`**；仅三个硬点 —— L180 的 `document.getElementById(\`note-row-${id}\`)` 跨组件查询、**根容器 flex 直接子元素不能加包裹层**（S7 必须返回原 `flex:1` div；S8/S9 必须返回 **fragment**）、硬编码色 `#9ca3af` 与 `calc(100vh-56px)`**不 token 化**。
7. **拆分当次会有一次子树重挂载**（`RichEditorView`/`NoteListView` 因 React 位置变化）：这是拆分本身的副作用、**不得在同一提交里既搬迁又改 `key`**。

**收尾**：`node scripts/line-limits.mjs --write` → 从 `FROZEN_OVER_LIMIT` 删 `'app/src/pages/NotesPage.tsx'` → `--full` 期望 exit 0；把 8 个新文件的真实行数与新的「拆分计划」文字回写登记表人工列；在「已拆分 / 登记移除记录」节追加一条。
**验证**：`npx tsc --noEmit` · `npx vitest run src/pages/NotesPage.test.tsx`（**2 例：编辑完成刷新 / ESC flush 顺序 = 核心回归网**）· 相关子组件测试 · 全量 vitest · `npm run build` · `node scripts/line-limits.mjs`。
**只能人工**：4 条深链入口（含同笔记 key 递增重触发）· 保活切页后是否最新 · 隐藏期 Ctrl+E/ESC 原样 · 三栏拖拽/折叠/窄窗自动折叠 · 图片预览 / AI 对话框 / 模型卡槽 / 清理 toast。
**报告**：`.../task-1-report.md`。

---

### Task 2: 拆 `app/src/components/NoteListView.tsx`（654 → ≈230–270）

> **边界取自**：`.../analysis-note-list-view.md`（348 行）。

**Files:**
- Modify: `app/src/components/NoteListView.tsx`
- Create（9 个，均为 A/B/C 三波 9 步）：`utils/noteSectionModel.ts`(80–100，纯) · `hooks/useNoteSections.ts`(110–135) · `hooks/useNoteOrders.ts`(85–105，**兑现登记表既有计划**) · `hooks/useNoteMoves.ts`(170–200) · `hooks/useNoteListSelection.ts`(190–225) · `hooks/useNoteMarquee.ts`(70–90) · `components/NoteListBody.tsx`(110–135) · `NoteListToolbar.tsx`(90–110) · `NoteListBatchMenu.tsx`(85–110)
- Consumes: 分析报告；**API 冻结**（下述）
- Produces: 上述 9 个新文件

**★ API 冻结（改了就是破坏公共契约）**：default export · `export type SortMode` · **再导出 `{parseTags, fmtDate}`**（`NoteReadingView.tsx:17`、`parseTags.test.ts:8` 依赖它）。

**★ 消灭我任务书里的两处错误前提（分析实测纠偏，记录在案）**
1. **本文件无 `.ed-*` 耦合**：全文**零 className**、样式全内联（`.ed-*` 全仓仅 `App.css:119` 一处，与此无关）。真正的 DOM 耦合是行 id **`note-row-{id}`** 与 **data-testid / 精确文案契约**（测试用 `getByText` 匹配「已选 N 个」「📁 移动到组…」等，**含中文括号与省略号，必须逐字保留**）。
2. **拖拽不是 pointer 事件**：是 **HTML5 DnD**（`NoteListRow.tsx:57-86` + `NoteTreeSection.tsx:51-64`）；**pointer 事件只服务划选**。不要去找 `setPointerCapture`。

**Step: 等价核对（B 波后仍 ≈335 ⇒ C 波两件展示抽取是"过线必需"，不是可选）**
1. **`dropBusyRef` 并发锁必须与两个使用者同文件**（`moveWithinScope` L350-365 与 `handleDropOnRow` L369-425 共用，且都走同一条 `saveOrder` 整表覆写）。⚠️ **`handleDropOnRow` 有 5 个 `onNoteMoved?.()` 出口（L398/405/414/418/421）—— 漏搬任何一个 = 父层不刷新、UI 静默陈旧。**
2. **划选（L430-467）整块搬**（F6）：它不是 pointer capture，而是 `window` 监听 + `document.elementFromPoint` + `closest('[id^="note-row-"]')` 命中（隐式依赖 `NoteListRow.tsx:55` 的行 id）+ rAF 节流 + **4 路 cleanup**。**当前零自动化覆盖**（两个测试文件都无 pointer 用例）⇒ 只能人工。
3. **Esc 唯一 handler（L143-152）**优先级链 `batchMenu → contextMenu → 批量模式` ⇒ 菜单态**必须留 hook**（F5），`NoteListBatchMenu`（F9）做成**受控组件**，否则出现双 `window` keydown 语义漂移。
4. **★ 最可能「过测试却坏行为」的点 —— 折叠 key 有三套派生**：`scopeKey`="g:1"（L75）／裸键 `String(groupId)`/`"none"`（L264/581）／反解析 `scope.slice(2)`（L432）；**localStorage 键 = 裸键**（L79/216）。若误用 `scope` 当折叠键 ⇒ **用户折叠记忆静默失效**，而 `tree.test.tsx:22` 每测 `localStorage.clear()` **恰好掩盖它**。⇒ **本任务必须补一条键派生断言测试**（允许的新增测试：断言折叠读写的键与 localStorage 键一致）。
5. **本批只搬家不优化**：`grouped`(L186-199) 是死载荷（真分组在 L237-242 重算）—— **可去重，但要作为独立小提交并说明**；`sections` memo 的 deps 含 `groupFolds`(L258) 而函数体不读；flat 分支用 `notes.map`(L573) 而可见序用 `sec.items`(L264) —— **今日等价，勿"顺手统一"**；`handleDropOnRow` 的 4×`notes.find` 与划选帧内 `indexOf` **不优化**。
6. ⚠️ **`scripts/line-limits.mjs` 自身已 299 行（距硬限 1 行）—— 本批勿顺手改它。**

**收尾**：删 `FROZEN_OVER_LIMIT` 里的 `'app/src/components/NoteListView.tsx'` → `--write` 重生成登记表（**生成物禁手改**）→ 回写「拆分计划」人工列 → 「已拆分」节追加。
**验证**：`NoteListView.test.tsx`(121 行) + `NoteListView.tree.test.tsx`(253 行) 是**主等价网**（真组件 + 真 hook + mock invoke），**须全绿且不许改写**；`NotesPage.test.tsx` **不**覆盖列表交互（勿指望它兜底）。人工：WebView2 真实 DnD 全矩阵 · 划选松手/拖出窗口 · 折叠记忆重启保持 · 空组清理 toast。
**报告**：`.../task-2-report.md`。

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

### Task 5: 拆 `app/src/components/SessionListPanel.tsx`（604 → ≈255）

> **边界取自**：`.../analysis-session-list-panel.md`（396 行，含 8 个新文件的建议契约与 R1–R11 风险表）。

**Files:**
- Modify: `app/src/components/SessionListPanel.tsx`
- Create（8 个，全部 ≤170 行）：`utils/sessionEligibility.ts`(22–28) · `hooks/useSessionSelection.ts`(105–125) · `hooks/useSessionSearch.ts`(95–115) · `hooks/useSessionListView.ts`(80–100) · `components/SessionSearchBar.tsx`(80–95) · `SessionSearchHits.tsx`(70–85) · `SessionListBody.tsx`(85–105，含 `renderRow`) · `SessionSelectionToolbar.tsx`(145–170)
- Consumes: 分析报告；消费点仅 `pages/SessionsPage.tsx:18,283-302` 与 `SessionListPanel.test.tsx:15`（**无需跨页适配**）
- Produces: 上述 8 个新文件；**18 个 prop 契约与 DOM 锚点不变**

**★ 关键事实**：JSX 占 **270 行（L334–603）** ⇒ **不搬 JSX 无法到 300**。共搬 424 行、回收 ≈75 行 ⇒ 面板 ≈**255**（区间 240–270）。6 步顺序：纯函数 → 选择 hook → 视图 hook → 搜索三件套 → Body → **Toolbar（必须最后，依赖前两步）**。兜底：仍 >300 再抽 `SessionListHeader.tsx`(≈45) → ≈215。
**登记表既有计划不够**：只抽「批量栏 + 选择模式」（166 行）⇒ 面板仍 ≈468 >300 ⇒ 必须把 8 文件边界**回写登记表的「拆分计划」人工列**。

**Step: 等价核对（该文件的测试网比另两个厚，务必用足）**
1. **★ R1（最高危）：Esc 三级退出链必须保持单一 `window keydown`**。现状**只有 1 个**监听（L221–229），优先级 = 右键菜单先 `return`。若把选择态搬进新 hook 并**另建**第二个 keydown ⇒ 一次 Esc 会**同时**关菜单 + 清选集（**行为不等价**）。
   ⇒ **控制方裁决：Esc effect 留在面板**（改动最小、语义最直白）；**不许**新建第二个 `window` keydown。（备选方案是 hook 收 `blocked: contextMenu != null`，但不如留面板直白。）
2. **R2** `visibleOrderRef` 的「同 tick 可读」镜像必须保留（Shift 区间依赖它）。**R3** 裁剪 effect 必须保留 `changed ? next : cur` 的**返回同引用**写法。**R4** 全选三态的口径是 `visibleOrder`，**不是** `filtered`。**R5** `batchBusy`（state）+ `batchBusyRef`（ref）**必须同属一处**（防连点）。**R6** 批量转是「转前清选集」、批量删是「成功后清」—— **不对称，不得"统一"**。
3. **R8 真正的耦合不是 `.ed-*`**（本文件**零 className、零 `.ed-*`**），而是 **data-testid 与按钮文案**：`session-select-mode-chip` / `session-select-all` / `session-row-{id}` / `ctx-*`，以及文案「批量删除」「批量转笔记」「已选 N 个」⇒ **逐字保留**。
4. **R9** 勿顺手迁 `ui/tokens.ts` 或 `zIndex`（会破行为等价）；**R10** 大列表性能点本批只搬家不优化。
5. **R7** 右键菜单的坐标钳制与危险项在子组件内（`SessionRowContextMenu`），本文件不搬但受牵连 —— 该组件**无测试文件** ⇒ 只能人工验证。

**收尾**：删 `FROZEN_OVER_LIMIT` 里的 `'app/src/components/SessionListPanel.tsx'` → `--write` 刷新登记表 → **回写「拆分计划」人工列为 8 文件边界** → 「已拆分」节追加。
**验证**：`SessionListPanel.test.tsx`（**316 行 / 9 例**，invoke 全 mock）是**主力回归网**，**拆分后须零修改通过**；人工：WebView2 下右键菜单坐标钳制 / ESC / 危险删除 · 选择模式全通道（单选 / Ctrl / Shift 区间 / Esc 三级）· 空组清理 toast。
**报告**：`.../task-5-report.md`。

---

<!-- 剩余：Task 4（ClassroomPage 724）待其结构分析落地后按同一模式补入 —— 补入前不得派发该任务的实施者。
     执行顺序：**串行**（Task 3 → Task 1 → Task 2 → Task 5 → Task 4）。
     理由：三个实施者若并发，会在同一份登记表与 `FROZEN_OVER_LIMIT` 上互相覆盖；更危险的是
     A 的 `git add` 与 B 的 `git commit` 交错会把 A 暂存的文件卷进 B 的提交。 -->

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
**占位符扫描**：**Task 1 / 2 / 3 / 5 已按只读结构分析的实测结论写完**（`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-*.md`，各 348–402 行）—— 每节含：具体新文件清单与预计行数、分步实施顺序、控制方对分析所提决策点的**裁决**、该文件特有的**等价核对清单**、收尾（登记表 + 棘轮）与验证要求。**唯一未写的是 Task 4（`ClassroomPage.tsx` 724 行）** —— 其结构分析尚未落盘，**补入前不得派发该任务的实施者**（否则实施者会自行发明边界）。
**分析纠偏（记录在案，勿再犯）**：我的派发词里有**两处错误前提**被分析实测推翻 —— ① 我写 NoteListView 有 `.ed-*` 耦合，实测**零 className / 零 `.ed-*`**（真正的耦合是行 id 与 data-testid/文案）；② 我写"拖拽（pointer capture）"，实测拖拽是 **HTML5 DnD**、**pointer 事件只服务划选**。两处已在 Task 2 节显式更正，以免实施者去找不存在的东西。
**执行纪律**：拆分任务**串行**执行（Task 3 → 1 → 2 → 5 → 4）。理由：并发实施者会在**同一份登记表与 `FROZEN_OVER_LIMIT`** 上互相覆盖；更危险的是 A 的 `git add` 与 B 的 `git commit` 交错，会把 A 暂存的文件卷进 B 的提交。