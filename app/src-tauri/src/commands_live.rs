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
use tauri::{Emitter, State};

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
    /// v0.9.0 M2（REQ-189）：当前生效画面档（kebab-case；None=未定档——
    /// 前端面板挂载拉取兑底，tier-changed 事件可能早于监听注册）
    pub tier: Option<String>,
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
    let title: String = if trimmed.is_empty() {
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
        title: title.clone(),
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
        // v0.9.0 M2（REQ-189）：画面档降档确认共享状态（前端确认后写入，
        // screen worker 消费并 retune 采样器）
        tier_override: state.live_session.tier_override(),
        // v0.9.0 M2（REQ-189）：当前生效画面档共享槽（worker 写入，command 查询）
        applied_tier: state.live_session.applied_tier_slot(),
        // v0.11.5（Task 6）：档案三维覆写共享槽（update_live_profile 写入，worker 消费）
        profile_override: state.live_session.profile_override_slot(),
        // v0.11.5（Task 6）：当前生效三维档案快照（worker 写入，command 查询）
        applied_profile: state.live_session.applied_profile_slot(),
        // v0.11.5（Task 6）：窗口标题（档案重评用）
        window_title: title.clone(),
    };
    // REQ-104/132：剪贴板监听时间戳基准——与实时会话纪元同域（图片文件名不冲突）
    let epoch = Instant::now();
    let session_id = state.live_session.start(params).map_err(|e| e.to_string())?;
    start_clipboard_monitor(&state, session_id, epoch);
    Ok(session_id)
}

/// 确认画面档降档（v0.9.0 M2，REQ-189：降档需用户确认——降采样可能丢信息）。
///
/// @param tier - 确认后的档位标识（kebab-case；非法值明确报错）
/// @ai-context: 升档静默生效无需确认（更积极采样无损失）；降档确认写入共享
///              override → screen worker 下轮检测消费并 retune 采样器。
#[tauri::command]
pub async fn confirm_tier_downgrade(
    state: State<'_, AppState>,
    tier: String,
) -> Result<(), String> {
    let tier = crate::video_profile_spec::VisualTier::parse(&tier.chars().take(30).collect::<String>())
        .ok_or_else(|| "非法画面档位标识".to_string())?;
    state
        .live_session
        .confirm_tier_downgrade(tier)
        .map_err(|e| e.to_string())
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
        // v0.10.2：停止后不再自动捕获结构图（会话 33 实测 50%+ 误收字幕条）
        // ——改为图库「分析参考图集」手动触发（structure_capture 新管线）
    }
    Ok(stopped)
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
        // L1 修复：不再静默吞错——run_refine 失败（引擎/落库异常）时日志 +
        // 事件双通道可观测；与内部降级路径同事件名（session:refine-skipped），
        // 前端已有监听无需新增。不阻断语义保留（自动精修是增强非关键路径）
        if let Err(e) = crate::commands_refine_inner::run_refine(&state, session_id) {
            eprintln!("[Refine] 会话 {} 自动精修失败: {}", session_id, e);
            let _ = state.app.emit("session:refine-skipped", format!("自动精修失败: {}", e));
        }
    });
}

/// 查询实时会话状态（活动会话 id + 预热就绪标记 + 暂停标记）。
#[tauri::command]
pub fn live_session_status(state: State<'_, AppState>) -> LiveSessionStatus {
    // L1 修复：active_session_id 只查一次存局部变量（原两次调用间状态可能
    // 变化导致 active 与 session_id 口径不一致；也省一次锁）
    let active_id = state.live_session.active_session_id();
    LiveSessionStatus {
        active: active_id.is_some(),
        session_id: active_id,
        prepared: matches!(
            state.live_session.prepare_status(),
            crate::live_session_prepare::PrepareStatus::Ready
        ),
        paused: state.live_session.is_paused(),
        // v0.9.0 M2（REQ-189）：当前生效画面档（None=未定档/未激活）
        tier: state.live_session.applied_tier().map(|t| t.as_str().to_string()),
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

/// 采集态档案三维热切换（v0.11.5 Task 6：form/tier/domain 可选组合，至少一项）。
///
/// @param form - 内容形态（kebab-case；None=不覆写该维）
/// @param tier - 画面档位（kebab-case；None=不覆写该维）
/// @param domain - 领域（kebab-case；None=不覆写该维）
/// @ai-context: 写入 profile_override 共享槽 → screen worker 下轮采样 tick 消费
///              并 emit live:profile-updated 事件回推前端。
#[tauri::command]
pub fn update_live_profile(
    state: State<'_, AppState>,
    form: Option<String>,
    tier: Option<String>,
    domain: Option<String>,
) -> Result<bool, String> {
    // 至少一项
    if form.is_none() && tier.is_none() && domain.is_none() {
        return Err("form/tier/domain 至少需一项".to_string());
    }
    let parsed_form = form
        .as_deref()
        .and_then(crate::video_profile_spec::ContentForm::parse);
    let parsed_tier = tier
        .as_deref()
        .and_then(crate::video_profile_spec::VisualTier::parse);
    let parsed_domain = domain
        .as_deref()
        .and_then(crate::video_profile_domain::DomainKind::parse);
    // form/tier/domain 的非法值各自报错（不模糊——让前端知道哪维错了）
    if let Some(ref f) = form {
        if parsed_form.is_none() {
            return Err(format!("非法形态标识: {}", f));
        }
    }
    if let Some(ref t) = tier {
        if parsed_tier.is_none() {
            return Err(format!("非法画面档位标识: {}", t));
        }
    }
    if let Some(ref d) = domain {
        if parsed_domain.is_none() {
            return Err(format!("非法领域标识: {}", d));
        }
    }
    let po = crate::live_session::ProfileOverride {
        form: parsed_form,
        tier: parsed_tier,
        domain: parsed_domain,
    };
    state
        .live_session
        .update_profile_override(po)
        .map_err(|e| e.to_string())?;
    Ok(true)
}
