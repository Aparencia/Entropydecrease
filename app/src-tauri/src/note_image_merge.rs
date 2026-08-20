//! 精修版配图本地合并降级（REQ-141 丢图修复，2026-08-21 F1）。
//!
//! @ai-context: 规则版 markdown 含画面要点配图行（`- ![画面 N](session-images/..)`，
//!              由 note_filter::render_screen_points 生成）；AI 精修协议
//!              v1 无 image 块类型，模型可能丢弃配图行 → 精修版丢图。
//!              本模块为降级路径：AI 未保留配图时，把规则版配图行按章节
//!              合并回精修版（零模型成本，不丢不假）。协议 v2（F3）AI
//!              返回 image 块后，本路径仅在 AI 未返回时兜底。
//! @ai-context: 纯函数可单测；配图行识别用宽松模式（行含 session-images/ 且
//!              匹配 `- ![` 前缀——与前端渲染正则同口径，兼容缩进变体）。

/// 配图行前缀（规则版生成格式；前端渲染正则 `^\s*-\s*!\[` 同口径）。
const IMG_MARK: &str = "session-images/";

/// 从 markdown 提取配图行（保留原行文本；空输入 → 空向量）。
///
/// @ai-context: 只认列表项形态的配图行（`- ![` 前缀 + session-images/ 引用）；
///              其他形态（正文内嵌图等）不在规则版生成范围内，不处理。
pub fn extract_image_lines(markdown: &str) -> Vec<String> {
    markdown
        .lines()
        .filter(|l| {
            let t = l.trim_start();
            t.starts_with("- ![") && l.contains(IMG_MARK)
        })
        .map(|l| l.to_string())
        .collect()
}

/// 精修版是否已含配图行（AI 已保留/生成 → 本地合并跳过，不干预 AI 输出）。
pub fn has_image_lines(markdown: &str) -> bool {
    markdown.lines().any(|l| l.contains(IMG_MARK))
}

/// 把规则版配图行合并回精修版（降级路径总入口）。
///
/// @ai-context: 规则：① 规则版无配图 → 原样返回精修版；② 精修版已有配图
///              （AI 保留或 image 块渲染）→ 原样返回（AI 处理优先）；
///              ③ 否则把规则版配图行作为「画面要点」章节追加——
///              精修版已有 `## 画面要点` 章节则插入其标题之后，
///              无则文末追加新章节（配图是课程内容，精修=整理不创作
///              语义下必须保留）。
pub fn merge_rule_images(base_markdown: &str, refined_markdown: &str) -> String {
    let imgs = extract_image_lines(base_markdown);
    if imgs.is_empty() || has_image_lines(refined_markdown) {
        return refined_markdown.to_string();
    }
    let section = format!("## 画面要点\n\n{}\n", imgs.join("\n"));
    // 精修版已有画面要点章节 → 插入标题行后（保持章节内聚）
    let heading_pos = refined_markdown
        .lines()
        .position(|l| {
            let t = l.trim_end();
            t == "## 画面要点" || t == "## 画面要点 "
        });
    match heading_pos {
        Some(idx) => {
            let mut out = String::new();
            for (i, line) in refined_markdown.lines().enumerate() {
                out.push_str(line);
                out.push('\n');
                if i == idx {
                    out.push('\n');
                    out.push_str(&section);
                }
            }
            out
        }
        None => {
            let trimmed = refined_markdown.trim_end();
            format!("{}\n\n{}\n", trimmed, section)
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_image_merge_tests.rs"]
mod tests;
