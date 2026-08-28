//! ocr_quality 单测（v0.14 D2 spec §6：四信号加权；AAA 模式）。

use super::*;

fn texts(ts: &[&str]) -> Vec<String> {
    ts.iter().map(|s| s.to_string()).collect()
}

#[test]
fn all_signal_high_scores_above_threshold() {
    // Arrange：高置信 + 少碎片 + 可成句 + 零噪音
    let input = QualityInput {
        scores: &[0.95, 0.93, 0.9],
        texts: &texts(&["系统是由相互联系的要素组成的", "整体表现出新功能", "这是第三句完整内容"]),
        junk_hits: 0,
        merged_lines: &texts(&["系统是由相互联系的要素组成的整体表现出新功能", "这是第三句完整内容"]),
    };
    // Act
    let score = ocr_quality_score(&input);
    // Assert：0.9 以上（四信号全优）
    assert!(score >= QUALITY_TH, "高质量场景应达标，实际 {score}");
}

#[test]
fn empty_input_scores_zero() {
    // Arrange/Act/Assert：空章节 → 0.0（宁缺毋滥，spec §5）
    assert_eq!(ocr_quality_score(&QualityInput {
        scores: &[],
        texts: &[],
        junk_hits: 0,
        merged_lines: &[],
    }), 0.0);
}

#[test]
fn inconsistent_lengths_score_zero() {
    // Arrange：scores/texts 长度不一致（编排 bug 防御）
    let input = QualityInput {
        scores: &[0.9, 0.8],
        texts: &texts(&["只有一块"]),
        junk_hits: 0,
        merged_lines: &[],
    };
    // Act/Assert
    assert_eq!(ocr_quality_score(&input), 0.0);
}

#[test]
fn low_confidence_pulls_score_down() {
    // Arrange：全部 0.1 低置信、其余信号全优——置信度项被压到 0.04
    let input = QualityInput {
        scores: &[0.1, 0.1, 0.1],
        texts: &texts(&["长文本块一的内容填充", "长文本块二的内容填充", "长文本块三的内容填充"]),
        junk_hits: 0,
        merged_lines: &texts(&["长文本块一的内容填充长文本块二的内容填充", "长文本块三的内容填充"]),
    };
    let score = ocr_quality_score(&input);
    // 置信度项 = 0.4 × 0.1 = 0.04；总分 = 0.04 + 0.2 + 0.2 + 0.2 = 0.64
    assert!((score - 0.64).abs() < 1e-4, "四信号加权和，实际 {score}");
    // 对照：同场景高置信（0.95）应显著更高
    let high = ocr_quality_score(&QualityInput {
        scores: &[0.95, 0.95, 0.95],
        texts: &texts(&["长文本块一的内容填充", "长文本块二的内容填充", "长文本块三的内容填充"]),
        junk_hits: 0,
        merged_lines: &texts(&["长文本块一的内容填充长文本块二的内容填充", "长文本块三的内容填充"]),
    });
    assert!(high > score + 0.3, "高置信显著更高：{high} vs {score}");
}

#[test]
fn combined_low_quality_below_threshold() {
    // Arrange：低置信 + 高碎片 + 高噪音 + 无成句——综合低质应低于阈值（门控弃用）
    let input = QualityInput {
        scores: &[0.4, 0.4, 0.4, 0.4],
        texts: &texts(&["哦", "的", "是", "啊"]),
        junk_hits: 3,
        merged_lines: &[],
    };
    let score = ocr_quality_score(&input);
    // 置信 0.4×0.4(0.16) + 碎片全 ≤4 字→0 + 连贯 0 + 噪音 0.25→0.2×0.25(0.05)
    assert!((score - 0.21).abs() < 1e-4, "实际 {score}");
    assert!(score < QUALITY_TH, "综合低质应低于阈值，实际 {score}");
}

#[test]
fn fragment_blocks_penalize_score() {
    // Arrange：一半块是 ≤4 字碎片；其余信号一致
    let input = QualityInput {
        scores: &[0.9, 0.9, 0.9, 0.9],
        texts: &texts(&["完整句子内容一啊", "完整句子内容二啊", "短", "碎片"]),
        junk_hits: 0,
        merged_lines: &texts(&["完整句子内容一啊完整句子内容二啊"]),
    };
    let score = ocr_quality_score(&input);
    // 碎片率 0.5 → 碎片项 0.2 × 0.5 = 0.1（比零碎片少 0.1）
    assert!((score - (0.36 + 0.1 + 0.2 + 0.2)).abs() < 1e-4, "碎片项 0.1，实际 {score}");
}

#[test]
fn junk_hits_penalize_score() {
    // Arrange：一半块命中垃圾黑名单（噪音比信号）
    let input = QualityInput {
        scores: &[0.9, 0.9, 0.9, 0.9],
        texts: &texts(&["完整句子内容一啊", "完整句子内容二啊", "完整句子内容三啊", "完整句子内容四啊"]),
        junk_hits: 2,
        merged_lines: &texts(&["完整句子内容一啊完整句子内容二啊", "完整句子内容三啊完整句子内容四啊"]),
    };
    let score = ocr_quality_score(&input);
    // 噪音项 0.2 × 0.5 = 0.1
    assert!((score - (0.36 + 0.2 + 0.2 + 0.1)).abs() < 1e-4, "噪音项 0.1，实际 {score}");
}

#[test]
fn confidence_is_char_weighted_not_block_weighted() {
    // Arrange：长块低分 + 短块高分——字符加权后更接近长块（不被短高分拉高）
    let long_low = "这是一个非常长的低置信文本块内容填充";
    let input = QualityInput {
        scores: &[0.9, 0.3],
        texts: &texts(&["高", long_low]),
        junk_hits: 0,
        merged_lines: &texts(&[long_low]),
    };
    let score = ocr_quality_score(&input);
    // 短块 1 字 0.9、长块 18 字 0.3 → 加权 ≈ 0.332；「高」为 1 字碎片 → 碎片项 0.1
    let expected_conf = (0.9 * 1.0 + 0.3 * long_low.chars().count() as f32) / (1 + long_low.chars().count()) as f32;
    let expected = 0.4 * expected_conf + 0.1 + 0.2 + 0.2;
    assert!((score - expected).abs() < 1e-4, "字符加权，实际 {score} 期望 {expected}");
}

#[test]
fn fragment_ratio_helper() {
    // Arrange/Act/Assert：碎片占比与空输入防御
    assert!((fragment_ratio(&texts(&["短", "完", "完整句子内容"])) - 2.0 / 3.0).abs() < 1e-4);
    assert_eq!(fragment_ratio(&[]), 1.0, "空输入按全碎片（疑碎信号保守）");
}
