/**
 * @ai-context 原生 `<button>` 的**冻结基线**（批 4 B4 裁决的落点）。
 *
 * Why 冻结在"文件 → 计数"粒度，而不是 zIndex.guard 那样的"逐行原文"粒度：
 *   ① 逐行冻结会得到 **385 条**条目 ⇒ 数据文件 >300 行，**直接违反本仓的行数红线**；
 *   ② 本批有**拆件**任务（B7：`ChatPage.tsx` 599/600 必须先拆）—— 逐行 key 会因为
 *      "同一行搬到了新文件"而从"命中"变成"新增"，产生**假红**；
 *   ③ 棘轮要防的是"永远迁不完"⇒ **总量 + 逐文件只减不增**在计数粒度上是完整的
 *      （逐文件防局部回潮、总量防全局回潮）。
 *
 * 副作用：无（纯数据，被 `nativeButton.ratchet.test.ts` 读）。边界：**基线只许被"拆件搬运"**
 *   修改（见 `SPLIT_MOVES`）——把计数从一个键挪到另一个键、总量逐字不变；其它改动都是回潮。
 *
 * ★ 扫描口径（与 `tmp/classify.mjs` 的 `buttonTag` **逐字同源**，口径本身是守卫的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**` 减 `ui/icons/**`；
 *   ② **先剥注释**（`//` 与 `/* *\/` 抹为等长空白）；字符串/模板字面量**只跳过不抹内容**
 *      ⇒ 字符串里写 `<button` 会被误计（实测本仓 **0 例**，见报告的口径审计）；
 *   ③ 计「处」= 剥注释后**整段文本**上 `/<button[\s>]/g` 的匹配数（**不是逐行** —— 逐行会把
 *      跨行标签漏掉，同一棵树实测逐行 385 vs 整段 510）；④ 不记 `</button>`、`<Button>`。
 *
 * ★ 批 4 T12 的迁移与**基线收紧**（2026-09-12；T12 实施者实测，仪器 = 与守卫同源探针）
 *   迁移前（`dev@bde807dc` 导出树）**493 处 / 121 文件** · `const *Btn*` **79 行 / 55 文件**；
 *   迁移后（T12 工作树）**402 处 / 114 文件** · `const *Btn*` **56 行 / 44 文件**。
 *   Δ = **−91 处**（逐文件 Δ 之和逐字等于迁过的处数 ⇒ 机理对拍通过；T5–T10 已先降 510→493）。
 *
 * ★ 余量去向（B4 的"口径变化 + 余量去向"，**不许把 §5.1 的 107/63 悄悄改成 80/55**）
 *   规格 §5.1 的「Button | 107 处 / 63 文件」**口径不可考**（`btnStyle` 标识符全仓 0 命中）⇒
 *   实测三口径：原生 `<button>`（本文件冻结）· `const *Btn*` 常量族 · `style={xxxBtn}` 消费者。
 *   **T12 只迁直接形态 91 处 / 34 文件**（T1 §B 的 37 文件减去 3 个登记例外，见下），
 *   余量（402 处 − 后续批次已迁）登记给**批 5/7**，由本棘轮冻结。**两个登记例外**：
 *   ① `components/AiProviderSettings.tsx`（8 处，与 T11 并行撞车，见 T12 报告 §7 缺口表）；
 *   ② `components/GroupRowContextMenu.tsx`（2 处）+ `components/RichEditorView.tsx`（3 处）——
 *      二者在 T8 的 `NON_MIGRATED_14`（B1 锚定菜单）里，而 `dialogMigration.e.test.ts:240-244`
 *      断言这 14 个文件**不得 import 原语层** ⇒ 迁按钮会绕过 B1，**既有断言不改**，故不迁。
 */
export const FROZEN_NATIVE_BUTTON_TOTAL = 402;

/** `const *Btn*` 样式常量族的冻结**行数**（T12 迁移后实测 56；迁移前 79）。 */
export const FROZEN_BTN_STYLE_CONST_LINES = 56;

/** `const *Btn*` 样式常量族的冻结**文件数**（T12 迁移后实测 44；迁移前 55）。 */
export const FROZEN_BTN_STYLE_CONST_FILES = 44;

/** 相对 `app/src` 的路径 → 基线计数（T12 迁移后实测：402 处 / 114 文件） */
export const FROZEN_NATIVE_BUTTON_BY_FILE: Readonly<Record<string, number>> = {
  "components/action-center/ActionCenterPanel.tsx": 11,
  "components/AiConversationDock.tsx": 9,
  "components/AiProviderSettings.tsx": 13,
  "components/AiRefineCard.tsx": 3,
  "components/AiServicePanel.tsx": 3,
  "components/AiTaskPanel.tsx": 1,
  "components/AppErrorBoundary.tsx": 2,
  "components/AsrConfusionPanel.tsx": 2,
  "components/AudioStoragePanel.tsx": 1,
  "components/BackupPanel.tsx": 2,
  "components/BoxSelectOverlay.tsx": 3,
  "components/BrowserChrome.tsx": 1,
  "components/CaptureFloatPanel.tsx": 3,
  "components/CaptureOverlayPanel.tsx": 2,
  "components/ChatComposer.tsx": 2,
  "components/ChatMessageList.tsx": 2,
  "components/ChatSaveNoteDialog.tsx": 4,
  "components/ChatSidebar.tsx": 2,
  "components/CitationChips.tsx": 1,
  "components/ClassroomBanners.tsx": 1,
  "components/ClassroomCapturePanel.tsx": 7,
  "components/ClassroomRightPane.tsx": 2,
  "components/ClassroomSourceColumn.tsx": 1,
  "components/DiscoverySuggestSection.tsx": 2,
  "components/EnrichPanel.tsx": 5,
  "components/FeedFragmentList.tsx": 6,
  "components/GoalDetail.tsx": 17,
  "components/GroupCreateDialog.tsx": 1,
  "components/GroupDeleteConfirm.tsx": 3,
  "components/GroupRowContextMenu.tsx": 5,
  "components/GroupSidebar.tsx": 6,
  "components/GroupSidebarRow.tsx": 2,
  "components/ImageGallery.tsx": 1,
  "components/ImagePreviewOverlay.tsx": 1,
  "components/InterviewDialog.tsx": 1,
  "components/InterviewSteps.tsx": 2,
  "components/KnowledgeCanvasView.tsx": 2,
  "components/KnowledgeConceptDialog.tsx": 2,
  "components/KnowledgeDecisionForm.tsx": 2,
  "components/KnowledgeDecisionLog.tsx": 2,
  "components/KnowledgeDetailPanel.tsx": 4,
  "components/KnowledgeGraphView.tsx": 3,
  "components/KnowledgeLinkSection.tsx": 4,
  "components/KnowledgeModelDialog.tsx": 2,
  "components/KnowledgeSampleView.tsx": 1,
  "components/KnowledgeSystemWizard.tsx": 5,
  "components/KnowledgeTreeView.tsx": 3,
  "components/LearningLibraryEngineSection.tsx": 2,
  "components/LearningLibraryPanel.tsx": 1,
  "components/LinkEntityPicker.tsx": 1,
  "components/LiveActivityPanel.tsx": 1,
  "components/LiveImageStrip.tsx": 3,
  "components/LiveProfileStrip.tsx": 4,
  "components/MaterialInputPanel.tsx": 1,
  "components/ModelCardCreateDialog.tsx": 1,
  "components/ModelDiskPanel.tsx": 1,
  "components/note-selection/SelectionActionMenu.tsx": 1,
  "components/NoteAiDialog.tsx": 3,
  "components/NoteColorPicker.tsx": 2,
  "components/NoteEditView.tsx": 18,
  "components/NoteHeaderActions.tsx": 2,
  "components/NoteLinkToSystem.tsx": 6,
  "components/NoteListBatchMenu.tsx": 10,
  "components/NoteListToolbar.tsx": 4,
  "components/NoteMoveToGroupMenu.tsx": 3,
  "components/NotePreviewView.tsx": 4,
  "components/NoteReadingView.tsx": 7,
  "components/NoteRowContextMenu.tsx": 11,
  "components/NoteTreeSection.tsx": 2,
  "components/OcrDeviceSetting.tsx": 1,
  "components/PhotoCapturePanel.tsx": 6,
  "components/PracticeQuestionsOverlays.tsx": 1,
  "components/ProfileDetector.tsx": 1,
  "components/PromoteCardButton.tsx": 2,
  "components/ProofreadPanel.tsx": 3,
  "components/ProofreadToggle.tsx": 1,
  "components/ReadyCheckCard.tsx": 1,
  "components/RefineLaunchDialog.tsx": 4,
  "components/RefineStrategyPicker.tsx": 2,
  "components/RefineWorkbench.tsx": 5,
  "components/RetroTimeline.tsx": 1,
  "components/review/ReviewSessionPanel.tsx": 4,
  "components/RichEditorView.tsx": 20,
  "components/RouteInfoPopover.tsx": 12,
  "components/ScreenSelectOverlay.tsx": 3,
  "components/SecondPassPanel.tsx": 4,
  "components/session-detail/SessionDetailHeader.tsx": 2,
  "components/session-detail/SessionRefineSection.tsx": 3,
  "components/session-detail/SessionScreenCards.tsx": 1,
  "components/SessionDetailPanel.tsx": 1,
  "components/SessionListBody.tsx": 1,
  "components/SessionListPanel.tsx": 2,
  "components/SessionRowContextMenu.tsx": 5,
  "components/SessionSelectionToolbar.tsx": 3,
  "components/SopRunOverlay.tsx": 2,
  "components/SpeakerSwitchCard.tsx": 1,
  "components/StructureImageSection.tsx": 1,
  "components/StructureModelSetting.tsx": 1,
  "components/SystemBadge.tsx": 1,
  "components/TaskConversationView.tsx": 8,
  "components/TaskLaunchDialog.tsx": 2,
  "components/TaskThreadCard.tsx": 5,
  "components/VersionPanel.tsx": 3,
  "components/VideoImportPanel.tsx": 2,
  "components/VocabManager.tsx": 5,
  "components/WebArticleView.tsx": 2,
  "components/WebInboxPanel.tsx": 1,
  "components/WeekContractCard.tsx": 4,
  "components/WindowSelectCard.tsx": 4,
  "pages/ChatPage.tsx": 5,
  "pages/GoalsPage.tsx": 2,
  "pages/KnowledgePage.tsx": 10,
  "pages/ReviewPage.tsx": 4,
  "shell/TopBar.tsx": 2,
};

/** 允许"搬运计数"的文件（拆件产物）：形如 "新文件|源文件"，两侧计数之和必须不变 */
export const SPLIT_MOVES: readonly string[] = [];
