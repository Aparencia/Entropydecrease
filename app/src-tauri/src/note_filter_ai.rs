//! 笔记过滤 AI 复核层（REQ-085 / v0.7.5 拆分产物）。
//!
//! @ai-context: 原 note_filter.rs 的边界段分类与 AI 三态判定应用——按
//!              line-limit-exemptions.md 登记计划（"若再增长：boundary_candidates/
//!              apply_ai_decisions 拆至 note_filter_ai.rs"）拆出；公共 API 经
//!              note_filter.rs `pub use` 再导出，对外调用方零改动。
//! @ai-context: 分类语义：Filler（口头禅）/Greeting（寒暄）/Transition（过渡）/
//!              Truncated（截断）/Broken（破碎）/SemanticDup（语义重复）；
//!              AI 只判规则层判不了的边界段（典型 20~30 段/会话，控成本）。

use crate::note_filter::FILLER_WORDS;
use crate::types::SessionSegment;
use crate::ai_protocol::{TextFilterAction, TextFilterDecision};
use crate::note_filter::{FilteredItem, FilterReason, NoteFilterResult};

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
    // Filler：短句全由口头禅组成（v0.7.5：规则层已先删 ≤8 字口头禅短段——
    // 到此的 Filler 候选为 8 字以上含口头禅的混合短句，交 AI 判删/保留）
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
                    result.merged.push(crate::note_filter::MergedItem {
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
    // 净化配置与警示随 result 走（filter_note 构造时写入——AI 重建 markdown
    // 必须与预览口径一致：锚点开关/段落阈值/警示行不得自行决定）
    let cfg = result.purify.clone();
    let warning = result.warning.clone();
    result.markdown = crate::note_filter::rebuild_markdown(
        &result.title,
        &result.kept,
        &result.ocr_points,
        &cfg,
        warning.as_deref(),
    );
    result
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；v0.7.5 拆分后随本模块）。
#[cfg(test)]
#[path = "note_filter_ai_tests.rs"]
mod tests;
