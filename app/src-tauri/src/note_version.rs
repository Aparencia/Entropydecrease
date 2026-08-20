//! 笔记版本管理纯逻辑（REQ-144，v0.8.0 M4）。
//!
//! @ai-context: git-like 快照链：每次变更=新版本（线性，每笔记 50 版上限），
//!              回滚=新版本（content=目标版本，source=user_edit，parent=目标
//!              版本——历史链不破坏）；超限合并最旧两版（保留 meta 摘要——
//!              内容取舍见数据层注释）；本模块只做纯逻辑（来源标记/meta 合并），
//!              数据层在 db_notes_versions.rs，段级 diff 复用 note_diff.rs。

use serde::{Deserialize, Serialize};

/// 版本来源标记（版本徽标 + 语义；serde kebab-case 契约）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NoteVersionSource {
    /// 本地规则（转笔记/旧笔记首快照）
    Rule,
    /// AI 精修采纳
    AiRefine,
    /// AI 补充采纳
    AiEnrich,
    /// 用户编辑/回滚（回滚也标记 user_edit——规划裁决）
    UserEdit,
}

impl NoteVersionSource {
    /// 前端徽标文案（前端另有映射表——后端 label 供日志/测试/未来展示用）。
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            NoteVersionSource::Rule => "本地规则",
            NoteVersionSource::AiRefine => "AI 精修",
            NoteVersionSource::AiEnrich => "AI 补充",
            NoteVersionSource::UserEdit => "用户编辑",
        }
    }
}

/// 版本元数据（meta JSON——成本/模型/切片/合并摘要）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionMeta {
    /// 成本（元；AI 来源版本有值）
    pub cost_yuan: Option<f64>,
    /// 模型（AI 来源版本）
    pub model: Option<String>,
    /// 切片数（AI 精修/补充）
    pub slices: Option<usize>,
    /// 合并来源摘要（超限合并时记录——meta 不丢）
    pub merged_from: Option<String>,
}

/// 每笔记版本上限（REQ-144：50 版，超限合并最旧）。
pub const VERSIONS_LIMIT: usize = 50;

impl VersionMeta {
    /// 合并摘要（纯函数：保留较新 meta，merged_from 记录旧版并入——
    /// 超限合并时最旧两版缩并为一条的元信息）。
    pub fn merged_summary(&self, other: &VersionMeta) -> VersionMeta {
        let mut m = self.clone();
        let summary = |v: &VersionMeta| -> String {
            let mut parts = Vec::new();
            if let Some(c) = v.cost_yuan {
                parts.push(format!("¥{:.4}", c));
            }
            if let Some(s) = v.slices {
                parts.push(format!("{}片", s));
            }
            if parts.is_empty() {
                "无AI元信息".to_string()
            } else {
                parts.join("·")
            }
        };
        m.merged_from = Some(format!("{} 并入 {}", summary(other), summary(self)));
        m
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_version_tests.rs"]
mod tests;
