//! 跟练档案步骤边界检测（REQ-123 / v0.7.0 M2，T4 图像流首个档案）。
//!
//! @ai-context: 跟练型视频（健身/舞蹈/乐器示范）是非结构化知识——"步骤"没有
//!              明确的章节目录，靠三种信号切分：① 口令短语（"第一组/下一个动作/
//!              休息/再来"——M7 语音信号）；② 练习段（复用 practice_detect：
//!              长静音×画面静止同窗——REQ-070）；③ 示范/跟练交替（"跟我做"→示范段，
//!              "到你了/你做"→跟练段——M8 交替口令）。
//! @ai-context: 消费链：analysis.rs 按 FollowAlong 档案 gate 调用本检测 →
//!              artifact_templates.step_cards_blocks 每个边界产出一个步骤图卡
//!              （REQ-123：口令/交替段落标记，有卡无图本版）。
//! @ai-context: 口令短语 JSON 可校准（数据目录 follow_along.json 与内置默认合并，
//!              同 ui_junk.rs 模式——无法用 JSON 删除默认项，防误删）。
//! @ai-context: 纯函数可单测（合成段样本：口令出现/长静音/交替短语 → 边界标记正确）。

use serde::{Deserialize, Serialize};

use crate::practice_detect::{detect_practice_points, PracticeDetectConfig};
use crate::types::{SessionOcrBlock, SessionSegment};

/// 步骤边界（一个边界 = 一个步骤图卡）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StepBoundary {
    /// 边界时刻（ms；相对会话起点，取触发段起点/练习窗起点）
    pub time_ms: u64,
    /// 边界理由（信号来源标识：cue=口令 / practice=练习段 /
    ///            demo=示范段 / practice-cue=跟练段）
    pub reason: String,
    /// 步骤标签（口令原文或"练习/示范/跟练"；None=无标签）
    pub label: Option<String>,
}

/// 口令短语配置（JSON 可校准：数据目录 follow_along.json 与内置默认合并）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowAlongConfig {
    /// 信号①：步骤口令短语（段文本子串命中即边界）
    #[serde(default)]
    pub cue_phrases: Vec<String>,
    /// 信号③：示范段口令（"跟我做/看示范…"）
    #[serde(default)]
    pub demo_phrases: Vec<String>,
    /// 信号③：跟练段口令（"到你了/你做…"）
    #[serde(default)]
    pub practice_phrases: Vec<String>,
    /// 近邻边界合并窗口（ms）：窗口内保留高优先级标签（多信号同刻去重）
    #[serde(default)]
    pub merge_window_ms: u64,
}

/// 内置默认口令表（保守收录——宁可漏切不可误切：误切=步骤卡碎裂）。
fn defaults() -> FollowAlongConfig {
    FollowAlongConfig {
        cue_phrases: vec![
            "第一组", "第二组", "第三组", "第四组", "第五组", "最后一个动作",
            "下一个动作", "下一个", "准备开始", "休息一下", "休息", "再来一遍", "再来一次",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        demo_phrases: vec![
            "跟我做", "跟我一起做", "跟着我做", "看示范", "看我做", "示范一下",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        practice_phrases: vec![
            "到你了", "轮到你了", "现在你来做", "你自己做", "一起做", "跟着练", "自己练",
            "你来试试",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        merge_window_ms: 3_000,
    }
}

impl Default for FollowAlongConfig {
    fn default() -> Self {
        defaults()
    }
}

impl FollowAlongConfig {
    /// 从 JSON 构建（与内置默认合并——无法用 JSON 删除默认项，防误删）。
    /// @ai-context: 校准入口（JSON 可校准惯例）；当前生产用内置默认——
    ///               登记豁免 dead_code（校准文件接入时启用）。
    #[allow(dead_code)]
    pub fn from_json(json: &str) -> Result<Self, String> {
        let parsed: FollowAlongConfig =
            serde_json::from_str(json).map_err(|e| format!("follow_along.json 解析失败: {}", e))?;
        let mut d = defaults();
        d.cue_phrases.extend(parsed.cue_phrases);
        d.demo_phrases.extend(parsed.demo_phrases);
        d.practice_phrases.extend(parsed.practice_phrases);
        // 合并窗口 0/缺失 → 保持默认（防御非法校准值）
        if parsed.merge_window_ms > 0 {
            d.merge_window_ms = parsed.merge_window_ms;
        }
        Ok(d)
    }

    /// 从数据目录 JSON 加载（缺失/损坏 → 内置默认，不阻断启动）。
    /// @ai-context: 校准文件接入时启用（同 ui_junk 模式）——当前生产用内置
    ///               默认，登记豁免 dead_code。
    #[allow(dead_code)]
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[FollowAlong] 口令配置加载失败，使用内置默认: {}", e);
                defaults()
            }),
            Err(_) => defaults(),
        }
    }
}

/// 步骤边界检测（纯函数，默认配置入口）。
pub fn detect_step_boundaries(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
) -> Vec<StepBoundary> {
    detect_step_boundaries_opt(segments, ocr_blocks, &FollowAlongConfig::default())
}

/// 步骤边界检测（精化版）：口令/练习段/示范跟练交替三信号聚合。
///
/// @ai-context: ①口令：段文本命中 cue_phrases → 边界（标签=口令原文）；
///              ③交替：demo_phrases → "示范"边界，practice_phrases → "跟练"边界；
///              ②练习段：复用 detect_practice_points（长静音×画面静止同窗）；
///              三信号按时间排序后近邻合并（同刻多信号保留高优先级标签——
///              口令(3) > 示范/跟练(2) > 练习段(1)，避免同刻重复步骤卡）。
pub fn detect_step_boundaries_opt(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    config: &FollowAlongConfig,
) -> Vec<StepBoundary> {
    let mut boundaries = Vec::new();
    // 信号①：口令短语（步骤切分主信号——M7）
    for seg in segments {
        if let Some(phrase) = config.cue_phrases.iter().find(|p| seg.text.contains(p.as_str())) {
            boundaries.push(StepBoundary {
                time_ms: seg.start_ms,
                reason: "cue".into(),
                label: Some(phrase.clone()),
            });
        }
    }
    // 信号③：示范/跟练交替（M8——"跟我做"→示范段，"到你了"→跟练段）
    for seg in segments {
        let text = seg.text.trim();
        if let Some(p) = config.demo_phrases.iter().find(|p| text.contains(p.as_str())) {
            boundaries.push(StepBoundary {
                time_ms: seg.start_ms,
                reason: "demo".into(),
                label: Some(format!("示范：{}", p)),
            });
        } else if let Some(p) = config.practice_phrases.iter().find(|p| text.contains(p.as_str())) {
            boundaries.push(StepBoundary {
                time_ms: seg.start_ms,
                reason: "practice-cue".into(),
                label: Some(format!("跟练：{}", p)),
            });
        }
    }
    // 信号②：练习段（长静音×画面静止同窗——REQ-070 复用）
    for point in detect_practice_points(segments, ocr_blocks, &PracticeDetectConfig::default()) {
        boundaries.push(StepBoundary {
            time_ms: point.start_ms,
            reason: "practice".into(),
            label: Some("练习".into()),
        });
    }
    // 排序 + 近邻合并（同刻多信号 → 高优先级标签）
    boundaries.sort_by_key(|b| b.time_ms);
    merge_nearby(boundaries, config.merge_window_ms)
}

/// 近邻边界合并（纯函数）：窗口内保留高优先级边界（标签更具体者胜）。
fn merge_nearby(boundaries: Vec<StepBoundary>, window_ms: u64) -> Vec<StepBoundary> {
    let mut out: Vec<StepBoundary> = Vec::new();
    for b in boundaries {
        if let Some(last) = out.last_mut() {
            if b.time_ms.saturating_sub(last.time_ms) <= window_ms {
                if priority(&b) > priority(last) {
                    *last = b;
                }
                continue;
            }
        }
        out.push(b);
    }
    out
}

/// 边界信号优先级（口令最具体 → 交替 → 练习段近似）。
fn priority(b: &StepBoundary) -> u8 {
    match b.reason.as_str() {
        "cue" => 3,
        "demo" | "practice-cue" => 2,
        _ => 1,
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "follow_along_detect_tests.rs"]
mod tests;
