//! 重点候选标注单测（REQ-045 / v0.5.0 M2，C2 决策矩阵）。
//!
//! @ai-context: AAA 模式；注入合成段/块样本覆盖三信号与合并逻辑。

use super::*;

fn seg(start_ms: u64, text: &str, volume: Option<f32>) -> SegmentInput {
    SegmentInput { start_ms, text: text.to_string(), volume }
}

fn ocr(ts: u64, text: &str) -> OcrBlockInput {
    OcrBlockInput { timestamp_ms: ts, text: text.to_string() }
}

#[test]
fn no_signal_no_candidate() {
    // Arrange：无重复、音量平稳、无停留（文本无跨段重复词）
    let segments = vec![
        seg(0, "今天讲解函数概念", Some(0.4)),
        seg(5000, "接着看参数传递", Some(0.4)),
        seg(10000, "最后是返回值", Some(0.4)),
    ];
    // Act
    let hits = detect_highlights(&segments, &[]);
    // Assert：无候选
    assert!(hits.is_empty());
}

#[test]
fn repeated_phrase_marks_segment() {
    // Arrange："重点"出现 2 次（跨段）
    let segments = vec![
        seg(0, "这里重点是边界条件", Some(0.4)),
        seg(5000, "再强调一次重点是边界条件", Some(0.4)),
        seg(10000, "其他内容", Some(0.4)),
    ];
    // Act
    let hits = detect_highlights(&segments, &[]);
    // Assert：含"重点"的两段命中重复强调信号
    assert_eq!(hits.len(), 2);
    assert!(hits.iter().all(|h| h.reasons.contains(&"重复强调".to_string())));
}

#[test]
fn volume_surge_marks_segment() {
    // Arrange：音量 0.3 → 0.8（骤变）
    let segments = vec![
        seg(0, "平静讲解", Some(0.3)),
        seg(5000, "这里非常重要", Some(0.8)),
    ];
    // Act
    let hits = detect_highlights(&segments, &[]);
    // Assert：音量骤变命中
    assert_eq!(hits.len(), 1);
    assert!(hits[0].reasons.contains(&"音量骤变".to_string()));
}

#[test]
fn ocr_hold_marks_key_frame() {
    // Arrange：同一画面文本停留 12s
    let blocks = vec![
        ocr(0, "公式：E=mc²"),
        ocr(5000, "公式：E=mc²"),
        ocr(12000, "公式：E=mc²"),
    ];
    // Act
    let hits = detect_highlights(&[], &blocks);
    // Assert：画面停留命中（时间取首块）
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].time_ms, 0);
    assert!(hits[0].reasons.contains(&"画面停留".to_string()));
}

#[test]
fn ocr_short_hold_not_marked() {
    // Arrange：停留不足 10s
    let blocks = vec![ocr(0, "一闪而过"), ocr(3000, "一闪而过")];
    // Act
    let hits = detect_highlights(&[], &blocks);
    // Assert：不命中
    assert!(hits.is_empty());
}

#[test]
fn dual_signals_merge_on_same_segment() {
    // Arrange：同一段重复 + 音量骤变
    let segments = vec![
        seg(0, "平静的开始", Some(0.3)),
        seg(5000, "重点重点重点内容", Some(0.9)),
        seg(10000, "继续平静", Some(0.3)),
    ];
    // Act
    let hits = detect_highlights(&segments, &[]);
    // Assert：5000ms 段双信号叠加
    let hit = hits.iter().find(|h| h.time_ms == 5000).expect("存在");
    assert_eq!(hit.signals, 2);
    assert_eq!(hit.reasons.len(), 2);
}

#[test]
fn results_sorted_by_time() {
    // Arrange：乱序信号（OCR 停留早期 + 音量骤变晚期）
    let blocks = vec![ocr(0, "标题页"), ocr(9000, "标题页"), ocr(15000, "标题页")];
    let segments = vec![
        seg(20000, "普通内容", Some(0.3)),
        seg(30000, "突然大声", Some(0.9)),
    ];
    // Act
    let hits = detect_highlights(&segments, &blocks);
    // Assert：按时间升序
    assert_eq!(hits.len(), 2);
    assert!(hits[0].time_ms < hits[1].time_ms);
}

#[test]
fn volume_unknown_skipped() {
    // Arrange：volume=None 不参与骤变；文本无跨段重复 gram
    let segments = vec![
        seg(0, "今天天气晴朗适合学习", None),
        seg(5000, "下午安排实验操作", None),
    ];
    // Act
    let hits = detect_highlights(&segments, &[]);
    // Assert：无音量信号 → 无候选
    assert!(hits.is_empty());
}

#[test]
fn empty_inputs_safe() {
    // Act/Assert：空输入安全
    assert!(detect_highlights(&[], &[]).is_empty());
}

#[test]
fn ocr_blocks_repeat_same_segment_merge() {
    // Arrange：重复短语 + OCR 停留落在同一时刻（跨信号合并）
    let segments = vec![seg(0, "关键关键结论", Some(0.5)), seg(5000, "其他", Some(0.5))];
    let blocks = vec![ocr(0, "结论页"), ocr(5000, "结论页"), ocr(15000, "结论页")];
    // Act
    let hits = detect_highlights(&segments, &blocks);
    // Assert：0ms 段合并重复强调 + 画面停留两信号（同一候选）
    assert_eq!(hits.len(), 1);
    let at0 = hits.iter().find(|h| h.time_ms == 0).expect("存在");
    assert!(at0.reasons.contains(&"重复强调".to_string()));
    assert!(at0.reasons.contains(&"画面停留".to_string()));
    assert_eq!(at0.signals, 2);
}
