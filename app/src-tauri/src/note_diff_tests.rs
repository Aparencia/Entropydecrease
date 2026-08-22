//! note_diff.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：全同/全异/插入/删除/混合重组（LCS 保住未变行）/
//!              空输入/统计/规模守卫回退路径不 panic。

use crate::note_diff::{diff_markdown, diff_sections, diff_stats, DiffOp, DiffStatus};

#[test]
fn identical_text_all_unchanged() {
    let ops = diff_markdown("甲\n乙", "甲\n乙");
    assert_eq!(ops.len(), 2);
    assert!(ops.iter().all(|o| matches!(o, DiffOp::Unchanged(_))));
}

#[test]
fn insertion_marked_added() {
    // after 在中间插一行 → Added；前后未变
    let ops = diff_markdown("甲\n丙", "甲\n乙\n丙");
    let kinds: Vec<&str> = ops.iter().map(op_kind).collect();
    assert_eq!(kinds, vec!["unchanged", "added", "unchanged"]);
}

#[test]
fn deletion_marked_removed() {
    let ops = diff_markdown("甲\n乙\n丙", "甲\n丙");
    let kinds: Vec<&str> = ops.iter().map(op_kind).collect();
    assert_eq!(kinds, vec!["unchanged", "removed", "unchanged"]);
}

#[test]
fn reorganization_keeps_lcs_lines() {
    // AI 精修典型：删除一句 + 调整顺序——公共行保未变（LCS）
    let before = "A\nB\nC\nD";
    let after = "A\nC\nB\nD";
    let ops = diff_markdown(before, after);
    let unchanged: Vec<&str> = ops
        .iter()
        .filter_map(|o| match o {
            DiffOp::Unchanged(s) => Some(s.as_str()),
            _ => None,
        })
        .collect();
    // LCS = A,C,D（回溯偏向保留 before 侧）——A/D 必保，C 也保
    assert_eq!(unchanged, vec!["A", "C", "D"]);
    // B 顺序变化：诚实展示 removed + added 各一次（不做移动检测）
    let removed: Vec<&str> = ops.iter().filter_map(|o| match o {
        DiffOp::Removed(s) => Some(s.as_str()),
        _ => None,
    }).collect();
    let added: Vec<&str> = ops.iter().filter_map(|o| match o {
        DiffOp::Added(s) => Some(s.as_str()),
        _ => None,
    }).collect();
    assert_eq!(removed, vec!["B"]);
    assert_eq!(added, vec!["B"]);
}

#[test]
fn completely_different_all_removed_then_added() {
    let ops = diff_markdown("旧一\n旧二", "新一");
    let kinds: Vec<&str> = ops.iter().map(op_kind).collect();
    assert_eq!(kinds, vec!["removed", "removed", "added"]);
}

#[test]
fn empty_inputs() {
    assert!(diff_markdown("", "").is_empty());
    let ops = diff_markdown("", "新增");
    assert_eq!(ops.len(), 1);
    assert!(matches!(ops[0], DiffOp::Added(_)));
    let ops = diff_markdown("删除", "");
    assert!(matches!(ops[0], DiffOp::Removed(_)));
}

#[test]
fn stats_counts() {
    let ops = diff_markdown("甲\n乙\n丙\n丁", "甲\n新\n丙");
    let (added, removed, unchanged) = diff_stats(&ops);
    assert_eq!(added, 1);
    assert_eq!(removed, 2); // 乙、丁 被删
    assert_eq!(unchanged, 2); // 甲、丙 未变
}

#[test]
fn large_input_falls_back_without_panic() {
    // 规模守卫回退路径（行数乘积超上限）——不 panic、结果可消费
    let a: Vec<String> = (0..3000).map(|i| format!("行{}", i)).collect();
    let b: Vec<String> = (0..2500).map(|i| format!("行{}", i)).collect();
    let before = a.join("\n");
    let after = b.join("\n");
    let ops = diff_markdown(&before, &after);
    assert!(ops.len() > 0);
}

fn op_kind(op: &DiffOp) -> &'static str {
    match op {
        DiffOp::Unchanged(_) => "unchanged",
        DiffOp::Added(_) => "added",
        DiffOp::Removed(_) => "removed",
    }
}

// ────────────────────────────────────────────────────────────
// 章节级分组 diff 测试（Task 11 / spec 6️⃣）
// ────────────────────────────────────────────────────────────

#[test]
fn section_rename_groups_as_one_hunk() {
    // 章节标题变化 + 内容变化 → Modified（非 Removed+Added 两条）
    let d = diff_sections("## 第一章\nA\n## 第二章\nC", "## 第一章\nA\n## 第三章\nD");
    // 两节：第一章 unchanged，第三章 modified
    assert!(
        d.iter().any(|s| s.status == DiffStatus::Modified && s.heading.contains("第三章")),
        "Expected Modified for renamed section heading"
    );
    assert!(
        d.iter().any(|s| s.status == DiffStatus::Unchanged && s.heading.contains("第一章")),
        "Expected Unchanged for identical section"
    );
}

#[test]
fn removed_lines_expandable() {
    let d = diff_sections("## 章\n甲\n乙", "## 章\n甲");
    let rm = d.iter().find(|s| s.heading == "章").unwrap();
    assert_eq!(rm.removed_lines, vec!["乙"]);
    assert!(rm.added_lines.is_empty());
    assert_eq!(rm.status, DiffStatus::Modified);
}

#[test]
fn added_section_detected() {
    let d = diff_sections("## 现有\n内容", "## 现有\n内容\n## 新增\n新内容");
    let added = d.iter().find(|s| s.status == DiffStatus::Added).unwrap();
    assert_eq!(added.heading, "新增");
    assert_eq!(added.added_lines, vec!["新内容"]);
}

#[test]
fn removed_section_detected() {
    let d = diff_sections("## 删除\n内容\n## 保留\n内容", "## 保留\n内容");
    let rm = d.iter().find(|s| s.status == DiffStatus::Removed).unwrap();
    assert_eq!(rm.heading, "删除");
}

#[test]
fn unchanged_sections_unmarked() {
    let d = diff_sections("## 甲\nA", "## 甲\nA");
    assert_eq!(d.len(), 1);
    assert_eq!(d[0].status, DiffStatus::Unchanged);
    assert!(d[0].removed_lines.is_empty());
    assert!(d[0].added_lines.is_empty());
}

#[test]
fn no_headings_fallback() {
    // 无 heading → 视为单章（空标题）
    let d = diff_sections("纯文本\n多行", "纯文本\n多行\n新增行");
    assert_eq!(d.len(), 1);
    // 空标题章节，正文有变化 → Modified
    assert_eq!(d[0].status, DiffStatus::Modified);
    assert_eq!(d[0].added_lines, vec!["新增行"]);
}

#[test]
fn multi_level_headings() {
    let d = diff_sections(
        "# H1\n内容A\n## H2\n内容B",
        "# H1\n内容A\n## H2\n内容B\n### H3\n新增",
    );
    let added = d.iter().find(|s| s.status == DiffStatus::Added).unwrap();
    assert_eq!(added.heading, "H3");
}
