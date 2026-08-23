//! 平台分区映射金数据（REQ-221 / v0.13.6：分区 → 形态/粗领域/细目）。
//!
//! @ai-context: 与 video_profile_platform_map.rs 查询逻辑分离（≤300 行）。
//!              分区键采用**实际可见形态**双轨：
//!              - 窗口标题内联标签（`知识科普|经济管理` 旧式二级分区名，无前缀）
//!              - B站 完整一级-二级名（`知识-科学科普`，防御性覆盖）
//!              未登记分区 → 回落现状通道（零回归）。

use crate::video_profile_domain::DomainKind;
use crate::video_profile_platform_map::ZoneEntry;
use crate::video_profile_spec::ContentForm;

/// 全表（顺序无语义；细目 id 与 video_profile_domain_fine_data 契约一致）。
pub static ZONE_TABLE: &[ZoneEntry] = &[
    // ── 知识区（教学形态 + 学科细目预选）──
    ZoneEntry { zone: "知识科普", form: Some(ContentForm::Lecture), coarse: None, fine: None },
    ZoneEntry { zone: "科学科普", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::MathScience), fine: Some("math") },
    ZoneEntry { zone: "知识-科学科普", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::MathScience), fine: Some("math") },
    ZoneEntry { zone: "人文历史", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::HistoryHumanities), fine: Some("history") },
    ZoneEntry { zone: "知识-人文历史", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::HistoryHumanities), fine: Some("history") },
    ZoneEntry { zone: "社科人文", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::HistoryHumanities), fine: Some("humanities") },
    ZoneEntry { zone: "知识-社科人文", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::HistoryHumanities), fine: Some("humanities") },
    ZoneEntry { zone: "财经商业", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Economy), fine: Some("invest") },
    ZoneEntry { zone: "知识-财经商业", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Economy), fine: Some("invest") },
    ZoneEntry { zone: "校园学习", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Exam), fine: Some("school") },
    ZoneEntry { zone: "知识-校园学习", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Exam), fine: Some("school") },
    ZoneEntry { zone: "职业职场", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Career), fine: Some("interview") },
    ZoneEntry { zone: "知识-职业职场", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Career), fine: Some("interview") },
    ZoneEntry { zone: "设计创意", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Design), fine: None },
    ZoneEntry { zone: "知识-设计创意", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Design), fine: None },
    ZoneEntry { zone: "心理", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Psychology), fine: None },
    ZoneEntry { zone: "知识-心理", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Psychology), fine: None },
    ZoneEntry { zone: "知识-公开课", form: Some(ContentForm::Lecture), coarse: None, fine: None },
    // ── 科技/数码区（代码/实操 + 编程/数码）──
    ZoneEntry { zone: "计算机技术", form: Some(ContentForm::Coding), coarse: Some(DomainKind::Programming), fine: Some("backend") },
    ZoneEntry { zone: "科技-计算机技术", form: Some(ContentForm::Coding), coarse: Some(DomainKind::Programming), fine: Some("backend") },
    ZoneEntry { zone: "软件应用", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Programming), fine: Some("frontend") },
    ZoneEntry { zone: "科技-软件应用", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Programming), fine: Some("frontend") },
    ZoneEntry { zone: "野生技术协会", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::TechGadgets), fine: Some("repair") },
    ZoneEntry { zone: "科技-数码", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::TechGadgets), fine: Some("review") },
    ZoneEntry { zone: "数码", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::TechGadgets), fine: Some("review") },
    ZoneEntry { zone: "评测", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::TechGadgets), fine: Some("review") },
    ZoneEntry { zone: "数码-评测", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::TechGadgets), fine: Some("review") },
    ZoneEntry { zone: "数码-教程", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::TechGadgets), fine: Some("repair") },
    // ── 生活/时尚/运动/美食/音乐/游戏（实操 + 领域）──
    ZoneEntry { zone: "美食制作", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Cooking), fine: Some("home") },
    ZoneEntry { zone: "美食-美食制作", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Cooking), fine: Some("home") },
    ZoneEntry { zone: "烘焙", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Cooking), fine: Some("baking") },
    ZoneEntry { zone: "美食-烘焙", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Cooking), fine: Some("baking") },
    ZoneEntry { zone: "美妆护肤", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Beauty), fine: Some("makeup") },
    ZoneEntry { zone: "时尚-美妆护肤", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Beauty), fine: Some("makeup") },
    ZoneEntry { zone: "穿搭", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Beauty), fine: Some("outfit") },
    ZoneEntry { zone: "时尚-穿搭", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Beauty), fine: Some("outfit") },
    ZoneEntry { zone: "健身", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Fitness), fine: Some("strength") },
    ZoneEntry { zone: "运动-健身", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Fitness), fine: Some("strength") },
    ZoneEntry { zone: "瑜伽", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Fitness), fine: Some("yoga") },
    ZoneEntry { zone: "运动-瑜伽", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Fitness), fine: Some("yoga") },
    ZoneEntry { zone: "音乐教学", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Music), fine: Some("instrument") },
    ZoneEntry { zone: "音乐-音乐教学", form: Some(ContentForm::Lecture), coarse: Some(DomainKind::Music), fine: Some("instrument") },
    ZoneEntry { zone: "单机游戏", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Gaming), fine: Some("guide") },
    ZoneEntry { zone: "游戏-单机游戏", form: Some(ContentForm::HandsOn), coarse: Some(DomainKind::Gaming), fine: Some("guide") },
    ZoneEntry { zone: "电子竞技", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::Gaming), fine: Some("esports") },
    ZoneEntry { zone: "游戏-电子竞技", form: Some(ContentForm::Explainer), coarse: Some(DomainKind::Gaming), fine: Some("esports") },
    // ── 影视/直播（形态独立；领域留空——题材交给内容信号）──
    ZoneEntry { zone: "影视", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "电影", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "电视剧", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "纪录片", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "动画", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "番剧", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "国创", form: Some(ContentForm::Narrative), coarse: None, fine: None },
    ZoneEntry { zone: "直播", form: Some(ContentForm::Live), coarse: None, fine: None },
];
