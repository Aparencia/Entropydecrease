//! 流式 ASR 引擎（REQ-009，ADR-003）。
//!
//! @ai-context: sherpa-onnx OnlineRecognizer（Zipformer transducer 中英双语流式），
//!              流程移植自原项目 streamingAsr.ts（生产调参验证）：
//!              partial 节流（≥150ms + 文本变化才推）→ 端点断句 → final →
//!              重建流；静音块隔块喂入（静音期低 CPU）；停止时尾句 flush 去重。
//! @ai-context: 引擎不跨线程移动（FFI 类型非 Send）——由实时编排线程独占持有；
//!              时间戳由编排层按会话时钟标注，本模块只产出文本事件。
//! @ai-context: 可选 SenseVoice 整句重打分（rescorer）：端点断句后把句音频送
//!              离线引擎复核，一致性校验通过才替换（质量兜底，ADR-003 §5）。

use std::sync::{Arc, Mutex};
use std::time::Instant;

use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};

use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::types::TranscriptSegment;
use crate::vocab::VocabStore;

/// 流式模型四件套路径（目录约定：models/streaming-zipformer/，ADR-003）。
#[derive(Debug, Clone)]
pub struct StreamingAsrModels {
    pub encoder: String,
    pub decoder: String,
    pub joiner: String,
    pub tokens: String,
}

/// 流式 ASR 事件（文本事件，时间戳由编排层标注）。
#[derive(Debug, Clone, PartialEq)]
pub enum StreamingAsrEvent {
    /// 实时候选文本（节流推送）
    Partial { text: String },
    /// 端点断句定稿文本
    Final { text: String },
}

/// partial 推送最小间隔（ms）——防 IPC 风暴（原项目参数）。
const PARTIAL_EMIT_INTERVAL_MS: u64 = 150;
/// 静音块隔块喂入：静音期每隔 N 块喂 1 块（CPU 优化，原项目 P0-5 参数）。
const SILENT_FEED_SKIP_COUNT: u32 = 1;
/// 静音判定 RMS 阈值（16kHz 单声道 f32）。
pub const SILENCE_RMS_THRESHOLD: f32 = 0.005;

/// 流式 ASR 引擎（有状态，独占线程使用）。
pub struct StreamingAsrEngine {
    recognizer: OnlineRecognizer,
    stream: OnlineStream,
    sample_rate: i32,
    /// M5/REQ-040：共享词表（热词注入源；None=无词表支持）
    vocab: Option<Arc<Mutex<VocabStore>>>,
    last_partial_text: String,
    last_partial_emit_at: Option<Instant>,
    last_final_text: String,
    silent_skip_counter: u32,
    /// 自上次端点以来的全部句音频（重打分输入，含被跳过的静音块）
    sentence_pcm: Vec<f32>,
    /// 可选 SenseVoice 整句重打分器（离线引擎池）
    rescorer: Option<EnginePool>,
}

impl StreamingAsrEngine {
    /// 加载流式模型创建引擎（重操作，仅启动时执行一次）。
    pub fn load(
        models: &StreamingAsrModels,
        rescorer: Option<EnginePool>,
        vocab: Option<Arc<Mutex<VocabStore>>>,
    ) -> Result<Self> {
        ensure_model_files(models)?;
        let mut config = OnlineRecognizerConfig::default();
        config.feat_config.sample_rate = 16000;
        config.feat_config.feature_dim = 80;
        config.model_config.transducer.encoder = Some(models.encoder.clone());
        config.model_config.transducer.decoder = Some(models.decoder.clone());
        config.model_config.transducer.joiner = Some(models.joiner.clone());
        config.model_config.tokens = Some(models.tokens.clone());
        config.model_config.num_threads = 2;
        // @ai-context: 不设置 model_type——本模型包（streaming-zipformer-bilingual-zh-en-2023-02-20）
        //              为第一代 Zipformer，依赖 C++ 侧按 transducer 三件套自动推断；
        //              误设 zipformer2 会要求 query_head_dims 元数据而崩溃（原项目踩坑，SherpaAsrService.ts）。
        config.enable_endpoint = true;
        // 端点规则：尾静音 2.4s / 1.2s 断句（sherpa-onnx 默认），
        // rule3 强制断句 5s（默认 20s 过长，课堂实时字幕按 5s 兜底断句）
        config.rule1_min_trailing_silence = 2.4;
        config.rule2_min_trailing_silence = 1.2;
        config.rule3_min_utterance_length = 5.0;

        let recognizer = OnlineRecognizer::create(&config)
            .ok_or_else(|| AppError::Asr("创建流式识别器失败（请检查模型文件与配置）".to_string()))?;
        let stream = recognizer.create_stream();
        Ok(Self {
            recognizer,
            stream,
            sample_rate: 16000,
            vocab,
            last_partial_text: String::new(),
            last_partial_emit_at: None,
            last_final_text: String::new(),
            silent_skip_counter: 0,
            sentence_pcm: Vec::new(),
            rescorer,
        })
    }

    /// 喂入一个音频块（16kHz 单声道 f32），返回本次产出的事件列表。
    ///
    /// @ai-context: is_silent=true 时按静音隔块喂入（跳过解码减 CPU），
    ///              但句音频仍完整累积（重打分需要）。
    pub fn feed(&mut self, samples: &[f32], is_silent: bool) -> Vec<StreamingAsrEvent> {
        if samples.is_empty() {
            return Vec::new();
        }
        self.sentence_pcm.extend_from_slice(samples);

        // 静音隔块喂入（原项目 P0-5）
        if is_silent {
            self.silent_skip_counter += 1;
            if self.silent_skip_counter <= SILENT_FEED_SKIP_COUNT {
                return Vec::new();
            }
            self.silent_skip_counter = 0;
        } else {
            self.silent_skip_counter = 0;
        }

        self.stream.accept_waveform(self.sample_rate, samples);
        while self.recognizer.is_ready(&self.stream) {
            self.recognizer.decode(&self.stream);
        }

        let mut events = Vec::new();
        // 端点断句：final + 重建流
        if self.recognizer.is_endpoint(&self.stream) {
            let raw = self.recognizer.get_result(&self.stream).map(|r| r.text).unwrap_or_default();
            let final_text = self.maybe_rescore(&raw);
            if !final_text.is_empty() && final_text != self.last_final_text {
                self.last_final_text = final_text.clone();
                events.push(StreamingAsrEvent::Final { text: final_text });
            }
            self.stream = self.new_stream();
            self.last_partial_text.clear();
            self.last_partial_emit_at = None;
            self.sentence_pcm.clear();
            return events;
        }

        // partial：节流 + 文本变化才推送
        let partial_text = self.recognizer.get_result(&self.stream).map(|r| r.text).unwrap_or_default();
        let now = Instant::now();
        let throttled = match self.last_partial_emit_at {
            Some(at) => now.duration_since(at).as_millis() as u64 >= PARTIAL_EMIT_INTERVAL_MS,
            None => true,
        };
        if !partial_text.is_empty() && partial_text != self.last_partial_text && throttled {
            self.last_partial_text = partial_text.clone();
            self.last_partial_emit_at = Some(now);
            events.push(StreamingAsrEvent::Partial { text: partial_text });
        }
        events
    }

    /// 停止时 flush 尾句：流内未端点文本以 Final 送出（与最近 final 去重）。
    pub fn flush(&mut self) -> Option<StreamingAsrEvent> {
        let raw = self.recognizer.get_result(&self.stream).map(|r| r.text).unwrap_or_default();
        let tail = raw.trim().to_string();
        if tail.is_empty() || tail == self.last_final_text {
            return None;
        }
        self.last_final_text = tail.clone();
        Some(StreamingAsrEvent::Final { text: tail })
    }

    /// 重置（新会话开始时调用，清空流状态与句音频；
    /// 当前每次会话新建引擎实例未调用——复用预留，登记豁免）。
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.stream = self.new_stream();
        self.last_partial_text.clear();
        self.last_partial_emit_at = None;
        self.last_final_text.clear();
        self.silent_skip_counter = 0;
        self.sentence_pcm.clear();
    }

    /// 创建新流：有热词才走 create_stream_with_hotwords。
    ///
    /// @ai-context: TD-032 修复——create_stream_with_hotwords 即使传入空串也会无条件创建
    ///              ContextGraph（sherpa-onnx online-recognizer-transducer-impl.h），
    ///              greedy_search 解码器未覆写带 OnlineStream 的 Decode 接口，
    ///              解码时触发断言 abort（exit 0xffffffff）；无热词必须用 create_stream。
    /// @ai-context: M5/REQ-040——热词每次重建流时从共享词表读取：词表变更在下一个
    ///              端点断句自动生效（无需中断会话；锁中毒防御回退无热词）。
    fn new_stream(&self) -> OnlineStream {
        let hotwords = self
            .vocab
            .as_ref()
            .and_then(|v| v.lock().ok())
            .and_then(|v| v.hotwords_string());
        match hotwords.as_deref() {
            Some(h) if !h.trim().is_empty() => {
                self.recognizer.create_stream_with_hotwords(h)
            }
            _ => self.recognizer.create_stream(),
        }
    }

    /// SenseVoice 整句重打分：一致性校验通过才替换（ADR-003 §5）。
    ///
    /// @ai-context: 重打分失败/引擎不可用/一致性不满足时保留 Zipformer 结果。
    fn maybe_rescore(&mut self, zipformer_text: &str) -> String {
        let Some(rescorer) = self.rescorer.as_ref() else {
            return zipformer_text.trim().to_string();
        };
        if self.sentence_pcm.is_empty() {
            return zipformer_text.trim().to_string();
        }
        let pcm = std::mem::take(&mut self.sentence_pcm);
        match rescorer.transcribe_pcm(&pcm, self.sample_rate) {
            Ok(TranscriptSegment { text, .. }) if !text.trim().is_empty() => {
                pick_rescored(zipformer_text, &text).unwrap_or_else(|| zipformer_text.trim().to_string())
            }
            _ => zipformer_text.trim().to_string(),
        }
    }
}

/// 一致性校验：编辑距离 ≤ 较短文本的 40% 视为一致 → 取 SenseVoice（整句上下文更准）。
///
/// @ai-context: 纯函数可单测；不一致时返回 None（保留 Zipformer 流式结果）。
pub fn pick_rescored(zipformer_text: &str, sensevoice_text: &str) -> Option<String> {
    let a = zipformer_text.trim();
    let b = sensevoice_text.trim();
    if a.is_empty() || b.is_empty() {
        return None;
    }
    let distance = levenshtein(a, b);
    let shorter = a.chars().count().min(b.chars().count()) as f32;
    if distance as f32 <= shorter * 0.4 {
        Some(b.to_string())
    } else {
        None
    }
}

/// 编辑距离（DP，纯函数；用于重打分一致性校验）。
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            curr[j + 1] = if ca == cb {
                prev[j]
            } else {
                1 + prev[j].min(curr[j]).min(prev[j + 1])
            };
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

/// 校验流式模型四件套存在（缺失时给出可操作引导）。
fn ensure_model_files(models: &StreamingAsrModels) -> Result<()> {
    for (name, path) in [
        ("encoder", &models.encoder),
        ("decoder", &models.decoder),
        ("joiner", &models.joiner),
        ("tokens", &models.tokens),
    ] {
        if !std::path::Path::new(path).exists() {
            return Err(AppError::ModelNotReady(format!(
                "缺少流式 ASR 模型文件: {} ({})——请运行下载脚本或手动放置到 models/streaming-zipformer/",
                name, path
            )));
        }
    }
    Ok(())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "streaming_asr_tests.rs"]
mod tests;
