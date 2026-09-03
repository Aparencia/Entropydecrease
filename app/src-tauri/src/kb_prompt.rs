//! 学习库问答·提示词/元数据纯函数（REQ-260，v0.19.1；设计 §7.1/§7.2）。
//!
//! @ai-context: 读路径 A 双产物——①命中片段列表（本地恒返回）②生成回答
//!              （双闸门）。本模块只做无副作用组装：片段上下文打包（预算
//!              硬顶 + 诚实截断标记）、消息数组注入、消息 meta_json 契约
//!              （{mode: hits-only|answer, hits}——hits-only 消息不喂后续
//!              上下文，防"引导文案"冒充回答污染多轮）。
//! @ai-context: 生成仅依据片段回答（幻觉红线——设计 §七/ADR-029 风险）。

use serde_json::json;

use crate::ai_chat::{ChatMessageInput, ChatRole, build_messages};
use crate::budget_allocator::pack_fragments;
use crate::kb_search::KbHit;

/// 学习库问答系统提示词（只依据片段 + 无命中明说——幻觉红线）。
pub const KB_SYSTEM_PROMPT: &str = "你是「熵减」桌面应用的本地学习库问答助手。用中文简洁回答。\
 规则：只依据消息中提供的【本地学习库片段】回答，需要引用时用 [1] 式编号标注出处；\
 片段不足以回答时，明确说「库内未找到」，绝不编造或借用片段外知识。";

/// 片段预算字符数（档位硬顶复用 budget_allocator——tokens ≈ 字符/2，
/// 片段预算 = 档位 token 上界的一半，给生成留余量；light/standard/deep
/// 各自 2K/5K/15K token 级）。
pub fn kb_budget_chars(tier: &str) -> usize {
    crate::budget_allocator::tier_tokens(tier) / 2 * crate::budget_allocator::CHARS_PER_TOKEN
}

/// 命中来源标签（提示词溯源 + 前端引用卡片同名口径）。
pub fn kb_label(h: &KbHit) -> String {
    match h.source_kind.as_str() {
        "note" => {
            let title = h.note_title.as_deref().unwrap_or("未命名笔记");
            match h.heading.as_deref() {
                Some(hd) => format!("笔记《{}》·{}", title, hd),
                None => format!("笔记《{}》", title),
            }
        }
        _ => match h.group_name.as_deref() {
            Some(g) => format!("碎片（{}）", g),
            None => "碎片".to_string(),
        },
    }
}

/// 片段上下文打包（entries 按相关性降序；label 内嵌；预算截断诚实标记）。
pub fn kb_build_context(entries: &[(KbHit, String)], budget_chars: usize) -> (String, bool) {
    if entries.is_empty() {
        return (String::new(), false);
    }
    let n = entries.len();
    let mut packed: Vec<(String, f64)> = entries
        .iter()
        .enumerate()
        .map(|(idx, (h, text))| {
            // score = 排位倒序（pack_fragments 按分降序稳定排序——保持原序）
            let label = kb_label(h);
            let body = format!("[{}] 出自 {}\n{}", idx + 1, label, text);
            (body, (n - idx) as f64)
        })
        .collect();
    packed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let (packed, truncated) = pack_fragments(&packed, budget_chars);
    let mut ctx = String::from("【本地学习库片段】\n");
    ctx.push_str(packed.trim_end_matches('\n'));
    if truncated {
        ctx.push_str("\n……（片段超预算已精简——若觉答得浅可缩小提问范围）");
    }
    (ctx, truncated)
}

/// 最终用户消息内容 = 片段上下文 + 问题（一次一问）。
pub fn kb_qa_user_content(context: &str, question: &str) -> String {
    format!("{}\n\n【用户问题】\n{}", context, question)
}

/// 组装 messages（system + 历史 + 片段上下文以独立 user 消息插在问题前）。
///
/// @ai-context: 历史末条恒为当前问题（chat_send/regenerate 均先落用户消息）；
///              防御：末条非 user 时上下文附加为末条（不吞问题）。
pub fn kb_messages(
    system: &str,
    history: &[ChatMessageInput],
    context_user: &str,
) -> Vec<serde_json::Value> {
    let mut msgs = build_messages(system, history);
    match msgs.last() {
        Some(last) if last["role"] == "user" => {
            let idx = msgs.len() - 1;
            msgs.insert(idx, json!({ "role": "user", "content": context_user }));
        }
        _ => msgs.push(json!({ "role": "user", "content": context_user })),
    }
    msgs
}

/// 消息 meta_json 序列化契约（{mode, hits}——mode 区分 hits-only 引导/真回答，
/// 后续历史组装只喂 answer（kb_meta_is_answer）；序列化失败 → None 不阻断）。
pub fn kb_meta_json(mode: &str, hits: &[KbHit]) -> Option<String> {
    serde_json::to_string(&json!({ "mode": mode, "hits": hits })).ok()
}

/// meta_json → 是否真回答模式（None/畸形 → false——诚实按 hits-only 处理）。
pub fn kb_meta_is_answer(meta_json: Option<&str>) -> bool {
    meta_json
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .and_then(|v| v.get("mode").and_then(|m| m.as_str()).map(|m| m == "answer"))
        .unwrap_or(false)
}

/// 历史过滤规则（assistant 消息：hits-only 引导文案不进后续上下文——
/// 见 kb_meta_is_answer；failed 占位照旧排除——调用方既有过滤）。
pub fn is_kb_history_eligible(role: &str, meta_json: Option<&str>) -> bool {
    if role != "assistant" {
        return true;
    }
    kb_meta_is_answer(meta_json) || meta_json.is_none()
}

/// 生成关闭/零命中时的诚实文案（assistant 消息内容——不灰死、可直达设置）。
pub fn kb_hits_only_content(hits_len: usize, question: &str) -> String {
    if hits_len > 0 {
        format!(
            "🔍 已从本地学习库检索到 {} 条命中（见下方引用卡片）——开启「学习库问答生成」（设置 → AI 服务 → 学习库）可获得基于这些片段的带引用回答。",
            hits_len
        )
    } else {
        let q = question.chars().take(40).collect::<String>();
        format!("📭 本地学习库未找到与「{}」匹配的笔记/碎片——换个说法再试，或先沉淀素材再问。", q)
    }
}

/// ChatMessageInput 便捷构造过滤用（保持纯函数测试可独立）。
pub fn as_history(messages: &[crate::db_ai_chat::ChatMessage]) -> Vec<ChatMessageInput> {
    messages
        .iter()
        .filter(|m| m.role != "system")
        .filter(|m| m.status != "failed")
        .filter(|m| is_kb_history_eligible(&m.role, m.meta_json.as_deref()))
        .map(|m| ChatMessageInput {
            role: if m.role == "user" { ChatRole::User } else { ChatRole::Assistant },
            content: m.content.clone(),
        })
        .collect()
}

#[cfg(test)]
#[path = "kb_prompt_tests.rs"]
mod tests;
