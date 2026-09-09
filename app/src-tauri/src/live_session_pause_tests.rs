//! live_session_pause 纯函数单测（AAA；边沿判定真值表 + 合成对单调 + 吸收）。
//!
//! @ai-context: plan_edge_observation 为纯函数（无 epoch/DB/emit 依赖——会话
//!              时刻由调用方以参数传入），可完整离线测真值表；事件对时刻
//!              单调性在此验证（DB 插入顺序 = events 顺序，单调即时间轴有序）。

use super::*;

/// 构造带区间槽的观察（Arrange 辅助）。
fn iv(pause_ms: u64, resume_ms: u64, source: PauseSource) -> PauseInterval {
    PauseInterval { pause_ms, resume_ms, source }
}

/// 观察视点构造（Arrange 辅助）。
fn view(flag: bool, seq: u64) -> PauseEdgeView {
    PauseEdgeView {
        flag,
        seq,
        own_pending: false,
        pause_processed: false,
        last_pause_ms: None,
    }
}

#[test]
fn no_change_produces_nothing() {
    // Arrange & Act：标志未变、seq 未动
    let v = view(false, 0);
    let (action, next) = plan_edge_observation(&v, false, 0, None, None, 1000);
    // Assert
    assert!(action.events.is_empty());
    assert!(!action.flush_cut);
    assert_eq!(next.flag, v.flag);
    assert_eq!(next.seq, v.seq);
}

#[test]
fn visible_pause_edge_emits_pause_with_flush() {
    // Arrange：运行中，无漏检
    let v = view(false, 0);
    // Act：暂停请求可见（上升沿，reason=media 持因）
    let (action, next) = plan_edge_observation(&v, true, 0, Some(PauseSource::Media), None, 5000);
    // Assert：Pause 事件 + flush；时刻=会话时刻公式值
    assert_eq!(action.events.len(), 1);
    assert_eq!(action.events[0].kind, PlanEventKind::Pause);
    assert_eq!(action.events[0].source, PauseSource::Media);
    assert_eq!(action.events[0].moment_ms, 5000);
    assert!(action.flush_cut);
    assert!(next.pause_processed);
    assert!(next.own_pending, "上升沿后自身完成增量待吸收");
    assert_eq!(next.last_pause_ms, Some(5000));
}

#[test]
fn visible_resume_edge_after_visible_pause_emits_resume() {
    // Arrange：可见暂停已被处理（own_pending=true，seq 未动——物理 Start 尚未执行）
    let v = PauseEdgeView { own_pending: true, pause_processed: true, last_pause_ms: Some(5000), ..view(true, 0) };
    // Act：恢复可见，且捕获线程已执行 Start（区间完成 +1）
    let (action, next) = plan_edge_observation(&v, false, 1, Some(PauseSource::Media), Some(iv(5000, 5050, PauseSource::Media)), 6000);
    // Assert：delta 1 = 自身区间完成 → 吸收（k=0 无合成）+ Resume 事件
    assert_eq!(action.events.len(), 1);
    assert_eq!(action.events[0].kind, PlanEventKind::Resume);
    assert_eq!(action.events[0].source, PauseSource::Media);
    assert!(!action.flush_cut, "正常恢复不 flush（引擎已在暂停边沿清流）");
    assert!(!next.pause_processed);
    assert!(!next.own_pending);
}

#[test]
fn missed_interval_within_poll_window_synthesizes_pair() {
    // Arrange：暂停+恢复都发生在轮询窗内——loop 两次观察都是运行态，seq +1
    let v = view(false, 0);
    // Act：稳态假 + delta 1（漏检一个完整区间，槽=其实测时刻）
    let (action, next) = plan_edge_observation(
        &v,
        false,
        1,
        Some(PauseSource::Manual),
        Some(iv(3000, 3000, PauseSource::Media)),
        9000,
    );
    // Assert：合成 Pause/Resume 对（时刻取槽）+ flush（引擎跨漏区间需断句）
    assert_eq!(action.events.len(), 2);
    assert_eq!(action.events[0].kind, PlanEventKind::Pause);
    assert_eq!(action.events[0].moment_ms, 3000);
    assert_eq!(action.events[0].source, PauseSource::Media);
    assert_eq!(action.events[1].kind, PlanEventKind::Resume);
    assert_eq!(action.events[1].moment_ms, 3000);
    assert!(action.flush_cut);
    assert_eq!(next.seq, 1);
    assert_eq!(next.last_pause_ms, Some(3000));
}

#[test]
fn missed_pair_moments_are_monotonic_and_pause_precedes_resume() {
    // Arrange & Act：合成对 + 随后可见暂停/恢复的事件序列
    let v = view(false, 0);
    let (a1, n1) = plan_edge_observation(
        &v,
        false,
        1,
        None,
        Some(iv(2000, 2000, PauseSource::Foreground)),
        8000,
    );
    let (a2, n2) = plan_edge_observation(&n1, true, 1, Some(PauseSource::Foreground), None, 9000);
    let (a3, _n3) = plan_edge_observation(
        &n2,
        false,
        2,
        Some(PauseSource::Foreground),
        Some(iv(9000, 9050, PauseSource::Foreground)),
        9500,
    );
    let mut all: Vec<PlanEvent> = Vec::new();
    all.extend(a1.events);
    all.extend(a2.events);
    all.extend(a3.events);
    // Assert：时间戳非降 + Pause 在配对 Resume 前（DB 插入序=时间轴序）
    // 期望序列：合成对[P@2000,R@2000] + 可见暂停[P@9000] + 恢复[R@9500]
    assert_eq!(all.len(), 4);
    for w in all.windows(2) {
        assert!(w[0].moment_ms <= w[1].moment_ms, "时间戳须单调: {:?} → {:?}", w[0], w[1]);
    }
    assert_eq!(all[0].kind, PlanEventKind::Pause);
    assert_eq!(all[0].moment_ms, 2000);
    assert_eq!(all[1].kind, PlanEventKind::Resume);
    assert_eq!(all[2].kind, PlanEventKind::Pause);
    assert_eq!(all[2].moment_ms, 9000);
    assert_eq!(all[3].kind, PlanEventKind::Resume);
    assert_eq!(all[3].moment_ms, 9500);
}

#[test]
fn resume_moment_clamped_to_last_pause_event() {
    // Arrange：暂停事件时刻晚记（公式 8000）> 恢复检测的会话时刻（7600——
    // 暂停期补偿未累计，会话轴不前进），裸公式会倒挂
    let v = PauseEdgeView { own_pending: true, pause_processed: true, last_pause_ms: Some(8000), ..view(true, 0) };
    // Act
    let (action, _next) = plan_edge_observation(&v, false, 1, Some(PauseSource::Manual), Some(iv(7000, 7000, PauseSource::Manual)), 7600);
    // Assert：恢复时刻被夹逼到 ≥ 上一 Pause 事件（DB 时间戳单调）
    assert_eq!(action.events.len(), 1);
    assert_eq!(action.events[0].kind, PlanEventKind::Resume);
    assert_eq!(action.events[0].moment_ms, 8000);
}

#[test]
fn delayed_own_completion_absorbed_once() {
    // Arrange：恢复抢跑（下降沿 delta 0——Start 未执行）
    let v = PauseEdgeView { own_pending: true, pause_processed: true, last_pause_ms: Some(4000), ..view(true, 0) };
    let (a1, n1) = plan_edge_observation(&v, false, 0, Some(PauseSource::Manual), None, 4500);
    assert_eq!(a1.events.len(), 1);
    assert_eq!(a1.events[0].kind, PlanEventKind::Resume);
    assert!(n1.own_pending, "抢跑：自身完成增量稍后才到");
    // Act：+1 到达（自身区间完成）——须吸收，不得当漏检区间重复合成
    let (a2, n2) = plan_edge_observation(
        &n1,
        false,
        1,
        Some(PauseSource::Manual),
        Some(iv(4000, 4500, PauseSource::Manual)),
        4600,
    );
    // Assert：吸收后无事件（own_pending=false，无重复 Pause/Resume 对）
    assert!(a2.events.is_empty());
    assert!(!a2.flush_cut, "可见暂停已在上升沿清流，吸收不 flush");
    assert!(!n2.own_pending);
}

#[test]
fn genuine_missed_interval_still_synthesized_after_absorb() {
    // Arrange：抢跑吸收后，又真实漏检一个区间（delta 2 = 自身完成 + 漏检）
    let n1 = PauseEdgeView { own_pending: true, pause_processed: false, last_pause_ms: Some(4000), ..view(false, 0) };
    // Act
    let (action, next) = plan_edge_observation(
        &n1,
        false,
        2,
        Some(PauseSource::Media),
        Some(iv(5000, 5200, PauseSource::Media)),
        6000,
    );
    // Assert：吸收 1 + 合成 1 对（时刻取槽——漏检区间的实测时刻）
    assert_eq!(action.events.len(), 2);
    assert_eq!(action.events[0].moment_ms, 5000);
    assert_eq!(action.events[1].moment_ms, 5200);
    assert!(action.flush_cut);
    assert_eq!(action.missed_count, 1);
    assert_eq!(next.seq, 2);
    assert!(!next.own_pending);
}

#[test]
fn flap_during_paused_steady_state_synthesized_at_resume() {
    // Arrange：loop 见暂停（处理过），暂停期内用户恢复又暂停（flap）——
    // flag 稳态真，seq +1（flap 的 Start 已执行）
    let v = PauseEdgeView { own_pending: true, pause_processed: true, last_pause_ms: Some(3000), ..view(true, 0) };
    // Act：稳态真 delta 1 = 自身完成（absorb 后无漏检）
    let (a1, n1) = plan_edge_observation(&v, true, 1, Some(PauseSource::Manual), Some(iv(3000, 3500, PauseSource::Manual)), 4000);
    assert!(a1.events.is_empty(), "自身完成被吸收，不合成");
    assert!(!a1.flush_cut);
    // Act：第二个 flap 完成（delta 又 +1——真漏检）
    let (a2, _n2) = plan_edge_observation(
        &n1,
        true,
        2,
        Some(PauseSource::Manual),
        Some(iv(4200, 4400, PauseSource::Media)),
        4500,
    );
    assert_eq!(a2.events.len(), 2, "真漏检 flap 合成一对");
    assert_eq!(a2.events[0].moment_ms, 4200);
    assert!(a2.flush_cut, "flap 内容在引擎流里连句——恢复边沿需断句");
}

#[test]
fn rising_with_prior_missed_interval_synthesizes_then_pauses() {
    // Arrange：漏检一个区间后，新暂停可见（上升沿 delta 1）
    let v = view(false, 0);
    let (action, next) = plan_edge_observation(
        &v,
        true,
        1,
        Some(PauseSource::Media),
        Some(iv(2000, 2000, PauseSource::Media)),
        6000,
    );
    // Assert：合成对在前 + 可见 Pause 在后（顺序=时间序）；一次 flush 全覆盖
    assert_eq!(action.events.len(), 3);
    assert_eq!(action.events[0].kind, PlanEventKind::Pause);
    assert_eq!(action.events[0].moment_ms, 2000);
    assert_eq!(action.events[1].kind, PlanEventKind::Resume);
    assert_eq!(action.events[2].kind, PlanEventKind::Pause);
    assert_eq!(action.events[2].moment_ms, 6000);
    assert!(action.flush_cut);
    assert!(next.pause_processed);
}

#[test]
fn resume_after_loop_started_paused_defensive_flush() {
    // Arrange：loop 起点即在暂停中（未处理过上升沿——引擎可能未清流）
    let v = PauseEdgeView { own_pending: true, pause_processed: false, last_pause_ms: None, ..view(true, 0) };
    // Act：恢复可见（自身完成 +1）
    let (action, next) = plan_edge_observation(
        &v,
        false,
        1,
        Some(PauseSource::Manual),
        Some(iv(0, 100, PauseSource::Manual)),
        2000,
    );
    // Assert：Resume 事件 + 边界保护 flush（!pause_processed）
    assert_eq!(action.events.len(), 1);
    assert_eq!(action.events[0].kind, PlanEventKind::Resume);
    assert!(action.flush_cut, "引擎未清流——恢复边沿防御 flush");
    assert!(!next.pause_processed);
    assert!(!next.own_pending);
}

#[test]
fn quick_roundtrip_physically_invisible_is_silent() {
    // Arrange：暂停请求<捕获轮询粒度——捕获线程从未执行 Stop/Start（seq 0），
    // flag 也从未被 loop 见真（两次观察都是运行态）
    let v = view(false, 0);
    let (action, _next) = plan_edge_observation(&v, false, 0, None, None, 5000);
    // Assert：物理无可暂停 → 不记 seq 不写事件
    assert!(action.events.is_empty());
    assert!(!action.flush_cut);
}

#[test]
fn init_view_snapshots_paused_state_with_pending_absorption() {
    // Arrange：SessionPause 已暂停（如命令早于 loop 起点）
    let p = SessionPause::default();
    p.request_pause(PauseSource::Manual);
    // Act
    let v = PauseEdgeView::new(&p);
    // Assert：对齐（own_pending 真——该暂停的完成增量稍后需吸收）
    assert!(v.flag);
    assert!(v.own_pending);
    assert!(!v.pause_processed);
    p.reset();
    let v2 = PauseEdgeView::new(&p);
    assert!(!v2.flag);
    assert!(!v2.own_pending);
}
