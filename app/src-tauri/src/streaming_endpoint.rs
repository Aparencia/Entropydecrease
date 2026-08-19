//! 流式 ASR 端点处理域（v0.7.0 M0 X-O5 行数拆分：streaming_asr.rs 378 行超限硬拆）。
//!
//! @ai-context: 从 streaming_asr.rs 拆出的"端点 → final 产出"链路与喂入决策纯函数：
//!              尾静音端点判别（SILENCE_TERMINATED_BLOCKS）、标点恢复（punctuate）、
//!              静音隔块喂入（silence_feed_decision）、模型文件校验（ensure_model_files）。
//!              本模块是 streaming_asr 的子模块（#[path] 引入）——子模块可见父模块
//!              私有字段，因此 impl 块可拆分到此处而不改状态所有权（拆分硬约束：
//!              引擎字段仍由 streaming_asr.rs 独占声明）。

use sherpa_onnx::OfflinePunctuation;

use super::{StreamingAsrEngine, StreamingAsrEvent};

/// 静音块隔块喂入：静音期每隔 N 块喂 1 块（CPU 优化，原项目 P0-5 参数）。
const SILENT_FEED_SKIP_COUNT: u32 = 1;
/// VAD hangover（ADR-012 F1-3）：语音结束后 N 块内静音不跳过（句尾弱音保护）。
const HANGOVER_BLOCKS: u32 = 3;
/// 尾静音端点判别阈值（块）：连续静音 ≥ 1.2s（与 rule2 对齐）视为尾静音端点。
const SILENCE_TERMINATED_BLOCKS: u32 = 6;

impl StreamingAsrEngine {
    /// 端点处理：final 产出 + 流重建（原 feed 内端点分支，v0.7.0 M0 拆出）。
    ///
    /// @ai-context: 尾静音端点（连续静音 ≥1.2s）才允许前缀扩展接受；非尾静音端点
    ///              （rule3/短停顿硬切）标记 merge_with_next 供编排层语义合并。
    ///              流重建（new_stream）会重读共享词表——热词变更在端点自动生效。
    pub(super) fn handle_endpoint(&mut self) -> Vec<StreamingAsrEvent> {
        let raw = self
            .recognizer
            .get_result(&self.stream)
            .map(|r| r.text)
            .unwrap_or_default();
        // ADR-012 F1-1：尾静音端点（连续静音 ≥1.2s）才允许前缀扩展接受
        let silence_terminated = self.silent_blocks_since_speech >= SILENCE_TERMINATED_BLOCKS;
        let final_text = self.maybe_rescore(&raw, silence_terminated);
        let final_text = crate::asr_clean::clean_asr_result(&final_text);
        let mut events = Vec::new();
        if !final_text.is_empty() && final_text != self.last_final_text {
            self.last_final_text = final_text.clone();
            // ADR-012 F4-1：非尾静音端点（rule3/短停顿硬切）→ 标记可合并
            events.push(StreamingAsrEvent::Final {
                text: final_text,
                merge_with_next: !silence_terminated,
            });
        }
        self.stream = self.new_stream();
        self.last_partial_text.clear();
        self.last_partial_emit_at = None;
        self.sentence_pcm.clear();
        events
    }
}

/// 标点恢复（ADR-012 F4-2，自由函数——避免闭包捕获 &self 与 sentence_pcm
/// 可变借用冲突）：重打分未通过的 final 补语义标点。
///
/// @ai-context: 推理 ~10-30ms/句（int8 CPU）——端点路径一次，实时性无影响；
///              punctuator 缺失或推理失败 → 原样返回（零开销降级）。
pub(super) fn punctuate(punctuator: &Option<OfflinePunctuation>, text: &str) -> String {
    match punctuator {
        Some(p) => p.add_punctuation(text).unwrap_or_else(|| text.to_string()),
        None => text.to_string(),
    }
}

/// 静音块喂入决策（纯函数，ADR-012 F1-3；引擎 feed 内部调用，可单测）。
///
/// @ai-context: 返回 (是否喂入解码器, 新静音跳过计数, 新连续静音块数)。
///              hangover 内（语音后 ≤3 块）静音照常喂入——句尾弱音保护；
///              hangover 外恢复隔块喂入（CPU 优化）。
pub(super) fn silence_feed_decision(
    is_silent: bool,
    silent_blocks_since_speech: u32,
    silent_skip_counter: u32,
) -> (bool, u32, u32) {
    if !is_silent {
        return (true, 0, 0);
    }
    let blocks = silent_blocks_since_speech + 1;
    if blocks <= HANGOVER_BLOCKS {
        // hangover：句尾保护，正常喂入（skip 计数保持不变）
        return (true, silent_skip_counter, blocks);
    }
    let skip = silent_skip_counter + 1;
    if skip <= SILENT_FEED_SKIP_COUNT {
        // 隔块喂入：本块跳过（解码器不喂）
        return (false, skip, blocks);
    }
    // 隔块喂入：本块喂入，计数复位
    (true, 0, blocks)
}

/// 校验流式模型四件套存在（缺失时给出可操作引导）。
pub(super) fn ensure_model_files(models: &super::StreamingAsrModels) -> super::Result<()> {
    for (name, path) in [
        ("encoder", &models.encoder),
        ("decoder", &models.decoder),
        ("joiner", &models.joiner),
        ("tokens", &models.tokens),
    ] {
        if !std::path::Path::new(path).exists() {
            return Err(super::AppError::ModelNotReady(format!(
                "缺少流式 ASR 模型文件: {} ({})——请运行下载脚本或手动放置到 models/streaming-zipformer/",
                name, path
            )));
        }
    }
    Ok(())
}
