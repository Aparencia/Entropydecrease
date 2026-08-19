//! 视频系列（合集）检测（REQ-152 / v0.7.2：标题序列号提取与平台后缀剥离）。
//!
//! @ai-context: 从窗口标题/文件名剥离"系列名 + 集号"（B站分P `P3`/`第3集`/`EP03`/
//!              `（2）`/数字后缀 `03` 等），供档案检测**系列名投票**、记忆偏好
//!              **系列键**、课程分组使用——同一系列的 P1/P5 标题不同导致的投票
//!              漂移与记忆失配，是检测准确度的真实短板（Foresight 头脑风暴
//!              brainstorming-video-profile-detection.md，根因 6）。
//! @ai-context: 纯逻辑模块（无 IO/DB），决策矩阵可注入 fake 标题单测（AAA）；
//!              五模式按优先级匹配、命中即返回、全部未命中 → None 诚实不识别；
//!              边界反例（`Python3`/`2026`/`UP主`/序号开头）必须挡掉——误判
//!              比漏判更伤（会把普通标题错分系列导致记忆串台）。

/// 系列信息（extract_series 产出）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesInfo {
    /// 系列名（剥离序号与平台后缀后的标题公共部分）
    pub series: String,
    /// 集号（可解析为数字时 Some；"第X话"中文数字也会规范化）
    pub episode: Option<u32>,
}

/// 平台后缀剥离表（窗口标题常见形态；命中剥离，未命中原样返回）。
const PLATFORM_SUFFIXES: &[&str] = &[
    "_哔哩哔哩_bilibili",
    " - YouTube",
    " - 腾讯视频",
    "_爱奇艺",
    " - 优酷",
    " - 芒果TV",
    " - 西瓜视频",
    " - 抖音",
];

/// 模式 2 集号后缀（中文"第X"式；**不含"章节讲课部分"**——course_of 的
/// "第X章"分组语义保留现状零回归，series 检测只管集/话/期/回）。
const EPISODE_UNITS: &str = "集话期回";

/// 标题预处理：剥离平台后缀（窗口标题污染源，必须先剥离再识别系列）。
pub fn normalize_title(title: &str) -> String {
    let t = title.trim();
    for suffix in PLATFORM_SUFFIXES {
        if let Some(rest) = t.strip_suffix(suffix) {
            let rest = rest.trim();
            if !rest.is_empty() {
                return rest.to_string();
            }
        }
    }
    t.to_string()
}

/// 序号识别（五模式按优先级，命中即返回；全部未命中 → None 诚实不识别）。
///
/// @ai-context: 模式顺序：P 分P（B站最常见）→ 第X集 → EP → 括号序号 → 数字后缀；
///              系列名 = 序号之前部分去尾分隔符；序号在开头 → 系列名为空 → 放弃
///              （取不到公共部分，诚实降级走现状路径）。
pub fn extract_series(title: &str) -> Option<SeriesInfo> {
    let t = normalize_title(title);
    if t.chars().count() < 2 {
        return None;
    }
    if let Some((series, ep)) = match_p_episode(&t) {
        return Some(SeriesInfo { series, episode: Some(ep) });
    }
    if let Some((series, ep)) = match_cn_episode(&t) {
        return Some(SeriesInfo { series, episode: ep });
    }
    if let Some((series, ep)) = match_ep_prefix(&t) {
        return Some(SeriesInfo { series, episode: Some(ep) });
    }
    if let Some((series, ep)) = match_bracket_suffix(&t) {
        return Some(SeriesInfo { series, episode: ep });
    }
    if let Some((series, ep)) = match_numeric_suffix(&t) {
        return Some(SeriesInfo { series, episode: Some(ep) });
    }
    None
}

/// 边界字符判定（P 前须为边界，防 `UP主`/`C#P` 误判）。
fn is_boundary(c: char) -> bool {
    c.is_whitespace() || "-_·.，,。、()（）【】[]".contains(c)
}

/// 系列名尾部分隔符清理（"零基础化妆 -" → "零基础化妆"）。
fn trim_trailing_sep(s: &str) -> String {
    let trimmed = s.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    let mut end = chars.len();
    while end > 0 && is_boundary(chars[end - 1]) {
        end -= 1;
    }
    chars[..end].iter().collect::<String>().trim().to_string()
}

/// 模式 1：B站分P——`xxx P3` / `xxx P 12`（P 前须为边界；数字 1-3 位）。
fn match_p_episode(t: &str) -> Option<(String, u32)> {
    let chars: Vec<char> = t.chars().collect();
    for i in 0..chars.len() {
        if (chars[i] == 'P' || chars[i] == 'p') && (i == 0 || is_boundary(chars[i - 1])) {
            let mut j = i + 1;
            while j < chars.len() && chars[j] == ' ' {
                j += 1;
            }
            let mut k = j;
            while k < chars.len() && chars[k].is_ascii_digit() {
                k += 1;
            }
            if k > j && k - j <= 3 {
                let ep: u32 = chars[j..k].iter().collect::<String>().parse().ok()?;
                let series = trim_trailing_sep(&chars[..i].iter().collect::<String>());
                if series.chars().count() >= 2 {
                    return Some((series, ep));
                }
            }
        }
    }
    None
}

/// 中文数字判定（模式 2 与 normalize_episode 共用；含"零"）。
pub(crate) fn is_cjk_num_char(c: char) -> bool {
    "零〇一二三四五六七八九十百".contains(c)
}

/// 模式 2：中文集号——`xxx 第3集` / `xxx 第十二话`（后缀：集/话/期/回）。
fn match_cn_episode(t: &str) -> Option<(String, Option<u32>)> {
    let chars: Vec<char> = t.chars().collect();
    for i in 0..chars.len() {
        if chars[i] == '第' {
            let mut j = i + 1;
            while j < chars.len() && (chars[j].is_ascii_digit() || is_cjk_num_char(chars[j])) {
                j += 1;
            }
            if j > i + 1 && j < chars.len() && EPISODE_UNITS.contains(chars[j]) {
                let num_str: String = chars[i + 1..j].iter().collect();
                let episode = normalize_episode(&num_str);
                let series = trim_trailing_sep(&chars[..i].iter().collect::<String>());
                if series.chars().count() >= 2 {
                    return Some((series, episode));
                }
            }
        }
    }
    None
}

/// 模式 3：EP 前缀——`xxx EP03` / `xxx EP12` / `xxx E12`（单 E 需 ≥2 位数字防误判）。
fn match_ep_prefix(t: &str) -> Option<(String, u32)> {
    let chars: Vec<char> = t.chars().collect();
    for i in 0..chars.len() {
        // EP（任意大小写组合）后跟 1-3 位数字；EP 前须为边界
        let ep = (i + 1 < chars.len())
            && ((chars[i] == 'E' && chars[i + 1] == 'P')
                || (chars[i] == 'e' && chars[i + 1] == 'p')
                || (chars[i] == 'E' && chars[i + 1] == 'p')
                || (chars[i] == 'e' && chars[i + 1] == 'P'));
        if ep && (i == 0 || is_boundary(chars[i - 1])) {
            let mut k = i + 2;
            while k < chars.len() && chars[k].is_ascii_digit() {
                k += 1;
            }
            if k > i + 2 && k - (i + 2) <= 3 {
                let ep_num: u32 = chars[i + 2..k].iter().collect::<String>().parse().ok()?;
                let series = trim_trailing_sep(&chars[..i].iter().collect::<String>());
                if series.chars().count() >= 2 {
                    return Some((series, ep_num));
                }
            }
            continue; // EP 已尝试（无论成败），不落单 E 分支
        }
        // 单 E/e + 2-3 位数字（1 位太易误判，如 "E3"）
        if (chars[i] == 'E' || chars[i] == 'e')
            && (i == 0 || is_boundary(chars[i - 1]))
            && i + 1 < chars.len()
            && chars[i + 1].is_ascii_digit()
        {
            let mut k = i + 1;
            while k < chars.len() && chars[k].is_ascii_digit() {
                k += 1;
            }
            if k - (i + 1) >= 2 && k - (i + 1) <= 3 {
                let ep_num: u32 = chars[i + 1..k].iter().collect::<String>().parse().ok()?;
                let series = trim_trailing_sep(&chars[..i].iter().collect::<String>());
                if series.chars().count() >= 2 {
                    return Some((series, ep_num));
                }
            }
        }
    }
    None
}

/// 模式 4：尾部括号序号——`xxx（2）` / `xxx(2)` / `xxx【3】` / `xxx[3]`。
fn match_bracket_suffix(t: &str) -> Option<(String, Option<u32>)> {
    let chars: Vec<char> = t.chars().collect();
    let len = chars.len();
    // 找尾部配对括号（最后一对）
    let close = chars[..].iter().rposition(|c| "）)]】".contains(*c))?;
    if close + 1 != len {
        return None; // 括号后还有内容（如 "（2）合集"）→ 不按尾部序号处理
    }
    let open = chars[..close].iter().rposition(|c| "（([【".contains(*c))?;
    let inner: String = chars[open + 1..close].iter().collect();
    // 括号内纯数字（1-3 位）才当集号（"（2024）"年份 4 位排除；"（1/3）"含斜杠排除）
    if inner.is_empty()
        || inner.chars().count() > 3
        || !inner.chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let episode = inner.parse::<u32>().ok();
    let series = trim_trailing_sep(&chars[..open].iter().collect::<String>());
    if series.chars().count() >= 2 {
        Some((series, episode))
    } else {
        None
    }
}

/// 模式 5：尾部数字后缀——`xxx 03` / `xxx-03` / `xxx_03`（2-3 位，前置分隔符）。
fn match_numeric_suffix(t: &str) -> Option<(String, u32)> {
    let chars: Vec<char> = t.chars().collect();
    let len = chars.len();
    // 尾部连续数字（2-3 位；1 位太易误判如 "教程1"）
    let mut start = len;
    while start > 0 && chars[start - 1].is_ascii_digit() {
        start -= 1;
    }
    let digits = len - start;
    if !(2..=3).contains(&digits) || start == 0 {
        return None;
    }
    // 前置必须是分隔符（空格/连字符/下划线），防 "Python3"/"Win11" 紧贴误判
    if !is_boundary(chars[start - 1]) {
        return None;
    }
    let ep: u32 = chars[start..len].iter().collect::<String>().parse().ok()?;
    let series = trim_trailing_sep(&chars[..start - 1].iter().collect::<String>());
    if series.chars().count() >= 2 {
        Some((series, ep))
    } else {
        None
    }
}

/// 中文数字 → 值映射（显式表——Unicode 码点不连续（'二'=U+4E8C 在 '九'=U+4E5D 之后），
/// 不可用 range 相减推算（'三'-'一'=9 会算出 10））。
const CJK_DIGIT_VALUES: &[(char, u32)] = &[
    ('一', 1), ('二', 2), ('三', 3), ('四', 4), ('五', 5),
    ('六', 6), ('七', 7), ('八', 8), ('九', 9),
];

/// 集号规范化：阿拉伯数字直出；中文数字转阿拉伯（"十二"→12，"二十三"→23，"十"→10）。
pub fn normalize_episode(s: &str) -> Option<u32> {
    if s.is_empty() {
        return None;
    }
    if s.chars().all(|c| c.is_ascii_digit()) {
        return s.parse().ok();
    }
    let mut total = 0u32;
    let mut section = 0u32;
    for c in s.chars() {
        if let Some(v) = CJK_DIGIT_VALUES.iter().find(|(ch, _)| *ch == c) {
            section = v.1;
        } else {
            match c {
                '零' | '〇' => {}
                '十' => {
                    total += if section == 0 { 10 } else { section * 10 };
                    section = 0;
                }
                '百' => {
                    total += if section == 0 { 100 } else { section * 100 };
                    section = 0;
                }
                _ => return None,
            }
        }
    }
    total += section;
    if total == 0 {
        None
    } else {
        Some(total)
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "series_detect_tests.rs"]
mod tests;
