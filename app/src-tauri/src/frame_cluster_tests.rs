//! 帧聚类与筛选投票单测（REQ-051 / v0.5.0 M6）。
//!
//! @ai-context: AAA 模式；合成帧样本覆盖聚类归簇/汉明距离/多信号投票/用户截图置顶。

use super::*;

/// 构造帧样本辅助。
fn sample(ms: u64, hash: u64, text: Option<&str>, change: f32) -> FrameSample {
    FrameSample {
        timestamp_ms: ms,
        ahash: hash,
        ocr_text: text.map(String::from),
        change_magnitude: change,
    }
}

#[test]
fn hamming_distance_basic() {
    // Act/Assert：0 异或 → 0；全位异或 → 64
    assert_eq!(hamming(0b1010, 0b1010), 0);
    assert_eq!(hamming(0b0000, 0b1111), 4);
    assert_eq!(hamming(u64::MAX, 0), 64);
}

#[test]
fn cluster_similar_frames() {
    // Arrange：前 3 帧哈希相同（同一画面），第 4 帧不同（翻页）
    let samples = vec![
        sample(0, 0xAAAA, None, 0.0),
        sample(1000, 0xAAAA, None, 0.1),
        sample(2000, 0xAAAA, None, 0.0),
        sample(3000, 0x5555, None, 0.8),
    ];
    // Act
    let clusters = cluster_frames(&samples);
    // Assert：2 簇；首簇时间范围 0-2000、帧数 3
    assert_eq!(clusters.len(), 2);
    assert_eq!(clusters[0].first_ms, 0);
    assert_eq!(clusters[0].last_ms, 2000);
    assert_eq!(clusters[0].frame_count, 3);
    assert_eq!(clusters[1].first_ms, 3000);
}

#[test]
fn cluster_similar_within_hamming_threshold() {
    // Arrange：哈希差 2 bit（≤6 同簇）
    let samples = vec![
        sample(0, 0b0000_0001, None, 0.0),
        sample(1000, 0b0000_0011, None, 0.0),
    ];
    // Act
    let clusters = cluster_frames(&samples);
    // Assert：1 簇（汉明 1 ≤ 6）
    assert_eq!(clusters.len(), 1);
}

#[test]
fn cluster_far_apart_hashes_separate() {
    // Arrange：哈希差 8 bit（>6 不同簇）
    let samples = vec![
        sample(0, 0b0000_0000, None, 0.0),
        sample(1000, 0b1111_1111, None, 0.0),
    ];
    // Act
    let clusters = cluster_frames(&samples);
    // Assert：2 簇
    assert_eq!(clusters.len(), 2);
}

#[test]
fn vote_new_text_and_change() {
    // Arrange：两簇（翻页），第二簇新文字 + 变化大
    let samples = vec![
        sample(0, 0xAAAA, Some("PPT 第 1 页"), 0.1),
        sample(1000, 0xAAAA, Some("PPT 第 1 页"), 0.0),
        sample(2000, 0x5555, Some("PPT 第 2 页"), 0.9),
        sample(3000, 0x5555, Some("PPT 第 2 页"), 0.0),
    ];
    // Act
    let votes = vote_key_frames(&samples, &[]);
    // Assert：第二簇（新文字+变化）得分更高排前
    assert_eq!(votes.len(), 2);
    assert!(votes[0].score > votes[1].score);
    assert!(votes[0].reasons.contains(&"新文字".to_string()));
    assert!(votes[0].reasons.contains(&"画面变化".to_string()));
}

#[test]
fn vote_hold_duration() {
    // Arrange：单簇停留 12s（≥10s）
    let samples = vec![
        sample(0, 0xAAAA, Some("公式页"), 0.0),
        sample(6000, 0xAAAA, Some("公式页"), 0.0),
        sample(12000, 0xAAAA, Some("公式页"), 0.0),
    ];
    // Act
    let votes = vote_key_frames(&samples, &[]);
    // Assert：停留久信号命中
    assert_eq!(votes.len(), 1);
    assert!(votes[0].reasons.contains(&"停留久".to_string()));
    assert!(votes[0].score >= 2.0);
}

#[test]
fn vote_short_hold_no_signal() {
    // Arrange：停留 2s（<10s）且无新文字无变化
    let samples = vec![
        sample(0, 0xAAAA, Some("同一页"), 0.0),
        sample(2000, 0xAAAA, Some("同一页"), 0.0),
    ];
    // Act
    let votes = vote_key_frames(&samples, &[]);
    // Assert：无信号候选（得分 0，但簇仍产出——去重语义：每簇一候选）
    assert_eq!(votes.len(), 1);
    assert!(votes[0].score < 1.0);
    assert!(votes[0].reasons.is_empty());
}

#[test]
fn vote_user_screenshot_forced_top() {
    // Arrange：第 1 簇新文字高分，第 2 簇普通但用户截图
    let samples = vec![
        sample(0, 0xAAAA, Some("新内容 A"), 0.9),
        sample(5000, 0x5555, Some("普通 B"), 0.0),
        sample(6000, 0x5555, Some("普通 B"), 0.0),
    ];
    // Act：用户在 5000-6000 簇内截图
    let votes = vote_key_frames(&samples, &[5500]);
    // Assert：用户截图簇置顶 + 标记
    assert_eq!(votes[0].timestamp_ms, 5000);
    assert!(votes[0].user_marked);
    assert!(votes[0].reasons.contains(&"用户截图".to_string()));
    assert!(votes[0].score > 100.0);
}

#[test]
fn vote_empty_inputs_safe() {
    // Act/Assert：空输入安全
    assert!(vote_key_frames(&[], &[]).is_empty());
    assert!(cluster_frames(&[]).is_empty());
}

#[test]
fn take_key_frames_caps_per_chapter() {
    // Arrange：5 个候选
    let candidates: Vec<KeyFrameCandidate> = (0..5)
        .map(|i| KeyFrameCandidate {
            timestamp_ms: i * 1000,
            score: 5.0 - i as f32,
            reasons: vec!["新文字".to_string()],
            user_marked: false,
        })
        .collect();
    // Act
    let taken = take_key_frames(candidates, 3);
    // Assert：取前 3（章节内嵌上限）
    assert_eq!(taken.len(), 3);
    assert_eq!(taken[0].timestamp_ms, 0);
}

#[test]
fn vote_same_text_across_clusters_no_new_signal() {
    // Arrange：两簇同文本（翻页但文字相同——无"新文字"信号）
    let samples = vec![
        sample(0, 0xAAAA, Some("同一句话"), 0.1),
        sample(2000, 0x5555, Some("同一句话"), 0.1),
    ];
    // Act
    let votes = vote_key_frames(&samples, &[]);
    // Assert：两簇均无"新文字"原因（diff 语义：与前一簇文本比较）
    assert!(votes.iter().all(|v| !v.reasons.contains(&"新文字".to_string())));
}
