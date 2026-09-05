//! NDJSON 流式喂入缓冲（观察 2026-09-05-2，v0.19.7 审查收口）。
//!
//! @ai-context: 精修逐节流式的行缓冲逻辑从 adapter 闭包抽为纯函数（可单测）：
//!              chunk 可能切在行中/行间/CRLF 边界；`feed_ndjson` 只解析完整行，
//!              残留留 pending；`flush_ndjson` 处理末行无换行与尾随垃圾。

use crate::ai_refine_protocol::{AiRefineSection, parse_section_ndjson_line};

/// 喂入增量文本：解析全部完整行并入 sink（未换行残留在 pending）。
pub fn feed_ndjson(pending: &mut String, chunk: &str, sink: &mut Vec<AiRefineSection>) {
    pending.push_str(chunk);
    while let Some(pos) = pending.find('\n') {
        let line: String = pending.drain(..=pos).collect();
        if let Some(sec) = parse_section_ndjson_line(&line) {
            sink.push(sec);
        }
    }
}

/// 流结束 flush：解析剩余（末行无换行/模型尾部垃圾行忽略）。
pub fn flush_ndjson(pending: &mut String, sink: &mut Vec<AiRefineSection>) {
    if pending.is_empty() {
        return;
    }
    let tail = std::mem::take(pending);
    if let Some(sec) = parse_section_ndjson_line(&tail) {
        sink.push(sec);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sec(heading: &str) -> AiRefineSection {
        // 解析侧只关心 heading/blocks 形状——空 blocks 元素同构
        let line = format!(r#"{{"heading":"{}","blocks":[]}}"#, heading);
        parse_section_ndjson_line(&line).expect("构造节失败")
    }

    #[test]
    fn chunk_split_across_lines_accumulates() {
        let mut pending = String::new();
        let mut sink = Vec::new();
        // 第 1 个对象被切成两半（半个 JSON 分两次到达），第 2 个对象随后完整到达
        feed_ndjson(&mut pending, r#"{"heading":"节A","b"#, &mut sink);
        assert_eq!(sink.len(), 0, "对象残缺未换行前不解析");
        feed_ndjson(&mut pending, r#"locks":[]}"#, &mut sink);
        feed_ndjson(&mut pending, "\n", &mut sink);
        assert_eq!(sink.len(), 1, "首行补全 + 换行后才解析");
        feed_ndjson(&mut pending, r#"{"heading":"节B","blocks":[]}"#, &mut sink);
        assert_eq!(sink.len(), 1, "第二节未换行前不解析");
        feed_ndjson(&mut pending, "\n", &mut sink);
        assert_eq!(sink.len(), 2);
        assert_eq!(sink[0], sec("节A"));
        assert_eq!(sink[1], sec("节B"));
        assert!(pending.is_empty());
    }

    #[test]
    fn crlf_and_tail_garbage_handled() {
        let mut pending = String::new();
        let mut sink = Vec::new();
        feed_ndjson(&mut pending, "{\"heading\":\"A\",\"blocks\":[]}\r\n{\"heading\":\"B\",\"blocks\":[]}\n", &mut sink);
        assert_eq!(sink.len(), 2, "CRLF 尾部 \\r 应被 trim 忽略");
        // 末行 C 带换行到达（正常解析）；随后无换行的尾随解释文本 → flush 忽略垃圾
        feed_ndjson(&mut pending, "{\"heading\":\"C\",\"blocks\":[]}\n", &mut sink);
        assert_eq!(sink.len(), 3);
        feed_ndjson(&mut pending, "（以上为整理结果）", &mut sink);
        flush_ndjson(&mut pending, &mut sink);
        assert_eq!(sink.len(), 3, "垃圾尾串不产出伪节");
        assert_eq!(sink[2], sec("C"));
        assert!(pending.is_empty());
    }

    #[test]
    fn compact_array_lines_rejected_per_line() {
        // 模型输出完整数组（违反逐节约定）→ 行级全部拒绝；整包回退由
        // adapter 层按全文解析（见 refine_stream_ndjson）
        let mut pending = String::new();
        let mut sink = Vec::new();
        feed_ndjson(&mut pending, "[{\"heading\":\"A\",\"blocks\":[]}]", &mut sink);
        flush_ndjson(&mut pending, &mut sink);
        assert!(sink.is_empty());
    }
}
