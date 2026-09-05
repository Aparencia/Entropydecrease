//! ASR 同音混淆画像（v0.20.0 / REQ-263，asr_eval 纯函数层 M1）。
//!
//! @ai-context: 目的——harness 把"转写假设 vs 参考文本"的字符级差异沉淀为
//!              混淆画像（同音/近形错对 top-N），供 P2 纠错闭环（OCR 侧
//!              ocr_confusion 哲学迁移：共现才替换、确认制）与 P1 热词加固
//!              喂候选。本模块只做统计，不做纠错决策。
//! @ai-context: 口径与 cer.rs 一致——先 strip_punct（标点空白不计，
//!              聚焦内容字），再做字符级编辑距离回溯，把替换对/插删计数
//!              分离开：Sub=参考字 a 被假设字 b 顶替；Ins=假设多出的字；
//!              Del=参考字缺失（漏识）。
//! @ai-context: 边界——O(n×m) 回溯矩阵，单段文本过长会爆内存：>MAX_DIFF_CHARS
//!              跳过画像（只保留距离统计），画像在段级做、不在整篇拼接上做
//!              （调用方契约，见模块头注与 harness 文档）。
//! @ai-context: 纯函数无 IO，全部可单测；消费方为 bin/asr_eval.rs（crate 外），
//!              lib 内无调用方 → dead_code 豁免登记（同 cer.rs 先例）。

// 消费方在 bin（asr_eval.rs），lib 内无调用方
#![allow(dead_code)]

use crate::asr_rescore::strip_punct;

/// 画像单段长度上限（O(n×m) 内存护栏；段级调用远小于此）。
const MAX_DIFF_CHARS: usize = 2000;

/// 编辑操作序列（参考 → 假设的对齐结果）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditOp {
    /// 对齐且相同。
    Match(char),
    /// 参考字 `a` 被假设字 `b` 顶替。
    Sub(char, char),
    /// 假设多出的字（插入）。
    Ins(char),
    /// 参考字缺失（删除/漏识）。
    Del(char),
}

/// 单条文本的混淆画像。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ConfusionProfile {
    /// 替换错对（含一次以上出现的重复项，供跨样本聚合）。
    pub substitutions: Vec<(char, char)>,
    /// 插入数（幻觉字）。
    pub insertions: usize,
    /// 删除数（漏识字）。
    pub deletions: usize,
}

/// 跨样本画像聚合器（harness 主累加结构）。
///
/// @ai-context: 用 Vec 计数而非 HashMap——画像规模小（错对 top-N），
///              保序确定性便于单测与报告稳定输出。
#[derive(Debug, Clone, Default)]
pub struct ConfusionAggregator {
    /// (参考字, 假设字) → 次数（线性查找；画像规模小可接受）。
    counts: Vec<((char, char), usize)>,
}

impl ConfusionAggregator {
    /// 合并一条画像入聚合。
    pub fn add(&mut self, p: &ConfusionProfile) {
        for pair in &p.substitutions {
            match self.counts.iter_mut().find(|(k, _)| k == pair) {
                Some((_, n)) => *n += 1,
                None => self.counts.push((*pair, 1)),
            }
        }
    }

    /// 取出次数最高的替换对（含并列；只读不改）。并列时按 (a,b) 字典序稳定。
    pub fn top_n(&self, n: usize) -> Vec<((char, char), usize)> {
        let mut sorted = self.counts.clone();
        sorted.sort_by(|l, r| {
            r.1.cmp(&l.1)
                .then_with(|| l.0.cmp(&r.0))
        });
        sorted.truncate(n);
        sorted
    }
}

/// 字符级差异回溯（纯函数）：返回参考 → 假设的对齐操作序列。
///
/// @ai-context: 标准 DP（sub=1/ins=1/del=1/match=0）后向回溯，代价最小路径；
///              同代价时优先 Match > Sub > Del > Ins（确定性）。
pub fn diff_ops(reference: &[char], hypothesis: &[char]) -> Vec<EditOp> {
    let (n, m) = (reference.len(), hypothesis.len());
    // 代价表按行滚动省内存；回溯需要完整矩阵 → 保留 u32 矩阵
    // （长度已由 strip 与 MAX_DIFF_CHARS 护栏约束）。
    let mut dp = vec![0u32; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in 0..=n {
        dp[at(i, 0)] = i as u32;
    }
    for j in 0..=m {
        dp[at(0, j)] = j as u32;
    }
    for i in 1..=n {
        for j in 1..=m {
            let cost = if reference[i - 1] == hypothesis[j - 1] { 0 } else { 1 };
            dp[at(i, j)] = (dp[at(i - 1, j - 1)] + cost)
                .min(dp[at(i - 1, j)] + 1)
                .min(dp[at(i, j - 1)] + 1);
        }
    }
    let mut ops = Vec::with_capacity(n.max(m));
    let (mut i, mut j) = (n, m);
    while i > 0 || j > 0 {
        let cur = dp[at(i, j)];
        // 对角（替换/匹配）：代价下标仅在 i>0 && j>0 时有效——先判界再取字
        if i > 0 && j > 0 {
            let diag = dp[at(i - 1, j - 1)];
            let sub_cost = if reference[i - 1] == hypothesis[j - 1] { 0 } else { 1 };
            if cur == diag + sub_cost {
                if sub_cost == 0 {
                    ops.push(EditOp::Match(reference[i - 1]));
                } else {
                    ops.push(EditOp::Sub(reference[i - 1], hypothesis[j - 1]));
                }
                i -= 1;
                j -= 1;
                continue;
            }
        }
        // 上（删除）：参考字缺失
        if i > 0 {
            let up = dp[at(i - 1, j)];
            if cur == up + 1 {
                ops.push(EditOp::Del(reference[i - 1]));
                i -= 1;
                continue;
            }
        }
        // 左（插入）：假设多出——DP 三者取最小，前两支不成立则左支必然最优
        ops.push(EditOp::Ins(hypothesis[j - 1]));
        j -= 1;
    }
    ops.reverse();
    ops
}

/// 单条文本画像（纯函数）：strip 口径后做差异回溯并归类计数。
///
/// @ai-context: 任一侧超过 MAX_DIFF_CHARS → 返回空画像（诚实降级：
///              长文只走 CER 距离，画像必须段级做，见模块头注）。
pub fn profile(reference: &str, hypothesis: &str) -> ConfusionProfile {
    let ref_chars = strip_punct(reference);
    let hyp_chars = strip_punct(hypothesis);
    if ref_chars.len() > MAX_DIFF_CHARS || hyp_chars.len() > MAX_DIFF_CHARS {
        return ConfusionProfile::default();
    }
    let mut p = ConfusionProfile::default();
    for op in diff_ops(&ref_chars, &hyp_chars) {
        match op {
            EditOp::Match(_) => {}
            EditOp::Sub(a, b) => p.substitutions.push((a, b)),
            EditOp::Ins(_) => p.insertions += 1,
            EditOp::Del(_) => p.deletions += 1,
        }
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── diff_ops 基础 ──

    #[test]
    fn identical_text_all_match() {
        let chars: Vec<char> = "完全一致".chars().collect();
        let ops = diff_ops(&chars, &chars);
        assert!(ops.iter().all(|op| matches!(op, EditOp::Match(_))));
        assert_eq!(ops.len(), 4);
    }

    #[test]
    fn single_substitution_detected() {
        // 熵减 → 熵增：末字被顶替
        let a: Vec<char> = "熵减".chars().collect();
        let b: Vec<char> = "熵增".chars().collect();
        let ops = diff_ops(&a, &b);
        assert_eq!(
            ops,
            vec![EditOp::Match('熵'), EditOp::Sub('减', '增')]
        );
    }

    #[test]
    fn insertion_counted_separately() {
        // 假设多一个"的"：插入
        let a: Vec<char> = "概念".chars().collect();
        let b: Vec<char> = "的概念".chars().collect();
        let ops = diff_ops(&a, &b);
        assert!(ops.iter().any(|op| matches!(op, EditOp::Ins('的'))));
        assert!(!ops.iter().any(|op| matches!(op, EditOp::Del(_))));
    }

    #[test]
    fn deletion_counted_separately() {
        let a: Vec<char> = "的概念".chars().collect();
        let b: Vec<char> = "概念".chars().collect();
        let ops = diff_ops(&a, &b);
        assert!(ops.iter().any(|op| matches!(op, EditOp::Del('的'))));
        assert!(!ops.iter().any(|op| matches!(op, EditOp::Ins(_))));
    }

    // ── profile（strip 口径）──

    #[test]
    fn profile_punctuation_ignored() {
        // 标点差异不产生替换对（与 CER strip_punct 同口径）
        let p = profile("今天讲熵减。", "今天讲熵减，");
        assert_eq!(p.substitutions, Vec::<(char, char)>::new());
        assert_eq!(p.insertions, 0);
        assert_eq!(p.deletions, 0);
    }

    #[test]
    fn profile_homophone_pair_recorded() {
        // 同音错（示范数据）："必须" 被写成 "毕需"
        let p = profile("必须掌握", "毕需掌握");
        assert!(p.substitutions.contains(&('须', '需')), "{:?}", p.substitutions);
    }

    #[test]
    fn profile_overlong_input_degrades_empty() {
        // 超长护栏：诚实降级为空画像（不爆内存）
        let long_a = "字".repeat(MAX_DIFF_CHARS + 1);
        let p = profile(&long_a, &long_a);
        assert_eq!(p.substitutions, Vec::<(char, char)>::new());
    }

    // ── 聚合器 ──

    #[test]
    fn aggregator_sums_and_orders() {
        let mut agg = ConfusionAggregator::default();
        let p1 = profile("必须掌握", "毕需掌握");
        let p2 = profile("必须要会", "毕需要会");
        agg.add(&p1);
        agg.add(&p2);
        let top = agg.top_n(5);
        // 两个错对各出现 2 次；并列按 (a,b) 字典序稳定（'必'<'须'）
        assert_eq!(top.first().map(|(k, n)| (*k, *n)), Some((('必', '毕'), 2)));
        assert!(top.iter().any(|(k, n)| *k == ('须', '需') && *n == 2), "{top:?}");
    }

    #[test]
    fn aggregator_top_n_caps_and_empty() {
        let agg = ConfusionAggregator::default();
        assert!(agg.top_n(10).is_empty());
        let p = profile("必须掌握", "毕需掌握");
        let mut agg2 = ConfusionAggregator::default();
        agg2.add(&p);
        assert_eq!(agg2.top_n(0).len(), 0);
        assert_eq!(agg2.top_n(1).len(), 1);
    }
}
