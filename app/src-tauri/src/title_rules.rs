//! 会话标题规则层（REQ-282，v0.19.6）——零 AI 标题内容化 A 层纯函数。
//!
//! @ai-context: 痛点——抖音等客户端窗口标题固定「抖音」，连续采集多视频产生
//!              同名会话（用户反馈 #2）。本层三规则：① 来源名净化（剥平台
//!              尾缀：`视频名 - 抖音` → `视频名`）；② 同源去重（近 90 天同
//!              归一标题 → 追加「 #N」序号）；③ 首句升级（会话结束取首个
//!              稳定转写句 8–40 字作标题）。全部纯函数可单测；AI 标题建议
//!              （v0.19.8）在此层之上叠加，本层离线零依赖。
//!
//! @ai-context: title_kind 语义在 DB 层（source/manual）——自动升级仅当
//!              kind=source 时写（manual=用户已改名，永不被覆写）。

/// 平台尾缀品牌（v0.19.2 评分表同源白名单；只收"标题固定无内容"的平台）。
const BRAND_SUFFIXES: &[&str] = &["抖音", "douyin", "Douyin", "抖音短视频", "快手", "kuaishou"];
/// 品牌前分隔符（含空格变体——实测窗口标题 "视频 | 快手" 半角竖线带空格）。
const BRAND_SEPARATORS: &[&str] = &[" - ", " | ", "-", "｜", "|", "_"];

/// 剥离平台尾缀：仅当标题以「分隔符+品牌」结尾时剥除（`视频名 - 抖音` →
/// `视频名`；标题恰为「抖音」时原样返回——去重层负责加序号）。
pub fn normalize_source_title(raw: &str) -> String {
    let trimmed = raw.trim();
    for brand in BRAND_SUFFIXES {
        for sep in BRAND_SEPARATORS {
            let suffix = format!("{}{}", sep, brand);
            if trimmed.ends_with(&suffix) {
                return trimmed[..trimmed.len() - suffix.len()].trim().to_string();
            }
        }
    }
    trimmed.to_string()
}

/// 同源去重：existing 含 base → 追加「 #N」（N=现有最大后缀 +1，首个为 #2）。
///
/// @ai-context: 纯比较不猜测——只处理「恰好等于 base」与「base #N」两类；
///              与标题规范化解耦（调用方先 normalize 再入参）。
pub fn dedupe_title(existing: &[String], base: &str) -> String {
    if !existing.iter().any(|t| t == base) {
        return base.to_string();
    }
    let mut max = 1;
    for t in existing {
        if let Some(rest) = t.strip_prefix(base) {
            if let Some(num) = rest.strip_prefix(" #") {
                if let Ok(n) = num.parse::<u32>() {
                    max = max.max(n);
                }
            }
        }
    }
    format!("{} #{}", base, max + 1)
}

/// 标题长度下限/上限（截断基准，单位=字符）。
pub const TITLE_MIN_CHARS: usize = 8;
pub const TITLE_MAX_CHARS: usize = 40;

/// 取首个可用转写句作标题候选（首句升级规则）：
///
/// @ai-context: 可用=trim 后字符数 ∈ [8, 40]（8 下=口播碎句无信息；40 上截断）
///              且非纯符号；纯音乐/无文本/全为无效句 → None（不升级，诚实）。
///              输入=按时间序的段文本（字幕/语音/融合段同轴）。
pub fn first_line_title<'a>(lines: impl Iterator<Item = &'a str>) -> Option<String> {
    for line in lines {
        let cleaned = line.trim();
        if cleaned.is_empty() {
            continue;
        }
        let chars: Vec<char> = cleaned.chars().collect();
        if chars.len() < TITLE_MIN_CHARS {
            continue;
        }
        // 纯符号/标点句（无实义字符）跳过——防「。。。」/「♪♪♪」当标题
        if !chars.iter().any(|c| c.is_alphanumeric() || is_han(*c)) {
            continue;
        }
        let mut out: String = chars.into_iter().take(TITLE_MAX_CHARS).collect();
        if cleaned.chars().count() > TITLE_MAX_CHARS {
            out.push('…');
        }
        return Some(out);
    }
    None
}

fn is_han(c: char) -> bool {
    ('\u{4e00}'..='\u{9fff}').contains(&c)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(items: &[&str]) -> Vec<String> {
        items.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn normalize_strips_douyin_browser_suffix() {
        assert_eq!(normalize_source_title("眼影晕染教程 - 抖音"), "眼影晕染教程");
        assert_eq!(normalize_source_title("眼影晕染教程_抖音"), "眼影晕染教程");
        assert_eq!(normalize_source_title("视频 | 快手"), "视频");
    }

    #[test]
    fn normalize_keeps_bare_brand_as_base() {
        // 抖音客户端标题固定「抖音」——无内容可剥，原样留给去重层加序号
        assert_eq!(normalize_source_title("抖音"), "抖音");
        assert_eq!(normalize_source_title(" 抖音 "), "抖音");
    }

    #[test]
    fn normalize_does_not_touch_content_titles() {
        assert_eq!(normalize_source_title("数据库系统概论"), "数据库系统概论");
        assert_eq!(normalize_source_title("B站纪录片：深海"), "B站纪录片：深海");
    }

    #[test]
    fn dedupe_first_occurrence_keeps_base() {
        assert_eq!(dedupe_title(&s(&["物理课", "数学课"]), "抖音"), "抖音");
        assert_eq!(dedupe_title(&[], "抖音"), "抖音");
    }

    #[test]
    fn dedupe_second_is_hash_two_then_increments() {
        assert_eq!(dedupe_title(&s(&["抖音"]), "抖音"), "抖音 #2");
        assert_eq!(dedupe_title(&s(&["抖音", "抖音 #2"]), "抖音"), "抖音 #3");
        assert_eq!(dedupe_title(&s(&["抖音", "抖音 #7", "抖音 #2"]), "抖音"), "抖音 #8");
    }

    #[test]
    fn dedupe_ignores_unrelated_prefixes() {
        // 「抖音官方账号/抖音极速版」≠ base「抖音」——无关前缀不占号，
        // base 空闲 → 原样返回（契约：仅"恰好等于 base"才触发编号）
        assert_eq!(dedupe_title(&s(&["抖音官方账号", "抖音极速版"]), "抖音"), "抖音");
        assert_eq!(dedupe_title(&s(&["抖音", "抖音官方账号"]), "抖音"), "抖音 #2");
    }

    #[test]
    fn first_line_skips_short_and_picks_usable() {
        let lines = ["嗯", "大家好", "今天我们讲眼影晕染的三种基本手法和常见误区"];
        assert_eq!(
            first_line_title(lines.iter().copied()).unwrap(),
            "今天我们讲眼影晕染的三种基本手法和常见误区"
        );
    }

    #[test]
    fn first_line_truncates_long_text_at_40() {
        // 输入必须 >40 字才会触发截断（旧测试 39 字 < 上限——断言必败的测试缺陷）
        let long = "这是一段非常非常非常非常非常非常非常非常非常非常非常长的开场白句子用来测试标题截断逻辑";
        let out = first_line_title(std::iter::once(long)).unwrap();
        assert!(out.chars().count() == TITLE_MAX_CHARS + 1); // 40 + '…'
        assert!(out.ends_with('…'));
    }

    #[test]
    fn first_line_rejects_pure_symbols_and_all_empty() {
        assert_eq!(first_line_title(["♪♪♪".to_string()].iter().map(|x| x.as_str())), None);
        assert_eq!(
            first_line_title(["。。。".to_string(), "   ".to_string()].iter().map(|x| x.as_str())),
            None
        );
        assert_eq!(first_line_title(std::iter::empty::<&str>()), None);
    }
}
