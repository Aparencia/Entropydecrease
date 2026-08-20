//! ai_task.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：切片边界（≤max 单片/超限按行落片/章节标题天然新片/
//!              单行超长硬切/CJK 多字节不 panic/空输入）、失败四类映射、
//!              失败 kind/message 访问。

use crate::ai_client::AiClientError;
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};

#[test]
fn short_note_single_slice() {
    let md = "第一段\n第二段";
    let s = slice_note(md, SLICE_MAX_CHARS);
    assert_eq!(s.len(), 1);
    assert_eq!(s[0], md);
}

#[test]
fn empty_note_yields_no_slices() {
    assert!(slice_note("", SLICE_MAX_CHARS).is_empty());
    assert!(slice_note("   \n  ", SLICE_MAX_CHARS).is_empty());
}

#[test]
fn splits_when_exceeding_limit() {
    // 每行 10 字符、限 25 → 两片（第一片两行=21，第二片一行=10）
    let md = "abcdefghij\nklmnopqrst\nuvwxyzABCD";
    let s = slice_note(md, 25);
    assert_eq!(s.len(), 2);
    assert_eq!(s[0], "abcdefghij\nklmnopqrst");
    assert_eq!(s[1], "uvwxyzABCD");
}

#[test]
fn chapter_heading_starts_new_slice() {
    // 章节标题行是 `## ` 开头——当前片已满时标题成为新片起点（边界优先）
    let md = "第一段内容\n## 第二章\n第二段内容";
    let s = slice_note(md, 12);
    // 首片="第一段内容"（6+1=7 字符），"## 第二章" 行本身 6 字符 ≤12 → 并入？
    // 逐行：第一行 6 字符；第二行 heading 6 字符——cur(6)+6+1=13 > 12 → 落片
    assert_eq!(s[0], "第一段内容");
    assert!(s[1].starts_with("## 第二章"));
}

#[test]
fn long_line_hard_splits_by_chars() {
    // 单行 30 字符、限 10 → 3 片（字符级硬切）
    let md = "abcdefghijklmnopqrstuvwxyzABCD";
    let s = slice_note(md, 10);
    assert_eq!(s.len(), 3);
    assert_eq!(s[0], "abcdefghij");
    assert_eq!(s[1], "klmnopqrst");
    assert_eq!(s[2], "uvwxyzABCD");
}

#[test]
fn cjk_multi_byte_no_panic() {
    // CJK 多字节字符硬切不 panic、不产生无效 UTF-8（char 迭代）
    let md = "中文字符串很长".repeat(50);
    let s = slice_note(&md, 100);
    assert!(s.len() > 1);
    for slice in &s {
        assert!(std::str::from_utf8(slice.as_bytes()).is_ok());
        assert!(slice.chars().count() <= 100);
    }
    // 拼接不丢内容
    let joined: String = s.iter().flat_map(|x| x.chars()).collect();
    assert!(joined.starts_with('中'));
}

#[test]
fn failure_mapping_from_client_error() {
    let cases = [
        (AiClientError::Auth("a".into()), "unauthorized"),
        (AiClientError::Network("n".into()), "network"),
        (AiClientError::Balance("b".into()), "balance"),
        (AiClientError::Quota("q".into()), "quota"),
        (AiClientError::Server("s".into()), "server"),
        (AiClientError::Parse("p".into()), "invalid"),
    ];
    for (err, expected_kind) in cases {
        let f = AiTaskFailure::from(err.clone());
        assert_eq!(f.kind(), expected_kind, "错误 {:?} 映射类别", err);
        assert!(!f.message().is_empty());
    }
}

/// 契约快照测试（2026-08-21 真机"调用有记录但结果未使用"根因的回归护栏）：
///
/// @ai-context: 前端 types.ts 按 PascalCase 变体名 + snake_case 字段消费
///              AiTaskState（"Pending"/{"Running":{finished_slices,...}}/
///              "Succeeded"/{"Failed":{reason}}），失败原因按四类小写标签
///              （unauthorized/network/balance/quota/server/invalid/other）。
///              本测试断言 serde 输出 = 前端期望的 JSON 字面量——任何一端
///              契约漂移立即红，杜绝"后端成功前端永久排队中"类事故复发。
#[test]
fn serde_contract_snapshot_matches_frontend() {
    // AiTaskState：变体名 PascalCase（unit variant = 字符串字面量）
    assert_eq!(serde_json::to_string(&AiTaskState::Pending).unwrap(), r#""Pending""#);
    assert_eq!(serde_json::to_string(&AiTaskState::Succeeded).unwrap(), r#""Succeeded""#);
    // struct variant：外部标签 PascalCase + 字段 snake_case
    let running = AiTaskState::Running { finished_slices: 1, total_slices: 3 };
    assert_eq!(
        serde_json::to_string(&running).unwrap(),
        r#"{"Running":{"finished_slices":1,"total_slices":3}}"#
    );
    // 失败嵌套 reason
    let failed = AiTaskState::Failed { reason: AiTaskFailure::Unauthorized("x".into()) };
    assert_eq!(
        serde_json::to_string(&failed).unwrap(),
        r#"{"Failed":{"reason":{"unauthorized":"x"}}}"#
    );
    // AiTaskFailure：四类出口标签（camelCase + 两个显式 rename）
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::Unauthorized("a".into())).unwrap(),
        r#"{"unauthorized":"a"}"#
    );
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::Network("n".into())).unwrap(),
        r#"{"network":"n"}"#
    );
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::InsufficientBalance("b".into())).unwrap(),
        r#"{"balance":"b"}"#
    );
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::Quota("q".into())).unwrap(),
        r#"{"quota":"q"}"#
    );
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::Server("s".into())).unwrap(),
        r#"{"server":"s"}"#
    );
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::InvalidResponse("i".into())).unwrap(),
        r#"{"invalid":"i"}"#
    );
    assert_eq!(
        serde_json::to_string(&AiTaskFailure::Other("o".into())).unwrap(),
        r#"{"other":"o"}"#
    );
    // 反序列化回环（任务注册表存 JSON——恢复路径依赖）
    let v = serde_json::to_value(&running).unwrap();
    let back: AiTaskState = serde_json::from_value(v).unwrap();
    assert_eq!(back, running);
}
