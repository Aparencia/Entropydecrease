//! 前台自动暂停门控（批 2a：ForegroundGate 滞回状态机 + 锚定资格纯函数）。
//!
//! @ai-context(Why)：课堂跟随录制时用户切到其他窗口（IM/浏览器/编辑器）的时段
//!              是干扰期，内容不应混入笔记——媒体随播随停（REQ-291）只跟"视频
//!              是否暂停"，跟不了"人是否在看屏幕"。前台门控提供第三个自动暂停
//!              源（PauseSource::Foreground）：目标窗口失焦 连续 2×250ms foreign
//!              确认 → 随停；目标回位 连续 2×250ms → 解除。与媒体源互不解除
//!              （只解自己，机器层在 pause_state.rs）——本模块只产出决策，
//!              动作由屏幕 worker 经 request API 发出。
//! @ai-context：滞回先例 fa1647aa（media_state SUSPEND 2 拍）——250ms 拍是前台
//!              查询的节流粒度（GetForegroundWindow 是进程级系统调用，比帧采样
//!              便宜一个量级；错 1 拍误停的代价高于晚 250ms 停）；自窗（主窗/
//!              浮窗/overlay/原生对话框，windows::is_self_hwnd）=中性：不算
//!              foreign（防自己的浮窗/设置触发随停）也不算 target（防误解除）。
//! @ai-context：无窗口锚定（全屏捕获）或画面链短路（disable_ocr，无 worker 采样
//!              点）时门控停摆（anchor_eligible=false——无目标可"失焦/回位"）。

/// 滞回确认所需连续拍数（250ms × 2 = 500ms；先例 fa1647aa SUSPECT 2 拍）。
/// 单拍过锐：临时切窗（复制课件/瞄一眼日历 <500ms）即误停不可接受。
pub const FG_CONFIRM_TICKS: u32 = 2;
/// 前台采样节拍（ms）：GetForegroundWindow 查询粒度下限（见模块头 Why）。
pub const FG_TICK_MS: u64 = 250;

/// 前台观察分类（采样点合成：系统前台窗口 vs 目标窗口 vs 本进程自窗/探测失败）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForegroundObs {
    /// 系统前台 ≠ 目标窗口且非本进程窗口（离开学习内容）
    Foreign,
    /// 系统前台 = 目标窗口（回位）
    Target,
    /// 自窗或探测失败（中性——不推进也不撤销，见模块头）
    Neutral,
}

/// 门控决策（动作由 worker 经 request API 发出）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForegroundDecision {
    None,
    /// 确认离开 → 请求前台暂停
    Suspend,
    /// 确认回位 → 解除前台暂停（只解自己）
    Resume,
}

/// 门控相位。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForegroundPhase {
    /// 追踪中（目标在前台或中性）
    Active,
    /// 首个 foreign（等第二拍互证——防瞬间切窗误停）
    Suspect,
    /// 已确认离开（暂停生效中）
    Paused,
    /// 首个 target 回位（等第二拍互证——防瞬间切回误解除）
    Returning,
}

/// 前台滞回门控（屏幕 worker 单线程持有；输入=每 FG_TICK_MS 一次分类观察）。
///
/// @ai-context: Suspect 相位记录首个 foreign，随后 foreign 连续累计至
///              FG_CONFIRM_TICKS 才确认（中性不计数不撤销——见模块头"自窗=
///              中性"语义）；Returning 对 target 对称。计数在相位迁出时清零。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ForegroundGate {
    pub phase: ForegroundPhase,
    /// Suspect 内已连续 foreign 拍数（中性拍不计）
    foreign_ticks: u32,
    /// Returning 内已连续 target 拍数（中性/foreign 拍中断回 Paused）
    target_ticks: u32,
}

impl ForegroundGate {
    pub fn new() -> Self {
        Self { phase: ForegroundPhase::Active, foreign_ticks: 0, target_ticks: 0 }
    }

    /// 喂一拍（滞回规则，SUSPEND/RESUME 对称确认）：
    /// - Active：Foreign → Suspect（拍 1）；Target/Neutral 停留
    /// - Suspect：Foreign 累计至 FG_CONFIRM_TICKS → Paused（产出 Suspend）；
    ///   Target → 撤销回 Active；Neutral 不计不撤销（停留等互证）
    /// - Paused：Target → Returning（拍 1）；Foreign/Neutral 停留（暂停继续）
    /// - Returning：Target 累计至 FG_CONFIRM_TICKS → Active（产出 Resume）；
    ///   Foreign/Neutral → 回 Paused（回位未获互证，保守留在暂停）
    pub fn tick(&mut self, obs: ForegroundObs) -> ForegroundDecision {
        match self.phase {
            ForegroundPhase::Active => match obs {
                ForegroundObs::Foreign => {
                    self.phase = ForegroundPhase::Suspect;
                    self.foreign_ticks = 1;
                    ForegroundDecision::None
                }
                ForegroundObs::Target | ForegroundObs::Neutral => ForegroundDecision::None,
            },
            ForegroundPhase::Suspect => match obs {
                ForegroundObs::Foreign => {
                    self.foreign_ticks += 1;
                    if self.foreign_ticks >= FG_CONFIRM_TICKS {
                        self.foreign_ticks = 0;
                        self.phase = ForegroundPhase::Paused;
                        ForegroundDecision::Suspend
                    } else {
                        ForegroundDecision::None
                    }
                }
                ForegroundObs::Target => {
                    self.foreign_ticks = 0;
                    self.phase = ForegroundPhase::Active;
                    ForegroundDecision::None
                }
                ForegroundObs::Neutral => ForegroundDecision::None,
            },
            ForegroundPhase::Paused => match obs {
                ForegroundObs::Target => {
                    self.phase = ForegroundPhase::Returning;
                    self.target_ticks = 1;
                    ForegroundDecision::None
                }
                ForegroundObs::Foreign | ForegroundObs::Neutral => ForegroundDecision::None,
            },
            ForegroundPhase::Returning => match obs {
                ForegroundObs::Target => {
                    self.target_ticks += 1;
                    if self.target_ticks >= FG_CONFIRM_TICKS {
                        self.target_ticks = 0;
                        self.phase = ForegroundPhase::Active;
                        ForegroundDecision::Resume
                    } else {
                        ForegroundDecision::None
                    }
                }
                ForegroundObs::Foreign | ForegroundObs::Neutral => {
                    self.target_ticks = 0;
                    self.phase = ForegroundPhase::Paused;
                    ForegroundDecision::None
                }
            },
        }
    }
}

impl Default for ForegroundGate {
    fn default() -> Self {
        Self::new()
    }
}

/// 锚定资格判定（纯函数）：前台源只在"窗口锚定"时可用。
///
/// @ai-context: 目标窗口句柄缺失（None=全屏捕获——无"目标窗口"可失焦/回位，
///              前台恒为系统其他窗口，会立即误停）；画面链短路（disable_ocr，
///              worker 不存在——前台采样点缺失）。任一不满足 → 门控停摆。
pub fn anchor_eligible(has_target_hwnd: bool, ocr_enabled: bool) -> bool {
    has_target_hwnd && ocr_enabled
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_consecutive_foreign_confirm_suspend() {
        // Arrange & Act：连续 2×250ms foreign → Suspend（拍 1 只进 Suspect）
        let mut g = ForegroundGate::new();
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Suspect);
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::Suspend);
        assert_eq!(g.phase, ForegroundPhase::Paused);
    }

    #[test]
    fn single_foreign_blip_does_not_suspend() {
        // 瞬间切窗（<500ms）→ 目标回位 → 撤销怀疑，不误停
        let mut g = ForegroundGate::new();
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::None);
        assert_eq!(g.tick(ForegroundObs::Target), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Active);
    }

    #[test]
    fn self_window_is_neutral_neither_suspends_nor_cancels() {
        // 自窗（浮窗/设置）中性：不算 foreign（不推进确认）也不算 target（不撤销）
        let mut g = ForegroundGate::new();
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Suspect);
        assert_eq!(g.tick(ForegroundObs::Neutral), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Suspect, "中性不撤销怀疑");
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::Suspend);
        assert_eq!(g.phase, ForegroundPhase::Paused);
        // 暂停期自窗中性：不解除
        assert_eq!(g.tick(ForegroundObs::Neutral), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Paused);
    }

    #[test]
    fn two_consecutive_targets_resume_after_pause() {
        // 回位解除同样滞回 2 拍；foreign/中性打断回位确认 → 保守留在暂停
        let mut g = ForegroundGate::new();
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::None);
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::Suspend);
        assert_eq!(g.tick(ForegroundObs::Target), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Returning);
        // 拍 1 回位后短暂切走 → 回 Paused（回位未获互证）
        assert_eq!(g.tick(ForegroundObs::Foreign), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Paused);
        // 再连续 2 拍 target → Resume
        assert_eq!(g.tick(ForegroundObs::Target), ForegroundDecision::None);
        assert_eq!(g.phase, ForegroundPhase::Returning);
        assert_eq!(g.tick(ForegroundObs::Target), ForegroundDecision::Resume);
        assert_eq!(g.phase, ForegroundPhase::Active);
    }

    #[test]
    fn anchor_eligibility_table() {
        // 判定表：全屏捕获无锚点 / 画面链短路 → 停摆
        assert!(!anchor_eligible(false, true));
        assert!(!anchor_eligible(true, false));
        assert!(!anchor_eligible(false, false));
        assert!(anchor_eligible(true, true));
    }

    #[test]
    fn constants_documented_precedent() {
        // 节拍与阈值先例锚点（fa1647aa SUSPECT 2 拍）——防静默改值
        assert_eq!(FG_CONFIRM_TICKS, 2);
        assert_eq!(FG_TICK_MS, 250);
    }
}
