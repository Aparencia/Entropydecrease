//! 窗口过滤纯逻辑（课堂助手目标窗口选择优化，2026-08 用户需求）。
//!
//! @ai-context: 两个维度：① 站点首页判定——B站/YouTube 等视频站的"裸站点标题"
//!              （如 `哔哩哔哩 (゜-゜)つロ 干杯~-bilibili`）是无视频内容的落地页，
//!              与视频页（标题含具体视频名）区分，首页窗口不再进入"推荐窗口"；
//!              ② 可捕获性判定——被系统枚举为顶层可见但无法用于采集的窗口类别
//!              （最小化/零尺寸/cloaked/工具窗口），全部过滤不出现在列表。
//! @ai-context: 全部纯函数（无系统调用，可并发可单测）；系统调用过滤在
//!              windows.rs::list_capture_windows 内完成。

/// 已知站点首页标题模式（精确匹配，小写比较；命中即视为无视频内容的落地页）。
///
/// @ai-context: B站首页标题随版本变化（旧版装饰语/新版 `- bilibili`），
///              统一收进本表；新增站点时在此登记（含"裸站点名"精确匹配兜底）。
const SITE_HOMEPAGE_TITLES: &[&str] = &[
    // B站：旧版首页装饰语 / 新版首页 / 裸站名
    "哔哩哔哩 (゜-゜)つロ 干杯~-bilibili",
    "哔哩哔哩 - bilibili",
    "哔哩哔哩",
    "bilibili",
    // YouTube 首页/裸站名
    "youtube",
    "youtube home",
    // 通用视频站落地页
    "bilibili 哔哩哔哩",
];

/// 判定窗口标题是否为站点首页（无视频内容的落地页）。
///
/// @ai-context: 视频页标题必然携带具体内容（视频名/直播间名/UP 主名），
///              与首页模式表无交集；判定用小写 + trim 精确匹配防误伤
///              （"bilibili 首页"这类带内容的标题不应命中）。
pub fn is_site_homepage(title: &str) -> bool {
    let t = title.trim().to_lowercase();
    SITE_HOMEPAGE_TITLES.iter().any(|pat| t == *pat)
}

/// 首页窗口降权（纯函数）：命中首页模式 → 评分清零并标注原因，
/// 前端将其移出"推荐窗口"（仍保留在"显示全部"供手动选择兜底）。
pub fn demote_homepage(score: u32, reasons: Vec<String>, title: &str) -> (u32, Vec<String>) {
    if is_site_homepage(title) {
        (0, vec!["站点首页（无视频内容）".to_string()])
    } else {
        (score, reasons)
    }
}

/// 窗口尺寸是否可用于采集（纯函数）：宽高均 > 0。
///
/// @ai-context: 零尺寸窗口（隐藏但 IsWindowVisible 误报）裁剪后无内容，
///              直接过滤；最小化窗口由 GetWindowRect 返回 -32000 坐标
///              （宽高 > 0 但坐标非法），由调用方在系统层一并过滤。
pub fn has_capturable_size(width: i32, height: i32) -> bool {
    width > 0 && height > 0
}

/// 系统/工具类进程白名单（v0.19.2 用户实测：终端/记事本/文件资源管理器等
/// 系统窗口出现在选择列表属噪声）。
///
/// @ai-context: 判定只用**进程名**（不含扩展名、小写比较）——标题易变不可靠
///              （资源管理器窗口标题=目录名）；浏览器/播放器/办公软件不在
///              名单（编程教学可能录编辑器/终端以外的窗口——见"彻底过滤"
///              的用户裁决：本名单是保守最小集，新增进程在此登记）。
///              前端默认隐藏 systemWindow，可开关找回（能力不丢失）。
const SYSTEM_PROCESSES: &[&str] = &[
    // 文件管理与桌面
    "explorer",
    // 文本与终端
    "notepad",
    "cmd",
    "powershell",
    "pwsh",
    "windowsterminal",
    // 任务与系统设置（UWP 宿主窗口一并覆盖）
    "taskmgr",
    "applicationframehost",
    "systemsettings",
    "shellExperienceHost",
    "searchapp",
    "dwm",
];

/// 判定是否系统/工具窗口（纯函数；进程名空 → false 保留兜底选择）。
pub fn is_system_window(_title: &str, process_name: &str) -> bool {
    let p = process_name.trim().to_lowercase();
    !p.is_empty() && SYSTEM_PROCESSES.iter().any(|s| *s == p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bilibili_homepage_old_and_new_variants_detected() {
        // Arrange & Act & Assert：旧装饰语/新版/裸站名/英文裸站名全部命中
        assert!(is_site_homepage("哔哩哔哩 (゜-゜)つロ 干杯~-bilibili"));
        assert!(is_site_homepage("哔哩哔哩 - bilibili"));
        assert!(is_site_homepage("哔哩哔哩"));
        assert!(is_site_homepage("bilibili"));
        assert!(is_site_homepage("  bilibili  "), "两侧空白应容忍");
    }

    #[test]
    fn bilibili_video_page_not_detected_as_homepage() {
        // 视频页标题携带具体内容（视频名）→ 不得命中首页模式
        assert!(!is_site_homepage("【课程】Rust 入门_哔哩哔哩_bilibili"));
        assert!(!is_site_homepage("某某UP主 的直播间 - 哔哩哔哩_bilibili"));
        assert!(!is_site_homepage("bilibili 首页推荐了什么"));
    }

    #[test]
    fn youtube_homepage_detected_but_video_not() {
        assert!(is_site_homepage("YouTube"));
        assert!(is_site_homepage("youtube home"));
        assert!(!is_site_homepage("Rust Tutorial - YouTube"));
        assert!(!is_site_homepage("YouTube 我的频道"));
    }

    #[test]
    fn unrelated_title_not_detected() {
        assert!(!is_site_homepage("任务管理器"));
        assert!(!is_site_homepage("Visual Studio Code"));
    }

    #[test]
    fn demote_homepage_zeroes_score_and_marks_reason() {
        // 首页窗口即使关键词命中高权重（B站视频 100 分）也被清零
        let (score, reasons) = demote_homepage(100, vec!["B站视频".to_string()], "哔哩哔哩 - bilibili");
        assert_eq!(score, 0);
        assert!(reasons[0].contains("站点首页"));
        // 非首页窗口原样透传
        let (s2, r2) = demote_homepage(100, vec!["B站视频".to_string()], "【课程】Rust 入门_哔哩哔哩_bilibili");
        assert_eq!(s2, 100);
        assert_eq!(r2, vec!["B站视频".to_string()]);
    }

    #[test]
    fn size_zero_unusable() {
        assert!(!has_capturable_size(0, 1080));
        assert!(!has_capturable_size(1920, 0));
        assert!(!has_capturable_size(0, 0));
        assert!(has_capturable_size(1920, 1080));
    }

    #[test]
    fn system_processes_detected() {
        // 终端/记事本/资源管理器/任务管理器——进程名小写无扩展名判定
        assert!(is_system_window("随便什么标题", "explorer"));
        assert!(is_system_window("", "Notepad"));
        assert!(is_system_window("C:\\dev", "cmd"));
        assert!(is_system_window("", "WindowsTerminal"));
        assert!(is_system_window("", "pwsh"));
        assert!(is_system_window("", "Taskmgr"));
        assert!(is_system_window("", "ApplicationFrameHost"));
    }

    #[test]
    fn media_and_office_not_system() {
        // 浏览器/播放器/办公/无进程名——不得误判为系统窗口
        assert!(!is_system_window("", "chrome"));
        assert!(!is_system_window("", "msedge"));
        assert!(!is_system_window("", "potplayer"));
        assert!(!is_system_window("", "Code"));
        assert!(!is_system_window("", "WeChat"));
        assert!(!is_system_window("", ""), "进程名空保留兜底（不猜不滤）");
        assert!(!is_system_window("bilibili 播放窗口", "chrome"));
    }
}
