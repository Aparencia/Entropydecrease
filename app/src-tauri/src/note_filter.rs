//! 笔记废话出口过滤管线（REQ-082 / v0.6.0 M1；v0.7.5 净化接线；v0.12.0 M1 正文源多态）。
//!
//! @ai-context: v0.12.0（ADR-021）：filter_note 升级为正文源分派入口——
//!              detect_body_source 判定 (segments, ocr_blocks) 的正文来源：
//!              Transcript→既有口语过滤链（视频，零改动）；OcrDirect→
//!              note_filter_ocr 精简链（图文，OCR 文本直接入 markdown 正文）；
//!              Empty→标题仅。分派后重建路径（refresh_screen_points/
//!              apply_ai_decisions/structure）按 body_source 分流，防覆盖。
//! @ai-context: 过滤链（纯规则，本地优先）：
//! ① UI 垃圾特征兜底（复用 REQ-083 黑名单同表）
//! ② 低置信丢弃（confidence <0.6）
//! ③ 纯过渡短句删除（v0.7.5 扩展：整句 ∈ 精确表——零误杀低召回；
//!    先于碎片检查——表内 2 字短语以"过渡"原因删除，统计语义更准确）
//! ④ 口头禅短段规则级删除（REQ-163：≤8 字且全由口头禅词组成，免 AI）
//! ⑤ 碎片段丢弃（≤2 字 / 时长 <500ms / 纯符号）
//! ⑥ 口语净化（v0.7.5 REQ-162：verbal_normalize 保守档 + symbol_normalize）→
//!    结巴折叠 + 术语替换（REQ-164）——净化后为空/纯符号 → 删除
//! ⑦ 修辞问句删除（v0.7.5 扩展：自问自答——核心词在紧邻段复现；跨段 pass）
//! ⑧ 相邻重复段合并（净化后文本才做精确去重——净化顺序契约）
//! @ai-context: 单一管线双出口（REQ-081）：session_to_note（落库）与
//!              preview_session_note（只读预览）共用本模块——输出一致性
//!              由构造保证。过滤**可逆**：原料层（sessions 表）不动，被过滤
//!              内容带原因/时间进入 filtered 供预览对照复查。
//! @ai-context: AI 复核（REQ-085）叠加层：boundary_candidates/apply_ai_decisions
//!              已拆至 note_filter_ai.rs（line-limit-exemptions 登记计划）——
//!              本文件经 pub use 再导出，公共 API 不变。
//! @ai-context: 误杀保护：正常长句/数字内容不误删（"3.14/2024" 等含字母数字
//!              的短文本不是"纯符号"碎片）；confidence=None（字幕段）跳过
//!              低置信规则；净化阈值集中 purify_config（REQ-173 JSON 可校准）。

use crate::note_body_source::{detect_body_source, BodySource};
use crate::purify_config::PurifyConfig;
use crate::symbol_normalize::SymbolNormalizeConfig;
use crate::types::{SessionOcrBlock, SessionScreen, SessionSegment};
use crate::ui_junk::UiJunkList;

// ────────────────────────────────────────────────────────────
// 拆分子模块（AGENTS.md §3：单文件 ≤300 行）——父模块**自己**用 #[path] 声明，
// 不动 lib.rs 的 mod 块；三个文件与 note_filter.rs 平铺于 src/（#[path] 相对
// 「源文件所在目录」解析）。模块私有 ⇒ 外部经下方再导出访问，调用点零改动。
// ────────────────────────────────────────────────────────────

/// 渲染层（屏卡 → 画面要点行 / markdown 组装 / 异常警示行）。
#[path = "note_filter_render.rs"]
mod render;

/// 净化纯函数族 + 口头禅词表 + CJK 判定（过滤链与 note_filter_ai 共用）。
#[path = "note_filter_purify.rs"]
mod purify;

/// 转写段正文过滤链（8 阶段单遍 + 跨段后置 pass；判定顺序 = 语义）。
#[path = "note_filter_chain.rs"]
mod chain;

/// 再导出：可见性与项 **1:1**（`pub` 项用 `pub use`、`pub(crate)` 项用
/// `pub(crate) use`——后者写成 `pub use` 会触发 E0365，项本身不允许外泄）。
pub use self::render::{refresh_screen_points, render_screen_points};
pub(crate) use self::render::{apply_session_warning, rebuild_markdown};
pub(crate) use self::purify::FILLER_WORDS;

// 过滤链入口（模块私有——唯一消费者是下方 filter_note；可见性不放宽，
// 调用点字面量 `filter_note_transcript(...)` 与拆前逐字一致）。
use self::chain::filter_note_transcript;

/// 净化环境（依赖注入聚合——净化配置 + 符号映射 + OCR 纠错表）。
///
/// @ai-context: filter_note/convert_to_note 参数收敛（clippy too_many_arguments
///              修正 + 显式依赖注入）：三个可校准配置同生命周期（AppState
///              装配），聚合为单一入参——调用方构造一次，纯函数消费。
/// @ai-context: Default = 内置默认口径（测试零配置噪音；生产装配显式构造）。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PurifyEnv {
    pub config: PurifyConfig,
    pub symbol: SymbolNormalizeConfig,
    pub corrections: crate::ocr_correction::OcrCorrectionTable,
}

/// 笔记规则版本（REQ-171：notes.rule_version 落库值——笔记可回答"用哪版规则
/// 生成"；净化链每次规则变更递增；v0.7.6 结构渲染层接入 REQ-177~181）。
pub const RULE_VERSION: &str = "note-rules-0.7.6";

/// 被过滤原因。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FilterReason {
    /// UI 垃圾特征（REQ-083 同表兜底）
    UiJunk,
    /// 相邻重复段
    Duplicate,
    /// 碎片段（≤2 字/<500ms/纯符号）
    Fragment,
    /// 低置信（<0.6）
    LowConfidence,
    /// AI 复核判删（REQ-085）
    AiDelete,
    /// 口头禅短段规则级删除（REQ-163：≤8 字全口头禅；含净化后空/纯符号残留）
    Filler,
    /// 纯过渡短句规则级删除（v0.7.5 扩展：整句 ∈ 精确表，零误杀）
    Transition,
    /// 修辞问句删除（v0.7.5 扩展：自问自答——核心词在紧邻段复现）
    Rhetorical,
}

/// 被过滤条目（预览对照可复查、定位原料）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct FilteredItem {
    pub segment_id: i64,
    pub reason: FilterReason,
    pub text: String,
    pub start_ms: u64,
}

/// 过滤统计（预览过滤统计卡 + REQ-171 purify_stats 落库 JSON）。
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct FilterStats {
    pub ui_junk: usize,
    pub duplicates: usize,
    pub fragments: usize,
    pub low_confidence: usize,
    pub ai_delete: usize,
    /// v0.7.5（REQ-163）：口头禅短段删除数
    #[serde(default)]
    pub filler: usize,
    /// v0.7.5（REQ-162/164）：口语净化段数（文本发生变化的段）
    #[serde(default)]
    pub verbal: usize,
    /// v0.7.5（REQ-164）：结巴折叠命中段数
    #[serde(default)]
    pub stutter: usize,
    /// v0.7.5（REQ-164）：术语替换命中段数
    #[serde(default)]
    pub term_replace: usize,
    /// v0.7.5（REQ-168）：OCR 错字纠错块数
    #[serde(default)]
    pub ocr_corrected: usize,
    /// v0.7.5 扩展：纯过渡短句删除数（精确表）
    #[serde(default)]
    pub transition: usize,
    /// v0.7.5 扩展：修辞问句删除数（自问自答）
    #[serde(default)]
    pub rhetorical: usize,
    /// v0.7.6（REQ-180）：结构渲染——插入的章节标题数
    #[serde(default)]
    pub chapters: usize,
    /// v0.7.6（REQ-180）：结构渲染——有 outline 标题命中的章节数
    #[serde(default)]
    pub titled_chapters: usize,
    /// v0.7.6（REQ-180）：结构渲染——词汇表条目数（v0.11.5 词汇表移出笔记后
    /// 恒 0，保留字段兼容旧 JSON）
    #[serde(default)]
    pub glossary_terms: usize,
}

/// 合并条目（相邻重复合并 / AI merge 展示层拼接）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct MergedItem {
    pub segment_id: i64,
    pub into_segment_id: i64,
    pub text: String,
    pub start_ms: u64,
}

/// 过滤结果（预览与转笔记共用载荷）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct NoteFilterResult {
    pub title: String,
    /// 过滤后笔记 Markdown（标题+讲述内容；画面要点 v0.11.5 移出笔记，
    /// 原料视图屏卡流呈现）
    pub markdown: String,
    /// 保留段（合并段已延伸 end_ms；AI merge 已拼接文本；净化后文本——仅产物层）
    pub kept: Vec<SessionSegment>,
    /// 画面要点（屏段落行：区间+标题+正文+标签+配图；水印/UI 垃圾/低分已排除）
    pub ocr_points: Vec<String>,
    /// v0.7.3（REQ-160）：画面要点屏（结构化——前端预览渲染屏卡；
    /// 命令层 attach 图后 image_ref 填充，markdown 配图行随之可渲染）
    #[serde(default)]
    pub ocr_screens: Vec<SessionScreen>,
    pub stats: FilterStats,
    pub filtered: Vec<FilteredItem>,
    pub merged: Vec<MergedItem>,
    /// v0.7.5（REQ-173）：本次净化生效配置（serde skip——内部透传用：
    /// refresh_screen_points/apply_ai_decisions 重建 markdown 时与预览口径一致；
    /// 不序列化给前端——前端只需消费产物）
    #[serde(skip)]
    pub(crate) purify: PurifyConfig,
    /// v0.7.5（REQ-170）：会话异常警示行（命令层按会话状态写入——"失败/异常
    /// 会话转笔记"诚实降级；serde skip：markdown 已含该行，前端无需重复字段）
    #[serde(skip)]
    pub(crate) warning: Option<String>,
    /// v0.12.0（ADR-021）：正文来源（serde skip——内部透传：refresh_screen_points/
    /// apply_ai_decisions/structure 按来源分派重建，不序列化给前端）
    #[serde(skip)]
    pub(crate) body_source: BodySource,
    /// v0.12.0（ADR-021）：OCR 直接正文净化文本序列（OcrDirect 分支产物；
    /// serde skip——markdown 已含正文，前端无需重复字段）
    #[serde(skip)]
    pub(crate) ocr_body: Vec<String>,
}

/// 笔记过滤（纯函数，正文源分派入口）：转写段 + OCR 块 → 过滤后笔记。
///
/// @ai-context: v0.12.0（ADR-021）：detect_body_source 三路分派——
///              Transcript→filter_note_transcript（既有口语过滤链，零改动）；
///              OcrDirect→filter_note_from_ocr（图文 OCR 精简链，文本入正文）；
///              Empty→标题仅。视频会话路径行为逐字节不变（回归护栏）。
pub fn filter_note(
    title: &str,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    ui_junk: &UiJunkList,
    env: &PurifyEnv,
) -> NoteFilterResult {
    match detect_body_source(segments, ocr_blocks) {
        BodySource::Transcript => {
            filter_note_transcript(title, segments, ocr_blocks, ui_junk, env)
        }
        BodySource::OcrDirect => crate::note_filter_ocr::filter_note_from_ocr(title, ocr_blocks, env),
        // v0.20.4（REQ-303）：web 正文不经过滤链（commands_session_note 已在
        // kind=web 分支直落）；此处兜底按转写路径语义（防御未来误入）
        BodySource::Web => {
            filter_note_transcript(title, segments, ocr_blocks, ui_junk, env)
        }
        BodySource::Empty => filter_note_empty(title),
    }
}

/// 空正文过滤链（纯函数）：无转写段且无可用 OCR 块 → 标题仅 markdown。
///
/// @ai-context: 不 panic 契约（图文会话无内容时转笔记的诚实降级——标题
///              即全部；与 v0.11.7 可行性契约一致）。
fn filter_note_empty(title: &str) -> NoteFilterResult {
    NoteFilterResult {
        title: title.to_string(),
        markdown: format!("# {}", title),
        kept: Vec::new(),
        ocr_points: Vec::new(),
        ocr_screens: Vec::new(),
        stats: FilterStats::default(),
        filtered: Vec::new(),
        merged: Vec::new(),
        purify: PurifyConfig::default(),
        warning: None,
        body_source: BodySource::Empty,
        ocr_body: Vec::new(),
    }
}

// ────────────────────────────────────────────────────────────
// REQ-085：AI 复核（已拆至 note_filter_ai.rs——登记拆分计划落地；
// 公共 API 再导出保持对外兼容）
// ────────────────────────────────────────────────────────────

pub use crate::note_filter_ai::{apply_ai_decisions, boundary_candidates, BoundarySegment};

/// 单测独立文件（保持本文件 ≤300 行目标，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_filter_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "note_filter_golden_tests.rs"]
mod golden_tests;
