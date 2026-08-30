//! 播放器行为信号单测（REQ-125 M1 / v0.7.0 M2；AAA 模式，内存库 + 合成帧）。
//!
//! @ai-context: 由 player_behavior.rs 以 #[cfg(test)] #[path] 引入；
//!              合成帧用代码绘制（暗遮罩 + 中央黑圆盘 + 白三角近似暂停图标），
//!              不依赖真实播放器样本（真机验证留验收阶段，REQ-125 验收条款）。

use super::*;
use crate::db::Db;
use crate::session_events::EventKind;
use crate::types::NewSession;
use image::{Rgb, RgbImage};

/// 内存库 + 会话夹具（环境隔离）。
fn mem_db_with_session() -> (Db, i64) {
    let db = Db::open(":memory:").expect("内存库打开成功");
    let session = db
        .create_session(&NewSession {
            title: "播放器行为测试".to_string(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .expect("会话创建成功");
    (db, session.id)
}

/// 合成"暂停态"帧：暗遮罩背景 + 中央黑圆盘 + 白色右向三角（代码绘制）。
///
/// @ai-context: 模拟播放器暂停画面——视频被压暗（背景 40,40,40）、中央黑圆盘
///              上叠白色播放三角；三角面积远小于圆盘（图标占比合理）。
fn paused_frame(w: u32, h: u32) -> RgbImage {
    RgbImage::from_fn(w, h, |x, y| {
        let cx = (w / 2) as i64;
        let cy = (h / 2) as i64;
        let r = ((h as f32) * 0.10) as i64; // 圆盘半径（落在中央区 24% 内）
        let dx = x as i64 - cx;
        let dy = y as i64 - cy;
        let in_disk = dx * dx + dy * dy <= r * r;
        // 白色右向三角（顶点在圆心左、竖边在圆心右）
        let half_h = (r * 2) / 3;
        let in_triangle = dy.abs() <= half_h && {
            let row_half = half_h - dy.abs();
            dx >= 0 && dx <= row_half * 2
        };
        if in_triangle {
            Rgb([255, 255, 255])
        } else if in_disk {
            Rgb([0, 0, 0])
        } else {
            Rgb([40, 40, 40]) // 暗遮罩（暂停时视频被压暗）
        }
    })
}

#[test]
fn pause_icon_detected_on_paused_frame() {
    // Arrange：合成暂停帧（240x135）
    let frame = paused_frame(240, 135);
    // Act
    let action = detect_player_action(&frame);
    // Assert：命中 Pause
    let action = action.expect("暂停图标应被检测");
    assert_eq!(action.kind, PlayerActionKind::Pause);
}

#[test]
fn plain_frame_no_icon_returns_none() {
    // Arrange：均匀灰帧（无暗遮罩/无图标）
    let frame = RgbImage::from_pixel(240, 135, Rgb([128, 128, 128]));
    // Act
    let action = detect_player_action(&frame);
    // Assert：保守——不确定返回 None（不产生假信号）
    assert!(action.is_none());
}

#[test]
fn dark_scene_without_icon_returns_none() {
    // Arrange：纯黑帧（暗色视频场景，无白色图标）
    let frame = RgbImage::from_pixel(240, 135, Rgb([5, 5, 5]));
    // Act
    let action = detect_player_action(&frame);
    // Assert：无图标 → bright 占比过低不判（防暗场景误报）
    assert!(action.is_none());
}

#[test]
fn tiny_frame_returns_none() {
    // Arrange：尺寸过小帧
    let frame = RgbImage::from_pixel(4, 4, Rgb([0, 0, 0]));
    // Act & Assert：防御——尺寸不足直接不判
    assert!(detect_player_action(&frame).is_none());
}

#[test]
fn dark_scene_with_colored_glow_not_detected() {
    // TD-2026-08-19-F 回归：暗底 + 中央亮**彩色**内容（发光红点/橙标题）——
    // 修复前被判为暂停（bright 满足），修复后白色判据拒绝
    let frame = RgbImage::from_fn(240, 135, |x, y| {
        let cx = 120i32;
        let cy = 67i32;
        let dx = x as i32 - cx;
        let dy = y as i32 - cy;
        if dx * dx + dy * dy <= 15 * 15 {
            Rgb([255, 40, 40]) // 中央亮红圆（饱和度极高，非白）
        } else {
            Rgb([30, 30, 30]) // 暗底
        }
    });
    // Act
    let action = detect_player_action(&frame);
    // Assert：彩色亮内容不是暂停图标 → 不判
    assert!(action.is_none());
}

#[test]
fn speed_scaled_interval_boundaries() {
    // Assert：1.0x → base；2.0x → base/2；0.5x → base*2（上限保护）
    assert_eq!(speed_scaled_interval(1000, 1.0), 1000);
    assert_eq!(speed_scaled_interval(1000, 2.0), 500);
    assert_eq!(speed_scaled_interval(1000, 0.5), 2000);
    // 非法/极端速率 → 上限保护（0.1x 本应 base*10，封顶 base*2）
    assert_eq!(speed_scaled_interval(1000, 0.1), 2000);
    assert_eq!(speed_scaled_interval(1000, 0.0), 2000);
    assert_eq!(speed_scaled_interval(1000, f32::NAN), 2000);
    // 高倍速 → 下限保护（16x 本应 base/16，封底 base/8）
    assert_eq!(speed_scaled_interval(1000, 16.0), 125);
}

#[test]
fn record_action_writes_pause_event() {
    // Arrange：内存库
    let (db, sid) = mem_db_with_session();
    // Act：暂停行为落库
    let action = PlayerAction { kind: PlayerActionKind::Pause, value: None };
    record_action(&action, 3000, sid, &db);
    // Assert：PlayerBehavior 事件 + payload 契约
    let events = db.list_events_by_kind(sid, EventKind::PlayerBehavior).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].timestamp_ms, 3000);
    assert_eq!(events[0].payload["action"], "pause");
    assert_eq!(events[0].payload["value"], serde_json::Value::Null);
}

#[test]
fn record_action_speed_writes_value() {
    // Arrange：内存库
    let (db, sid) = mem_db_with_session();
    // Act：倍速行为落库（Speed 变体构造——覆盖变体 + payload value）
    let action = PlayerAction { kind: PlayerActionKind::Speed { multiplier: 1.5 }, value: Some(1.5) };
    record_action(&action, 5000, sid, &db);
    // Assert：payload {"action":"speed","value":1.5}
    let events = db.list_events_by_kind(sid, EventKind::PlayerBehavior).unwrap();
    assert_eq!(events[0].payload["action"], "speed");
    assert_eq!(events[0].payload["value"], 1.5);
}

#[test]
fn player_actions_from_events_maps_and_skips_bad() {
    // Arrange：混合事件（合法行为 + 缺 action + 非行为类型）
    let events = vec![
        SessionEvent {
            id: 0,
            session_id: 1,
            kind: EventKind::PlayerBehavior,
            timestamp_ms: 3000,
            payload: serde_json::json!({"action": "pause", "value": null}),
        },
        SessionEvent {
            id: 1,
            session_id: 1,
            kind: EventKind::PlayerBehavior,
            timestamp_ms: 6000,
            payload: serde_json::json!({"value": 1.5}),
        },
        SessionEvent {
            id: 2,
            session_id: 1,
            kind: EventKind::ForegroundSwitch,
            timestamp_ms: 9000,
            payload: serde_json::json!({"hwnd": 1}),
        },
    ];
    // Act
    let mapped = player_actions_from_events(&events);
    // Assert：仅合法行为映射；缺 action 跳过；非行为类型跳过
    assert_eq!(mapped.len(), 1);
    assert_eq!(mapped[0].action, "pause");
    assert_eq!(mapped[0].time_ms, 3000);
    assert_eq!(mapped[0].value, None);
}
