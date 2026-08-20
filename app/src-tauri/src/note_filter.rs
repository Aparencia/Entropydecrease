//! 笔记废话出口过滤管线（REQ-082 / v0.6.0 M1）。
//!
//! @ai-context: 过滤链（纯规则，本地优先）：① UI 垃圾特征兜底（复用 REQ-083
//!              黑名单同表）→ ② 相邻重复段合并（同文本连续段，含 asr/fused
//!              混杂——融合重复 bug 修复后的兜底）→ ③ 碎片段丢弃（≤2 字 /
//!              时长 <500ms / 纯符号）→ ④ 低置信丢弃（confidence <0.6）。
//! @ai-context: 单一管线双出口（REQ-081）：session_to_note（落库）与
//!              preview_session_note（只读预览）共用本模块——输出一致性
//!              由构造保证。过滤**可逆**：原料层（sessions 表）不动，被过滤
//!              内容带原因/时间进入 filtered 供预览对照复查。
//! @ai-context: AI 复核（REQ-085）叠加层：boundary_candidates 选出规则层
//!              判不了的边界段（口头禅/寒暄/破碎/截断/语义重复/过渡），
//!              云端三态判定后 apply_ai_decisions 就地应用（delete 进过滤表、
//!              merge 仅展示层拼接——原料仍按原始段落库）。
//! @ai-context: 误杀保护：正常长句/数字内容不误删（"3.14/2024" 等含字母数字
//!              的短文本不是"纯符号"碎片）；confidence=None（字幕段）跳过
//!              低置信规则。

use crate::ai_protocol::{TextFilterAction, TextFilterDecision};
use crate::types::{SessionOcrBlock, SessionScreen, SessionSegment, TranscriptSegment};
use crate::ui_junk::UiJunkList;

/// 碎片段最大字符数（≤2 字丢弃）。
pub const FRAGMENT_MAX_CHARS: usize = 2;
/// 碎片段最小时长（<500ms 丢弃）。
pub const FRAGMENT_MIN_DURATION_MS: u64 = 500;
/// 低置信丢弃阈值（confidence <0.6 丢弃）。
pub const LOW_CONFIDENCE_THRESHOLD: f32 = 0.6;

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
}

/// 被过滤条目（预览对照可复查、定位原料）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct FilteredItem {
    pub segment_id: i64,
    pub reason: FilterReason,
    pub text: String,
    pub start_ms: u64,
}

/// 过滤统计（预览过滤统计卡：UI 垃圾 x/重复 y/碎片 z/低置信 w）。
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct FilterStats {
    pub ui_junk: usize,
    pub duplicates: usize,
    pub fragments: usize,
    pub low_confidence: usize,
    pub ai_delete: usize,
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
    /// 过滤后笔记 Markdown（标题+讲述内容+画面要点）
    pub markdown: String,
    /// 保留段（合并段已延伸 end_ms；AI merge 已拼接文本——仅产物层）
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
}

/// 笔记过滤（纯函数）：转写段 + OCR 块 → 过滤后笔记。
///
/// @ai-context: 转写段按过滤链处理（见模块头）；OCR 画面要点先经
///              watermark_filter（REQ-059）+ is_ui_junk（REQ-083 同表）排除，
///              再低分过滤与精确去重——与讲述内容同口径的"输入干净化"。
pub fn filter_note(
    title: &str,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    ui_junk: &UiJunkList,
) -> NoteFilterResult {
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
    for seg in sorted {
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
        // ② 碎片段（≤2 字 / <500ms / 纯符号——"----/···" 等无信息内容）
        if is_fragment(&seg) {
            stats.fragments += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Fragment,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ③ 低置信丢弃（confidence=None 的字幕段跳过——无置信度证据不删）
        if seg.confidence.is_some_and(|c| c < LOW_CONFIDENCE_THRESHOLD) {
            stats.low_confidence += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::LowConfidence,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ④ 相邻重复段合并（同文本连续段——含 asr/fused 混杂：融合窗口配额
        //    修复后的兜底；合并延伸 end_ms，重复段进过滤表可复查）
        if let Some(last) = kept.last_mut() {
            if last.text.trim() == text {
                stats.duplicates += 1;
                filtered.push(FilteredItem {
                    segment_id: seg.id,
                    reason: FilterReason::Duplicate,
                    text: text.to_string(),
                    start_ms: seg.start_ms,
                });
                merged.push(MergedItem {
                    segment_id: seg.id,
                    into_segment_id: last.id,
                    text: text.to_string(),
                    start_ms: seg.start_ms,
                });
                last.end_ms = last.end_ms.max(seg.end_ms);
                continue;
            }
        }
        kept.push(seg);
    }
    // ② 画面要点（v0.7.3 REQ-160：可消费块过滤 → 屏构建 → 屏段落渲染；
    //    水印 + UI 垃圾 + 低分在 filter_usable_blocks 排除——与原料口径解耦）
    let usable = crate::screens::filter_usable_blocks(ocr_blocks, ui_junk);
    let ocr_screens = crate::screens::build_screens(&usable, None);
    let ocr_points = render_screen_points(&ocr_screens);
    let markdown = rebuild_markdown(title, &kept, &ocr_points);
    NoteFilterResult { title: title.to_string(), markdown, kept, ocr_points, ocr_screens, stats, filtered, merged }
}

/// 碎片段判定（纯函数）：≤2 字 / 时长 <500ms / 纯符号。
///
/// @ai-context: 纯符号 = 无字母数字汉字（"----/···"）；"3.14/2024" 含数字
///              不算纯符号——误杀保护（数字内容不误删）。
fn is_fragment(seg: &SessionSegment) -> bool {
    let text = seg.text.trim();
    text.chars().count() <= FRAGMENT_MAX_CHARS
        || seg.end_ms.saturating_sub(seg.start_ms) < FRAGMENT_MIN_DURATION_MS
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
            lines.push(format!("  - ![画面 {}](session-images/{}/{}", i + 1, s.session_id, rel));
        }
    }
    lines
}

/// 刷新画面要点段落（纯函数）：ocr_screens 重新渲染 + 重建 markdown。
///
/// @ai-context: 命令层 attach_images 填充 image_ref 后调用——配图行随
///              image_ref 出现/消失，保持 markdown 与 ocr_screens 一致
///              （单管线双出口原则的图版本）。
pub fn refresh_screen_points(result: &mut NoteFilterResult) {
    result.ocr_points = render_screen_points(&result.ocr_screens);
    let transcript: Vec<TranscriptSegment> = result
        .kept
        .iter()
        .map(|s| TranscriptSegment {
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            word_timestamps: None,
            confidence: None,
            volume: None,
        })
        .collect();
    let paragraphs = crate::concat::split_transcript_paragraphs(&transcript);
    result.markdown =
        crate::concat::assemble_markdown(&result.title, &paragraphs, &result.ocr_points);
}

/// 组装 Markdown（标题 + 讲述内容 + 画面要点；段落切分复用 concat 口径）。
fn rebuild_markdown(title: &str, kept: &[SessionSegment], ocr_points: &[String]) -> String {
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
    let paragraphs = crate::concat::split_transcript_paragraphs(&transcript);
    crate::concat::assemble_markdown(title, &paragraphs, ocr_points)
}

// ────────────────────────────────────────────────────────────
// REQ-085：AI 复核（边界段选择 + 判定应用）
// ────────────────────────────────────────────────────────────

/// 边界段类别（规则层判不了的六类）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BoundaryKind {
    /// 口头禅（"嗯 那个 就是"）
    Filler,
    /// 寒暄离题（"大家好 欢迎…"）
    Greeting,
    /// ASR 破碎句（逗号结尾/省略号）
    Broken,
    /// 截断半句（连词开头短句——需上下文衔接判定）
    Truncated,
    /// 语义重复（与相邻段高重叠）
    SemanticDup,
    /// 过渡句（"接下来我们看…"）
    Transition,
}

impl BoundaryKind {
    /// 送 AI 的类别提示（kebab-case；AI 参考不强制）。
    pub fn hint(&self) -> &'static str {
        match self {
            BoundaryKind::Filler => "filler",
            BoundaryKind::Greeting => "greeting",
            BoundaryKind::Broken => "broken",
            BoundaryKind::Truncated => "truncated",
            BoundaryKind::SemanticDup => "semantic-dup",
            BoundaryKind::Transition => "transition",
        }
    }
}

/// 边界段（送 AI 三态判定的候选）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BoundarySegment {
    pub segment_id: i64,
    pub text: String,
    pub start_ms: u64,
    pub kind: BoundaryKind,
    /// 相邻上下文（供截断句衔接判定）
    pub prev: Option<String>,
    pub next: Option<String>,
}

/// 口头禅词集（短句全由口头禅组成才判 Filler）。
const FILLER_WORDS: &[&str] = &[
    "嗯", "啊", "呃", "哦", "诶", "哎", "哈", "嗯嗯", "哈哈", "好的", "对", "那个", "这个",
    "就是", "然后", "对吧", "是吧", "对不对", "好不好", "就是说", "然后呢",
];

/// 寒暄/开场前缀。
const GREETING_PREFIXES: &[&str] = &[
    "大家好", "同学们好", "各位同学", "各位老师", "各位观众", "欢迎", "好久不见", "我们开始",
    "开始上课", "开始吧", "上课了", "今天我们来", "今天给大家",
];

/// 过渡句前缀。
const TRANSITION_PREFIXES: &[&str] = &[
    "接下来", "下面我们", "然后我们", "我们来看", "我们看", "先看", "首先我们", "最后我们",
    "总之", "接下来我们", "下面",
];

/// 连词前缀（截断句特征：连词开头 + 短）。
const CONNECTIVE_PREFIXES: &[&str] = &[
    "所以", "然后", "但是", "因此", "不过", "而且", "因为", "如果", "虽然", "那么", "就是", "其实",
];

/// 语义重复重叠率阈值（与相邻段字符重叠 ≥60% 判语义重复）。
const SEMANTIC_DUP_RATIO: f32 = 0.6;

/// 边界段选择（纯函数）：规则层保留段 → 六类边界特征候选。
///
/// @ai-context: 只从 kept（规则幸存段）里选——确定性分类已由规则处理，
///              AI 只判"边界"（不确定段），控成本（典型 20~30 段/会话）。
/// @ai-context: 命中优先级：Filler > Greeting > Transition > Truncated >
///              Broken > SemanticDup（首中即止，段只进一个类别）。
pub fn boundary_candidates(kept: &[SessionSegment]) -> Vec<BoundarySegment> {
    let mut out = Vec::new();
    for (i, seg) in kept.iter().enumerate() {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        let chars = text.chars().count();
        let prev = (i > 0).then(|| kept[i - 1].text.clone());
        let next = kept.get(i + 1).map(|s| s.text.clone());
        let kind = classify_boundary(text, chars, &prev, &next);
        if let Some(kind) = kind {
            out.push(BoundarySegment {
                segment_id: seg.id,
                text: text.to_string(),
                start_ms: seg.start_ms,
                kind,
                prev,
                next,
            });
        }
    }
    out
}

/// 单段边界分类（纯函数；命中优先级见 boundary_candidates）。
fn classify_boundary(
    text: &str,
    chars: usize,
    prev: &Option<String>,
    next: &Option<String>,
) -> Option<BoundaryKind> {
    // Filler：短句全由口头禅组成
    if chars <= 8 {
        let tokens: Vec<&str> = text.split_whitespace().collect();
        if !tokens.is_empty() && tokens.iter().all(|t| FILLER_WORDS.contains(t)) {
            return Some(BoundaryKind::Filler);
        }
    }
    // Greeting：寒暄/开场前缀 + 短
    if chars <= 40 && GREETING_PREFIXES.iter().any(|p| text.starts_with(p)) {
        return Some(BoundaryKind::Greeting);
    }
    // Transition：过渡句前缀 + 短
    if chars <= 30 && TRANSITION_PREFIXES.iter().any(|p| text.starts_with(p)) {
        return Some(BoundaryKind::Transition);
    }
    // Truncated：连词开头 + 短 + 有上下文可接（AI 判 merge 方向）
    if chars <= 8
        && CONNECTIVE_PREFIXES.iter().any(|p| text.starts_with(p))
        && (prev.is_some() || next.is_some())
    {
        return Some(BoundaryKind::Truncated);
    }
    // Broken：逗号/省略号结尾（ASR 破碎句特征）
    if (chars <= 6 && text.ends_with(['，', ',', ';', '；', '、']))
        || text.contains("……")
        || text.contains("...")
    {
        return Some(BoundaryKind::Broken);
    }
    // SemanticDup：与相邻段高重叠（非精确重复——精确重复已由规则合并）
    if chars >= 4 {
        let near = prev.as_deref().unwrap_or("").to_string() + next.as_deref().unwrap_or("");
        if !near.is_empty() && overlap_ratio(text, &near) >= SEMANTIC_DUP_RATIO {
            return Some(BoundaryKind::SemanticDup);
        }
    }
    None
}

/// 字符重叠率（纯函数）：a 中字符在 b 中出现的比例。
fn overlap_ratio(a: &str, b: &str) -> f32 {
    let a_chars: Vec<char> = a.chars().collect();
    if a_chars.is_empty() {
        return 0.0;
    }
    let b_chars: Vec<char> = b.chars().collect();
    let matched = a_chars.iter().filter(|c| b_chars.contains(c)).count();
    matched as f32 / a_chars.len() as f32
}

/// 应用 AI 三态判定（纯函数）：delete 进过滤表、merge 展示层拼接、keep 不动。
///
/// @ai-context: 保守兜底：判定引用的段已不存在（并发/异常）→ 跳过该判定；
///              merge 目标非相邻段 → 保守保留（不删不并）；merge 拼接仅影响
///              产物层 kept 文本（原料 segments 表不动——可逆契约）。
pub fn apply_ai_decisions(
    mut result: NoteFilterResult,
    decisions: &[TextFilterDecision],
) -> NoteFilterResult {
    if decisions.is_empty() {
        return result;
    }
    let mut kept = std::mem::take(&mut result.kept);
    for d in decisions {
        let Some(pos) = kept.iter().position(|s| s.id == d.segment_id) else {
            continue; // 段已不存在（防御）
        };
        match d.action {
            TextFilterAction::Keep => {}
            TextFilterAction::Delete => {
                let seg = kept.remove(pos);
                result.stats.ai_delete += 1;
                result.filtered.push(FilteredItem {
                    segment_id: seg.id,
                    reason: FilterReason::AiDelete,
                    text: seg.text.clone(),
                    start_ms: seg.start_ms,
                });
            }
            TextFilterAction::Merge => {
                // 目标必须为相邻段（prev/next），否则保守保留
                let target_pos = match d.merge_with.as_deref() {
                    Some("prev") if pos > 0 => Some(pos - 1),
                    Some("next") if pos + 1 < kept.len() => Some(pos + 1),
                    _ => None,
                };
                if let Some(tp) = target_pos {
                    let target_id = kept[tp].id;
                    let seg = kept.remove(pos);
                    // 审查修复（2026-08-19）：target 可能已被前序判定删除——
                    // 旧实现 unwrap_or(0) 会把本段错拼到 index 0 的无关段
                    let Some(tpos) = kept.iter().position(|s| s.id == target_id) else {
                        // 保守恢复原段（不删不并——不损坏数据）
                        kept.insert(pos, seg);
                        continue;
                    };
                    let joined = if tp < pos {
                        format!("{}{}", kept[tpos].text.trim(), seg.text.trim())
                    } else {
                        format!("{}{}", seg.text.trim(), kept[tpos].text.trim())
                    };
                    result.merged.push(MergedItem {
                        segment_id: seg.id,
                        into_segment_id: kept[tpos].id,
                        text: seg.text.clone(),
                        start_ms: seg.start_ms,
                    });
                    kept[tpos].text = joined;
                    kept[tpos].end_ms = kept[tpos].end_ms.max(seg.end_ms);
                }
            }
        }
    }
    result.kept = kept;
    result.markdown = rebuild_markdown(&result.title, &result.kept, &result.ocr_points);
    result
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；REQ-085 测试在第二文件）。
#[cfg(test)]
#[path = "note_filter_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "note_filter_ai_tests.rs"]
mod ai_tests;
