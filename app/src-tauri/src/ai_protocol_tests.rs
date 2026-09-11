//! 笔记文本复核协议 schema 校验单测（REQ-085 / v0.6.0 M1）。
//!
//! @ai-context: AAA 模式；覆盖三态判定响应校验矩阵（未请求段/重复段/越界/merge 方向）。

use super::*;

fn decision(id: i64, action: TextFilterAction, confidence: f32, merge_with: Option<&str>) -> TextFilterDecision {
    TextFilterDecision {
        segment_id: id,
        action,
        confidence,
        reason: "测试理由".into(),
        merge_with: merge_with.map(|s| s.to_string()),
    }
}

#[test]
fn text_filter_valid_response_passes() {
    // Arrange：合法批量判定（keep/delete/merge 混合）
    let resp = TextFilterResponse {
        decisions: vec![
            decision(1, TextFilterAction::Keep, 0.9, None),
            decision(2, TextFilterAction::Delete, 0.95, None),
            decision(3, TextFilterAction::Merge, 0.85, Some("prev")),
        ],
    };
    // Act/Assert：全部引用已请求段
    assert!(resp.validate(&[1, 2, 3]).is_ok());
}

#[test]
fn text_filter_unrequested_id_rejected() {
    // Arrange：判定引用未请求的段
    let resp = TextFilterResponse { decisions: vec![decision(99, TextFilterAction::Keep, 0.9, None)] };
    // Act/Assert
    assert!(resp.validate(&[1, 2]).is_err());
}

#[test]
fn text_filter_duplicate_decision_rejected() {
    let resp = TextFilterResponse {
        decisions: vec![decision(1, TextFilterAction::Keep, 0.9, None), decision(1, TextFilterAction::Delete, 0.9, None)],
    };
    assert!(resp.validate(&[1, 2]).is_err());
}

#[test]
fn text_filter_merge_requires_direction() {
    // Arrange：merge 无方向 / 方向非法 / 非 merge 携带方向
    let no_dir = TextFilterResponse { decisions: vec![decision(1, TextFilterAction::Merge, 0.9, None)] };
    assert!(no_dir.validate(&[1]).is_err());
    let bad_dir = TextFilterResponse { decisions: vec![decision(1, TextFilterAction::Merge, 0.9, Some("up"))] };
    assert!(bad_dir.validate(&[1]).is_err());
    let keep_with_dir = TextFilterResponse { decisions: vec![decision(1, TextFilterAction::Keep, 0.9, Some("prev"))] };
    assert!(keep_with_dir.validate(&[1]).is_err());
}

#[test]
fn text_filter_confidence_and_reason_checked() {
    // 置信度越界
    let bad_conf = TextFilterResponse { decisions: vec![decision(1, TextFilterAction::Keep, 1.5, None)] };
    assert!(bad_conf.validate(&[1]).is_err());
    // 理由为空
    let mut d = decision(1, TextFilterAction::Keep, 0.9, None);
    d.reason = "  ".into();
    assert!(TextFilterResponse { decisions: vec![d] }.validate(&[1]).is_err());
}

#[test]
fn text_filter_empty_decisions_valid() {
    // Arrange：空判定（模型全 keep 省略）——合法（保守）
    let resp = TextFilterResponse { decisions: vec![] };
    assert!(resp.validate(&[1, 2, 3]).is_ok());
}

#[test]
fn text_filter_roundtrip_serialization() {
    // Arrange
    let resp = TextFilterResponse {
        decisions: vec![decision(1, TextFilterAction::Merge, 0.8, Some("next"))],
    };
    // Act：roundtrip（kebab-case action）
    let raw = serde_json::to_string(&resp).unwrap();
    let back: TextFilterResponse = serde_json::from_str(&raw).unwrap();
    // Assert
    assert_eq!(back, resp);
    assert!(raw.contains("\"merge\""));
    // 请求同样 roundtrip
    let req = TextFilterRequest {
        segments: vec![TextFilterSegment {
            segment_id: 1,
            text: "所以".into(),
            prev: None,
            next: Some("下一句".into()),
            hint: Some("truncated".into()),
        }],
    };
    let raw_req = serde_json::to_string(&req).unwrap();
    let back_req: TextFilterRequest = serde_json::from_str(&raw_req).unwrap();
    assert_eq!(back_req, req);
}
