//! db_questions 单测（v0.20.3 / REQ-300）。

use super::*;
use crate::db::Db;

#[test]
fn create_list_answer_lifecycle() {
    let db = Db::open(":memory:").unwrap();
    let qid = db.create_question("为什么阴影要用冷色？", None, Some(r#"{"seg":"讲义"}"#)).unwrap();
    let open = db.list_questions(Some(Q_OPEN)).unwrap();
    assert_eq!(open.len(), 1);
    db.answer_question(qid, Some(r#"{"kind":"note","id":3}"#)).unwrap();
    assert!(db.list_questions(Some(Q_OPEN)).unwrap().is_empty());
    let answered = db.list_questions(Some(Q_ANSWERED)).unwrap();
    assert_eq!(answered.len(), 1);
    assert_eq!(answered[0].answer_ref.as_deref(), Some(r#"{"kind":"note","id":3}"#));
    // 归档 & 非法状态拒绝
    db.set_question_status(qid, Q_ARCHIVED).unwrap();
    assert!(db.set_question_status(qid, "weird").is_err());
}
