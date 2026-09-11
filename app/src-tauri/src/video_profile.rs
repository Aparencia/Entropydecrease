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

/// 检测投票域（原 229–402 行）——纯逻辑投票与阈值，见 video_profile_detect.rs 模块头。
#[path = "video_profile_detect.rs"]
mod detect;

/// 检测域再导出：既有 `crate::video_profile::{…}` 导入路径保持不变。
/// ⚠️ 路径必须是 `detect::`（子模块路径）而非 `crate::video_profile_detect::`——
/// 本模块由 `#[path]` 在**父模块内**声明（不动 lib.rs 的 `mod` 块），不是 crate 根子模块。
/// 用 glob 而非逐个列名：既覆盖两域全部公共面，也避免「公共类型被显式再导出却
/// 无 crate 内按名引用」触发 unused_imports（与 types.rs `pub use types_*::*` 同款）。
pub use detect::*;

/// 记忆偏好域（原 404–622 行）——三条匹配通道 + JSON IO，见 video_profile_memory.rs 模块头。
#[path = "video_profile_memory.rs"]
mod memory;

/// 记忆域再导出：既有 `crate::video_profile::{…}` 导入路径保持不变。
pub use memory::*;

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

/// 四象限记忆后置判定（纯函数，v0.11.5 Task 5）：检测优先 + 记忆兜底 + 冲突以检测为准。
///
/// @ai-context: 调用方（command 层）先跑 vote_detect 得到检测结果，再以记忆后置裁决：
///              ① 记忆命中 + 检测高置信且同 kind → 记忆生效（快路径，无确认）
///              ② 记忆命中 + 检测高置信但冲突（≠检测首位）→ **检测为准** + 标记
///                 memory_conflict（前端提示"记忆与新检测冲突，已按检测"）
///              ③ 记忆命中 + 检测低置信/冲突 → 记忆生效（用户先验 > 弱证据）
///              ④ 无记忆 → 纯检测（结果原样）
/// @ai-context: 本函数不触碰 domain（命令层赋值）；记忆命中时按 REQ-188 回填
///              memory_form（检测为准的②场景不设——形态随检测）。
pub fn apply_profile_memory(
    mut result: DetectResult,
    memory: &ProfileMemory,
    title: &str,
) -> DetectResult {
    if let Some(kind) = memory.lookup(title) {
        let top = result.candidates.first().map(|c| c.kind);
        let high_conf = !result.needs_confirmation;
        if high_conf && top.is_some() && top != Some(kind) {
            // 象限②：检测高置信但冲突 → 检测为准 + 标记冲突记忆
            result.memory_conflict = Some(kind);
        } else {
            // 象限①/③：同 kind 或低置信 → 记忆生效（用户已裁决过，快路径）
            result.candidates = vec![ProfileCandidate { kind, score: 1.0 }];
            result.needs_confirmation = false;
            result.memory_hit = Some(kind);
            // REQ-188：记忆命中的四维形态（新记忆 form 优先，旧记忆经 kind.to_form()
            // 映射兜底——检测卡 v2 直接展示）
            result.memory_form = memory.lookup_form(title);
        }
    }
    result
}

/// 单测独立文件（本文件 ~590 行已登记豁免——见 line-limit-exemptions.md；
/// 审查 L5 修复：原"保持 ≤300 行"注释不实，改为豁免说明）。
#[cfg(test)]
#[path = "video_profile_tests.rs"]
mod tests;
