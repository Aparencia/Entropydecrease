//! 诊断日志脱敏（REQ-106，TRUST-4）。
//!
//! @ai-context: 课堂助手的诊断日志（eprintln）可能输出屏幕 OCR 识别文本、会话/窗口标题等
//!              用户学习内容。产品"本地优先、数据不出本机"是架构属性，但日志一旦被
//!              收集/上报即成为外泄通道，故在日志出口统一过滤。本模块为纯函数
//!              （无副作用、无 IO），规则保守：只脱敏"识别文本类"内容，
//!              错误信息（诊断必需）不误伤。
//! @ai-context: 规则决策（2026-08，REQ-106）：
//!              ① 引号内文本：引号包裹且内容含 CJK（会话标题/OCR 单句/窗口标题，
//!                 Debug 格式 {:?} 自带引号）或内容 ≥30 字符（引号内长英文散文）→ 脱敏；
//!              ② 连续 CJK run ≥30 字符（转写/OCR 长文本，日志中常不带引号）→ 脱敏；
//!              ③ 疑似 URL（http/https/www. 起始段）→ 脱敏。
//!              文件路径整体保留（定位数据/模型文件是诊断必需，与"错误信息不误伤"一致）；
//!              含 CJK 的引号路径会被规则 ① 保守脱敏——安全优先的过度脱敏，可接受。

/// 脱敏替换文本（与需求文档口径一致）。
const REDACTED: &str = "[redacted]";
/// 连续 CJK run 脱敏阈值（字符数）：低于阈值视为短语/错误信息片段，不脱敏。
const LONG_CJK_MIN: usize = 30;
/// 引号内文本脱敏阈值（字符数）：超过视为长散文/文本段（非短标识符/路径）。
const QUOTED_LONG_MIN: usize = 30;

/// 判断字符是否属于 CJK 文本类（汉字 + CJK 标点 + 全角字符）。
///
/// @ai-context: 全角范围含全角数字/字母（如"第３讲"），并入 run 避免长文本被
///              ASCII 字符从中截断成多个短 run 导致漏脱敏。
fn is_cjk_text_char(c: char) -> bool {
    matches!(
        c,
        '\u{3400}'..='\u{4DBF}'   // CJK 扩展 A
            | '\u{4E00}'..='\u{9FFF}' // 基本汉字
            | '\u{3000}'..='\u{303F}' // CJK 标点（、。《》「」等）
            | '\u{FF00}'..='\u{FFEF}' // 全角形式（，。！？（）第３讲）
    )
}

/// 引号配对：开引号 → 对应闭引号（None = 非引号字符）。
///
/// @ai-context: 同时覆盖 ASCII 引号与中文引号（Debug 格式与手写日志都可能出现）。
fn quote_pair(open: char) -> Option<char> {
    Some(match open {
        '"' | '\'' => open,
        '\u{201C}' => '\u{201D}', // “ ”
        '\u{2018}' => '\u{2019}', // ‘ ’
        '\u{300C}' => '\u{300D}', // 「 」
        _ => return None,
    })
}

/// 规则②：连续 CJK run ≥ 阈值 → 替换为 `[redacted]`（run 前后内容保留）。
///
/// @ai-context: 转写/OCR 长文本在日志中常不带引号（如 `[ScreenWorker] OCR: 今天这节课…`），
///              错误消息中的短中文片段（如"降级: 低置信"）长度远低于阈值，不会被误伤。
fn redact_long_cjk(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut run = String::new();
    let flush = |out: &mut String, run: &mut String| {
        if run.chars().count() >= LONG_CJK_MIN {
            out.push_str(REDACTED);
        } else {
            out.push_str(run);
        }
        run.clear();
    };
    for c in line.chars() {
        if is_cjk_text_char(c) {
            run.push(c);
        } else {
            flush(&mut out, &mut run);
            out.push(c);
        }
    }
    flush(&mut out, &mut run);
    out
}

/// 规则①：引号内"识别文本类"内容 → 内容替换为 `[redacted]`（引号保留）。
///
/// @ai-context: 判定 = 内容含 CJK（会话标题/OCR 单句/窗口标题）或内容 ≥ QUOTED_LONG_MIN
///              （引号内长英文散文）；ASCII 短标识符/路径（如 `"ok"`、`"model.onnx"`）
///              不脱敏——错误信息中的引号路径是诊断必需。未闭合引号保守放行。
fn redact_quoted(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if let Some(close) = quote_pair(c) {
            // 找最近的闭引号；无论是否敏感都整体消费该引号段——
            // 否则闭引号会被当作下一个开引号重新配对（两段引号之间的内容被误吞）
            let end = chars[i + 1..].iter().position(|&x| x == close);
            if let Some(rel) = end {
                let content: String = chars[i + 1..i + 1 + rel].iter().collect();
                let sensitive = content.chars().any(is_cjk_text_char)
                    || content.chars().count() >= QUOTED_LONG_MIN;
                out.push(c);
                if sensitive {
                    out.push_str(REDACTED);
                } else {
                    out.push_str(&content);
                }
                out.push(close);
                i += rel + 2;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

/// 规则③：疑似 URL（http/https/www. 起始段）→ 替换为 `[redacted]`。
///
/// @ai-context: 消费到空白/引号/常见结束标点为止；普通日志不含 URL，零误伤风险。
fn redact_url(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < chars.len() {
        let scheme_len = if starts_with_at(&chars, i, "https://") {
            Some(8)
        } else if starts_with_at(&chars, i, "http://") {
            Some(7)
        } else if starts_with_at(&chars, i, "www.") {
            Some(4)
        } else {
            None
        };
        if let Some(skip) = scheme_len {
            let mut j = i + skip;
            while j < chars.len() {
                let c = chars[j];
                if c.is_whitespace()
                    || matches!(c, '"' | '\'' | '\u{201C}' | '\u{201D}' | ')' | ']' | ',' | ';')
                {
                    break;
                }
                j += 1;
            }
            out.push_str(REDACTED);
            i = j;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// chars[i..] 是否以 pattern 开头（越界安全）。
fn starts_with_at(chars: &[char], i: usize, pattern: &str) -> bool {
    pattern.chars().enumerate().all(|(k, pc)| chars.get(i + k) == Some(&pc))
}

/// 完整脱敏管线：长 CJK → 引号内文本 → URL。
///
/// @ai-context: 顺序固定：长 CJK 先替换（引号内长文本已被整体脱敏，后续规则不重复处理），
///              再处理引号内短文本（会话标题），最后处理 URL（短 ASCII URL 不被前两规则命中）。
/// @param line - 单行诊断日志原文（无换行语义；调用方负责逐行调用）
/// @returns 脱敏后的日志行
pub fn redact_log(line: &str) -> String {
    if line.is_empty() {
        return String::new();
    }
    let step1 = redact_long_cjk(line);
    let step2 = redact_quoted(&step1);
    redact_url(&step2)
}

/// 日志出口入口（逐行包裹语义命名），内部委托 redact_log 完整管线。
///
/// @ai-context: 调用点（eprintln 包裹 text/title 变量）统一使用本函数——命名与
///              "对一行日志脱敏"的用法一致；等价于 redact_log。
pub fn redact_line(line: &str) -> String {
    redact_log(line)
}

#[cfg(test)]
#[path = "log_redact_tests.rs"]
mod tests;
