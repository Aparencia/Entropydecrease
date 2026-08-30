//! 播放器行为信号（REQ-125 M1 / v0.7.0 M2，首阶段验证版）。
//!
//! @ai-context: 暂停/倍速/反复回看是"难点信号"的直接证据——播放器 UI 状态
//!              检测（纯规则启发式，无 AI）。本版为首阶段验证：仅实装
//!              "暂停态检测"（画面中央暗遮罩/黑圆盘 + 白色图标的颜色统计近似，
//!              见 detect_pause_icon）；倍速检测降级为窗口标题/OCR 文本匹配
//!              （需标题或 OCR 块输入，M2 后接线）；Play 由接入层状态机从
//!              "Pause → 无图标"推导（检测器本身保守，不确定返回 None）。
//! @ai-context: 保守原则：不产生假信号——颜色统计阈值偏严（dark ≥ 0.55、
//!              bright ∈ [0.02, 0.6]），真机播放器样本验证后校准
//!              （REQ-125 验收含"实装首阶段验证，失败则降级"条款）。
//! @ai-context: M17 采样预算按速率缩放：倍速播放画面变化更快，采样间隔按
//!              1/speed 缩短（speed_scaled_interval，纯函数可单测）。
//! @ai-context: 事件经 record_action 写 PlayerBehavior（REQ-108 事件表，payload
//!              {"action": "pause"|"play"|"speed", "value": 倍速或 null}）；
//!              消费端（analysis.rs player_actions_from_events）按此映射。

use image::RgbImage;

use crate::db::Db;
use crate::session_events::{EventKind, NewSessionEvent, SessionEvent};

/// 播放器行为类型。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum PlayerActionKind {
    /// 暂停（画面中央出现图标 + 暗遮罩）
    Pause,
    /// 恢复播放（暂停图标消失——接入层状态机推导，检测器不直接产出）
    Play,
    /// 倍速切换（multiplier = 倍速值；本版未实装，M2 后接线）
    Speed { multiplier: f32 },
}

/// 检测到的播放器行为。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PlayerAction {
    pub kind: PlayerActionKind,
    /// 附加数值（倍速值；Pause/Play 为 None）
    pub value: Option<f32>,
}

/// 从屏幕帧检测播放器 UI 状态（纯规则启发式，保守）。
///
/// @ai-context: 本版仅检测暂停态：detect_pause_icon 命中 → Pause；否则 None
///              （保守——不确定不产生假信号）。Play 由接入层状态机推导
///              （Pause→无图标），倍速检测留 M2 后（需标题/OCR 块输入）。
pub fn detect_player_action(frame: &RgbImage) -> Option<PlayerAction> {
    if detect_pause_icon(frame.as_raw(), frame.width(), frame.height()) {
        Some(PlayerAction { kind: PlayerActionKind::Pause, value: None })
    } else {
        None
    }
}

/// 暂停图标检测（纯颜色统计，保守）。
///
/// @ai-context: 播放器暂停态 = 视频暗遮罩 + 中央大图标（白三角/双竖条），
///              用中央区域颜色统计近似：中央区暗像素占比高（暗遮罩/黑圆盘）
///              且存在中等占比**白色**像素（图标是白色，非任意亮色）→ 判定暂停。
/// @ai-context: 阈值偏严防假信号：暗色视频场景无图标时白像素占比过低不判；
///              全亮画面 dark 不足不判；字幕在画面底部、不落在中央区（不干扰）。
/// @ai-context: TD-2026-08-19-F 偿还——原实现只判"亮像素"（lum>210），暗底+中央
///              亮色内容（如暗色视频里发光的彩色标题/物体）会误报为暂停；
///              图标白 = 高亮 + 低饱和（R≈G≈B，±40 容差），彩色亮块不再命中。
/// @ai-context: 输入为 RGB 字节（image::RgbImage.as_raw()）；w/h 为像素尺寸；
///              输入异常（尺寸过小/字节不足）→ false（防御）。
pub fn detect_pause_icon(pixels: &[u8], w: u32, h: u32) -> bool {
    if pixels.len() < (w * h * 3) as usize || w < 8 || h < 8 {
        return false;
    }
    // 中央区域：宽高各取 24%（播放器大图标位于画面正中，字幕/边栏排除）
    let cw = ((w as f32) * 0.24) as u32;
    let ch = ((h as f32) * 0.24) as u32;
    let x0 = w / 2 - cw / 2;
    let y0 = h / 2 - ch / 2;
    let mut dark = 0u32;
    let mut white = 0u32;
    let mut total = 0u32;
    for y in y0..(y0 + ch).min(h) {
        for x in x0..(x0 + cw).min(w) {
            let i = ((y * w + x) * 3) as usize;
            let r = pixels[i] as u32;
            let g = pixels[i + 1] as u32;
            let b = pixels[i + 2] as u32;
            // 近似亮度（Rec.601 整数版，0-255）
            let lum = (r * 299 + g * 587 + b * 114) / 1000;
            if lum < 45 {
                dark += 1;
            }
            // 图标白：高亮 + 低饱和（R≈G≈B ±40——白三角/双竖条；彩色亮块不算）
            if lum > 210 {
                let (r, g, b) = (r as i32, g as i32, b as i32);
                if (r - g).abs() < 40 && (g - b).abs() < 40 && (r - b).abs() < 40 {
                    white += 1;
                }
            }
            total += 1;
        }
    }
    if total == 0 {
        return false;
    }
    let dark_ratio = dark as f32 / total as f32;
    let white_ratio = white as f32 / total as f32;
    dark_ratio >= 0.55 && (0.015..=0.35).contains(&white_ratio)
}

/// 采样间隔按播放速率缩放（M17，纯函数）。
///
/// @ai-context: 倍速播放画面变化更快 → 采样间隔按 1/speed 缩短（2.0x → 减半）；
///              上限保护 base*2（0.5x → base*2 封顶，防 speed→0 除以零/无限放大）；
///              高倍速下限 base/8（防采样过密空转）。非法速率（0/负数/NaN）→ 上限。
/// @ai-context: M2 未接线（倍速检测未实装，检测到倍速后才消费本函数缩放采样预算）——
///              纯函数先行 + 单测覆盖，接线后自然消除 dead_code。
#[allow(dead_code)]
pub fn speed_scaled_interval(base_ms: u64, speed: f32) -> u64 {
    if !speed.is_finite() || speed <= 0.0 {
        return base_ms.saturating_mul(2).max(1);
    }
    let scaled = base_ms as f64 / speed as f64;
    let lower = (base_ms as f64 / 8.0).max(1.0);
    let upper = (base_ms as f64 * 2.0).max(1.0);
    scaled.clamp(lower, upper).round() as u64
}

/// 播放器行为事件落库（副作用：DB 写入；失败仅 eprintln——信号不阻断链路）。
///
/// @ai-context: payload {"action": "pause"|"play"|"speed", "value": 倍速或 null}；
///              容量守卫由 db.add_event 内部处理（FIFO 删最旧）。
pub fn record_action(action: &PlayerAction, now_ms: u64, session_id: i64, db: &Db) {
    let (action_str, value) = match action.kind {
        PlayerActionKind::Pause => ("pause", None),
        PlayerActionKind::Play => ("play", None),
        PlayerActionKind::Speed { multiplier } => ("speed", Some(multiplier)),
    };
    let event = NewSessionEvent {
        session_id,
        kind: EventKind::PlayerBehavior,
        timestamp_ms: now_ms,
        payload: serde_json::json!({ "action": action_str, "value": value }),
    };
    if let Err(e) = db.add_event(&event) {
        eprintln!("[PlayerBehavior] 行为事件落库失败: {}", e);
    }
}

/// 播放器行为事件（从事件表映射——SessionAnalysis 消费形态）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PlayerActionEvent {
    /// 事件时刻（ms，相对会话起点）
    pub time_ms: u64,
    /// 行为标识（"pause" | "play" | "speed"）
    pub action: String,
    /// 附加数值（倍速值；无 = None）
    pub value: Option<f32>,
}

/// 从 PlayerBehavior 事件序列映射行为事件列表（纯函数）。
///
/// @ai-context: 消费端（analysis.rs）：从事件表读 PlayerBehavior 事件，
///              载荷缺 action 或 action 非法 → 跳过（防御脏数据）。
pub fn player_actions_from_events(events: &[SessionEvent]) -> Vec<PlayerActionEvent> {
    events
        .iter()
        .filter(|e| e.kind == EventKind::PlayerBehavior)
        .filter_map(|e| {
            let action = e.payload.get("action")?.as_str()?.to_string();
            let value = e
                .payload
                .get("value")
                .and_then(|v| v.as_f64())
                .map(|v| v as f32);
            Some(PlayerActionEvent { time_ms: e.timestamp_ms, action, value })
        })
        .collect()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "player_behavior_tests.rs"]
mod tests;
