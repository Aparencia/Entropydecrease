//! DTW 时序对齐单测（REQ-063 / v0.6.0 M2）。
//!
//! @ai-context: AAA 模式；合成漂移样本（恒定偏移/抖动/文本差异）验证
//!              对齐正确率与漂移估计精度；spike 评估指标先行。

use super::*;
use crate::fusion::SubtitleSegment;

fn sub(start_ms: u64, end_ms: u64, text: &str) -> SubtitleSegment {
    SubtitleSegment { start_ms, end_ms, text: text.to_string(), confidence: None }
}

fn asr(start_ms: u64, end_ms: u64, text: &str) -> TranscriptSegment {
    TranscriptSegment {
        start_ms,
        end_ms,
        text: text.to_string(),
        word_timestamps: None,
        confidence: None,
            volume: None,
    }
}

/// 合成会话：N 条字幕与 N 条 ASR（文本一一对应，允许少量 OCR 错字）。
fn synthetic_session(n: usize, sub_offset_ms: i64, jitter_ms: i64) -> (Vec<SubtitleSegment>, Vec<TranscriptSegment>) {
    let texts = [
        "今天我们来学习神经网络的基本概念",
        "神经网络由大量神经元组成",
        "每个神经元接收输入并产生输出",
        "激活函数决定神经元的输出方式",
        "反向传播是训练神经网络的核心算法",
        "梯度下降用于优化网络参数",
        "学习率控制参数更新的步长",
        "过拟合是训练中常见的问题",
        "正则化方法可以缓解过拟合",
        "实践是掌握深度学习的最好方式",
    ];
    let mut subs = Vec::new();
    let mut asrs = Vec::new();
    for i in 0..n {
        let text = texts[i % texts.len()];
        let jitter = if jitter_ms == 0 { 0 } else { (i as i64 % 5 - 2) * jitter_ms / 2 };
        let base = i as i64 * 10_000;
        let sub_start = (base + sub_offset_ms + jitter).max(0) as u64;
        subs.push(sub(sub_start, sub_start + 3_000, text));
        let asr_start = base.max(0) as u64;
        asrs.push(asr(asr_start, asr_start + 3_000, text));
    }
    (subs, asrs)
}

#[test]
fn constant_drift_estimated_and_corrected() {
    // Arrange：字幕整体超前 +800ms（OCR 链路延迟导致的时间轴漂移）
    let (subs, asrs) = synthetic_session(6, 800, 0);
    // Act：对齐 → 估计漂移 → 回校
    let alignment = align_sequences(&subs, &asrs);
    let drift = estimate_drift_ms(&subs, &asrs, &alignment).expect("drift");
    let corrected = correct_subtitles(&subs, drift);
    // Assert：漂移 ≈ -800（字幕超前 → 负平移量，误差 ≤ 100ms）；对齐正确率 100%；回校后误差归零
    assert!((drift + 800).abs() <= 100, "漂移估计应 ≈-800ms，实得 {}", drift);
    assert!(alignment_accuracy(&alignment, &subs, &asrs, 0.6) > 0.9);
    for (i, s) in corrected.iter().enumerate() {
        let err = (s.start_ms as i64 - asrs[i].start_ms as i64).abs();
        assert!(err <= 100, "回校后第 {} 段误差 {}ms", i, err);
    }
}

#[test]
fn negative_drift_estimated_and_corrected() {
    // Arrange：字幕整体滞后 -600ms
    let (subs, asrs) = synthetic_session(6, -600, 0);
    // Act
    let alignment = align_sequences(&subs, &asrs);
    let drift = estimate_drift_ms(&subs, &asrs, &alignment).expect("drift");
    let corrected = correct_subtitles(&subs, drift);
    // Assert：漂移 ≈ +600（字幕滞后 → 正平移量）；回校后误差归零——
    // 首段原始时间戳被 clamp（-600 越界为 0，信息已丢失），允许 clamp 误差
    assert!((drift - 600).abs() <= 100, "漂移估计应 ≈+600ms，实得 {}", drift);
    for (i, s) in corrected.iter().enumerate().skip(1) {
        let err = (s.start_ms as i64 - asrs[i].start_ms as i64).abs();
        assert!(err <= 100, "回校后第 {} 段误差 {}ms", i, err);
    }
    // 首段原始时间戳被 clamp（-600 越界为 0，信息已丢失）——回校后 = 0+600
    assert_eq!(corrected[0].start_ms, 600, "首段 clamp 后按平移量回校");
}

#[test]
fn jittered_drift_median_robust() {
    // Arrange：+800ms 漂移叠加 ±200ms 抖动（模拟逐段捕获延迟波动）
    let (subs, asrs) = synthetic_session(8, 800, 200);
    // Act
    let alignment = align_sequences(&subs, &asrs);
    let drift = estimate_drift_ms(&subs, &asrs, &alignment).expect("drift");
    // Assert：中位数抗抖动——估计落在 ±300ms 内（抖动 ±200 + 量化误差）
    assert!((drift + 800).abs() <= 300, "抖动下漂移估计应 ≈-800ms，实得 {}", drift);
}

#[test]
fn empty_inputs_safe() {
    // Act & Assert：空输入 → 空对齐 / None / 空输出
    let alignment = align_sequences(&[], &[]);
    assert!(alignment.pairs.is_empty());
    assert_eq!(estimate_drift_ms(&[], &[], &alignment), None);
    assert!(correct_subtitles(&[], 500).is_empty());
    assert_eq!(alignment_accuracy(&alignment, &[], &[], 0.6), 0.0);
}

#[test]
fn ocr_typos_still_aligned() {
    // Arrange：字幕含 OCR 错字（"神精网络"）——相似度 0.6+ 仍应正确配对
    let subs = vec![
        sub(8_000, 11_000, "今天我们来学习神精网络的基本概念"),
        sub(18_000, 21_000, "每个神经元接收输入并产生输出"),
    ];
    let asrs = vec![
        asr(0, 3_000, "今天我们来学习神经网络的基本概念"),
        asr(10_000, 13_000, "每个神经元接收输入并产生输出"),
    ];
    // Act
    let alignment = align_sequences(&subs, &asrs);
    // Assert：对角配对（错字不破坏对齐）；漂移 ≈ 8000
    assert_eq!(alignment.pairs, vec![(0, 0), (1, 1)]);
    let drift = estimate_drift_ms(&subs, &asrs, &alignment).unwrap();
    assert!((drift + 8_000).abs() <= 100, "漂移应 ≈-8000ms，实得 {}", drift);
}

#[test]
fn unequal_length_streams_align() {
    // Arrange：字幕 3 条 vs ASR 2 条（ASR 漏了一句）——DTW 路径含垂直/水平步
    let subs = vec![
        sub(1_000, 4_000, "第一句内容"),
        sub(11_000, 14_000, "第二句内容"),
        sub(21_000, 24_000, "第三句内容"),
    ];
    let asrs = vec![asr(0, 3_000, "第一句内容"), asr(20_000, 23_000, "第三句内容")];
    // Act
    let alignment = align_sequences(&subs, &asrs);
    // Assert：两句被配对；末段误差受首尾强制对齐影响（标准 DTW 局限——
    // 文档已注明；此处只验证配对存在与漂移方向）
    assert!(!alignment.pairs.is_empty());
    let drift = estimate_drift_ms(&subs, &asrs, &alignment).expect("drift");
    assert_eq!(drift, -1_000, "配对 (0,0) 差 -1000、(2,1) 差 -1000 → 中位数 -1000");
}

#[test]
fn correct_subtitles_clamps_negative() {
    // Arrange：漂移 -5000ms 会把首段时间戳推到负值
    let subs = vec![sub(1_000, 4_000, "内容"), sub(11_000, 14_000, "内容二")];
    // Act
    let corrected = correct_subtitles(&subs, -5_000);
    // Assert：clamp 到 0（负时间戳非法）
    assert_eq!(corrected[0].start_ms, 0);
    assert_eq!(corrected[0].end_ms, 0);
    assert_eq!(corrected[1].start_ms, 6_000);
}
