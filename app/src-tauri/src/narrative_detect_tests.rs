//! 叙事结构检测测试（REQ-193 / v0.9.0 M5）。
//!
//! @ai-context: AAA 模式；覆盖会话 33 故事化科普（小马故事）检测、
//!              直接教学零回归（现有模板路径不变）、叙事线+要点提取。

use super::*;

/// 会话 33 实证样本（简化）：小马买房故事化科普转写段。
fn session33_like_segments() -> Vec<String> {
    vec![
        "小马工作几年存了一点钱".to_string(),
        "有一天，小马想买房了".to_string(),
        "后来小马了解到公积金贷款利息低".to_string(),
        "1、公积金贷款利息低".to_string(),
        "2、其他情况可以取出".to_string(),
        "于是小马决定用公积金贷款".to_string(),
    ]
}

#[test]
fn storytelling_detected_for_session33() {
    // Arrange：会话 33 类故事化科普（角色小马 + 转折词 3 个）
    let s = NarrativeSignals {
        segments: session33_like_segments(),
        ocr_texts: vec!["要点：公积金贷款".to_string()],
    };
    // Act
    let d = detect_narrative(&s);
    // Assert：故事化风格 + 叙事线保留故事主线 + 要点提取
    assert_eq!(d.style, NarrativeStyle::Storytelling);
    assert!(d.score > 0.0, "故事化得分非零");
    assert!(d.narrative_line.iter().any(|t| t.contains("小马")), "叙事线含角色段");
    assert!(d.key_points.iter().any(|t| t.contains("1、公积金贷款利息低")), "要点提取命中编号段");
    assert!(d.key_points.iter().any(|t| t.contains("要点：公积金贷款")), "要点卡 OCR 入要点");
}

#[test]
fn direct_teaching_zero_regression() {
    // Arrange：直接教学（无角色/转折词——现有模板路径）
    let s = NarrativeSignals {
        segments: vec![
            "微积分的核心概念是极限".to_string(),
            "极限的定义如下".to_string(),
            "连续函数满足三个条件".to_string(),
        ],
        ocr_texts: vec!["板书：极限定义".to_string()],
    };
    // Act
    let d = detect_narrative(&s);
    // Assert：直接教学（零回归——现有讲义模板路径不变）
    assert_eq!(d.style, NarrativeStyle::DirectTeaching);
    assert!(d.narrative_line.is_empty(), "直接教学不产叙事线");
    assert!(d.key_points.is_empty(), "无要点特征不产要点");
}

#[test]
fn single_turn_word_not_storytelling() {
    // Arrange：日常口语仅 1 个转折词（无角色——不构成故事化证据）
    let s = NarrativeSignals {
        segments: vec!["这个公式的结果很重要".to_string()],
        ocr_texts: Vec::new(),
    };
    // Act
    let d = detect_narrative(&s);
    // Assert：转折词 1 次（<2）且无角色 → 直接教学（防误判——日常口语也带"结果"）
    assert_eq!(d.style, NarrativeStyle::DirectTeaching);
}

#[test]
fn single_role_mention_not_storytelling() {
    // Arrange：仅角色名 1 次（无转折词——不构成故事化证据）
    let s = NarrativeSignals {
        segments: vec!["小马说这个知识点很重要".to_string()],
        ocr_texts: Vec::new(),
    };
    // Act
    let d = detect_narrative(&s);
    // Assert：角色 1 + 转折 0 → 直接教学（单特征不误判）
    assert_eq!(d.style, NarrativeStyle::DirectTeaching);
}

#[test]
fn empty_signals_zero_regression() {
    // Arrange：空信号
    let s = NarrativeSignals::default();
    // Act
    let d = detect_narrative(&s);
    // Assert：直接教学（零回归）+ 零得分 + 空产物
    assert_eq!(d.style, NarrativeStyle::DirectTeaching);
    assert!((d.score - 0.0).abs() < 1e-6);
    assert!(d.narrative_line.is_empty());
    assert!(d.key_points.is_empty());
}

#[test]
fn narrative_json_roundtrip() {
    // Arrange
    let d = NarrativeDetection {
        style: NarrativeStyle::Storytelling,
        score: 0.8,
        narrative_line: vec!["小马想买房了".into()],
        key_points: vec!["1、公积金贷款利息低".into()],
    };
    // Act：JSON roundtrip（产物层消费传输）
    let raw = serde_json::to_string(&d).unwrap();
    let back: NarrativeDetection = serde_json::from_str(&raw).unwrap();
    // Assert：字段无损
    assert_eq!(back, d);
}

#[test]
fn template_variant_label_follows_style() {
    // Arrange/Act/Assert：模板变体标记（build_artifact 分发用）
    assert_eq!(template_variant(NarrativeStyle::DirectTeaching), "direct-teaching");
    assert_eq!(template_variant(NarrativeStyle::Storytelling), "storyline+key-points");
}

#[test]
fn dedup_preserves_order_and_first() {
    // Arrange：重复项（OCR 多帧同卡）
    let items = vec!["a".to_string(), "b".to_string(), "a".to_string(), "c".to_string()];
    // Act
    let out = dedup_preserve(&items);
    // Assert：去重保序（保留首次出现）
    assert_eq!(out, vec!["a".to_string(), "b".to_string(), "c".to_string()]);
}
