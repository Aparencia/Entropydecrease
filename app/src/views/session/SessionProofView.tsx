/**
 * SessionProofView — 会话「印样」视图（剪报 / 印张式**静态**排版；批 5 T8）。
 *
 * @ai-context 为什么需要它：规格 §7.2 的会话第二/第三种「形式」，规格 §11-6 要求「会话与笔记
 *   各 ≥2 种展示形式可用，原文形态不丢」。「印样」= 把**一屏**排成一张印张（序号 + 区间时间码
 *   → 配图 → 该区间内的转写正文），读起来像一份剪报，而不是一屏一卡的卡片墙。
 * @ai-context 数据契约（**规格未给、批 5 T8 写死**；逐条理由见 `task-8-report.md` §2）：
 *   ① 一屏 = 一张印张（`detail.screens` **按给定顺序**，不重排；序号 = `screen_id ?? index + 1`，
 *      与容器 `SessionScreenCards` 的屏号规则同源）；
 *   ② 段落归属 = **半开区间重叠** `seg.start_ms < last && seg.end_ms > first`（与
 *      `useSessionDetailData` 的「屏 → OCR 块」的 `[first, last)` 口径同源）；零宽屏（first===last）
 *      退化为**点** `[first, first+1)`，跨越该点的段仍算归属；
 *   ③ **跨屏的段在两张印张上都出现**（剪报语义 = 重叠归属，不是切分归属）；与任何屏都不重叠的段
 *      不出现（印样是派生形态，「原文不丢」由默认的原文视图承载 —— 规格 §7.3①）；
 *   ④ 段序 = `start_ms` 升序，并列时 `id` 升序（同一份输入 ⇒ 同一份 DOM）；
 *   ⑤ 配图 = **仅当** `image_ref !== null` **且** 注入的 `imageUrl(ref) !== null` 才渲染 `<img>`
 *      （`imageUrl` 返回 `null` 表示「解析不出 URL」= 无图集/拉取失败；渲染 `src={null}` 会得到
 *      一张碎图）。**图注位恒在**（`[data-proof-figure]`）—— 计划 Task 8 Step 1 逐字「降级：
 *      保留图注位」，故无图时它承载降级文案而不是整块消失。`imageUrl` **只在 `image_ref !== null`
 *      时被调用**（空 ref 的答案视图自己就知道，不必让每个容器再实现一遍）。
 * @ai-context DOM 锚点契约（判据的槽位边界；前两个是计划逐字，后两个是本任务为「可判定的槽位边界」
 *   补的，见报告 §2 的理由）：`data-testid="session-proof-view"`（根）· `data-proof-sheet={first_seen_ms}`
 *   （每张印张；**独有字面量**，供 T18 的 chunk 归属探针）· `data-proof-figure`（图注位，恒在）·
 *   `data-proof-body`（正文区，与图注区分开）。⚠️ `data-proof-sheet` 的**唯一性**沿用容器
 *   `SessionScreenCards` 的既有假设（`id={\`ocr-${sessionId}-${first_seen_ms}\`}` 同假设）：后端若返回
 *   两张 `first_seen_ms` 相同的屏，锚点会重复 —— 本件不额外造第二把尺子去判它。
 * @ai-context 依赖方向（C14② 的第一条判据 = **不 invoke**，P5）：本件是**纯展示**视图 —— 数据面
 *   只有 `detail` 与 `imageUrl` 两项，全部由容器注入；**零 `invoke`、零 `@tauri-apps` import
 *   （含 `import type`）、零 `useState`/`useEffect`、零取数、零 I/O**。图片 URL **一律**经注入的
 *   `imageUrl()`，本件不 import `convertFileSrc`（`views/**` 零 Tauri 是 T15 的图级判据 A3）。
 * @ai-context 只读、零交互（计划 Task 8 Step 1 逐字）：没有展开/收起、没有标签、没有结构徽标、
 *   没有框选 ⇒ 全件 **0 个 `<button>` / 0 个 `<details>`**（P4 判据；`nativeButton.ratchet` 的
 *   扫描域含 `views/**`）。
 * @ai-context **与 `SessionCardFlowView`（T9）的差异**（计划 Task 8 Step 1 要求逐字登记）：本件是
 *   「连续正文流」形态，**不复用** `SessionScreenCard` —— 那张卡是**卡片流**的内容面（标题 + 正文
 *   行）。C3 的「防重写」目标是「**一屏一卡**这个形态只写一次」，**不是**「所有会话视图都必须用
 *   同一张卡」：两形态共用的只有**数据语义**（一屏 = 一段区间），代码真源是 `SessionScreenCard`
 *   （卡片流用）。为两个形态硬造一个「超级卡」会把两种排版绑死在一处。
 * @ai-context 棘轮口径（控制方插播裁决：新文件**创建时**就须干净，`*Baseline.ts` 全批只读）：
 *   ① 排版一律走 L1 原语的**六档字阶**（本件只取 4/5 两档 = 13px / 12px，**全部 ≥12px**）与墨度档
 *      （`ink-1`/`ink-2`/`ink-3`；**不用 `ink-4`**）⇒ 0 处 `#9ca3af`、0 处裸 `fontSize:`
 *      （`textRatchet` 的字号冻结节只有 9/9.5/10/10.5/11/11.5 —— 本件一个都不出现）；
 *   ② 印张的底与圆角走 **token 变量**（`var(--ed-mark-clip)` 剪报底纹 + `var(--ed-radius-*)`）；
 *      间距只用 `spaceScale` 档（4/8/12/16，逐处落在档上）⇒ 0 处 `1px solid #e5e7eb`、
 *      0 处 `borderRadius: 6|12|14|999|2`、0 处 `boxShadow:`（`surfaceRatchet` 三族全 0）；
 *   ③ **刻意不用 `Surface` 原语**：`surfaceRatchet` ⑦ 把域内 `<Surface>` 标签数**冻结为 14**
 *      （`FROZEN_SURFACE_TAG_TOTAL`），本批任何单元新增一个 `<Surface>` 都会让该判据红，而
 *      `*Baseline.ts` 全批只读 ⇒ 印张的「一层底」用 token 变量表达（硬要求①的两条允许路径之一）；
 *      同理不写 `className`（本件无 CSS 文件，样式只在 token + 布局两个允许面上）。
 *   ④ 空态走 `EmptyState` 原语（不写裸灰字）⇒ `emptyStateRatchet` 域内 0 命中；本件不取数 ⇒
 *      0 处加载文案；无错误态 ⇒ 0 处三红 hex、0 处 `StatusLine`。
 * 副作用：无（纯函数式渲染；无 I/O、无订阅、无定时器、无全局单例、无模块级可变状态）。
 * 边界：① `detail.screens` 为空 ⇒ 整块换成 `EmptyState`（根 `data-testid` 仍在，形态可判）；
 *   ② 某张印张区间内无重叠段 ⇒ 正文区为空，但印张本身**照常渲染**（印张的语义是「这一屏」，
 *      不是「这一屏有字」）；③ 不做虚拟滚动（数据量由容器与产品上限决定；全仓 0 处虚拟滚动）；
 *      🔴 密度与滚动**手感批 6 未交付** —— 批 6 计划把「视图密度观感」逐字列入**仪器不可达**
 *      （`docs/superpowers/plans/2026-09-12-frontend-redesign-batch6-motion.md:2540`：jsdom 无排版；
 *      `:2481` 又列进「未交付 / 未验证」）⇒ 只能登记，**去向批 7/8**（T35c 实测；「属批 6」已过期）。
 */
import type { CSSProperties, ReactElement } from "react";
import { EmptyState, Text } from "../../ui/primitives";
import { fmtMs } from "../../utils/fmt";
import type { SessionScreen, SessionSegment } from "../../types";
import type { SessionViewSlot } from "../registry";

/** 视图的数据面 = 视图槽的 `detail` + `imageUrl`（C14②：其余槽位不接 ⇒ 不可能取数） */
type Props = Pick<SessionViewSlot, "detail" | "imageUrl">;

/** 区间连接号（与原文视图的 `fmtMs(a) – fmtMs(b)` 同一形态） */
const RANGE_DASH = " – ";

/**
 * 布局样式（**只许布局与 token**，ADR-033 §4）：抽成模块常量 ⇒ 同一份对象跨渲染复用，
 * 且「改一处即改所有印张」。数字一律落在 `SCALE_TOKENS.spaceScale`（4/8/12/16）上。
 */
const ROOT_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const SHEET_STYLE: CSSProperties = {
  background: "var(--ed-mark-clip)",
  borderRadius: "var(--ed-radius-panel)",
  padding: "var(--ed-space-12) var(--ed-space-16)",
};
const HEAD_STYLE: CSSProperties = { display: "flex", gap: 8, alignItems: "baseline", marginBottom: 8 };
/** 数字等宽：时间码跨印张对齐靠它（排版接缝，不是墨度/字阶决策） */
const TIME_STYLE: CSSProperties = { fontVariantNumeric: "tabular-nums" };
const FIGURE_STYLE: CSSProperties = { margin: "0 0 8px" };
const IMG_STYLE: CSSProperties = { display: "block", maxWidth: "100%", borderRadius: "var(--ed-radius-control)" };
const BODY_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const PARA_STYLE: CSSProperties = { margin: 0 };

/**
 * 屏的**观察窗右端**（半开 `[first, last)`）。
 * Why 单独一支：零宽屏（`first === last`，单帧屏）在「重叠」上没有自然语义 —— 本件把它**归一成
 * 一个点**（`[first, first+1)`），于是「跨越该时间点的段」仍算这张印张的内容。这不是发明数据：
 * 它把「屏在 first 这一刻可见」这句事实翻译成区间代数。
 */
function windowEndOf(screen: SessionScreen): number {
  return screen.last_seen_ms > screen.first_seen_ms ? screen.last_seen_ms : screen.first_seen_ms + 1;
}

/** 段的任一部分落在观察窗内 ⇒ 归属本屏（首尾相接不算重叠：那一段属下一屏） */
function overlaps(segment: SessionSegment, screen: SessionScreen): boolean {
  return segment.start_ms < windowEndOf(screen) && segment.end_ms > screen.first_seen_ms;
}

/** 屏号：后端给了 `screen_id` 就用它，否则用序号（与容器 `SessionScreenCards` 同规则） */
function numberOf(screen: SessionScreen, index: number): number {
  return screen.screen_id ?? index + 1;
}

/**
 * 渲染「印样」。
 *
 * 返回 `ReactElement`（React 19 把全局 `JSX` 命名空间收进 `React.JSX`，直接写 `JSX.Element`
 * 在 `@types/react@19` 下取不到 —— 同 `Text.tsx` / `Surface.tsx` 先例）。
 */
export default function SessionProofView({ detail, imageUrl }: Props): ReactElement {
  if (detail.screens.length === 0) {
    return (
      <div data-testid="session-proof-view" style={ROOT_STYLE}>
        <EmptyState
          testId="session-proof-empty"
          icon="image"
          title="本会话无画面要点"
          description="印样按「一屏一张印张」排布；「原文」视图保留完整转写与参考图集。"
        />
      </div>
    );
  }

  // 段序：`start_ms` 升序、并列时 `id` 升序。**先复制再排序**（不原地改 props 的数组）。
  const ordered = [...detail.segments].sort((a, b) => a.start_ms - b.start_ms || a.id - b.id);

  return (
    <div data-testid="session-proof-view" style={ROOT_STYLE}>
      {detail.screens.map((screen, index) => {
        // 配图 URL：空 ref **不调用** `imageUrl`；非空但解析不出（null）⇒ 同样不出图（见文件头 ⑤）
        const url = screen.image_ref === null ? null : imageUrl(screen.image_ref);
        const number = numberOf(screen, index);
        const body = ordered.filter((segment) => overlaps(segment, screen));
        return (
          <article key={screen.first_seen_ms} data-proof-sheet={screen.first_seen_ms} style={SHEET_STYLE}>
            <div style={HEAD_STYLE}>
              <Text as="p" size={5} tone="ink-1">
                印张 {number}
              </Text>
              <Text as="p" size={5} tone="ink-3" style={TIME_STYLE}>
                {fmtMs(screen.first_seen_ms)}
                {RANGE_DASH}
                {fmtMs(screen.last_seen_ms)}
              </Text>
            </div>
            <figure data-proof-figure="" style={FIGURE_STYLE}>
              {url !== null && <img src={url} alt={`印张 ${number} 的配图`} loading="lazy" style={IMG_STYLE} />}
              <Text as="p" size={5} tone="ink-3">
                {url !== null ? `配图 ${number}` : "本屏未归档配图"}
              </Text>
            </figure>
            <div data-proof-body="" style={BODY_STYLE}>
              {body.map((segment) => (
                <Text as="p" key={segment.id} size={4} tone="ink-2" style={PARA_STYLE}>
                  {segment.text}
                </Text>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
