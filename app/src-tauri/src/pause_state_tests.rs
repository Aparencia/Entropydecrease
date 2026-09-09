//! pause_state 单测（AAA 模式；机器真值表/request 幂等/锁存语义/复位纪律）。
//!
//! @ai-context: 纯函数 next() 与 request API 在同一文件可测；共享状态无
//!              IO/系统依赖，内存内直接构造。

use std::sync::atomic::Ordering;

use super::*;

/// 以状态机条件 + 锁存请求跑一遍并返回结局（request 会改共享——测试用
/// 一次性实例，避免跨用例污染）。
fn run(shared: &SessionPause, req: PauseRequest) -> PauseOutcome {
    shared.request(req)
}

#[test]
fn manual_pause_resume_roundtrip() {
    // Arrange
    let p = SessionPause::default();
    // Act
    let out1 = run(&p, PauseRequest::Pause(PauseSource::Manual));
    // Assert：运行→暂停 + 持因 manual
    assert_eq!(out1, PauseOutcome::Paused);
    assert!(p.paused.load(Ordering::SeqCst));
    assert_eq!(p.paused_reason(), Some(PauseSource::Manual));
    // Act：解除
    let out2 = run(&p, PauseRequest::Release(PauseSource::Manual));
    assert_eq!(out2, PauseOutcome::Resumed);
    assert!(!p.paused.load(Ordering::SeqCst));
    assert_eq!(p.paused_reason(), None);
}

#[test]
fn pause_is_idempotent_reject() {
    // Arrange：已手动暂停
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Manual));
    // Act：重复暂停请求（幂等拒绝——守卫文案依据）
    let out = run(&p, PauseRequest::Pause(PauseSource::Manual));
    // Assert：不再翻转、条件保持
    assert_eq!(out, PauseOutcome::AlreadyPaused);
    assert!(p.paused.load(Ordering::SeqCst));
}

#[test]
fn release_when_not_paused_reports_not_paused() {
    // Arrange & Act：无暂停直接释放
    let p = SessionPause::default();
    let out = run(&p, PauseRequest::Release(PauseSource::Manual));
    // Assert
    assert_eq!(out, PauseOutcome::NotPaused);
    assert!(!p.paused.load(Ordering::SeqCst));
}

#[test]
fn auto_proposal_during_manual_latch_records_condition_only() {
    // Arrange：手动暂停锁存期间视频也暂停（worker 提议）
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Manual));
    // Act：auto 提议——只记条件不动作（物理已暂停）
    let out = run(&p, PauseRequest::Pause(PauseSource::Media));
    // Assert：锁存 + reason 仍 manual（manual 优先）
    assert_eq!(out, PauseOutcome::AlreadyPaused);
    assert!(p.paused.load(Ordering::SeqCst));
    assert_eq!(p.reason(), Some(PauseSource::Manual));
    // Act：manual 解除瞬间重评估——media 条件仍真 → 对应源自动重暂停
    let out = run(&p, PauseRequest::Release(PauseSource::Manual));
    assert_eq!(out, PauseOutcome::StillHeld);
    assert!(p.paused.load(Ordering::SeqCst));
    assert_eq!(p.reason(), Some(PauseSource::Media));
}

#[test]
fn auto_sources_only_release_themselves() {
    // Arrange：媒体暂停在先
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Media));
    // Act：前台随后锁存（互不解除——媒体不被前台清）
    run(&p, PauseRequest::Pause(PauseSource::Foreground));
    assert_eq!(p.reason(), Some(PauseSource::Foreground), "前台 rank 更高");
    // 前台先解除：media 仍持 → 暂停延续
    let out = run(&p, PauseRequest::Release(PauseSource::Foreground));
    assert_eq!(out, PauseOutcome::StillHeld);
    assert_eq!(p.reason(), Some(PauseSource::Media));
    // 媒体自行解除：整段结束
    let out = run(&p, PauseRequest::Release(PauseSource::Media));
    assert_eq!(out, PauseOutcome::Resumed);
    assert!(!p.paused.load(Ordering::SeqCst));
}

#[test]
fn auto_release_does_not_touch_manual() {
    // Arrange：手动暂停中媒体条件被锁存
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Manual));
    run(&p, PauseRequest::Pause(PauseSource::Media));
    // Act：媒体条件消失（视频恢复）——manual 不受影响
    let out = run(&p, PauseRequest::Release(PauseSource::Media));
    // Assert：媒体已解但 manual 仍持 → 暂停延续（StillHeld），reason 仍 manual
    assert_eq!(out, PauseOutcome::StillHeld);
    assert!(p.paused.load(Ordering::SeqCst));
    assert_eq!(p.reason(), Some(PauseSource::Manual));
    // 手动解除 → 整段结束
    let out = run(&p, PauseRequest::Release(PauseSource::Manual));
    assert_eq!(out, PauseOutcome::Resumed);
    assert!(!p.paused.load(Ordering::SeqCst));
}

#[test]
fn reason_follows_priority_precedence() {
    // Arrange：媒体+前台同时持暂停
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Media));
    run(&p, PauseRequest::Pause(PauseSource::Foreground));
    assert_eq!(p.reason(), Some(PauseSource::Foreground));
    // Act：前台解除 → reason 切回 media
    run(&p, PauseRequest::Release(PauseSource::Foreground));
    assert_eq!(p.reason(), Some(PauseSource::Media));
}

#[test]
fn release_sets_sticky_reason_for_resume_edge() {
    // Arrange：媒体自动暂停
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Media));
    // Act：媒体自行解除（loop 恢复边沿在 ~500ms 轮询后才看到——需 sticky 来源）
    run(&p, PauseRequest::Release(PauseSource::Media));
    // Assert：reason 槽保留最近释放源（loop 恢复事件取 source 用）
    assert!(!p.paused.load(Ordering::SeqCst));
    assert_eq!(p.reason(), Some(PauseSource::Media));
    // 新暂停覆盖 sticky
    run(&p, PauseRequest::Pause(PauseSource::Manual));
    assert_eq!(p.reason(), Some(PauseSource::Manual));
}

#[test]
fn reset_clears_all_state_and_conditions() {
    // Arrange：暂停中 + 双源条件 + 补偿时长 + 区间计数
    let p = SessionPause::default();
    run(&p, PauseRequest::Pause(PauseSource::Manual));
    run(&p, PauseRequest::Pause(PauseSource::Media));
    p.total_paused_ms.store(1234, Ordering::SeqCst);
    p.record_interval(PauseInterval {
        pause_ms: 500,
        resume_ms: 500,
        source: PauseSource::Manual,
    });
    // Act：新会话复位
    p.reset();
    // Assert：全部清零（新会话不继承暂停/补偿/条件/区间）
    assert!(!p.paused.load(Ordering::SeqCst));
    assert_eq!(p.total_paused_ms.load(Ordering::SeqCst), 0);
    assert_eq!(p.completed_intervals(), 0);
    assert_eq!(p.paused_reason(), None);
    assert_eq!(p.edge_interval(), None);
    // 复位后可正常再次暂停（P2 补漏语义）
    assert_eq!(run(&p, PauseRequest::Pause(PauseSource::Manual)), PauseOutcome::Paused);
}

#[test]
fn kebab_case_contract_stable() {
    // Arrange & Act & Assert：payload/事件/状态三处共用同一序列化契约
    assert_eq!(PauseSource::Manual.as_str(), "manual");
    assert_eq!(PauseSource::Foreground.as_str(), "foreground");
    assert_eq!(PauseSource::Media.as_str(), "media");
    assert_eq!(
        serde_json::to_string(&PauseSource::Media).unwrap(),
        "\"media\""
    );
}

#[test]
fn machine_truth_table_matches_request_api() {
    // 纯函数真值表（request API 落库前的同一计算——防两层漂移）：
    // manual 锁存 / auto 合并 / 解除重评估
    let mut s = PauseMachineState {
        cond: PauseConditions::default(),
        paused: false,
        reason: None,
    };
    // Pause(Manual) → paused, reason=manual
    s = s.next(PauseRequest::Pause(PauseSource::Manual));
    assert!(s.paused);
    assert_eq!(s.reason, Some(PauseSource::Manual));
    // 锁存期 auto 提议 → 条件记录、reason 不变
    s = s.next(PauseRequest::Pause(PauseSource::Media));
    assert!(s.paused);
    assert_eq!(s.reason, Some(PauseSource::Manual));
    assert!(s.cond.media);
    // Release(Media)（auto 自己恢复）→ 仍 manual 暂停
    s = s.next(PauseRequest::Release(PauseSource::Media));
    assert!(s.paused);
    assert_eq!(s.reason, Some(PauseSource::Manual));
    // Release(Manual) → 全部解除
    s = s.next(PauseRequest::Release(PauseSource::Manual));
    assert!(!s.paused);
    assert_eq!(s.reason, Some(PauseSource::Manual), "sticky=最近释放源");
}

#[test]
fn interval_recording_advances_seq_and_slot() {
    // Arrange
    let p = SessionPause::default();
    // Act：捕获线程登记一个完成的物理暂停区间
    p.record_interval(PauseInterval { pause_ms: 1000, resume_ms: 1000, source: PauseSource::Media });
    // Assert：seq 推进 + 槽可读（loop 补偿事件数据源）
    assert_eq!(p.completed_intervals(), 1);
    let slot = p.edge_interval().unwrap();
    assert_eq!(slot.pause_ms, 1000);
    assert_eq!(slot.resume_ms, 1000);
    assert_eq!(slot.source, PauseSource::Media);
    // 新区间覆盖旧槽
    p.record_interval(PauseInterval { pause_ms: 5000, resume_ms: 5000, source: PauseSource::Manual });
    assert_eq!(p.completed_intervals(), 2);
    assert_eq!(p.edge_interval().unwrap().pause_ms, 5000);
}
