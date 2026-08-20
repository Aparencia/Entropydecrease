//! 会话信号事件域（REQ-108 M-存储 / v0.7.0 M1.5）。
//!
//! @ai-context: 统一信号事件表——实时链路各类信号（帧切换/长静音/音量骤变/
//!              VAD 段/剪贴板/前台切换/播放器行为）一次 schema 落库，消费端
//!              分批接线：章节检测从"近似信号"升级为"真实信号"（POST-D3 修复），
//!              实践段标记（REQ-128）/周报（V1.0 A4）备数据。
//! @ai-context: 分级落库防写放大：高频（帧切换/长静音/音量骤变）秒级频率、
//!              中频（VAD 段）段落级、低频（剪贴板/前台/播放器）行为级——
//!              典型 2h 会话 ≤ 数百条，无写放大风险（设计见 docs/archive/
//!              2026-08-19/2026-08-19-session-events-table-design.md）。

use serde::{Deserialize, Serialize};

/// 事件类型（kebab-case 落库；新增类型须在 EventKind::ALL 登记）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EventKind {
    /// 画面切换（帧 diff 判定；章节检测主信号）
    FrameSwitch,
    /// 长静音（VAD 连续静音 ≥ 阈值；章节检测/练习段信号）
    LongSilence,
    /// 音量骤变（段 RMS 与上段差 ≥ 阈值；重点标注冗余备源）
    VolumeSurge,
    /// VAD 语音段（段落级写入；讲者/语速统计备数据）
    VadSegment,
    /// 剪贴板复制（REQ-104；只存预览——隐私红线）
    Clipboard,
    /// 前台窗口切换（REQ-128；实践段标记信号）
    ForegroundSwitch,
    /// 播放器行为（REQ-125；难点信号）
    PlayerBehavior,
    /// 会话暂停（2026-08 A1 硬暂停；时间轴可见暂停区间）
    Pause,
    /// 会话恢复（2026-08 A1；与 Pause 成对）
    Resume,
    /// v0.7.2（REQ-154 S-2）：语速骤变（段间语速骤降 ≥40% = 强调/变速；
    /// 与 VolumeSurge 音量骤变姊妹信号，重点标注备数据）
    SpeechRateDrop,
    /// v0.7.2（REQ-153）：讲者切换（弱化版说话人分离——相邻语音段音色
    /// embedding 余弦 < 阈值；只标切换点不聚类身份；payload 含 confidence）
    SpeakerChange,
}

impl EventKind {
    /// 全部类型（新增类型在此登记——schema 为 TEXT 无枚举约束，登记表做消费端白名单）。
    pub const ALL: [EventKind; 11] = [
        EventKind::FrameSwitch,
        EventKind::LongSilence,
        EventKind::VolumeSurge,
        EventKind::VadSegment,
        EventKind::Clipboard,
        EventKind::ForegroundSwitch,
        EventKind::PlayerBehavior,
        EventKind::Pause,
        EventKind::Resume,
        EventKind::SpeechRateDrop,
        EventKind::SpeakerChange,
    ];

    /// kebab-case 落库名（serde 默认 PascalCase，DB 层用显式映射防契约漂移）。
    pub fn as_str(&self) -> &'static str {
        match self {
            EventKind::FrameSwitch => "frame_switch",
            EventKind::LongSilence => "long_silence",
            EventKind::VolumeSurge => "volume_surge",
            EventKind::VadSegment => "vad_segment",
            EventKind::Clipboard => "clipboard",
            EventKind::ForegroundSwitch => "foreground_switch",
            EventKind::PlayerBehavior => "player_behavior",
            EventKind::Pause => "pause",
            EventKind::Resume => "resume",
            EventKind::SpeechRateDrop => "speech_rate_drop",
            EventKind::SpeakerChange => "speaker_change",
        }
    }

    /// 从落库名解析（非法值 → None；消费端跳过，防御脏数据）。
    pub fn parse(s: &str) -> Option<EventKind> {
        EventKind::ALL.into_iter().find(|k| k.as_str() == s)
    }
}

/// 单条会话信号事件（落库行）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionEvent {
    pub id: i64,
    pub session_id: i64,
    pub kind: EventKind,
    /// 事件时刻（相对会话起点，ms）
    pub timestamp_ms: u64,
    /// 事件载荷（按类型：时长/窗口标题/播放器动作等；无载荷为 `{}`）
    pub payload: serde_json::Value,
}

/// 新增事件入参。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewSessionEvent {
    pub session_id: i64,
    pub kind: EventKind,
    pub timestamp_ms: u64,
    pub payload: serde_json::Value,
}

impl NewSessionEvent {
    /// 便捷构造：无载荷事件（帧切换等时刻即信息）。
    pub fn simple(session_id: i64, kind: EventKind, timestamp_ms: u64) -> Self {
        Self { session_id, kind, timestamp_ms, payload: serde_json::json!({}) }
    }
}

/// 事件写放大分级（REQ-108：分级落库决策的记录化——消费端/测试引用）。
///
/// @ai-context: 决策记录（设计文档 §三）：三类频率全部实时写入（无写放大风险），
///              分级用于容量审计与未来降级开关（VAD 段可切聚合摘要）——
///              当前无运行时消费方，登记豁免 dead_code。
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventTier {
    /// 高频（秒级）：帧切换/长静音/音量骤变——章节检测主信号，实时写入
    High,
    /// 中频（段落级）：VAD 段——单会话 ≤ 数百条，实时写入
    Medium,
    /// 低频（行为级）：剪贴板/前台/播放器——天然低频，实时写入
    Low,
}

/// 事件类型 → 分级（决策表；容量设计见设计文档 §三）。
#[allow(dead_code)]
pub fn event_tier(kind: EventKind) -> EventTier {
    match kind {
        EventKind::FrameSwitch | EventKind::LongSilence | EventKind::VolumeSurge => EventTier::High,
        EventKind::VadSegment => EventTier::Medium,
        EventKind::Clipboard
        | EventKind::ForegroundSwitch
        | EventKind::PlayerBehavior
        | EventKind::Pause
        | EventKind::Resume
        | EventKind::SpeechRateDrop
        | EventKind::SpeakerChange => EventTier::Low,
    }
}

/// 单会话事件量预算（上限，防异常循环写放大；超出丢弃最旧——FIFO 语义）。
const MAX_EVENTS_PER_SESSION: usize = 2000;

/// 事件容量守卫（纯函数）：会话事件数是否超预算。
///
/// @ai-context: 写入方（实时链路）在插入前检查；超预算丢弃最旧事件
///              （调用方 delete 最旧 + 插入最新，防无限增长）。
pub fn over_budget(existing_count: usize) -> bool {
    existing_count >= MAX_EVENTS_PER_SESSION
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_str_roundtrip() {
        // 全部类型 kebab-case 往返一致（serde 契约防漂移）
        for k in EventKind::ALL {
            assert_eq!(EventKind::parse(k.as_str()), Some(k));
        }
    }

    #[test]
    fn parse_unknown_returns_none() {
        // 脏数据（旧版本/手改库）→ None，消费端跳过不崩溃
        assert_eq!(EventKind::parse("frame_switch_old"), None);
        assert_eq!(EventKind::parse(""), None);
    }

    #[test]
    fn kind_names_match_schema_doc() {
        // 与设计文档 schema 表一致（防命名漂移）
        assert_eq!(EventKind::FrameSwitch.as_str(), "frame_switch");
        assert_eq!(EventKind::LongSilence.as_str(), "long_silence");
        assert_eq!(EventKind::VolumeSurge.as_str(), "volume_surge");
        assert_eq!(EventKind::VadSegment.as_str(), "vad_segment");
        assert_eq!(EventKind::Clipboard.as_str(), "clipboard");
        assert_eq!(EventKind::ForegroundSwitch.as_str(), "foreground_switch");
        assert_eq!(EventKind::PlayerBehavior.as_str(), "player_behavior");
    }

    #[test]
    fn tier_mapping_matches_design() {
        // 高频三信号 + 中频 VAD + 低频行为
        assert_eq!(event_tier(EventKind::FrameSwitch), EventTier::High);
        assert_eq!(event_tier(EventKind::LongSilence), EventTier::High);
        assert_eq!(event_tier(EventKind::VolumeSurge), EventTier::High);
        assert_eq!(event_tier(EventKind::VadSegment), EventTier::Medium);
        assert_eq!(event_tier(EventKind::Clipboard), EventTier::Low);
        assert_eq!(event_tier(EventKind::ForegroundSwitch), EventTier::Low);
        assert_eq!(event_tier(EventKind::PlayerBehavior), EventTier::Low);
    }

    #[test]
    fn simple_event_has_empty_payload() {
        // 便捷构造：载荷空对象（帧切换等时刻即信息）
        let e = NewSessionEvent::simple(1, EventKind::FrameSwitch, 5000);
        assert_eq!(e.payload, serde_json::json!({}));
    }

    #[test]
    fn budget_guard_boundaries() {
        // 容量守卫：达到上限触发清理（>= 语义——写入前检查，防超限）
        assert!(!over_budget(1999));
        assert!(over_budget(2000), "达上限应触发清理（写前检查）");
        assert!(over_budget(2001));
    }
}
