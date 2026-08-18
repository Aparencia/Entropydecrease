//! 实时会话帧处理（live_session.rs 的拆分子模块，保持主文件 ≤300 行）。
//!
//! @ai-context: 屏幕帧 → 变化检测 → 字幕区裁剪 → 内存 OCR（TD-025，免磁盘临时 BMP）→
//!              滚动检测/时间窗去重 → 落库 + 内存缓存；全帧画面要点去重落库。
//! @ai-context: 停止时的融合重写（rewrite_with_fusion）也归本模块。
//! @ai-context: 屏幕采样在独立线程运行（run_screen_worker，TD-026 修复）——
//!              OCR 推理不再阻塞会话线程的音频消费。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::dxgi_capture::CapturedFrame;
use crate::capture::frame_diff::{bottom_quarter_rect, crop_frame, DualRateScheduler, FrameDiffDetector, SampleRegion};
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
/// 采样节拍（ms）：与音频消费解耦，固定 1s 一拍（审查 M5 修复）。
const SAMPLE_TICK_MS: u64 = 1000;
/// 采样线程轮询休眠（ms）——空转粒度，影响停止响应延迟。
const WORKER_POLL_MS: u64 = 50;

/// 屏幕采样线程入口（TD-026 修复：OCR 从会话线程移出，音频消费不再被阻塞）。
///
/// @ai-context: ScreenCaptureSampler 持 COM 对象（非 Send），在本线程内创建与使用，
///              规避跨线程约束；节拍自驱动（与音频消费解耦）；字幕段写入共享缓存，
///              停止后由会话线程读取用于融合。
pub fn run_screen_worker(
    stop: Arc<AtomicBool>,
    hwnd: Option<i64>,
    db: Db,
    engines: EnginePool,
    app: tauri::AppHandle,
    session_id: i64,
    subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>>,
) {
    let mut screen = match ScreenCaptureSampler::new(hwnd.map(crate::windows::hwnd_from_i64)) {
        Ok(s) => {
            eprintln!("[LiveSession] 屏幕捕获后端: {}", s.backend_name());
            Some(s)
        }
        Err(e) => {
            // 采样器创建失败（DXGI/GDI 均不可用）时 worker 空转，但必须可观测（审查补充）
            eprintln!("[LiveSession] 屏幕捕获初始化失败（字幕/画面识别不可用）: {}", e);
            None
        }
    };
    // 字幕区变化阈值=1（单行字幕翻页只落 1 块，审查 M6 修复），全帧=2（过滤鼠标微动）
    let mut scheduler = DualRateScheduler::new(2, 5);
    let mut subtitle_diff = FrameDiffDetector::with_min_changed_blocks(1);
    let mut full_diff = FrameDiffDetector::new();
    let mut tracker = SubtitleTracker::new();
    let mut last_frame_text: Option<String> = None;
    let mut last_sample_at = Instant::now();

    while !stop.load(Ordering::SeqCst) {
        if last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
            last_sample_at = Instant::now();
            let region = scheduler.next_region();
            if region != SampleRegion::Skip {
                let diff = match region {
                    SampleRegion::Subtitle => &mut subtitle_diff,
                    _ => &mut full_diff,
                };
                process_frame(
                    screen.as_mut(), diff, &mut tracker, &mut last_frame_text,
                    &db, &engines, &app, session_id, region, &subtitle_segments,
                );
            }
        }
        std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
    }
}

/// 处理一帧屏幕采样（字幕区/全帧 OCR）。
#[allow(clippy::too_many_arguments)]
fn process_frame(
    screen: Option<&mut ScreenCaptureSampler>,
    diff: &mut FrameDiffDetector,
    tracker: &mut SubtitleTracker,
    last_frame_text: &mut Option<String>,
    db: &Db,
    engines: &EnginePool,
    app: &tauri::AppHandle,
    session_id: i64,
    region: SampleRegion,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
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

    // TD-025：BGRA8 帧 → 内存 RgbImage 直送 OCR（不再写磁盘临时 BMP，杜绝崩溃残留）
    let Some(rgb) = bgra_to_rgb_image(&frame.bgraw, frame.width, frame.height) else { return };
    match engines.recognize_image(rgb) {
        Ok(blocks) => {
            if is_subtitle {
                handle_subtitle_frame(
                    &frame, &blocks, tracker, last_frame_text, db, app, session_id, subtitle_segments,
                );
            } else {
                handle_full_frame(&frame, &blocks, db, session_id);
            }
        }
        Err(e) => eprintln!("[ScreenWorker] OCR 识别失败（下帧重试）: {}", e),
    }
}

/// BGRA8 像素 → image::RgbImage（纯函数；尺寸与像素长度不匹配返回 None）。
fn bgra_to_rgb_image(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
    let pixel_len = width as usize * height as usize * 4;
    if width == 0 || height == 0 || bgraw.len() != pixel_len {
        return None;
    }
    let mut rgb = Vec::with_capacity(pixel_len / 4 * 3);
    for px in bgraw.chunks_exact(4) {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    image::RgbImage::from_raw(width, height, rgb)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bgra_converts_to_rgb_in_memory() {
        // Arrange：2x1 像素 BGRA（B=1,G=2,R=3 / B=4,G=5,R=6）
        let bgraw = vec![1u8, 2, 3, 255, 4, 5, 6, 255];
        // Act
        let img = bgra_to_rgb_image(&bgraw, 2, 1).expect("convert");
        // Assert：像素顺序 RGB，首像素 (3,2,1)
        assert_eq!(img.dimensions(), (2, 1));
        assert_eq!(img.as_raw(), &[3u8, 2, 1, 6, 5, 4]);
    }

    #[test]
    fn bgra_rejects_mismatched_size() {
        // Act & Assert：尺寸与像素长度不匹配 → None
        assert!(bgra_to_rgb_image(&[0u8; 3], 2, 1).is_none());
        assert!(bgra_to_rgb_image(&[], 0, 0).is_none());
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
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
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
    // 跨线程共享缓存（TD-026：采样线程写、会话线程停止后读）
    subtitle_segments
        .lock()
        .expect("subtitle segments lock poisoned")
        .push(SubtitleSegment { start_ms: frame.timestamp_ms, end_ms, text: emitted.clone() });
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
