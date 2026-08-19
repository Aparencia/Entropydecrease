//! 抢话/打断检测单测（REQ-127 M6 / v0.7.0 M2；AAA 模式，合成序列）。
//!
//! @ai-context: 由 interruption_detect.rs 以 #[cfg(test)] #[path] 引入；
//!              合成正常对话/快接高音量/抑制序列，不依赖真实音频样本
//!              （精度基线标注留真机圆桌样本）。

use super::*;

#[test]
fn normal_conversation_no_event() {
    // Arrange：正常对话（间隔充足，音量平稳）
    let mut det = InterruptionDetector::new();
    // Act
    let e1 = det.observe("第一句", 0, Some(0.3));
    let e2 = det.observe("第二句", 3000, Some(0.35));
    let e3 = det.observe("第三句", 6000, Some(0.32));
    // Assert：无打断（gap 长 + 无骤变）
    assert!(e1.is_none() && e2.is_none() && e3.is_none());
}

#[test]
fn quick_follow_with_surge_triggers() {
    // Arrange：先落一条 Final 作"上一条"
    let mut det = InterruptionDetector::new();
    det.observe("上一位发言", 1000, Some(0.3));
    // Act：300ms 后音量 0.3 → 0.6（+0.3 ≥ 0.25）
    let e = det.observe("抢话!", 1300, Some(0.6));
    // Assert：疑似打断（代理置信度固定 0.5）
    let ev = e.expect("快接+骤变应触发打断");
    assert_eq!(ev.time_ms, 1300);
    assert_eq!(ev.confidence, 0.5);
}

#[test]
fn quick_follow_without_surge_no_event() {
    // Arrange：快接但音量平稳（可能是正常连续发言）
    let mut det = InterruptionDetector::new();
    det.observe("第一句", 1000, Some(0.5));
    // Act
    let e = det.observe("第二句", 1300, Some(0.5));
    // Assert：无骤变 → 不判打断
    assert!(e.is_none());
}

#[test]
fn long_gap_no_event() {
    // Arrange：音量骤变但间隔长（>800ms）
    let mut det = InterruptionDetector::new();
    det.observe("第一句", 1000, Some(0.3));
    // Act：2s 后音量骤升
    let e = det.observe("第二句", 3000, Some(0.7));
    // Assert：gap 超阈值 → 不判（可能是新话题开场，非抢话）
    assert!(e.is_none());
}

#[test]
fn suppression_blocks_repeat_within_window() {
    // Arrange：连续快接高音量序列
    let mut det = InterruptionDetector::new();
    det.observe("A", 0, Some(0.3));
    // Act：300ms 触发第一次
    let first = det.observe("B", 300, Some(0.6));
    assert!(first.is_some(), "首次快接+骤变应触发");
    // Act：2000ms（距上次触发 1700ms < 2s）快接+骤变 → 抑制
    let repeat = det.observe("C", 2000, Some(0.7));
    assert!(repeat.is_none(), "触发后 ±2s 内应抑制重复");
    // Act：2500ms（距上次触发 2200ms > 2s；距 C 500ms + 骤变）→ 允许再次触发
    let again = det.observe("D", 2500, Some(0.95));
    assert!(again.is_some(), "抑制窗口外应允许再次触发");
}

#[test]
fn no_volume_never_triggers() {
    // Arrange：volume=None 序列（无语音块/旧数据）
    let mut det = InterruptionDetector::new();
    // Act
    let e1 = det.observe("无音量", 0, None);
    let e2 = det.observe("仍无音量", 200, None);
    // Assert：无能量证据 → 不触发（诚实：无证据不判）
    assert!(e1.is_none() && e2.is_none());
}

#[test]
fn confidence_is_proxy_fixed() {
    // Arrange：触发场景
    let mut det = InterruptionDetector::new();
    det.observe("A", 0, Some(0.2));
    // Act
    let ev = det.observe("B", 300, Some(0.6)).expect("快接+骤变应触发");
    // Assert：代理置信度固定 0.5（诚实标注无讲者信息）
    assert_eq!(ev.confidence, 0.5);
}
