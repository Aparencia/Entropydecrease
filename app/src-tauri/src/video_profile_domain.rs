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

/// 粗领域标识（20 类，带参数——种子词表/区域预期/热词通道；v0.13.6 +5）。
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
    /// 美食/烹饪/烘焙（v0.13.6；烘焙从手工迁入）
    Cooking,
    /// 摄影/视频制作（v0.13.6）
    PhotoVideo,
    /// 历史/人文/社科（v0.13.6）
    HistoryHumanities,
    /// 写作/阅读（v0.13.6）
    Writing,
    /// 数码/硬件/评测（v0.13.6）
    TechGadgets,
}

// impl DomainKind（label/parse/as_str——20 类静态映射）按 v0.13.6 拆分计划
// 移至 video_profile_domain_data.rs（本文件维持 ≤300；跨文件 impl 先例：LiveSessionManager）。

impl DomainKind {
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
    /// v0.13.6（REQ-220）：curated 细目 id（kebab；多选；与 DomainTag.fine 同契约）。
    /// serde(default)——旧响应缺省，前端回退空数组。
    #[serde(default)]
    pub fine_ids: Vec<String>,
    /// 命中来源（诊断/记忆用途：platform/platform-map/user/title/term）
    pub source: String,
    /// 置信（命中词数加权 0.0-1.0；领域错判代价低，无需确认门禁）
    pub confidence: f32,
}

/// 六源检测（纯函数）：分区映射表 > 平台种子词 > 用户确认 > 标题词 > 开场白 > 术语频率。
///
/// @ai-context: 可靠性排序（REQ-190/221）：①a 平台分区映射表（确定性，置信 1.0）
///              → ①b 分区标签原文种子词 → ③ 用户确认 → ② 标题词 → ⑤ ASR 开场白
///              （口语弱信号：仅 title 未命中时补位，自我介绍常含领域自称）→
///              ④ 术语频率。同分时按此优先级。
/// @ai-context: 细标签：平台原文/术语原文原样保留（"公积金"不必枚举——
///              细标签开放）；细目：curated id（v0.13.6，粗领域内细分，如
///              programming-frontend）——两者并存互不覆盖。
pub fn detect_domain(signals: &DomainSignals) -> DomainDetection {
    let fine_tags: Vec<String> = Vec::new();
    // ①a 平台分区映射表（v0.13.6 REQ-221：确定性映射——置信 1.0，细目预选；
    // 影视/直播分区 coarse=None——领域留给内容信号，不在此短路）。
    // 审查 M2 修复：取**首个带 coarse 的**分区条目（首个命中条目可能是
    // coarse=None 的知识科普/直播——若整体跳过会丢失后续已登记 coarse 分区）
    let zone_hit = signals.platform_tags.iter().find_map(|t| {
        crate::video_profile_platform_map::lookup_zone(t)
            .and_then(|e| e.coarse.map(|k| (e, k, t)))
    });
    if let Some((entry, kind, tag)) = zone_hit {
        let fine_ids = entry.fine.map(|f| vec![f.to_string()]).unwrap_or_default();
        return DomainDetection {
            kind: Some(kind),
            fine_ids,
            fine_tags: vec![tag.clone()],
            source: "platform-map".to_string(),
            confidence: 1.0,
        };
    }
    // ①b 平台分区标签原文（强信号：官方分类原文直接进细标签）
    for tag in &signals.platform_tags {
        if let Some(kind) = match_domain_words(std::slice::from_ref(tag)) {
            let source = "platform".to_string();
            return DomainDetection {
                kind: Some(kind),
                fine_ids: Vec::new(),
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
            fine_ids: Vec::new(),
            fine_tags,
            source: "user".to_string(),
            confidence: 1.0,
        };
    }
    // ② 标题领域词（弱信号：命中即定粗领域，细目种子词进一步细分）
    if let Some(title) = signals.title.as_deref() {
        if let Some((kind, hits)) = match_domain_words_count(&[title.to_string()]) {
            return DomainDetection {
                kind: Some(kind),
                fine_ids: crate::video_profile_domain_fine::match_fine(&[title.to_string()], kind)
                    .into_iter()
                    .map(String::from)
                    .collect(),
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
                fine_ids: Vec::new(),
                fine_tags: Vec::new(),
                source: "asr".to_string(),
                confidence: (hits as f32 / 3.0).min(1.0),
            };
        }
    }
    // ④ 术语频率（会话中补全：命中词进 hotwords 预热候选；细目按细目种子细分）
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
                fine_ids: crate::video_profile_domain_fine::match_fine(&signals.term_freq, kind)
                    .into_iter()
                    .map(String::from)
                    .collect(),
                fine_tags: top,
                source: "term".to_string(),
                confidence: (hits as f32 / 3.0).min(1.0),
            };
        }
    }
    DomainDetection { kind: None, fine_ids: Vec::new(), fine_tags, source: "none".to_string(), confidence: 0.0 }
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

/// 全 20 领域（检测遍历用；v0.13.6 +5）。
pub const ALL_DOMAINS: [DomainKind; 20] = [
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
    DomainKind::Cooking,
    DomainKind::PhotoVideo,
    DomainKind::HistoryHumanities,
    DomainKind::Writing,
    DomainKind::TechGadgets,
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
