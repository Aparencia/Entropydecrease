//! 视频随播随停检测（REQ-291，v0.19.7）——声画双通道纯状态机。
//!
//! @ai-context: 用户暂停视频 → 采集随停（画面冻结 + 时间轴扣除暂停段，复用
//!              P2 SessionPause 语义）；恢复 ≤~1s 跟上。双通道互证：音频环回
//!              RMS（有任何声音）与画面帧变化（屏幕 worker got_frame）；静音
//!              但有画面动（无音轨视频）=播放中不误停；两拍无证才确认暂停
//!              （滞回——缓冲转圈等短暂画面活动可撤销 suspect）。本模块纯
//!              状态机可单测；线程接线（声音槽/worker 喂信号/暂停动作）在
//!              live_session* 侧。watchdog（REQ-281）天然互斥：暂停后 worker
//!              进入 paused 分支不再评估停更（注释见 live_session_frame.rs）。
//!
//! @ai-context: 判定粒度=屏幕采样拍（1s）；音频槽只记"最后有声时刻"。标称
//!              停检 ~2 拍、恢复 ≤~1.5s，阈值与滞回一次真机 A/B 标定（验收项）。

/// 疑似暂停所需连续"无声且无画面动"拍数（采样拍≈1s）。
pub const SUSPECT_AFTER_TICKS: u32 = 1;
/// 确认暂停所需连续拍数（suspect 后再一拍无证即确认——总 ~2s）。
pub const PAUSE_CONFIRM_TICKS: u32 = 1;
/// "有任何声音"的 RMS 阈值（区别于 VAD 语音阈值 0.005——音乐/环境声也算；
/// 需真机标定，验收项）。
pub const MEDIA_AUDIO_ACTIVE_RMS: f32 = 0.003;
/// 声音"最近窗口"（ms）——≥ 采样拍（1s），保证一拍内出现的声音必被读到。
pub const SOUND_RECENT_MS: u64 = 1100;

/// 通道相位。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaPhase {
    /// 声或画任一活跃（正常采集）
    Playing,
    /// 声画双静默首拍（等待第二拍互证——防缓冲误判）
    Suspect,
    /// 已确认暂停（采集已随停）
    Paused,
}

/// 一拍输入后的建议动作。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaDecision {
    None,
    /// 确认暂停 → 触发自动暂停（suspect→paused 边沿）
    Suspend,
    /// 恢复播放 → 解除自动暂停（仅 paused 态可产出）
    Resume,
}

/// 声画双通道检测器（单 worker 持有；输入=本拍声音/画面动与否）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MediaDetector {
    pub phase: MediaPhase,
    silent_ticks: u32,
}

impl MediaDetector {
    pub fn new() -> Self {
        Self { phase: MediaPhase::Playing, silent_ticks: 0 }
    }

    /// 喂一拍（sound=最近窗口内有声；motion=本拍有新帧/画面变化）。
    ///
    /// 规则（与设计 §2.10 一致）：
    /// - Playing：有声或画面动 → 计数清零；无声且无动 → silent_ticks++，
    ///   ≥ SUSPECT_AFTER_TICKS 进入 Suspect；静音但有画面动=无音轨视频，
    ///   计数清零不升（撤销路径同样在 Suspect 态生效）。
    /// - Suspect：声或画任一恢复 → 回 Playing（撤销）；仍双静默且
    ///   ≥ PAUSE_CONFIRM_TICKS → Paused（产出 Suspend）。
    /// - Paused：声或画任一恢复 → Playing（产出 Resume）。
    pub fn tick(&mut self, sound: bool, motion: bool) -> MediaDecision {
        match self.phase {
            MediaPhase::Playing => {
                if sound {
                    self.silent_ticks = 0;
                } else if motion {
                    // 静音但画面在动（无音轨/极轻音量）——不计数不升级
                    self.silent_ticks = 0;
                } else {
                    self.silent_ticks += 1;
                    if self.silent_ticks >= SUSPECT_AFTER_TICKS {
                        self.phase = MediaPhase::Suspect;
                        self.silent_ticks = 0;
                    }
                }
                MediaDecision::None
            }
            MediaPhase::Suspect => {
                if sound || motion {
                    // 缓冲转圈/短暂活动撤销怀疑，回播放
                    self.phase = MediaPhase::Playing;
                    self.silent_ticks = 0;
                    MediaDecision::None
                } else {
                    self.silent_ticks += 1;
                    if self.silent_ticks >= PAUSE_CONFIRM_TICKS {
                        self.phase = MediaPhase::Paused;
                        self.silent_ticks = 0;
                        MediaDecision::Suspend
                    } else {
                        MediaDecision::None
                    }
                }
            }
            MediaPhase::Paused => {
                if sound || motion {
                    self.phase = MediaPhase::Playing;
                    MediaDecision::Resume
                } else {
                    MediaDecision::None
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playing_with_sound_never_suspends() {
        let mut m = MediaDetector::new();
        for _ in 0..10 {
            assert_eq!(m.tick(true, true), MediaDecision::None);
            assert_eq!(m.tick(true, false), MediaDecision::None);
        }
        assert_eq!(m.phase, MediaPhase::Playing);
    }

    #[test]
    fn muted_video_with_motion_stays_playing() {
        let mut m = MediaDetector::new();
        for _ in 0..10 {
            assert_eq!(m.tick(false, true), MediaDecision::None);
        }
        assert_eq!(m.phase, MediaPhase::Playing);
    }

    #[test]
    fn silent_still_two_ticks_confirms_suspend() {
        let mut m = MediaDetector::new();
        // 拍 1：无声无动 → suspect；拍 2：仍无声无动 → Suspend
        assert_eq!(m.tick(false, false), MediaDecision::None);
        assert_eq!(m.phase, MediaPhase::Suspect);
        assert_eq!(m.tick(false, false), MediaDecision::Suspend);
        assert_eq!(m.phase, MediaPhase::Paused);
    }

    #[test]
    fn suspect_revoked_by_brief_motion_then_reconfirms() {
        let mut m = MediaDetector::new();
        assert_eq!(m.tick(false, false), MediaDecision::None); // suspect
        // 缓冲动画一拍 → 撤销回 playing
        assert_eq!(m.tick(false, true), MediaDecision::None);
        assert_eq!(m.phase, MediaPhase::Playing);
        // 再两拍静默 → 正常确认暂停
        assert_eq!(m.tick(false, false), MediaDecision::None);
        assert_eq!(m.tick(false, false), MediaDecision::Suspend);
    }

    #[test]
    fn paused_resumes_on_either_channel() {
        let mut m = MediaDetector::new();
        assert_eq!(m.tick(false, false), MediaDecision::None);
        assert_eq!(m.tick(false, false), MediaDecision::Suspend);
        // 画面恢复（用户点播放瞬间帧到）
        assert_eq!(m.tick(false, true), MediaDecision::Resume);
        assert_eq!(m.phase, MediaPhase::Playing);
        // 再停再走，声音恢复路径
        assert_eq!(m.tick(false, false), MediaDecision::None);
        assert_eq!(m.tick(false, false), MediaDecision::Suspend);
        assert_eq!(m.tick(true, false), MediaDecision::Resume);
    }
}
