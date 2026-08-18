//! 五档案内置常量数据（REQ-043 / v0.5.0 M1）。
//!
//! @ai-context: 与 video_profile.rs 的类型定义分离（保持逻辑文件 ≤300 行，AGENTS.md §3）。
//! @ai-context: 参数依据头脑风暴轮 1/2 五类优化矩阵（采样/权重/后处理/产物）；
//!              JSON 导出后可由用户/校准流程覆盖（可校准）。
//! @ai-context: 默认值语义：Lecture 与 v0.4.0 现状采样档一致（零回归）；
//!              口播/访谈/会议全帧极低频（画面几乎无信息）；实操全帧高频（操作画面价值高）。

use crate::video_profile::{
    ArtifactTemplate, DetectSignals, PostprocessRules, ProfileKind, SamplingBudget, SignalWeights,
    VideoProfile,
};

/// 五档案内置常量（默认值；JSON 导出后可人工校准覆盖）。
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
        },
    ]
}
