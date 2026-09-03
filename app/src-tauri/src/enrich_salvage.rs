//! 知识补充逐块审查与章节提取（REQ-142 v0.8.0 M3 + 2026-09 修复）。
//!
//! @ai-context: 2026-09 修复背景（会话 67/68 实证）：原 AiEnrichResponse::validate
//!              是"全有或全无"——任一深度块缺锚点即整批响应作废（未落任何补充
//!              内容）。但长笔记按行切片后中间片常不含 `##` 标题、模型只能"诚实"
//!              省略 anchor_ref，导致一次请求 9 个子项全军覆没。本模块把审查改为
//!              逐块进行（丢坏块保好块），并负责：
//!              1) 章节提取 chapter_titles_of：请求时给模型一份"可引用目录"（跨片
//!                 全局标题，去时间戳 chip），模型 anchor_ref 只能取自目录；
//!              2) 标题归一化 heading_text/normalize_title：落位匹配章节标题时忽略
//!                 `#` 前缀与 `[[⏱ ...]]` 时间戳 chip（渲染层章节标题常带 chip，
//!                 原精确匹配会让纯标题锚点 miss 而尾部兜底）；
//!              3) salvage_blocks 逐块审查：合规块保留、违规块丢弃并给原因；
//!                 全部不合规才整批失败（错误文案与原 validate 同口径）。
//! @ai-context: 深度块无锚点在"笔记全篇无章节"时放行（落尾部——语义对齐既有
//!              "锚点未命中追加尾部不丢块"宽容；渲染层给"未锚定"标注）；有章节
//!              目录仍缺锚点 = 模型违约 → 丢块保溯源红线（宁缺毋滥）。

use crate::ai_enrich_protocol::{
    AiEnrichBlock, AiEnrichKind, AiEnrichResponse, BLOCK_MAX_CHARS, BLOCKS_MAX,
};

/// 从 markdown 提取章节标题目录（保序、去重、去时间戳 chip）。
///
/// @ai-context: 供请求侧注入提示词（跨片全局目录：模型即使只见切片正文，
///              也能引用其他片/其他章节的真实标题）与落位侧匹配共用。
pub fn chapter_titles_of(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in markdown.lines() {
        if let Some(t) = heading_text(line) {
            if !out.contains(&t) {
                out.push(t);
            }
        }
    }
    out
}

/// 行是否为标题：提取纯标题文本（去 `#` 前缀与时间戳 chip）；非标题行返回 None。
///
/// @ai-context: ATX 标题 `#{1,6} `（井号后必须空白，防 `#️⃣` 等非标题行误判）；
///              仅剥离**行首**井号——标题正文若以 # 开头不受影响。
pub fn heading_text(line: &str) -> Option<String> {
    let t = line.trim();
    let hashes = t.bytes().take_while(|b| *b == b'#').count();
    if hashes == 0 || hashes > 6 || t.as_bytes().get(hashes) != Some(&b' ') {
        return None;
    }
    let title = strip_chip(&t[hashes..]);
    let title = title.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

/// 归一化标题/锚点文本：去 `#` 前缀、去时间戳 chip、压缩两侧空白。
///
/// @ai-context: 锚点可能被模型原样复制（带 `## ` 或带 ` [[⏱ ...]]` chip），
///              匹配前统一归一化——溯源匹配只看"标题文本"本身。
pub fn normalize_title(s: &str) -> String {
    let t = strip_chip(s.trim().trim_start_matches('#').trim());
    t.trim().to_string()
}

/// 剥离行尾时间戳 chip ` [[⏱ MM:SS]([[ts:ms]])]`（章节锚点形态，anchor_strip.rs
/// 同格式；标题正文含 "[⏱" 文本的概率可忽略，按 chip 处理）。
///
/// @ai-context: 章节 chip 外带包裹括号 `[ [...] ]`——find("[⏱") 定位在内层
///              `[⏱`，须继续回退跳过其前可能的外层 `[` 与空格（实证：只切
///              到内层会残留 "标题 ["）。
pub fn strip_chip(title: &str) -> String {
    match title.find("[⏱") {
        Some(i) => {
            let b = title.as_bytes();
            let mut j = i;
            while j > 0 && (b[j - 1] == b' ' || b[j - 1] == b'[') {
                j -= 1;
            }
            title[..j].trim_end().to_string()
        }
        None => title.to_string(),
    }
}

/// 逐块审查结果：可落块 + 丢弃原因（逐条人类可读；UI 明示"哪些块为何未落"）。
#[derive(Debug)]
pub struct SalvageOutcome {
    pub kept: Vec<AiEnrichBlock>,
    pub dropped_reasons: Vec<String>,
}

/// 逐块审查（纯函数）：结构性整体错误 → Err（整批不落）；单块违规 → 丢块留原因。
///
/// @ai-context: 与 AiEnrichResponse::validate（全量强校验契约）并存：
///              validate=协议快照/测试契约（任一违规即拒整批）；salvage_blocks=
///              运行时策略（坏块隔离，好块照落——AI 一个块不合规不该连坐其余块）。
/// @ai-context: 丢弃规则：kind 未勾选/置信度越界/标题或内容空或超长（块级格式
///              坏）/B6 含 URL（防幻觉红线）/广度块带锚点（扩展区契约）；深度块
///              缺锚点仅在"目录含章节"时丢（模型违约）——目录为空放行落尾部。
pub fn salvage_blocks(
    response: AiEnrichResponse,
    selected: &[AiEnrichKind],
    chapters: &[String],
) -> Result<SalvageOutcome, String> {
    let blocks = response.blocks;
    if blocks.is_empty() {
        return Err("补充响应缺少内容块".to_string());
    }
    if blocks.len() > BLOCKS_MAX {
        return Err(format!("补充块数超上限（{} > {}）", blocks.len(), BLOCKS_MAX));
    }
    let mut kept: Vec<AiEnrichBlock> = Vec::new();
    let mut dropped_reasons: Vec<String> = Vec::new();
    for b in blocks {
        let kind = b.kind;
        let label = kind.label();
        if !selected.contains(&kind) {
            dropped_reasons.push(format!("返回了未请求的子项「{}」", label));
            continue;
        }
        if !(0.0..=1.0).contains(&b.confidence) {
            dropped_reasons.push(format!("「{}」置信度越界（{}）", label, b.confidence));
            continue;
        }
        let heading = b.heading.trim();
        if heading.is_empty() || heading.chars().count() > 200 {
            dropped_reasons.push(format!("「{}」标题为空或超长", label));
            continue;
        }
        let content = b.content.trim();
        if content.is_empty() || content.chars().count() > BLOCK_MAX_CHARS {
            dropped_reasons.push(format!("「{}」内容为空或超长（>{} 字）", label, BLOCK_MAX_CHARS));
            continue;
        }
        let anchor = b.anchor_ref.as_deref().map(str::trim).unwrap_or("");
        if kind.is_depth() && anchor.is_empty() {
            if chapters.is_empty() {
                // 笔记全篇无章节：无法溯源是结构使然——放行，落位层落尾部并标注
                kept.push(b);
            } else {
                dropped_reasons.push(format!(
                    "深度块「{}」缺少锚点引用（笔记含 {} 个章节——模型须引用其一）",
                    label,
                    chapters.len()
                ));
            }
            continue;
        }
        if kind.is_breadth() && !anchor.is_empty() {
            dropped_reasons.push(format!("广度块「{}」不应携带锚点（聚合扩展区）", label));
            continue;
        }
        if kind == AiEnrichKind::B6 && contains_url(content) {
            dropped_reasons.push("资源推荐（b6）含链接——防幻觉红线（仅保留标题/书名）".to_string());
            continue;
        }
        kept.push(b);
    }
    if kept.is_empty() {
        // 全批无一块可落：整批失败（错误原因取首条——与原 validate 文案同口径）
        return Err(dropped_reasons
            .into_iter()
            .next()
            .unwrap_or_else(|| "补充内容全部不合规".to_string()));
    }
    Ok(SalvageOutcome {
        kept,
        dropped_reasons,
    })
}

/// 是否含 URL 模式（B6 防幻觉：http(s)/www 前缀；与协议 validate 同规则）。
fn contains_url(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.contains("http://") || lower.contains("https://") || lower.contains("www.")
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "enrich_salvage_tests.rs"]
mod tests;
