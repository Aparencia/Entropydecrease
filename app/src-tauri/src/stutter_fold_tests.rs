//! 结巴折叠与术语替换单测（REQ-164 / v0.7.5）。
//!
//! @ai-context: AAA 模式；覆盖折叠矩阵（3 连/2 连/白名单/长结巴）、术语替换
//!              守卫（防"项目班子子"二次误伤）、黄金语料样本（会话31 实句）。

use super::*;

#[test]
fn triple_run_folds_to_single_char() {
    // Arrange & Act：3 连折叠（会话31：「甲甲甲方的项目」）
    let folded = fold_stutter("甲甲甲方的项目");
    // Assert
    assert_eq!(folded, "甲方的项目");
}

#[test]
fn longer_runs_fold_too() {
    // Act & Assert：4/5 连同样折叠（走走走走 非白名单叠词）
    assert_eq!(fold_stutter("走走走走"), "走");
    assert_eq!(fold_stutter("行行行行行研究"), "行研究");
}

#[test]
fn double_run_untouched_for_legal_reduplication() {
    // Act & Assert：白名单矩阵——合法叠词（2 连）天然不折叠
    for w in ["慢慢", "常常", "好好", "等等", "谢谢", "看看"] {
        assert_eq!(fold_stutter(w), w, "合法叠词 {} 不得折叠", w);
        assert_eq!(fold_stutter(&format!("{}来", w)), format!("{}来", w));
    }
}

#[test]
fn whitelist_prefix_protects_triple_emphasis() {
    // Act & Assert：3-4 连以白名单叠词开头（"慢慢慢"= 慢慢+强调尾）→ 保护不折；
    // 但非白名单 3 连（"哈哈哈"无白名单前缀——哈哈未登记）照折
    assert_eq!(fold_stutter("慢慢慢"), "慢慢慢");
    assert_eq!(fold_stutter("等等等"), "等等等");
    assert_eq!(fold_stutter("哈哈哈"), "哈");
}

#[test]
fn five_plus_run_always_folds() {
    // Act & Assert：≥5 连视为长结巴，白名单前缀也不保护
    assert_eq!(fold_stutter("慢慢慢慢慢"), "慢");
}

#[test]
fn single_and_double_chars_untouched() {
    // Act & Assert：无重复/2 连文本原样返回
    assert_eq!(fold_stutter("项目管理"), "项目管理");
    assert_eq!(fold_stutter(""), "");
}

#[test]
fn term_replace_project_team() {
    // Act & Assert：会话31 黄金样本「搭建项目班啊」→ 完整术语
    assert_eq!(apply_term_replacements("搭建项目班啊"), "搭建项目班子啊");
    assert_eq!(apply_term_replacements("搭建项目班"), "搭建项目班子");
}

#[test]
fn term_replace_guards_against_double_suffix() {
    // Act & Assert：守卫——已含"子"（项目班子）或"组"（项目班组）不替换
    assert_eq!(apply_term_replacements("搭建项目班子"), "搭建项目班子");
    assert_eq!(apply_term_replacements("项目班组管理"), "项目班组管理");
}

#[test]
fn term_replace_feasibility_study() {
    // Act & Assert：会话31「做项目可行行研究」→ 可行性研究（2 连叠字）
    assert_eq!(apply_term_replacements("做项目可行行研究"), "做项目可行性研究");
}

#[test]
fn pipeline_order_fold_then_term() {
    // Act：结巴折叠在前、术语替换在后（note_filter 净化顺序契约）
    let text = "搭建项目班，做项目可行行研究，甲甲甲方的项目";
    let folded = fold_stutter(text);
    let replaced = apply_term_replacements(&folded);
    // Assert
    assert_eq!(replaced, "搭建项目班子，做项目可行性研究，甲方的项目");
}
