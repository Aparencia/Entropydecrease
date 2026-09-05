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
/// @ai-context: REQ-113 后生产链路用 plan_chunks_with_overlap；本入口保留
///              兼容（测试/外部引用），登记豁免 dead_code。
#[allow(dead_code)]
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
    // REQ-117：UI 垃圾黑名单（导入字幕源头过滤——与实时链路同口径）
    ui_junk: &crate::ui_junk::UiJunkList,
    // v0.12.0 M5 补完成：数据目录（session-images 图片库根）——关键帧纯图归档
    data_dir: &Path,
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
    // REQ-282（v0.19.6）：同源去重——同名视频重复导入不产生双胞胎标题
    // （「xxx」→「xxx #2」）；候选查询失败降级原名（零阻断）。
    let existing = db.recent_session_titles(90).unwrap_or_default();
    let title = crate::title_rules::dedupe_title(&existing, &title);
    let session = db.create_session(&NewSession {
        title: title.chars().take(100).collect(),
        source_window: None,
        // 文件导入路径无档案检测（无窗口标题信号），走默认档案（REQ-043）
        profile: None,
        // 视频导入 = 视频类会话（图文会话走 photo 命令线）
        kind: None,
    })?;
    let session_id = session.id;
    // v0.12.0 M5 补完成：视频导入关键帧纯图归档（存图不识别——与实时链路同口径；
    // 创建失败不阻断——降级为无图集会话，日志可观测）
    let mut image_store = crate::image_store::SessionImageStore::new(
        data_dir.join("session-images").join(session_id.to_string()),
    )
    .ok();
    // 中间文件限定系统临时目录（导入后即清理，不污染应用数据目录）
    let work_dir = std::env::temp_dir().join(format!("entropy-import-{}", session_id));
    let _ = std::fs::create_dir_all(&work_dir);

    let result = run_import_inner(
        db, engines, resolver, video, session_id, &work_dir, ui_junk,
        &mut image_store, &progress,
    );
    // 清理中间文件（无论成败）；失败标记会话 failed（与实时链路同口径）
    let _ = std::fs::remove_dir_all(&work_dir);
    result.inspect_err(|_| {
        let _ = db.mark_session_failed(session_id);
    })?;
    // REQ-282（v0.19.6）：首句升级——转写就绪后用首个可用句替换文件名标题
    // （仅 kind=source 生效；失败静默——不阻断导入主流程）。
    let _ = db.auto_title_upgrade(session_id);
    Ok(session_id)
}

/// 管线主体（与清理/失败标记分离，保证清理必然执行）。
/// @ai-context: 参数为管线上下文传递（db/engines/resolver/路径/会话/黑名单/图片库），
///              聚合会破坏内聚——登记 clippy 豁免（与 persist_final 同模式）。
#[allow(clippy::too_many_arguments)]
fn run_import_inner<F: Fn(&ImportProgress)>(
    db: &Db,
    engines: &EnginePool,
    resolver: &FfmpegResolver,
    video: &Path,
    session_id: i64,
    work_dir: &Path,
    ui_junk: &crate::ui_junk::UiJunkList,
    image_store: &mut Option<crate::image_store::SessionImageStore>,
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

    // 3) 关键帧处理（v0.12.0 M5 补完成：纯图归档 + 字幕 OCR；独立于转写路径；
    // ffmpeg 缺失跳过不阻断）
    // REQ-130（v0.7.0 M3）：P4 无图短路——会话档案 disable_ocr 时跳过**字幕 OCR**
    // （画面要点 OCR 已随 ADR-023 下线，本门控只作用于字幕）。导入路径当前
    // profile=None（默认档案，OCR 不跳过——零回归）；关键帧纯图归档恒执行
    // （存图不识别——与 disable_ocr 语义解耦）。
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
    // REQ-117：字幕过 UI 垃圾黑名单（与实时链路同口径）
    ocr_keyframes(engines, db, resolver, video, session_id, work_dir, ui_junk, image_store, ocr_enabled, progress);

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

/// 关键帧纯图归档 + 字幕 OCR（失败跳过不阻断；帧号按固定间隔换算时间戳）。
/// @ai-context: v0.12.0 M5 补完成（ADR-023）：关键帧**存图不识别**——不再做
///              画面要点 OCR（中部 region=full 下线）；只做底部字幕带 OCR
///              （region=subtitle，本地 OCR 只做字幕）。关键帧全量纯图归档
///              到 session-images/<id>（参考图集/精修图片理解同一数据源）。
/// @ai-context: 参数为管线上下文传递（引擎/DB/解析器/路径/会话/黑名单/图片库），
///              登记 clippy 豁免（与 persist_final 同模式）。
#[allow(clippy::too_many_arguments)]
fn ocr_keyframes<F: Fn(&ImportProgress)>(
    engines: &EnginePool,
    db: &Db,
    resolver: &FfmpegResolver,
    video: &Path,
    session_id: i64,
    work_dir: &Path,
    ui_junk: &crate::ui_junk::UiJunkList,
    image_store: &mut Option<crate::image_store::SessionImageStore>,
    // REQ-130：disable_ocr 档案 → 跳过字幕 OCR（关键帧归档恒执行）
    ocr_enabled: bool,
    progress: &F,
) {
    let Ok(paths) = resolver.resolve() else {
        progress(&ImportProgress { stage: "ocr".into(), message: "ffmpeg 缺失，跳过关键帧处理".into(), done: 1, total: 1 });
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
        eprintln!("[Import] 关键帧提取失败（跳过）: {}", e);
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
    // v0.12.0 M5 补完成：字幕区帧间文本去重（静态画面不重复落库）；全帧文本
    // 去重随画面要点 OCR 一并下线（无 full 块再落库）
    let mut last_subtitle: Vec<String> = Vec::new();
    // v0.11.7：累计识别块数（进度消息「已识别 N 块文字」）
    let mut total_blocks = 0usize;
    for (i, path) in files.iter().enumerate() {
        let timestamp_ms = (i as u64) * FRAME_INTERVAL_MS;
        match image::open(path).map(|d| d.into_rgb8()) {
            Ok(img) => {
                // v0.12.0 M5 补完成：关键帧纯图归档（存图不识别——预算超限/去重
                // 由 image_store 管理；归档失败不阻断，日志可观测）
                if let Some(store) = image_store.as_mut() {
                    let (w, h) = img.dimensions();
                    let bgra = crate::structure_capture::rgb_to_bgra(&img);
                    if let Err(e) = store.save_frame(timestamp_ms, &bgra, w, h) {
                        eprintln!("[Import] 关键帧归档失败: {}", e);
                    }
                }
                if ocr_enabled {
                    total_blocks += crate::import_frame::ocr_keyframe_subtitles(
                        db, engines, session_id, timestamp_ms, &img, &mut last_subtitle, ui_junk,
                    );
                }
            }
            Err(e) => eprintln!("[Import] 关键帧解码失败（跳过）: {}", e),
        }
        progress(&ImportProgress {
            stage: "ocr".into(),
            message: format!(
                "关键帧归档 {}/{} · 已识别字幕 {} 块{}",
                i + 1,
                total,
                total_blocks,
                if ocr_enabled { "" } else { "（档案禁用字幕识别）" }
            ),
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
        let tmp = std::env::temp_dir();
        let result = run_video_import(
            &db,
            &crate::engine::EnginePool::dummy(),
            &resolver,
            "不存在.mp4",
            &crate::ui_junk::UiJunkList::defaults(),
            &tmp,
            |_| {},
        );
        // Assert
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("不存在"));
    }
}
