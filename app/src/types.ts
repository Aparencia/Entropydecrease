/**
 * 前端共享领域类型（与 Rust serde 契约对齐）。
 *
 * @ai-context: WindowInfo 对应 Rust CaptureWindow（camelCase 序列化）；
 *              Note 保持 snake_case（Rust 侧未 rename，勿改动以免破坏契约）。
 */

/** 可捕获窗口（Rust list_windows 返回，含推荐评分） */
export interface WindowInfo {
  id: number;
  title: string;
  processName: string;
  pid: number;
  score: number;
  reasons: string[];
  /** 站点首页标记（2026-08：B站首页等无视频内容落地页，不进入推荐） */
  isHomepage: boolean;
}

/** ASR 转写片段 */
export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  /** 词级时间戳（v0.5.0 REQ-054 B8；null=未开启/旧数据） */
  word_timestamps: { word: string; start_ms: number }[] | null;
}

/** OCR 画面文本块 */
export interface OcrBlock {
  timestamp_ms: number | null;
  text: string;
  score: number;
}

/** 本地拼接产出的笔记初稿 */
export interface NoteDraft {
  title: string;
  transcript_paragraphs: string[];
  ocr_points: string[];
  markdown: string;
}

/** 数据库中的笔记（Rust Note，snake_case 契约） */
export interface Note {
  id: number;
  title: string;
  content: string;
  source: string;
  /** v0.7.1：来源会话 id（null=手动笔记/未关联/旧数据） */
  session_id?: number | null;
  /** v0.7.5（REQ-171）：生成规则的版本标识（null=旧笔记/手动笔记，诚实降级） */
  rule_version?: string | null;
  /** v0.7.5（REQ-171）：净化统计 JSON（null=旧笔记/手动笔记） */
  purify_stats?: string | null;
  created_at: number;
  updated_at: number;
}

/** 新建笔记入参 */
export interface NewNote {
  title: string;
  content: string;
  source: string;
  session_id?: number | null;
}

// ────────────────────────────────────────────────────────────
// 会话领域类型（v0.2.0，REQ-010，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** 会话记录（Rust Session，snake_case 契约） */
export interface Session {
  id: number;
  title: string;
  source_window: string | null;
  started_at: number;
  ended_at: number | null;
  status: string; // recording | finished | failed
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
  /** 所属屏（null=旧数据无屏/手动无屏上下文） */
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

/** 流式 ASR 模型就绪状态 */
export interface StreamingModelStatus {
  ready: boolean;
  missing: string[];
}

/** 模型下载状态（camelCase 契约） */
export interface DownloadStatus {
  state: string; // idle | downloading | done | failed
  currentFile: string | null;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

/** 模型下载进度事件载荷 */
export interface DownloadProgress {
  file: string;
  downloadedBytes: number;
  totalBytes: number;
}

/** 实时会话状态（camelCase 契约） */
export interface LiveSessionStatus {
  active: boolean;
  sessionId: number | null;
  /** 引擎预热是否已就绪（P3："开始即录"提示） */
  prepared: boolean;
  /** 是否处于暂停（2026-08 修复：刷新/重进页面后右侧面板状态机还原用） */
  paused: boolean;
}

/** 视频导入进度（Rust ImportProgress，camelCase 契约） */
export interface ImportProgress {
  /** 阶段：subtitle | audio | asr | ocr | done */
  stage: string;
  message: string;
  done: number;
  total: number;
}

/** 实时画面要点事件载荷（Rust OcrEvent，camelCase 契约；live:ocr 事件） */
export interface OcrEvent {
  timestampMs: number;
  text: string;
  /** v0.7.3：块所属屏号（前端按屏摘要显示） */
  screenId: number;
}

/** 会话信息（Rust SessionInfo，camelCase 契约；live:session-info 事件，v0.7.2 REQ-151） */
export interface SessionInfo {
  /** 播放平台（哔哩哔哩/YouTube/腾讯视频…；本地窗口/未知 → null） */
  platform: string | null;
  /** 视频总时长（秒；播放器 OCR 识别；未识别 → null） */
  durationSecs: number | null;
  /** 系列名（合集；标题序列号提取） */
  series: string | null;
  /** 当前集号（合集） */
  episode: number | null;
  /** 总集数（合集） */
  totalEpisodes: number | null;
}

/** 讲者切换点（Rust SpeakerChangeOut，camelCase 契约；v0.7.2 REQ-153） */
export interface SpeakerChange {
  timeMs: number;
  confidence: number;
}

/** 讲者分析结果（Rust SpeakerAnalysisResult；区分"未启用"与"无切换"） */
export interface SpeakerAnalysisResult {
  enabled: boolean;
  changes: SpeakerChange[];
}

/** 语音定稿事件载荷（Rust AsrFinalEvent，camelCase 契约；live:asr-final 事件，TD-043） */
export interface AsrFinalEvent {
  timestampMs: number;
  text: string;
}

/** 字幕事件载荷（Rust SubtitleEvent，camelCase 契约；live:subtitle 事件，TD-043） */
export interface SubtitleEvent {
  timestampMs: number;
  text: string;
}

// ────────────────────────────────────────────────────────────
// OCR 设备领域类型（v0.4.0 M1，ADR-009，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** OCR 设备模式（Rust OcrDeviceMode） */
export type OcrDeviceMode = "Auto" | "ForceGpu" | "ForceCpu";

/** OCR 推理后端（Rust OcrBackend：Cpu | Cuda{device_id}） */
export type OcrBackend = "Cpu" | { Cuda: { device_id: number } };

/** 校准基准（Rust BenchResult） */
export interface BenchResult {
  cpu_ms: number;
  gpu_ms: number;
}

/** OCR 设备运行时状态（Rust OcrDeviceStatus，snake_case 契约） */
export interface OcrDeviceStatus {
  mode: OcrDeviceMode;
  requested: OcrBackend;
  actual: OcrBackend;
  fallback_reason: string | null;
  bench: BenchResult | null;
  calibrating: boolean;
}

// ────────────────────────────────────────────────────────────
// 视频类型档案领域类型（v0.5.0 M1，REQ-043，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** 十三类档案标识（Rust ProfileKind，kebab-case 序列化；v0.7.1 增 Unknown） */
export type ProfileKind =
  | "lecture"
  | "hands-on"
  | "talking-head"
  | "interview"
  | "meeting"
  | "podcast"
  | "live"
  | "whiteboard"
  | "game-tutorial"
  | "exercise"
  | "follow-along"
  | "coding"
  /** v0.7.1：未知——自动检测无法识别时的如实标注（管线参数回退默认档） */
  | "unknown";

/** 检测信号配置（Rust DetectSignals） */
export interface DetectSignals {
  title_keywords: string[];
  url_keywords: string[];
  frame_switch_range: [number, number] | null;
  prefers_subtitle: boolean;
  min_duration_min: number | null;
}

/** 采样预算（Rust SamplingBudget；tick=1s 采样周期） */
export interface SamplingBudget {
  subtitle_every: number;
  full_every: number;
  silent_subtitle_every: number;
  silent_full_every: number;
}

/** 信号权重（Rust SignalWeights） */
export interface SignalWeights {
  subtitle_priority: boolean;
  ocr_weight: number;
  asr_weight: number;
}

/** 后处理规则集开关（Rust PostprocessRules） */
export interface PostprocessRules {
  chapter_detect: boolean;
  step_cards: boolean;
  verbal_normalize: boolean;
  highlight: boolean;
  speaker_detect: boolean;
  glossary: boolean;
}

/** 产物模板标识（Rust ArtifactTemplate） */
export type ArtifactTemplate =
  | "lecture-notes"
  | "step-cards"
  | "summary"
  | "dialogue-notes"
  | "meeting-notes";

/** 档案级图片存储策略档位（Rust StoreTier，kebab-case；REQ-110） */
export type StoreTier = "text-first" | "balanced" | "image-first";

/** 视频类型档案（Rust VideoProfile；snake_case 契约） */
export interface VideoProfile {
  kind: ProfileKind;
  detect_signals: DetectSignals;
  sampling_budget: SamplingBudget;
  signal_weights: SignalWeights;
  postprocess_rules: PostprocessRules;
  artifact_template: ArtifactTemplate;
  storage_tier: StoreTier;
  /** REQ-130：档案声明禁用 OCR 画面链（播客/直播=true） */
  disable_ocr: boolean;
  /** REQ-130：档案声明禁用 ASR 链（本版无档案声明 true，机制预留） */
  disable_asr: boolean;
}

/** 检测候选（Rust ProfileCandidate） */
export interface ProfileCandidate {
  kind: ProfileKind;
  score: number;
}

/** 混合检测结果（Rust DetectResult） */
export interface DetectResult {
  candidates: ProfileCandidate[];
  needs_confirmation: boolean;
  memory_hit: ProfileKind | null;
}

// ────────────────────────────────────────────────────────────
// 产物体系领域类型（v0.5.0 M7，REQ-052，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** 块类型（Rust ArtifactKind，kebab-case 序列化） */
export type ArtifactKind =
  | "paragraph"
  | "key-image"
  | "table"
  | "formula"
  | "term-anchor"
  | "summary"
  | "step-card"
  | "claim"
  | "quote"
  | "qa-pair"
  | "highlight"
  | "decision"
  | "todo"
  | "agenda-section"
  | "screen-shot"
  | "code-block";

/** 原料引用（Rust BlockRefs） */
export interface BlockRefs {
  segment_id: number | null;
  ocr_block_id: number | null;
  frame_ms: number | null;
}

/** 块载荷（Rust BlockPayload；各变体字段合并为可选结构） */
export interface BlockPayload {
  text?: string;
  image?: string;
  markdown?: string;
  structure_confidence?: number;
  latex?: string;
  source_text?: string;
  confidence?: number;
  term?: string;
  definition?: string | null;
  description?: string;
  start_ms?: number;
  end_ms?: number;
  question?: string;
  answer?: string;
  code?: string;
  language?: string | null;
  /** REQ-123：步骤图卡标签（跟练档案步骤边界） */
  label?: string;
  /** REQ-123：步骤图卡理由（cue/practice/demo 等信号来源） */
  reason?: string;
  /** REQ-121：代码块展示段起始时间（ms） */
  time_ms?: number;
}

/** 块来源（Rust BlockSource） */
export type BlockSource = "local" | "ai-enhanced" | "placeholder";

/** 产物块（Rust ArtifactBlock） */
export interface ArtifactBlock {
  id: number;
  kind: ArtifactKind;
  refs: BlockRefs;
  payload: BlockPayload;
  order: number;
  source: BlockSource;
}

/** 会话产物（Rust SessionArtifact） */
export interface SessionArtifact {
  session_id: number;
  profile: string;
  blocks: ArtifactBlock[];
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

// ────────────────────────────────────────────────────────────
// AI 使能层类型（v0.8.0 M1，REQ-138/139/140；Rust camelCase 契约）
// ────────────────────────────────────────────────────────────

/** AI 设置视图（Rust AiSettingsView；camelCase——密钥只报存在性，不回传明文） */
export interface AiSettingsView {
  enabled: boolean;
  authorized: boolean;
  baseUrl: string;
  model: string;
  lowBalanceThreshold: number;
  rememberCostChoice: boolean;
  hasKey: boolean;
  /** credential（凭据库）| env（环境变量）| none */
  keySource: string;
}

/** AI 设置保存入参（Rust AiSettings；camelCase——不含 hasKey/keySource） */
export interface AiSettingsInput {
  enabled: boolean;
  authorized: boolean;
  baseUrl: string;
  model: string;
  lowBalanceThreshold: number;
  rememberCostChoice: boolean;
}

/** 余额快照（Rust AiBalance；camelCase——total/grants/topped_up 分项） */
export interface AiBalance {
  totalBalance: number;
  grantsBalance: number;
  toppedUpBalance: number;
  currency: string;
}

/** 余额视图（Rust BalanceView；camelCase——含低余额提醒文案） */
export interface BalanceView {
  balance: AiBalance;
  lowBalanceWarning: string | null;
}

/** 审计条目（Rust AiAuditEntry；snake_case 契约——上传摘要不含原文） */
export interface AiAuditEntry {
  at_unix: number;
  upload_summary: string;
  result: string;
}

// ────────────────────────────────────────────────────────────
// AI 精修类型（v0.8.0 M2，REQ-141/145；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** 任务失败原因（Rust AiTaskFailure：{"unauthorized":".."|"network"|..} 外部标签） */
export type AiTaskFailure = { unauthorized: string } | { network: string } | { balance: string } | { quota: string } | { server: string } | { invalid: string } | { other: string };

/** 任务状态（Rust AiTaskState：单元变体字符串 / 结构变体对象） */
export type AiTaskState =
  | "Pending"
  | { Running: { finished_slices: number; total_slices: number } }
  | "Succeeded"
  | { Failed: { reason: AiTaskFailure } };

/** 任务句柄（Rust AiTaskHandle） */
export interface AiTaskHandle {
  task_id: number;
  state: AiTaskState;
}

/** 段级 diff 操作（Rust DiffOp：三态外部标签） */
export type DiffOp = { unchanged: string } | { added: string } | { removed: string };

/** 精修结果（Rust AiRefineResult——diff 预览 + 采纳落库数据源；camelCase 契约） */
export interface AiRefineResult {
  title: string;
  /** 规则基线（采纳落库时作为首快照——版本链 [rule, ai-refine]） */
  baseMarkdown: string;
  refinedMarkdown: string;
  diff: DiffOp[];
  addedLines: number;
  removedLines: number;
  slices: number;
  model: string;
}

/** 成本预估（Rust CostEstimate；camelCase 契约） */
export interface CostEstimate {
  estTokens: number;
  estCostYuan: number;
  pricePer1m: number;
}

/** 精修成本预估视图（Rust RefineEstimateView；camelCase 契约） */
export interface RefineEstimateView {
  estimate: CostEstimate;
  rememberCostChoice: boolean;
}

// ────────────────────────────────────────────────────────────
// 知识补充类型（v0.8.0 M3，REQ-142；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** 补充子项（Rust AiEnrichKind；kebab-case——d1~d3 深度/b1~b6 广度） */
export type EnrichKind = "d1" | "d2" | "d3" | "b1" | "b2" | "b3" | "b4" | "b5" | "b6";

/** 补充结果（Rust AiEnrichResult——混合落位 markdown + base 供撤销；camelCase） */
export interface AiEnrichResult {
  noteId: number;
  baseMarkdown: string;
  enrichedMarkdown: string;
  blocks: number;
  depthBlocks: number;
  breadthBlocks: number;
  slices: number;
  kinds: string[];
  model: string;
}

// ────────────────────────────────────────────────────────────
// 笔记版本类型（v0.8.0 M4，REQ-144/REQ-143 完整；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** 版本来源（Rust NoteVersionSource；kebab-case） */
export type NoteVersionSource = "rule" | "ai-refine" | "ai-enrich" | "user-edit";

/** 版本元数据（Rust VersionMeta；camelCase 契约） */
export interface VersionMeta {
  costYuan: number | null;
  model: string | null;
  slices: number | null;
  mergedFrom: string | null;
}

/** 版本快照（Rust NoteVersion；camelCase 契约） */
export interface NoteVersion {
  id: number;
  noteId: number;
  content: string;
  source: NoteVersionSource;
  parentId: number | null;
  createdAt: number;
  meta: VersionMeta;
}

/** AI 成本记录（Rust AiUsageRecord；camelCase 契约） */
export interface AiUsageRecord {
  id: number;
  noteId: number;
  opType: string;
  tokensIn: number;
  tokensOut: number;
  costYuan: number;
  model: string;
  slices: number;
  createdAt: number;
}

