//! 前台时间线单测（REQ-128 M16 / v0.7.0 M2；AAA 模式，内存库）。
//!
//! @ai-context: 由 foreground_timeline.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖 observe 事件落库（变化/去重/None 间隙）与 practice_segments
//!              纯函数推导（含"无事件→空"边界与零长段丢弃）。

use super::*;
use crate::db::Db;
use crate::session_events::EventKind;
use crate::types::NewSession;

/// 内存库 + 会话夹具（环境隔离：绝不触碰真实文件）。
fn mem_db_with_session() -> (Db, i64) {
    let db = Db::open(":memory:").expect("内存库打开成功");
    let session = db
        .create_session(&NewSession {
            title: "前台时间线测试".to_string(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .expect("会话创建成功");
    (db, session.id)
}

/// 构造 ForegroundSwitch 事件（测试夹具）。
fn fg_event(timestamp_ms: u64, hwnd: i64) -> SessionEvent {
    SessionEvent {
        id: 0,
        session_id: 1,
        kind: EventKind::ForegroundSwitch,
        timestamp_ms,
        payload: serde_json::json!({ "hwnd": hwnd }),
    }
}

#[test]
fn observe_writes_event_on_switch() {
    // Arrange：内存库 + 监控器（目标 100）
    let (db, sid) = mem_db_with_session();
    let mut mon = ForegroundMonitor::new(Some(100));
    // Act：首观测基线 + 切换
    mon.observe(Some(100), 2000, sid, &db);
    mon.observe(Some(200), 4000, sid, &db);
    let events = db.list_events(sid).unwrap();
    // Assert：两条事件，payload hwnd 正确
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].kind, EventKind::ForegroundSwitch);
    assert_eq!(events[0].payload["hwnd"], 100);
    assert_eq!(events[1].payload["hwnd"], 200);
}

#[test]
fn observe_no_change_no_event() {
    // Arrange
    let (db, sid) = mem_db_with_session();
    let mut mon = ForegroundMonitor::new(None);
    // Act：同一窗口重复观测
    mon.observe(Some(100), 2000, sid, &db);
    mon.observe(Some(100), 4000, sid, &db);
    // Assert：仅首观测落库（无变化不写重复事件）
    assert_eq!(db.list_events(sid).unwrap().len(), 1);
}

#[test]
fn observe_none_probe_gap_no_spurious_event() {
    // Arrange
    let (db, sid) = mem_db_with_session();
    let mut mon = ForegroundMonitor::new(None);
    // Act：探测失败（None）间隙后回到同一窗口
    mon.observe(Some(100), 2000, sid, &db);
    mon.observe(None, 4000, sid, &db);
    mon.observe(Some(100), 6000, sid, &db);
    // Assert：None 不落库；回到同一窗口不重复（last_recorded_hwnd 去重）
    assert_eq!(db.list_events(sid).unwrap().len(), 1);
}

#[test]
fn observe_none_initial_no_event() {
    // Arrange
    let (db, sid) = mem_db_with_session();
    let mut mon = ForegroundMonitor::new(None);
    // Act：前台探测失败（无前台窗口）
    mon.observe(None, 2000, sid, &db);
    // Assert：无事件（None 无法构造 hwnd 载荷）
    assert!(db.list_events(sid).unwrap().is_empty());
}

#[test]
fn monitor_stores_target_hwnd() {
    // Arrange & Act：构造时记录录制目标窗口
    let mon = ForegroundMonitor::new(Some(42));
    // Assert：getter 返回构造值（V1.0 载荷富化/自窗口过滤预留）
    assert_eq!(mon.target_hwnd(), Some(42));
}

// ── practice_segments 纯函数 ──

#[test]
fn practice_segments_empty_events() {
    // Arrange & Act：无事件 → 空向量（边界）
    assert!(practice_segments(&[], None).is_empty());
}

#[test]
fn practice_segments_single_event() {
    // Arrange & Act：仅基线（无交替）→ 空
    let events = vec![fg_event(1000, 100)];
    assert!(practice_segments(&events, None).is_empty());
}

#[test]
fn practice_segments_all_same_hwnd() {
    // Arrange & Act：全同窗口（无交替）→ 空
    let events = vec![fg_event(1000, 100), fg_event(5000, 100), fg_event(9000, 100)];
    assert!(practice_segments(&events, None).is_empty());
}

#[test]
fn practice_segments_one_round() {
    // Arrange：目标 100 → 200 → 回 100（一轮交替）
    let events = vec![fg_event(1000, 100), fg_event(5000, 200), fg_event(9000, 100)];
    // Act
    let segs = practice_segments(&events, None);
    // Assert：一个实践段（5000 离开视频 → 9000 回来），tool 诚实 "other"
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].start_ms, 5000);
    assert_eq!(segs[0].end_ms, 9000);
    assert_eq!(segs[0].tool, "other");
}

#[test]
fn practice_segments_multiple_rounds() {
    // Arrange：两轮交替（中间停留其他窗口不打断段）
    let events = vec![
        fg_event(0, 100),
        fg_event(3000, 200),
        fg_event(6000, 100),
        fg_event(9000, 300),
        fg_event(12000, 100),
    ];
    // Act
    let segs = practice_segments(&events, None);
    // Assert：两段（3000-6000、9000-12000）
    assert_eq!(segs.len(), 2);
    assert_eq!((segs[0].start_ms, segs[0].end_ms), (3000, 6000));
    assert_eq!((segs[1].start_ms, segs[1].end_ms), (9000, 12000));
}

#[test]
fn practice_segments_unclosed_at_session_end() {
    // Arrange：离开视频后未回来（会话结束时仍在实践）
    let events = vec![fg_event(0, 100), fg_event(3000, 200), fg_event(6000, 200)];
    // Act
    let segs = practice_segments(&events, None);
    // Assert：未闭合段 end = 最后观测时刻（诚实标注，不丢数据）
    assert_eq!(segs.len(), 1);
    assert_eq!((segs[0].start_ms, segs[0].end_ms), (3000, 6000));
}

#[test]
fn practice_segments_filters_kind_and_bad_payload() {
    // Arrange：混合事件（其他类型 + 缺 hwnd 的前台事件 + 有效切换序列）
    let events = vec![
        SessionEvent {
            id: 0,
            session_id: 1,
            kind: EventKind::FrameSwitch,
            timestamp_ms: 0,
            payload: serde_json::json!({}),
        },
        SessionEvent {
            id: 1,
            session_id: 1,
            kind: EventKind::ForegroundSwitch,
            timestamp_ms: 1000,
            payload: serde_json::json!({}),
        },
        fg_event(5000, 100),
        fg_event(9000, 200),
        fg_event(13000, 100),
    ];
    // Act：仅有效 (hwnd) 前台事件参与（目标 = 首个有效事件 100）
    let segs = practice_segments(&events, None);
    // Assert：一个实践段（9000 离开 100 → 13000 回来）
    assert_eq!(segs.len(), 1);
    assert_eq!((segs[0].start_ms, segs[0].end_ms), (9000, 13000));
}

#[test]
fn practice_segments_zero_length_dropped() {
    // Arrange：离开视频后会话即结束（仅一次转换 → 零长段）
    let events = vec![fg_event(0, 100), fg_event(3000, 200)];
    // Act
    let segs = practice_segments(&events, None);
    // Assert：零长段（start==end==3000）无信息量，丢弃
    assert!(segs.is_empty());
}

// ── 审查 H1 修复（v0.7.0 新增代码审查）：未闭合段用会话结束时刻 ──

#[test]
fn practice_segments_unclosed_uses_session_end() {
    // Arrange：用户 5s 切走直到会话结束（监控器"变化才写"→ 序列在离开时刻终止）
    let events = vec![fg_event(0, 100), fg_event(5000, 200)];
    // Act：注入会话结束时刻 60000（2h 会话尾）
    let segs = practice_segments(&events, Some(60_000));
    // Assert：未闭合实践段 [5000, 60000] 保留（此前零长被丢弃 = 整段实践丢失）
    assert_eq!(segs.len(), 1);
    assert_eq!((segs[0].start_ms, segs[0].end_ms), (5000, 60_000));
}

#[test]
fn practice_segments_unclosed_without_session_end_falls_back() {
    // Arrange：同上但无会话结束时刻（兼容旧调用）
    let events = vec![fg_event(0, 100), fg_event(5000, 200)];
    // Act & Assert：回退最后观测时刻 → 零长丢弃（近似语义，不崩溃）
    assert!(practice_segments(&events, None).is_empty());
}

#[test]
fn practice_segments_session_end_before_start_ignored() {
    // Arrange：会话结束时刻早于实践开始（脏数据防御）
    let events = vec![fg_event(0, 100), fg_event(5000, 200)];
    // Act：session_end < start → 回退最后观测（不产生 end < start 的段）
    let segs = practice_segments(&events, Some(3000));
    assert!(segs.is_empty());
}
