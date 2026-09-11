//! AI 精修并发切片 worker 池（拆分自 ai_refine_task.rs；AGENTS.md §3 单文件 ≤300 行）。
//!
//! @ai-context: 拆分边界＝「worker 池 + 其并发参数/纯函数工具」：RefineCtx（并发参数
//!              聚合）、slice_summary（片间摘要纯函数）、turn_user_text（轨迹 user
//!              文本）、refine_slices_concurrent（队列/单片重试/收集编排）。
//! @ai-context: 时序红线：scope 内的 drop(tx) 只释放主线程 sender，通道真正关闭在
//!              std::thread::scope join 全部 worker 之后 —— rx.iter() 必须留在
//!              scope 之外（搬进 scope 内 = 死锁/任务永久 Pending）。
//! @ai-context: 并发红线：turns 轨迹槽用方法链临时守卫（守卫活到整条语句的 `;`），
//!              锁窗口覆盖 build_system + turn_user_text + to_string(&r)；改成
//!              「先建 AiTurn 再 push」＝缩短锁窗口＝并发行为变更（禁止）。
//! @ai-context: 单片失败不 panic、不中断其他片（部分成功语义 REQ-145）；进度/流式
//!              帧经 set_task / emit_refine_stream 上报（emit 点仍由父模块持有）。

use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use crate::ai_chat::AiTurn;
use crate::ai_mock::AiMockAdapter;
use crate::ai_note_refine::AiNoteRefineAdapter;
use crate::ai_refine_protocol::AiRefineRequest;
use crate::ai_strategy::ResolvedDims;
use crate::ai_task::{AiTaskFailure, AiTaskState};
use crate::commands::AppState;
use crate::commands_ai_refine::set_task;

use super::RefineStreamFrame;use super::stream::emit_refine_stream;

/// 单片失败重试次数（幂等片——同片重跑不产生副作用）。
const SLICE_RETRY: usize = 1;

/// 并发精修上下文（参数聚合——clippy too_many_arguments 修复；
/// v0.17.0：字段 pub(crate)——笔记级精修任务共用）。
pub(crate) struct RefineCtx<'a> {
    pub(crate) slices: &'a [String],
    pub(crate) chapters: &'a [String],
    pub(crate) glossary: &'a [String],
    pub(crate) profile: &'a str,
    pub(crate) adapter: &'a AiNoteRefineAdapter,
    pub(crate) mock_adapter: &'a AiMockAdapter,
    pub(crate) mock: bool,
    pub(crate) workers: usize,
    pub(crate) st: &'a AppState,
    pub(crate) task_id: u64,
    /// v0.12.0 M5：屏卡图 base64 data URI 列表（vision_refine_enabled 开启且
    /// 会话有归档图时非空；空 → 精修纯文本，现有行为零变化）
    pub(crate) vision_images: &'a [String],
    /// v0.17.0：策略解析结果（command 层 resolve——每片提示词一致）
    pub(crate) dims: &'a ResolvedDims,
}

/// 片间摘要（F3 v2：前/后片首尾 N 字——提示词衔接上下文，防片间断裂）。
/// 纯函数可单测：取片开头/结尾 SUMMARY_MAX_CHARS 字符（截断到字符边界）。
pub(crate) fn slice_summary(text: &str, head: bool) -> Option<String> {
    let s = text.trim();
    if s.is_empty() {
        return None;
    }
    let max = crate::ai_refine_protocol::SUMMARY_MAX_CHARS;
    let out: String = if head {
        s.chars().take(max).collect()
    } else {
        s.chars().rev().take(max).collect::<String>().chars().rev().collect()
    };
    if out.chars().count() < s.chars().count() {
        Some(format!("{}…", out))
    } else {
        Some(out)
    }
}

/// 并发切片精修（纯编排）：worker 池从共享队列取片 → 单片重试 → 收集。
///
/// @ai-context: 返回 (各片 markdown（保序，失败片跳过）, 失败片数, 轨迹（每片
///              成功调用的提示词/回答——REQ-230；vision 调用只记图数占位，
///              base64 不入轨迹库）)。
///              单片失败不 panic、不中断其他片——部分成功语义（REQ-145）。
///              进度经 set_task 上报（finished = 已完成的片数，含失败片——
///              前端进度条推进不受单片失败影响）。
/// @ai-context: F3 v2：请求携带 slice_index/slice_total/prev_summary/
///              next_summary——模型知道自己是第几片、前后片衔接什么
///              （防章节标题重复/内容断裂）。
pub(crate) fn refine_slices_concurrent(ctx: RefineCtx<'_>) -> (Vec<String>, usize, Vec<AiTurn>) {
    let total = ctx.slices.len();
    if total == 0 {
        return (Vec::new(), 0, Vec::new());
    }
    let queue: Arc<Mutex<VecDeque<usize>>> = Arc::new(Mutex::new((0..total).collect()));
    let (tx, rx) = mpsc::channel::<(usize, Option<String>)>();
    let workers = ctx.workers.max(1).min(total);
    // 轨迹收集槽（REQ-230）：worker 并发写，Mutex 保护；顺序由 turn 字段定
    let turns: Arc<Mutex<Vec<AiTurn>>> = Arc::new(Mutex::new(Vec::with_capacity(total)));
    // 请求一次构建（Arc 共享——worker 只读，避免每 worker 重复克隆切片）
    let reqs: Arc<Vec<AiRefineRequest>> = Arc::new(
        ctx.slices
            .iter()
            .enumerate()
            .map(|(i, s)| AiRefineRequest {
                content: s.clone(),
                profile: ctx.profile.to_string(),
                glossary: ctx.glossary.to_vec(),
                chapters: ctx.chapters.to_vec(),
                // F3 v2：片间上下文（前片结尾 / 后片开头摘要——衔接用）
                slice_index: i + 1,
                slice_total: total,
                prev_summary: if i > 0 { slice_summary(&ctx.slices[i - 1], false) } else { None },
                next_summary: ctx.slices.get(i + 1).and_then(|n| slice_summary(n, true)),
            })
            .collect(),
    );
    std::thread::scope(|scope| {
        for _ in 0..workers {
            let queue = queue.clone();
            let tx = tx.clone();
            let reqs = reqs.clone();
            // worker 捕获 ctx 字段（adapter/mock 只读共享；task_id 复制）
            let adapter = ctx.adapter;
            let mock_adapter = ctx.mock_adapter;
            let mock = ctx.mock;
            let task_id = ctx.task_id;
            let st = ctx.st; // REQ-290①：流式 Delta 帧推送（worker 线程内 emit）
            let profile = ctx.profile; // 轨迹 system 提示词构建用（模板分组同请求）
            let vision_images = ctx.vision_images;
            let dims = ctx.dims; // 策略解析结果（worker 只读共享）
            let turns = turns.clone();
            scope.spawn(move || loop {
                let idx = {
                    let mut q = queue.lock().unwrap_or_else(|e| e.into_inner());
                    q.pop_front()
                };
                let Some(idx) = idx else { break };
                let req = &reqs[idx];
                let mut outcome: Option<String> = None;
                for attempt in 0..=SLICE_RETRY {
                    // REQ-290（v0.19.6）埋点先行：单片耗时归因——任务级 elapsed_ms
                    // 已有（db_ai_tasks），此处补片级时间（含流式整包耗时口径）。
                    let started = std::time::Instant::now();
                    // REQ-290①（v0.19.7）：首拍（attempt 0）优先流式（NDJSON 逐节，
                    // 解析一节推一节 Delta——打字机正文）；流式不可用/模型未遵守
                    // 逐节约定 → 同拍回退非流式（与旧版逐字节一致）；重试拍走非
                    // 流式（幂等语义下不重复推流）。
                    let stream_enabled = !mock
                        && attempt == 0
                        && std::env::var("REFINE_STREAM_NDJSON")
                            .map(|v| v != "0")
                            .unwrap_or(true);
                    let resp = if mock {
                        Ok(mock_adapter.refine(req))
                    } else if stream_enabled {
                        match adapter
                            .refine_stream_ndjson(
                                req,
                                ctx.vision_images,
                                Some(dims),
                                |sec| {
                                    emit_refine_stream(
                                        st,
                                        task_id,
                                        RefineStreamFrame::Delta {
                                            slice_index: idx + 1,
                                            text: crate::ai_refine_protocol::render_sections(
                                                std::slice::from_ref(&sec),
                                            ),
                                        },
                                    );
                                },
                            )
                            .map_err(AiTaskFailure::from)
                        {
                            Ok(r) => Ok(r),
                            Err(e) => {
                                eprintln!(
                                    "[refine-task] task={} 片 {} 流式不可用，同拍回退非流式: {}",
                                    task_id, idx + 1, e.message()
                                );
                                if ctx.vision_images.is_empty() {
                                    adapter.refine(req, Some(dims)).map_err(AiTaskFailure::from)
                                } else {
                                    adapter
                                        .refine_vision(req, ctx.vision_images, Some(dims))
                                        .map_err(AiTaskFailure::from)
                                }
                            }
                        }
                    } else if ctx.vision_images.is_empty() {
                        adapter.refine(req, Some(dims)).map_err(AiTaskFailure::from)
                    } else {
                        // v0.12.0 M5：开启画面理解 → 屏卡图随切片请求送 vision-exp
                        adapter
                            .refine_vision(req, ctx.vision_images, Some(dims))
                            .map_err(AiTaskFailure::from)
                    };
                    let elapsed_ms = started.elapsed().as_millis();
                    match resp {
                        Ok(r) => {
                            eprintln!(
                                "[refine-task] task={} 片 {}/{} attempt={} ok elapsed_ms={}",
                                task_id, idx + 1, total, attempt + 1, elapsed_ms
                            );
                            // REQ-230：成功片记录轨迹（提示词/回答全文——任务对话视图）
                            turns
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .push(AiTurn {
                                    turn: idx + 1,
                                    // 观察 2026-09-05-3（如实化）：system=策略基座；流式
                                    // NDJSON 后缀/预算引导段为运行期动态段不入轨迹，
                                    // 取证以 response 全文为准
                                    system: adapter.prompt.build_system(profile, Some(dims)),
                                    user: turn_user_text(req, vision_images),
                                    response: serde_json::to_string(&r).unwrap_or_default(),
                                });
                            outcome = Some(r.to_markdown());
                            break;
                        }
                        Err(e) if attempt < SLICE_RETRY => {
                            eprintln!("[refine-task] task={} 片 {} 第{}次失败 elapsed_ms={}，重试: {}", task_id, idx + 1, attempt + 1, elapsed_ms, e.message());
                        }
                        Err(e) => {
                            eprintln!("[refine-task] task={} 片 {} 重试后仍失败 elapsed_ms={}（保留已成功片）: {}", task_id, idx + 1, elapsed_ms, e.message());
                            break;
                        }
                    }
                }
                let _ = tx.send((idx, outcome));
            });
        }
        drop(tx); // 所有 worker 结束后关闭通道（scope 内最后一个持有者）
    });
    // 收集（按消息携带的真实切片下标落位——channel 到达序 ≠ 切片序）；
    // 进度按已收片数上报（含失败片——进度条推进不受单片失败影响）
    let received: Vec<(usize, Option<String>)> = rx.iter().collect();
    let mut by_index: Vec<Option<String>> = vec![None; total];
    for (pos, (slice_idx, out)) in received.iter().enumerate() {
        by_index[*slice_idx] = out.clone();
        set_task(
            ctx.st,
            ctx.task_id,
            AiTaskState::Running { finished_slices: pos + 1, total_slices: total },
        );
        // REQ-247：进度帧（片完成推进——前端进度行）
        emit_refine_stream(ctx.st, ctx.task_id, RefineStreamFrame::Progress {
            slice_index: pos + 1,
            slice_total: total,
        });
        // REQ-247：片级解析流帧（片完成即推——validate 已过；失败诚实提示）
        match out {
            Some(md) => emit_refine_stream(ctx.st, ctx.task_id, RefineStreamFrame::BlockDone {
                slice_index: slice_idx + 1,
                markdown: md.clone(),
            }),
            None => emit_refine_stream(ctx.st, ctx.task_id, RefineStreamFrame::SliceFailed {
                slice_index: slice_idx + 1,
                reason: "重试后仍失败（保留已成功片）".to_string(),
            }),
        }
    }
    let failed = by_index.iter().filter(|o| o.is_none()).count();
    let markdowns: Vec<String> = by_index.into_iter().flatten().collect();
    let turn_out = turns.lock().unwrap_or_else(|e| e.into_inner()).clone();
    (markdowns, failed, turn_out)
}

/// 轨迹 user 文本：请求 JSON（vision 附加张数占位——base64 不入轨迹库，
/// 原图在本机会话图库；REQ-230 提示词/回答可见 + 存储可控）。
pub(crate) fn turn_user_text(req: &AiRefineRequest, images: &[String]) -> String {
    let mut s = serde_json::to_string(req).unwrap_or_default();
    if !images.is_empty() {
        s.push_str(&format!(
            "\n\n[附带画面图 {} 张——原始图在本机会话图库，轨迹不存 base64]",
            images.len()
        ));
    }
    s
}
