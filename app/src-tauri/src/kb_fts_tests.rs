//! kb_fts.rs 单测（查询计划/RRF/snippet golden——设计 §十一 纯函数矩阵）。

use crate::kb_fts::{KbQueryPlan, build_snippet, like_pattern, plan_query, rrf_merge};

fn terms(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

// ---------- 查询计划（中文切词口径校准 golden） ----------

#[test]
fn empty_query_yields_no_terms() {
    // Arrange/Act
    let p = plan_query("   ");
    // Assert
    assert_eq!(p, KbQueryPlan { fts: None, like_terms: vec![], highlight_terms: vec![] });
}

#[test]
fn two_char_chinese_word_routes_to_like() {
    // Arrange（trigram 无法索引 2 字——配色走 LIKE 子串）
    let p = plan_query("配色");
    // Assert
    assert_eq!(p.fts, None);
    assert_eq!(p.like_terms, vec!["配色"]);
}

#[test]
fn natural_question_splits_to_windows() {
    // Arrange：疑问句停用字切段后 3 字以上转 fts 短语
    let p = plan_query("我在哪学过阴影画法");
    // Assert：停用字（我/在/哪）剔除后余"学过阴影画法"→ 短段整段短语
    let fts = p.fts.expect("fts 应有候选");
    assert!(fts.contains("学过阴影画法"), "fts={}", fts);
    assert!(p.like_terms.is_empty());
    assert!(p.highlight_terms.contains(&"学过阴影画法".to_string()));
}

#[test]
fn long_segment_expands_to_sliding_windows() {
    // Arrange：>6 字长段 = 整段短语 + 3~6 字滑窗（防前缀粘连改述落空）
    let p = plan_query("学色彩搭配技巧");
    // Assert
    let fts = p.fts.expect("fts 应有滑窗");
    assert!(fts.contains("\"学色彩搭配技巧\""), "整段 verbatim 优先: {}", fts);
    assert!(fts.contains("\"色彩搭配\""), "应含关键短语: {}", fts);
    assert!(fts.contains(" OR "), "多窗口应 OR 融合: {}", fts);
}

#[test]
fn pure_ascii_terms_build_and_phrase() {
    // Arrange
    let p = plan_query("canvas layout");
    // Assert
    assert_eq!(p.fts.as_deref(), Some("\"canvas\" OR \"layout\""));
    assert!(p.like_terms.is_empty());
}

#[test]
fn mixed_ascii_and_chinese_split_by_engine() {
    // Arrange："CSS"≥3 进 fts；"布局"2 字进 like
    let p = plan_query("CSS 布局");
    // Assert
    assert!(p.fts.as_deref().unwrap().contains("\"CSS\""));
    assert_eq!(p.like_terms, vec!["布局"]);
    assert!(p.highlight_terms.contains(&"CSS".to_string()));
}

#[test]
fn stopword_only_query_is_honestly_empty() {
    // Arrange/Act：全停用字 → 空计划（库内未找到口径，不瞎猜）
    let p = plan_query("你在吗呢");
    // Assert
    assert_eq!(p.fts, None);
    assert!(p.like_terms.is_empty());
}

#[test]
fn quote_chars_are_escaped_in_fts() {
    // Arrange/Act（防 FTS 语法注入——引号按 FTS5 双引号转义）
    let p = plan_query("say \"hi\" there");
    // Assert（say/"hi"(4 字)/there 全进 fts；`"hi"` → `"""hi"""`）
    assert_eq!(p.fts.as_deref(), Some(r#""say" OR """hi""" OR "there""#));
}

// ---------- RRF 融合 ----------

#[test]
fn rrf_single_list_passes_through_order() {
    // Arrange/Act
    let out = rrf_merge(&[vec![3i64, 1, 2]], 10);
    // Assert
    assert_eq!(out, vec![3, 1, 2]);
}

#[test]
fn rrf_merges_two_lists_ranking_overlap_first() {
    // Arrange：重叠项在两列都高位 → RRF 分更高
    let a = vec![7i64, 5, 1, 9];
    let b = vec![1, 7, 3];
    // Act
    let out = rrf_merge(&[a, b], 10);
    // Assert
    assert_eq!(out[0], 7, "双列命中应第一: {:?}", out);
    assert!(out.contains(&1));
    assert_eq!(out.len(), 5, "去重合并全部候选");
}

#[test]
fn rrf_empty_and_cap() {
    // Arrange/Act
    assert!(rrf_merge::<i64>(&[], 10).is_empty());
    let out = rrf_merge(&[vec![1, 2, 3, 4, 5]], 3);
    // Assert
    assert_eq!(out, vec![1, 2, 3]);
}

#[test]
fn rrf_ties_break_by_first_seen_order() {
    // Arrange：单列等距无法构造平局——用双列同 rank 验证稳定序
    let a = vec![5i64, 1];
    let b = vec![3i64, 2];
    // Act
    let out = rrf_merge(&[a, b], 10);
    // Assert：5/3/1/2（同分按先见列序：5 与 3 同分 1/61——a 列先见）
    assert_eq!(out, vec![5, 3, 1, 2]);
}

// ---------- snippet / like 模式 ----------

#[test]
fn snippet_marks_terms_and_centers_window() {
    // Arrange
    let text: String = "甲".repeat(300) + "关键术语锚点" + &"乙".repeat(300);
    // Act
    let snip = build_snippet(&text, &terms(&["关键术语"])).expect("有命中");
    // Assert
    assert!(snip.contains("==关键术语=="), "命中词应打标: {}", snip);
    assert!(snip.starts_with('…') && snip.ends_with('…'), "双侧截断加省略号");
    assert!(snip.chars().count() <= 200, "snippet 有界");
    // 无命中 → 头部截断无标记
    let snip2 = build_snippet(&text, &terms(&["不存在词"])).unwrap();
    assert!(!snip2.contains("=="));
}

#[test]
fn snippet_marks_multiple_distinct_terms() {
    // Arrange
    let text = "先讲阴影，再讲高光，最后讲阴影的层次。";
    // Act
    let snip = build_snippet(text, &terms(&["阴影", "高光"])).unwrap();
    // Assert
    assert!(snip.contains("==阴影==") && snip.contains("==高光=="), "snip={}", snip);
}

#[test]
fn snippet_ascii_case_insensitive() {
    // Arrange/Act
    let snip = build_snippet("Learn Rust with rust-lang", &terms(&["RUST"])).unwrap();
    // Assert
    assert!(snip.contains("==Rust=="), "首处 ASCII 大小写不敏感命中: {}", snip);
}

#[test]
fn snippet_empty_text_returns_none() {
    // Arrange/Act/Assert
    assert!(build_snippet("", &terms(&["x"])).is_none());
}

#[test]
fn like_pattern_escapes_wildcards() {
    // Arrange/Act/Assert（与既有 LIKE 链同口径——%/_ 转义防通配注入）
    assert_eq!(like_pattern("100%_真"), "%100\\%\\_真%");
}

#[test]
fn windows_are_generated_only_for_long_cjk_segs() {
    // Arrange
    let p = plan_query("阴影高光过渡层次");
    // Act/Assert：整段 8 字 > 6 → 整段 + 滑窗展开
    let fts = p.fts.unwrap();
    let count = fts.matches(" OR ").count() + 1;
    // 整段 1 + 8 字段：k=3 → 6 窗 + k=4 → 5 窗 + k=5 → 4 窗 + k=6 → 3 窗 = 19 短语
    assert_eq!(count, 19, "fts={}", fts);
    assert!(fts.contains("\"阴影高光过渡层次\""));
}
