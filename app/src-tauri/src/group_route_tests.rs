//! group_route golden 用例（REQ-196 TDD：路由误判 ★★★★ 死法——单测先行）。

use crate::group_route::{route_group, GroupRouteSignals, RouteAction};
use crate::video_profile_domain::DomainKind;

#[test]
fn series_hit_routes_own_group_directly() {
    // Arrange：系列内容（合集/分P）——assignment 层课程组的早退路径
    let s = GroupRouteSignals { has_series: true, ..Default::default() };
    // Act
    let d = route_group(&s);
    // Assert：直判自成一组，理由含系列标记
    assert_eq!(d.action, RouteAction::OwnGroup);
    assert!(d.reasons.iter().any(|r| r.contains("系列")));
}

#[test]
fn rich_lecture_routes_own_group() {
    // Arrange：典型网课——章节密集 + 术语成块 + 画面文字丰富（3 张高密度票）
    let s = GroupRouteSignals {
        chapter_density: Some(4.0),
        glossary_terms: Some(8),
        ocr_text_density: Some(0.6),
        ..Default::default()
    };
    // Act
    let d = route_group(&s);
    // Assert：高结构共振 → 自成一组，理由非空
    assert_eq!(d.action, RouteAction::OwnGroup);
    assert!(d.reasons.len() >= 2, "共振票应逐条列出：{:?}", d.reasons);
}

#[test]
fn short_chitchat_with_domain_routes_topic_group() {
    // Arrange：低结构闲聊切片——形态未知 + 无章节 + 无术语，领域命中（美妆）
    let s = GroupRouteSignals {
        profile_unknown: true,
        chapter_density: Some(0.0),
        glossary_terms: Some(0),
        domain_kind: Some(DomainKind::Beauty),
        ..Default::default()
    };
    // Act
    let d = route_group(&s);
    // Assert：低结构共振 + 领域 → 归主题组（v4 §3.3 边缘案例）
    assert_eq!(d.action, RouteAction::TopicGroup);
    assert!(d.reasons.iter().any(|r| r.contains("领域")));
}

#[test]
fn low_structure_without_domain_needs_confirm() {
    // Arrange：低结构共振但领域未命中——主题组无处可归
    let s = GroupRouteSignals {
        profile_unknown: true,
        chapter_density: Some(0.0),
        glossary_terms: Some(0),
        ..Default::default()
    };
    // Act
    let d = route_group(&s);
    // Assert：诚实待确认（不硬塞大类抽屉——契约一拒绝大类）
    assert_eq!(d.action, RouteAction::NeedConfirm);
}

#[test]
fn conflicting_signals_need_confirm() {
    // Arrange：术语成块（高票）与形态未知（低票）并存——信号冲突
    let s = GroupRouteSignals {
        glossary_terms: Some(8),
        profile_unknown: true,
        ..Default::default()
    };
    // Act
    let d = route_group(&s);
    // Assert：冲突不乱判（vote_tier 同哲学），两侧理由均呈现
    assert_eq!(d.action, RouteAction::NeedConfirm);
    assert!(d.reasons.len() >= 2);
}

#[test]
fn zero_signals_fallback_own_group() {
    // Arrange：全默认零信号
    let s = GroupRouteSignals::default();
    // Act
    let d = route_group(&s);
    // Assert：兜底自成一组（埋没比空洞更伤——独立组可后续移动）
    assert_eq!(d.action, RouteAction::OwnGroup);
    assert!(d.reasons.iter().any(|r| r.contains("信号不足")));
}

#[test]
fn single_low_signal_with_domain_routes_topic_group() {
    // Arrange：低密度单票（零章节）+ 领域命中——Task 14 实证：
    //          B站标题有领域词但低密度票不足 2（形态已识别/术语不成块）
    let s = GroupRouteSignals {
        chapter_density: Some(0.0),
        domain_kind: Some(DomainKind::Economy),
        ..Default::default()
    };
    // Act
    let d = route_group(&s);
    // Assert：领域命中是强前提——低密度 1 票即归主题组，不落兜底独立组
    assert_eq!(d.action, RouteAction::TopicGroup);
    assert!(d.reasons.iter().any(|r| r.contains("领域")));
}

#[test]
fn ninety_second_derivation_still_own_group() {
    // Arrange：90 秒完整公式推导（v4 §3.3 边缘案例）——时长短但结构密度高
    let s = GroupRouteSignals {
        chapter_density: Some(3.0),
        ocr_text_density: Some(0.7),
        ..Default::default()
    };
    // Act
    let d = route_group(&s);
    // Assert：长短不是判据——高密度自成一组（容器化处理）
    assert_eq!(d.action, RouteAction::OwnGroup);
}
