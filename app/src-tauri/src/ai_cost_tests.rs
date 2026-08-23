//! ai_cost.rs 单测（AAA 模式；单价 env 读取为宿主环境——测试隔离保存/还原）。
//! @ai-context: 两个测试读写同一 env 变量——并行会竞态，用模块级互斥串行化。

use std::sync::Mutex;

use crate::ai_cost::{
    estimate_cost, estimate_for_content, estimate_for_content_model, estimate_tokens,
    price_for_model, price_per_1m, usage_cost_for_model, DEFAULT_PRICE_PER_1M,
};

/// env 操作互斥（防并行测试互相覆盖 SILICONFLOW_PRICE_PER_1M_TOKENS）。
static ENV_LOCK: Mutex<()> = Mutex::new(());

/// 在锁内执行 env 敏感操作（保存/还原宿主环境）。
fn with_env_locked(f: impl FnOnce()) {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let saved = std::env::var("SILICONFLOW_PRICE_PER_1M_TOKENS").ok();
    f();
    match saved {
        Some(v) => std::env::set_var("SILICONFLOW_PRICE_PER_1M_TOKENS", v),
        None => std::env::remove_var("SILICONFLOW_PRICE_PER_1M_TOKENS"),
    }
}

#[test]
fn token_estimate_is_char_count() {
    // 中文 1 字符 ≈ 1 token（保守上界）
    assert_eq!(estimate_tokens(0), 0);
    assert_eq!(estimate_tokens(100), 100);
    assert_eq!(estimate_tokens(8000), 8000);
}

#[test]
fn cost_zero_when_free_tier_or_bad_price() {
    // 免费档 / 非法单价（负数/NaN/inf）→ 0 费用（不产生负成本）
    assert_eq!(estimate_cost(1000, 0.0), 0.0);
    assert_eq!(estimate_cost(1000, -5.0), 0.0);
    assert_eq!(estimate_cost(1000, f64::NAN), 0.0);
    assert_eq!(estimate_cost(1000, f64::INFINITY), 0.0);
}

#[test]
fn cost_scales_with_tokens_and_price() {
    // 1M token @ ¥10 → 每 1000 token = ¥0.01
    let cost = estimate_cost(1000, 10.0);
    assert!((cost - 0.01).abs() < 1e-9, "实得 {}", cost);
    let cost2 = estimate_cost(500_000, 10.0);
    assert!((cost2 - 5.0).abs() < 1e-9);
}

#[test]
fn price_default_free_tier() {
    // 缺省单价 = 免费档 0（当前默认模型免费）
    assert_eq!(DEFAULT_PRICE_PER_1M, 0.0);
    with_env_locked(|| {
        // env 未设置时 price_per_1m 回退默认
        std::env::remove_var("SILICONFLOW_PRICE_PER_1M_TOKENS");
        assert_eq!(price_per_1m(), 0.0);
        // 非法值回退默认
        std::env::set_var("SILICONFLOW_PRICE_PER_1M_TOKENS", "abc");
        assert_eq!(price_per_1m(), 0.0);
        // 合法覆盖生效
        std::env::set_var("SILICONFLOW_PRICE_PER_1M_TOKENS", "12.5");
        assert!((price_per_1m() - 12.5).abs() < 1e-9);
    });
}

#[test]
fn estimate_for_content_composes() {
    with_env_locked(|| {
        std::env::set_var("SILICONFLOW_PRICE_PER_1M_TOKENS", "10");
        let est = estimate_for_content(5000);
        // F1 修复：预估含输出 token（输入 ×2，重写型任务保守上界）
        assert_eq!(est.est_tokens, 10_000);
        assert!((est.est_cost_yuan - 0.1).abs() < 1e-9);
        assert_eq!(est.price_per_1m, 10.0);
        assert!(est.price_known);
    });
}

/// F1 修复（2026-08-21）：模型→单价映射表——已知模型按表取价、未知模型
/// 回退 0 + price_known=false（前端显示"费用可能不准确"警告，不静默）。
#[test]
fn price_model_mapping_known_and_unknown() {
    with_env_locked(|| {
        std::env::remove_var("SILICONFLOW_PRICE_PER_1M_TOKENS");
        // 已知免费档模型 → 单价 0 且已知
        let (p, known) = price_for_model("deepseek-ai/DeepSeek-R1-0528-Qwen3-8B");
        assert_eq!(p, 0.0);
        assert!(known);
        // 未知模型 → 单价 0 + 未知标记
        let (p2, known2) = price_for_model("unknown/model");
        assert_eq!(p2, 0.0);
        assert!(!known2);
        // env 整体覆盖优先于映射表（开发路径）
        std::env::set_var("SILICONFLOW_PRICE_PER_1M_TOKENS", "3.5");
        let (p3, known3) = price_for_model("unknown/model");
        assert!((p3 - 3.5).abs() < 1e-9);
        assert!(known3);
    });
}

/// v0.12.0 M4（默认链 DeepSeek）：vision 模型单价登记（保守上界 9.0——官方
/// 分段价输入 1.5-3.0 / 输出 4.5-9.0 元/百万 token，取上界宁可高估）。
#[test]
fn deepseek_vision_model_price_registered() {
    with_env_locked(|| {
        std::env::remove_var("SILICONFLOW_PRICE_PER_1M_TOKENS");
        let (p, known) = price_for_model("deepseek-v4-flash-vision-exp");
        assert_eq!(p, 9.0);
        assert!(known, "vision 模型单价已登记——必须无未知警告");
        let est = estimate_for_content_model(1000, "deepseek-v4-flash-vision-exp");
        assert!(est.price_known);
        // 估算含输出 token（输入 ×2），1000→2000 token × ¥9/1M = ¥0.018
        assert!((est.est_cost_yuan - 0.018).abs() < 1e-9, "实得 {}", est.est_cost_yuan);
    });
}

/// F1 修复：按模型估算——已知免费档 ¥0、未知模型带警告标记。
#[test]
fn estimate_for_content_model_respects_mapping() {
    with_env_locked(|| {
        std::env::remove_var("SILICONFLOW_PRICE_PER_1M_TOKENS");
        let free = estimate_for_content_model(1000, "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B");
        assert!(free.price_known);
        assert_eq!(free.est_cost_yuan, 0.0);
        let unknown = estimate_for_content_model(1000, "some/model");
        assert!(!unknown.price_known, "未知模型必须标记警告");
        assert_eq!(unknown.est_cost_yuan, 0.0);
    });
}

/// 审查修复（2026-08-21）：落库成本按模型感知单价（与预估同口径——
/// 免费档 ¥0；未知模型 ¥0；env 覆盖生效）。
#[test]
fn usage_cost_for_model_uses_model_price() {
    with_env_locked(|| {
        std::env::remove_var("SILICONFLOW_PRICE_PER_1M_TOKENS");
        // 免费档模型 → 0
        assert_eq!(usage_cost_for_model(1000, 500, "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"), 0.0);
        // 未知模型 → 0（单价未登记，保守不记成本）
        assert_eq!(usage_cost_for_model(1000, 500, "unknown/model"), 0.0);
        // env 覆盖整体生效（开发路径）
        std::env::set_var("SILICONFLOW_PRICE_PER_1M_TOKENS", "10");
        let cost = usage_cost_for_model(1000, 500, "unknown/model");
        assert!((cost - 0.015).abs() < 1e-9, "1500 token × ¥10/1M = ¥0.015，实得 {}", cost);
    });
}
