//! 本地 ASR 引擎封装（REQ-001）：基于 sherpa-onnx 的离线语音识别。
//!
//! @ai-context: 本地优先——转写全部在本机完成，音频数据不出设备。
//! @ai-context: AsrEngine 为常驻引擎（load 创建一次，transcribe 可复用），由 engine.rs 的
//!              专用线程独占持有——引擎实例不跨线程移动，规避 FFI 类型的 Send/Sync 约束，
//!              同时模型只加载一次（消除原先每次调用 1-3 秒的加载开销）。
//! @ai-context: 输入当前仅支持 WAV（sherpa-onnx Wave 限制）；mp3/m4a 转码为后续阶段。

use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig, Wave,
};

use crate::error::{AppError, Result};
use crate::types::TranscriptSegment;

/// ASR 模型文件路径集合（由外部注入，禁止硬编码，见 AGENTS.md §7）。
#[derive(Debug, Clone)]
pub struct AsrModels {
    /// SenseVoice model.int8.onnx 路径
    pub model: String,
    /// tokens.txt 路径
    pub tokens: String,
}

/// 常驻 ASR 引擎：持有识别器实例，可复用于多次转写。
pub struct AsrEngine {
    recognizer: OfflineRecognizer,
}

impl AsrEngine {
    /// 加载模型创建引擎（重操作，只应在引擎线程启动时执行一次）。
    pub fn load(models: &AsrModels) -> Result<Self> {
        ensure_model_files(models)?;

        let mut config = OfflineRecognizerConfig::default();
        config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
            model: Some(models.model.clone()),
            language: Some("auto".into()),
            use_itn: true,
        };
        config.model_config.tokens = Some(models.tokens.clone());
        // REQ-054（v0.5.0 M9 B8）：token 时间戳——sherpa-onnx 1.13 底层 C API 支持
        // enable_token_timestamps，但 Rust 包装 OfflineRecognizerConfig 未暴露该字段
        // （2026-08 核对 1.13.5 源码）；词级时间戳协议/提取函数已就位（extract_word_
        // timestamps），启用点 = 升级 sherpa-onnx 或 FFI 直连时设置（V1.0），
        // 当前返回 None（不影响段级时间轴）。

        let recognizer = OfflineRecognizer::create(&config)
            .ok_or_else(|| AppError::Asr("创建识别器失败（请检查 ASR 模型文件与配置）".to_string()))?;
        Ok(Self { recognizer })
    }

    /// 转写单个 WAV 文件（引擎可复用，每次调用创建独立 stream）。
    ///
    /// @ai-context: SenseVoice 离线整段识别不产出逐句时间戳，返回单段 [0, duration]；
    ///              逐句时间戳为后续流式阶段（v0.2.0）能力。
    /// @ai-context: REQ-054（B8）：token timestamps 开启时产出词级时间戳
    ///              （相对片段起点；None=模型不支持）。
    pub fn transcribe(&self, wav_path: &str) -> Result<TranscriptSegment> {
        let wave = Wave::read(wav_path)
            .ok_or_else(|| AppError::Asr(format!("读取音频失败（文件不存在或非 WAV 格式）: {}", wav_path)))?;

        let stream = self.recognizer.create_stream();
        stream.accept_waveform(wave.sample_rate(), wave.samples());
        self.recognizer.decode(&stream);

        let result = stream
            .get_result()
            .ok_or_else(|| AppError::Asr("获取转写结果为空".to_string()))?;

        let duration_ms = estimate_duration_ms(wave.sample_rate(), wave.samples().len());
        Ok(TranscriptSegment {
            start_ms: 0,
            end_ms: duration_ms,
            text: result.text.trim().to_string(),
            word_timestamps: extract_word_timestamps(&result),
        })
    }

    /// 转写 PCM 内存样本（16kHz 单声道 f32）——流式端点句的 SenseVoice 整句重打分（ADR-003 §5）。
    ///
    /// @ai-context: 与 transcribe 共用同一识别器（离线引擎天然串行），
    ///              由 EnginePool 的 TranscribePcm 请求路由（engine.rs）。
    pub fn transcribe_pcm(&self, samples: &[f32], sample_rate: i32) -> Result<TranscriptSegment> {
        if samples.is_empty() {
            return Err(AppError::Asr("空音频无法转写".to_string()));
        }
        let stream = self.recognizer.create_stream();
        stream.accept_waveform(sample_rate, samples);
        self.recognizer.decode(&stream);

        let result = stream
            .get_result()
            .ok_or_else(|| AppError::Asr("获取转写结果为空".to_string()))?;
        let duration_ms = estimate_duration_ms(sample_rate, samples.len());
        Ok(TranscriptSegment {
            start_ms: 0,
            end_ms: duration_ms,
            text: result.text.trim().to_string(),
            word_timestamps: extract_word_timestamps(&result),
        })
    }
}

/// 提取词级时间戳（REQ-054 B8；纯函数）。
///
/// @ai-context: sherpa-onnx token timestamps 为 token 级（秒，相对输入起点）：
///              按 token 累积为词起始毫秒；tokens/timestamps 任一缺失 → None。
fn extract_word_timestamps(
    result: &sherpa_onnx::OfflineRecognizerResult,
) -> Option<Vec<crate::types::WordTimestamp>> {
    let timestamps = result.timestamps.as_ref()?;
    let mut words = Vec::new();
    let mut acc_ms = 0.0f32;
    for (i, token) in result.tokens.iter().enumerate() {
        if token.trim().is_empty() {
            continue;
        }
        let ts = timestamps.get(i).copied().unwrap_or(acc_ms);
        acc_ms = ts;
        words.push(crate::types::WordTimestamp {
            word: token.trim().to_string(),
            start_ms: (ts * 1000.0).round().max(0.0) as u64,
        });
    }
    if words.is_empty() { None } else { Some(words) }
}

/// 校验模型文件存在，缺失时给出可操作的错误（引导用户下载）。
fn ensure_model_files(models: &AsrModels) -> Result<()> {
    if !std::path::Path::new(&models.model).exists() {
        return Err(AppError::ModelNotReady(format!(
            "缺少 ASR 模型文件: {}（请先下载 SenseVoice 模型）",
            models.model
        )));
    }
    if !std::path::Path::new(&models.tokens).exists() {
        return Err(AppError::ModelNotReady(format!(
            "缺少 ASR tokens 文件: {}",
            models.tokens
        )));
    }
    Ok(())
}

/// 由采样率与样本数估算时长（毫秒）。
fn estimate_duration_ms(sample_rate: i32, num_samples: usize) -> u64 {
    if sample_rate <= 0 {
        return 0;
    }
    (num_samples as u64 * 1000) / sample_rate as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造识别结果（token + 时间戳对齐）。
    fn result(tokens: Vec<&str>, timestamps: Option<Vec<f32>>) -> sherpa_onnx::OfflineRecognizerResult {
        sherpa_onnx::OfflineRecognizerResult {
            text: tokens.join(""),
            tokens: tokens.into_iter().map(String::from).collect(),
            timestamps,
            durations: None,
        }
    }

    #[test]
    fn word_timestamps_extracted_from_tokens() {
        // Arrange：token 级时间戳（秒）
        let r = result(
            vec!["你", "好", "世", "界"],
            Some(vec![0.0, 0.2, 0.5, 0.8]),
        );
        // Act
        let words = extract_word_timestamps(&r).expect("words");
        // Assert：词起始毫秒 = 秒 × 1000
        assert_eq!(words.len(), 4);
        assert_eq!(words[0], crate::types::WordTimestamp { word: "你".into(), start_ms: 0 });
        assert_eq!(words[1], crate::types::WordTimestamp { word: "好".into(), start_ms: 200 });
        assert_eq!(words[3], crate::types::WordTimestamp { word: "界".into(), start_ms: 800 });
    }

    #[test]
    fn word_timestamps_none_when_missing() {
        // Arrange：timestamps 缺失（Rust 包装未开启 token timestamps 时）
        let r = result(vec!["你", "好"], None);
        // Act/Assert：None（协议降级：段级时间轴不受影响）
        assert!(extract_word_timestamps(&r).is_none());
    }

    #[test]
    fn word_timestamps_skips_blank_tokens() {
        // Arrange：含空白 token（分词边界）
        let r = result(
            vec!["你", " ", "好"],
            Some(vec![0.0, 0.1, 0.2]),
        );
        // Act
        let words = extract_word_timestamps(&r).expect("words");
        // Assert：空白 token 跳过，仅 2 词
        assert_eq!(words.len(), 2);
        assert_eq!(words[0].word, "你");
        assert_eq!(words[1].word, "好");
    }

    #[test]
    fn word_timestamps_empty_tokens_none() {
        // Arrange：全部空白 token
        let r = result(vec![" ", " "], Some(vec![0.0, 0.1]));
        // Act/Assert：空词表 → None
        assert!(extract_word_timestamps(&r).is_none());
    }
}
