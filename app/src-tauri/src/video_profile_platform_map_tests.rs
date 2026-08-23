//! 平台分区映射表测试（REQ-221 / v0.13.6；金数据逐行断言）。
//!
//! @ai-context: 覆盖——精确匹配/大小写/空值、多标签首个命中、影视→narrative、
//!              直播→live、知识区→领域细目、未命中回落 None（零回归），
//!              以及"分区映射命中时 detect_domain 链 ① 位生效"（domain 检测联测）。

use super::*;
use crate::video_profile_domain::{detect_domain, DomainKind, DomainSignals};
use crate::video_profile_spec::ContentForm;

#[test]
fn lookup_zone_exact_match_and_case() {
    // Act/Assert：精确匹配 + 大小写不敏感 + 空值/未命中 None
    assert_eq!(lookup_zone("知识-科学科普").and_then(|e| e.coarse), Some(DomainKind::MathScience));
    assert_eq!(lookup_zone("知识-科学科普").and_then(|e| e.form), Some(ContentForm::Lecture));
    assert_eq!(lookup_zone(" 知识-科学科普 ").and_then(|e| e.coarse), Some(DomainKind::MathScience));
    assert_eq!(lookup_zone(""), None);
    assert_eq!(lookup_zone("不存在-分区"), None);
}

#[test]
fn narrative_and_live_zones_map_to_own_forms() {
    // Act：影视/直播分区 → 独立形态 + 领域留空（题材交给内容信号）
    let movie = lookup_zone("电影").expect("电影分区");
    assert_eq!(movie.form, Some(ContentForm::Narrative));
    assert_eq!(movie.coarse, None);
    let live = lookup_zone("直播").expect("直播分区");
    assert_eq!(live.form, Some(ContentForm::Live));
    assert_eq!(live.coarse, None);
}

#[test]
fn knowledge_zone_prefills_coarse_and_fine() {
    // Act：科技-计算机技术 → 代码形态 + 编程后端细目
    let entry = lookup_zone("科技-计算机技术").expect("命中");
    assert_eq!(entry.form, Some(ContentForm::Coding));
    assert_eq!(entry.coarse, Some(DomainKind::Programming));
    assert_eq!(entry.fine, Some("backend"));
}

#[test]
fn lookup_zone_first_returns_first_hit() {
    // Arrange：多标签（窗口标题内联 `知识科普|经济管理` 拆分后）+ 一个未命中
    let tags: Vec<String> = vec!["未知标签".into(), "知识-财经商业".into(), "美食-美食制作".into()];
    // Act/Assert：首个命中即定（防歧义）
    let hit = lookup_zone_first(&tags).expect("首个命中");
    assert_eq!(hit.coarse, Some(DomainKind::Economy));
    // 全未命中 → None
    assert_eq!(lookup_zone_first(&["未知1".into(), "未知2".into()]), None);
}

#[test]
fn detect_domain_uses_platform_map_first() {
    // Arrange：平台标签命中映射（分区原文不再需要碰种子词——确定性高置信）
    let signals = DomainSignals {
        title: Some("某不相关标题无领域词".into()),
        platform_tags: vec!["知识-财经商业".into()],
        user_confirmed: None,
        term_freq: vec![],
        asr_opening: None,
    };
    // Act
    let d = detect_domain(&signals);
    // Assert：映射命中 → coarse+细目预选 + confidence 1.0 + source=platform-map
    assert_eq!(d.kind, Some(DomainKind::Economy));
    assert_eq!(d.fine_ids, vec!["invest".to_string()]);
    assert_eq!(d.source, "platform-map");
    assert_eq!(d.confidence, 1.0);
}

#[test]
fn detect_domain_falls_back_when_map_misses() {
    // Arrange：分区未登记（仅"生活-日常"）+ 标题无词 → 空领域（不猜）
    let signals = DomainSignals {
        title: None,
        platform_tags: vec!["生活-日常".into()],
        user_confirmed: None,
        term_freq: vec![],
        asr_opening: None,
    };
    // Act/Assert：回落现状（none——诚实降级，不阻塞）
    assert_eq!(detect_domain(&signals).kind, None);
}
