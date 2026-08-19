//! 视频文件导入管线（REQ-015，ADR-008）。
//!
//! @ai-context: 第二入口编排（实时捕获之后的文件路径）：建会话 → ffmpeg 提取音轨 →
//!              字幕决策（L1/L2 命中免 ASR）→ 分窗 ASR 或字幕直出 → 关键帧 OCR →
//!              finish + 清理中间文件。进度经回调推送（command 层转 import:progress 事件）。
//! @ai-context: 降级设计（本地优先）：字幕命中免 ASR（零成本）；关键帧 OCR 失败/ffmpeg
//!              缺失只跳过不阻断转写；整管线失败标记会话 failed 且不残留中间文件。
//! @ai-context: 分窗转写替代整段转写（A4）：SenseVoice 离线整段只产单段 [0, duration]，
//!              分 30s 窗逐窗转写获得真实时间戳段，同时产出进度事件。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::ffmpeg::{self, FfmpegResolver};
use crate::subtitle_detect;
use crate::types::{NewSession, NewSessionSegment};

/// 分窗转写窗口（ms）——时间轴粒度与进度粒度。
pub const CHUNK_WINDOW_MS: u64 = 30_000;
/// 关键帧时间戳换算基准（帧 i 对应 i / KEYFRAME_FPS 秒）。
const FRAME_INTERVAL_MS: u64 = 10_000;

/// 导入进度载荷（command 层转发为 import:progress 事件）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    /// 阶段：subtitle | audio | asr | ocr | done
    pub stage: String,
    pub message: String,
    pub done: u32,
    pub total: u32,
}

/// 按固定窗口切分时间轴（纯函数；空时长返回空）。
pub fn plan_chunks(duration_ms: u64, window_ms: u64) -> Vec<(u64, u64)> {
    if duration_ms == 0 || window_ms == 0 {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut start = 0u64;
    while start < duration_ms {
        let end = (start + window_ms).min(duration_ms);
        chunks.push((start, end));
        start = end;
    }
    chunks
}

/// 视频导入主入口：返回会话 id；进度经回调推送。
pub fn run_video_import<F: Fn(&ImportProgress)>(
    db: &Db,
    engines: &EnginePool,
    resolver: &FfmpegResolver,
    video_path: &str,
    progress: F,
) -> Result<i64> {
    let video = Path::new(video_path);
    if !video.is_file() {
        return Err(AppError::Io(format!("视频文件不存在: {}", video_path)));
    }
    let title = video
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "视频导入会话".to_string());
    let session = db.create_session(&NewSession {
        title: title.chars().take(100).collect(),
        source_window: None,
        // 文件导入路径无档案检测（无窗口标题信号），走默认档案（REQ-043）
        profile: None,
    })?;
    let session_id = session.id;
    // 中间文件限定系统临时目录（导入后即清理，不污染应用数据目录）
    let work_dir = std::env::temp_dir().join(format!("entropy-import-{}", session_id));
    let _ = std::fs::create_dir_all(&work_dir);

    let result = run_import_inner(db, engines, resolver, video, session_id, &work_dir, &progress);
    // 清理中间文件（无论成败）；失败标记会话 failed（与实时链路同口径）
    let _ = std::fs::remove_dir_all(&work_dir);
    result.inspect_err(|_| {
        let _ = db.mark_session_failed(session_id);
    })?;
    Ok(session_id)
}

/// 管线主体（与清理/失败标记分离，保证清理必然执行）。
fn run_import_inner<F: Fn(&ImportProgress)>(
    db: &Db,
    engines: &EnginePool,
    resolver: &FfmpegResolver,
    video: &Path,
    session_id: i64,
    work_dir: &Path,
    progress: &F,
) -> Result<()> {
    // 1) 字幕决策（L1 零依赖；L2 需 ffmpeg）
    progress(&ImportProgress { stage: "subtitle".into(), message: "字幕探测中…".into(), done: 0, total: 1 });
    let decision = subtitle_detect::decide_subtitle(video, resolver)?;
    progress(&ImportProgress { stage: "subtitle".into(), message: "字幕探测完成".into(), done: 1, total: 1 });

    // 2) 转写路径：字幕直出（免 ASR）或分窗 ASR
    if decision.is_hit() {
        write_subtitle_segments(db, session_id, decision.segments())?;
        progress(&ImportProgress {
            stage: "subtitle".into(),
            message: format!("字幕直出（{} 段，免 ASR）", decision.segments().len()),
            done: 1,
            total: 1,
        });
    } else {
        transcribe_audio(db, engines, resolver, video, session_id, work_dir, progress)?;
    }

    // 3) 关键帧 OCR（画面要点，独立于转写路径；ffmpeg 缺失跳过不阻断）
    ocr_keyframes(engines, db, resolver, video, session_id, work_dir, progress);

    // 4) 完成
    db.finish_session(session_id)?;
    progress(&ImportProgress { stage: "done".into(), message: "导入完成".into(), done: 1, total: 1 });
    Ok(())
}

/// 字幕直出：段按时间轴落库（source=subtitle，无置信度）。
fn write_subtitle_segments(db: &Db, session_id: i64, segments: &[crate::fusion::SubtitleSegment]) -> Result<()> {
    for s in segments {
        db.add_segment(&NewSessionSegment {
            session_id,
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            source: "subtitle".to_string(),
            confidence: None,
            // REQ-103：导入路径无音量数据（None=未知）
            volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
        })?;
    }
    Ok(())
}

/// 音轨提取 + 分窗转写（无字幕 fallback 路径）。
fn transcribe_audio<F: Fn(&ImportProgress)>(
    db: &Db,
    engines: &EnginePool,
    resolver: &FfmpegResolver,
    video: &Path,
    session_id: i64,
    work_dir: &Path,
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
    let chunks = plan_chunks(duration_ms, CHUNK_WINDOW_MS);
    if chunks.is_empty() {
        return Err(AppError::Asr("音轨为空，无法转写".to_string()));
    }
    let total = chunks.len() as u32;
    for (i, (start_ms, end_ms)) in chunks.iter().enumerate() {
        let from = (*start_ms * sample_rate as u64 / 1000) as usize;
        let to = ((*end_ms * sample_rate as u64 / 1000) as usize).min(wave.samples().len());
        // 静音/无效窗转写失败只告警不阻断（空窗无内容）
        if let Ok(seg) = engines.transcribe_pcm(&wave.samples()[from..to], sample_rate) {
            if !seg.text.trim().is_empty() {
                db.add_segment(&NewSessionSegment {
                    session_id,
                    start_ms: *start_ms,
                    end_ms: *end_ms,
                    text: seg.text,
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

/// 关键帧提取 + OCR（失败跳过不阻断；帧号按固定间隔换算时间戳）。
fn ocr_keyframes<F: Fn(&ImportProgress)>(
    engines: &EnginePool,
    db: &Db,
    resolver: &FfmpegResolver,
    video: &Path,
    session_id: i64,
    work_dir: &Path,
    progress: &F,
) {
    let Ok(paths) = resolver.resolve() else {
        progress(&ImportProgress { stage: "ocr".into(), message: "ffmpeg 缺失，跳过关键帧 OCR".into(), done: 1, total: 1 });
        return;
    };
    let frames_dir = work_dir.join("frames");
    let _ = std::fs::create_dir_all(&frames_dir);
    progress(&ImportProgress { stage: "ocr".into(), message: "提取关键帧…".into(), done: 0, total: 1 });
    if let Err(e) = ffmpeg::run_quiet(
        &paths.ffmpeg,
        &ffmpeg::extract_keyframes_args(video, &frames_dir, ffmpeg::KEYFRAME_FPS, ffmpeg::KEYFRAME_MAX_FRAMES),
        ffmpeg::default_timeout(),
    ) {
        eprintln!("[Import] 关键帧提取失败（跳过画面识别）: {}", e);
        return;
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(&frames_dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|x| x == "png").unwrap_or(false))
                .collect()
        })
        .unwrap_or_default();
    files.sort();
    let total = files.len() as u32;
    if total == 0 {
        progress(&ImportProgress { stage: "ocr".into(), message: "无关键帧产出".into(), done: 1, total: 1 });
        return;
    }
    // TD-037：区域裁剪 → 识别 → 信息整合——中部（full）+ 底部（subtitle）两路，
    // 各区域帧间文本去重（静态画面不重复落库）
    let mut last_full: Vec<String> = Vec::new();
    let mut last_subtitle: Vec<String> = Vec::new();
    for (i, path) in files.iter().enumerate() {
        let timestamp_ms = (i as u64) * FRAME_INTERVAL_MS;
        match image::open(path).map(|d| d.into_rgb8()) {
            Ok(img) => crate::import_frame::ocr_keyframe(
                db, engines, session_id, timestamp_ms, &img, &mut last_full, &mut last_subtitle,
            ),
            Err(e) => eprintln!("[Import] 关键帧解码失败（跳过）: {}", e),
        }
        progress(&ImportProgress {
            stage: "ocr".into(),
            message: format!("画面识别 {}/{}", i + 1, total),
            done: (i + 1) as u32,
            total,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_planning_covers_full_duration() {
        // Arrange：95s 音频，30s 窗
        let chunks = plan_chunks(95_000, 30_000);
        // Assert：4 窗，首尾相接覆盖全程，末窗截断
        assert_eq!(chunks, vec![(0, 30_000), (30_000, 60_000), (60_000, 90_000), (90_000, 95_000)]);
    }

    #[test]
    fn chunk_planning_exact_multiple() {
        // Act & Assert：整 60s → 恰好 2 窗，无零碎窗
        assert_eq!(plan_chunks(60_000, 30_000), vec![(0, 30_000), (30_000, 60_000)]);
    }

    #[test]
    fn chunk_planning_edge_cases() {
        // Act & Assert：零时长/零窗 → 空；短于窗口 → 单窗
        assert!(plan_chunks(0, 30_000).is_empty());
        assert!(plan_chunks(10_000, 0).is_empty());
        assert_eq!(plan_chunks(10_000, 30_000), vec![(0, 10_000)]);
    }

    #[test]
    fn import_rejects_missing_file() {
        // Arrange & Act：不存在的文件 → 可操作错误（不建会话）
        let db = crate::db::Db::open(":memory:").expect("mem db");
        let resolver = FfmpegResolver::dev();
        let result = run_video_import(&db, &crate::engine::EnginePool::dummy(), &resolver, "不存在.mp4", |_| {});
        // Assert
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("不存在"));
    }
}
