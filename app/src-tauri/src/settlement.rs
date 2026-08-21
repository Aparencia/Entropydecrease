//! 组结算纯函数（v0.11.3；L3 骨折层的组级版——防沼泽仪式）。
//!
//! @ai-context: 组沼泽化 ★★★★★ 死法防御——阈值/周期双触发器 + 重复合并判据；
//!              结算必须是用户可见的仪式（command/UI 层保证），本层只提供判据。
//! @ai-context: 纯逻辑无 IO；golden 用例覆盖阈值/周期边界与合并判据。

/// 阈值触发：组内条目数上限（超过即该结算）。
pub const ITEM_THRESHOLD: usize = 50;
/// 周期触发最小条目数（条目太少不值得结算仪式）。
pub const CYCLE_ITEM_MIN: usize = 20;
/// 周期触发天数（距上次结算超过此天数）。
pub const CYCLE_DAYS: i64 = 90;
/// 重复判定相似度阈值（字符 bigram 包含度系数）。
pub const MERGE_SIMILARITY: f32 = 0.7;
/// 归档候选老化天数（无卡绑定且超过此天数未更新）。
pub const ARCHIVE_AGE_DAYS: i64 = 180;

/// 结算触发信号。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SettlementSignals {
    /// 组内活跃条目数（碎片+笔记）
    pub item_count: usize,
    /// 上次结算时刻（Unix 秒；None=从未结算——按建组时刻由调用方折算）
    pub last_settled_at: Option<i64>,
    /// 组创建时刻（Unix 秒——从未结算时的周期基准）
    pub created_at: i64,
    /// 当前时刻（Unix 秒）
    pub now_secs: i64,
}

/// 结算触发判定（阈值 OR 周期；双触发器防"永远不结算"与"频繁打扰"两极）。
///
/// @ai-context: 阈值：item_count ≥ 50 立即该结算（沼泽化前兆）；
///              周期：≥20 条且 ≥90 天未结算（低膨胀也定期对账）；
///              条目 <20 且未过阈值 → 不打扰（仪式有成本）。
pub fn settlement_due(s: &SettlementSignals) -> bool {
    if s.item_count >= ITEM_THRESHOLD {
        return true;
    }
    if s.item_count < CYCLE_ITEM_MIN {
        return false;
    }
    let baseline = s.last_settled_at.unwrap_or(s.created_at);
    let days = (s.now_secs - baseline) / 86_400;
    days >= CYCLE_DAYS
}

/// 文本规范化（相似度前置：小写 + 去空白/标点——口径与 asr_dedupe 同源哲学）。
fn normalize_for_sim(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// 字符 bigram 集合（长度 <2 退化为单字符集）。
fn bigrams(norm: &str) -> std::collections::HashSet<String> {
    let chars: Vec<char> = norm.chars().collect();
    let mut set = std::collections::HashSet::new();
    if chars.len() < 2 {
        for c in &chars {
            set.insert(c.to_string());
        }
        return set;
    }
    for w in chars.windows(2) {
        set.insert(w.iter().collect());
    }
    set
}

/// 文本相似度（字符 bigram 包含度系数 inter/min，0..1；空文本 → 0 诚实）。
///
/// @ai-context: 用包含度而非 Jaccard（inter/union）——重复碎片常长短不一
///              （短句是长句的子集），Jaccard 被长度差稀释会漏判；包含度
///              对"短句完全含于长句"给高分，与重复的真实形态对齐。
pub fn text_similarity(a: &str, b: &str) -> f32 {
    let (na, nb) = (normalize_for_sim(a), normalize_for_sim(b));
    if na.is_empty() || nb.is_empty() {
        return 0.0;
    }
    let (sa, sb) = (bigrams(&na), bigrams(&nb));
    let inter = sa.intersection(&sb).count() as f32;
    let min_size = sa.len().min(sb.len()) as f32;
    if min_size == 0.0 {
        0.0
    } else {
        inter / min_size
    }
}

/// 重复合并对（id, 文本）列表 → (保留 id, 丢弃 id) 对列表。
///
/// @ai-context: 贪心一对一（每条最多进一对，防链式合并丢内容）；保留项取
///              文本较长者（信息量下界），丢弃项由结算执行归档（不删除——可恢复）。
pub fn find_merge_pairs(items: &[(i64, String)]) -> Vec<(i64, i64)> {
    let mut used = std::collections::HashSet::new();
    let mut pairs = Vec::new();
    for i in 0..items.len() {
        if used.contains(&items[i].0) {
            continue;
        }
        for j in (i + 1)..items.len() {
            if used.contains(&items[j].0) {
                continue;
            }
            if text_similarity(&items[i].1, &items[j].1) >= MERGE_SIMILARITY {
                // 保留较长文本（信息量下界）
                let (keep, drop) = if items[i].1.chars().count() >= items[j].1.chars().count() {
                    (items[i].0, items[j].0)
                } else {
                    (items[j].0, items[i].0)
                };
                pairs.push((keep, drop));
                used.insert(items[i].0);
                used.insert(items[j].0);
                break;
            }
        }
    }
    pairs
}

#[cfg(test)]
#[path = "settlement_tests.rs"]
mod tests;
