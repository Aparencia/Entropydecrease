/**
 * @ai-context T17-B：`Surface` 三族的**残留登记表**（照 `loadingBaseline.ts` 的 `RESIDUAL` 范式）。
 *
 * Why 单独成件：基线（`surfaceBaseline.ts`）放的是"冻结的数"，本件放的是"为什么这些落点不迁"——
 *   两件事的读者与生命周期都不同（基线被棘轮读、登记给人读），挤在一件会把基线顶过 300 行硬限。
 *
 * ★ 语义（**别把本表当"所有剩余命中"的清单**）：登记的只是**本单元逐处裁定过、决定不迁**的落点；
 *   剩余命中的大头是**类别级**裁定 —— 控件形态（按钮/输入框/下拉/文本域/药丸/徽标，归批 5/7）、
 *   单向分隔线（57 处，`Surface.bordered` 只出整圈）、切片外余量（backlog）—— 逐文件登记它们会造出上百条
 *   同因条目，那是登记噪音不是判据。★ **批 7 T7 已把「透明边框容器」这一类收口**：`Surface` 加了 `level="none"`
 *   （只出边框、不出底色）⇒ 实测 21 处里 19 处迁入原语，余 2 处在 legacy 登记面内（见 `legacy-registry-frozen`）。
 *
 * ★ 防僵尸判据（`surfaceRatchet.test.ts` ⑩）：每条声明的文件**此刻仍须命中** ≥ `count` ——
 *   一处被迁走却仍挂在豁免表里 ⇒ 红（下一个人会以为它还在）。
 *
 * 副作用：无（纯数据）。边界：`count` 是**该文件该类别的处数下限**，不是上限 —— 类别内新增命中由
 *   基线件（`FROZEN_*_BY_FILE`）拦，本件只拦"声明的残留整个消失"。
 */

/** 残留分类（两族共用；每类都有**非空理由**，见 `SURFACE_RESIDUAL_WHY`） */
export type SurfaceResidualKind =
  | "b1-non-migrated"
  | "anchored-menu"
  | "conditional-color"
  | "html-string"
  | "legacy-registry-frozen";

/** 逐类理由（判据要求非空且 ≥ 12 字；条目侧只带 `file/kind/count`，避免上百条同因长句） */
export const SURFACE_RESIDUAL_WHY: Readonly<Record<SurfaceResidualKind, string>> = {
  "b1-non-migrated": "B1/B2 的 `NON_MIGRATED_14` 成员：`dialogMigration.e.test.ts` ② 硬判据禁止该文件源码出现 `ui/primitives` ⇒ 迁 `Surface` 会顶红 ⇒ 回退 + 登记（控制方 B21：守卫不改窄）",
  "anchored-menu": "锚定菜单 / 浮层（`position: absolute|fixed` + `zIndex(\"popover\")` + `boxShadow`）⇒ 与 `SHADOW_RESIDUAL` 同向：不迁原语；本单元只把阴影字面量换成 token、圆角按映射表就地 6 → 8",
  // ★ 批 7 T7 退役 `no-passthrough-html` / `no-passthrough-id`：受控槽 `html` / `domId` 已落进 `SurfaceProps`
  //   （C9.4），原先被它们挡住的落点已全部迁入 ⇒ 这两个类别**此刻 0 条登记**，词条随之退役（留着就是过期散文）。
  "legacy-registry-frozen": "该文件是 `SURFACE_TAG_REGISTRY` 的 **legacy 行**（`≤` 上限只许降），而本文件又有一处透明边框容器 ⇒ 迁它会顶红牙 1，而抬高 legacy 面（`SURFACE_TAG_FROZEN_LEGACY_COUNT`）属 §C9.5 明令禁止 ⇒ 留在原地并登记；控制方若授权抬高该面，这两处即可迁",
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
  { file: "components/LiveImageStrip.tsx", kind: "legacy-registry-frozen", count: 1 },
  { file: "components/NoteEditView.tsx", kind: "b1-non-migrated", count: 4 },
  { file: "components/NoteHeaderActions.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/NoteLinkToSystem.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/NoteListBatchMenu.tsx", kind: "b1-non-migrated", count: 2 },
  { file: "components/NoteMoveToGroupMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/NoteRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/RefineStrategyPicker.tsx", kind: "conditional-color", count: 1 },
  { file: "components/RichEditorView.tsx", kind: "b1-non-migrated", count: 4 },
  { file: "components/RouteInfoPopover.tsx", kind: "b1-non-migrated", count: 5 },
  { file: "components/ScreenSelectOverlay.tsx", kind: "b1-non-migrated", count: 3 },
  { file: "components/SessionListPanel.tsx", kind: "conditional-color", count: 1 },
  { file: "components/SessionRowContextMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/SystemStatusBadge.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/VersionPanel.tsx", kind: "legacy-registry-frozen", count: 1 },
  { file: "components/WindowSelectCard.tsx", kind: "anchored-menu", count: 1 },
  { file: "components/action-center/ActionCenterPanel.tsx", kind: "conditional-color", count: 1 },
  { file: "components/chat/ChatLaunchMenu.tsx", kind: "b1-non-migrated", count: 1 },
  { file: "components/note-selection/SelectionActionMenu.tsx", kind: "b1-non-migrated", count: 1 },
];

// 🔴 **批 8 T16 登记（欠账 #10；只登记、不入棘轮）**：**非棘轮圆角档不在任何守卫内** —— 棘轮只覆盖 `6|12|14|999|2`（`surfaceBaseline.ts:16/:142`），映射表档 `0/3/4/5/8/10` 与两者都没列的 `1` 都不在任何棘轮内、无守卫（口径 = `borderRadius` 后的数值字面量处数 · 域 = `app/src` 入库域 · 时点 = 批 8 T16，读数进 `task-16-report.md`）。⚠️ 批 8 计划 `### 表 4` #10 把本写成「圆角 `26/5/4` 三档」，**该三元组在本仓不可复现** ⇒ 本条按实测口径登记，差异见 `task-16-report.md` 未决条第 1 条。
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
  { file: "components/AiConversationDock.tsx", kind: "exception", reason: "`-8px 0 24px` 是**方向性**边缘投影（dock 向左升起）；`--ed-shadow-1/2` 是双向环境投影（`0 1px 2px …, 0 4px 12px …`）⇒ 换成 token 会丢掉「从右边滑出来」的暗示，属观感变化。🔴 **批 8 T16 就地更正**：原写「登记给批 5」，而批 5 已收口 ⇒ 该登记**掉地**（控制方 §A.7）；**批 8 已认领**，本批**不迁**（换 token 会丢方向性暗示 = 观感变化 ⇒ 需人的裁决），**具名归属 = 控制方（§A.7）**" },
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
 * ★ 判据语义（`surfaceTagRegistry.test.ts` ⑪ 逐条读它；**改本表 = 改这四条的口径**）
 *   ① **legacy 档行**（下列 9 条，来自 T17-B 迁移快照）：
 *      · 登记值 = `≤` 上限（棘轮只许降：真迁走一处 ⇒ 手工收紧本行 **+** 总数 **+**
 *        `SURFACE_TAG_FROZEN_LEGACY_COUNT`，三处同改）；
 *      · 这 9 行的**登记值之和恒等于 `SURFACE_TAG_FROZEN_LEGACY_COUNT`**（迁移面的份额；批 5/7 抬
 *        `FROZEN_SURFACE_TAG_TOTAL` 时**未动**该和 ⇒ 两个数今日是 14 与 47，不是同一个数）⇒ 未登记的涨、
 *        表值被悄悄降、总数被单独手改 —— 三条都会红。
 *   ② **new 档行**（批 5 起新增；`count ≥ 1` 且 `tier: "new"` —— 判据看**档位**，不看「文件在不在
 *      legacy 集里」；后者在同文件双行时会把 new 行算进 legacy 面）：
 *      · `count` 必须**恰等于**实测（不是 ≤）—— 防「先把表抬高再看」；
 *      · 同一次提交必须手工抬高 `FROZEN_SURFACE_TAG_TOTAL` **并**同步 `SURFACE_TAG_ANCHOR.entries`
 *        （只许抬高到「Σ 登记值」；凭空抬高总数而不登记 ⇒ 红）。
 *   ③ **两条共同**：未登记文件的命中仍然 = 0；登记的文件必须**真实存在**（在扫描面内）且
 *      **此刻仍命中 == count**（防僵尸登记）；**`(file, tier)` 唯一**（同一文件**可以两行** —— `legacy`
 *      一行 + `new` 一行，这正是 T19 开的合法路径）；键按字典序（与 `FROZEN_*_BY_FILE` 同范式）；
 *      `reason` 必须写明**哪个视图 / 为什么必须用 `<Surface>`**（≥ 12 字，照 `SHADOW_RESIDUAL` 范式）。
 *   ④ **T19：同一文件两行时的算术**（键 `file` → `(file, tier)` 的**唯一**目的）：
 *      · legacy 档：`实测 − 该文件 new 档登记值之和` = 残存的 legacy 面 ⇒ 仍须 `≤` 登记值（且 ≠ 0）；
 *      · new 档：`实测 − 该文件 legacy 档登记值之和` 必须**恰等于** new 档登记值之和（不是 ≤）；
 *      · 全局「Σ 登记值 == 总数 == Σ 实测」+ 逐文件「登记值之和 ≥ 实测」⇒ 两侧恒等式同时成立。
 *      ⇒ **legacy 文件内新增一处 `<Surface>`** 的合法路径 = 加一行 `tier: "new"`（值 = 新增处数）
 *        + 抬 `FROZEN_SURFACE_TAG_TOTAL` + 同步 `SURFACE_TAG_ANCHOR.entries`；🔴 **不许**抬 legacy 面
 *        （那条路被 §C9.5 / §C35.2 明文封死，抬了也过不了 `SURFACE_TAG_FROZEN_LEGACY_COUNT` 之和锁）。
 *
 * ★ 为什么本表住这里而不是 `surfaceBaseline.ts`：基线件已贴近 300 行硬限，而「登记为什么」本来就是
 *   本件的归处（`BORDER_RESIDUAL` / `RADIUS_RESIDUAL` / `SHADOW_RESIDUAL` 同住）；冻结的**数**仍在
 *   基线件（`FROZEN_SURFACE_TAG_TOTAL` / `SURFACE_TAG_FROZEN_LEGACY_COUNT` / `SURFACE_TAG_ANCHOR`）。
 *
 * ★ 新登记的写法（照抄本行并同步总数与锚；**顺序按 `(file, tier)` 字典序插入** —— 同一文件时
 *   `legacy` 行在前）：
 *   `{ file: "views/<新视图>.tsx", count: N, tier: "new", reason: "<哪个视图>：<为什么必须用 Surface>" }`
 *
 * 副作用：无（纯数据）。边界：`file` 是**相对 `app/src` 的正斜杠路径**，与棘轮扫描面的键同一形态。
 */
/** 登记行的**档位** —— T19 起它是键的第二元（`键 = \`${file}|${tier}\``） */
export type SurfaceTagTier = "legacy" | "new";

export interface SurfaceTagRegistryEntry {
  readonly file: string;
  /** 该文件允许的 `<Surface>` 开标签处数：`legacy` 档 = 上限（只许降）· `new` 档 = **恰等于**实测 */
  readonly count: number;
  /**
   * 档位 = 键的第二元（**显式必填**：可选字段的「漏写 = new 档」在两种语义间摇摆）。
   * `"legacy"` = T17-B 迁移快照的既有文件（登记值 = `≤` 上限、受「legacy 档之和 == 冻结迁移面」锁）；
   * `"new"` = 批 5 起**新登记**（登记值必须**恰等于**实测，且同批须抬高总数与锚）—— 这条区分就是二档判据的开关。
   */
  readonly tier: SurfaceTagTier;
  /** 哪个视图 / 为什么需要 `<Surface>`（判据要求 ≥ 12 字，不许空理由） */
  readonly reason: string;
}

/**
 * T17-B 迁移快照的 9 个文件（`count` = 当时**实测值**；其和 = 14 = `SURFACE_TAG_FROZEN_LEGACY_COUNT`
 * = 该档在 `FROZEN_SURFACE_TAG_TOTAL` 里的份额）。这 9 行是**冻结面**：只许在真迁走时手工收紧，**不许**
 * 为容纳新调用点而抬高。（`tier: "legacy"` 是那 9 行的**唯一**标记 —— 判据据此把它们与 new 档分开；
 * 总数由常数另行核验。）
 *
 * ★ T19：键 = `(file, tier)` ⇒ 同一文件可**两行并存**（`legacy` + `new`）；`legacy` 行仍只许降。
 */
export const SURFACE_TAG_REGISTRY: readonly SurfaceTagRegistryEntry[] = [
  // ⚠️ 全表按键**字典序**（判据 ⑪ 牙 5a）⇒ 新行插在字典序位置，不是追加在尾部。
  // `tier: "legacy"` = T17-B 迁移快照的 9 行（`≤` 上限、只许降、其和锁在 `SURFACE_TAG_FROZEN_LEGACY_COUNT`）；
  // `tier: "new"` = 批 5/7 的新登记行（`count` **恰等于实测**）。新增 = 加行 + 抬总数 + 同步锚（三处同批）。
  { file: "components/AiProviderSettings.tsx", count: 1, tier: "new", reason: "Provider 卡片容器（整圈边框 + 圆角 + 无底色）：批 7 T7 迁入，走 `level=\"none\"` 只出边框不出底" },
  { file: "components/AiServicePanel.tsx", count: 1, tier: "new", reason: "调用记录滚动容器（无底色 + 整圈边框）：批 7 T7 迁入 `level=\"none\"`，滚动口是布局口、仍走 `style`" },
  { file: "components/AiTaskPanel.tsx", count: 1, tier: "new", reason: "任务记录滚动容器（无底色 + 整圈边框）：批 7 T7 迁入 `level=\"none\"`，形态同 `AiServicePanel`" },
  { file: "components/ChatMessageList.tsx", count: 2, tier: "legacy", reason: "T17-B 第 2 批迁移：聊天消息流的两处卡片容器（`Surface` 出面 + 调用点只留排布）⇒ 属迁移面，非本批新增" },
  { file: "components/ClassroomCapturePanel.tsx", count: 1, tier: "new", reason: "实时捕获卡片容器（原 `const panel` 共享样式）：批 7 T7 把常量换成原语 `level=\"none\" radius=\"panel\" padded`" },
  { file: "components/ClassroomRightPane.tsx", count: 1, tier: "new", reason: "右栏「当前配置」卡（原 `const panel` + spread）：批 7 T7 换成原语，布局口（marginTop/字色）留在 `style`" },
  { file: "components/EnrichPanel.tsx", count: 2, tier: "legacy", reason: "T17-B 第 2 批迁移：增强面板的两处卡片容器（整圈 `1px solid #e5e7eb` + 底色 + 非交互）⇒ 属迁移面" },
  { file: "components/FeedFragmentList.tsx", count: 1, tier: "legacy", reason: "T17-B 第 2 批迁移：信息流片段的卡片容器 ⇒ 属迁移面" },
  { file: "components/GoalAiSection.tsx", count: 1, tier: "legacy", reason: "T17-B 第 2 批迁移：目标页 AI 区块的卡片容器 ⇒ 属迁移面" },
  { file: "components/KnowledgeSampleView.tsx", count: 1, tier: "legacy", reason: "T17-B 第 2 批迁移：知识样例视图的阅读面 ⇒ 属迁移面" },
  { file: "components/LiveImageStrip.tsx", count: 1, tier: "legacy", reason: "T17-B 第 2 批迁移：实时图像条的容器面 ⇒ 属迁移面" },
  { file: "components/MaterialInputPanel.tsx", count: 1, tier: "new", reason: "学习素材卡容器（原 `const panel` 共享样式）：批 7 T7 换成原语 `level=\"none\" radius=\"panel\" padded`" },
  { file: "components/NotePreviewView.tsx", count: 2, tier: "new", reason: "AI 精修版 / 规则版预览的 markdown 阅读面（两处 `dangerouslySetInnerHTML`）：批 7 T7 用受控槽 `html` 迁入" },
  { file: "components/NoteTagsEditor.tsx", count: 1, tier: "new", reason: "标签编辑浮层（批 7 T18：`level=\"raised\"` 锚定面板，底/边/圆角/阴影四件都得走原语——该文件为新建件，无任何冻结键可承接字面量）" },
  { file: "components/PhotoCapturePanel.tsx", count: 1, tier: "new", reason: "图文采集卡容器（原 `const panel` 共享样式）：批 7 T7 换成原语 `level=\"none\" radius=\"panel\" padded`" },
  { file: "components/PracticeQuestionsOverlays.tsx", count: 2, tier: "new", reason: "练习条目行容器（整圈边框 + 无底色，两处）：批 7 T7 迁入 `level=\"none\"`，行内排布留在 `style`" },
  { file: "components/ProfileDetector.tsx", count: 1, tier: "new", reason: "视频档案卡容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\" radius=\"panel\" padded`" },
  { file: "components/ReadyCheckCard.tsx", count: 1, tier: "new", reason: "就绪检查卡容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\" radius=\"panel\" padded`" },
  { file: "components/RefineLaunchDialog.tsx", count: 1, tier: "new", reason: "画面理解开关行容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\"`，flex 排布留在 `style`" },
  { file: "components/RefineStrategyPicker.tsx", count: 1, tier: "new", reason: "「高级微调」旋钮层容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\"`" },
  { file: "components/RefineWorkbench.tsx", count: 1, tier: "new", reason: "差异单列视图的 diff 阅读面（`dangerouslySetInnerHTML`）：批 7 T7 用受控槽 `html` 迁入" },
  { file: "components/SessionSearchBar.tsx", count: 1, tier: "new", reason: "标题/内容/画面三档分组按钮的容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\"`" },
  { file: "components/TaskConversationView.tsx", count: 3, tier: "legacy", reason: "T17-B 第 2 批迁移：任务对话视图的 3 处面（**同时是登记制的锚文件**，值 3 不许动）⇒ 属迁移面" },
  { file: "components/VersionPanel.tsx", count: 2, tier: "legacy", reason: "T17-B 第 2 批迁移：版本面板的两处卡片容器 ⇒ 属迁移面" },
  { file: "components/VideoImportPanel.tsx", count: 1, tier: "new", reason: "视频导入卡容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\" radius=\"panel\" padded`" },
  { file: "components/WeekContractCard.tsx", count: 1, tier: "legacy", reason: "T17-B 第 2 批迁移：周契约卡片的面 ⇒ 属迁移面" },
  { file: "components/action-center/ActionCenterPanel.tsx", count: 3, tier: "new", reason: "待提炼行 / SOP 模板区 / 模板行三个容器（整圈边框 + 无底色）：批 7 T7 迁入 `level=\"none\"`" },
  { file: "components/session-detail/SessionScreenCards.tsx", count: 1, tier: "new", reason: "OCR 屏卡容器（带锚点 `id` + 近白底）：批 7 T7 用受控槽 `domId` 迁入，`level=\"canvas\"`" },
  { file: "pages/SettingsPage.tsx", count: 10, tier: "new", reason: "设置页 10 个面板容器（原 `const panel` + spread）：批 7 T7 换成原语 `level=\"none\" radius=\"panel\" padded`" },
];
