//! db_ai_chat.rs 单测（AAA 模式；内存库隔离——不触碰真实数据）。
//!
//! @ai-context: 覆盖：会话 CRUD（建/列表/改名/删）、模型回填、消息插入/
//!              终态回填/列表、级联删除（删会话清消息）、编辑重发删除
//!              语义（删指定消息之后）、ai_tasks 轨迹列读写（双库兼容）。

use crate::db::Db;
use crate::db_ai_tasks::AiTaskRecord;

fn open_mem() -> Db {
    let db = Db::open(":memory:").expect("open mem db");
    db.init_ai_tasks().expect("init ai_tasks");
    db.init_ai_chat().expect("init ai_chat");
    db
}

fn task_rec(task_id: u64, state: &str) -> AiTaskRecord {
    AiTaskRecord {
        task_id,
        op_type: "refine".to_string(),
        ref_id: 1,
        state: state.to_string(),
        result_json: None,
        cost_yuan: None,
        elapsed_ms: None,
        model: Some("m".to_string()),
        error: None,
        slices: Some(1),
        created_at: 1,
        finished_at: None,
        adopted: false,
        target_kind: None,
    }
}

#[test]
fn session_crud_roundtrip() {
    let db = open_mem();
    let id = db.insert_chat_session(None).unwrap();
    let id2 = db.insert_chat_session(Some("讨论深拷贝")).unwrap();
    // 列表：最近更新在前
    let list = db.list_chat_sessions().unwrap();
    assert_eq!(list.len(), 2);
    let title: Vec<String> = list.iter().map(|s| s.title.clone()).collect();
    assert!(title.contains(&"新对话".to_string()));
    assert!(title.contains(&"讨论深拷贝".to_string()));
    // 改名
    db.rename_chat_session(id2, "改后的标题").unwrap();
    let s = db.get_chat_session(id2).unwrap().unwrap();
    assert_eq!(s.title, "改后的标题");
    // 模型回填
    db.set_chat_session_model(id2, Some("deepseek"), "deepseek-v4-flash-vision-exp").unwrap();
    let s = db.get_chat_session(id2).unwrap().unwrap();
    assert_eq!(s.model.as_deref(), Some("deepseek-v4-flash-vision-exp"));
    assert_eq!(s.provider_id.as_deref(), Some("deepseek"));
    // 删除
    db.delete_chat_session(id).unwrap();
    assert_eq!(db.list_chat_sessions().unwrap().len(), 1);
}

#[test]
fn get_session_missing_returns_none() {
    let db = open_mem();
    assert!(db.get_chat_session(999).unwrap().is_none());
}

#[test]
fn message_lifecycle_and_order() {
    let db = open_mem();
    let sid = db.insert_chat_session(None).unwrap();
    let _mid = db.insert_chat_message(sid, "user", "你好", "done").unwrap();
    let aid = db.insert_chat_message(sid, "assistant", "", "streaming").unwrap();
    // 终态回填（流式完成）
    db.finish_chat_message(aid, "你好呀", "done", Some(r#"{"totalTokens":42}"#), Some("m1")).unwrap();
    let msgs = db.list_chat_messages(sid).unwrap();
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0].content, "你好");
    assert_eq!(msgs[1].content, "你好呀");
    assert_eq!(msgs[1].status, "done");
    assert_eq!(msgs[1].usage_json.as_deref(), Some(r#"{"totalTokens":42}"#));
    assert_eq!(msgs[1].model.as_deref(), Some("m1"));
    assert!(db.get_chat_session(sid).unwrap().is_some());
    // 删除会话 → 级联清消息
    db.delete_chat_session(sid).unwrap();
    assert!(db.list_chat_messages(sid).unwrap().is_empty());
}

#[test]
fn edit_resend_deletes_messages_after() {
    let db = open_mem();
    let sid = db.insert_chat_session(None).unwrap();
    let m1 = db.insert_chat_message(sid, "user", "原来", "done").unwrap();
    let _m2 = db.insert_chat_message(sid, "assistant", "旧回答", "done").unwrap();
    // 编辑后重发：改内容 + 删除其后消息（会话限定）
    db.update_chat_message_content(sid, m1, "改后").unwrap();
    db.delete_chat_messages_after(sid, m1).unwrap();
    let msgs = db.list_chat_messages(sid).unwrap();
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].content, "改后");
    // m2 已删（id > m1 排除）
    assert!(db.list_chat_messages(sid).unwrap().len() == 1);
    // 跨会话编辑被拒（会话限定——查无此行，内容不变）
    let s2 = db.insert_chat_session(None).unwrap();
    db.update_chat_message_content(s2, m1, "篡改").unwrap();
    assert_eq!(db.list_chat_messages(sid).unwrap()[0].content, "改后");
}

#[test]
fn chat_message_role_scoped_and_role_report() {
    let db = open_mem();
    let sid = db.insert_chat_session(None).unwrap();
    let um = db.insert_chat_message(sid, "user", "u", "done").unwrap();
    let am = db.insert_chat_message(sid, "assistant", "a", "done").unwrap();
    assert_eq!(db.chat_message_role(sid, um).unwrap().as_deref(), Some("user"));
    assert_eq!(db.chat_message_role(sid, am).unwrap().as_deref(), Some("assistant"));
    // 跨会话 id → None（不入参校验即误改的根因防线）
    assert_eq!(db.chat_message_role(sid + 100, um).unwrap(), None);
}

#[test]
fn delete_message_scoped_to_session() {
    let db = open_mem();
    let s1 = db.insert_chat_session(None).unwrap();
    let s2 = db.insert_chat_session(None).unwrap();
    let m = db.insert_chat_message(s1, "user", "x", "done").unwrap();
    // 跨会话删除被拒绝（消息 id 不属于 s2 → 0 行受影响，消息仍在）
    db.delete_chat_message(s2, m).unwrap();
    assert_eq!(db.list_chat_messages(s1).unwrap().len(), 1);
    db.delete_chat_message(s1, m).unwrap();
    assert!(db.list_chat_messages(s1).unwrap().is_empty());
}

#[test]
fn trajectory_column_roundtrip_and_migration_idempotent() {
    let db = open_mem();
    // init_ai_tasks 触发 ensure_column——重复调用幂等（双库兼容：建表后补列）
    db.init_ai_tasks().unwrap();
    db.insert_ai_task(&task_rec(1, "succeeded")).unwrap();
    // 更新后读取
    db.update_ai_task_trajectory(1, r#"[{"turn":1,"system":"s","user":"u","response":"r"}]"#).unwrap();
    let got = db.get_ai_task_trajectory(1).unwrap();
    assert_eq!(got.as_deref(), Some(r#"[{"turn":1,"system":"s","user":"u","response":"r"}]"#));
    // 无轨迹任务 → None（旧任务诚实降级）
    assert!(db.get_ai_task_trajectory(2).unwrap().is_none());
    // v0.17.1 回归：任务存在但列为 NULL（旧任务/未写入轨迹）→ Ok(None)——
    // 此前 get::<String> 对 NULL 列抛 "Invalid column type Null"（用户报障）
    db.insert_ai_task(&task_rec(3, "succeeded")).unwrap();
    assert!(db.get_ai_task_trajectory(3).unwrap().is_none());
}
