/**
 * SessionRawView — 会话详情「原文」视图（转写时间轴 / 画面要点屏卡 / 术语表 / 参考图集）。
 *
 * @ai-context: 自 SessionDetailPanel.tsx 抽出（批 5 T2 Step 2 · C9「先拆到 ≤150」）——
 *              逐块搬移：分段 `seg-{sessionId}-{segId}` 锚点、屏卡 props 透传、术语表
 *              `<details>` 的三段文案与参考图集全部原样。
 * @ai-context: 数据全注入、**零 `invoke`、零 `@tauri-apps`**（C14② 的「不 invoke」判据在
 *              本件成立）：`baseUrl` / `ocrBlocksByScreen` / 框选态 / 单屏 toast 都由面板
 *              （唯一数据面 = `useSessionDetailData`）注入。屏卡自己的 `convertFileSrc`
 *              仍留在 `SessionScreenCards`（T3/T10 再收口成 `imageUrl()`）。
 * @ai-context: `glossarySummary` 由面板计算后**整串注入**（不在这里做三元）：`glossary === null`
 *              的「加载中…」是 `loadingRatchet` 的冻结命中行（基线键 = 发起文件）⇒ 留在面板里
 *              才能「零新增棘轮计数」。
 * @ai-context: **棘轮口径（控制方 2026-09-12 插播裁决：新文件创建时就须干净，不许改 `*Baseline.ts`）**
 *              —— 排版一律走 L1 原语与 token，本件 0 处裸 `fontSize` / 0 处 `#9ca3af` /
 *              0 处 `1px solid #e5e7eb`：
 *              ① 转写行三处文案 → `<Text size={6} tone="ink-3">`（来源标记）· `<Text size={6}>`
 *                 （时间码，配 `fontVariantNumeric` 数字对齐）· `<Text size={5} tone="ink-2">`
 *                 （正文 13px → 12px 档）；
 *              ② 来源标记的非灰支用**语义 token** `var(--ed-ok)`（品牌青 `#0d9488`），不再写字面量；
 *              ③ 术语表 `<details>` 的整圈边框用 **token 变量** `var(--ed-border)` —— 不迁
 *                 `Surface`：`Surface.css` 是 `.ed-surface` 类族，而本元素是 `<details>` 折叠块
 *                 （`SurfaceTag` 不含 `details`；加档=改原语契约，不在本任务范围）。
 * @ai-context: **批 6 T28 —— #2「显影编排」（§8.6 第 2 行）的落点就在本文件**：R5.2 逐字把落点裁在
 *              **课后**（`detail.segments.map`，即 `:87-102` 那一段），采集期落点
 *              （`LiveActivityPanel`）**登记转批 7**。本件只做三件事，**不改**既有 DOM 结构与文案：
 *              ① 段落容器加 `ref` + `data-tone="paper"`（§8.3：会话是「有文字的界面」）；
 *              ② 每段加 `data-seg-id`（`useRevealChoreography` 的逐段锚点 = `[data-seg-id]`）；
 *              ③ 段正文 `<Text>` 追加 `lowConfidenceClass(seg.confidence)` —— 这是 R11.3 /
 *              R12.4 点名要落地的**低置信墨度起伏**（环境层第 ③ 件）的**生产过程调用点**：
 *              它与显影**落在同一段落、但不是同一个元素**（显影动段落行 `<div>`，本类名在行内正文
 *              `<span>` 上 —— `transform` 对行内元素无效，见 `useRevealChoreography.ts` 文件头），
 *              所以两者**互不覆盖**：那条 CSS `animation` 动 `opacity`，显影的 GSAP 只动 `transform`。
 *              ④ `data-reveal-epoch` 把「持有的世代号」暴露到 DOM（R8.5：结构锚点优先于时间判据）。
 *              ⚠️ 因此本件新增一条 import 边：`components/structuredBlocks.ts`（它顶层 `import katex`
 *              + `katex.min.css`）⇒ **KaTeX 会成为会话详情惰性 chunk 的依赖**（首屏静态闭包不含本件，
 *              `check-bundle-budget` 的首屏口径不变；代价逐字登记在 `task-28-report.md` 的诚实边界）。
 * @ai-context: **逐条自审（控制方回执③）后仍保留的字面量**：`fontSize: 13`（三处 `<h3>` 标题，
 *              合法档 —— 规格 §4.2 字阶下界是 12px）· `fontSize: 12`（术语表折叠块）·
 *              `borderRadius: 8`（= `radiusScale.panel` 档）· `background: "#fafafa"`（**未迁移**：
 *              `#fafafa`/`#f8fafc` 与 token 表**零碰撞**且是**全站既有**底色，本仓 9 处同族写法
 *              —— 只改会话侧会造出跨面板不一致 ⇒ 🔴 **底色收敛批 6 未交付**（批 6 计划全文「底色收敛」
 *              **0 命中**，T35c 实测；批 7 尚无计划文件）⇒ **去向批 7/8**（仍未排期））· `#111827`/`#f0fdfa`
 *              等**逐字继承自原面板、未被我改写**且**不在任何棘轮集合内**的字面量。⇒ 五类棘轮
 *              （圆角 / 字号 / 弱化灰 / 卡片边框 / 三红）在本件全 0 命中。
 */
import { useRef } from "react";
import SessionScreenCards from "./SessionScreenCards";
import ImageGallery from "../ImageGallery";
import { lowConfidenceClass } from "../structuredBlocks";
import { useRevealChoreography } from "./useRevealChoreography";
import type { GlossaryTerm, SessionDetail, SessionOcrBlock } from "../../types";
import { fmtMs } from "../../utils/fmt";
import { Text } from "../../ui/primitives";

const SOURCE_LABEL: Record<string, string> = {
  subtitle: "字幕",
  asr: "语音",
  fused: "融合",
};

interface Props {
  detail: SessionDetail;
  /** 屏卡配图 baseUrl（""=无图集）——来自面板的 `useSessionDetailData` */
  baseUrl: string;
  /** 屏→OCR 块分组（hook 层 memo 预构建，本件不得重新分组） */
  ocrBlocksByScreen: ReadonlyMap<number, SessionOcrBlock[]>;
  /** 框选态：正在框选的屏（first_seen_ms；null=无）——由 hook 持有，跨视图切换不丢 */
  selectingScreen: number | null;
  onSelectScreen: (firstSeenMs: number | null) => void;
  /** 单屏 toast（screenKey=first_seen_ms；null=无） */
  panelToast: { screenKey: number; msg: string } | null;
  onShowToast: (screenKey: number, msg: string) => void;
  onClearToast: () => void;
  /** 术语表 summary 的**整串文案**（面板算好注入——见文件头第三段） */
  glossarySummary: string;
  /** 术语表数据（null=加载中；[]=已加载但无命中） */
  glossary: GlossaryTerm[] | null;
}

export default function SessionRawView({
  detail,
  baseUrl,
  ocrBlocksByScreen,
  selectingScreen,
  onSelectScreen,
  panelToast,
  onShowToast,
  onClearToast,
  glossarySummary,
  glossary,
}: Props) {
  const sessionId = detail.session.id;
  // 🔴 #2「显影编排」的挂载点（R5.2 的课后落点）。本件**只提供容器与锚点**：起始态物化、逐段
  // 错开、可中断/可反向全在 hook 里（视图保持零副作用 —— 与 T25 的容器单一真源同一条纪律）。
  const revealBox = useRef<HTMLDivElement | null>(null);
  const reveal = useRevealChoreography(revealBox, detail.segments);
  return (
    <>
      {/* 转写时间轴（字幕为主，语音/融合弱化；段 id 锚点供大纲/搜索跳转） */}
      <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>转写时间轴</h3>
      {/* `data-tone="paper"` = #2 的基调登记（R3.4 逐字「每个动效落点显式声明基调」）；
          `data-reveal-epoch` = 持有的重播世代（R8.5 的结构锚点） */}
      <div
        ref={revealBox}
        data-tone="paper"
        data-reveal-epoch={reveal.revealEpoch}
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        {/* v0.11.7：图文会话空态语义区分（无讲述内容）；其余会话维持原文案 */}
        {detail.segments.length === 0 && (
          <Text as="p" size={5} tone="ink-3">
            {detail.session.kind === "photo" ? "本会话无讲述内容（图文采集）" : "本会话无转写段"}
          </Text>
        )}
        {detail.segments.map((seg) => (
          <div
            key={seg.id}
            id={`seg-${sessionId}-${seg.id}`}
            data-seg-id={seg.id}
            style={{ display: "flex", gap: 8, alignItems: "baseline" }}
          >
            <Text tone="ink-3" style={{ width: 78, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {fmtMs(seg.start_ms)} – {fmtMs(seg.end_ms)}
            </Text>
            <Text
              tone={seg.source === "subtitle" ? "ok" : "ink-3"}
              style={{ width: 40, flexShrink: 0 }}
            >
              {SOURCE_LABEL[seg.source] ?? seg.source}
            </Text>
            {/* 低置信段（`confidence < 0.5`，阈值真源 = `structuredBlocks.lowConfidenceClass`）追加
                `ed-text--low-confidence`（R11.3 ③ 的环境层落点；样式规则在 `ui/primitives/Text.css`）。 */}
            <Text
              as="span"
              size={5}
              tone="ink-2"
              className={lowConfidenceClass(seg.confidence)}
              style={{ color: seg.source === "fused" ? "var(--ed-due)" : undefined }}
            >
              {seg.text}
            </Text>
          </div>
        ))}
      </div>

      {/* 画面要点屏卡流（v0.7.3 区间/标题/正文/标签/配图/结构徽标 + v0.7.7 框选截取）
          —— 拆至 session-detail/SessionScreenCards.tsx；toast/框选态**留在 useSessionDetailData**（屏卡子树随 viewMode 卸载，状态不能跟着走） */}
      <SessionScreenCards
        sessionId={sessionId}
        kind={detail.session.kind}
        screens={detail.screens}
        ocrBlockCount={detail.ocr_blocks.length}
        baseUrl={baseUrl}
        ocrBlocksByScreen={ocrBlocksByScreen as Map<number, SessionOcrBlock[]>}
        selectingScreen={selectingScreen}
        onSelectScreen={onSelectScreen}
        panelToast={panelToast}
        onShowToast={onShowToast}
        onClearToast={onClearToast}
      />

      {/* 术语表（v0.11.5 spec 8️⃣：词汇表移出笔记 → 会话详情展示；
          分析层 glossary 产出——画面高频 × 语音低频交叉，score 降序） */}
      <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>📖 术语表</h3>
      <details
        style={{
          fontSize: 12,
          border: "1px solid var(--ed-border)",
          borderRadius: 8,
          padding: "8px 10px",
          background: "#fafafa",
          marginBottom: 8,
        }}
      >
        <summary style={{ cursor: "pointer", color: "var(--ed-ok)", fontWeight: 600 }}>{glossarySummary}</summary>
        {glossary !== null && glossary.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
            {glossary.map((g) => (
              <div key={g.term} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <Text tone="ink-1" style={{ fontWeight: 600 }}>
                  {g.term}
                </Text>
                <Text tone="ink-3">画面 ×{g.ocrCount} / 语音 ×{g.asrCount}</Text>
                <Text tone="ink-3" size={6} style={{ marginLeft: "auto" }}>
                  分 {g.score.toFixed(1)}
                </Text>
              </div>
            ))}
          </div>
        )}
      </details>

      {/* 参考图集（v0.5.0 M6：REQ-051 三层图结构） */}
      <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>参考图集</h3>
      <ImageGallery sessionId={sessionId} />
    </>
  );
}
