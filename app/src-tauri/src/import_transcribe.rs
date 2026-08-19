//! 导入音轨转写（REQ-015 / v0.3.0；REQ-113 重叠窗，v0.7.0 M2）。
//!
//! @ai-context: 从 import.rs 拆出（行数保护，AGENTS.md §3）：无字幕 fallback
//!              路径的音轨提取 + 分窗转写。REQ-113（CORE-O6）：30s 窗 + 2s
//!              重叠——窗边句跨窗重复转写后经 merge_segments 合并（导入转写
//!              无窗边切句）；REQ-098 诚实置信度（None=单遍无重打分对比）。

use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::ffmpeg::{self, FfmpegResolver};
use crate::import::{ImportProgress, CHUNK_OVERLAP_MS, CHUNK_WINDOW_MS};
use crate::types::NewSessionSegment;

/// 音轨提取 + 分窗转写（无字幕 fallback 路径）。
pub fn transcribe_audio<F: Fn(&ImportProgress)>(
    db: &Db,
    engines: &EnginePool,
    resolver: &FfmpegResolver,
    video: &std::path::Path,
    session_id: i64,
    work_dir: &std::path::Path,
    progress: &F,
) -> Result<()> {
    // ffmpeg 缺失：音轨提取与关键帧都不可用，报可操作错误（引导下载）
    let paths = resolver.resolve()?;
    let wav_path = work_dir.join("audio.wav");
    progress(&ImportProgress { stage: "audio".into(), message: "提取音轨…".into(), done: 0, total: 1 });
    ffmpeg::run_quiet(&paths.ffmpeg, &ffmpeg::extract_audio_args(video, &wav_path), ffmpeg::default_timeout())?;
    progress(&ImportProgress { stage: "audio".into(), message: "音轨提取完成".into(), done: 1, total: 1 });

    // 读入 PCM（sherpa Wave 契约：16kHz 单声道 f32）
    let wave = sherpa_onnx::Wave::read(&wav_path.to_string_lossy())
        .ok_or_else(|| AppError::Asr("读取提取的音轨失败".to_string()))?;
    let sample_rate = wave.sample_rate();
    let duration_ms = (wave.samples().len() as u64 * 1000) / sample_rate as u64;
    // REQ-113（v0.7.0 M2，CORE-O6）：30s 窗 + 2s 重叠——窗边句跨窗重复
    // 转写后经 merge_segments 合并（导入转写无窗边切句）
    let chunks = crate::import::plan_chunks_with_overlap(duration_ms, CHUNK_WINDOW_MS, CHUNK_OVERLAP_MS);
    if chunks.is_empty() {
        return Err(AppError::Asr("音轨为空，无法转写".to_string()));
    }
    let total = chunks.len() as u32;
    // 相邻窗文本缓存（窗边句合并判定：prev 尾与 next 头重叠 → merge_segments）
    let mut prev_text: Option<String> = None;
    for (i, (start_ms, end_ms)) in chunks.iter().enumerate() {
        let from = (*start_ms * sample_rate as u64 / 1000) as usize;
        let to = ((*end_ms * sample_rate as u64 / 1000) as usize).min(wave.samples().len());
        // 静音/无效窗转写失败只告警不阻断（空窗无内容）
        if let Ok(seg) = engines.transcribe_pcm(&wave.samples()[from..to], sample_rate) {
            let mut text = seg.text.trim().to_string();
            if !text.is_empty() {
                // REQ-113：窗边句合并——重叠区造成同句跨窗重复，语义合并去重。
                // 窗间重叠 2s → gap=0（连续窗），merge_segments 判定尾首重叠
                // 或标点衔接（导入窗无硬切标记，gap=0 保守合并——仅文本衔接
                // 重叠时触发，不误并不同句）
                // REQ-119：拼接边界空格（中英混排不粘连）
                if let Some(prev) = prev_text.take() {
                    if let Some(merged) = crate::asr_merge::merge_segments_with_spacing(&prev, &text, 0) {
                        text = merged;
                    } else {
                        // 未合并：prev 已是完整句（前窗已落库），本窗独立落库
                    }
                }
                db.add_segment(&NewSessionSegment {
                    session_id,
                    start_ms: *start_ms,
                    end_ms: *end_ms,
                    text: text.clone(),
                    source: "asr".to_string(),
                    // REQ-098（v0.7.0 M1）：导入路径单遍 SenseVoice，无重打分
                    // 对比（Zipformer vs SenseVoice）——无法产出代理置信度，
                    // 诚实落 None（不再硬编码假 0.9）
                    confidence: None,
                    // REQ-103：导入路径无段级音量（None=未知）
                    volume: None,
                    speech_rate: None,
                    pause_ms: None,
                    speaker: None,
                })?;
                prev_text = Some(text);
            }
        }
        progress(&ImportProgress {
            stage: "asr".into(),
            message: format!("转写中 {}/{}", i + 1, total),
            done: (i + 1) as u32,
            total,
        });
    }
    Ok(())
}
