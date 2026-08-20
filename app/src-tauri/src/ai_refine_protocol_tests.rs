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
        ..Default::default()
    };
    assert!(resp.validate().is_ok());
}

#[test]
fn validate_rejects_empty_sections() {
    assert!(AiRefineResponse { sections: vec![], ..Default::default() }.validate().is_err());
}

#[test]
fn validate_rejects_empty_or_blank_heading() {
    let r = AiRefineResponse { sections: vec![sec("  ", vec![para("x")])], ..Default::default() };
    assert!(r.validate().is_err());
    let long = AiRefineResponse { sections: vec![sec(&"长".repeat(201), vec![para("x")])], ..Default::default() };
    assert!(long.validate().is_err());
}

#[test]
fn validate_rejects_empty_block_or_content() {
    // 空块列表
    assert!(AiRefineResponse { sections: vec![sec("h", vec![])], ..Default::default() }.validate().is_err());
    // 空白内容
    let blank = AiRefineResponse { sections: vec![sec("h", vec![para("  ")])], ..Default::default() };
    assert!(blank.validate().is_err());
    // 超长内容
    let long = AiRefineResponse { sections: vec![sec("h", vec![para(&"字".repeat(4001))])], ..Default::default() };
    assert!(long.validate().is_err());
}

#[test]
fn validate_rejects_total_overflow() {
    // 块总数超上限（200）→ 拒绝（防刷屏）
    let mut blocks = Vec::new();
    for i in 0..201 {
        blocks.push(para(&format!("内容{}", i)));
    }
    let r = AiRefineResponse { sections: vec![sec("h", blocks)], ..Default::default() };
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
        ..Default::default()
    };
    assert!(r.validate().is_err());
}

#[test]
fn validate_rejects_bad_image_path_and_overflow() {
    // F3 v2：image 块必须引用 session-images/ 前缀（防注入任意路径/URL）
    let bad_path = AiRefineResponse {
        sections: vec![sec("h", vec![AiRefineBlock {
            block_type: AiRefineBlockType::Image,
            content: "https://evil.example/x.png".to_string(),
            anchor_ref: None,
        }])],
        ..Default::default()
    };
    assert!(bad_path.validate().is_err(), "外部 URL 不得作为配图引用");
    // 每节 image 块 ≤5（防配图刷屏）
    let mut imgs = Vec::new();
    for i in 0..6 {
        imgs.push(AiRefineBlock {
            block_type: AiRefineBlockType::Image,
            content: format!("session-images/5/full/{}.webp", i),
            anchor_ref: None,
        });
    }
    let overflow = AiRefineResponse { sections: vec![sec("h", imgs)], ..Default::default() };
    assert!(overflow.validate().is_err());
    // 合法路径通过
    let ok = AiRefineResponse {
        sections: vec![sec("h", vec![AiRefineBlock {
            block_type: AiRefineBlockType::Image,
            content: "session-images/5/full/30000.webp".to_string(),
            anchor_ref: None,
        }])],
        ..Default::default()
    };
    assert!(ok.validate().is_ok());
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
        ..Default::default()
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
fn to_markdown_renders_image_block() {
    // F3 v2：image 块 → 配图行（与规则版画面要点行同形态——前端统一渲染）
    let resp = AiRefineResponse {
        sections: vec![sec("标题", vec![AiRefineBlock {
            block_type: AiRefineBlockType::Image,
            content: "session-images/5/full/30000.webp".to_string(),
            anchor_ref: None,
        }])],
        ..Default::default()
    };
    let md = resp.to_markdown();
    assert!(md.contains("- ![画面](session-images/5/full/30000.webp)"), "image 块渲染为配图行");
}

#[test]
fn v1_response_parses_without_schema_version() {
    // F3 v2 向后兼容：v1 响应（无 schemaVersion 字段）反序列化 → 缺省 1
    let raw = r#"{"sections":[{"heading":"h","blocks":[{"type":"paragraph","content":"c","anchor_ref":null}]}]}"#;
    let resp: AiRefineResponse = serde_json::from_str(raw).expect("v1 响应必须可解析");
    assert_eq!(resp.schema_version, 1, "v1 缺省版本 = 1");
    assert!(resp.validate().is_ok());
}

#[test]
fn to_markdown_trims_and_joins_sections() {
    let resp = AiRefineResponse {
        sections: vec![sec("一", vec![para("A")]), sec("二", vec![para("B")])],
        ..Default::default()
    };
    let md = resp.to_markdown();
    assert!(md.contains("## 一"));
    assert!(md.contains("## 二"));
    assert!(md.starts_with("## 一"), "多节渲染顺序保持");
}
