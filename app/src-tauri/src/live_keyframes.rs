//! 实时链路关键帧处理与融合重写（live_session_frame.rs 拆分，保持主文件 ≤600 行）。
//!
//! @ai-context: ① handle_full_frame：全帧画面要点落库 + M6 关键帧样本收集与
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
/// @ai-context: M6/REQ-051：关键帧样本收集（停止时投票）+ 新画面文本归档存图
///              （三层图结构参考图集数据源；预算上限由 image_store 控制）。
/// @ai-context: 修复①：UI 垃圾（播放器时间码/控制条/水印）源头过滤——与字幕路径
///              （REQ-083）同口径，不进文本集/不落库/不归档（播放器区域被版面
///              误判时，OCR 产出时间码会每 2s 刷屏归档）。
/// @ai-context: 修复②：空文本帧不归档——旧实现首帧无条件归档占坑（
///              last_archived_text=None 恒真），误判会话参考图集只剩一张开头图。
#[allow(clippy::too_many_arguments)]
pub fn handle_full_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    last_texts: &mut Vec<String>,
    frame_samples: &mut Vec<crate::frame_cluster::FrameSample>,
    last_archived_text: &mut Option<String>,
    last_archived_at: &mut Option<Instant>,
    image_store: &mut Option<crate::image_store::SessionImageStore>,
    ocr_input_hash: u64,
    // M3/REQ-067：dHash 双指纹（与 aHash 组合——聚类任一显著变化即新簇）
    ocr_input_dhash: u64,
    // REQ-083 同口径：UI 垃圾黑名单（播放器时间码/控制条源头过滤）
    ui_junk: &crate::ui_junk::UiJunkList,
) {
    // REQ-083：UI 垃圾块源头过滤（播放器时间码/控制条/水印——与字幕路径同口径）
    let kept: Vec<&crate::types::OcrBlock> =
        blocks.iter().filter(|b| is_useful_block(b, ui_junk)).collect();
    let texts: Vec<String> = kept.iter().map(|b| b.text.clone()).collect();
    // REQ-066（v0.6.0 M3）：帧新颖度——与最近已见文本高重叠 → 冗余帧：
    // 不落库/不归档/不收集样本（预算花在新内容上；与变化检测两级串联：
    // 变化检测滤"无变化"帧，新颖度滤"微变但内容冗余"帧）。
    // 冗余帧不更新 last_texts 基准（保持"最后有意义内容"——防基准污染）。
    if !texts.is_empty() && !last_texts.is_empty() {
        let score = crate::novelty::novelty_score(&texts, last_texts);
        if crate::novelty::is_redundant(score, crate::novelty::REDUNDANT_THRESHOLD) {
            return;
        }
    }
    // M6：关键帧样本收集（全帧分支每次 OCR 成功记录；停止时投票器消费）
    if !texts.is_empty() {
        frame_samples.push(crate::frame_cluster::FrameSample {
            timestamp_ms: frame.timestamp_ms,
            ahash: ocr_input_hash,
            dhash: ocr_input_dhash,
            ocr_text: Some(texts.join(" ")),
            change_magnitude: 0.0,
        });
    }
    // M6：新画面文本 → 归档存图（参考图集；同文本不重复归档 + 2s 防抖）。
    // 修复：空文本帧不归档——旧实现首帧无条件归档占坑（last_archived_text=None
    // 恒真，哪怕文本为空），误判会话参考图集只剩一张开头占坑图
    if !texts.is_empty() {
        let joined = texts.join(" ");
        let is_new_text = last_archived_text.as_deref() != Some(joined.as_str());
        let interval_ok = last_archived_at.is_none_or(|t| t.elapsed() >= Duration::from_secs(2));
        if is_new_text && interval_ok {
            if let Some(store) = image_store.as_mut() {
                if let Err(e) = store.save_frame(
                    frame.timestamp_ms,
                    &frame.bgraw,
                    frame.width,
                    frame.height,
                ) {
                    // 归档失败不阻断 OCR 主链路（预算满/IO 错误静默降级，日志可观测）
                    eprintln!("[ScreenWorker] 关键帧归档失败: {}", e);
                }
            }
            *last_archived_text = Some(joined);
            *last_archived_at = Some(Instant::now());
        }
    }
    if crate::import_frame::same_texts(&texts, last_texts) {
        return;
    }
    for block in kept {
        let _ = db.add_ocr_block(&NewSessionOcrBlock {
            session_id,
            timestamp_ms: frame.timestamp_ms,
            text: block.text.clone(),
            score: block.score,
            region: "full".to_string(),
            // M4/REQ-048：整帧直跑路径无区域标注（None=兼容旧数据口径）
            region_kind: None,
        });
        let _ = app.emit(
            "live:ocr",
            OcrEvent { timestamp_ms: frame.timestamp_ms, text: block.text.clone() },
        );
    }
    *last_texts = texts;
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

/// 是否存在可用块（纯函数；区域路径整帧回退判定入口）。
pub fn has_useful_blocks(
    blocks: &[crate::types::OcrBlock],
    ui_junk: &crate::ui_junk::UiJunkList,
) -> bool {
    blocks.iter().any(|b| is_useful_block(b, ui_junk))
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

    #[test]
    fn has_useful_blocks_any_match() {
        let junk = crate::ui_junk::UiJunkList::defaults();
        // 全部垃圾/低分 → false；混入一个可用块 → true
        let all_junk = vec![block("暂停", 0.9), block("14:25", 0.95)];
        assert!(!has_useful_blocks(&all_junk, &junk), "全垃圾块不得判定为有产出");
        let mixed = vec![block("14:25", 0.95), block("真实内容", 0.8)];
        assert!(has_useful_blocks(&mixed, &junk), "存在可用块应判定为有产出");
        assert!(!has_useful_blocks(&[], &junk));
    }
}

/// 实时画面要点事件载荷（前端实时画面流，简要单行卡片）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEvent {
    pub timestamp_ms: u64,
    pub text: String,
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
