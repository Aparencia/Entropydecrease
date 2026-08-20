//! 结构渲染层单测（REQ-177/178/179/180 / v0.7.6，AAA 模式）。
//!
//! @ai-context: 纯函数单测——章节插入位置（段前/段中/无段/首边界）、章节命名
//!              （outline 命中/占位/窗口归属）、词汇表（降序/上限/锚点/空）、
//!              配置全关 = v0.7.5 逐字节一致（零回归护栏）、统计正确。

use crate::chapter_detect::ChapterBoundary;
use crate::glossary::GlossaryCandidate;
use crate::note_filter::{FilterStats, NoteFilterResult};
use crate::outline::OutlineEntry;
use crate::purify_config::PurifyConfig;
use crate::structure_note::{render_note_structure, word_boundary_contains, NoteStructureConfig};
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

    // Assert：标题在段落文本之前；章节名占位"章节 1"
    assert!(result.markdown.contains("## 章节 1 [00:09]"));
    let heading_pos = result.markdown.find("## 章节 1 [00:09]").unwrap();
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
    let h = result.markdown.find("## 章节 1 [00:12]").unwrap();
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
    let h = result.markdown.find("## 章节 1 [00:40]").unwrap();
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
    let h1 = result.markdown.find("## 章节 1 [00:09]").unwrap();
    let h2 = result.markdown.find("## 章节 2 [00:22]").unwrap();
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
    assert!(result.markdown.contains("## 色彩理论 [00:09]"));
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
    assert!(result.markdown.contains("## 章节 1 [00:09]"));
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
    assert!(result.markdown.contains("## 第一章标题 [00:09]"));
    assert!(result.markdown.contains("## 章节 2 [00:22]"));
}

// ── 词汇表 ─────────────────────────────────────────────────────

#[test]
fn glossary_block_sorted_by_score_desc_with_anchor() {
    // Arrange：两个术语，高分在后（验证排序）；"术语A"在 kept 段出现（锚点）
    let kept = vec![seg(1, 3_000, 5_000, "介绍了术语A的定义")];
    let mut result = base_result(kept);

    // Act
    let stats = render_note_structure(
        &mut result,
        &[],
        &[],
        &[term("术语B", 5, 0, 2.0), term("术语A", 8, 1, 8.0)],
        &default_config(),
    );

    // Assert：score 降序；锚点 [00:03] 前缀；格式含计数
    let b_pos = result.markdown.find("术语B").unwrap();
    let a_pos = result.markdown.find("术语A").unwrap();
    assert!(a_pos < b_pos, "高分在前");
    assert!(result.markdown.contains("- [00:03] 术语A（画面 ×8 / 语音 ×1）"));
    assert_eq!(stats.glossary_terms, 2);
}

#[test]
fn glossary_term_without_kept_occurrence_has_no_anchor() {
    // Arrange：术语不在 kept 段 → 无锚点但保留行
    let kept = vec![seg(1, 3_000, 5_000, "普通内容")];
    let mut result = base_result(kept);

    // Act
    render_note_structure(&mut result, &[], &[], &[term("生僻词", 3, 0, 3.0)], &default_config());

    // Assert：无 [MM:SS] 前缀，行不丢
    assert!(result.markdown.contains("- 生僻词（画面 ×3 / 语音 ×0）"));
    assert!(!result.markdown.contains("-[0"), "无锚点");
}

#[test]
fn glossary_max_terms_truncates() {
    // Arrange：3 个术语，上限 2
    let mut result = base_result(vec![seg(1, 0, 5_000, "内容")]);
    let mut config = default_config();
    config.glossary_max_terms = 2;

    // Act
    let stats = render_note_structure(
        &mut result,
        &[],
        &[],
        &[term("T1", 1, 0, 1.0), term("T2", 2, 0, 2.0), term("T3", 3, 0, 3.0)],
        &config,
    );

    // Assert：只保留最高分 2 个
    assert!(result.markdown.contains("T3"));
    assert!(result.markdown.contains("T2"));
    assert!(!result.markdown.contains("T1"));
    assert_eq!(stats.glossary_terms, 2);
}

#[test]
fn empty_glossary_produces_no_block() {
    // Arrange：空术语
    let mut result = base_result(vec![seg(1, 0, 5_000, "内容")]);

    // Act
    let stats = render_note_structure(&mut result, &[], &[], &[], &default_config());

    // Assert：无词汇表块
    assert!(!result.markdown.contains("词汇表"));
    assert_eq!(stats.glossary_terms, 0);
}

#[test]
fn glossary_max_terms_zero_disables_block() {
    // Arrange：上限 0 = 不输出词汇表块（审查修复语义——原 .max(1) 会输出 1 条）
    let mut result = base_result(vec![seg(1, 0, 5_000, "内容")]);
    let mut config = default_config();
    config.glossary_max_terms = 0;

    // Act
    let stats = render_note_structure(
        &mut result,
        &[],
        &[],
        &[term("T1", 1, 0, 1.0)],
        &config,
    );

    // Assert：无词汇表块、统计 0
    assert!(!result.markdown.contains("词汇表"));
    assert!(!result.markdown.contains("T1"));
    assert_eq!(stats.glossary_terms, 0);
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
        glossary_block: false,
        glossary_max_terms: 20,
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
    // Arrange：1 章节（无标题）+ 1 术语
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

    // Assert：FilterStats 字段同步（purify_stats 落库同源）
    assert_eq!(result.stats.chapters, 1);
    assert_eq!(result.stats.titled_chapters, 0);
    assert_eq!(result.stats.glossary_terms, 1);
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
    // Arrange：partial JSON（只覆盖 structure.glossaryMaxTerms）
    let json = r#"{"structure": {"glossaryMaxTerms": 5}}"#;

    // Act
    let parsed: PurifyConfig = serde_json::from_str(json).unwrap();

    // Assert：覆盖生效、其余默认（嵌套结构字段 serde default）
    assert_eq!(parsed.structure.glossary_max_terms, 5);
    assert!(parsed.structure.chapter_headings);
    assert!(parsed.structure.glossary_block);
}

// TD-2026-08-20-B：词边界 + 大小写折叠（词边界匹配直接单测 + 经 first_occurrence_ms 集成）

#[test]
fn word_boundary_rejects_short_term_inside_longer_word() {
    // Arrange/Act/Assert：短术语 "AI" 不得锚到 "AIR"/"said" 等子串
    assert!(!word_boundary_contains("AIR 飞行指南", "ai"));
    assert!(!word_boundary_contains("saidthings", "said")); // 折叠后仍在词内 → 拒绝
    assert!(word_boundary_contains("AI 时代来了", "ai"));
    assert!(word_boundary_contains("he said it", "said"));
}

#[test]
fn word_boundary_case_insensitive() {
    // Act/Assert：大小写折叠——"OCR" 命中 "ocr 引擎"
    assert!(word_boundary_contains("OCR 引擎已加载", "ocr"));
    assert!(word_boundary_contains("OCR 引擎已加载", "OCR"));
    assert!(!word_boundary_contains("SOCRATES 哲学", "ocr")); // 折叠后仍在词内 → 拒绝
}

#[test]
fn word_boundary_chinese_substring_unaffected() {
    // Act/Assert：汉字前后不设边界（中文无词边界概念）——"项目" 命中 "项目管理"
    assert!(word_boundary_contains("项目管理很关键", "项目"));
    assert!(word_boundary_contains("敏捷开发", "开发"));
}

#[test]
fn word_boundary_empty_term_and_edge_positions() {
    // Act/Assert：空术语防御性命中；串首/串尾边界成立
    assert!(word_boundary_contains("任意文本", ""));
    assert!(word_boundary_contains("AI起步", "ai"));
    assert!(word_boundary_contains("起步AI", "ai"));
}

#[test]
fn word_boundary_cjk_term_after_ascii_no_panic() {
    // Arrange/Act/Assert：术语自身为 CJK 多字节字符（"告" 占 3 字节）且前邻
    // ASCII 字母数字——命中被边界拒绝后须前移到下一字符边界；旧实现 start=
    // pos+1 落在多字节中间，下轮 lower[start..] 切片 panic（预览任务崩溃：
    // "start byte index 103 ... inside '告' (bytes 102..105)"）。
    assert!(!word_boundary_contains("A告B", "告"), "前后 ASCII 字母数字 → 边界拒绝");
    assert!(
        word_boundary_contains("A告 告", "告"),
        "第二个命中（空格边界 + 串尾）仍可匹配——前移不丢后续候选"
    );
}

#[test]
fn word_boundary_cjk_term_at_high_byte_offset_no_panic() {
    // Arrange/Act/Assert：复现线上偏移——'告' 位于字节 102..105，前邻 ASCII，
    // 旧实现 start=103 落在字符中间 panic；修复后应返回 false 而非崩溃
    let text = "x".repeat(102) + "告B";
    assert!(!word_boundary_contains(&text, "告"));
}

#[test]
fn first_occurrence_cjk_term_after_ascii_no_panic() {
    // Arrange：kept 段中 CJK 术语前邻 ASCII 字母数字（边界拒绝路径）
    let kept = vec![seg(1, 1_000, 2_000, "本段讲 A告B 的定义")];

    // Act/Assert：不 panic，边界拒绝 → 无锚点
    assert_eq!(super::first_occurrence_ms(&kept, "告"), None);
}

#[test]
fn first_occurrence_anchor_respects_word_boundary() {
    // Arrange：段文本含 "AI 提效"（应命中）与 "AIR 质量"（不应命中）
    let kept = vec![
        seg(1, 1_000, 2_000, "本章讲 AIR 质量模型"),
        seg(2, 3_000, 4_000, "AI 提效的三个方法"),
    ];

    // Act：锚点应为第二段
    let anchor = super::first_occurrence_ms(&kept, "AI");

    // Assert
    assert_eq!(anchor, Some(3_000));
}
