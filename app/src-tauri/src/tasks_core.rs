//! 任务行回写原子层（v0.20.3 / REQ-292 行动底座）。
//!
//! @ai-context: markdown 任务行为唯一真相（v1 不引入新符号）——解析/迁移/行替换
//!              全部收敛到本模块纯函数（前端勾选、行动中心裁决、未来通知多入口
//!              共用）；字符级迁移（NoteMarkdown 先例：勾选=只改 [ ]→[x]，正文
//!              其余字节不动——可逆、可 diff、不破坏用户排版）。
//! @ai-context: 识别形态：GFM `- [ ]`/`- [x]`（todo/done）+ 产物遗留行
//!              `- ☑️ 待办`（unrefined——行动中心「待提炼」区消费，裁决后
//!              提炼为标准任务行）。行号以换行切分为准（0 基）。
//! @ai-context: 纯逻辑无 IO——解析/迁移/替换全可单测（tasks_core_tests.rs）。

/// 任务状态（任务行标记侧）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Todo,
    Done,
}

/// 解析出的任务行信息。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTaskLine {
    pub status: TaskStatus,
    /// 是否产物遗留行（`- ☑️ 待办` 型——待提炼为任务行）
    pub unrefined: bool,
    /// 载荷文本（去前缀/勾选框后的正文；trim）
    pub payload: String,
}

/// 行首列表符号之一（-/*/+ 或有序 `1.`）；返回 (前缀跳过量, 符号后内容)。
fn split_marker(line: &str) -> Option<(usize, &str)> {
    let trimmed = line.trim_start();
    let lead = line.len() - trimmed.len();
    for p in ["- ", "* ", "+ "] {
        if let Some(rest) = trimmed.strip_prefix(p) {
            return Some((lead + p.len(), rest));
        }
    }
    // 有序列表：数字 + . / ) + 空格
    let bytes = trimmed.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i > 0 && i < trimmed.len() && matches!(bytes[i], b'.' | b')') && i + 1 < trimmed.len() && bytes[i + 1] == b' ' {
        return Some((lead + i + 2, &trimmed[i + 2..]));
    }
    None
}

/// 解析任务行（纯函数）：非任务行 → None。
///
/// @ai-context: GFM 勾选框以 `[ ]`/`[x]`/`[X]`（±空格）识别；`☑️` 前缀标记为
///              产物遗留（unrefined）；其余形态（任务符号在段落中间等）不猜。
pub fn parse_task_line(line: &str) -> Option<ParsedTaskLine> {
    let (skip, rest) = split_marker(line)?;
    let _ = skip;
    if let Some(after_box) = rest.strip_prefix("[ ]").or_else(|| rest.strip_prefix("[]")) {
        return Some(ParsedTaskLine {
            status: TaskStatus::Todo,
            unrefined: false,
            payload: after_box.trim().to_string(),
        });
    }
    if let Some(after_box) = rest.strip_prefix("[x]").or_else(|| rest.strip_prefix("[X]")) {
        return Some(ParsedTaskLine {
            status: TaskStatus::Done,
            unrefined: false,
            payload: after_box.trim().to_string(),
        });
    }
    if let Some(after) = rest.strip_prefix("☑️") {
        // 产物遗留行形如 `- ☑️ 待办 xxx`：待办为标记词（剥离），载荷=后续内容
        let after = after.trim_start();
        let after = after.strip_prefix("待办").map(|a| a.trim_start()).unwrap_or(after);
        return Some(ParsedTaskLine {
            status: TaskStatus::Todo,
            unrefined: true,
            payload: after.trim().to_string(),
        });
    }
    None
}

/// 迁移任务行状态（纯函数，字符级）：把原行勾选框改写为 to 对应形态；
/// 非任务行或目标即当前状态 → 原样返回。
pub fn migrate_status(line: &str, to: TaskStatus) -> Option<String> {
    let parsed = parse_task_line(line)?;
    if parsed.unrefined {
        return None; // 产物遗留行无勾选框——提炼（replace_line）而非迁移
    }
    let marker = match (parsed.status, to) {
        (TaskStatus::Done, TaskStatus::Todo) => "[ ]",
        (TaskStatus::Todo, TaskStatus::Done) => "[x]",
        (TaskStatus::Todo, TaskStatus::Todo) | (TaskStatus::Done, TaskStatus::Done) => return Some(line.to_string()),
    };
    let mut chars: Vec<char> = line.chars().collect();
    // 定位 `[` 索引（首个 `[` 前的空白与前缀保持不动——只换方括号内容）
    let start = line.find('[')?;
    let _ = &mut chars;
    let mut out = line.to_string();
    out.replace_range(start..start + 3, marker);
    Some(out)
}

/// 替换指定行（纯函数，0 基；body 以换行切分——行号越界 → None）。
pub fn replace_line(body: &str, line_no: usize, new_text: &str) -> Option<String> {
    let mut parts: Vec<&str> = body.split('\n').collect();
    if line_no >= parts.len() {
        return None;
    }
    parts[line_no] = new_text;
    Some(parts.join("\n"))
}

#[cfg(test)]
#[path = "tasks_core_tests.rs"]
mod tests;
