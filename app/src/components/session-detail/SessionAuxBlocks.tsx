/**
 * SessionAuxBlocks — 会话详情面板的**顶部信息块与尾部收束**（可信度总览卡 + `refineMsg` 行 +
 * 两个裁决面板）。
 *
 * @ai-context: 自 SessionDetailPanel.tsx 抽出（批 5 T2 Step 2 · C9）。三件各自独立职责：
 *              ① `SessionQualityCard`（M6/REQ-076 可信度总览）——纯展示；`quality` 为 null 时
 *                 整块不渲染（条件在面板侧，原样搬移）；
 *              ② `refineMsg` 提示行（懒触发降级/进度/完成/跳过/失败共用一行）——搬来是因为
 *                 它与两裁决面板同属「切换器行之后的收束」；
 *              ③ `SessionAuxPanels`（v0.20.2 REQ-268/270 两面板的显隐与挂载）——「会话切换即关」
 *                 的两个 effect 逐字搬来（显隐 state 仍留面板：工具条三按钮在切换器行里，
 *                 就近持有回调比把 setState 下放更少暴露面）。
 * @ai-context: DOM 顺序契约：`refineMsg` 行与两个 `.ed-*` 遮罩浮层在面板里原本就是**所有 in-flow
 *              内容之后的同级兄弟**，本件不新增 wrapper。
 * @ai-context: 数据全注入、**零 `invoke`**：两个面板自己取数（其 IPC 不在本件内），本件只做显隐。
 * @ai-context: **棘轮口径（控制方 2026-09-12 插播裁决：新文件创建时就须干净，不许改 `*Baseline.ts`）**
 *              —— 本件 0 处裸 `fontSize<12` / 0 处 `#9ca3af` / 0 处 `1px solid #e5e7eb` /
 *              0 处三红字面量：四处计数徽标与低置信行改走 `<Text size={5|6}>`；四个色值改走
 *              **语义 token**（`tone="stamp"|"due"` 与 `var(--ed-link)`）；整圈边框走
 *              `var(--ed-border)` —— **不迁 `Surface`**：徽标/折叠块是行内元素与 `<details>`，
 *              `SurfaceTag` 不含它们（加档=改原语契约，不在本任务范围）。
 * @ai-context: 样式口径——其余 inline style 沿用拆分前（不改间距、不改底色）。
 */
import { useEffect } from "react";
import ProofreadPanel from "../ProofreadPanel";
import SecondPassPanel from "../SecondPassPanel";
import type { QualityReport } from "../../types";
import { fmtMs } from "../../utils/fmt";
import { Text } from "../../ui/primitives";

interface QualityCardProps {
  quality: QualityReport;
}

/** M6（REQ-076）：可信度总览卡片（面板仅在 `quality` 非空时渲染本件） */
export function SessionQualityCard({ quality }: QualityCardProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      {(
        [
          ["低置信段", quality.low_confidence_count, quality.low_confidence_count > 0 ? "stamp" : "ink-3"],
          ["OCR 低分", quality.low_score_ocr_count, "due"],
          ["unknown 区", quality.unknown_region_count, "ink-1"],
          ["AI 复核候选", quality.ai_candidate_count, "link"],
        ] as const
      ).map(([label, count, tone]) => (
        <Text
          key={label}
          tone={tone}
          size={6}
          style={{
            background: "var(--ed-bg-canvas)",
            border: "1px solid var(--ed-border)",
            borderRadius: 10,
            padding: "2px 8px",
          }}
        >
          {label} {count}
        </Text>
      ))}
      {quality.low_confidence_segments.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, color: "var(--ed-ink-3)", cursor: "pointer" }}>
            低置信列表（{quality.low_confidence_segments.length}）
          </summary>
          {quality.low_confidence_segments.map((s) => (
            <Text key={s.segment_id} as="div" tone="ink-3" size={6} style={{ marginTop: 3 }}>
              [{fmtMs(s.start_ms)}] {s.text}（{s.confidence.toFixed(2)}）
            </Text>
          ))}
        </details>
      )}
    </div>
  );
}

interface AuxPanelsProps {
  sessionId: number;
  /** 精修状态文案（空串=不渲染该行）——由面板的 `useSessionDetailData` 注入 */
  refineMsg: string;
  /** 精修中（决定提示行配色：进行中 / 完成） */
  refining: boolean;
  /** 离线精修（第二遍）面板显隐 */
  showPass2: boolean;
  /** LLM 文本校对面板显隐 */
  showProofread: boolean;
  /** 关闭离线精修（面板内 ✕ / 采纳 / 回退后的关闭路径逐字不变） */
  onClosePass2: () => void;
  /** 关闭文本校对 */
  onCloseProofread: () => void;
}

/** refineMsg 行 + 两个裁决面板（会话切换即关——两个 effect 逐字搬移，deps 仍是 `[sessionId]`） */
export function SessionAuxPanels({
  sessionId,
  refineMsg,
  refining,
  showPass2,
  showProofread,
  onClosePass2,
  onCloseProofread,
}: AuxPanelsProps) {
  // v0.20.2（REQ-268/270）：显隐 state 仍由面板持有（工具条三按钮在切换器行里 ⇒ 就近不拆），
  // 「会话切换即关」两个 effect 逐字搬来此处（与面板内同 deps、同一提交批次，语义不变）。
  useEffect(() => onClosePass2(), [sessionId]);
  useEffect(() => onCloseProofread(), [sessionId]);
  return (
    <>
      {/* 精修状态/降级提示行（拆分前紧跟切换器行，DOM 位置逐字不变） */}
      {refineMsg && (
        <Text as="div" tone={refining ? "due" : "ok"} size={6} style={{ marginBottom: 6 }}>
          {refining ? "⏳ " : ""}
          {refineMsg}
        </Text>
      )}
      {/* v0.20.2（REQ-268）：离线精修（第二遍）裁决面板 */}
      {showPass2 && <SecondPassPanel sessionId={sessionId} onClose={onClosePass2} />}
      {/* v0.20.2（REQ-270）：LLM 文本校对面板 */}
      {showProofread && <ProofreadPanel sessionId={sessionId} onClose={onCloseProofread} />}
    </>
  );
}
