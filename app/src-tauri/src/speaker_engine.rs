//! 说话人 embedding 引擎（REQ-153 / v0.7.2：弱化版讲者分离——只标切换点）。
//!
//! @ai-context: sherpa-onnx SpeakerEmbeddingExtractor（wespeaker 模型，Apache-2.0）
//!              对语音段提取音色向量 → 相邻段余弦相似度 < 阈值 = 讲者切换
//!              （判定器在 speaker_change.rs，纯函数已单测：阈值 0.75 + 置信度
//!              归一）。弱化版**不聚类身份**（不识别"谁"），只标"这里换人了"——
//!              访谈/会议纪要分段的真实价值点。
//! @ai-context: 会话后**离线分析**（懒加载命令 analyze_session_speakers）：
//!              段边界 = session_segments（端点断句产出 = 现成语音段，零新增
//!              VAD）；音频 = session-audio/<id>.wav；模型缺失 → None 降级
//!              （无讲者标注、不阻断、不报错——诚实降级，使用说明提示）。
//! @ai-context: 引擎在命令线程内创建（低频一次分析，不常驻；模型 ~20-70MB
//!              加载 ~1s，可接受）。

use std::path::Path;

use sherpa_onnx::{SpeakerEmbeddingExtractor, SpeakerEmbeddingExtractorConfig};

/// 模型路径约定（wespeaker 单文件 ONNX 模型）。
pub const SPEAKER_MODEL_REL: &str = "speaker-embedding/model.onnx";

/// 低于该时长的语音段不提取 embedding（音色向量对短段不稳——误判比漏判更伤）。
pub const MIN_SEGMENT_MS: u64 = 500;

/// 模型文件是否存在（缺失 → 调用方降级无讲者标注；路径约定模型目录）。
pub fn speaker_model_path(model_dir: &Path) -> Option<String> {
    let p = model_dir.join(SPEAKER_MODEL_REL);
    p.is_file().then(|| p.to_string_lossy().into_owned())
}

/// 语音段 → 样本区间（纯函数：会话时间轴 → WAV 样本切片；越界钳制）。
///
/// @ai-context: WAV 为 16kHz 单声道（audio_store 写入格式）；返回 (start, end)
///              样本索引；段完全越界 → None；返回区间可能被钳制到音频长度。
pub fn segment_sample_range(
    start_ms: u64,
    end_ms: u64,
    sample_rate: u32,
    total_samples: usize,
) -> Option<(usize, usize)> {
    if end_ms <= start_ms || total_samples == 0 || sample_rate == 0 {
        return None;
    }
    let start = (start_ms * sample_rate as u64 / 1000) as usize;
    let end = (end_ms * sample_rate as u64 / 1000) as usize;
    if start >= total_samples {
        return None;
    }
    Some((start, end.min(total_samples)))
}

/// 说话人 embedding 提取器（流式接口：建流喂样本 → is_ready → compute）。
pub struct SpeakerEmbeddingEngine {
    extractor: SpeakerEmbeddingExtractor,
}

impl SpeakerEmbeddingEngine {
    /// 加载模型（模型缺失/加载失败 → None——调用方降级，不阻断）。
    pub fn load(model_path: &str) -> Option<Self> {
        let config = SpeakerEmbeddingExtractorConfig {
            model: Some(model_path.to_string()),
            ..Default::default()
        };
        SpeakerEmbeddingExtractor::create(&config).map(|extractor| Self { extractor })
    }

    /// 语音段 → 音色向量（段过短/未就绪/提取失败 → None，诚实跳过——
    /// 判定器对无效段重置前驱，不产生误判切换）。
    pub fn embedding_of(&mut self, samples: &[f32], sample_rate: i32) -> Option<Vec<f32>> {
        if samples.is_empty() || sample_rate <= 0 {
            return None;
        }
        let stream = self.extractor.create_stream()?;
        stream.accept_waveform(sample_rate, samples);
        if !self.extractor.is_ready(&stream) {
            return None;
        }
        self.extractor.compute(&stream)
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "speaker_engine_tests.rs"]
mod tests;
