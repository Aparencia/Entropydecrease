//! 空闲降频状态机（REQ-073 / v0.6.0 M5，PF6）。
//!
//! @ai-context: 视频暂停/长无信号（静音 + 画面无变化持续 N 秒）→ 采样降频
//!              （引擎自然空闲——worker 阻塞零 CPU）；语音或画面变化恢复 →
//!              立即唤醒。唤醒时序无竞态：状态机单线程消费（screen worker
//!              独占），信号为瞬时值（Active 判定与历史无关——恢复即刻生效）。
//! @ai-context: 与既有调度层级串联：DualRateScheduler（语音活跃度档）之下、
//!              引擎请求之上——idle 时跳过 OCR 请求（预算为零），引擎线程
//!              保持常驻但阻塞空闲（模型不卸载——REQ-072 权衡：卸载重载
//!              代价高于空闲阻塞）。
//! @ai-context: 纯逻辑可单测（时间注入 u64 ms）；双信号（speech/change）
//!              由编排层喂入——任一恢复即唤醒，不丢音频块（音频消费在
//!              会话线程，与采样降频无关）。

/// 空闲状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdleState {
    /// 活跃（正常采样）
    Active,
    /// 空闲候选（静音+无变化已持续 IDLE_AFTER_MS——进入降频前观察窗）
    IdlePending,
    /// 空闲（采样降频；低频探针检测恢复）
    Idle,
}

/// 空闲降频配置。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IdleGovernorConfig {
    /// 静音+无变化持续该时长进入 IdlePending（ms）
    pub idle_after_ms: u64,
    /// IdlePending 再持续该时长进入 Idle（ms）
    pub idle_confirm_ms: u64,
    /// 恢复判定：该时长内任一信号为真即唤醒（ms；0=瞬时恢复）
    pub wake_debounce_ms: u64,
}

impl Default for IdleGovernorConfig {
    fn default() -> Self {
        Self {
            idle_after_ms: 10_000,
            idle_confirm_ms: 5_000,
            wake_debounce_ms: 0,
        }
    }
}

/// 空闲降频状态机（有状态；screen worker 独占单线程消费）。
pub struct IdleGovernor {
    config: IdleGovernorConfig,
    state: IdleState,
    /// 进入当前状态/持续空闲的时刻（ms；会话纪元时间轴）
    since_ms: u64,
    /// 最近一次信号为真的时刻（唤醒去抖用）
    last_signal_ms: Option<u64>,
    /// 连续信号串起点（相邻信号间隔 ≤1s 视为连续——去抖时长判定基准）
    signal_chain_start: Option<u64>,
}

impl IdleGovernor {
    pub fn new(config: IdleGovernorConfig) -> Self {
        Self {
            config,
            state: IdleState::Active,
            since_ms: 0,
            last_signal_ms: None,
            signal_chain_start: None,
        }
    }

    /// 观察一拍（每采样 tick 调用）：语音/画面变化信号 → 状态迁移。
    ///
    /// @ai-context: 信号语义：speech_active = 本 tick 有语音；frame_changed =
    ///              本 tick 画面有变化（diff 通过/OCR 产出）。任一为真即"活跃
    ///              证据"；双假持续累积 → 降频。
    /// @ai-context: 唤醒去抖（wake_debounce_ms>0）：信号须连续（相邻 tick
    ///              间隔 ≤1s）达到去抖时长才唤醒——防单拍噪声（误触/瞬闪）
    ///              打断降频；默认 0 = 瞬时唤醒（无竞态：状态机单线程消费）。
    pub fn observe(&mut self, speech_active: bool, frame_changed: bool, now_ms: u64) -> IdleState {
        let signal = speech_active || frame_changed;
        if signal {
            // 连续信号串判定（相邻间隔 ≤1s = 同一串）
            let chain = if self.last_signal_ms.is_some_and(|t| now_ms.saturating_sub(t) <= 1_000) {
                self.signal_chain_start.unwrap_or(now_ms)
            } else {
                now_ms
            };
            self.signal_chain_start = Some(chain);
            self.last_signal_ms = Some(now_ms);
            let debounce_ok = self.config.wake_debounce_ms == 0
                || now_ms.saturating_sub(chain) >= self.config.wake_debounce_ms;
            if debounce_ok {
                // 活跃证据刷新：无论当前状态，空闲计时清零（信号打断降频进程）
                self.since_ms = now_ms;
                if self.state != IdleState::Active {
                    self.state = IdleState::Active;
                }
            }
            return self.state;
        }
        // 无信号：按状态推进（Active → IdlePending → Idle）
        if self.since_ms == 0 {
            self.since_ms = now_ms;
        }
        match self.state {
            IdleState::Active => {
                if now_ms.saturating_sub(self.since_ms) >= self.config.idle_after_ms {
                    self.state = IdleState::IdlePending;
                    self.since_ms = now_ms;
                }
            }
            IdleState::IdlePending => {
                if now_ms.saturating_sub(self.since_ms) >= self.config.idle_confirm_ms {
                    self.state = IdleState::Idle;
                    self.since_ms = now_ms;
                }
            }
            IdleState::Idle => {
                // 保持 Idle（探针由编排层按 is_idle 驱动——低频唤醒检测）
            }
        }
        self.state
    }

    /// 当前状态（诊断/测试 API；编排层走 is_idle——登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn state(&self) -> IdleState {
        self.state
    }

    /// 是否空闲（编排层据此跳过 OCR 请求/降频）。
    pub fn is_idle(&self) -> bool {
        self.state == IdleState::Idle
    }

    /// 进入 Idle 的时刻（探针调度用；Active 时为 0；诊断/测试 API——登记豁免）。
    #[allow(dead_code)]
    pub fn idle_since_ms(&self) -> u64 {
        if self.is_idle() { self.since_ms } else { 0 }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "idle_governor_tests.rs"]
mod tests;
