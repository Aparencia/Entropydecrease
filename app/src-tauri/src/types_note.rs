//! @ai-context: 笔记域类型：笔记落库行/新建入参、笔记组与删除影响面、批 7 命令结果、碎片与闪卡学习循环、排序枚举。
//! @ai-context: 纯数据定义（0 impl / 0 IO / 0 副作用）；default_tags 与 Note 同模块（serde `default = "default_tags"` 按名解析）。
//! @ai-context: 由 types.rs 门面 `#[path]` 声明 + `pub use` 再导出 ⇒ crate::types::X 引用路径逐字不变。

use serde::{Deserialize, Serialize};

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
    /// 真实复习间隔天数（**只读**；前端唯一口径——不得用 dueAt 差值或字符数自造）。
    ///
    /// @ai-context: 两个精度域（PB2 裁决）：① `review_card` 返回体 = 当次调度的**精确值**
    ///              （`ScheduleOutcome.interval_days` 当场显式覆写）；② 行派生路径
    ///              （`row_to_card` 由 `due_at − stateJson.lastReviewMs` 反推，覆盖
    ///              list_due_cards / get_card / card_by_fragment / list_cards_by_group /
    ///              find_card_by_front）= **整天粒度**（DB 无 interval 列，f32 原值不可恢复）。
    ///              新卡/无复习记录/劣化输入 ⇒ `0.0`（不发明数字）；确切时刻看 `dueAt`。
    ///              契约不变：`stateJson` 仍是「后端调度契约，前端透传不解析」。
    pub interval_days: f32,
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
