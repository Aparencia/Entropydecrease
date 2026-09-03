//! 窗口/进程枚举与评分：课堂助手目标窗口选择（参考原项目 windowScorer 思路）。
//!
//! @ai-context: EnumWindows 枚举顶层可见窗口 → 关联进程名 → 关键词评分。
//!              score>0 为"推荐窗口"（疑似网课/视频/浏览器/播放器），前端两级列表展示。
//! @ai-context: 评分为纯函数（可单测）；枚举为系统调用副作用，仅 Windows 平台实现，
//!              其他平台返回空列表（MVP 目标平台为 Windows）。

use serde::Serialize;

/// 把窗口 id（i64，前端传输）转换为 HWND（Windows-only）。
///
/// @ai-context: list_windows 返回的 id 即窗口句柄转 i64；实时捕获时按此定向。
#[cfg(target_os = "windows")]
pub fn hwnd_from_i64(id: i64) -> windows::Win32::Foundation::HWND {
    windows::Win32::Foundation::HWND(id as *mut core::ffi::c_void)
}

/// 可捕获窗口信息（返回前端）。
///
/// @ai-context: id 为窗口句柄（HWND 转 i64），后续屏幕捕获按句柄定向。
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureWindow {
    /// 窗口句柄（HWND）
    pub id: i64,
    /// 窗口标题
    pub title: String,
    /// 进程名（不含扩展名，如 chrome / msedge / potplayer）
    pub process_name: String,
    /// 进程 PID
    pub pid: u32,
    /// 推荐评分（>0 为推荐窗口）
    pub score: u32,
    /// 命中原因（如 "B站视频" / "Chrome 浏览器"）
    pub reasons: Vec<String>,
    /// 站点首页标记（2026-08 用户需求：B站首页等无视频内容落地页，
    /// 前端显示"首页"标签且不进入推荐；仍可手动选择兜底）
    pub is_homepage: bool,
    /// v0.19.2：枚举 z 序（EnumWindows 自上而下，0=最顶）。推荐区同级按此
    /// 稳定排序——"播放中/当前活跃窗口靠前"的零成本近似（真播放检测需
    /// OCR/音频轮询，成本高，登记观察项）。
    pub z_order: u32,
    /// v0.19.2：系统/工具窗口（终端/资源管理器/记事本等——前端默认过滤，
    /// 可开关找回；判定见 window_filter::is_system_window）
    pub system_window: bool,
}

/// 标题关键词评分表：(关键词, 权重, 原因)。
///
/// @ai-context: 参考原项目 windowScorer 的网课/浏览器/播放器识别思路，
///              权重按"越接近学习视频场景越高"设定。
const TITLE_KEYWORDS: &[(&str, u32, &str)] = &[
    ("bilibili", 100, "B站视频"),
    ("哔哩哔哩", 100, "B站视频"),
    ("youtube", 100, "YouTube 视频"),
    ("mooc", 90, "MOOC 平台"),
    ("慕课", 90, "慕课平台"),
    ("学堂在线", 90, "学堂在线"),
    ("icourse163", 90, "中国大学MOOC"),
    ("腾讯会议", 80, "腾讯会议"),
    ("网课", 80, "网课关键词"),
    ("zoom", 70, "Zoom 会议"),
    ("钉钉", 60, "钉钉"),
    // v0.19.2（用户实测）：抖音/快手桌面端标题固定为平台名——补表进推荐区
    ("抖音", 80, "抖音视频"),
    ("douyin", 80, "抖音视频"),
    ("快手", 60, "快手视频"),
    ("课程", 50, "课程关键词"),
    ("教程", 50, "教程关键词"),
    ("学习", 30, "学习关键词"),
];

/// 进程名关键词评分表：(关键词, 权重, 原因)。
const PROCESS_KEYWORDS: &[(&str, u32, &str)] = &[
    ("potplayer", 60, "PotPlayer 播放器"),
    ("vlc", 60, "VLC 播放器"),
    ("mpv", 60, "mpv 播放器"),
    ("kmplayer", 60, "KMPlayer 播放器"),
    ("wmplayer", 50, "Windows 播放器"),
    // v0.19.2（用户实测）：抖音/快手/独立 B站客户端进程名（窗口标题不可靠时兜底）
    ("douyin", 80, "抖音客户端"),
    ("kuaishou", 60, "快手客户端"),
    ("bilibili", 90, "B站客户端"),
    ("chrome", 40, "Chrome 浏览器"),
    ("msedge", 40, "Edge 浏览器"),
    ("firefox", 40, "Firefox 浏览器"),
];

/// 窗口评分（纯函数）：标题与进程名关键词加权求和。
///
/// @ai-context: 纯函数无副作用，可安全并发与单测。
/// @returns (总分, 命中原因列表)
pub fn score_window(title: &str, process_name: &str) -> (u32, Vec<String>) {
    let tl = title.to_lowercase();
    let pl = process_name.to_lowercase();
    let mut score = 0u32;
    let mut reasons = Vec::new();

    for (kw, weight, reason) in TITLE_KEYWORDS {
        if tl.contains(kw) {
            score += weight;
            reasons.push(reason.to_string());
        }
    }
    for (kw, weight, reason) in PROCESS_KEYWORDS {
        if pl.contains(kw) {
            score += weight;
            reasons.push(reason.to_string());
        }
    }
    (score, reasons)
}

/// 枚举当前可捕获的顶层窗口（含进程信息与评分），按评分降序。
///
/// @ai-context: 过滤不可见窗口、空标题窗口与自身进程窗口；进程名查询失败时保留窗口（进程名空）。
/// @ai-context: 2026-08 用户需求（过滤增强）：再过滤"无法用于采集"的窗口——
///              最小化（GetWindowRect 返回 -32000 坐标，裁剪无内容）/零尺寸/
///              cloaked（UWP/Edge 悬浮层，DWM 不绘制）/工具窗口（WS_EX_TOOLWINDOW
///              且非 APPWINDOW，工具栏/悬浮窗）；站点首页（B站/YouTube 落地页，
///              无视频内容）降权移出推荐（仍可手动选择兜底）。
#[cfg(windows)]
pub fn list_capture_windows() -> Vec<CaptureWindow> {
    use windows::core::{BOOL, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetShellWindow, GetWindowLongPtrW, GetWindowRect, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, WS_EX_APPWINDOW,
        WS_EX_TOOLWINDOW,
    };

    /// 由 PID 查询进程名（不含扩展名）；权限不足或进程退出时返回空串。
    unsafe fn process_name_of(pid: u32) -> String {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok {
            return String::new();
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
    }

    /// 窗口是否可采集（系统级判定，2026-08 过滤增强）：
    /// 最小化 / cloaked（DWM 不绘制）/ 工具窗口（非 APPWINDOW 的 TOOLWINDOW）。
    unsafe fn is_capturable(hwnd: HWND) -> bool {
        if IsIconic(hwnd).as_bool() {
            return false;
        }
        // DWMWA_CLOAKED=14：UWP/Edge 等被 DWM 隐藏但 IsWindowVisible 误报的窗口
        let mut cloaked: u32 = 0;
        if ::windows::Win32::Graphics::Dwm::DwmGetWindowAttribute(
            hwnd,
            ::windows::Win32::Graphics::Dwm::DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && cloaked != 0
        {
            return false;
        }
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let tool = (ex as u32 & WS_EX_TOOLWINDOW.0) != 0;
        let app = (ex as u32 & WS_EX_APPWINDOW.0) != 0;
        if tool && !app {
            return false; // 工具栏/悬浮窗：不可作为采集目标
        }
        true
    }

    /// EnumWindows 回调：收集可见、有标题、可采集的窗口原始信息。
    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = &mut *(lparam.0 as *mut Vec<(i64, String, u32)>);
        // TD-007：过滤 shell/桌面窗口（Program Manager 等系统噪声，非可捕获目标）
        if hwnd == GetShellWindow() {
            return BOOL(1);
        }
        if IsWindowVisible(hwnd).as_bool() && is_capturable(hwnd) {
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut buf);
            if len > 0 {
                let title = String::from_utf16_lossy(&buf[..len as usize]);
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid > 0 {
                    out.push((hwnd.0 as i64, title, pid));
                }
            }
        }
        BOOL(1) // 继续枚举
    }

    let mut raw: Vec<(i64, String, u32)> = Vec::new();
    let raw_ptr = &mut raw as *mut _ as isize;
    unsafe {
        let _ = EnumWindows(Some(enum_callback), LPARAM(raw_ptr));
    }

    let self_pid = std::process::id();
    let mut windows: Vec<CaptureWindow> = raw
        .into_iter()
        .filter(|(_, _, pid)| *pid != self_pid)
        // 零尺寸窗口（可见但无内容可裁剪）过滤：坐标非法/零宽高均不可采集
        .filter(|(id, _, _)| {
            let mut rect = RECT::default();
            let ok = unsafe { GetWindowRect(HWND(*id as *mut core::ffi::c_void), &mut rect) };
            ok.is_ok() && crate::window_filter::has_capturable_size(rect.right - rect.left, rect.bottom - rect.top)
        })
        // enumerate 序号即 z 序（EnumWindows 自上而下）——0=最顶窗口
        .enumerate()
        .map(|(z_order, (id, title, pid))| {
            let process_name = unsafe { process_name_of(pid) };
            let (score, reasons) = score_window(&title, &process_name);
            let is_homepage = crate::window_filter::is_site_homepage(&title);
            // 站点首页降权：移出推荐（评分清零 + 原因标注），仍保留可手动选择
            let (score, reasons) =
                crate::window_filter::demote_homepage(score, reasons, &title);
            // v0.19.2：系统/工具窗口标记（终端/资源管理器等——前端默认过滤
            // 可开关找回；不影响其余字段，供 UI 灰显与计数）
            let system_window =
                crate::window_filter::is_system_window(&title, &process_name);
            CaptureWindow {
                id,
                title,
                process_name,
                pid,
                score,
                reasons,
                is_homepage,
                z_order: z_order as u32,
                system_window,
            }
        })
        .collect();
    // 推荐在前（score 降序）；同级按 z 序（越靠顶越新活跃——"播放中置顶"的
    // 零成本近似；标题排序会让活跃窗口埋没在同分浏览器标签海里）
    windows.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.z_order.cmp(&b.z_order)));
    windows
}

/// 非 Windows 平台占位实现（MVP 目标平台为 Windows）。
#[cfg(not(windows))]
pub fn list_capture_windows() -> Vec<CaptureWindow> {
    Vec::new()
}

/// 当前前台窗口句柄（i64，与 CaptureWindow.id 同编码）。
///
/// @ai-context: REQ-084（v0.6.0 M1）：字幕 ROI 窗口切换检测——屏幕 worker
///              每秒对比前台窗口与录制目标窗口，不一致 → RoiTracker 强制重扫。
/// @ai-context: 失败（无前台窗口）返回 None，调用方静默跳过（误触发阈值校准）。
#[cfg(windows)]
pub fn foreground_hwnd() -> Option<i64> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        None
    } else {
        Some(hwnd.0 as i64)
    }
}

/// 非 Windows 平台占位（REQ-084 依赖前台窗口 API，仅 Windows 生效）。
#[cfg(not(windows))]
pub fn foreground_hwnd() -> Option<i64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bilibili_title_scores_high() {
        // Arrange & Act
        let (score, reasons) = score_window("【课程】Rust 入门_哔哩哔哩_bilibili", "chrome");
        // Assert
        assert!(score >= 200);
        assert!(reasons.iter().any(|r| r.contains("B站")));
        assert!(reasons.iter().any(|r| r.contains("Chrome")));
    }

    #[test]
    fn player_process_scores_without_title_keywords() {
        // Arrange & Act
        let (score, reasons) = score_window("lecture.mp4", "PotPlayer");
        // Assert
        assert!(score > 0);
        assert!(reasons.iter().any(|r| r.contains("PotPlayer")));
    }

    #[test]
    fn unrelated_window_scores_zero() {
        // Arrange & Act
        let (score, reasons) = score_window("任务管理器", "Taskmgr");
        // Assert
        assert_eq!(score, 0);
        assert!(reasons.is_empty());
    }

    #[test]
    fn scoring_is_case_insensitive() {
        // Arrange & Act
        let (upper, _) = score_window("YOUTUBE 教程", "CHROME");
        let (lower, _) = score_window("youtube 教程", "chrome");
        // Assert
        assert_eq!(upper, lower);
    }

    #[test]
    fn douyin_titles_and_process_score_high() {
        // v0.19.2（用户实测）：抖音标题固定为"抖音"/进程 douyin——进推荐区
        let (t, tr) = score_window("抖音", "douyin");
        assert!(t >= 80, "标题命中: {}", t);
        assert!(tr.iter().any(|r| r.contains("抖音")));
        let (p, pr) = score_window("视频", "douyin");
        assert!(p >= 80, "进程命中: {}", p);
        assert!(pr.iter().any(|r| r.contains("抖音")));
        // 标题不含平台词但进程为 B站客户端 → 仍可推荐
        let (b, br) = score_window("一些课程名称", "bilibili");
        assert!(b >= 90);
        assert!(br.iter().any(|r| r.contains("B站")));
    }
}
