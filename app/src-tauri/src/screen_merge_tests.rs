//! screen_merge 纯函数单测（v0.7.3 REQ-155/158，ADR-015）。
//!
//! @ai-context: 覆盖屏聚类/相似度/行合并/角色分类四组边界：
//!              空集、全等、截断变体、翻回旧页、帧组原子性、误并防护。

use crate::screen_merge::*;
use crate::types::TextBox;

/// 测试辅助：构造输入块（bbox 可选）。
fn blk(ts: u64, text: &str, bbox: Option<(f32, f32, f32, f32)>) -> ScreenBlockInput {
    ScreenBlockInput {
        timestamp_ms: ts,
        text: text.to_string(),
        score: 0.9,
        region_kind: None,
        bbox: bbox.map(|(x, y, w, h)| TextBox { x, y, w, h }),
    }
}

// ── normalize ────────────────────────────────────────────────

#[test]
fn normalize_unifies_forms_and_strips_punct() {
    // Act/Assert：全角转半角、去空白与标点、保留 CJK/字母/数字
    assert_eq!(normalize("为什么高手管理者思路特别清晰？"), "为什么高手管理者思路特别清晰");
    assert_eq!(normalize("ＡＢＣ １２３"), "ABC123");
    assert_eq!(normalize("功能/目标"), "功能目标");
    assert_eq!(normalize("  空白  "), "空白");
}

#[test]
fn normalize_empty_and_punct_only() {
    // Act/Assert：空串与纯标点归一化为空（相似度判 0 的输入）
    assert_eq!(normalize(""), "");
    assert_eq!(normalize("，。！？…"), "");
}

// ── block_similarity ─────────────────────────────────────────

#[test]
fn block_similarity_prefix_variant_is_full_match() {
    // Arrange：会话29 实证——截断变体是标题的前缀子串
    let full = "为什么高手管理者思路特别清晰？因为他们有结构化思维";
    let truncated = "为什么高手管";
    // Act/Assert：短文本完全包含于长文本 → 1.0（截断抖动吸收）
    assert_eq!(block_similarity(truncated, full), 1.0);
    assert_eq!(block_similarity(full, truncated), 1.0);
}

#[test]
fn block_similarity_semantic_different_short_word_low() {
    // Arrange：图注标签 vs 含该词的长句——语义不同不应匹配
    // Act/Assert：2/9 包含率 < 阈值 0.7
    let s = block_similarity("要素", "要素之间的联关系");
    assert!(s < 0.7, "包含率应低于匹配阈值，实际 {}", s);
}

#[test]
fn block_similarity_single_char_guard() {
    // Arrange：单字符"一"与任意长句
    // Act/Assert：单字符只与单字符匹配（防"一"匹配"一般系统思维…"）
    assert_eq!(block_similarity("一", "一般系统思维创始人贝塔"), 0.0);
    assert_eq!(block_similarity("一", "一"), 1.0);
    assert_eq!(block_similarity("", "系统"), 0.0);
}

// ── screen_similarity ────────────────────────────────────────

#[test]
fn screen_similarity_same_screen_variants_high() {
    // Arrange：会话29 同屏两帧（截断变体集合）
    let prev = vec![
        "为什么高手管理者思路特别清晰？".to_string(),
        "系统思维".to_string(),
        "要素".to_string(),
        "连接".to_string(),
        "功能/目标".to_string(),
    ];
    let next = vec![
        "为什么高手管".to_string(),
        "系统思维".to_string(),
        "要素".to_string(),
        "连接".to_string(),
        "功能/目标".to_string(),
    ];
    // Act/Assert：全部块匹配 → 1.0（同屏）
    assert_eq!(screen_similarity(&prev, &next), 1.0);
}

#[test]
fn screen_similarity_page_flip_low() {
    // Arrange：翻页后仅共享页眉"系统思维"（1/6 覆盖率 < 0.6）
    let prev = vec![
        "系统思维".to_string(),
        "一般系统思创始人贝塔郎非认为".to_string(),
        "素组成的表现出新功能的整体".to_string(),
        "在其特殊位置上起着特定作用".to_string(),
        "要素".to_string(),
        "连接".to_string(),
    ];
    let next = vec![
        "系统思维".to_string(),
        "牛顿第一定律与万有引力".to_string(),
        "苹果为什么往下掉".to_string(),
        "存量与变量".to_string(),
        "功能/目标".to_string(),
    ];
    // Act/Assert：1/6 ≈ 0.17 < 0.6 → 判翻页
    assert!(screen_similarity(&prev, &next) < SCREEN_SIM_THRESHOLD);
}

#[test]
fn screen_similarity_empty_inputs_zero() {
    // Act/Assert：空集合相似度为 0（防御）
    assert_eq!(screen_similarity(&[], &["a".to_string()]), 0.0);
    assert_eq!(screen_similarity(&["a".to_string()], &[]), 0.0);
}

// ── cluster_blocks_into_screens ──────────────────────────────

#[test]
fn cluster_merges_same_screen_variants() {
    // Arrange：同一屏内容在 3 帧重复（截断抖动），间隔 < gap
    let blocks = vec![
        blk(2_000, "为什么高手管理者思路特别清晰？", None),
        blk(2_000, "系统思维", None),
        blk(30_000, "为什么高手管", None),
        blk(30_000, "系统思维", None),
        blk(60_000, "为什么", None),
        blk(60_000, "系统思维", None),
    ];
    // Act
    let screens = cluster_blocks_into_screens(&blocks, CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD);
    // Assert：全部同屏（1 屏，区间 2000-60000）
    assert_eq!(screens.len(), 1);
    assert_eq!(screens[0].first_seen_ms, 2_000);
    assert_eq!(screens[0].last_seen_ms, 60_000);
    assert_eq!(screens[0].blocks.len(), 6);
}

#[test]
fn cluster_splits_on_gap() {
    // Arrange：同一内容长时间间隔再出现（翻回旧页）= 新屏
    // gap 阈值 120s（按实测帧间隔校准）：8s 间隔同屏、130s 间隔分屏
    let blocks = vec![
        blk(2_000, "系统思维", None),
        blk(10_000, "系统思维", None),
        blk(140_000, "系统思维", None),
    ];
    // Act：gap 130s > 120s → 第三帧独立成屏
    let screens = cluster_blocks_into_screens(&blocks, CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD);
    // Assert
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].last_seen_ms, 10_000);
    assert_eq!(screens[1].first_seen_ms, 140_000);
}

#[test]
fn cluster_frame_group_atomicity_keeps_shared_header() {
    // Arrange：新页帧组含共享页眉"系统思维"+ 全新正文（帧组整体相似低 → 新屏）
    let blocks = vec![
        blk(2_000, "系统思维", None),
        blk(2_000, "一般系统思创始人贝塔郎非认为", None),
        blk(2_000, "素组成的表现出新功能的整体", None),
        blk(30_000, "系统思维", None),
        blk(30_000, "牛顿第一定律", None),
        blk(30_000, "苹果为什么往下掉", None),
    ];
    // Act
    let screens = cluster_blocks_into_screens(&blocks, CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD);
    // Assert：2 屏；共享页眉随第二帧组归属新屏（不丢内容）
    assert_eq!(screens.len(), 2);
    assert!(screens[1].blocks.iter().any(|b| b.text == "系统思维"));
    assert!(screens[1].blocks.iter().any(|b| b.text == "牛顿第一定律"));
}

#[test]
fn cluster_empty_and_blank_input() {
    // Act/Assert：空输入与纯空白块 → 无屏（防御）
    assert!(cluster_blocks_into_screens(&[], CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD).is_empty());
    let blank = vec![blk(1_000, "   ", None)];
    assert!(cluster_blocks_into_screens(&blank, CLUSTER_GAP_MS, SCREEN_SIM_THRESHOLD).is_empty());
}

// ── line_merge ───────────────────────────────────────────────

#[test]
fn line_merge_joins_det_split_sentence() {
    // Arrange：会话29 实证——同一逻辑行被 det 切成两块（y 同、x 相邻）
    let blocks = vec![
        blk(36_404, "一般系统思创始人贝塔郎非认为：系统是由相互联系，相互作用的若干要", Some((100.0, 300.0, 700.0, 40.0))),
        blk(36_404, "素组成的表现出新功能的整体。", Some((810.0, 300.0, 300.0, 40.0))),
    ];
    // Act
    let lines = line_merge(&blocks);
    // Assert：同行拼接为完整句
    assert_eq!(lines.len(), 1);
    assert!(lines[0].text.contains("若干要素组成"), "应拼成完整句，实际: {}", lines[0].text);
}

#[test]
fn line_merge_keeps_distinct_rows_separate() {
    // Arrange：两行正文（y 差 80 > 行高 40×0.6=24）
    let blocks = vec![
        blk(36_404, "第一行内容", Some((100.0, 300.0, 300.0, 40.0))),
        blk(36_404, "第二行内容", Some((100.0, 380.0, 300.0, 40.0))),
    ];
    // Act
    let lines = line_merge(&blocks);
    // Assert：两行独立
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0].text, "第一行内容");
    assert_eq!(lines[1].text, "第二行内容");
}

#[test]
fn line_merge_x_overlap_is_same_line() {
    // Arrange：y 相同、x 重叠（det 重叠框）
    let blocks = vec![
        blk(36_404, "左", Some((100.0, 300.0, 80.0, 40.0))),
        blk(36_404, "右", Some((160.0, 300.0, 80.0, 40.0))),
    ];
    // Act：x 间隔 = 160-180 = -20（重叠）
    let lines = line_merge(&blocks);
    // Assert：同行拼接
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].text, "左右");
}

#[test]
fn line_merge_without_bbox_falls_back_per_block() {
    // Arrange：无 bbox 块
    let blocks = vec![blk(1_000, "甲", None), blk(2_000, "乙", None)];
    // Act
    let lines = line_merge(&blocks);
    // Assert：降级每块一行（height=0 供角色分类识别）
    assert_eq!(lines.len(), 2);
    assert!(lines.iter().all(|l| l.height == 0.0));
}

// ── dedupe_blocks ────────────────────────────────────────────

#[test]
fn dedupe_keeps_first_of_same_position() {
    // Arrange：同屏两帧同位置标题（完整版 + 截断变体）
    let blocks = vec![
        blk(2_000, "为什么高手管理者思路特别清晰？", Some((100.0, 100.0, 600.0, 50.0))),
        blk(30_000, "为什么高手管", Some((100.0, 100.0, 300.0, 50.0))),
        blk(30_000, "系统思维", Some((100.0, 170.0, 200.0, 36.0))),
    ];
    // Act
    let kept = dedupe_blocks(&blocks);
    // Assert：完整版优先保留；系统思维保留
    assert_eq!(kept.len(), 2);
    assert!(kept.iter().any(|b| b.text == "为什么高手管理者思路特别清晰？"));
    assert!(!kept.iter().any(|b| b.text == "为什么高手管"));
}

#[test]
fn dedupe_distinct_positions_kept() {
    // Arrange：同屏不同位置相似文本（标签 vs 正文）——位置不重叠 → 都保留
    let blocks = vec![
        blk(2_000, "要素", Some((100.0, 700.0, 80.0, 26.0))),
        blk(2_000, "要素之间的联关系", Some((100.0, 240.0, 200.0, 30.0))),
    ];
    // Act
    let kept = dedupe_blocks(&blocks);
    // Assert：两条都保留（不同位置，不互斥）
    assert_eq!(kept.len(), 2);
}

#[test]
fn dedupe_without_bbox_by_text() {
    // Arrange：无 bbox 跨帧重复（旧数据降级路径）
    let blocks = vec![blk(2_000, "系统思维", None), blk(30_000, "系统思维", None)];
    // Act
    let kept = dedupe_blocks(&blocks);
    // Assert：文本相似 → 去重
    assert_eq!(kept.len(), 1);
}

// ── classify_roles ───────────────────────────────────────────

/// 测试辅助：构造行（bbox 全 0 的空白行除外）。
fn line(text: &str, top: f32, h: f32) -> MergedLine {
    MergedLine { text: text.to_string(), top, bottom: top + h, left: 0.0, right: 800.0, height: h }
}

#[test]
fn roles_title_body_labels() {
    // Arrange：会话29 一屏——大标题 + 页眉 + 正文两行 + 图注标签
    // 屏高 = 846-100 = 746；标题 50/746=6.7% ≥6%；页眉 36/746=4.8% <6%（非标题）；
    // 正文 30/746=4.0% <6%；标签 26/746=3.5% <6%
    let lines = vec![
        line("为什么高手管理者思路特别清晰？", 100.0, 50.0),
        line("系统思维", 170.0, 36.0),
        line("一般系统思创始人贝塔郎非认为：系统是由相互联系的若干要素组成的整体。", 240.0, 30.0),
        line("在其特殊位置上起着特定作用。", 290.0, 30.0),
        line("要素", 700.0, 26.0),
        line("连接", 760.0, 26.0),
        line("功能/目标", 820.0, 26.0),
    ];
    // Act
    let roles = classify_roles(&lines);
    // Assert：标题=字高最大者；页眉/标签归标签；正文独立
    assert_eq!(roles.title.as_deref(), Some("为什么高手管理者思路特别清晰？"));
    assert!(roles.labels.iter().any(|l| l == "系统思维"), "页眉大字块归标签组");
    assert!(roles.labels.iter().any(|l| l == "要素"));
    assert!(roles.labels.iter().any(|l| l == "功能/目标"));
    assert!(roles.body.iter().any(|b| b.contains("一般系统思创始人")));
}

#[test]
fn roles_without_bbox_all_body() {
    // Arrange：无 bbox 行（height=0）
    let lines = vec![line("没有位置信息", 0.0, 0.0), line("都是正文", 0.0, 0.0)];
    // Act
    let roles = classify_roles(&lines);
    // Assert：诚实降级——无标题无标签
    assert_eq!(roles.title, None);
    assert!(roles.labels.is_empty());
    assert_eq!(roles.body.len(), 2);
}

#[test]
fn label_requires_no_function_word() {
    // Arrange：真实屏高（~720px）——短句含虚词（句法证据）→ 正文；短词 → 标签
    let lines = vec![
        line("占位顶部", 100.0, 20.0),
        line("要素", 200.0, 26.0),
        line("系统是整体", 300.0, 30.0),
        line("占位底部", 800.0, 20.0),
    ];
    // Act（屏高 = 820-100 = 720；26/720=3.6%、30/720=4.2% 均 <6% 非标题）
    let roles = classify_roles(&lines);
    // Assert
    assert!(roles.labels.iter().any(|l| l == "要素"));
    assert!(roles.body.iter().any(|b| b == "系统是整体"));
}
