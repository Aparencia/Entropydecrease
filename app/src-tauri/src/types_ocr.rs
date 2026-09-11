//! @ai-context: 会话 OCR 落库块与画面要点屏（REQ-155~160 / ADR-005 / ADR-015）：关键帧文字块、屏内结构块、屏卡。
//! @ai-context: 纯数据定义（0 impl / 0 IO / 0 副作用）；与引擎层内存态 OcrBlock（types_extract）语义不同——本文是落库/视图契约。
//! @ai-context: 由 types.rs 门面 `#[path]` 声明 + `pub use` 再导出 ⇒ crate::types::X 引用路径逐字不变。

use serde::{Deserialize, Serialize};
use super::TextBox;

/// 会话 OCR 块（关键帧画面文字 / 字幕区文字）。
///
/// @ai-context: region 取 subtitle | full（ADR-005：字幕区高频采样 vs 全帧低频采样）。
/// @ai-context: v0.5.0 M4（REQ-048）：region_kind 为分区域 OCR 的版面类型标注
///              （text/table/formula/code/unknown；旧数据/整帧直跑为 None）。
/// @ai-context: v0.7.3（REQ-156，ADR-015）：bbox/screen_id 为屏卡体系的落库列——
///              bbox 为检测框（帧坐标系，JSON {x,y,w,h}），screen_id 为采集时
///              分配的屏号（NULL=旧数据无屏，视图层聚类兜底）。
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
    /// 检测框（帧坐标系；None=旧数据/无 bbox——下游必须容忍缺省）
    #[serde(default)]
    pub bbox: Option<TextBox>,
    /// 屏号（采集时分配，会话内递增；None=旧数据无屏）
    #[serde(default)]
    pub screen_id: Option<i64>,
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
    /// 检测框（帧坐标系；None=未知）
    #[serde(default)]
    pub bbox: Option<TextBox>,
    /// 屏号（None=旧路径不分配）
    #[serde(default)]
    pub screen_id: Option<i64>,
}

/// 屏内结构块（表格/公式/代码区域，v0.7.3 REQ-159）。
///
/// @ai-context: 结构块不参与行合并（版面角色独立）；rendered 为精修产物
///              （表格 Markdown / 公式 LaTeX / 代码原样），None=未精修/失败降级。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScreenStructure {
    /// table | formula | code
    pub kind: String,
    /// 原始 OCR 文本（未精修）
    pub text: String,
    /// 精修渲染产物（None=未精修/失败，徽标降级）
    #[serde(default)]
    pub rendered: Option<String>,
}

/// 画面要点屏（v0.7.3 REQ-155/158/160，ADR-015）。
///
/// @ai-context: 屏 = 老师翻一次页到下一个画面之间的静止画面——课堂记忆的天然单位。
///              first_seen/last_seen 为屏内块最早/最晚时间戳（派生自成员块，
///              不建屏表，ADR-006 派生视图传统）；image_ref 为 first_seen 时刻
///              最近的归档 full 图（相对路径，asset:// 消费）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionScreen {
    pub session_id: i64,
    /// 屏号（None=旧数据聚类派生）
    #[serde(default)]
    pub screen_id: Option<i64>,
    pub first_seen_ms: u64,
    pub last_seen_ms: u64,
    /// 标题角色行（大字块；None=无 bbox 降级/无标题）
    #[serde(default)]
    pub title: Option<String>,
    /// 正文行（行合并后，按阅读顺序）
    #[serde(default)]
    pub body: Vec<String>,
    /// 图注/标签（短词，按位置排序）
    #[serde(default)]
    pub labels: Vec<String>,
    /// 归档 full 图相对路径（None=无匹配图）
    #[serde(default)]
    pub image_ref: Option<String>,
    /// 结构块（表格/公式/代码区域）
    #[serde(default)]
    pub structure: Vec<ScreenStructure>,
}
