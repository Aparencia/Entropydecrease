/**
 * @ai-context T15「错误行 → `StatusLine`」的**棘轮基线**（批 4 B11 的切片 + 棘轮判据）。
 *
 * Why：规格 §5.1 的病灶是「三种红并存」—— 迁移的终点是语义色只从 `StatusLine` 出。但全仓仍有
 *   大量非「状态」语境的用色（品牌色 / 装饰 / 图表分支等），**不可能也不该**一次清零 ⇒ 按 B11
 *   走「切片 + 棘轮」：**本表冻结迁移后的实测值，只许减**。
 *
 * 口径：域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` **减 `ui/primitives/**`**
 *   （原语层是语义色的真源，不是待收敛的调用点；同 T1 的 `prod` 口径。`ui/icons/**` **不**减 ——
 *   图标也是调用点）。字面量 = 七个三红十六进制
 *   （`#e11d48`/`#dc2626`/`#ef4444`/`#b91c1c`/`#d32f2f`/`#c62828`/`#f43f5e`），
 *   **按出现次数**计（同一行两次算 2；**不是**按行）。
 *   ⚠️ **先剥注释**（`sliceScan.stripComments` 状态机，与三个兄弟棘轮同口径 —— T13–T15 评审 M-2）：
 *   注释里列举色值（本仓有先例：`ClassroomBanners.tsx` / `utils/refineDiff.ts` 的 `@ai-context`）
 *   **不算命中**；不剥注释会把「解释为什么用这个色」判成违规。冻结值即此口径下的实测值。
 *
 * ⚠️ 本表是**迁移后的实测快照**（2026-09-12，T15 收口时重测；同日 fix 单元按剥注释口径重新冻结），
 *   不是迁移前的基线：迁移后仍剩下的是**切片外的存量**（含 T15 因 B1/B2 守卫回退的 6 处）。
 *   数字来自 `tmp/t15rec` 的探针，可复算（fix 单元用 `tmp/fix-t13t15/scan-red.mjs` 独立复算过）。
 *   **真迁走一处 ⇒ 手工收紧这里**（棘轮只许降）。
 */
export const FROZEN_RED_BY_FILE: Readonly<Record<string, number>> = {
  "components/action-center/ActionCenterPanel.tsx": 6,
  "components/ClassroomCapturePanel.tsx": 6,
  "components/SystemStatusBadge.tsx": 5,
  "components/ModelManagementPanel.tsx": 4,
  "components/TaskConversationView.tsx": 4,
  "components/AudioLevelMeter.tsx": 3,
  "components/GoalDetail.tsx": 3,
  "components/GroupDeleteConfirm.tsx": 3,
  "components/NotePreviewView.tsx": 3,
  "components/NoteRowContextMenu.tsx": 3,
  "components/RefineWorkbench.tsx": 3,
  "utils/refineDiff.ts": 2,
  "components/AiTaskPanel.tsx": 2,
  "components/CaptureFloatPanel.tsx": 2,
  "components/ClassroomBanners.tsx": 1,
  "components/InterviewSteps.tsx": 2,
  "components/LiveActivityPanel.tsx": 2,
  "components/NoteLinkToSystem.tsx": 2,
  "components/NoteListBatchMenu.tsx": 2,
  "components/NoteMoveToGroupMenu.tsx": 2,
  "components/OcrDeviceSetting.tsx": 2,
  "components/PracticeQuestionsOverlays.tsx": 2,
  "components/RouteInfoPopover.tsx": 2,
  "components/SessionListRow.tsx": 2,
  "components/SessionRowContextMenu.tsx": 2,
  "components/SopRunOverlay.tsx": 2,
  "components/StructureModelSetting.tsx": 2,
  "components/AiConversationDock.tsx": 1,
  "components/AiProviderSettings.tsx": 1,
  "components/AppErrorBoundary.tsx": 1,
  "components/AsrConfusionPanel.tsx": 1,
  "components/AudioPreprocSetting.tsx": 1,
  "components/AudioStoragePanel.tsx": 1,
  "components/BackupPanel.tsx": 1,
  "components/ChatMessageList.tsx": 1,
  "components/ChatSidebar.tsx": 1,
  "components/FeatureFlagSetting.tsx": 1,
  "components/FeedFragmentList.tsx": 1,
  "components/ImageGallery.tsx": 1,
  "components/KnowledgeLinkSection.tsx": 1,
  "components/LearningLibraryEngineSection.tsx": 1,
  "components/LearningLibraryPanel.tsx": 1,
  "components/LiveImageStrip.tsx": 1,
  "components/LiveProfileStrip.tsx": 1,
  "components/ModelCardFromNoteDialog.tsx": 1,
  "components/ModelDiskPanel.tsx": 1,
  "components/note-selection/SelectionActionMenu.tsx": 1,
  "components/NoteListView.tsx": 1,
  "components/NoteReadingView.tsx": 1,
  "components/ProofreadToggle.tsx": 1,
  "components/ReadyCheckCard.tsx": 1,
  "components/RefineLaunchDialog.tsx": 1,
  "components/RetroTimeline.tsx": 1,
  "components/review/ReviewSessionPanel.tsx": 1,
  "components/SealToggle.tsx": 1,
  "components/session-detail/SessionDetailHeader.tsx": 1,
  "components/SessionDetailPanel.tsx": 1,
  "components/SessionSelectionToolbar.tsx": 1,
  "components/SpeakerSwitchCard.tsx": 1,
  "components/StructureImageSection.tsx": 1,
  "components/VersionPanel.tsx": 1,
  "components/VideoImportPanel.tsx": 1,
  "components/VocabManager.tsx": 1,
  "components/WebArticleView.tsx": 1,
  "components/WebImportPanel.tsx": 1,
  "components/WebInboxPanel.tsx": 1,
  "components/WeekContractCard.tsx": 1,
};

/** 全仓三红十六进制字面量的**冻结总数**（= 上面逐文件之和的独立校验和，只许降） */
export const FROZEN_RED_TOTAL = 114;
