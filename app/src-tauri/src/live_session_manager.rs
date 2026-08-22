//! LiveSessionManager 状态查询/控制方法簇（Task #14 自 live_session.rs 拆出）。
//!
//! @ai-context: 2026-08-21 Task #14 硬限拆分：live_session.rs 实测 727 行超
//!              AGENTS.md ">600 行必拆" 硬限。本文件承接围绕"共享状态读写、
//!              不起线程"的方法簇——快照查询（fusion/latest_frame/session_info/
//!              画面档槽）+ 暂停/恢复 + 停止清理（stop_active）+ 会话 id 查询
//!              （active/running）；内聚点：全部只操作 manager 持有的共享槽，
//!              无会话线程编排。
//! @ai-context: 职责边界：结构体定义/构造在 live_session.rs；启动与预热交接
//!              生命周期在 live_session_lifecycle.rs。impl LiveSessionManager
//!              跨文件分布，公共 API 签名零变化。

use std::sync::atomic::Ordering;

use crate::error::{AppError, Result};
use crate::live_session::LiveSessionManager;
use crate::live_session_fusion::FusionTracker;

impl LiveSessionManager {
    /// 融合状态跟踪句柄（command 层组装 LiveSessionParams 时获取）。
    pub fn fusion(&self) -> FusionTracker {
        self.fusion.clone()
    }

    /// 最新捕获帧快照（用户截图命令读取；无活动会话/未捕获到帧为 None）。
    pub fn latest_frame(&self) -> Option<crate::live_session_frame::LatestCapturedFrame> {
        self.latest_frame.lock().ok().and_then(|g| g.clone())
    }

    /// 当前会话信息快照（REQ-151：前端挂载兜底拉取——live:session-info 事件
    /// 在引擎就绪时发出，可能早于面板挂载/监听注册，拉取保证信息条始终可见）。
    pub fn session_info(&self) -> crate::session_info::SessionInfo {
        self.session_info.snapshot()
    }

    /// 是否处于暂停（2026-08 修复：live_session_status 拉取用——recording/
    /// paused 事件只发一次，页面刷新/重进后前端需拉取还原状态机）。
    pub fn is_paused(&self) -> bool {
        self.pause.paused.load(Ordering::SeqCst)
    }

    /// 画面档降档确认共享状态句柄（command 层组装 LiveSessionParams 时获取；
    /// v0.9.0 M2 REQ-189——前端确认降档后写入，worker 消费）。
    pub fn tier_override(&self) -> std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>> {
        self.tier_override.clone()
    }

    /// 确认画面档降档（v0.9.0 M2 REQ-189）：写入共享状态 → screen worker
    /// 下轮检测消费并 retune 采样器；无活动会话 → 明确报错（幂等拒绝）。
    pub fn confirm_tier_downgrade(&self, tier: crate::video_profile_spec::VisualTier) -> Result<()> {
        let guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_none() {
            return Err(AppError::Io("无活动实时会话".to_string()));
        }
        *self.tier_override.lock().expect("tier override lock poisoned") = Some(tier);
        Ok(())
    }

    /// 当前生效画面档快照（v0.9.0 M2 REQ-189：worker 应用档位时写入；
    /// 前端挂载拉取兜底——tier-changed 事件可能早于面板监听注册）。
    pub fn applied_tier(&self) -> Option<crate::video_profile_spec::VisualTier> {
        self.applied_tier.lock().ok().and_then(|g| *g)
    }

    /// 生效画面档共享槽句柄（command 层组装 LiveSessionParams 时获取）。
    pub fn applied_tier_slot(
        &self,
    ) -> std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>> {
        self.applied_tier.clone()
    }

    /// v0.11.5（Task 6）：档案三维覆写共享槽句柄（command 层组装 LiveSessionParams 时获取）。
    pub fn profile_override_slot(
        &self,
    ) -> std::sync::Arc<std::sync::Mutex<Option<crate::live_session::ProfileOverride>>> {
        self.profile_override.clone()
    }

    /// v0.11.5（Task 6）：写入三维档案覆写（无活动会话 → 明确报错）。
    pub fn update_profile_override(
        &self,
        po: crate::live_session::ProfileOverride,
    ) -> Result<()> {
        let guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_none() {
            return Err(AppError::Io("无活动实时会话".to_string()));
        }
        *self.profile_override.lock().expect("profile override lock poisoned") = Some(po);
        Ok(())
    }

    /// v0.11.5（Task 6）：当前生效三维档案快照（worker 应用后写入；None=未设置）。
    pub fn applied_profile(
        &self,
    ) -> Option<crate::live_session::ProfileOverride> {
        self.applied_profile.lock().ok().and_then(|g| g.clone())
    }

    /// v0.11.5（Task 6）：当前生效三维档案共享槽句柄（command 层读取）。
    pub fn applied_profile_slot(
        &self,
    ) -> std::sync::Arc<std::sync::Mutex<Option<crate::live_session::ProfileOverride>>> {
        self.applied_profile.clone()
    }

    /// 暂停活动会话（2026-08 A1 硬暂停：完全停采）。
    ///
    /// @ai-context: 只置共享标志——实际暂停由捕获线程边沿检测执行
    ///              （WASAPI 端点 Stop）并累计补偿时长；事件/落库由会话
    ///              线程边沿检测发出（保证与真实暂停时序一致）。
    /// @ai-context: 无活动会话/已暂停 → 明确报错（幂等拒绝）。
    pub fn pause(&self) -> Result<()> {
        let guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_none() {
            return Err(AppError::Io("无活动实时会话".to_string()));
        }
        if self.pause.paused.swap(true, Ordering::SeqCst) {
            return Err(AppError::Io("会话已处于暂停".to_string()));
        }
        Ok(())
    }

    /// 恢复暂停的会话（2026-08 A1；未暂停 → 明确报错）。
    pub fn resume(&self) -> Result<()> {
        let guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_none() {
            return Err(AppError::Io("无活动实时会话".to_string()));
        }
        if !self.pause.paused.swap(false, Ordering::SeqCst) {
            return Err(AppError::Io("会话未处于暂停".to_string()));
        }
        Ok(())
    }

    /// 停止活动会话（有界等待线程退出，返回其会话 id）。
    ///
    /// @ai-context: 有界等待 5s（审查 M7 修复）：超时后 detach（线程最终自行退出），
    ///              不阻塞 Tauri IPC；调用方（command）用 spawn_blocking 包裹。
    /// @ai-context: REQ-031：融合已移入后台线程，会话线程在 finish+emit 后即退出——
    ///              停止响应不随段数恶化（融合重算不再阻塞停止）。
    pub fn stop_active(&self) -> Result<Option<i64>> {
        let mut guard = self.active.lock().expect("live session lock poisoned");
        let Some(active) = guard.take() else { return Ok(None) };
        active.stop_flag.store(true, Ordering::SeqCst);
        let session_id = active.session_id;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !active.thread.is_finished() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if !active.thread.is_finished() {
            eprintln!("[LiveSession] 会话线程 5s 内未退出，已 detach（资源由系统回收）");
        }
        Ok(Some(session_id))
    }

    /// 当前活动会话 id（无则 None；线程已退出的残留会话自动清理——审查 M6 修复）。
    pub fn active_session_id(&self) -> Option<i64> {
        let mut guard = self.active.lock().expect("live session lock poisoned");
        match guard.as_ref() {
            Some(a) if a.thread.is_finished() => {
                // 线程内启动失败（模型加载/音频设备不可用）退出后清理残留
                let id = a.session_id;
                *guard = None;
                Some(id)
            }
            Some(a) => Some(a.session_id),
            None => None,
        }
    }

    /// 真正在运行的会话 id（REQ-176 v0.7.5）：线程已退出的残留返回 None。
    ///
    /// @ai-context: 与 active_session_id 的区别——active_session_id 对已退出
    ///              残留返回其 id（供上层"刚结束"语义使用）；本方法只认
    ///              "线程未退出"。残留回收（mark_stale_recording）用它区分
    ///              进行中会话与会话31 类残留（线程异常退出但 DB 停留 recording）。
    pub fn running_session_id(&self) -> Option<i64> {
        let guard = self.active.lock().expect("live session lock poisoned");
        match guard.as_ref() {
            Some(a) if !a.thread.is_finished() => Some(a.session_id),
            _ => None,
        }
    }
}
