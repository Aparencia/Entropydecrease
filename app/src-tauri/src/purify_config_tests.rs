//! 净化阈值配置单测（REQ-173 / v0.7.5）。
//!
//! @ai-context: AAA 模式；覆盖内置默认口径（120字/60s/0.7/0.6）、partial JSON
//!              覆盖语义、损坏回退。

use super::*;

#[test]
fn defaults_match_v075_ruling() {
    // Act
    let cfg = PurifyConfig::default();
    // Assert：v0.7.5 裁决口径（REQ-173 集中常量）
    assert_eq!(cfg.paragraph_max_chars, 120);
    assert_eq!(cfg.paragraph_max_span_ms, 60_000);
    assert_eq!(cfg.low_confidence_threshold, 0.6);
    assert_eq!(cfg.fragment_max_chars, 2);
    assert_eq!(cfg.fragment_min_duration_ms, 500);
    assert_eq!(cfg.filler_max_chars, 8);
    // REQ-167：MIN_BLOCK_SCORE 0.5→0.7 校准
    assert_eq!(cfg.min_block_score, 0.7);
    // REQ-165：锚点默认开
    assert!(cfg.anchor_timestamps);
    // 净化链默认全开（REQ-162~168 + 过渡/问句扩展）
    assert!(cfg.verbal_normalize && cfg.symbol_normalize && cfg.stutter_fold && cfg.filler_delete);
    assert!(cfg.ocr_correct && cfg.single_char_drop);
    assert!(cfg.transition_delete && cfg.rhetorical_delete);
    assert_eq!(cfg.transition_max_chars, 8);
    assert_eq!(cfg.rhetorical_max_chars, 15);
}

#[test]
fn partial_json_overrides_only_given_fields() {
    // Arrange：只覆盖两个字段（partial 覆盖语义——缺失字段 = 内置默认）
    let cfg = PurifyConfig::from_json(r#"{"minBlockScore": 0.8, "anchorTimestamps": false}"#).expect("parse");
    // Assert：覆盖生效；其余保持默认
    assert_eq!(cfg.min_block_score, 0.8);
    assert!(!cfg.anchor_timestamps);
    assert_eq!(cfg.paragraph_max_chars, 120);
    assert_eq!(cfg.low_confidence_threshold, 0.6);
}

#[test]
fn invalid_json_errors() {
    // Act & Assert：损坏 JSON → Err（调用方 load 已兜底默认）
    assert!(PurifyConfig::from_json("{not json").is_err());
}

#[test]
fn load_missing_file_falls_back_to_defaults() {
    // Act
    let cfg = PurifyConfig::load(std::path::Path::new("C:/nonexistent/purify_config.json"));
    // Assert：内置默认兜底
    assert_eq!(cfg, PurifyConfig::default());
}
