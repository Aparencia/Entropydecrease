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
/// @ai-context: v0.7.1（会话体验批次）：session_id 为来源会话关联（可空——手动笔记/旧数据无关联；
///              删除会话时 SET NULL 保笔记，见 db.rs 迁移）。
/// @ai-context: v0.7.5（REQ-171）：rule_version 为生成该笔记的净化规则版本
///              （"note-rules-x.y.z"；None=旧笔记/手动笔记，诚实降级不猜）；
///              purify_stats 为净化统计 JSON（各过滤原因计数 + 净化计数，
///              与预览统计口径一致——可回答"用哪版规则、滤了什么"）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    /// 来源：manual | classroom
    pub source: String,
    /// 来源会话 id（v0.7.1；None=手动笔记/未关联/旧数据）
    #[serde(default)]
    pub session_id: Option<i64>,
    /// 生成规则的版本标识（REQ-171；None=旧数据/手动笔记）
    #[serde(default)]
    pub rule_version: Option<String>,
    /// 净化统计 JSON（REQ-171；None=旧数据/手动笔记）
    #[serde(default)]
    pub purify_stats: Option<String>,
    /// 标签 JSON 数组（v0.10.0；默认 `[]`）
    #[serde(default = "default_tags")]
    pub tags: String,
    /// 属性 JSON 对象（v0.10.0；扩展位，None=无）
    #[serde(default)]
    pub properties: Option<String>,
    /// 固定标记（v0.10.0；0=未固定，1=固定）
    #[serde(default)]
    pub pin: i64,
    /// 所属笔记组 id（v0.11.0 REQ-195；None=未归组/旧数据——不猜不填）
    #[serde(default)]
    pub group_id: Option<i64>,
    /// 创建时间（Unix 秒）
    pub created_at: i64,
    /// 更新时间（Unix 秒）
    pub updated_at: i64,
}

fn default_tags() -> String {
    "[]".to_string()
}

/// 新建笔记的入参（不含 id 与时间戳，由数据层填充）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewNote {
    pub title: String,
    pub content: String,
    pub source: String,
    /// 来源会话 id（v0.7.1；None=手动笔记；前端 create_note 可不传——serde default）
    #[serde(default)]
    pub session_id: Option<i64>,
    /// 生成规则的版本标识（REQ-171；None=手动笔记/旧路径）
    #[serde(default)]
    pub rule_version: Option<String>,
    /// 净化统计 JSON（REQ-171；None=手动笔记/旧路径）
    #[serde(default)]
    pub purify_stats: Option<String>,
    /// 标签 JSON 数组（v0.10.0；None=空数组）
    #[serde(default)]
    pub tags: Option<String>,
    /// 属性 JSON 对象（v0.10.0；扩展位，None=无）
    #[serde(default)]
    pub properties: Option<String>,
    /// 所属笔记组 id（v0.11.0 REQ-195；前端可不传——组归属由组化接线写入）
    #[serde(default)]
    pub group_id: Option<i64>,
}

// ────────────────────────────────────────────────────────────
// 笔记组类型（v0.11.0 REQ-195；v4 §7.4 统一产物层）
// ────────────────────────────────────────────────────────────

/// 笔记组（组是唯一容器；terrain 区分两种形成方式，v4 §7.4）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteGroup {
    pub id: i64,
    pub name: String,
    /// 地形：container（结构在内容里）/ feed（结构在行为里）
    pub terrain: String,
    /// 组类别：course 课程组 / topic 主题组 / standalone 独立组
    pub kind: String,
    /// DomainKind kebab-case（主题组归组依据；None=未命中/课程组/独立组）
    pub domain_tag: Option<String>,
    /// 形成来源：route（路由）/ series（系列检测）/ manual（用户自建）
    pub source: String,
    /// series_detect 系列名（课程组幂等键；其余 None）
    pub series_key: Option<String>,
    /// 路由理由 JSON（REQ-198：命中信号明细，可见可改）
    pub route_reason: Option<String>,
    /// 用户改判标记（REQ-198：修改即记忆；0=自动路由，1=已改判）
    #[serde(default)]
    pub route_overridden: i64,
    /// 组内笔记数（list 查询填充；单查为 0）
    #[serde(default)]
    pub note_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 新建笔记组的入参（不含 id 与时间戳，由数据层填充）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewNoteGroup {
    pub name: String,
    pub terrain: String,
    pub kind: String,
    #[serde(default)]
    pub domain_tag: Option<String>,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub series_key: Option<String>,
    #[serde(default)]
    pub route_reason: Option<String>,
}

// ────────────────────────────────────────────────────────────
// 碎片类型（v0.11.1 feed 进料口；v4 契约：碎片不是笔记，身份诚实）
// ────────────────────────────────────────────────────────────

/// 碎片（feed 地形原料层；几句话+可选示范画面，防"假燃料"死法）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fragment {
    pub id: i64,
    pub text: String,
    /// 图片相对路径（data_dir/fragments/ 下；None=纯文本碎片）
    pub image_path: Option<String>,
    /// DomainKind kebab-case（自动归组依据；None=未命中）
    pub domain_tag: Option<String>,
    /// 所属 feed 主题组（None=未归组——结算面兜底）
    pub group_id: Option<i64>,
    /// manual / clipboard
    pub source: String,
    /// active / archived（v0.11.3 组结算归档标记）
    pub status: String,
    pub created_at: i64,
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

/// 笔记列表排序模式（v0.10.0）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum NoteSortMode {
    /// 按更新时间倒序（默认）
    UpdatedDesc,
    /// 固定优先 + 按更新时间倒序
    PinFirst,
    /// 按创建时间倒序
    CreatedDesc,
}
