//! 视频系列检测测试（REQ-152 / v0.7.2）。
//!
//! @ai-context: AAA 模式（Arrange/Act/Assert）；五模式命中 + 边界反例矩阵 +
//!              平台后缀剥离 + 中文集号规范化。误判（反例）比漏判更伤——
//!              反例用例与命中用例同等重要（防记忆串台）。

use super::*;

// ── 模式 1：P 分P ──

#[test]
fn p_episode_matched() {
    assert_eq!(
        extract_series("零基础化妆教程 P3"),
        Some(SeriesInfo { series: "零基础化妆教程".into(), episode: Some(3) })
    );
}

#[test]
fn p_episode_with_space_variant() {
    // "P 12"（P 与数字间空格变体）
    assert_eq!(
        extract_series("雅思听力精讲 P 12"),
        Some(SeriesInfo { series: "雅思听力精讲".into(), episode: Some(12) })
    );
}

#[test]
fn p_episode_lowercase() {
    assert_eq!(
        extract_series("化妆教程 p2"),
        Some(SeriesInfo { series: "化妆教程".into(), episode: Some(2) })
    );
}

#[test]
fn p_episode_with_separator() {
    // 系列名与 P 之间有连字符：剥离尾部分隔符
    assert_eq!(
        extract_series("零基础化妆教程 - P3"),
        Some(SeriesInfo { series: "零基础化妆教程".into(), episode: Some(3) })
    );
}

#[test]
fn p_episode_at_start_rejected() {
    // 序号在开头：取不到系列名 → 诚实放弃
    assert_eq!(extract_series("P3 安装环境"), None);
}

#[test]
fn up_master_not_matched() {
    // 反例："UP主" 的 P 前是字母 U（非边界）→ 不误判
    assert_eq!(extract_series("UP主分享 化妆小技巧"), None);
}

#[test]
fn p_without_number_not_matched() {
    assert_eq!(extract_series("化妆教程 P"), None);
}

// ── 模式 2：第X集/话/期/回 ──

#[test]
fn cn_episode_matched() {
    assert_eq!(
        extract_series("狂飙 第12集"),
        Some(SeriesInfo { series: "狂飙".into(), episode: Some(12) })
    );
}

#[test]
fn cn_episode_cjk_number() {
    assert_eq!(
        extract_series("数据结构 第十二话"),
        Some(SeriesInfo { series: "数据结构".into(), episode: Some(12) })
    );
}

#[test]
fn cn_episode_no_digits_rejected() {
    // "第X" 后无数/无单位 → 不匹配（"第 2 章" 由 course_of 旧逻辑处理）
    assert_eq!(extract_series("高等数学-第3章 微积分课程"), None);
    assert_eq!(extract_series("第X集 奇怪标题"), None);
}

// ── 模式 3：EP 前缀 ──

#[test]
fn ep_prefix_matched() {
    assert_eq!(
        extract_series("Python入门 EP03"),
        Some(SeriesInfo { series: "Python入门".into(), episode: Some(3) })
    );
}

#[test]
fn ep_single_e_variant() {
    // E12（单 E + 2 位）——避免与 "E3" 单字符场景混淆，这里 2 位数字
    assert_eq!(
        extract_series("英语晨读 E12"),
        Some(SeriesInfo { series: "英语晨读".into(), episode: Some(12) })
    );
}

#[test]
fn ep_without_number_not_matched() {
    assert_eq!(extract_series("EP 分享会"), None);
}

// ── 模式 4：尾部括号序号 ──

#[test]
fn bracket_suffix_matched() {
    assert_eq!(
        extract_series("化妆教程（2）"),
        Some(SeriesInfo { series: "化妆教程".into(), episode: Some(2) })
    );
    assert_eq!(
        extract_series("化妆教程(2)"),
        Some(SeriesInfo { series: "化妆教程".into(), episode: Some(2) })
    );
    assert_eq!(
        extract_series("化妆教程【3】"),
        Some(SeriesInfo { series: "化妆教程".into(), episode: Some(3) })
    );
}

#[test]
fn bracket_year_rejected() {
    // 反例：4 位年份括号（"（2024）"）不按集号
    assert_eq!(extract_series("年终总结（2024）"), None);
}

#[test]
fn bracket_range_rejected() {
    // 反例：含斜杠的（1/3）形态不按集号
    assert_eq!(extract_series("教程（1/3）"), None);
}

#[test]
fn bracket_not_at_end_rejected() {
    // 括号后还有内容 → 不按尾部序号处理
    assert_eq!(extract_series("（2）合集 化妆"), None);
}

// ── 模式 5：数字后缀 ──

#[test]
fn numeric_suffix_matched() {
    assert_eq!(
        extract_series("零基础化妆 03"),
        Some(SeriesInfo { series: "零基础化妆".into(), episode: Some(3) })
    );
    assert_eq!(
        extract_series("零基础化妆-12"),
        Some(SeriesInfo { series: "零基础化妆".into(), episode: Some(12) })
    );
}

#[test]
fn numeric_tight_rejected() {
    // 反例：数字紧贴文字（Python3/Win11）不按集号
    assert_eq!(extract_series("Python3 教程"), None);
    assert_eq!(extract_series("Win11 优化技巧"), None);
}

#[test]
fn numeric_year_suffix_rejected() {
    // 反例：4 位数字后缀（年份）不按集号
    assert_eq!(extract_series("年度回顾 2026"), None);
}

#[test]
fn numeric_single_digit_rejected() {
    // 反例：1 位数字后缀（"教程1"）太易误判
    assert_eq!(extract_series("教程1"), None);
}

// ── 平台后缀剥离 ──

#[test]
fn normalize_bilibili_suffix() {
    assert_eq!(normalize_title("零基础化妆教程 P3_哔哩哔哩_bilibili"), "零基础化妆教程 P3");
}

#[test]
fn normalize_youtube_suffix() {
    assert_eq!(normalize_title("Python Full Course - YouTube"), "Python Full Course");
}

#[test]
fn normalize_no_suffix_unchanged() {
    assert_eq!(normalize_title("本地视频文件"), "本地视频文件");
}

#[test]
fn normalize_whitespace_trimmed() {
    assert_eq!(normalize_title("  课程  "), "课程");
}

// ── 系列名剥离后平台后缀也生效（组合场景） ──

#[test]
fn bilibili_p_episode_full_title() {
    // 真实 B站窗口标题形态：后缀 + P 号
    assert_eq!(
        extract_series("零基础化妆教程 P3_哔哩哔哩_bilibili"),
        Some(SeriesInfo { series: "零基础化妆教程".into(), episode: Some(3) })
    );
}

// ── 中文集号规范化 ──

#[test]
fn episode_arabic_passthrough() {
    assert_eq!(normalize_episode("3"), Some(3));
    assert_eq!(normalize_episode("12"), Some(12));
}

#[test]
fn episode_cjk_simple() {
    assert_eq!(normalize_episode("三"), Some(3));
    assert_eq!(normalize_episode("十"), Some(10));
    assert_eq!(normalize_episode("十二"), Some(12));
    assert_eq!(normalize_episode("二十三"), Some(23));
    assert_eq!(normalize_episode("一百"), Some(100));
}

#[test]
fn episode_cjk_invalid() {
    assert_eq!(normalize_episode(""), None);
    assert_eq!(normalize_episode("X"), None);
    assert_eq!(normalize_episode("零"), None);
}

// ── 空/极短标题 ──

#[test]
fn empty_or_short_rejected() {
    assert_eq!(extract_series(""), None);
    assert_eq!(extract_series("  "), None);
    assert_eq!(extract_series("P"), None);
    assert_eq!(extract_series("1"), None);
}

// ── course_of 联动（REQ-152：合集归组到系列名；第X章保持原语义） ──

#[test]
fn course_of_series_groups_bilibili_collection() {
    // B站合集：P 式标题归组到系列名
    assert_eq!(crate::commands_session::course_of("零基础化妆教程 P1"), "零基础化妆教程");
    assert_eq!(crate::commands_session::course_of("零基础化妆教程 P5_哔哩哔哩_bilibili"), "零基础化妆教程");
    // 第X集式
    assert_eq!(crate::commands_session::course_of("狂飙 第12集"), "狂飙");
    // EP 式
    assert_eq!(crate::commands_session::course_of("Python入门 EP03"), "Python入门");
}

#[test]
fn course_of_chapter_semantics_unchanged() {
    // 第X章式保持原语义（每章一组——现状零回归）
    assert_eq!(crate::commands_session::course_of("高等数学-第3章 微积分课程"), "高等数学-第3章");
    // 无序号普通标题 → 标题本身
    assert_eq!(crate::commands_session::course_of("产品周会-评审"), "产品周会-评审");
}
