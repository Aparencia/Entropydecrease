//! 概念低激活信号（v0.18.2 REQ-253；M3 真实化——规则信号现算）。
//!
//! @ai-context: 目标内概念 = 绑定组经 knowledge_links 挂接体系的概念；低激活
//!              = 90 天无引用且未应用（concept_stale 判据理念）；信号为 AI
//!              规划的「最弱概念」输入与目标详情诊断块——规则数字永远可见，
//!              AI 解读可选用（设计 §五/§六.4）。

/// 缺失提醒窗口（天）：超过即视为低激活（引用链无活动）。
pub const WARN_AFTER_DAYS: i64 = 90;

/// 概念活动信号（命令层自 db 查询组装——结构即契约）。
#[derive(Debug, Clone, PartialEq)]
pub struct ConceptActivity {
    pub concept_id: i64,
    pub name: String,
    /// 引用计数（knowledge_links concept_id 命中数）
    pub ref_count: usize,
    /// 最近一次应用时刻（knowledge_decisions kind=application 且概念命中）
    pub last_applied_at: Option<i64>,
    /// 最近一次被引用时刻（同类）
    pub last_referenced_at: Option<i64>,
}

/// 弱化信号（低激活判定 + 人话原因——诚实不猜）。
#[derive(Debug, Clone, PartialEq)]
pub struct ConceptWeakness {
    pub concept_id: i64,
    pub name: String,
    pub weak: bool,
    pub reason: String,
}

/// 单概念信号（now_secs 显式入参——测试可控）。
pub fn signal_of(c: &ConceptActivity, now_secs: i64) -> ConceptWeakness {
    let applied_fresh = c.last_applied_at.map(|t| now_secs - t < WARN_AFTER_DAYS * 86_400).unwrap_or(false);
    let ref_fresh = c.last_referenced_at.map(|t| now_secs - t < WARN_AFTER_DAYS * 86_400).unwrap_or(false);
    let weak = !applied_fresh && !ref_fresh;
    let reason = if c.ref_count == 0 && c.last_applied_at.is_none() {
        "从未引用/应用（体系引用了概念但无下游活动）".to_string()
    } else if applied_fresh {
        format!("近 {} 天有应用记录", WARN_AFTER_DAYS)
    } else {
        format!("最近引用在 {} 天前，未再应用", WARN_AFTER_DAYS)
    };
    ConceptWeakness { concept_id: c.concept_id, name: c.name.clone(), weak, reason }
}

/// 排序（最弱在前：从未引用 > 90 天无活动 > 最近活跃）。
pub fn rank_weakness(list: &[ConceptActivity], now_secs: i64) -> Vec<ConceptWeakness> {
    let mut out: Vec<ConceptWeakness> = list.iter().map(|c| signal_of(c, now_secs)).collect();
    out.sort_by(|a, b| {
        b.weak
            .cmp(&a.weak)
            .then(b.name.cmp(&a.name))
    });
    out
}

#[cfg(test)]
#[path = "concept_weakness_tests.rs"]
mod tests;
