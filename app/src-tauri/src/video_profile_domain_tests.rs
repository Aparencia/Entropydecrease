//! 领域标签体系测试（REQ-190 / v0.9.0 M3）。
//!
//! @ai-context: AAA 模式；覆盖四来源检测优先级（平台>用户>标题>术语）、
//!              细标签开放、hotwords 候选/术语筛选/区域预期接线。

use super::*;
use crate::video_profile_domain::{detect_domain, DomainKind, DomainSignals};
use crate::video_profile_domain_data as data;

#[test]
fn domain_parse_and_label_roundtrip() {
    // Arrange/Act/Assert：15 领域 kebab-case 解析 + 展示名非空
    for k in ALL_DOMAINS {
        assert_eq!(DomainKind::parse(k.as_str()), Some(k), "{:?} roundtrip", k);
        assert!(!k.label().is_empty(), "{:?} 展示名非空", k);
    }
    assert_eq!(DomainKind::parse("no-such-domain"), None);
    assert_eq!(DomainKind::parse(""), None);
    // 种子词表非空（每个领域都有词可匹配）
    for k in ALL_DOMAINS {
        assert!(!data::seed_words(k).is_empty(), "{:?} 种子词表非空", k);
    }
}

// ── 四来源检测（优先级：平台 > 用户 > 标题 > 术语）──

#[test]
fn platform_tag_wins_over_title() {
    // Arrange：B站分区标签（会话 33 实证：`知识科普|经济管理`）+ 无领域词标题
    let s = DomainSignals {
        title: Some("你长大了，该了解公积金了".into()),
        platform_tags: vec!["经济管理".into()],
        user_confirmed: None,
        term_freq: Vec::new(),
        asr_opening: None,
    };
    // Act
    let d = detect_domain(&s);
    // Assert：平台命中经济管理（强信号最高优先级）+ 细标签保留原文
    assert_eq!(d.kind, Some(DomainKind::Economy));
    assert_eq!(d.source, "platform");
    assert_eq!(d.fine_tags, vec!["经济管理"]);
    assert!((d.confidence - 1.0).abs() < 1e-6);
}

#[test]
fn user_confirmed_beats_title() {
    // Arrange：标题含编程词（弱信号）+ 用户已确认化妆（显式裁决）
    let s = DomainSignals {
        title: Some("Python 实战教程".into()),
        platform_tags: Vec::new(),
        user_confirmed: Some(DomainKind::Beauty),
        term_freq: Vec::new(),
        asr_opening: None,
    };
    // Act/Assert：用户确认优先（来源③高于标题②）
    let d = detect_domain(&s);
    assert_eq!(d.kind, Some(DomainKind::Beauty));
    assert_eq!(d.source, "user");
}

#[test]
fn title_domain_word_detected() {
    // Arrange：标题含"公积金"（经济领域种子词）
    let s = DomainSignals {
        title: Some("公积金贷款攻略".into()),
        platform_tags: Vec::new(),
        user_confirmed: None,
        term_freq: Vec::new(),
        asr_opening: None,
    };
    // Act
    let d = detect_domain(&s);
    // Assert：标题词命中经济管理
    assert_eq!(d.kind, Some(DomainKind::Economy));
    assert_eq!(d.source, "title");
}

#[test]
fn term_frequency_backfills_domain() {
    // Arrange：会话中术语频率（无平台/标题/用户信号——标题无领域词）
    let s = DomainSignals {
        title: Some("小马的故事".into()),
        platform_tags: Vec::new(),
        user_confirmed: None,
        term_freq: vec!["公积金".into(), "贷款".into(), "利息".into()],
        asr_opening: None,
    };
    // Act
    let d = detect_domain(&s);
    // Assert：术语频率补全经济管理（来源④）
    assert_eq!(d.kind, Some(DomainKind::Economy));
    assert_eq!(d.source, "term");
    // 细标签：仅保留命中种子词的术语（"利息"非种子词——不枚举也开放）
    assert!(d.fine_tags.iter().any(|t| t == "公积金"), "命中种子词的术语进细标签");
}

#[test]
fn no_signal_returns_empty_domain() {
    // Arrange：全无信号
    let s = DomainSignals::default();
    // Act
    let d = detect_domain(&s);
    // Assert：空领域不阻塞（None + source=none + 零置信）
    assert_eq!(d.kind, None);
    assert_eq!(d.source, "none");
    assert!((d.confidence - 0.0).abs() < 1e-6);
}

#[test]
fn fine_tags_open_platform_raw_text() {
    // Arrange：平台标签原文（细标签开放——"公积金"不必枚举）
    let s = DomainSignals {
        title: Some("科普".into()),
        platform_tags: vec!["知识科普".into()],
        user_confirmed: None,
        term_freq: Vec::new(),
        asr_opening: None,
    };
    // Act：知识科普 无领域种子词直接命中 → 平台标签不进领域（诚实不猜）
    let d = detect_domain(&s);
    // Assert：无领域命中（科普不属于 15 领域之一）——空领域不阻塞；
    // 细标签不携带（平台标签仅当命中领域时作为证据）
    assert_eq!(d.kind, None);
    assert_eq!(d.source, "none");
}

// ── 消费接线（hotwords/术语筛选/区域预期）──

#[test]
fn hotword_candidates_cover_seed_words() {
    // Arrange/Act：经济领域热词候选
    let cands = hotword_candidates(DomainKind::Economy);
    // Assert：含公积金/贷款（会话 33 术语预热——ASR 命中率↑）
    assert!(cands.iter().any(|w| w == "公积金"));
    assert!(cands.iter().any(|w| w == "贷款"));
}

#[test]
fn glossary_filter_keeps_domain_terms() {
    // Arrange：混合候选术语
    let candidates = vec!["公积金".to_string(), "函数".to_string(), "一般".to_string()];
    // Act：经济领域筛选
    let kept = filter_glossary(DomainKind::Economy, &candidates);
    // Assert：仅保留命中领域词表的术语
    assert!(kept.contains(&"公积金".to_string()));
    assert!(!kept.contains(&"函数".to_string()), "跨领域术语被筛除");
    assert!(!kept.contains(&"一般".to_string()), "非术语被筛除");
}

#[test]
fn region_expectation_follows_domain() {
    // Arrange/Act/Assert：数学→公式区、代码→code 区、设计→图片区、其余无预期
    assert_eq!(
        DomainKind::MathScience.expected_region(),
        Some(crate::layout_analyzer::RegionKind::Formula)
    );
    assert_eq!(
        DomainKind::Programming.expected_region(),
        Some(crate::layout_analyzer::RegionKind::Code)
    );
    assert_eq!(
        DomainKind::Design.expected_region(),
        Some(crate::layout_analyzer::RegionKind::Image)
    );
    assert_eq!(DomainKind::Economy.expected_region(), None);
    assert_eq!(DomainKind::Music.expected_region(), None);
}

// ── ASR 开场白信号（v0.11.5 Task 7：全平台通用增强）──

#[test]
fn asr_opening_intro_detects_domain() {
    // Arrange：开场白自我介绍（口语含领域自称/主题词）+ 无领域词标题
    let signals = DomainSignals {
        title: Some("零基础教程".to_string()),
        platform_tags: vec![],
        user_confirmed: None,
        term_freq: vec![],
        asr_opening: Some("大家好我是美妆博主，今天教大家画眼影".to_string()),
    };
    // Act
    let d = detect_domain(&signals);
    // Assert：开场白命中美妆领域（"美妆"/"眼影"均为 Beauty 种子词）
    assert_eq!(d.kind, Some(DomainKind::Beauty));
    assert_eq!(d.source, "asr");
}

#[test]
fn asr_opening_none_no_regression() {
    // Arrange：无开场白（Task 6 现状输入——标题命中领域词）
    let s = DomainSignals {
        title: Some("公积金贷款攻略".into()),
        platform_tags: Vec::new(),
        user_confirmed: None,
        term_freq: Vec::new(),
        asr_opening: None,
    };
    // Act
    let d = detect_domain(&s);
    // Assert：与"无 asr_opening 的旧行为"一致（标题通道 economy/source=title）
    assert_eq!(d.kind, Some(DomainKind::Economy));
    assert_eq!(d.source, "title");
}

#[test]
fn domain_json_roundtrip() {
    // Arrange
    let d = DomainDetection {
        kind: Some(DomainKind::Economy),
        fine_tags: vec!["公积金".into()],
        source: "platform".into(),
        confidence: 1.0,
    };
    // Act：JSON roundtrip（检测卡 v2 / 会话落库传输）
    let raw = serde_json::to_string(&d).unwrap();
    let back: DomainDetection = serde_json::from_str(&raw).unwrap();
    // Assert：字段无损
    assert_eq!(back, d);
}
