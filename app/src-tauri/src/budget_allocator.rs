//! 上下文预算分配器（v0.18.2 REQ-254；ADR-027 §4 硬约束纯函数）。
//!
//! @ai-context: 调用成本与库规模解耦——O(1) 恒量预算：档位内 系统+目标摘要
//!              ~2K｜信号 ~0.3K｜检索片段 ~2.4K｜输出预留 ~2K（设计 §六），
//!              超限按相关性截断且**诚实提示绝不静默**；任意大输入 → 恒定输出。
//! @ai-context: 档位化（轻量 4K/标准 10K/深度 30K，默认标准）——设置页可选。

/// 档位 token 上限（轻量/标准/深度）。
pub const TIER_LIGHT_TOKENS: usize = 4_000;
pub const TIER_STANDARD_TOKENS: usize = 10_000;
pub const TIER_DEEP_TOKENS: usize = 30_000;

/// 字符→token 粗估（中文 ≈1.5-2 字/token，保守 2 字/token——低估 token 会爆
/// 预算，取保守值做**上界预留**）。
pub const CHARS_PER_TOKEN: usize = 2;

/// 档位解析（未知/空 → 标准——诚实回落不猜）。
pub fn tier_tokens(tier: &str) -> usize {
    match tier {
        "light" => TIER_LIGHT_TOKENS,
        "deep" => TIER_DEEP_TOKENS,
        _ => TIER_STANDARD_TOKENS,
    }
}

/// 预算分解（系统+摘要/信号/检索/输出预留——剩余留断言与容错）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetPlan {
    pub tier: String,
    pub total_tokens: usize,
    pub overhead_tokens: usize,
    pub retrieval_tokens: usize,
    pub output_reserve_tokens: usize,
    /// 检索侧可用的字符预算（截断上界）。
    pub retrieval_chars: usize,
}

/// 按档位生成预算（开销恒量——任意档位 O(1)）。
///
/// @ai-context: 摘要/信号为恒量开销（<2K），检索按剩余额度分配——
///              输出预留 2K + 系统/摘要/信号 2.3K 是硬保留。
pub fn plan_budget(tier: &str) -> BudgetPlan {
    let total = tier_tokens(tier);
    let overhead_tokens = 2_300; // 系统提示 + 目标摘要 + 标量信号
    let output_reserve_tokens = 2_000;
    let retrieval_tokens = total.saturating_sub(overhead_tokens + output_reserve_tokens);
    BudgetPlan {
        tier: tier.to_string(),
        total_tokens: total,
        overhead_tokens,
        retrieval_tokens,
        output_reserve_tokens,
        retrieval_chars: retrieval_tokens * CHARS_PER_TOKEN,
    }
}

/// 检索片段截断（字符上界；O(len) 单遍——片段长时按界截）。
pub fn truncate_retrieval(text: &str, budget_chars: usize) -> String {
    if budget_chars == 0 {
        return String::new();
    }
    text.chars().take(budget_chars).collect()
}

/// 多片段排序截断（按给定相关性得分离低；总量 ≤ budget_chars——O(N log N) 排序
/// 后单遍累加，**输出上界与输入规模无关**：预算恒定）。
/// @ai-context: v0.19.1（REQ-260）学习库问答上下文打包消费本函数（kb_prompt::kb_build_context）——
///              原"预留 dead_code"豁免注释与 #[allow] 已随转正移除（审查 L6 清理）。
pub fn pack_fragments(fragments: &[(String, f64)], budget_chars: usize) -> (String, bool) {
    let mut sorted: Vec<&(String, f64)> = fragments.iter().collect();
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut out = String::new();
    let mut used = 0usize;
    let mut truncated = false;
    for (text, _score) in sorted {
        let remaining = budget_chars.saturating_sub(used);
        if remaining == 0 {
            truncated = true;
            break;
        }
        let take = text.chars().count().min(remaining);
        if take < text.chars().count() {
            truncated = true;
        }
        out.push_str(&text.chars().take(take).collect::<String>());
        out.push('\n');
        used += take + 1;
    }
    (out, truncated)
}

/// 诚实提示文案（截断/降级时注入——绝不静默；前端展示用）。
pub fn honest_truncation_note(truncated: bool) -> &'static str {
    if truncated {
        "⚠️ 上下文超限，已按相关性精简（成本与库规模解耦，不影响结论）"
    } else {
        ""
    }
}

#[cfg(test)]
#[path = "budget_allocator_tests.rs"]
mod tests;
