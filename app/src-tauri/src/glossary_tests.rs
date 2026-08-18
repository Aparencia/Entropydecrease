//! 术语表交叉检测单测（REQ-046 / v0.5.0 M2，C3）。
//!
//! @ai-context: AAA 模式；覆盖高频×低频交叉、阈值边界、停用词过滤、确定性排序。

use super::*;

#[test]
fn ocr_high_freq_asr_low_freq_crossed() {
    // Arrange：板书术语"拉普拉斯"OCR 3 次、ASR 1 次；普通词"大家"被过滤
    let ocr_texts = vec![
        "拉普拉斯变换公式",
        "拉普拉斯变换性质",
        "拉普拉斯例题",
        "大家好",
    ];
    let asr_texts = vec!["这里用拉普拉斯", "大家好"];
    // Act
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 2, 2);
    // Assert：拉普拉斯入选（OCR 3 ≥ 2，ASR 1 ≤ 2）
    assert!(candidates.iter().any(|c| c.term == "拉普拉斯" && c.ocr_count == 3 && c.asr_count == 1));
    // 停用词不入选
    assert!(!candidates.iter().any(|c| c.term == "大家" || c.term == "公式"));
}

#[test]
fn asr_high_freq_excluded() {
    // Arrange：口语高频词（讲者反复说）不应作为术语候选
    let ocr_texts = vec!["卷积神经网络", "卷积神经网络", "卷积神经网络"];
    let asr_texts = vec!["卷积神经网络", "卷积神经网络", "卷积神经网络", "卷积神经网络", "卷积神经网络"];
    // Act：asr_max=2
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 2, 2);
    // Assert：ASR 5 次 > 2 → 排除
    assert!(candidates.is_empty());
}

#[test]
fn below_ocr_min_excluded() {
    // Arrange：OCR 只出现 1 次
    let ocr_texts = vec!["偶然出现一次的生僻词"];
    let asr_texts = vec!["其他内容"];
    // Act：ocr_min=2
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 2, 2);
    // Assert：不入选
    assert!(candidates.is_empty());
}

#[test]
fn sorted_by_ocr_frequency_desc() {
    // Arrange：三个 ASCII 术语不同频率（空格分隔，避免 CJK 滑窗交叉 gram 干扰）
    let ocr_texts = vec![
        "Alpha Beta Gamma",
        "Alpha Beta",
        "Alpha",
        "Beta",
    ];
    let asr_texts: Vec<&str> = Vec::new();
    // Act
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 1, 0);
    // Assert：OCR 频率降序（Alpha 3 次 > Beta 2 次 > Gamma 1 次）
    assert!(!candidates.is_empty());
    let pos_a = candidates.iter().position(|c| c.term == "Alpha").unwrap();
    let pos_b = candidates.iter().position(|c| c.term == "Beta").unwrap();
    let pos_c = candidates.iter().position(|c| c.term == "Gamma").unwrap();
    assert!(pos_a < pos_b && pos_b < pos_c);
}

#[test]
fn ascii_terms_included() {
    // Arrange：英文术语（OCR 高频）
    let ocr_texts = vec!["Gradient Descent 是核心", "Gradient Descent 很重要", "Gradient Descent 再次出现"];
    let asr_texts = vec!["核心算法"];
    // Act
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 2, 2);
    // Assert：Gradient 与 Descent 均为候选（≥3 字符 ASCII 词）
    assert!(candidates.iter().any(|c| c.term == "Gradient"));
    assert!(candidates.iter().any(|c| c.term == "Descent"));
}

#[test]
fn numbers_and_stopwords_filtered() {
    // Arrange：纯数字与停用词
    let ocr_texts = vec!["12345 一个 这个 那个 卷积", "12345", "卷积"];
    let asr_texts: Vec<&str> = Vec::new();
    // Act
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 2, 0);
    // Assert：12345 纯数字排除；停用词排除；"卷积"保留
    assert!(!candidates.iter().any(|c| c.term == "12345"));
    assert!(!candidates.iter().any(|c| c.term == "一个" || c.term == "这个" || c.term == "那个"));
    assert!(candidates.iter().any(|c| c.term == "卷积"));
}

#[test]
fn empty_inputs_safe() {
    // Act/Assert：空输入安全返回空
    assert!(glossary_candidates(&[], &[], 1, 0).is_empty());
}

#[test]
fn asr_max_zero_means_asr_absent() {
    // Arrange：术语从未在语音中出现（asr_count=0 ≤ asr_max=0）
    let ocr_texts = vec!["板书术语板书术语板书术语", "板书术语板书术语"];
    let asr_texts = vec!["完全不相关的内容"];
    // Act
    let candidates = glossary_candidates(&ocr_texts, &asr_texts, 2, 0);
    // Assert：板书术语入选且 asr_count=0
    assert!(candidates.iter().any(|c| c.term == "板书术语" && c.asr_count == 0));
}
