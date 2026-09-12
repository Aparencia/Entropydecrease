/**
 * 会话领域类型（自 types.ts 硬拆归位；v0.2.0 REQ-010，与 Rust serde 契约对齐）。
 *
 * @ai-context: 覆盖会话本体/转写段/OCR 块/画面要点屏、结构图与图内检索、
 *              过滤统计与笔记过滤结果（NoteFilterResult）、段搜索命中与 AI 复核。
 *              产物体系类型另归 artifact.ts（同 barrel 可达）。
 */

/** 会话记录（Rust Session，snake_case 契约） */
export interface Session {
  id: number;
  title: string;
  source_window: string | null;
  started_at: number;
  ended_at: number | null;
  status: string; // recording | finished | failed
  /** v0.11.7：会话类型（null=视频类会话；'photo'=图文截屏会话） */
  kind: string | null;
}

/** 会话转写段（asr | subtitle | fused） */
export interface SessionSegment {
  id: number;
  session_id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  source: string;
  confidence: number | null;
}

/** 会话 OCR 块（subtitle | full） */
export interface SessionOcrBlock {
  id: number;
  session_id: number;
  timestamp_ms: number;
  text: string;
  score: number;
  region: string;
}

/** 屏内结构块（Rust ScreenStructure；v0.7.3 REQ-159） */
export interface ScreenStructure {
  kind: string; // table | formula | code
  text: string;
  /** 精修渲染产物（None=未精修/失败） */
  rendered: string | null;
}

/** 画面要点屏（Rust SessionScreen；v0.7.3 REQ-155/158/160，ADR-015） */
export interface SessionScreen {
  session_id: number;
  /** 屏号（None=旧数据聚类派生） */
  screen_id: number | null;
  first_seen_ms: number;
  last_seen_ms: number;
  /** 标题角色行（None=无 bbox 降级/无标题） */
  title: string | null;
  /** 正文行（行合并后） */
  body: string[];
  /** 图注/标签 */
  labels: string[];
  /** 归档 full 图相对路径（None=无匹配图） */
  image_ref: string | null;
  structure: ScreenStructure[];
}

/** 会话详情（会话 + 转写段 + OCR 块 + 画面要点屏） */
export interface SessionDetail {
  session: Session;
  segments: SessionSegment[];
  ocr_blocks: SessionOcrBlock[];
  /** v0.7.3：画面要点屏卡（旧数据聚类兜底） */
  screens: SessionScreen[];
}

/** 结构图记录（Rust StructureImageRecord；v0.7.7 REQ-183 非线性结构图像持久化） */
export interface StructureImageRecord {
  id: number;
  sessionId: number;
  /** 所属屏（null=旧数据无屏/手动无屏上下文/v0.10.2 起自动捕获无屏关联） */
  screenId: number | null;
  /** table | formula | code | image | manual */
  kind: string;
  /** 帧坐标 JSON */
  bbox: string;
  /** 裁剪源帧时间戳 */
  sourceTsMs: number;
  /** struct/xxx.webp 相对路径 */
  cropPath: string;
  /** auto | manual */
  source: string;
  createdAt: number;
}

/** 图内文字检索命中（Rust OcrBlockHit；TD-2026-08-19-E 前端接入） */
export interface OcrBlockHit {
  sessionId: number;
  sessionTitle: string;
  ocrBlockId: number;
  /** 关键帧相对会话起点时间戳（图定位基准） */
  timestampMs: number;
  /** 命中 OCR 文本（含关键词） */
  text: string;
  /** subtitle | full */
  region: string;
  /** 命中图相对路径（full/xxx.webp；null=无归档图） */
  imagePath: string | null;
  /** 命中块所属屏（null=旧数据无屏） */
  screenId: number | null;
  screenFirstMs: number | null;
  screenLastMs: number | null;
}

// ────────────────────────────────────────────────────────────
// v0.6.0 M6 会话体验领域类型（与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** 被过滤条目（Rust FilteredItem，kebab-case reason） */
export interface FilteredItem {
  segment_id: number;
  reason:
    | "ui-junk"
    | "duplicate"
    | "fragment"
    | "low-confidence"
    | "ai-delete"
    | "filler"
    | "transition"
    | "rhetorical";
  text: string;
  start_ms: number;
}

/** 过滤统计（Rust FilterStats；v0.7.5 新增口头禅/净化/折叠/替换/纠错计数） */
export interface FilterStats {
  ui_junk: number;
  duplicates: number;
  fragments: number;
  low_confidence: number;
  ai_delete: number;
  /** v0.7.5（REQ-163）：口头禅短段删除数 */
  filler?: number;
  /** v0.7.5（REQ-162/164）：口语净化段数 */
  verbal?: number;
  /** v0.7.5（REQ-164）：结巴折叠命中段数 */
  stutter?: number;
  /** v0.7.5（REQ-164）：术语替换命中段数 */
  term_replace?: number;
  /** v0.7.5（REQ-168）：OCR 错字纠错块数 */
  ocr_corrected?: number;
  /** v0.7.5 扩展：纯过渡短句删除数 */
  transition?: number;
  /** v0.7.5 扩展：修辞问句删除数 */
  rhetorical?: number;
  /** v0.7.6（REQ-180）：结构渲染——插入的章节标题数 */
  chapters?: number;
  /** v0.7.6（REQ-180）：结构渲染——有 outline 标题命中的章节数 */
  titled_chapters?: number;
  /** v0.7.6（REQ-180）：结构渲染——词汇表条目数 */
  glossary_terms?: number;
}

/** 合并条目（Rust MergedItem） */
export interface MergedItem {
  segment_id: number;
  into_segment_id: number;
  text: string;
  start_ms: number;
}

/** 笔记过滤结果（Rust NoteFilterResult；REQ-081 预览载荷） */
export interface NoteFilterResult {
  title: string;
  markdown: string;
  kept: SessionSegment[];
  /** 画面要点（屏段落行） */
  ocr_points: string[];
  /** v0.7.3：画面要点屏（结构化渲染用） */
  ocr_screens: SessionScreen[];
  stats: FilterStats;
  filtered: FilteredItem[];
  merged: MergedItem[];
}

/** 低置信段（Rust LowConfidenceItem） */
export interface LowConfidenceItem {
  segment_id: number;
  start_ms: number;
  text: string;
  confidence: number;
}

/** 会话质量报告（Rust QualityReport；REQ-076） */
export interface QualityReport {
  total_segments: number;
  total_ocr_blocks: number;
  low_confidence_count: number;
  low_confidence_segments: LowConfidenceItem[];
  low_score_ocr_count: number;
  unknown_region_count: number;
  ai_candidate_count: number;
}

/** 大纲条目（Rust OutlineEntry；REQ-077） */
export interface OutlineEntry {
  time_ms: number;
  text: string;
}

/** 术语表条目（Rust GlossaryTerm；v0.11.5 会话详情——camelCase 契约） */
export interface GlossaryTerm {
  term: string;
  /** 精化候选分（ocr_count × idf；降序展示依据） */
  score: number;
  /** OCR 出现次数（画面高频） */
  ocrCount: number;
  /** ASR 出现次数（语音低频） */
  asrCount: number;
}

/** 课程分组（Rust CourseGroup；REQ-078，camelCase 契约；v0.7.1 组内携带转化标记） */
export interface CourseGroup {
  course: string;
  sessions: SessionListItem[];
}

/** 会话列表条目（v0.7.1：转化状态标记，camelCase 契约） */
export interface SessionListItem {
  session: Session;
  /** 已关联笔记 */
  hasNote: boolean;
  /** 最新关联笔记 id */
  noteId: number | null;
  /** 最新关联笔记标题 */
  noteTitle: string | null;
  /** 有转写段或 OCR 块（空会话不进入"待转化"） */
  hasContent: boolean;
  /**
   * v0.11.5：显示序号（按 started_at 升序 rank，删除会话后自动归位；与内部 id 分离）
   * 兼容：旧后端响应缺省 displayNo 时，前端未使用该字段。
   */
  displayNo: number;
}

/** 批量转笔记成功项 */
export interface ConvertedNote {
  sessionId: number;
  noteId: number;
}

/** 批量转笔记跳过项（部分成功语义，原因显式回传） */
export interface SkippedNote {
  sessionId: number;
  reason: string;
}

/** 批量转笔记结果（v0.7.1） */
export interface BatchNoteResult {
  converted: ConvertedNote[];
  skipped: SkippedNote[];
}

/** 批量删除会话结果（批 4：原子全删——失败整体报错，无部分成功） */
export interface BatchSessionDeleteResult {
  /** 实际删除的会话行数（选中集中已不存在的 id 不计入） */
  deleted: number;
}

/** 段搜索命中（Rust SegmentHit；REQ-079，camelCase 契约） */
export interface SegmentHit {
  session_id: number;
  session_title: string;
  segment_id: number;
  start_ms: number;
  snippet: string;
}

/** AI 复核元信息（Rust AiReviewMeta；REQ-085，camelCase 契约） */
export interface AiReviewMeta {
  enabled: boolean;
  authorized: boolean;
  sent: number;
  candidates: number;
  quota_hit: boolean;
  error: string | null;
  model: string;
}

/** AI 三态判定（Rust TextFilterDecision；REQ-085，kebab-case action） */
export interface TextFilterDecision {
  segment_id: number;
  action: "keep" | "delete" | "merge";
  confidence: number;
  reason: string;
  merge_with: string | null;
}

/** AI 复核结果（Rust TextFilterReview；camelCase 契约——decisions 供落库回传） */
export interface TextFilterReview {
  result: NoteFilterResult;
  ai: AiReviewMeta;
  decisions: TextFilterDecision[];
}

/** 文本复核状态（Rust TextFilterStatus；camelCase 契约） */
export interface TextFilterStatus {
  enabled: boolean;
  model: string;
  batchSize: number;
  quotaRemaining: number;
  mock: boolean;
}

/**
 * 会话音频引用（批 6 T24 · R5.5 / R5.5-b）—— T22 `session_audio_path` 的出参
 * （Rust `SessionAudioRef`，`serde(rename_all = "camelCase")`）。
 *
 * @ai-context 命令**只给路径**：URL 一律由前端 `convertFileSrc` 构造（Tauri `scripts/core.js:13-20`
 *   的 Windows 形态 = `http://asset.localhost/<encodeURIComponent(绝对路径)>`）⇒ 后端不碰 URL 形态。
 *   适用范围（硬边界）：**只有实时采集会话有音频** —— 导入会话的音轨落在
 *   `%TEMP%/entropy-import-{id}/audio.wav` 且导入结束即删、`%TEMP%` 不在 asset scope ⇒ 那条路
 *   今天**没有承载面**；故契约只表达「有音频 / 无音频」二分，**不猜来源**。
 */
export interface SessionAudioRef {
  /** 应用数据目录内的**绝对路径**（`{data_dir}/session-audio/{id}.wav`）—— **不是** URL。 */
  readonly path: string;
  /**
   * 该录音的 WAV 轴是否与会话轴对齐（T23 的对齐簿记 sidecar）。
   * `false` 的语义是「**不能保证**对齐」（含**历史录音无 sidecar**），**不是**「一定没对齐」
   * ⇒ UI 文案不得写成断言式的「未对齐」。精度残余 = **块粒度 ±200 ms**（sidecar 未加键
   * ⇒ 毫秒级定位需要新契约）。
   */
  readonly aligned: boolean;
  /** 时长（毫秒；由 WAV 头 `data` 长度换算）；`null` = 未 finalize / 未知 ⇒ **不可播**。 */
  readonly durationMs: number | null;
}

/**
 * 视图槽 `SessionViewSlot.audio` 的音频引用（**容器**产出、视图**只读**）。
 * `url === null` ⇒ 无音频（或取数失败降级）。
 *
 * @ai-context 为什么声明在**会话域**而不是与槽同住 `views/registry.ts`（**计划缺陷的就地处置**）：
 *   两条既有断言从两侧把注册表的类型图冻死了 —— ① `registryResolution.test.ts:46` 的 G7① 逐字
 *   冻结了 `views/registry.ts` 顶部的 **4 个 import 模块名**（连 `import type` 也算；本任务实测：
 *   多一个模块 ⇒ 该用例当场红）；② `views/architecture.guard.test.ts` 的 A2④ 逐字冻结了「非
 *   `views/**` 的导入者**恰 5 个**」（新的容器文件 `import type … from "views/registry"` ⇒ 当场红）。
 *   两条都**不在**本批授权改动清单内（R1.3 / 计划表 5）⇒ 唯一同时满足两者的落点 = **已在 ① 的
 *   4 个模块之内的会话域文件**（`../types/session`）：注册表只 `export type` 转出、容器从会话域取。
 *   收益：依赖方向也更贴规格 §7.1（领域 → 视图 → 容器；容器不反向依赖视图层模块）。
 *   实证与反例读数见 `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/task-24-report.md`。
 * 副作用：无（纯类型声明；消费方一律 `import type` ⇒ 构建期整体擦除、零运行时字节）。
 */
export interface SessionAudioState {
  /** 可播放 URL（`convertFileSrc(path)` 的产物）；`null` = 路径不可得。 */
  readonly url: string | null;
  /** WAV 轴是否与会话轴对齐（**如实透传**，不许在容器里改写成「看起来更好」的值）。 */
  readonly aligned: boolean;
  /**
   * 只有**已 finalize** 的 WAV 可播（R5.5-b 约束 3：WAV 头的 `data` 长度创建时写 0，
   * `finalize()` 是唯一回填点）⇒ `false` 时 UI **必须**禁用播放并如实提示（一行
   * `StatusLine kind="error"`，**不是** toast）。
   */
  readonly playable: boolean;
  /** 时长（毫秒；**如实透传**，含 `0`）；`null` = 未知。 */
  readonly durationMs: number | null;
}
