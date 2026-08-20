//! 话语层净化单测（v0.7.5 扩展：过渡短句 + 修辞问句）。
//!
//! @ai-context: AAA 模式；覆盖过渡表精确匹配（零误杀）、问句判定/核心词提取
//!              边界、自问自答删除与保守保留（开放问题/答案不紧邻/疑问过泛）。

use super::*;
use crate::note_filter::{FilterReason, FilterStats};
use crate::types::SessionSegment;

fn seg(id: i64, text: &str) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 31,
        start_ms: id as u64 * 1000,
        end_ms: id as u64 * 1000 + 1000,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

#[test]
fn transition_short_phrases_exact_match_only() {
    // Act & Assert：表内短句命中（零误杀靠精确匹配）
    assert!(is_transition_short("接下来", 8));
    assert!(is_transition_short("我们来看", 8));
    assert!(is_transition_short("接下来。", 8), "去标点后仍命中");
    assert!(is_transition_short("下面我们来看", 8));
    // 误杀防护：带内容的过渡句/长句/单字回应语不进表
    assert!(!is_transition_short("接下来我们看第三章", 8), "含章节内容");
    assert!(!is_transition_short("讲我们具体的工具了", 8), "带话题的过渡句");
    assert!(!is_transition_short("好", 8), "单字回应语");
    assert!(!is_transition_short("可以", 8), "许可回应语");
    assert!(!is_transition_short("今天天气不错", 8), "正文");
}

#[test]
fn question_detection_boundaries() {
    // Act & Assert：问号结尾 / 疑问词结尾（ASR 丢问号）
    assert!(is_question("过程是什么？"));
    assert!(is_question("过程是什么"));
    assert!(is_question("能理解吗"));
    assert!(is_question("为什么"));
    assert!(!is_question("这个过程是制定项目章程"));
    assert!(!is_question(""));
}

#[test]
fn question_core_extracts_topic_after_question_words() {
    // Act & Assert：会话31 实证——"过程是什么？" 的话题骨架 = "过程是"
    assert_eq!(question_core("过程是什么？").as_deref(), Some("过程是"));
    assert_eq!(question_core("成本是多少？").as_deref(), Some("成本是"));
    assert_eq!(question_core("项目管理怎么落地？").as_deref(), Some("项目管理落地"));
    // 疑问过泛 → 无核心词（保守不删）
    assert_eq!(question_core("为什么？"), None);
    assert_eq!(question_core("多少？"), None);
    assert_eq!(question_core("是什么？"), None);
}

#[test]
fn rhetorical_question_deleted_when_answer_adjacent() {
    // Arrange：会话31 实证——"过程是什么？" 答案"这个过程是制定项目章程"紧邻
    let kept = vec![seg(1, "过程是什么？"), seg(2, "这个过程是制定项目章程")];
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    // Act
    let out = drop_rhetorical_questions(kept, 15, &mut stats, &mut filtered);
    // Assert：问句删除（进过滤表可复查）、答案保留、统计正确
    assert_eq!(out.len(), 1);
    assert!(out[0].text.contains("制定项目章程"));
    assert_eq!(stats.rhetorical, 1);
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].reason, FilterReason::Rhetorical);
    assert_eq!(filtered[0].segment_id, 1);
}

#[test]
fn open_question_kept_when_no_adjacent_answer() {
    // Arrange：开放问题/答案不在紧邻段——保守保留
    let kept = vec![seg(1, "大家思考一下为什么？"), seg(2, "我们来看下一个案例")];
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    // Act
    let out = drop_rhetorical_questions(kept, 15, &mut stats, &mut filtered);
    // Assert：不删（核心词"大家思考一下"不在下一段）
    assert_eq!(out.len(), 2);
    assert_eq!(stats.rhetorical, 0);
}

#[test]
fn real_question_kept_even_with_topic_in_next() {
    // Arrange：核心问题（"什么是项目管理？" 答案在后文而非紧邻）——
    // 用"紧邻段不含核心词"验证；此处下一段是无关句
    let kept = vec![seg(1, "什么是项目管理？"), seg(2, "我们先看一个案例")];
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    // Act
    let out = drop_rhetorical_questions(kept, 15, &mut stats, &mut filtered);
    // Assert：保留
    assert_eq!(out.len(), 2);
}

#[test]
fn long_question_kept() {
    // Arrange：超长问句（>15 字）——复杂问句多为真问题
    let kept = vec![
        seg(1, "项目启动的过程和立项的过程有什么区别和联系？"),
        seg(2, "项目启动的过程和立项的区别主要在于范围"),
    ];
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    // Act
    let out = drop_rhetorical_questions(kept, 15, &mut stats, &mut filtered);
    // Assert：保留
    assert_eq!(out.len(), 2);
    assert_eq!(stats.rhetorical, 0);
}

#[test]
fn trailing_question_without_next_kept() {
    // Arrange：问句是最后一段（无下一段可验）——保守保留
    let kept = vec![seg(1, "这个过程是制定项目章程"), seg(2, "过程是什么？")];
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    // Act
    let out = drop_rhetorical_questions(kept, 15, &mut stats, &mut filtered);
    // Assert：不删
    assert_eq!(out.len(), 2);
}
