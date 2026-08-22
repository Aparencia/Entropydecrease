/**
 * 实时采集与视频档案领域类型（自 types.ts 硬拆归位；与 Rust serde 契约对齐）。
 *
 * @ai-context: WindowInfo 对应 Rust CaptureWindow（camelCase 序列化）；
 *              覆盖实时会话状态/事件载荷、视频类型档案 v1（13 类）与
 *              框架 v2 四维解耦（REQ-188 形态/画面/领域/语言）。
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

/** 实时会话状态（camelCase 契约） */
export interface LiveSessionStatus {
  active: boolean;
  sessionId: number | null;
  /** 引擎预热是否已就绪（P3："开始即录"提示） */
  prepared: boolean;
  /** 是否处于暂停（2026-08 修复：刷新/重进页面后右侧面板状态机还原用） */
  paused: boolean;
  /** v0.9.0（REQ-189）：当前生效画面档（kebab-case；null=未定档——采集态档案条拉取兑底） */
  tier: string | null;
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
  /** v0.9.0（REQ-188）：记忆命中时的四维形态（检测卡 v2 展示；旧响应缺省 null） */
  memory_form?: ContentForm | null;
  /** v0.9.0（REQ-190）：领域标签检测结果（平台分区/标题词四来源；旧响应缺省 null） */
  domain?: DomainDetection | null;
  /** v0.11.5（Task 5）：记忆命中 + 检测高置信但冲突 → 检测为准（标记被否决的记忆类别；旧响应缺省 null） */
  memory_conflict?: ProfileKind | null;
}

/** 领域检测结果（Rust DomainDetection） */
export interface DomainDetection {
  kind: string | null;
  fine_tags: string[];
  source: string;
  confidence: number;
}

// ────────────────────────────────────────────────────────────
// 视频档案框架 v2 四维解耦领域类型（v0.9.0 M1，REQ-188，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** 内容形态（Rust ContentForm，kebab-case；7 类决定产物模板） */
export type ContentForm =
  | "lecture"
  | "hands-on"
  | "explainer"
  | "dialog"
  | "exercise"
  | "coding"
  | "audio";

/** 画面信息价值档位（Rust VisualTier，kebab-case；4 档决定采样/OCR/存储） */
export type VisualTier = "rich" | "medium" | "low" | "none";

/** 内容领域标签（Rust DomainTag；粗领域 + 细标签开放） */
export interface DomainTag {
  coarse: string | null;
  fine: string[];
}

/** 语言标签（Rust LanguageTag；预留维——当前中文单语） */
export type LanguageTag = "zh" | "en" | "mixed";

/** 四维档案规格（Rust ProfileSpec；检测输出/会话落库/检测卡 v2 传输） */
export interface ProfileSpec {
  /** 内容形态（None=识别中——不阻塞会话开始，参数走默认档） */
  form: ContentForm | null;
  /** 画面价值档位（开始前默认中档 + 诚实声明） */
  visual_tier: VisualTier;
  /** 内容领域（null=空领域——不阻塞，会话中自动补全） */
  domain: DomainTag | null;
  language: LanguageTag;
}
