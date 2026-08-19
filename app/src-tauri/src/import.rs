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
    plan_chunks_with_overlap(duration_ms, window_ms, 0)
}

/// 分窗转写窗口（ms）——时间轴粒度与进度粒度。
///
/// @ai-context: REQ-113（v0.7.0 M2，CORE-O6）：窗间 2s 重叠——窗边句
///              （跨窗截断的句子）在相邻窗重复转写，下游按 merge_segments
///              合并去重（导入转写无窗边切句）。
pub const CHUNK_OVERLAP_MS: u64 = 2_000;

/// 带重叠的窗口切分（纯函数，REQ-113）：window_ms 窗 + overlap_ms 重叠。
///
/// @ai-context: 每窗 [start, start+window)，下一窗从 start+window-overlap 开始
///              （重叠覆盖窗边句）；首窗从 0、末窗到 duration（不越界）；
///              退化输入（空时长/窗 0）返回空。
pub fn plan_chunks_with_overlap(
    duration_ms: u64,
    window_ms: u64,
    overlap_ms: u64,
) -> Vec<(u64, u64)> {
    if duration_ms == 0 || window_ms == 0 {
        return Vec::new();
    }
    let step = window_ms.saturating_sub(overlap_ms).max(1);
    let mut chunks = Vec::new();
    let mut start = 0u64;
    while start < duration_ms {
        let end = (start + window_ms).min(duration_ms);
        chunks.push((start, end));
        if end >= duration_ms {
            break;
        }
        start += step;
    }
    chunks
}

/// 视频导入主入口：返回会话 id；进度经回调推送。
pub fn run_video_import<F: Fn(&ImportProgress)>(
    db: &Db,
    engines: &EnginePool,
    resolver: &FfmpegResolver,
    video_path: &str,
    // REQ-117：UI 垃圾黑名单（导入画面要点源头过滤——与实时链路同口径）
    ui_junk: &crate::ui_junk::UiJunkList,
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

    let result = run_import_inner(db, engines, resolver, video, session_id, &work_dir, ui_junk, &progress);
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
    ui_junk: &crate::ui_junk::UiJunkList,
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
        crate::import_transcribe::transcribe_audio(db, engines, resolver, video, session_id, work_dir, progress)?;
    }

    // 3) 关键帧 OCR（画面要点，独立于转写路径；ffmpeg 缺失跳过不阻断）
    // REQ-130（v0.7.0 M3）：P4 无图短路——会话档案 disable_ocr 时跳过画面识别。
    // 导入路径当前 profile=None（默认档案，OCR 不跳过——零回归）；播客类档案
    // 接入导入链路（前端传 profile）后自动生效（ASR-only 快速路径）。
    let ocr_enabled = db
        .get_session(session_id)
        .ok()
        .flatten()
        .and_then(|s| s.profile)
        .map(|p| {
            let kind = crate::video_profile::ProfileKind::parse(&p);
            !crate::video_profile::profile_by_kind(kind).disable_ocr
        })
        .unwrap_or(true);
    if ocr_enabled {
        // REQ-117：导入画面要点过 UI 垃圾黑名单（与实时链路同口径）
        ocr_keyframes(engines, db, resolver, video, session_id, work_dir, ui_junk, progress);
    } else {
        progress(&ImportProgress {
            stage: "ocr".into(),
            message: "档案禁用画面识别（disable_ocr），跳过关键帧 OCR".into(),
            done: 1,
            total: 1,
        });
    }

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

/// 关键帧提取 + OCR（失败跳过不阻断；帧号按固定间隔换算时间戳）。
fn ocr_keyframes<F: Fn(&ImportProgress)>(
    engines: &EnginePool,
    db: &Db,
    resolver: &FfmpegResolver,
    video: &Path,
    session_id: i64,
    work_dir: &Path,
    ui_junk: &crate::ui_junk::UiJunkList,
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
                db, engines, session_id, timestamp_ms, &img, &mut last_full, &mut last_subtitle, ui_junk,
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

    // ── REQ-113（v0.7.0 M2，CORE-O6）：重叠窗口 ──

    #[test]
    fn overlap_windows_cover_duration_with_overlap() {
        // Arrange：95s 音频，30s 窗 + 2s 重叠
        let chunks = plan_chunks_with_overlap(95_000, 30_000, 2_000);
        // Assert：窗间重叠 2s（下一窗起点 = 上一窗起点 + 28s），末窗不越界
        assert_eq!(chunks, vec![(0, 30_000), (28_000, 58_000), (56_000, 86_000), (84_000, 95_000)]);
        // 重叠区覆盖：每窗起点 < 上一窗终点（窗边句在相邻窗都有音频）
        for w in chunks.windows(2) {
            assert!(w[1].0 < w[0].1, "相邻窗必须重叠: {:?}", w);
        }
    }

    #[test]
    fn overlap_zero_matches_plain() {
        // 零重叠 = 原 plan_chunks 行为（兼容零回归）
        assert_eq!(
            plan_chunks_with_overlap(95_000, 30_000, 0),
            plan_chunks(95_000, 30_000)
        );
    }

    #[test]
    fn overlap_window_edge_cases() {
        // 重叠 ≥ 窗宽 → step 至少 1ms（防死循环）
        let chunks = plan_chunks_with_overlap(10_000, 5_000, 6_000);
        assert!(!chunks.is_empty(), "重叠超窗宽不得产生空计划");
        // 短于窗 → 单窗（不因重叠产生多窗）
        assert_eq!(plan_chunks_with_overlap(3_000, 30_000, 2_000), vec![(0, 3_000)]);
    }

    #[test]
    fn import_rejects_missing_file() {
        // Arrange & Act：不存在的文件 → 可操作错误（不建会话）
        let db = crate::db::Db::open(":memory:").expect("mem db");
        let resolver = FfmpegResolver::dev();
        let result = run_video_import(
            &db,
            &crate::engine::EnginePool::dummy(),
            &resolver,
            "不存在.mp4",
            &crate::ui_junk::UiJunkList::defaults(),
            |_| {},
        );
        // Assert
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("不存在"));
    }
}
