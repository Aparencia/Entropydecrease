//! 视频档案混合检测四象限测试（v0.11.5 Task 5：检测优先 + 记忆兜底 + 冲突以检测为准）。
//!
//! @ai-context: AAA 模式；注入 fake signals + fake ProfileMemory 驱动
//!              vote_detect → apply_profile_memory 全链路（纯函数，无 tauri state）。
//! @ai-context: 四象限矩阵：
//!              ① 记忆命中 + 检测高置信且同 kind → 记忆生效（快路径，无确认）
//!              ② 记忆命中 + 检测高置信但冲突 → 检测为准 + memory_conflict 标记
//!              ③ 记忆命中 + 检测低置信/冲突 → 记忆生效（用户先验 > 弱证据）
//!              ④ 无记忆 → 纯检测

use crate::video_profile::{
    apply_profile_memory, vote_detect, DetectResult, ObservedSignals, ProfileCandidate,
    ProfileKind, ProfileMemory,
};
use crate::video_profile_spec::ContentForm;

/// 构造观测信号辅助（默认全 None）。
fn signals() -> ObservedSignals {
    ObservedSignals::default()
}

/// 强网课信号（标题三关键词 6 分 > 阈值且无冲突 → 高置信 Lecture）。
fn strong_lecture_signals() -> ObservedSignals {
    ObservedSignals { title: Some("高等数学 微积分课程 网课教学".into()), ..signals() }
}

/// 强实操信号（"实操演练"标题 4 分 + 帧率 30 命中 2 分 → 高置信 HandsOn）。
fn strong_hands_on_signals() -> ObservedSignals {
    ObservedSignals { title: Some("实操演练".into()), frame_switch_rate: Some(30.0), ..signals() }
}

/// 象限①：记忆命中 + 检测高置信且同 kind → 记忆生效（快路径，无确认）。
#[test]
fn quadrant1_high_conf_same_kind_memory_wins() {
    // Arrange：强网课信号（高置信 Lecture）+ 记忆同为 Lecture
    let memory = {
        let mut m = ProfileMemory::default();
        m.remember("高等数学", ProfileKind::Lecture);
        m
    };
    // Act：检测 → 记忆后置判定
    let result = apply_profile_memory(vote_detect(&strong_lecture_signals()), &memory, "高等数学 微积分课程 网课教学");
    // Assert：记忆生效——单候选 + 无需确认 + 命中标记 + 形态记忆（REQ-188）
    assert_eq!(result.candidates, vec![ProfileCandidate { kind: ProfileKind::Lecture, score: 1.0 }]);
    assert!(!result.needs_confirmation, "记忆生效无需确认");
    assert_eq!(result.memory_hit, Some(ProfileKind::Lecture));
    assert_eq!(result.memory_conflict, None, "同 kind 无冲突标记");
    assert_eq!(result.memory_form, Some(ContentForm::Lecture), "形态记忆生效");
}

/// 象限②：记忆命中 + 检测高置信但冲突 → 检测为准 + 标记 memory_conflict。
#[test]
fn quadrant2_high_conf_conflict_detection_wins() {
    // Arrange：强实操信号（高置信 HandsOn）+ 记忆为 Lecture（用户上次裁决冲突）
    let memory = {
        let mut m = ProfileMemory::default();
        m.remember("实操演练", ProfileKind::Lecture);
        m
    };
    // Act
    let result = apply_profile_memory(vote_detect(&strong_hands_on_signals()), &memory, "实操演练");
    // Assert：检测为准——候选保持检测结果；冲突记忆被标记；不设 memory_hit/form
    assert_eq!(result.candidates[0].kind, ProfileKind::HandsOn, "冲突以检测为准");
    assert!(!result.needs_confirmation, "高置信检测维持无需确认");
    assert_eq!(result.memory_conflict, Some(ProfileKind::Lecture), "标记冲突记忆");
    assert_eq!(result.memory_hit, None, "冲突时记忆不生效（不设命中）");
    assert_eq!(result.memory_form, None, "检测为准时形态不来自记忆");
}

/// 象限③：记忆命中 + 检测低置信/冲突 → 记忆生效（用户先验 > 弱证据）。
#[test]
fn quadrant3_low_conf_memory_wins() {
    // Arrange：弱冲突信号（"课程"标题 2 分 + 帧率 30 实操 2 分 → 需确认）+ 记忆 Lecture
    let s = ObservedSignals { title: Some("课程".into()), frame_switch_rate: Some(30.0), ..signals() };
    assert!(vote_detect(&s).needs_confirmation, "前置条件：信号冲突需确认");
    let memory = {
        let mut m = ProfileMemory::default();
        m.remember("课程", ProfileKind::Lecture);
        m
    };
    // Act
    let result = apply_profile_memory(vote_detect(&s), &memory, "课程");
    // Assert：记忆生效——覆盖弱检测 + 无需确认 + 命中标记
    assert_eq!(result.candidates, vec![ProfileCandidate { kind: ProfileKind::Lecture, score: 1.0 }]);
    assert!(!result.needs_confirmation, "记忆生效无需确认");
    assert_eq!(result.memory_hit, Some(ProfileKind::Lecture));
    assert_eq!(result.memory_conflict, None);
    assert_eq!(result.memory_form, Some(ContentForm::Lecture));
}

/// 象限③边界：无信号（Unknown 单候选 + 需确认）+ 记忆 → 记忆兜底生效。
#[test]
fn no_signal_memory_fallback_wins() {
    // Arrange：标题无任何档案关键词（全部 0 分 → Unknown + 需确认）+ 记忆 Lecture
    let s = ObservedSignals { title: Some("某无关标题".into()), ..signals() };
    let base = vote_detect(&s);
    assert_eq!(base.candidates[0].kind, ProfileKind::Unknown);
    assert!(base.needs_confirmation, "前置条件：无信号需确认");
    let memory = {
        let mut m = ProfileMemory::default();
        m.remember("某无关标题", ProfileKind::Lecture);
        m
    };
    // Act
    let result = apply_profile_memory(base, &memory, "某无关标题");
    // Assert：用户先验 > 无证据——记忆生效
    assert_eq!(result.candidates[0].kind, ProfileKind::Lecture);
    assert!(!result.needs_confirmation);
    assert_eq!(result.memory_hit, Some(ProfileKind::Lecture));
    assert_eq!(result.memory_conflict, None);
}

/// 象限④：无记忆 → 纯检测（结果原样，零改动）。
#[test]
fn quadrant4_no_memory_pure_detection() {
    // Arrange：强网课信号 + 空记忆库
    let base = vote_detect(&strong_lecture_signals());
    // Act
    let result = apply_profile_memory(base.clone(), &ProfileMemory::default(), "高等数学 微积分课程 网课教学");
    // Assert：与纯检测结果完全一致
    assert_eq!(result, base, "无记忆时结果零改动");
    assert_eq!(result.memory_hit, None);
    assert_eq!(result.memory_conflict, None);
}

/// 象限①回归（REQ-152 系列键）：强网课系列跨集 + 系列记忆同 kind → 记忆生效。
#[test]
fn quadrant1_series_key_cross_episode_memory_wins() {
    // Arrange：P1 确认 Lecture → 存系列键；P5 强网课信号（剥系列名后高置信）
    let memory = {
        let mut m = ProfileMemory::default();
        m.remember("高等数学 微积分课程 网课教学 P1", ProfileKind::Lecture);
        m
    };
    assert!(memory.entries[0].is_series, "前置条件：系列键标记");
    let s = ObservedSignals { title: Some("高等数学 微积分课程 网课教学 P5".into()), ..signals() };
    let base = vote_detect(&s);
    assert_eq!(base.candidates[0].kind, ProfileKind::Lecture, "前置条件：强网课信号");
    assert!(!base.needs_confirmation);
    // Act
    let result = apply_profile_memory(base, &memory, "高等数学 微积分课程 网课教学 P5");
    // Assert：系列键跨集命中 → 象限①记忆生效
    assert_eq!(result.memory_hit, Some(ProfileKind::Lecture));
    assert_eq!(result.memory_conflict, None);
    assert_eq!(result.candidates, vec![ProfileCandidate { kind: ProfileKind::Lecture, score: 1.0 }]);
}

/// 纯函数职责边界：apply_profile_memory 不触碰 domain（命令层赋值），冲突标记不改候选得分。
#[test]
fn apply_preserves_domain_and_detection_candidates() {
    // Arrange：强实操信号 + 冲突记忆（Lecture）
    let memory = {
        let mut m = ProfileMemory::default();
        m.remember("实操演练", ProfileKind::Lecture);
        m
    };
    let base = vote_detect(&strong_hands_on_signals());
    // Act
    let result = apply_profile_memory(base.clone(), &memory, "实操演练");
    // Assert：候选列表原样保留（检测为准）；domain 未被触碰（None 保持）
    assert_eq!(result.candidates, base.candidates, "冲突时候选保持检测结果");
    assert_eq!(result.domain, None, "domain 由命令层赋值，纯函数不触碰");
}

/// 旧 JSON 兼容：无 memory_conflict 字段的旧 DetectResult 反序列化 → None（零回归）。
#[test]
fn detect_result_old_json_missing_memory_conflict() {
    // Arrange：v0.11.4 及更早的响应 JSON（无 memory_conflict 字段）
    let raw = r#"{"candidates":[{"kind":"lecture","score":1.0}],"needs_confirmation":false,"memory_hit":null}"#;
    // Act
    let r: DetectResult = serde_json::from_str(raw).unwrap();
    // Assert：缺省 None（serde(default) 兼容旧 JSON）
    assert_eq!(r.memory_conflict, None);
    assert_eq!(r.candidates[0].kind, ProfileKind::Lecture);
}
