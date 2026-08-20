//! 结巴/叠字折叠与术语替换（REQ-164 / v0.7.5）。
//!
//! @ai-context: ASR 口语转写常见"结巴"（甲甲甲方的项目/可行行研究）与术语
//!              缺字（搭建项目班→项目班子）——纯规则折叠与替换，免 AI。
//! @ai-context: 可逆契约：只产出加工版文本，原料层 segments 表不动（与
//!              verbal_normalize 同契约——净化只作用于产物层）。
//! @ai-context: 白名单保护合法叠词（慢慢/常常/好好）——折叠只作用于连续
//!              ≥3 同字，2 连叠词天然安全；白名单登记防未来规则误伤。
//! @ai-context: 术语替换保守原则：替换只在目标词不会产生二次误伤时生效
//!              （"项目班子"已含"项目班"——后随 子/组 时跳过不替换）。

/// 合法叠词白名单（连续 2 次重复不折叠；登记教学语境常见叠词——折叠规则
/// 未来若扩展到 2 连时据此豁免，避免"慢慢/常常/好好"被误折）。
const REDUPLICATION_WHITELIST: &[&str] = &[
    "慢慢", "常常", "好好", "等等", "谢谢", "看看", "试试", "想想", "说说",
];

/// 术语替换种子表（会话31 实证驱动；from → to）。
///
/// @ai-context: 只收录"口语缺字且教学语境几乎必为完整词"的种子；替换经
///              apply_term_replacements 的守卫（后随字符）防二次误伤。
const TERM_REPLACEMENTS: &[(&str, &str)] = &[
    // 会话31：「搭建项目班啊」→ 项目班子（PMP 术语完整形）
    ("项目班", "项目班子"),
    // 会话31：「做项目可行行研究」→ 可行性研究（2 连叠字，fold_stutter 不折叠）
    ("可行行研究", "可行性研究"),
];

/// 结巴折叠（纯函数）：连续 ≥3 个相同字符 → 保留 1 个。
///
/// @ai-context: "甲甲甲"→"甲"、"好好好"→"好"；"慢慢/常常"（2 连）天然不动；
///              白名单前缀保护：3-4 连且以白名单叠词开头（"慢慢慢"）不折——
///              叠词+强调尾字场景；≥5 连视为长结巴一律折叠。
pub fn fold_stutter(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let mut j = i + 1;
        while j < chars.len() && chars[j] == c {
            j += 1;
        }
        let run_len = j - i;
        if run_len >= 3 {
            // 白名单前缀保护（仅 3-4 连；≥5 连长结巴必折）。
            // 字符序列比较（禁 text[i..] 字节切片——CJK 多字节会 panic）
            let protected = run_len <= 4
                && REDUPLICATION_WHITELIST.iter().any(|w| {
                    let wc: Vec<char> = w.chars().collect();
                    wc.len() <= run_len && chars[i..i + wc.len()] == wc[..]
                });
            if !protected {
                out.push(c);
                i = j;
                continue;
            }
        }
        out.extend(chars[i..j].iter());
        i = j;
    }
    out
}

/// 术语替换（纯函数）：种子表顺序应用 + 后随守卫。
///
/// @ai-context: 守卫：替换后若紧接目标词首字（"项目班子"已含"项目班"）会
///              产生"项目班子子"类二次误伤——from 命中且后随 ∈ 守卫字符时跳过；
///              守卫字符按种子表登记（当前：子/组——项目班组也是完整词）。
fn apply_one(text: &str, from: &str, to: &str, guard: &[char]) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find(from) {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + from.len()..];
        let next = after.chars().next();
        if next.is_some_and(|c| guard.contains(&c)) {
            out.push_str(from);
        } else {
            out.push_str(to);
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

/// 术语替换入口（纯函数）：全部种子依次应用。
pub fn apply_term_replacements(text: &str) -> String {
    let mut out = text.to_string();
    // "可行行研究" 先于 "项目班"（无重叠，顺序无实质影响；长词优先防御）
    for (from, to) in TERM_REPLACEMENTS {
        let guard: Vec<char> = match *from {
            "项目班" => vec!['子', '组'],
            _ => Vec::new(),
        };
        out = apply_one(&out, from, to, &guard);
    }
    out
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "stutter_fold_tests.rs"]
mod tests;
