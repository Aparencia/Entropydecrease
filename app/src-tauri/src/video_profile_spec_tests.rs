//! 四维解耦数据模型测试（REQ-188 / v0.9.0 M1）。
//!
//! @ai-context: AAA 模式；覆盖 13→7 映射表（framework-v2 §5）、参数矩阵
//!              （形态→模板、画面档→采样/OCR/存储）、维度独立降级、JSON roundtrip。

use super::*;
use crate::video_profile::{ArtifactTemplate, StoreTier};
use crate::video_profile_spec_data as data;

/// 全 7 形态（测试遍历用）。
fn all_forms() -> [ContentForm; 7] {
    [
        ContentForm::Lecture,
        ContentForm::HandsOn,
        ContentForm::Explainer,
        ContentForm::Dialog,
        ContentForm::Exercise,
        ContentForm::Coding,
        ContentForm::Audio,
    ]
}

#[test]
fn form_parse_and_label_roundtrip() {
    // Arrange/Act/Assert：七形态 kebab-case 解析 + 展示名非空
    for f in all_forms() {
        assert_eq!(ContentForm::parse(f.as_str()), Some(f), "{:?} roundtrip", f);
        assert!(!f.label().is_empty(), "{:?} 展示名非空", f);
    }
    // 非法值 → None（诚实不猜默认——与旧 ProfileKind 回退 Lecture 不同）
    assert_eq!(ContentForm::parse("no-such-form"), None);
    assert_eq!(ContentForm::parse(""), None);
}

#[test]
fn tier_parse_and_label_roundtrip() {
    // Arrange/Act/Assert：四档 kebab-case 解析 + 展示名非空
    for t in [VisualTier::Rich, VisualTier::Medium, VisualTier::Low, VisualTier::None] {
        assert_eq!(VisualTier::parse(t.as_str()), Some(t), "{:?} roundtrip", t);
        assert!(!t.label().is_empty(), "{:?} 展示名非空", t);
    }
    assert_eq!(VisualTier::parse("rich"), Some(VisualTier::Rich));
    assert_eq!(VisualTier::parse("none"), Some(VisualTier::None));
    assert_eq!(VisualTier::parse("bad"), None);
}

// ── 13→7 映射（framework-v2 §5 映射表逐行断言）──

#[test]
fn mapping_13_to_7_follows_framework_table() {
    // Assert：讲授组（lecture + whiteboard 画面档=高）
    assert_eq!(ProfileKind::Lecture.to_form(), Some(ContentForm::Lecture));
    assert_eq!(ProfileKind::Whiteboard.to_form(), Some(ContentForm::Lecture));
    // Assert：实操组（hands-on/follow-along/game-tutorial）
    assert_eq!(ProfileKind::HandsOn.to_form(), Some(ContentForm::HandsOn));
    assert_eq!(ProfileKind::FollowAlong.to_form(), Some(ContentForm::HandsOn));
    assert_eq!(ProfileKind::GameTutorial.to_form(), Some(ContentForm::HandsOn));
    // Assert：解说组（talking-head —— 会话 33 动画科普归属）
    assert_eq!(ProfileKind::TalkingHead.to_form(), Some(ContentForm::Explainer));
    // Assert：对话组（interview/meeting）
    assert_eq!(ProfileKind::Interview.to_form(), Some(ContentForm::Dialog));
    assert_eq!(ProfileKind::Meeting.to_form(), Some(ContentForm::Dialog));
    // Assert：题目/代码独立形态
    assert_eq!(ProfileKind::Exercise.to_form(), Some(ContentForm::Exercise));
    assert_eq!(ProfileKind::Coding.to_form(), Some(ContentForm::Coding));
    // Assert：音频组（podcast/live）
    assert_eq!(ProfileKind::Podcast.to_form(), Some(ContentForm::Audio));
    assert_eq!(ProfileKind::Live.to_form(), Some(ContentForm::Audio));
    // Assert：unknown → None（诚实未知，不猜默认）
    assert_eq!(ProfileKind::Unknown.to_form(), None);
}

#[test]
fn mapping_default_tier_follows_framework_table() {
    // Assert：画面档默认（映射表第三列）
    assert_eq!(ProfileKind::Lecture.default_tier(), VisualTier::Medium);
    assert_eq!(ProfileKind::Whiteboard.default_tier(), VisualTier::Rich);
    assert_eq!(ProfileKind::HandsOn.default_tier(), VisualTier::Medium);
    assert_eq!(ProfileKind::FollowAlong.default_tier(), VisualTier::Rich);
    assert_eq!(ProfileKind::GameTutorial.default_tier(), VisualTier::Rich);
    assert_eq!(ProfileKind::TalkingHead.default_tier(), VisualTier::Low);
    assert_eq!(ProfileKind::Interview.default_tier(), VisualTier::Low);
    assert_eq!(ProfileKind::Meeting.default_tier(), VisualTier::Low);
    assert_eq!(ProfileKind::Exercise.default_tier(), VisualTier::Rich);
    assert_eq!(ProfileKind::Coding.default_tier(), VisualTier::Rich);
    assert_eq!(ProfileKind::Podcast.default_tier(), VisualTier::None);
    assert_eq!(ProfileKind::Live.default_tier(), VisualTier::None);
    // unknown 走默认中档（参数不阻塞）
    assert_eq!(ProfileKind::Unknown.default_tier(), VisualTier::Medium);
}

// ── 参数矩阵（形态 → 模板/后处理；画面档 → 采样/权重/存储）──

#[test]
fn template_follows_form_independently() {
    // Arrange/Act/Assert：产物模板随形态独立切换（与画面档无关）
    assert_eq!(template_for_form(ContentForm::Lecture), ArtifactTemplate::LectureNotes);
    assert_eq!(template_for_form(ContentForm::HandsOn), ArtifactTemplate::StepCards);
    assert_eq!(template_for_form(ContentForm::Explainer), ArtifactTemplate::Summary);
    assert_eq!(template_for_form(ContentForm::Dialog), ArtifactTemplate::DialogueNotes);
    assert_eq!(template_for_form(ContentForm::Exercise), ArtifactTemplate::LectureNotes);
    assert_eq!(template_for_form(ContentForm::Coding), ArtifactTemplate::LectureNotes);
    assert_eq!(template_for_form(ContentForm::Audio), ArtifactTemplate::Summary);
}

#[test]
fn sampling_and_storage_follow_tier_independently() {
    // Arrange/Act：画面档参数（同一形态不同档位）
    let rich = data::sampling_for_tier(VisualTier::Rich);
    let medium = data::sampling_for_tier(VisualTier::Medium);
    let low = data::sampling_for_tier(VisualTier::Low);
    let none = data::sampling_for_tier(VisualTier::None);
    // Assert：采样随画面档（高=全帧高频 2s、中=中频 5s、低=低频 30s、无=跳过）
    assert!(rich.full_every < medium.full_every, "高档全帧应高于中档频率");
    assert!(medium.full_every < low.full_every, "中档全帧应高于低档频率");
    assert!(none.full_every > low.full_every, "无档几乎不采样");
    // Assert：OCR 权重（文档 §2.2：1.0 / 0.7 / 0.1 / 0）
    assert!((data::weights_for_tier(VisualTier::Rich).ocr_weight - 1.0).abs() < 1e-6);
    assert!((data::weights_for_tier(VisualTier::Medium).ocr_weight - 0.7).abs() < 1e-6);
    assert!((data::weights_for_tier(VisualTier::Low).ocr_weight - 0.1).abs() < 1e-6);
    assert!((data::weights_for_tier(VisualTier::None).ocr_weight - 0.0).abs() < 1e-6);
    // Assert：存储档（高=图像优先、中=均衡、低/无=文本优先）
    assert_eq!(data::store_tier_for_tier(VisualTier::Rich), StoreTier::ImageFirst);
    assert_eq!(data::store_tier_for_tier(VisualTier::Medium), StoreTier::Balanced);
    assert_eq!(data::store_tier_for_tier(VisualTier::Low), StoreTier::TextFirst);
    assert_eq!(data::store_tier_for_tier(VisualTier::None), StoreTier::TextFirst);
}

// ── 维度独立降级（framework-v2 §2.2：形态 unknown 时画面档照常生效）──

#[test]
fn tier_effective_when_form_unknown() {
    // Arrange：形态 None（识别中）+ 高画面档
    let spec = ProfileSpec { form: None, visual_tier: VisualTier::Rich, ..ProfileSpec::default() };
    // Act：矩阵解析
    let profile = profile_for_spec(&spec);
    // Assert：画面档照常生效（高档采样/存储），模板走默认讲义式（不阻塞）
    assert_eq!(profile.sampling_budget.full_every, 2, "形态 unknown 时高档采样仍生效");
    assert_eq!(profile.storage_tier, StoreTier::ImageFirst, "形态 unknown 时高档存储仍生效");
    assert_eq!(profile.artifact_template, ArtifactTemplate::LectureNotes, "未知形态模板走默认");
}

#[test]
fn none_tier_skips_ocr_chain() {
    // Arrange：音频形态 × 无画面档（旧播客/直播语义）
    let spec = ProfileSpec {
        form: Some(ContentForm::Audio),
        visual_tier: VisualTier::None,
        ..ProfileSpec::default()
    };
    // Act
    let profile = profile_for_spec(&spec);
    // Assert：P4 无图短路 + 摘要文模板 + 文本优先
    assert!(profile.disable_ocr, "无画面档跳过画面链");
    assert!(tier_skips_ocr(VisualTier::None));
    assert!(!tier_skips_ocr(VisualTier::Rich));
    assert_eq!(profile.artifact_template, ArtifactTemplate::Summary);
    assert!((profile.signal_weights.ocr_weight - 0.0).abs() < 1e-6);
}

// ── 旧档案 → 四维规格（记忆库 kind 映射/旧会话解读）──

#[test]
fn spec_from_legacy_kind_maps_both_dimensions() {
    // Arrange/Act：旧 talking-head（会话 33 检测前的状态）
    let spec = spec_from_kind(ProfileKind::TalkingHead);
    // Assert：形态=解说 + 默认档=低（动画升中由会话中重评驱动）
    assert_eq!(spec.form, Some(ContentForm::Explainer));
    assert_eq!(spec.visual_tier, VisualTier::Low);
    // 旧 unknown → 默认规格（识别中：形态 None + 中档）
    let unknown = spec_from_kind(ProfileKind::Unknown);
    assert_eq!(unknown.form, None);
    assert_eq!(unknown.visual_tier, VisualTier::Medium);
}

// ── JSON 契约（检测卡 v2 / 会话落库传输）──

#[test]
fn profile_spec_json_roundtrip() {
    // Arrange：完整四维规格（会话 33 期望结果：解说 × 中档 × 经济管理）
    let spec = ProfileSpec {
        form: Some(ContentForm::Explainer),
        visual_tier: VisualTier::Medium,
        domain: Some(DomainTag {
            coarse: Some("economy".into()),
            fine: vec!["公积金".into(), "住房贷款".into()],
        }),
        language: LanguageTag::Zh,
    };
    // Act：JSON roundtrip
    let raw = serde_json::to_string(&spec).unwrap();
    let back: ProfileSpec = serde_json::from_str(&raw).unwrap();
    // Assert：四维无损
    assert_eq!(back, spec);
    // 缺省字段（旧 JSON/前端省略）→ 默认值（零回归）
    let minimal: ProfileSpec = serde_json::from_str(r#"{"form":"coding"}"#).unwrap();
    assert_eq!(minimal.visual_tier, VisualTier::Medium);
    assert_eq!(minimal.language, LanguageTag::Zh);
    assert_eq!(minimal.domain, None);
}

#[test]
fn resolve_profile_has_legacy_kind_label() {
    // Arrange/Act：矩阵解析（代表旧类仅标识，参数走矩阵）
    let p = data::resolve_profile(ContentForm::Explainer, VisualTier::Medium);
    // Assert：kind 取语义最接近旧类（口播）——展示/落库不误导
    assert_eq!(p.kind, ProfileKind::TalkingHead);
    assert_eq!(p.artifact_template, ArtifactTemplate::Summary);
    assert_eq!(p.sampling_budget.full_every, 5);
}

#[test]
fn default_tier_per_form_sane() {
    // Arrange/Act/Assert：无任何信号时的新会话起点
    assert_eq!(default_tier_for_form(ContentForm::Lecture), VisualTier::Medium);
    assert_eq!(default_tier_for_form(ContentForm::Explainer), VisualTier::Low);
    assert_eq!(default_tier_for_form(ContentForm::Coding), VisualTier::Rich);
    assert_eq!(default_tier_for_form(ContentForm::Audio), VisualTier::None);
}
