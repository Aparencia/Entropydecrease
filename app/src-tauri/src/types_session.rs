//! @ai-context: 会话领域类型（REQ-010 / ADR-004）：会话落库行、转写段、详情页聚合、列表条目与批量结果。
//! @ai-context: 纯数据定义（0 impl / 0 IO / 0 副作用）；events 走 crate::session_events 全路径，不引入模块环。
//! @ai-context: 由 types.rs 门面 `#[path]` 声明 + `pub use` 再导出 ⇒ crate::types::X 引用路径逐字不变。

use serde::{Deserialize, Serialize};
use super::{SessionOcrBlock, SessionScreen};

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
    /// v0.11.7（图文会话，ADR-020）：会话类型（None=视频类会话；Some("photo")=图文截屏会话）
    pub kind: Option<String>,
}

/// 新建会话入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewSession {
    pub title: String,
    pub source_window: Option<String>,
    /// 视频类型档案标识（REQ-043；None=默认档案不阻断）
    pub profile: Option<String>,
    /// v0.11.7（图文会话，ADR-020）：会话类型（None=视频类；Some("photo")=图文会话）
    pub kind: Option<String>,
}

/// 会话转写段（ASR final 段 / 字幕段 / 融合段统一落库）。
///
/// @ai-context: source 取 asr | subtitle | fused（ADR-004/ADR-005），
///              confidence 为可选置信度（ASR 有、字幕可空）。
/// @ai-context: v0.7.0 M1（REQ-103）：volume 为段内平均音量（0.0-1.0 RMS 近似；
///              重点标注音量骤变信号输入；None=旧数据/未知）。
/// @ai-context: v0.7.0 M1.5（REQ-109）：speech_rate=段内语速（字/秒）、
///              pause_ms=段前停顿（与上一段 gap）、speaker=影子列（V1.0 讲者接线）。
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
    /// REQ-103：段内平均音量（None=未知/旧数据）
    #[serde(default)]
    pub volume: Option<f32>,
    /// REQ-109：段内语速（字/秒；None=未知/旧数据）
    #[serde(default)]
    pub speech_rate: Option<f32>,
    /// REQ-109：段前停顿（与上一段 end 的 gap，ms；None=未知/旧数据）
    #[serde(default)]
    pub pause_ms: Option<u64>,
    /// REQ-109：speaker 影子列（V1.0 讲者识别接线；None=未接线）
    #[serde(default)]
    pub speaker: Option<String>,
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
    /// REQ-103：段内平均音量（None=未知）
    #[serde(default)]
    pub volume: Option<f32>,
    /// REQ-109：段内语速（字/秒；None=未知）
    #[serde(default)]
    pub speech_rate: Option<f32>,
    /// REQ-109：段前停顿（ms；None=未知）
    #[serde(default)]
    pub pause_ms: Option<u64>,
    /// REQ-109：speaker 影子列（V1.0；None=未接线）
    #[serde(default)]
    pub speaker: Option<String>,
}

/// 会话详情（详情页一次取全：会话 + 转写段 + OCR 块 + 信号事件 + 画面要点屏）。
/// @ai-context: v0.7.0 M1.5（REQ-108）：events 为会话信号事件（帧切换/长静音等；
///              旧会话/未接线链路为空——消费端回退近似信号）。
/// @ai-context: v0.7.3（REQ-160）：screens 为画面要点屏卡（屏聚合派生；旧数据
///              聚类兜底——空向量=无画面内容）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionDetail {
    pub session: Session,
    pub segments: Vec<SessionSegment>,
    pub ocr_blocks: Vec<SessionOcrBlock>,
    #[serde(default)]
    pub events: Vec<crate::session_events::SessionEvent>,
    #[serde(default)]
    pub screens: Vec<SessionScreen>,
}

/// 会话列表条目（v0.7.1 会话体验批次：转化状态标记）。
///
/// @ai-context: 包装既有 Session 而非加字段——不动既有契约，隔离风险；
///              has_note/has_content 为列表筛选与"待转化"判定的数据源。
/// @ai-context: 前端按 camelCase 消费（与 CourseGroup/SegmentHit 同口径）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionListItem {
    pub session: Session,
    /// 已关联笔记（find_note_by_session 非空）
    pub has_note: bool,
    /// 最新关联笔记 id
    pub note_id: Option<i64>,
    /// 最新关联笔记标题
    pub note_title: Option<String>,
    /// 有转写段或 OCR 块（空会话不进入"待转化"）
    pub has_content: bool,
    /// v0.11.5：显示序号（按 started_at 升序 rank，删除后自动重排；与内部 id 分离）
    pub display_no: i64,
}

/// 批量转笔记成功项（v0.7.1）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConvertedNote {
    pub session_id: i64,
    pub note_id: i64,
}

/// 批量转笔记跳过项（v0.7.1：部分成功语义，原因显式回传不静默）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkippedNote {
    pub session_id: i64,
    pub reason: String,
}

/// 批量转笔记结果（v0.7.1：单条失败不阻塞其他）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchNoteResult {
    pub converted: Vec<ConvertedNote>,
    pub skipped: Vec<SkippedNote>,
}

/// 批量删除会话结果（批 4：原子全删语义——失败整体报错，无部分成功）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchSessionDeleteResult {
    /// 实际删除的会话行数（传入中已不存在的 id 不计入）。
    pub deleted: usize,
}
