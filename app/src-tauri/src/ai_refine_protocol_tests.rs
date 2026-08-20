//! ai_refine_protocol.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：validate 强校验（空章节/空块/超长/超量/空锚点）、
//!              to_markdown 各块类型渲染（paragraph/list/term/highlight/quote）、
//!              校验通过后的合法响应。

use crate::ai_refine_protocol::{
    AiRefineBlock, AiRefineBlockType, AiRefineResponse, AiRefineSection,
};

fn sec(heading: &str, blocks: Vec<AiRefineBlock>) -> AiRefineSection {
    AiRefineSection { heading: heading.to_string(), blocks }
}

fn para(content: &str) -> AiRefineBlock {
    AiRefineBlock { block_type: AiRefineBlockType::Paragraph, content: content.to_string(), anchor_ref: None }
}

#[test]
fn validate_accepts_legal_response() {
    let resp = AiRefineResponse {
        sections: vec![
            sec("第一章", vec![para("内容一"), para("内容二")]),
            sec("第二章", vec![AiRefineBlock {
                block_type: AiRefineBlockType::Term,
                content: "术语A".to_string(),
                anchor_ref: Some("第一章".to_string()),
            }]),
        ],
    };
    assert!(resp.validate().is_ok());
}

#[test]
fn validate_rejects_empty_sections() {
    assert!(AiRefineResponse { sections: vec![] }.validate().is_err());
}

#[test]
fn validate_rejects_empty_or_blank_heading() {
    let r = AiRefineResponse { sections: vec![sec("  ", vec![para("x")])] };
    assert!(r.validate().is_err());
    let long = AiRefineResponse { sections: vec![sec(&"长".repeat(201), vec![para("x")])] };
    assert!(long.validate().is_err());
}

#[test]
fn validate_rejects_empty_block_or_content() {
    // 空块列表
    assert!(AiRefineResponse { sections: vec![sec("h", vec![])] }.validate().is_err());
    // 空白内容
    let blank = AiRefineResponse { sections: vec![sec("h", vec![para("  ")])] };
    assert!(blank.validate().is_err());
    // 超长内容
    let long = AiRefineResponse { sections: vec![sec("h", vec![para(&"字".repeat(4001))])] };
    assert!(long.validate().is_err());
}

#[test]
fn validate_rejects_total_overflow() {
    // 块总数超上限（200）→ 拒绝（防刷屏）
    let mut blocks = Vec::new();
    for i in 0..201 {
        blocks.push(para(&format!("内容{}", i)));
    }
    let r = AiRefineResponse { sections: vec![sec("h", blocks)] };
    assert!(r.validate().is_err());
}

#[test]
fn validate_rejects_blank_anchor() {
    let r = AiRefineResponse {
        sections: vec![sec("h", vec![AiRefineBlock {
            block_type: AiRefineBlockType::Paragraph,
            content: "x".to_string(),
            anchor_ref: Some("   ".to_string()),
        }])],
    };
    assert!(r.validate().is_err());
}

#[test]
fn to_markdown_renders_all_block_types() {
    let resp = AiRefineResponse {
        sections: vec![sec("标题", vec![
            para("第一段"),
            AiRefineBlock { block_type: AiRefineBlockType::List, content: "甲\n乙".to_string(), anchor_ref: None },
            AiRefineBlock { block_type: AiRefineBlockType::Term, content: "术语B".to_string(), anchor_ref: None },
            AiRefineBlock { block_type: AiRefineBlockType::Highlight, content: "重点".to_string(), anchor_ref: None },
            AiRefineBlock { block_type: AiRefineBlockType::Quote, content: "引文".to_string(), anchor_ref: None },
        ])],
    };
    let md = resp.to_markdown();
    assert!(md.starts_with("## 标题"));
    assert!(md.contains("第一段"));
    assert!(md.contains("- 甲\n- 乙"));
    assert!(md.contains("- **术语B**"));
    assert!(md.contains("**重点**"));
    assert!(md.contains("> 引文"));
}

#[test]
fn to_markdown_trims_and_joins_sections() {
    let resp = AiRefineResponse {
        sections: vec![sec("一", vec![para("A")]), sec("二", vec![para("B")])],
    };
    let md = resp.to_markdown();
    assert!(md.contains("## 一"));
    assert!(md.contains("## 二"));
    assert!(md.starts_with("## 一"), "多节渲染顺序保持");
}
