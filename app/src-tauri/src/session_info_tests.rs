//! 会话信息聚合测试（REQ-151 / v0.7.2）。
//!
//! @ai-context: AAA 模式（Arrange/Act/Assert）；平台识别 + 播放器文本解析
//!              （时间对/分P）+ 聚合器状态变化。解析规则宽松防漏判、边界
//!              反例防误判（诚实 None 优于错误值——面板只展示不落库）。

use super::*;

// ── 平台识别 ──

#[test]
fn platform_bilibili() {
    assert_eq!(detect_platform("零基础化妆教程 P3_哔哩哔哩_bilibili"), Some("哔哩哔哩"));
}

#[test]
fn platform_youtube() {
    assert_eq!(detect_platform("Python Full Course - YouTube"), Some("YouTube"));
}

#[test]
fn platform_tencent_and_iqiyi() {
    assert_eq!(detect_platform("甄嬛传 - 腾讯视频"), Some("腾讯视频"));
    assert_eq!(detect_platform("狂飙_爱奇艺"), Some("爱奇艺"));
}

#[test]
fn platform_unknown_none() {
    // 本地窗口/无后缀 → 诚实 None
    assert_eq!(detect_platform("本地视频播放器"), None);
    assert_eq!(detect_platform(""), None);
}

// ── 时间对解析 ──

#[test]
fn time_pair_mmss_over_hhmmss() {
    // "12:34 / 1:23:45"：右侧为总时长（取较大值 1:23:45 = 5025s）
    let info = parse_player_text("12:34 / 1:23:45").unwrap();
    assert_eq!(info.duration_secs, Some(5025));
    assert_eq!(info.episode, None);
}

#[test]
fn time_pair_no_spaces() {
    // 无空格紧凑形态
    let info = parse_player_text("00:12:34/01:30:00").unwrap();
    assert_eq!(info.duration_secs, Some(5400));
}

#[test]
fn time_pair_backslash() {
    // 反斜杠分隔（部分播放器）
    let info = parse_player_text("12:34 \\ 1:23:45").unwrap();
    assert_eq!(info.duration_secs, Some(5025));
}

#[test]
fn time_pair_swapped_order_takes_max() {
    // 防左右颠倒：取较大值作总时长
    let info = parse_player_text("1:23:45 / 12:34").unwrap();
    assert_eq!(info.duration_secs, Some(5025));
}

#[test]
fn single_time_not_parsed() {
    // 单个时间（无对）→ 无时长（无法区分当前/总）
    assert_eq!(parse_player_text("12:34"), None);
}

#[test]
fn non_time_text_not_parsed() {
    assert_eq!(parse_player_text("高等数学 第三章"), None);
    assert_eq!(parse_player_text(""), None);
}

#[test]
fn invalid_time_rejected() {
    // 秒 ≥60 / 无冒号 → 拒绝
    assert_eq!(parse_player_text("12:99 / 1:00:00"), None);
    assert_eq!(parse_player_text("12345 / 67890"), None);
}

// ── 分P 解析 ──

#[test]
fn p_episode_with_total() {
    let info = parse_player_text("P3/12").unwrap();
    assert_eq!(info.episode, Some(3));
    assert_eq!(info.total_episodes, Some(12));
}

#[test]
fn p_episode_with_spaces() {
    let info = parse_player_text("P 3 / 12").unwrap();
    assert_eq!(info.episode, Some(3));
    assert_eq!(info.total_episodes, Some(12));
}

#[test]
fn cn_episode_with_total() {
    let info = parse_player_text("第3集/共12集").unwrap();
    assert_eq!(info.episode, Some(3));
    assert_eq!(info.total_episodes, Some(12));
}

#[test]
fn cn_episode_alone() {
    let info = parse_player_text("第3集").unwrap();
    assert_eq!(info.episode, Some(3));
    assert_eq!(info.total_episodes, None);
}

#[test]
fn p_episode_without_total_rejected() {
    // "P3" 无总集数 → 不按分P（防 "P" 字母误判）
    assert_eq!(parse_player_text("P3"), None);
}

#[test]
fn combined_time_and_episode() {
    // 播放器一条文本同时含时间与分P（B站选集按钮形态）
    let info = parse_player_text("P3/12 12:34 / 1:23:45").unwrap();
    assert_eq!(info.duration_secs, Some(5025));
    assert_eq!(info.episode, Some(3));
    assert_eq!(info.total_episodes, Some(12));
}

// ── 聚合器 ──

#[test]
fn collector_init_from_title() {
    let c = SessionInfoCollector::new();
    c.init_from_title("零基础化妆教程 P3_哔哩哔哩_bilibili");
    let info = c.snapshot();
    assert_eq!(info.platform.as_deref(), Some("哔哩哔哩"));
    assert_eq!(info.series.as_deref(), Some("零基础化妆教程"));
    assert_eq!(info.episode, Some(3));
    assert_eq!(info.duration_secs, None);
}

#[test]
fn collector_observe_duration_changes_once() {
    let c = SessionInfoCollector::new();
    // 首次观察 → 变化
    assert!(c.observe_player_text("12:34 / 1:23:45"));
    assert_eq!(c.snapshot().duration_secs, Some(5025));
    // 相同值重复观察 → 不变（防 IPC 风暴）
    assert!(!c.observe_player_text("12:34 / 1:23:45"));
    // 新值 → 变化
    assert!(c.observe_player_text("13:00 / 1:30:00"));
    assert_eq!(c.snapshot().duration_secs, Some(5400));
}

#[test]
fn collector_ignores_non_player_text() {
    let c = SessionInfoCollector::new();
    assert!(!c.observe_player_text("高等数学 第三章"));
    assert_eq!(c.snapshot(), SessionInfo::default());
}
