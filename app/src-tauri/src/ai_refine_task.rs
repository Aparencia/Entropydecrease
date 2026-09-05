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

use base64::Engine;
use tauri::Emitter;

use crate::ai_chat::{AiTurn, trajectory_to_json};
use crate::ai_client::AiClient;
use crate::ai_mock::AiMockAdapter;
use crate::ai_note_refine::AiNoteRefineAdapter;
use crate::ai_refine_protocol::AiRefineRequest;
use crate::ai_strategy::ResolvedDims;
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};
use crate::commands::AppState;
use crate::commands_ai_refine::{set_task, AiRefineResult};
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::note_diff::{diff_markdown, diff_stats};
use crate::note_filter::PurifyEnv;
use crate::outline::{detect_outline_smart, OutlineConfig};
use crate::video_profile::ProfileKind;

/// 切片并发上限（REQ-145：并发 2-3——配额并发安全由 command 层启动前按
/// 预估片数一次性消耗保证，此处 worker 数不超切片数）。v0.17.0：pub(crate)
/// ——笔记级精修任务共用同一上限。
pub(crate) const CONCURRENCY: usize = 3;

/// 精修流式帧（REQ-247 B+ 档：片级解析流——片完成 validate 后推渲染，
/// 中间态永不承诺；事件通道 "ai:refine-stream"，载荷 RefineStreamPayload）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RefineStreamFrame {
    /// 片完成进度（收集推进时推——前端进度行）
    Progress { slice_index: usize, slice_total: usize },
    /// 该片精修结果（validate 通过后的渲染 markdown——逐章正文流出）
    BlockDone { slice_index: usize, markdown: String },
    /// 该片失败（回退纯规则语义——诚实降级提示）
    SliceFailed { slice_index: usize, reason: String },
    /// 任务终态（全部片合并完成）
    Done { slices: usize, failed_slices: usize },
}

/// 流式事件载荷（taskId 过滤——多任务并行时各订阅只收自己的帧）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RefineStreamPayload {
    task_id: u64,
    frame: RefineStreamFrame,
}

/// 推送精修流帧（失败静默——流式是呈现增强，不得影响任务主链路）。
fn emit_refine_stream(st: &AppState, task_id: u64, frame: RefineStreamFrame) {
    let _ = st.app.emit("ai:refine-stream", RefineStreamPayload { task_id, frame });
}
/// 单片失败重试次数（幂等片——同片重跑不产生副作用）。
const SLICE_RETRY: usize = 1;

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

/// 后台精修任务：规则草稿 → 切片 → 逐片精修（mock/云端）→ 合并 → diff。
///
/// @ai-context: v0.17.0（REQ-245）：dims=策略解析结果（command 层 resolve 后
///              传入）——每片提示词一致（切片间风格统一），协议零改动。
pub fn run_refine_task(st: AppState, task_id: u64, session_id: i64, mock: bool, dims: ResolvedDims) {
    // 诊断日志（2026-08-21 真机"排队中"排查）：tauri dev 终端可见各阶段进度
    eprintln!(
        "[refine-task] task={} start session={} mock={} strategy={}",
        task_id, session_id, mock, dims.preset_id
    );
    run_refine_task_skeleton(st.clone(), task_id, format!("session={}", session_id), move || {
        run_refine_task_inner(&st, task_id, session_id, mock, &dims)
    });
}

/// 构建精修适配器（密钥解析/Provider 解析统一口径——会话级/笔记级共用；
/// v0.17.0 REQ-246 提取）。密钥来源诊断日志在层内（脱敏：只打长度+前 6 字符）。
pub(crate) fn build_refine_adapter(
    st: &AppState,
) -> Result<(AiClient, AiNoteRefineAdapter), AiTaskFailure> {
    let settings = st
        .ai_settings
        .lock()
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .clone();
    let env_key = std::env::var("SILICONFLOW_API_KEY").ok().filter(|k| !k.is_empty());
    // M1 统一解析口：env 优先 > 默认 Provider per-provider 凭据 > 旧 default scope
    let stored_key = crate::commands_ai_providers::resolve_default_provider_key(st)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?;
    eprintln!(
        "[refine-task] key: env={} stored={}",
        env_key
            .as_ref()
            .map(|k| format!("{}:{}..", k.len(), &k[..6.min(k.len())]))
            .unwrap_or_else(|| "无".to_string()),
        stored_key
            .as_ref()
            .map(|k| format!("{}:{}..", k.len(), &k[..6.min(k.len())]))
            .unwrap_or_else(|| "无".to_string()),
    );
    let store = st
        .ai_providers
        .lock()
        .map_err(|e| AiTaskFailure::Other(format!("AI Provider 存储锁中毒: {}", e)))?
        .clone();
    let client = AiClient::from_settings_with_store(&settings, stored_key, &store);
    Ok((client.clone(), AiNoteRefineAdapter::new(client)))
}

/// 精修任务主体（返回 Result；panic 由外层 catch_unwind 兜底）。
///
/// @ai-context: v0.16.0（REQ-230）返回 (结果, 轨迹)——轨迹为每片 LLM 调用的
///              提示词/回答；外层终态时随任务落库（任务对话视图数据源）。
fn run_refine_task_inner(
    st: &AppState,
    task_id: u64,
    session_id: i64,
    mock: bool,
    dims: &ResolvedDims,
) -> Result<(AiRefineResult, Vec<AiTurn>), AiTaskFailure> {
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
    // v0.17.0：密钥/Provider/适配器统一解析口（会话级/笔记级共用）
    let (client, adapter) = build_refine_adapter(st)?;
    let mock_adapter = AiMockAdapter;
    // v0.12.0 M5：画面理解——仅精修设置开启时装载会话屏卡图（≤1280px 控 token；
    // 空 → 精修纯文本，现有行为零变化；图文会话不触发——调用方只对视频会话接线）
    let vision_images = if settings.vision_refine_enabled {
        load_session_vision_images(&st.data_dir, session_id)
    } else {
        Vec::new()
    };
    // F2-B4：并发精修（worker 池消费切片队列；按片上报进度；失败片重试后
    // 仍失败 → 记 failed 下标，不中断其他片——部分成功语义）
    let (markdowns, failed, mut turns) = refine_slices_concurrent(RefineCtx {
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
        vision_images: &vision_images,
        dims,
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
    turns.sort_by_key(|t| t.turn); // 轨迹按片序排列（并发收集序 ≠ 片序）
    Ok((
        AiRefineResult {
            title: draft.title.clone(),
            base_markdown: draft.markdown.clone(),
            refined_markdown: refined,
            diff,
            added_lines: added,
            removed_lines: removed,
            slices: total,
            failed_slices: failed,
            model: client.config.model,
            // v0.17.0：策略溯源（档位 + 每维最终值——工作台溯源条数据源）
            strategy: Some(crate::commands_ai_refine::RefineStrategyInfo {
                preset_id: dims.preset_id.clone(),
                dims: dims.dims.clone(),
                // REQ-279：自定义档文本随结果落库（溯源/重生成沿用）
                custom_text: if dims.custom_text.is_empty() { None } else { Some(dims.custom_text.clone()) },
            }),
        },
        turns,
    ))
}

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

/// v0.12.0 M5：装载会话屏卡图（≤1280px 控 token → WebP/PNG base64 data URI）。
///
/// @ai-context: 仅 vision_refine_enabled 开启时调用；目录缺失/解码失败 → 跳过
///              （空列表 → 精修纯文本，现有行为零变化——画面理解是可选增强，
///              不是硬依赖，绝不阻塞精修主链路）。图片库为
///              data_dir/session-images/<id> 下平铺 `{timestamp_ms}.webp`（存图
///              口径——审查修复：旧过滤器漏 webp 导致取不到图）。
/// @ai-context: 数量上限 MAX_IMAGES=3（审查修复）：会话屏卡可数百张，全量装载 →
///              每切片请求携带全部图 → 内存/带宽/token 失控；按时间戳取最近 3 张
///              （画面要点随精修的最新上下文，时序语义正确）。
/// @ai-context: 隐私红线（ADR-010 扩展）：图片仅随精修切片请求上云，不作独立
///              提取命令；缩放控 token（长图缩放不裁剪，保画面完整）。
fn load_session_vision_images(data_dir: &std::path::Path, session_id: i64) -> Vec<String> {
    const MAX_EDGE: u32 = 1280;
    const MAX_IMAGES: usize = 3;
    let dir = data_dir.join("session-images").join(session_id.to_string());
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    // 文件名 = 时间戳（{ts}.webp）→ 按数值排序取最近 N 张（字典序对变长数字不成立，
    // 须解析数值——"1000" 字典序 < "999"）
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_file() {
                return None;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            if ext != "webp" && ext != "png" && ext != "jpg" && ext != "jpeg" {
                return None;
            }
            Some(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
        })
        .collect();
    names.sort_by_key(|n| {
        n.split('.').next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
    });
    names.reverse();
    names.truncate(MAX_IMAGES);
    let mut out = Vec::new();
    for name in names {
        let path = dir.join(&name);
        let Ok(frame) = image::open(&path) else { continue };
        // 长边 >1280 按比例缩放（保比例；小图原样——控 token 同时不糊画面）。
        // resize 返回 RgbaImage，与 to_rgba8() 同型。
        let (w, h) = (frame.width(), frame.height());
        let max_edge = w.max(h);
        let rgb = if max_edge > MAX_EDGE {
            let scale = MAX_EDGE as f32 / max_edge as f32;
            let nw = (w as f32 * scale).round().max(1.0) as u32;
            let nh = (h as f32 * scale).round().max(1.0) as u32;
            image::imageops::resize(&frame, nw, nh, image::imageops::FilterType::Triangle)
        } else {
            frame.to_rgba8()
        };
        let mut buf = std::io::Cursor::new(Vec::new());
        let encoder = image::codecs::png::PngEncoder::new(&mut buf);
        if rgb.write_with_encoder(encoder).is_err() {
            continue;
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
        out.push(format!("data:image/png;base64,{}", b64));
    }
    out
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
                    // 已有（db_ai_tasks），此处补片级时间（非流式阶段只有总耗时；
                    // 流式上线后同点补首 delta 时刻，见批次设计 §2.8 ③）。
                    let started = std::time::Instant::now();
                    let resp = if mock {
                        Ok(mock_adapter.refine(req))
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
