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
  created_at: number;
  updated_at: number;
}

/** 新建笔记入参 */
export interface NewNote {
  title: string;
  content: string;
  source: string;
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

/** 会话详情（会话 + 转写段 + OCR 块） */
export interface SessionDetail {
  session: Session;
  segments: SessionSegment[];
  ocr_blocks: SessionOcrBlock[];
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

/** 五类档案标识（Rust ProfileKind，kebab-case 序列化） */
export type ProfileKind = "lecture" | "hands-on" | "talking-head" | "interview" | "meeting";

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

/** 视频类型档案（Rust VideoProfile；snake_case 契约） */
export interface VideoProfile {
  kind: ProfileKind;
  detect_signals: DetectSignals;
  sampling_budget: SamplingBudget;
  signal_weights: SignalWeights;
  postprocess_rules: PostprocessRules;
  artifact_template: ArtifactTemplate;
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

