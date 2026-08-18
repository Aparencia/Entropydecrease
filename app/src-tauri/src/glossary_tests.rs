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

// ────────────────────────────────────────────────────────────
// REQ-061 精化：TF-IDF / 缩略词召回 / 水印词排除
// ────────────────────────────────────────────────────────────

#[test]
fn tfidf_down_weights_common_terms() {
    // Arrange：两术语 OCR 次数相同（各 3 次），但"公式"文档频率 100（通用词）
    let ocr_texts = vec!["拉普拉斯算子 公式", "拉普拉斯变换 公式", "拉普拉斯定理 公式"];
    let asr_texts: Vec<&str> = vec![];
    let mut df = std::collections::HashMap::new();
    df.insert("公式".to_string(), 100);
    df.insert("拉普拉斯".to_string(), 1);
    let opts = GlossaryOptions { df: Some(df), total_docs: 100, ..Default::default() };
    // Act：同 OCR 次数下比较精化分
    let candidates = glossary_candidates_opt(&ocr_texts, &asr_texts, 3, 0, &opts);
    // Assert：稀有词分 > 通用词分（idf 生效）
    let rare = candidates.iter().find(|c| c.term == "拉普拉斯").unwrap();
    let common = candidates.iter().find(|c| c.term == "公式").unwrap();
    assert!(rare.score > common.score, "稀有词应高于通用词（{} vs {}）", rare.score, common.score);
    // Assert：无 df 时 score = ocr_count（零回归）
    let legacy = glossary_candidates(&ocr_texts, &asr_texts, 3, 0);
    assert!(legacy.iter().all(|c| (c.score - c.ocr_count as f32).abs() < 1e-6));
}

#[test]
fn acronyms_recalled_below_normal_threshold() {
    // Arrange：缩略词 SGD/CNN 出现 3 次；普通词"优化"仅 1 次
    let ocr_texts = vec!["SGD CNN 随机梯度", "SGD CNN 梯度下降", "SGD CNN 优化"];
    let asr_texts: Vec<&str> = vec![];
    // Act：ocr_min=3 普通门槛下缩略词低阈值召回（acronym_min_ocr=2）
    let candidates = glossary_candidates_opt(&ocr_texts, &asr_texts, 3, 1, &GlossaryOptions::default());
    // Assert：SGD/CNN 入选且不重复（普通路径跳过缩略词）
    assert!(candidates.iter().any(|c| c.term == "SGD" && c.ocr_count == 3));
    assert!(candidates.iter().any(|c| c.term == "CNN"));
    assert_eq!(candidates.iter().filter(|c| c.term == "SGD").count(), 1);
}

#[test]
fn alnum_mixed_acronyms_recalled() {
    // Arrange：字母数字混合缩略词（ResNet50/B2B/3D）
    let ocr_texts = vec!["ResNet50 B2B 3D 模型", "ResNet50 B2B 3D 训练", "ResNet50 B2B 3D 推理"];
    let asr_texts: Vec<&str> = vec![];
    // Act
    let candidates = glossary_candidates_opt(&ocr_texts, &asr_texts, 3, 1, &GlossaryOptions::default());
    // Assert：混合缩略词全部召回（含 2 字符 "3D"）
    assert!(candidates.iter().any(|c| c.term == "ResNet50"));
    assert!(candidates.iter().any(|c| c.term == "B2B"));
    assert!(candidates.iter().any(|c| c.term == "3D"));
}

#[test]
fn watermark_terms_excluded() {
    // Arrange：角标水印词高频（REQ-059 输出）；正文术语同频
    let ocr_texts = vec!["学习资料 熵减算法", "学习资料 熵减理论", "学习资料 熵减应用"];
    let asr_texts: Vec<&str> = vec![];
    let opts = GlossaryOptions { watermark_exclude: vec!["学习资料".to_string()], ..Default::default() };
    // Act
    let candidates = glossary_candidates_opt(&ocr_texts, &asr_texts, 2, 0, &opts);
    // Assert：水印词不进候选；正文术语保留
    assert!(!candidates.iter().any(|c| c.term == "学习资料"));
    assert!(candidates.iter().any(|c| c.term == "熵减"));
}

#[test]
fn mixed_case_words_not_treated_as_acronyms() {
    // Arrange：混合大小写普通词（Gradient）——走常规阈值与计分
    let ocr_texts = vec!["Gradient Descent", "Gradient Boost", "Gradient Clipping"];
    let asr_texts: Vec<&str> = vec![];
    // Act：ocr_min=3 恰好过普通阈值
    let candidates = glossary_candidates_opt(&ocr_texts, &asr_texts, 3, 1, &GlossaryOptions::default());
    // Assert：普通候选 score = ocr_count（非缩略词路径）
    let c = candidates.iter().find(|c| c.term == "Gradient").unwrap();
    assert_eq!(c.ocr_count, 3);
    assert_eq!(c.score, 3.0);
}

#[test]
fn acronym_asr_high_freq_excluded() {
    // Arrange：缩略词在语音中也高频（讲者反复读 SGD）→ 不应作为术语候选
    let ocr_texts = vec!["SGD 优化器", "SGD 学习率", "SGD 动量"];
    let asr_texts = vec!["SGD", "SGD", "SGD", "SGD"];
    // Act：acronym_max_asr=1，实际 4 次 → 排除
    let candidates = glossary_candidates_opt(&ocr_texts, &asr_texts, 2, 1, &GlossaryOptions::default());
    // Assert
    assert!(!candidates.iter().any(|c| c.term == "SGD"));
}
