//! @ai-context: 提取链路内存态类型（ADR-004 定性为"引擎层产物"）：ASR 段、词级时间戳、bbox、OCR 块、拼接初稿。
//! @ai-context: 纯数据定义（0 impl / 0 IO / 0 副作用）；被 asr/ocr/concat/engine 各层复用，不落库。
//! @ai-context: 由 types.rs 门面 `#[path]` 声明 + `pub use` 再导出 ⇒ crate::types::X 引用路径逐字不变。

use serde::{Deserialize, Serialize};

/// 单条 ASR 转写片段。
///
/// @ai-context: start_ms/end_ms 为相对会话起点的毫秒时间戳，用于与 OCR 关键帧对齐拼接。
/// @ai-context: v0.5.0 M9（REQ-054 B8）：word_timestamps 为词级时间戳
///              （[词, 起始毫秒] 对，相对片段起点；SenseVoice 开启 token timestamps 时产出）。
/// @ai-context: v0.6.0 M2（REQ-062）：confidence 为 ASR 段置信度（概率加权融合输入；
///              None=未知/旧数据——融合层回退硬规则兜底）。
/// @ai-context: v0.7.0 M1（REQ-103）：volume 为段内平均音量（实时链路聚合 RMS；
///              融合透传到落库段——音量骤变信号输入；None=未知）。
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
    /// REQ-103：段内平均音量（None=未知）
    #[serde(default)]
    pub volume: Option<f32>,
}

/// 词级时间戳（B8：`TranscriptSegment.word_timestamps` 的传输契约，serde 线格式由
/// `types_contract_tests.rs` 锚定；产物双向定位与补缝判定器的消费方已于批 1 删除）。
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
