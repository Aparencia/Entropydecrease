//! 进程 CPU 负载监测（REQ-039 P8 / v0.4.0 M4 自动降级触发源）。
//!
//! @ai-context: 高负载（CPU 占用持续超阈值）→ 采样调度降档（全帧 0.2→0.1fps），
//!              保 ASR 主链路；回落自动解除。CPU 占用 = 进程 CPU 时间增量 / 墙钟增量
//!              （Windows GetProcessTimes，100ns 单位）。
//! @ai-context: update() 为纯判定（注入增量，可单测）；系统调用只在 tick() 内
//!              （Windows 门控；非 Windows 返回不降级）。

/// 高负载阈值（进程 CPU 占用率 >80%）。
const HIGH_LOAD_RATIO: f64 = 0.8;

/// 持续超阈值秒数（防抖：瞬时尖峰不降级）。
const SUSTAIN_SECS: f64 = 3.0;

/// 进程 CPU 时间单位换算（GetProcessTimes 为 100ns）。
const CPU_TIME_UNIT_SECS: f64 = 1e-7;

/// 负载监测器（有状态：上次采样基准 + 持续时长 + 当前降级标志）。
#[derive(Debug, Default)]
pub struct LoadMonitor {
    /// (墙钟基准, 内核 100ns, 用户 100ns)；None=首次采样
    last: Option<(std::time::Instant, u64, u64)>,
    /// 已持续超阈值秒数
    sustained: f64,
    /// 当前降级标志
    degraded: bool,
}

impl LoadMonitor {
    pub fn new() -> Self {
        Self::default()
    }

    /// 采样一次（调用方节流 ~2s）；返回当前降级标志。
    pub fn tick(&mut self) -> bool {
        let Some((kernel, user)) = process_cpu_times() else { return self.degraded };
        let now = std::time::Instant::now();
        let ratio = match self.last {
            Some((prev_now, prev_k, prev_u)) => {
                let wall = now.duration_since(prev_now).as_secs_f64();
                let cpu = ((kernel + user).saturating_sub(prev_k + prev_u)) as f64 * CPU_TIME_UNIT_SECS;
                if wall > 0.0 { cpu / wall } else { 0.0 }
            }
            None => 0.0,
        };
        self.last = Some((now, kernel, user));
        self.update(ratio)
    }

    /// 纯判定：按本次采样 CPU 占用率推进状态（注入式，可单测）。
    ///
    /// @ai-context: 超阈值持续 ≥SUSTAIN_SECS → 降级；单次回落立即解除
    ///              （低于阈值即清零持续时长——瞬时波动不误降）。
    pub fn update(&mut self, cpu_ratio: f64) -> bool {
        if cpu_ratio > HIGH_LOAD_RATIO {
            self.sustained += 2.0; // 采样间隔近似 2s（调用方节流）
            if self.sustained >= SUSTAIN_SECS {
                self.degraded = true;
            }
        } else {
            self.sustained = 0.0;
            self.degraded = false;
        }
        self.degraded
    }

    /// 当前降级标志（M7 诊断面板数据源；暂由 tick/update 返回值消费，登记豁免）。
    #[allow(dead_code)]
    pub fn is_degraded(&self) -> bool {
        self.degraded
    }
}

/// 进程 CPU 时间（内核+用户，100ns 单位）；失败返回 None。
#[cfg(target_os = "windows")]
fn process_cpu_times() -> Option<(u64, u64)> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
    unsafe {
        let mut creation = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        GetProcessTimes(GetCurrentProcess(), &mut creation, &mut exit, &mut kernel, &mut user)
            .ok()?;
        let to_u64 = |ft: FILETIME| ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64;
        Some((to_u64(kernel), to_u64(user)))
    }
}

#[cfg(not(target_os = "windows"))]
fn process_cpu_times() -> Option<(u64, u64)> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_load_never_degrades() {
        let mut m = LoadMonitor::new();
        for _ in 0..10 {
            assert!(!m.update(0.3));
        }
        assert!(!m.is_degraded());
    }

    #[test]
    fn sustained_high_load_degrades() {
        let mut m = LoadMonitor::new();
        // 前 1 次采样（2s）不降级（<3s 防抖）
        assert!(!m.update(0.95));
        // 第 2 次采样累计 4s ≥ 3s → 降级
        assert!(m.update(0.95));
        assert!(m.is_degraded());
    }

    #[test]
    fn single_spike_does_not_degrade() {
        let mut m = LoadMonitor::new();
        assert!(!m.update(0.95)); // 2s
        assert!(!m.update(0.2)); // 回落清零
        assert!(!m.update(0.95)); // 重新计时（2s）
        assert!(m.update(0.95)); // 累计 4s ≥ 3s → 降级
        assert!(m.is_degraded());
    }

    #[test]
    fn recovery_clears_degraded() {
        let mut m = LoadMonitor::new();
        m.update(0.95);
        m.update(0.95);
        assert!(m.is_degraded());
        assert!(!m.update(0.1));
        assert!(!m.is_degraded());
    }

    #[test]
    fn boundary_ratio_is_not_high() {
        let mut m = LoadMonitor::new();
        assert!(!m.update(0.8)); // 恰好阈值不算超（> 而非 ≥）
    }
}
