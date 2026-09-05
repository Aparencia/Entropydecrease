//! tasks_core 纯函数单测（v0.20.3 / REQ-292，AAA）。

use super::*;

#[test]
fn parse_recognizes_gfm_checkboxes() {
    let todo = parse_task_line("- [ ] 提炼要点").unwrap();
    assert_eq!(todo.status, TaskStatus::Todo);
    assert!(!todo.unrefined);
    assert_eq!(todo.payload, "提炼要点");
    let done = parse_task_line("- [x] 已完成事项").unwrap();
    assert_eq!(done.status, TaskStatus::Done);
    let done_upper = parse_task_line("* [X] 大写完成").unwrap();
    assert_eq!(done_upper.status, TaskStatus::Done);
}

#[test]
fn parse_recognizes_ordered_and_indented() {
    let ordered = parse_task_line("3. [ ] 有序任务").unwrap();
    assert_eq!(ordered.payload, "有序任务");
    // 缩进行（嵌套列表）同样识别——行级扫描以内容为准
    let indented = parse_task_line("    - [ ] 缩进任务").unwrap();
    assert_eq!(indented.payload, "缩进任务");
}

#[test]
fn parse_unrefined_emoji_line() {
    let p = parse_task_line("- ☑️ 待办 找两篇文章剪藏").unwrap();
    assert!(p.unrefined);
    assert_eq!(p.status, TaskStatus::Todo);
    assert_eq!(p.payload, "找两篇文章剪藏");
}

#[test]
fn parse_rejects_non_task_lines() {
    assert!(parse_task_line("普通段落内容").is_none());
    assert!(parse_task_line("- 无序列表（非任务）").is_none());
    assert!(parse_task_line("[ ] 无列表符号").is_none());
    assert!(parse_task_line("").is_none());
}

#[test]
fn migrate_todo_to_done_and_back() {
    let line = "- [ ] 学习熵减";
    let done = migrate_status(line, TaskStatus::Done).unwrap();
    assert_eq!(done, "- [x] 学习熵减", "仅勾选框字符级改写");
    let back = migrate_status(&done, TaskStatus::Todo).unwrap();
    assert_eq!(back, line);
}

#[test]
fn migrate_keeps_whitespace_and_prefix() {
    let line = "  1. [ ] 任务（有缩进与序号）";
    let done = migrate_status(line, TaskStatus::Done).unwrap();
    assert_eq!(done, "  1. [x] 任务（有缩进与序号）");
}

#[test]
fn migrate_rejects_unrefined_or_same() {
    let p = "- ☑️ 待办 内容";
    assert!(migrate_status(p, TaskStatus::Done).is_none(), "产物遗留行无勾选框");
    let done = "- [x] 已办";
    assert_eq!(migrate_status(done, TaskStatus::Done).unwrap(), done, "同状态原样返回");
}

#[test]
fn replace_line_updates_given_index() {
    let body = "行一\n- [ ] 待改\n行三";
    let out = replace_line(body, 1, "- [x] 已改").unwrap();
    assert_eq!(out, "行一\n- [x] 已改\n行三");
    assert!(replace_line(body, 3, "越界").is_none());
}

#[test]
fn replace_line_preserves_trailing_newline() {
    let body = "a\n- [ ] b\n";
    let out = replace_line(body, 1, "- [x] b").unwrap();
    assert_eq!(out, "a\n- [x] b\n");
}
