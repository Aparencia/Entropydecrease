//! 笔记文本复核协议 schema（REQ-085 / v0.6.0 M1）。
//!
//! @ai-context: 与云端的契约先行定义——本地规则过滤后仍判不了的边界段 →
//!              批量送审 → 三态判定（keep/delete/merge）回传 → **schema 强校验**：
//!              非法响应直接丢弃（回退纯规则结果，不丢不假）。
//! @ai-context: 纯数据定义 + serde 校验函数；配对适配器 ai_text_filter.rs（云端）/
//!              ai_mock.rs::review_text（离线 mock）。

use serde::{Deserialize, Serialize};

// ────────────────────────────────────────────────────────────
// REQ-085：笔记文本复核协议（边界段三态判定）
// ────────────────────────────────────────────────────────────

/// 文本复核请求（批量：边界段 + 相邻上下文——截断句衔接判定依据）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextFilterRequest {
    pub segments: Vec<TextFilterSegment>,
}

/// 待判定段。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextFilterSegment {
    pub segment_id: i64,
    pub text: String,
    /// 相邻上下文（可空——首尾段）
    pub prev: Option<String>,
    pub next: Option<String>,
    /// 本地特征提示（filler/greeting/truncated…；AI 参考不强制）
    pub hint: Option<String>,
}

/// 三态判定。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TextFilterAction {
    /// 保留
    Keep,
    /// 删除（无效信息）
    Delete,
    /// 合并（截断句衔接 prev/next）
    Merge,
}

/// 单段判定。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextFilterDecision {
    pub segment_id: i64,
    pub action: TextFilterAction,
    /// 判定置信度 0.0-1.0
    pub confidence: f32,
    /// 判定理由（简短中文）
    pub reason: String,
    /// merge 方向：prev | next（仅 action=merge 有效；其余必须 null）
    pub merge_with: Option<String>,
}

/// 文本复核响应（批量判定）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextFilterResponse {
    pub decisions: Vec<TextFilterDecision>,
}

impl TextFilterResponse {
    /// schema 强校验（纯函数）：判定只引用请求段、每段至多一条、字段合法。
    ///
    /// @ai-context: 校验失败 → 丢弃 AI 结果回退纯规则（防御性编程铁律——
    ///              非法响应不得进入笔记管线）。
    pub fn validate(&self, request_ids: &[i64]) -> Result<(), String> {
        let mut seen = std::collections::HashSet::new();
        for d in &self.decisions {
            if !request_ids.contains(&d.segment_id) {
                return Err(format!("判定引用未请求的段: {}", d.segment_id));
            }
            if !seen.insert(d.segment_id) {
                return Err(format!("段重复判定: {}", d.segment_id));
            }
            if !(0.0..=1.0).contains(&d.confidence) {
                return Err(format!("置信度越界: {}", d.confidence));
            }
            if d.reason.trim().is_empty() || d.reason.chars().count() > 200 {
                return Err("判定理由为空或超长".to_string());
            }
            match d.action {
                TextFilterAction::Merge => {
                    if !matches!(d.merge_with.as_deref(), Some("prev") | Some("next")) {
                        return Err(format!("merge 判定缺少合法方向: {:?}", d.merge_with));
                    }
                }
                TextFilterAction::Keep | TextFilterAction::Delete => {
                    if d.merge_with.is_some() {
                        return Err(format!("非 merge 判定不得携带方向: {}", d.segment_id));
                    }
                }
            }
        }
        Ok(())
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_protocol_tests.rs"]
mod tests;
