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

/// 一条已定稿字幕（投票校正后的文本 + 真实时间轴）。
#[derive(Debug, Clone, PartialEq)]
pub struct VotedSubtitle {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

impl VotedSubtitle {
    /// 转成融合层字幕段（同一契约，直接进入融合/直出）。
    pub fn into_segment(self) -> SubtitleSegment {
        SubtitleSegment { start_ms: self.start_ms, end_ms: self.end_ms, text: self.text }
    }
}

/// 字幕投票器（有状态：累积当前字幕组的样本）。
#[derive(Debug, Default)]
pub struct SubtitleVoter {
    /// 当前组的样本（text, 帧时刻）
    samples: Vec<(String, u64)>,
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
        self.samples.first().map(|(t, _)| t.as_str())
    }

    /// 观察一帧 OCR 结果：
    /// - 空文本忽略（不改变状态）
    /// - 与组首样本编辑距离 ≤2 → 追加样本（投票原料）
    /// - 否则 → 定稿上一组（投票输出 + 真实时间轴）并开启新组
    ///
    /// 返回定稿的上组字幕（None = 仍在累积）。
    pub fn observe(&mut self, text: &str, now_ms: u64) -> Option<VotedSubtitle> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        match self.samples.first() {
            None => {
                self.samples.push((trimmed.to_string(), now_ms));
                None
            }
            Some((first, _)) => {
                // M3/REQ-038 快速通道：同文本帧精确 hash 短路——跳过字符级
                // levenshtein 计算（静止字幕每帧重复，此分支是热路径）
                if trimmed == first {
                    self.samples.push((trimmed.to_string(), now_ms));
                    return None;
                }
                if levenshtein(trimmed, first) <= sample_join_limit(first) {
                    self.samples.push((trimmed.to_string(), now_ms));
                    None
                } else {
                    // 字幕切换：先定稿旧组（投票输出），清空后开启新组——
                    // 不清空会导致 preview/投票混入旧组样本（测试发现）
                    let finalized = self.finalize_inner(now_ms);
                    self.samples.clear();
                    self.samples.push((trimmed.to_string(), now_ms));
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

    /// 定稿当前组：投票文本 + start=首样本时刻、end=传入时刻。
    fn finalize_inner(&self, end_ms: u64) -> Option<VotedSubtitle> {
        let (_, first_ts) = self.samples.first()?;
        let texts: Vec<&str> = self.samples.iter().map(|(t, _)| t.as_str()).collect();
        Some(VotedSubtitle { start_ms: *first_ts, end_ms, text: vote_text(&texts) })
    }
}

/// 字符级多数投票（纯函数）：逐位取**超过半数样本**的字符；无多数时用首样本该位
/// 字符仲裁（首见优先）；首样本也无该位则截断（多数帧缺失 → 尾部不延伸）。
///
/// @ai-context: "超过半数"规则防止少数帧的噪音字符在其独有位"默认胜出"
///              （如 2 帧中 1 帧误带句号 → 不输出句号）；首样本仲裁让平票
///              稳定收敛到最初观察（最接近字幕真实内容）。
pub fn vote_text(samples: &[&str]) -> String {
    let Some(max_len) = samples.iter().map(|s| s.chars().count()).max() else {
        return String::new();
    };
    let n = samples.len();
    let chars: Vec<Vec<char>> = samples.iter().map(|s| s.chars().collect()).collect();
    let first = &chars[0];
    let mut out = String::with_capacity(max_len);
    for i in 0..max_len {
        // 统计第 i 位各字符票数（缺失位样本不投票）
        let mut counts: Vec<(char, usize)> = Vec::new();
        for sample in &chars {
            if let Some(c) = sample.get(i) {
                match counts.iter_mut().find(|(ch, _)| ch == c) {
                    Some((_, cnt)) => *cnt += 1,
                    None => counts.push((*c, 1)),
                }
            }
        }
        // 多数（票数 ×2 > 样本数）→ 输出；否则首样本该位仲裁；再否则截断
        let majority = counts.iter().find(|(_, cnt)| *cnt * 2 > n).map(|(c, _)| *c);
        match majority.or_else(|| first.get(i).copied()) {
            Some(c) => out.push(c),
            None => break,
        }
    }
    out
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
