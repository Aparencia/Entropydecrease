/**
 * @ai-context T16「弱化文本 → `Text`」与「字号越界」的**两条棘轮基线**（批 4 B11 的切片 + 棘轮）。
 *
 * Why 两条（规格 §5.1 的同源病灶：「字号与两个灰手写组合，对比度逐处失控」）：
 *   ① **弱化灰 `#9ca3af`** —— 白底实测 ≈2.54:1，远低于 4.5:1 正文线；终点是墨度只从 `Text` 的
 *      `tone` 出。但仓内大量同色字面量属非「弱化文本」语境（`background` / `border` / SVG
 *      `fill` / 图形画布）⇒ 不该清零 ⇒ 冻结存量、只许减。
 *   ② **字号越界 <12px**（9/9.5/10/10.5/11/11.5）—— 规格 §4.2 是「下界 12px；10px/11px 一律
 *      消灭」。604 处的观感一次性改且**几乎没有测试面** ⇒ 按 R2 只冻结不迁移；映射规则与规模
 *      见 `tmp/t16a/slice.md`，执行登记给批 5/6（批 6 重排字距时一并做更合理）。
 *
 * ★ 计次口径（选定后写死；换算已自证）
 *   域 = `app/src/**` 的 `.ts`/`.tsx` **减** `*.test.ts(x)` **减** `ui/primitives/**`
 *     （原语层是墨度与字阶的真源，不是待收敛的调用点 —— 同 `statusLineBaseline` / T1 的 `prod`）。
 *   **先剥注释**（复用 `sliceScan.ts` 的状态机；字符串与模板只跳过、不抹内容）。
 *   弱化灰取**行**口径（同行多次算 1；T1 的 295 / 上一轮探针的 246 同此）；字号越界取**处**口径
 *   （逐次命中；计划的 604 同此）。⚠️ 两口径在本域**恰好等值**：`tmp/t16a/unit-check.mjs` 实测
 *   「同一行两次命中」的行数两条都是 **0** ⇒ 换算系数 **1.0000**，故「行 == 处」可直接互引。
 *   若将来某行出现两次命中，行口径会**少算**（棘轮偏松）⇒ 按处口径重测并收紧。
 *
 * ★ 数字来源（同一支探针跑三棵树；机理逐条见 `tmp/t16a/mechanism.md`，本文件只留结论）
 *   弱化灰行/文件：计划 42e88740 **295/105**（计划文案写 296 ⇒ 手抄噪声）→ 上一轮探针
 *   8f5bd9f1 **246/98** → 本单元 HEAD **249/100**；字号越界处/文件：**604/124 → 576/122 → 558/120**；
 *   `fontSize` 全量 **1274 → 1171 → 1123**。三段差各有主：−49 行灰是批 4 已落库的 T13/T14/T15
 *   迁移（37 文件、7 文件清零）；其后 +3 行灰是 **T15 的 B1/B2 守卫回退**（`NoteLinkToSystem`
 *   4→5 · `NoteMoveToGroupMenu` 0→1 · `NoteRowContextMenu` 0→1，非本单元动作）；上一轮探针的
 *   「576」= 同一正则**少了 `11.5` 一个值类**（×10）且跑在 8f5bd9f1 上 ⇒ 576 = 586 − 10，
 *   **不是口径差**（`regex-diff.mjs` 实测两条正则的全量命中只差 1 处、越界多重集差 0 行）。
 *
 * ★ 冻结粒度 = **文件 → 计数**（同 `nativeButtonBaseline` / `loadingBaseline`）：逐行 key 会在拆件
 *   与行号漂移时假红；棘轮要防的是「永远迁不完」⇒ 总量 + 逐文件只减不增是完整的。
 *   两条**不变的锚**（防「整表被换掉」）见 `ANCHOR_*`：条目数 + 一个具名文件的冻结值。
 *
 * 副作用：无（纯数据，被 `textRatchet.test.ts` 读）。边界：**棘轮只许降** —— 真迁走一处要
 *   **手工收紧**（`FROZEN_*_TOTAL` 必须恰等于逐文件之和，由测试断言；常数不许手工改成自洽）。
 */

/** 弱化灰冻结**总行数**（= `FROZEN_MUTED_GRAY_BY_FILE` 逐文件之和；只许降） */
export const FROZEN_MUTED_GRAY_TOTAL = 249;

/** 弱化灰冻结**文件数**（条目数；迁移清零一个文件 ⇒ 必须删键，条目数随之降） */
export const FROZEN_MUTED_GRAY_FILES = 100;

/** 字号越界冻结**总处数**（= `FROZEN_FONT_OOB_BY_FILE` 逐文件之和；只许降） */
export const FROZEN_FONT_OOB_TOTAL = 558;

/** 字号越界冻结**文件数**（条目数；只许降） */
export const FROZEN_FONT_OOB_FILES = 120;

/**
 * 锚（anti-table-swap）：条目数 + 一个具名文件的冻结值。换一张同样「自洽」的表在计数口径下是
 * 可能的，锚把「哪个文件的哪个计数」也钉住 ⇒ 换表必红。选它们是因为量大且都不是本批的迁移目标。
 */
export const ANCHOR_MUTED_GRAY = { file: "components/LiveActivityPanel.tsx", count: 9, files: 100 } as const;
export const ANCHOR_FONT_OOB = { file: "components/action-center/ActionCenterPanel.tsx", count: 19, files: 120 } as const;

/**
 * 相对 `app/src` 的正斜杠路径 → 该文件**允许残留的弱化灰行数上限**（只许降，键不许新增）。
 * ⚠️ 迁移清零一个文件时**删键**（不是改成 0）—— 留 0 值键会让「基线未登记的文件命中 = 0」这条
 * 判据的语义变模糊（`loadingBaseline` 用 0 表示「已交给原语」，本表不采用那个约定）。
 */
export const FROZEN_MUTED_GRAY_BY_FILE: Readonly<Record<string, number>> = {
  "components/AiConversationDock.tsx": 3,
  "components/AiProviderSettings.tsx": 1,
  "components/AiServicePanel.tsx": 1,
  "components/AiTaskPanel.tsx": 3,
  "components/AsrConfusionPanel.tsx": 4,
  "components/AudioLevelMeter.tsx": 1,
  "components/BackupPanel.tsx": 1,
  "components/CaptureFloatPanel.tsx": 3,
  "components/ChatComposer.tsx": 1,
  "components/ChatMessageList.tsx": 2,
  "components/ChatSidebar.tsx": 5,
  "components/CitationChips.tsx": 1,
  "components/ClassroomCapturePanel.tsx": 1,
  "components/ClassroomSourceColumn.tsx": 1,
  "components/ConceptCardRow.tsx": 2,
  "components/DiscoverySuggestSection.tsx": 2,
  "components/EnrichPanel.tsx": 1,
  "components/FeatureFlagSetting.tsx": 2,
  "components/FeedFragmentList.tsx": 3,
  "components/GoalAiSection.tsx": 2,
  "components/GoalCard.tsx": 1,
  "components/GoalDetail.tsx": 5,
  "components/GoalPlanApprovalDialog.tsx": 3,
  "components/GraduateDialog.tsx": 4,
  "components/GroupSidebar.tsx": 6,
  "components/GroupSidebarRow.tsx": 3,
  "components/InterviewDialog.tsx": 4,
  "components/InterviewSteps.tsx": 3,
  "components/KnowledgeCanvasView.tsx": 1,
  "components/KnowledgeConceptDialog.tsx": 1,
  "components/KnowledgeDecisionForm.tsx": 1,
  "components/KnowledgeDecisionLog.tsx": 2,
  "components/KnowledgeDetailPanel.tsx": 4,
  "components/KnowledgeGraphView.tsx": 4,
  "components/KnowledgeLinkSection.tsx": 3,
  "components/KnowledgeModelDialog.tsx": 1,
  "components/KnowledgeSystemWizard.tsx": 3,
  "components/KnowledgeTreeView.tsx": 4,
  "components/LearningLibraryEngineSection.tsx": 3,
  "components/LearningLibraryPanel.tsx": 2,
  "components/LiveActivityPanel.tsx": 9,
  "components/LiveImageStrip.tsx": 1,
  "components/LiveProfileStrip.tsx": 2,
  "components/MaterialInputPanel.tsx": 2,
  "components/ModelManagementPanel.tsx": 3,
  "components/NoteAiDialog.tsx": 1,
  "components/NoteColorPicker.tsx": 2,
  "components/NoteEditView.tsx": 1,
  "components/NoteImage.tsx": 1,
  "components/NoteLinkToSystem.tsx": 5,
  "components/NoteListBatchMenu.tsx": 1,
  "components/NoteListBody.tsx": 1,
  "components/NoteListRow.tsx": 2,
  "components/NoteListToolbar.tsx": 1,
  "components/NoteMoveToGroupMenu.tsx": 1,
  "components/NotePreviewView.tsx": 2,
  "components/NoteReadingView.tsx": 2,
  "components/NoteRowContextMenu.tsx": 1,
  "components/NoteTreeSection.tsx": 2,
  "components/OcrDeviceSetting.tsx": 3,
  "components/PracticeQuestionsOverlays.tsx": 5,
  "components/ProfileDetector.tsx": 5,
  "components/ProofreadPanel.tsx": 2,
  "components/ProofreadToggle.tsx": 1,
  "components/ReadyCheckCard.tsx": 3,
  "components/RefineStrategyPicker.tsx": 2,
  "components/RefineWorkbench.tsx": 1,
  "components/RetroTimeline.tsx": 3,
  "components/RichEditorView.tsx": 1,
  "components/RouteInfoPopover.tsx": 3,
  "components/SealToggle.tsx": 1,
  "components/SecondPassPanel.tsx": 4,
  "components/SessionDetailPanel.tsx": 4,
  "components/SessionListBody.tsx": 3,
  "components/SessionListPanel.tsx": 1,
  "components/SessionSearchHits.tsx": 2,
  "components/SopRunOverlay.tsx": 4,
  "components/SpeakerSwitchCard.tsx": 4,
  "components/StructureModelSetting.tsx": 1,
  "components/TaskConversationView.tsx": 2,
  "components/TaskLaunchDialog.tsx": 1,
  "components/TaskThreadCard.tsx": 2,
  "components/VersionPanel.tsx": 3,
  "components/VideoImportPanel.tsx": 1,
  "components/VocabManager.tsx": 2,
  "components/WebArticleView.tsx": 1,
  "components/WebImportPanel.tsx": 1,
  "components/WebInboxPanel.tsx": 2,
  "components/WeekContractCard.tsx": 3,
  "components/WindowSelectCard.tsx": 5,
  "components/action-center/ActionCenterPanel.tsx": 12,
  "components/notes/NotesReadingColumn.tsx": 1,
  "components/review/ReviewSessionPanel.tsx": 2,
  "components/session-detail/SessionScreenCards.tsx": 3,
  "pages/ChatPage.tsx": 2,
  "pages/GoalsPage.tsx": 3,
  "pages/KnowledgePage.tsx": 6,
  "pages/ReviewPage.tsx": 4,
  "pages/SessionsPage.tsx": 1,
  "utils/canvasElements.ts": 1,
};

/**
 * 相对 `app/src` 的正斜杠路径 → 该文件**允许残留的字号越界处数上限**（只许降，键不许新增）。
 * 这是交给**批 5/6** 的工作量底稿：映射规则 `9/10/10.5/11/11.5 → 12`（`11.5` 仅在
 * `font="mono"` 时合法 —— 六档字阶的 s6 就是 11.5，仅用于数字对齐）；逐文件明细见 `tmp/t16a/slice.md`。
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
