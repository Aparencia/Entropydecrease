//! log_redact 单测（REQ-106，AAA 模式：Arrange / Act / Assert）。
//!
//! @ai-context: 覆盖四类：普通日志不动（错误信息诊断必需）、OCR 文本脱敏、
//!              会话标题脱敏、空行/边界（29 vs 30 字符阈值）。

use super::{redact_line, QUOTED_LONG_MIN};

/// 构造 n 个连续 CJK 字符（边界测试用）。
fn cjk_run(n: usize) -> String {
    "矩".repeat(n)
}

/// 普通日志（错误信息、短中文提示）不被误伤。
#[test]
fn redact_line_plain_error_log_unchanged() {
    // Arrange
    let asr_err = "[Asr] 引擎加载失败: sensevoice model load failed (exit code 3)";
    let live_log = "[LiveSession] 停止宽限 5s 到期，剩余积压音频丢弃（可观测）";
    let db_err = "[Db] 打开失败 C:\\Users\\test\\AppData\\Roaming\\entropy\\entropy.db";

    // Act
    let asr_out = redact_line(asr_err);
    let live_out = redact_line(live_log);
    let db_out = redact_line(db_err);

    // Assert
    assert_eq!(asr_out, asr_err);
    assert_eq!(live_out, live_log);
    assert_eq!(db_out, db_err);
}

/// 引号内会话标题（Debug 格式自带引号）→ 内容脱敏、引号保留。
#[test]
fn redact_line_quoted_session_title_redacted() {
    // Arrange
    let line = "[diag] 目标窗口: id=123 title=\"《线性代数》第三讲：特征值与特征向量\"";

    // Act
    let out = redact_line(line);

    // Assert
    assert_eq!(out, "[diag] 目标窗口: id=123 title=\"[redacted]\"");
}

/// 不带引号的连续 CJK 长文本（转写/OCR 段落）→ 脱敏，前缀保留。
#[test]
fn redact_line_long_cjk_text_redacted() {
    // Arrange
    let line = "[ScreenWorker] OCR: 今天这节课我们继续讲解矩阵的特征值分解方法以及其在图像处理中的应用场景和实际案例";

    // Act
    let out = redact_line(line);

    // Assert
    assert_eq!(out, "[ScreenWorker] OCR: [redacted]");
}

/// 引号内 OCR 单句（含 CJK）→ 脱敏。
#[test]
fn redact_line_quoted_ocr_text_redacted() {
    // Arrange
    let line = "[ScreenWorker] OCR: \"特征值分解是线性代数最重要的工具之一\"";

    // Act
    let out = redact_line(line);

    // Assert
    assert_eq!(out, "[ScreenWorker] OCR: \"[redacted]\"");
}

/// 中文引号包裹的文本同样脱敏。
#[test]
fn redact_line_chinese_quotes_redacted() {
    // Arrange
    let line = "[diag] 目标窗口: id=7 title=“特征值的几何意义”";

    // Act
    let out = redact_line(line);

    // Assert
    assert_eq!(out, "[diag] 目标窗口: id=7 title=“[redacted]”");
}

/// 引号内长英文散文（≥30 字符）→ 脱敏。
#[test]
fn redact_line_quoted_long_ascii_text_redacted() {
    // Arrange
    let long_en = "a".repeat(QUOTED_LONG_MIN + 5);
    let line = format!("[X] note: \"{}\"", long_en);

    // Act
    let out = redact_line(&line);

    // Assert
    assert_eq!(out, "[X] note: \"[redacted]\"");
}

/// 引号内短 ASCII 标识符/路径（错误信息诊断必需）不脱敏。
#[test]
fn redact_line_short_ascii_quoted_kept() {
    // Arrange
    let line = "[Ocr] 校准完成: \"ok\" [Model] 加载: \"model.onnx\"";

    // Act
    let out = redact_line(line);

    // Assert
    assert_eq!(out, line);
}

/// 疑似 URL → 脱敏。
#[test]
fn redact_line_url_redacted() {
    // Arrange
    let line = "[Downloader] 下载失败: https://hf-mirror.com/models/pp-ocrv6_tiny_det.onnx 重试中";
    let www_line = "[Downloader] 来源: www.example.com/models/a.bin";

    // Act
    let out = redact_line(line);
    let www_out = redact_line(www_line);

    // Assert
    assert_eq!(out, "[Downloader] 下载失败: [redacted] 重试中");
    assert_eq!(www_out, "[Downloader] 来源: [redacted]");
}

/// 空行 / 纯空白行原样返回。
#[test]
fn redact_line_empty_and_whitespace_unchanged() {
    // Arrange
    let empty = "";
    let whitespace = "   \t  ";

    // Act
    let empty_out = redact_line(empty);
    let ws_out = redact_line(whitespace);

    // Assert
    assert_eq!(empty_out, "");
    assert_eq!(ws_out, whitespace);
}

/// 边界：29 个 CJK 字符不动，30 个 CJK 字符脱敏。
#[test]
fn redact_line_cjk_length_boundary() {
    // Arrange
    let short = format!("[X] {}", cjk_run(29));
    let long = format!("[X] {}", cjk_run(30));

    // Act
    let short_out = redact_line(&short);
    let long_out = redact_line(&long);

    // Assert
    assert_eq!(short_out, short);
    assert_eq!(long_out, "[X] [redacted]");
}

/// 保守规则：未闭合引号整体放行（不吞掉行尾）。
#[test]
fn redact_line_unterminated_quote_conservative() {
    // Arrange
    let line = "[X] text: \"未闭合的引号后面还有内容";

    // Act
    let out = redact_line(line);

    // Assert
    assert_eq!(out, line);
}
