//! 说话人引擎测试（REQ-153 / v0.7.2）。
//!
//! @ai-context: AAA 模式；覆盖样本区间切分（边界/越界/钳制）与模型路径判定。
//!              引擎本体（extractor 推理）依赖真实模型文件——集成测试标注
//!              （测试规范：模型相关用集成测试，单测不依赖真实模型文件）。

use super::*;

// ── 样本区间切分（纯函数） ──

#[test]
fn segment_range_basic() {
    // 1s 段 @16kHz → [16000, 32000)
    assert_eq!(segment_sample_range(1000, 2000, 16000, 100_000), Some((16000, 32000)));
}

#[test]
fn segment_range_clamped_to_audio_len() {
    // 段尾越界 → 钳制到音频长度
    assert_eq!(segment_sample_range(1000, 10_000, 16000, 50_000), Some((16000, 50_000)));
}

#[test]
fn segment_range_start_beyond_audio_none() {
    // 段起点已越界 → None（跳过该段）
    assert_eq!(segment_sample_range(100_000, 110_000, 16000, 50_000), None);
}

#[test]
fn segment_range_invalid_inputs() {
    assert_eq!(segment_sample_range(2000, 1000, 16000, 100_000), None); // 倒置
    assert_eq!(segment_sample_range(0, 0, 16000, 100_000), None); // 零长
    assert_eq!(segment_sample_range(0, 1000, 0, 100_000), None); // 采样率 0
    assert_eq!(segment_sample_range(0, 1000, 16000, 0), None); // 空音频
}

// ── 模型路径判定 ──

#[test]
fn model_path_missing_is_none() {
    // 临时空目录 → 模型缺失 → None（降级入口）
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(speaker_model_path(dir.path()), None);
}

#[test]
fn model_path_present_is_some() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join(SPEAKER_MODEL_REL);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(&p, b"fake model").unwrap();
    // 文件存在即返回路径（模型内容校验由 extractor 加载时进行）
    assert!(speaker_model_path(dir.path()).is_some());
}
