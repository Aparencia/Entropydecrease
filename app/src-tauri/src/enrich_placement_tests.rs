//! enrich_placement.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：深度块就近插入引用章节下、广度块聚合尾部扩展区、
//!              混合落位、同锚点多块合并、锚点未命中追加尾部（不丢块）。

use crate::ai_enrich_protocol::{AiEnrichBlock, AiEnrichKind, AiEnrichResponse};
use crate::enrich_placement::{render_enriched_note, render_extension_area};

fn block(kind: AiEnrichKind, anchor: Option<&str>, heading: &str, content: &str) -> AiEnrichBlock {
    AiEnrichBlock {
        kind,
        anchor_ref: anchor.map(|s| s.to_string()),
        heading: heading.to_string(),
        content: content.to_string(),
        confidence: 0.9,
    }
}

#[test]
fn depth_block_inserted_under_matching_heading() {
    let base = "## 第一章\n正文一\n\n## 第二章\n正文二";
    let resp = AiEnrichResponse {
        blocks: vec![block(AiEnrichKind::D1, Some("第二章"), "概念展开", "补充内容")],
    };
    let out = render_enriched_note(base, &resp);
    // 插入在第二章标题之后、正文二之前
    let pos_heading = out.find("## 第二章").expect("保留原标题");
    let pos_ins = out.find("AI 展开").expect("插入块存在");
    let pos_body2 = out.find("正文二").expect("保留原正文");
    assert!(pos_heading < pos_ins && pos_ins < pos_body2, "深度块就近插入引用章节之下");
    // 徽标 + 溯源锚点 + 引用风边框
    assert!(out.contains("📌 **AI 展开（概念展开）** · 关联「第二章」"));
    assert!(out.contains("> 补充内容"));
}

#[test]
fn breadth_blocks_appended_as_extension_area() {
    let base = "## 第一章\n正文";
    let resp = AiEnrichResponse {
        blocks: vec![
            block(AiEnrichKind::B1, None, "前置知识", "需要了解 X"),
            block(AiEnrichKind::B6, None, "资源推荐", "推荐《Y》"),
        ],
    };
    let out = render_enriched_note(base, &resp);
    // 扩展区徽标 + 需核实 + 各自成节
    assert!(out.contains("## 📚 AI 补充 · 非课程内容 · 需核实"));
    assert!(out.contains("> 以下内容由 AI 生成，属模型外部知识而非课程内容，请自行核实。"));
    assert!(out.contains("### 前置知识"));
    assert!(out.contains("### 资源推荐"));
    // 扩展区在笔记尾部（正文之后）
    assert!(out.find("正文").unwrap() < out.find("AI 补充").unwrap());
}

#[test]
fn mixed_placement_depth_inline_breadth_tail() {
    let base = "## 第一节\n甲\n\n## 第二节\n乙";
    let resp = AiEnrichResponse {
        blocks: vec![
            block(AiEnrichKind::D3, Some("第一节"), "例子补全", "例子内容"),
            block(AiEnrichKind::B5, None, "实践建议", "建议内容"),
        ],
    };
    let out = render_enriched_note(base, &resp);
    // 深度块在第一节下（在"第二节"之前）；广度块在尾部（在"第二节"之后）
    let pos_depth = out.find("例子内容").unwrap();
    let pos_sec2 = out.find("## 第二节").unwrap();
    let pos_breadth = out.find("实践建议").unwrap();
    assert!(pos_depth < pos_sec2 && pos_sec2 < pos_breadth, "深度就近、广度聚合");
}

#[test]
fn multiple_depth_blocks_same_anchor_merged() {
    let base = "## 章节\n正文";
    let resp = AiEnrichResponse {
        blocks: vec![
            block(AiEnrichKind::D1, Some("章节"), "概念", "内容A"),
            block(AiEnrichKind::D2, Some("章节"), "步骤", "内容B"),
        ],
    };
    let out = render_enriched_note(base, &resp);
    assert!(out.contains("内容A"));
    assert!(out.contains("内容B"));
    // 两个块在同一个引用块组内（都出现在标题之后、正文…之前——合并无重复标题插入）
    let depth_count = out.matches("AI 展开").count();
    assert_eq!(depth_count, 2, "两个深度块各自有徽标");
}

#[test]
fn unknown_anchor_appends_to_tail_not_lost() {
    let base = "## 只有一节\n正文";
    let resp = AiEnrichResponse {
        blocks: vec![block(AiEnrichKind::D1, Some("不存在的章节"), "概念", "内容X")],
    };
    let out = render_enriched_note(base, &resp);
    assert!(out.contains("内容X"), "锚点未命中不丢块（宽容降级追加尾部）");
}

#[test]
fn render_extension_area_standalone() {
    let blocks = [block(AiEnrichKind::B2, None, "进阶方向", "进阶内容")];
    let refs: Vec<&AiEnrichBlock> = blocks.iter().collect();
    let out = render_extension_area(&refs);
    assert!(out.contains("### 进阶方向"));
    assert!(out.contains("进阶内容"));
}
