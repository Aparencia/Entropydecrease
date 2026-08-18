//! 字幕解析单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 subtitle.rs 以 #[cfg(test)] #[path] 引入，保持实现文件 ≤300 行。

use std::path::Path;

use crate::subtitle::{
    decode_subtitle_bytes, parse_subtitle, parse_subtitle_file, strip_ass_overrides, SubtitleFormat,
};

fn seg(start_ms: u64, end_ms: u64, text: &str) -> crate::fusion::SubtitleSegment {
    crate::fusion::SubtitleSegment { start_ms, end_ms, text: text.to_string() }
}

// ── SRT ──────────────────────────────────────────────

const SRT_SAMPLE: &str = "\
1
00:00:01,500 --> 00:00:04,000
第一句字幕

2
00:00:05,000 --> 00:00:08,000
第二句字幕
跨两行
";

#[test]
fn srt_parses_cues_with_multi_line_text() {
    // Arrange & Act
    let segs = parse_subtitle(SRT_SAMPLE, SubtitleFormat::Srt);
    // Assert：两条 cue，跨行文本合并为一段
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[0], seg(1500, 4000, "第一句字幕"));
    assert_eq!(segs[1], seg(5000, 8000, "第二句字幕\n跨两行"));
}

#[test]
fn srt_handles_crlf_and_indexless_blocks() {
    // Arrange：\r\n 换行 + 无序号块（部分工具导出）
    let text = "00:00:01,000 --> 00:00:02,000\r\n你好\r\n\r\n00:00:03,000 --> 00:00:04,000\r\n世界";
    // Act
    let segs = parse_subtitle(text, SubtitleFormat::Srt);
    // Assert
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[0].text, "你好");
    assert_eq!(segs[1].start_ms, 3000);
}

#[test]
fn srt_skips_empty_and_malformed_blocks() {
    // Arrange：空文本块 + 时间行损坏块 + 正常块（块间以空行分隔）
    let text = "\
1
00:00:01,000 --> 00:00:02,000
   

坏时间
xx --> yy
正常

1
00:00:03,000 --> 00:00:04,000
有效
";
    // Act
    let segs = parse_subtitle(text, SubtitleFormat::Srt);
    // Assert：只保留有效块
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].text, "有效");
}

// ── VTT ──────────────────────────────────────────────

const VTT_SAMPLE: &str = "\
WEBVTT

STYLE
::cue { color: yellow }

NOTE 这是一段注释
注释内容

00:00:01.000 --> 00:00:04.000 align:start position:0%
第一句

00:00:05.000 --> 00:00:06.000
第二句
";

#[test]
fn vtt_parses_cues_and_skips_headers() {
    // Arrange & Act
    let segs = parse_subtitle(VTT_SAMPLE, SubtitleFormat::Vtt);
    // Assert：STYLE/NOTE 不产出段；cue 设置行不影响时间解析
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[0], seg(1000, 4000, "第一句"));
    assert_eq!(segs[1], seg(5000, 6000, "第二句"));
}

#[test]
fn vtt_cue_without_end_gets_default_duration() {
    // Arrange：直播式无 end 时间
    let text = "WEBVTT\n\n00:00:10.000 --> 00:00:20.000\n带结束\n\n00:00:30.000 --> \n无结束\n";
    // Act
    let segs = parse_subtitle(text, SubtitleFormat::Vtt);
    // Assert：无 end cue 按 2000ms 默认时长补齐
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[1].start_ms, 30_000);
    assert_eq!(segs[1].end_ms, 32_000);
}

#[test]
fn vtt_minutes_only_timestamp() {
    // Act & Assert：MM:SS.mmm 无小时形式（VTT 允许）
    let text = "WEBVTT\n\n01:30.500 --> 01:35.000\n短格式\n";
    let segs = parse_subtitle(text, SubtitleFormat::Vtt);
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].start_ms, 90_500);
}

// ── ASS ──────────────────────────────────────────────

const ASS_SAMPLE: &str = "\
[Script Info]
Title: 示例

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,第一句{\\an8}字幕
Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,第二句,带逗号
Comment: 0,0:00:09.00,0:00:10.00,Default,,0,0,0,,不应出现
";

#[test]
fn ass_parses_events_and_strips_overrides() {
    // Arrange & Act
    let segs = parse_subtitle(ASS_SAMPLE, SubtitleFormat::Ass);
    // Assert：两条 Dialogue；{\\an8} 覆盖标签被剥离；Text 内逗号保留；Comment 跳过
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[0], seg(1000, 4000, "第一句字幕"));
    assert_eq!(segs[1], seg(5000, 8000, "第二句,带逗号"));
}

#[test]
fn ass_centisecond_timestamp() {
    // Act & Assert：ASS 百分秒（0:00:01.50 = 1500ms）
    let text = "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.50,0:00:03.75,Default,,0,0,0,,测试\n";
    let segs = parse_subtitle(text, SubtitleFormat::Ass);
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].start_ms, 1500);
    assert_eq!(segs[0].end_ms, 3750);
}

// ── 编码探测 ─────────────────────────────────────────

#[test]
fn utf8_bytes_decode_directly() {
    // Arrange & Act：纯 UTF-8 字节
    let decoded = decode_subtitle_bytes("第一句".as_bytes());
    // Assert
    assert_eq!(decoded, "第一句");
}

#[test]
fn utf8_bom_is_stripped() {
    // Arrange & Act：带 BOM 的 UTF-8
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice("字幕".as_bytes());
    let decoded = decode_subtitle_bytes(&bytes);
    // Assert：BOM 不进入文本
    assert_eq!(decoded, "字幕");
}

#[test]
#[allow(invalid_from_utf8)] // 故意用非 UTF-8 GBK 字节验证回退路径
fn gbk_bytes_fallback_decode() {
    // Arrange："熵减" 的 GBK 字节（EC D8 BC F5，Windows CP936 实测）；同时验证严格 UTF-8 必然失败
    let gbk = [0xECu8, 0xD8, 0xBC, 0xF5];
    assert!(std::str::from_utf8(&gbk).is_err());
    // Act
    let decoded = decode_subtitle_bytes(&gbk);
    // Assert：回退 GBK 成功解码（Windows 平台）；非 Windows 走 lossy 也不 panic
    #[cfg(target_os = "windows")]
    assert_eq!(decoded, "熵减");
    #[cfg(not(target_os = "windows"))]
    assert!(!decoded.is_empty());
}

// ── 时间戳 ───────────────────────────────────────────

#[test]
fn timestamp_formats_normalize() {
    use crate::subtitle::parse_timestamp;
    // Act & Assert：逗号/点/无小数/百分秒全兼容
    assert_eq!(parse_timestamp("00:00:01,500"), Some(1500));
    assert_eq!(parse_timestamp("00:00:01.500"), Some(1500));
    assert_eq!(parse_timestamp("00:01:02"), Some(62_000));
    assert_eq!(parse_timestamp("1:02:03.45"), Some(3_723_450));
    assert_eq!(parse_timestamp("00:00:01.5"), Some(1500));
    assert_eq!(parse_timestamp("bad"), None);
    assert_eq!(parse_timestamp("00:00:01:02"), None); // 段数非法
}

#[test]
fn ass_override_stripping_handles_nested_braces() {
    // Arrange：连续标签 + 普通文本
    let text = "{\\an8}{\\pos(10,20)}标题{\\i1}斜体{\\i0}";
    // Act
    let stripped = strip_ass_overrides(text);
    // Assert：所有 {...} 剥离，正文保留
    assert_eq!(stripped, "标题斜体");
}

// ── 文件入口（真实小文件）────────────────────────────

#[test]
fn parse_subtitle_file_reads_disk() {
    // Arrange：临时目录写一个 SRT（tempfile 隔离，不触碰真实数据）
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("sample.srt");
    std::fs::write(&path, SRT_SAMPLE).expect("write");
    // Act
    let segs = parse_subtitle_file(&path).expect("parse");
    // Assert
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[0].text, "第一句字幕");
}

#[test]
fn parse_subtitle_file_rejects_unknown_extension() {
    // Arrange & Act：不支持的扩展名 → 可操作错误
    let result = parse_subtitle_file(Path::new("subtitle.txt"));
    // Assert
    assert!(result.is_err());
}

#[test]
fn subtitle_file_size_limit_guards_memory() {
    use crate::subtitle::check_subtitle_file_size;
    // Act & Assert：恰好 50MB 通过；超过拒绝（TD-038）
    assert!(check_subtitle_file_size(50 * 1024 * 1024).is_ok());
    assert!(check_subtitle_file_size(50 * 1024 * 1024 + 1).is_err());
    assert!(check_subtitle_file_size(0).is_ok());
}
