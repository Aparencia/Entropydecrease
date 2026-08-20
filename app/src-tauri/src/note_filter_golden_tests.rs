//! 黄金语料回归集（REQ-172 / v0.7.5）。
//!
//! @ai-context: 会话31（B站"项目从立项到交付全流程"讲座）/会话29（直播）
//!              原始素材样本 → 期望净化输出断言。新增规则先写失败测试再实现
//!              （TDD）；全量回归 cargo test 一键跑。
//! @ai-context: 语料为**样本夹具**（代表性片段+期望），非整会话重放——规则
//!              边界（口头禅/结巴/视频页垃圾/单字符/纠错/零跨度）逐一钉死，
//!              防"按下葫芦浮起瓢"。

use super::*;
use crate::ui_junk::UiJunkList;

fn asr(id: i64, start: u64, end: u64, text: &str) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 31,
        start_ms: start,
        end_ms: end,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

fn block(ts: u64, text: &str, score: f32) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 31,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: "full".to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }
}

fn junk() -> UiJunkList {
    UiJunkList::defaults()
}

/// 净化环境（内置默认——黄金语料按 v0.7.5 裁决口径跑）。
fn env() -> crate::note_filter::PurifyEnv {
    crate::note_filter::PurifyEnv::default()
}

fn run(title: &str, segments: &[SessionSegment], blocks: &[SessionOcrBlock]) -> NoteFilterResult {
    filter_note(title, segments, blocks, &junk(), &env())
}

/// 会话31 实证：口头禅短段规则级删除（REQ-163）——段 1018「对不对？」不再进笔记。
#[test]
fn session31_filler_short_segments_deleted() {
    // Arrange：段 1018 实证样本 + 回应语义"对" + 纯口头禅段
    let segments = vec![
        asr(1018, 0, 3700, "对不对？"),
        asr(2, 4000, 6000, "对"),
        asr(3, 6000, 8000, "大家知道吗"),
        asr(4, 8000, 12000, "那么项目的可行性研究就是非常重要的"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：「对不对？」（净化后纯符号残留）与「大家知道吗」（净化后为空）
    // 进口头禅删除；"对"单字由碎片规则处理（回应语义保真需上下文——诚实注释）
    assert_eq!(result.stats.filler, 2, "对不对？+大家知道吗");
    assert_eq!(result.stats.fragments, 1, "'对'单字走碎片规则");
    let reasons: Vec<FilterReason> = result.filtered.iter().map(|f| f.reason).collect();
    assert!(reasons.contains(&FilterReason::Filler));
    // 正文段存活且口语词被净化（就是→删）
    let kept_texts: Vec<&str> = result.kept.iter().map(|s| s.text.as_str()).collect();
    assert!(kept_texts.iter().any(|t| t.contains("项目的可行性研究")));
    assert!(kept_texts.iter().all(|t| !t.contains("就是")));
    assert!(!result.markdown.contains("对不对"));
}

/// 会话31 实证：结巴折叠 + 术语替换（REQ-164）。
#[test]
fn session31_stutter_fold_and_term_replace() {
    // Arrange：甲甲甲（3 连折叠）/ 项目班（缺字术语）
    let segments = vec![
        asr(1, 0, 3000, "叫甲甲甲方的项目那能理解吗"),
        asr(2, 3000, 6000, "搭建项目班啊"),
        asr(3, 6000, 9000, "做项目可行行研究"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：折叠/替换命中统计 + 产物文本正确
    assert_eq!(result.stats.stutter, 1, "甲甲甲 3 连折叠");
    assert_eq!(result.stats.term_replace, 2, "项目班→项目班子 + 可行行研究→可行性研究");
    let kept_texts: Vec<&str> = result.kept.iter().map(|s| s.text.as_str()).collect();
    assert!(kept_texts.iter().any(|t| t.contains("甲方的项目")));
    assert!(kept_texts.iter().any(|t| t.contains("搭建项目班子")));
    assert!(kept_texts.iter().any(|t| t.contains("可行性研究")));
}

/// 会话31 实证：口语净化大幅减少口头禅（REQ-162 保守档）。
#[test]
fn session31_verbal_purify_reduces_fillers() {
    // Arrange：会话31 高频口癖样本
    let segments = vec![asr(1, 0, 4000, "就是啊，这个项目启动是一个艺术")];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：就是/啊/这个 被清除，正文保留（统计记录净化段数）
    assert_eq!(result.stats.verbal, 1);
    let kept = &result.kept[0];
    assert!(kept.text.contains("项目启动是一个艺术"));
    assert!(!kept.text.contains("就是") && !kept.text.contains("这个"));
}

/// 会话31 实证：讲述内容段落时间戳锚点（REQ-165）。
#[test]
fn session31_paragraph_timestamp_anchors() {
    // Arrange：两段跨 60s（切两段）；段首 63s → [01:03]
    let segments = vec![asr(1, 0, 5000, "项目启动是一个艺术"), asr(2, 63_000, 68_000, "这是项目章程")];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：锚点 [MM:SS] 前缀（段首 start_ms）；段落可回跳
    assert!(result.markdown.contains("[00:00] 项目启动是一个艺术。"));
    assert!(result.markdown.contains("[01:03] 这是项目章程。"));
    // 可开关（REQ-165）：关闭后无锚点
    let mut cfg = crate::purify_config::PurifyConfig::default();
    cfg.anchor_timestamps = false;
    let env_off = crate::note_filter::PurifyEnv {
        config: cfg,
        symbol: crate::symbol_normalize::SymbolNormalizeConfig::default(),
        corrections: crate::ocr_correction::OcrCorrectionTable::default(),
    };
    let off = filter_note("测试", &segments, &[], &junk(), &env_off);
    assert!(!off.markdown.contains("[01:03]"));
}

/// 会话31 实证：视频页 UI 垃圾 + 单字符碎片 + OCR 错字纠错（REQ-166/167/168）。
#[test]
fn session31_video_page_junk_single_char_and_correction() {
    // Arrange：B站页面框架（简介/评论7/48/标签/qh202522/1.3万0/清晖加油站）
    // + 单字符碎片（X/?/不/三/o）+ 错字（項灣）+ 真内容（识别重大风险——
    // 讲者在讲，画面与讲述共现）
    let segments = vec![
        asr(1, 0, 5000, "项目不是在结束时失败的，是在开始时失败的"),
        asr(2, 5000, 9000, "识别重大风险"),
    ];
    let blocks = vec![
        block(2_000, "简介", 0.9),
        block(2_000, "评论7", 0.9),
        block(2_000, "48", 0.9),
        block(2_000, "标签", 0.9),
        block(2_000, "qh202522", 0.9),
        block(2_000, "1.3万0", 0.9),
        block(2_000, "清晖加油站", 0.9),
        block(2_000, "识别重大风险", 0.9),
        block(2_000, "項灣启动是艺术", 0.9),
        block(2_000, "项目从立项到交付全流程|落地式项", 0.9),
        block(2_000, "X", 0.97),
        block(2_000, "？", 0.5),
        block(2_000, "不", 0.67),
        block(2_000, "三", 0.91),
        block(2_000, "o", 0.63),
    ];
    // Act
    let result = run("测试", &segments, &blocks);
    let all: String = result.ocr_points.join("\n");
    // Assert：视频页垃圾/作者名/二维码/量词全部消失
    for junk_word in ["简介", "评论7", "48", "标签", "qh202522", "1.3万0", "清晖加油站"] {
        assert!(!all.contains(junk_word), "{} 不得进画面要点", junk_word);
    }
    // 单字符碎片消失（低分 0.5→0.7 校准 + 单字符规则）
    for junk_char in ["X", "？", "不", "三", "o"] {
        assert!(!all.contains(junk_char), "{} 单字符不得进画面要点", junk_char);
    }
    // 错字纠错（項灣→项目，讲述共现）——真内容保留
    assert!(all.contains("项目启动是艺术"), "纠错后真内容保留: {}", all);
    assert!(!all.contains("項灣"));
    assert!(all.contains("识别重大风险"), "讲述共现的标签形内容不误杀");
    assert_eq!(result.stats.ocr_corrected, 1, "項灣→项目 1 块");
}

/// 会话29 实证：直播 UI 不进画面要点（回归——v0.7.3 LiveUi 口径持续生效）。
#[test]
fn session29_live_ui_excluded_from_points() {
    // Arrange：直播互动按钮 + 直播间正文
    let blocks = vec![
        block(1_000, "1人正在看", 0.9),
        block(1_000, "发送", 0.9),
        block(1_000, "下载", 0.9),
        block(1_000, "预约", 0.9),
        block(1_000, "直播间的朋友们大家好", 0.9),
    ];
    // Act
    let result = run("测试", &[], &blocks);
    let all: String = result.ocr_points.join("\n");
    // Assert：互动按钮全滤；直播间正文（含"直播"词内）不误杀
    for junk_word in ["1人正在看", "发送", "下载", "预约"] {
        assert!(!all.contains(junk_word), "{} 直播 UI 不得进画面要点", junk_word);
    }
    assert!(all.contains("直播间的朋友们大家好"));
}

/// 会话31 实证：失败会话转笔记带警示行（REQ-170 诚实降级）。
#[test]
fn session31_failed_session_warning_line() {
    // Arrange：failed 会话（停止链路异常翻案场景）
    let segments = vec![asr(1, 0, 5000, "内容完整")];
    let mut result = run("测试", &segments, &[]);
    // Act：命令层语义——failed 追加警示；finished 不追加
    apply_session_warning(&mut result, "failed");
    refresh_screen_points(&mut result);
    // Assert：警示行在 markdown 顶部；内容完整可读
    assert!(result.markdown.starts_with("> ⚠️ 会话异常（failed），内容可能不完整"));
    assert!(result.markdown.contains("内容完整"));
    // finished 无警示
    apply_session_warning(&mut result, "finished");
    refresh_screen_points(&mut result);
    assert!(!result.markdown.contains("会话异常"));
}

/// REQ-171：净化统计口径（口头禅/净化/折叠/替换/纠错计数可落库）。
#[test]
fn purify_stats_counts_are_explicit() {
    // Arrange：混合样本（口头禅段 + 结巴段 + 纠错块）
    let segments = vec![
        asr(1, 0, 3000, "对不对？"),
        asr(2, 3000, 6000, "甲甲甲方的项目"),
    ];
    let blocks = vec![block(2_000, "項灣", 0.9)];
    // Act
    let result = run("测试", &segments, &blocks);
    // Assert：各计数 > 0 且可序列化（purify_stats 落库 JSON 口径）
    let stats = &result.stats;
    assert!(stats.filler >= 1 && stats.stutter == 1 && stats.ocr_corrected == 1);
    let json = serde_json::to_string(stats).expect("stats serializable");
    assert!(json.contains("filler") && json.contains("ocr_corrected"));
}

// ────────────────────────────────────────────────
// v0.7.5 扩展（2026-08-20 讨论落地）：过渡短句 + 修辞问句
// ────────────────────────────────────────────────

/// 会话31 实证：纯过渡短句规则删除（精确表——零误杀）。
#[test]
fn session31_transition_short_phrases_deleted() {
    // Arrange：单独成段的过渡词 + 带内容的过渡句 + 带话题的过渡句
    //（"我们来看"等会被 verbal 词表先清——口头禅路径；此处用表内且
    // 不被 verbal 覆盖的词验证过渡规则本身）
    let segments = vec![
        asr(1, 0, 2000, "接下来"),
        asr(2, 2000, 5000, "首先"),
        asr(3, 5000, 9000, "接下来我们看第三章"),
        asr(4, 9000, 13000, "讲我们具体的工具了"),
        asr(5, 13000, 17000, "那么项目的可行性研究就是非常重要的"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：「接下来/首先」整句命中删除；带章节/话题的过渡句保留
    assert_eq!(result.stats.transition, 2);
    let kept_texts: Vec<&str> = result.kept.iter().map(|s| s.text.as_str()).collect();
    assert!(kept_texts.iter().any(|t| t.contains("第三章")), "含章节内容不误杀");
    assert!(kept_texts.iter().any(|t| t.contains("具体的工具")), "带话题过渡句不误杀");
    assert!(kept_texts.iter().any(|t| t.contains("可行性研究")), "正文不受影响");
    let reasons: Vec<FilterReason> = result.filtered.iter().map(|f| f.reason).collect();
    assert!(reasons.contains(&FilterReason::Transition));
}

/// 会话31 实证：修辞问句删除（自问自答——答案紧邻且含核心词）。
#[test]
fn session31_rhetorical_question_deleted_when_answer_adjacent() {
    // Arrange：用户反馈样本——「过程是什么？」+ 紧邻答案段
    let segments = vec![
        asr(1, 0, 4000, "过程是什么？"),
        asr(2, 4000, 8000, "这个过程是制定项目章程"),
        asr(3, 8000, 12000, "项目启动是一个艺术"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：问句删除（信息由答案段承载）、答案与正文保留
    assert_eq!(result.stats.rhetorical, 1);
    assert!(!result.markdown.contains("过程是什么"));
    assert!(result.markdown.contains("制定项目章程"));
    assert!(result.markdown.contains("项目启动是一个艺术"));
    let reasons: Vec<FilterReason> = result.filtered.iter().map(|f| f.reason).collect();
    assert!(reasons.contains(&FilterReason::Rhetorical));
}

/// 误杀防护：开放问题/答案不紧邻 → 问句保留。
#[test]
fn open_question_kept_in_note() {
    // Arrange：开放性问题（答案不在紧邻段）
    let segments = vec![
        asr(1, 0, 3000, "大家思考一下为什么？"),
        asr(2, 3000, 6000, "我们来看下一个案例"),
        asr(3, 6000, 9000, "案例讲完再回答"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：保留（核心词"大家思考一下"不在下一段复现）
    assert_eq!(result.stats.rhetorical, 0);
    assert!(result.markdown.contains("大家思考一下为什么"));
}

// ────────────────────────────────────────────────
// v0.7.6 扩展（REQ-181）：结构渲染黄金语料——章节标题 + 词汇表
// ────────────────────────────────────────────────

/// 会话31 实证：净化产物 → 结构渲染叠加章节标题（outline 命中命名）。
///
/// @ai-context: 模拟命令层接线顺序（filter_note → apply_session_warning →
///              refresh_screen_points → render_note_structure）；章节边界由
///              chapter_detect 语义构造（网课档案）——本测试钉结构渲染产出，
///              章节检测本身由 chapter_detect_tests 覆盖。
#[test]
fn session31_structure_chapter_headings_from_outline() {
    // Arrange：两章内容（边界 9000ms/30000ms）+ 章节窗口内 outline 标题
    let segments = vec![
        asr(1, 0, 5000, "项目启动是一个艺术"),
        asr(2, 10_000, 15_000, "这是项目章程"),
        asr(3, 35_000, 40_000, "这是项目范围说明书"),
    ];
    let blocks = vec![
        block(2_000, "项目启动", 0.9),
        block(12_000, "项目章程", 0.9),
        block(36_000, "项目范围", 0.9),
    ];
    let mut result = run("测试", &segments, &blocks);
    // Act：命令层接线语义——警示行（finished 无）+ 刷新 + 结构渲染
    apply_session_warning(&mut result, "finished");
    refresh_screen_points(&mut result);
    let chapters = vec![
        crate::chapter_detect::ChapterBoundary { time_ms: 9_000, votes: 2, topic_drop: 0.5 },
        crate::chapter_detect::ChapterBoundary { time_ms: 30_000, votes: 2, topic_drop: 0.4 },
    ];
    let outline = vec![
        crate::outline::OutlineEntry { time_ms: 12_000, text: "项目章程".to_string() },
        crate::outline::OutlineEntry { time_ms: 36_000, text: "项目范围".to_string() },
    ];
    let _ = crate::structure_note::render_note_structure(
        &mut result,
        &chapters,
        &outline,
        &[],
        &crate::structure_note::NoteStructureConfig::default(),
    );
    // Assert：两章标题带时间锚点；章节名取各自窗口内 outline 标题
    // （第一章窗口 [9s,30s) 命中 12s"项目章程"；第二章窗口 [30s,∞) 命中
    // 36s"项目范围"——窗口归属正确，跨窗口不串）
    assert!(result.markdown.contains("## 项目章程 [00:09]"), "第一章取窗口内标题");
    assert!(result.markdown.contains("## 项目范围 [00:30]"), "第二章取窗口内标题");
    // 统计可序列化（purify_stats 落库口径）
    let json = serde_json::to_string(&result.stats).expect("stats serializable");
    assert!(json.contains("chapters") && json.contains("titled_chapters"));
}

/// 会话31 实证：结构渲染词汇表块——术语候选 → 尾部词汇表（锚点回跳）。
#[test]
fn session31_structure_glossary_block() {
    // Arrange：术语"项目章程"在 kept 段出现（锚点）；无 kept 出现术语不带锚点
    let segments = vec![asr(1, 12_000, 15_000, "这是项目章程的要点")];
    let mut result = run("测试", &segments, &[]);
    apply_session_warning(&mut result, "finished");
    refresh_screen_points(&mut result);
    let glossary = vec![
        crate::glossary::GlossaryCandidate {
            term: "项目章程".to_string(),
            ocr_count: 5,
            asr_count: 1,
            score: 8.0,
        },
        crate::glossary::GlossaryCandidate {
            term: "WBS".to_string(),
            ocr_count: 3,
            asr_count: 0,
            score: 3.0,
        },
    ];
    // Act
    let _ = crate::structure_note::render_note_structure(
        &mut result,
        &[],
        &[],
        &glossary,
        &crate::structure_note::NoteStructureConfig::default(),
    );
    // Assert：词汇表块在尾部；命中术语带 [MM:SS] 锚点；未命中不带；统计落库
    assert!(result.markdown.ends_with("词汇表\n\n- [00:12] 项目章程（画面 ×5 / 语音 ×1）\n- WBS（画面 ×3 / 语音 ×0）"));
    assert_eq!(result.stats.glossary_terms, 2);
    let json = serde_json::to_string(&result.stats).expect("stats serializable");
    assert!(json.contains("glossary_terms"));
}
