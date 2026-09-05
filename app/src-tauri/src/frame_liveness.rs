//! 画面停更监测（REQ-281，v0.19.6）——WGC 静默失活 watchdog + 心跳节拍纯逻辑。
//!
//! @ai-context: 用户双屏复现（视频本身在动但画面停更）指向我方 WGC 会话静默
//!              失活——WGC 内容驱动出帧，失活不报错、只表现为"无新帧"。
//!              本模块把判定做成可单测的纯状态机（时间/帧到达/后端/可见性），
//!              副作用（emit/重建）由调用方（屏幕 worker）执行。
//!
//! @ai-context: 判停口径与业界一致：只认"最小化/不可见/长时间无帧"，不认失焦；
//!              idle 降频探针（5s 一次）与暂停态由调用方 gate（不喂本模块
//!              allow_stall=false），防静止画面/静音学习段误报误重建。

use std::time::{Duration, Instant};

/// 无新帧持续超过该值视为"疑似停更"（视频正常播放帧率远高于此）。
pub const STALL_SECS: u64 = 5;
/// WGC 重建最小间隔（重建本身有成本；配合 DXGI_RECREATE_INTERVAL=30s 节奏）。
pub const RECREATE_MIN_INTERVAL: Duration = Duration::from_secs(30);
/// 帧心跳事件节拍（帧是否到达/静默秒数/后端/可见性上报前端）。
pub const HEARTBEAT_EVERY: Duration = Duration::from_secs(2);
/// 采样新鲜度窗口：距上次真实采样 > 该值（idle/暂停）不判停更。
pub const SAMPLE_FRESH_MS: Duration = Duration::from_millis(1500);

/// 停更监测状态（单采样线程持有，方法均为纯逻辑——时间由调用方注入）。
#[derive(Debug, Clone)]
pub struct FrameLiveness {
    /// 最近一次真实采样的墙钟时刻（判定新鲜度 gate）
    last_sample_at: Option<Instant>,
    /// 无新帧持续起点（有新帧即清 None）
    stall_since: Option<Instant>,
    /// 停更提示已上抛（边沿去重——恢复才清）
    pub stalled: bool,
    /// 上次 WGC 重建时刻（节流）
    last_recreate_at: Option<Instant>,
    /// 上次心跳时刻
    last_heartbeat_at: Option<Instant>,
}

/// 一次采样结论（喂入后由调用方读 stall_since/stalled 执行副作用）。
impl FrameLiveness {
    pub fn new() -> Self {
        Self {
            last_sample_at: None,
            stall_since: None,
            stalled: false,
            last_recreate_at: None,
            last_heartbeat_at: None,
        }
    }

    /// 采样结果入账：got_frame=true → 清停更窗口；false → 续记停更起点。
    ///
    /// @param now 墙钟（Instant::now）
    pub fn observe(&mut self, now: Instant, got_frame: bool) {
        self.last_sample_at = Some(now);
        if got_frame {
            self.stall_since = None;
        } else {
            self.stall_since = self.stall_since.or(Some(now));
        }
    }

    /// 距上次真实采样是否仍"新鲜"（> SAMPLE_FRESH_MS 的静默不判停更——idle/
    /// 暂停段由调用方 gate，此处兜底防御）。
    pub fn fresh(&self, now: Instant) -> bool {
        self.last_sample_at
            .is_some_and(|t| now.duration_since(t) <= SAMPLE_FRESH_MS)
    }

    /// 当前停更秒数（未开始停更/不新鲜 → None）。
    pub fn stall_secs(&self, now: Instant) -> Option<u64> {
        if !self.fresh(now) {
            return None;
        }
        let since = self.stall_since?;
        let secs = now.duration_since(since).as_secs();
        (secs >= 1).then_some(secs)
    }

    /// 停更提示边沿：持续 ≥ STALL_SECS 且尚未上抛。
    pub fn stall_edge(&self, now: Instant) -> bool {
        self.stall_secs(now).is_some_and(|s| s >= STALL_SECS) && !self.stalled
    }

    /// 恢复边沿：本采样有新帧且此前处于停更提示态。
    pub fn recover_edge(&self, got_frame: bool) -> bool {
        got_frame && self.stalled
    }

    /// WGC 重建是否到期（停更 ≥ STALL_SECS 且距上次重建 ≥ 最小间隔）。
    pub fn recreate_due(&self, now: Instant) -> bool {
        self.stall_secs(now).is_some_and(|s| s >= STALL_SECS)
            && self
                .last_recreate_at
                .is_none_or(|t| now.duration_since(t) >= RECREATE_MIN_INTERVAL)
    }

    /// 心跳是否到期。
    pub fn heartbeat_due(&self, now: Instant) -> bool {
        self.last_heartbeat_at
            .is_none_or(|t| now.duration_since(t) >= HEARTBEAT_EVERY)
    }

    /// 停更提示已上抛 / 心跳已发 / 重建已记（调用方执行副作用后调）。
    pub fn mark_stalled(&mut self) {
        self.stalled = true;
    }

    pub fn clear_stalled(&mut self) {
        self.stalled = false;
        self.stall_since = None;
    }

    pub fn mark_heartbeat(&mut self, now: Instant) {
        self.last_heartbeat_at = Some(now);
    }

    pub fn mark_recreate(&mut self, now: Instant) {
        self.last_recreate_at = Some(now);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t0() -> Instant {
        Instant::now()
    }

    #[test]
    fn fresh_samples_clear_stall_and_recover_edges() {
        let now = t0();
        let mut lv = FrameLiveness::new();
        // 连续无帧（采样频率保持新鲜窗口内）→ 5s 进入停更边沿；恢复新帧 →
        // recover 边沿 + 停更清零。判停时刻必须在 SAMPLE_FRESH_MS 内有采样
        lv.observe(now, false);
        lv.observe(now + Duration::from_millis(500), false);
        lv.observe(now + Duration::from_secs(3), false);
        lv.observe(now + Duration::from_secs(5), false); // 维持新鲜度（距判停 ≤1.5s）
        let stalled_at = now + Duration::from_secs(6);
        assert!(lv.stall_edge(stalled_at), "≥5s 无帧应触发停更边沿");
        assert_eq!(lv.stall_secs(stalled_at), Some(6));
        lv.mark_stalled();
        // 同刻不再重复边沿（去重）
        assert!(!lv.stall_edge(stalled_at));
        // 有新帧 → 恢复
        let rec_at = stalled_at + Duration::from_secs(2);
        assert!(lv.recover_edge(true));
        lv.observe(rec_at, true);
        lv.clear_stalled();
        assert_eq!(lv.stall_secs(rec_at + Duration::from_secs(1)), None);
    }

    #[test]
    fn stale_samples_do_not_judge_stall() {
        let now = t0();
        let mut lv = FrameLiveness::new();
        lv.observe(now, false);
        // 距上次采样超过新鲜窗口 → 不判停更（idle 探针兜底防御）
        let later = now + Duration::from_secs(10);
        assert_eq!(lv.stall_secs(later), None);
        assert!(!lv.stall_edge(later));
    }

    #[test]
    fn recreate_throttled_by_min_interval() {
        let now = t0();
        let mut lv = FrameLiveness::new();
        lv.observe(now, false);
        lv.observe(now + Duration::from_secs(1), false);
        lv.observe(now + Duration::from_secs(5), false); // 维持新鲜度
        let due = now + Duration::from_secs(6);
        assert!(lv.recreate_due(due));
        lv.mark_recreate(due);
        // 节流窗内：保持采样新鲜，重建仍被 30s 最小间隔挡住
        lv.observe(due + Duration::from_secs(9), false);
        assert!(!lv.recreate_due(due + Duration::from_secs(10)), "30s 节流内不重复重建");
        // 节流窗外：到期且新鲜 → 允许重建
        lv.observe(due + Duration::from_secs(30), false);
        assert!(lv.recreate_due(due + RECREATE_MIN_INTERVAL + Duration::from_secs(1)));
    }

    #[test]
    fn heartbeat_interval() {
        let now = t0();
        let mut lv = FrameLiveness::new();
        assert!(lv.heartbeat_due(now), "首拍即到期");
        lv.mark_heartbeat(now);
        assert!(!lv.heartbeat_due(now + Duration::from_secs(1)));
        assert!(lv.heartbeat_due(now + HEARTBEAT_EVERY + Duration::from_millis(50)));
    }
}
