//! 字幕区识别纯逻辑（REQ-011，ADR-005；v0.3.0 T2 多帧投票）。
//!
//! @ai-context: 本模块只做字幕文本流的多帧投票纠错与滚动字幕检测（纯函数/有状态
//!              轻组件）；区域裁剪复用 frame_diff::bottom_quarter_rect，OCR 识别
//!              复用 v0.1.0 引擎（oar-ocr）。
//! @ai-context: 多帧投票（头脑风暴 T2）：同一字幕持续显示时，OCR 每帧结果作为"样本"
//!              累积，字幕切换/停止时字符级多数投票输出校正文本——替代原"编辑距离
//!              ≤1 合并跳过"语义：OCR 微抖动不再是丢弃对象，而是投票原料（纠错来源）。
//!              字幕是融合的权威源，单帧错字经投票被多数帧纠正。
//! @ai-context: 落库时点从"首见即落"变为"切换/停止时落"：段 start_ms=首样本时刻、
//!              end_ms=切换时刻（与融合"end 由下一字幕补齐"语义一致，更精确）；
//!              实时落库弱化为近实时（≤1 去重窗），崩溃丢失窗口内段可接受（ADR-008）。

use crate::fusion::SubtitleSegment;
use crate::streaming_asr::levenshtein;

/// 同组归属判定（TD-039）：编辑距离 ≤ max(2, 首样本长度 15%)——短文本保持
/// 严格（防"第一点/第二点"类相似新字幕被误并），长文本按比例放宽（跨帧多字符
/// 错读累积不再误判新字幕导致段分裂）。
const SAMPLE_JOIN_RATIO: f32 = 0.15;

/// 同组编辑距离上限（纯函数）：长度比例与固定下限取大。
fn sample_join_limit(first_text: &str) -> usize {
    let ratio = (first_text.chars().count() as f32 * SAMPLE_JOIN_RATIO).ceil() as usize;
    ratio.max(2)
}

/// REQ-065 帧间 tracking：组内最大时间跨度（ms）——同一字幕行的多帧应时间
/// 连续；跨度超阈值强制定稿（隔时重复帧/翻页瞬间错帧不混入投票）。
const GROUP_MAX_SPAN_MS: u64 = 8_000;

/// 一条已定稿字幕（投票校正后的文本 + 真实时间轴）。
#[derive(Debug, Clone, PartialEq)]
pub struct VotedSubtitle {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    /// v0.6.0 M2（REQ-062）：投票置信度（多数位占比均值；供概率加权融合）
    pub confidence: Option<f32>,
}

impl VotedSubtitle {
    /// 转成融合层字幕段（同一契约，直接进入融合/直出）。
    pub fn into_segment(self) -> SubtitleSegment {
        SubtitleSegment {
            start_ms: self.start_ms,
            end_ms: self.end_ms,
            text: self.text,
            confidence: self.confidence,
        }
    }
}

/// 字幕投票器（有状态：累积当前字幕组的样本）。
#[derive(Debug, Default)]
pub struct SubtitleVoter {
    /// 当前组的样本（text, 帧时刻, 帧权重——REQ-065 清晰度×score 加权）
    samples: Vec<(String, u64, f32)>,
}

impl SubtitleVoter {
    pub fn new() -> Self {
        Self::default()
    }

    /// 是否正在累积样本（停止时 flush 判定；查询入口保留，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        !self.samples.is_empty()
    }

    /// 当前组首样本文本（UI 即时预览；None=无活动组）。
    pub fn preview(&self) -> Option<&str> {
        self.samples.first().map(|(t, _, _)| t.as_str())
    }

    /// 观察一帧 OCR 结果（等权版本：权重 1.0——REQ-065 兼容入口）。
    pub fn observe(&mut self, text: &str, now_ms: u64) -> Option<VotedSubtitle> {
        self.observe_weighted(text, now_ms, 1.0)
    }

    /// 观察一帧 OCR 结果（REQ-065 加权版）：
    /// - 空文本忽略（不改变状态）
    /// - 与组首样本编辑距离 ≤ 上限 → 追加样本（投票原料；权重=清晰度×score）
    /// - 与首样本时间跨度超 GROUP_MAX_SPAN_MS → 强制定稿（帧间 tracking：
    ///   同一字幕行的多帧应时间连续，隔时重复帧不混入投票——翻页瞬间错帧防护）
    /// - 否则 → 定稿上一组（投票输出 + 真实时间轴）并开启新组
    ///
    /// 返回定稿的上组字幕（None = 仍在累积）。
    pub fn observe_weighted(&mut self, text: &str, now_ms: u64, weight: f32) -> Option<VotedSubtitle> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        let weight = weight.clamp(0.0, 1.0);
        match self.samples.first() {
            None => {
                self.samples.push((trimmed.to_string(), now_ms, weight));
                None
            }
            Some((first, first_ts, _)) => {
                // REQ-065 帧间 tracking：时间不连续（跨度超阈值）→ 定稿旧组
                if now_ms.saturating_sub(*first_ts) > GROUP_MAX_SPAN_MS {
                    let finalized = self.finalize_inner(now_ms);
                    self.samples.clear();
                    self.samples.push((trimmed.to_string(), now_ms, weight));
                    return finalized;
                }
                // M3/REQ-038 快速通道：同文本帧精确 hash 短路——跳过字符级
                // levenshtein 计算（静止字幕每帧重复，此分支是热路径）
                if trimmed == first {
                    self.samples.push((trimmed.to_string(), now_ms, weight));
                    return None;
                }
                if levenshtein(trimmed, first) <= sample_join_limit(first) {
                    self.samples.push((trimmed.to_string(), now_ms, weight));
                    None
                } else {
                    // 字幕切换：先定稿旧组（投票输出），清空后开启新组——
                    // 不清空会导致 preview/投票混入旧组样本（测试发现）
                    let finalized = self.finalize_inner(now_ms);
                    self.samples.clear();
                    self.samples.push((trimmed.to_string(), now_ms, weight));
                    finalized
                }
            }
        }
    }

    /// 停止时冲刷：定稿剩余组并清空（无活动组返回 None）。
    pub fn flush(&mut self, now_ms: u64) -> Option<VotedSubtitle> {
        if self.samples.is_empty() {
            return None;
        }
        let voted = self.finalize_inner(now_ms);
        self.samples.clear();
        voted
    }

    /// 定稿当前组：加权投票文本 + 置信度 + start=首样本时刻、end=传入时刻。
    fn finalize_inner(&self, end_ms: u64) -> Option<VotedSubtitle> {
        let (_, first_ts, _) = self.samples.first()?;
        let weighted: Vec<(&str, f32)> =
            self.samples.iter().map(|(t, _, w)| (t.as_str(), *w)).collect();
        let (text, confidence) = vote_text_weighted(&weighted);
        Some(VotedSubtitle { start_ms: *first_ts, end_ms, text, confidence: Some(confidence) })
    }
}

/// 字符级多数投票（纯函数，等权）：逐位取**超过半数样本**的字符；无多数时用首样本该位
/// 字符仲裁（首见优先）；首样本也无该位则截断（多数帧缺失 → 尾部不延伸）。
///
/// @ai-context: "超过半数"规则防止少数帧的噪音字符在其独有位"默认胜出"
///              （如 2 帧中 1 帧误带句号 → 不输出句号）；首样本仲裁让平票
///              稳定收敛到最初观察（最接近字幕真实内容）。
pub fn vote_text(samples: &[&str]) -> String {
    let weighted: Vec<(&str, f32)> = samples.iter().map(|s| (*s, 1.0)).collect();
    vote_text_weighted(&weighted).0
}

/// 投票文本 + 置信度（REQ-062，等权入口）：多数位占比均值。
pub fn vote_text_with_confidence(samples: &[&str]) -> (String, f32) {
    let weighted: Vec<(&str, f32)> = samples.iter().map(|s| (*s, 1.0)).collect();
    vote_text_weighted(&weighted)
}

/// 加权投票（REQ-065，纯函数）：清晰度×score 票权制字符多数投票。
///
/// @ai-context: 每位字符的**票权** = 该位样本权重之和；胜出 = 票权 > 总权/2
///              （全 1.0 权重时退化为"票数超过半数"——v0.5.0 行为零回归）；
///              无多数票的仲裁位按 0.5 计（证据不足，置信度打折）；
///              权重 clamp 到 [0,1]（score 越界防御；0 权重帧不参与胜出）。
pub fn vote_text_weighted(samples: &[(&str, f32)]) -> (String, f32) {
    let Some(max_len) = samples.iter().map(|(s, _)| s.chars().count()).max() else {
        return (String::new(), 0.0);
    };
    let total_weight: f32 = samples.iter().map(|(_, w)| w.clamp(0.0, 1.0)).sum();
    let chars: Vec<Vec<char>> = samples.iter().map(|(s, _)| s.chars().collect()).collect();
    let first = &chars[0];
    let mut out = String::with_capacity(max_len);
    let mut conf_sum = 0.0f32;
    let mut conf_count = 0usize;
    for i in 0..max_len {
        // 统计第 i 位各字符票权（缺失位样本不投票）
        let mut counts: Vec<(char, f32)> = Vec::new();
        for (idx, sample) in chars.iter().enumerate() {
            if let Some(c) = sample.get(i) {
                let w = samples[idx].1.clamp(0.0, 1.0);
                match counts.iter_mut().find(|(ch, _)| ch == c) {
                    Some((_, cw)) => *cw += w,
                    None => counts.push((*c, w)),
                }
            }
        }
        // 多数（票权 ×2 > 总权）→ 输出；否则首样本该位仲裁；再否则截断
        let majority = counts.iter().find(|(_, w)| *w * 2.0 > total_weight).map(|(c, _)| *c);
        match majority.or_else(|| first.get(i).copied()) {
            Some(c) => {
                out.push(c);
                // 置信度：胜出位票权占比（仲裁位无多数 → 0.5 证据不足）
                let ratio = majority
                    .map(|_| {
                        counts
                            .iter()
                            .find(|(ch, _)| *ch == c)
                            .map(|(_, w)| *w / total_weight.max(1e-6))
                            .unwrap_or(0.0)
                    })
                    .unwrap_or(0.5);
                conf_sum += ratio.clamp(0.0, 1.0);
                conf_count += 1;
            }
            None => break,
        }
    }
    let confidence = if conf_count == 0 { 0.0 } else { conf_sum / conf_count as f32 };
    (out, confidence)
}

/// 滚动字幕检测：连续两帧文本不同但共享高比例公共子序列 → 判定滚动（丢弃）。
///
/// @ai-context: 股票/歌词等滚动字幕每帧都变化且内容高度重合，普通投票分组失效
///              （每帧都开新组刷屏）；用 LCS 比例判定（ADR-005 风险缓解）。
///              min_ratio=0.6 表示公共子序列长度 ≥ 较短文本 60% 视为滚动。
pub fn is_scrolling(current: &str, previous: &str, min_ratio: f32) -> bool {
    let a = current.trim();
    let b = previous.trim();
    if a.is_empty() || b.is_empty() || a == b {
        return false;
    }
    let shorter = a.chars().count().min(b.chars().count());
    if shorter == 0 {
        return false;
    }
    let lcs = lcs_len(a, b);
    lcs as f32 / shorter as f32 >= min_ratio
}

/// 最长公共子序列长度（DP，纯函数）。
fn lcs_len(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev = vec![0usize; b.len() + 1];
    let mut curr = vec![0usize; b.len() + 1];
    for ca in &a {
        for (j, cb) in b.iter().enumerate() {
            curr[j + 1] = if ca == cb {
                prev[j] + 1
            } else {
                prev[j + 1].max(curr[j])
            };
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

#[cfg(test)]
#[path = "subtitle_ocr_tests.rs"]
mod tests;
