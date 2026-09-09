//! commands_proofread.rs 单测（AAA 模式；内存态原子——不触库/网络）。
//!
//! @ai-context: 覆盖任务 id 认领语义——proofread 族与其余任务族（refine/
//!              enrich/note_refine/goal_plan）共用 AppState.ai_task_seq 同一
//!              单调序列（P2-1 审查修复回归，见 claim_task_id Why）。

use crate::commands_ai_refine::{claim_task_id, task_seq};

/// AAA（P2-1 回归）：proofread 认领 N 后任意其他族紧邻认领 ≠ N——
/// 相邻认领不相交。修复前 proofread 为 fetch_add(1)+1（1904c2c7 引入）：
/// 计数器 1→2 却领走 2，其他族紧邻 fetch_add 恰好也返回 2——跨任务族
/// 同 id，insert_ai_task 的 INSERT OR REPLACE 会顶替先落库的 proofread 行
/// （running 记账/结果/成本丢行）。
#[test]
fn proofread_claim_then_adjacent_family_claim_do_not_collide() {
    // Arrange：与装配等价的序列起点（task_seq() 初值 1——app_setup 即以此
    // 装配 AppState.ai_task_seq；proofread_run 现与 refine 同一封装认领）
    let seq = task_seq();
    // Act：proofread 族先认领 N，任意其他族紧邻认领（生产同一代码路径）
    let proofread_id = claim_task_id(&seq);
    let other_family_id = claim_task_id(&seq);
    // Assert：相邻认领不相交（修复前两者都 = 2）
    assert_ne!(
        proofread_id, other_family_id,
        "proofread 与相邻认领不得撞 id（撞 id 会被 INSERT OR REPLACE 顶替）"
    );
    // 序列语义回归：初值 1 起逐号分配；认领后计数器越过所领 id（修复前
    // proofread 认领后计数器仍停在所领 id 上——同一破绽的另一面）
    assert_eq!(proofread_id, 1, "首个 id 应为 1（task_seq 初值语义）");
    assert_eq!(other_family_id, 2, "紧邻认领应为下一号");
    assert_eq!(seq.load(std::sync::atomic::Ordering::Relaxed), 3);
}

/// AAA：认领与启动序列下限的衔接——DB 最大 id 为 41 时（含历史行），重启后
/// proofread 首个认领必须 ≥42（防复用历史 task_id 顶替已采纳行——与批 1
/// task_seq_lower_bound 语义闭合，proofread 无特殊偏移）。
#[test]
fn proofread_claim_after_startup_lower_bound_never_reuses_db_rows() {
    // Arrange：启动序列按 DB 全表最大 id 41 推进（app_setup fetch_update）
    let seq = task_seq();
    let _ = seq.fetch_update(
        std::sync::atomic::Ordering::Relaxed,
        std::sync::atomic::Ordering::Relaxed,
        |cur| Some(crate::commands_ai_refine::task_seq_lower_bound(cur, 41)),
    );
    // Act：proofread 族认领 + 紧邻其他族认领
    let proofread_id = claim_task_id(&seq);
    let other_family_id = claim_task_id(&seq);
    // Assert：从 42 起且互不相交（修复前 proofread fetch_add(1)+1 在计数器
    // 42 处领走 43，紧邻族 fetch_add 返回 43——同 id 相撞，同上顶替风险）
    assert_eq!(proofread_id, 42, "proofread 首个认领须越过 DB 最大 id");
    assert_eq!(other_family_id, 43);
    assert_ne!(proofread_id, other_family_id);
}
