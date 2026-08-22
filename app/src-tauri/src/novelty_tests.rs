//! 帧新颖度采样单测（REQ-066 / v0.6.0 M3；v0.11.5 Task 2 变化区域 + 档位阈值）。
//!
//! @ai-context: AAA 模式；覆盖重叠率矩阵（全新/完全冗余/部分重叠）、
//!              阈值边界、空输入、预算语义（冗余帧不更新基准的纯函数前提）、
//!              PPT 同构页黄金用例（变化区域契约）与画面档阈值自适应。

use super::*;

fn t(text: &str) -> String {
    text.to_string()
}

#[test]
fn brand_new_content_scores_zero() {
    // Arrange：最近文本为空（首帧）或完全不同
    let recent: Vec<String> = Vec::new();
    // Act & Assert：空基准 → 0（首帧不误判冗余）
    assert_eq!(novelty_score(&[t("全新的幻灯片内容")], &recent), 0.0);
    let recent = vec![t("第一章 变量定义")];
    assert_eq!(novelty_score(&[t("第二章 函数调用")], &recent), 0.0);
}

#[test]
fn identical_content_scores_one() {
    // Arrange：完全一致 → 1（精确重复，最高冗余）
    let new = vec![t("神经网络的反向传播算法详解")];
    let recent = vec![t("神经网络的反向传播算法详解")];
    // Act
    let score = novelty_score(&new, &recent);
    // Assert
    assert!((score - 1.0).abs() < 1e-6, "完全重复应 1.0，实得 {}", score);
    assert!(is_redundant(score, REDUNDANT_THRESHOLD));
}

#[test]
fn slight_change_scores_high_and_redundant() {
    // Arrange：画面微变（结尾追加"注意"二字）——内容高度重叠 → 冗余
    let recent = vec![t("卷积神经网络由输入层隐藏层输出层组成")];
    let new = vec![t("卷积神经网络由输入层隐藏层输出层组成。注意")];
    // Act
    let score = novelty_score(&new, &recent);
    // Assert：高重叠（≥0.85）→ 冗余帧跳过
    assert!(score >= REDUNDANT_THRESHOLD, "微变应判冗余，实得 {}", score);
    assert!(is_redundant(score, REDUNDANT_THRESHOLD));
}

#[test]
fn meaningful_change_not_redundant() {
    // Arrange：话题切换（内容大部分不同）→ 非冗余，预算花在新内容上
    let recent = vec![t("第一章 机器学习基础概念介绍")];
    let new = vec![t("第四章 深度学习实战项目部署")];
    // Act
    let score = novelty_score(&new, &recent);
    // Assert
    assert!(score < REDUNDANT_THRESHOLD, "话题切换不应判冗余，实得 {}", score);
    assert!(!is_redundant(score, REDUNDANT_THRESHOLD));
}

#[test]
fn threshold_boundary() {
    // Act & Assert：恰等于阈值 → 冗余（≥ 语义）；阈值以下 → 非冗余
    assert!(is_redundant(0.85, 0.85));
    assert!(!is_redundant(0.849, 0.85));
    assert!(is_redundant(0.0, 0.0));
}

#[test]
fn multi_text_union_compared() {
    // Arrange：多文本并集比较（一帧多个 OCR 块）
    let new = vec![t("标题一"), t("正文内容甲")];
    let recent = vec![t("标题一"), t("正文内容乙")];
    // Act：并集含 标题一/正文/内容 等 token——重叠约一半
    let score = novelty_score(&new, &recent);
    // Assert：部分重叠（0 < score < 0.85）——不判冗余（新正文内容值得采样）
    assert!(score > 0.0 && score < REDUNDANT_THRESHOLD, "部分重叠应非冗余，实得 {}", score);
}

#[test]
fn empty_texts_safe() {
    // Act & Assert：空文本安全（token 空 → 0）
    assert_eq!(novelty_score(&[], &[t("内容")]), 0.0);
    assert_eq!(novelty_score(&[t("")], &[t("内容")]), 0.0);
}

#[test]
fn template_page_same_structure_different_content_not_redundant() {
    // Arrange：PPT 同构页——页眉页脚/模板固定文字相同，正文（变化区域）完全不同。
    // 固定文本刻意取长：Jaccard 口径下固定文本须显著长于正文（≥5.67×）整帧
    // 比较才达 0.85——这正是旧行为（整帧比较）误判同构页的数学本质
    let fixed = t(
        "页脚·课程名称·清华大学·信息科学与技术学院·秋季学期·第三讲·页码第5页·共12页\
·授课教师·张三教授·请勿外传·内部资料·版权归校方所有·教务系统编号·第一学期\
·本科生课程·必修课·教学大纲·版本修订记录·内部使用·校对·结课考核方式\
·平时成绩占比·期末考试安排·教学日历同步更新",
    );
    // Act & Assert：契约钉死——调用方只传变化区域文本（固定版面文字不参与）→
    // 全新正文 → 非冗余
    let score = novelty_score(&[t("第二章 函数调用")], &[t("第一章 变量定义")]);
    assert!(score < REDUNDANT_THRESHOLD, "模板同构正文不同不得判冗余，实得 {}", score);
    // 旧语义回归：整帧比较（固定版面文字参与重叠率）→ 同构页判冗余
    // （证明"变化区域"是调用方责任——novelty_score 不感知区域）
    let full_score = novelty_score(
        &[fixed.clone(), t("第二章 函数调用")],
        &[fixed, t("第一章 变量定义")],
    );
    assert!(full_score >= REDUNDANT_THRESHOLD, "整帧含固定文本应判冗余，实得 {}", full_score);
}

#[test]
fn threshold_adapts_by_tier() {
    // Act & Assert：rich 档 0.90（更宽松——画面价值高时少判冗余）；
    // low 档 0.80（更严格）；未知档回退默认 0.85
    assert!(!is_redundant(0.87, tier_threshold("rich")));
    assert!(is_redundant(0.82, tier_threshold("low")));
    assert_eq!(tier_threshold("rich"), 0.90);
    assert_eq!(tier_threshold("low"), 0.80);
    assert_eq!(tier_threshold("medium"), 0.85);
}
