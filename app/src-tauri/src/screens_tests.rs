//! screens 屏构建单测（v0.7.3 REQ-155/156，ADR-015）。
//!
//! @ai-context: 覆盖分组/聚类双路径、结构块提取、图匹配；IO 用临时目录隔离。

use std::fs;

use crate::screens::{build_screens, refine_screen_structures};
use crate::types::{SessionOcrBlock, TextBox};

/// 测试辅助：构造会话 OCR 块（region=full，可带 bbox/screen_id/region_kind）。
fn blk(
    id: i64,
    ts: u64,
    text: &str,
    screen_id: Option<i64>,
    bbox: Option<(f32, f32, f32, f32)>,
    region_kind: Option<&str>,
) -> SessionOcrBlock {
    SessionOcrBlock {
        id,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score: 0.95,
        region: "full".to_string(),
        region_kind: region_kind.map(String::from),
        bbox: bbox.map(|(x, y, w, h)| TextBox { x, y, w, h }),
        screen_id,
    }
}

fn tmp_images_dir(tag: &str, files: &[u64]) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("entropy-screens-{}-{}", tag, std::process::id()));
    let full = dir.join("full");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&full).unwrap();
    for ts in files {
        fs::write(full.join(format!("{}.webp", ts)), b"img").unwrap();
    }
    dir
}

#[test]
fn build_screens_groups_by_screen_id() {
    // Arrange：两屏（各 2 帧）；标题/正文/标签块带 bbox；屏间无图目录
    let dir = tmp_images_dir("group", &[]);
    let blocks = vec![
        blk(1, 2_000, "为什么高手管理者思路特别清晰？", Some(1), Some((100.0, 100.0, 600.0, 50.0)), None),
        blk(2, 2_000, "系统思维", Some(1), Some((100.0, 170.0, 200.0, 36.0)), None),
        blk(3, 2_000, "一般系统思创始人贝塔郎非认为：系统是由相互联系的若干要素组成的整体。", Some(1), Some((100.0, 240.0, 700.0, 30.0)), None),
        blk(4, 2_000, "要素", Some(1), Some((100.0, 700.0, 80.0, 26.0)), None),
        blk(5, 30_000, "为什么高手管", Some(1), Some((100.0, 100.0, 300.0, 50.0)), None),
        blk(6, 30_000, "系统思维", Some(1), Some((100.0, 170.0, 200.0, 36.0)), None),
        blk(7, 60_000, "牛顿第一定律", Some(2), Some((100.0, 100.0, 400.0, 50.0)), None),
        blk(8, 60_000, "苹果为什么往下掉", Some(2), Some((100.0, 240.0, 300.0, 30.0)), None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：2 屏；屏1 区间 2000-30000、标题为字高最大者、标签含"要素"
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].screen_id, Some(1));
    assert_eq!(screens[0].first_seen_ms, 2_000);
    assert_eq!(screens[0].last_seen_ms, 30_000);
    assert_eq!(screens[0].title.as_deref(), Some("为什么高手管理者思路特别清晰？"));
    assert!(screens[0].labels.iter().any(|l| l == "要素"));
    assert_eq!(screens[1].screen_id, Some(2));
    assert_eq!(screens[1].first_seen_ms, 60_000);
}

#[test]
fn build_screens_clusters_legacy_blocks() {
    // Arrange：旧数据（无 screen_id）——同屏截断变体 + 翻页
    let dir = tmp_images_dir("legacy", &[]);
    let blocks = vec![
        blk(1, 2_000, "为什么高手管理者思路特别清晰？", None, None, None),
        blk(2, 2_000, "系统思维", None, None, None),
        blk(3, 30_000, "为什么高手管", None, None, None),
        blk(4, 30_000, "系统思维", None, None, None),
        blk(5, 60_000, "牛顿第一定律", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：屏1（变体合并）+ 屏2（翻页）；屏1 无标题（无 bbox 诚实降级）
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].screen_id, None);
    assert_eq!(screens[0].first_seen_ms, 2_000);
    assert_eq!(screens[0].last_seen_ms, 30_000);
    assert_eq!(screens[0].title, None);
    assert!(screens[0].body.iter().any(|b| b == "系统思维"));
    assert_eq!(screens[1].first_seen_ms, 60_000);
}

#[test]
fn build_screens_mixed_old_and_new() {
    // Arrange：屏1 新数据（screen_id=1）+ 屏2 旧数据（NULL）混杂
    let dir = tmp_images_dir("mixed", &[]);
    let blocks = vec![
        blk(1, 2_000, "新屏内容A", Some(1), Some((100.0, 100.0, 300.0, 40.0)), None),
        blk(2, 60_000, "旧屏内容B", None, None, None),
        blk(3, 65_000, "旧屏内容C", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：两条路径都出屏（2 屏）
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].screen_id, Some(1));
    assert_eq!(screens[1].screen_id, None);
}

#[test]
fn build_screens_structure_blocks_excluded_from_text() {
    // Arrange：表格区域块（region_kind=table）+ 正文
    let dir = tmp_images_dir("struct", &[]);
    let blocks = vec![
        blk(1, 2_000, "表格标题", Some(1), Some((100.0, 100.0, 300.0, 40.0)), None),
        blk(2, 2_000, "| A | B |", Some(1), Some((100.0, 200.0, 300.0, 60.0)), Some("table")),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：结构块进 structure 不进 body；rendered=None（M5 精修前）
    assert_eq!(screens.len(), 1);
    assert_eq!(screens[0].structure.len(), 1);
    assert_eq!(screens[0].structure[0].kind, "table");
    assert_eq!(screens[0].structure[0].rendered, None);
    assert!(!screens[0].body.iter().any(|b| b.contains("| A |")));
}

#[test]
fn build_screens_empty_and_no_full_blocks() {
    // Arrange：空输入 + 只有字幕区块
    let dir = tmp_images_dir("empty", &[]);
    let subtitle_only = vec![SessionOcrBlock {
        id: 1,
        session_id: 1,
        timestamp_ms: 1_000,
        text: "字幕内容".to_string(),
        score: 0.9,
        region: "subtitle".to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }];
    // Act/Assert
    assert!(build_screens(&[], Some(&dir)).is_empty());
    assert!(build_screens(&subtitle_only, Some(&dir)).is_empty());
}

#[test]
fn refine_structures_from_artifact() {
    // Arrange：屏内 table/formula 结构块 + 课后精修产物（frame_ms 在屏区间内）
    use crate::artifact::{ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource, SessionArtifact};
    use crate::table_reconstruct::TableBlock;
    let dir = tmp_images_dir("refine", &[]);
    let blocks = vec![
        blk(1, 2_000, "表格标题", Some(1), Some((100.0, 100.0, 300.0, 40.0)), None),
        blk(2, 2_000, "| A | B |", Some(1), Some((100.0, 200.0, 300.0, 60.0)), Some("table")),
        blk(3, 2_000, "x^2+1", Some(1), Some((100.0, 300.0, 200.0, 40.0)), Some("formula")),
    ];
    let mut screens = build_screens(&blocks, Some(&dir));
    let artifact = SessionArtifact {
        session_id: 1,
        profile: String::new(),
        blocks: vec![
            ArtifactBlock {
                id: 1,
                kind: ArtifactKind::Table,
                refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(2_000) },
                payload: BlockPayload::Table(TableBlock {
                    markdown: "| A | B |\n|---|---|\n| 1 | 2 |".to_string(),
                    structure_confidence: 0.9,
                    cell_refs: Vec::new(),
                }),
                order: 0,
                source: BlockSource::Local,
            },
            ArtifactBlock {
                id: 2,
                kind: ArtifactKind::Formula,
                refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(2_000) },
                payload: BlockPayload::Formula(crate::formula_reconstruct::FormulaBlock {
                    latex: "x^2+1".to_string(),
                    source_text: "x2+1".to_string(),
                    confidence: 0.8,
                }),
                order: 1,
                source: BlockSource::Local,
            },
        ],
    };
    // Act
    refine_screen_structures(&mut screens, Some(&artifact));
    // Assert：表格/公式 rendered 填充
    let s = &screens[0];
    let table = s.structure.iter().find(|st| st.kind == "table").unwrap();
    assert_eq!(table.rendered.as_deref(), Some("| A | B |\n|---|---|\n| 1 | 2 |"));
    let formula = s.structure.iter().find(|st| st.kind == "formula").unwrap();
    assert_eq!(formula.rendered.as_deref(), Some("$$x^2+1$$"));
}

#[test]
fn refine_structures_none_without_artifact() {
    // Arrange：无产物 + 屏结构块
    let dir = tmp_images_dir("refine-none", &[]);
    let blocks = vec![blk(1, 2_000, "| A |", Some(1), Some((100.0, 200.0, 300.0, 60.0)), Some("table"))];
    let mut screens = build_screens(&blocks, Some(&dir));
    // Act：None 产物 → 无操作（rendered 保持 None）
    refine_screen_structures(&mut screens, None);
    // Assert
    assert_eq!(screens[0].structure[0].rendered, None);
}

#[test]
fn image_ref_matches_nearest_at_or_before_first_seen() {
    // Arrange：归档图 2000/10000/30000；屏 first_seen=36404 → 最近 ≤ 为 30000
    let dir = tmp_images_dir("img", &[2_000, 10_000, 30_000]);
    let blocks = vec![blk(1, 36_404, "内容", Some(1), Some((100.0, 100.0, 200.0, 40.0)), None)];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert
    assert_eq!(screens[0].image_ref.as_deref(), Some("full/30000.webp"));
}

#[test]
fn image_ref_none_without_dir() {
    // Arrange：无图目录（路径不存在）
    let dir = std::env::temp_dir().join(format!("entropy-screens-missing-{}", std::process::id()));
    let blocks = vec![blk(1, 1_000, "内容", Some(1), Some((100.0, 100.0, 200.0, 40.0)), None)];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：图匹配失败不阻断屏构建
    assert_eq!(screens.len(), 1);
    assert_eq!(screens[0].image_ref, None);
}

// ────────────────────────────────────────────────
// v0.7.5（REQ-166/167/169）：OCR 净化与屏修复
// ────────────────────────────────────────────────

fn pcfg() -> crate::purify_config::PurifyConfig {
    crate::purify_config::PurifyConfig::default()
}

fn corrections() -> crate::ocr_correction::OcrCorrectionTable {
    crate::ocr_correction::OcrCorrectionTable::default()
}

/// 可消费块过滤入口（净化配置 + 空转写——测试零共现噪音）。
fn usable(blocks: &[SessionOcrBlock]) -> Vec<SessionOcrBlock> {
    crate::screens::filter_usable_blocks(
        blocks,
        &crate::ui_junk::UiJunkList::defaults(),
        &pcfg(),
        "",
        &corrections(),
    )
    .0
}

#[test]
fn min_block_score_070_filters_low_score() {
    // Arrange：REQ-167 校准——0.5 阈值时代存活的中低分块（o=0.63/？=0.5）
    let mut low = blk(1, 1_000, "低分噪声", None, None, None);
    low.score = 0.6;
    let mut high = blk(2, 1_000, "高分正文", None, None, None);
    high.score = 0.75;
    let blocks = vec![low, high];
    // Act
    let out = usable(&blocks);
    // Assert：0.7 阈值——0.6x 块被滤，0.75 块保留（0.5→0.7 配回归验证）
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].text, "高分正文");
}

#[test]
fn single_char_noise_dropped_except_structure_context() {
    // Arrange：REQ-167——单字符块；表格上下文豁免
    let blocks = vec![
        blk(1, 1_000, "X", None, None, None),
        blk(2, 1_000, "？", None, None, None),
        blk(3, 1_000, "✓", None, None, Some("table")),
    ];
    // Act
    let out = usable(&blocks);
    // Assert：X/？ 丢弃；表格内单字符保留（勾选框是真实内容）
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].text, "✓");
}

#[test]
fn edge_strip_bbox_blocks_dropped() {
    // Arrange：REQ-166 边缘条带——顶部条带块（y<8%）与中部正文块同帧
    let blocks = vec![
        blk(1, 1_000, "顶部条带", None, Some((10.0, 5.0, 300.0, 20.0)), None),
        blk(2, 1_000, "中部正文内容", None, Some((100.0, 200.0, 400.0, 30.0)), None),
        blk(3, 1_000, "底部条带", None, Some((100.0, 980.0, 400.0, 30.0)), None),
    ];
    // Act
    let out = usable(&blocks);
    // Assert：帧尺寸从块分布推断（~1010×1021）——顶/底 8% 条带丢弃，正文保留
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].text, "中部正文内容");
}

#[test]
fn frame_context_junk_drops_author_names_keeps_transcript_labels() {
    // Arrange：REQ-166 共现规则——同帧 ≥3 个视频页垃圾信号（简介/评论7/48/标签）
    // + 作者名（清晖加油站，标签形非讲述）+ 真标签（识别重大风险——讲述共现）
    let blocks = vec![
        blk(1, 1_000, "简介", None, None, None),
        blk(2, 1_000, "评论7", None, None, None),
        blk(3, 1_000, "48", None, None, None),
        blk(4, 1_000, "标签", None, None, None),
        blk(5, 1_000, "清晖加油站", None, None, None),
        blk(6, 1_000, "识别重大风险", None, None, None),
        blk(7, 1_000, "项目从立项到交付全流程|落地式项", None, None, None),
    ];
    // Act：转写含"识别重大风险"（画面词与讲述词互证）
    let transcript = "项目不是在结束时失败的 识别重大风险";
    let out = crate::screens::filter_usable_blocks(
        &blocks,
        &crate::ui_junk::UiJunkList::defaults(),
        &pcfg(),
        transcript,
        &corrections(),
    )
    .0;
    // Assert：作者名（标签形+无共现）丢弃；讲述共现标签保留；长块不误伤
    let texts: Vec<&str> = out.iter().map(|b| b.text.as_str()).collect();
    assert!(!texts.contains(&"清晖加油站"));
    assert!(!texts.contains(&"简介"));
    assert!(texts.contains(&"识别重大风险"));
    assert!(texts.contains(&"项目从立项到交付全流程|落地式项"));
}

#[test]
fn zero_span_screens_merged_into_adjacent() {
    // Arrange：REQ-169——屏A（单帧截断子集）→ 屏B（单帧完整内容）——聚类
    // 相似度 0.5<0.6 未合并 → 两零跨度屏；零跨度修复二次机会合并
    let dir = tmp_images_dir("zerospan", &[]);
    let blocks = vec![
        blk(1, 1_000, "完整标题内容A", None, None, None),
        blk(2, 5_000, "完整标题内容A", None, None, None),
        blk(3, 5_000, "补充正文内容", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：1 屏、非零跨度、内容合并（标题+正文都在）
    assert_eq!(screens.len(), 1, "截断子集屏并入相邻屏");
    assert_ne!(screens[0].first_seen_ms, screens[0].last_seen_ms);
    assert!(screens[0].body.iter().any(|b| b.contains("完整标题内容A")));
    assert!(screens[0].body.iter().any(|b| b.contains("补充正文内容")));
}

#[test]
fn zero_span_genuine_flash_screen_kept() {
    // Arrange：零跨度但内容与相邻屏无关（真·单帧快闪）——保守保留不误并
    let dir = tmp_images_dir("flash", &[]);
    let blocks = vec![
        blk(1, 1_000, "第一屏内容甲", None, None, None),
        blk(2, 5_000, "第一屏内容甲", None, None, None),
        blk(3, 9_000, "快闪内容乙", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：快闪屏独立保留（零跨度——诚实展示，不发明时间）
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[1].first_seen_ms, screens[1].last_seen_ms);
    assert!(screens[1].body.iter().any(|b| b.contains("快闪内容乙")));
}

#[test]
fn duplicate_image_ref_kept_only_on_first_screen() {
    // Arrange：REQ-169——归档仅 569515.webp；两屏都匹配它（会话31 画面6/7/8
    // 共用一张图的实证）——图去重只留首个屏引用
    let dir = tmp_images_dir("dupimg", &[569_515]);
    let blocks = vec![
        blk(1, 929_000, "明确项目合法地位", None, None, None),
        blk(2, 946_000, "经理应该前置管理", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：首屏保留图引用；后续屏清空（文本不丢）
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].image_ref.as_deref(), Some("full/569515.webp"));
    assert_eq!(screens[1].image_ref, None);
}
