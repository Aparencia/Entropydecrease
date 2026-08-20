//! ai_cost.rs 单测（AAA 模式；单价 env 读取为宿主环境——测试隔离保存/还原）。
//! @ai-context: 两个测试读写同一 env 变量——并行会竞态，用模块级互斥串行化。

use std::sync::Mutex;

use crate::ai_cost::{estimate_cost, estimate_for_content, estimate_tokens, price_per_1m, DEFAULT_PRICE_PER_1M};

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
        assert_eq!(est.est_tokens, 5000);
        assert!((est.est_cost_yuan - 0.05).abs() < 1e-9);
        assert_eq!(est.price_per_1m, 10.0);
    });
}
