//! 知识体系原子层纯函数（v0.13.1 REQ-202~205）。
//!
//! @ai-context: 三类判据全部无副作用、无 DB、无时间调用——输入信号由调用方
//!              聚合注入（now 由参数传入），golden 用例先行（TDD）。
//! @ai-context: settlement_due 同构（settlement.rs）——知识体系沿用"周期 + 阈值"
//!              双触发器与"老化分档"策略，防体系沼泽化（与组结算一致的死法）。
//!
//! @ai-context: 规格 §三 精化：AuditSignal / StaleSignal 各补 `created_at_ms`
//!              基线——golden「首次 89 天不触发 / 90 天触发」要求"从未审计 /
//!              从未引用"场景有创建时间基线（与 settlement_due 的 created_at
//!              同构）；否则"从未审计"无法判定到期。
//!
//! @ai-context: M1 原子层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use serde::Serialize;

/// 审计周期天数（距上次审计/创建 ≥ 此天数达到周期触发）。
pub const AUDIT_DAYS: u64 = 90;
/// 周期触发最低条目数（条目太少不值得审计仪式——与组结算 CYCLE_ITEM_MIN 同源）。
pub const AUDIT_ITEM_MIN: usize = 20;
/// 概念归档老化天数（≥180 天无引用且从未应用 → Archive；与 settlement ARCHIVE_AGE_DAYS 同源）。
pub const STALE_ARCHIVE_DAYS: u64 = 180;

/// 审计到期信号（由调用方聚合；时间口径为毫秒）。
///
/// @ai-context: M2 追加 serde：`audit_due_for_system` 把本信号返回前端（不能只靠
///              Debug——command 返回值需可序列化）；字段 snake_case，`camelCase`
///              统一随前端口径改写到线（spec §四：字段级 rename_all 即可）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditSignal {
    /// 体系内条目数（节点/概念/模型等"学习内容"计数；调用方定义口径）
    pub item_count: usize,
    /// 上次审计时刻（毫秒；None=从未审计——以 created_at_ms 为周期基线）
    pub last_audit_at_ms: Option<u64>,
    /// 体系创建时刻（毫秒——从未审计时的周期基线；规格 §三 精化）
    pub created_at_ms: u64,
    /// 当前时刻（毫秒，由调用方注入——纯函数不调时间）
    pub now_ms: u64,
}

/// 审计到期判定（周期 OR 阈值语义，贴合 settlement_due 范式）。
///
/// @ai-context: 双触发防两极——一直不审计（防沼泽）与频繁打扰（仪式的成本）。
/// @ai-context: 首次（last_audit 为空）：以 created_at_ms 为基线，仅按 90 天周期
///              触发（无条目下限——新体系刚建 90 天也该首次对账）。
/// @ai-context: 二次（last_audit 存在）：距上次 ≥90 天 **且** item_count ≥ 20 才触发。
pub fn audit_due(s: &AuditSignal) -> bool {
    let baseline = s.last_audit_at_ms.unwrap_or(s.created_at_ms);
    let days = (s.now_ms.saturating_sub(baseline)) / 86_400_000;
    match s.last_audit_at_ms {
        None => days >= AUDIT_DAYS,
        Some(_) => days >= AUDIT_DAYS && s.item_count >= AUDIT_ITEM_MIN,
    }
}

/// 概念老化信号（由调用方聚合；时间口径为毫秒）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StaleSignal {
    /// 最近引用时刻（毫秒；None=从未引用——以 created_at_ms 为老化基线）
    pub last_referenced_at_ms: Option<u64>,
    /// 最近应用时刻（毫秒；None=从未被应用过）
    pub last_applied_at_ms: Option<u64>,
    /// 概念创建时刻（毫秒——"从未引用"时的老化基线；规格 §三 精化）
    pub created_at_ms: u64,
    /// 当前时刻（毫秒，由调用方注入）
    pub now_ms: u64,
}

/// 概念老化分档。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StaleLevel {
    /// 新鲜（距最近引用 <90 天）
    None,
    /// 观望（≥90 天无引用但未到归档，或 ≥180 天但有应用记录）
    Watching,
    /// 归档（≥180 天无引用且从未应用）
    Archive,
}

/// 概念老化判定：引用来源（knowledge_links 中该概念出现 / decisions.used_refs）
/// 由调用方聚合为 last_referenced_at_ms，本函数只做分档。
///
/// @ai-context: 老化基线取"最近引用"，从未引用则退化到创建时刻——从未被引用过的
///              概念也要能判定老化（否则永远新鲜，等于无法归档）。
/// @ai-context: ≥180 天但有应用记录 → Watching 而非 Archive：被反复应用过的概念
///              说明仍活跃，只是暂未被引用，归档过激；而从未应用且超长老化 → Archive。
pub fn concept_stale(s: &StaleSignal) -> StaleLevel {
    let baseline = s.last_referenced_at_ms.unwrap_or(s.created_at_ms);
    let days = (s.now_ms.saturating_sub(baseline)) / 86_400_000;
    if days < AUDIT_DAYS {
        return StaleLevel::None;
    }
    if days < STALE_ARCHIVE_DAYS {
        return StaleLevel::Watching;
    }
    if s.last_applied_at_ms.is_some() {
        StaleLevel::Watching
    } else {
        StaleLevel::Archive
    }
}

/// 卡→概念升格判据输入。
#[derive(Debug, Clone, PartialEq)]
pub struct PromoteInput {
    /// 卡片名称（原始，未归一化）
    pub card_name: String,
    /// 已存在的概念候选：`(concept_id, name, system_id)`（调用方按名称搜索后传入）。
    ///
    /// @ai-context: 规格 §三 记为 Vec<(concept_id, name)>，但跨体系判据
    ///              （concept.system_id != target_system_id）需要每个候选的
    ///              system_id——两元组欠约束，本实现按三元组承载（规格精化，
    ///              与 created_at_ms 同节奏；M2 调用方加载概念时一并取 system_id）。
    pub existing: Vec<(i64, String, i64)>,
    /// 目标体系 id（卡片所属体系）
    pub target_system_id: i64,
}

/// 升格决策。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromoteDecision {
    /// 新建概念
    Create,
    /// 并入既有概念（同体系）
    Merge { concept_id: i64 },
    /// 跨体系同名概念（v0.13.4 交叉点数据源，提示而非合并）
    CrossSystemHint { concept_id: i64, other_system_id: i64 },
    /// 已关联卡片（v0.13.2 升格接线时由调用方判定——卡已带 concept_id 直接采用；
    /// 本版函数不产出该变体，保留定义供 v0.13.2 使用）。
    #[allow(dead_code)]
    AlreadyLinked { concept_id: i64 },
}

/// 名称归一化：trim + 连续空白折叠成一个空格。
///
/// @ai-context: 名称归一化在 command 层执行后落库（spec §二 不可变约束）；
///              此处作为升格判定的前置——同一概念的不同书写（多余空格/换行）
///              应视为同一名称。split_whitespace 天然处理 trim 与任意空白折叠。
fn normalize_name(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 卡→概念升格规则判定。
///
/// @ai-context: 命中既有概念且同体系 → Merge；命中但跨体系 → CrossSystemHint
///              （跨体系本版自由引用不做——只提示待 v0.13.4 交叉点处理）；
///              均未命中 → Create。
/// @ai-context: 归一化后名称为空 → panic：名称是全库唯一概念身份的前提（spec §二
///              name UNIQUE），空名会污染全库；command 层须先校验拒空名再调本函数。
pub fn promote_rules(input: &PromoteInput) -> PromoteDecision {
    let norm = normalize_name(&input.card_name);
    if norm.is_empty() {
        panic!("promote_rules: 名称归一化后为空——command 层须先校验拒绝空名");
    }
    for (concept_id, name, system_id) in &input.existing {
        if normalize_name(name) == norm {
            if *system_id == input.target_system_id {
                return PromoteDecision::Merge { concept_id: *concept_id };
            }
            return PromoteDecision::CrossSystemHint {
                concept_id: *concept_id,
                other_system_id: *system_id,
            };
        }
    }
    PromoteDecision::Create
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；TDD golden 先行）。
#[cfg(test)]
#[path = "knowledge_pure_tests.rs"]
mod tests;
