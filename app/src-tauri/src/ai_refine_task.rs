//! AI 精修任务执行（F2-B4 拆分，2026-08-21：自 commands_ai_refine.rs 拆出——
//! 豁免清单拆分计划兑现；行数回归 ≤300）。
//!
//! @ai-context: 后台任务主体：规则草稿 → 切片 → 并发精修（F2：并发 2-3，
//!              单片失败重试 1 次，仍失败保留已成功片 = 部分成功，不再
//!              一片失败全任务失败）→ 合并 → diff。panic 由 catch_unwind
//!              归一 Failed（状态流转永不失联）。审计/任务落库在此层完成。
//! @ai-context: 并发实现：std::thread::scope + channel 工作池（spawn_blocking
//!              线程内再开 worker——网络调用阻塞 worker 线程，互不干扰；
//!              AiClient 为 Clone+Send，跨线程共享安全）。

use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use crate::ai_client::AiClient;
use crate::ai_mock::AiMockAdapter;
use crate::ai_note_refine::AiNoteRefineAdapter;
use crate::ai_refine_protocol::AiRefineRequest;
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};
use crate::commands::AppState;
use crate::commands_ai_refine::{set_task, AiRefineResult};
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::note_diff::{diff_markdown, diff_stats};
use crate::note_filter::PurifyEnv;
use crate::outline::{detect_outline_smart, OutlineConfig};
use crate::video_profile::ProfileKind;

/// 切片并发上限（REQ-145：并发 2-3——配额并发安全由 command 层启动前按
/// 预估片数一次性消耗保证，此处 worker 数不超切片数）。
const CONCURRENCY: usize = 3;
/// 单片失败重试次数（幂等片——同片重跑不产生副作用）。
const SLICE_RETRY: usize = 1;

/// 精修任务审计记录（F1：REQ-140 轨迹可见化——summary 不含原文，隐私红线）。
fn push_refine_audit(st: &AppState, session_id: i64, result: &str, model: Option<&str>) {
    let now = crate::db_sessions_rows::unix_seconds();
    if let Ok(mut g) = st.ai_guardrails.lock() {
        g.push_audit(crate::ai_guardrails::AiAuditEntry {
            at_unix: now,
            upload_summary: format!(
                "refine session={} model={}",
                session_id,
                model.unwrap_or("?")
            ),
            result: result.to_string(),
        });
    }
}

/// 后台精修任务：规则草稿 → 切片 → 逐片精修（mock/云端）→ 合并 → diff。
///
/// @ai-context: 彻底检测加固（2026-08-21）：spawn_blocking 的 JoinHandle 未被
///              await——闭包内 panic 会被 tokio 吞掉，任务状态永久停在
///              Pending（前端永久显示"任务排队中"，无失败可重试）。
///              catch_unwind 把 panic 归一为 Failed 状态，状态流转永不失联。
/// @ai-context: F2-B4：单片失败重试后仍失败 → 保留已成功片（partial_failed
///              语义：failed_slices > 0，前端显示"部分成功 x/y 片"）。
pub fn run_refine_task(st: AppState, task_id: u64, session_id: i64, mock: bool) {
    // 诊断日志（2026-08-21 真机"排队中"排查）：tauri dev 终端可见各阶段进度
    eprintln!("[refine-task] task={} start session={} mock={}", task_id, session_id, mock);
    let started = std::time::Instant::now();
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_refine_task_inner(&st, task_id, session_id, mock)
    }))
    .unwrap_or_else(|_| {
        Err(AiTaskFailure::Other(
            "精修任务内部错误（panic）——请重试；若复现请反馈".to_string(),
        ))
    });
    let elapsed_ms = started.elapsed().as_millis() as i64;
    match outcome {
        Ok(result) => {
            eprintln!(
                "[refine-task] task={} succeeded slices={} failed={} diff={}",
                task_id,
                result.slices,
                result.failed_slices,
                result.diff.len()
            );
            {
                let mut tasks = st.ai_tasks.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(entry) = tasks.get_mut(&task_id) {
                    entry.result = serde_json::to_value(&result).ok();
                }
            }
            set_task(&st, task_id, AiTaskState::Succeeded);
            // F1 修复（2026-08-21）：精修调用上审计——REQ-140 轨迹可见化
            // （此前只有余额/测试连接/复核有记录，精修补充零审计）
            push_refine_audit(&st, session_id, "ok", Some(&result.model));
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
            push_refine_audit(&st, session_id, "error", None);
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

/// 精修任务主体（返回 Result；panic 由外层 catch_unwind 兜底）。
fn run_refine_task_inner(
    st: &AppState,
    task_id: u64,
    session_id: i64,
    mock: bool,
) -> Result<AiRefineResult, AiTaskFailure> {
    let env = PurifyEnv {
        config: st.purify.clone(),
        symbol: st.symbol_normalize.clone(),
        corrections: st.ocr_corrections.clone(),
    };
    // ① 规则草稿 + 结构分析一次完成（审查修复 2026-08-21：build_rule_draft_
    //    with_analysis 返回 analysis——章节/术语直接复用，消除二次 analyze 双跑）
    eprintln!("[refine-task] task={} 阶段①构建规则草稿（本地分析）", task_id);
    let (draft, analysis) =
        build_rule_draft_with_analysis(&st.db, &st.ui_junk, &env, &st.data_dir, session_id, None)
            .map_err(AiTaskFailure::Other)?;
    eprintln!("[refine-task] task={} 草稿完成 markdown={} 字符", task_id, draft.markdown.chars().count());
    // 7️⃣ 锚点剥离（2026-08-22，spec 7️⃣）：段落锚点全剥省 token（锚点对整理
    // 无语义，段级溯源由协议 anchor_ref 承担）；章节锚点记录 (标题, ms) 映射，
    // 精修输出合并后按标题精确匹配回挂（不丢不假）
    let (strip_md, chapter_anchors) = crate::anchor_strip::strip_anchors_with_map(&draft.markdown);
    eprintln!(
        "[refine-task] task={} 锚点剥离: {} → {} 字符（章节锚点 {} 个）",
        task_id,
        draft.markdown.chars().count(),
        strip_md.chars().count(),
        chapter_anchors.len()
    );
    // ② 精修上下文（档案/章节/术语——analysis 已含章节边界与术语表）
    let session = st
        .db
        .get_session(session_id)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .ok_or_else(|| AiTaskFailure::Other("会话不存在".to_string()))?;
    let kind = session
        .profile
        .as_deref()
        .map(ProfileKind::parse)
        .unwrap_or(ProfileKind::Lecture);
    let ocr_blocks = st
        .db
        .list_ocr_blocks(session_id)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?;
    let outline = detect_outline_smart(&ocr_blocks, &draft.ocr_screens, &OutlineConfig::default());
    let chapters: Vec<String> = if outline.is_empty() {
        analysis
            .chapters
            .iter()
            .enumerate()
            .map(|(i, _)| format!("第 {} 节", i + 1))
            .collect()
    } else {
        outline.iter().map(|e| e.text.clone()).collect()
    };
    let glossary: Vec<String> = analysis.glossary.iter().map(|g| g.term.clone()).collect();
    // ③ 切片（≤8000 字/片；进度按片上报）——输入为剥离锚点后的 markdown
    let slices = slice_note(&strip_md, SLICE_MAX_CHARS);
    let total = slices.len();
    eprintln!("[refine-task] task={} 切片 {} 片", task_id, total);
    set_task(st, task_id, AiTaskState::Running { finished_slices: 0, total_slices: total });
    let settings = st
        .ai_settings
        .lock()
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .clone();
    let env_key = std::env::var("SILICONFLOW_API_KEY").ok().filter(|k| !k.is_empty());
    let stored_key = st.ai_credentials.load_key().ok().flatten();
    // 密钥来源诊断（脱敏：只打长度+前 6 字符；真机 unauthorized 排查 2026-08-21）
    eprintln!(
        "[refine-task] task={} key: env={} stored={}",
        task_id,
        env_key
            .as_ref()
            .map(|k| format!("{}:{}..", k.len(), &k[..6.min(k.len())]))
            .unwrap_or_else(|| "无".to_string()),
        stored_key
            .as_ref()
            .map(|k| format!("{}:{}..", k.len(), &k[..6.min(k.len())]))
            .unwrap_or_else(|| "无".to_string()),
    );
    let client = AiClient::from_settings(&settings, stored_key);
    let adapter = AiNoteRefineAdapter::new(client.clone());
    let mock_adapter = AiMockAdapter;
    // F2-B4：并发精修（worker 池消费切片队列；按片上报进度；失败片重试后
    // 仍失败 → 记 failed 下标，不中断其他片——部分成功语义）
    let (markdowns, failed) = refine_slices_concurrent(RefineCtx {
        slices: &slices,
        chapters: &chapters,
        glossary: &glossary,
        profile: kind.as_str(),
        adapter: &adapter,
        mock_adapter: &mock_adapter,
        mock,
        workers: total.min(CONCURRENCY),
        st,
        task_id,
    });
    // ④ 合并（协议层 merge_refine_slices：各片 join + 章节锚点回挂——7️⃣
    // 剥离的章节锚点按标题精确匹配还原，未匹配不挂）
    let mut refined = crate::ai_refine_protocol::merge_refine_slices(&markdowns, &chapter_anchors);
    // 与规则版 diff（基线=本地版，AI 变化点高亮）
    // 丢图修复（2026-08-21 F1）：协议 v2 前，模型可能丢弃规则版画面配图行
    // （`- ![画面 N](session-images/..)`）——本地合并降级：AI 未保留配图时
    // 把规则版配图行按章节合并回精修版（不丢不假，零模型成本）
    refined = crate::note_image_merge::merge_rule_images(&draft.markdown, &refined);
    let diff = diff_markdown(&draft.markdown, &refined);
    let (added, removed, _) = diff_stats(&diff);
    Ok(AiRefineResult {
        title: draft.title.clone(),
        base_markdown: draft.markdown.clone(),
        refined_markdown: refined,
        diff,
        added_lines: added,
        removed_lines: removed,
        slices: total,
        failed_slices: failed,
        model: client.config.model,
    })
}

/// 并发精修上下文（参数聚合——clippy too_many_arguments 修复）。
struct RefineCtx<'a> {
    slices: &'a [String],
    chapters: &'a [String],
    glossary: &'a [String],
    profile: &'a str,
    adapter: &'a AiNoteRefineAdapter,
    mock_adapter: &'a AiMockAdapter,
    mock: bool,
    workers: usize,
    st: &'a AppState,
    task_id: u64,
}

/// 片间摘要（F3 v2：前/后片首尾 N 字——提示词衔接上下文，防片间断裂）。
/// 纯函数可单测：取片开头/结尾 SUMMARY_MAX_CHARS 字符（截断到字符边界）。
fn slice_summary(text: &str, head: bool) -> Option<String> {
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
/// @ai-context: 返回 (各片 markdown（保序，失败片跳过）, 失败片数)。
///              单片失败不 panic、不中断其他片——部分成功语义（REQ-145）。
///              进度经 set_task 上报（finished = 已完成的片数，含失败片——
///              前端进度条推进不受单片失败影响）。
/// @ai-context: F3 v2：请求携带 slice_index/slice_total/prev_summary/
///              next_summary——模型知道自己是第几片、前后片衔接什么
///              （防章节标题重复/内容断裂）。
fn refine_slices_concurrent(ctx: RefineCtx<'_>) -> (Vec<String>, usize) {
    let total = ctx.slices.len();
    if total == 0 {
        return (Vec::new(), 0);
    }
    let queue: Arc<Mutex<VecDeque<usize>>> = Arc::new(Mutex::new((0..total).collect()));
    let (tx, rx) = mpsc::channel::<(usize, Option<String>)>();
    let workers = ctx.workers.max(1).min(total);
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
            scope.spawn(move || loop {
                let idx = {
                    let mut q = queue.lock().unwrap_or_else(|e| e.into_inner());
                    q.pop_front()
                };
                let Some(idx) = idx else { break };
                let req = &reqs[idx];
                let mut outcome: Option<String> = None;
                for attempt in 0..=SLICE_RETRY {
                    let resp = if mock {
                        Ok(mock_adapter.refine(req))
                    } else {
                        adapter.refine(req).map_err(AiTaskFailure::from)
                    };
                    match resp {
                        Ok(r) => {
                            outcome = Some(r.to_markdown());
                            break;
                        }
                        Err(e) if attempt < SLICE_RETRY => {
                            eprintln!("[refine-task] task={} 片 {} 第{}次失败，重试: {}", task_id, idx + 1, attempt + 1, e.message());
                        }
                        Err(e) => {
                            eprintln!("[refine-task] task={} 片 {} 重试后仍失败（保留已成功片）: {}", task_id, idx + 1, e.message());
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
    }
    let failed = by_index.iter().filter(|o| o.is_none()).count();
    let markdowns: Vec<String> = by_index.into_iter().flatten().collect();
    (markdowns, failed)
}
