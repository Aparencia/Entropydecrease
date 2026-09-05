//! ai_proofread 纯逻辑单测（v0.20.2 / REQ-270，AAA）。

use super::*;

#[test]
fn split_respects_punctuation_and_band() {
    let s = "大家好。今天讲熵减，非常重要！这是测试";
    let out = split_sentences(s);
    assert_eq!(out, vec!["大家好。", "今天讲熵减，非常重要！", "这是测试"]);
    // 短噪声（语气词）与超长（无标点硬切）由长度带处理
    assert!(split_sentences("呃。").is_empty(), "过短丢弃");
}

#[test]
fn split_hard_cuts_overlong_no_punct() {
    let long = "长".repeat(300);
    let out = split_sentences(&long);
    assert!(out.len() >= 2, "无标点长文按护栏硬切");
    assert!(out.iter().all(|s| s.chars().count() <= SENTENCE_MAX_CHARS + 1));
}

#[test]
fn chunk_respects_limits() {
    let sentences: Vec<String> = (0..100).map(|i| format!("句子{}。", i)).collect();
    let chunks = chunk_sentences(&sentences);
    assert!(chunks.iter().all(|c| c.len() <= MAX_SENTENCES_PER_CHUNK));
    let flat: Vec<usize> = chunks.iter().flatten().copied().collect();
    assert_eq!(flat, (0..100).collect::<Vec<_>>(), "无遗漏无重复");
}

#[test]
fn parse_accepts_container_and_validates() {
    // 候选 = 会话实际句子（含错词原句——模型必须原样回带）
    let expected = vec!["毕需掌握。".to_string(), "第二句内容。".to_string()];
    let raw = r#"{"suggestions":[{"original":"毕需掌握。","suggestion":"必须掌握。","reason":"同音错"},
        {"original":"幻觉句","suggestion":"乱改","reason":"无"}]}"#;
    let out = parse_suggestions(raw, &expected);
    assert_eq!(out.len(), 1, "幻觉 original 不匹配候选 → 丢弃");
    assert_eq!(out[0].original, "毕需掌握。");
    assert_eq!(out[0].suggestion, "必须掌握。");
}

#[test]
fn parse_accepts_bare_array_and_drops_equal() {
    let expected = vec!["内容一句。".to_string()];
    let raw = r#"[{"original":"内容一句。","suggestion":"内容一句。","reason":"x"},
        {"original":"内容一句。","suggestion":"内容一句改写。","reason":"顺"}]"#;
    let out = parse_suggestions(raw, &expected);
    assert_eq!(out.len(), 1, "suggestion 与 original 相同者丢弃");
}

#[test]
fn parse_degrades_empty_on_garbage() {
    assert!(parse_suggestions("", &["A句".to_string()]).is_empty());
    assert!(parse_suggestions("不是JSON", &["A句".to_string()]).is_empty());
    assert!(parse_suggestions("```json\n{\"a\":1}\n```", &["A句".to_string()]).is_empty());
}

#[test]
fn prompts_are_nonempty_and_numbered() {
    assert!(build_system_prompt().contains("original"));
    let user = build_user_prompt(&["甲。".to_string(), "乙。".to_string()]);
    assert!(user.starts_with("1. 甲。"));
    assert!(user.contains("2. 乙。"));
}
