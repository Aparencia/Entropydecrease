//! AI 成本估算（REQ-143 基础版，v0.8.0 M2）。
//!
//! @ai-context: 精修/补充触发前按字符数估算 token → 费用=token×单价 →
//!              确认弹窗（首次必显 + 内联余额 + "记住此选择"偏好持久化在
//!              ai_settings.remember_cost_choice）；单价表可配
//!              （env SILICONFLOW_PRICE_PER_1M_TOKENS 覆盖——环境隔离铁律）。
//! @ai-context: 估算为近似值：中文 1 字符 ≈ 1 token（保守上界，宁可高估
//!              不可低估——用户确认后不产生"费用超预期"）；预估与实际偏差
//!              记录校准单价表（M4 note_ai_usage 落库后比对）。

/// 默认单价（元/百万 token；免费档 0——2026-08 选型 R1-0528-Qwen3-8B ¥0/M）。
pub const DEFAULT_PRICE_PER_1M: f64 = 0.0;
/// env 覆盖键（元/百万 token）。
const PRICE_ENV_KEY: &str = "SILICONFLOW_PRICE_PER_1M_TOKENS";

/// token 估算（纯函数：字符数 × 1.0——中文 1 字符≈1 token 保守上界）。
pub fn estimate_tokens(chars: usize) -> usize {
    chars
}

/// 费用估算（纯函数：token × 单价 / 1M；免费档 → 0）。
pub fn estimate_cost(tokens: usize, price_per_1m: f64) -> f64 {
    let price = if price_per_1m.is_finite() && price_per_1m > 0.0 {
        price_per_1m
    } else {
        0.0
    };
    tokens as f64 * price / 1_000_000.0
}

/// 单价解析（env 覆盖；缺省/非法 → 默认 0——免费档兜底）。
pub fn price_per_1m() -> f64 {
    std::env::var(PRICE_ENV_KEY)
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|p| p.is_finite() && *p >= 0.0)
        .unwrap_or(DEFAULT_PRICE_PER_1M)
}

/// 成本预估（确认弹窗数据源：token + 费用 + 单价）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostEstimate {
    pub est_tokens: usize,
    pub est_cost_yuan: f64,
    pub price_per_1m: f64,
}

/// 按内容字符数估算（纯函数；单价取当前 env/默认）。
pub fn estimate_for_content(chars: usize) -> CostEstimate {
    let tokens = estimate_tokens(chars);
    let price = price_per_1m();
    CostEstimate {
        est_tokens: tokens,
        est_cost_yuan: estimate_cost(tokens, price),
        price_per_1m: price,
    }
}

/// 成本记录费用（纯函数：输入+输出 token × 当前单价——与预估同口径，
/// M4 落库 note_ai_usage 用）。
pub fn usage_cost(tokens_in: usize, tokens_out: usize) -> f64 {
    estimate_cost(tokens_in.saturating_add(tokens_out), price_per_1m())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_cost_tests.rs"]
mod tests;
