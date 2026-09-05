//! 会话全量离线精修（第二遍）命令面（v0.20.2 / REQ-268）。
//!
//! @ai-context: 实时链路只有端点句 SenseVoice 重打分；本命令把"导入同级的
//!              全窗离线质量"带给已结束会话：读取 S4 落盘音频
//!              （data_dir/session-audio/{id}.wav，16k PCM16）后台分窗重跑
//!              SenseVoice → 逐窗与现网轴比对 → 产 session_refine_drafts
//!              （pending），用户经 second_pass_list/decide 预览采纳/回退。
//!              原料 session_segments 全程不可变（可逆契约，ADR-030 决策 5）；
//!              采纳文本经 asr_pass2::effective_segments 在读取/转笔记面生效。
//! @ai-context: 边界——引擎池 ASR 线程串行：第二遍期间实时重打分排队等待
//!              （窗间检查 cancel 可放弃后续窗，当前窗不可抢占——引擎请求
//!              无中断语义，只靠有界等待兜底卡死）；进度经事件推送不落库
//!              （运行态=内存注册表，崩溃后 pending 草稿可重跑清理）。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::asr_pass2::{self, TimedText};
use crate::commands::AppState;
use crate::db::Db;
use crate::db_session_refine::{
    NewRefineDraft, RefineDraft, ORIGIN_SECOND_PASS, SOURCE_ASR_PASS2, STATUS_ADOPTED,
    STATUS_PENDING, STATUS_REJECTED,
};
use crate::engine::EnginePool;
use crate::types::SessionSegment;

/// 单窗推理有界等待（SenseVoice 30s 窗在慢机也应远小于此；超时=引擎卡死，
/// 任务中止并保留已完成草稿——不静默吞错）。
const WINDOW_TIMEOUT: Duration = Duration::from_secs(120);
/// 进度事件节流窗数（每 5 窗推一次，避免高频 IPC）。
const PROGRESS_EVERY: usize = 5;

/// 会话第二遍运行句柄（注册表值；cancel 置位 → 窗间放弃后续窗）。
#[derive(Clone)]
pub struct Pass2Job {
    cancel: Arc<AtomicBool>,
}

impl Pass2Job {
    fn new() -> Self {
        Self { cancel: Arc::new(AtomicBool::new(false)) }
    }
    fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
    fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

/// 第二遍概览（前端裁决页数据）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecondPassView {
    pub running: bool,
    pub total: usize,
    pub pending: usize,
    pub adopted: usize,
    pub rejected: usize,
    pub items: Vec<RefineDraft>,
}

fn segments_to_timed(segs: &[SessionSegment]) -> Vec<TimedText> {
    segs.iter()
        .map(|s| TimedText { start_ms: s.start_ms, end_ms: s.end_ms, text: s.text.clone() })
        .collect()
}

/// 后台执行体（引擎池/DB 均 Arc 可跨线程）。
fn run_second_pass(
    app: AppHandle,
    db: Db,
    engines: EnginePool,
    audio_path: PathBuf,
    session_id: i64,
    job: Pass2Job,
) -> Result<usize, String> {
    let wave = sherpa_onnx::Wave::read(&audio_path.to_string_lossy())
        .ok_or_else(|| "读取会话落盘音频失败（文件损坏？）".to_string())?;
    let sample_rate = wave.sample_rate();
    let samples = wave.samples();
    if samples.is_empty() {
        return Err("会话落盘音频为空，无法精修".to_string());
    }
    let duration_ms = (samples.len() as u64 * 1000) / sample_rate as u64;
    let raw_segs = db.list_segments(session_id).map_err(|e| format!("读取会话段失败: {e}"))?;
    let timed = segments_to_timed(&raw_segs);
    let windows = asr_pass2::plan_windows(duration_ms);
    if windows.is_empty() {
        return Err("音频时长为零，无法分窗精修".to_string());
    }
    // 重跑语义：清掉上一次未决草稿（已裁决历史保留——adopted/rejected 不可清）
    db.clear_refine_drafts(session_id, ORIGIN_SECOND_PASS, STATUS_PENDING)
        .map_err(|e| format!("清理旧草稿失败: {e}"))?;
    let total = windows.len();
    let mut inserted = 0usize;
    for (i, (start_ms, end_ms)) in windows.iter().enumerate() {
        if job.is_cancelled() {
            let _ = app.emit("session:refine2:aborted", session_id);
            return Ok(inserted);
        }
        let from = (*start_ms * sample_rate as u64 / 1000) as usize;
        let to = ((*end_ms * sample_rate as u64 / 1000) as usize).min(samples.len());
        let text = match engines.transcribe_pcm_timeout(&samples[from..to], sample_rate, WINDOW_TIMEOUT)
        {
            Ok(seg) => seg.text,
            // 单窗失败（超时/引擎异常）：中止并保留已完成草稿——诚实报错不静默
            Err(e) => return Err(format!("第二遍转写窗 {}/{} 失败: {}", i + 1, total, e)),
        };
        if let Some(p) = asr_pass2::propose_window((*start_ms, *end_ms), &text, &timed) {
            let n = db
                .add_refine_drafts(&[NewRefineDraft {
                    session_id,
                    origin: ORIGIN_SECOND_PASS.to_string(),
                    start_ms: p.start_ms,
                    end_ms: p.end_ms,
                    base_text: p.base_text,
                    refined_text: p.refined_text,
                    source: SOURCE_ASR_PASS2.to_string(),
                    confidence: None,
                    similarity: Some(p.similarity),
                }])
                .map_err(|e| format!("落草稿失败: {e}"))?;
            inserted += n;
        }
        if (i + 1) % PROGRESS_EVERY == 0 || i + 1 == total {
            let _ = app.emit(
                "session:refine2:progress",
                serde_json::json!({ "sessionId": session_id, "done": i + 1, "total": total }),
            );
        }
    }
    Ok(inserted)
}

/// 启动会话第二遍（后台线程；已运行中/无落盘音频/未结束会话拒绝）。
#[tauri::command]
pub fn second_pass_start(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<(), String> {
    if session_id <= 0 {
        return Err("sessionId 非法".to_string());
    }
    {
        let jobs = state.second_pass_jobs.lock().map_err(|_| "任务注册表锁中毒".to_string())?;
        if jobs.contains_key(&session_id) {
            return Err("该会话已有第二遍任务进行中".to_string());
        }
    }
    let Some(session) = state
        .db
        .get_session(session_id)
        .map_err(|e| format!("查询会话失败: {e}"))?
    else {
        return Err("会话不存在".to_string());
    };
    if session.status != "finished" {
        return Err("会话尚未结束（需停止捕获后方可离线精修）".to_string());
    }
    let audio_path = state.data_dir.join("session-audio").join(format!("{}.wav", session_id));
    if !audio_path.exists() {
        return Err("未找到会话落盘音频（离线精修仅支持有 S4 音频的实时捕获会话）".to_string());
    }
    let job = Pass2Job::new();
    {
        let mut jobs = state.second_pass_jobs.lock().map_err(|_| "任务注册表锁中毒".to_string())?;
        jobs.insert(session_id, job.clone());
    }
    let app = app.clone();
    let db = state.db.clone();
    let engines = state.engines.clone();
    let path = audio_path.clone();
    let spawn = std::thread::Builder::new()
        .name("entropy-second-pass".into())
        .spawn(move || {
            let result = run_second_pass(app.clone(), db.clone(), engines, path, session_id, job);
            // 无论成败先移除运行标记（注册表与线程一一对应）
            if let Ok(mut jobs) = app.state::<AppState>().second_pass_jobs.lock() {
                jobs.remove(&session_id);
            }
            match result {
                Ok(n) => {
                    let _ = app.emit(
                        "session:refine2:done",
                        serde_json::json!({ "sessionId": session_id, "proposals": n }),
                    );
                }
                Err(e) => {
                    eprintln!("[SecondPass] 会话 {} 第二遍失败: {}", session_id, e);
                    let _ = app.emit(
                        "session:refine2:failed",
                        serde_json::json!({ "sessionId": session_id, "error": e }),
                    );
                }
            }
        });
    if let Err(e) = spawn {
        if let Ok(mut jobs) = state.second_pass_jobs.lock() {
            jobs.remove(&session_id);
        }
        return Err(format!("第二遍线程启动失败: {e}"));
    }
    Ok(())
}

/// 取消进行中的第二遍（置位后当前窗完成即停——引擎请求不可抢占）。
#[tauri::command]
pub fn second_pass_cancel(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    let jobs = state.second_pass_jobs.lock().map_err(|_| "任务注册表锁中毒".to_string())?;
    match jobs.get(&session_id) {
        Some(job) => {
            job.cancel();
            Ok(())
        }
        None => Err("该会话没有进行中的第二遍任务".to_string()),
    }
}

/// 第二遍概览（运行标记 + 草稿计数与全量条目——裁决页数据源）。
#[tauri::command]
pub fn second_pass_list(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<SecondPassView, String> {
    if session_id <= 0 {
        return Err("sessionId 非法".to_string());
    }
    let running = state
        .second_pass_jobs
        .lock()
        .map_err(|_| "任务注册表锁中毒".to_string())?
        .contains_key(&session_id);
    let items = state
        .db
        .list_refine_drafts(session_id, ORIGIN_SECOND_PASS, None)
        .map_err(|e| format!("读取精修草稿失败: {e}"))?;
    let total = items.len();
    let pending = items.iter().filter(|d| d.status == STATUS_PENDING).count();
    let adopted = items.iter().filter(|d| d.status == STATUS_ADOPTED).count();
    let rejected = items.iter().filter(|d| d.status == STATUS_REJECTED).count();
    Ok(SecondPassView { running, total, pending, adopted, rejected, items })
}

/// 裁决单条草稿（采纳/回退；双向可翻转——原料表永不变）。
///
/// @ai-context: 采纳即采集混淆画像（REQ-269）：旧文本 vs 采纳精修文本的词级
///              差异进 asr_confusion 画像（JSON 校准）——用户裁决=有标注参考。
#[tauri::command]
pub fn second_pass_decide(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: i64,
    draft_id: i64,
    adopt: bool,
) -> Result<(), String> {
    if session_id <= 0 || draft_id <= 0 {
        return Err("参数非法".to_string());
    }
    let status = if adopt { STATUS_ADOPTED } else { STATUS_REJECTED };
    state
        .db
        .decide_refine_draft(draft_id, status)
        .map_err(|e| format!("裁决失败: {e}"))?;
    // REQ-269 采集：采纳时把（旧文→新文）词级差异记入混淆画像（失败仅日志——
    // 画像为质量增强层，不影响裁决主链路）
    if adopt {
        let drafts = state
            .db
            .list_refine_drafts(session_id, ORIGIN_SECOND_PASS, Some(STATUS_ADOPTED))
            .map_err(|e| format!("读取草稿失败: {e}"))?;
        if let Some(d) = drafts.iter().find(|x| x.id == draft_id) {
            if let Ok(mut store) = state.asr_confusion.lock() {
                store.record_adoption(&d.base_text, &d.refined_text);
                if let Err(e) = store.save(&state.asr_confusion_path) {
                    eprintln!("[AsrConfusion] 采纳画像落盘失败: {e}");
                }
            } else {
                eprintln!("[AsrConfusion] 混淆表锁中毒，跳过本次画像采集");
            }
        }
    }
    // 会话域变更广播：详情/预览面即时可见采纳结果
    crate::notify::emit_changed(&app, crate::notify::DataDomain::Sessions);
    Ok(())
}
