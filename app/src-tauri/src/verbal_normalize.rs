//! 口语书面化（REQ-045 / v0.5.0 M2，头脑风暴 B5：本地规则版）。
//!
//! @ai-context: 口播/网课档案支撑——语气词过滤、重复整理、标点恢复的纯规则实现。
//! @ai-context: **可逆性契约**：本模块只产出"加工版文本"（normalize），原文由调用方
//!              保留在原料层（SessionDetail.segments 不动）——产物层只读加工版。
//! @ai-context: 纯函数无 IO；语料单测覆盖语气词表/重复短语/标点边界。

/// 常见语气词/口语填充词（中文课堂口语高频；按需增补）。
const FILLER_WORDS: &[&str] = &[
    "嗯", "啊", "呃", "哦", "那个", "这个", "就是说", "就是说呢", "然后呢", "然后", "就是",
    "对吧", "是吧", "对不对", "对不对啊", "好不好", "你们知道吗", "大家注意", "大家看",
    "嗯嗯", "诶", "哎", "哈", "哈哈", "那个那个", "咱们", "我们看", "我们来看", "接下来呢",
];

/// 重复短语整理阈值：连续重复 ≥2 次压缩为 1 次（"对对对"→"对"）。
const REPEAT_MIN_COUNT: usize = 2;

/// 书面化强度档位（与档案 postprocess_rules.verbal_normalize 联动）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NormalizeStrength {
    /// 轻：仅过滤句首/句尾语气词（保守，保真优先）
    Light,
    /// 标准：语气词 + 重复整理 + 标点恢复（默认）
    Standard,
    /// 强：再加连词精简（激进，适合口播摘要）
    Strong,
}

/// 书面化配置。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NormalizeConfig {
    pub strength: NormalizeStrength,
}

impl Default for NormalizeConfig {
    fn default() -> Self {
        Self { strength: NormalizeStrength::Standard }
    }
}

/// 口语文本 → 书面化文本（纯规则）。
///
/// @ai-context: 流程：① 全句语气词过滤（出现即删）→ ② 重复短语压缩 →
///              ③ 标点恢复（句末无标点补句号）→ ④ Strong 档连词精简。
/// @ai-context: 删除语气词可能产生连续空白——统一折叠为单空格（不改变原句顺序）。
pub fn normalize(text: &str, config: &NormalizeConfig) -> String {
    if text.trim().is_empty() {
        return String::new();
    }
    // ① 语气词过滤（全量替换为空）
    let mut out = text.to_string();
    for w in FILLER_WORDS {
        out = out.replace(w, "");
    }
    // ② 重复短语压缩：连续相同 2-4 字短语 ≥2 次 → 保留 1 次
    out = compress_repeats(&out, REPEAT_MIN_COUNT);
    // ③ 标点恢复：句末无终结标点 → 补句号
    out = restore_punctuation(&out);
    // ④ Strong：连词精简（"并且"→"并"、"，然后"→"，"等）
    if config.strength == NormalizeStrength::Strong {
        out = out.replace("并且", "并").replace("然后", "").replace("那么", "");
    }
    // 折叠空白（删除语气词产生的连续空格/首尾空格）
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 重复短语压缩（纯函数）：连续相同 2-4 字短语重复 ≥min 次 → 保留 1 次；
/// 单字重复（"对对对"/"哈哈哈"）需 ≥3 次才压缩（防误伤普通叠词如"人人"）。
///
/// @ai-context: 实现：逐位置尝试短语长度（4→2 优先长短语，最后 1 字），
///              向前统计连续重复次数；命中则删除后续重复实例。中文口语重复高频。
fn compress_repeats(text: &str, min: usize) -> String {
    if text.chars().count() < 2 {
        return text.to_string();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let mut matched = false;
        // 从长到短尝试短语长度（4→2），单字最后尝试且需 ≥3 次
        for len in (2..=4).rev() {
            if i + len > chars.len() {
                continue;
            }
            let phrase: String = chars[i..i + len].iter().collect();
            // 向前数连续重复次数
            let mut count = 1;
            let mut j = i + len;
            while j + len <= chars.len() {
                let next: String = chars[j..j + len].iter().collect();
                if next == phrase {
                    count += 1;
                    j += len;
                } else {
                    break;
                }
            }
            if count >= min {
                out.push_str(&phrase);
                i = j;
                matched = true;
                break;
            }
        }
        if !matched {
            // 单字重复（≥3 次）压缩为 1 字
            let c = chars[i];
            let mut count = 1;
            let mut j = i + 1;
            while j < chars.len() && chars[j] == c {
                count += 1;
                j += 1;
            }
            if count >= 3 {
                out.push(c);
                i = j;
            } else {
                out.push(c);
                i += 1;
            }
        }
    }
    out
}

/// 标点恢复（纯函数）：句末无终结标点（。！？…）→ 补句号；连续空白折叠。
fn restore_punctuation(text: &str) -> String {
    let trimmed = text.trim_end();
    if trimmed.is_empty() {
        return String::new();
    }
    let last = trimmed.chars().last().unwrap_or_default();
    if "。！？…".contains(last) {
        trimmed.to_string()
    } else {
        format!("{}。", trimmed)
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "verbal_normalize_tests.rs"]
mod tests;
