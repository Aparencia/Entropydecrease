/**
 * NoteEvidenceTrackView — 笔记「带证据三轨」的**视图层**（批 8 T8；规格 §7.4 §A/§C · 控制方 §2 A3/A5）。
 *
 * @ai-context **三条 DOM 契约**（规格 §7.4 §A 的 E1/E2；本件每条对应一个渲染分支，逐条可判）：
 *   ① **E1 正向**：**每个**段落节点都带 `data-evidence-for="{paragraphIndex}"`（**含无锚点段**）——
 *      「无锚点」是**一等状态**（§A 的 E1 改写行 + §B 的四类），不是缺陷、也不是漏渲染。
 *   ② **E1 反向**：**只有带锚点段**才渲染证据列（`[data-evidence-cell]`）⇒ 两个方向各自成判据：
 *      **有锚点无证据列 = 缺陷**；**无锚点无证据列 = 正常**（无锚点段**不得**出现任何失配告警）。
 *   ③ **E2**：命中 ⇒ 证据列里每个候选带 `data-evidence-id="{id}"`（转写段轨 = `session_segments.id`
 *      · OCR 块轨 = `session_ocr_blocks.id` —— 控制方 §2 A3 的三轨口径）；**容差内无候选** ⇒ 渲染
 *      模型层的唯一串 `NO_EVIDENCE_MARK`（显式「无证据」），**不静默取最近的一个**、**不当异常**。
 * @ai-context **§C 契约（精修两态）**：精修**有意**剥离段落锚点（`anchor_strip.rs` 主动剥离、只回挂
 *   章节锚点）⇒ 精修后的段落落到 ①：仍然逐段带 `data-evidence-for`，但**没有**证据列、**没有**告警
 *   ——「段级锚点消失」在 DOM 上是**沉默的正常态**，不是缺陷，也不构成回滚精修的理由；仍带章节锚点
 *   的段落照走 ③（命中，或容差外 ⇒ 显式失配）。两态由 `noteEvidence.fixtures.ts` 的 `REFINE_PAIR`
 *   提供（候选轨逐字相同 ⇒ 读数差只可能来自锚点的存亡，是**受控对比**）。
 * @ai-context **渲染链复用（§7.4 §D4 + 控制方 §2 A5）**：本件**零 markdown 词法** —— 段落正文交给
 *   `utils/markdownLine.ts` 的 `mdLineHtml`（行级渲染的**唯一实现**，与 `NotePreviewView` /
 *   `refineDiff` 同源；`# ` / `## ` / `- ` / `> ` 的分支判定全仓只有那一处），芯片由它经
 *   `utils/html.ts` 的 `renderTimestampAnchors` 产出 ⇒ **没有第 3 支手写 markdown 解析器**。
 * @ai-context **段落轨 = 渲染器实际产出的段落节点**（§A 的 E3 分母甲逐字口径）：`evidenceLinesOf`
 *   把 `notes.content` 切成**非空行**并给出连续派生序号 —— 空行经 `mdLineHtml` 产出空串、不产出节点
 *   ⇒ 它既不是段落、也不进任何分母。🔴 **本函数是段落轨的唯一派生处**：容器侧（T10 的取数 hook）
 *   必须复用同一条，否则 `matches` 的 `paragraphIndex` 会与 DOM 漂移（跨单元接口契约，见 T8 报告）。
 * @ai-context **数据面（零 Tauri）**：`views/**` 有**整目录**硬边界（`architecture.guard.test.ts` A3③：
 *   生产文件**含 `import type` 在内**零 `@tauri-apps` 边）⇒ 取数只能在容器侧发生；本件只吃
 *   `NoteViewSlot` 的字段 + **可选**的 `evidence` 候选轨注入面。🔴 **缺省态**（注册表直载、容器未接线）
 *   ⇒ 候选轨为空 ⇒ 有锚点段渲染出**显式「无证据」**（这正是 E2 的诚实读数），**不**假装命中。
 * @ai-context **E3 两个分母并列**：`coverageOf` 的两个分母**分别**渲染（`data-coverage="derived"` /
 *   `"anchored"`），**禁止**合成一个数就称「覆盖率」；分母为 0 ⇒ 该比值**无定义** ⇒
 *   `data-coverage-ratio` 属性**整条缺席**（记 `null`，**不写 0** 冒充读数）。
 * 副作用：无（纯渲染；零 `invoke` / 零 store / 零 I/O / 零时器）。
 * 边界：① 观感（列宽 / 对齐 / 密度 / 长文换行）**未测**（像素面归 T12–T15）② `onTaskToggle` /
 *   `onOpenSession` / `onImageOpen` 三个槽在本视图内**不被消费**（段落走行级字符串链 ⇒ 无勾选框 /
 *   无图片解析 / 无回链跳转；「原文永远保留」由默认 `raw` 视图承载，规格 §7.3①），本件也**不**提供
 *   seek 出口（`NoteViewSlot` 无 `onSeekMs`：批 6 C10.3 已裁「不得新增可选槽」，包装件形态见
 *   `NoteCardFlowWithSeek.tsx` 的先例）③ 定位精度受音频对齐块粒度 **±200 ms** 限制，不得声称毫秒级。
 */
import type { CSSProperties } from "react";
import type { NoteViewSlot } from "../registry";
import { PREVIEW_MODE, mdLineHtml } from "../../utils/markdownLine";
import {
  NO_EVIDENCE_MARK, coverageOf, evidenceFor, extractAnchors,
  type Coverage, type EvidenceCandidate, type EvidenceLine, type EvidenceMatch, type OcrEvidenceCandidate,
} from "./noteEvidenceModel";

/** 容器注入的**证据候选轨**（三轨之二 / 之三）。缺省 = 空轨（注册表直载态，见文件头「数据面」）。 */
export interface NoteEvidenceTracks {
  /** 转写段轨：`id` = `session_segments.id` · `startMs` = `start_ms` */
  readonly segments?: readonly EvidenceCandidate[];
  /** OCR 块轨：`id` = `session_ocr_blocks.id` · `timestampMs` = `timestamp_ms` */
  readonly ocr?: readonly OcrEvidenceCandidate[];
  /**
   * **同源段落轨**（T10 注入；缺省 ⇒ 本视图用下方 `evidenceLinesOf` 自派生，DOM 契约一字不变）。
   * 🔴 存在的唯一理由 = 段落轨**只有一处派生**：容器侧要拿同一个 `paragraphIndex` 才能让
   * `matches[].anchor` 与 `data-evidence-for` 对齐；两处各切一次会**静默错位**（见 `evidenceLinesOf`）。
   */
  readonly lines?: readonly EvidenceLine[];
}

/**
 * 本视图的 props = **`NoteViewSlot` 的字段一字不改** + 一个**可选**注入面。
 * 🔴 不新增 `NoteViewSlot` 的可选槽（批 6 C10.3 已裁；本批非目标 7）⇒ 额外数据只许走
 * **包装件 / 容器侧**（先例 `NoteCardFlowWithSeek.tsx`），且 `views/architecture.slots.test.ts` 的
 * tsc 探针要求「视图 props ⊆ slot」⇒ 注入面必须是**可选**的（否则 `TS2769`）。
 */
export type NoteEvidenceTrackProps = NoteViewSlot & { readonly evidence?: NoteEvidenceTracks };

/** 缺省候选轨（**模块级常量**：稳定引用，不在渲染里新建数组） */
const NO_SEGMENTS: readonly EvidenceCandidate[] = [];
const NO_OCR: readonly OcrEvidenceCandidate[] = [];

/**
 * 段落轨的**唯一派生处**：`notes.content` 的**非空行** → 连续派生序号（无锚点段同样有号）。
 * 口径依据 = §A 的 E3 分母甲逐字「渲染器实际产出的段落节点数」：`mdLineHtml` 对空行返回空串
 * ⇒ 空行不产出节点、不构成段落。纯函数（同入参恒同出参）、零 markdown 词法判定。
 */
export function evidenceLinesOf(content: string): readonly EvidenceLine[] {
  const lines: EvidenceLine[] = [];
  for (const text of content.split(/\r?\n/)) {
    if (text.trim() !== "") lines.push({ paragraphIndex: lines.length, text });
  }
  return lines;
}

/** E3 的比值：分母为 0 ⇒ `null`（无定义）。🔴 **不写 0** —— 0 是「一个都没命中」的读数，两者不可混。 */
export function ratioOrNull(hits: number, denominator: number): number | null {
  return denominator === 0 ? null : hits / denominator;
}

/** 毫秒 → `mm:ss`（与锚点芯片同一显示粒度 1 s；不引入第三种时间格式） */
function stamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** 布局样式（只承载布局；底色 / 边框 / 圆角一律走 token —— ADR-033 §4，零字面量） */
const PANEL: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
const SUMMARY: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "var(--ed-space-12,12px)",
  paddingBottom: "var(--ed-space-8,8px)", color: "var(--ed-ink-3)",
};
const ROW: CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: "var(--ed-space-12,12px)",
  padding: "var(--ed-space-8,8px) 0", borderTop: "1px solid var(--ed-border)",
};
const PARAGRAPH: CSSProperties = { flex: 1, minWidth: 0 };
const EVIDENCE: CSSProperties = { flex: "0 1 42%", minWidth: 0, color: "var(--ed-ink-3)" };
const CANDIDATE: CSSProperties = { display: "block" };

/**
 * E3 的一格：两个分母**各一格**、各带自己的 `data-coverage`。`data-coverage-ratio` 在分母为 0 时
 * **整条缺席**（`undefined` ⇒ React 不落属性）⇒「无定义」在 DOM 上可判，且与「比值 = 0」互不混淆。
 */
function CoverageCell({ kind, hits, denominator }: { kind: "derived" | "anchored"; hits: number; denominator: number }) {
  const ratio = ratioOrNull(hits, denominator);
  const label = kind === "derived" ? "全篇" : "带锚点";
  return (
    <span
      data-coverage={kind}
      data-coverage-hits={hits}
      data-coverage-denominator={denominator}
      data-coverage-ratio={ratio === null ? undefined : ratio.toFixed(3)}
    >{`${label} ${denominator === 0 ? "—" : `${hits}/${denominator}`}`}</span>
  );
}

/** 证据列（调用点保证**只在带锚点段**上渲染：无锚点段拿不到 `EvidenceMatch`） */
function EvidenceColumn({ match }: { match: EvidenceMatch }) {
  if (match.kind === "no-evidence") {
    // E2③：容差内无候选 ⇒ **显式标记**（串取自模型层，不许另写文案、不许回填最近邻）
    return <div data-evidence-cell="" data-evidence-missing="" style={EVIDENCE}>{NO_EVIDENCE_MARK}</div>;
  }
  return (
    <div data-evidence-cell="" style={EVIDENCE}>
      <span data-evidence-id={match.segment.id} data-evidence-track="segment" style={CANDIDATE}>
        {`转写段 #${match.segment.id} · ${stamp(match.segment.startMs)}`}
      </span>
      {match.ocr === null ? null : (
        <span data-evidence-id={match.ocr.id} data-evidence-track="ocr" style={CANDIDATE}>
          {`画面块 #${match.ocr.id} · ${stamp(match.ocr.timestampMs)}`}
        </span>
      )}
    </div>
  );
}

/** 视图本体：段落轨 + 证据列 + E3 双分母（无锚点段是一条**完整的正常路径**，不是空转分支）。 */
export default function NoteEvidenceTrackView({ note, evidence }: NoteEvidenceTrackProps) {
  // 段落轨：容器注入了同源 `lines` 就用它（唯一派生处仍在 `evidenceLinesOf`，见文件头契约）
  const lines = evidence?.lines ?? evidenceLinesOf(note.content);
  // 取样顺序 = 模型层的顺序（段落 → 抽锚 → 取证 → 覆盖）：分母乙取自**段落**、不是命中数（§C53.5）。
  const matches = extractAnchors(lines).map((anchor) =>
    evidenceFor(anchor, evidence?.segments ?? NO_SEGMENTS, evidence?.ocr ?? NO_OCR));
  const coverage: Coverage = coverageOf(lines, matches);
  const byParagraph = new Map<number, EvidenceMatch>(matches.map((m) => [m.anchor.paragraphIndex, m]));
  const hits = matches.filter((m) => m.kind === "hit").length;

  return (
    <div data-testid="note-evidence-track" style={PANEL}>
      <div data-coverage-summary="" style={SUMMARY}>
        <CoverageCell kind="derived" hits={hits} denominator={coverage.byDerived} />
        <CoverageCell kind="anchored" hits={hits} denominator={coverage.byAnchored} />
      </div>
      {lines.map((line) => {
        const match = byParagraph.get(line.paragraphIndex) ?? null;
        return (
          <div key={line.paragraphIndex} data-evidence-for={line.paragraphIndex} style={ROW}>
            {/* 段落正文 = 既有行级渲染链的产物（本件零 markdown 词法；E1 正向：每段都有 data-evidence-for） */}
            <div style={PARAGRAPH} dangerouslySetInnerHTML={{ __html: mdLineHtml(line.text, PREVIEW_MODE) }} />
            {/* E1 反向：`match === null` ⇔ **无锚点** ⇒ 不渲染证据列、也不渲染任何告警（§B 的四类） */}
            {match === null ? null : <EvidenceColumn match={match} />}
          </div>
        );
      })}
    </div>
  );
}
