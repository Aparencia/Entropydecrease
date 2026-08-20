//! ai_balance.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：完整响应解析、字段缺失容错（分项缺失/非法 → 0）、
//!              currency 缺失默认 CNY、非 JSON 报错、低余额提醒边界
//!              （等于阈值不提醒/低于阈值提醒/负余额提醒）。

use crate::ai_balance::{low_balance_warning, parse_balance, AiBalance};

#[test]
fn parse_full_response() {
    // 2026-08-21 接口修复：/v1/user/info → data.totalBalance/chargeBalance/balance（字符串数值）
    let raw = r#"{"code":20000,"message":"Ok","status":true,"data":{"id":"u1","balance":"10","chargeBalance":"2.34","totalBalance":"12.34"}}"#;
    let b = parse_balance(raw).expect("合法响应");
    assert_eq!(
        b,
        AiBalance {
            total_balance: 12.34,
            grants_balance: 10.0,
            topped_up_balance: 2.34,
            currency: "CNY".to_string(),
        }
    );
}

#[test]
fn parse_missing_fields_default_zero() {
    // 字段缺失容错：分项缺失/非法 → 0（账户类型差异不整单丢弃）
    let raw = r#"{"code":20000,"data":{"totalBalance":"5"}}"#;
    let b = parse_balance(raw).expect("缺失字段容错解析");
    assert_eq!(b.total_balance, 5.0);
    assert_eq!(b.grants_balance, 0.0);
    assert_eq!(b.topped_up_balance, 0.0);
    assert_eq!(b.currency, "CNY");
}

#[test]
fn parse_invalid_number_treated_as_zero() {
    // 非法数值（字符串"abc"）→ 0，不 panic
    let raw = r#"{"code":20000,"data":{"totalBalance":"abc","balance":"1"}}"#;
    let b = parse_balance(raw).expect("非法数值容错");
    assert_eq!(b.total_balance, 0.0);
    assert_eq!(b.grants_balance, 1.0);
}

#[test]
fn parse_non_json_is_error() {
    // 整体非 JSON / 缺 data 对象 → Err（无法尽力而为）
    assert!(parse_balance("not json").is_err());
    assert!(parse_balance(r#"[1,2,3]"#).is_err());
    assert!(parse_balance(r#"{"code":20000}"#).is_err(), "缺 data 对象必须报错");
}

#[test]
fn low_balance_boundary() {
    let mk = |total: f64| AiBalance {
        total_balance: total,
        grants_balance: 0.0,
        topped_up_balance: 0.0,
        currency: "CNY".to_string(),
    };
    // 等于阈值 → 不提醒（阈值语义：< 才提醒）
    assert_eq!(low_balance_warning(&mk(1.0), 1.0), None);
    // 低于阈值 → 提醒
    assert!(low_balance_warning(&mk(0.99), 1.0).is_some());
    // 负余额（透支）→ 提醒
    assert!(low_balance_warning(&mk(-3.0), 1.0).is_some());
    // 充足 → 不提醒
    assert_eq!(low_balance_warning(&mk(50.0), 1.0), None);
}
