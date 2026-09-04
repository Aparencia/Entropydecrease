//! 检索索引·节级切块纯函数（REQ-258，v0.19.0；设计 §5.1）。
//!
//! @ai-context: chunk 源 = 净化后文本（notes.content / fragments.text）——原始
//!              转写/OCR 原料不入索引（噪声毁检索质量，ADR-029 决策 2）。
//!              节级粒度（heading-aware）：按 markdown 标题行切块，记录
//!              (heading, char_start, char_end) 供命中溯源/跳转定位；
//!              ≤800 字符硬切（2026-09-04 审查勘误：中文约 1 字符/token，
//!              800 字可超 bge 512 token 窗——超窗尾段由分词器截断不入向量，
//!              词法检索不受影响；收紧本上界需同步 kb_chunk_tests golden）。
//! @ai-context: 纯函数零副作用——TDD golden 先例（chapter_detect/
//!              note_filter 同款）；行切分依据 split_inclusive('\n')，切块
//!              text 恒等于源文本的连续切片（char 区间与内容严格对应）。

/// 单块硬切字符上界（800——2026-09-04 勘误注释见模块头：中文 1 字符/token
/// 可超 512 窗，尾段由分词器截断；超长单段循环硬切，不吞内容）。
pub const HARD_CHUNK_CHARS: usize = 800;

/// 切块结果（source_id/embedding 由索引层补，本层只管文本切分）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KbChunk {
    /// 源内顺序（0 起；节内/整篇通用口径）。
    pub ord: usize,
    /// 所属节标题（标题行去 '#' 后的文本；无标题/标题外正文 → None）。
    pub heading: Option<String>,
    /// 字符区间（对源文本的 char 偏移——snippet/跳转定位基准，非字节）。
    pub char_start: usize,
    pub char_end: usize,
    pub text: String,
}

/// 笔记切块（heading-aware：标题行起新块；代码围栏/缩进代码内不认标题）。
pub fn chunk_note(text: &str) -> Vec<KbChunk> {
    chunk(text, true)
}

/// 碎片切块（纯文本无结构——整块入列；超长仍按 800 硬切兜底）。
pub fn chunk_fragment(text: &str) -> Vec<KbChunk> {
    chunk(text, false)
}

fn chunk(text: &str, heading_aware: bool) -> Vec<KbChunk> {
    if text.chars().all(char::is_whitespace) {
        return Vec::new();
    }
    let mut out: Vec<KbChunk> = Vec::new();
    let mut ord = 0usize;
    let mut heading: Option<String> = None;
    let mut buf = String::new();
    let mut buf_start = 0usize; // buf 首字符在源文本的 char 偏移
    let mut cursor = 0usize; // 当前行的 char 偏移
    let mut fence = false; // ``` / ~~~ 围栏内不解析标题（防代码块内容误切）

    for line in text.split_inclusive('\n') {
        let line_chars = line.chars().count();
        let trimmed = line.trim();
        if is_fence_marker(trimmed) {
            // 开/关围栏翻转；围栏行本身不认标题（翻转发生在标题判定之前无碍）
            fence = !fence;
        }
        let heading_line = if heading_aware && !fence {
            parse_heading(line)
        } else {
            None
        };
        if let Some(h) = heading_line {
            // 标题行 = 新块起点：先收口上一块，再以本行起新块
            flush_chunk(&mut out, &mut ord, &mut buf, &mut buf_start, &heading);
            heading = Some(h);
            buf_start = cursor;
        }
        if buf.is_empty() && line.chars().all(char::is_whitespace) {
            // 块首纯空白行不入块（防空白伪块污染索引）；块中/块尾空白保留
        } else {
            if buf.is_empty() {
                buf_start = cursor;
            }
            buf.push_str(line);
            // 超上界即时切走前缀块（尾部保留继续聚合——段落聚合语义）
            overflow_split(&mut out, &mut ord, &mut buf, &mut buf_start, &heading);
        }
        cursor += line_chars;
    }
    flush_chunk(&mut out, &mut ord, &mut buf, &mut buf_start, &heading);
    out
}

/// 缓冲超上界时切走前缀块（保留尾部——调用后缓冲 ≤800 或为空）。
fn overflow_split(
    out: &mut Vec<KbChunk>,
    ord: &mut usize,
    buf: &mut String,
    buf_start: &mut usize,
    heading: &Option<String>,
) {
    while buf.chars().count() > HARD_CHUNK_CHARS {
        let piece: String = buf.chars().take(HARD_CHUNK_CHARS).collect();
        let start = *buf_start;
        let end = start + piece.chars().count();
        out.push(KbChunk {
            ord: *ord,
            heading: heading.clone(),
            char_start: start,
            char_end: end,
            text: piece,
        });
        *ord += 1;
        *buf_start = end;
        *buf = buf.chars().skip(HARD_CHUNK_CHARS).collect();
    }
}

/// 收口当前块（先切前缀再整块出——块间 char 区间严格连续）。
fn flush_chunk(
    out: &mut Vec<KbChunk>,
    ord: &mut usize,
    buf: &mut String,
    buf_start: &mut usize,
    heading: &Option<String>,
) {
    overflow_split(out, ord, buf, buf_start, heading);
    if !buf.is_empty() {
        let start = *buf_start;
        let end = start + buf.chars().count();
        out.push(KbChunk {
            ord: *ord,
            heading: heading.clone(),
            char_start: start,
            char_end: end,
            text: std::mem::take(buf),
        });
        *ord += 1;
        buf.clear();
    }
}

/// markdown 围栏识别（``` / ~~~ 前缀——含 4+ 反引号变体；行内反引号因
/// trim 后前缀不匹配不会误判；围栏未闭合属容错边界：其后标题照常切块）。
fn is_fence_marker(trimmed: &str) -> bool {
    trimmed.starts_with("```") || trimmed.starts_with("~~~")
}

/// 解析标题行（CommonMark 口径：≤3 空格缩进 + 1~6 个 '#' + 空白或行尾；
/// `#标题` 无空白不算标题；7+ '#' / 4+ 空格缩进（代码块）视为正文——诚实不猜）。
fn parse_heading(raw_line: &str) -> Option<String> {
    let b = raw_line.as_bytes();
    if b.first() == Some(&b'\t') {
        return None; // tab 缩进 = 代码块语义，不认标题
    }
    let mut i = 0usize;
    while i < b.len() && b[i] == b' ' && i < 3 {
        i += 1;
    }
    let mut hashes = 0usize;
    while i < b.len() && b[i] == b'#' {
        i += 1;
        hashes += 1;
    }
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &raw_line[i..];
    match rest.chars().next() {
        None | Some('\n') | Some('\r') => return None, // 空标题不切块
        Some(c) if c != ' ' && c != '\t' => return None, // `#标题` 无分隔空白
        _ => {}
    }
    let title = rest.trim();
    if title.is_empty() {
        return None;
    }
    Some(title.to_string())
}

#[cfg(test)]
#[path = "kb_chunk_tests.rs"]
mod tests;
