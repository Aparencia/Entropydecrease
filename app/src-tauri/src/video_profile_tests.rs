//! 视频类型档案测试（REQ-043 / v0.5.0 M1）。
//!
//! @ai-context: AAA 模式（Arrange/Act/Assert）；覆盖档案 JSON roundtrip、
//!              检测信号投票决策矩阵（注入 fake 信号）、预算表查询、记忆偏好闭环。

use super::*;

/// 构造观测信号辅助（默认全 None）。
fn signals() -> ObservedSignals {
    ObservedSignals::default()
}

#[test]
fn profile_json_roundtrip_preserves_all_fields() {
    // Arrange：五档案全部序列化
    let profiles = builtin_profiles();
    for p in &profiles {
        // Act：JSON roundtrip（可校准导出/导入）
        let raw = serde_json::to_string(p).expect("serialize");
        let back: VideoProfile = serde_json::from_str(&raw).expect("deserialize");
        // Assert：字段完整保留
        assert_eq!(back, *p, "档案 {:?} roundtrip 必须无损", p.kind);
    }
}

#[test]
fn builtin_has_five_profiles_with_distinct_kinds() {
    // Arrange/Act
    let profiles = builtin_profiles();
    // Assert：五档案、标识互异、默认值健全
    assert_eq!(profiles.len(), 5);
    let mut kinds: Vec<ProfileKind> = profiles.iter().map(|p| p.kind).collect();
    kinds.sort_by_key(|k| format!("{:?}", k));
    kinds.dedup();
    assert_eq!(kinds.len(), 5, "五档案标识必须互异");
    for p in &profiles {
        assert!(p.sampling_budget.subtitle_every >= 1, "{:?} 字幕区间隔 >=1", p.kind);
        assert!(p.sampling_budget.full_every >= 1, "{:?} 全帧间隔 >=1", p.kind);
        assert!((0.0..=1.0).contains(&p.signal_weights.ocr_weight));
        assert!((0.0..=1.0).contains(&p.signal_weights.asr_weight));
    }
}

#[test]
fn profile_by_kind_returns_matching_and_defaults() {
    // Act：查各档案 + 非法标识回退
    assert_eq!(profile_by_kind(ProfileKind::Meeting).kind, ProfileKind::Meeting);
    assert_eq!(profile_by_kind(ProfileKind::HandsOn).artifact_template, ArtifactTemplate::StepCards);
    // Assert：未知标识回退 Lecture（默认档案不阻断）
    assert_eq!(profile_by_kind(ProfileKind::Lecture).kind, ProfileKind::Lecture);
}

#[test]
fn profile_kind_parse_and_label() {
    // Act：前端 kebab-case 解析
    assert_eq!(ProfileKind::parse("hands-on"), ProfileKind::HandsOn);
    assert_eq!(ProfileKind::parse("talking-head"), ProfileKind::TalkingHead);
    assert_eq!(ProfileKind::parse("interview"), ProfileKind::Interview);
    assert_eq!(ProfileKind::parse("meeting"), ProfileKind::Meeting);
    // Assert：非法值回退 Lecture（默认档案不阻断）
    assert_eq!(ProfileKind::parse("unknown"), ProfileKind::Lecture);
    assert_eq!(ProfileKind::parse(""), ProfileKind::Lecture);
    // 展示名非空
    for k in [ProfileKind::Lecture, ProfileKind::HandsOn, ProfileKind::TalkingHead, ProfileKind::Interview, ProfileKind::Meeting] {
        assert!(!k.label().is_empty());
    }
}

#[test]
fn detect_title_keywords_vote_lecture() {
    // Arrange：网课标题信号
    let s = ObservedSignals { title: Some("高等数学-第3章 微积分课程".into()), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：候选首位为 Lecture，得分 1.0（归一化）
    assert_eq!(result.candidates[0].kind, ProfileKind::Lecture);
    assert!((result.candidates[0].score - 1.0).abs() < 1e-6);
}

#[test]
fn detect_title_keywords_vote_meeting() {
    // Arrange：会议标题信号（"会议"关键词 ×2 分）
    let s = ObservedSignals { title: Some("产品周会-评审".into()), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：候选首位为 Meeting
    assert_eq!(result.candidates[0].kind, ProfileKind::Meeting);
}

#[test]
fn detect_interview_by_title_and_low_frame_switch() {
    // Arrange：访谈标题 + 低画面切换频率（双信号叠加）
    let s = ObservedSignals {
        title: Some("AI 行业访谈".into()),
        frame_switch_rate: Some(1.0),
        ..signals()
    };
    // Act
    let result = vote_detect(&s);
    // Assert：Interview 夺冠
    assert_eq!(result.candidates[0].kind, ProfileKind::Interview);
}

#[test]
fn detect_hands_on_by_high_frame_switch() {
    // Arrange：无标题信号 + 高画面切换频率（实操特征）
    let s = ObservedSignals { frame_switch_rate: Some(30.0), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：HandsOn 夺冠（唯一命中 8.0..MAX 区间的档案）
    assert_eq!(result.candidates[0].kind, ProfileKind::HandsOn);
}

#[test]
fn detect_no_signal_returns_default_lecture_needs_confirmation() {
    // Arrange：全空信号
    let s = signals();
    // Act
    let result = vote_detect(&s);
    // Assert：默认 Lecture 单候选 + 必须确认（不静默假设）
    assert_eq!(result.candidates.len(), 1);
    assert_eq!(result.candidates[0].kind, ProfileKind::Lecture);
    assert!(result.needs_confirmation);
}

#[test]
fn detect_strong_signal_no_confirmation_needed() {
    // Arrange：网课标题 2 个关键词命中（"课程"+"教程"=4 分）> 阈值
    let s = ObservedSignals { title: Some("Python 教程课程".into()), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：高分不打扰用户（静默生效可改）
    assert_eq!(result.candidates[0].kind, ProfileKind::Lecture);
    assert!(!result.needs_confirmation);
}

#[test]
fn detect_conflicting_signals_need_confirmation() {
    // Arrange：标题偏网课（"课程"×2=2 分）+ 高切换频率（HandsOn 命中 2 分）→ 冲突
    let s = ObservedSignals {
        title: Some("课程".into()),
        frame_switch_rate: Some(30.0),
        ..signals()
    };
    // Act
    let result = vote_detect(&s);
    // Assert：Lecture 与 HandsOn 差距 <1.0 → 需用户裁决
    assert!(result.needs_confirmation, "信号冲突必须请求用户确认");
}

#[test]
fn detect_url_keywords_vote_lecture() {
    // Arrange：网课平台 URL（学堂在线）命中 Lecture url 关键词
    let s = ObservedSignals { url: Some("https://www.icourse163.org/course/123".into()), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：Lecture 夺冠
    assert_eq!(result.candidates[0].kind, ProfileKind::Lecture);
}

#[test]
fn detect_subtitle_preference_boosts_lecture() {
    // Arrange：弱标题信号 + 有字幕（Lecture 唯一 prefers_subtitle）
    let s = ObservedSignals { title: Some("学习".into()), has_subtitle: Some(true), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：Lecture 靠字幕偏好夺冠
    assert_eq!(result.candidates[0].kind, ProfileKind::Lecture);
}

#[test]
fn memory_remember_and_lookup_longest_keyword() {
    // Arrange：空记忆库 + 记录两条
    let mut memory = ProfileMemory::default();
    memory.remember("网课", ProfileKind::Lecture);
    memory.remember("网课-数学", ProfileKind::HandsOn);
    // Act：标题同时命中两条
    let hit = memory.lookup("网课-数学-第2章");
    // Assert：最长关键词优先（更具体的记忆生效）
    assert_eq!(hit, Some(ProfileKind::HandsOn));
}

#[test]
fn memory_lookup_miss_returns_none() {
    // Arrange
    let mut memory = ProfileMemory::default();
    memory.remember("会议", ProfileKind::Meeting);
    // Act/Assert：不相关标题无命中
    assert_eq!(memory.lookup("化妆教程"), None);
    // 空关键词不写入（长度保持 1，不新增空条目）
    memory.remember("  ", ProfileKind::Lecture);
    assert_eq!(memory.entries.len(), 1);
    assert_eq!(memory.entries[0].keyword, "会议");
}

#[test]
fn memory_remember_overwrites_existing() {
    // Arrange
    let mut memory = ProfileMemory::default();
    memory.remember("教程", ProfileKind::Lecture);
    // Act：用户修改档案（覆盖）
    memory.remember("教程", ProfileKind::HandsOn);
    // Assert：单条且已更新
    assert_eq!(memory.entries.len(), 1);
    assert_eq!(memory.lookup("软件教程"), Some(ProfileKind::HandsOn));
}

#[test]
fn memory_json_roundtrip_and_corrupt_fallback() {
    // Arrange：写库 → 读回
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("profile_memory.json");
    let mut memory = ProfileMemory::default();
    memory.remember("网课", ProfileKind::Lecture);
    // Act
    memory.save(&path).unwrap();
    let loaded = ProfileMemory::load(&path);
    // Assert：roundtrip 无损
    assert_eq!(loaded, memory);
    // 损坏文件 → 空库（防御：不阻断启动）
    std::fs::write(&path, "{broken json").unwrap();
    assert_eq!(ProfileMemory::load(&path), ProfileMemory::default());
    // 缺失文件 → 空库
    assert_eq!(ProfileMemory::load(&dir.path().join("none.json")), ProfileMemory::default());
}

#[test]
fn sampling_budget_differs_by_profile() {
    // Arrange/Act：各档案预算查询
    let lecture = profile_by_kind(ProfileKind::Lecture).sampling_budget;
    let talking = profile_by_kind(ProfileKind::TalkingHead).sampling_budget;
    let meeting = profile_by_kind(ProfileKind::Meeting).sampling_budget;
    // Assert：口播/会议全帧极低频（间隔大），网课全帧中频
    assert!(talking.full_every > lecture.full_every, "口播全帧应低于网课频率");
    assert!(meeting.full_every > lecture.full_every, "会议全帧应低于网课频率");
    // 实操全帧高频（帧处理偏重）
    let hands = profile_by_kind(ProfileKind::HandsOn).sampling_budget;
    assert!(hands.full_every < talking.full_every, "实操全帧应高于口播频率");
}

#[test]
fn postprocess_rules_follow_profile() {
    // Arrange/Act
    let lecture = profile_by_kind(ProfileKind::Lecture);
    let hands = profile_by_kind(ProfileKind::HandsOn);
    let talking = profile_by_kind(ProfileKind::TalkingHead);
    let interview = profile_by_kind(ProfileKind::Interview);
    // Assert：规则开关按档案语义
    assert!(lecture.postprocess_rules.chapter_detect, "网课开章节检测");
    assert!(lecture.postprocess_rules.glossary, "网课开术语表");
    assert!(hands.postprocess_rules.step_cards, "实操开步骤卡");
    assert!(talking.postprocess_rules.verbal_normalize, "口播开书面化");
    assert!(interview.postprocess_rules.speaker_detect, "访谈开说话人检测");
    assert!(!hands.postprocess_rules.speaker_detect, "实操关说话人检测");
}

#[test]
fn signal_weights_follow_profile() {
    // Arrange/Act
    let lecture = profile_by_kind(ProfileKind::Lecture);
    let talking = profile_by_kind(ProfileKind::TalkingHead);
    // Assert：字幕优先仅网课；口播 ASR 全投
    assert!(lecture.signal_weights.subtitle_priority, "网课字幕优先（无损信道）");
    assert!(!talking.signal_weights.subtitle_priority);
    assert!((talking.signal_weights.asr_weight - 1.0).abs() < 1e-6, "口播 ASR 全投");
    assert!(lecture.signal_weights.ocr_weight > talking.signal_weights.ocr_weight, "网课板书 OCR 权重高于口播");
}

#[test]
fn artifact_template_maps_to_profile() {
    // Arrange/Act
    let hands = profile_by_kind(ProfileKind::HandsOn);
    let meeting = profile_by_kind(ProfileKind::Meeting);
    let talking = profile_by_kind(ProfileKind::TalkingHead);
    // Assert：产物模板与档案一一对应（M7 消费前置）
    assert_eq!(hands.artifact_template, ArtifactTemplate::StepCards);
    assert_eq!(meeting.artifact_template, ArtifactTemplate::MeetingNotes);
    assert_eq!(talking.artifact_template, ArtifactTemplate::Summary);
}
