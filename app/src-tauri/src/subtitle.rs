//! 字幕文件解析（REQ-016，ADR-008）。
//!
//! @ai-context: L1 外挂字幕（.srt/.ass/.vtt）纯文本解析，零第三方依赖——
//!              命中则免 ASR 零成本 100% 准确（本地优先降级路径的最上游）。
//! @ai-context: 编码探测：UTF-8 严格解码成功即用；失败回退 GBK（CP936，
//!              Windows API MultiByteToWideChar，无新依赖）。BOM 自动剥离。
//! @ai-context: 输出统一为 fusion::SubtitleSegment（毫秒时间轴），与屏幕字幕
//!              OCR 链路（subtitle_ocr.rs）同构，可直接进入融合或直出转写。
//! @ai-context: 本模块纯解析无副作用；探测决策在 subtitle_detect.rs。

use std::path::Path;

use crate::error::{AppError, Result};
use crate::fusion::SubtitleSegment;

/// 缺失结束时间时的默认字幕时长（ms；VTT 无 end 的 cue 用）。
const SUBTITLE_DEFAULT_MS: u64 = 2000;
/// 外挂字幕文件大小上限（TD-038：防异常大文件全量读入内存拖垮进程）。
const MAX_SUBTITLE_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// 字幕文件格式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubtitleFormat {
    Srt,
    Vtt,
    Ass,
}

impl SubtitleFormat {
    /// 按扩展名识别（srt/vtt/ass/ssa；不区分大小写）。
    pub fn from_extension(path: &Path) -> Option<SubtitleFormat> {
        match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "srt" => Some(SubtitleFormat::Srt),
            "vtt" => Some(SubtitleFormat::Vtt),
            "ass" | "ssa" => Some(SubtitleFormat::Ass),
            _ => None,
        }
    }
}

/// 读取并解析外挂字幕文件（编码探测 + 格式解析一站式入口；TD-038 大小上限）。
pub fn parse_subtitle_file(path: &Path) -> Result<Vec<SubtitleSegment>> {
    let format = SubtitleFormat::from_extension(path)
        .ok_or_else(|| AppError::Io(format!("不支持的字幕扩展名: {}", path.display())))?;
    let metadata = std::fs::metadata(path)?;
    check_subtitle_file_size(metadata.len())?;
    let bytes = std::fs::read(path)?;
    let text = decode_subtitle_bytes(&bytes);
    Ok(parse_subtitle(&text, format))
}

/// 字幕文件大小校验（纯函数可单测）：超过 50MB 拒绝，避免全量读入内存。
pub(crate) fn check_subtitle_file_size(size: u64) -> Result<()> {
    if size > MAX_SUBTITLE_FILE_SIZE {
        return Err(AppError::Io(format!(
            "字幕文件过大（{}MB > 上限 {}MB），请检查是否选错文件",
            size / (1024 * 1024),
            MAX_SUBTITLE_FILE_SIZE / (1024 * 1024)
        )));
    }
    Ok(())
}

/// 解码字幕字节为 UTF-8 文本：UTF-8 严格 → GBK(CP936) 回退 → lossy 兜底。
///
/// @ai-context: 中文外挂字幕常见 GBK 编码（Windows 生态遗留）；严格 UTF-8 失败才
///              尝试 GBK，避免误判（GBK 字节序几乎总能"成功"解码任意字节）。
pub fn decode_subtitle_bytes(bytes: &[u8]) -> String {
    let decoded = match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => decode_gbk(bytes).unwrap_or_else(|| String::from_utf8_lossy(bytes).into_owned()),
    };
    decoded.strip_prefix('\u{feff}').unwrap_or(&decoded).to_string()
}

/// GBK(CP936) → UTF-8（Windows API；非 Windows 平台返回 None 走 lossy）。
///
/// @ai-context: windows crate 0.61 便捷签名：MultiByteToWideChar 的 flags 参数为
///              MULTI_BYTE_TO_WIDE_CHAR_FLAGS 结构体（0=默认映射）；WideCharToMultiByte
///              的 lpdefaultchar 泛型参数传 PSTR::null()（无替换字符）。CP_GBK=936。
#[cfg(target_os = "windows")]
fn decode_gbk(bytes: &[u8]) -> Option<String> {
    use windows::core::PSTR;
    use windows::Win32::Globalization::{
        MultiByteToWideChar, WideCharToMultiByte, MULTI_BYTE_TO_WIDE_CHAR_FLAGS, CP_UTF8,
    };

    /// GBK 简体中文代码页。
    const CP_GBK: u32 = 936;
    unsafe {
        if bytes.is_empty() {
            return None;
        }
        // 宽字符缓冲：GBK 每字符 ≤2 字节 → 宽字符数 ≤ 字节数（CP936 单/双字节混合）
        let flags = MULTI_BYTE_TO_WIDE_CHAR_FLAGS(0);
        let wide_len = MultiByteToWideChar(CP_GBK, flags, bytes, None);
        if wide_len <= 0 {
            return None;
        }
        let mut wide = vec![0u16; wide_len as usize];
        let written = MultiByteToWideChar(CP_GBK, flags, bytes, Some(&mut wide));
        if written <= 0 {
            return None;
        }
        wide.truncate(written as usize);
        // UTF-8 缓冲：每宽字符 ≤3 字节
        let mut utf8 = vec![0u8; wide.len() * 3];
        let utf8_len = WideCharToMultiByte(CP_UTF8, 0, &wide, Some(&mut utf8), PSTR::null(), None);
        if utf8_len <= 0 {
            return None;
        }
        utf8.truncate(utf8_len as usize);
        String::from_utf8(utf8).ok()
    }
}

/// GBK 解码兜底（非 Windows：无 API 可用，直接 None）。
#[cfg(not(target_os = "windows"))]
fn decode_gbk(_bytes: &[u8]) -> Option<String> {
    None
}

/// 按格式解析字幕文本为统一的时间轴段。
pub fn parse_subtitle(text: &str, format: SubtitleFormat) -> Vec<SubtitleSegment> {
    match format {
        SubtitleFormat::Srt => parse_srt(text),
        SubtitleFormat::Vtt => parse_vtt(text),
        SubtitleFormat::Ass => parse_ass(text),
    }
}

/// 解析 SRT：空行分块，块内找 `-->` 时间行，其后为文本（可多行）。
fn parse_srt(text: &str) -> Vec<SubtitleSegment> {
    let mut segments = Vec::new();
    for block in split_blocks(text) {
        let lines: Vec<&str> = block.lines().map(str::trim).collect();
        let Some(time_idx) = lines.iter().position(|l| l.contains("-->")) else {
            continue;
        };
        let Some((start_ms, end_ms)) = parse_time_line(lines[time_idx]) else {
            continue;
        };
        let body = lines[time_idx + 1..].iter().filter(|l| !l.is_empty()).cloned().collect::<Vec<_>>().join("\n");
        let body = body.trim();
        if body.is_empty() {
            continue;
        }
        segments.push(SubtitleSegment { start_ms, end_ms, text: body.to_string() });
    }
    segments
}

/// 解析 VTT：WEBVTT 头/STYLE/REGION/NOTE 跳过，`-->` 行开启 cue，空行结束 cue。
///
/// @ai-context: 直播类 VTT 的 cue 可能缺 end 时间——按默认时长补齐（不丢段）。
fn parse_vtt(text: &str) -> Vec<SubtitleSegment> {
    let mut segments = Vec::new();
    let mut cue_time: Option<(u64, u64)> = None;
    let mut cue_text: Vec<String> = Vec::new();
    let mut in_note = false;
    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with("NOTE") {
            in_note = true;
            continue;
        }
        if in_note {
            if line.is_empty() {
                in_note = false;
            }
            continue;
        }
        if line.is_empty() {
            // 空行结束当前 cue
            if let Some((start_ms, end_ms)) = cue_time.take() {
                push_cue(&mut segments, start_ms, end_ms, &cue_text);
            }
            cue_text.clear();
            continue;
        }
        if line.contains("-->") {
            if let Some(t) = parse_time_line(line) {
                cue_time = Some(t);
            }
            continue;
        }
        // 非指令行且处于 cue 中 → 文本行
        if cue_time.is_some() {
            cue_text.push(line.to_string());
        }
    }
    // 文件尾无空行收尾
    if let Some((start_ms, end_ms)) = cue_time.take() {
        push_cue(&mut segments, start_ms, end_ms, &cue_text);
    }
    segments
}

/// 解析 ASS：仅 [Events] 段；`Dialogue:` 行按 10 字段切分（Text 可含逗号），
/// 剥离 `{...}` 覆盖标签与 \N 换行符。
fn parse_ass(text: &str) -> Vec<SubtitleSegment> {
    let mut segments = Vec::new();
    let mut in_events = false;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            in_events = line.to_ascii_lowercase().contains("events");
            continue;
        }
        if !in_events {
            continue;
        }
        let Some(body) = line.strip_prefix("Dialogue:") else {
            continue; // Comment/Picture 等行跳过
        };
        // 标准字段序：Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
        let fields: Vec<&str> = body.splitn(10, ',').collect();
        if fields.len() < 10 {
            continue;
        }
        let Some(start_ms) = parse_timestamp(fields[1].trim()) else { continue };
        let Some(end_ms) = parse_timestamp(fields[2].trim()) else { continue };
        let text = strip_ass_overrides(fields[9]).replace("\\N", " ").replace("\\n", " ");
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        segments.push(SubtitleSegment { start_ms, end_ms, text: text.to_string() });
    }
    segments
}

/// 组装并压入一条字幕段（文本为空跳过）。
fn push_cue(segments: &mut Vec<SubtitleSegment>, start_ms: u64, end_ms: u64, text: &[String]) {
    let body = text.join("\n").trim().to_string();
    if body.is_empty() {
        return;
    }
    segments.push(SubtitleSegment { start_ms, end_ms, text: body });
}

/// 按空行分块（归一化 \r\n 与多空行；返回拥有所有权的块，避免引用临时值）。
fn split_blocks(text: &str) -> Vec<String> {
    let normalized = text.replace("\r\n", "\n");
    normalized
        .split("\n\n")
        .map(str::trim)
        .filter(|b| !b.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// 解析时间行 `start --> end [设置]`；end 缺失时按默认时长补齐。
fn parse_time_line(line: &str) -> Option<(u64, u64)> {
    let mut it = line.split("-->");
    let start_ms = parse_timestamp(it.next()?.trim())?;
    let end_raw = it.next()?.split_whitespace().next().unwrap_or("");
    let end_ms = parse_timestamp(end_raw).unwrap_or(start_ms + SUBTITLE_DEFAULT_MS);
    Some((start_ms, end_ms))
}

/// 解析时间戳 `[h:]mm:ss[.mmm|,mmm]` → 毫秒；小数位按位数缩放（1 位=百毫秒、
/// 2 位=十毫秒、3 位=毫秒——兼容 SRT 逗号三位的秒小数与 ASS 点两位的百分秒）。
pub(crate) fn parse_timestamp(raw: &str) -> Option<u64> {
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }
    let (h, m, sec_part) = if parts.len() == 3 {
        (parts[0].parse::<u64>().ok()?, parts[1].parse::<u64>().ok()?, parts[2])
    } else {
        (0, parts[0].parse::<u64>().ok()?, parts[1])
    };
    let (sec_str, frac_str) = match sec_part.find(['.', ',']) {
        Some(i) => (&sec_part[..i], &sec_part[i + 1..]),
        None => (sec_part, ""),
    };
    let sec = sec_str.parse::<u64>().ok()?;
    let frac: u64 = frac_str.parse().unwrap_or(0);
    let frac_ms = match frac_str.len() {
        0 => 0,
        1 => frac * 100,
        2 => frac * 10,
        _ => frac,
    };
    Some(h * 3_600_000 + m * 60_000 + sec * 1000 + frac_ms)
}

/// 剥离 ASS 覆盖标签（{\an8} 等排版指令，非显示文本）。
pub(crate) fn strip_ass_overrides(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '{' => in_tag = true,
            '}' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "subtitle_tests.rs"]
mod tests;
