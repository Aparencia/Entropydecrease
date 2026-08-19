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
fn builtin_has_all_profiles_with_distinct_kinds() {
    // Arrange/Act
    let profiles = builtin_profiles();
    // Assert：十二档案（五基线 + v0.7.0 七新档案）、标识互异、默认值健全
    assert_eq!(profiles.len(), 12);
    let mut kinds: Vec<ProfileKind> = profiles.iter().map(|p| p.kind).collect();
    kinds.sort_by_key(|k| format!("{:?}", k));
    kinds.dedup();
    assert_eq!(kinds.len(), 12, "十二档案标识必须互异");
    for p in &profiles {
        assert!(p.sampling_budget.subtitle_every >= 1, "{:?} 字幕区间隔 >=1", p.kind);
        assert!(p.sampling_budget.full_every >= 1, "{:?} 全帧间隔 >=1", p.kind);
        assert!((0.0..=1.0).contains(&p.signal_weights.ocr_weight));
        assert!((0.0..=1.0).contains(&p.signal_weights.asr_weight));
        // REQ-130：disable_ocr/disable_asr 必须显式声明（serde 缺省 false 仅兼容旧 JSON）
        assert!(!p.disable_asr, "{:?} 本版无档案声明禁用 ASR", p.kind);
    }
}

#[test]
fn profile_by_kind_returns_matching_and_defaults() {
    // Act：查各档案 + 未知标识回退
    assert_eq!(profile_by_kind(ProfileKind::Meeting).kind, ProfileKind::Meeting);
    assert_eq!(profile_by_kind(ProfileKind::HandsOn).artifact_template, ArtifactTemplate::StepCards);
    // Assert：Unknown 无内置档案 → 回退 Lecture 默认配置（管线不阻断、零回归）
    assert_eq!(profile_by_kind(ProfileKind::Unknown).kind, ProfileKind::Lecture);
    assert_eq!(profile_by_kind(ProfileKind::Unknown).artifact_template, ArtifactTemplate::LectureNotes);
    // Assert：未知标识回退 Lecture（默认档案不阻断）
    assert_eq!(profile_by_kind(ProfileKind::Lecture).kind, ProfileKind::Lecture);
}

#[test]
fn profile_kind_parse_and_label() {
    // Act：前端 kebab-case 解析（五基线 + v0.7.0 七新档案）
    assert_eq!(ProfileKind::parse("hands-on"), ProfileKind::HandsOn);
    assert_eq!(ProfileKind::parse("talking-head"), ProfileKind::TalkingHead);
    assert_eq!(ProfileKind::parse("interview"), ProfileKind::Interview);
    assert_eq!(ProfileKind::parse("meeting"), ProfileKind::Meeting);
    assert_eq!(ProfileKind::parse("podcast"), ProfileKind::Podcast);
    assert_eq!(ProfileKind::parse("live"), ProfileKind::Live);
    assert_eq!(ProfileKind::parse("whiteboard"), ProfileKind::Whiteboard);
    assert_eq!(ProfileKind::parse("game-tutorial"), ProfileKind::GameTutorial);
    assert_eq!(ProfileKind::parse("exercise"), ProfileKind::Exercise);
    assert_eq!(ProfileKind::parse("follow-along"), ProfileKind::FollowAlong);
    assert_eq!(ProfileKind::parse("coding"), ProfileKind::Coding);
    // v0.7.1：未知标识（前端「未知」选项）解析为 Unknown
    assert_eq!(ProfileKind::parse("unknown"), ProfileKind::Unknown);
    // Assert：非法值回退 Lecture（默认档案不阻断）
    assert_eq!(ProfileKind::parse(""), ProfileKind::Lecture);
    assert_eq!(ProfileKind::parse("no-such-kind"), ProfileKind::Lecture);
    // 展示名非空（全部十三档案）
    for k in [
        ProfileKind::Lecture, ProfileKind::HandsOn, ProfileKind::TalkingHead,
        ProfileKind::Interview, ProfileKind::Meeting, ProfileKind::Podcast,
        ProfileKind::Live, ProfileKind::Whiteboard, ProfileKind::GameTutorial,
        ProfileKind::Exercise, ProfileKind::FollowAlong, ProfileKind::Coding,
        ProfileKind::Unknown,
    ] {
        assert!(!k.label().is_empty(), "{:?} 展示名非空", k);
    }
    // Unknown 的标识串往返一致（会话 profile 列落库/读取同口径）
    assert_eq!(ProfileKind::parse(ProfileKind::Unknown.as_str()), ProfileKind::Unknown);
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
fn detect_no_signal_returns_unknown_needs_confirmation() {
    // Arrange：全空信号
    let s = signals();
    // Act
    let result = vote_detect(&s);
    // Assert：v0.7.1 无法自动识别 → Unknown 单候选 + 必须确认（诚实未知，不猜默认）
    assert_eq!(result.candidates.len(), 1);
    assert_eq!(result.candidates[0].kind, ProfileKind::Unknown);
    assert!(result.needs_confirmation);
}

#[test]
fn detect_strong_signal_no_confirmation_needed() {
    // Arrange：网课标题 3 个关键词命中（"课程"+"网课"+"教学"=6 分）> 阈值
    // 注：v0.7.0 新增编程档案后 "Python 教程课程" 与 Coding 冲突（Python+教程）
    //     是真实歧义（编程课 vs 网课）——此处改用无歧义强网课信号
    let s = ObservedSignals { title: Some("高等数学 微积分课程 网课教学".into()), ..signals() };
    // Act
    let result = vote_detect(&s);
    // Assert：高分且无冲突不打扰用户（静默生效可改）
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

// ── v0.7.2（REQ-152）：系列（合集）检测联动 ──

#[test]
fn detect_series_episodes_vote_consistently() {
    // Arrange：同一系列不同集号（标题不同——P1/P5；系列名无档案关键词）
    let p1 = ObservedSignals { title: Some("零基础化妆 P1".into()), ..signals() };
    let p5 = ObservedSignals { title: Some("零基础化妆 P5".into()), ..signals() };
    // Act
    let r1 = vote_detect(&p1);
    let r5 = vote_detect(&p5);
    // Assert：剥离系列名后投票一致（跨集不漂移）；系列名无关键词 → 诚实 Unknown
    assert_eq!(r1.candidates, r5.candidates);
    assert_eq!(r1.candidates[0].kind, ProfileKind::Unknown);
}

#[test]
fn detect_series_vote_uses_series_name() {
    // Arrange：系列名含课程关键词（"课程"×2 分）——各集都应命中 Lecture
    let p1 = ObservedSignals { title: Some("高等数学课程 P1".into()), ..signals() };
    let p7 = ObservedSignals { title: Some("高等数学课程 P7".into()), ..signals() };
    // Act/Assert：两集候选一致且首位 Lecture
    let r1 = vote_detect(&p1);
    let r7 = vote_detect(&p7);
    assert_eq!(r1.candidates, r7.candidates);
    assert_eq!(r1.candidates[0].kind, ProfileKind::Lecture);
}

#[test]
fn memory_series_key_cross_episode_hits() {
    // Arrange：P3 确认实操 → 存系列键
    let mut memory = ProfileMemory::default();
    memory.remember("零基础化妆教程 P3", ProfileKind::HandsOn);
    // Assert：键已剥离序号为系列名 + is_series 标记
    assert_eq!(memory.entries.len(), 1);
    assert_eq!(memory.entries[0].keyword, "零基础化妆教程");
    assert!(memory.entries[0].is_series);
    // Act：P5 与带平台后缀的 P1 查询
    // Assert：同系列跨集直接命中（选一次整系列生效）
    assert_eq!(memory.lookup("零基础化妆教程 P5"), Some(ProfileKind::HandsOn));
    assert_eq!(
        memory.lookup("零基础化妆教程 P1_哔哩哔哩_bilibili"),
        Some(ProfileKind::HandsOn)
    );
    // 非系列标题不误命中（"入门篇" 含系列名为子串属 contains 语义——用无关标题断言）
    assert_eq!(memory.lookup("化妆技巧分享"), None);
    assert_eq!(memory.lookup("产品周会-评审"), None);
}

#[test]
fn memory_series_key_old_json_compat() {
    // Arrange：旧格式 JSON（无 is_series 字段）
    let raw = r#"{"entries":[{"keyword":"网课","kind":"lecture"}]}"#;
    // Act：解析
    let memory: ProfileMemory = serde_json::from_str(raw).unwrap();
    // Assert：is_series 缺省 false（零回归）；lookup 仍可用
    assert_eq!(memory.entries.len(), 1);
    assert!(!memory.entries[0].is_series);
    assert_eq!(memory.lookup("网课-数学"), Some(ProfileKind::Lecture));
}

#[test]
fn memory_series_roundtrip_preserves_flag() {
    // Arrange
    let mut memory = ProfileMemory::default();
    memory.remember("零基础化妆教程 P3", ProfileKind::HandsOn);
    // Act：序列化 → 反序列化
    let raw = serde_json::to_string(&memory).unwrap();
    let back: ProfileMemory = serde_json::from_str(&raw).unwrap();
    // Assert：系列键与标记无损
    assert_eq!(back, memory);
    assert_eq!(back.lookup("零基础化妆教程 P9"), Some(ProfileKind::HandsOn));
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

// ── v0.7.0 M2：七新档案注册断言 ──

#[test]
fn podcast_profile_is_asr_only() {
    // Arrange/Act：播客/有声书档案（REQ-122 T8）
    let p = profile_by_kind(ProfileKind::Podcast);
    // Assert：ASR-only 快速路径——全帧几乎不采样、OCR 权重 0、ASR 全投
    assert!(p.detect_signals.title_keywords.iter().any(|k| k == "播客"), "关键词含播客");
    assert!(p.detect_signals.title_keywords.iter().any(|k| k == "有声书"), "关键词含有声书");
    assert_eq!(p.sampling_budget.full_every, 999, "播客全帧几乎不采样");
    assert_eq!(p.sampling_budget.silent_full_every, 999, "播客静音期全帧也不采样");
    assert!((p.signal_weights.ocr_weight - 0.0).abs() < 1e-6, "播客 OCR 权重为 0（纯语音）");
    assert!((p.signal_weights.asr_weight - 1.0).abs() < 1e-6, "播客 ASR 全投");
    assert_eq!(p.artifact_template, ArtifactTemplate::Summary, "播客摘要文复用口播模板");
    assert_eq!(p.storage_tier, StoreTier::TextFirst, "播客文本优先档");
}

#[test]
fn disable_ocr_flags_follow_profile() {
    // Arrange/Act：REQ-130 P4 无图短路声明
    let podcast = profile_by_kind(ProfileKind::Podcast);
    let live = profile_by_kind(ProfileKind::Live);
    let lecture = profile_by_kind(ProfileKind::Lecture);
    // Assert：播客/直播 disable_ocr=true（纯语音/无 OCR 裁决）；网课 false（零回归）
    assert!(podcast.disable_ocr, "播客跳过画面链（P4 内存收益）");
    assert!(live.disable_ocr, "直播不做 OCR（裁决）");
    assert!(!lecture.disable_ocr, "网课保留画面链");
}

#[test]
fn image_stream_profiles_registered() {
    // Arrange/Act：REQ-124 图像流档案组 + REQ-123 跟练
    let whiteboard = profile_by_kind(ProfileKind::Whiteboard);
    let game = profile_by_kind(ProfileKind::GameTutorial);
    let exercise = profile_by_kind(ProfileKind::Exercise);
    let follow = profile_by_kind(ProfileKind::FollowAlong);
    let coding = profile_by_kind(ProfileKind::Coding);
    // Assert：图像优先档（REQ-110 时间轴图像流消费）；画面高频采样
    for p in [&whiteboard, &game, &exercise, &follow, &coding] {
        assert_eq!(p.storage_tier, StoreTier::ImageFirst, "{:?} 图像优先档", p.kind);
        assert!(!p.disable_ocr, "{:?} 图像流档案保留画面链", p.kind);
        assert!(p.sampling_budget.full_every <= 3, "{:?} 全帧高频", p.kind);
    }
    // 白板/跟练画面就是主体：全帧每拍采样（full_every=1）
    assert_eq!(whiteboard.sampling_budget.full_every, 1, "白板画面=主体，全帧每拍");
    assert_eq!(follow.sampling_budget.full_every, 1, "跟练画面=主体，全帧每拍");
    // 关键预算：白板静音期仍高频；游戏/题目 ASR 全投
    assert_eq!(whiteboard.sampling_budget.silent_full_every, 1);
    assert!((game.signal_weights.asr_weight - 1.0).abs() < 1e-6);
    assert!((exercise.signal_weights.asr_weight - 1.0).abs() < 1e-6);
}

#[test]
fn coding_profile_registered_with_glossary() {
    // Arrange/Act：REQ-121 编程实战
    let coding = profile_by_kind(ProfileKind::Coding);
    // Assert：OCR+ASR 双通道 + 术语表开（变量/函数名进热词通道）
    assert!(coding.detect_signals.title_keywords.iter().any(|k| k == "编程"));
    assert!((coding.signal_weights.ocr_weight - 1.0).abs() < 1e-6);
    assert!(coding.postprocess_rules.glossary, "编程档案开术语表");
    assert!(coding.postprocess_rules.step_cards, "编程档案开步骤卡（M5 代码 diff 步骤卡）");
    assert_eq!(coding.artifact_template, ArtifactTemplate::LectureNotes);
}

#[test]
fn detect_new_profiles_by_title_keywords() {
    // Arrange：新档案标题信号
    let podcast = ObservedSignals { title: Some("睡前听书播客".into()), ..signals() };
    let follow = ObservedSignals { title: Some("瑜伽跟练".into()), ..signals() };
    let coding = ObservedSignals { title: Some("Python 编程实战教程".into()), ..signals() };
    let live = ObservedSignals { title: Some("游戏直播开播".into()), ..signals() };
    // Act/Assert：各新档案凭标题关键词夺冠
    assert_eq!(vote_detect(&podcast).candidates[0].kind, ProfileKind::Podcast);
    assert_eq!(vote_detect(&follow).candidates[0].kind, ProfileKind::FollowAlong);
    assert_eq!(vote_detect(&coding).candidates[0].kind, ProfileKind::Coding);
    assert_eq!(vote_detect(&live).candidates[0].kind, ProfileKind::Live);
}
