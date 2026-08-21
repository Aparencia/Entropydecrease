//! 叙事结构检测（REQ-193 / v0.9.0 M5：故事线/结构化条目/直接教学 模板变体）。
//!
//! @ai-context: 会话 33（小马买房故事化科普）实证——动画科普以故事叙事展开
//!              （专有名词角色 + 口语故事化转折词），讲义/摘要模板直接输出
//!              段落会丢失"叙事主线 + 结构化要点"双重价值。本模块检测
//!              叙事风格 → 产物模板变体（叙事线 + 要点提取）。
//! @ai-context: 模板变体非独立维度（framework-v2 §2.5）：故事化叙事命中 →
//!              讲义/摘要模板的"叙事线+要点"变体；直接教学/结构化条目 →
//!              现有模板路径零回归。
//! @ai-context: 纯逻辑模块（无 IO/DB）；检测特征：专有名词角色（小马/小明/
//!              阿强等拟人角色）+ 口语故事化转折词（有一天/后来/于是/但是/
//!              结果）——本地规则可落地。

use serde::{Deserialize, Serialize};

/// 叙事风格（产物模板变体选择）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NarrativeStyle {
    /// 直接教学（默认：章节+要点直出——现有模板路径零回归）
    DirectTeaching,
    /// 故事化叙事（叙事线 + 要点提取变体——会话 33 归属）
    Storytelling,
}

/// 叙事检测输入（会话信号；全部可选——无信号零回归）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NarrativeSignals {
    /// 转写段文本（会话 segments；故事转折词检测源）
    pub segments: Vec<String>,
    /// OCR 块文本（标题卡/要点卡——结构化要点检测源）
    pub ocr_texts: Vec<String>,
}

/// 叙事检测输出。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NarrativeDetection {
    /// 检测到的叙事风格
    pub style: NarrativeStyle,
    /// 命中得分（0.0-1.0：故事化特征命中率）
    pub score: f32,
    /// 叙事线（故事化时：按时间序抽取的叙事段——保留故事主线）
    pub narrative_line: Vec<String>,
    /// 结构化要点（故事化时：从叙事中提取的要点——"1、公积金贷款利息低"）
    pub key_points: Vec<String>,
}

/// 口语故事化转折词（检测特征 2；命中即故事化证据）。
const STORY_TURN_WORDS: &[&str] = &[
    "有一天", "从前", "后来", "于是", "结果", "没想到", "突然", "就这样",
    "最后", "终于", "可是", "但是呢", "话说", "你们知道吗",
];

/// 角色化称呼模式（检测特征 1：专有名词角色——拟人/昵称+动作）。
const ROLE_PATTERNS: &[&str] = &[
    "小马", "小明", "小红", "小刚", "阿强", "阿花", "老王", "小李", "小王", "老板",
    "主人公", "主角", "同事", "朋友", "邻居",
];

/// 要点提取触发词（"1、""2、" 编号要点/要点卡文字）。
const POINT_MARKERS: &[&str] = &["1、", "2、", "3、", "要点", "重点", "总结", "记住"];

/// 叙事检测（纯函数）：故事化特征投票 → 风格 + 叙事线 + 要点提取。
///
/// @ai-context: 特征投票：转折词命中 ≥2 或（角色命中 ≥1 且转折词 ≥1）→ 故事化；
///              单一特征（仅 1 个转折词/仅角色名）→ 直接教学（防误判——
///              日常口语也带"结果/后来"，误判比漏判更伤模板）。
/// @ai-context: 叙事线 = 含故事化特征（转折词/角色）的转写段按序保留；
///              要点提取 = OCR 要点卡文字 + 编号要点段（"1、公积金贷款利息低"）。
pub fn detect_narrative(signals: &NarrativeSignals) -> NarrativeDetection {
    let mut turn_hits = 0usize;
    let mut role_hits = 0usize;
    let mut narrative_line: Vec<String> = Vec::new();
    let mut key_points: Vec<String> = Vec::new();
    for seg in &signals.segments {
        let has_turn = STORY_TURN_WORDS.iter().any(|w| seg.contains(w));
        let has_role = ROLE_PATTERNS.iter().any(|w| seg.contains(w));
        if has_turn {
            turn_hits += 1;
        }
        if has_role {
            role_hits += 1;
        }
        // 叙事线：含故事化特征的段（角色/转折词）
        if has_turn || has_role {
            narrative_line.push(seg.clone());
        }
        // 编号要点段（"1、xxx"）
        if POINT_MARKERS.iter().take(3).any(|w| seg.contains(w)) {
            key_points.push(seg.clone());
        }
    }
    // OCR 要点卡文字（"要点"卡内容 → 结构化要点）
    for t in &signals.ocr_texts {
        let t = t.trim();
        if t.is_empty() {
            continue;
        }
        if t.contains("要点") || t.contains("总结") || t.contains("重点") {
            key_points.push(t.to_string());
        }
    }
    // 去重保序（叙事线/要点都可能有重复——OCR 多帧同卡）
    narrative_line = dedup_preserve(&narrative_line);
    key_points = dedup_preserve(&key_points);
    let storytelling = turn_hits >= 2 || (role_hits >= 1 && turn_hits >= 1);
    let total = turn_hits + role_hits;
    let score = if total == 0 {
        0.0
    } else if storytelling {
        ((turn_hits + role_hits) as f32 / 6.0).min(1.0)
    } else {
        0.3
    };
    NarrativeDetection {
        style: if storytelling { NarrativeStyle::Storytelling } else { NarrativeStyle::DirectTeaching },
        score,
        narrative_line,
        key_points,
    }
}

/// 去重保序（纯函数）：重复项仅保留首次出现。
fn dedup_preserve(items: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    items.iter().filter(|i| seen.insert((*i).clone())).cloned().collect()
}

/// 叙事风格 → 产物模板变体标记（build_artifact 分发用；直接教学零回归）。
/// 登记豁免 dead_code：当前变体在模板内部消费（storytelling_blocks 分支），
/// 本标记供诊断/日志/未来产物元数据使用。
#[allow(dead_code)]
pub fn template_variant(style: NarrativeStyle) -> &'static str {
    match style {
        NarrativeStyle::DirectTeaching => "direct-teaching",
        NarrativeStyle::Storytelling => "storyline+key-points",
    }
}

/// 单测独立文件。
#[cfg(test)]
#[path = "narrative_detect_tests.rs"]
mod tests;
