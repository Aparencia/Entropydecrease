//! ai_note_enrich.rs 单测（AAA 模式；网络路径不单测——模板/子项说明）。

use crate::ai_enrich_protocol::AiEnrichKind;
use crate::ai_note_enrich::NoteEnrichPrompt;

#[test]
fn bundled_template_parses_with_kinds() {
    let p = NoteEnrichPrompt::bundled();
    assert!(p.version >= 1);
    assert!(p.system.contains("知识补充"), "基础指令必须存在");
    assert!(p.kinds.len() >= 9, "九子项说明应齐全，实得 {}", p.kinds.len());
    assert!(p.output_format.contains("blocks"));
    assert!(p.system.contains("禁止"), "B6 无链接约束必须在基础指令中");
}

#[test]
fn build_system_injects_selected_kinds_only() {
    let p = NoteEnrichPrompt::bundled();
    let selected = vec![AiEnrichKind::D1, AiEnrichKind::B6];
    let s = p.build_system(&selected);
    assert!(s.contains("d1: 概念展开") || s.contains("d1:"), "勾选子项说明注入");
    assert!(s.contains("b6:") , "B6 说明注入");
    assert!(!s.contains("b2:"), "未勾选子项不注入（提示词精简）");
    assert!(s.contains("blocks"), "输出约束进入提示词");
}

#[test]
fn kind_as_str_matches_kebab_case() {
    assert_eq!(AiEnrichKind::D1.as_str(), "d1");
    assert_eq!(AiEnrichKind::B6.as_str(), "b6");
    for k in AiEnrichKind::all() {
        assert!(!k.as_str().is_empty());
    }
}

#[test]
fn fallback_never_empty() {
    let p = NoteEnrichPrompt::fallback();
    assert!(!p.build_system(AiEnrichKind::all().as_ref()).is_empty());
}
