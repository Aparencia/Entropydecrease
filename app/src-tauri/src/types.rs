//! 共享领域类型。
//!
//! @ai-context: 本模块定义课堂助手提取链路与笔记模块之间的数据契约。
//! @ai-context: 业务术语全栈统一：transcript=转写段、ocr_block=画面识别块、note=笔记。
//! @ai-context: 纯数据定义，无副作用，可被 asr/ocr/concat/db/commands 各层复用。

use serde::{Deserialize, Serialize};

/// 单条 ASR 转写片段。
///
/// @ai-context: start_ms/end_ms 为相对会话起点的毫秒时间戳，用于与 OCR 关键帧对齐拼接。
/// @ai-context: v0.5.0 M9（REQ-054 B8）：word_timestamps 为词级时间戳
///              （[词, 起始毫秒] 对，相对片段起点；SenseVoice 开启 token timestamps 时产出）。
/// @ai-context: v0.6.0 M2（REQ-062）：confidence 为 ASR 段置信度（概率加权融合输入；
///              None=未知/旧数据——融合层回退硬规则兜底）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TranscriptSegment {
    /// 起始毫秒时间戳
    pub start_ms: u64,
    /// 结束毫秒时间戳
    pub end_ms: u64,
    /// 识别出的文本
    pub text: String,
    /// 词级时间戳（B8；None=未开启/旧数据）
    pub word_timestamps: Option<Vec<WordTimestamp>>,
    /// ASR 段置信度 0.0-1.0（REQ-062 概率加权融合；None=未知）
    #[serde(default)]
    pub confidence: Option<f32>,
}

/// 词级时间戳（B8：产物双向定位 + AI 补缝判定器基础）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WordTimestamp {
    pub word: String,
    /// 相对片段起点的起始毫秒
    pub start_ms: u64,
}

/// 文本块边界框（像素坐标，相对 OCR 输入图；M2/REQ-037 起由 det 结果填充）。
///
/// @ai-context: 供动态字幕区域（region_tracker）做 bbox 密度聚簇/ROI 锁定；
///              旧数据无 bbox（None），下游必须容忍缺省。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TextBox {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// 单个 OCR 识别出的画面文本块（来自一张关键帧）。
///
/// @ai-context: timestamp_ms 为该关键帧相对会话起点的时间戳；离线文件模式下可为 None。
/// @ai-context: v0.5.0 M4（REQ-048）：region_kind 标注该块来源版面区域类型
///              （text/table/formula/code/unknown；整帧直跑为 None——兼容旧数据）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OcrBlock {
    /// 关联关键帧的时间戳（毫秒），离线导入时可能缺失
    pub timestamp_ms: Option<u64>,
    /// 识别出的文本
    pub text: String,
    /// 识别置信度 0.0-1.0
    pub score: f32,
    /// 检测框（像素坐标，相对 OCR 输入图；无 bbox 时为 None）
    pub bbox: Option<TextBox>,
    /// 来源版面区域类型（kebab-case；None=整帧直跑/旧数据）
    pub region_kind: Option<String>,
}

/// 本地拼接产出的笔记初稿。
///
/// @ai-context: 这是"课堂助手 → 笔记"联动的中间产物（REQ-003/REQ-005）。
/// @ai-context: 纯本地规则生成，不依赖 LLM；markdown 字段为可直接落入笔记编辑器的内容。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteDraft {
    /// 笔记标题
    pub title: String,
    /// 讲述内容（转写拼接后的分段文本）
    pub transcript_paragraphs: Vec<String>,
    /// 画面要点（OCR 去重后的文本，按时间排序）
    pub ocr_points: Vec<String>,
    /// 组装好的 Markdown 全文
    pub markdown: String,
}

/// 数据库中的笔记记录。
///
/// @ai-context: 对应 SQLite notes 表；source 记录来源（manual=手动 / classroom=课堂助手联动）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    /// 来源：manual | classroom
    pub source: String,
    /// 创建时间（Unix 秒）
    pub created_at: i64,
    /// 更新时间（Unix 秒）
    pub updated_at: i64,
}

/// 新建笔记的入参（不含 id 与时间戳，由数据层填充）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewNote {
    pub title: String,
    pub content: String,
    pub source: String,
}

// ────────────────────────────────────────────────────────────
// 会话领域类型（REQ-010，ADR-004）
// ────────────────────────────────────────────────────────────

/// 会话记录（每次学习 = 一个会话）。
///
/// @ai-context: 会话是实时捕获链路（v0.2.0）的主产物，独立于笔记存在；
///              status 取 recording | finished | failed（崩溃恢复时标记）。
/// @ai-context: v0.5.0 M1（REQ-043）：profile 记录会话生效的视频类型档案
///              （kebab-case 标识；旧数据为 None=默认档案）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Session {
    pub id: i64,
    /// 会话标题（默认取目标窗口标题）
    pub title: String,
    /// 目标窗口标题（文件导入会话为 None）
    pub source_window: Option<String>,
    /// 开始时间（Unix 秒）
    pub started_at: i64,
    /// 结束时间（Unix 秒，进行中为 None）
    pub ended_at: Option<i64>,
    /// recording | finished | failed
    pub status: String,
    /// 视频类型档案标识（kebab-case；None=未指定，走默认档案）
    pub profile: Option<String>,
}

/// 新建会话入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewSession {
    pub title: String,
    pub source_window: Option<String>,
    /// 视频类型档案标识（REQ-043；None=默认档案不阻断）
    pub profile: Option<String>,
}

/// 会话转写段（ASR final 段 / 字幕段 / 融合段统一落库）。
///
/// @ai-context: source 取 asr | subtitle | fused（ADR-004/ADR-005），
///              confidence 为可选置信度（ASR 有、字幕可空）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionSegment {
    pub id: i64,
    pub session_id: i64,
    /// 相对会话起点的毫秒时间戳（时间轴对齐基准）
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    /// asr | subtitle | fused
    pub source: String,
    pub confidence: Option<f32>,
}

/// 新增会话转写段入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewSessionSegment {
    pub session_id: i64,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    pub source: String,
    pub confidence: Option<f32>,
}

/// 会话 OCR 块（关键帧画面文字 / 字幕区文字）。
///
/// @ai-context: region 取 subtitle | full（ADR-005：字幕区高频采样 vs 全帧低频采样）。
/// @ai-context: v0.5.0 M4（REQ-048）：region_kind 为分区域 OCR 的版面类型标注
///              （text/table/formula/code/unknown；旧数据/整帧直跑为 None）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionOcrBlock {
    pub id: i64,
    pub session_id: i64,
    /// 关键帧相对会话起点的毫秒时间戳
    pub timestamp_ms: u64,
    pub text: String,
    /// 识别置信度 0.0-1.0
    pub score: f32,
    /// subtitle | full
    pub region: String,
    /// 来源版面区域类型（kebab-case；None=整帧直跑/旧数据）
    pub region_kind: Option<String>,
}

/// 新增会话 OCR 块入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewSessionOcrBlock {
    pub session_id: i64,
    pub timestamp_ms: u64,
    pub text: String,
    pub score: f32,
    pub region: String,
    /// 来源版面区域类型（kebab-case；None=整帧直跑）
    pub region_kind: Option<String>,
}

/// 会话详情（详情页一次取全：会话 + 转写段 + OCR 块）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionDetail {
    pub session: Session,
    pub segments: Vec<SessionSegment>,
    pub ocr_blocks: Vec<SessionOcrBlock>,
}
