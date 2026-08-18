//! 实时会话帧处理（live_session.rs 的拆分子模块，保持主文件 ≤300 行）。
//!
//! @ai-context: 屏幕帧 → 变化检测 → 字幕区裁剪 + OCR 输入缩小（P4）→ 内存 OCR
//!              （TD-025，免磁盘临时 BMP）→ 滚动检测/多帧投票（T2）→ 落库 + 内存缓存；
//!              全帧画面要点去重落库。
//! @ai-context: 停止时的融合重写（rewrite_with_fusion）也归本模块——v0.3.0（REQ-031）
//!              增加无字幕短路：subtitles 为空时融合 = ASR 原样拷贝，直接跳过。
//! @ai-context: 屏幕采样在独立线程运行（run_screen_worker，TD-026 修复）——
//!              OCR 推理不再阻塞会话线程的音频消费；语音活跃度（B3）驱动自适应采样。
//! @ai-context: 时间戳统一（ADR-008 A1）：帧时间戳在捕获后覆写为会话纪元 elapsed，
//!              与音频块、flush 尾句同一基准。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::dxgi_capture::CapturedFrame;
use crate::capture::frame_diff::{
    bottom_quarter_rect, crop_frame, downscale_bgra, DualRateScheduler, FrameDiffDetector, SampleRegion,
};
use crate::capture::ScreenCaptureSampler;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::Result;
use crate::fusion::{merge_transcript, FusedSource, SubtitleSegment};
use crate::subtitle_ocr::{is_scrolling, SubtitleVoter, VotedSubtitle};
use crate::types::{NewSessionOcrBlock, NewSessionSegment, TranscriptSegment};

/// 采样节拍（ms）：与音频消费解耦，固定 1s 一拍（审查 M5 修复）。
const SAMPLE_TICK_MS: u64 = 1000;
/// 采样线程轮询休眠（ms）——空转粒度，影响停止响应延迟。
const WORKER_POLL_MS: u64 = 50;
/// OCR 输入最大宽度（P4：字幕裁剪区缩至该宽度再送 OCR，推理成本近平方下降）。
const MAX_OCR_WIDTH: u32 = 960;
/// 强制 OCR 间隔（s）——diff 采样漏检兜底：变化检测（8 块 × 60 字节采样 hash）
/// 对局部/平滑变化可能漏检（采样点错过变化像素），此时距上次 OCR 超过该间隔
/// 强制识别一次，保证"屏幕在变但无 OCR"场景至少周期性产出（用户反馈 4/5 会话无 OCR 排查项）。
const FORCE_OCR_INTERVAL_SECS: u64 = 15;

/// 屏幕采样线程入口（TD-026 修复：OCR 从会话线程移出，音频消费不再被阻塞）。
///
/// @ai-context: ScreenCaptureSampler 持 COM 对象（非 Send），在本线程内创建与使用，
///              规避跨线程约束；节拍自驱动（与音频消费解耦）；字幕段写入共享缓存，
///              停止后由融合线程读取；epoch/speech_active 由会话线程注入（ADR-008）。
/// @ai-context: 参数多为编排上下文传递（停止标志/纪元/活跃度/DB/引擎/事件/缓存），
///              聚合会破坏内聚，登记 clippy 豁免。
#[allow(clippy::too_many_arguments)]
pub fn run_screen_worker(
    stop: Arc<AtomicBool>,
    hwnd: Option<i64>,
    epoch: Instant,
    speech_active: Arc<AtomicBool>,
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
    let mut voter = SubtitleVoter::new();
    let mut last_frame_text: Option<String> = None;
    let mut last_preview = String::new();
    let mut last_sample_at = Instant::now();
    // 捕获失败日志节流状态（屏幕链路失效时每帧报错会刷屏，5s 一次）
    let mut last_capture_error: Option<Instant> = None;
    // 上次 OCR 时刻（强制 OCR 兜底）与全帧文本去重（强制 OCR 下静止画面不重复落库）
    let mut last_ocr_at = Instant::now();
    let mut last_full_texts: Vec<String> = Vec::new();

    while !stop.load(Ordering::SeqCst) {
        if last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
            last_sample_at = Instant::now();
            // B3（P3 简化版）：语音活跃度驱动自适应采样——静音期全帧提频
            let region = scheduler.next_region(speech_active.load(Ordering::Relaxed));
            if region != SampleRegion::Skip {
                let diff = match region {
                    SampleRegion::Subtitle => &mut subtitle_diff,
                    _ => &mut full_diff,
                };
                process_frame(
                    screen.as_mut(), diff, &mut voter, &mut last_frame_text, &mut last_preview,
                    &db, &engines, &app, session_id, region, &subtitle_segments, epoch,
                    &mut last_capture_error, &mut last_ocr_at, &mut last_full_texts,
                );
            }
        }
        std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
    }
    // 停止：冲刷未定稿的最后一组字幕（否则末句字幕丢失，T2 语义要求）
    if let Some(voted) = voter.flush(epoch.elapsed().as_millis() as u64) {
        persist_voted_subtitle(&db, &app, session_id, &subtitle_segments, voted);
    }
    // 显式释放采样器（COM/DXGI 资源）——worker 退出即释放 duplication，
    // 防多会话快速连测时泄漏累积触发 DXGI 并发上限（4/5 会话无 OCR 排查项）
    drop(screen);
    eprintln!("[ScreenWorker] 屏幕采样线程退出（会话 {}）", session_id);
}

/// 处理一帧屏幕采样（字幕区/全帧 OCR）。
#[allow(clippy::too_many_arguments)]
fn process_frame(
    screen: Option<&mut ScreenCaptureSampler>,
    diff: &mut FrameDiffDetector,
    voter: &mut SubtitleVoter,
    last_frame_text: &mut Option<String>,
    last_preview: &mut String,
    db: &Db,
    engines: &EnginePool,
    app: &tauri::AppHandle,
    session_id: i64,
    region: SampleRegion,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
    epoch: Instant,
    last_capture_error: &mut Option<Instant>,
    last_ocr_at: &mut Instant,
    last_full_texts: &mut Vec<String>,
) {
    let Some(sampler) = screen else { return };
    // 字幕区只认底部 1/4：先全帧捕获再裁剪（简化双速率，字幕区帧成本可控）
    let capture_result = sampler.capture(None);
    // ADR-007：目标窗口关闭等捕获事件无论捕获结果如何都要转发——
    // 窗口关闭瞬间若 GDI 捕获也失败，事件不得被吞掉（审查发现）
    match sampler.take_event() {
        Some(crate::capture::dxgi_capture::CaptureEvent::WindowLost) => {
            let _ = app.emit("live:window-lost", ());
        }
        None => {}
    }
    let Ok(Some(mut frame)) = capture_result else {
        // 捕获失败（DXGI/GDI 均失效）——曾静默返回导致"会话无 OCR"无法定位；
        // 日志节流 5s（降级期间每帧失败会刷屏）
        if let Err(e) = capture_result {
            let now = Instant::now();
            let should_log = last_capture_error
                .map(|t| now.duration_since(t) >= Duration::from_secs(5))
                .unwrap_or(true);
            if should_log {
                *last_capture_error = Some(now);
                eprintln!("[ScreenWorker] 屏幕捕获失败（日志节流 5s）: {}", e);
            }
        }
        return;
    };
    // A1：帧时间戳统一为会话纪元（与音频/flush 同基准，ADR-008）
    frame.timestamp_ms = epoch.elapsed().as_millis() as u64;
    // 强制 OCR 兜底（diff 采样漏检防御）：变化检测 hash 对局部/平滑变化可能漏检
    // （采样点错过变化像素）——距上次 OCR 超过 FORCE_OCR_INTERVAL 时无条件放行，
    // 保证"屏幕在变但无 OCR"场景至少周期性产出（用户反馈 4/5 会话无 OCR 排查项）
    let force_ocr = last_ocr_at.elapsed() >= Duration::from_secs(FORCE_OCR_INTERVAL_SECS);
    if !diff.has_changed(&frame.bgraw) && !force_ocr {
        return;
    }
    let is_subtitle = region == SampleRegion::Subtitle;
    if is_subtitle {
        let Some(q) = bottom_quarter_rect(frame.width, frame.height) else { return };
        crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, Some(&q));
        // P4：OCR 输入缩小——字幕区宽超上限时最近邻缩小（文字大，质量无损）
        downscale_bgra(&mut frame.bgraw, &mut frame.width, &mut frame.height, MAX_OCR_WIDTH);
        if frame.bgraw.is_empty() {
            return;
        }
    }

    // TD-025：BGRA8 帧 → 内存 RgbImage 直送 OCR（不再写磁盘临时 BMP，杜绝崩溃残留）
    let Some(rgb) = bgra_to_rgb_image(&frame.bgraw, frame.width, frame.height) else { return };
    match engines.recognize_image(rgb) {
        Ok(blocks) => {
            // 成功识别即刷新 OCR 时刻（无论是否产出文本——防漏检兜底周期基准）
            *last_ocr_at = Instant::now();
            if is_subtitle {
                handle_subtitle_frame(
                    &frame, &blocks, voter, last_frame_text, last_preview, db, app, session_id, subtitle_segments,
                );
            } else {
                handle_full_frame(&frame, &blocks, db, session_id, last_full_texts);
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

/// 字幕区帧：文本拼接 → 滚动检测 → 多帧投票（T2）→ 切换时定稿落库。
///
/// @ai-context: 参数多源于编排上下文传递（DB/事件/状态/投票器），聚合会破坏内聚，登记豁免。
#[allow(clippy::too_many_arguments)]
fn handle_subtitle_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    voter: &mut SubtitleVoter,
    last_frame_text: &mut Option<String>,
    last_preview: &mut String,
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
) {
    let text = blocks.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("");
    if text.trim().is_empty() {
        return;
    }
    // 滚动字幕（股票/歌词）丢弃——投票分组对逐帧漂移文本失效
    let prev = last_frame_text.clone().unwrap_or_default();
    if is_scrolling(&text, &prev, 0.6) {
        return;
    }
    *last_frame_text = Some(text.clone());
    // 多帧投票：同字幕帧累积为样本；字幕切换时定稿上一组（投票纠错 + 真实时间轴）
    if let Some(voted) = voter.observe(&text, frame.timestamp_ms) {
        persist_voted_subtitle(db, app, session_id, subtitle_segments, voted);
    }
    // UI 即时预览：新组首帧原文立刻推送（定稿文本在切换时再推，纠正可见）
    if let Some(preview) = voter.preview() {
        if *last_preview != preview {
            *last_preview = preview.to_string();
            let _ = app.emit("live:subtitle", preview.to_string());
        }
    }
}

/// 定稿一条字幕：OCR 块 + 转写段 + 共享缓存 + 事件（T2 语义：切换/停止时落库）。
fn persist_voted_subtitle(
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
    voted: VotedSubtitle,
) {
    let text = voted.text.clone();
    let _ = db.add_ocr_block(&NewSessionOcrBlock {
        session_id,
        timestamp_ms: voted.start_ms,
        text: text.clone(),
        score: 0.9,
        region: "subtitle".to_string(),
    });
    let _ = db.add_segment(&NewSessionSegment {
        session_id,
        start_ms: voted.start_ms,
        end_ms: voted.end_ms,
        text: text.clone(),
        source: "subtitle".to_string(),
        confidence: None,
    });
    // 跨线程共享缓存（TD-026：采样线程写、停止后融合线程读）
    subtitle_segments
        .lock()
        .expect("subtitle segments lock poisoned")
        .push(voted.into_segment());
    let _ = app.emit("live:subtitle", text);
}

/// 全帧：画面要点落 OCR 块（低置信度过滤 + 帧间文本去重）。
///
/// @ai-context: 去重（与导入链路 same_texts 同口径）：强制 OCR 兜底会使静止画面
///              每 15s 重复识别——文本集合与上次完全一致时跳过落库，防要点列表刷屏。
fn handle_full_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    db: &Db,
    session_id: i64,
    last_texts: &mut Vec<String>,
) {
    let texts: Vec<String> = blocks
        .iter()
        .filter(|b| b.score >= 0.5 && !b.text.trim().is_empty())
        .map(|b| b.text.clone())
        .collect();
    if crate::import_frame::same_texts(&texts, last_texts) {
        return;
    }
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
    *last_texts = texts;
}

/// 融合并重写会话段：单事务原子替换（删除原段 + 插入融合时间轴，ADR-005 §3）。
///
/// @ai-context: 原子性由 db.replace_segments 保证（审查 M1 修复）——
///              失败整体回滚，原段不丢失。
/// @ai-context: REQ-031 无字幕短路：subtitles 为空时融合四规则全部退化为无操作
///              （融合输出 = ASR 原样拷贝）——直接跳过，省去无意义的全量重写。
pub fn rewrite_with_fusion(
    db: &Db,
    session_id: i64,
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
) -> Result<()> {
    if subtitles.is_empty() {
        eprintln!("[Fusion] 会话 {} 无字幕段，短路跳过融合（ASR 段原样保留）", session_id);
        return Ok(());
    }
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

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_frame_tests.rs"]
mod tests;
