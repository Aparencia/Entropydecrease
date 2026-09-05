//! 实时链路关键帧处理与融合重写（live_session_frame.rs 拆分，保持主文件 ≤600 行）。
//!
//! @ai-context: ① handle_full_frame：全帧画面要点落库 + 关键帧样本收集与
//!              归档存图（三层图结构参考图集数据源）；② 停止时关键帧投票
//!              （session:keyframes 事件）；③ rewrite_with_fusion：融合重写
//!              （原属 live_session_frame，REQ-031 无字幕短路）。
//! @ai-context: 参数多为编排上下文传递，聚合会破坏内聚，登记 clippy 豁免。

use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::dxgi_capture::CapturedFrame;
use crate::db::Db;
use crate::error::Result;
use crate::fusion::{merge_transcript, FusedSource, SubtitleSegment};
use crate::types::{NewSessionOcrBlock, NewSessionSegment, TranscriptSegment};

/// 全帧：画面要点落 OCR 块（低置信度过滤 + 帧间文本去重 + 实时事件推送）。
///
/// @ai-context: 去重（与导入链路 same_texts 同口径）：强制 OCR 兜底会使静止画面
///              每 15s 重复识别——文本集合与上次完全一致时跳过落库，防要点列表刷屏。
/// @ai-context: 落库成功即 emit live:ocr（前端实时画面流，简要单行卡片）。
/// @ai-context: M6/REQ-051：关键帧样本收集（停止时投票）+ 归档存图
///              （三层图结构参考图集数据源；预算上限由 image_store 控制）。
/// @ai-context: v0.12.0 M5（关键帧纯图）：存图触发解耦——不再依赖 OCR 文本非空，
///              改「网格差异变化 + 2s 防抖」（视频全帧 OCR 下线后纯图帧仍归档）；
///              关键帧样本收集亦随视觉变化触发（纯图帧采样，文本为可选信号）。
/// @ai-context: 修复①：UI 垃圾（播放器时间码/控制条/水印）源头过滤——与字幕路径
///              （REQ-083）同口径，不进文本集/不落库/不归档（播放器区域被版面
///              误判时，OCR 产出时间码会每 2s 刷屏归档）。
/// @ai-context: v0.7.3（REQ-155/156，ADR-015）：屏分配——落库带 screen_id+bbox；
///              layout_changed（版面指纹变化）与相似度/gap 共同判定新屏
///              （ScreenTracker 纯状态机，同屏续屏不产生新屏记录）。
#[allow(clippy::too_many_arguments)]
pub fn handle_full_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    last_texts: &mut Vec<String>,
    frame_samples: &mut Vec<crate::frame_cluster::FrameSample>,
    _last_archived_text: &mut Option<String>,
    last_archived_at: &mut Option<Instant>,
    image_store: &mut Option<crate::image_store::SessionImageStore>,
    ocr_input_hash: u64,
    // M3/REQ-067：dHash 双指纹（与 aHash 组合——聚类任一显著变化即新簇）
    ocr_input_dhash: u64,
    // REQ-083 同口径：UI 垃圾黑名单（播放器时间码/控制条源头过滤）
    ui_junk: &crate::ui_junk::UiJunkList,
    // v0.7.3：在线屏分配器（REQ-155）
    screen_tracker: &mut crate::screen_tracker::ScreenTracker,
    // v0.7.3：版面指纹变化信号（None=无版面信息，仅用相似/gap 判定）
    layout_changed: Option<bool>,
    // v0.11.5（Task 2）：新颖度变化区域（grid 变化包围盒）+ 独立基准 + 画面档
    grid: &crate::capture::grid_diff::GridDiff,
    last_changed_texts: &mut Vec<String>,
    tier: &str,
) {
    // REQ-083：UI 垃圾块源头过滤（播放器时间码/控制条/水印——与字幕路径同口径）
    let kept: Vec<&crate::types::OcrBlock> =
        blocks.iter().filter(|b| is_useful_block(b, ui_junk)).collect();
    let texts: Vec<String> = kept.iter().map(|b| b.text.clone()).collect();
    // REQ-066 + v0.11.5（Task 2）：新颖度比较域 = 变化区域文本（grid_diff 变化
    // 包围盒 ∩ 块 bbox——固定版面文字不参与重叠率）+ 阈值按画面档自适应。
    // 冗余帧不更新任何基准（防基准污染）。
    let changed_texts = changed_region_texts(&kept, grid);
    if !changed_texts.is_empty() && !last_changed_texts.is_empty() {
        let score = crate::novelty::novelty_score(&changed_texts, last_changed_texts);
        if crate::novelty::is_redundant(score, crate::novelty::tier_threshold(tier)) {
            return;
        }
    }
    // v0.12.0 M5：视觉变化信号（关键帧样本收集 + 存图触发共用——解耦后不再
    // 依赖 OCR 文本）
    let grid_changed = !grid.changed_cells.is_empty();
    // v0.12.0 M5：关键帧样本收集改随视觉变化触发（纯图帧亦采样——投票器按
    // ahash/dhash 聚类，文本为可选信号）
    if grid_changed {
        let sample_text = if texts.is_empty() { None } else { Some(texts.join(" ")) };
        frame_samples.push(crate::frame_cluster::FrameSample {
            timestamp_ms: frame.timestamp_ms,
            ahash: ocr_input_hash,
            dhash: ocr_input_dhash,
            ocr_text: sample_text,
            change_magnitude: 0.0,
        });
    }
    // v0.12.0 M5（关键帧纯图）：存图触发解耦——不再依赖 OCR 文本非空，
    // 改为「网格差异变化 + 2s 防抖」。（视频全帧 OCR 下线后关键帧纯图仍须归档；
    // 旧"同文本不重复/空文本不归档"的文本口径废弃——视觉变化即触发，纯图帧也归档。）
    let interval_ok = last_archived_at.is_none_or(|t| t.elapsed() >= Duration::from_secs(2));
    if grid_changed && interval_ok {
        if let Some(store) = image_store.as_mut() {
            match store.save_frame(frame.timestamp_ms, &frame.bgraw, frame.width, frame.height) {
                Ok(rel) => {
                    // 2026-08 用户需求：实时图片数据显示——归档成功即推送
                    // （前端转写面板"最近画面"条据此即时刷新，无需轮询）
                    let _ = app.emit("live:image-saved", rel);
                }
                Err(e) => {
                    // 归档失败不阻断主链路（预算满/IO 错误静默降级，日志可观测）
                    eprintln!("[ScreenWorker] 关键帧归档失败: {}", e);
                }
            }
        }
        *last_archived_at = Some(Instant::now());
    }
    if crate::import_frame::same_texts(&texts, last_texts) {
        return;
    }
    // v0.7.3（REQ-155）：本帧块归属屏号（空文本帧不推进屏状态——前面已 return）
    let screen_id = screen_tracker.assign_screen(frame.timestamp_ms, &texts, layout_changed);
    for block in kept {
        let _ = db.add_ocr_block(&NewSessionOcrBlock {
            session_id,
            timestamp_ms: frame.timestamp_ms,
            text: block.text.clone(),
            score: block.score,
            region: "full".to_string(),
            // M4/REQ-048：整帧直跑路径无区域标注（None=兼容旧数据口径）
            region_kind: None,
            // v0.7.3（REQ-156）：bbox 落库（帧坐标系）+ 屏号
            bbox: block.bbox,
            screen_id: Some(screen_id),
        });
        let _ = app.emit(
            "live:ocr",
            OcrEvent { timestamp_ms: frame.timestamp_ms, text: block.text.clone(), screen_id },
        );
    }
    *last_texts = texts;
    // v0.11.5（Task 2）：变化区域基准独立更新（全量基准服务落库去重/样本收集）
    *last_changed_texts = changed_texts;
}

/// 变化区域文本（v0.11.5 Task 2）：kept 过滤后仅保留与 grid_diff 变化包围盒
/// 相交的块文本（帧坐标）。防御降级：无变化（bounds=None）/缺 bbox → 整帧。
/// v0.11.5 审查修复（A1）：bbox 物理约束守卫——w/h 非正（异常数据）的块跳过
/// （不参与变化区域过滤，也不触发整帧降级——缺 bbox 才降级，非法值按损坏
/// 数据逐块丢弃）。
fn changed_region_texts(
    kept: &[&crate::types::OcrBlock],
    grid: &crate::capture::grid_diff::GridDiff,
) -> Vec<String> {
    let full = || kept.iter().map(|b| b.text.clone()).collect::<Vec<String>>();
    let Some(bounds) = grid.bounds.as_ref() else { return full() };
    if kept.iter().any(|b| b.bbox.is_none()) {
        return full();
    }
    kept.iter()
        .filter_map(|b| {
            let tb = b.bbox.as_ref()?;
            // v0.11.5 审查修复（A1）：bbox 物理约束守卫——w/h 非正（异常数据）
            // → 跳过该块（不参与变化区域过滤，也不触发整帧降级）
            if tb.w <= 0.0 || tb.h <= 0.0 {
                return None;
            }
            // TextBox（x/y/w/h，帧坐标）→ Rect（left/top/right/bottom，相交口径）
            // Minor #2 修复：bottom/right 用 ceil() 防止亚像素截断漏判
            // （left/top 用 floor 语义已由 trunc 隐含满足——x/y 非负时
            //  as i32 等价于 floor——亚像素区域左边缘不会漏进内部）
            let r = crate::capture::frame_diff::Rect {
                left: tb.x as i32, top: tb.y as i32,
                right: (tb.x + tb.w).ceil() as i32, bottom: (tb.y + tb.h).ceil() as i32,
            };
            bounds.intersect(&r).map(|_| b.text.clone())
        })
        .collect()
}

/// 块是否有用（纯函数）：score ≥ 0.5 + 非空文本 + 非 UI 垃圾。
///
/// @ai-context: 与字幕路径（REQ-083）同口径的"可消费块"判定。六轮审查修复：
///              区域路径"空产出回退整帧"曾以**原始块为空**判定——区域 OCR
///              产出任意低分/垃圾块（播放器时间码/视频画面误检）时整帧兜底被
///              跳过，误判区域场景仍可能饿死真实画面文字；回退应以"过滤后
///              无可用块"为准，本函数供 live_frame_process 复用。
pub fn is_useful_block(block: &crate::types::OcrBlock, ui_junk: &crate::ui_junk::UiJunkList) -> bool {
    block.score >= 0.5 && !block.text.trim().is_empty() && !ui_junk.is_junk(&block.text)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造 OCR 块（测试辅助）。
    fn block(text: &str, score: f32) -> crate::types::OcrBlock {
        crate::types::OcrBlock {
            timestamp_ms: None,
            text: text.to_string(),
            score,
            bbox: None,
            region_kind: None,
        }
    }

    #[test]
    fn useful_block_requires_score_text_and_non_junk() {
        // Arrange：默认黑名单（时间码特征开启）
        let junk = crate::ui_junk::UiJunkList::defaults();
        // Act/Assert：合格块可用；各维度不满足均不可用
        assert!(is_useful_block(&block("今天讲熵减", 0.9), &junk));
        assert!(!is_useful_block(&block("今天讲熵减", 0.4), &junk), "低分块不可用");
        assert!(!is_useful_block(&block("", 0.9), &junk), "空文本不可用");
        assert!(!is_useful_block(&block("   ", 0.9), &junk), "空白不可用");
        assert!(!is_useful_block(&block("14:25", 0.9), &junk), "播放器时间码不可用");
    }
    /// 构造带 bbox 的 OCR 块（测试辅助）。
    fn block_with_bbox(text: &str, x: f32, y: f32, w: f32, h: f32) -> crate::types::OcrBlock {
        crate::types::OcrBlock {
            timestamp_ms: None,
            text: text.to_string(),
            score: 0.9,
            bbox: Some(crate::types::TextBox { x, y, w, h }),
            region_kind: None,
        }
    }

    /// 构造 GridDiff（测试辅助）。
    fn grid_diff_with_bounds(
        bounds: Option<crate::capture::frame_diff::Rect>,
    ) -> crate::capture::grid_diff::GridDiff {
        crate::capture::grid_diff::GridDiff {
            changed_cells: vec![],
            bounds,
            changed_ratio: 0.0,
        }
    }

    #[test]
    fn changed_region_texts_bounds_none_fallback_full() {
        // Arrange：无变化包围盒 → 回退整帧文本
        let blocks = [block("文本A", 0.9), block("文本B", 0.9)];
        let kept: Vec<&crate::types::OcrBlock> = blocks.iter().collect();
        let grid = grid_diff_with_bounds(None);
        // Act
        let result = changed_region_texts(&kept, &grid);
        // Assert：返回全部 kept 块的 text
        assert_eq!(result, vec!["文本A", "文本B"], "bounds=None 应返回整帧文本");
    }

    #[test]
    fn changed_region_texts_intersecting_blocks_only() {
        // Arrange：3 个块，仅第 1 个与变化包围盒相交
        let b1 = block_with_bbox("相交块", 10.0, 10.0, 20.0, 20.0); // rect: (10,10,30,30)
        let b2 = block_with_bbox("不相交块1", 200.0, 200.0, 20.0, 20.0); // rect: (200,200,220,220)
        let b3 = block_with_bbox("不相交块2", 300.0, 300.0, 20.0, 20.0); // rect: (300,300,320,320)
        let blocks = [b1, b2, b3];
        let kept: Vec<&crate::types::OcrBlock> = blocks.iter().collect();
        // 变化包围盒仅与 b1 相交（15,15,25,25 ∩ 10,10,30,30 → (15,15,25,25) 非空）
        let bounds = crate::capture::frame_diff::Rect { left: 15, top: 15, right: 25, bottom: 25 };
        let grid = grid_diff_with_bounds(Some(bounds));
        // Act
        let result = changed_region_texts(&kept, &grid);
        // Assert：仅返回相交块的文本
        assert_eq!(result, vec!["相交块"], "应仅返回与变化包围盒相交的块文本");
    }

    #[test]
    fn changed_region_texts_any_missing_bbox_fallback_full() {
        // Arrange：一个块缺 bbox → 整帧回退（当前实现行为）
        let b1 = block_with_bbox("有bbox块", 10.0, 10.0, 20.0, 20.0);
        let b2 = block("缺bbox块", 0.9); // bbox=None
        let blocks = [b1, b2];
        let kept: Vec<&crate::types::OcrBlock> = blocks.iter().collect();
        let bounds = crate::capture::frame_diff::Rect { left: 15, top: 15, right: 25, bottom: 25 };
        let grid = grid_diff_with_bounds(Some(bounds));
        // Act
        let result = changed_region_texts(&kept, &grid);
        // Assert：降级为整帧回退（任意缺 bbox 不精确过滤）
        // 取舍说明：缺 bbox 的块无法判断是否在变化区域内，安全降级整帧
        assert_eq!(result, vec!["有bbox块", "缺bbox块"], "缺 bbox 应降级回退整帧");
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEvent {
    pub timestamp_ms: u64,
    pub text: String,
    /// v0.7.3（REQ-161）：块所属屏号（前端按屏摘要显示）
    pub screen_id: i64,
}

/// 停止时关键帧投票（M6/REQ-051：多信号筛选 → 关键图候选事件）。
///
/// @ai-context: 由屏幕 worker 停止路径调用；帧样本不足（无全帧 OCR）→ 静默跳过。
pub fn vote_and_emit_keyframes(
    frame_samples: &[crate::frame_cluster::FrameSample],
    app: &tauri::AppHandle,
    session_id: i64,
) {
    if frame_samples.is_empty() {
        return;
    }
    let votes = crate::frame_cluster::vote_key_frames(frame_samples, &[]);
    let top: Vec<crate::frame_cluster::KeyFrameCandidate> =
        votes.iter().take(5).cloned().collect();
    if top.is_empty() {
        return;
    }
    let summary: Vec<String> = top
        .iter()
        .map(|c| format!("{}ms({})", c.timestamp_ms, c.reasons.join("+")))
        .collect();
    eprintln!("[ScreenWorker] 会话 {} 关键图候选: {}", session_id, summary.join(", "));
    let _ = app.emit("session:keyframes", top);
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
    // REQ-264（v0.20.1）：融合前做字幕漂移校正——字幕 OCR 流时间轴滞后/超前
    // 是"字幕权威路线错位"主因；测量带内才采纳（过小=抖动噪声、过大=首尾强
    // 对齐误差/异常拒动；段数不足不估——与 harness 会话信道门槛同口径）
    const MIN_FUSION_DTW_SEGS: usize = 3;
    const MIN_APPLY_DRIFT_MS: i64 = 200;
    const MAX_APPLY_DRIFT_MS: i64 = 15_000;
    let correction =
        crate::dtw_align::correct_drift_if_any(subtitles, asr_segments, MIN_FUSION_DTW_SEGS, MIN_APPLY_DRIFT_MS, MAX_APPLY_DRIFT_MS);
    if let Some(d) = correction.applied_ms {
        eprintln!("[Fusion] 会话 {} 字幕漂移校正 {:+}ms（{} 段）", session_id, d, subtitles.len());
    } else if correction.measured_ms.is_some() {
        eprintln!("[Fusion] 会话 {} 字幕漂移测量 {:+}ms 未采纳（带外或段数不足）", session_id, correction.measured_ms.unwrap());
    }
    let fused = merge_transcript(&correction.corrected, asr_segments, 0);
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
            // REQ-062（v0.6.0 M2）：融合后置信度回填（字幕投票置信度/ASR 置信度/
            // 低置信核对标记——B3 落库通道；None=旧路径无置信度）
            confidence: s.confidence,
            // REQ-103（v0.7.0 M1）：段音量随融合透传（ASR 源有值；字幕源 None）
            volume: s.volume,
            speech_rate: None,
            pause_ms: None,
            speaker: None,
        })
        .collect();
    db.replace_segments(session_id, &items)?;
    Ok(())
}
