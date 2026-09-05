//! asr_eval 流式档（v0.20.1 / REQ-265 前置件，序 2；bin 子模块）。
//!
//! @ai-context: 目的——harness 增加"被测路径=流式链路"档：与生产
//!              streaming_asr 同引擎（transducer zipformer 三件套）、同端点
//!              规则（尾静音 rule1 2.4s/rule2 1.2s、rule3 强制断句可配）、
//!              同块长（200ms@16k）、同解码（modified_beam_search）。
//! @ai-context: **近似口径（诚实登记）**——本档为独立工具实现，不含生产的
//!              能量自适应 VAD 静音隔块喂入/重打分/热词/标点恢复；A/B 结论
//!              只对"本档语义"成立，与真链路的差距随后续档位逐步收窄。
//! @ai-context: 模型缺失（streaming zipformer 未下载）→ None（跳过+提示），
//!              不阻断离线档；模型路径与下载脚本约定一致（models/asr/…）。

use std::path::Path;

use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig};

/// 流式档参数（规则覆盖点 = REQ-265 参数定案族的 VAD/端点族在 harness 的注入面）。
#[derive(Debug, Clone, Copy)]
pub struct StreamParams {
    /// 端点 rule1：尾静音断句秒数（生产默认 2.4）。
    pub rule1_s: f32,
    /// 端点 rule2：尾静音短句断句秒数（生产默认 1.2）。
    pub rule2_s: f32,
    /// 端点 rule3：最长句强制断句秒数（生产默认 8，ADR-012 env 可覆盖）。
    pub rule3_s: f32,
}

impl Default for StreamParams {
    fn default() -> Self {
        Self { rule1_s: 2.4, rule2_s: 1.2, rule3_s: 8.0 }
    }
}

/// 音频块长：16kHz × 200ms（与生产链路同块长）。
const BLOCK_SAMPLES: usize = 16_000 / 5;

/// 流式转写整段音频（纯工具 IO）：返回逐句拼接文本；模型缺失/加载失败 → None。
///
/// @ai-context: 端点断句 = sherpa 判定（尾静音/最长句）——命中即取定稿并
///              重建流（与生产 handle_endpoint 语义一致）；文件尾无端点段
///              按生产 flush 语义取当前结果收尾。
pub fn transcribe_stream(wav_path: &str, model_dir: &str, p: &StreamParams) -> Option<String> {
    let dir = Path::new(model_dir);
    // 文件名与 download-streaming-asr.mjs / streaming_endpoint::ensure_model_files 约定一致
    let encoder = dir.join("encoder.fp16.onnx");
    let decoder = dir.join("decoder.fp16.onnx");
    let joiner = dir.join("joiner.fp16.onnx");
    let tokens = dir.join("tokens.txt");
    if ![&encoder, &decoder, &joiner, &tokens].iter().all(|f| f.exists()) {
        eprintln!("[Stream] 流式模型缺失（{}）——本档跳过（下载脚本见 docs）", dir.display());
        return None;
    }
    let wave = sherpa_onnx::Wave::read(wav_path)?;
    let mut config = OnlineRecognizerConfig::default();
    config.feat_config.sample_rate = 16_000;
    config.feat_config.feature_dim = 80;
    config.model_config.transducer.encoder = Some(encoder.to_string_lossy().into_owned());
    config.model_config.transducer.decoder = Some(decoder.to_string_lossy().into_owned());
    config.model_config.transducer.joiner = Some(joiner.to_string_lossy().into_owned());
    config.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    config.model_config.num_threads = 2;
    config.decoding_method = Some("modified_beam_search".into());
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = p.rule1_s;
    config.rule2_min_trailing_silence = p.rule2_s;
    config.rule3_min_utterance_length = p.rule3_s;
    let recognizer = OnlineRecognizer::create(&config)?;
    let mut out = String::new();
    let mut stream = recognizer.create_stream();
    let samples = wave.samples();
    let mut tail = String::new();
    for block in samples.chunks(BLOCK_SAMPLES) {
        stream.accept_waveform(16_000, block);
        while recognizer.is_ready(&stream) {
            recognizer.decode(&stream);
        }
        if recognizer.is_endpoint(&stream) {
            if let Some(r) = recognizer.get_result(&stream) {
                out.push_str(r.text.trim());
                tail = String::new();
            }
            // 端点定稿后重建流（与生产 handle_endpoint 语义一致）
            stream = recognizer.create_stream();
        }
    }
    if let Some(r) = recognizer.get_result(&stream) {
        tail = r.text.trim().to_string();
    }
    out.push_str(&tail);
    Some(out)
}
