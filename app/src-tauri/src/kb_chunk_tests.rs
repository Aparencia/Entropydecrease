//! kb_chunk.rs 单测（TDD golden——纯函数切块矩阵；设计 §5.1 验收）。

use crate::kb_chunk::{HARD_CHUNK_CHARS, KbChunk, chunk_fragment, chunk_note};

/// 断言集合不变量：char 区间无空洞无重叠、覆盖全文、文本与区间一致。
fn assert_contiguous_cover(source: &str, chunks: &[KbChunk]) {
    let total = source.chars().count();
    let mut expect_start = 0usize;
    for c in chunks {
        assert_eq!(c.char_start, expect_start, "char 区间不连续（空洞/重叠）");
        assert!(c.char_end >= c.char_start);
        assert_eq!(c.char_end - c.char_start, c.text.chars().count());
        expect_start = c.char_end;
    }
    assert_eq!(expect_start, total, "切块未覆盖全文");
}

#[test]
fn empty_and_whitespace_yield_no_chunks() {
    // Arrange/Act/Assert
    assert!(chunk_note("").is_empty());
    assert!(chunk_note("   \n\n\t  ").is_empty());
    assert!(chunk_note("\n\n").is_empty());
    assert!(chunk_fragment("  ").is_empty());
}

#[test]
fn plain_paragraph_single_chunk() {
    // Arrange
    let text = "第一段。\n\n第二段。";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].heading, None);
    assert_eq!(chunks[0].text, text);
    assert_contiguous_cover(text, &chunks);
}

#[test]
fn headings_split_into_sections() {
    // Arrange
    let text = "# 第一章 打底\n\n打底是基础。\n\n## 1.1 手法\n\n少量多次。";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0].heading.as_deref(), Some("第一章 打底"));
    assert!(chunks[0].text.contains("打底是基础"));
    assert_eq!(chunks[1].heading.as_deref(), Some("1.1 手法"));
    assert!(chunks[1].text.contains("少量多次"));
    assert!(chunks[0].text.contains("# 第一章 打底"));
    assert_contiguous_cover(text, &chunks);
}

#[test]
fn text_before_first_heading_is_unnamed_chunk() {
    // Arrange
    let text = "导语正文。\n\n# 标题\n\n标题下正文。";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0].heading, None);
    assert_eq!(chunks[1].heading.as_deref(), Some("标题"));
    assert_contiguous_cover(text, &chunks);
}

#[test]
fn no_space_after_hash_is_body_not_heading() {
    // Arrange
    let text = "#不是标题\n\n继续正文";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].heading, None);
}

#[test]
fn seven_hashes_is_body_not_heading() {
    // Arrange（7 个 '#' 非合法标题——诚实当正文）
    let text = "####### 装饰线\n正文";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].heading, None);
}

#[test]
fn heading_inside_code_fence_not_split() {
    // Arrange：围栏内 '# 注释' 不得切块
    let text = "```js\n# 这不是标题\nlet a = 1;\n```\n\n# 真标题\n正文";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 2, "围栏内标题不应切块");
    assert_eq!(chunks[0].heading, None);
    assert!(chunks[0].text.contains("let a = 1;"));
    assert_eq!(chunks[1].heading.as_deref(), Some("真标题"));
}

#[test]
fn indented_code_hash_is_body() {
    // Arrange：4 空格缩进 = 代码块语义，'#' 不切块
    let text = "    # 缩进代码\n正文继续";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].heading, None);
}

#[test]
fn blank_lines_never_form_standalone_chunks() {
    // Arrange
    let text = "# H\n\n\n\n正文\n\n";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1, "纯空白不得成为独立块");
    assert_contiguous_cover(text, &chunks);
}

#[test]
fn long_paragraph_hard_cuts_at_800() {
    // Arrange：1600+ 中文字符单段（无标题）——循环硬切
    let text: String = (0..(HARD_CHUNK_CHARS * 2 + 40))
        .map(|i| char::from_u32('中' as u32 + (i % 10) as u32).unwrap())
        .collect();
    // Act
    let chunks = chunk_note(&text);
    // Assert
    assert_eq!(chunks.len(), 3, "1600+40 字符应切 3 块");
    assert!(chunks.iter().all(|c| c.text.chars().count() <= HARD_CHUNK_CHARS));
    assert!(chunks.iter().all(|c| c.heading.is_none()));
    assert_contiguous_cover(&text, &chunks);
    assert_eq!(
        chunks.iter().map(|c| c.text.chars().count()).sum::<usize>(),
        text.chars().count(),
        "硬切不吞字"
    );
}

#[test]
fn long_section_keeps_heading_across_pieces() {
    // Arrange：大节下两块，小节保持各自 heading 与 ord
    let body1: String = "甲".repeat(HARD_CHUNK_CHARS + 100);
    let text = format!("# 长节\n\n{}\n\n## 小节\n\n乙", body1);
    // Act
    let chunks = chunk_note(&text);
    // Assert
    assert_eq!(chunks.len(), 3);
    assert_eq!(chunks[0].heading.as_deref(), Some("长节"));
    assert_eq!(chunks[1].heading.as_deref(), Some("长节"));
    assert_eq!(chunks[2].heading.as_deref(), Some("小节"));
    assert_eq!(chunks[0].ord, 0);
    assert_eq!(chunks[1].ord, 1);
    assert_eq!(chunks[2].ord, 2);
    assert_contiguous_cover(&text, &chunks);
}

#[test]
fn fragment_chunks_ignore_heading_markers() {
    // Arrange：碎片=纯文本，'#' 行不得切分（碎片不可变整块入列）
    let text = "# 素材标题\n内容……";
    // Act
    let chunks = chunk_fragment(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].heading, None);
}

#[test]
fn chunk_range_slices_match_source() {
    // Arrange：混合 ASCII/CJK/emoji——按 char 偏移切片须与源一致
    let text = "# 术语 \u{1F3AF}\n\nASCII text 123\n\n中文段落。";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_contiguous_cover(text, &chunks);
    // 逐字符重建 = 原文（字符级区间语义验证）
    let rebuilt: String = chunks.iter().flat_map(|c| c.text.chars()).collect();
    assert_eq!(rebuilt, text);
}

#[test]
fn adjacent_headings_each_own_chunk() {
    // Arrange
    let text = "# A\n\n# B\n\n# C";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 3);
    let heads: Vec<Option<&str>> = chunks.iter().map(|c| c.heading.as_deref()).collect();
    assert_eq!(heads, vec![Some("A"), Some("B"), Some("C")]);
    assert_contiguous_cover(text, &chunks);
}

#[test]
fn heading_with_trailing_markers_keeps_inner_text() {
    // Arrange：标题行尾残留标记去净（trim 语义）
    let text = "## 阴影画法  \n正文";
    // Act
    let chunks = chunk_note(text);
    // Assert
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].heading.as_deref(), Some("阴影画法"));
}
