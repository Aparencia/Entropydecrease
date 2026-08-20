//! 知识补充混合落位（REQ-142，v0.8.0 M3）。
//!
//! @ai-context: 深度块按 anchor_ref 就近插入引用章节（## 标题）之下——
//!              "AI 展开"徽标 + 引用风边框（blockquote）+ 溯源锚点；
//!              广度块聚合笔记尾部"扩展区"（各自成节 + "AI 补充·非课程
//!              内容·需核实"徽标——物理隔离）；删除/重补=新版本（REQ-144
//!              消费，本版落位为内容层——块删除由用户编辑/回滚承担）。
//! @ai-context: 纯函数可单测；锚点未命中 → 追加尾部（宽容降级不丢块——
//!              本地优先铁律的落位侧体现；规划"本地版可用标题粗锚点"）。

use crate::ai_enrich_protocol::{AiEnrichBlock, AiEnrichResponse};

/// 深度块渲染（引用风边框 + AI 展开徽标 + 溯源锚点）。
pub fn render_depth_block(block: &AiEnrichBlock) -> String {
    let anchor = block.anchor_ref.as_deref().unwrap_or("");
    let mut out = format!(
        "> 📌 **AI 展开（{}）** · 关联「{}」\n",
        block.kind.label(),
        anchor
    );
    for line in block.content.lines() {
        out.push_str("> ");
        out.push_str(line.trim_end());
        out.push('\n');
    }
    out
}

/// 广度扩展区渲染（尾部聚合：整体徽标 + 需核实标注 + 各自成节）。
pub fn render_extension_area(blocks: &[&AiEnrichBlock]) -> String {
    let mut out = String::new();
    out.push_str("\n\n---\n\n## 📚 AI 补充 · 非课程内容 · 需核实\n\n");
    out.push_str("> 以下内容由 AI 生成，属模型外部知识而非课程内容，请自行核实。\n\n");
    for b in blocks {
        out.push_str(&format!("### {}\n\n", b.heading.trim()));
        for line in b.content.lines() {
            out.push_str(line.trim_end());
            out.push('\n');
        }
        out.push('\n');
    }
    out
}

/// 混合落位总入口：深度块插入引用章节之下，广度块聚合尾部扩展区。
///
/// @ai-context: 顺序保持：深度块按响应顺序逐锚点插入（同锚点合并一个
///              引用块，防重复边框）；广度块按响应顺序成节。
pub fn render_enriched_note(base: &str, response: &AiEnrichResponse) -> String {
    let mut out = base.trim_end().to_string();
    // ① 深度块：按锚点分组（保持出现顺序），逐锚点就近插入
    let depth: Vec<&AiEnrichBlock> =
        response.blocks.iter().filter(|b| b.kind.is_depth()).collect();
    if !depth.is_empty() {
        let mut anchors: Vec<(String, Vec<&AiEnrichBlock>)> = Vec::new();
        for b in &depth {
            let key = b.anchor_ref.clone().unwrap_or_default();
            match anchors.iter_mut().find(|(k, _)| *k == key) {
                Some((_, group)) => group.push(b),
                None => anchors.push((key, vec![b])),
            }
        }
        for (anchor, group) in anchors {
            let mut rendered = String::new();
            for b in &group {
                rendered.push_str(&render_depth_block(b));
            }
            out = insert_after_heading(&out, &anchor, &rendered);
        }
    }
    // ② 广度块：聚合尾部扩展区（物理隔离 + 徽标）
    let breadth: Vec<&AiEnrichBlock> =
        response.blocks.iter().filter(|b| b.kind.is_breadth()).collect();
    if !breadth.is_empty() {
        out.push_str(&render_extension_area(&breadth));
    }
    out
}

/// 在 `# {anchor}` / `## {anchor}` 标题行后插入内容；锚点未命中 → 追加尾部。
fn insert_after_heading(markdown: &str, anchor: &str, insert: &str) -> String {
    let anchor = anchor.trim();
    if anchor.is_empty() {
        return format!("{}\n\n{}", markdown, insert);
    }
    let pos = markdown.lines().position(|l| {
        let t = l.trim_end();
        t == format!("## {}", anchor)
            || t == format!("# {}", anchor)
            || t.strip_prefix("## ").map(|s| s.trim()) == Some(anchor)
    });
    match pos {
        Some(idx) => {
            let mut out = String::new();
            for (i, line) in markdown.lines().enumerate() {
                out.push_str(line);
                out.push('\n');
                if i == idx {
                    out.push('\n');
                    out.push_str(insert);
                    out.push('\n');
                }
            }
            out
        }
        // 锚点未命中 → 追加尾部（宽容降级不丢块）
        None => format!("{}\n\n{}", markdown, insert),
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "enrich_placement_tests.rs"]
mod tests;
