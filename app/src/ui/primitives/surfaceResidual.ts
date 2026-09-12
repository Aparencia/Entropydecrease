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

/** 阴影残留的分类：`exception` = 结构上表达不了 · `anchored-menu` = B1 锚定菜单（不迁原语）· `backlog` = 切片外余量 */
export type ShadowResidualKind = "exception" | "anchored-menu" | "backlog";

/**
 * 允许残留的**逐文件理由**（照 `loadingBaseline.ts` 的 `RESIDUAL` 范式）。
 * 每条都必须：分类合法 ∧ 理由非空 ∧ 该文件此刻**仍然命中** —— 防“僵尸豁免”（一处被迁走却仍挂在
 * 豁免表里，下一个人就会以为它还在）。键集必须**逐字等于**「冻结表里值 > 0」的键集（两侧都查）。
 *
 * ★ T15a：整表从 `surfaceBaseline.ts` **逐字节搬来**（那边贴近 300 行硬限，而登记制要落在那边）；
 *   判据（`surfaceRatchet.test.ts` ⑧）逐条未改，只换导入来源。
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

/* ────────────────────── T15a：`<Surface>` 调用点的**新增登记制**（控制方裁决的判据修正） ────────────────────── */

/**
 * @ai-context `app/src` 域内 `<Surface>` 开标签的**逐文件登记表** —— T15a 判据修正的唯一落点。
 *
 * Why 有这张表：批 5 前 `FROZEN_SURFACE_TAG_TOTAL = 14` 配合 ⑦「标签数 == 冻结值」+「`*Baseline.ts`
 *   只读、向下重同步」的纪律 ⇒ **任何新视图只要用 `<Surface>` 就必然红**（T9 实测触发：它被迫改用
 *   token 变量 `var(--ed-bg-surface/…)` 绕开原语）。裁决：改成**登记制** —— 新文件把调用点登记进来
 *   （登记即计数），在保留全部防漂移牙齿的前提下允许合法增长。**这不是放宽**。
 *
 * ★ 判据语义（`surfaceTagRegistry.test.ts` ⑪ 逐条读它；**改本表 = 改这三条的口径**）
 *   ① **legacy 行**（下列 9 条，来自 T17-B 迁移快照）：
 *      · 登记值 = `≤` 上限（棘轮只许降：真迁走一处 ⇒ 手工收紧本行 **+** 总数 **+**
 *        `SURFACE_TAG_FROZEN_LEGACY_COUNT`，三处同改）；
 *      · 这 9 行的**登记值之和恒等于 `FROZEN_SURFACE_TAG_TOTAL`** ⇒ 未登记的涨、表值被悄悄降、
 *        总数被单独手改 —— 三条都会红。
 *   ② **新登记行**（批 5 起新增；`count ≥ 1` 且 `file` **不在** legacy 集里）：
 *      · `count` 必须**恰等于**实测（不是 ≤）—— 防「先把表抬高再看」；
 *      · 同一次提交必须手工抬高 `FROZEN_SURFACE_TAG_TOTAL` **并**同步 `SURFACE_TAG_ANCHOR.entries`
 *        （只许抬高到「Σ 登记值」；凭空抬高总数而不登记 ⇒ 红）。
 *   ③ **两条共同**：未登记文件的命中仍然 = 0；登记的文件必须**真实存在**（在扫描面内）且
 *      **此刻仍命中 == count**（防僵尸登记）；`file` 唯一；键按字典序（与 `FROZEN_*_BY_FILE` 同范式）；
 *      `reason` 必须写明**哪个视图 / 为什么必须用 `<Surface>`**（≥ 12 字，照 `SHADOW_RESIDUAL` 范式）。
 *
 * ★ 为什么本表住这里而不是 `surfaceBaseline.ts`：基线件已贴近 300 行硬限，而「登记为什么」本来就是
 *   本件的归处（`BORDER_RESIDUAL` / `RADIUS_RESIDUAL` / `SHADOW_RESIDUAL` 同住）；冻结的**数**仍在
 *   基线件（`FROZEN_SURFACE_TAG_TOTAL` / `SURFACE_TAG_FROZEN_LEGACY_COUNT` / `SURFACE_TAG_ANCHOR`）。
 *
 * ★ 新登记的写法（照抄本行并同步总数与锚；**顺序按字典序插入**）：
 *   `{ file: "views/<新视图>.tsx", count: N, reason: "<哪个视图>：<为什么必须用 Surface（而不是 token 变量）>" }`
 *
 * 副作用：无（纯数据）。边界：`file` 是**相对 `app/src` 的正斜杠路径**，与棘轮扫描面的键同一形态。
 */
export interface SurfaceTagRegistryEntry {
  readonly file: string;
  /** 该文件允许的 `<Surface>` 开标签处数：legacy 行 = 上限（只许降）· 新登记行 = **恰等于**实测 */
  readonly count: number;
  /**
   * `true` = T17-B 迁移快照的既有文件（登记值 = `≤` 上限、受「legacy 之和 == 冻结迁移面」锁）；
   * 省略 = **本批新登记**（登记值必须**恰等于**实测，且同批须抬高总数与锚）—— 这条区分就是二档判据的开关。
   */
  readonly legacy?: true;
  /** 哪个视图 / 为什么需要 `<Surface>`（判据要求 ≥ 12 字，不许空理由） */
  readonly reason: string;
}

/**
 * T17-B 迁移快照的 9 个文件（`count` = 当时**实测值**；其和 = 14 = `SURFACE_TAG_FROZEN_LEGACY_COUNT`
 * = `FROZEN_SURFACE_TAG_TOTAL`）。这 9 行是**冻结面**：只许在真迁走时手工收紧，**不许**为容纳新调用点而抬高。
 * （`legacy: true` 是那 9 行的**唯一**标记 —— 判据据此把它们与新登记行分开；总数由常数另行核验。）
 */
export const SURFACE_TAG_REGISTRY: readonly SurfaceTagRegistryEntry[] = [
  // ── legacy（T17-B 迁移面 · 2026-09-12 实测快照 · 只许降）──
  { file: "components/ChatMessageList.tsx", count: 2, legacy: true, reason: "T17-B 第 2 批迁移：聊天消息流的两处卡片容器（`Surface` 出面 + 调用点只留排布）⇒ 属迁移面，非本批新增" },
  { file: "components/EnrichPanel.tsx", count: 2, legacy: true, reason: "T17-B 第 2 批迁移：增强面板的两处卡片容器（整圈 `1px solid #e5e7eb` + 底色 + 非交互）⇒ 属迁移面" },
  { file: "components/FeedFragmentList.tsx", count: 1, legacy: true, reason: "T17-B 第 2 批迁移：信息流片段的卡片容器 ⇒ 属迁移面" },
  { file: "components/GoalAiSection.tsx", count: 1, legacy: true, reason: "T17-B 第 2 批迁移：目标页 AI 区块的卡片容器 ⇒ 属迁移面" },
  { file: "components/KnowledgeSampleView.tsx", count: 1, legacy: true, reason: "T17-B 第 2 批迁移：知识样例视图的阅读面 ⇒ 属迁移面" },
  { file: "components/LiveImageStrip.tsx", count: 1, legacy: true, reason: "T17-B 第 2 批迁移：实时图像条的容器面 ⇒ 属迁移面" },
  { file: "components/TaskConversationView.tsx", count: 3, legacy: true, reason: "T17-B 第 2 批迁移：任务对话视图的 3 处面（**同时是登记制的锚文件**，值 3 不许动）⇒ 属迁移面" },
  { file: "components/VersionPanel.tsx", count: 2, legacy: true, reason: "T17-B 第 2 批迁移：版本面板的两处卡片容器 ⇒ 属迁移面" },
  { file: "components/WeekContractCard.tsx", count: 1, legacy: true, reason: "T17-B 第 2 批迁移：周契约卡片的面 ⇒ 属迁移面" },
  // ── 批 5 新增登记（**本批至今 0 条**；新条目**不带 `legacy`**，按字典序插在上面这段之后，并同步总数与锚）──
];
