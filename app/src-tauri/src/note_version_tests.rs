//! note_version.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：来源标记 label/serde kebab-case、meta 默认/合并摘要
//!              （含/不含 AI 元信息）、VERSIONS_LIMIT 常量。

use crate::note_version::{NoteVersionSource, VersionMeta, VERSIONS_LIMIT};

#[test]
fn source_labels_and_serde() {
    assert_eq!(NoteVersionSource::Rule.label(), "本地规则");
    assert_eq!(NoteVersionSource::AiRefine.label(), "AI 精修");
    assert_eq!(NoteVersionSource::AiEnrich.label(), "AI 补充");
    assert_eq!(NoteVersionSource::UserEdit.label(), "用户编辑");
    // serde kebab-case 契约（版本徽标前端解析）
    let s: NoteVersionSource = serde_json::from_str("\"ai-refine\"").expect("kebab-case 反序列化");
    assert_eq!(s, NoteVersionSource::AiRefine);
    assert_eq!(serde_json::to_string(&NoteVersionSource::AiEnrich).unwrap(), "\"ai-enrich\"");
}

#[test]
fn version_limit_constant() {
    assert_eq!(VERSIONS_LIMIT, 50, "REQ-144：每笔记 50 版上限");
}

#[test]
fn meta_default_is_empty() {
    let m = VersionMeta::default();
    assert!(m.cost_yuan.is_none() && m.model.is_none() && m.slices.is_none() && m.merged_from.is_none());
}

#[test]
fn merged_summary_keeps_newer_and_records_source() {
    // 较新（self）保 cost/model/slices；merged_from 记录旧版并入摘要
    let old = VersionMeta {
        cost_yuan: Some(0.05),
        slices: Some(2),
        ..VersionMeta::default()
    };
    let newer = VersionMeta {
        cost_yuan: Some(0.08),
        model: Some("m-1".to_string()),
        slices: Some(3),
        ..VersionMeta::default()
    };
    let merged = newer.merged_summary(&old);
    assert_eq!(merged.cost_yuan, Some(0.08));
    assert_eq!(merged.model.as_deref(), Some("m-1"));
    assert_eq!(merged.slices, Some(3));
    let note = merged.merged_from.expect("合并摘要必填");
    assert!(note.contains("¥0.0500"), "旧版费用进入摘要: {}", note);
    assert!(note.contains("2片"), "旧版切片数进入摘要: {}", note);
}

#[test]
fn merged_summary_without_ai_meta_falls_back() {
    let old = VersionMeta::default();
    let newer = VersionMeta::default();
    let merged = newer.merged_summary(&old);
    assert!(merged.merged_from.unwrap_or_default().contains("无AI元信息"));
}
