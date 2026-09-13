/**
 * noteEvidence.fixtures —— 笔记「带证据三轨」的**纯数据夹具**（批 8 T6；规格 §7.4 §B/§C 的落地）。
 *
 * @ai-context 本件**只有类型与常量**（无函数、无副作用、无 I/O）：夹具进棘轮域（它不是 `*.test.*`）
 *   ⇒ 与 `noteEvidenceModel.ts` 同受「零样式字面量」约束（见 `noteEvidenceModel.test.ts` 的 V5 读数）。
 * @ai-context **四类无锚点**（规格 §B）：① `OCR_DIRECT`（图文会话）② `WEB_ARTICLE`（网页正文）
 *   ③ `MANUAL_NOTE`（手动笔记）④ `ANCHOR_SWITCH` 的 `off` 态（`anchor_timestamps=false`）。
 *   前三类的候选轨**刻意非空** —— 否则「0 个证据列」是**空真**（没有候选本来也不会有证据）。
 * @ai-context **两态夹具**（规格 §C）：`ANCHOR_SWITCH`（同一正文的开关两态）与 `REFINE_PAIR`
 *   （精修前 / 精修后）。两态**共用同一组候选轨**（`segments` / `ocr` 逐字相同）⇒ 两态读数的差
 *   只可能来自**锚点的存亡**，是**受控对比**（不等长/不等候选的对比只能当存在性证据）。
 *   两态的「同一份正文」由判据用 `before[i].text.endsWith(after[i].text)` 逐段对拍（锚点在段首）。
 * @ai-context 🔴 **精修后段落锚点消失是设计行为**（`anchor_strip.rs` 主动剥离、只回挂章节锚点）
 *   ⇒ 这些段落必须走 E2 的**失配分支**（显式「无证据」标记），**不得**报成缺陷、**不得**回滚精修。
 */

import type { EvidenceCandidate, EvidenceLine, OcrEvidenceCandidate } from "./noteEvidenceModel";

/** 一类静态夹具（段落轨 + 转写段轨 + OCR 块轨） */
export interface NoteEvidenceFixture {
  /** 类名 —— 断言与报告**点名**用它，不用序号 */
  readonly kind: "ocrDirect" | "web" | "manual";
  /** 该类在规格 §B 的「出处（发射路径）」列（**含「未接线」的如实登记**） */
  readonly origin: string;
  readonly lines: readonly EvidenceLine[];
  readonly segments: readonly EvidenceCandidate[];
  readonly ocr: readonly OcrEvidenceCandidate[];
}

/**
 * ① `OcrDirect`（图文会话）：正文由 `note_filter_ocr::rebuild_ocr_markdown` 从 OCR 块拼出，
 * 该文件里 `format_timestamp` 的调用点 = 0 ⇒ **段落全部无锚点**（不是缺陷，是这一类的一等形态）。
 */
export const OCR_DIRECT: NoteEvidenceFixture = {
  kind: "ocrDirect",
  origin: "note_filter_render.rs:85（rebuild_ocr_markdown）",
  lines: [
    { paragraphIndex: 0, text: "粉底液色号对照：冷调偏粉、暖调偏黄。" },
    { paragraphIndex: 1, text: "上妆顺序：隔离 → 粉底 → 遮瑕 → 定妆。" },
    { paragraphIndex: 2, text: "手背试色要在自然光下看。" },
  ],
  segments: [
    { id: 1, startMs: 3000 },
    { id: 2, startMs: 18000 },
  ],
  ocr: [
    { id: 11, timestampMs: 3000 },
    { id: 12, timestampMs: 18000 },
    { id: 13, timestampMs: 33000 },
  ],
};

/**
 * ② `Web`（网页正文）：正文直取 `web_session_pages.markdown`。
 * 🔴 `BodySource::Web` 今天在 `note_body_source.rs` 里是 `#[allow(dead_code)]` **预留变体**、
 * **没有生产发射路径** ⇒ 本夹具是**未接线变体**的**唯一**覆盖面，不得读成「真实网页路径已验证」。
 */
export const WEB_ARTICLE: NoteEvidenceFixture = {
  kind: "web",
  origin: "note_body_source.rs:24-27（BodySource::Web，未接线）",
  lines: [
    { paragraphIndex: 0, text: "遮瑕的三种质地：膏状遮盖强、液状自然、笔状精准。" },
    { paragraphIndex: 1, text: "定妆粉的粒径越小，雾面感越强。" },
  ],
  segments: [{ id: 7, startMs: 12000 }],
  ocr: [{ id: 21, timestampMs: 12000 }],
};

/**
 * ③ 手动笔记（用户手写/改写）：**无发射路径**。
 * 🔴 候选轨**非空**是有意的 —— 它证明「没有锚点语法就不会被补锚点」不是因为没有证据可挂
 * （与规格 §4.4 的「绝不猜」同源纪律）：`extractAnchors` 从不读候选轨。
 */
export const MANUAL_NOTE: NoteEvidenceFixture = {
  kind: "manual",
  origin: "无发射路径（用户手写/改写）",
  lines: [
    { paragraphIndex: 0, text: "老师说冷皮用粉调，我试了确实更亮。" },
    { paragraphIndex: 1, text: "下次记得带自己的刷子。" },
  ],
  segments: [
    { id: 2, startMs: 9000 },
    { id: 3, startMs: 26000 },
  ],
  ocr: [{ id: 31, timestampMs: 9000 }],
};

/** 静态三类（第 ④ 类是开关两态，见 `ANCHOR_SWITCH`）—— 供判据**逐类**遍历，避免漏类 */
export const STATIC_FIXTURES: readonly NoteEvidenceFixture[] = [OCR_DIRECT, WEB_ARTICLE, MANUAL_NOTE];

/** ④ `anchor_timestamps` 开关的**同一份正文两态**（`purify_config.rs` 默认 `true`） */
export interface AnchorSwitchFixture {
  readonly segments: readonly EvidenceCandidate[];
  readonly ocr: readonly OcrEvidenceCandidate[];
  /** 开关 `true`：段首锚点在（第 3 段刻意无锚点 ⇒ 分母甲 ≠ 分母乙） */
  readonly on: readonly EvidenceLine[];
  /** 开关 `false`：同一正文、锚点语法整体缺席（金测试 `note_filter_golden_tests.rs:125-127` 已钉住） */
  readonly off: readonly EvidenceLine[];
}

/** 第 4 段的 47120 与锚点 47000 相差 120 ms —— 刻意落在容差内，让「抖动容差」在夹具里真的被用到。 */
export const ANCHOR_SWITCH: AnchorSwitchFixture = {
  segments: [
    { id: 1, startMs: 5000 },
    { id: 2, startMs: 20000 },
    { id: 3, startMs: 47120 },
  ],
  ocr: [
    { id: 11, timestampMs: 5000 },
    { id: 12, timestampMs: 20000 },
    { id: 13, timestampMs: 47200 },
  ],
  on: [
    { paragraphIndex: 0, text: "[⏱ 00:05]([[ts:5000]]) 隔离霜先抚平毛孔。" },
    { paragraphIndex: 1, text: "[⏱ 00:20]([[ts:20000]]) 粉底用美妆蛋少量多次。" },
    { paragraphIndex: 2, text: "[⏱ 00:47]([[ts:47000]]) 遮瑕点在泪沟最深处。" },
    { paragraphIndex: 3, text: "定妆喷雾距离面部三十厘米。" },
  ],
  off: [
    { paragraphIndex: 0, text: "隔离霜先抚平毛孔。" },
    { paragraphIndex: 1, text: "粉底用美妆蛋少量多次。" },
    { paragraphIndex: 2, text: "遮瑕点在泪沟最深处。" },
    { paragraphIndex: 3, text: "定妆喷雾距离面部三十厘米。" },
  ],
};

/** ⑤/⑥ 精修前 / 精修后两态（规格 §C 契约：段落锚点被主动剥离，只回挂章节锚点） */
export interface RefinePairFixture {
  readonly segments: readonly EvidenceCandidate[];
  readonly ocr: readonly OcrEvidenceCandidate[];
  readonly before: readonly EvidenceLine[];
  readonly after: readonly EvidenceLine[];
}

/**
 * 两态的**候选轨逐字相同**（受控对比）；标题行两态都带**章节锚点**（外带 `[...]` 包裹的形态），
 * 段首锚点只在 `before`（回挂只认标题行精确匹配 ⇒ 正文段落的锚点不会回来）。
 * 第 4 段（`## 定妆 [[⏱ 01:39]([[ts:99000]])]`）距最近转写段 51880 ms > 容差 ⇒ 两态都出**失配**，
 * 用来证明「失配不是精修造成的」。
 */
export const REFINE_PAIR: RefinePairFixture = {
  segments: [
    { id: 1, startMs: 5000 },
    { id: 2, startMs: 20000 },
    { id: 3, startMs: 47120 },
  ],
  ocr: [
    { id: 11, timestampMs: 5000 },
    { id: 12, timestampMs: 20000 },
    { id: 13, timestampMs: 47200 },
  ],
  before: [
    { paragraphIndex: 0, text: "## 底妆顺序 [[⏱ 00:05]([[ts:5000]])]" },
    { paragraphIndex: 1, text: "[⏱ 00:05]([[ts:5000]]) 隔离霜先抚平毛孔。" },
    { paragraphIndex: 2, text: "[⏱ 00:20]([[ts:20000]]) 粉底用美妆蛋少量多次。" },
    { paragraphIndex: 3, text: "[⏱ 00:47]([[ts:47000]]) 遮瑕点在泪沟最深处。" },
    { paragraphIndex: 4, text: "## 定妆 [[⏱ 01:39]([[ts:99000]])]" },
    { paragraphIndex: 5, text: "散粉压两遍，鼻翼用余粉带过。" },
  ],
  after: [
    { paragraphIndex: 0, text: "## 底妆顺序 [[⏱ 00:05]([[ts:5000]])]" },
    { paragraphIndex: 1, text: "隔离霜先抚平毛孔。" },
    { paragraphIndex: 2, text: "粉底用美妆蛋少量多次。" },
    { paragraphIndex: 3, text: "遮瑕点在泪沟最深处。" },
    { paragraphIndex: 4, text: "## 定妆 [[⏱ 01:39]([[ts:99000]])]" },
    { paragraphIndex: 5, text: "散粉压两遍，鼻翼用余粉带过。" },
  ],
};
