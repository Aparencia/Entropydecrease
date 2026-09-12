/**
 * @ai-context T16「弱化文本 → `Text`」与「字号越界」的**两条棘轮基线**（批 4 B11 的切片 + 棘轮）。
 * Why 两条（规格 §5.1 的同源病灶：「字号与两个灰手写组合，对比度逐处失控」）：
 *   ① **弱化灰 `#9ca3af`** —— 白底实测 ≈2.54:1，远低于 4.5:1 正文线；终点是墨度只从 `Text` 的
 *      `tone` 出。但仓内仍有同色字面量属非「弱化文本」语境（`background`/`border`/SVG `stroke`）
 *      与**不可迁的交互/条件色** ⇒ 不该清零 ⇒ 冻结存量、只许减。
 *   ② **字号越界 <12px**（9/9.5/10/10.5/11/11.5）—— 规格 §4.2 是「下界 12px；10px/11px 一律消灭」。
 *      604 处的观感一次性改且**几乎没有测试面** ⇒ 按 R2 只冻结不迁移；映射规则与规模见
 *      `tmp/t16a/slice.md`，执行登记给批 5/6（批 6 重排字距时一并做更合理）。
 *
 * ★ 计次口径（选定后写死；换算已自证）
 *   域 = `app/src/**` 的 `.ts`/`.tsx` **减** `*.test.ts(x)` **减** `ui/primitives/**`
 *     （原语层是墨度与字阶的真源，不是待收敛的调用点 —— 同 `statusLineBaseline` / T1 的 `prod`）。
 *   **先剥注释**（复用 `sliceScan.ts` 的状态机）。弱化灰取**行**口径（同行多次算 1）；字号越界取**处**口径。
 *   ⚠️ 两口径在本域**恰好等值**（`tmp/t16a/unit-check.mjs` 实测「同行两次命中」= 0 ⇒ 系数 **1.0000**）。
 * ★ 数字来源（同一支探针跑四棵树；机理逐条见 `tmp/t16a/mechanism.md`）
 *   弱化灰行/文件：计划 42e88740 **295/105**（计划写 296 ⇒ **不是手抄噪声**：296 是「朴素剥注释」的真值，
 *   差 1 来自下面的仪器假阴，见收口评审 I-1/M-6）→ 探针 8f5bd9f1 **246/98** → T16-A HEAD **249/100**
 *   → **T16-B 迁移后 63/44**（2026-09-12 T16-B 收紧）。字号越界处/文件：**604/124 → 576/122 → 558/120**
 *   （本单元**未动**：越界值按 R2 原样留在行内）。迁移账（`tmp/t16b/migrated.md`）：**249 = 迁移 186 +
 *   例外 63**（例外逐文件理由见 `RESIDUAL`；**不得**再出现「无理由的冻结」）。
 *
 * ★ **仪器修正后的重冻**（2026-09-12 收口修复单元 · 收口评审 **I-1**）：`stripComments` 曾把 JSX 闭合标签
 *   `</x>` 的 `/` 当正则起点 ⇒ 两个闭合标签之间的字面量被抹掉（`NoteRowContextMenu.tsx:175`），据实重冻
 *   **+1**：总量 **63 → 64** / 该文件 **1 → 2**（条目数、锚、字号侧未动；机理详见 `textRatchet` ⑥）。
 *
 * ★ 冻结粒度 = **文件 → 计数**（同 `nativeButtonBaseline` / `loadingBaseline`）：逐行 key 会在拆件
 *   与行号漂移时假红；棘轮要防的是「永远迁不完」⇒ 总量 + 逐文件只减不增是完整的。
 * 副作用：无（纯数据，被 `textRatchet.test.ts` 读）。边界：**棘轮只许降** —— 真迁走一处要**手工收紧**
 *   （`FROZEN_*_TOTAL` 必须恰等于逐文件之和；常数不许手工改成自洽）。
 */
export const FROZEN_MUTED_GRAY_TOTAL = 64;

/** 弱化灰冻结**文件数**（条目数；迁移清零一个文件 ⇒ 必须删键，条目数随之降） */
export const FROZEN_MUTED_GRAY_FILES = 44;

/** 字号越界冻结**总处数**（= `FROZEN_FONT_OOB_BY_FILE` 逐文件之和；只许降） */
export const FROZEN_FONT_OOB_TOTAL = 558;

/** 字号越界冻结**文件数**（条目数；只许降） */
export const FROZEN_FONT_OOB_FILES = 120;

/**
 * 锚（anti-table-swap）：条目数 + 一个具名文件的冻结值；换一张同样「自洽」的表 ⇒ 锚必红。
 * ⚠️ **T16-B 换锚**：T16-A 的锚（`LiveActivityPanel` 9）正是本单元的迁移目标（9 → 2）⇒ 随迁移失效。
 * 新锚 = `NoteLinkToSystem.tsx`：5 处**全部**是登记例外（B1 硬守卫 + 品牌青三元）⇒ 无裁决不可能下降。
 */
export const ANCHOR_MUTED_GRAY = { file: "components/NoteLinkToSystem.tsx", count: 5, files: 44 } as const;
export const ANCHOR_FONT_OOB = { file: "components/action-center/ActionCenterPanel.tsx", count: 19, files: 120 } as const;

/**
 * 相对 `app/src` 的正斜杠路径 → 该文件**允许残留的弱化灰行数上限**（只许降，键不许新增）。
 * ⚠️ 迁移清零一个文件时**删键**（不是改成 0）—— 留 0 值键会让「基线未登记的文件命中 = 0」这条判据的
 * 语义变模糊（`loadingBaseline` 用 0 表示「已交给原语」，本表不采用那个约定）。每个键都要有理由见 `RESIDUAL`。
 */
export const FROZEN_MUTED_GRAY_BY_FILE: Readonly<Record<string, number>> = {
  "components/AiProviderSettings.tsx": 1,
  "components/ChatComposer.tsx": 1,
  "components/ChatSidebar.tsx": 2,
  "components/ClassroomCapturePanel.tsx": 1,
  "components/ClassroomSourceColumn.tsx": 1,
  "components/ConceptCardRow.tsx": 1,
  "components/DiscoverySuggestSection.tsx": 1,
  "components/FeedFragmentList.tsx": 1,
  "components/GroupSidebar.tsx": 2,
  "components/GroupSidebarRow.tsx": 2,
  "components/InterviewDialog.tsx": 1,
  "components/KnowledgeDecisionLog.tsx": 1,
  "components/KnowledgeDetailPanel.tsx": 2,
  "components/KnowledgeGraphView.tsx": 2,
  "components/KnowledgeLinkSection.tsx": 3,
  "components/KnowledgeSystemWizard.tsx": 2,
  "components/KnowledgeTreeView.tsx": 1,
  "components/LearningLibraryEngineSection.tsx": 2,
  "components/LiveActivityPanel.tsx": 2,
  "components/MaterialInputPanel.tsx": 1,
  "components/NoteColorPicker.tsx": 2,
  "components/NoteEditView.tsx": 1,
  "components/NoteLinkToSystem.tsx": 5,
  "components/NoteListBatchMenu.tsx": 1,
  "components/NoteListToolbar.tsx": 1,
  "components/NoteMoveToGroupMenu.tsx": 1,
  "components/NoteReadingView.tsx": 1,
  "components/NoteRowContextMenu.tsx": 2,
  "components/NoteTreeSection.tsx": 1,
  "components/PracticeQuestionsOverlays.tsx": 1,
  "components/ReadyCheckCard.tsx": 1,
  "components/RefineStrategyPicker.tsx": 1,
  "components/RetroTimeline.tsx": 1,
  "components/RichEditorView.tsx": 1,
  "components/RouteInfoPopover.tsx": 3,
  "components/SecondPassPanel.tsx": 1,
  "components/SessionDetailPanel.tsx": 1,
  "components/SessionListPanel.tsx": 1,
  "components/TaskConversationView.tsx": 1,
  "components/VideoImportPanel.tsx": 1,
  "components/session-detail/SessionScreenCards.tsx": 1,
  "pages/KnowledgePage.tsx": 3,
  "pages/ReviewPage.tsx": 1,
  "utils/canvasElements.ts": 1,
};

/**
 * 残留命中的分类（照 `loadingBaseline.RESIDUAL` / `surfaceBaseline.SHADOW_RESIDUAL` 范式）：
 *   `interactive` = 原生 `<button onClick/role/disabled>`（可交互文本属 `Button` 域，批 5/7）·
 *   `ternary-no-equivalent` = A 类条件色，非灰支在 `TextTone` 九档**无**语义等价档 ·
 *   `interactive-no-equivalent` = 两者叠加（交互元素 + 品牌青/实底白字）·
 *   `nontext` = `background`/`border`/`stroke`（不是墨度，B19 第 5 条：不迁不动）·
 *   `tag` = 宿主标签不在 `TextTag` 内（`details`）· `colorMap` = 映射函数体里的 `return "#9ca3af"`
 *   （C 类，批 5/7 状态色收敛）· `b1-non-migrated` = B1/B2 硬守卫的 `NON_MIGRATED_14`（文件不迁）。
 */
export type TextResidualKind =
  | "interactive"
  | "ternary-no-equivalent"
  | "interactive-no-equivalent"
  | "nontext"
  | "tag"
  | "colorMap"
  | "b1-non-migrated";

/**
 * 允许残留的**逐文件理由**（照 `loadingBaseline.ts` 的 `RESIDUAL` 范式）。每条都必须：分类合法 ∧ 理由
 * 非空 ∧ 该文件此刻**仍然命中**（防「僵尸豁免」）。键集必须**逐字等于** `FROZEN_MUTED_GRAY_BY_FILE`。
 */
export const RESIDUAL: readonly { file: string; kind: TextResidualKind; reason: string }[] = [
  { file: "components/AiProviderSettings.tsx", kind: "ternary-no-equivalent", reason: "A 类三元 `color: p.enabled ? \"#0d9488\" : \"#9ca3af\"`：非灰支是品牌青 #0d9488，`TextTone` 九档无等价档；强行迁移要么丢色、要么写行内 style（ADR-033 §4 禁止）、要么给原语加「条件墨度」槽（语义不成立）" },
  { file: "components/ChatComposer.tsx", kind: "interactive-no-equivalent", reason: "原生 `<button>`（发送）+ 非灰支 #fff（品牌青实底白字）⇒ 交互 + 无等价档（`Button` 域，批 5/7）" },
  { file: "components/ChatSidebar.tsx", kind: "interactive", reason: "2 处 `role=\"button\"` + `onClick`（重命名 / 删除会话）⇒ 可交互文本属 `Button` 域（批 5/7）" },
  { file: "components/ClassroomCapturePanel.tsx", kind: "interactive-no-equivalent", reason: "原生 `<button>`（开始捕获）+ 非灰支 #fff（品牌青实底白字）⇒ 交互 + 无等价档" },
  { file: "components/ClassroomSourceColumn.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（折叠侧栏）⇒ `Button` 域（批 5/7）" },
  { file: "components/ConceptCardRow.tsx", kind: "ternary-no-equivalent", reason: "A 类三元 `concept.lastAppliedAt != null ? \"#0f766e\" : \"#9ca3af\"`：非灰支品牌青 ⇒ 无等价档（同 AiProviderSettings）" },
  { file: "components/DiscoverySuggestSection.tsx", kind: "interactive-no-equivalent", reason: "原生 `<button>`（确认挂接）+ 非灰支 #0f766e 品牌青 + 条件 fontWeight ⇒ 交互 + 无等价档" },
  { file: "components/FeedFragmentList.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（折叠收件箱）⇒ `Button` 域（批 5/7）" },
  { file: "components/GroupSidebar.tsx", kind: "interactive", reason: "`:332` 原生 `<button onClick title>`（折叠侧栏）；`:378` 收件箱激活行的条件色（非灰支 #be185d 粉，宿主行是 onClick 行）⇒ `Button` 域 + 无等价档" },
  { file: "components/GroupSidebarRow.tsx", kind: "ternary-no-equivalent", reason: "`:152` 非灰支 #b45309 是「路由理由待确认」，`due` 的语义是到期刻度 / 记忆语义（token 注释）⇒ 无等价档；`:158` 原生 `<button onClick title>`（重命名组）⇒ `Button` 域" },
  { file: "components/InterviewDialog.tsx", kind: "ternary-no-equivalent", reason: "`:196` 折线指示当前步 `i <= step ? \"#0f766e\" : \"#9ca3af\"` + 条件 fontWeight：非灰支品牌青 ⇒ 无等价档" },
  { file: "components/KnowledgeDecisionLog.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（删除记录）⇒ `Button` 域（批 5/7）" },
  { file: "components/KnowledgeDetailPanel.tsx", kind: "interactive", reason: "2 处原生 `<button onClick title>`（展开 / 折叠详情面板）⇒ `Button` 域（批 5/7）" },
  { file: "components/KnowledgeGraphView.tsx", kind: "nontext", reason: "`:55` SVG `stroke`（belong 边描边）不是墨度；`:167` 图层筛选按钮的品牌青三元 ⇒ 非弱化文本 + 交互（B19 第 5 条：只登记）" },
  { file: "components/KnowledgeLinkSection.tsx", kind: "interactive-no-equivalent", reason: "3 处原生 `<button>`（模式切换 ×2 / 挂引用 disabled）+ 非灰支 #0f766e 品牌青 ⇒ 交互 + 无等价档" },
  { file: "components/KnowledgeSystemWizard.tsx", kind: "ternary-no-equivalent", reason: "`:187` 步骤徽标两支非灰（active #0f766e 品牌青 / done #047857）+ 背景 / 描边条件；`:244` 原生 `<button disabled>` ⇒ 无等价档 / `Button` 域" },
  { file: "components/KnowledgeTreeView.tsx", kind: "interactive", reason: "`:162` `onClick` + `data-testid`（展开 / 折叠节点）⇒ 可交互文本属 `Button` 域（批 5/7）" },
  { file: "components/LearningLibraryEngineSection.tsx", kind: "interactive-no-equivalent", reason: "2 处原生 `<button disabled>`（下载模型 / 加载引擎）+ 非灰支 #374151 / #0f766e + `background` 三元 ⇒ 交互 + 无等价档" },
  { file: "components/LiveActivityPanel.tsx", kind: "nontext", reason: "2 处 `background`（转写来源色点 / 识别中色点底色）不是墨度 ⇒ B19 第 5 条：不迁不动" },
  { file: "components/MaterialInputPanel.tsx", kind: "interactive-no-equivalent", reason: "原生 `<button disabled>` + 非灰支 #fff（品牌青实底白字）⇒ 交互 + 无等价档" },
  { file: "components/NoteColorPicker.tsx", kind: "nontext", reason: "2 处 `border`（悬停描边 / 清除色虚线框）不是墨度 ⇒ B19 第 5 条" },
  { file: "components/NoteEditView.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫：本文件在 `NON_MIGRATED_14` 内（`dialogMigration.e.test.ts` ② + `buttonMigration.test.ts` ④ 断言「不迁的 14 个不许被顺手迁掉」）——加原语 import 会绕过守卫 ⇒ 本处（快捷键提示）不迁" },
  { file: "components/NoteLinkToSystem.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫（同上）：`:258` / `:301` 两处空态文案**不得**随本批迁走（文件整体不迁）；`:292/:321/:339` 是原生 `<button>` + 品牌青三元 ⇒ 交互 + 无等价档" },
  { file: "components/NoteListBatchMenu.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫（同上）：锚定菜单文件整体不迁 ⇒ 「已选 N 个」不迁" },
  { file: "components/NoteListToolbar.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（折叠列表）⇒ `Button` 域（批 5/7）" },
  { file: "components/NoteMoveToGroupMenu.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫（同上）：锚定菜单文件整体不迁 ⇒ 「暂无组」空态不迁" },
  { file: "components/NoteReadingView.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（收起大纲）⇒ `Button` 域（批 5/7）" },
  { file: "components/NoteRowContextMenu.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫（同上）：行右键菜单文件整体不迁 ⇒ 「暂无组」空态不迁；`:175`（移动到组的 ▸ 指示符 `color: \"#9ca3af\"`）亦不迁 —— 该行夹在两个闭合标签之间，曾被剥注释器漏读（收口评审 I-1），修好后本文件由 1 处重冻为 2 处" },
  { file: "components/NoteTreeSection.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（折叠箭头）⇒ `Button` 域（批 5/7）" },
  { file: "components/PracticeQuestionsOverlays.tsx", kind: "interactive", reason: "原生 `<button onClick>`（归档；`{...ghostBtn}` 样式常量）⇒ `Button` 域（批 5/7）" },
  { file: "components/ReadyCheckCard.tsx", kind: "ternary-no-equivalent", reason: "A 类三元 `item.ok ? \"#9ca3af\" : \"#b45309\"`：**灰支是「通过」**、非灰支是失败琥珀，`due`（到期刻度）语义不等价 ⇒ 无档" },
  { file: "components/RefineStrategyPicker.tsx", kind: "ternary-no-equivalent", reason: "A 类三元：`:124` 选中态 #6366f1 靛蓝（品牌主色）⇒ 无等价档（`link` 是链接蓝 #1F5FBF，语义不同）" },
  { file: "components/RetroTimeline.tsx", kind: "nontext", reason: "`:42` `background: KIND_DOT[e.kind] ?? \"#9ca3af\"`（时间轴色点）不是墨度 ⇒ B19 第 5 条" },
  { file: "components/RichEditorView.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫（同上，`buttonMigration.test.ts` 的 `EXCLUDED` 逐字点名）：高亮气泡文件整体不迁 ⇒ 快捷键提示不迁" },
  { file: "components/RouteInfoPopover.tsx", kind: "b1-non-migrated", reason: "B1/B2 硬守卫（同上）：ⓘ 弹层文件整体不迁 ⇒ `:310`（重复合并对）/ `:351`（影响面提示）不迁；`:234` 是原生 `<button onClick>`（关闭）⇒ `Button` 域" },
  { file: "components/SecondPassPanel.tsx", kind: "ternary-no-equivalent", reason: "A 类三支三元（adopted #047857 / rejected 灰 / 其余 #b45309）：琥珀支语义是「待裁决」，`due` 是到期刻度 ⇒ 无反例安全的等价档" },
  { file: "components/SessionDetailPanel.tsx", kind: "ternary-no-equivalent", reason: "A 类三元：`:221` 非灰支 #0d9488 品牌青（字幕来源标记）⇒ 无等价档" },
  { file: "components/SessionListPanel.tsx", kind: "interactive", reason: "原生 `<button onClick title>`（折叠列表；`{...btn}` 样式常量）⇒ `Button` 域（批 5/7）" },
  { file: "components/TaskConversationView.tsx", kind: "interactive-no-equivalent", reason: "原生 `<button disabled>`（重试）+ 非灰支 #b91c1c（三红 / StatusLine 领域）+ `background` 三元 ⇒ 交互 + 无等价档" },
  { file: "components/VideoImportPanel.tsx", kind: "interactive-no-equivalent", reason: "原生 `<button disabled>` + 非灰支 #fff（品牌青实底白字）⇒ 交互 + 无等价档" },
  { file: "components/session-detail/SessionScreenCards.tsx", kind: "tag", reason: "`:178` 宿主是 `<details>`（块级明细折叠）——`TextTag` 不含 `details` / `summary`（加档=改原语契约，不在本批）⇒ 无迁移形态" },
  { file: "pages/KnowledgePage.tsx", kind: "interactive", reason: "`:254` 折叠按钮 / `:430` 归档按钮（原生 `<button onClick title>`）⇒ `Button` 域；`:438` `systemStatusColor` 映射函数体的 `return \"#9ca3af\"` ⇒ C 类（批 5/7 状态色收敛）" },
  { file: "pages/ReviewPage.tsx", kind: "interactive", reason: "`:151` 原生 `<button onClick title>`（刷新到期统计）⇒ `Button` 域（批 5/7）" },
  { file: "utils/canvasElements.ts", kind: "colorMap", reason: "`:104` `conceptStatusColor` 的 `return \"#9ca3af\"`（C 类：函数级颜色映射归批 5/7 的状态色收敛，B19 第 3 条）" },
];

/**
 * 相对 `app/src` 的正斜杠路径 → 该文件**允许残留的字号越界处数上限**（只许降，键不许新增）。
 * 交给**批 5/6** 的工作量底稿：映射规则 `9/10/10.5/11/11.5 → 12`（`11.5` 仅在 `font="mono"` 时合法
 * —— 六档字阶的 s6 就是 11.5，仅用于数字对齐）；逐文件明细见 `tmp/t16a/slice.md`。
 * ⚠️ T16-B **未动本表**：迁移时越界值一律**原样留在行内**（R2：只登记，交批 5/6）⇒ 558/120 不变。
 */
export const FROZEN_FONT_OOB_BY_FILE: Readonly<Record<string, number>> = {
  "components/AiConversationDock.tsx": 7,
  "components/AiRefineCard.tsx": 1,
  "components/AiTaskPanel.tsx": 5,
  "components/AsrConfusionPanel.tsx": 4,
  "components/AudioLevelMeter.tsx": 3,
  "components/AudioPreprocSetting.tsx": 4,
  "components/AudioStoragePanel.tsx": 5,
  "components/BackupPanel.tsx": 4,
  "components/BoxSelectOverlay.tsx": 3,
  "components/CanvasNodeConcept.tsx": 3,
  "components/CanvasNodeModel.tsx": 3,
  "components/CanvasNodeQuestion.tsx": 4,
  "components/CaptureFloatPanel.tsx": 9,
  "components/ChatMessageList.tsx": 4,
  "components/ChatSaveNoteDialog.tsx": 1,
  "components/ChatSidebar.tsx": 6,
  "components/CitationChips.tsx": 2,
  "components/ClassroomBanners.tsx": 4,
  "components/ClassroomCapturePanel.tsx": 10,
  "components/ClassroomRightPane.tsx": 1,
  "components/ClassroomSourceColumn.tsx": 1,
  "components/ColumnBar.tsx": 1,
  "components/ConceptCardRow.tsx": 3,
  "components/DiscoverySuggestSection.tsx": 5,
  "components/EnrichPanel.tsx": 5,
  "components/FeatureFlagSetting.tsx": 1,
  "components/FeedFragmentList.tsx": 8,
  "components/GoalAiSection.tsx": 4,
  "components/GoalCard.tsx": 4,
  "components/GoalDetail.tsx": 18,
  "components/GoalPlanApprovalDialog.tsx": 6,
  "components/GraduateDialog.tsx": 2,
  "components/GroupCreateDialog.tsx": 1,
  "components/GroupRowContextMenu.tsx": 1,
  "components/GroupSidebar.tsx": 9,
  "components/GroupSidebarRow.tsx": 5,
  "components/ImageGallery.tsx": 2,
  "components/InterviewDialog.tsx": 3,
  "components/InterviewSteps.tsx": 6,
  "components/KnowledgeCanvasView.tsx": 6,
  "components/KnowledgeConceptDialog.tsx": 1,
  "components/KnowledgeDecisionForm.tsx": 4,
  "components/KnowledgeDecisionLog.tsx": 1,
  "components/KnowledgeDetailPanel.tsx": 3,
  "components/KnowledgeGraphView.tsx": 5,
  "components/KnowledgeLinkSection.tsx": 6,
  "components/KnowledgeModelDialog.tsx": 1,
  "components/KnowledgeSystemWizard.tsx": 3,
  "components/KnowledgeTreeView.tsx": 7,
  "components/LearningLibraryEngineSection.tsx": 2,
  "components/LearningLibraryPanel.tsx": 5,
  "components/LinkEntityPicker.tsx": 1,
  "components/LiveActivityPanel.tsx": 8,
  "components/LiveImageStrip.tsx": 6,
  "components/LiveProfileStrip.tsx": 8,
  "components/MaterialInputPanel.tsx": 3,
  "components/ModelCardCreateDialog.tsx": 1,
  "components/ModelCardFromNoteDialog.tsx": 1,
  "components/ModelDiskPanel.tsx": 5,
  "components/ModelManagementPanel.tsx": 12,
  "components/NoteAiDialog.tsx": 3,
  "components/NoteEditView.tsx": 1,
  "components/NoteHeaderActions.tsx": 2,
  "components/NoteLinkToSystem.tsx": 4,
  "components/NoteListBatchMenu.tsx": 1,
  "components/NoteListRow.tsx": 6,
  "components/NoteListToolbar.tsx": 4,
  "components/NoteMoveToGroupMenu.tsx": 2,
  "components/NotePreviewView.tsx": 3,
  "components/NoteReadingView.tsx": 7,
  "components/NoteRowContextMenu.tsx": 2,
  "components/NoteTreeSection.tsx": 3,
  "components/OcrDeviceSetting.tsx": 4,
  "components/PhotoCapturePanel.tsx": 3,
  "components/PracticeQuestionsOverlays.tsx": 8,
  "components/ProfileDetector.tsx": 12,
  "components/ProofreadPanel.tsx": 7,
  "components/ProofreadToggle.tsx": 4,
  "components/ReadyCheckCard.tsx": 4,
  "components/RefineLaunchDialog.tsx": 7,
  "components/RefineStrategyPicker.tsx": 10,
  "components/RefineWorkbench.tsx": 11,
  "components/RetroTimeline.tsx": 4,
  "components/RichEditorView.tsx": 1,
  "components/RouteInfoPopover.tsx": 8,
  "components/ScreenSelectOverlay.tsx": 1,
  "components/SealToggle.tsx": 2,
  "components/SecondPassPanel.tsx": 9,
  "components/SessionDetailPanel.tsx": 8,
  "components/SessionListBody.tsx": 1,
  "components/SessionListPanel.tsx": 2,
  "components/SessionListRow.tsx": 7,
  "components/SessionRowContextMenu.tsx": 2,
  "components/SessionSearchHits.tsx": 2,
  "components/SessionSelectionToolbar.tsx": 4,
  "components/SopRunOverlay.tsx": 7,
  "components/SpeakerSwitchCard.tsx": 8,
  "components/StructureImageSection.tsx": 3,
  "components/StructureModelSetting.tsx": 8,
  "components/SystemBadge.tsx": 1,
  "components/SystemStatusBadge.tsx": 2,
  "components/TaskConversationView.tsx": 3,
  "components/TaskLaunchDialog.tsx": 1,
  "components/TaskThreadCard.tsx": 7,
  "components/VersionPanel.tsx": 10,
  "components/VideoImportPanel.tsx": 4,
  "components/VocabManager.tsx": 6,
  "components/WebArticleView.tsx": 3,
  "components/WebImportPanel.tsx": 3,
  "components/WebInboxPanel.tsx": 4,
  "components/WeekContractCard.tsx": 13,
  "components/WindowSelectCard.tsx": 8,
  "components/action-center/ActionCenterPanel.tsx": 19,
  "components/note-selection/SelectionActionMenu.tsx": 2,
  "components/review/ReviewSessionPanel.tsx": 3,
  "components/session-detail/SessionDetailHeader.tsx": 3,
  "components/session-detail/SessionScreenCards.tsx": 6,
  "pages/ChatPage.tsx": 2,
  "pages/GoalsPage.tsx": 2,
  "pages/KnowledgePage.tsx": 14,
};
