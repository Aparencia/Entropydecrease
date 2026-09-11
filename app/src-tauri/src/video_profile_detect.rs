//! 档案检测投票域（REQ-043 / v0.7.1 Unknown / v0.7.2 REQ-152 系列名剥离 / v0.13.6 REQ-221 平台形态）。
//!
//! @ai-context: 从 video_profile.rs 拆出（AGENTS.md §3 单文件 ≤300 行）：本域只做
//!              纯逻辑投票——观测信号 × 各档案检测信号配置 → 加权得分 → 降序候选。
//!              得分权重：标题关键词命中×2（"第X章"额外 +2，要求该档关键词表含"第"）、
//!              URL 命中×2、帧率落区间 +2、字幕偏好命中 +1、时长达标 +1。
//! @ai-context: 投票顺序即语义（禁止重排）：先剥系列名（仅换投票标题，未识别则原样投）
//!              → 满分 ≤0 提前返回 Unknown 单候选（score 1.0 诚实未知）→ 稳定降序
//!              （平分保留数据表顺序）→ 2.5/1.0 双阈值判 needs_confirmation。
//! @ai-context: 零副作用、零 IO、不依赖 windows/DB/引擎；档案参数表在
//!              video_profile_data.rs，本域只消费。签名/阈值逐字沿用原文件。
//! @ai-context: ObservedSignals/ProfileCandidate/DetectResult 保留在本文件，由父模块
//!              `pub use detect::{…}` 再导出（33 处既有导入路径零改动）；本域经
//!              `use super::*` 取用父模块的 ProfileKind/VideoProfile/builtin_profiles。

use super::*;

/// 观测到的检测信号（全部已有/低成本：A5 标题已入库、帧 diff/VAD/时长均为管线现状）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ObservedSignals {
    /// 窗口标题（None=未知）
    pub title: Option<String>,
    /// URL/播放器标题（None=未知）
    pub url: Option<String>,
    /// 画面切换频率（次/分；None=未知）
    pub frame_switch_rate: Option<f32>,
    /// 字幕有无（det 结果统计；None=未知）
    pub has_subtitle: Option<bool>,
    /// 会话时长（分钟；None=未知）
    pub duration_min: Option<u32>,
}

/// 检测候选（降序）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProfileCandidate {
    pub kind: ProfileKind,
    /// 归一化得分 0.0-1.0（最高分档案 = 1.0，其余按比例）
    pub score: f32,
}

/// 检测结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DetectResult {
    /// 候选档案（降序；全部 0 分时为 Unknown 单候选——诚实未知，不猜默认）
    pub candidates: Vec<ProfileCandidate>,
    /// 是否需用户确认（信号冲突/得分不足——置信度低才问，高则静默生效可改）
    pub needs_confirmation: bool,
    /// 记忆偏好命中（同窗口标题上次确认过；直接生效无需确认）
    pub memory_hit: Option<ProfileKind>,
    /// v0.9.0（REQ-188）：记忆命中时的四维形态（检测卡 v2 展示；
    /// 旧 JSON/旧记忆缺省 None——经 memory_hit.to_form() 映射兜底，零回归）
    #[serde(default)]
    pub memory_form: Option<crate::video_profile_spec::ContentForm>,
    /// v0.9.0（REQ-190）：领域标签检测结果（平台分区/标题词/用户确认/术语频率
    /// 四来源；None=未检测——旧 JSON/旧前端零回归）
    #[serde(default)]
    pub domain: Option<crate::video_profile_domain::DomainDetection>,
    /// v0.11.5（Task 5）：记忆命中 + 检测高置信但**冲突**（记忆 kind ≠ 检测首位）
    /// → 检测为准，记忆以标记方式带回（前端展示"记忆与检测冲突，已按检测"）；
    /// 检测低置信/同 kind 时不设（记忆正常生效）；旧 JSON 缺省 None（零回归）
    #[serde(default)]
    pub memory_conflict: Option<ProfileKind>,
    /// v0.13.6（REQ-221）：平台分区映射表命中的形态（确定性检测信号——优先级
    /// 高于记忆/标题候选：影视/直播分区直接定叙事/直播形态）；未命中 None。
    #[serde(default)]
    pub platform_form: Option<crate::video_profile_spec::ContentForm>,
}

/// 检测得分阈值：top 得分低于该值视为信号不足。
const CONFIDENCE_THRESHOLD: f32 = 2.5;
/// 信号冲突阈值：top 与次名差距小于该值视为冲突（需用户裁决）。
const CONFLICT_GAP: f32 = 1.0;

/// 混合检测投票（纯函数）：观测信号 × 五档案检测信号配置 → 候选排序。
///
/// @ai-context: 每档案得分 = 标题关键词命中数×2 + URL 命中×2 + 帧率区间命中×2
///              + 字幕偏好命中 + 时长达标；归一化后输出候选。
/// @ai-context: 记忆偏好由调用方（command 层）先查 ProfileMemory，命中直接生效；
///              本函数只负责信号投票（决策矩阵可注入 fake 信号单测）。
pub fn vote_detect(signals: &ObservedSignals) -> DetectResult {
    // v0.7.2（REQ-152）：标题先剥系列名再投票——同一系列的 P1/P5 标题不同导致
    // 投票漂移（真实短板）；剥离后各集投票一致（"零基础化妆 P3" 与 "P5" 同键）。
    // 未识别出系列（普通标题）→ 原样投票（零回归）；仅换投票标题，不加分不扣分。
    let mut s = signals.clone();
    if let Some(info) = signals
        .title
        .as_deref()
        .and_then(crate::series_detect::extract_series)
    {
        s.title = Some(info.series);
    }
    let profiles = builtin_profiles();
    let mut scored: Vec<(ProfileKind, f32)> = profiles
        .iter()
        .map(|p| (p.kind, score_profile(p, &s)))
        .collect();
    let max = scored.iter().map(|(_, s)| *s).fold(0.0f32, f32::max);
    if max <= 0.0 {
        // 无任何信号命中：Unknown 单候选 + 需确认（诚实未知，不假装猜中网课；
        // v0.7.1 用户需求：无法自动识别时选中"未知"）
        return DetectResult {
            candidates: vec![ProfileCandidate { kind: ProfileKind::Unknown, score: 1.0 }],
            needs_confirmation: true,
            memory_hit: None,
            memory_form: None,
            domain: None,
            memory_conflict: None,
            platform_form: None,
        };
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let candidates: Vec<ProfileCandidate> = scored
        .iter()
        .map(|(kind, score)| ProfileCandidate { kind: *kind, score: score / max })
        .collect();
    let needs_confirmation = scored[0].1 < CONFIDENCE_THRESHOLD
        || scored
            .get(1)
            .map(|(_, s)| scored[0].1 - *s < CONFLICT_GAP)
            .unwrap_or(false);
    DetectResult { candidates, needs_confirmation, memory_hit: None, memory_form: None, domain: None, memory_conflict: None, platform_form: None }
}

/// 单档案得分（纯函数，可注入 fake 信号单测）。
fn score_profile(profile: &VideoProfile, signals: &ObservedSignals) -> f32 {
    let mut score = 0.0f32;
    let ds = &profile.detect_signals;
    if let Some(title) = signals.title.as_deref() {
        let hits = ds.title_keywords.iter().filter(|k| title.contains(k.as_str())).count();
        score += hits as f32 * 2.0;
        // "第X章"模式（网课章节）：title 含"第"且含"章"
        if title.contains('第') && title.contains('章') && ds.title_keywords.contains(&"第".to_string()) {
            score += 2.0;
        }
    }
    if let Some(url) = signals.url.as_deref() {
        let hits = ds.url_keywords.iter().filter(|k| url.contains(k.as_str())).count();
        score += hits as f32 * 2.0;
    }
    if let (Some(rate), Some((lo, hi))) = (signals.frame_switch_rate, ds.frame_switch_range) {
        if rate >= lo && rate <= hi {
            score += 2.0;
        }
    }
    if let Some(has_sub) = signals.has_subtitle {
        if has_sub && ds.prefers_subtitle {
            score += 1.0;
        }
        // 无字幕时偏好字幕的档案不额外加分（保持对称：仅正向信号计分）
    }
    if let (Some(dur), Some(min)) = (signals.duration_min, ds.min_duration_min) {
        if dur >= min {
            score += 1.0;
        }
    }
    score
}
