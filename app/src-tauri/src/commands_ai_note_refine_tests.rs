//! commands_ai_note_refine.rs 单测（AAA；命令层薄壳以纯逻辑/契约测试为主）。

use crate::commands_ai_note_refine::NOTE_PROFILE_HANDWRITTEN;
use crate::ai_note_refine::NoteRefinePrompt;

#[test]
fn handwritten_profile_contract() {
    // 手写档案 = 笔记式（仅笔记级请求使用；采集端零改动——ADR-026-4）
    assert_eq!(NOTE_PROFILE_HANDWRITTEN, "handwritten");
    let p = NoteRefinePrompt::bundled();
    assert!(p.styles.contains_key("handwritten"), "笔记式风格模板必须存在");
    assert_eq!(p.profile_style.get("handwritten").map(|s| s.as_str()), Some("handwritten"));
    assert!(p.style_system(NOTE_PROFILE_HANDWRITTEN).contains("笔记"), "笔记式风格简介应含「笔记」语义");
}
