//! 流式 ASR 引擎（REQ-009，ADR-003；质量修复 ADR-012）。
//!
//! @ai-context: sherpa-onnx OnlineRecognizer（Zipformer transducer 中英双语流式），
//!              流程移植自原项目 streamingAsr.ts（生产调参验证）：
//!              partial 节流（≥150ms + 文本变化才推）→ 端点断句 → final →
//!              重建流；静音块隔块喂入（静音期低 CPU）；停止时尾句 flush 去重。
//! @ai-context: ADR-012 质量修复：① 重打分"前缀扩展接受"（句尾截断修复，尾静音
//!              端点才启用防 rule3 重复）——决策纯函数在 asr_rescore.rs；
//!              ② VAD hangover（语音结束后 3 块静音不跳过，句尾弱音保护）；
//!              ③ rule3 最长句可配置（默认 8s，env ENTROPY_ASR_RULE3_SECS）；
//!              ④ 输出统一净化（重复压缩+幻觉过滤，asr_clean.rs）；⑤ flush 补
//!              重打分（停止时尾句与端点同质量兜底）。
//! @ai-context: 引擎不跨线程移动（FFI 类型非 Send）——由实时编排线程独占持有；
//!              时间戳由编排层按会话时钟标注，本模块只产出文本事件。
//! @ai-context: v0.7.0 M0 X-O5 行数拆分：端点处理链路拆至子模块
//!              streaming_endpoint.rs（handle_endpoint/punctuate/喂入决策/模型校验）。

use std::sync::{Arc, Mutex};
use std::time::Instant;

use sherpa_onnx::{OfflinePunctuation, OfflinePunctuationConfig, OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};

use crate::asr_clean::clean_asr_result;
use crate::asr_rescore::pick_rescored_with;
use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::types::TranscriptSegment;
use crate::vocab::VocabStore;

// v0.7.0 M0：端点处理子模块（见 streaming_endpoint.rs 模块头注释）
#[path = "streaming_endpoint.rs"]
mod endpoint;

/// 流式模型四件套路径（目录约定：models/streaming-zipformer/，ADR-003）。
#[derive(Debug, Clone)]
pub struct StreamingAsrModels {
    pub encoder: String,
    pub decoder: String,
    pub joiner: String,
    pub tokens: String,
}

/// 流式引擎配置（ADR-012 F3-1：rule3 可配置）。
#[derive(Debug, Clone, Copy)]
pub struct StreamingAsrConfig {
    /// rule3 最长句强制断句（秒；默认 8s——5s 过短致句中硬切，20s 过长）
    pub rule3_min_utterance_secs: f32,
}

impl Default for StreamingAsrConfig {
    fn default() -> Self {
        Self { rule3_min_utterance_secs: 8.0 }
    }
}

/// 流式 ASR 事件（文本事件，时间戳由编排层标注）。
#[derive(Debug, Clone, PartialEq)]
pub enum StreamingAsrEvent {
    /// 实时候选文本（节流推送）
    Partial { text: String },
    /// 端点断句定稿文本；merge_with_next=true 表示 rule3/短停顿硬切段——
    /// 编排层应延迟与下一段尝试语义级合并（ADR-012 F4-1）
    /// confidence=重打分一致性置信度（REQ-098 CORE-O1；None=无法产出——诚实未知）
    Final { text: String, merge_with_next: bool, confidence: Option<f32> },
}

/// partial 推送最小间隔（ms）——防 IPC 风暴（原项目参数）。
const PARTIAL_EMIT_INTERVAL_MS: u64 = 150;
/// 静音判定 RMS 阈值（16kHz 单声道 f32）。
pub const SILENCE_RMS_THRESHOLD: f32 = 0.005;

/// SenseVoice 重打分超时（ms，2026-08-19 取优整合）：实测推理 ~0.6s/8s 句
/// （无竞争），3s 余量覆盖 CPU 竞争/引擎卡顿；超时降级保留流式结果。
const RESCORE_TIMEOUT_MS: u64 = 3000;

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
    /// 自上次语音块以来的连续静音块数（ADR-012：hangover 判定 + 尾静音端点判别）
    silent_blocks_since_speech: u32,
    /// 自上次端点以来的全部句音频（重打分输入，含被跳过的静音块）
    sentence_pcm: Vec<f32>,
    /// 可选 SenseVoice 整句重打分器（离线引擎池）
    rescorer: Option<EnginePool>,
    /// 可选标点恢复器（ADR-012 F4-2：重打分未通过的 final 补语义标点；
    /// 模型缺失 → None 零开销降级，不阻断 ASR）
    punctuator: Option<OfflinePunctuation>,
}

impl StreamingAsrEngine {
    /// 加载流式模型创建引擎（重操作，仅启动时执行一次）。
    ///
    /// @ai-context: punctuation_model=标点恢复模型路径（ADR-012 F4-2）；路径缺失
    ///              或加载失败 → None 降级（无标点，现状行为）。
    pub fn load(
        models: &StreamingAsrModels,
        config: &StreamingAsrConfig,
        rescorer: Option<EnginePool>,
        vocab: Option<Arc<Mutex<VocabStore>>>,
        punctuation_model: Option<String>,
    ) -> Result<Self> {
        endpoint::ensure_model_files(models)?;
        let mut recognizer_config = OnlineRecognizerConfig::default();
        recognizer_config.feat_config.sample_rate = 16000;
        recognizer_config.feat_config.feature_dim = 80;
        recognizer_config.model_config.transducer.encoder = Some(models.encoder.clone());
        recognizer_config.model_config.transducer.decoder = Some(models.decoder.clone());
        recognizer_config.model_config.transducer.joiner = Some(models.joiner.clone());
        recognizer_config.model_config.tokens = Some(models.tokens.clone());
        recognizer_config.model_config.num_threads = 2;
        // @ai-context: 不设置 model_type——本模型包（streaming-zipformer-zh-fp16-
        //              2025-06-30）依赖 C++ 侧按 transducer 三件套自动推断；
        //              误设 zipformer2 会要求 query_head_dims 元数据而崩溃（原项目踩坑）。
        recognizer_config.enable_endpoint = true;
        // 端点规则：尾静音 2.4s / 1.2s 断句（sherpa-onnx 默认），
        // rule3 强制断句 = 可配置（ADR-012 F3-1：默认 8s，env 可覆盖）
        recognizer_config.rule1_min_trailing_silence = 2.4;
        recognizer_config.rule2_min_trailing_silence = 1.2;
        recognizer_config.rule3_min_utterance_length = config.rule3_min_utterance_secs;

        let recognizer = OnlineRecognizer::create(&recognizer_config)
            .ok_or_else(|| AppError::Asr("创建流式识别器失败（请检查模型文件与配置）".to_string()))?;
        let stream = recognizer.create_stream();
        // ADR-012 F4-2：标点恢复器懒加载——模型缺失/创建失败 → None（零开销降级）
        let punctuator = punctuation_model
            .filter(|p| std::path::Path::new(p).exists())
            .and_then(|p| {
                let mut punct_config = OfflinePunctuationConfig::default();
                punct_config.model.ct_transformer = Some(p);
                let created = OfflinePunctuation::create(&punct_config);
                if created.is_none() {
                    eprintln!("[StreamingAsr] 标点恢复模型加载失败（无标点降级）");
                }
                created
            });
        Ok(Self {
            recognizer,
            stream,
            sample_rate: 16000,
            vocab,
            last_partial_text: String::new(),
            last_partial_emit_at: None,
            last_final_text: String::new(),
            silent_skip_counter: 0,
            silent_blocks_since_speech: 0,
            sentence_pcm: Vec::new(),
            rescorer,
            punctuator,
        })
    }

    /// 喂入一个音频块（16kHz 单声道 f32），返回本次产出的事件列表。
    ///
    /// @ai-context: is_silent=true 时按静音隔块喂入（跳过解码减 CPU），但句音频
    ///              仍完整累积（重打分需要）；ADR-012 F1-3：语音结束后 HANGOVER
    ///              块内静音不跳过（句尾弱音块保护，防整块丢弃）。
    pub fn feed(&mut self, samples: &[f32], is_silent: bool) -> Vec<StreamingAsrEvent> {
        if samples.is_empty() {
            return Vec::new();
        }
        self.sentence_pcm.extend_from_slice(samples);

        // 静音隔块喂入（原项目 P0-5）+ hangover 句尾保护（ADR-012 F1-3）
        let (should_feed, new_skip, new_blocks) =
            endpoint::silence_feed_decision(is_silent, self.silent_blocks_since_speech, self.silent_skip_counter);
        self.silent_skip_counter = new_skip;
        self.silent_blocks_since_speech = new_blocks;
        if !should_feed {
            return Vec::new();
        }

        self.stream.accept_waveform(self.sample_rate, samples);
        while self.recognizer.is_ready(&self.stream) {
            self.recognizer.decode(&self.stream);
        }

        // 端点断句：final + 重建流（v0.7.0 M0 拆至 endpoint::handle_endpoint）
        if self.recognizer.is_endpoint(&self.stream) {
            return self.handle_endpoint();
        }

        // partial：节流 + 文本变化才推送（净化后比较——预览与定稿一致）
        let partial_text = clean_asr_result(
            &self.recognizer.get_result(&self.stream).map(|r| r.text).unwrap_or_default(),
        );
        let now = Instant::now();
        let throttled = match self.last_partial_emit_at {
            Some(at) => now.duration_since(at).as_millis() as u64 >= PARTIAL_EMIT_INTERVAL_MS,
            None => true,
        };
        let mut events = Vec::new();
        if !partial_text.is_empty() && partial_text != self.last_partial_text && throttled {
            self.last_partial_text = partial_text.clone();
            self.last_partial_emit_at = Some(now);
            events.push(StreamingAsrEvent::Partial { text: partial_text });
        }
        events
    }

    /// 停止时 flush 尾句：流内未端点文本以 Final 送出（与最近 final 去重）。
    ///
    /// @ai-context: ADR-012 F1-2：flush 补 SenseVoice 重打分——停止时尾句与端点
    ///              路径同质量兜底（此前直接取流内文本，无兜底）。
    /// @ai-context: REQ-098：flush 尾句置信度同端点路径（重打分一致性；None=诚实）。
    pub fn flush(&mut self) -> Option<StreamingAsrEvent> {
        let raw = self.recognizer.get_result(&self.stream).map(|r| r.text).unwrap_or_default();
        let (tail, confidence) = self.maybe_rescore(&raw, true);
        let tail = clean_asr_result(&tail);
        if tail.is_empty() || tail == self.last_final_text {
            return None;
        }
        self.last_final_text = tail.clone();
        Some(StreamingAsrEvent::Final { text: tail, merge_with_next: false, confidence })
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
        self.silent_blocks_since_speech = 0;
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

    /// SenseVoice 整句重打分：一致性校验通过才替换（ADR-003 §5，ADR-012 扩展）。
    ///
    /// @ai-context: 决策规则见 asr_rescore.rs——① 前缀扩展接受（截断修复，仅
    ///              尾静音端点）；② 短句放宽（≤4 字距离 ≤1）；③ 原 40% 门限。
    ///              重打分失败/引擎不可用/一致性不满足时保留 Zipformer 结果，
    ///              并对该结果补语义标点（ADR-012 F4-2，punctuator 缺失则原样）。
    /// @ai-context: REQ-098（v0.7.0 M1）：返回 (文本, 置信度)——置信度=重打分
    ///              一致性相似度（双源互相印证）；重打分未产出/超时/不满足一致性
    ///              → None（诚实表达未知，不硬编码假置信度）。
    fn maybe_rescore(&mut self, zipformer_text: &str, _silence_terminated: bool) -> (String, Option<f32>) {
        // 字段级借用分离：闭包只捕获 punctuator 引用（不捕获 &self），
        // 与下方 sentence_pcm 的可变借用不冲突
        let punctuator = &self.punctuator;
        let fallback = || {
            let text = zipformer_text.trim().to_string();
            // F4-2：仅未被 SenseVoice 替换的文本补标点（替换文本自带 use_itn 标点）
            (endpoint::punctuate(punctuator, &text), None)
        };
        let Some(rescorer) = self.rescorer.as_ref() else {
            return fallback();
        };
        if self.sentence_pcm.is_empty() {
            return fallback();
        }
        let pcm = std::mem::take(&mut self.sentence_pcm);
        // 2026-08-19 取优整合：重打分**有界等待**（3s）——推理环境异常时主循环
        // 不被无限阻塞（阻塞 → 音频积压 → 停止时积压丢弃 = 内容缺失，会话 22
        // 类问题兜底）；超时走 fallback（Zipformer 结果 + 标点恢复）
        match rescorer.transcribe_pcm_timeout(
            &pcm,
            self.sample_rate,
            std::time::Duration::from_millis(RESCORE_TIMEOUT_MS),
        ) {
            Ok(TranscriptSegment { text, .. }) if !text.trim().is_empty() => {
                // 2026-08-19 取优整合：扩展接受对所有端点启用（含 rule3 硬切段）——
                // 补回硬切段尾字（13.wav 取证 4/16 段真实尾字丢失）；跨段重复由
                // F3-2 去重 + F4-1 合并重叠跳过防护
                if let Some(replaced) = pick_rescored_with(zipformer_text, &text, true) {
                    // REQ-098：一致性相似度作为代理置信度（决策与置信度同源）
                    let confidence =
                        crate::asr_rescore::consistency_confidence(zipformer_text, &text);
                    (replaced, confidence)
                } else {
                    fallback()
                }
            }
            _ => fallback(),
        }
    }
}

// 兼容 re-export：编辑距离（asr_rescore.rs 实现；dtw_align/subtitle_ocr/fusion 引用此路径）。
pub use crate::asr_rescore::levenshtein;

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "streaming_asr_tests.rs"]
mod tests;
