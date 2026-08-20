//! 会话信息聚合（REQ-151 / v0.7.2：采集信息面板数据源）。
//!
//! @ai-context: 面板四项信息全本地：**平台**=窗口标题后缀识别（detect_platform）；
//!              **合集集号**=标题序列号提取（series_detect）+ 播放器 OCR 分P文本
//!              （`P3/12`、`第3集`）；**时长**=播放器 OCR 时间对（`12:34 / 1:23:45`，
//!              播放器惯例右侧为总时长）——播放器文本是 OCR 常见产出（原被当
//!              "垃圾"过滤），**零新增 OCR 成本**旁路拦截；**字幕**=前端从
//!              live:subtitle 事件派生（本模块保留 mark_subtitle 备用位）。
//! @ai-context: 纯逻辑（detect_platform/parse_player_text 可单测）+ 有状态聚合
//!              （SessionInfoCollector，Arc 共享：屏幕 worker 写入，事件/命令读取）。
//! @ai-context: 诚实原则：识别不出 → None/缺省（不猜不填）；OCR 文本是画面噪声，
//!              面板标注"识别自画面"由前端呈现，识别错误不产生数据副作用。

use std::sync::{Arc, Mutex};

use serde::Serialize;

/// 播放器信息（OCR 文本解析产出）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerInfo {
    /// 视频总时长（秒）
    pub duration_secs: Option<u64>,
    /// 当前集号（合集）
    pub episode: Option<u32>,
    /// 总集数（合集）
    pub total_episodes: Option<u32>,
}

/// 会话信息（前端面板展示载荷；camelCase 契约）。
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    /// 播放平台（哔哩哔哩/YouTube/腾讯视频…；本地窗口/未知 → None）
    pub platform: Option<String>,
    /// 视频总时长（秒；播放器 OCR 识别）
    pub duration_secs: Option<u64>,
    /// 系列名（合集；标题序列号提取）
    pub series: Option<String>,
    /// 当前集号（合集）
    pub episode: Option<u32>,
    /// 总集数（合集）
    pub total_episodes: Option<u32>,
}

/// 平台识别（纯函数）：复用 series_detect 单一来源（标题后缀表统一维护，
/// 剥离的后缀即平台证据——两处维护会漂移）。
pub use crate::series_detect::detect_platform;

/// 时间文本解析（`mm:ss` 或 `hh:mm:ss` → 秒；非时间形态 None）。
///
/// @ai-context: 分钟位不设上限（播放器允许 "90:00" 长格式），秒位必须 <60；
///              冒号段数 2/3 之外（如 "12345"）拒绝。
fn parse_time(s: &str) -> Option<u64> {
    let t = s.trim();
    let parts: Vec<&str> = t.split(':').collect();
    match parts.len() {
        2 => {
            let m: u64 = parts[0].parse().ok()?;
            let sec: u64 = parts[1].parse().ok()?;
            if sec >= 60 {
                return None;
            }
            Some(m * 60 + sec)
        }
        3 => {
            let h: u64 = parts[0].parse().ok()?;
            let m: u64 = parts[1].parse().ok()?;
            let sec: u64 = parts[2].parse().ok()?;
            if m >= 60 || sec >= 60 {
                return None;
            }
            Some(h * 3600 + m * 60 + sec)
        }
        _ => None,
    }
}

/// 从 OCR 文本解析播放器信息（纯函数；无匹配 → None）。
///
/// @ai-context: 时间对形态 `12:34 / 1:23:45`（`/` 或 `\` 分隔，可带空格）——
///              取两侧较大值作总时长（防左右颠倒；播放器惯例右侧为总时长）。
///              分P形态 `P3/12`、`P 3 / 12`、`第3集/共12集`、`第3集`。
pub fn parse_player_text(text: &str) -> Option<PlayerInfo> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    let mut info = PlayerInfo { duration_secs: None, episode: None, total_episodes: None };
    let mut hit = false;
    let chars: Vec<char> = t.chars().collect();

    // 时间对：扫描全部时间 token（`mm:ss`/`hh:mm:ss`），相邻 token 之间仅隔
    // `/` 或 `\`（允许空格）→ 时间对，取较大值作总时长（防左右颠倒）。
    // 逐 token 而非 find 首个分隔符——"P3/12 12:34 / 1:23:45" 首个 `/` 属于分P。
    let mut tokens: Vec<(usize, usize, u64)> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let mut j = i;
            while j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == ':') {
                j += 1;
            }
            if let Some(v) = parse_time(&chars[i..j].iter().collect::<String>()) {
                tokens.push((i, j, v));
            }
            i = j;
        } else {
            i += 1;
        }
    }
    for pair in tokens.windows(2) {
        let between: String = chars[pair[0].1..pair[1].0].iter().collect();
        let between = between.trim();
        if between == "/" || between == "\\" {
            info.duration_secs = Some(pair[0].2.max(pair[1].2));
            hit = true;
            break;
        }
    }

    // 分P：P3/12（可带空格）；第3集[/共12集]
    if let Some((ep, total)) = parse_p_episode(&chars) {
        info.episode = Some(ep);
        info.total_episodes = Some(total);
        hit = true;
    } else if let Some((ep, total)) = parse_cn_episode(&chars) {
        info.episode = Some(ep);
        info.total_episodes = total;
        hit = true;
    }

    if hit {
        Some(info)
    } else {
        None
    }
}

/// 扫描 ASCII 数字（返回 (起始索引, 数字值)）。
fn scan_digits(chars: &[char], from: usize) -> Option<(usize, u32)> {
    let mut k = from;
    while k < chars.len() && chars[k] == ' ' {
        k += 1;
    }
    let start = k;
    while k < chars.len() && chars[k].is_ascii_digit() {
        k += 1;
    }
    if k == start || k - start > 4 {
        return None;
    }
    let v: u32 = chars[start..k].iter().collect::<String>().parse().ok()?;
    Some((k, v))
}

/// 分P 形态：`P3/12` / `P 3 / 12`（P 后数字、可选空格、`/`、可选空格、数字）。
fn parse_p_episode(chars: &[char]) -> Option<(u32, u32)> {
    let p = chars.iter().position(|c| *c == 'P' || *c == 'p')?;
    let (k1, ep) = scan_digits(chars, p + 1)?;
    let mut k = k1;
    while k < chars.len() && chars[k] == ' ' {
        k += 1;
    }
    if k >= chars.len() || chars[k] != '/' {
        return None;
    }
    let (_, total) = scan_digits(chars, k + 1)?;
    Some((ep, total))
}

/// 中文集号形态：`第3集` 或 `第3集/共12集`（总集数可选）。
fn parse_cn_episode(chars: &[char]) -> Option<(u32, Option<u32>)> {
    let i = chars.iter().position(|c| *c == '第')?;
    let (k1, ep) = scan_digits(chars, i + 1)?;
    let mut k = k1;
    while k < chars.len() && chars[k] == ' ' {
        k += 1;
    }
    if k >= chars.len() || chars[k] != '集' {
        return None;
    }
    // 可选 "/共N集"
    let mut j = k + 1;
    while j < chars.len() && chars[j] == ' ' {
        j += 1;
    }
    let total = if j + 1 < chars.len() && chars[j] == '/' && chars[j + 1] == '共' {
        let (k2, t) = scan_digits(chars, j + 2)?;
        if k2 < chars.len() && chars[k2] == '集' {
            Some(t)
        } else {
            None
        }
    } else {
        None
    };
    Some((ep, total))
}

/// 会话信息聚合器（有状态；Arc 共享：屏幕 worker 写入，事件/命令读取）。
#[derive(Debug, Clone)]
pub struct SessionInfoCollector {
    inner: Arc<Mutex<SessionInfoInner>>,
}

#[derive(Debug)]
struct SessionInfoInner {
    info: SessionInfo,
}

impl Default for SessionInfoCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionInfoCollector {
    pub fn new() -> Self {
        Self { inner: Arc::new(Mutex::new(SessionInfoInner { info: SessionInfo::default() })) }
    }

    /// 从窗口标题初始化（平台/系列/集号——标题信号零成本）。
    ///
    /// @ai-context: 会话启动时调用一次；标题信息在会话中不变（窗口标题变化
    ///              罕见，不做增量监听——诚实：变了就丢了，下次会话正确）。
    pub fn init_from_title(&self, title: &str) {
        let mut guard = self.inner.lock().expect("session info lock poisoned");
        guard.info.platform = detect_platform(title).map(String::from);
        if let Some(info) = crate::series_detect::extract_series(title) {
            guard.info.series = Some(info.series);
            guard.info.episode = info.episode;
        }
    }

    /// 观察播放器 OCR 文本；返回信息是否发生变化（调用方按变化 emit）。
    pub fn observe_player_text(&self, text: &str) -> bool {
        let Some(parsed) = parse_player_text(text) else { return false };
        let mut guard = self.inner.lock().expect("session info lock poisoned");
        let mut changed = false;
        if parsed.duration_secs.is_some() && guard.info.duration_secs != parsed.duration_secs {
            guard.info.duration_secs = parsed.duration_secs;
            changed = true;
        }
        if parsed.episode.is_some() && guard.info.episode != parsed.episode {
            guard.info.episode = parsed.episode;
            changed = true;
        }
        if parsed.total_episodes.is_some() && guard.info.total_episodes != parsed.total_episodes {
            guard.info.total_episodes = parsed.total_episodes;
            changed = true;
        }
        changed
    }

    /// 当前快照（emit 载荷/命令读取）。
    pub fn snapshot(&self) -> SessionInfo {
        self.inner.lock().expect("session info lock poisoned").info.clone()
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "session_info_tests.rs"]
mod tests;
