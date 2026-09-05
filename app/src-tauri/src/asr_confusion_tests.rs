//! ASR 混淆画像闭环纯逻辑单测（v0.20.2 / REQ-269，AAA）。
//!
//! @ai-context: 验收门槛「画像闭环单测（共现才替换、确认制）」：候选门槛、
//!              确认进入规则、忽略去候选、共现门、JSON 往返全覆盖。

use super::*;

// ── word_pairs（词级对提取）──

#[test]
fn word_pairs_extracts_homophone_substitution() {
    // 旧文"毕需掌握" → 新文"必须掌握"：单错词对（毕需, 必须）
    let pairs = word_pairs("毕需掌握", "必须掌握");
    assert!(pairs.contains(&("毕需".to_string(), "必须".to_string())), "{pairs:?}");
}

#[test]
fn word_pairs_single_char_homophone_emitted() {
    // 同音词仅首字不同（概念/该念 型）：单字替换对入候选——确认制+共现守卫把关
    let pairs = word_pairs("基本该念", "基本概念");
    assert!(pairs.contains(&("该".to_string(), "概".to_string())), "{pairs:?}");
    // 完全一致无对
    assert!(word_pairs("今天讲熵减", "今天讲熵减").is_empty());
}

#[test]
fn word_pairs_multiple_terms() {
    let pairs = word_pairs("毕需掌握基本该念", "必须掌握基本概念");
    assert!(pairs.contains(&("毕需".to_string(), "必须".to_string())));
    assert!(pairs.contains(&("该".to_string(), "概".to_string())), "{pairs:?}");
}

#[test]
fn word_pairs_identical_no_pairs() {
    assert!(word_pairs("今天讲熵减", "今天讲熵减").is_empty());
}

#[test]
fn word_pairs_overlong_safe() {
    let long_a = "字".repeat(3000);
    let long_b = "词".repeat(3000);
    assert!(word_pairs(&long_a, &long_b).is_empty(), "超长护栏");
}

// ── record_adoption / candidates（采集与门槛）──

#[test]
fn record_aggregates_and_candidate_threshold() {
    // Arrange
    let mut store = AsrConfusionStore::default();
    // Act：同对两次采纳 → count 2（达门槛）；单次噪声不入候选
    store.record_adoption("毕需掌握", "必须掌握");
    store.record_adoption("毕需掌握基本该念", "必须掌握基本概念");
    store.record_adoption("随机噪词句子", "另一写法句子");
    // Assert
    let cands = store.candidates(10);
    assert_eq!(cands.len(), 1, "仅达门槛的候选");
    assert_eq!(cands[0].wrong, "毕需");
    assert_eq!(cands[0].right, "必须");
    assert_eq!(cands[0].count, 2);
}

// ── confirm / dismiss（确认制）──

#[test]
fn confirm_moves_pair_to_rules_and_hides_candidate() {
    let mut store = AsrConfusionStore::default();
    store.record_adoption("毕需掌握", "必须掌握");
    store.record_adoption("毕需掌握", "必须掌握");
    // Act：确认
    assert!(store.confirm("毕需", "必须"));
    // Assert：规则生效、候选消失、重复确认覆盖
    assert_eq!(store.rules.len(), 1);
    assert!(store.candidates(10).is_empty());
    store.confirm("毕需", "必需");
    assert_eq!(store.rules[0].to, "必需", "重复 from 覆盖=现场校准优先");
}

#[test]
fn confirm_guards_empty_and_equal() {
    let mut store = AsrConfusionStore::default();
    assert!(!store.confirm("", "必须"));
    assert!(!store.confirm("毕需", ""));
    assert!(!store.confirm("同词", "同词"));
}

#[test]
fn dismiss_hides_candidate_keeps_history() {
    let mut store = AsrConfusionStore::default();
    store.record_adoption("毕需掌握", "必须掌握");
    store.record_adoption("毕需掌握", "必须掌握");
    // Act
    store.dismiss("毕需", "必须");
    // Assert
    assert!(store.candidates(10).is_empty());
    assert!(store.rules.is_empty());
}

// ── apply_rules（共现才替换）──

#[test]
fn apply_requires_cooccurrence() {
    let rules = vec![AsrRule { from: "毕需".into(), to: "必须".into() }];
    // 语料无"必须"→ 不猜（可能是特有词形）
    let no_corpus = apply_rules("毕需很重要", "全篇无此词", &rules);
    assert_eq!(no_corpus, "毕需很重要");
    // 语料有"必须"→ 替换
    let with_corpus = apply_rules("毕需很重要", "必须与毕需同现", &rules);
    assert_eq!(with_corpus, "必须很重要");
}

#[test]
fn apply_longest_first_and_empty_safe() {
    let rules = vec![
        AsrRule { from: "毕需掌握".into(), to: "必须掌握".into() },
        AsrRule { from: "毕需".into(), to: "必须".into() },
    ];
    let corpus = "必须掌握已经讲过了";
    let out = apply_rules("毕需掌握与毕需", corpus, &rules);
    // 长词先替换；剩余短词仍可命中（链式顺序语义，与 vocab 同哲学）
    assert_eq!(out, "必须掌握与必须");
    assert_eq!(apply_rules("内容", corpus, &[]), "内容");
    assert_eq!(apply_rules("", corpus, &rules), "");
}

// ── JSON 持久化 ──

#[test]
fn save_load_roundtrip_and_missing_is_default() {
    let dir = std::env::temp_dir().join(format!("entropy-asr-confusion-{}", std::process::id()));
    let path = dir.join("asr_confusion.json");
    let mut store = AsrConfusionStore::default();
    store.record_adoption("毕需掌握", "必须掌握");
    store.record_adoption("毕需掌握", "必须掌握");
    store.confirm("毕需", "必须");
    store.save(&path).unwrap();
    let loaded = AsrConfusionStore::load(&path);
    assert_eq!(loaded.rules, store.rules);
    assert_eq!(loaded.dismissed, store.dismissed);
    let missing = AsrConfusionStore::load(std::path::Path::new("C:/nonexistent/x.json"));
    assert_eq!(missing, AsrConfusionStore::default());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn remove_rule_works() {
    let mut store = AsrConfusionStore::default();
    store.confirm("毕需", "必须");
    assert!(store.remove_rule("毕需"));
    assert!(store.rules.is_empty());
    assert!(!store.remove_rule("不存在"));
}
