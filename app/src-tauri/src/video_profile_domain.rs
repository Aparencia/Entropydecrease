//! 内容领域标签体系（REQ-190 / v0.9.0 M3：粗 15 领域 + 细标签开放）。
//!
//! @ai-context: 会话 33 实证——B站分区标签 `知识科普|经济管理` 是零成本强信号；
//!              粗领域内置种子词表，细标签开放（平台原文/术语自动命中）。
//! @ai-context: 作用链：hotwords 预热（REQ-040）→ ASR 命中率↑；术语表筛选；
//!              区域预期（数学→公式区、代码→code 区）。
//! @ai-context: 来源（按可靠性）：① 平台分区标签（B站 OCR）→ ② 标题领域词
//!              → ③ 用户确认（检测卡下拉）→ ④ 术语频率自动补全 → ⑤ ASR 开场白
//!              （Task 7：开头 30s 自我介绍常含领域自称）。降级：无则空领域不阻塞。
//! @ai-context: 纯逻辑模块（无 IO/DB）；词表数据在 video_profile_domain_data.rs。

use serde::{Deserialize, Serialize};

/// 粗领域标识（15 类，带参数——种子词表/区域预期/热词通道）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DomainKind {
    /// 经济/理财/公积金
    Economy,
    /// 编程/开发
    Programming,
    /// 数学/物理/理科
    MathScience,
    /// 语言学习（外语/语文）
    Language,
    /// 化妆/美妆/穿搭
    Beauty,
    /// 健身/运动/瑜伽
    Fitness,
    /// 法律/法规
    Law,
    /// 医学/健康
    Medical,
    /// 职场技能/办公软件
    Career,
    /// 设计/创意/绘画
    Design,
    /// 音乐/乐理
    Music,
    /// 手工/DIY
    Handcraft,
    /// 考试/考证/升学
    Exam,
    /// 游戏/电竞
    Gaming,
    /// 心理/成长/哲学
    Psychology,
}

impl DomainKind {
    /// 前端展示名（检测卡 v2 下拉用；登记豁免 dead_code——M5 接线，
    /// 目标激活版本：v0.12.0）。
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            DomainKind::Economy => "经济管理",
            DomainKind::Programming => "编程开发",
            DomainKind::MathScience => "数学理科",
            DomainKind::Language => "语言学习",
            DomainKind::Beauty => "化妆美妆",
            DomainKind::Fitness => "健身运动",
            DomainKind::Law => "法律",
            DomainKind::Medical => "医学健康",
            DomainKind::Career => "职场技能",
            DomainKind::Design => "设计创意",
            DomainKind::Music => "音乐",
            DomainKind::Handcraft => "手工",
            DomainKind::Exam => "考试考证",
            DomainKind::Gaming => "游戏电竞",
            DomainKind::Psychology => "心理成长",
        }
    }

    /// 解析前端传入的领域标识（kebab-case）；非法值 → None（诚实不猜）。
    pub fn parse(s: &str) -> Option<DomainKind> {
        match s {
            "economy" => Some(DomainKind::Economy),
            "programming" => Some(DomainKind::Programming),
            "math-science" => Some(DomainKind::MathScience),
            "language" => Some(DomainKind::Language),
            "beauty" => Some(DomainKind::Beauty),
            "fitness" => Some(DomainKind::Fitness),
            "law" => Some(DomainKind::Law),
            "medical" => Some(DomainKind::Medical),
            "career" => Some(DomainKind::Career),
            "design" => Some(DomainKind::Design),
            "music" => Some(DomainKind::Music),
            "handcraft" => Some(DomainKind::Handcraft),
            "exam" => Some(DomainKind::Exam),
            "gaming" => Some(DomainKind::Gaming),
            "psychology" => Some(DomainKind::Psychology),
            _ => None,
        }
    }

    /// 领域标识（kebab-case，与 parse/serde 同口径；落库/传输用，
    /// 登记豁免 dead_code——会话落库接线在 M5 检测卡 v2，目标激活版本：v0.12.0）。
    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            DomainKind::Economy => "economy",
            DomainKind::Programming => "programming",
            DomainKind::MathScience => "math-science",
            DomainKind::Language => "language",
            DomainKind::Beauty => "beauty",
            DomainKind::Fitness => "fitness",
            DomainKind::Law => "law",
            DomainKind::Medical => "medical",
            DomainKind::Career => "career",
            DomainKind::Design => "design",
            DomainKind::Music => "music",
            DomainKind::Handcraft => "handcraft",
            DomainKind::Exam => "exam",
            DomainKind::Gaming => "gaming",
            DomainKind::Psychology => "psychology",
        }
    }

    /// 区域预期（REQ-190 作用链）：数学→公式区、代码→code 区、设计→图片区；
    /// 其余无强预期（None——不改变现状区域权重）。
    /// 登记豁免 dead_code：区域预期接线在 M4 平台适配（OCR 标签通用化后生效），
    /// 目标激活版本：v0.12.0。
    #[allow(dead_code)]
    pub fn expected_region(self) -> Option<crate::layout_analyzer::RegionKind> {
        match self {
            DomainKind::MathScience => Some(crate::layout_analyzer::RegionKind::Formula),
            DomainKind::Programming => Some(crate::layout_analyzer::RegionKind::Code),
            DomainKind::Design => Some(crate::layout_analyzer::RegionKind::Image),
            _ => None,
        }
    }
}

/// 领域检测输入信号（五来源聚合；全部可选——无信号零回归）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DomainSignals {
    /// 窗口标题（来源②标题领域词）
    pub title: Option<String>,
    /// 平台分区标签（来源①——B站 OCR 分区 `知识科普|经济管理`；local 为目录名）
    pub platform_tags: Vec<String>,
    /// 用户已确认领域（来源③——检测卡下拉；None=未确认）
    pub user_confirmed: Option<DomainKind>,
    /// 会话中术语频率词（来源④——自动补全；None=尚未观测）
    pub term_freq: Vec<String>,
    /// ASR 开场白（来源⑤——会话开头 30s 文本；None=诚实降级；serde(default) 向后兼容）
    #[serde(default)]
    pub asr_opening: Option<String>,
}

/// 领域检测结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DomainDetection {
    /// 命中的粗领域（None=未命中——空领域不阻塞）
    pub kind: Option<DomainKind>,
    /// 细标签（开放集合：平台原文/术语频率命中；去重保留原文）
    pub fine_tags: Vec<String>,
    /// 命中来源（诊断/记忆用途：platform/title/user/term）
    pub source: String,
    /// 置信（命中词数加权 0.0-1.0；领域错判代价低，无需确认门禁）
    pub confidence: f32,
}

/// 五来源检测（纯函数）：平台分区 > 用户确认 > 标题词 > 开场白 > 术语频率。
///
/// @ai-context: 可靠性排序（REQ-190）：① 平台分区标签 → ③ 用户确认 → ② 标题词
///              → ⑤ ASR 开场白（口语弱信号：仅 title 未命中时补位，自我介绍
///              常含领域自称）→ ④ 术语频率。同分时按此优先级。
/// @ai-context: 细标签：平台原文/术语原文原样保留（"公积金"不必枚举——
///              细标签开放；粗领域命中词同时作为 hotwords 预热候选）。
pub fn detect_domain(signals: &DomainSignals) -> DomainDetection {
    let fine_tags: Vec<String> = Vec::new();
    // ① 平台分区标签（强信号：官方分类原文直接进细标签）
    for tag in &signals.platform_tags {
        if let Some(kind) = match_domain_words(std::slice::from_ref(tag)) {
            let source = "platform".to_string();
            return DomainDetection {
                kind: Some(kind),
                fine_tags: vec![tag.clone()],
                source,
                confidence: 1.0,
            };
        }
    }
    // ③ 用户确认（显式裁决最高——但需平台未命中才查，用户可改）
    if let Some(kind) = signals.user_confirmed {
        return DomainDetection {
            kind: Some(kind),
            fine_tags,
            source: "user".to_string(),
            confidence: 1.0,
        };
    }
    // ② 标题领域词（弱信号：命中即定粗领域，细标签留空）
    if let Some(title) = signals.title.as_deref() {
        if let Some((kind, hits)) = match_domain_words_count(&[title.to_string()]) {
            return DomainDetection {
                kind: Some(kind),
                fine_tags: Vec::new(),
                source: "title".to_string(),
                confidence: (hits as f32 / 3.0).min(1.0),
            };
        }
    }
    // ⑤ ASR 开场白（口语弱信号：仅 title 未命中时补位；复用种子词表不新增数据）
    if let Some(opening) = signals.asr_opening.as_deref() {
        if let Some((kind, hits)) = match_domain_words_count(&[opening.to_string()]) {
            return DomainDetection {
                kind: Some(kind),
                fine_tags: Vec::new(),
                source: "asr".to_string(),
                confidence: (hits as f32 / 3.0).min(1.0),
            };
        }
    }
    // ④ 术语频率（会话中补全：命中词进 hotwords 预热候选）
    if !signals.term_freq.is_empty() {
        if let Some((kind, hits)) = match_domain_words_count(&signals.term_freq) {
            let seeds = crate::video_profile_domain_data::seed_words(kind);
            let top = signals
                .term_freq
                .iter()
                .take(5)
                .filter(|w| seeds.iter().any(|s| w.contains(s)))
                .cloned()
                .collect::<Vec<_>>();
            return DomainDetection {
                kind: Some(kind),
                fine_tags: top,
                source: "term".to_string(),
                confidence: (hits as f32 / 3.0).min(1.0),
            };
        }
    }
    DomainDetection { kind: None, fine_tags, source: "none".to_string(), confidence: 0.0 }
}

/// 平台分区标签/单文本 → 领域（分区标签词可能直接含领域名如"经济管理"）。
fn match_domain_words(texts: &[String]) -> Option<DomainKind> {
    match_domain_words_count(texts).map(|(k, _)| k)
}

/// 文本集 → (领域, 命中词数)（种子词表匹配；多领域同分 → 首领域诚实）。
fn match_domain_words_count(texts: &[String]) -> Option<(DomainKind, usize)> {
    let mut best: Option<(DomainKind, usize)> = None;
    for kind in ALL_DOMAINS {
        let seeds = crate::video_profile_domain_data::seed_words(kind);
        let hits = texts
            .iter()
            .filter(|t| seeds.iter().any(|s| t.contains(s)))
            .count();
        if hits > 0 && best.as_ref().is_none_or(|(_, b)| hits > *b) {
            best = Some((kind, hits));
        }
    }
    best
}

/// 全 15 领域（检测遍历用）。
pub const ALL_DOMAINS: [DomainKind; 15] = [
    DomainKind::Economy,
    DomainKind::Programming,
    DomainKind::MathScience,
    DomainKind::Language,
    DomainKind::Beauty,
    DomainKind::Fitness,
    DomainKind::Law,
    DomainKind::Medical,
    DomainKind::Career,
    DomainKind::Design,
    DomainKind::Music,
    DomainKind::Handcraft,
    DomainKind::Exam,
    DomainKind::Gaming,
    DomainKind::Psychology,
];

/// 领域命中 → hotwords 预热候选（种子词表原文；供 VocabManager 通道注入）。
///
/// @ai-context: 不直接改用户词表——返回候选由 command 层决定是否加入
///              （领域记忆/用户可见性考量，防词表污染）。
pub fn hotword_candidates(kind: DomainKind) -> Vec<String> {
    crate::video_profile_domain_data::seed_words(kind)
}

/// 领域 → 术语表筛选词（glossary 构建用：仅保留命中领域词表的候选术语）。
/// 登记豁免 dead_code：术语筛选接线在产物层（M5 叙事变体后随模板消费），
/// 目标激活版本：v0.12.0。
#[allow(dead_code)]
pub fn filter_glossary(kind: DomainKind, candidates: &[String]) -> Vec<String> {
    let seeds = crate::video_profile_domain_data::seed_words(kind);
    candidates
        .iter()
        .filter(|c| seeds.iter().any(|s| c.contains(s) || s.contains(c.as_str())))
        .cloned()
        .collect()
}

/// 单测独立文件。
#[cfg(test)]
#[path = "video_profile_domain_tests.rs"]
mod tests;
