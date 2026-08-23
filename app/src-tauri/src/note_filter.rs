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
use crate::types::{SessionOcrBlock, SessionScreen, SessionSegment, TranscriptSegment};
use crate::ui_junk::UiJunkList;
use crate::verbal_normalize::{NormalizeConfig, NormalizeStrength};

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

/// 口头禅词集（REQ-163 删除判定 + REQ-085 AI Filler 候选共用）。
///
/// @ai-context: v0.7.5 扩展（与 verbal_normalize 词表对齐——「大家知道吗/
///              咱们/我们看」等口语高频词此前只在实时路径被清，笔记路径漏网）；
///              短段全由这些词组成 → 规则级删除；"对"单字不删（回应语义，
///              且碎片规则已按 ≤2 字处理——验收口径）。
pub(crate) const FILLER_WORDS: &[&str] = &[
    "嗯", "啊", "呃", "哦", "诶", "哎", "哈", "嗯嗯", "哈哈", "好的", "对", "那个", "这个",
    "就是", "然后", "对吧", "是吧", "对不对", "对不对啊", "好不好", "就是说", "然后呢",
    "你们知道吗", "大家知道吗", "大家注意", "大家看", "咱们", "我们看", "我们来看", "接下来呢",
];

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
        BodySource::Empty => filter_note_empty(title),
    }
}

/// 转写段正文过滤链（视频会话——既有路径，v0.12.0 提取自原 filter_note 主体，
/// 逻辑零改动；OcrDirect/Empty 分派见 filter_note）。
///
/// @ai-context: 转写段按过滤链处理（见模块头）；OCR 画面要点先经
///              screens::filter_usable_blocks（v0.7.5：低分 0.7/单字符/边缘
///              条带/视频页 UI 共现/错字纠错）排除，再屏构建与精确去重。
fn filter_note_transcript(
    title: &str,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    ui_junk: &UiJunkList,
    env: &PurifyEnv,
) -> NoteFilterResult {
    let config = &env.config;
    let symbol_cfg = &env.symbol;
    let corrections = &env.corrections;
    // ① 转写段过滤链（空文本段跳过；按时间排序保证相邻性）
    let mut sorted: Vec<SessionSegment> = segments
        .iter()
        .filter(|s| !s.text.trim().is_empty())
        .cloned()
        .collect();
    sorted.sort_by_key(|s| (s.start_ms, s.id));
    let mut kept: Vec<SessionSegment> = Vec::new();
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    let mut merged = Vec::new();
    for mut seg in sorted {
        let text = seg.text.trim();
        // ① UI 垃圾特征兜底（与 REQ-083 同表——源头漏拦的兜底）
        if ui_junk.is_junk(text) {
            stats.ui_junk += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::UiJunk,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ② 低置信丢弃（confidence=None 的字幕段跳过——无置信度证据不删）
        if seg.confidence.is_some_and(|c| c < config.low_confidence_threshold) {
            stats.low_confidence += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::LowConfidence,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ③ 纯过渡短句删除（v0.7.5 扩展：整句 ∈ 精确表——"接下来/我们来看"
        //     单独成段无信息；"接下来我们看第三章"不在表内不误杀）。
        //     先于碎片检查：表内 2 字短语（首先/总之/好吧）若后置会被碎片规则
        //     （≤2 字）先删，原因标签失真（过渡原因更准确）
        if config.transition_delete
            && crate::note_filter_discourse::is_transition_short(text, config.transition_max_chars)
        {
            stats.transition += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Transition,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ④ 口头禅短段规则级删除（REQ-163：免 AI——段 1018「对不对？」类；
        //     基于原文判定——净化前形状特征未被破坏）
        if config.filler_delete && is_filler_only(text, config) {
            stats.filler += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Filler,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ⑤ 碎片段（≤2 字 / <500ms / 纯符号——"----/···" 等无信息内容）
        if is_fragment(&seg, config) {
            stats.fragments += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Fragment,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ⑥ 口语净化（REQ-162/164）：书面化（保守档）→ 符号 → 结巴折叠 → 术语替换
        let original = seg.text.clone();
        let purified = purify_segment(&original, config, symbol_cfg, &mut stats);
        // ⑦ 净化残留检查：空/纯符号（"对不对？"→"？"）/ 短口头禅（"哈"）→ 删除
        if is_purified_empty(&purified) {
            stats.filler += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Filler,
                text: original,
                start_ms: seg.start_ms,
            });
            continue;
        }
        seg.text = purified;
        kept.push(seg);
    }
    // ⑥ 修辞问句删除（v0.7.5 扩展：自问自答——问句核心词在紧邻段复现，
    //    会话31「过程是什么？」+「这个过程是制定项目章程」实证；跨段上下文
    //    需 kept 全集，故在单遍循环后执行）
    if config.rhetorical_delete {
        kept = crate::note_filter_discourse::drop_rhetorical_questions(
            kept,
            config.rhetorical_max_chars,
            &mut stats,
            &mut filtered,
        );
    }
    // ⑦ 相邻重复段合并（净化后文本精确去重——净化顺序契约；合并延伸 end_ms）
    let mut deduped: Vec<SessionSegment> = Vec::new();
    for seg in kept {
        if let Some(last) = deduped.last_mut() {
            if last.text.trim() == seg.text.trim() {
                stats.duplicates += 1;
                filtered.push(FilteredItem {
                    segment_id: seg.id,
                    reason: FilterReason::Duplicate,
                    text: seg.text.clone(),
                    start_ms: seg.start_ms,
                });
                merged.push(MergedItem {
                    segment_id: seg.id,
                    into_segment_id: last.id,
                    text: seg.text.clone(),
                    start_ms: seg.start_ms,
                });
                last.end_ms = last.end_ms.max(seg.end_ms);
                continue;
            }
        }
        deduped.push(seg);
    }
    let kept = deduped;
    // 画面要点（v0.7.3 REQ-160：可消费块过滤 → 屏构建 → 屏段落渲染；
    //    v0.7.5：过滤含单字符/边缘条带/视频页共现/错字纠错——见 screens.rs）
    let transcript = concat_transcript(&kept);
    let (usable, ocr_corrected) =
        crate::screens::filter_usable_blocks(ocr_blocks, ui_junk, config, &transcript, corrections);
    stats.ocr_corrected = ocr_corrected;
    let ocr_screens = crate::screens::build_screens(&usable, None);
    let ocr_points = render_screen_points(&ocr_screens);
    let markdown = rebuild_markdown(title, &kept, &[], config, None);
    NoteFilterResult {
        title: title.to_string(),
        markdown,
        kept,
        ocr_points,
        ocr_screens,
        stats,
        filtered,
        merged,
        purify: config.clone(),
        warning: None,
        body_source: BodySource::Transcript,
        ocr_body: Vec::new(),
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

/// 单段口语净化（纯函数）：结巴折叠 → 书面化（保守档 Light）→ 符号规范化 →
/// 术语替换；返回净化后文本（统计计数由调用方入参累加）。
///
/// @ai-context: 顺序契约（会话31 实证驱动）：**折叠必须先于书面化**——verbal
///              compress_repeats 会把"甲甲甲"先压成"甲甲"（2 连短语重复），
///              折叠规则（≥3 连同字）随后不再命中，结巴残留（「甲甲甲」→「甲」
///              验收不达标）；折叠在前则 3 连先收拢、书面化不再误动。
fn purify_segment(
    text: &str,
    config: &PurifyConfig,
    symbol_cfg: &SymbolNormalizeConfig,
    stats: &mut FilterStats,
) -> String {
    let mut out = text.to_string();
    let changed = |before: &str, after: &str| before != after;
    let before = out.clone();
    let mut fold_hit = false;
    if config.stutter_fold {
        let folded = crate::stutter_fold::fold_stutter(&out);
        fold_hit = folded != out;
        out = folded;
    }
    if config.verbal_normalize {
        let vcfg = NormalizeConfig { strength: NormalizeStrength::Light };
        out = crate::verbal_normalize::normalize(&out, &vcfg);
    }
    if config.symbol_normalize {
        out = crate::symbol_normalize::normalize(&out, symbol_cfg);
    }
    let mut term_hit = false;
    if config.term_replace {
        let replaced = crate::stutter_fold::apply_term_replacements(&out);
        term_hit = replaced != out;
        out = replaced;
    }
    if changed(&before, &out) {
        stats.verbal += 1;
    }
    if fold_hit {
        stats.stutter += 1;
    }
    if term_hit {
        stats.term_replace += 1;
    }
    out
}

/// 净化残留判定（纯函数）：空串 / 纯符号（无字母数字汉字）→ 无信息内容。
fn is_purified_empty(text: &str) -> bool {
    let t = text.trim();
    t.is_empty() || t.chars().all(|c| !c.is_alphanumeric() && !is_cjk(c))
}

/// 口头禅短段判定（纯函数，REQ-163）：去首尾标点后 ≤filler_max_chars 字且
/// 全部空白分隔 token ∈ 口头禅词表 → 删除候选。
///
/// @ai-context: "对不对？"→去"？"→"对不对" ✓；"对"单字 <2 不删（回应语义）；
///              "3.14"数字不删（非口头禅词）；"你说得对"含"你说得"不删。
fn is_filler_only(text: &str, config: &PurifyConfig) -> bool {
    let stripped: String = text
        .trim()
        .trim_matches(|c: char| c.is_ascii_punctuation() || "。！？，、；：…·".contains(c))
        .to_string();
    let chars = stripped.chars().count();
    if chars < 2 || chars > config.filler_max_chars {
        return false;
    }
    let tokens: Vec<&str> = stripped.split_whitespace().collect();
    !tokens.is_empty() && tokens.iter().all(|t| FILLER_WORDS.contains(t))
}

/// 保留段转写文本拼接（供 OCR 共现校验/纠错——画面词与讲述词互证）。
fn concat_transcript(kept: &[SessionSegment]) -> String {
    let mut out = String::new();
    for s in kept {
        out.push_str(&s.text);
        out.push(' ');
    }
    out
}

/// 碎片段判定（纯函数）：≤2 字 / 时长 <500ms / 纯符号（阈值可配置 REQ-173）。
///
/// @ai-context: 纯符号 = 无字母数字汉字（"----/···"）；"3.14/2024" 含数字
///              不算纯符号——误杀保护（数字内容不误删）。
fn is_fragment(seg: &SessionSegment, config: &PurifyConfig) -> bool {
    let text = seg.text.trim();
    text.chars().count() <= config.fragment_max_chars
        || seg.end_ms.saturating_sub(seg.start_ms) < config.fragment_min_duration_ms
        || text.chars().all(|c| !c.is_alphanumeric() && !is_cjk(c))
}

/// 画面要点屏段落渲染（纯函数）：屏卡 → 笔记画面要点行（Markdown 列表项）。
///
/// @ai-context: 每屏一段：`- **[MM:SS–MM:SS] 标题**` + 正文行（二级列表）+
///              标签行 + 配图行（image_ref 有值时；src 为相对 data_dir 路径
///              `session-images/{sid}/full/{ts}.webp`——前端渲染拼 baseUrl）。
/// @ai-context: 无标题屏（旧数据无 bbox 降级）用"画面 N"占位——不丢内容。
pub fn render_screen_points(screens: &[SessionScreen]) -> Vec<String> {
    let mut lines = Vec::new();
    for (i, s) in screens.iter().enumerate() {
        let range = format!(
            "[{}–{}]",
            crate::concat::format_timestamp(s.first_seen_ms),
            crate::concat::format_timestamp(s.last_seen_ms)
        );
        let title = s.title.clone().unwrap_or_else(|| format!("画面 {}", i + 1));
        lines.push(format!("- **{} {}**", range, title));
        for b in &s.body {
            lines.push(format!("  - {}", b));
        }
        if !s.labels.is_empty() {
            lines.push(format!("  - 标签：{}", s.labels.join(" · ")));
        }
        if let Some(rel) = &s.image_ref {
            // 修复（2026-08-21 审查）：缺闭合 `)`——前端渲染正则
            // `^\s*-\s*!\[([^\]]*)\]\(([^)]*)\)$` 要求 `)$` 结尾，缺括号时
            // 配图行永远匹配不上 → 渲染为纯文本而非图片（丢图真因之一）
            lines.push(format!("  - ![画面 {}](session-images/{}/{})", i + 1, s.session_id, rel));
        }
    }
    lines
}

/// 会话异常警示行（REQ-170，纯函数）：status != finished → 追加警示。
///
/// @ai-context: 会话31 实证：status=failed 但内容完整（停止链路异常翻案）——
///              照常转笔记但诚实标注"内容可能不完整"，用户自行判断；
///              警示行是普通 Markdown 引用行（用户可手动删除）。
/// @ai-context: 预览/落库/AI 复核三出口共用（REQ-081 单一管线）——命令层在
///              refresh_screen_points 前调用，markdown 重建口径一致。
pub(crate) fn apply_session_warning(result: &mut NoteFilterResult, status: &str) {
    if status == crate::db_sessions::SESSION_STATUS_FINISHED {
        result.warning = None;
    } else {
        result.warning = Some(format!("> ⚠️ 会话异常（{}），内容可能不完整", status));
    }
}

/// 刷新画面要点数据（纯函数）：ocr_screens 重新渲染 + 重建 markdown。
///
/// @ai-context: 命令层 attach_images 填充 image_ref 后调用——原料视图
///              屏卡配图随 image_ref 出现/消失；markdown 重建不含画面要点
///              （v0.11.5 移出笔记，配图行仅存于 AI 精修 image 块）；
///              净化配置随 result 透传（段落阈值/锚点与预览口径一致）。
pub fn refresh_screen_points(result: &mut NoteFilterResult) {
    result.ocr_points = render_screen_points(&result.ocr_screens);
    // v0.12.0（ADR-021）：按正文源分派重建——OcrDirect 走 OCR 正文重建
    // （kept 为空，走 rebuild_markdown 会把 OCR 正文覆盖成标题仅）
    result.markdown = match result.body_source {
        BodySource::OcrDirect => crate::note_filter_ocr::rebuild_ocr_markdown(
            &result.title,
            &result.ocr_body,
            &result.purify,
            result.warning.as_deref(),
        ),
        _ => rebuild_markdown(
            &result.title,
            &result.kept,
            &[],
            &result.purify,
            result.warning.as_deref(),
        ),
    };
}

/// 组装 Markdown（标题 + 讲述内容；段落切分复用 concat 口径；
/// v0.7.5 REQ-165/170/173：段首 [MM:SS] 时间戳锚点（可回跳原视频位置，可开关）
/// + 段落阈值走净化配置 + 会话异常警示行（None=无警示）。
/// v0.11.5：画面要点段移出笔记（_ocr_points 签名保留兼容调用方，忽略）。
pub(crate) fn rebuild_markdown(
    title: &str,
    kept: &[SessionSegment],
    _ocr_points: &[String],
    config: &PurifyConfig,
    warning: Option<&str>,
) -> String {
    let mut md = assemble_purified_markdown(title, kept, _ocr_points, config);
    if let Some(w) = warning {
        md = format!("{}\n\n{}", w, md);
    }
    md
}

/// 净化组装（无警示行版——供 rebuild_markdown 内部与警示拼接）。
fn assemble_purified_markdown(
    title: &str,
    kept: &[SessionSegment],
    _ocr_points: &[String],
    config: &PurifyConfig,
) -> String {
    let transcript: Vec<TranscriptSegment> = kept
        .iter()
        .map(|s| TranscriptSegment {
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            word_timestamps: None,
            // 段落切分不消费置信度/音量（None 占位）
            confidence: None,
            volume: None,
        })
        .collect();
    let paragraphs = crate::concat::split_transcript_paragraphs_with(
        &transcript,
        config.paragraph_max_chars,
        config.paragraph_max_span_ms,
    );
    let anchored: Vec<String> = paragraphs
        .into_iter()
        .map(|(start_ms, text)| {
            if config.anchor_timestamps {
                format!("{} {}", crate::concat::format_timestamp(start_ms), text)
            } else {
                text
            }
        })
        .collect();
    crate::concat::assemble_markdown(title, &anchored, &[])
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
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
