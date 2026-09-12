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
 * 副作用：无（纯数据，被 `nativeButton.ratchet.test.ts` 读）。边界：**基线只许被"拆件搬运"
 *   修改**（见 `SPLIT_MOVES`）——把计数从一个键挪到另一个键、总量逐字不变；其它改动都是回潮。
 *
 * ★ 扫描口径（与 `tmp/classify.mjs` 的 `buttonTag` **逐字同源**，口径本身是守卫的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**` 减 `ui/icons/**`；
 *   ② **先剥注释**（`//` 与 `/* *\/` 抹为等长空白）；字符串/模板字面量**只跳过不抹内容**
 *      ⇒ 字符串里写 `<button` 会被误计（实测本仓 **0 例**，见报告的口径审计）；
 *   ③ 计「处」= 剥注释后**整段文本**上 `/<button[\s>]/g` 的匹配数（**不是逐行** —— 逐行会把
 *      跨行标签漏掉，同一棵树实测逐行 385 vs 整段 510）；④ 不记 `</button>`、`<Button>`。
 *
 * ★ 余量去向（B4 的"口径变化 + 余量去向"，**不许把 §5.1 的 107/63 悄悄改成 80/55**）
 *   规格 §5.1 的「Button | 107 处 / 63 文件」**口径不可考**（`btnStyle` 标识符全仓 0 命中）⇒
 *   实测三口径：原生 `<button>` **510 处 / 121 文件**（本文件冻结）·
 *   `const *Btn*` 常量族 **80 行 / 55 文件** · `style={xxxBtn}` 消费者
 *   **103 行 / 37 文件**（T12 真迁移面）。⇒ 余量 **≈ 407 处登记给批 5/7**，由本棘轮冻结。
 */
export const FROZEN_NATIVE_BUTTON_TOTAL = 510;

/** `const *Btn*` 样式常量族的冻结**行数**（批 4 只迁 `style={xxxBtn}` 的 103 行消费者）。 */
export const FROZEN_BTN_STYLE_CONST_LINES = 80;

/** `const *Btn*` 样式常量族的冻结**文件数**。 */
export const FROZEN_BTN_STYLE_CONST_FILES = 55;

/** 相对 `app/src` 的路径 → 基线计数（批 4 开工实测：510 处 / 121 文件） */
export const FROZEN_NATIVE_BUTTON_BY_FILE: Readonly<Record<string, number>> = {
  "components/AiConversationDock.tsx": 9,
  "components/AiProviderSettings.tsx": 13,
  "components/AiRefineCard.tsx": 4,
  "components/AiServicePanel.tsx": 4,
  "components/AiTaskPanel.tsx": 4,
  "components/AppErrorBoundary.tsx": 2,
  "components/AsrConfusionPanel.tsx": 3,
  "components/AudioStoragePanel.tsx": 1,
  "components/BackupPanel.tsx": 2,
  "components/BoxSelectOverlay.tsx": 3,
  "components/BrowserChrome.tsx": 1,
  "components/CaptureFloatPanel.tsx": 8,
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
  "components/EnrichPanel.tsx": 9,
  "components/FeedFragmentList.tsx": 6,
  "components/GoalDetail.tsx": 17,
  "components/GoalPlanApprovalDialog.tsx": 4,
  "components/GraduateDialog.tsx": 4,
  "components/GroupCreateDialog.tsx": 2,
  "components/GroupDeleteConfirm.tsx": 4,
  "components/GroupRowContextMenu.tsx": 5,
  "components/GroupSidebar.tsx": 6,
  "components/GroupSidebarRow.tsx": 2,
  "components/ImageGallery.tsx": 2,
  "components/ImagePreviewOverlay.tsx": 1,
  "components/InterviewDialog.tsx": 6,
  "components/InterviewSteps.tsx": 2,
  "components/KnowledgeCanvasView.tsx": 2,
  "components/KnowledgeConceptDialog.tsx": 3,
  "components/KnowledgeDecisionForm.tsx": 3,
  "components/KnowledgeDecisionLog.tsx": 2,
  "components/KnowledgeDetailPanel.tsx": 4,
  "components/KnowledgeGraphView.tsx": 3,
  "components/KnowledgeLinkSection.tsx": 4,
  "components/KnowledgeModelDialog.tsx": 3,
  "components/KnowledgeSampleView.tsx": 1,
  "components/KnowledgeSystemWizard.tsx": 6,
  "components/KnowledgeTreeView.tsx": 12,
  "components/LearningLibraryEngineSection.tsx": 2,
  "components/LearningLibraryPanel.tsx": 1,
  "components/LinkEntityPicker.tsx": 2,
  "components/LiveActivityPanel.tsx": 1,
  "components/LiveImageStrip.tsx": 3,
  "components/LiveProfileStrip.tsx": 4,
  "components/MaterialInputPanel.tsx": 3,
  "components/ModelCardCreateDialog.tsx": 2,
  "components/ModelCardFromNoteDialog.tsx": 2,
  "components/ModelDiskPanel.tsx": 1,
  "components/ModelManagementPanel.tsx": 2,
  "components/NoteAiDialog.tsx": 5,
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
  "components/PracticeQuestionsOverlays.tsx": 7,
  "components/ProfileDetector.tsx": 1,
  "components/PromoteCardButton.tsx": 2,
  "components/ProofreadPanel.tsx": 5,
  "components/ProofreadToggle.tsx": 1,
  "components/ReadyCheckCard.tsx": 1,
  "components/RefineLaunchDialog.tsx": 6,
  "components/RefineStrategyPicker.tsx": 4,
  "components/RefineWorkbench.tsx": 7,
  "components/RetroTimeline.tsx": 1,
  "components/RichEditorView.tsx": 20,
  "components/RouteInfoPopover.tsx": 12,
  "components/ScreenSelectOverlay.tsx": 3,
  "components/SecondPassPanel.tsx": 8,
  "components/SessionDetailPanel.tsx": 1,
  "components/SessionListBody.tsx": 1,
  "components/SessionListPanel.tsx": 2,
  "components/SessionListRow.tsx": 2,
  "components/SessionRowContextMenu.tsx": 5,
  "components/SessionSearchBar.tsx": 5,
  "components/SessionSelectionToolbar.tsx": 4,
  "components/SopRunOverlay.tsx": 9,
  "components/SpeakerSwitchCard.tsx": 1,
  "components/StructureImageSection.tsx": 3,
  "components/StructureModelSetting.tsx": 1,
  "components/SystemBadge.tsx": 1,
  "components/TaskConversationView.tsx": 8,
  "components/TaskLaunchDialog.tsx": 2,
  "components/TaskThreadCard.tsx": 5,
  "components/VersionPanel.tsx": 3,
  "components/VideoImportPanel.tsx": 3,
  "components/VocabManager.tsx": 9,
  "components/WebArticleView.tsx": 3,
  "components/WebImportPanel.tsx": 1,
  "components/WebInboxPanel.tsx": 3,
  "components/WeekContractCard.tsx": 4,
  "components/WindowSelectCard.tsx": 4,
  "components/action-center/ActionCenterPanel.tsx": 18,
  "components/note-selection/SelectionActionMenu.tsx": 1,
  "components/review/ReviewSessionPanel.tsx": 4,
  "components/session-detail/SessionDetailHeader.tsx": 3,
  "components/session-detail/SessionRefineSection.tsx": 3,
  "components/session-detail/SessionScreenCards.tsx": 1,
  "pages/ChatPage.tsx": 5,
  "pages/GoalsPage.tsx": 4,
  "pages/KnowledgePage.tsx": 10,
  "pages/ReviewPage.tsx": 4,
  "shell/TopBar.tsx": 2,
};

/** 允许"搬运计数"的文件（拆件产物）：形如 "新文件|源文件"，两侧计数之和必须不变 */
export const SPLIT_MOVES: readonly string[] = [];
