//! ASR 会话全量离线精修（第二遍）——纯逻辑层（v0.20.2 / REQ-268）。
//!
//! @ai-context: 实时链路只做端点句 SenseVoice 重打分（3s 有界，streaming_asr），
//!              导入才是全窗两遍——本模块把"导入同级离线质量"带给实时会话：
//!              会话结束后用 S4 落盘音频（data_dir/session-audio/{id}.wav，
//!              live_session_loop finalize 出的 16k PCM16）重跑全窗 SenseVoice，
//!              逐窗与现网段轴比对产出「替换草稿」，采纳/回退由命令层落
//!              session_refine_drafts（原料 session_segments 永不变——可逆契约）。
//! @ai-context: 分窗复用导入链路同款窗口（30s 窗 + 2s 重叠，import::plan_...）
//!              ——与 import 同解码口径，窗边句由相邻窗文本重叠自然冗余；
//!              对比门限 SKIP_SIMILAR_ABOVE：现网已接近离线质量（相似 ≥0.85）
//!              的窗不产草稿，避免无意义噪音（预览只看到有改善的窗）。
//! @ai-context: 本模块纯逻辑无 IO：窗规划/基线拼接/相似度/覆盖合并全部可单测
//!              （asr_pass2_tests.rs）；解码编排与命令面在 commands_asr_pass2.rs。
//! @ai-context: dead_code 豁免——命令面接线提交后移除（先纯逻辑后系统层）。

#![allow(dead_code)]

/// 通用时间轴文本（纯函数输入，与 DB 行解耦）。
#[derive(Debug, Clone, PartialEq)]
pub struct TimedText {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// 单窗第二遍替换草稿（纯逻辑产物，落库见 db_session_refine::NewRefineDraft）。
#[derive(Debug, Clone, PartialEq)]
pub struct Pass2Proposal {
    pub start_ms: u64,
    pub end_ms: u64,
    /// 现网基线文本（窗覆盖段按时间序拼接；空=该窗原链路无内容）。
    pub base_text: String,
    /// 第二遍全窗转写文本（SenseVoice，trim 后）。
    pub refined_text: String,
    /// 基线与精修文本的内容相似度（0..1；1=逐字一致）。
    pub similarity: f32,
}

/// 跳过产草稿的相似度门限（≥门限视为"已接近离线质量"，无改善价值）。
pub const SKIP_SIMILAR_ABOVE: f32 = 0.85;
/// 覆盖主导率：原段被采纳窗覆盖 ≥ 该比例时在有效轴上被取代（防窗边重复；
/// 部分覆盖（< 比例）保留原段——宁可窗边轻微重复，不可丢内容）。
pub const DROP_COVERAGE_RATIO: f32 = 0.6;

/// 第二遍分窗（与导入链路同窗 30s + 重叠 2s——同解码口径）。
pub fn plan_windows(duration_ms: u64) -> Vec<(u64, u64)> {
    crate::import::plan_chunks_with_overlap(
        duration_ms,
        crate::import::CHUNK_WINDOW_MS,
        crate::import::CHUNK_OVERLAP_MS,
    )
}

/// 与窗口有重叠的段（按时间轴升序；用于基线拼接与覆盖判定）。
fn covered<'a>(segs: &'a [TimedText], win: (u64, u64)) -> Vec<&'a TimedText> {
    let (ws, we) = win;
    let mut v: Vec<&TimedText> = segs
        .iter()
        .filter(|s| s.start_ms < we && s.end_ms > ws)
        .collect();
    v.sort_by_key(|s| (s.start_ms, s.end_ms));
    v
}

/// 窗口基线文本：覆盖段文本按时间序单空格拼接（净化交给下游 note 链）。
pub fn window_base_text(segs: &[TimedText], win: (u64, u64)) -> String {
    covered(segs, win)
        .into_iter()
        .map(|s| s.text.trim())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// 去标点空白的内容文本（与 asr_rescore 去标点口径同源——CER/画像同口径）。
fn content_chars(s: &str) -> Vec<char> {
    crate::asr_rescore::strip_punct(s)
}

/// 内容相似度（纯函数）：去标点空白后 Levenshtein 归一化——1 - 编辑距离/较长串。
///
/// @ai-context: 现网 vs 离线两遍同源词面（同模型族）——微小标点/断句差异
///              不应算"改善"；标点不进距离，内容字编辑成本为 1。
pub fn normalized_similarity(a: &str, b: &str) -> f32 {
    let ca: String = content_chars(a).into_iter().collect();
    let cb: String = content_chars(b).into_iter().collect();
    let max = ca.chars().count().max(cb.chars().count());
    if max == 0 {
        return 1.0;
    }
    let dist = crate::asr_rescore::levenshtein(&ca, &cb);
    1.0 - dist as f32 / max as f32
}

/// 判定单窗是否产草稿（纯函数）：精修文本非空；基线文本非空时需
/// 相似度低于门限（有实质差异才值得人工裁决）。
pub fn propose_window(
    win: (u64, u64),
    refined_raw: &str,
    segs: &[TimedText],
) -> Option<Pass2Proposal> {
    let refined = refined_raw.trim().to_string();
    if refined.is_empty() {
        return None;
    }
    let base = window_base_text(segs, win);
    if base.is_empty() {
        // 窗覆盖段全空但仍产出转写 = 原链路丢内容（漏识）——值得提议恢复
        return Some(Pass2Proposal {
            start_ms: win.0,
            end_ms: win.1,
            base_text: String::new(),
            refined_text: refined,
            similarity: 0.0,
        });
    }
    let sim = normalized_similarity(&base, &refined);
    if sim >= SKIP_SIMILAR_ABOVE {
        return None;
    }
    Some(Pass2Proposal {
        start_ms: win.0,
        end_ms: win.1,
        base_text: base,
        refined_text: refined,
        similarity: sim,
    })
}

/// 合并相互重叠的采纳块（窗间 2s 重叠——同句跨窗重复文本经语义合并去重；
/// 合并失败（无文本衔接证据）退化为空格拼接，不丢内容）。
fn merge_overlapping(adopted: &[TimedText]) -> Vec<TimedText> {
    let mut sorted: Vec<TimedText> = adopted.to_vec();
    sorted.sort_by_key(|a| (a.start_ms, a.end_ms));
    let mut out: Vec<TimedText> = Vec::new();
    for cur in sorted {
        match out.last_mut() {
            Some(prev) if cur.start_ms < prev.end_ms => {
                let joined = crate::asr_merge::merge_segments_with_spacing(
                    &prev.text,
                    &cur.text,
                    0,
                )
                .unwrap_or_else(|| format!("{} {}", prev.text, cur.text));
                prev.end_ms = prev.end_ms.max(cur.end_ms);
                prev.text = joined;
            }
            _ => out.push(cur),
        }
    }
    out
}

/// 有效时间轴：原段表 + 已采纳替换窗合成（原料表不动——可逆契约）。
///
/// @ai-context: 采用"覆盖主导"取代语义：原段被任一采纳块覆盖 ≥ DROP_COVERAGE_RATIO
///              即在有效轴上让位（文本已在精修窗内重述）；部分覆盖的边段保留
///              原文，避免窗边词句丢失。返回按时间轴升序的合成文本。
pub fn effective_segments(segs: &[TimedText], adopted: &[TimedText]) -> Vec<TimedText> {
    if adopted.is_empty() {
        return segs.to_vec();
    }
    let blocks = merge_overlapping(adopted);
    let mut out: Vec<TimedText> = Vec::new();
    for b in &blocks {
        out.push(b.clone());
    }
    for s in segs {
        let len = (s.end_ms.saturating_sub(s.start_ms)) as f32;
        let covered_len: u64 = blocks
            .iter()
            .map(|b| {
                let ov = b.end_ms.min(s.end_ms).saturating_sub(b.start_ms.max(s.start_ms));
                ov
            })
            .sum();
        if len > 0.0 && covered_len as f32 / len >= DROP_COVERAGE_RATIO {
            continue;
        }
        out.push(s.clone());
    }
    out.sort_by_key(|t| (t.start_ms, t.end_ms));
    out
}

/// 已采纳块（窗口级）→ 段表副本合成（原料 session_segments 不动——可逆契约）。
///
/// @ai-context: 与 effective_segments 同覆盖语义（≥ DROP_COVERAGE_RATIO 让位），
///              但保留 SessionSegment 行结构（id 供 note_filter 去重/时间锚点）：
///              让位原段按其主导块归属；合成行 id = 其覆盖原段最小 id
///              （时间锚点仍指向窗内首段），无覆盖原段（纯插入）→ 负 id 占位
///              （与真实正 id 不冲突；note_filter 仅要求段内唯一）。
pub fn overlay_segments(
    segs: &[crate::types::SessionSegment],
    adopted: &[(u64, u64, String)],
) -> Vec<crate::types::SessionSegment> {
    use crate::types::SessionSegment;
    if adopted.is_empty() {
        return segs.to_vec();
    }
    let adopted_timed: Vec<TimedText> = adopted
        .iter()
        .map(|(s, e, t)| TimedText { start_ms: *s, end_ms: *e, text: t.clone() })
        .collect();
    let blocks = merge_overlapping(&adopted_timed);
    // 第一遍：判定每块主导覆盖的原段（让位集合），随后按块分配合成行 id
    let mut dropped_by_block: Vec<Vec<i64>> = vec![Vec::new(); blocks.len()];
    let mut drop_flags: Vec<bool> = vec![false; segs.len()];
    for (bi, b) in blocks.iter().enumerate() {
        for (si, s) in segs.iter().enumerate() {
            let len = s.end_ms.saturating_sub(s.start_ms) as f32;
            let ov = b.end_ms.min(s.end_ms).saturating_sub(b.start_ms.max(s.start_ms)) as f32;
            if len > 0.0 && ov / len >= DROP_COVERAGE_RATIO {
                dropped_by_block[bi].push(s.id);
                drop_flags[si] = true;
            }
        }
    }
    let mut out: Vec<SessionSegment> = Vec::new();
    for (bi, b) in blocks.iter().enumerate() {
        let id = dropped_by_block[bi].iter().copied().min().unwrap_or_else(|| -(bi as i64 + 1));
        out.push(SessionSegment {
            id,
            session_id: segs.first().map(|s| s.session_id).unwrap_or(0),
            start_ms: b.start_ms,
            end_ms: b.end_ms,
            text: b.text.clone(),
            // 来源标记与 db_session_refine::SOURCE_ASR_PASS2 同值（避免纯层依赖
            // DB 模块；双处同串——db 侧为唯一权威常量）
            source: "asr_pass2".to_string(),
            confidence: None,
            volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None,
        });
    }
    for (si, s) in segs.iter().enumerate() {
        if !drop_flags[si] {
            out.push(s.clone());
        }
    }
    out.sort_by_key(|x| (x.start_ms, x.id));
    out
}

#[cfg(test)]
#[path = "asr_pass2_tests.rs"]
mod tests;