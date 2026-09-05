//! 概念模型卡命令层（v0.13.2 REQ-206~207 系统层）。
//!
//! @ai-context: 概念双面体单向升格——组内 model 卡（记忆面 front=概念名、back=三问）升格为
//!              体系内概念（思辨面）；只引用不收纳（knowledge_links(target_type=flashcard)），
//!              不新增 flashcards.concept_id 列。本层只做参数校验、编排数据层/纯函数、错误映射；
//!              `fn xxx_inner(db, ...)` 为纯函数（:memory: 可测），薄 command 壳只取 state.db。
//! @ai-context: 线宽豁免登记（AGENTS.md §3 300-600 带）：本文件承载创建/组列表两命令 + 共享
//!              卡面/时刻工具，≤300 行；卡→概念升格（四分支 + PromoteResult）拆至
//!              commands_knowledge_cards_promote.rs（同一命令域，避免单文件超限）。

use tauri::State;

use crate::commands::AppState;
use crate::commands_knowledge::{normalize_text, require_id, NAME_MAX_CHARS};
use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::knowledge_card::format_model_card_back;
use crate::scheduler::CardState;
use crate::types::Flashcard;

/// 组卡类型白名单（list_group_cards 的 kind 过滤；事实/动作/概念模型卡）。
const KIND_WHITELIST: [&str; 3] = ["fact", "action", "model"];

/// 当前时刻（Unix 毫秒；新卡 due_at 统一口径——与 commands_flashcards 相同）。
///
/// @ai-context: 新 model 卡 due_at=now（立即可复习——首次学习也是提取优先）。
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 卡面可选字段：trim + 空串转 None；非空字段 ≤2000 字符校验（超长报错）。
///
/// @ai-context: 卡面契约"缺问 → None"（非"有但为空"——前端按占位渲染）；超长拒绝防污染 DB。
fn card_field(v: Option<String>) -> Result<Option<String>, String> {
    match v {
        Some(s) => {
            let t = s.trim().to_string();
            if t.is_empty() {
                Ok(None)
            } else if t.chars().count() > NAME_MAX_CHARS {
                Err(format!("卡面字段超长（上限 {} 字符）", NAME_MAX_CHARS))
            } else {
                Ok(Some(t))
            }
        }
        None => Ok(None),
    }
}

/// 在组内建概念模型卡（kind='model'；幂等——同组同 front 已有则返回既有卡）。
///
/// @ai-context: front=归一化概念名、back=三问契约（format_model_card_back 组合）；组仍是唯一
///              容器（spec §一）——卡挂组内，升格后才进体系。
#[tauri::command]
pub fn create_model_card(
    state: State<'_, AppState>,
    group_id: i64,
    name: String,
    essence: Option<String>,
    boundary: Option<String>,
    relation: Option<String>,
) -> Result<Flashcard, String> {
    create_model_card_inner(&state.db, group_id, name, essence, boundary, relation)
}

/// 组卡列表（kind 过滤可选；模型卡列表数据源）。
#[tauri::command]
pub fn list_group_cards(
    state: State<'_, AppState>,
    group_id: i64,
    kind: Option<String>,
) -> Result<Vec<Flashcard>, String> {
    list_group_cards_inner(&state.db, group_id, kind)
}

/// 建概念模型卡（组存在 + 名归一化 + 卡面契约 + 幂等复用）。
pub(crate) fn create_model_card_inner(
    db: &Db,
    group_id: i64,
    name: String,
    essence: Option<String>,
    boundary: Option<String>,
    relation: Option<String>,
) -> Result<Flashcard, String> {
    require_id(group_id)?;
    if db.get_group(group_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("笔记组不存在: {}", group_id));
    }
    let name = normalize_text(&name, "概念名")?;
    // 幂等：同组同 front（归一化名）已有 → 返回既有卡（不新建，防 UI 双击双卡）
    if let Some(existing) = db.find_card_by_front(group_id, &name).map_err(|e| e.to_string())? {
        return Ok(existing);
    }
    let essence = card_field(essence)?;
    let boundary = card_field(boundary)?;
    let relation = card_field(relation)?;
    let back = format_model_card_back(essence.as_deref(), boundary.as_deref(), relation.as_deref());
    let state_json = serde_json::to_string(&CardState::default()).unwrap_or_default();
    db.create_card(&NewFlashcard {
        group_id,
        note_id: None,
        fragment_id: None,
        front: name,
        back,
        kind: "model".to_string(),
        state_json,
        due_at: now_ms() as i64,
    })
    .map_err(|e| e.to_string())
}

/// 组卡列表（require_id + kind 白名单校验）。
pub(crate) fn list_group_cards_inner(
    db: &Db,
    group_id: i64,
    kind: Option<String>,
) -> Result<Vec<Flashcard>, String> {
    require_id(group_id)?;
    let kind = kind.as_deref().filter(|k| !k.trim().is_empty());
    if let Some(k) = kind {
        if !KIND_WHITELIST.contains(&k) {
            return Err(format!("不支持的卡片类型: {}（支持: {}）", k, KIND_WHITELIST.join("/")));
        }
    }
    db.list_cards_by_group(group_id, kind).map_err(|e| e.to_string())
}

/// 命令层单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_knowledge_cards_tests.rs"]
mod tests;

/// 笔记段 → 模型卡草稿接线（v0.20.3 / REQ-302，核心处理 γ M 行）。
///
/// @ai-context: 防双轨核对（REQ-302 前置）：model 卡唯一生成路径 =
///              create_model_card_inner（本文件，幂等同组同 front）——本命令
///              复用同一 inner，只是把「来源笔记段摘录」作为初始定义草稿载入
///              （应用案例留空——用户到卡编辑完善）；与既有「model 卡纳入
///              体系」（promote_card_to_concept 升格链）不重复。
/// @ai-context: 组=唯一容器——笔记需已归组（无组笔记引导先归组，防孤儿卡）。
#[tauri::command]
pub fn model_card_from_note(
    state: State<'_, AppState>,
    note_id: i64,
    name: String,
    excerpt: Option<String>,
) -> Result<Flashcard, String> {
    let note = state
        .db
        .get_note(note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())?;
    let group_id = note
        .group_id
        .ok_or_else(|| "笔记未归组——请先把笔记归入组（组是唯一容器），或直接用组卡列表入口创建".to_string())?;
    // 摘录仅作文本载入（200 字护栏）；不做内容推断
    let excerpt = match excerpt {
        Some(t) => {
            let t = t.trim().to_string();
            let cut: String = t.chars().take(200).collect();
            if t.chars().count() > 200 { format!("{}…", cut) } else { cut }
        }
        None => String::new(),
    };
    let essence = if excerpt.is_empty() { None } else { Some(excerpt) };
    create_model_card_inner(&state.db, group_id, name, essence, None, None)
}