//! AI 精修输入锚点剥离（v0.11.5 spec 7️⃣，纯函数，只依赖 std）。
//!
//! @ai-context: 规则草稿含两类锚点：段落锚点 `[⏱ MM:SS]([[ts:ms]])`（段首）与
//!              章节锚点 `## 标题 [[⏱ MM:SS]([[ts:ms]])]`（外带 `[...]` 包裹）。
//!              精修输入剥离段落锚点（省 token）；章节锚点记录 (标题, ms)
//!              映射，输出合并后按标题精确匹配回挂。手写解析不引入 regex。

/// 毫秒 → `[⏱ MM:SS]([[ts:ms]])`（与 concat::format_timestamp 同格式）。
fn format_timestamp(ms: u64) -> String {
    let total = ms / 1000;
    format!("[⏱ {:02}:{:02}]([[ts:{}]])", total / 60, total % 60, ms)
}

/// 剥离全部时间戳锚点（段落锚点完全移除；章节锚点保留标题，见 with_map）。
pub fn strip_anchors(markdown: &str) -> String {
    strip_anchors_with_map(markdown).0
}

/// 剥离锚点并收集章节锚点映射（标题 → 时间戳 ms）。
pub fn strip_anchors_with_map(markdown: &str) -> (String, Vec<(String, u64)>) {
    let mut out = String::new();
    let mut anchors: Vec<(String, u64)> = Vec::new();
    for line in markdown.split('\n') {
        let (stripped, chapter) = strip_line(line);
        if stripped.is_empty() {
            continue; // 空行/纯锚点行跳过
        }
        if let Some((title, ms)) = chapter {
            out.push_str(stripped.trim_end());
            out.push('\n');
            anchors.push((title, ms));
        } else {
            out.push_str(&stripped);
            out.push_str(if line.contains("[[ts:") { "\n\n" } else { "\n" });
        }
    }
    (out, anchors)
}

/// 章节锚点回挂：`## 标题` 行精确匹配（大小写敏感）后挂回 ` [[⏱ ...]]`。
pub fn reattach_chapter_anchors(markdown: &str, anchors: &[(String, u64)]) -> String {
    if anchors.is_empty() {
        return markdown.to_string();
    }
    let mut lines: Vec<String> = markdown.lines().map(str::to_string).collect();
    for (title, ms) in anchors {
        let target = format!("## {}", title);
        for line in lines.iter_mut() {
            // 已含锚点行跳过（防重复挂）；未匹配不挂（诚实降级——宁缺勿错）
            if line.contains("[[ts:") {
                continue;
            }
            if line.trim() == target {
                *line = format!("{} [{}]", line.trim_end(), format_timestamp(*ms));
                break;
            }
        }
    }
    lines.join("\n")
}

/// 单行锚点剥离：返回 (剥离后行文本, 章节锚点映射)。
fn strip_line(line: &str) -> (String, Option<(String, u64)>) {
    let mut out = String::new();
    let mut cursor = 0usize;
    let mut chapter: Option<(String, u64)> = None;
    while let Some(rel) = line[cursor..].find("[[ts:") {
        let start = cursor + rel;
        let after = start + "[[ts:".len();
        let Some(end_rel) = line[after..].find("]]") else {
            out.push_str(&line[cursor..]); // 畸形锚点原样保留
            return (out, chapter);
        };
        let digits_end = after + end_rel;
        let ms = line[after..digits_end].parse::<u64>().unwrap_or(0);
        let anchor_end =
            digits_end + 2 + usize::from(line.as_bytes().get(digits_end + 2) == Some(&b')'));
        // 回溯 `[⏱`（无 → 畸形锚点原样保留）
        let Some(k) = line[..start]
            .rfind('[')
            .filter(|&k| line[k..].starts_with("[⏱"))
        else {
            out.push_str(&line[cursor..]);
            return (out, chapter);
        };
        // 章节形态 `[[⏱ ...]]`：span 含包裹括号并记录标题映射；段落形态
        // 锚点后空格（生成格式 `锚点 正文`）连空格剥除
        let wrap = k > 0 && line.as_bytes()[k - 1] == b'[';
        let (full_start, full_end) = if wrap && line[anchor_end..].starts_with(']') {
            (k - 1, anchor_end + 1)
        } else {
            (
                k,
                anchor_end + usize::from(line[anchor_end..].starts_with(' ')),
            )
        };
        out.push_str(&line[cursor..full_start]);
        if full_start < k {
            let head = line[..full_start].trim();
            chapter = head.strip_prefix("## ").map(|t| (t.trim().to_string(), ms));
        }
        cursor = full_end;
    }
    out.push_str(&line[cursor..]);
    (out, chapter)
}

/// 单测独立文件（AA 纯函数；anchor_strip.rs 保持 ≤100 行）。
#[cfg(test)]
#[path = "anchor_strip_tests.rs"]
mod tests;
