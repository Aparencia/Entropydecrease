//! ASR 引擎健康与降级链（REQ-042 F5 / v0.4.0 M7）。
//!
//! @ai-context: 三级降级链正式化——① 流式 Zipformer（主链路）→ ② 离线 SenseVoice
//!              按块转写（ADR-003 方案 B：rescorer 重打分路径已具备，作为降级档）→
//!              ③ VAD+静音占位（不丢流：事件流不断、静音块照常喂入）。
//! @ai-context: 本模块只做**决策状态机**（纯逻辑可单测）：流式引擎异常判定
//!              （连续 N 秒有语音无产出 / 连续事件异常）→ 降级提示事件；
//!              恢复判定（产出恢复 → 回主链路）。实际转写路径切换由编排层执行。
//! @ai-context: "静默失败可见化"（F3）——引擎静默失效不再无感知：UI 收到
//!              live:asr-degraded 事件明确提示准确率可能下降。

/// 降级档位。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AsrTier {
    /// 流式 Zipformer 主链路
    Streaming,
    /// 降级：离线 SenseVoice 重打分兜底（质量下降提示）
    OfflineRescore,
    /// 深度降级：静音占位（不丢流，事件流保持）
    SilentPlaceholder,
}

/// 触发 OfflineRescore 的静默语音时长（秒）——有语音输入但无任何产出。
const SILENT_STREAK_OFFLINE_SECS: f64 = 5.0;

/// 触发 SilentPlaceholder 的静默语音时长（秒）——深度异常。
const SILENT_STREAK_PLACEHOLDER_SECS: f64 = 15.0;

/// 产出恢复后回落主链路的持续时长（秒）——防抖动。
const RECOVER_SECS: f64 = 3.0;

/// 浮点比较 epsilon（连续 dt 累加存在舍入漂移，阈值比较需容差）。
const EPS: f64 = 1e-9;

/// ASR 健康监测器（有状态；会话线程独占）。
#[derive(Debug)]
pub struct AsrHealthMonitor {
    /// 有语音但无产出的连续时长（秒）
    silent_streak_secs: f64,
    /// 降级档持续时长（秒；仅产出持续时累积——恢复判定基准）
    degraded_secs: f64,
    /// 当前档位
    tier: AsrTier,
}

impl Default for AsrHealthMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl AsrHealthMonitor {
    pub fn new() -> Self {
        Self { silent_streak_secs: 0.0, degraded_secs: 0.0, tier: AsrTier::Streaming }
    }

    /// 每音频块调用：has_speech=块非静音；produced=本块有产出（partial/final）。
    ///
    /// @ai-context: 纯状态推进——时间完全由注入的 dt 决定（无墙钟依赖，可单测）；
    ///              静音块不累积异常（静音期无产出是正常的）。
    pub fn observe(&mut self, has_speech: bool, produced: bool, dt_secs: f64) -> AsrTier {
        if produced {
            self.silent_streak_secs = 0.0;
        } else if has_speech {
            self.silent_streak_secs += dt_secs;
        } else {
            // 静音期：异常计数不增，但已有计数缓慢衰减（防静音后误恢复）
            self.silent_streak_secs = (self.silent_streak_secs - dt_secs).max(0.0);
        }
        // 恢复判定：降级后持续产出（无异常累积）≥ RECOVER_SECS → 回主链路
        if self.tier != AsrTier::Streaming {
            if self.silent_streak_secs == 0.0 {
                self.degraded_secs += dt_secs;
            } else {
                self.degraded_secs = 0.0;
            }
            if self.degraded_secs >= RECOVER_SECS - EPS {
                self.tier = AsrTier::Streaming;
                self.degraded_secs = 0.0;
            }
        }
        // 降级判定（仅 Streaming/OfflineRescore 上升）
        if self.tier != AsrTier::SilentPlaceholder {
            if self.silent_streak_secs >= SILENT_STREAK_PLACEHOLDER_SECS - EPS {
                self.tier = AsrTier::SilentPlaceholder;
                self.degraded_secs = 0.0;
            } else if self.silent_streak_secs >= SILENT_STREAK_OFFLINE_SECS - EPS {
                self.tier = AsrTier::OfflineRescore;
                self.degraded_secs = 0.0;
            }
        }
        self.tier
    }

    /// 当前档位（测试/诊断用）。
    #[allow(dead_code)]
    pub fn tier(&self) -> AsrTier {
        self.tier
    }
}

/// 降级原因文案（前端提示用）。
pub fn tier_reason(tier: AsrTier) -> &'static str {
    match tier {
        AsrTier::Streaming => "",
        AsrTier::OfflineRescore => "流式识别可能异常：已启用离线重打分兜底，准确率可能下降",
        AsrTier::SilentPlaceholder => "流式识别深度异常：保持事件流不中断，建议停止后重试会话",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_speech_stays_streaming() {
        let mut m = AsrHealthMonitor::new();
        // 每块都有产出 → 永不降级
        for _ in 0..100 {
            assert_eq!(m.observe(true, true, 0.2), AsrTier::Streaming);
        }
    }

    #[test]
    fn silent_blocks_do_not_accumulate() {
        let mut m = AsrHealthMonitor::new();
        // 静音（无语音无产出）→ 不累积异常
        for _ in 0..100 {
            assert_eq!(m.observe(false, false, 0.2), AsrTier::Streaming);
        }
    }

    #[test]
    fn speech_without_output_degrades_to_offline_then_placeholder() {
        let mut m = AsrHealthMonitor::new();
        // 有语音无产出：5.0s → OfflineRescore；15.0s → SilentPlaceholder
        let mut tier = AsrTier::Streaming;
        for _ in 0..25 {
            tier = m.observe(true, false, 0.2);
        }
        assert_eq!(tier, AsrTier::OfflineRescore, "5s 后应降级离线重打分");
        for _ in 0..50 {
            tier = m.observe(true, false, 0.2);
        }
        assert_eq!(tier, AsrTier::SilentPlaceholder, "15s 后应深度降级");
    }

    #[test]
    fn output_recovers_tier() {
        let mut m = AsrHealthMonitor::new();
        for _ in 0..30 {
            m.observe(true, false, 0.2);
        }
        assert_eq!(m.tier(), AsrTier::OfflineRescore);
        // 产出恢复并持续 ≥RECOVER_SECS（期间无异常累积）→ 回落主链路
        m.observe(true, true, 0.2);
        for _ in 0..15 {
            m.observe(true, true, 0.2);
        }
        assert_eq!(m.tier(), AsrTier::Streaming);
    }

    #[test]
    fn brief_gap_does_not_degrade() {
        let mut m = AsrHealthMonitor::new();
        // 4s 语音无产出（<5s 阈值）→ 不降级
        for _ in 0..19 {
            assert_eq!(m.observe(true, false, 0.2), AsrTier::Streaming);
        }
    }

    #[test]
    fn silent_period_allows_decay() {
        let mut m = AsrHealthMonitor::new();
        // 3s 无产出（未达 5s 阈值），随后静音 5s → 计数衰减回 0
        for _ in 0..15 {
            m.observe(true, false, 0.2);
        }
        for _ in 0..30 {
            m.observe(false, false, 0.2);
        }
        // 再 4.9s 语音无产出 → 仍不降级（计数已衰减）
        for _ in 0..24 {
            assert_eq!(m.observe(true, false, 0.2), AsrTier::Streaming);
        }
    }

    #[test]
    fn tier_reason_texts() {
        assert_eq!(tier_reason(AsrTier::Streaming), "");
        assert!(tier_reason(AsrTier::OfflineRescore).contains("准确率可能下降"));
        assert!(tier_reason(AsrTier::SilentPlaceholder).contains("建议停止后重试"));
    }
}
