//! 视频档案框架 v2 四维解耦数据模型（REQ-188 / v0.9.0 M1）。
//!
//! @ai-context: 会话 33（动画科普）实证驱动的重新设计——旧 13 类档案把「教学形态」
//!              与「画面参数」耦合在一张表：talking-head 既表达"观点表达"又隐含
//!              "画面无信息"，无法表达"解说 × 高画面价值"组合。本模块引入
//!              形态(ContentForm) × 画面价值(VisualTier) × 领域(DomainTag) ×
//!              语言(LanguageTag) 四维解耦：
//!              - 形态独立决定产物模板（form_template 表）
//!              - 画面档独立决定采样/OCR/存储（tier_params 表）
//!              - 维度独立降级：形态 unknown 时画面档照常生效
//! @ai-context: 纯逻辑模块（无 IO/DB），矩阵数据在 video_profile_spec_data.rs；
//!              旧 13 类保留为兼容层（ProfileKind::to_form/default_tier 映射），
//!              profile_by_kind 消费端契约零改动（见 video_profile.rs）。

use serde::{Deserialize, Serialize};

use crate::video_profile::{ArtifactTemplate, ProfileKind, VideoProfile};

/// 内容形态（7 类，决定产物模板；REQ-188 形态轴）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ContentForm {
    /// 讲授：连续系统讲解（课程/讲座/精读/白板板书）→ 讲义式
    Lecture,
    /// 实操：步骤化操作示范（含跟练/游戏教程）→ 步骤卡
    HandsOn,
    /// 解说：知识科普/观点表达（真人或动画；会话 33 归属）→ 叙事线+要点
    Explainer,
    /// 对话：多人交流（访谈/会议/对谈）→ 纪要式
    Dialog,
    /// 题目：习题/真题演练 → 题面+讲解对
    Exercise,
    /// 代码：编程构建 → 代码块重建+讲解
    Coding,
    /// 音频：纯音频/弱画面（播客/有声书/直播）→ 摘要文
    Audio,
}

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
        }
    }
}

/// 画面信息价值档位（4 档，决定采样/OCR/存储；REQ-188 画面轴）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum VisualTier {
    /// 高：板书/代码/题面/表格 → 全帧高频 + OCR 全投 + ImageFirst
    Rich,
    /// 中：动画图文/录屏 UI/PPT → 中频 + OCR 0.7 + Balanced
    #[default]
    Medium,
    /// 低：真人口播/访谈 → 低频 + OCR 0.1 + TextFirst
    Low,
    /// 无：纯音频 → 跳过画面链
    None,
}

impl VisualTier {
    /// 前端展示名（检测卡 v2 用；当前前端自带标签映射，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            VisualTier::Rich => "高",
            VisualTier::Medium => "中",
            VisualTier::Low => "低",
            VisualTier::None => "无",
        }
    }

    /// 解析前端传入的档位标识（kebab-case）；非法值 → None。
    pub fn parse(s: &str) -> Option<VisualTier> {
        match s {
            "rich" => Some(VisualTier::Rich),
            "medium" => Some(VisualTier::Medium),
            "low" => Some(VisualTier::Low),
            "none" => Some(VisualTier::None),
            _ => None,
        }
    }

    /// 档位标识（kebab-case，与 parse/serde 同口径；落库用，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            VisualTier::Rich => "rich",
            VisualTier::Medium => "medium",
            VisualTier::Low => "low",
            VisualTier::None => "none",
        }
    }
}

/// 内容领域标签（粗+细两级；REQ-190 领域轴）。
///
/// @ai-context: 粗领域（10-15 个带参数，内置种子词表）→ hotwords 预热/术语筛选/
///              区域预期；细标签开放（平台原文/术语频率自动命中，"公积金"不必枚举）。
/// @ai-context: 本版（v0.9.0）粗领域词表与四来源检测在 video_profile_domain.rs；
///              本类型仅数据契约（serde 可序列化落库/传输）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct DomainTag {
    /// 粗领域标识（kebab-case，如 "economy"；None=未定领域——不阻塞）
    #[serde(default)]
    pub coarse: Option<String>,
    /// 细标签（开放集合：平台标签原文/术语自动命中；去重）
    #[serde(default)]
    pub fine: Vec<String>,
}

/// 语言标签（预留维；REQ-188 语言轴）。
///
/// @ai-context: 中文/英文/中英混合 → ASR/标点模型选择。当前中文单语，
///              仅设计上预留字段不实施（本版恒 "zh"）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LanguageTag {
    /// 中文（当前唯一实施语言）
    #[default]
    Zh,
    /// 英文（预留）
    En,
    /// 中英混合（预留）
    Mixed,
}

/// 四维档案规格（检测输出/会话落库/检测卡 v2 传输的统一契约）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileSpec {
    /// 内容形态（维度①；None=识别中——不阻塞会话开始，参数走默认档）
    #[serde(default)]
    pub form: Option<ContentForm>,
    /// 画面价值档位（维度②；开始前默认中档 + 诚实声明）
    #[serde(default)]
    pub visual_tier: VisualTier,
    /// 内容领域（维度③；None=空领域——不阻塞，会话中自动补全）
    #[serde(default)]
    pub domain: Option<DomainTag>,
    /// 语言（维度④；当前恒中文单语）
    #[serde(default)]
    pub language: LanguageTag,
}

impl Default for ProfileSpec {
    /// 开始前默认规格：形态 unknown（识别中）+ 画面中档（诚实声明默认）+ 空领域。
    fn default() -> Self {
        ProfileSpec {
            form: None,
            visual_tier: VisualTier::Medium,
            domain: None,
            language: LanguageTag::Zh,
        }
    }
}

/// 13→7 映射：旧档案 → 新形态（framework-v2 §5 映射表）。
impl ProfileKind {
    /// 旧 13 类 → 新 7 形态（多对一收敛映射；Unknown → None 诚实未知）。
    ///
    /// @ai-context: whiteboard 归讲授（画面档=高由 default_tier 表达）；
    ///              podcast/live 归音频；follow-along/game-tutorial 归实操；
    ///              interview/meeting 归对话。
    pub fn to_form(self) -> Option<ContentForm> {
        match self {
            ProfileKind::Lecture | ProfileKind::Whiteboard => Some(ContentForm::Lecture),
            ProfileKind::HandsOn | ProfileKind::FollowAlong | ProfileKind::GameTutorial => {
                Some(ContentForm::HandsOn)
            }
            ProfileKind::TalkingHead => Some(ContentForm::Explainer),
            ProfileKind::Interview | ProfileKind::Meeting => Some(ContentForm::Dialog),
            ProfileKind::Exercise => Some(ContentForm::Exercise),
            ProfileKind::Coding => Some(ContentForm::Coding),
            ProfileKind::Podcast | ProfileKind::Live => Some(ContentForm::Audio),
            ProfileKind::Unknown => None,
        }
    }

    /// 旧 13 类 → 默认画面档（映射表第三列；迁移/旧会话零回归用）。
    pub fn default_tier(self) -> VisualTier {
        match self {
            // lecture 中档（板书时升档由会话中重评驱动）；whiteboard 画面=主体 → 高
            ProfileKind::Lecture => VisualTier::Medium,
            ProfileKind::Whiteboard => VisualTier::Rich,
            // 实操中-高：hands-on 中档（跟练/游戏教程画面价值更高）
            ProfileKind::HandsOn => VisualTier::Medium,
            ProfileKind::FollowAlong | ProfileKind::GameTutorial => VisualTier::Rich,
            // 解说低档（动画升中由重评驱动——会话 33 实证）
            ProfileKind::TalkingHead => VisualTier::Low,
            ProfileKind::Interview | ProfileKind::Meeting => VisualTier::Low,
            ProfileKind::Exercise | ProfileKind::Coding => VisualTier::Rich,
            ProfileKind::Podcast | ProfileKind::Live => VisualTier::None,
            ProfileKind::Unknown => VisualTier::Medium,
        }
    }
}

/// 按四维规格查参数矩阵：形态 → 产物模板 + 后处理；画面档 → 采样/OCR/存储。
///
/// @ai-context: 矩阵值归纳自旧 13 类配置（video_profile_spec_data.rs），
///              保证新检测路径参数与旧档案语义一致（零回归）；
///              形态 None（识别中）→ 默认形态参数（讲义式模板，不阻塞）。
pub fn profile_for_spec(spec: &ProfileSpec) -> VideoProfile {
    let form = spec.form.unwrap_or(ContentForm::Lecture);
    crate::video_profile_spec_data::resolve_profile(form, spec.visual_tier)
}

/// 旧档案 → 四维规格（记忆库 kind 映射/旧会话解读用；Unknown → 默认规格）。
pub fn spec_from_kind(kind: ProfileKind) -> ProfileSpec {
    ProfileSpec {
        form: kind.to_form(),
        visual_tier: kind.default_tier(),
        domain: None,
        language: LanguageTag::Zh,
    }
}

/// 形态 → 默认档位（无任何信号时的新会话起点；解说/对话低档、实操中档）。
pub fn default_tier_for_form(form: ContentForm) -> VisualTier {
    match form {
        ContentForm::Lecture | ContentForm::HandsOn => VisualTier::Medium,
        ContentForm::Explainer | ContentForm::Dialog => VisualTier::Low,
        ContentForm::Exercise | ContentForm::Coding => VisualTier::Rich,
        ContentForm::Audio => VisualTier::None,
    }
}

/// 画面档是否跳过画面链（none 档 = 纯音频——采样/OCR/字幕全短路）。
pub fn tier_skips_ocr(tier: VisualTier) -> bool {
    tier == VisualTier::None
}

/// 产物模板（形态表）：讲义式/步骤卡/叙事线摘要/纪要式/题面讲解/代码讲义/摘要文。
pub fn template_for_form(form: ContentForm) -> ArtifactTemplate {
    match form {
        ContentForm::Lecture | ContentForm::Exercise | ContentForm::Coding => {
            ArtifactTemplate::LectureNotes
        }
        ContentForm::HandsOn => ArtifactTemplate::StepCards,
        ContentForm::Explainer | ContentForm::Audio => ArtifactTemplate::Summary,
        ContentForm::Dialog => ArtifactTemplate::DialogueNotes,
    }
}

/// 单测独立文件（本文件 ~260 行，见 line-limit-exemptions.md 策略：≤300 行）。
#[cfg(test)]
#[path = "video_profile_spec_tests.rs"]
mod tests;
