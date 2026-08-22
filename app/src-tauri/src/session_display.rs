//! 会话显示序号（v0.11.5）：列表/详情展示编号与内部 id 分离。
//!
//! @ai-context: sessions.id 为自增主键（永不归位），直接展示 `#{id}` 会在删除
//!              会话后出现编号空洞（如 #3/#7/#9），且暗示 id 越小会话越早。
//!              本模块派生"显示序号"：按 (started_at, id) 升序赋 1..=n——
//!              纯函数（零 DB/状态依赖），列表与课程分组合并去重后调用一次，
//!              保证全局连续；删除会话后自动重排（不复用旧号）。
//! @ai-context: 为什么纯函数：可 rustc 独立编译验证（Windows cargo test harness
//!              受 onnxruntime 1.17/1.28 冲突限制，v0.11.4 已知问题），且 rank
//!              与展示排序模式（新→旧/旧→新/时长）解耦——排序只是视图，编号恒定。

use std::collections::HashMap;

/// 会话显示序号赋值（v0.11.5）：按 (started_at, id) 升序赋 1..=n。
///
/// 入参 [(session_id, started_at)]；出参 session_id → rank。
/// 同时间戳按 id 稳定排序（排序键全序）；输入顺序不影响结果。
pub fn assign_display_no(items: &[(i64, i64)]) -> HashMap<i64, i64> {
    let mut sorted: Vec<(i64, i64)> = items.to_vec();
    // 排序键 (started_at, id) 全序：同秒创建按 id 稳定（确定性 rank）
    sorted.sort_by_key(|(id, started_at)| (*started_at, *id));
    sorted
        .into_iter()
        .enumerate()
        .map(|(idx, (id, _))| (id, idx as i64 + 1))
        .collect()
}

/// 会话显示序号测试（rustc --test 独立可跑；AAA）。
#[cfg(test)]
#[path = "session_display_tests.rs"]
mod tests;
