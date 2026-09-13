/**
 * noteEvidenceModel —— 笔记「带证据三轨」的**模型层唯一实现**（批 8 T6；规格 §7.4 §A/§B/§C）。
 *
 * @ai-context **三轨的实现口径**（控制方 §2 A3；规格 §7.4 §A 已就地加注同一段定义）：
 *   ① **笔记段落轨** —— `EvidenceLine.paragraphIndex` = **派生序号**（§D2 的 (a)：`notes.content`
 *      是扁平 `TEXT`，段落身份只能派生 ⇒ 零 schema 改动、不触规格 §3 红线 6）。
 *   ② **转写段轨** —— `EvidenceCandidate.id` = `session_segments.id`（`types/session.ts` 的
 *      `SessionSegment.id`）。③ **OCR 块轨** —— `OcrEvidenceCandidate.id` = `session_ocr_blocks.id`
 *      （同文件的 `SessionOcrBlock.id`）。两轨的表在 `db_migrations.rs` 的 `session_segments` /
 *      `session_ocr_blocks`。取数走**既有** `get_session_detail`（`commands_session.rs` 的
 *      `list_segments` / `list_ocr_blocks` 一并返回）⇒ **零新 IPC / 零 Rust / 零 schema**（§2 A1/A2）。
 * @ai-context **证据本体是 `id`、段落锚点只有 `ms`** ⇒ E2 的「降级为 ms 最近邻」是**类型上的必然**，
 *   不是实现偷懒（规格 §A 的 E2 行；其出处更正见 §A 表下 T3 的就地加注）。
 * @ai-context **锚点语法复用而非重写**（§D4「不得新写第 3 支手写 markdown 解析器」/ 控制方 §2 A5）：
 *   本件**不定义任何锚点语法正则** —— 锚点抽取走 `utils/html.ts` 的 `renderTimestampAnchors`
 *   （该件自陈是 `[[ts:ms]]` 芯片的**唯一实现**）产物上的 `data-ts-ms` 属性。⇒ 全仓「什么算锚点」
 *   仍只有一处口径，本件与既有两条渲染链（`NoteMarkdown` / `utils/markdownLine.ts`）**同源**。
 * @ai-context **E1：无锚点是一等状态** —— 无锚点段落**不产生任何 `EvidenceMatch`**（没有锚就没有查询），
 *   故视图侧对无锚点段既不给证据列、也**不给**失配标记；「无证据」标记只属于**有锚点但容差内无候选**。
 * @ai-context **E3：两个分母并列、不许混用** —— 分母甲 = 派生段落总数 · 分母乙 = 带锚点段落数。
 *   两个比值（`命中数 / 分母甲` 与 `命中数 / 分母乙`）由调用方分别给出，**禁止只报一个**。
 * 副作用：无 —— 纯函数 + 类型 + 具名常量；不取数、不渲染、不 import Tauri、无 I/O。
 * 边界：① `evidenceFor` 的 `hit` **必须有转写段**（`segment` 非空）—— 这是 Interfaces 的类型约束：
 *   转写段轨是**判定轨**、OCR 块轨是**补充轨**（`ocr` 可为 `null`）⇒ 「容差内无候选」按**段**轨判。
 *   ② 容差默认值两条轨相同（均可经第三参覆盖）。③ 一段只取**首个**锚点 ⇒ 分母乙是**段数**而非锚点数。
 */
import { escapeHtml, renderTimestampAnchors } from "../../utils/html";

/** 笔记段落（`paragraphIndex` = **派生序号**；无锚点段落同样有号 —— E1 的一等状态） */
export interface EvidenceLine {
  readonly paragraphIndex: number;
  readonly text: string;
}

/** 段落锚点：只有 `ms`（`[[ts:ms]]` 的 ms 位），**没有 id** ⇒ E2 只能降级为最近邻 */
export interface EvidenceAnchor {
  readonly paragraphIndex: number;
  readonly ms: number;
}

/** 转写段候选（三轨之二）：`id` = `session_segments.id` */
export interface EvidenceCandidate {
  readonly id: number;
  readonly startMs: number;
}

/** OCR 块候选（三轨之三）：`id` = `session_ocr_blocks.id` */
export interface OcrEvidenceCandidate {
  readonly id: number;
  readonly timestampMs: number;
}

/**
 * 锚点芯片的**显示粒度**（ms）：`utils/html.ts` 的芯片正文是 `⏱ ${mm}:${ss}`，秒位取自 `(\d{2})`
 * 捕获组 ⇒ 读者能看到的最小刻度 = **1 s**（`title` 同粒度）。本常数不小于它 —— 见下推导 ①。
 */
export const ANCHOR_DISPLAY_GRANULARITY_MS: number = 1000;

/**
 * 仓内登记的**音频对齐块粒度**（ms）：`utils/html.ts` 逐字「定位精度受音频对齐的块粒度 ±200 ms 限制」
 * （同向读数 = `app/src-tauri/src/dtw_align_tests.rs` 的 ±200 ms 抖动 ⇒ 中位估计落 ±300 ms），
 * 采集链定长块亦为 200 ms（`capture/audio_loopback.rs`）⇒ 这是链路本身的量化步长。
 */
export const ASR_ALIGN_JITTER_MS: number = 200;

/**
 * E2① 的**容差**（ms）—— 取值依据三条，全部可复算，且由 `noteEvidenceModel.test.ts` 逐条钉住：
 *   ① **下界 = 显示粒度**（1 s）：锚点只显示 `⏱ MM:SS` ⇒ 容差 < 1000 ms 会把「显示上就是同一秒」
 *      的候选判成失配，产生**用户可见**的假「无证据」。
 *   ② **下界 = 5 × 对齐粒度**：1000 / `ASR_ALIGN_JITTER_MS`(200) = 5 ⇒ 容下 ±200 ms 量化步长及其
 *      300 ms 级中位误差（② 不是独立取值，而是 ① 的**余量自证**）。
 *   ③ **上界 = 一个典型段的跨度**：入库语料 `(start_ms, end_ms)` 邻接对 **n = 23 · p50 段时长
 *      = 1000 ms**（域 = `git ls-files`；批 8 T6 探针 `tmp/t6/p1-probe.mjs`），段时长下界 =
 *      `speaker_engine.rs` 的 `MIN_SEGMENT_MS = 500` ⇒ 容差窗口**至多覆盖一个典型段**；窗口外的候选
 *      属**另一个**发言单元 ⇒ 按 E2③ 出「无证据」，**不猜**。
 * 🔴 本数值是**设计决定**（规格 §E③ 逐字「不定数值」）—— 上述三条是**依据**，不是规格规定的值。
 */
export const EVIDENCE_TOLERANCE_MS: number = ANCHOR_DISPLAY_GRANULARITY_MS;

/**
 * E2③ 的**显式失配标记**（唯一串）：容差内无候选时视图必须显示它，**不许静默取最近的一个**。
 * 文案逐字取规格 §A 的 E2 行「出**显式「无证据」标记**」。
 */
export const NO_EVIDENCE_MARK: string = "无证据";

/**
 * 芯片的 ms 位（`utils/html.ts` 的产物属性）。🔴 本件唯一的正则，且它读的是**别人产出的属性**，
 * 不是锚点语法本身 ⇒ 不构成第 3 支解析器。非全局标志 ⇒ 天然只取**首个**，无 `lastIndex` 状态。
 */
const CHIP_MS = /data-ts-ms="(\d+)"/;

/** 一段的首个锚点 ms（`null` = 无锚点）。一段一锚 ⇒ 分母乙是**带锚点段数**，不是锚点个数。 */
function firstAnchorMs(text: string): number | null {
  const m = CHIP_MS.exec(renderTimestampAnchors(escapeHtml(text)));
  return m === null ? null : Number(m[1]);
}

/** 锚点抽取（段落级）。输出顺序 = 入参顺序（段落序是语义，不是可交换集合）。 */
export function extractAnchors(paragraphs: readonly EvidenceLine[]): readonly EvidenceAnchor[] {
  const out: EvidenceAnchor[] = [];
  for (const line of paragraphs) {
    const ms = firstAnchorMs(line.text);
    if (ms !== null) out.push({ paragraphIndex: line.paragraphIndex, ms });
  }
  return out;
}

/**
 * ms 最近邻（E2①②）—— 确定序，**不看入参数组顺序**：
 *   ① 先按容差过滤（`|锚点 ms − 候选 ms| <= toleranceMs` 才算候选，**边界含等号**）；
 *   ② 主键 = **距离升序**（「最近邻」逐字：容差内有多个候选时，取**最近**的那个）；
 *   ③ 次键 = `ms` 升序（同距离 ⇒ 取更早的那个）；④ 末键 = `id` 升序（同 ms ⇒ 取 id 最小者）。
 *   🔴 ③④ 是**显式比较**，不借 `Array.prototype.sort` 的稳定性；②③④ 使输出与入参次序无关。
 * 无候选 ⇒ `null`（由调用方转成 E2③ 的显式失配标记，**不在这里兜底取最近的一个**）。
 */
function pickNearest<T extends { readonly id: number }>(
  anchorMs: number,
  candidates: readonly T[],
  msOf: (c: T) => number,
  toleranceMs: number,
): T | null {
  let best: T | null = null;
  let bestMs = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const ms = msOf(c);
    const distance = Math.abs(anchorMs - ms);
    if (distance > toleranceMs) continue;
    const better =
      best === null ||
      distance < bestDistance ||
      (distance === bestDistance && (ms < bestMs || (ms === bestMs && c.id < best.id)));
    if (better) {
      best = c;
      bestMs = ms;
      bestDistance = distance;
    }
  }
  return best;
}

/** 转写段轨的最近邻（`start_ms` 是它的时间轴） */
export function nearestSegment(
  anchorMs: number,
  candidates: readonly EvidenceCandidate[],
  toleranceMs: number = EVIDENCE_TOLERANCE_MS,
): EvidenceCandidate | null {
  return pickNearest(anchorMs, candidates, (c) => c.startMs, toleranceMs);
}

/** OCR 块轨的最近邻（`timestamp_ms` 是它的时间轴；与转写轨共用同一确定序） */
export function nearestOcrBlock(
  anchorMs: number,
  candidates: readonly OcrEvidenceCandidate[],
  toleranceMs: number = EVIDENCE_TOLERANCE_MS,
): OcrEvidenceCandidate | null {
  return pickNearest(anchorMs, candidates, (c) => c.timestampMs, toleranceMs);
}

/**
 * 一个带锚点段落的证据结论。`no-evidence` 是**一等结果**（E2③）：它对应「有锚点但容差内无候选」，
 * 视图必须把它渲染成 `NO_EVIDENCE_MARK`，**不得**当成异常、也**不得**回填最近的一个。
 */
export type EvidenceMatch =
  | {
      readonly kind: "hit";
      readonly anchor: EvidenceAnchor;
      readonly segment: EvidenceCandidate;
      readonly ocr: OcrEvidenceCandidate | null;
    }
  | { readonly kind: "no-evidence"; readonly anchor: EvidenceAnchor };

/** 单段取证：转写段轨定成败（`null` ⇒ 失配），OCR 块轨只做补充（可为 `null` 而不影响 `hit`）。 */
export function evidenceFor(
  anchor: EvidenceAnchor,
  segments: readonly EvidenceCandidate[],
  ocr: readonly OcrEvidenceCandidate[],
  toleranceMs: number = EVIDENCE_TOLERANCE_MS,
): EvidenceMatch {
  const segment = nearestSegment(anchor.ms, segments, toleranceMs);
  if (segment === null) return { kind: "no-evidence", anchor };
  return { kind: "hit", anchor, segment, ocr: nearestOcrBlock(anchor.ms, ocr, toleranceMs) };
}

/** E3 的**双分母**（并列的两个**分母**；两个比值由调用方分别算，禁止合成一个「覆盖率」） */
export interface Coverage {
  readonly byDerived: number;
  readonly byAnchored: number;
}

/**
 * E3 的覆盖率分母。🔴 **取样时点写死**（§C53.5 适用点①：功能型判据对「在哪一步取键」免疫，故本函数
 * 另配一条**源码顺序判据**）：① 分母甲 = 派生段落总数（`lines` 就是派生结果本身）→ ② 分母乙
 * = 带锚点段落数（**从段落抽锚点**）→ ③ 匹配结果已定（第二参数位，本函数**不消费**它）。
 * ⇒ 分母乙**不是**命中数：有锚点但失配的段落照样进分母乙，无锚点段落**一律不进**。
 * 第二参数名为 `_matches` 是**有意的**（`noUnusedParameters` 下表示「刻意不消费」）—— 见批 8 T6 报告。
 */
export function coverageOf(lines: readonly EvidenceLine[], _matches: readonly EvidenceMatch[]): Coverage {
  const byDerived = lines.length;
  const byAnchored = extractAnchors(lines).length;
  return { byDerived, byAnchored };
}
