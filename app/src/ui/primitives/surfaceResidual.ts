/**
 * @ai-context T17-B：`Surface` 三族的**残留登记表**（照 `loadingBaseline.ts` 的 `RESIDUAL` 范式）。
 *
 * Why 单独成件：基线（`surfaceBaseline.ts`）放的是"冻结的数"，本件放的是"为什么这些落点不迁"——
 *   两件事的读者与生命周期都不同（基线被棘轮读、登记给人读），挤在一件会把基线顶过 300 行硬限。
 *
 * ★ 语义（**别把本表当"所有剩余命中"的清单**）：登记的只是**本单元逐处裁定过、决定不迁**的落点；
 *   剩余命中的大头是**类别级**裁定 —— 控件形态（按钮/输入框/下拉/文本域/药丸/徽标，归批 5/7）、
 *   单向分隔线（57 处，`Surface.bordered` 只出整圈）、透明边框容器（`Surface` 基类必出底色）、
 *   切片外余量（backlog）—— 逐文件登记它们会造出上百条同因条目，那是登记噪音不是判据。
 *
 * ★ 防僵尸判据（`surfaceRatchet.test.ts` ⑩）：每条声明的文件**此刻仍须命中** ≥ `count` ——
 *   一处被迁走却仍挂在豁免表里 ⇒ 红（下一个人会以为它还在）。
 *
 * 副作用：无（纯数据）。边界：`count` 是**该文件该类别的处数下限**，不是上限 —— 类别内新增命中由
 *   基线件（`FROZEN_*_BY_FILE`）拦，本件只拦"声明的残留整个消失"。
 */

/** 残留分类（两族共用；每类都有**非空理由**，见 `SURFACE_RESIDUAL_WHY`） */
export type SurfaceResidualKind = "b1-non-migrated" | "anchored-menu" | "no-passthrough-html" | "no-passthrough-id" | "conditional-color" | "html-string";

/** 逐类理由（判据要求非空且 ≥ 12 字；条目侧只带 `file/kind/count`，避免上百条同因长句） */
export const SURFACE_RESIDUAL_WHY: Readonly<Record<SurfaceResidualKind, string>> = {
  "b1-non-migrated": "B1/B2 的 `NON_MIGRATED_14` 成员：`dialogMigration.e.test.ts` ② 硬判据禁止该文件源码出现 `ui/primitives` ⇒ 迁 `Surface` 会顶红 ⇒ 回退 + 登记（控制方 B21：守卫不改窄）",
  "anchored-menu": "锚定菜单 / 浮层（`position: absolute|fixed` + `zIndex(\"popover\")` + `boxShadow`）⇒ 与 `SHADOW_RESIDUAL` 同向：不迁原语；本单元只把阴影字面量换成 token、圆角按映射表就地 6 → 8",
  "no-passthrough-html": "落点是 markdown 阅读面，靠 `dangerouslySetInnerHTML` 灌内容，而 `SurfaceProps` 无该属性透传 ⇒ 结构上迁不进去（原语补透传是批 5/6 的活）",
  "no-passthrough-id": "落点带 `id`（供锚点跳转），`SurfaceProps` 无 `id` / DOM 属性透传 ⇒ 迁过去会丢锚点（同 `no-passthrough-html` 的结构缺口）",
  "conditional-color": "三元条件边框色（`cond ? \"1px solid <状态色>\" : \"1px solid #e5e7eb\"`）：`Surface.interactive` 只给 hover 的边框墨度推进，给不出任意状态色 ⇒ 不迁（选中/激活态属批 5/7）",
  "html-string": "HTML 字符串里的 `border:1px solid #e5e7eb`（markdown 内嵌 img 的 style 串）：不是 JSX 元素 ⇒ `Surface` 表达不了（口径边界，登记）",
};

/** 边框族：本单元裁定不迁的落点（键 = 文件 + 类别；`count` = 该文件该类别的处数） */
export const BORDER_RESIDUAL: readonly { file: string; kind: SurfaceResidualKind; count: number }[] = [
  { file: "components/BrowserChrome.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/CanvasNodeConcept.tsx", kind: "conditional-color", count: 1 },
  { file: "components/CanvasNodeModel.tsx", kind: "conditional-color", count: 1 },
  { file: "components/CitationChips.tsx", kind: "conditional-color", count: 1 },
  { file: "components/GroupRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/GroupSidebarRow.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/ImagePreviewOverlay.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/KnowledgeGraphView.tsx", kind: "conditional-color", count: 1 },
  { file: "components/KnowledgeSystemWizard.tsx", kind: "conditional-color", count: 1 },
  { file: "components/LiveImageStrip.tsx", kind: "conditional-color", count: 1 },
  { file: "components/NoteEditView.tsx", kind: "b1-non-migrated", count: 4 },
  { file: "components/NoteHeaderActions.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/NoteLinkToSystem.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/NoteListBatchMenu.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/NoteMoveToGroupMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/NotePreviewView.tsx", kind: "no-passthrough-html", count: 4 },
  { file: "components/NoteRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/RefineStrategyPicker.tsx", kind: "conditional-color", count: 1 },
  { file: "components/RefineWorkbench.tsx", kind: "no-passthrough-html", count: 1 },
  { file: "components/RichEditorView.tsx", kind: "b1-non-migrated", count: 4 },
  { file: "components/RouteInfoPopover.tsx", kind: "b1-non-migrated", count: 5 },
  { file: "components/ScreenSelectOverlay.tsx", kind: "b1-non-migrated", count: 3 },
  { file: "components/SessionListPanel.tsx", kind: "conditional-color", count: 1 },
  { file: "components/SessionRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/SystemStatusBadge.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/WindowSelectCard.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/action-center/ActionCenterPanel.tsx", kind: "conditional-color", count: 1 },
  { file: "components/chat/ChatLaunchMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/note-selection/SelectionActionMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/session-detail/SessionScreenCards.tsx", kind: "no-passthrough-id", count: 2 },
];

/** 圆角族同上；**控件形态**按类别整体裁定，不逐文件登记（理由见文件头「★ 语义」） */
export const RADIUS_RESIDUAL: readonly { file: string; kind: SurfaceResidualKind; count: number }[] = [
  { file: "components/CaptureOverlayPanel.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/GroupRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/ImagePreviewOverlay.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/NoteEditView.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/NoteLinkToSystem.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/NoteMoveToGroupMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/NoteRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/RichEditorView.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/RouteInfoPopover.tsx", kind: "b1-non-migrated", count: 3 },
  { file: "components/ScreenSelectOverlay.tsx", kind: "b1-non-migrated", count: 5 },
  { file: "components/SessionRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/chat/ChatLaunchMenu.tsx", kind: "b1-non-migrated", count: 4 },
  { file: "components/note-selection/SelectionActionMenu.tsx", kind: "b1-non-migrated", count: 1 },
];
