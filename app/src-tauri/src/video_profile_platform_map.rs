//! 平台分区映射表（REQ-221 / v0.13.6 M4：B站 分区 → 形态/粗领域/细目）。
//!
//! @ai-context: 会话 33 实证——平台分区标签是零成本强信号（`知识科普|经济管理`
//!              OCR 内联标签）；本表让分区 → (形态, 粗领域, 细目) 由确定性映射
//!              给出（置信 1.0），替代"分区原文碰种子词"的碰运气匹配：
//!              - 影视/直播分区 → 独立形态（narrative/live）——标题词常判错
//!              - 知识/科技分区 → 教学形态 + 领域细目预选
//! @ai-context: 映射未命中 → None（诚实回落现状通道，零回归）；影视/直播分区
//!              领域留空（题材不是分区——内容信号照常补全）。
//! @ai-context: 纯逻辑模块（无 IO/DB）；金数据在 video_profile_platform_map_data.rs。

use crate::video_profile_domain::DomainKind;
use crate::video_profile_spec::ContentForm;

/// 分区映射条目（静态表）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZoneEntry {
    /// 分区名（B站一等/二级分区文案，如 "知识-科学科普"；精确匹配）
    pub zone: &'static str,
    /// 形态候选（Some=分区强信号；None=不参与形态裁决）
    pub form: Option<ContentForm>,
    /// 粗领域（Some=定领域；None=领域留给内容信号）
    pub coarse: Option<DomainKind>,
    /// 细目候选（仅 coarse 命中时有效）
    pub fine: Option<&'static str>,
}

/// 全表金数据。
pub fn zone_table() -> &'static [ZoneEntry] {
    crate::video_profile_platform_map_data::ZONE_TABLE
}

/// 单标签 → 条目（精确匹配；空/未命中 → None——诚实回落现状）。
pub fn lookup_zone(tag: &str) -> Option<&'static ZoneEntry> {
    let t = tag.trim();
    if t.is_empty() {
        return None;
    }
    zone_table().iter().find(|e| e.zone.eq_ignore_ascii_case(t))
}

/// 多标签 → 首个命中条目（platform_tags 按可靠性顺序——首个命中即定，防多分区标签歧义）。
pub fn lookup_zone_first(tags: &[String]) -> Option<&'static ZoneEntry> {
    tags.iter().find_map(|t| lookup_zone(t))
}

/// 单测独立文件。
#[cfg(test)]
#[path = "video_profile_platform_map_tests.rs"]
mod tests;
