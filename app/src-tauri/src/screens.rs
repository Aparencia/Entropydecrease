//! 画面要点屏构建（v0.7.3 REQ-155/156/160，ADR-015）。
//!
//! @ai-context: 把会话 OCR 块流组织为屏卡（SessionScreen）：① 有 screen_id 的
//!              新数据按屏号分组（采集时分配）；② 旧数据（screen_id=NULL）走
//!              cluster_blocks_into_screens 聚类兜底（ADR-015 决策 2）；③ 屏内
//!              行合并 + 版面角色（复用 screen_merge 纯函数，单管线双出口）；
//!              ④ 结构块（region_kind=table/formula/code）独立成 ScreenStructure
//!              （rendered 由 M5 精修接线填充）；⑤ image_ref 匹配归档 full 图。
//! @ai-context: 本模块含文件系统读取（图匹配）——聚合/去重逻辑仍为纯函数
//!              （screen_merge.rs），本层只做编排与 IO。

use std::path::Path;

use crate::screen_merge::{
    classify_roles, cluster_blocks_into_screens, line_merge, ScreenBlockInput, ScreenCluster,
    CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD,
};
use crate::types::{ScreenStructure, SessionOcrBlock, SessionScreen};
use crate::ui_junk::UiJunkList;
use crate::watermark_filter::{detect_watermarks, WatermarkConfig, WatermarkInput};

/// 结构区域类型（region_kind 命中即结构块——不参与行合并）。
const STRUCTURE_KINDS: &[&str] = &["table", "formula", "code"];
/// 屏构建的最低块分（与 note_filter 消费口径一致——低于视为噪声）。
const MIN_BLOCK_SCORE: f32 = 0.5;

/// 构建会话屏卡（编排 + 图匹配 IO）：OCR 块 → 屏序列（按 first_seen 升序）。
///
/// @ai-context: 只消费 region=full 的块（字幕区文本是转写冗余，独立管线）；
///              空文本块跳过（聚类纯函数内部同样防御）。
/// @ai-context: 原料口径——不过滤低分/UI 垃圾（原料视图可复查，过滤在消费端
///              filter_usable_blocks 按屏执行）；旧数据聚类兜底零回归。
pub fn build_screens(blocks: &[SessionOcrBlock], images_dir: Option<&Path>) -> Vec<SessionScreen> {
    let session_id = blocks.first().map(|b| b.session_id).unwrap_or(0);
    let mut screens = build_screens_inner(session_id, blocks);
    if let Some(dir) = images_dir {
        attach_images(&mut screens, dir);
    }
    screens
}

/// 可消费块过滤（纯函数）：低分/空文本/UI 垃圾/水印排除。
///
/// @ai-context: 与 note_filter 消费口径一致（REQ-083 黑名单 + REQ-059 水印 +
///              低分）——过滤后屏卡即笔记画面要点（双保险：源头已过滤的新数据
///              走同口径，旧数据兜底过滤）。
pub fn filter_usable_blocks(blocks: &[SessionOcrBlock], ui_junk: &UiJunkList) -> Vec<SessionOcrBlock> {
    let inputs: Vec<WatermarkInput> = blocks
        .iter()
        .filter(|b| b.region == "full")
        .map(|b| WatermarkInput {
            text: b.text.clone(),
            timestamp_ms: b.timestamp_ms,
            region_key: None,
        })
        .collect();
    let watermarks = detect_watermarks(&inputs, &WatermarkConfig::default());
    blocks
        .iter()
        .filter(|b| {
            b.region == "full"
                && b.score >= MIN_BLOCK_SCORE
                && !b.text.trim().is_empty()
                && !ui_junk.is_junk(&b.text)
                && !watermarks.texts.iter().any(|w| b.text.trim() == w)
        })
        .cloned()
        .collect()
}

/// 图匹配（IO）：为屏卡填充 image_ref（最近 ≤ 首见时刻的归档 full 图）。
///
/// @ai-context: 归档图按时间戳命名（full/{ts}.webp，image_store 约定）；目录
///              缺失/无图 → 保持 None（前端无缩略图降级，不阻断）。
pub fn attach_images(screens: &mut [SessionScreen], images_dir: &Path) {
    for s in screens.iter_mut() {
        if s.image_ref.is_none() {
            s.image_ref = match_image(images_dir, s.first_seen_ms);
        }
    }
}

/// 屏构建核心（纯编排，无 IO）：块流 → 屏序列。
fn build_screens_inner(session_id: i64, blocks: &[SessionOcrBlock]) -> Vec<SessionScreen> {
    let full: Vec<&SessionOcrBlock> =
        blocks.iter().filter(|b| b.region == "full" && !b.text.trim().is_empty()).collect();
    if full.is_empty() {
        return Vec::new();
    }
    // ① 有 screen_id 的新数据按屏号分组（同屏块时间连续落库——连续分组成立）；
    //    无 screen_id 的旧数据单独聚类兜底
    let mut clusters: Vec<(Option<i64>, ScreenCluster)> = Vec::new();
    let mut grouped: Vec<(i64, Vec<&SessionOcrBlock>)> = Vec::new();
    let mut unscreened: Vec<ScreenBlockInput> = Vec::new();
    for b in &full {
        match b.screen_id {
            Some(sid) => match grouped.last_mut() {
                Some((last_sid, members)) if *last_sid == sid => members.push(b),
                _ => grouped.push((sid, vec![b])),
            },
            None => unscreened.push(to_input(b)),
        }
    }
    for (sid, members) in grouped {
        clusters.push((Some(sid), to_cluster(&members)));
    }
    if !unscreened.is_empty() {
        for c in cluster_blocks_into_screens(&unscreened, CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD) {
            clusters.push((None, c));
        }
    }
    // ② 聚类 → 屏卡（行合并 + 角色 + 结构块）
    let mut screens: Vec<SessionScreen> = clusters
        .into_iter()
        .map(|(screen_id, c)| screen_from_cluster(session_id, screen_id, &c))
        .collect();
    screens.sort_by_key(|s| s.first_seen_ms);
    screens
}

/// 成员块 → ScreenCluster（保持时间序；首/尾时间戳由成员推导）。
fn to_cluster(members: &[&SessionOcrBlock]) -> ScreenCluster {
    let first = members.first().expect("屏成员非空（调用方保证）");
    let last = members.last().expect("屏成员非空（调用方保证）");
    ScreenCluster {
        first_seen_ms: first.timestamp_ms,
        last_seen_ms: last.timestamp_ms,
        blocks: members.iter().map(|b| to_input(b)).collect(),
    }
}

/// 会话 OCR 块 → 屏聚合输入块（契约映射）。
fn to_input(b: &SessionOcrBlock) -> ScreenBlockInput {
    ScreenBlockInput {
        timestamp_ms: b.timestamp_ms,
        text: b.text.clone(),
        score: b.score,
        region_kind: b.region_kind.clone(),
        bbox: b.bbox,
    }
}

/// 聚类 → SessionScreen（行合并 + 版面角色 + 结构块提取）。
fn screen_from_cluster(
    session_id: i64,
    screen_id: Option<i64>,
    cluster: &ScreenCluster,
) -> SessionScreen {
    let (structure, text_blocks): (Vec<&ScreenBlockInput>, Vec<&ScreenBlockInput>) =
        cluster.blocks.iter().partition(|b| {
            b.region_kind
                .as_deref()
                .is_some_and(|k| STRUCTURE_KINDS.contains(&k))
        });
    let structure: Vec<ScreenStructure> = structure
        .into_iter()
        .map(|b| ScreenStructure { kind: b.region_kind.clone().unwrap_or_default(), text: b.text.clone(), rendered: None })
        .collect();
    // 跨帧位置去重（同屏多帧重复识别同位置内容——防 line_merge 误拼）
    let text_blocks: Vec<ScreenBlockInput> = text_blocks.into_iter().cloned().collect();
    let text_blocks = crate::screen_merge::dedupe_blocks(&text_blocks);
    let lines = line_merge(&text_blocks);
    let roles = classify_roles(&lines);
    SessionScreen {
        session_id,
        screen_id,
        first_seen_ms: cluster.first_seen_ms,
        last_seen_ms: cluster.last_seen_ms,
        title: roles.title,
        body: roles.body,
        labels: roles.labels,
        image_ref: None,
        structure,
    }
}

/// 匹配归档 full 图（纯 IO）：取时间戳 ≤ 屏首见时刻的最近图；无则取最早图。
///
/// @ai-context: 归档图按时间戳命名（full/{ts}.webp，image_store 约定）；屏首帧
///              时刻附近必有归档（新文本+2s 防抖存档）——"最近 ≤"即该屏配图。
/// @ai-context: 目录缺失/无图 → None（前端不展示缩略图，不阻断）。
fn match_image(images_dir: &Path, first_seen_ms: u64) -> Option<String> {
    let entries = std::fs::read_dir(images_dir.join("full")).ok()?;
    let mut candidates: Vec<u64> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x == "webp"))
        .filter_map(|e| {
            e.file_name()
                .to_string_lossy()
                .trim_end_matches(".webp")
                .parse::<u64>()
                .ok()
        })
        .collect();
    candidates.sort_unstable();
    let ts = candidates
        .iter()
        .rev()
        .find(|&&t| t <= first_seen_ms)
        .copied()
        .or_else(|| candidates.first().copied())?;
    Some(format!("full/{}.webp", ts))
}

#[cfg(test)]
#[path = "screens_tests.rs"]
mod tests;
