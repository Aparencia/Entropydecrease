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
#[cfg(windows)]
pub fn list_capture_windows() -> Vec<CaptureWindow> {
    use windows::core::{BOOL, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetShellWindow, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
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

    /// EnumWindows 回调：收集可见且有标题的窗口原始信息。
    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = &mut *(lparam.0 as *mut Vec<(i64, String, u32)>);
        // TD-007：过滤 shell/桌面窗口（Program Manager 等系统噪声，非可捕获目标）
        if hwnd == GetShellWindow() {
            return BOOL(1);
        }
        if IsWindowVisible(hwnd).as_bool() {
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
        .map(|(id, title, pid)| {
            let process_name = unsafe { process_name_of(pid) };
            let (score, reasons) = score_window(&title, &process_name);
            CaptureWindow { id, title, process_name, pid, score, reasons }
        })
        .collect();
    // 推荐窗口（高分）在前，同级按标题稳定排序
    windows.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.title.cmp(&b.title)));
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
}
