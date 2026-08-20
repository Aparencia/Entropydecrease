//! ai_enrich_protocol.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：九子项枚举（深度/广度分类/label）、validate 强校验
//!              （未请求子项/深度缺锚点/广度带锚点/B6 含 URL/置信度越界/
//!              空块/超量）。

use crate::ai_enrich_protocol::{AiEnrichBlock, AiEnrichKind, AiEnrichResponse};

fn block(kind: AiEnrichKind, anchor: Option<&str>, content: &str) -> AiEnrichBlock {
    AiEnrichBlock {
        kind,
        anchor_ref: anchor.map(|s| s.to_string()),
        heading: format!("{}标题", kind.label()),
        content: content.to_string(),
        confidence: 0.9,
    }
}

#[test]
fn kinds_classification_and_labels() {
    assert!(AiEnrichKind::D1.is_depth() && !AiEnrichKind::D1.is_breadth());
    assert!(AiEnrichKind::B6.is_breadth() && !AiEnrichKind::B6.is_depth());
    assert_eq!(AiEnrichKind::all().len(), 9);
    assert_eq!(AiEnrichKind::B6.label(), "资源推荐");
    assert_eq!(AiEnrichKind::D2.label(), "步骤补全");
}

#[test]
fn validate_accepts_legal_mixed_response() {
    let selected = vec![AiEnrichKind::D1, AiEnrichKind::B1];
    let resp = AiEnrichResponse {
        blocks: vec![
            block(AiEnrichKind::D1, Some("第三章"), "概念补充内容"),
            block(AiEnrichKind::B1, None, "前置知识内容"),
        ],
    };
    assert!(resp.validate(&selected).is_ok());
}

#[test]
fn validate_rejects_unrequested_kind() {
    // 只请求了 D1——返回 B1 → 拒绝（协议契约）
    let selected = vec![AiEnrichKind::D1];
    let resp = AiEnrichResponse { blocks: vec![block(AiEnrichKind::B1, None, "x")] };
    assert!(resp.validate(&selected).is_err());
}

#[test]
fn validate_rejects_depth_block_without_anchor() {
    let selected = vec![AiEnrichKind::D1];
    let resp = AiEnrichResponse { blocks: vec![block(AiEnrichKind::D1, None, "缺锚点")] };
    assert!(resp.validate(&selected).is_err());
}

#[test]
fn validate_rejects_breadth_block_with_anchor() {
    let selected = vec![AiEnrichKind::B1];
    let resp = AiEnrichResponse { blocks: vec![block(AiEnrichKind::B1, Some("章节"), "x")] };
    assert!(resp.validate(&selected).is_err());
}

#[test]
fn validate_rejects_b6_with_url() {
    // B6 防幻觉：content 含 URL → 拒绝（仅标题不输出链接）
    let selected = vec![AiEnrichKind::B6];
    let resp = AiEnrichResponse { blocks: vec![block(AiEnrichKind::B6, None, "推荐《X》https://example.com/book")] };
    assert!(resp.validate(&selected).is_err(), "B6 含 URL 必须拒绝");
    // www 前缀同样拒绝
    let resp2 = AiEnrichResponse { blocks: vec![block(AiEnrichKind::B6, None, "www.xxx.com 的资源")] };
    assert!(resp2.validate(&selected).is_err());
    // 无链接 → 通过
    let ok = AiEnrichResponse { blocks: vec![block(AiEnrichKind::B6, None, "推荐《卷积神经网络》作者：XXX")] };
    assert!(ok.validate(&selected).is_ok());
}

#[test]
fn validate_rejects_empty_or_overflow() {
    let selected: Vec<AiEnrichKind> = AiEnrichKind::all().to_vec();
    assert!(AiEnrichResponse { blocks: vec![] }.validate(&selected).is_err());
    // 超量（51 块）
    let blocks: Vec<AiEnrichBlock> = (0..51)
        .map(|i| block(AiEnrichKind::B1, None, &format!("内容{}", i)))
        .collect();
    assert!(AiEnrichResponse { blocks }.validate(&selected).is_err());
    // 置信度越界
    let mut b = block(AiEnrichKind::B1, None, "x");
    b.confidence = 1.5;
    assert!(AiEnrichResponse { blocks: vec![b] }.validate(&selected).is_err());
    // 空内容
    let mut b = block(AiEnrichKind::B1, None, "  ");
    b.confidence = 0.5;
    assert!(AiEnrichResponse { blocks: vec![b] }.validate(&selected).is_err());
}
