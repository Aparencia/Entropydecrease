//! ai_note_refine.rs 单测（AAA 模式；网络路径不单测——提示词模板/风格解析）。

use crate::ai_note_refine::NoteRefinePrompt;

#[test]
fn bundled_template_parses_with_styles() {
    // 编译期捆绑模板可解析：核心指令 + 五种风格 + 档案映射 + 输出约束
    let p = NoteRefinePrompt::bundled();
    assert!(p.version >= 1);
    assert!(p.core_instruction.contains("整理不创作"), "精修=整理不创作核心指令必须存在");
    assert!(p.styles.len() >= 5, "五种风格模板应齐全，实得 {}", p.styles.len());
    assert!(p.profile_style.contains_key("lecture"));
    assert!(p.profile_style.contains_key("coding"), "扩展类档案必须有映射（回退讲义式）");
    assert!(p.output_format.contains("sections"));
    assert!(!p.few_shot.is_empty());
}

#[test]
fn style_resolution_with_fallback() {
    let p = NoteRefinePrompt::bundled();
    // 网课 → 讲义式（含"讲义"字样）
    assert!(p.style_system("lecture").contains("讲义"));
    // 编程 → 步骤式（profile_style 映射）
    assert!(p.style_system("coding").contains("步骤") || p.style_system("coding").contains("教程"));
    // 未知档案 → fallback 讲义式（不 panic、不空）
    let unknown = p.style_system("no-such-profile");
    assert!(!unknown.is_empty());
    assert!(unknown.contains("讲义") || unknown.contains("笔记"));
}

#[test]
fn build_system_composes_all_parts() {
    let p = NoteRefinePrompt::bundled();
    let s = p.build_system("lecture");
    assert!(s.contains("整理不创作"), "核心指令进入提示词");
    assert!(s.contains("讲义"), "档案风格进入提示词");
    assert!(s.contains("示例输入"), "few-shot 进入提示词");
    assert!(s.contains("sections"), "输出约束进入提示词（含 sections 关键词）");
}

#[test]
fn bundled_fallback_never_empty() {
    // 模板解析失败路径：fallback 仍可解析出可用提示词（不阻断功能）
    let p = NoteRefinePrompt::fallback();
    assert!(!p.build_system("lecture").is_empty());
    assert!(!p.build_system("unknown").is_empty());
}
