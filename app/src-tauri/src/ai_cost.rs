//! AI 成本估算（REQ-143 基础版 + 2026-08-21 F1 成本失真修复）。
//!
//! @ai-context: 精修/补充触发前按字符数估算 token → 费用=token×单价 →
//!              确认弹窗（首次必显 + 内联余额 + "记住此选择"偏好持久化在
//!              ai_settings.remember_cost_choice）。
//! @ai-context: F1 修复（2026-08-21）：① 单价映射表——按模型取单价
//!              （内置免费档 ¥0 + 常见质量档实测价；未知模型回退 ¥0 并警告，
//!              消灭"切付费模型仍显示 ¥0"的成本失真）；② 预估含输出 token
//!              （输出=输入×输出比系数，保守上界——只算输入会把长精修
//!              费用低估 2-3 倍）；③ env SILICONFLOW_PRICE_PER_1M_TOKENS
//!              仍可整体覆盖（开发路径，AGENTS.md 环境隔离铁律）。
//! @ai-context: 估算为近似值：中文 1 字符 ≈ 1 token（保守上界，宁可高估
//!              不可低估——用户确认后不产生"费用超预期"）；预估与实际偏差
//!              记录校准单价表（M4 note_ai_usage 落库后比对）。

use std::collections::HashMap;

/// 默认单价（元/百万 token；免费档 0——2026-08 选型 R1-0528-Qwen3-8B ¥0/M）。
/// 保留兼容（测试断言 + 无模型回退语义），生产路径走 price_for_model。
#[allow(dead_code)] // 兼容 API：测试断言 + 未来单价表整体覆盖入口
pub const DEFAULT_PRICE_PER_1M: f64 = 0.0;
/// env 覆盖键（元/百万 token；整体覆盖映射表——开发路径）。
const PRICE_ENV_KEY: &str = "SILICONFLOW_PRICE_PER_1M_TOKENS";
/// 输出 token 估算系数（输入→输出比例；精修/补充是重写型任务，输出量
/// 接近输入量——1.0 保守上界；实测校准随 golden 冒烟）。
const OUTPUT_RATIO: f64 = 1.0;
/// 未知模型警告文案（确认弹窗展示——成本透明铁律；前端经 priceKnown
/// 字段自行渲染，本常量保留为文案单一来源备查）。
#[allow(dead_code)] // 文案单一来源（前端内联同文案；未来富化时消费）
const UNKNOWN_MODEL_WARN: &str = "（该模型单价未登记，费用可能不准确）";

/// 内置单价映射表（模型名 → 元/百万 token）。
///
/// @ai-context: 2026-08 实测档：免费档 ¥0（R1-0528-Qwen3-8B，MIT 商用）；
///              质量档价格按 v0.8.0 开放问题实测定档后更新（当前登记占位
///              实测值，待 golden 冒烟校准——见 docs/versions/v0.8.0.md
///              开放问题「模型选型」）。
fn builtin_prices() -> HashMap<&'static str, f64> {
    let mut m = HashMap::new();
    m.insert("deepseek-ai/DeepSeek-R1-0528-Qwen3-8B", 0.0);
    m.insert("deepseek-ai/DeepSeek-V3-0324", 2.0);
    m.insert("Qwen/Qwen3-235B-A22B", 2.0);
    // v0.12.0 M4（默认链 DeepSeek）：deepseek-v4-flash-vision-exp 分段价
    // （官方 2026-08：输入缓存未命中 1.5-3.0 元/百万 token，输出 4.5-9.0 元/百万）
    // ——取保守上界 9.0 登记（宁可高估不可低估，待 golden 冒烟实测校准后分段）。
    m.insert("deepseek-v4-flash-vision-exp", 9.0);
    m
}

/// 按模型取单价（元/百万 token）：env 整体覆盖 > 映射表 > 默认 0 + 警告。
///
/// @ai-context: 返回值 (单价, 是否已知模型)——未知模型单价 0 但标记警告，
///              前端确认弹窗展示"费用可能不准确"（不静默）。
pub fn price_for_model(model: &str) -> (f64, bool) {
    if let Ok(v) = std::env::var(PRICE_ENV_KEY) {
        if let Ok(p) = v.parse::<f64>() {
            if p.is_finite() && p >= 0.0 {
                return (p, true);
            }
        }
    }
    match builtin_prices().get(model) {
        Some(p) => (*p, true),
        None => (0.0, false),
    }
}

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
///
/// @ai-context: 保留向后兼容（旧调用方）；新代码走 price_for_model。
#[allow(dead_code)] // 兼容 API：usage_cost 沿用 + 测试断言
pub fn price_per_1m() -> f64 {
    price_for_model("").0
}

/// 成本预估（确认弹窗数据源：token + 费用 + 单价 + 未知模型警告）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostEstimate {
    pub est_tokens: usize,
    pub est_cost_yuan: f64,
    pub price_per_1m: f64,
    /// 该模型单价是否已登记（false → 前端显示"费用可能不准确"警告）
    pub price_known: bool,
}

/// 按内容字符数估算（纯函数；单价按模型映射）。
///
/// @ai-context: F1 修复：输出 token = 输入 × OUTPUT_RATIO（重写型任务
///              保守上界），总 token = 输入 + 输出；模型未知 → 单价 0 +
///              price_known=false（前端警告，不静默）。
pub fn estimate_for_content_model(chars: usize, model: &str) -> CostEstimate {
    let tokens = estimate_tokens(chars);
    let total = tokens.saturating_add((tokens as f64 * OUTPUT_RATIO) as usize);
    let (price, known) = price_for_model(model);
    CostEstimate {
        est_tokens: total,
        est_cost_yuan: estimate_cost(total, price),
        price_per_1m: price,
        price_known: known,
    }
}

/// 按内容字符数估算（兼容旧签名——免费档默认模型，未知模型警告保留）。
#[allow(dead_code)] // 兼容 API：测试 + 旧调用方（新代码走 _model 版）
pub fn estimate_for_content(chars: usize) -> CostEstimate {
    estimate_for_content_model(chars, "")
}

/// 成本记录费用（纯函数：输入+输出 token × 当前单价——与预估同口径，
/// M4 落库 note_ai_usage 用）。
#[allow(dead_code)] // 兼容 API：测试 + 旧调用方（新代码走 _model 版）
pub fn usage_cost(tokens_in: usize, tokens_out: usize) -> f64 {
    estimate_cost(tokens_in.saturating_add(tokens_out), price_per_1m())
}

/// 成本记录费用（模型感知——审查修复 2026-08-21：落库成本必须与预估同
/// 口径（模型映射单价），否则付费模型预估 ¥X 但落库记 ¥0，成本报表失真）。
pub fn usage_cost_for_model(tokens_in: usize, tokens_out: usize, model: &str) -> f64 {
    let (price, _) = price_for_model(model);
    estimate_cost(tokens_in.saturating_add(tokens_out), price)
}

/// 未知模型警告文案（确认弹窗拼接用）。
#[allow(dead_code)] // 文案单一来源（前端经 priceKnown 自行渲染同文案）
pub fn unknown_model_warning() -> &'static str {
    UNKNOWN_MODEL_WARN
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_cost_tests.rs"]
mod tests;
