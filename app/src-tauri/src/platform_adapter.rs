//! 平台信号适配器（REQ-191 / v0.9.0 M4：bilibili/local 轻量适配 + OCR 标签通用化）。
//!
//! @ai-context: 信号来源分层（framework-v2 §3）：通用层（窗口标题/URL/帧切换率/
//!              OCR 密度——任何平台都有）之上叠加平台层（各平台特有，适配器解析）：
//!              - bilibili：分区标签（`知识科普|经济管理` 会话 33 实证——OCR 画面
//!                内分区标签/标题卡文字）、防骗提示
//!              - local：文件路径、目录名（常含分类语义）
//!              - 独立播放器/浏览器：无平台信号 → 纯内容信号（零回归）
//! @ai-context: 轻量适配原则：纯文本解析（标题/路径/OCR 文本），无网络无 ML；
//!              OCR 标签通用化 = 画面内标签/标题卡文字作为**通用 OCR 信号**接入
//!              领域投票（词表映射扩展，不依赖平台枚举——任何平台画面标签都算）。
//! @ai-context: 纯逻辑模块（无 IO/DB），决策矩阵可注入 fake 信号单测（AAA）。

use serde::{Deserialize, Serialize};

use crate::video_profile_domain::{detect_domain, DomainSignals};

/// 平台标识（前端从窗口标题/进程名推断；None=无平台信号——零回归）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformKind {
    /// 哔哩哔哩（窗口标题含"哔哩哔哩"后缀——series_detect 平台表同源）
    Bilibili,
    /// 本地文件播放（窗口标题/路径含本地视频文件特征）
    Local,
    /// 其他已知平台（网课/YouTube 等——本版不解析，纯通用信号）
    Other,
}

/// 平台推断（纯函数）：窗口标题/URL → 平台。
///
/// @ai-context: 复用 series_detect 平台后缀单一来源（detect_platform 返回平台名）
///              + URL 主机名关键词；本地文件用扩展名/路径特征（无平台后缀时
///              文件名含 .mp4/.mkv 等 → Local）。识别不出 → None（不猜）。
pub fn infer_platform(title: Option<&str>, url: Option<&str>) -> Option<PlatformKind> {
    if let Some(t) = title {
        match crate::series_detect::detect_platform(t) {
            Some("哔哩哔哩") => return Some(PlatformKind::Bilibili),
            Some(_) => return Some(PlatformKind::Other),
            None => {}
        }
        // 本地文件：标题含常见视频扩展名（播放器窗口名 = 文件路径）
        if ["mp4", "mkv", "avi", "mov", "flv", "webm", "wmv"]
            .iter()
            .any(|ext| t.to_lowercase().contains(&format!(".{}", ext)))
        {
            return Some(PlatformKind::Local);
        }
    }
    if let Some(u) = url {
        let u = u.to_lowercase();
        if u.contains("bilibili.com") || u.contains("b23.tv") {
            return Some(PlatformKind::Bilibili);
        }
        if u.starts_with("file://") || u.contains(".mp4") || u.contains(".mkv") {
            return Some(PlatformKind::Local);
        }
    }
    None
}

/// 平台适配产出（接入检测投票的增量信号；全部可选——无信号零回归）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PlatformHints {
    /// 平台分区标签（领域检测强信号；bilibili 分区原文/local 目录名）
    pub platform_tags: Vec<String>,
    /// 路径语义关键词（local：目录名/文件名分段——领域投票候选）
    pub path_segments: Vec<String>,
}

/// bilibili 适配：从标题/URL 提取分区标签。
///
/// @ai-context: 窗口标题形态 `标题_哔哩哔哩_bilibili`——分区标签通常在**画面内**
///              （OCR 标签通用化通道），标题本身罕见；本适配器处理标题内联分区
///              形态（`知识科普|经济管理` 用 `|`/空格分隔）与 URL 分区段。
pub fn adapt_bilibili(title: Option<&str>, url: Option<&str>) -> PlatformHints {
    let mut tags: Vec<String> = Vec::new();
    if let Some(t) = title {
        // 标题内联分区（B站标题偶尔带 `| 知识科普` 后缀；剥离平台后缀后提取）
        let cleaned = crate::series_detect::normalize_title(t);
        for seg in cleaned.split(['|', '｜']) {
            let seg = seg.trim();
            if !seg.is_empty() && seg.chars().count() <= 20 && is_category_like(seg) {
                tags.push(seg.to_string());
            }
        }
    }
    // URL 分区段（bilibili 分区 id 不具语义——不猜分区名；诚实空）
    let _ = url;
    PlatformHints { platform_tags: tags, path_segments: Vec::new() }
}

/// local 适配：文件路径/目录名 → 路径语义关键词（领域投票候选）。
///
/// @ai-context: 播放器窗口标题 = 完整文件路径（`D:\教程\化妆\眼影篇.mp4`）——
///              目录名/文件名分段即分类语义（"教程/化妆"→ 美妆领域投票）；
///              分段粒度：按路径分隔符/空格/常见连接符切分，过滤泛词。
pub fn adapt_local(title: Option<&str>) -> PlatformHints {
    let mut segments: Vec<String> = Vec::new();
    if let Some(t) = title {
        let cleaned = crate::series_detect::normalize_title(t);
        for seg in cleaned
            .split(['\\', '/', ' ', '-', '_', '｜', '|'])
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            // 剥离扩展名（`眼影篇.mp4` → `眼影篇`——文件名本体才有分类语义）
            let stem = seg
                .rsplit_once('.')
                .filter(|(_, ext)| {
                    ["mp4", "mkv", "avi", "mov", "flv", "webm", "wmv"]
                        .contains(&ext.to_lowercase().as_str())
                })
                .map(|(stem, _)| stem)
                .unwrap_or(seg);
            // 过滤：纯数字/纯英文短词（无分类语义）
            if stem.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if stem.chars().count() >= 2 {
                segments.push(stem.to_string());
            }
        }
    }
    PlatformHints { platform_tags: Vec::new(), path_segments: segments }
}

/// OCR 标签通用化（③）：画面内标签/标题卡文字 → 领域投票。
///
/// @ai-context: 不依赖平台枚举——任何平台画面内的分类标签（B站分区/网课
///              "课程章节"/视频标题卡）都是通用 OCR 信号；经领域词表映射
///              投给对应领域（"知识科普|经济管理" 中"经济管理"命中经济领域）。
pub fn ocr_tags_to_domain(texts: &[String]) -> crate::video_profile_domain::DomainDetection {
    let signals = DomainSignals {
        title: None,
        platform_tags: texts.to_vec(),
        user_confirmed: None,
        term_freq: Vec::new(),
    };
    detect_domain(&signals)
}

/// 分区标签形态判定：B站分区名特征（2-8 字中文/已知分区词；防标题正文误判）。
fn is_category_like(s: &str) -> bool {
    let chars = s.chars().count();
    if !(2..=8).contains(&chars) {
        return false;
    }
    // 已知分区词表（B站知识区常见分区；命中即分区标签）
    const KNOWN: &[&str] = &[
        "知识科普", "经济管理", "人文历史", "科学科普", "职场技能", "校园学习",
        "社科人文", "设计创意", "绘画", "音乐", "游戏", "生活", "科技", "数码",
    ];
    KNOWN.iter().any(|k| s.contains(k))
}

/// 单测独立文件。
#[cfg(test)]
#[path = "platform_adapter_tests.rs"]
mod tests;
