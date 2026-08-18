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

        let recognizer = OfflineRecognizer::create(&config)
            .ok_or_else(|| AppError::Asr("创建识别器失败（请检查 ASR 模型文件与配置）".to_string()))?;
        Ok(Self { recognizer })
    }

    /// 转写单个 WAV 文件（引擎可复用，每次调用创建独立 stream）。
    ///
    /// @ai-context: SenseVoice 离线整段识别不产出逐句时间戳，返回单段 [0, duration]；
    ///              逐句时间戳为后续流式阶段（v0.2.0）能力。
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
        })
    }
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
