//! 结构渲染层单测（REQ-177/178/179/180 / v0.7.6，AAA 模式）。
//!
//! @ai-context: 纯函数单测——章节插入位置（段前/段中/无段/首边界）、章节命名
//!              （outline 命中/占位/窗口归属）、词汇表移出笔记（v0.11.5 反向
//!              断言——术语候选不得进 markdown）、配置全关 = v0.7.5 逐字节
//!              一致（零回归护栏）、统计正确。

use crate::chapter_detect::ChapterBoundary;
use crate::glossary::GlossaryCandidate;
use crate::note_filter::{FilterStats, NoteFilterResult};
use crate::outline::OutlineEntry;
use crate::purify_config::PurifyConfig;
use crate::structure_note::{render_note_structure, NoteStructureConfig};
use crate::types::SessionSegment;

/// 构造会话段（净化后保留段形态）。
fn seg(id: i64, start_ms: u64, end_ms: u64, text: &str) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms,
        end_ms,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

/// 构造 NoteFilterResult（结构渲染输入基线：markdown 由 v0.7.5 净化组装）。
fn base_result(kept: Vec<SessionSegment>) -> NoteFilterResult {
    // 与净化管线同口径组装（锚点开）——基线 markdown 可被 render 重写
    let transcript: Vec<crate::types::TranscriptSegment> = kept
        .iter()
        .map(|s| crate::types::TranscriptSegment {
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            word_timestamps: None,
            confidence: None,
            volume: None,
        })
        .collect();
    let paragraphs = crate::concat::split_transcript_paragraphs_with(&transcript, 120, 60_000);
    let lines: Vec<String> = paragraphs
        .iter()
        .map(|(start, text)| format!("[{}] {}", crate::concat::format_timestamp(*start), text))
        .collect();
    let markdown = crate::concat::assemble_markdown("测试笔记", &lines, &[]);
    NoteFilterResult {
        title: "测试笔记".to_string(),
        markdown,
        kept,
        ocr_points: Vec::new(),
        ocr_screens: Vec::new(),
        stats: FilterStats::default(),
        filtered: Vec::new(),
        merged: Vec::new(),
        purify: PurifyConfig::default(),
        warning: None,
        body_source: crate::note_body_source::BodySource::Transcript,
        ocr_body: Vec::new(),
    }
}

fn boundary(time_ms: u64) -> ChapterBoundary {
    ChapterBoundary { time_ms, votes: 2, topic_drop: 0.5 }
}

fn outline(time_ms: u64, text: &str) -> OutlineEntry {
    OutlineEntry { time_ms, text: text.to_string() }
}

fn term(term: &str, ocr_count: usize, asr_count: usize, score: f32) -> GlossaryCandidate {
    GlossaryCandidate { term: term.to_string(), ocr_count, asr_count, score }
}

fn default_config() -> NoteStructureConfig {
    NoteStructureConfig::default()
}

// ── 章节插入位置 ──────────────────────────────────────────────

#[test]
fn chapter_heading_inserted_before_first_paragraph_after_boundary() {
    // Arrange：边界 9000ms → 应插在段2（100000ms，超 60s span 强制切段）前
    let kept = vec![seg(1, 0, 5_000, "开场白"), seg(2, 100_000, 110_000, "正题内容")];
    let mut result = base_result(kept);

    // Act
    let stats = render_note_structure(
        &mut result,
        &[boundary(9_000)],
        &[],
        &[],
        &default_config(),
    );

    // Assert：标题在段落文本之前；章节名占位"章节 1"（时间戳回链锚点格式）
    assert!(result.markdown.contains("## 章节 1 [[⏱ 00:09]([[ts:9000]])]"));
    let heading_pos = result.markdown.find("## 章节 1 [[⏱ 00:09]([[ts:9000]])]").unwrap();
    let body_pos = result.markdown.find("正题内容").unwrap();
    assert!(heading_pos < body_pos, "标题应插在边界后首段之前");
    assert_eq!(stats.chapters, 1);
    assert_eq!(stats.titled_chapters, 0);
}

#[test]
fn chapter_heading_boundary_inside_paragraph_keeps_paragraph_unsplit() {
    // Arrange：边界 12000ms 落在段2（10000~20000ms）内——段不切，标题插在段3前
    //          （段3 end=100000 使 span 超 60s，强制段落切分点）
    let kept = vec![
        seg(1, 0, 5_000, "开场白"),
        seg(2, 10_000, 20_000, "跨边界长段"),
        seg(3, 25_000, 100_000, "下一章内容"),
    ];
    let mut result = base_result(kept);

    // Act
    render_note_structure(&mut result, &[boundary(12_000)], &[], &[], &default_config());

    // Assert：标题在段3前、段2后（不切段——诚实粗粒度）
    let h = result.markdown.find("## 章节 1 [[⏱ 00:12]([[ts:12000]])]").unwrap();
    let seg2_pos = result.markdown.find("跨边界长段").unwrap();
    let seg3_pos = result.markdown.find("下一章内容").unwrap();
    assert!(seg2_pos < h && h < seg3_pos);
    assert!(result.markdown.contains("跨边界长段"), "跨边界段不切");
}

#[test]
fn chapter_heading_boundary_after_last_paragraph_appends_at_end() {
    // Arrange：边界 40000ms 在所有段之后 → 追加到讲述内容末尾
    let kept = vec![seg(1, 0, 5_000, "开场白"), seg(2, 10_000, 20_000, "正题内容")];
    let mut result = base_result(kept);

    // Act
    render_note_structure(&mut result, &[boundary(40_000)], &[], &[], &default_config());

    // Assert：标题存在且位于正题之后
    let h = result.markdown.find("## 章节 1 [[⏱ 00:40]([[ts:40000]])]").unwrap();
    let body_pos = result.markdown.find("正题内容").unwrap();
    assert!(body_pos < h);
}

#[test]
fn multiple_chapters_inserted_in_order() {
    // Arrange：两个边界 9000ms / 22000ms
    let kept = vec![
        seg(1, 0, 5_000, "开场"),
        seg(2, 10_000, 15_000, "第一章内容"),
        seg(3, 25_000, 30_000, "第二章内容"),
    ];
    let mut result = base_result(kept);

    // Act
    let stats = render_note_structure(
        &mut result,
        &[boundary(22_000), boundary(9_000)],
        &[],
        &[],
        &default_config(),
    );

    // Assert：两个标题按时间序出现，编号正确
    let h1 = result.markdown.find("## 章节 1 [[⏱ 00:09]([[ts:9000]])]").unwrap();
    let h2 = result.markdown.find("## 章节 2 [[⏱ 00:22]([[ts:22000]])]").unwrap();
    assert!(h1 < h2);
    assert_eq!(stats.chapters, 2);
}

// ── 章节命名（outline 命中）────────────────────────────────────

#[test]
fn chapter_named_from_outline_title_in_window() {
    // Arrange：outline 标题"色彩理论"在 9500ms（边界 9000ms 后、下边界前）
    let kept = vec![seg(1, 0, 5_000, "开场"), seg(2, 10_000, 15_000, "正文")];
    let mut result = base_result(kept);

    // Act
    let stats = render_note_structure(
        &mut result,
        &[boundary(9_000)],
        &[outline(9_500, "色彩理论")],
        &[],
        &default_config(),
    );

    // Assert：章节名取 outline 标题；titled 计数 1
    assert!(result.markdown.contains("## 色彩理论 [[⏱ 00:09]([[ts:9000]])]"));
    assert_eq!(stats.titled_chapters, 1);
}

#[test]
fn chapter_title_outside_window_not_used() {
    // Arrange：outline 标题在边界前（旧标题残留）→ 不取 → 占位
    let kept = vec![seg(1, 0, 5_000, "开场"), seg(2, 10_000, 15_000, "正文")];
    let mut result = base_result(kept);

    // Act
    let stats = render_note_structure(
        &mut result,
        &[boundary(9_000)],
        &[outline(5_000, "旧标题")],
        &[],
        &default_config(),
    );

    // Assert：占位"章节 1"，不用窗口外标题
    assert!(result.markdown.contains("## 章节 1 [[⏱ 00:09]([[ts:9000]])]"));
    assert!(!result.markdown.contains("旧标题"));
    assert_eq!(stats.titled_chapters, 0);
}

#[test]
fn chapter_title_belongs_to_first_window_not_second() {
    // Arrange：outline 9500ms 属第一窗（9s~22s）；第二窗（22s+）无标题 → 占位
    let kept = vec![
        seg(1, 0, 5_000, "开场"),
        seg(2, 10_000, 15_000, "第一章"),
        seg(3, 25_000, 30_000, "第二章"),
    ];
    let mut result = base_result(kept);

    // Act
    render_note_structure(
        &mut result,
        &[boundary(9_000), boundary(22_000)],
        &[outline(9_500, "第一章标题")],
        &[],
        &default_config(),
    );

    // Assert：第一章有标题、第二章占位
    assert!(result.markdown.contains("## 第一章标题 [[⏱ 00:09]([[ts:9000]])]"));
    assert!(result.markdown.contains("## 章节 2 [[⏱ 00:22]([[ts:22000]])]"));
}

// ── 词汇表（v0.11.5 spec 8️⃣：完全移出笔记——术语改在会话详情展示）───────────

#[test]
fn glossary_candidates_never_enter_markdown() {
    // Arrange：传入术语候选（旧版会渲染 "## 词汇表" 尾部块）
    let kept = vec![seg(1, 3_000, 5_000, "介绍了术语A的定义")];
    let mut result = base_result(kept);

    // Act：默认配置渲染（无章节数据——纯术语路径）
    let stats = render_note_structure(
        &mut result,
        &[],
        &[],
        &[term("术语A", 8, 1, 8.0), term("术语B", 5, 0, 2.0)],
        &default_config(),
    );

    // Assert：词汇表标题块不得进 markdown；"术语A"在讲述内容原文中（ASR
    //         高频词，正文含该词属正常）——断言语义是"词汇表块不输出"而非
    //         "正文不含该词"；未在正文出现的术语不得凭空进入
    assert!(!result.markdown.contains("## 词汇表"));
    assert!(result.markdown.contains("术语A"), "讲述内容含术语属正常（ASR 原文）");
    assert!(!result.markdown.contains("术语B"), "未在讲述内容出现的术语不得进 markdown");
    assert_eq!(stats.glossary_terms, 0);
    let json = serde_json::to_string(&result.stats).expect("stats serializable");
    assert!(json.contains("glossary_terms"));
}

// ── 零回归护栏（REQ-179）──────────────────────────────────────

#[test]
fn config_all_off_returns_markdown_unchanged() {
    // Arrange：全关配置 + 有章节有术语——必须原样返回
    let kept = vec![seg(1, 0, 5_000, "内容段")];
    let mut result = base_result(kept);
    let before = result.markdown.clone();
    let config = NoteStructureConfig {
        chapter_headings: false,
    };

    // Act
    let stats = render_note_structure(
        &mut result,
        &[boundary(9_000)],
        &[outline(9_500, "标题")],
        &[term("T", 1, 0, 1.0)],
        &config,
    );

    // Assert：markdown 逐字节一致；统计全零
    assert_eq!(result.markdown, before, "全关必须零改动");
    assert_eq!(stats.chapters, 0);
    assert_eq!(stats.glossary_terms, 0);
}

#[test]
fn stats_written_into_filter_stats() {
    // Arrange：1 章节（无标题）+ 术语参数（v0.11.5 起被忽略）
    let mut result = base_result(vec![
        seg(1, 0, 5_000, "内容"),
        seg(2, 10_000, 15_000, "更多"),
    ]);

    // Act
    render_note_structure(
        &mut result,
        &[boundary(9_000)],
        &[],
        &[term("T", 1, 0, 1.0)],
        &default_config(),
    );

    // Assert：FilterStats 字段同步（purify_stats 落库同源）；词汇表恒 0
    assert_eq!(result.stats.chapters, 1);
    assert_eq!(result.stats.titled_chapters, 0);
    assert_eq!(result.stats.glossary_terms, 0);
}

#[test]
fn warning_stays_on_top() {
    // Arrange：异常会话警示行 + 章节
    let kept = vec![seg(1, 0, 5_000, "内容"), seg(2, 10_000, 15_000, "更多")];
    let mut result = base_result(kept);
    result.warning = Some("> ⚠️ 会话异常（failed），内容可能不完整".to_string());

    // Act
    render_note_structure(&mut result, &[boundary(9_000)], &[], &[], &default_config());

    // Assert：警示行仍置顶
    let w = result.markdown.find("会话异常").unwrap();
    let h = result.markdown.find("## 章节 1").unwrap();
    assert!(w < h, "警示行置顶");
}

#[test]
fn structure_config_roundtrips_json() {
    // Arrange：partial JSON（只覆盖 structure.chapterHeadings）
    let json = r#"{"structure": {"chapterHeadings": false}}"#;

    // Act
    let parsed: PurifyConfig = serde_json::from_str(json).unwrap();

    // Assert：覆盖生效、其余默认（嵌套结构字段 serde default）
    assert!(!parsed.structure.chapter_headings);
    // v0.11.5：旧配置文件遗留 glossaryBlock/glossaryMaxTerms 被 serde 忽略（不阻断）
    let legacy = serde_json::from_str::<PurifyConfig>(
        r#"{"structure": {"glossaryBlock": true, "glossaryMaxTerms": 5}}"#,
    )
    .unwrap();
    assert!(legacy.structure.chapter_headings, "旧多余字段忽略，默认生效");
}

// v0.11.5（spec 8️⃣）：词汇表完全移出笔记——first_occurrence_ms/word_boundary_contains
// 锚点工具与其专属单测一并删除（仅服务词汇表锚点；术语展示不再需要回跳锚点）
