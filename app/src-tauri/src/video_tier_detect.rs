//! 画面价值档位检测（REQ-189 / v0.9.0 M2：默认中档 + 会话中重评 + 升降档裁决）。
//!
//! @ai-context: 会话 33（动画科普）实证——开始前仅标题信号，会话以 unknown 跑完、
//!              动画科普被误判低档采样丢失画面。本模块用**纯画面观测**（帧切换率
//!              + OCR 文字密度 + 区域构成）三信号加权投票定档，维度独立于形态
//!              （形态 unknown 时画面档照常生效）。
//! @ai-context: 时间轴策略（用户裁决 2026-08-21）：开始前默认「中档」+诚实声明；
//!              会话中每 2-3 分钟重评一次；**升档静默生效**（更积极采样无损失）、
//!              **降档需用户确认**（降采样可能丢信息）；短视频 2 分钟内定档。
//! @ai-context: 纯逻辑模块（无 IO/DB/线程），信号由 screen worker 聚合注入
//!              （live_session_frame 统计帧切换/OCR 密度/区域构成——见
//!              video-data-extraction-inventory.md C4/A1 落库清单）。

use serde::{Deserialize, Serialize};

use crate::video_profile_spec::VisualTier;

/// 单次重评窗口的观测信号（纯数据；由 screen worker 在窗口内聚合）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TierSignals {
    /// 帧切换率（次/分；None=窗口内无画面观测——不参与投票）
    pub frame_switch_rate: Option<f32>,
    /// OCR 文字面积占比（0.0-1.0：平均文字区域面积/帧面积；None=无 OCR 观测）
    ///
    /// @ai-context: 不用"有文字帧占比"——字幕口播每帧都有字幕（占比 100% 会
    ///              误判高档）；按文字区域面积区分：字幕区小（低档）、文字卡
    ///              中等（中档）、板书满屏（高档）。
    pub ocr_density: Option<f32>,
    /// 区域构成权重（0.0-1.0：table/code/公式区面积占比；None=无版面观测）
    pub region_composition: Option<f32>,
}

/// 档位投票结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TierVote {
    /// 投票定档（None=信号不足——保持现状档，不乱动）
    pub tier: Option<VisualTier>,
    /// 最高票数（0-3：三信号各一票）
    pub votes: u32,
    /// 归一化置信（最高票/总票数；0.0 无观测）
    pub confidence: f32,
    /// 是否需用户确认（平票/票数不足——降档裁决由上层基于 change 方向决定）
    pub needs_confirmation: bool,
}

/// 升降档动作（时间轴策略：升档静默、降档确认）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TierChange {
    /// 档位未变（无需动作）
    None,
    /// 升档（低→中/高）：静默生效（更积极的采样无损失）
    UpgradeSilent,
    /// 降档（高→中/低）：需用户确认（降采样可能丢信息）
    DowngradeConfirm,
}

/// 重评裁决：旧档 + 新票 → 动作（纯函数，可单测）。
///
/// @ai-context: 升档（档位数值增大）静默；降档需确认；档位序：
///              None(无) < Low(低) < Medium(中) < Rich(高)。
pub fn decide_change(current: Option<VisualTier>, voted: Option<VisualTier>) -> TierChange {
    let (Some(cur), Some(new)) = (current, voted) else {
        return TierChange::None;
    };
    if cur == new {
        return TierChange::None;
    }
    let cur_rank = tier_rank(cur);
    let new_rank = tier_rank(new);
    if new_rank > cur_rank {
        TierChange::UpgradeSilent
    } else {
        TierChange::DowngradeConfirm
    }
}

/// 档位数值序（None=0 < Low=1 < Medium=2 < Rich=3；升/降档比较用）。
fn tier_rank(t: VisualTier) -> u32 {
    match t {
        VisualTier::None => 0,
        VisualTier::Low => 1,
        VisualTier::Medium => 2,
        VisualTier::Rich => 3,
    }
}

/// 三信号加权投票（复用 vote_detect 范式：每信号一票 → 计票 → 置信）。
///
/// @ai-context: 信号→档位规则（framework-v2 §2.2 检测规则表）：
///              - 帧切换率：<5/分=低档证据（口播/访谈静止）；5-20=中高=高档证据
///                （板书书写/翻页）；>20=高=中档证据（动画帧切换——动画图文
///                画面价值中，会话 33 实证）
///              - OCR 密度：满屏文字占比高=高档；间歇文字卡=中档；字幕为主=低档；
///                零文字=无档
///              - 区域构成：table/code/公式区占比高=高档；图文混排=中档；几乎
///                无区域=低档
/// @ai-context: 平票/零票 → needs_confirmation=true（不乱定档）；票数不足两票
///              （单信号支持）也确认——单一信号误判率高，多信号共振才可信。
pub fn vote_tier(signals: &TierSignals) -> TierVote {
    let mut votes: [u32; 4] = [0; 4]; // 索引 = tier_rank
    if let Some(rate) = signals.frame_switch_rate {
        let idx = match rate {
            r if r < 5.0 => 1,      // 低
            r if r <= 20.0 => 3,    // 高（中高）
            _ => 2,                 // 中（动画高切换）
        };
        votes[idx] += 1;
    }
    if let Some(density) = signals.ocr_density {
        let idx = match density {
            d if d <= 0.02 => 0,    // 无（几乎无文字）
            d if d < 0.15 => 1,     // 低（字幕区为主）
            d if d < 0.6 => 2,      // 中（间歇文字卡）
            _ => 3,                 // 高（持续满屏）
        };
        votes[idx] += 1;
    }
    if let Some(comp) = signals.region_composition {
        let idx = match comp {
            c if c < 0.1 => 1,      // 低（几乎无区域）
            c if c < 0.45 => 2,     // 中（图文混排）
            _ => 3,                 // 高（结构区占比高）
        };
        votes[idx] += 1;
    }
    let total: u32 = votes.iter().sum();
    // 平票时取**最高档**（保守：采样/OCR 宁可积极不漏——降档有确认门禁兜底）
    let best = votes.iter().max().copied().unwrap_or(0);
    let best_idx = votes
        .iter()
        .rposition(|v| *v == best)
        .unwrap_or(2); // 全零兜底中档（默认占位，不改变现状）
    let tier = match best_idx {
        0 => Some(VisualTier::None),
        1 => Some(VisualTier::Low),
        2 => Some(VisualTier::Medium),
        _ => Some(VisualTier::Rich),
    };
    let confidence = if total == 0 { 0.0 } else { best as f32 / total as f32 };
    // 平票（最高票数不唯一）或票数不足两票 → 需确认
    let ties = votes.iter().filter(|v| **v == best).count() > 1;
    let needs_confirmation = total < 2 || ties;
    TierVote { tier: if total == 0 { None } else { tier }, votes: best, confidence, needs_confirmation }
}

/// 重评窗口聚合器（会话中每 2-3 分钟一个窗口；screen worker 注入观测增量）。
///
/// @ai-context: 窗口语义：短视频 2 分钟内定档（约 40-60 帧观测窗口——采样节拍
///              1s、全帧观测稀疏，故按"窗口时长 + 最小观测数"双条件收口；
///              长视频窗口滑动重评可感知内容变化（片头动画→正片板书）。
#[derive(Debug, Clone)]
pub struct TierObserver {
    /// 窗口时长（秒；默认 150s = 2.5 分钟，覆盖"每 2-3 分钟"）
    pub window_secs: u64,
    /// 窗口起始时间（会话纪元秒）
    start_secs: u64,
    /// 窗口内总观测帧数（画面链每帧计数——密度/构成的分母）
    observed_frames: u32,
    /// 窗口内画面切换帧数（帧 diff 上升沿计数）
    frame_switches: u32,
    /// 窗口内有文字帧的文字面积占比之和（均值 = 和/有文字帧数）
    ocr_area_sum: f32,
    /// 窗口内有文字帧数（OCR 成功且非空文本）
    ocr_text_frames: u32,
    /// 窗口内结构区帧数（版面含 table/code/公式区）
    region_frames: u32,
    /// 最小定档观测数（不足则窗口滑动续观测——短视频前 2 分钟也应尽量定档）
    min_samples: u32,
    /// 当前生效档位（None=尚未定档——开始前默认中档占位）
    current: Option<VisualTier>,
}

impl TierObserver {
    /// 创建观测器（默认窗口 150s、最小 10 次观测）。
    pub fn new(now_secs: u64) -> Self {
        TierObserver {
            window_secs: 150,
            start_secs: now_secs,
            observed_frames: 0,
            frame_switches: 0,
            ocr_area_sum: 0.0,
            ocr_text_frames: 0,
            region_frames: 0,
            min_samples: 10,
            current: None,
        }
    }

    /// 当前生效档位（None=尚未定档——调用方用默认中档占位）。
    pub fn current_tier(&self) -> Option<VisualTier> {
        self.current
    }

    /// 注入一次观测增量（screen worker 每帧调用）。
    ///
    /// @param now_secs - 会话纪元秒
    /// @param frame_switched - 本帧画面是否切换（帧 diff 上升沿）
    /// @param ocr_area_ratio - 本帧文字区域面积占比（0.0-1.0；None=无文字/未 OCR）
    /// @param has_structure - 本帧版面是否含结构区（table/code/公式）
    pub fn observe(
        &mut self,
        now_secs: u64,
        frame_switched: bool,
        ocr_area_ratio: Option<f32>,
        has_structure: bool,
    ) {
        self.observed_frames += 1;
        if frame_switched {
            self.frame_switches += 1;
        }
        if let Some(area) = ocr_area_ratio {
            self.ocr_area_sum += area;
            self.ocr_text_frames += 1;
        }
        if has_structure {
            self.region_frames += 1;
        }
        // 窗口到期 → 结算（无论观测数是否达标——防观测缺失永不定档）
        if now_secs.saturating_sub(self.start_secs) >= self.window_secs {
            self.settle();
        }
    }

    /// 结算当前窗口 → 定档/滑动续观测（当前档位更新）。
    fn settle(&mut self) {
        // 观测窗口内信号聚合（帧切换率按窗口时长折算次/分；文字面积按均值）
        let window_min = self.window_secs as f32 / 60.0;
        let observed = self.observed_frames.max(1);
        let signals = TierSignals {
            frame_switch_rate: (self.frame_switches > 0).then(|| self.frame_switches as f32 / window_min),
            // 最小观测门槛：窗口内至少有 min_samples 帧观测才投 OCR 信号
            // （观测稀疏/画面链未跑时诚实缺信号，不乱投票）
            ocr_density: (self.observed_frames >= self.min_samples)
                .then(|| self.ocr_area_sum / self.ocr_text_frames.max(1) as f32),
            region_composition: (self.region_frames > 0)
                .then(|| self.region_frames as f32 / observed as f32),
        };
        let vote = vote_tier(&signals);
        if let Some(tier) = vote.tier {
            if !vote.needs_confirmation || self.current.is_none() {
                // 高置信定档；或尚未定档（首次——占位中档可被观测覆盖，
                // 动画科普 2 分钟内升中档实证；降档确认由上层 decide_change 裁决）
                self.current = Some(tier);
            }
        }
        // 窗口滑动（重评周期 = 窗口时长；观测计数归零续观察）
        self.start_secs += self.window_secs;
        self.observed_frames = 0;
        self.frame_switches = 0;
        self.ocr_area_sum = 0.0;
        self.ocr_text_frames = 0;
        self.region_frames = 0;
    }
}

/// 单测独立文件。
#[cfg(test)]
#[path = "video_tier_detect_tests.rs"]
mod tests;
