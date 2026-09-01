//! ai_note_refine_task.rs 单测（AAA；纯函数——章节提取/基线兜底）。

use crate::ai_note_refine_task::chapters_from_markdown;

#[test]
fn extracts_h2_chapters_from_markdown() {
    let md = "## 第一章 引言\n正文…\n## 第 2 节\n- 要点\n未标题行不提取";
    let ch = chapters_from_markdown(md);
    assert_eq!(ch, vec!["第一章 引言".to_string(), "第 2 节".to_string()]);
}

#[test]
fn ignores_h1_and_fragments() {
    let md = "# 文档标题\n##\n##    \n一些正文";
    let ch = chapters_from_markdown(md);
    assert!(ch.is_empty(), "无有效章节标题 → 空 vec（模型归纳，不发明章节）：{:?}", ch);
}

#[test]
fn empty_content_yields_empty_chapters() {
    assert!(chapters_from_markdown("").is_empty());
}

#[test]
fn stream_frame_serde_contract() {
    // REQ-247 流式帧契约：serde tag="kind" + camelCase 字段（前端 useRefineStream 同契约）
    let f = crate::ai_refine_task::RefineStreamFrame::BlockDone {
        slice_index: 2,
        markdown: "## 章节\n正文".to_string(),
    };
    let v = serde_json::to_value(&f).expect("帧可序列化");
    assert_eq!(v, serde_json::json!({ "kind": "blockDone", "sliceIndex": 2, "markdown": "## 章节\n正文" }),
        "帧序列化契约（前端 useRefineStream 消费同形态）");
}
