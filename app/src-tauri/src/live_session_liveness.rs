//! REQ-281 帧停更监测（live_session_frame.rs 的拆分子模块）。
//!
//! @ai-context: 屏幕采样线程的「停更判定 + 心跳 + WGC 自愈」副作用集中于此——
//!              判定语义由 frame_liveness 纯状态机持有，本模块只负责读采样器
//!              后端/可见性、发 live:frame-* 事件、在节流窗口内 revive_wgc。
//! @ai-context: 边界 —— 主采样拍每拍调用 `liveness_check` 一次（含心跳）；
//!              自动暂停期的轻量轮询调用 `watchdog_paused_probe`（**无提示无心跳**：
//!              暂停语义下停更提示无意义，仅观测 + 复活，防复合卡死）。
//! @ai-context: 副作用 = app.emit ×3 种事件 + ScreenCaptureSampler::revive_wgc；
//!              无锁新增（仅读屏幕句柄状态）；时间基准 now 由调用方注入。

use std::time::Instant;

use tauri::Emitter;

use crate::capture::ScreenCaptureSampler;

/// live:frame-heartbeat 载荷（诊断观测：后端/帧到达/静默秒数/目标可见性）。
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FrameHeartbeatPayload {
    backend: String,
    got_frame: bool,
    silent_secs: u64,
    visible: bool,
}

/// live:frame-stalled 载荷（停更秒数——前端提示语）。
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FrameStalledPayload {
    silent_secs: u64,
}

/// REQ-281 停更监测副作用执行点（真实采样拍后调用一次）：
///
/// @ai-context: 判定语义（frame_liveness 纯状态机）：仅 WGC 窗口捕获模式判停
///              （DXGI 无帧=桌面无变化属正常，不重建不提示）；目标不可见时
///              清提示不动作（最小化/遮挡另有既有 window-lost/用户感知路径）。
///              心跳每 2s 一报（含后端名/帧到达/静默秒数/可见性——真机复现
///              诊断与停更提示共用同一信号源）。
#[allow(clippy::too_many_arguments)]
pub(super) fn liveness_check(
    app: &tauri::AppHandle,
    mut screen: Option<&mut ScreenCaptureSampler>,
    liveness: &mut crate::frame_liveness::FrameLiveness,
    got_frame: bool,
    now: Instant,
) {
    let backend = screen
        .as_ref()
        .map(|s| s.backend_name().to_string())
        .unwrap_or_else(|| "none".to_string());
    let visible = screen.as_ref().is_none_or(|s| s.target_visible());
    let silent_secs = liveness.stall_secs(now).unwrap_or(0);

    // 心跳（独立于停更判定——诊断观测恒可用）
    if liveness.heartbeat_due(now) {
        liveness.mark_heartbeat(now);
        let _ = app.emit(
            "live:frame-heartbeat",
            FrameHeartbeatPayload {
                backend: backend.clone(),
                got_frame,
                silent_secs,
                visible,
            },
        );
    }

    // 非 WGC/无窗口：无"停更"语义（DXGI 超时=桌面无变化）；残留提示清掉
    if backend != "wgc" || !visible {
        if liveness.stalled {
            liveness.clear_stalled();
            let _ = app.emit("live:frame-recovered", ());
        }
        return;
    }

    liveness.observe(now, got_frame);
    if liveness.recover_edge(got_frame) {
        liveness.clear_stalled();
        let _ = app.emit("live:frame-recovered", ());
        return;
    }
    if liveness.stall_edge(now) {
        liveness.mark_stalled();
        let _ = app.emit(
            "live:frame-stalled",
            FrameStalledPayload {
                silent_secs: liveness.stall_secs(now).unwrap_or(0),
            },
        );
    }
    // 停更且到重建节流窗口 → WGC 会话自愈（用户复现=视频在动画面停更）
    if !got_frame && liveness.recreate_due(now) {
        if let Some(s) = screen.as_mut() {
            s.revive_wgc();
        }
        liveness.mark_recreate(now);
    }
}

/// 审查 F3：自动暂停期 watchdog 探针（无提示无心跳——暂停语义下停更提示无
/// 意义；仅做观测 + WGC 自愈）。防复合卡死：暂停期间 WGC 会话失活（REQ-281
/// 原场景）→ 恢复检测读不到新帧 → 永久卡自动暂停；此处探针周期性复活会话。
/// P2-4：轻量轮询扩到 fg 暂停期后探针随之覆盖 fg 期（视频暂停/画面停更期间
/// 同样需要 WGC 自愈；探针只观测 + 复活，任意暂停期无提示副作用）。
pub(super) fn watchdog_paused_probe(
    mut screen: Option<&mut ScreenCaptureSampler>,
    liveness: &mut crate::frame_liveness::FrameLiveness,
    got_frame: bool,
    now: Instant,
) {
    let Some(_) = screen.as_mut() else { return };
    liveness.observe(now, got_frame);
    let wgc = screen.as_ref().is_some_and(|s| s.backend_name() == "wgc");
    let visible = screen.as_ref().is_none_or(|s| s.target_visible());
    if !wgc || !visible || got_frame {
        return;
    }
    if liveness.recreate_due(now) {
        if let Some(s) = screen.as_mut() {
            s.revive_wgc();
        }
        liveness.mark_recreate(now);
    }
}
