//! task_index 表读写单测（v0.20.3 / REQ-292）。
//!
//! @ai-context: 内存库隔离；断言「保存钩子重扫」幂等语义：重复重建无重复行、
//!              行号漂移由重扫吸收、正文原样（索引零回写——真相唯一）。

use super::*;
use crate::db::Db;

fn create_note_with(db: &Db, content: &str) -> i64 {
    db.create_note(&crate::types::NewNote {
        title: "任务笔记".to_string(),
        content: content.to_string(),
        source: "manual".to_string(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: None,
    })
    .unwrap()
    .id
}

#[test]
fn save_hook_indexes_task_lines() {
    // Arrange：新建即建索引（create_note 钩子）
    let db = Db::open(":memory:").unwrap();
    let id = create_note_with(
        &db,
        "# 标题\n- [ ] 任务一\n普通段落\n- [x] 已办事项\n- ☑️ 待办 找资料\n",
    );
    // Act
    let rows = db.list_task_queue(Some(id)).unwrap();
    // Assert：三行入索引（任务一 todo/已办 done/☑️ unrefined）；普通行不入
    assert_eq!(rows.len(), 3);
    assert!(rows.iter().any(|r| r.task_text == "任务一" && r.status == "todo" && !r.unrefined));
    assert!(rows.iter().any(|r| r.task_text == "已办事项" && r.status == "done"));
    assert!(rows.iter().any(|r| r.task_text == "找资料" && r.unrefined));
    assert_eq!(rows[0].note_title, "任务笔记");
}

#[test]
fn update_hook_rescans_and_absorbs_line_shift() {
    let db = Db::open(":memory:").unwrap();
    let id = create_note_with(&db, "- [ ] 原任务\n");
    // Act：前插两行（行号漂移）+ 勾选原任务 → 保存触发重扫
    db.update_note(id, "任务笔记", "新增段落\n\n- [x] 原任务\n").unwrap();
    // Assert：重扫吸收漂移（唯一行、内容为勾选后正文）
    let rows = db.list_task_queue(Some(id)).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].task_text, "原任务");
    assert_eq!(rows[0].status, "done");
    // 正文原样（索引零回写——由字符级迁移路径保证，另行断言正文未变）
    let note = db.get_note(id).unwrap().unwrap();
    assert_eq!(note.content, "新增段落\n\n- [x] 原任务\n");
}

#[test]
fn rebuild_is_idempotent_and_delete_cleans() {
    let db = Db::open(":memory:").unwrap();
    let id = create_note_with(&db, "- [ ] 甲\n- [ ] 乙\n");
    // 更新同内容（触发重扫两次路径）——不重复
    db.update_note(id, "任务笔记", "- [ ] 甲\n- [ ] 乙\n").unwrap();
    let rows = db.list_task_queue(Some(id)).unwrap();
    assert_eq!(rows.len(), 2, "重扫式刷新幂等无重复");
    // 删除笔记 → FK 级联清行（无孤儿）
    db.delete_note(id).unwrap();
    assert!(db.list_task_queue(Some(id)).unwrap().is_empty());
    // 跨组全量查询（None）不含已删行
    assert!(db.list_task_queue(None).unwrap().is_empty());
}

#[test]
fn rebuild_preserves_plan_meta_across_saves() {
    // 审查回归（高-1）：改期元数据是索引列——任何正文保存重扫都不得抹除
    let db = Db::open(":memory:").unwrap();
    let id = create_note_with(&db, "- [ ] 待办甲\n");
    let rows = db.list_task_queue(Some(id)).unwrap();
    let tomorrow = crate::db::unix_seconds() / 86_400 * 86_400 + 86_400;
    db.set_task_plan_date(rows[0].id, Some(tomorrow)).unwrap();
    // 异内容保存（前插一段——行号漂移 + 重扫）
    db.update_note(id, "任务笔记", "新段\n\n- [ ] 待办甲\n").unwrap();
    let after = db.list_task_queue(Some(id)).unwrap();
    assert_eq!(after.len(), 1, "重扫吸收行漂移");
    assert_eq!(after[0].plan_date, Some(tomorrow), "计划日元数据跨重扫保留");
}

#[test]
fn content_without_tasks_indexes_empty() {
    let db = Db::open(":memory:").unwrap();
    let id = create_note_with(&db, "纯文本笔记，无任务行。\n");
    let rows = db.list_task_queue(Some(id)).unwrap();
    assert!(rows.is_empty());
}
