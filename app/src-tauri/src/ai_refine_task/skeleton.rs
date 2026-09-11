//! AI 精修任务终态骨架（拆分自 ai_refine_task.rs；AGENTS.md §3 单文件 ≤300 行）。
//!
//! @ai-context: 会话级/笔记级精修任务共用的收尾骨架：catch_unwind 把 panic 归一为
//!              Failed（spawn_blocking 的 JoinHandle 未被 await——否则任务状态永久
//!              停 Pending、前端永久"排队中"）；成功路径：轨迹落库 → 结果写注册表 →
//!              set_task → 终态帧 → 审计 → finish_ai_task + trim_ai_tasks。
//! @ai-context: 锁序红线：`st.ai_tasks` 的写入用**显式块**（块尾释放守卫），set_task
//!              在其后**重新加同一把 std::Mutex**——两者合并 = 自死锁（std Mutex 不可
//!              重入），任务永久 Running。该序列不可分割。
//! @ai-context: 审计写入 push_refine_audit 的守卫活到 `if let` 块尾（窗口 = push_audit
//!              调用）——不得把 now/format! 挪进或挪出该块。

use crate::ai_chat::{AiTurn, trajectory_to_json};
use crate::ai_task::{AiTaskFailure, AiTaskState};
use crate::commands::AppState;
use crate::commands_ai_refine::{set_task, AiRefineResult};

use super::RefineStreamFrame;
use super::stream::emit_refine_stream;

/// 精修任务审计记录（F1：REQ-140 轨迹可见化——summary 不含原文，隐私红线）。
/// v0.17.0：summary_ctx 泛化（"session=1"/"note=3"——会话级/笔记级共用）。
fn push_refine_audit(st: &AppState, summary_ctx: &str, result: &str, model: Option<&str>) {
    let now = crate::db_sessions_rows::unix_seconds();
    if let Ok(mut g) = st.ai_guardrails.lock() {
        g.push_audit(crate::ai_guardrails::AiAuditEntry {
            at_unix: now,
            upload_summary: format!("refine {} model={}", summary_ctx, model.unwrap_or("?")),
            result: result.to_string(),
        });
    }
}

/// 任务收尾公共骨架（会话级/笔记级共用——v0.17.0 REQ-246 提取）。
///
/// @ai-context: 彻底检测加固（2026-08-21）：spawn_blocking 的 JoinHandle 未被
///              await——闭包内 panic 会被 tokio 吞掉，任务状态永久停在
///              Pending（前端永久显示"任务排队中"，无失败可重试）。
///              catch_unwind 把 panic 归一为 Failed 状态，状态流转永不失联。
/// @ai-context: F2-B4：单片失败重试后仍失败 → 保留已成功片（partial_failed
///              语义：failed_slices > 0，前端显示"部分成功 x/y 片"）。
pub(crate) fn run_refine_task_skeleton(
    st: AppState,
    task_id: u64,
    target_summary: String,
    work: impl FnOnce() -> Result<(AiRefineResult, Vec<AiTurn>), AiTaskFailure>,
) {
    let started = std::time::Instant::now();
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)).unwrap_or_else(|_| {
        Err(AiTaskFailure::Other(
            "精修任务内部错误（panic）——请重试；若复现请反馈".to_string(),
        ))
    });
    let elapsed_ms = started.elapsed().as_millis() as i64;
    match outcome {
        Ok((result, turns)) => {
            eprintln!(
                "[refine-task] task={} succeeded slices={} failed={} diff={}",
                task_id,
                result.slices,
                result.failed_slices,
                result.diff.len()
            );
            // v0.16.0（REQ-230）：轨迹落库（提示词/回答全文——任务对话视图数据源）
            if let Some(json) = trajectory_to_json(&turns) {
                if let Err(e) = st.db.update_ai_task_trajectory(task_id, &json) {
                    eprintln!("[refine-task] task={} 轨迹落库失败（不阻断）: {}", task_id, e);
                }
            }
            {
                let mut tasks = st.ai_tasks.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(entry) = tasks.get_mut(&task_id) {
                    entry.result = serde_json::to_value(&result).ok();
                }
            }
            set_task(&st, task_id, AiTaskState::Succeeded);
            // REQ-247：终态帧（前端消息定格为最终摘要+双入口）
            emit_refine_stream(&st, task_id, RefineStreamFrame::Done {
                slices: result.slices,
                failed_slices: result.failed_slices,
            });
            // F1 修复（2026-08-21）：精修调用上审计——REQ-140 轨迹可见化
            push_refine_audit(&st, &target_summary, "ok", Some(&result.model));
            // F2 任务中心：终态落库（写库失败不阻断——H2 设计）+ 保留策略
            // 裁剪（审查修复：trim 原只在启动时跑，运行期终态任务会累积——
            // 每次终态后清理超限旧终态，防表膨胀）
            let result_json = serde_json::to_string(&result).ok();
            let _ = st.db.finish_ai_task(
                task_id,
                "succeeded",
                result_json.as_deref(),
                None,
                elapsed_ms,
            );
            let _ = st.db.trim_ai_tasks();
        }
        Err(reason) => {
            // 打印具体 message——区分"未配置密钥"vs"密钥无效(401/403)"（真机排查）
            eprintln!(
                "[refine-task] task={} failed kind={} msg={}",
                task_id,
                reason.kind(),
                reason.message()
            );
            set_task(&st, task_id, AiTaskState::Failed { reason: reason.clone() });
            push_refine_audit(&st, &target_summary, "error", None);
            let _ = st.db.finish_ai_task(
                task_id,
                "failed",
                None,
                Some(&format!("{}: {}", reason.kind(), reason.message())),
                elapsed_ms,
            );
            let _ = st.db.trim_ai_tasks();
        }
    }
}
