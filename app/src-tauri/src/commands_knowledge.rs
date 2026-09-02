//! 知识体系命令层共享校验（v0.13.1 REQ-202~205 系统层）。
//!
//! @ai-context: 本文件收敛命令层入参校验统一契约（AGENTS.md §6/§4）：id>0、
//!              白名单（kind/type/status/target_type）、名称归一化（trim + 连续空白
//!              折叠为一个空格——规格 §二 不可变约束：概念/体系/节点名落库前归一，
//!              使 `find_concept_by_name` 查重命中同一书写）、name/text 非空且 ≤2000。
//! @ai-context: 校验全部纯函数、无 DB、无时间调用，供 commands_knowledge_systems
//!              （体系/问题树）与 commands_knowledge_core（概念/模型/引用/审计）复用。
//! @ai-context: 线宽豁免登记：原单文件 commands_knowledge.rs（18 命令 + 校验 + 测试）
//!              预估超 300 行，按规格 §四拆 commands_knowledge_systems.rs 与
//!              commands_knowledge_core.rs，本文件仅收敛公共校验（各拆分文件 ≤300 行）。
//! @ai-context: 入参出参契约——name/text 归一化后 ≤2000 字符；status/target_type
//!              白名单拒绝任意字符串入库（Tauri IPC 入参校验红线）。

use crate::db_knowledge_links::LinkTarget;

/// 名称/文本最大长度（防超长字符串污染 DB 与 IPC，规格 §四 统一 ≤2000）。
pub(crate) const NAME_MAX_CHARS: usize = 2000;

/// 体系类型白名单（global 全库唯一；domain 挂 global）。
const KIND_WHITELIST: [&str; 2] = ["global", "domain"];
/// 节点类型白名单（问题树三态：问题/场景/领域入口）。
const NODE_WHITELIST: [&str; 3] = ["question", "scenario", "domain_entry"];
/// 实体通用状态白名单（system/node/model）。
const COMMON_STATUS: [&str; 3] = ["active", "watching", "archived"];
/// 概念状态白名单（概念三态，与通用态差异在 active→core）。
const CONCEPT_STATUS: [&str; 3] = ["core", "watching", "archived"];

/// 校验 id>0（所有 id 入参统一前置——防 0/负 id 触发空查询或错误级联）。
pub(crate) fn require_id(id: i64) -> Result<(), String> {
    if id > 0 {
        Ok(())
    } else {
        Err(format!("无效的 id: {}", id))
    }
}

/// 校验体系类型白名单（kind ∈ {global, domain}）。
pub(crate) fn require_kind(kind: &str) -> Result<(), String> {
    if KIND_WHITELIST.contains(&kind) {
        Ok(())
    } else {
        Err(format!("不支持的体系类型: {}（支持: {}）", kind, KIND_WHITELIST.join("/")))
    }
}

/// 校验节点类型白名单（type ∈ {question, scenario, domain_entry}）。
pub(crate) fn require_node_type(t: &str) -> Result<(), String> {
    if NODE_WHITELIST.contains(&t) {
        Ok(())
    } else {
        Err(format!("不支持的节点类型: {}（支持: {}）", t, NODE_WHITELIST.join("/")))
    }
}

/// 校验实体状态白名单：system/node/model 取 active/watching/archived，
/// concept 取 core/watching/archived（概念以核心/观望/归档三态区分）。
pub(crate) fn require_status(entity: &str, st: &str) -> Result<(), String> {
    let list: &[&str] = if entity == "concept" { &CONCEPT_STATUS } else { &COMMON_STATUS };
    if list.contains(&st) {
        Ok(())
    } else {
        Err(format!("不支持的状态: {}（支持: {}）", st, list.join("/")))
    }
}

/// 名称/文本归一化：trim + 连续空白折叠为一个空格；空/超长报中文业务错误。
///
/// @ai-context: 名称归一化在命令层执行后落库（spec §二 不可变约束）——同一概念的
///              不同书写（多余空格/换行）视为同一名称；`find_concept_by_name` 用
///              归一化名查重，保证概念名全库唯一。split_whitespace 天然处理 trim
///              与任意空白折叠。
/// @param raw - 原始名称/文本
/// @param label - 业务术语（"体系名称"/"概念名称"/"节点内容"…），用于错误文案
pub(crate) fn normalize_text(raw: &str, label: &str) -> Result<String, String> {
    let norm = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if norm.is_empty() {
        return Err(format!("{}不能为空", label));
    }
    if norm.chars().count() > NAME_MAX_CHARS {
        return Err(format!("{}超长（上限 {} 字符）", label, NAME_MAX_CHARS));
    }
    Ok(norm)
}

/// 校验引用目标类型白名单并解析为枚举
/// （note_group/note/flashcard/fragment——v0.18.2 增 goal 目标↔体系联动）。
pub(crate) fn parse_target_type(s: &str) -> Result<LinkTarget, String> {
    match s {
        "note_group" => Ok(LinkTarget::NoteGroup),
        "note" => Ok(LinkTarget::Note),
        "flashcard" => Ok(LinkTarget::Flashcard),
        "fragment" => Ok(LinkTarget::Fragment),
        "goal" => Ok(LinkTarget::Goal),
        _ => Err(format!("不支持的目标类型: {}（支持: note_group/note/flashcard/fragment/goal）", s)),
    }
}

/// 校验并归一化学科 JSON：解析为 Vec<String>，过滤空白项，要求 ≥1 非空，再序列化落库。
///
/// @ai-context: 前端传 JSON 数组字符串；解析后校验 ≥1 非空学科（模型跨学科命题
///              至少一门学科支撑），空数组/全空白/非法 JSON 拒绝；存储态规范为
///              serde_json 紧凑序列化（db 层存 JSON 文本，解析由调用方）。
pub(crate) fn normalize_disciplines(json: &str) -> Result<String, String> {
    let parsed: Vec<String> = serde_json::from_str(json)
        .map_err(|_| format!("学科列表格式错误: {}", json))?;
    let trimmed: Vec<String> = parsed
        .into_iter()
        .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|s| !s.is_empty())
        .collect();
    if trimmed.is_empty() {
        return Err("学科列表至少一个非空学科".to_string());
    }
    serde_json::to_string(&trimmed).map_err(|e| format!("学科序列化失败: {}", e))
}

/// 命令层单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_knowledge_tests.rs"]
mod tests;
