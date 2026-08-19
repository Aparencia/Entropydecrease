//! 十二档案内置常量数据（REQ-043 / v0.5.0 M1；v0.7.0 M2 扩展至十二档案）。
//!
//! @ai-context: 与 video_profile.rs 的类型定义分离（保持逻辑文件 ≤300 行，AGENTS.md §3）。
//! @ai-context: 参数依据头脑风暴轮 1/2 五类优化矩阵（采样/权重/后处理/产物）+
//!              v0.7.0 类型轴裁决（T1/T2/T3/T4/T8/T9/T11，见需求裁决表）；
//!              JSON 导出后可由用户/校准流程覆盖（可校准）。
//! @ai-context: 默认值语义：Lecture 与 v0.4.0 现状采样档一致（零回归）；
//!              口播/访谈/会议全帧极低频（画面几乎无信息）；实操全帧高频（操作画面价值高）；
//!              图像流档案（白板/游戏/题目/跟练/编程）全帧高频 + ImageFirst 存储档
//!              （REQ-110 时间轴图像流消费）；播客/直播 disable_ocr=true（REQ-130 短路）。

use crate::video_profile::{
    ArtifactTemplate, DetectSignals, PostprocessRules, ProfileKind, SamplingBudget, SignalWeights,
    StoreTier, VideoProfile,
};

/// 十二档案内置常量（默认值；JSON 导出后可人工校准覆盖）。
pub fn builtin_profiles() -> Vec<VideoProfile> {
    vec![
        VideoProfile {
            kind: ProfileKind::Lecture,
            detect_signals: DetectSignals {
                title_keywords: vec!["课程", "网课", "教程", "课堂", "教学", "MOOC", "公开课", "学习"]
                    .into_iter().map(String::from).collect(),
                url_keywords: vec!["mooc", "icourse", "学堂在线", "腾讯课堂", "网易云课堂", "bilibili", "b23"].into_iter().map(String::from).collect(),
                frame_switch_range: Some((3.0, 20.0)),
                prefers_subtitle: true,
                min_duration_min: Some(10),
            },
            // 低帧率全帧 + 静音期提频捕捉板书（现状默认档，零回归）
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 5, silent_subtitle_every: 4, silent_full_every: 2 },
            signal_weights: SignalWeights { subtitle_priority: true, ocr_weight: 1.0, asr_weight: 0.5 },
            postprocess_rules: PostprocessRules { chapter_detect: true, step_cards: false, verbal_normalize: true, highlight: true, speaker_detect: false, glossary: true },
            artifact_template: ArtifactTemplate::LectureNotes,
            // REQ-110：网课画面价值中（板书要点）——文本优先档零回归
            storage_tier: StoreTier::TextFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        VideoProfile {
            kind: ProfileKind::HandsOn,
            detect_signals: DetectSignals {
                title_keywords: vec!["实操", "实战", "教程", "演练", "跟练", "操作", "案例", "从零"].into_iter().map(String::from).collect(),
                url_keywords: vec!["bilibili", "b23"].into_iter().map(String::from).collect(),
                // 实操画面切换频繁：高帧率区间（变化骤升由 frame_diff 事件驱动）
                frame_switch_range: Some((8.0, f32::MAX)),
                prefers_subtitle: false,
                min_duration_min: Some(5),
            },
            // 关键帧差异化采样：全帧高频（操作画面价值高）
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 2, silent_subtitle_every: 4, silent_full_every: 2 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.9, asr_weight: 0.8 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: true, verbal_normalize: false, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::StepCards,
            // REQ-110：实操画面价值高（操作步骤）——均衡档
            storage_tier: StoreTier::Balanced,
            disable_ocr: false,
            disable_asr: false,
        },
        VideoProfile {
            kind: ProfileKind::TalkingHead,
            detect_signals: DetectSignals {
                title_keywords: vec!["演讲", "分享", "知识", "科普", "TED", "解读", "说"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                // 口播画面几乎无信息：全帧降至最低
                frame_switch_range: Some((0.0, 5.0)),
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 30, silent_subtitle_every: 4, silent_full_every: 30 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.1, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: false, verbal_normalize: true, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::Summary,
            // REQ-110：口播画面几乎无信息——文本优先档
            storage_tier: StoreTier::TextFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        VideoProfile {
            kind: ProfileKind::Interview,
            detect_signals: DetectSignals {
                title_keywords: vec!["访谈", "对话", "播客", "对谈", "专访", "聊天"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: Some((0.0, 5.0)),
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 4, full_every: 60, silent_subtitle_every: 6, silent_full_every: 60 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.1, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: false, verbal_normalize: false, highlight: true, speaker_detect: true, glossary: false },
            artifact_template: ArtifactTemplate::DialogueNotes,
            // REQ-110：访谈画面价值低——文本优先档
            storage_tier: StoreTier::TextFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        VideoProfile {
            kind: ProfileKind::Meeting,
            detect_signals: DetectSignals {
                title_keywords: vec!["会议", "周会", "汇报", "评审", "例会", "复盘", "同步", "站会"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: Some((0.0, 5.0)),
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 4, full_every: 60, silent_subtitle_every: 6, silent_full_every: 60 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.3, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: false, verbal_normalize: false, highlight: true, speaker_detect: true, glossary: false },
            artifact_template: ArtifactTemplate::MeetingNotes,
            // REQ-110：会议画面价值低（投屏纪要除外）——文本优先档
            storage_tier: StoreTier::TextFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        // ── v0.7.0 M2 新增七档案（类型轴裁决）──

        // REQ-122（T8）播客/有声书：ASR-only 快速路径——全帧几乎不采样（999），
        // ocr_weight=0（纯语音），disable_ocr=true（P4 跳过画面链）。
        VideoProfile {
            kind: ProfileKind::Podcast,
            detect_signals: DetectSignals {
                title_keywords: vec!["播客", "有声书", "听书", "电台", "音频课程"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 4, full_every: 999, silent_subtitle_every: 6, silent_full_every: 999 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.0, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: true, step_cards: false, verbal_normalize: true, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::Summary,
            storage_tier: StoreTier::TextFirst,
            disable_ocr: true,
            disable_asr: false,
        },
        // REQ-124（T1）直播：ASR+图像流，无 OCR/弹幕（裁决）——disable_ocr=true
        VideoProfile {
            kind: ProfileKind::Live,
            detect_signals: DetectSignals {
                title_keywords: vec!["直播", "开播", "live"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 999, silent_subtitle_every: 4, silent_full_every: 999 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.0, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: true, step_cards: false, verbal_normalize: true, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::Summary,
            storage_tier: StoreTier::TextFirst,
            disable_ocr: true,
            disable_asr: false,
        },
        // REQ-124（T2）白板：时间轴图像流——画面就是主体（全帧高频 full_every=1），
        // 图像优先档（书写过程帧序列全量保留）
        VideoProfile {
            kind: ProfileKind::Whiteboard,
            detect_signals: DetectSignals {
                title_keywords: vec!["白板", "板书", "手写", "讲解板"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 4, full_every: 1, silent_subtitle_every: 6, silent_full_every: 1 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 1.0, asr_weight: 0.6 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: false, verbal_normalize: false, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::LectureNotes,
            storage_tier: StoreTier::ImageFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        // REQ-124（T9）游戏教程/软件演示：ASR+图像流（操作步骤=内容）
        VideoProfile {
            kind: ProfileKind::GameTutorial,
            detect_signals: DetectSignals {
                title_keywords: vec!["游戏教程", "攻略", "实况", "上手"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 3, silent_subtitle_every: 4, silent_full_every: 2 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 0.8, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: true, verbal_normalize: false, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::StepCards,
            storage_tier: StoreTier::ImageFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        // REQ-124（T11）题目讲解：题干画面入图像流 + 讲解语音
        VideoProfile {
            kind: ProfileKind::Exercise,
            detect_signals: DetectSignals {
                title_keywords: vec!["题目", "习题", "讲解", "刷题", "真题"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 2, silent_subtitle_every: 4, silent_full_every: 2 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 1.0, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: false, verbal_normalize: false, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::LectureNotes,
            storage_tier: StoreTier::ImageFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        // REQ-123（T4）跟练：图像流首个档案——步骤边界三信号产物（M7 口令/
        // REQ-070 练习段/M8 示范跟练交替），步骤图卡
        VideoProfile {
            kind: ProfileKind::FollowAlong,
            detect_signals: DetectSignals {
                title_keywords: vec!["跟练", "跟做", "一起练", "锻炼", "瑜伽", "健身", "舞蹈"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 1, silent_subtitle_every: 4, silent_full_every: 1 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 1.0, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: false, step_cards: true, verbal_normalize: false, highlight: true, speaker_detect: false, glossary: false },
            artifact_template: ArtifactTemplate::StepCards,
            storage_tier: StoreTier::ImageFirst,
            disable_ocr: false,
            disable_asr: false,
        },
        // REQ-121（T3）编程实战：OCR+ASR 双通道——代码画面高频（full_every=2），
        // 示例代码提取（code_blocks 产物）由另一代理的提取模块 + 本库模板消费
        VideoProfile {
            kind: ProfileKind::Coding,
            detect_signals: DetectSignals {
                title_keywords: vec!["编程", "代码", "开发", "教程", "实战", "前端", "后端", "Python", "Java", "JavaScript"].into_iter().map(String::from).collect(),
                url_keywords: Vec::new(),
                frame_switch_range: None,
                prefers_subtitle: false,
                min_duration_min: None,
            },
            sampling_budget: SamplingBudget { subtitle_every: 2, full_every: 2, silent_subtitle_every: 4, silent_full_every: 2 },
            signal_weights: SignalWeights { subtitle_priority: false, ocr_weight: 1.0, asr_weight: 1.0 },
            postprocess_rules: PostprocessRules { chapter_detect: true, step_cards: true, verbal_normalize: true, highlight: true, speaker_detect: false, glossary: true },
            artifact_template: ArtifactTemplate::LectureNotes,
            storage_tier: StoreTier::ImageFirst,
            disable_ocr: false,
            disable_asr: false,
        },
    ]
}
