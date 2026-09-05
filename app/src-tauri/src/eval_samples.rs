//! asr_eval 样本侧纯函数层（v0.20.0 / REQ-263，M1）。
//!
//! @ai-context: 目的——harness 的"参考信道"获取与规整，纯逻辑与 IO 分离：
//!              本模块只有纯函数（SRT 解析/规整/文件命名配对），目录扫描、
//!              读文件、音频提取等 IO 全在 bin/asr_eval.rs（薄编排层）。
//! @ai-context: 参考信道优先级（v0.20.0 实现 L1 外挂字幕）：同名 .srt
//!              外挂字幕（~100% 无损）> 会话内字幕来源段（--db 会话模式，
//!              M2 接线）；OCR 多帧投票信道留 P1（需画面字幕链路）。
//! @ai-context: 局限（诚实登记）：SRT 仅支持 UTF-8/带 BOM（仓库无 encoding
//!              依赖，GBK 参考文件暂跳过并提示——导入链 REQ-016 的编码探测
//!              方案待 P1 复用核对）；无参考样本不进 CER（仅稳定性/画像/回归）。
//! @ai-context: 消费方为 bin/asr_eval.rs（crate 外），lib 内无调用方 →
//!              dead_code 豁免登记（同 cer.rs 先例）。

// 消费方在 bin（asr_eval.rs），lib 内无调用方
#![allow(dead_code)]

/// 单条字幕 cue 的解析结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SrtCue {
    /// 字幕序号（容忍缺失/乱序——只作展示用，不参与文本规整）。
    pub index: u32,
    /// cue 文本（多行 cue 按行序拼接，无分隔——CER/画像口径先 strip 空白标点）。
    pub text: String,
}

/// 解析 SRT 文本（纯函数，容错解析）。
///
/// @ai-context: 规则——按空行分块；块内首行数字=序号（非数字容忍为 0）；
///              含 "-->" 的行=时间轴（跳过）；其余行拼接为 cue 文本。
///              不做 HTML 标签/样式剥离（口语字幕极少带；如有带进参考只会
///              稀释精度——诚实保留，报告口径说明）。
pub fn parse_srt(text: &str) -> Vec<SrtCue> {
    // 去 BOM + 归一化 CRLF（容 Windows 保存的参考文件）
    let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let mut cues = Vec::new();
    let mut index_counter = 0u32;
    for block in text.split("\n\n") {
        if block.trim().is_empty() {
            continue;
        }
        // 块内解析：首行数字=序号（可缺失）；含 "-->" 的时间轴行一律跳过；
        // 其余行按行序推入（同块多行合并为一条 cue，保持行序）
        let mut block_idx = index_counter;
        for (pos, line) in block.lines().enumerate() {
            let t = line.trim();
            if t.is_empty() {
                continue;
            }
            if pos == 0 {
                if let Ok(n) = t.parse::<u32>() {
                    block_idx = n;
                    continue;
                }
            }
            if t.contains("-->") {
                continue;
            }
            push_content_line(&mut cues, block_idx, t);
        }
        index_counter += 1;
    }
    cues
}

fn push_content_line(cues: &mut Vec<SrtCue>, idx: u32, line: &str) {
    let line = line.trim();
    if line.is_empty() {
        return;
    }
    match cues.last_mut() {
        // 同序号多行 → 拼接为一条 cue 文本（保持行序）
        Some(last) if last.index == idx => last.text.push_str(line),
        _ => cues.push(SrtCue { index: idx, text: line.to_string() }),
    }
}

/// cue 集合 → 参考文本（纯函数）：按序号排序后拼接。
///
/// @ai-context: SRT 内乱序少见但可能（采集时序），按 index 排序保证参考
///              文本与音频时间序一致（CER 对顺序敏感，必须有序）。
pub fn reference_text(cues: &[SrtCue]) -> String {
    let mut sorted: Vec<&SrtCue> = cues.iter().collect();
    sorted.sort_by_key(|c| c.index);
    let mut out = String::new();
    for c in sorted {
        out.push_str(&c.text);
    }
    out
}

/// 媒体文件扩展名判定（纯函数；P0 支持 wav 直读 + mp4/m4a 走 ffmpeg 提取）。
pub fn is_media_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    ["wav", "mp4", "m4a", "flac"]
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

/// 媒体文件 → 候选外挂字幕路径（纯函数）：同名 .srt。
pub fn srt_path_for(media_name: &str) -> Option<String> {
    let stem = media_name.rsplit_once('.')?.0;
    if stem.is_empty() {
        return None;
    }
    Some(format!("{stem}.srt"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_srt ──

    #[test]
    fn parses_typical_srt() {
        let srt = "1\n00:00:01,000 --> 00:00:03,000\n今天讲熵减的概念\n\n2\n00:00:04,000 --> 00:00:06,000\n第二句内容\n";
        let cues = parse_srt(srt);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].index, 1);
        assert_eq!(cues[0].text, "今天讲熵减的概念");
        assert_eq!(cues[1].text, "第二句内容");
    }

    #[test]
    fn handles_crlf_and_bom() {
        let srt = "\u{feff}1\r\n00:00:01,000 --> 00:00:03,000\r\n第一句\r\n";
        let cues = parse_srt(srt);
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].text, "第一句");
    }

    #[test]
    fn multi_line_cue_joined_in_order() {
        let srt = "1\n00:00:01,000 --> 00:00:03,000\n第一行\n第二行\n";
        let cues = parse_srt(srt);
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].text, "第一行第二行");
    }

    #[test]
    fn tolerates_missing_index_and_junk_lines() {
        let srt = "00:00:01,000 --> 00:00:03,000\n无序号字幕\n\n3\n00:00:05,000 --> 00:00:06,000\n有序号字幕\n";
        let cues = parse_srt(srt);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].text, "无序号字幕");
        assert_eq!(cues[1].index, 3);
    }

    #[test]
    fn empty_and_whitespace_blocks_ignored() {
        assert!(parse_srt("").is_empty());
        assert!(parse_srt("\n\n\n").is_empty());
    }

    // ── reference_text ──

    #[test]
    fn reference_sorted_by_index_even_if_input_unsorted() {
        let cues = vec![
            SrtCue { index: 3, text: "第三".into() },
            SrtCue { index: 1, text: "第一".into() },
            SrtCue { index: 2, text: "第二".into() },
        ];
        assert_eq!(reference_text(&cues), "第一第二第三");
    }

    // ── 命名配对 ──

    #[test]
    fn media_and_srt_pairing() {
        assert!(is_media_file("a.wav"));
        assert!(is_media_file("a.mp4"));
        assert!(!is_media_file("a.srt"));
        assert!(!is_media_file("a.txt"));
        assert_eq!(srt_path_for("a.wav").as_deref(), Some("a.srt"));
        assert_eq!(srt_path_for("dir/b.mp4").as_deref(), Some("dir/b.srt"));
        assert_eq!(srt_path_for(".hidden"), None);
    }
}
