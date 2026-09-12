/**
 * @ai-context T17-A：`Surface`（卡片边框 / 圆角 / 阴影）的**三条棘轮基线** —— 批 4 B11「切片 + 棘轮」+ B17 裁决的落点。
 *
 * Why 三条：规格 §5.1 的病灶逐字「`1px solid #e5e7eb`，**radius 6/8/10/12 混用**」，§4.1 逐字
 *   「**批 4 迁移时不得临时硬编码阴影**」。T17-A 只**落地基**（条款 + 棘轮 + 切片清单），
 *   **一个调用点也不迁**（迁移是 T17-B）—— 所以本表冻结的是**迁移前**的实测快照，只许降。
 *
 * ★ 域与口径（三条共用；口径本身是判据的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` **减** `*.test.ts(x)` **减** `ui/primitives/**`
 *      （原语层是"面长什么样"的真源，不是待收敛的调用点；B17 逐字）；
 *   ② **先剥注释**（`sliceScan.ts` 的状态机，字符串/模板只跳过不抹内容）⇒ 注释里提到的旧写法不算命中；
 *   ③ 「处」= 剥注释后**整段文本**上的匹配次数（同一行两次算 2；与 `nativeButtonBaseline` 的"处"同口径）；
 *   ④ 字面量（三条各自独立）：
 *      · 边框 = `/1px solid #e5e7eb/gi`（**含复合写法** `borderTop/Bottom/Left/Right`）⇒ 冻结 **240 处 / 111 文件**；
 *        计划 `tmp/totals.mjs` 的"精确写法" `border: "1px solid #e5e7eb"` 今日 **171 处**（同一棵树上计划期是 180）；
 *      · 圆角越界 = `/borderRadius:\s*(6|12|14|999|2)\b/`（`3/4/5/8/10` 与 `0` 按 B17 的映射表处理，**不入棘轮**）⇒ 冻结 **270 处 / 112 文件**；
 *      · 阴影 = `/boxShadow:/`（**任何形态**：字符串 / 模板 / 变量 / 表达式都算）⇒ 冻结 **24 处 / 24 文件**。
 *
 * ★ 迁移读数（T17-A 实施者自测，仪器 = `tmp/t17a/measure.mjs`，2026-09-12 · `HEAD=93763ae7`）
 *   计划（`dev@42e88740`）→ 今日（`93763ae7`）：边框精确写法 **180 → 171** ·
 *   圆角越界 **304 → 270** · 圆角总处 **583 → 537** · 阴影 **38 → 24**（不同值 18 → 11）。
 *   **差异全部由批 4 已落库的迁移提交吃掉**（T5–T10 弹层迁 `Modal` · T10 toast 归一 · T12 按钮常量 ·
 *   T13-b ChatPage 拆件 · T14/T15 加载/错误行迁移），逐文件 Δ 与归因提交见
 *   `tmp/t17a/slice.md` 的「差异归因」节（每条都能用 `git log --oneline 42e88740..HEAD -- <file>` 复核）。
 *
 * ★ 余量去向（B11 附带硬要求：切片 + 棘轮 = **中间态**，不是"五类已各自收敛成一个原语"）
 *   切片（判据 ① 本批已触碰 ∪ ② `pages/**` ∪ ③ 有同名测试）内 / 余量（切片外，**批 4 不迁**、
 *   冻结给批 5/7）的文件数：边框 83 / 28 · 圆角越界 84 / 28 · 阴影 21 / 3。
 *   逐文件名单 + 逐处「原值 → 目标档位/token」映射表 + `boxShadow` 逐值分布见 `tmp/t17a/slice.md`
 *   （该文件在 gitignored 的 tmp 下，**不入库** —— 它是 T17-B 的执行底稿）。
 *
 * ★ 药丸（`borderRadius: 999`）的 B6 裁决（B17 第 2 条）
 *   切片内实测 **3 处**（`AiConversationDock.tsx:52` · `RefineWorkbench.tsx:405,410`）⇒ ≥3 ⇒
 *   **给原语加一档 `radius="pill"`**（同一提交 `feat(ui): add pill radius tier to surface`）。
 *   ⚠️ 这与规格 §4.2 的「圆角 | 3 印章 · 5 控件与卡 · 8 面板 · 10 浮层」**不一致**（新增第五档）
 *   ⇒ 规范回写属 **T18**，本单元**不改规范文档**。token 真源（`SCALE_TOKENS.radiusScale`）尚未补
 *   `pill` ⇒ 原语今日走 `var(--ed-radius-pill, 999px)` 兜底，补档是批 5/6 的 token 层工作。
 *
 * 副作用：无（纯数据，被 `surfaceRatchet.test.ts` 读）。边界：**棘轮只许降** —— 真迁走一处 ⇒
 *   手工收紧本表（三条数据都是机器生成的，重跑 `tmp/t17a/gen-baseline.mjs` 即可重排）。
 * ★ T17-B（迁移落地 · 2026-09-12 · 本单元的 4 条提交）—— 基线**收紧**到迁移后实测，仍**只许降**
 *   第 1 批 `refactor(ui): use shadow tokens at call sites`：20 处阴影字面量 → `var(--ed-shadow-1/2)`
 *     （不同值 **11 → 6**；4 处**结构上不是投影**的留在原地并登记：遮罩 / 反相描边环 / 语义色投影 / 表达式双态）。
 *   第 2 批 `refactor(ui): migrate card borders to surface`：14 处「Surface 形态」容器迁 `<Surface>`
 *     （直接形态 = 行内对象字面量；带 `background` + 整圈 `1px solid #e5e7eb` + 容器标签 + 非交互）。
 *   第 3 批 `refactor(ui): align card radii to panel tier`：3 处结构上迁不进去的 Surface 形态落点就地 `6 → 8`。
 *   ⇒ 三族收紧读数：边框 **240 → 226 处 / 111 → 108 文件** ·
 *     越界圆角 **270 → 261 处 / 112 → 109 文件** ·
 *     阴影 **24 → 24 处 / 24 文件（总处数不变：token 仍是 `boxShadow:` 命中；变的是**值收敛**）**。
 *   `FROZEN_SURFACE_TAG_TOTAL` 由 **0 → 14**（T17-A 冻结的"零"是**故意的空真登记**：
 *     迁移一开始它必红，逼人确认 ⑦ 已从空真变活；同批实测行内覆盖 = **0**）。
 *
 * ★ 残留三类的去向（逐条理由见 `BORDER_RESIDUAL` / `RADIUS_RESIDUAL`；**类别级**读数见下）
 *   · **57 处单向分隔线**（borderTop/Right/Bottom/Left）：`Surface.bordered` 只出整圈 ⇒ **结构上表达不了**
 *     ⇒ 不迁，去向 = 批 5/7 的列/分隔线契约（本批**只登记**，不动一个字）。
 *   · **11 处三元条件边框色**（`cond ? "1px solid <状态色>" : "1px solid #e5e7eb"`）：`Surface.interactive`
 *     只给 hover 的边框墨度推进，给不了**任意状态色** ⇒ 不迁（同名类 = 选中/激活态，批 5/7）。
 *   · **控件形态**（按钮 / 输入框 / 下拉 / 文本域 / 药丸 / 徽标）：不是"面"而是控件 ⇒ 归 `Button` 与控件档
 *     （批 5/7）。**按形态类别整体裁定，不逐文件登记**——逐文件登记会造出上百条同因条目，那是登记噪音。
 *   · **透明边框容器**（有整圈边框、无底色）：`Surface` 基类**必出底色**（`background: var(--ed-bg-surface)`）
 *     且没有"只出边框"的档 ⇒ 迁过去会平白多一层底（ADR-033 §4 禁止调用点用行内 `style` 把它按回去）。
 *   · **结构挡住**（`dangerouslySetInnerHTML` / `id` / `onClick` 等）：`SurfaceProps` 今日无 DOM 属性透传
 *     ⇒ 逐文件登记为 `no-passthrough-*`（原语补透传是批 5/6 的活）。
 *   · **B1/B2 的 `NON_MIGRATED_14`**：`dialogMigration.e.test.ts` ② 的硬判据禁止这 14 个文件出现
 *     `ui/primitives` ⇒ 撞上即回退 + 登记（新类别 `b1-non-migrated`），**守卫不改窄**（控制方 B21）。
 *
 * ★ 副作用：无（纯数据）。边界：`BORDER_RESIDUAL` / `RADIUS_RESIDUAL` **只登记"本单元逐处裁定过、决定不迁"
 *   的落点**（键 = `文件|类别`，`count` = 该文件该类别的处数），**不是**"所有剩余命中"的清单：剩余的大头
 *   （control-shape / separator / no-background / backlog）是**类别级**裁定，读数写在上面那一段。
 *   防僵尸判据：每条声明的文件**此刻仍须命中** ≥ `count`（一处被迁走却仍挂着豁免 ⇒ 红）。
 */

/** 棘轮一 · 卡片边框 `1px solid #e5e7eb`（含复合写法）的冻结总数（只许降；T17-B 收紧：240 → 226） */
export const FROZEN_BORDER_TOTAL = 226;

/** 相对 `app/src` 的路径 → 该文件允许的边框字面量**处数上限**（只许降；未登记文件命中即红） */
export const FROZEN_BORDER_BY_FILE: Readonly<Record<string, number>> = {
  "components/AiConversationDock.tsx": 3, "components/AiProviderSettings.tsx": 1,
  "components/AiServicePanel.tsx": 1, "components/AiTaskPanel.tsx": 1, "components/AppErrorBoundary.tsx": 1,
  "components/AsrConfusionPanel.tsx": 1, "components/AudioStoragePanel.tsx": 1,
  "components/BoxSelectOverlay.tsx": 3, "components/BrowserChrome.tsx": 1,
  "components/CanvasNodeConcept.tsx": 1, "components/CanvasNodeModel.tsx": 2,
  "components/CaptureFloatPanel.tsx": 4, "components/ChatComposer.tsx": 1,
  "components/ChatSaveNoteDialog.tsx": 2, "components/ChatSidebar.tsx": 1, "components/CitationChips.tsx": 1,
  "components/ClassroomCapturePanel.tsx": 2, "components/ClassroomRightPane.tsx": 3,
  "components/ClassroomSourceColumn.tsx": 2, "components/ColumnBar.tsx": 1,
  "components/ColumnResizer.tsx": 1, "components/FeedFragmentList.tsx": 5, "components/GoalAiSection.tsx": 1,
  "components/GoalCard.tsx": 1, "components/GoalDetail.tsx": 1, "components/GoalPlanApprovalDialog.tsx": 2,
  "components/GroupRowContextMenu.tsx": 1, "components/GroupSidebar.tsx": 4,
  "components/GroupSidebarRow.tsx": 1, "components/ImageGallery.tsx": 1,
  "components/ImagePreviewOverlay.tsx": 1, "components/InterviewDialog.tsx": 1,
  "components/InterviewSteps.tsx": 5, "components/KnowledgeCanvasView.tsx": 1,
  "components/KnowledgeConceptDialog.tsx": 1, "components/KnowledgeDecisionForm.tsx": 4,
  "components/KnowledgeDetailPanel.tsx": 6, "components/KnowledgeGraphView.tsx": 2,
  "components/KnowledgeLinkSection.tsx": 4, "components/KnowledgeModelDialog.tsx": 1,
  "components/KnowledgeSystemWizard.tsx": 5, "components/KnowledgeTreeView.tsx": 6,
  "components/LearningLibraryPanel.tsx": 1, "components/LiveActivityPanel.tsx": 2,
  "components/LiveImageStrip.tsx": 2, "components/LiveProfileStrip.tsx": 2,
  "components/MaterialInputPanel.tsx": 2, "components/ModelCardCreateDialog.tsx": 1,
  "components/ModelCardFromNoteDialog.tsx": 2, "components/ModelDiskPanel.tsx": 1,
  "components/NoteAiDialog.tsx": 1, "components/NoteEditView.tsx": 4, "components/NoteHeaderActions.tsx": 1,
  "components/NoteImage.tsx": 1, "components/NoteLinkToSystem.tsx": 2, "components/NoteListBatchMenu.tsx": 2,
  "components/NoteListToolbar.tsx": 3, "components/NoteListView.tsx": 1, "components/NoteMarkdown.tsx": 1,
  "components/NoteMoveToGroupMenu.tsx": 1, "components/NotePreviewView.tsx": 4,
  "components/NoteReadingView.tsx": 2, "components/NoteRowContextMenu.tsx": 1,
  "components/OcrDeviceSetting.tsx": 2, "components/PhotoCapturePanel.tsx": 4,
  "components/PracticeQuestionsOverlays.tsx": 6, "components/ProfileDetector.tsx": 1,
  "components/PromoteCardButton.tsx": 1, "components/ProofreadPanel.tsx": 2,
  "components/ProofreadToggle.tsx": 1, "components/ReadyCheckCard.tsx": 1,
  "components/RefineLaunchDialog.tsx": 2, "components/RefineStrategyPicker.tsx": 2,
  "components/RefineWorkbench.tsx": 6, "components/RichEditorView.tsx": 4,
  "components/RouteInfoPopover.tsx": 5, "components/ScreenSelectOverlay.tsx": 3,
  "components/SecondPassPanel.tsx": 2, "components/SessionDetailPanel.tsx": 3,
  "components/SessionListBody.tsx": 1, "components/SessionListPanel.tsx": 4,
  "components/SessionRowContextMenu.tsx": 1, "components/SessionSearchBar.tsx": 1,
  "components/SessionSelectionToolbar.tsx": 1, "components/SopRunOverlay.tsx": 4,
  "components/StructureImageSection.tsx": 1, "components/StructureModelSetting.tsx": 1,
  "components/SystemStatusBadge.tsx": 1, "components/TaskConversationView.tsx": 1,
  "components/TaskLaunchDialog.tsx": 1, "components/TaskThreadCard.tsx": 1, "components/VersionPanel.tsx": 1,
  "components/VideoImportPanel.tsx": 1, "components/VocabManager.tsx": 4, "components/WebImportPanel.tsx": 2,
  "components/WebInboxPanel.tsx": 1, "components/WeekContractCard.tsx": 2,
  "components/WindowSelectCard.tsx": 1, "components/action-center/ActionCenterPanel.tsx": 11,
  "components/chat/ChatLaunchMenu.tsx": 1, "components/note-selection/SelectionActionMenu.tsx": 1,
  "components/review/ReviewSessionPanel.tsx": 1, "components/session-detail/SessionScreenCards.tsx": 2,
  "pages/ChatPage.tsx": 1, "pages/GoalsPage.tsx": 3, "pages/KnowledgePage.tsx": 4, "pages/ReviewPage.tsx": 1,
  "pages/SettingsPage.tsx": 1,
};

/** 棘轮二 · 越界圆角 `6|12|14|999|2` 的冻结总数（`3/4/5/8/10` 与 `0` 按映射表处理，不入棘轮；T17-B 收紧：270 → 261） */
export const FROZEN_RADIUS_OUTLIER_TOTAL = 261;

/** 相对 `app/src` 的路径 → 越界圆角的**处数上限**（只许降；迁移时换成 `radius="…"` 档位） */
export const FROZEN_RADIUS_OUTLIER_BY_FILE: Readonly<Record<string, number>> = {
  "App.tsx": 1, "components/AiConversationDock.tsx": 1, "components/AiProviderSettings.tsx": 4,
  "components/AiRefineCard.tsx": 3, "components/AiServicePanel.tsx": 3, "components/AiTaskPanel.tsx": 2,
  "components/AppErrorBoundary.tsx": 2, "components/AsrConfusionPanel.tsx": 2,
  "components/AudioLevelMeter.tsx": 1, "components/AudioStoragePanel.tsx": 2,
  "components/BackupPanel.tsx": 2, "components/BoxSelectOverlay.tsx": 3, "components/BrowserChrome.tsx": 1,
  "components/CaptureFloatPanel.tsx": 1, "components/CaptureOverlayPanel.tsx": 2,
  "components/ChatMessageList.tsx": 1, "components/ChatMessageMarkdown.tsx": 1,
  "components/ChatSaveNoteDialog.tsx": 3, "components/ChatSidebar.tsx": 1,
  "components/ClassroomCapturePanel.tsx": 7, "components/ClassroomRightPane.tsx": 2,
  "components/ConceptCardRow.tsx": 1, "components/DiscoverySuggestSection.tsx": 2,
  "components/EnrichPanel.tsx": 2, "components/GoalDetail.tsx": 3,
  "components/GoalPlanApprovalDialog.tsx": 2, "components/GraduateDialog.tsx": 1,
  "components/GroupCreateDialog.tsx": 2, "components/GroupDeleteConfirm.tsx": 2,
  "components/GroupRowContextMenu.tsx": 1, "components/GroupSidebar.tsx": 4,
  "components/GroupSidebarRow.tsx": 1, "components/ImageGallery.tsx": 1,
  "components/ImagePreviewOverlay.tsx": 2, "components/InterviewDialog.tsx": 2,
  "components/InterviewSteps.tsx": 6, "components/KnowledgeCanvasView.tsx": 4,
  "components/KnowledgeConceptDialog.tsx": 3, "components/KnowledgeDecisionForm.tsx": 5,
  "components/KnowledgeDecisionLog.tsx": 1, "components/KnowledgeDetailPanel.tsx": 4,
  "components/KnowledgeGraphView.tsx": 1, "components/KnowledgeLinkSection.tsx": 2,
  "components/KnowledgeModelDialog.tsx": 3, "components/KnowledgeSampleView.tsx": 3,
  "components/KnowledgeSystemWizard.tsx": 9, "components/KnowledgeTreeView.tsx": 2,
  "components/LearningLibraryEngineSection.tsx": 2, "components/LearningLibraryPanel.tsx": 2,
  "components/LinkEntityPicker.tsx": 2, "components/LiveActivityPanel.tsx": 1,
  "components/LiveImageStrip.tsx": 2, "components/LiveProfileStrip.tsx": 1,
  "components/ModelCardCreateDialog.tsx": 2, "components/ModelDiskPanel.tsx": 1,
  "components/NoteAiDialog.tsx": 4, "components/NoteEditView.tsx": 1, "components/NoteHeaderActions.tsx": 2,
  "components/NoteImage.tsx": 2, "components/NoteLinkToSystem.tsx": 2, "components/NoteListToolbar.tsx": 2,
  "components/NoteMarkdown.tsx": 2, "components/NoteMoveToGroupMenu.tsx": 1,
  "components/NotePreviewView.tsx": 5, "components/NoteRowContextMenu.tsx": 1,
  "components/OcrDeviceSetting.tsx": 3, "components/PhotoCapturePanel.tsx": 7,
  "components/PracticeQuestionsOverlays.tsx": 1, "components/PromoteCardButton.tsx": 3,
  "components/ProofreadPanel.tsx": 2, "components/ProofreadToggle.tsx": 1,
  "components/ReadyCheckCard.tsx": 1, "components/RefineLaunchDialog.tsx": 1,
  "components/RefineStrategyPicker.tsx": 3, "components/RefineWorkbench.tsx": 4,
  "components/RichEditorView.tsx": 1, "components/RouteInfoPopover.tsx": 3,
  "components/ScreenSelectOverlay.tsx": 5, "components/SecondPassPanel.tsx": 2,
  "components/SessionDetailPanel.tsx": 1, "components/SessionListPanel.tsx": 3,
  "components/SessionRowContextMenu.tsx": 1, "components/SessionSearchBar.tsx": 1,
  "components/SessionSearchHits.tsx": 1, "components/SessionSelectionToolbar.tsx": 2,
  "components/SopRunOverlay.tsx": 3, "components/SpeakerSwitchCard.tsx": 1,
  "components/StructureImageSection.tsx": 1, "components/StructureModelSetting.tsx": 1,
  "components/TaskConversationView.tsx": 9, "components/TaskLaunchDialog.tsx": 2,
  "components/TaskThreadCard.tsx": 3, "components/VersionPanel.tsx": 4, "components/VideoImportPanel.tsx": 1,
  "components/VocabManager.tsx": 4, "components/WebArticleView.tsx": 4, "components/WebImportPanel.tsx": 1,
  "components/WebInboxPanel.tsx": 1, "components/action-center/ActionCenterPanel.tsx": 7,
  "components/chat/ChatLaunchMenu.tsx": 4, "components/note-selection/SelectionActionMenu.tsx": 1,
  "components/review/ReviewSessionPanel.tsx": 1, "components/session-detail/SessionDetailHeader.tsx": 2,
  "components/session-detail/SessionRefineSection.tsx": 3,
  "components/session-detail/SessionScreenCards.tsx": 3, "pages/ChatPage.tsx": 2, "pages/GoalsPage.tsx": 3,
  "pages/KnowledgePage.tsx": 3, "pages/ReviewPage.tsx": 2,
};

/** 棘轮三 · 阴影 `boxShadow:` 的冻结总数（规格 §4.1 红线；T17-B 后**处数不变**，变的是值收敛 11 → 6 个） */
export const FROZEN_SHADOW_TOTAL = 24;

/** 相对 `app/src` 的路径 → `boxShadow:` 的**处数上限**（只许降） */
export const FROZEN_SHADOW_BY_FILE: Readonly<Record<string, number>> = {
  "components/AiConversationDock.tsx": 1, "components/BrowserChrome.tsx": 1,
  "components/CanvasNodeConcept.tsx": 1, "components/CanvasNodeModel.tsx": 1,
  "components/CanvasNodeQuestion.tsx": 1, "components/CaptureOverlayPanel.tsx": 1,
  "components/GroupRowContextMenu.tsx": 1, "components/GroupSidebarRow.tsx": 1,
  "components/KnowledgeCanvasView.tsx": 1, "components/KnowledgeGraphView.tsx": 1,
  "components/NoteEditView.tsx": 1, "components/NoteHeaderActions.tsx": 1,
  "components/NoteLinkToSystem.tsx": 1, "components/NoteListBatchMenu.tsx": 1,
  "components/NoteMoveToGroupMenu.tsx": 1, "components/NoteRowContextMenu.tsx": 1,
  "components/RichEditorView.tsx": 1, "components/RouteInfoPopover.tsx": 1,
  "components/ScreenSelectOverlay.tsx": 1, "components/SessionRowContextMenu.tsx": 1,
  "components/SystemStatusBadge.tsx": 1, "components/WindowSelectCard.tsx": 1,
  "components/chat/ChatLaunchMenu.tsx": 1, "components/note-selection/SelectionActionMenu.tsx": 1,
};

/**
 * 域内 `<Surface` 开标签的冻结数（**T17-A 为 0 ⇒ T17-B 迁移后抬到实测 14**）。
 * Why 当初冻结一个"零"：`tmp/t17a/measure.mjs` 实测迁移前**全仓 0 个调用点用 `Surface`** ⇒ ADR-033 §4 的
 *   「调用点不得用行内 `style` 覆盖原语语义」这条判据对真实代码是**空真**的。T17-B 迁进 14 个开标签后
 *   该判据**第一次有了真实输入**（同批实测行内覆盖 = **0**，即 14 个开标签无一用 `style` 覆盖底/圆角/边框）。
 * 只许降（再迁一处 ⇒ 手工收紧本常数；**不许**为图省事把它调大去容纳未迁的调用点）。
 */
export const FROZEN_SURFACE_TAG_TOTAL = 14;

/**
 * 锚（三份；判据 ④ 逐条比对）—— `entries` = 基线条目数（防"表被悄悄删条目"）、
 * `file/value` = 一个**具名文件**的冻结值（防"仪器静默失效后所有计数都变 0 而总数判据仍绿"）。
 * T17-B 同步：边框条目 111 → 108 · 圆角条目 112 → 109 · 阴影条目 24（不变）。
 */
export const BORDER_ANCHOR = { entries: 108, file: "components/action-center/ActionCenterPanel.tsx", value: 11 } as const;
export const RADIUS_OUTLIER_ANCHOR = { entries: 109, file: "components/KnowledgeSystemWizard.tsx", value: 9 } as const;
export const SHADOW_ANCHOR = { entries: 24, file: "components/NoteRowContextMenu.tsx", value: 1 } as const;

/** 阴影残留的分类：`exception` = 结构上表达不了 · `anchored-menu` = B1 锚定菜单（不迁原语）· `backlog` = 切片外余量 */
export type ShadowResidualKind = "exception" | "anchored-menu" | "backlog";

/**
 * 允许残留的**逐文件理由**（照 `loadingBaseline.ts` 的 `RESIDUAL` 范式）。
 * 每条都必须：分类合法 ∧ 理由非空 ∧ 该文件此刻**仍然命中** —— 防"僵尸豁免"（一处被迁走却仍挂在
 * 豁免表里，下一个人就会以为它还在）。键集必须**逐字等于**「冻结表里值 > 0」的键集（两侧都查）。
 */
export const SHADOW_RESIDUAL: readonly { file: string; kind: ShadowResidualKind; reason: string }[] = [
  { file: "components/AiConversationDock.tsx", kind: "exception", reason: "`-8px 0 24px` 是**方向性**边缘投影（dock 向左升起）；`--ed-shadow-1/2` 是双向环境投影（`0 1px 2px …, 0 4px 12px …`）⇒ 换成 token 会丢掉「从右边滑出来」的暗示，属观感变化，登记给批 5" },
  { file: "components/BrowserChrome.tsx", kind: "anchored-menu", reason: "B1 锚定菜单族（计划 §表 4 的 TABLE4_ALIAS，`data-app-menu` 右键菜单，`zIndex(\"popover\")`）⇒ 不迁原语；T17-B 第 1 批已把字面量换成 `boxShadow: \"var(--ed-shadow-1)\"`（token 引用不是字面量）" },
  { file: "components/CanvasNodeConcept.tsx", kind: "backlog", reason: "不在 B11 切片内（画布节点族）⇒ 余量登记给批 5/7" },
  { file: "components/CanvasNodeModel.tsx", kind: "backlog", reason: "不在 B11 切片内（画布节点族）⇒ 余量登记给批 5/7" },
  { file: "components/CanvasNodeQuestion.tsx", kind: "backlog", reason: "不在 B11 切片内（画布节点族）⇒ 余量登记给批 5/7" },
  { file: "components/CaptureOverlayPanel.tsx", kind: "exception", reason: "`0 0 0 9999px rgba(0,0,0,0.45)` 是**用巨扩散当全屏遮罩**，不是投影；且该文件是 B2 的「不迁覆盖层」⇒ 结构上无法由 `--ed-shadow-*` 承载" },
  { file: "components/GroupRowContextMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（硬守卫：该文件源码不得出现 `ui/primitives`）⇒ 不迁原语；T17-B 第 1 批已把字面量换成 `boxShadow: \"var(--ed-shadow-1)\"`（token 引用不是字面量）" },
  { file: "components/GroupSidebarRow.tsx", kind: "anchored-menu", reason: "组色选择浮层（`position:absolute; top:100%` + `zIndex(\"popover\")`）⇒ 锚定菜单族，同 B1 处置" },
  { file: "components/KnowledgeCanvasView.tsx", kind: "exception", reason: "`0 2px 8px rgba(15,118,110,0.25)` 是**语义色**（青绿）投影，配根节点 `background:#0f766e`；`--ed-shadow-1/2` 是暖墨中性投影 ⇒ 换 token 会丢语义，需批 5/8 裁决" },
  { file: "components/KnowledgeGraphView.tsx", kind: "exception", reason: "`boxShadow: data.focused ? \"0 0 0 2px #fff, 0 0 0 4px #0f766e\" : \"…\"` 是**表达式双态**，focused 分支是焦点环不是投影 ⇒ 需逐分支改写，不在本批" },
  { file: "components/NoteEditView.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（高亮气泡，透明点击层）⇒ 不迁原语" },
  { file: "components/NoteHeaderActions.tsx", kind: "anchored-menu", reason: "笔记颜色选择浮层（`data-testid=\"note-color-picker-pop\"`，`zIndex(\"popover\")`）⇒ 锚定菜单族" },
  { file: "components/NoteLinkToSystem.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（透明层）⇒ 不迁原语" },
  { file: "components/NoteListBatchMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（批量菜单）⇒ 不迁原语" },
  { file: "components/NoteMoveToGroupMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（移动菜单）⇒ 不迁原语" },
  { file: "components/NoteRowContextMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（行右键菜单）⇒ 不迁原语；本文件同时是阴影棘轮的锚" },
  { file: "components/RichEditorView.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（高亮气泡）⇒ 不迁原语" },
  { file: "components/RouteInfoPopover.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（路由信息气泡）⇒ 不迁原语" },
  { file: "components/ScreenSelectOverlay.tsx", kind: "exception", reason: "`0 0 0 1px rgba(255,255,255,0.25)` 是**白色反相描边环**（截图上的框选提示），不是投影；且该文件是 B2 的「不迁覆盖层」" },
  { file: "components/SessionRowContextMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（会话行右键菜单）⇒ 不迁原语" },
  { file: "components/SystemStatusBadge.tsx", kind: "anchored-menu", reason: "徽标的点击浮层（白底 + 边框 + `zIndex(\"popover\")`）⇒ 锚定菜单族" },
  { file: "components/WindowSelectCard.tsx", kind: "anchored-menu", reason: "「推荐窗口」下拉浮层（`position:absolute; top:100%`）⇒ 锚定菜单族" },
  { file: "components/chat/ChatLaunchMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（T13-b 从 `pages/ChatPage.tsx` 搬来的同一段）⇒ 不迁原语" },
  { file: "components/note-selection/SelectionActionMenu.tsx", kind: "anchored-menu", reason: "B1 的 `NON_MIGRATED_14` 成员（选区动作菜单）⇒ 不迁原语" },
];

