//! 共享领域类型。
//!
//! @ai-context: 本模块定义课堂助手提取链路与笔记模块之间的数据契约。
//! @ai-context: 业务术语全栈统一：transcript=转写段、ocr_block=画面识别块、note=笔记。
//! @ai-context: 纯数据定义，无副作用，可被 asr/ocr/concat/db/commands 各层复用。
//! @ai-context: 单文件 ≤300 行约束（AGENTS.md §3）下按域拆至 types_*.rs，本文件只保留
//!              `#[path]` 子模块声明 + `pub use` 再导出 ⇒ crate::types::X 对全仓引用面零改动。

use serde::{Deserialize, Serialize};

#[path = "types_session.rs"]
mod types_session;
#[path = "types_knowledge.rs"]
mod types_knowledge;

pub use types_session::*;
pub use types_knowledge::*;

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
    /// 置顶标记（v0.10.0；0=未置顶，1=置顶——置顶笔记在树/列表置顶区按更新时间定序）
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
    /// v0.14 B（视觉系统）：组级颜色（色板 id；None=未设置——笔记未显式定义时继承组色）
    #[serde(default)]
    pub color: Option<String>,
    /// 置顶标记（REQ-315 v0.20.11 批 6；0=未置顶，1=置顶——组列表置顶区第一条件；
    /// 与 notes.pin 同语义同措辞「置顶」，数据字段名沿 notes 先例不复刻改名）
    #[serde(default)]
    pub pin: i64,
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

/// 组删除影响面（v0.14.1：get_group_delete_impact 返回——确认弹窗数据源）。
///
/// @ai-context: 删除语义已裁决（规格 §2.1 影响面确认后级联）：notes/fragments
///              SET NULL（移入"全部"），flashcards/settlements/contracts CASCADE
///              （级联删——弹窗明示数量），knowledge_links 无 FK 到 note_groups
///              （悬空引用必须命令层显式清理）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupDeleteImpact {
    pub notes: i64,
    pub fragments: i64,
    pub cards: i64,
    pub settlements: i64,
    pub contracts: i64,
    pub system_refs: i64,
}

// ────────────────────────────────────────────────────────────
// 命令结果（REQ-316 v0.20.12 批 7：空组自动清理留痕——前端 toast 数据源）
// ────────────────────────────────────────────────────────────

/// 删除笔记结果（批 7：autoCleanedGroups=删除使组变空后自动清理的路由组标题；
/// 无清理时为空数组——前端零变化，不打扰）。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteNoteResult {
    pub deleted: bool,
    pub auto_cleaned_groups: Vec<String>,
}

/// 笔记移组结果（批 7：autoCleanedGroups=源组变空被自动清理时留痕）。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoveNoteResult {
    pub moved: bool,
    pub auto_cleaned_groups: Vec<String>,
}

/// 删除碎片结果（批 7：autoCleanedGroups=碎片源组变空被自动清理时留痕）。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFragmentResult {
    pub deleted: bool,
    pub auto_cleaned_groups: Vec<String>,
}

/// 碎片移组结果（批 7：autoCleanedGroups=碎片源组变空被自动清理时留痕）。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoveFragmentResult {
    pub moved: bool,
    pub auto_cleaned_groups: Vec<String>,
}

/// 碎片升笔记结果（批 7：note=新建笔记（旧返回契约原样前置）；autoCleanedGroups=
/// 碎片源组变空被自动清理时留痕）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromoteNoteResult {
    pub note: Note,
    #[serde(default)]
    pub auto_cleaned_groups: Vec<String>,
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
// 闪卡类型（v0.11.2 学习循环统一；绑定粒度=组，v4 契约二）
// ────────────────────────────────────────────────────────────

/// 闪卡（提取优先：front 线索 → 回忆 → back 验证）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Flashcard {
    pub id: i64,
    /// 绑定组（学习单元——复习/自测/结算都按组，契约二）
    pub group_id: i64,
    /// 来源笔记（None=碎片卡/旧数据）
    pub note_id: Option<i64>,
    /// 来源碎片（None=笔记卡）
    pub fragment_id: Option<i64>,
    pub front: String,
    pub back: String,
    /// 内容分型预埋（N13）：fact 先做；action/model 留接口不做
    pub kind: String,
    /// CardState 序列化（scheduler 契约；损坏回退新卡状态——诚实降级）
    pub state_json: String,
    /// 到期时刻（Unix 毫秒；due_at ≤ now 进复习队列）
    pub due_at: i64,
    pub created_at: i64,
}

/// 周契约（v0.11.4 REQ-200；弹性承诺呈现层——用户自设本周目标，非打卡 KPI）。
///
/// @ai-context: 无 streak 无惩罚——契约只记录承诺本身，完成度由
///              review_logs 周聚合实时计算（week_contract.rs 纯函数）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeekContract {
    pub id: i64,
    /// 绑定组（契约粒度=组——与学习循环绑定粒度一致，契约二）
    pub group_id: i64,
    /// 周界：周一零点（UTC Unix 秒）
    pub week_start: i64,
    /// 本周承诺复习天数（1..7）
    pub target_days: i64,
    /// 本周承诺复习卡数（有界）
    pub target_cards: i64,
    pub created_at: i64,
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

/// 笔记列表排序模式（v0.10.0）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum NoteSortMode {
    /// 按更新时间倒序（默认）
    UpdatedDesc,
    /// 置顶优先 + 按更新时间倒序
    PinFirst,
    /// 按创建时间倒序
    CreatedDesc,
}

/// 决策/应用记录（v0.13.3 REQ-208；一表两面，kind 区分）。
///
/// @ai-context: 对应 knowledge_decisions 表——decision=思辨面（决策），application=学习面
///              （记一次使用）；一表两面不双表。used_refs 为 JSON 文本（存储态，原样保存，
///              结构契约由知识纯函数 validate_decision_input 校验；解析辅助见 UsedRefs）。
///              decided_at 为决策/应用时刻（Unix 秒，数据层填充）。
/// @ai-context: M1 类型供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDecision {
    pub id: i64,
    /// decision / application
    pub kind: String,
    /// 所属体系（None=未挂体系，仅体系级应用允许）
    pub system_id: Option<i64>,
    /// 关联问题树节点（None=未挂节点）
    pub question_id: Option<i64>,
    /// 引用 JSON 文本（存储态；引用必填，command 层拒绝空）
    pub used_refs: String,
    /// 决策内容/应用动作（必填）
    pub content: String,
    /// 预期结果（四行法；None=未填）
    pub expectation: Option<String>,
    /// 实际结果（四行法；None=未填）
    pub actual: Option<String>,
    /// 反思（四行法：如果重来改变什么；None=未填）
    pub reflection: Option<String>,
    /// 决策/应用时刻（Unix 秒，数据层填充）
    pub decided_at: i64,
    pub created_at: i64,
}

/// 新建决策/应用记录入参（id/decided_at/created_at 由数据层填充；kind 由调用方传入）。
/// @ai-context: M1 类型供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeDecision {
    /// decision / application（调用方传入；command 层白名单校验）
    pub kind: String,
    #[serde(default)]
    pub system_id: Option<i64>,
    #[serde(default)]
    pub question_id: Option<i64>,
    /// 引用 JSON 文本（必填非空——command 层经 validate_decision_input 校验）
    pub used_refs: String,
    /// 决策内容/应用动作（必填）
    pub content: String,
    #[serde(default)]
    pub expectation: Option<String>,
    #[serde(default)]
    pub actual: Option<String>,
    #[serde(default)]
    pub reflection: Option<String>,
}

/// used_refs JSON 结构的解析辅助（仅作解析；DB 仍存原始 JSON 文本）。
///
/// @ai-context: 一表包全引用——体系实体（node/concept/model）＋四类证据引用
///              （group/card/note/fragment，即四类 LinkTarget）。serde camelCase；
///              结构契约（键白名单/正整数/非空）由 validate_decision_input（知识纯函数）校验，
///              本结构仅供 command 层读取 used_refs 时反序列化。
/// @ai-context: M1 类型供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#[allow(dead_code)]
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsedRefs {
    #[serde(default)]
    pub node_ids: Vec<i64>,
    #[serde(default)]
    pub concept_ids: Vec<i64>,
    #[serde(default)]
    pub model_ids: Vec<i64>,
    #[serde(default)]
    pub group_id: Option<i64>,
    #[serde(default)]
    pub card_id: Option<i64>,
    #[serde(default)]
    pub note_id: Option<i64>,
    #[serde(default)]
    pub fragment_id: Option<i64>,
}

// ────────────────────────────────────────────────────────────
// v0.13.8 画布：节点位置与视口契约
//
// @ai-context: 画布=手动画布非自动图（REQ-029 P3 维持）——节点位置由用户拖拽决定，
//              首次打开时以辐射布局初始化（BFS 算法），算法只在首次生效。
//              坐标口径：React Flow 左上角（node.position 语义），与 DB 存储一致。
// ────────────────────────────────────────────────────────────

/// 画布节点位置（batch_initialize_canvas_positions 入参；x/y 为左上角坐标）。
///
/// @ai-context: 三表 id 空间独立（nodes/concepts/models），但本入参仅服务
///              knowledge_nodes（概念/模型无画布列，属浮动参照——每次打开重排）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNodePosition {
    pub node_id: i64,
    pub x: f64,
    pub y: f64,
}

/// 画布视口（get_canvas_viewport 返回；save_canvas_viewport 存储态）。
///
/// @ai-context: 切回画布时经 setViewport 恢复；zoom 必须 >0（错误缩放直接拒绝，
///              防损坏值放大/缩小到不可见）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasViewport {
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub zoom: f64,
}

/// 画布偏好（v0.14.1：连线样式/箭头/布局算法；按体系持久化）。
///
/// @ai-context: 枚举白名单在命令层校验（EDGE_STYLES/LAYOUT_ALGORITHMS——前后端同
///              口径，未知值拒绝入库）；states 行可能不存在（首开）→ 前端回落默认值
///              （smoothstep + radial，与迁移 DEFAULT 一致）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasPrefs {
    pub edge_style: String,
    pub edge_arrows: bool,
    pub layout_algorithm: String,
}
