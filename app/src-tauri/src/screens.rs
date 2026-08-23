//! 画面要点屏构建（v0.7.3 REQ-155/156/160，ADR-015；v0.7.5 OCR 净化）。
//!
//! @ai-context: 把会话 OCR 块流组织为屏卡（SessionScreen）：① 有 screen_id 的
//!              新数据按屏号分组（采集时分配）；② 旧数据（screen_id=NULL）走
//!              cluster_blocks_into_screens 聚类兜底（ADR-015 决策 2）；③ 屏内
//!              行合并 + 版面角色（复用 screen_merge 纯函数，单管线双出口）；
//!              ④ 结构块（region_kind=table/formula/code）独立成 ScreenStructure
//!              （rendered 由 M5 精修接线填充）；⑤ image_ref 匹配归档 full 图。
//! @ai-context: v0.7.5（REQ-166/167/169）：可消费块过滤扩展——单字符碎片
//!              丢弃（非结构上下文）、边缘条带 bbox 黑名单、视频页 UI 共现
//!              判定（作者名/图标垃圾）、OCR 错字纠错（种子+转写共现）；
//!              屏构建后零跨度修复 + 重复图去重（纯函数在 screen_merge.rs）。
//! @ai-context: 本模块含文件系统读取（图匹配）——聚合/去重逻辑仍为纯函数
//!              （screen_merge.rs），本层只做编排与 IO。

use std::collections::BTreeMap;
use std::path::Path;

use crate::purify_config::PurifyConfig;
use crate::screen_merge::{
    classify_roles, cluster_blocks_into_screens, dedupe_screen_images, infer_frame_dims,
    is_edge_strip, is_single_char_noise, line_merge, merge_zero_span_screens, ScreenBlockInput,
    ScreenCluster, CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD,
};
use crate::types::{ScreenStructure, SessionOcrBlock, SessionScreen};
use crate::ui_junk::{JunkCategory, UiJunkList};
use crate::watermark_filter::{
    detect_watermarks, region_key_from_bbox, WatermarkConfig, WatermarkInput,
};

/// 结构区域类型（region_kind 命中即结构块——不参与行合并）。
const STRUCTURE_KINDS: &[&str] = &["table", "formula", "code"];

/// 构建会话屏卡（编排 + 图匹配 IO）：OCR 块 → 屏序列（按 first_seen 升序）。
///
/// @ai-context: 只消费 region=full 的块（字幕区文本是转写冗余，独立管线）；
///              空文本块跳过（聚类纯函数内部同样防御）。
/// @ai-context: 原料口径——不过滤低分/UI 垃圾（原料视图可复查，过滤在消费端
///              filter_usable_blocks 按屏执行）；旧数据聚类兜底零回归。
/// @ai-context: v0.7.5（REQ-169）：屏构建后零跨度修复（截断子集屏并入相邻屏）
///              ——消费端与详情端同口径（单管线双出口）。
pub fn build_screens(blocks: &[SessionOcrBlock], images_dir: Option<&Path>) -> Vec<SessionScreen> {
    let session_id = blocks.first().map(|b| b.session_id).unwrap_or(0);
    let mut screens = build_screens_inner(session_id, blocks);
    // REQ-169：零跨度屏修复（first=last 并入相邻屏——条件见 screen_merge）
    screens = merge_zero_span_screens(screens);
    if let Some(dir) = images_dir {
        attach_images(&mut screens, dir);
    }
    screens
}

/// 关键帧纯图屏（v0.12.0 M5 补完成）：视频会话画面要点 = 关键帧纯图。
///
/// @ai-context: 视频会话不再识别画面要点（ADR-023）——无 full OCR 块可聚屏；
///              画面要点以归档 full 图直接成屏（一张图 = 一张屏卡；无标题/
///              正文/标签/结构）。真实画面要点经 vision-exp 精修提取，原料层
///              纯图存证。屏卡区间 = 图时间戳（与参考图集同一数据源）。
pub fn build_keyframe_screens(session_id: i64, images_dir: Option<&Path>) -> Vec<SessionScreen> {
    let Some(dir) = images_dir else { return Vec::new() };
    list_full_image_timestamps(dir)
        .into_iter()
        .map(|ts| SessionScreen {
            session_id,
            screen_id: None,
            first_seen_ms: ts,
            last_seen_ms: ts,
            title: None,
            body: Vec::new(),
            labels: Vec::new(),
            image_ref: Some(format!("full/{}.webp", ts)),
            structure: Vec::new(),
        })
        .collect()
}

/// 画面要点屏构建入口（按会话类型分派）：photo=OCR 文本屏（图文采集正文即
/// OCR——不变）；video（kind≠photo）=关键帧纯图屏。
///
/// @ai-context: v0.12.0 M5 补完成：视频会话画面要点 = 纯图片（无 OCR 文字）——
///              原料视图/笔记预览/框选截取共用同一分派，单点定义避免各出口漂移。
pub fn build_view_screens(
    kind: Option<&str>,
    session_id: i64,
    blocks: &[SessionOcrBlock],
    images_dir: Option<&Path>,
) -> Vec<SessionScreen> {
    if kind == Some("photo") {
        build_screens(blocks, images_dir)
    } else {
        build_keyframe_screens(session_id, images_dir)
    }
}

/// 可消费块过滤（v0.7.5 扩展）：低分/空文本/UI 垃圾/水印 + 单字符/边缘条带/
/// 视频页共现/错字纠错 → 净化的可消费块 + 纠错块数。
///
/// @ai-context: 与 note_filter 消费口径一致（REQ-083 黑名单 + REQ-059 水印 +
///              低分）——过滤后屏卡即笔记画面要点（双保险：源头已过滤的新数据
///              走同口径，旧数据兜底过滤）。
/// @ai-context: transcript 为净化后转写全文——OCR 错字纠错（REQ-168：正确词
///              在讲述中共现才纠）与视频页共现判定（作者名类短块保护）共用。
/// @ai-context: corrections 为纠错表（AppState 装配：内置种子 + JSON 校准）。
/// @ai-context: 返回 (块, 纠错块数)——REQ-171 purify_stats.ocr_corrected 数据源。
pub fn filter_usable_blocks(
    blocks: &[SessionOcrBlock],
    ui_junk: &UiJunkList,
    config: &PurifyConfig,
    transcript: &str,
    corrections: &crate::ocr_correction::OcrCorrectionTable,
) -> (Vec<SessionOcrBlock>, usize) {
    // ① 帧分组（块按时间有序——同 ts 连续分组成立）+ 帧尺寸推断（bbox 归一化
    //    网格区域键需要帧坐标系；同帧内容包围盒外扩近似——DB 不落帧宽高）
    let mut by_frame: Vec<(u64, Vec<&SessionOcrBlock>)> = Vec::new();
    for b in blocks {
        match by_frame.last_mut() {
            Some((ts, members)) if *ts == b.timestamp_ms => members.push(b),
            _ => by_frame.push((b.timestamp_ms, vec![b])),
        }
    }
    let frame_dims: BTreeMap<u64, (f32, f32)> = by_frame
        .iter()
        .filter_map(|(ts, members)| infer_frame_dims(&to_inputs(members)).map(|d| (*ts, d)))
        .collect();
    // 水印输入（A 层：bbox → 4x4 归一化网格区域键；无 bbox/帧尺寸 → None 降级
    // 为全局文本判定——与 v0.11.5 前行为一致）
    let inputs: Vec<WatermarkInput> = blocks
        .iter()
        .filter(|b| b.region == "full")
        .map(|b| WatermarkInput {
            text: b.text.clone(),
            timestamp_ms: b.timestamp_ms,
            region_key: b.bbox.and_then(|bb| {
                frame_dims.get(&b.timestamp_ms).and_then(|(fw, fh)| {
                    region_key_from_bbox(bb.x, bb.y, bb.w, bb.h, *fw, *fh)
                })
            }),
        })
        .collect();
    let watermarks = detect_watermarks(&inputs, &WatermarkConfig::default());
    // ② 基础过滤（低分/空文本/UI 垃圾/水印/单字符/边缘条带）——同帧批量判定
    //    边缘条带需要帧尺寸（同帧块分布推断——DB 不落帧宽高）
    let mut junk_hits: Vec<(u64, usize)> = Vec::new(); // 帧 → VideoPageUi 命中数
    for (ts, members) in &by_frame {
        let hits = members
            .iter()
            .filter(|b| ui_junk.classify(&b.text) == Some(JunkCategory::VideoPageUi))
            .count();
        junk_hits.push((*ts, hits));
    }
    let frame_junk_of = |ts: u64| junk_hits.iter().find(|(t, _)| *t == ts).map(|(_, n)| *n).unwrap_or(0);
    let mut corrected = 0usize;
    let mut out: Vec<SessionOcrBlock> = Vec::new();
    for (_, members) in &by_frame {
        let dims = infer_frame_dims(&to_inputs(members));
        let texts: Vec<String> = members.iter().map(|b| b.text.clone()).collect();
        for b in members {
            if b.region != "full" {
                continue;
            }
            let raw = b.text.trim();
            if raw.is_empty() || b.score < config.min_block_score {
                continue;
            }
            if ui_junk.is_junk(raw) || watermarks.texts.iter().any(|w| raw == w) {
                continue;
            }
            if config.single_char_drop && is_single_char_noise(raw, b.region_kind.as_deref()) {
                continue;
            }
            if let (Some(bb), Some((fw, fh))) = (b.bbox, dims) {
                if is_edge_strip(
                    bb,
                    fw,
                    fh,
                    config.edge_strip_top_ratio,
                    config.edge_strip_bottom_ratio,
                    config.edge_strip_side_ratio,
                ) {
                    continue;
                }
            }
            let mut text = raw.to_string();
            if config.ocr_correct {
                let c = corrections.correct(&text, transcript);
                if c != text {
                    corrected += 1;
                }
                text = c;
            }
            // ② 视频页 UI 共现判定（REQ-166）：帧内 VideoPageUi 命中 ≥N 且本块
            //    标签形（≤6 字纯 CJK 无虚词）且不在讲述中共现且非同帧长块子串
            //    ——作者名/图标垃圾（清晖加油站/若凡娃娃 类，无法枚举黑名单）
            if config.frame_junk_min_hits > 0
                && frame_junk_of(b.timestamp_ms) >= config.frame_junk_min_hits
                && is_label_shaped(&text)
                && !transcript.contains(&text)
                && !texts.iter().any(|t| t != &text && t.contains(&text))
            {
                continue;
            }
            let mut kept = (*b).clone();
            kept.text = text;
            out.push(kept);
        }
    }
    (out, corrected)
}

/// 同帧块 → 聚合输入（帧尺寸推断/包含判定用）。
fn to_inputs(blocks: &[&SessionOcrBlock]) -> Vec<ScreenBlockInput> {
    blocks.iter().map(|b| to_input(b)).collect()
}

/// 标签形判定（纯函数）：≤6 字、纯 CJK、无虚词——视频页共现规则的丢弃候选。
///
/// @ai-context: 复用 screen_merge::is_label（图注短词启发式）并加严：含标点/
///              数字/ASCII 的块不判标签形（"客户地址：" 带冒号受保护——
///              表单字段是真实内容，见会话31 画面4）。
fn is_label_shaped(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() || t.chars().count() > crate::screen_merge::LABEL_MAX_CHARS {
        return false;
    }
    if !t.chars().all(is_cjk) {
        return false;
    }
    crate::screen_merge::is_label(t)
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 图匹配（IO）：为屏卡填充 image_ref（最近 ≤ 首见时刻的归档 full 图）。
///
/// @ai-context: 归档图按时间戳命名（full/{ts}.webp，image_store 约定）；目录
///              缺失/无图 → 保持 None（前端无缩略图降级，不阻断）。
/// @ai-context: 审查修复（2026-08-20）：目录**一次扫描**建时间戳映射（原实现
///              每屏一次 read_dir——N 屏 = N 次目录遍历，会话多屏时浪费 IO）。
/// @ai-context: v0.7.5（REQ-169）：匹配后按图去重——相同图只留首个屏引用
///              （归档图按内容指纹去重存储，同文件=同画面；多屏匹配同图是
///              屏间未实际变化的证据，重复引用只增噪不减信息）。
pub fn attach_images(screens: &mut [SessionScreen], images_dir: &Path) {
    if screens.is_empty() {
        return;
    }
    let ts_list = list_full_image_timestamps(images_dir);
    if ts_list.is_empty() {
        return;
    }
    for s in screens.iter_mut() {
        if s.image_ref.is_none() {
            s.image_ref = match_timestamp(&ts_list, s.first_seen_ms);
        }
    }
    dedupe_screen_images(screens);
}

/// 归档 full 图时间戳列表（纯 IO，一次扫描）。
/// @ai-context: pub(crate)（v0.7.7 REQ-182）：structure_capture 批量捕获复用
///              （屏时间窗帧候选——同一目录扫描约定，避免重复实现）。
pub(crate) fn list_full_image_timestamps(images_dir: &Path) -> Vec<u64> {
    let entries = std::fs::read_dir(images_dir.join("full")).ok();
    let mut ts: Vec<u64> = entries
        .into_iter()
        .flatten()
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
    ts.sort_unstable();
    ts
}

/// 时间戳匹配（纯函数）：取 ≤ 目标的最近者；无则取最早者（None=空列表）。
fn match_timestamp(sorted: &[u64], target: u64) -> Option<String> {
    let ts = sorted
        .iter()
        .rev()
        .find(|&&t| t <= target)
        .copied()
        .or_else(|| sorted.first().copied())?;
    Some(format!("full/{}.webp", ts))
}

/// 屏构建核心（纯编排，无 IO）：块流 → 屏序列。
fn build_screens_inner(session_id: i64, blocks: &[SessionOcrBlock]) -> Vec<SessionScreen> {
    let full: Vec<&SessionOcrBlock> =
        blocks.iter().filter(|b| b.region == "full" && !b.text.trim().is_empty()).collect();
    if full.is_empty() {
        return Vec::new();
    }
    // ① 有 screen_id 的新数据按屏号分组（同屏块时间连续落库——连续分组成立：
    //    在线 ScreenTracker 屏号单调递增，同一屏号绝不跨屏段出现；非连续同号
    //    仅可能来自外部写入（防御不变量注释，遇破坏时按独立屏处理不崩溃）；
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

/// 屏结构产物匹配（纯函数）：课后精修产物 → 屏 structure.rendered 填充。
///
/// @ai-context: 消费 artifact_blocks（kind=Table/Formula，REQ-049/050 精修产物）——
///              屏卡内结构块渲染 Markdown 表格/LaTeX；匹配 = 产物 refs.frame_ms
///              落在屏区间内（区域裁剪时刻即屏成员时刻）；未命中 → 保留原始
///              OCR 文本（徽标降级）；产物缺失 → 无操作（不阻断，M5 接线）。
pub fn refine_screen_structures(
    screens: &mut [SessionScreen],
    artifact: Option<&crate::artifact::SessionArtifact>,
) {
    let Some(art) = artifact else { return };
    for s in screens.iter_mut() {
        for st in s.structure.iter_mut() {
            if st.rendered.is_some() {
                continue;
            }
            let want = match st.kind.as_str() {
                "table" => crate::artifact::ArtifactKind::Table,
                "formula" => crate::artifact::ArtifactKind::Formula,
                _ => continue, // code 区域无精修产物（原生文本展示）
            };
            let rendered = art
                .blocks
                .iter()
                .find(|b| {
                    b.kind == want
                        && b.refs.frame_ms.is_some_and(|f| {
                            f >= s.first_seen_ms && f <= s.last_seen_ms
                        })
                })
                .and_then(|b| match &b.payload {
                    crate::artifact::BlockPayload::Table(t) => Some(t.markdown.clone()),
                    crate::artifact::BlockPayload::Formula(f) => {
                        Some(format!("$${}$$", f.latex))
                    }
                    _ => None,
                });
            if let Some(r) = rendered {
                st.rendered = Some(r);
            }
        }
    }
}

#[cfg(test)]
#[path = "screens_tests.rs"]
mod tests;
