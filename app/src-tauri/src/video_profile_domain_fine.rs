//! 细目标签体系（REQ-220 / v0.13.6：curated 细目 × 粗领域，两级领域第二级）。
//!
//! @ai-context: 粗领域驱动 hotwords 预热/术语筛选/区域预期（v0.9.0）；细目在粗领域
//!              之内再分（编程开发→前端/后端/AI…），驱动 hotwords 细分与语义检索。
//!              细目恒可选：检测/用户确认缺省 → 只有粗领域（不阻塞原则不变）。
//! @ai-context: 纯逻辑模块（无 IO/DB）；全表数据在 video_profile_domain_fine_data.rs
//!              （保持 ≤300 行）；DomainTag.fine 升级为细目 id（kebab）多选数组，
//!              旧 raw 中文串未匹配 curated 时按原样展示（兼容兜底）。

use serde::Serialize;

use crate::video_profile_domain::DomainKind;

/// 细目条目（静态表；kebab id + 展示名 + 种子词）。
///
/// @ai-context: seeds 用于检测匹配（text.contains）与 hotwords 预热细分——
///              细目种子词比粗领域词更聚焦（"React" 只属前端，不属编程粗表）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FineTag {
    pub id: &'static str,
    pub label: &'static str,
    pub seeds: &'static [&'static str],
}

/// 细目选项 DTO（前端 chips 拉取；camelCase 契约——list_domain_fine 命令响应用）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FineTagDto {
    pub id: String,
    pub label: String,
}

impl FineTag {
    /// 是否命中文本集（任一种子被任一文本包含）。
    fn matches(&self, texts: &[String]) -> bool {
        self.seeds.iter().any(|s| texts.iter().any(|t| t.contains(s)))
    }
}

/// 粗领域 → 细目全表（金数据）。
pub fn fine_table() -> &'static [(DomainKind, &'static [FineTag])] {
    crate::video_profile_domain_fine_data::FINE_TABLE
}

/// 粗领域 → 细目选项（UI 下拉 chips 同源；未知粗领域 → 空表诚实）。
pub fn fine_options(coarse: DomainKind) -> &'static [FineTag] {
    fine_table()
        .iter()
        .find(|(k, _)| *k == coarse)
        .map(|(_, list)| *list)
        .unwrap_or(&[])
}

/// 解析细目 id：必须属于该粗领域（跨粗领域错配 → None——诚实不猜）。
pub fn parse_fine(coarse: DomainKind, id: &str) -> Option<&'static FineTag> {
    fine_options(coarse).iter().find(|f| f.id == id)
}

/// 文本集 → 命中细目 id 列表（细目种子词匹配；多命中全部返回——细目多选语义）。
pub fn match_fine(texts: &[String], coarse: DomainKind) -> Vec<&'static str> {
    fine_options(coarse)
        .iter()
        .filter(|f| f.matches(texts))
        .map(|f| f.id)
        .collect()
}

/// 已选细目 → hotwords 预热候选（细目种子词并集去重；粗领域种子仍在粗通道）。
///
/// @ai-context: warm 时注入 VocabManager——细目词更聚焦（前端 vs 后端术语不同），
///              命中率↑；输入非法 id 静默跳过（诚实降级为仅粗通道）。
pub fn fine_hotword_candidates(coarse: DomainKind, fine_ids: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for id in fine_ids {
        if let Some(f) = parse_fine(coarse, id) {
            for s in f.seeds {
                if !out.iter().any(|x| x == s) {
                    out.push(s.to_string());
                }
            }
        }
    }
    out
}

/// 单测独立文件。
#[cfg(test)]
#[path = "video_profile_domain_fine_tests.rs"]
mod tests;
