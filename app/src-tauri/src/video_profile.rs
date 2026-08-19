//! 视频类型档案（REQ-043 / v0.5.0 M1，头脑风暴轮 1/2 采纳 E9；v0.7.0 M2 扩展）。
//!
//! @ai-context: 档案 = 纯配置（"一次调优多处受益"）：所有管线从"全局参数"改为
//!              "按档案查询参数"。十二档案：五基线（结构化教学/步骤实操/口播知识/
//!              访谈播客/会议汇报）+ v0.7.0 七新档案（播客有声书/直播/白板/游戏教程/
//!              题目讲解/跟练/编程实战——类型轴裁决 T1/T2/T3/T4/T8/T9/T11）。
//! @ai-context: 本模块只含纯逻辑（档案常量 + JSON 序列化 + 检测投票 + 记忆偏好），
//!              不依赖 windows/DB/引擎——可全量单测；档案 JSON 可导出校准（可校准）。
//! @ai-context: 混合检测（方案 C）：自动信号投票出候选 → 置信度低才问用户 →
//!              用户确认/修改写入记忆偏好（同窗口标题下次直接生效）。

use serde::{Deserialize, Serialize};

/// 十二类档案标识（全栈统一业务术语；v0.7.1 起含 Unknown 共十三值）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProfileKind {
    /// 结构化教学（网课/录播/MOOC）
    Lecture,
    /// 步骤实操（软件教程/化妆/编程跟练）
    HandsOn,
    /// 口播知识（知识区 UP/TED/科普）
    TalkingHead,
    /// 访谈/播客（多人对话）
    Interview,
    /// 会议/汇报（周会/评审/培训）
    Meeting,
    /// v0.7.0 REQ-122（T8）：播客/有声书——ASR-only 快速路径（无画面链）
    Podcast,
    /// v0.7.0 REQ-124（T1）：直播——ASR+图像流，不做 OCR/弹幕（裁决）
    Live,
    /// v0.7.0 REQ-124（T2）：白板/板书课——时间轴图像流（书写过程即内容）
    Whiteboard,
    /// v0.7.0 REQ-124（T9）：游戏教程/软件演示——ASR+图像流
    GameTutorial,
    /// v0.7.0 REQ-124（T11）：题目讲解（考研/考证真题）——ASR+图像流
    Exercise,
    /// v0.7.0 REQ-123（T4）：跟练型（健身/舞蹈/乐器示范）——图像流首个档案
    FollowAlong,
    /// v0.7.0 REQ-121（T3）：编程实战——OCR+ASR 双通道（示例代码提取）
    Coding,
    /// v0.7.1 用户需求：未知——自动检测无法识别时如实标注（不假装猜中）；
    /// 无内置档案配置，管线参数回退默认（Lecture）档（零回归），产物模板同网课讲义。
    Unknown,
}

impl ProfileKind {
    /// 前端展示名（当前前端自带标签映射，本方法保留为后端展示/日志用，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            ProfileKind::Lecture => "网课",
            ProfileKind::HandsOn => "实操",
            ProfileKind::TalkingHead => "口播",
            ProfileKind::Interview => "访谈",
            ProfileKind::Meeting => "会议",
            ProfileKind::Podcast => "播客/有声书",
            ProfileKind::Live => "直播",
            ProfileKind::Whiteboard => "白板",
            ProfileKind::GameTutorial => "游戏教程",
            ProfileKind::Exercise => "题目讲解",
            ProfileKind::FollowAlong => "跟练",
            ProfileKind::Coding => "编程实战",
            ProfileKind::Unknown => "未知",
        }
    }

    /// 解析前端传入的档案标识（kebab-case）；非法值回退 Lecture（默认档案不阻断）。
    pub fn parse(s: &str) -> ProfileKind {
        match s {
            "unknown" => ProfileKind::Unknown,
            "hands-on" => ProfileKind::HandsOn,
            "talking-head" => ProfileKind::TalkingHead,
            "interview" => ProfileKind::Interview,
            "meeting" => ProfileKind::Meeting,
            "podcast" => ProfileKind::Podcast,
            "live" => ProfileKind::Live,
            "whiteboard" => ProfileKind::Whiteboard,
            "game-tutorial" => ProfileKind::GameTutorial,
            "exercise" => ProfileKind::Exercise,
            "follow-along" => ProfileKind::FollowAlong,
            "coding" => ProfileKind::Coding,
            _ => ProfileKind::Lecture,
        }
    }

    /// 档案标识（kebab-case，与 parse/serde 同口径；会话 profile 列落库用）。
    pub fn as_str(self) -> &'static str {
        match self {
            ProfileKind::Lecture => "lecture",
            ProfileKind::HandsOn => "hands-on",
            ProfileKind::TalkingHead => "talking-head",
            ProfileKind::Interview => "interview",
            ProfileKind::Meeting => "meeting",
            ProfileKind::Podcast => "podcast",
            ProfileKind::Live => "live",
            ProfileKind::Whiteboard => "whiteboard",
            ProfileKind::GameTutorial => "game-tutorial",
            ProfileKind::Exercise => "exercise",
            ProfileKind::FollowAlong => "follow-along",
            ProfileKind::Coding => "coding",
            ProfileKind::Unknown => "unknown",
        }
    }
}

/// 检测信号配置（该档案在哪些信号下得票）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DetectSignals {
    /// 窗口标题关键词（A5 已入库："教程/实战/会议/访谈/第X章"）
    pub title_keywords: Vec<String>,
    /// URL/播放器标题关键词（B站/网课平台）
    pub url_keywords: Vec<String>,
    /// 画面切换频率区间（次/分；None=不参与该信号）
    pub frame_switch_range: Option<(f32, f32)>,
    /// 有字幕偏好（det 结果统计；字幕优先档案为 true）
    pub prefers_subtitle: bool,
    /// 会话时长下限（分钟；None=不参与该信号）
    pub min_duration_min: Option<u32>,
}

/// 采样预算（DualRateScheduler 按档案查表，tick=1s 采样周期）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SamplingBudget {
    /// 语音活跃期字幕区采样间隔（tick）
    pub subtitle_every: u32,
    /// 语音活跃期全帧采样间隔（tick）
    pub full_every: u32,
    /// 静音期字幕区间隔（tick）
    pub silent_subtitle_every: u32,
    /// 静音期全帧间隔（tick）
    pub silent_full_every: u32,
}

/// 信号权重（字幕优先 / OCR / ASR 的提取侧重）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SignalWeights {
    /// 字幕优先（无损信道，网课）
    pub subtitle_priority: bool,
    /// OCR 权重 0.0-1.0（板书/UI/参数）
    pub ocr_weight: f32,
    /// ASR 权重 0.0-1.0（口播/访谈/会议全投）
    pub asr_weight: f32,
}

/// 后处理规则集开关（M2 支撑机制按档案生效）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PostprocessRules {
    /// 章节检测（C1，网课）
    pub chapter_detect: bool,
    /// 帧聚类步骤卡（B6，实操）
    pub step_cards: bool,
    /// 口语书面化（B5，口播/网课）
    pub verbal_normalize: bool,
    /// 重点候选标注（C2，口播/网课/实操）
    pub highlight: bool,
    /// 说话人变化检测（A3，访谈/会议）
    pub speaker_detect: bool,
    /// 术语表自动构建（C3，网课）
    pub glossary: bool,
}

/// 产物模板标识（M7 产物体系使用；此处仅定义档案映射）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactTemplate {
    /// 讲义式（网课：章节+术语+段落+关键图+小结）
    LectureNotes,
    /// 步骤卡（实操：帧+说明+时间范围）
    StepCards,
    /// 摘要文（口播：Claim+Quote+关键词索引）
    Summary,
    /// 对话纪要（访谈：QAPair+Highlight+讲者）
    DialogueNotes,
    /// 会议纪要（会议：Decision/Todo+Agenda）
    MeetingNotes,
}

/// 档案级图片存储策略档位（REQ-110 M-存储 / v0.7.0 M1.5）。
///
/// @ai-context: 图集预算与图像流存储的分档——文本优先（网课/口播：画面价值低，
///              50 张预算+低帧采样）；均衡（实操：150 张）；图像优先（跟练/白板/
///              游戏/题目讲解，M2 档案组）：不截断 + 时间轴帧序列（图像流存储层）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum StoreTier {
    /// 文本优先：图集 50 张预算（现状行为，零回归）
    #[default]
    TextFirst,
    /// 均衡：图集 150 张预算
    Balanced,
    /// 图像优先：图集不截断 + 时间轴帧序列存储（图像流）
    ImageFirst,
}

/// 视频类型档案（纯配置，JSON 可序列化校准）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoProfile {
    pub kind: ProfileKind,
    pub detect_signals: DetectSignals,
    pub sampling_budget: SamplingBudget,
    pub signal_weights: SignalWeights,
    pub postprocess_rules: PostprocessRules,
    pub artifact_template: ArtifactTemplate,
    /// REQ-110：图片存储策略档位（默认 TextFirst——旧库/缺省零回归）
    #[serde(default)]
    pub storage_tier: StoreTier,
    /// REQ-130（v0.7.0 M3）：P4 无图短路——档案声明禁用 OCR 画面链
    /// （屏幕捕获/OCR/字幕采样整体跳过；引擎池全局共享不销毁，只跳过采样端）。
    /// 播客/直播声明 true（纯语音/无 OCR 裁决）；旧 JSON 缺省 false（零回归）。
    #[serde(default)]
    pub disable_ocr: bool,
    /// REQ-130：P4 无音短路——档案声明禁用 ASR 链（本版无档案声明 true，
    /// 机制预留；引擎池同样只跳过消费端）。旧 JSON 缺省 false（零回归）。
    #[serde(default)]
    pub disable_asr: bool,
}

/// 五档案内置常量（默认值；JSON 导出后可人工校准覆盖）。
pub use crate::video_profile_data::builtin_profiles;

/// 按档案标识查内置档案（Unknown/未知标识回退 Lecture——默认档案不阻断）。
pub fn profile_by_kind(kind: ProfileKind) -> VideoProfile {
    let mut profiles = builtin_profiles();
    let idx = profiles.iter().position(|p| p.kind == kind).unwrap_or(0);
    profiles.remove(idx)
}

/// 观测到的检测信号（全部已有/低成本：A5 标题已入库、帧 diff/VAD/时长均为管线现状）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ObservedSignals {
    /// 窗口标题（None=未知）
    pub title: Option<String>,
    /// URL/播放器标题（None=未知）
    pub url: Option<String>,
    /// 画面切换频率（次/分；None=未知）
    pub frame_switch_rate: Option<f32>,
    /// 字幕有无（det 结果统计；None=未知）
    pub has_subtitle: Option<bool>,
    /// 会话时长（分钟；None=未知）
    pub duration_min: Option<u32>,
}

/// 检测候选（降序）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProfileCandidate {
    pub kind: ProfileKind,
    /// 归一化得分 0.0-1.0（最高分档案 = 1.0，其余按比例）
    pub score: f32,
}

/// 检测结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DetectResult {
    /// 候选档案（降序；全部 0 分时为 Unknown 单候选——诚实未知，不猜默认）
    pub candidates: Vec<ProfileCandidate>,
    /// 是否需用户确认（信号冲突/得分不足——置信度低才问，高则静默生效可改）
    pub needs_confirmation: bool,
    /// 记忆偏好命中（同窗口标题上次确认过；直接生效无需确认）
    pub memory_hit: Option<ProfileKind>,
}

/// 检测得分阈值：top 得分低于该值视为信号不足。
const CONFIDENCE_THRESHOLD: f32 = 2.5;
/// 信号冲突阈值：top 与次名差距小于该值视为冲突（需用户裁决）。
const CONFLICT_GAP: f32 = 1.0;

/// 混合检测投票（纯函数）：观测信号 × 五档案检测信号配置 → 候选排序。
///
/// @ai-context: 每档案得分 = 标题关键词命中数×2 + URL 命中×2 + 帧率区间命中×2
///              + 字幕偏好命中 + 时长达标；归一化后输出候选。
/// @ai-context: 记忆偏好由调用方（command 层）先查 ProfileMemory，命中直接生效；
///              本函数只负责信号投票（决策矩阵可注入 fake 信号单测）。
pub fn vote_detect(signals: &ObservedSignals) -> DetectResult {
    // v0.7.2（REQ-152）：标题先剥系列名再投票——同一系列的 P1/P5 标题不同导致
    // 投票漂移（真实短板）；剥离后各集投票一致（"零基础化妆 P3" 与 "P5" 同键）。
    // 未识别出系列（普通标题）→ 原样投票（零回归）；仅换投票标题，不加分不扣分。
    let mut s = signals.clone();
    if let Some(info) = signals
        .title
        .as_deref()
        .and_then(crate::series_detect::extract_series)
    {
        s.title = Some(info.series);
    }
    let profiles = builtin_profiles();
    let mut scored: Vec<(ProfileKind, f32)> = profiles
        .iter()
        .map(|p| (p.kind, score_profile(p, &s)))
        .collect();
    let max = scored.iter().map(|(_, s)| *s).fold(0.0f32, f32::max);
    if max <= 0.0 {
        // 无任何信号命中：Unknown 单候选 + 需确认（诚实未知，不假装猜中网课；
        // v0.7.1 用户需求：无法自动识别时选中"未知"）
        return DetectResult {
            candidates: vec![ProfileCandidate { kind: ProfileKind::Unknown, score: 1.0 }],
            needs_confirmation: true,
            memory_hit: None,
        };
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let candidates: Vec<ProfileCandidate> = scored
        .iter()
        .map(|(kind, score)| ProfileCandidate { kind: *kind, score: score / max })
        .collect();
    let needs_confirmation = scored[0].1 < CONFIDENCE_THRESHOLD
        || scored
            .get(1)
            .map(|(_, s)| scored[0].1 - *s < CONFLICT_GAP)
            .unwrap_or(false);
    DetectResult { candidates, needs_confirmation, memory_hit: None }
}

/// 单档案得分（纯函数，可注入 fake 信号单测）。
fn score_profile(profile: &VideoProfile, signals: &ObservedSignals) -> f32 {
    let mut score = 0.0f32;
    let ds = &profile.detect_signals;
    if let Some(title) = signals.title.as_deref() {
        let hits = ds.title_keywords.iter().filter(|k| title.contains(k.as_str())).count();
        score += hits as f32 * 2.0;
        // "第X章"模式（网课章节）：title 含"第"且含"章"
        if title.contains('第') && title.contains('章') && ds.title_keywords.contains(&"第".to_string()) {
            score += 2.0;
        }
    }
    if let Some(url) = signals.url.as_deref() {
        let hits = ds.url_keywords.iter().filter(|k| url.contains(k.as_str())).count();
        score += hits as f32 * 2.0;
    }
    if let (Some(rate), Some((lo, hi))) = (signals.frame_switch_rate, ds.frame_switch_range) {
        if rate >= lo && rate <= hi {
            score += 2.0;
        }
    }
    if let Some(has_sub) = signals.has_subtitle {
        if has_sub && ds.prefers_subtitle {
            score += 1.0;
        }
        // 无字幕时偏好字幕的档案不额外加分（保持对称：仅正向信号计分）
    }
    if let (Some(dur), Some(min)) = (signals.duration_min, ds.min_duration_min) {
        if dur >= min {
            score += 1.0;
        }
    }
    score
}

/// 记忆偏好条目：窗口标题关键词 → 用户确认过的档案。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub keyword: String,
    pub kind: ProfileKind,
    /// v0.7.2（REQ-152）：系列键标记——键是剥离序号后的系列名（true），
    /// 同系列各集共享记忆；旧 JSON 缺省 false（零回归）。
    #[serde(default)]
    pub is_series: bool,
}

/// 记忆偏好库（JSON 持久化；同 vocab 模式：路径可注入，测试用 tempfile）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ProfileMemory {
    pub entries: Vec<MemoryEntry>,
}

impl ProfileMemory {
    /// 从磁盘加载；文件不存在/损坏 → 空库（防御：不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        let Ok(raw) = std::fs::read_to_string(path) else { return Self::default() };
        serde_json::from_str(&raw).unwrap_or_default()
    }

    /// 原子写（先 .tmp 再 rename，防写一半损坏记忆库）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Io(format!("序列化档案记忆失败: {}", e)))?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 按窗口标题查询记忆偏好：标题包含某条 keyword 即命中（同窗口标题下次直接生效）。
    ///
    /// @ai-context: 最长关键词优先（"网课-数学" 应命中更长更具体的条目）。
    /// @ai-context: v0.7.2（REQ-152）：先试**系列键**——标题可识别系列（P/集/EP 等）
    ///              时用系列名匹配，P1 确认过的档案 P5 直接生效（修复标题序号
    ///              变化导致的记忆失配）；系列未命中回退完整标题 contains（现状）。
    pub fn lookup(&self, title: &str) -> Option<ProfileKind> {
        if let Some(info) = crate::series_detect::extract_series(title) {
            if let Some(kind) = self.lookup_best(&info.series) {
                return Some(kind);
            }
        }
        self.lookup_best(title)
    }

    /// 最长关键词优先匹配（纯函数）。
    fn lookup_best(&self, key: &str) -> Option<ProfileKind> {
        let mut best: Option<(usize, ProfileKind)> = None;
        for e in &self.entries {
            if key.contains(&e.keyword) && !e.keyword.is_empty() {
                let len = e.keyword.chars().count();
                if best.as_ref().is_none_or(|(bl, _)| len > *bl) {
                    best = Some((len, e.kind));
                }
            }
        }
        best.map(|(_, kind)| kind)
    }

    /// 记录用户确认（关键词已存在则覆盖档案；新增追加）。
    ///
    /// @ai-context: v0.7.2（REQ-152）：标题可识别系列 → 存**系列键**（is_series=true，
    ///              同系列各集共享）；否则存完整标题（现状行为零回归）。
    pub fn remember(&mut self, keyword: &str, kind: ProfileKind) {
        let keyword = keyword.trim().to_string();
        if keyword.is_empty() {
            return;
        }
        let (key, is_series) = match crate::series_detect::extract_series(&keyword) {
            Some(info) => (info.series, true),
            None => (keyword, false),
        };
        if let Some(e) = self.entries.iter_mut().find(|e| e.keyword == key) {
            e.kind = kind;
            e.is_series = is_series;
        } else {
            self.entries.push(MemoryEntry { keyword: key, kind, is_series });
        }
    }
}

/// 单测独立文件（本文件 ~394 行已登记豁免——见 line-limit-exemptions.md；
/// 审查 L5 修复：原"保持 ≤300 行"注释不实，改为豁免说明）。
#[cfg(test)]
#[path = "video_profile_tests.rs"]
mod tests;
