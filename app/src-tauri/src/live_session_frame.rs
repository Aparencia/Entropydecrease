//! 实时会话帧处理（live_session.rs 的拆分子模块，保持主文件 ≤300 行）。
//!
//! @ai-context: 屏幕帧 → 变化检测 → 字幕区裁剪 → BMP 临时文件 → OCR →
//!              滚动检测/时间窗去重 → 落库 + 内存缓存；全帧画面要点去重落库。
//! @ai-context: 停止时的融合重写（rewrite_with_fusion）也归本模块。

use tauri::Emitter;

use crate::capture::bmp::bmp_encode;
use crate::capture::dxgi_capture::CapturedFrame;
use crate::capture::frame_diff::{bottom_quarter_rect, crop_frame, FrameDiffDetector, SampleRegion};
use crate::capture::ScreenCaptureSampler;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::Result;
use crate::fusion::{merge_transcript, FusedSource, SubtitleSegment};
use crate::subtitle_ocr::{is_scrolling, SubtitleTracker};
use crate::types::{NewSessionOcrBlock, NewSessionSegment, TranscriptSegment};

/// 字幕区去重窗（ms）。
const SUBTITLE_DEDUPE_MS: u64 = 3000;
/// 字幕段默认时长（ms）——融合时按下一字幕出现时刻补齐。
const SUBTITLE_DEFAULT_MS: u64 = 2000;

/// 处理一帧屏幕采样（字幕区/全帧 OCR）。
#[allow(clippy::too_many_arguments)]
pub fn process_frame(
    screen: Option<&mut ScreenCaptureSampler>,
    diff: &mut FrameDiffDetector,
    tracker: &mut SubtitleTracker,
    last_frame_text: &mut Option<String>,
    db: &Db,
    engines: &EnginePool,
    app: &tauri::AppHandle,
    session_id: i64,
    region: SampleRegion,
    subtitle_segments: &mut Vec<SubtitleSegment>,
) {
    let Some(sampler) = screen else { return };
    // 字幕区只认底部 1/4：先全帧捕获再裁剪（简化双速率，字幕区帧成本可控）
    let Ok(Some(mut frame)) = sampler.capture(None) else { return };
    if !diff.has_changed(&frame.bgraw) {
        return;
    }
    let is_subtitle = region == SampleRegion::Subtitle;
    if is_subtitle {
        let Some(q) = bottom_quarter_rect(frame.width, frame.height) else { return };
        crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, Some(&q));
        if frame.bgraw.is_empty() {
            return;
        }
    }

    // 编码 BMP → 临时文件 → OCR（oar-ocr 按路径读图）
    let Some(bmp) = bmp_encode(&frame.bgraw, frame.width, frame.height) else { return };
    let path = std::env::temp_dir().join(format!("entropy-frame-{}-{}.bmp", session_id, frame.timestamp_ms));
    if std::fs::write(&path, bmp).is_err() {
        return;
    }
    let blocks = engines.recognize(&path.to_string_lossy());
    let _ = std::fs::remove_file(&path);
    let Ok(blocks) = blocks else { return };

    if is_subtitle {
        handle_subtitle_frame(
            &frame, &blocks, tracker, last_frame_text, db, app, session_id, subtitle_segments,
        );
    } else {
        handle_full_frame(&frame, &blocks, db, session_id);
    }
}

/// 字幕区帧：文本拼接 → 滚动检测 → 时间窗去重 → 落库（字幕段 + OCR 块）。
///
/// @ai-context: 参数多源于编排上下文传递（DB/事件/状态），聚合会破坏内聚，登记豁免。
#[allow(clippy::too_many_arguments)]
fn handle_subtitle_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    tracker: &mut SubtitleTracker,
    last_frame_text: &mut Option<String>,
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    subtitle_segments: &mut Vec<SubtitleSegment>,
) {
    let text = blocks.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("");
    if text.trim().is_empty() {
        return;
    }
    // 滚动字幕（股票/歌词）丢弃
    let prev = last_frame_text.clone().unwrap_or_default();
    if is_scrolling(&text, &prev, 0.6) {
        return;
    }
    *last_frame_text = Some(text.clone());
    // 时间窗去重：同文本/微抖动跳过
    let Some(emitted) = tracker.process(&text, frame.timestamp_ms, SUBTITLE_DEDUPE_MS) else {
        return;
    };

    let end_ms = frame.timestamp_ms + SUBTITLE_DEFAULT_MS;
    let _ = db.add_ocr_block(&NewSessionOcrBlock {
        session_id,
        timestamp_ms: frame.timestamp_ms,
        text: emitted.clone(),
        score: 0.9,
        region: "subtitle".to_string(),
    });
    let _ = db.add_segment(&NewSessionSegment {
        session_id,
        start_ms: frame.timestamp_ms,
        end_ms,
        text: emitted.clone(),
        source: "subtitle".to_string(),
        confidence: None,
    });
    subtitle_segments.push(SubtitleSegment { start_ms: frame.timestamp_ms, end_ms, text: emitted.clone() });
    let _ = app.emit("live:subtitle", emitted);
}

/// 全帧：画面要点落 OCR 块（低置信度过滤）。
fn handle_full_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    db: &Db,
    session_id: i64,
) {
    for block in blocks {
        if block.score >= 0.5 && !block.text.trim().is_empty() {
            let _ = db.add_ocr_block(&NewSessionOcrBlock {
                session_id,
                timestamp_ms: frame.timestamp_ms,
                text: block.text.clone(),
                score: block.score,
                region: "full".to_string(),
            });
        }
    }
}

/// 融合并重写会话段：单事务原子替换（删除原段 + 插入融合时间轴，ADR-005 §3）。
///
/// @ai-context: 原子性由 db.replace_segments 保证（审查 M1 修复）——
///              失败整体回滚，原段不丢失。
pub fn rewrite_with_fusion(
    db: &Db,
    session_id: i64,
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
) -> Result<()> {
    let fused = merge_transcript(subtitles, asr_segments, 0);
    if fused.is_empty() {
        return Ok(());
    }
    let items: Vec<NewSessionSegment> = fused
        .iter()
        .map(|s| NewSessionSegment {
            session_id,
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            source: match s.source {
                FusedSource::Subtitle => "subtitle",
                FusedSource::Asr => "asr",
                FusedSource::Fused => "fused",
            }
            .to_string(),
            confidence: None,
        })
        .collect();
    db.replace_segments(session_id, &items)?;
    Ok(())
}
