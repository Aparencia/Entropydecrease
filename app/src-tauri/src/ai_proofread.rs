//! LLM 文本校对（可选）——逐句建议协议纯逻辑（v0.20.2 / REQ-270）。
//!
//! @ai-context: 建议制逐句（非直改）：模型只产出 {original, suggestion, reason}
//!              三元建议；人类裁决后经 session_refine_drafts（origin=proofread）
//!              落采纳（原料 session_segments 永不变，与 REQ-268 同可逆契约）。
//!              仅文本上云（语音不出本机红线）——本模块只处理文本，绝不触音频。
//! @ai-context: 失败/离线降级规则：网络错误 → 命令层报错不触碰原文；模型返回
//!              不可解析/幻觉文本 → 解析层返回空建议（静默降级为无建议，绝不
//!              猜测改写）。original 必须能精确匹配会话候选句（防模型幻觉错位）。
//! @ai-context: 纯函数层无 IO/无网络——分句/分块/提示词组装/解析校验全可单测。

use serde::{Deserialize, Serialize};

/// 单条校对建议（逐句；suggestion 与 original 必须不同才有意义）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProofreadSuggestion {
    pub original: String,
    pub suggestion: String,
    pub reason: String,
}

/// 模型响应容器（兼容 {suggestions:[...]} 与裸数组两种形态——解析层宽容，
/// 语义校验层严格）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProofreadResponse {
    #[serde(default)]
    pub suggestions: Vec<ProofreadSuggestion>,
}

/// 单次校对请求的候选句上限（成本与延迟护栏；超长会话提示分段使用）。
pub const MAX_SENTENCES_PER_RUN: usize = 240;
/// 单请求候选句数上限（模型输出长度护栏）。
pub const MAX_SENTENCES_PER_CHUNK: usize = 40;
/// 单请求字符预算（含编号/格式开销；保守分隔避免超模型上下文）。
pub const CHUNK_MAX_CHARS: usize = 6000;
/// 参与校对的句子长度带（过短=语气词噪声；过长=非句，跳过）。
pub const SENTENCE_MIN_CHARS: usize = 4;
pub const SENTENCE_MAX_CHARS: usize = 120;

/// 句子切分（纯函数）：按中英文句末标点/换行切，去空白；长度带外跳过；
/// 无标点超长文本按护栏取前段（截断仅发生在句末标点缺失处——护栏语义）。
///
/// @ai-context: 不做完整 NLP 分句——ASR 文本无标点常态下按最长 120 字硬切
///              （分段边界=保守护栏，宁多切不跨长）；句内标点（，、）不切。
pub fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf: Vec<char> = Vec::new();
    let flush = |buf: &mut Vec<char>, out: &mut Vec<String>| {
        let s: String = buf.iter().collect::<String>().trim().to_string();
        let len = s.chars().count();
        if (SENTENCE_MIN_CHARS..=SENTENCE_MAX_CHARS).contains(&len) {
            out.push(s);
        }
        buf.clear();
    };
    for ch in text.chars() {
        buf.push(ch);
        let is_end = matches!(ch, '。' | '！' | '？' | '!' | '?' | '；' | ';' | '\n');
        if is_end {
            flush(&mut buf, &mut out);
        } else if buf.len() > SENTENCE_MAX_CHARS {
            // 无句末标点硬切：取前护栏长段落，余下继续累积（不丢字、无重叠）
            let cut: Vec<char> = buf.drain(..SENTENCE_MAX_CHARS).collect();
            let mut piece = cut;
            flush(&mut piece, &mut out);
        }
    }
    flush(&mut buf, &mut out);
    out
}

/// 分块（纯函数）：按句数/字符预算贪心分组——每组 ≤ MAX_SENTENCES_PER_CHUNK
/// 且累计字符 ≤ CHUNK_MAX_CHARS（超长单句已在上游被长度带滤除）。
pub fn chunk_sentences(sentences: &[String]) -> Vec<Vec<usize>> {
    let mut chunks: Vec<Vec<usize>> = Vec::new();
    let mut cur: Vec<usize> = Vec::new();
    let mut cur_chars = 0usize;
    for (i, s) in sentences.iter().enumerate() {
        let len = s.chars().count() + 4; // 编号 + 换行开销
        if !cur.is_empty() && (cur.len() >= MAX_SENTENCES_PER_CHUNK || cur_chars + len > CHUNK_MAX_CHARS)
        {
            chunks.push(std::mem::take(&mut cur));
            cur_chars = 0;
        }
        cur.push(i);
        cur_chars += len;
    }
    if !cur.is_empty() {
        chunks.push(cur);
    }
    chunks
}

/// 提示词系统指令（中文 JSON 严格输出；只给文本，不涉语音/画面——红线）。
pub fn build_system_prompt() -> String {
    "你是转写文本校对助手。用户给出编号句子列表；对其中存在错别字、同音错、\
     语序或明显转写错误的句子输出校对建议；其余句子不输出。\
     只输出 JSON：{\"suggestions\":[{\"original\":\"原句原文（必须与输入完全一致）\",\
     \"suggestion\":\"校对后句子\",\"reason\":\"改动原因（≤20 字）\"}]}。\
     不要输出任何 JSON 以外的内容；original 必须逐字复制输入中的句子。"
        .to_string()
}

/// 组装单请求用户文本（编号行；原文随行——模型必须回带原文）。
pub fn build_user_prompt(sentences: &[String]) -> String {
    let mut out = String::new();
    for (i, s) in sentences.iter().enumerate() {
        out.push_str(&format!("{}. {}\n", i + 1, s));
    }
    out
}

/// 规范化（比对用）：去空白与换行——容忍模型对原文的空格微差。
pub fn normalize_for_match(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

/// 解析并校验模型输出（纯函数）：容 JSON 容器/裸数组；original 必须能精确
/// 匹配候选句（归一化后）；suggestion 必须与 original 不同（空建议丢弃）。
/// 不可解析/零合法 → 返回空（降级=无建议，绝不猜测改写）。
pub fn parse_suggestions(raw: &str, expected: &[String]) -> Vec<ProofreadSuggestion> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let suggestions = if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<ProofreadSuggestion>>(trimmed).unwrap_or_default()
    } else {
        serde_json::from_str::<ProofreadResponse>(trimmed)
            .map(|r| r.suggestions)
            .unwrap_or_default()
    };
    let expected_norm: Vec<String> = expected.iter().map(|e| normalize_for_match(e)).collect();
    suggestions
        .into_iter()
        .filter(|s| {
            let orig_norm = normalize_for_match(&s.original);
            let sugg = s.suggestion.trim();
            // 审查 L3：建议长度护栏（≤2000 字符——防模型失控超长回文）
            sugg.chars().count() <= 2000
                && !sugg.is_empty()
                && sugg != s.original.trim()
                && expected_norm.iter().any(|e| *e == orig_norm)
        })
        .collect()
}

#[cfg(test)]
#[path = "ai_proofread_tests.rs"]
mod tests;
