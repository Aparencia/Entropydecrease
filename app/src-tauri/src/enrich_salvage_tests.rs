//! enrich_salvage.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：章节提取（chip 剥离/层级/去重/非标题排除）、标题归一化、
//!              逐块审查（坏块隔离好块照落/无章节放行/全坏整批失败/结构性拒绝）。

use crate::ai_enrich_protocol::{AiEnrichBlock, AiEnrichKind, AiEnrichResponse};
use crate::enrich_salvage::{
    chapter_titles_of, heading_text, normalize_title, salvage_blocks, strip_chip,
};

fn block(kind: AiEnrichKind, anchor: Option<&str>, content: &str) -> AiEnrichBlock {
    AiEnrichBlock {
        kind,
        anchor_ref: anchor.map(|s| s.to_string()),
        heading: format!("{}标题", kind.label()),
        content: content.to_string(),
        confidence: 0.9,
    }
}

#[test]
fn chapter_titles_extracts_order_dedupe_and_strips_chips() {
    // Arrange：混合正文——普通段/无序列表/一级标题/带时间戳 chip 的二级标题/
    // 重复标题/六级标题/无空格的 # 号行
    let md = "\
# 课程总览

正文段落，不是标题。

## 一、什么是反馈 [[⏱ 00:09]([[ts:9000]])]

列表项 - 也不是标题

### 1.1 子节

## 一、什么是反馈

###### 六级小节

#x 这不是标题（井号后无空格）
";
    // Act
    let titles = chapter_titles_of(md);
    // Assert：顺序、chip 剥离、去重、层级 1/2/3/6 均收录，非标题行全部排除
    assert_eq!(
        titles,
        vec!["课程总览", "一、什么是反馈", "1.1 子节", "六级小节"],
        "应保序去重并剥离 chip，实得 {:?}",
        titles
    );
}

#[test]
fn chapter_titles_empty_or_plain_text_yields_none() {
    assert!(chapter_titles_of("").is_empty());
    assert!(chapter_titles_of("没有标题的正文\n\n第二段\n").is_empty());
    assert!(
        chapter_titles_of("#\n##\n###x\n").is_empty(),
        "空井号/无空格不构成标题"
    );
}

#[test]
fn heading_text_recognizes_atx_levels_and_rejects_noise() {
    assert_eq!(heading_text("## 标题").as_deref(), Some("标题"));
    assert_eq!(
        heading_text("# 标题 [[⏱ 00:09]([[ts:9000]])]").as_deref(),
        Some("标题")
    );
    assert_eq!(heading_text("###### 深").as_deref(), Some("深"));
    assert_eq!(
        heading_text("####### 七级").as_deref(),
        None,
        "超过六级不是标题"
    );
    assert_eq!(heading_text("  ## 缩进标题  ").as_deref(), Some("缩进标题"));
    assert_eq!(
        heading_text("正文 ## 非行首"),
        None,
        "井号不在行首不构成标题"
    );
    assert_eq!(heading_text("#️⃣ emoji"), None, "井号后无空格不构成标题");
}

#[test]
fn normalize_title_strips_hashes_and_chips() {
    assert_eq!(
        normalize_title("## 一、什么是反馈 [[⏱ 00:09]([[ts:9000]])]"),
        "一、什么是反馈"
    );
    assert_eq!(normalize_title("  # 标题  "), "标题");
    assert_eq!(normalize_title("无修饰标题"), "无修饰标题");
    assert_eq!(strip_chip("标题 [[⏱ 01:02]([[ts:62000]])]"), "标题");
    assert_eq!(strip_chip("标题"), "标题");
}

// ── salvage_blocks：坏块隔离，好块照落 ───────────────────────────

#[test]
fn salvage_keeps_valid_and_drops_only_violating_blocks() {
    // Arrange：合法深度块（带锚点）+ 合法广度块 + 缺锚点深度块（目录含章节）
    let selected = vec![AiEnrichKind::D1, AiEnrichKind::B1, AiEnrichKind::D2];
    let resp = AiEnrichResponse {
        blocks: vec![
            block(AiEnrichKind::D1, Some("第一章"), "概念内容"),
            block(AiEnrichKind::B1, None, "前置知识"),
            block(AiEnrichKind::D2, None, "缺锚点步骤补全"),
        ],
    };
    // Act
    let out = salvage_blocks(
        resp,
        &selected,
        &["第一章".to_string(), "第二章".to_string()],
    )
    .expect("存在可落块不应整批失败");
    // Assert：坏块被隔离并给原因，好块照落
    assert_eq!(out.kept.len(), 2, "只有缺锚点深度块被丢弃");
    assert_eq!(out.dropped_reasons.len(), 1);
    assert!(
        out.dropped_reasons[0].contains("步骤补全") && out.dropped_reasons[0].contains("锚点引用"),
        "丢弃原因需点名子项与原因，实得: {}",
        out.dropped_reasons[0]
    );
}

#[test]
fn salvage_allows_anchorless_depth_when_note_has_no_chapters() {
    // Arrange：笔记无任何章节标题——深度块无法溯源是结构使然
    let selected = vec![AiEnrichKind::D1];
    let resp = AiEnrichResponse {
        blocks: vec![block(AiEnrichKind::D1, None, "无章节笔记的概念展开")],
    };
    // Act
    let out = salvage_blocks(resp, &selected, &[]).expect("无章节笔记缺锚点深度块应放行");
    // Assert：放行且无丢弃记录
    assert_eq!(out.kept.len(), 1);
    assert!(out.dropped_reasons.is_empty());
}

#[test]
fn salvage_drops_b6_url_breadth_anchor_and_unrequested_kind_individually() {
    // Arrange：B6 带 URL + 广度块带锚点 + 未勾选子项——三者各自违规
    let selected = vec![AiEnrichKind::B6, AiEnrichKind::B1];
    let mut url_b6 = block(AiEnrichKind::B6, None, "推荐《X》https://example.com/book");
    url_b6.heading = "资源标题".to_string();
    let resp = AiEnrichResponse {
        blocks: vec![
            url_b6,
            block(AiEnrichKind::B1, Some("章节"), "不应带锚点的广度块"),
            block(AiEnrichKind::D1, Some("第一章"), "未勾选却被返回"),
            block(AiEnrichKind::B1, None, "合规广度块"),
        ],
    };
    // Act
    let out = salvage_blocks(resp, &selected, &["第一章".to_string()]).expect("存在可落块");
    // Assert：三个坏块各自丢弃并留原因，合规块保留
    assert_eq!(out.kept.len(), 1);
    assert_eq!(out.kept[0].content, "合规广度块");
    assert_eq!(out.dropped_reasons.len(), 3);
    assert!(out.dropped_reasons.iter().any(|r| r.contains("防幻觉红线")));
    assert!(out
        .dropped_reasons
        .iter()
        .any(|r| r.contains("不应携带锚点")));
    assert!(out.dropped_reasons.iter().any(|r| r.contains("未请求")));
}

#[test]
fn salvage_drops_format_violations_with_reasons() {
    // Arrange：置信度越界 / 空内容 / 空标题——块级格式坏
    let selected = vec![AiEnrichKind::B1];
    let mut bad_conf = block(AiEnrichKind::B1, None, "x");
    bad_conf.confidence = 1.5;
    let mut empty_content = block(AiEnrichKind::B1, None, "   ");
    empty_content.heading = "有标题".to_string();
    let mut empty_heading = block(AiEnrichKind::B1, None, "内容在但无标题");
    empty_heading.heading = "  ".to_string();
    let resp = AiEnrichResponse {
        blocks: vec![
            bad_conf,
            empty_content,
            empty_heading,
            block(AiEnrichKind::B1, None, "好块"),
        ],
    };
    // Act
    let out = salvage_blocks(resp, &selected, &[]).expect("存在可落块");
    // Assert：格式坏块全丢、好块保留
    assert_eq!(out.kept.len(), 1);
    assert_eq!(out.dropped_reasons.len(), 3);
}

#[test]
fn salvage_fails_whole_batch_when_nothing_keepable() {
    // Arrange：唯一块违规（目录含章节却缺锚点）
    let selected = vec![AiEnrichKind::D1];
    let resp = AiEnrichResponse {
        blocks: vec![block(AiEnrichKind::D1, None, "缺锚点")],
    };
    // Act & Assert：全批失败且原因与原 validate 文案同口径
    let err =
        salvage_blocks(resp, &selected, &["第一章".to_string()]).expect_err("全批不合规必须失败");
    assert!(
        err.contains("深度块「概念展开」缺少锚点引用"),
        "错误需点名子项与原因，实得: {}",
        err
    );
}

#[test]
fn salvage_rejects_structural_emptiness_and_overflow() {
    let selected: Vec<AiEnrichKind> = AiEnrichKind::all().to_vec();
    // 空响应
    let err = salvage_blocks(AiEnrichResponse { blocks: vec![] }, &selected, &[])
        .expect_err("空响应必须失败");
    assert!(err.contains("缺少内容块"), "实得: {}", err);
    // 超量（51 块）
    let blocks: Vec<AiEnrichBlock> = (0..51)
        .map(|i| block(AiEnrichKind::B1, None, &format!("内容{}", i)))
        .collect();
    let err =
        salvage_blocks(AiEnrichResponse { blocks }, &selected, &[]).expect_err("超量必须失败");
    assert!(err.contains("超上限"), "实得: {}", err);
}
