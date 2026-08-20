//! 实时会话 Tauri commands（M7，REQ-007~012 编排入口）。
//!
//! @ai-context: 本层只做参数校验与转发：start 组装 LiveSessionParams 交给
//!              LiveSessionManager（会话线程内部完成捕获/ASR/OCR/融合），
//!              stop 等待线程退出并返回会话 id（前端据此刷新详情）。
//! @ai-context: v0.7.0 M1（REQ-104/132）：start 成功后顺带启动剪贴板监听
//!              （文本信号 + 图片直贴，见 clipboard_signal.rs），stop 时置位
//!              停止——监听与实时会话一一对应，同一时刻最多一个。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tauri::Emitter;
use tauri::State;

use crate::commands::AppState;
use crate::live_session::LiveSessionParams;

/// 实时会话状态（前端轮询）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSessionStatus {
    pub active: bool,
    pub session_id: Option<i64>,
    /// P3：引擎预热是否已就绪（前端"开始即录"提示）
    pub prepared: bool,
    /// 2026-08 修复：是否处于暂停（挂载拉取恢复右侧面板状态机用——
    /// recording 事件只发一次，刷新/重进页面后需靠此字段还原 phase）
    pub paused: bool,
}

/// 启动实时捕获会话（REQ-007~012 汇总入口）。
///
/// @param title - 会话标题（空串回退窗口名/默认名）
/// @param sourceWindow - 目标窗口标题（笔记命名与检索）
/// @param windowId - 目标窗口句柄（i64，None=全屏）
/// @param profile - 视频类型档案标识（REQ-043，kebab-case；None=自动检测结果）
#[tauri::command]
pub async fn start_live_session(
    state: State<'_, AppState>,
    title: String,
    source_window: Option<String>,
    window_id: Option<i64>,
    profile: Option<String>,
) -> Result<i64, String> {
    // 防御性校验：标题归一化（与 create_session 同口径）
    let trimmed = title.trim().to_string();
    let title = if trimmed.is_empty() {
        source_window
            .clone()
            .unwrap_or_else(|| "实时会话".to_string())
            .chars()
            .take(100)
            .collect()
    } else {
        trimmed.chars().take(100).collect()
    };

    let params = LiveSessionParams {
        title,
        source_window: source_window.map(|s| s.chars().take(100).collect()),
        hwnd: window_id,
        db: state.db.clone(),
        engines: state.engines.clone(),
        streaming_models: state.streaming_models.clone(),
        // ADR-012 F4-2：标点恢复模型路径（路径约定 lib.rs punctuation_model）
        punctuation_model: crate::punctuation_model(&state.model_dir),
        fusion: state.live_session.fusion(),
        vocab: state.vocab.clone(),
        // REQ-043：档案标识（非法值回退 Lecture 默认档案，不阻断）
        profile: profile.map(|p| crate::video_profile::ProfileKind::parse(&p)),
        // REQ-051：图片存储基目录（会话图片归档）
        data_dir: state.data_dir.clone(),
        app: state.app.clone(),
        // REQ-083：UI 垃圾黑名单（字幕源头过滤）
        ui_junk: state.ui_junk.clone(),
        // REQ-115：VAD 阈值共享槽（会话线程发布，诊断面板可查）
        vad_slot: state.vad_slot.clone(),
    };
    // REQ-104/132：剪贴板监听时间戳基准——与实时会话纪元同域（图片文件名不冲突）
    let epoch = Instant::now();
    let session_id = state.live_session.start(params).map_err(|e| e.to_string())?;
    start_clipboard_monitor(&state, session_id, epoch);
    Ok(session_id)
}

/// 停止实时捕获会话；返回被停止的会话 id（None=无活动会话）。
#[tauri::command]
pub async fn stop_live_session(state: State<'_, AppState>) -> Result<Option<i64>, String> {
    // 停止含 5s 有界等待——异步 command 不得直接阻塞运行时线程（审查要求；
    // LiveSessionManager 为 Clone+Send，可安全移入 spawn_blocking）
    let manager = state.live_session.clone();
    let stopped = tauri::async_runtime::spawn_blocking(move || manager.stop_active())
        .await
        .map_err(|e| format!("停止任务失败: {}", e))?
        .map_err(|e| e.to_string())?;
    stop_clipboard_monitor(&state);
    // v0.7.3（REQ-159）：停止后自动结构精修（表格/公式区域；模型未就绪/
    // 无结构区域 → 内部降级跳过——run_refine 已有完整降级链）
    if let Some(sid) = stopped {
        trigger_auto_refine(&state, sid);
        // v0.7.7（REQ-182）：停止后自动结构图捕获（非线性结构"图像即产物"；
        // 无屏/无图/版面空 → 内部降级跳过；去重幂等可重跑）
        trigger_auto_capture_structures(&state, sid);
    }
    Ok(stopped)
}

/// 停止后自动结构图捕获触发（v0.7.7 REQ-182）。
///
/// @ai-context: 与 trigger_auto_refine 并列的停止后批处理——纯本地规则管线
///              （版面分析 + 启发式过滤），无模型依赖；失败仅留日志不阻断
///              （捕获是增强非主链路）。
fn trigger_auto_capture_structures(state: &AppState, session_id: i64) {
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        match crate::structure_capture::capture_session_structures(
            &state.db,
            &state.data_dir,
            session_id,
            now,
        ) {
            Ok(summary) if summary.captured > 0 => {
                eprintln!(
                    "[Structures] 会话 {} 停止：自动捕获 {} 张结构图（扫描 {} 屏）",
                    session_id, summary.captured, summary.screens_scanned
                );
                let _ = state.app.emit("session:structures-updated", &summary);
            }
            Ok(_) => {} // 无结构区域/无图：静默跳过（常态）
            Err(e) => eprintln!("[Structures] 会话 {} 自动捕获失败: {}", session_id, e),
        }
    });
}

/// 停止后自动结构精修触发（v0.7.3 REQ-159）。
///
/// @ai-context: 前置检查：会话存在 region_kind=table/formula 的 OCR 块才触发
///              （无结构区域不白跑）；模型就绪检查交给 run_refine 内部
///              decide_refine（未下载 → session:refine-skipped 事件，诚实降级）。
fn trigger_auto_refine(state: &AppState, session_id: i64) {
    let has_structure = state
        .db
        .list_ocr_blocks(session_id)
        .map(|blocks| {
            blocks.iter().any(|b| {
                matches!(b.region_kind.as_deref(), Some("table" | "formula"))
            })
        })
        .unwrap_or(false);
    if !has_structure {
        return;
    }
    eprintln!("[Refine] 会话 {} 停止：检测到表格/公式区域，自动触发结构精修", session_id);
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = crate::commands_refine_inner::run_refine(&state, session_id);
    });
}

/// 查询实时会话状态（活动会话 id + 预热就绪标记 + 暂停标记）。
#[tauri::command]
pub fn live_session_status(state: State<'_, AppState>) -> LiveSessionStatus {
    LiveSessionStatus {
        active: state.live_session.active_session_id().is_some(),
        session_id: state.live_session.active_session_id(),
        prepared: matches!(
            state.live_session.prepare_status(),
            crate::live_session_prepare::PrepareStatus::Ready
        ),
        paused: state.live_session.is_paused(),
    }
}

/// 当前会话信息（REQ-151，v0.7.2：采集信息面板拉取兜底）。
///
/// @ai-context: live:session-info 事件在引擎就绪时发出——面板（liveActive 后
///              挂载）可能晚于事件注册监听，事件丢失 → 信息条不可见；本命令
///              提供挂载时拉取（事件驱动增量 + 拉取兜底双通道，修复不可见）。
/// @ai-context: 无活动会话 → 返回默认空信息（前端不显示信息条，语义正确）。
#[tauri::command]
pub fn live_session_info(state: State<'_, AppState>) -> crate::session_info::SessionInfo {
    state.live_session.session_info()
}

/// 预热流式 ASR 引擎（P3）：选窗口阶段后台加载，点"开始"即录。
///
/// @ai-context: 返回 PrepareStatus（loading/ready/failed/idle）供前端提示；
///              幂等；模型文件缺失预检快速返回 Failed（不白起线程）；
///              页面卸载时由 release_live_prepare 释放（15min TTL 兜底）。
#[tauri::command]
pub fn prepare_live_session(
    state: State<'_, AppState>,
) -> Result<crate::live_session_prepare::PrepareStatus, String> {
    // 防御性预检：四件套任一缺失 → 预热必失败，快速返回不白起线程
    let m = &state.streaming_models;
    let missing: Vec<&str> = [
        (&m.encoder, "encoder"),
        (&m.decoder, "decoder"),
        (&m.joiner, "joiner"),
        (&m.tokens, "tokens"),
    ]
    .iter()
    .filter(|(p, _)| !std::path::Path::new(p).exists())
    .map(|(_, name)| *name)
    .collect();
    if !missing.is_empty() {
        return Ok(crate::live_session_prepare::PrepareStatus::Failed(format!(
            "模型缺失: {}",
            missing.join(", ")
        )));
    }
    let env = crate::live_session_prepare::PrepareEnv {
        streaming_models: state.streaming_models.clone(),
        engines: state.engines.clone(),
        vocab: state.vocab.clone(),
        // ADR-012 F4-2：标点恢复模型路径（与 start 同口径）
        punctuation_model: crate::punctuation_model(&state.model_dir),
    };
    Ok(state.live_session.prepare(env))
}

/// 释放预热引擎（P3：离开课堂助手页时调用；有界 join ≤1s，超时 detach）。
#[tauri::command]
pub fn release_live_prepare(state: State<'_, AppState>) -> Result<(), String> {
    state.live_session.release_prepare().map_err(|e| e.to_string())
}

/// 暂停实时会话（2026-08 A1 硬暂停：完全停采，时间轴冻结）。
///
/// @ai-context: 只置共享标志——实际暂停由捕获线程边沿检测执行（WASAPI 端点
///              Stop + 暂停时长累计），会话线程发出 live:paused 事件与落库；
///              无活动会话/已暂停 → 明确报错（幂等拒绝）。
#[tauri::command]
pub fn pause_live_session(state: State<'_, AppState>) -> Result<(), String> {
    state.live_session.pause().map_err(|e| e.to_string())
}

/// 恢复暂停的实时会话（2026-08 A1；未暂停 → 明确报错）。
#[tauri::command]
pub fn resume_live_session(state: State<'_, AppState>) -> Result<(), String> {
    state.live_session.resume().map_err(|e| e.to_string())
}

/// 启动剪贴板监听（REQ-104/132）：start_live_session 成功后调用。
///
/// @ai-context: 语义 = 新会话开始 → 清空旧会话信号（信号只反映最近一次会话的
///              课中复制）→ 起轮询线程（句柄存入 AppState，stop 时置位停止）。
fn start_clipboard_monitor(state: &AppState, session_id: i64, epoch: Instant) {
    stop_clipboard_monitor(state); // 防御：清理异常路径残留监听
    state.clipboard.clear();
    let stop = Arc::new(AtomicBool::new(false));
    let thread = crate::clipboard_signal::spawn_clipboard_monitor(
        state.app.clone(),
        session_id,
        epoch,
        stop.clone(),
        state.clipboard.clone(),
        state.data_dir.join("session-images").join(session_id.to_string()),
        // REQ-108 补接线（审查发现）：Clipboard 事件落库（设计文档承诺）
        state.db.clone(),
    );
    *state.clipboard_monitor.lock().expect("剪贴板监听锁中毒") =
        Some(crate::clipboard_signal::ClipboardMonitorHandle { stop, thread });
}

/// 停止剪贴板监听（stop 置位；线程分片休眠在一个轮询周期内自行退出）。
///
/// @ai-context: 不 join 线程（JoinHandle drop 即 detach）——避免 stop 命令
///              阻塞在监听线程收尾上（会话线程停止已有 5s 有界等待，监听叠加会拖慢响应）。
fn stop_clipboard_monitor(state: &AppState) {
    if let Ok(mut guard) = state.clipboard_monitor.lock() {
        if let Some(handle) = guard.take() {
            handle.stop.store(true, Ordering::SeqCst);
        }
    }
}
