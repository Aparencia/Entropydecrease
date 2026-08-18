//! 说话人变化检测单测（REQ-046 / v0.5.0 M2，A3 弱化版）。
//!
//! @ai-context: AAA 模式；注入 fake embedding 向量覆盖相似/相异/无效段/边界。

use super::*;

/// 构造同向（相似）向量。
fn same_dir() -> Vec<f32> {
    vec![1.0, 0.0, 0.0]
}

/// 构造反向（相异）向量。
fn opposite_dir() -> Vec<f32> {
    vec![-1.0, 0.0, 0.0]
}

/// 构造正交（相异）向量。
fn orthogonal() -> Vec<f32> {
    vec![0.0, 1.0, 0.0]
}

fn seg(ms: u64, emb: Vec<f32>) -> SpeechSegment {
    SpeechSegment { start_ms: ms, embedding: emb }
}

#[test]
fn cosine_similarity_math() {
    // Act/Assert：同向 1.0；反向 -1.0；正交 0.0
    assert!((cosine(&same_dir(), &same_dir()) - 1.0).abs() < 1e-6);
    assert!((cosine(&same_dir(), &opposite_dir()) + 1.0).abs() < 1e-6);
    assert!(cosine(&same_dir(), &orthogonal()).abs() < 1e-6);
    // 长度不等 → 0
    assert_eq!(cosine(&same_dir(), &[1.0, 0.0]), 0.0);
    // 零向量 → 0
    assert_eq!(cosine(&[0.0, 0.0], &[0.0, 0.0]), 0.0);
}

#[test]
fn same_speaker_no_event() {
    // Arrange：连续同讲者（相同向量）
    let segments = vec![seg(0, same_dir()), seg(5000, same_dir()), seg(10000, same_dir())];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：无切换
    assert!(events.is_empty());
}

#[test]
fn speaker_change_detected() {
    // Arrange：A → B（正交向量，相似度 0 < 0.75）
    let segments = vec![seg(0, same_dir()), seg(5000, orthogonal())];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：5000ms 处切换事件，置信度 1.0（远低于阈值）
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].time_ms, 5000);
    assert!((events[0].confidence - 1.0).abs() < 1e-6);
}

#[test]
fn near_threshold_low_confidence() {
    // Arrange：相似度略低于阈值（cos≈0.74 → 置信度 (0.75-0.74)/0.2 = 0.05）
    // 用单位向量构造 cos≈0.74：a=(0.74, 0.6727, 0)，b=(1,0,0)
    let a = vec![0.74, 0.6727, 0.0];
    let b = vec![1.0, 0.0, 0.0];
    let segments = vec![seg(0, a), seg(5000, b)];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：切换但置信度低（接近阈值）
    assert_eq!(events.len(), 1);
    assert!(events[0].confidence < 0.5);
    assert!(events[0].confidence > 0.0);
}

#[test]
fn empty_embedding_skipped() {
    // Arrange：无效段（空向量）重置前驱——不产生误判，后续段无前驱可比较
    let segments = vec![
        seg(0, same_dir()),
        seg(3000, vec![]),       // 无效段：重置前驱
        seg(5000, orthogonal()), // 前驱已被重置 → 不与 0ms 段比较
    ];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：无效段被跳过且不产生切换事件
    assert!(events.is_empty());
}

#[test]
fn consecutive_changes_with_three_speakers() {
    // Arrange：A → B → C（三讲者轮流）
    let a = vec![1.0, 0.0, 0.0];
    let b = vec![0.0, 1.0, 0.0];
    let c = vec![0.0, 0.0, 1.0];
    let segments = vec![seg(0, a), seg(5000, b), seg(10000, c)];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：两处切换
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].time_ms, 5000);
    assert_eq!(events[1].time_ms, 10000);
}

#[test]
fn empty_segments_safe() {
    // Act/Assert：空输入安全
    assert!(detect_speaker_changes(&[]).is_empty());
}

#[test]
fn zero_vector_skipped() {
    // Arrange：零向量（norm < 1e-6）视为无效
    let segments = vec![seg(0, vec![0.0, 0.0, 0.0]), seg(5000, orthogonal())];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：首段无效 → 无前驱可比较 → 无事件
    assert!(events.is_empty());
}

#[test]
fn repeated_alternation_detects_each_switch() {
    // Arrange：A→B→A→B（问答交替）
    let segments = vec![
        seg(0, same_dir()),
        seg(4000, opposite_dir()),
        seg(8000, same_dir()),
        seg(12000, opposite_dir()),
    ];
    // Act
    let events = detect_speaker_changes(&segments);
    // Assert：3 处切换
    assert_eq!(events.len(), 3);
}
