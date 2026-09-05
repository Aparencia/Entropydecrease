//! SOP 数据层单测（v0.20.3 / REQ-296/297，内存库）。

use super::*;
use crate::db::Db;

fn note_with_steps(db: &Db) -> i64 {
    db.create_note(&crate::types::NewNote {
        title: "卸妆 SOP 笔记".to_string(),
        content: "# 卸妆流程\n第一步 卸眼唇\n第二步 卸全脸\n第三步 洁面\n第四步 检查\n".to_string(),
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
fn template_create_list_delete_and_range_validation() {
    let db = Db::open(":memory:").unwrap();
    let nid = note_with_steps(&db);
    // 行 1..=3（4 个非空步骤中的前 3 行 + 空行过滤）
    let tid = db.create_sop_template(nid, "卸妆检查单", 1, 4, MODE_READDO).unwrap();
    let list = db.list_sop_templates(Some(nid)).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].note_title, "卸妆 SOP 笔记");
    // 同笔记同名覆盖
    db.create_sop_template(nid, "卸妆检查单", 1, 2, MODE_CONFIRM).unwrap();
    let list = db.list_sop_templates(Some(nid)).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].mode, MODE_CONFIRM);
    // 覆盖后原 id 已删（先删后插）——用新 id 验证删除
    let cur_id = list[0].id;
    assert!(db.delete_sop_template(cur_id).unwrap());
    assert!(db.list_sop_templates(Some(nid)).unwrap().is_empty());
    let _ = tid;
}

#[test]
fn lines_to_steps_filters_and_truncates() {
    let content = "a\n\nb\nc\n\n";
    let steps = lines_to_steps(content, 0, 4);
    assert_eq!(steps, vec!["a", "b", "c"], "空行过滤+trim");
    let many = "x\n".repeat(60);
    let capped = lines_to_steps(&many, 0, 59);
    assert_eq!(capped.len(), MAX_SOP_STEPS, "≤50 步护栏");
}

#[test]
fn run_lifecycle_steps_history() {
    let db = Db::open(":memory:").unwrap();
    let nid = note_with_steps(&db);
    let tid = db.create_sop_template(nid, "卸妆流程", 1, 4, MODE_READDO).unwrap();
    let tmpl = db.get_sop_template(tid).unwrap().unwrap();
    let run_id = db.start_sop_run(&tmpl).unwrap();
    // 快照步骤=非空行（标题行 0 未纳入——从 1 开始）
    let steps = db.sop_run_steps(run_id).unwrap();
    assert_eq!(steps.len(), 4);
    assert_eq!(steps[0].text_snapshot, "第一步 卸眼唇");

    // 步更新（done + 证据；failed + 原因）
    assert!(db.update_sop_step(run_id, 1, "done", Some("notes-images/x.png"), None).unwrap());
    assert!(db.update_sop_step(run_id, 2, "failed", None, Some("手法不熟")).unwrap());
    assert!(db.update_sop_step(run_id, 999, "done", None, None).unwrap() == false, "越界步不更新");
    assert!(db.update_sop_step(run_id, 3, "weird", None, None).is_err(), "非法状态拒绝");

    // 收尾 done → 统计 + 完成史
    let detail = db.finish_sop_run(run_id, RUN_DONE).unwrap();
    assert_eq!(detail.stats.done, 1);
    assert_eq!(detail.stats.failed, 1);
    let hist = db
        .list_completion_events(Some(crate::db_completion::EV_SOP_RUN), 10)
        .unwrap();
    assert_eq!(hist.len(), 1);
    assert!(hist[0].meta_json.as_deref().unwrap_or("").contains("\"failed\":1"));
    assert_eq!(db.get_sop_run(run_id).unwrap().unwrap().status, RUN_DONE);
    // 已结束再收尾（幂等外层拦截前）——直接调两次不崩（status 覆盖）即可
    let _ = db.finish_sop_run(run_id, RUN_ABORTED).unwrap();
}

#[test]
fn failure_aggregate_feeds_revision_suggestions() {
    let db = Db::open(":memory:").unwrap();
    let nid = note_with_steps(&db);
    let tid = db.create_sop_template(nid, "流程", 1, 4, MODE_READDO).unwrap();
    let tmpl = db.get_sop_template(tid).unwrap().unwrap();
    for _ in 0..2 {
        let run_id = db.start_sop_run(&tmpl).unwrap();
        db.update_sop_step(run_id, 2, "failed", None, Some("卡顿")).unwrap();
        db.finish_sop_run(run_id, RUN_ABORTED).unwrap();
    }
    let agg = db.sop_failure_aggregate(tid).unwrap();
    assert_eq!(agg.len(), 1, "仅失败步聚合");
    assert_eq!(agg[0].0, 2);
    assert_eq!(agg[0].2, 2, "两步 run 各失败 1 次");
}

#[test]
fn freshness_diff_detects_template_edit() {
    let db = Db::open(":memory:").unwrap();
    let nid = note_with_steps(&db);
    let tid = db.create_sop_template(nid, "流程", 1, 4, MODE_READDO).unwrap();
    let tmpl = db.get_sop_template(tid).unwrap().unwrap();
    let run_id = db.start_sop_run(&tmpl).unwrap();
    let before = db.sop_run_detail(run_id).unwrap().unwrap();
    assert!(!before.freshness_changed);
    // 编辑正文（改首步文字）→ 保鲜 diff 亮起
    let note = db.get_note(nid).unwrap().unwrap();
    let changed = note.content.replace("第一步 卸眼唇", "第一步 卸眼唇唇彩");
    db.update_note(nid, &note.title, &changed).unwrap();
    let after = db.sop_run_detail(run_id).unwrap().unwrap();
    assert!(after.freshness_changed, "执行即保鲜：正文有出入提示修订");
}
