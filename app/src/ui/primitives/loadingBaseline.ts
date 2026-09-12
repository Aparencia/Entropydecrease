/**
 * @ai-context 加载态（可见加载文案）的**冻结基线**（批 4 B11 裁决 + Task 14 的落点）。
 *
 * Why：规格 §5.1 的病灶逐字是「全站 **0 骨架屏**，长任务只有一行灰字」——本仓至今**没有加载原语**
 *   （`Loading` / `Skeleton` / `Probe` 批 0-D 就交付了，批 4 才接进来）。全量按规格账本数是
 *   「85 处 / 30 文件」，T1 的机器口径（`tmp/t1/slice-manifest.mjs` 的 loading 类）实测
 *   **18 行 / 18 文件**（计划写的 19/19 是台账 #26 的 Windows 域过滤 bug）。18 处里有 14 处在
 *   B11 切片内（判据 ①本批已触碰 ∪ ②`pages/**` ∪ ③有同名测试），4 处是余量。
 *
 * Why 冻结在**文件 → 行数**粒度（与 `nativeButtonBaseline.ts` 同范式）：逐行 key 会在文件被拆件 /
 *   行号漂移时产生假红；棘轮要防的是「永远迁不完」⇒ 总量 + 逐文件只减不增是完整的。
 *   ⚠️ 本棘轮**只管可见加载文案**（`/加载[^"'`\n]{0,8}(中|…)/`），不含布尔门控与 `busy` 状态本身。
 *
 * ★ 扫描口径（与 `tmp/scan-callsites.mjs` 同源；口径本身是判据的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**` 减 `ui/icons/**`
 *      （原语层就是"加载态该去哪儿"的答案，不是待收敛的重复调用点）；
 *   ② **先剥注释**（`//` 与块注释抹为等长空白）；字符串/模板字面量**只跳过、不抹内容**
 *      （判据读的就是字符串里的用户可见文案）；
 *   ③ 行口径：同一行多次命中只算 1 行（与 T1 的 18 行同源，保证前后读数可比）。
 *
 * ★ 迁移读数（T14 实施者实测，仪器 = 与守卫同源的正则扫描）
 *   冻结时（`dev@f6dd012f`）**18 行 / 18 文件** ⇒ 第一提交（`271a281c`）后 **13 行 / 13 文件**
 *   ⇒ 第二提交后 **8 行 / 8 文件**（4 处带理由的残留：1 例外 + 3 按钮内忙碌文案；4 处切片外余量）。
 *   逐文件 Δ 之和逐一对拍：18 → 8 的 **−10** = 本单元迁的 9 处（第一提交 5 + 第二提交 4）
 *   + T13 在它的空态提交里顺手迁走的 1 处（`AsrConfusionPanel` 的加载臂，控制方 17:58 协调）。
 *
 * ★ 余量去向（B11 附带硬要求：切片 + 棘轮 = **中间态**，不是"五类已各自收敛成一个原语"）
 *   ① 4 处余量（`LearningLibraryPanel` / `RetroTimeline` / `SessionDetailPanel` / `SessionListBody`）
 *      不在 B11 切片内 ⇒ 登记给**批 5/7**，由本棘轮冻结；
 *   ② 3 处 `button-busy`（`ImageGallery` / `StructureImageSection` / `WindowSelectCard`）的文案是
 *      **按钮标签**（随 loading 切换）⇒ 由 `Button busy` 承载，不再迁 `Loading`；
 *   ③ 1 处例外（`CaptureOverlayPanel` 深底浅字）见 `RESIDUAL` 的理由。
 */
export const FROZEN_LOADING_TEXT_TOTAL = 8;

/**
 * 相对 `app/src` 的路径 → 允许残留的可见加载文案**行数上限**（只许降、不许升；键不许删）。
 *
 * 语义：`0` = 已由原语承载（`Loading` / `Skeleton`）；`1` = 仍有一处手写文案，见 `RESIDUAL` 的理由。
 */
export const FROZEN_LOADING_TEXT_BY_FILE: Readonly<Record<string, number>> = {
  // 已迁移（0 = 该文件的加载态已交给 L1 原语）
  "components/AsrConfusionPanel.tsx": 0,
  "components/GoalDetail.tsx": 0,
  "components/NotePreviewView.tsx": 0,
  "components/RefineLaunchDialog.tsx": 0,
  "components/RefineStrategyPicker.tsx": 0,
  "components/RefineWorkbench.tsx": 0,
  "components/SecondPassPanel.tsx": 0,
  "components/WebArticleView.tsx": 0,
  "components/review/ReviewSessionPanel.tsx": 0,
  "pages/ReviewPage.tsx": 0,
  // 残留（1 = 见 RESIDUAL 的分类与理由）
  "components/CaptureOverlayPanel.tsx": 1,
  "components/ImageGallery.tsx": 1,
  "components/LearningLibraryPanel.tsx": 1,
  "components/RetroTimeline.tsx": 1,
  "components/SessionDetailPanel.tsx": 1,
  "components/SessionListBody.tsx": 1,
  "components/StructureImageSection.tsx": 1,
  "components/WindowSelectCard.tsx": 1,
};

/**
 * 迁移面：这些文件的加载态**必须**由原语承载 ⇒ 判据要求「0 命中 + 含 `<Loading`/`<Skeleton`」。
 * 少一个文件就是回潮，多一个文件要先把它在 `FROZEN_LOADING_TEXT_BY_FILE` 里降到 0。
 *
 * 其中 `components/AsrConfusionPanel.tsx` 的加载臂**由 T13 迁走**（控制方 2026-09-12 17:58 协调：
 * 该行同时承载加载态与空态，整行归 T13；本单元只复核 + 收紧上限）。
 */
export const MIGRATED_FILES: readonly string[] = [
  "components/AsrConfusionPanel.tsx",
  "components/GoalDetail.tsx",
  "components/NotePreviewView.tsx",
  "components/RefineLaunchDialog.tsx",
  "components/RefineStrategyPicker.tsx",
  "components/RefineWorkbench.tsx",
  "components/SecondPassPanel.tsx",
  "components/WebArticleView.tsx",
  "components/review/ReviewSessionPanel.tsx",
  "pages/ReviewPage.tsx",
];

/** 残留命中的分类：`exception` = 原语结构上表达不了 · `button-busy` = 按钮内忙碌文案 · `backlog` = 余量/让路 */
export type ResidualKind = "exception" | "button-busy" | "backlog";

/**
 * 允许残留的**逐文件理由**（每条都必须：理由非空 ∧ 该文件此刻**仍然命中** —— 防"僵尸豁免"：
 * 一处被迁走却仍挂在豁免表里，下一个人就会以为它还在）。
 */
export const RESIDUAL: readonly { file: string; kind: ResidualKind; reason: string }[] = [
  {
    file: "components/CaptureOverlayPanel.tsx",
    kind: "exception",
    reason:
      "B6 特殊条款未覆盖的例外：根节点 background:#000、原文案 #e5e7eb（浅字压深底）；`Loading` 的墨度权威是 `Text tone=\"ink-3\"`（深灰）⇒ 迁过去等于把对比度反转（可读性回归）。消费者只有 1 个 < B6 阈值 3 ⇒ 不改原语；行内 style 覆盖类语义被 ADR-033 §4 禁止 ⇒ 保留手写文案 + 冻结",
  },
  {
    file: "components/ImageGallery.tsx",
    kind: "button-busy",
    reason: "该行是 `<Button variant=\"secondary\" busy={loading}>` 的**按钮文案**（`加载中…` / `⟳ 刷新`），不是独立加载态 ⇒ 已由 `Button busy` 承载（Task 14 Step 2 ③）",
  },
  {
    file: "components/StructureImageSection.tsx",
    kind: "button-busy",
    reason: "同 ImageGallery：`<Button busy={loading}>` 的按钮文案，已由 `Button busy` 承载",
  },
  {
    file: "components/WindowSelectCard.tsx",
    kind: "button-busy",
    reason: "原生 `<button disabled={loading}>` 的忙碌文案 ⇒ T14 改为 `<Button variant=\"ghost\" size=\"sm\" busy={loading}>`；文案仍随 loading 切换（保留可读标签），探针/aria-busy 由原语给",
  },
  { file: "components/LearningLibraryPanel.tsx", kind: "backlog", reason: "不在 B11 切片内 ⇒ 余量登记给批 5/7" },
  { file: "components/RetroTimeline.tsx", kind: "backlog", reason: "不在 B11 切片内 ⇒ 余量登记给批 5/7" },
  { file: "components/SessionDetailPanel.tsx", kind: "backlog", reason: "不在 B11 切片内 ⇒ 余量登记给批 5/7" },
  { file: "components/SessionListBody.tsx", kind: "backlog", reason: "不在 B11 切片内 ⇒ 余量登记给批 5/7" },
];
