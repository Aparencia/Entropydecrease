//! 四维参数矩阵数据（REQ-188 / v0.9.0 M1：10 形态 × 4 画面档；v0.13.6 形态展平）。
//!
//! @ai-context: 与 video_profile_spec.rs 的类型定义分离（保持逻辑文件 ≤300 行）；
//!              矩阵值归纳自旧 13 类配置（framework-v2 §5 映射表），保证新检测
//!              路径参数与旧档案语义一致（零回归）：
//!              - 形态表（form_* 函数）：产物模板 + 后处理规则（内容语义轴）
//!              - 画面档表（tier_* 函数）：采样预算 + 信号权重 + 存储档（画面信息轴）
//! @ai-context: 维度独立降级：形态 unknown（None）→ 默认讲义式模板（不阻塞）；
//!              画面档 none → disable_ocr=true（P4 无图短路，与旧播客/直播同语义）。
//! @ai-context: impl ContentForm 自 video_profile_spec.rs 迁入（v0.13.6 拆分计划：
//!              形态静态映射归数据模块，类型文件维持 ≤300；跨文件 impl 先例
//!              LiveSessionManager）——消费端路径零变化。

use crate::video_profile::{
    DetectSignals, PostprocessRules, ProfileKind, SamplingBudget, SignalWeights, StoreTier,
    VideoProfile,
};
use crate::video_profile_spec::{ContentForm, VisualTier};

/// ContentForm 静态映射（label/parse/as_str——10 形态；解析失败 → None 诚实不猜）。
impl ContentForm {
    /// 前端展示名（检测卡 v2 三维一体用；当前前端自带标签映射，
    /// 本方法保留为后端展示/日志用，登记豁免 dead_code——与 ProfileKind::label 同模式）。
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            ContentForm::Lecture => "讲授",
            ContentForm::HandsOn => "实操",
            ContentForm::Explainer => "解说",
            ContentForm::Dialog => "对话",
            ContentForm::Exercise => "题目",
            ContentForm::Coding => "代码",
            ContentForm::Audio => "音频",
            ContentForm::Meeting => "会议",
            ContentForm::Live => "直播",
            ContentForm::Narrative => "影视",
        }
    }

    /// 解析前端传入的形态标识（kebab-case）；非法值 → None（诚实不猜默认）。
    pub fn parse(s: &str) -> Option<ContentForm> {
        match s {
            "lecture" => Some(ContentForm::Lecture),
            "hands-on" => Some(ContentForm::HandsOn),
            "explainer" => Some(ContentForm::Explainer),
            "dialog" => Some(ContentForm::Dialog),
            "exercise" => Some(ContentForm::Exercise),
            "coding" => Some(ContentForm::Coding),
            "audio" => Some(ContentForm::Audio),
            "meeting" => Some(ContentForm::Meeting),
            "live" => Some(ContentForm::Live),
            "narrative" => Some(ContentForm::Narrative),
            _ => None,
        }
    }

    /// 形态标识（kebab-case，与 parse/serde 同口径；sessions.profile 落库用，
    /// 登记豁免 dead_code——落库接线在 M5 检测卡 v2）。
    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            ContentForm::Lecture => "lecture",
            ContentForm::HandsOn => "hands-on",
            ContentForm::Explainer => "explainer",
            ContentForm::Dialog => "dialog",
            ContentForm::Exercise => "exercise",
            ContentForm::Coding => "coding",
            ContentForm::Audio => "audio",
            ContentForm::Meeting => "meeting",
            ContentForm::Live => "live",
            ContentForm::Narrative => "narrative",
        }
    }
}

/// 形态 → 代表旧类（VideoProfile.kind 契约字段用；仅标识，参数走矩阵）。
///
/// @ai-context: ProfileKind 是 13 类兼容枚举（消费端契约），四维形态没有
///              一一对应值——取语义最接近的代表旧类（解说→口播、对话→访谈、
///              音频→播客、影视→口播），展示/落库不误导。
pub fn legacy_kind_for_form(form: ContentForm) -> ProfileKind {
    match form {
        ContentForm::Lecture => ProfileKind::Lecture,
        ContentForm::HandsOn => ProfileKind::HandsOn,
        ContentForm::Explainer => ProfileKind::TalkingHead,
        ContentForm::Dialog => ProfileKind::Interview,
        ContentForm::Exercise => ProfileKind::Exercise,
        ContentForm::Coding => ProfileKind::Coding,
        ContentForm::Audio => ProfileKind::Podcast,
        ContentForm::Meeting => ProfileKind::Meeting,
        ContentForm::Live => ProfileKind::Live,
        ContentForm::Narrative => ProfileKind::TalkingHead,
    }
}

/// 形态 → 后处理规则（产物内容语义：章节/步骤卡/书面化/重点/说话人/术语表）。
pub fn postprocess_for_form(form: ContentForm) -> PostprocessRules {
    match form {
        // 讲授：章节+书面化+重点+术语（讲义式）
        ContentForm::Lecture => PostprocessRules {
            chapter_detect: true,
            step_cards: false,
            verbal_normalize: true,
            highlight: true,
            speaker_detect: false,
            glossary: true,
        },
        // 实操：步骤卡+重点（操作画面即内容，口语不书面化）
        ContentForm::HandsOn => PostprocessRules {
            chapter_detect: false,
            step_cards: true,
            verbal_normalize: false,
            highlight: true,
            speaker_detect: false,
            glossary: false,
        },
        // 解说：书面化+重点（叙事线模板变体见 artifact_templates）
        ContentForm::Explainer => PostprocessRules {
            chapter_detect: false,
            step_cards: false,
            verbal_normalize: true,
            highlight: true,
            speaker_detect: false,
            glossary: false,
        },
        // 对话：重点+说话人（纪要式 QA/决策）
        ContentForm::Dialog => PostprocessRules {
            chapter_detect: false,
            step_cards: false,
            verbal_normalize: false,
            highlight: true,
            speaker_detect: true,
            glossary: false,
        },
        // 题目：重点（题面+讲解对，模板讲义式）
        ContentForm::Exercise => PostprocessRules {
            chapter_detect: false,
            step_cards: false,
            verbal_normalize: false,
            highlight: true,
            speaker_detect: false,
            glossary: false,
        },
        // 代码：章节+步骤卡+书面化+重点+术语（代码块重建）
        ContentForm::Coding => PostprocessRules {
            chapter_detect: true,
            step_cards: true,
            verbal_normalize: true,
            highlight: true,
            speaker_detect: false,
            glossary: true,
        },
        // 音频：章节+书面化+重点（摘要文）
        ContentForm::Audio => PostprocessRules {
            chapter_detect: true,
            step_cards: false,
            verbal_normalize: true,
            highlight: true,
            speaker_detect: false,
            glossary: false,
        },
        // 会议：纪要式——说话人+重点（决策/待办结构；非线性不章节化）
        ContentForm::Meeting => PostprocessRules {
            chapter_detect: false,
            step_cards: false,
            verbal_normalize: false,
            highlight: true,
            speaker_detect: true,
            glossary: false,
        },
        // 直播：高口语摘要文——书面化+重点（时间轴摘要；无字幕不章节）
        ContentForm::Live => PostprocessRules {
            chapter_detect: false,
            step_cards: false,
            verbal_normalize: true,
            highlight: true,
            speaker_detect: false,
            glossary: false,
        },
        // 影视：叙事线+要点（narrative_detect 变体见 artifact_templates）——
        // 非教学不术语表/不步骤卡；章节闭（叙事结构非线性）
        ContentForm::Narrative => PostprocessRules {
            chapter_detect: false,
            step_cards: false,
            verbal_normalize: true,
            highlight: true,
            speaker_detect: false,
            glossary: false,
        },
    }
}

/// 形态 → 检测信号（新四维检测的标题关键词按形态归组；旧 13 类 detect_signals
/// 保留不动，本表供平台/OCR 标签通用投票（REQ-191）接线）。
pub fn detect_signals_for_form(form: ContentForm) -> DetectSignals {
    let title_keywords: Vec<String> = match form {
        ContentForm::Lecture => vec!["课程", "网课", "教程", "课堂", "教学", "公开课", "学习", "精讲"],
        ContentForm::HandsOn => vec!["实操", "实战", "演练", "跟练", "操作", "案例", "从零"],
        ContentForm::Explainer => vec!["科普", "知识", "解读", "分享", "演讲", "TED"],
        ContentForm::Dialog => vec!["访谈", "对话", "对谈", "专访", "聊天"],
        // v0.13.6：会议独立形态——评审/复盘等会议场景不再误归对话
        ContentForm::Meeting => vec!["会议", "例会", "周会", "复盘", "评审", "研讨会", "答辩", "晨会"],
        ContentForm::Exercise => vec!["题目", "习题", "刷题", "真题"],
        ContentForm::Coding => vec!["编程", "代码", "开发", "Python", "Java", "JavaScript", "前端", "后端"],
        ContentForm::Audio => vec!["播客", "有声书", "听书", "电台"],
        // v0.13.6：直播独立形态（原并入音频——直播有画面，仅画面价值低）
        ContentForm::Live => vec!["直播", "带货", "开播", "直播间", "回放", "实况"],
        // v0.13.6：影视叙事形态——纪录片/剧集/电影内容大头此前无类可归；
        // 单字"第"/"集"过泛不收录（系列识别走 series_detect，不在此表）
        ContentForm::Narrative => vec!["纪录片", "电影", "电视剧", "剧集", "动画", "影视", "微电影", "正片"],
    }
    .into_iter()
    .map(String::from)
    .collect();
    DetectSignals {
        title_keywords,
        url_keywords: Vec::new(),
        frame_switch_range: None,
        prefers_subtitle: false,
        min_duration_min: None,
    }
}

/// 画面档 → 采样预算（tick=1s；归纳自旧配置：高=实操高频、中=网课中频、
/// 低=口播低频、无=播客几乎不采样）。
pub fn sampling_for_tier(tier: VisualTier) -> SamplingBudget {
    match tier {
        VisualTier::Rich => SamplingBudget { subtitle_every: 2, full_every: 2, silent_subtitle_every: 4, silent_full_every: 2 },
        VisualTier::Medium => SamplingBudget { subtitle_every: 2, full_every: 5, silent_subtitle_every: 4, silent_full_every: 2 },
        VisualTier::Low => SamplingBudget { subtitle_every: 4, full_every: 30, silent_subtitle_every: 6, silent_full_every: 30 },
        VisualTier::None => SamplingBudget { subtitle_every: 4, full_every: 999, silent_subtitle_every: 6, silent_full_every: 999 },
    }
}

/// 画面档 → 信号权重（OCR/ASR 侧重：画面信息越少 OCR 权重越低）。
pub fn weights_for_tier(tier: VisualTier) -> SignalWeights {
    match tier {
        VisualTier::Rich => SignalWeights { subtitle_priority: false, ocr_weight: 1.0, asr_weight: 1.0 },
        VisualTier::Medium => SignalWeights { subtitle_priority: true, ocr_weight: 0.7, asr_weight: 0.5 },
        VisualTier::Low => SignalWeights { subtitle_priority: false, ocr_weight: 0.1, asr_weight: 1.0 },
        VisualTier::None => SignalWeights { subtitle_priority: false, ocr_weight: 0.0, asr_weight: 1.0 },
    }
}

/// 画面档 → 存储档位（高=图像优先不截断、中=均衡 150、低/无=文本优先 50）。
pub fn store_tier_for_tier(tier: VisualTier) -> StoreTier {
    match tier {
        VisualTier::Rich => StoreTier::ImageFirst,
        VisualTier::Medium => StoreTier::Balanced,
        VisualTier::Low | VisualTier::None => StoreTier::TextFirst,
    }
}

/// 画面档 → 是否禁用 OCR 画面链（无档 = 纯音频 P4 短路，与旧播客/直播同语义）。
pub fn disable_ocr_for_tier(tier: VisualTier) -> bool {
    crate::video_profile_spec::tier_skips_ocr(tier)
}

/// 矩阵解析：形态 + 画面档 → 完整 VideoProfile（消费端契约字段齐备）。
///
/// @ai-context: detect_signals 供 REQ-191 OCR 标签通用投票接线（本版默认按形态
///              词表）；artifact_template 按形态独立切换（template_for_form）；
///              disable_asr 恒 false（机制预留，无形态声明禁用 ASR）。
pub fn resolve_profile(form: ContentForm, tier: VisualTier) -> VideoProfile {
    VideoProfile {
        kind: legacy_kind_for_form(form),
        detect_signals: detect_signals_for_form(form),
        sampling_budget: sampling_for_tier(tier),
        signal_weights: weights_for_tier(tier),
        postprocess_rules: postprocess_for_form(form),
        artifact_template: crate::video_profile_spec::template_for_form(form),
        storage_tier: store_tier_for_tier(tier),
        disable_ocr: disable_ocr_for_tier(tier),
        disable_asr: false,
    }
}
