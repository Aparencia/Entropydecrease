//! 结构密度路由纯函数（v0.11.0 REQ-196；v4 附录B 组路由判据）。
//!
//! @ai-context: 判据锚定「结构承载性」——结构密度高→自成一组（无论长短），
//!              低→归主题组（按 DomainTag 领域粒度）。信号来自四维解耦既有
//!              资产（章节检测/术语表/OCR 密度/形态 unknown/画面档/领域），
//!              加权投票复用 vote_detect/vote_tier 范式（每信号一票→计票→置信）。
//! @ai-context: 路由误判为 ★★★★ 死法（高结构碎片埋进主题组/低结构长视频空洞
//!              自成一组）——冲突/弱信号诚实 NeedConfirm，配合 REQ-198 可见可改；
//!              零信号兜底自成一组（埋没比空洞更伤——独立组可后续移动）。
//! @ai-context: 纯逻辑无 IO；golden 用例先行（TDD），阈值常量具名可调。

use crate::video_profile_domain::DomainKind;

/// 章节密度阈值（章/小时）：≥ 此值投高密度票。
const CHAPTER_DENSITY_HIGH: f32 = 2.0;
/// 章节密度阈值（章/小时）：< 此值投低密度票。
const CHAPTER_DENSITY_LOW: f32 = 0.5;
/// 术语表条目阈值：≥ 此值投高密度票（词汇表成块=内容自带结构）。
const GLOSSARY_HIGH: usize = 5;
/// OCR 文本密度阈值（0..1）：≥ 此值投高密度票（画面承载文字结构）。
const OCR_DENSITY_HIGH: f32 = 0.5;
/// 高密度/低密度判定的最小共振票数（单一信号不足以定路由——vote_tier 同哲学）。
const MIN_RESONANT_VOTES: u32 = 2;

/// 组路由输入信号（全部由既有检测资产计算；None=未观测不投票，不猜）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GroupRouteSignals {
    /// series_detect 命中（系列内容——assignment 层直判课程组，此处留早退路径）
    pub has_series: bool,
    /// 章节密度（章/小时；None=未跑章节检测）
    pub chapter_density: Option<f32>,
    /// 术语表条目数（None=未跑术语提取）
    pub glossary_terms: Option<usize>,
    /// OCR 文本密度（0..1；None=无 OCR 数据）
    pub ocr_text_density: Option<f32>,
    /// 形态 unknown（四维解耦诚实未知——低结构信号）
    pub profile_unknown: bool,
    /// 画面档 rich/mid（video_tier_detect——高结构信号）
    pub tier_rich: bool,
    /// 领域命中（TopicGroup 的强前提——命中时低密度 1 票即可归主题组）
    pub domain_kind: Option<DomainKind>,
}

/// 路由动作（三态——诚实不乱判）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouteAction {
    /// 结构密度高 → 自成一组（独立组）
    OwnGroup,
    /// 结构密度低且领域命中 → 归主题组
    TopicGroup,
    /// 信号冲突/低结构无领域 → 待确认（REQ-198 可见可改兜住误判）
    NeedConfirm,
}

/// 路由决策（动作 + 命中信号明细——组卡片路由理由展示数据源）。
#[derive(Debug, Clone, PartialEq)]
pub struct GroupRouteDecision {
    pub action: RouteAction,
    /// 命中信号明细（中文短语；前端逐条展示）
    pub reasons: Vec<String>,
}

/// 结构密度路由（纯函数）：计票 → 共振判定 → 三态输出。
///
/// @ai-context: 规则序（先强后弱，命中即返回）：
///              1. 系列命中 → 自成一组（课程组语义在 assignment 层兑现）；
///              2. 高密度 ≥2 票共振 → 自成一组；
///              3. 高低票并存（冲突）→ 待确认；
///              4. 低密度 ≥1 票且领域命中 → 归主题组（Task 14 实证：领域是
///                 强前提——低结构信号 1 票即可触发，无需低密度共振）；
///              5. 低密度 ≥2 票无领域 → 待确认；
///              6. 弱/零信号 → 自成一组兜底（独立组可后续移动，不埋没）。
pub fn route_group(signals: &GroupRouteSignals) -> GroupRouteDecision {
    if signals.has_series {
        return GroupRouteDecision {
            action: RouteAction::OwnGroup,
            reasons: vec!["系列内容命中（合集/分P）".to_string()],
        };
    }
    let mut high: u32 = 0;
    let mut low: u32 = 0;
    let mut reasons_high: Vec<String> = Vec::new();
    let mut reasons_low: Vec<String> = Vec::new();
    if let Some(density) = signals.chapter_density {
        if density >= CHAPTER_DENSITY_HIGH {
            high += 1;
            reasons_high.push(format!("章节密度高（{:.1} 章/小时）", density));
        } else if density < CHAPTER_DENSITY_LOW {
            low += 1;
            reasons_low.push("几乎无章节结构".to_string());
        }
    }
    if let Some(terms) = signals.glossary_terms {
        if terms >= GLOSSARY_HIGH {
            high += 1;
            reasons_high.push(format!("术语表成块（{} 条）", terms));
        } else if terms == 0 {
            low += 1;
            reasons_low.push("无术语沉淀".to_string());
        }
    }
    if signals.ocr_text_density.is_some_and(|d| d >= OCR_DENSITY_HIGH) {
        high += 1;
        reasons_high.push(format!(
            "画面文字密度高（{:.0}%）",
            signals.ocr_text_density.unwrap_or(0.0) * 100.0
        ));
    }
    if signals.tier_rich {
        high += 1;
        reasons_high.push("画面档位丰富（板书/PPT 级）".to_string());
    }
    if signals.profile_unknown {
        low += 1;
        reasons_low.push("形态未识别".to_string());
    }
    if high >= MIN_RESONANT_VOTES {
        return GroupRouteDecision { action: RouteAction::OwnGroup, reasons: reasons_high };
    }
    if high >= 1 && low >= 1 {
        reasons_high.extend(reasons_low);
        return GroupRouteDecision { action: RouteAction::NeedConfirm, reasons: reasons_high };
    }
    // 规则 4：低密度票 + 领域命中 → 主题组（领域=强前提，低密度 1 票即可触发——
    // Task 14 实证：B站标题有领域词但低密度票不足 2 的会话不再落兜底独立组）
    if low >= 1 && signals.domain_kind.is_some() {
        if let Some(kind) = signals.domain_kind {
            reasons_low.push(format!("领域命中（{}）", kind.label()));
            return GroupRouteDecision { action: RouteAction::TopicGroup, reasons: reasons_low };
        }
    }
    // 规则 5：低结构共振但无领域——主题组无处可归，诚实待确认（不硬塞大类抽屉）
    if low >= MIN_RESONANT_VOTES {
        return GroupRouteDecision { action: RouteAction::NeedConfirm, reasons: reasons_low };
    }
    // 弱/零信号兜底：自成一组（独立组可后续移动；埋没比空洞更伤）
    GroupRouteDecision {
        action: RouteAction::OwnGroup,
        reasons: vec!["信号不足，默认独立成组（可后续移动）".to_string()],
    }
}

#[cfg(test)]
#[path = "group_route_tests.rs"]
mod tests;
