//! asr_eval 报告与回归门纯函数层（v0.20.0 / REQ-263，M1）。
//!
//! @ai-context: 目的——harness 的聚合统计与基线回归判定，纯逻辑与 IO 分离：
//!              均值/上下界、相对基线退化判定（退出码契约的数据依据）、
//!              汇总渲染。渲染只产文本（报告/表），不写文件（IO 在 bin）。
//! @ai-context: 回归门口径（v0.20.0 契约）——两侧均有 CER 时才可比：
//!              当前均值 > 基线均值 + 容差 → 判定退化（回归失败）；
//!              任一侧不可比（无参考/空）→ None（不误杀，诚实表达）。
//! @ai-context: 消费方为 bin/asr_eval.rs（crate 外），lib 内无调用方 →
//!              dead_code 豁免登记（同 cer.rs 先例）。

// 消费方在 bin（asr_eval.rs），lib 内无调用方
#![allow(dead_code)]

/// CER 集合统计。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CerStats {
    pub n: usize,
    pub mean: f32,
    pub min: f32,
    pub max: f32,
}

/// 聚合统计（纯函数）：空集合 → None（无参考样本不产统计）。
pub fn cer_stats(values: &[f32]) -> Option<CerStats> {
    if values.is_empty() {
        return None;
    }
    let n = values.len();
    let sum: f32 = values.iter().sum();
    let min = values.iter().copied().fold(f32::INFINITY, f32::min);
    let max = values.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    Some(CerStats { n, mean: sum / n as f32, min, max })
}

/// 相对基线回归判定（纯函数）：退化超容差 → true（回归失败）。
///
/// @ai-context: tolerance 口径与 cer.rs::recommend_preproc 同哲学
///              （0.01 级防单样本噪声翻转）；两侧 None → None。
pub fn is_regression(current: Option<f32>, baseline: Option<f32>, tolerance: f32) -> Option<bool> {
    match (current, baseline) {
        (Some(c), Some(b)) => Some(c > b + tolerance),
        _ => None,
    }
}

/// 汇总表渲染（纯函数）：样本名 → CER，无参考行带 "-"。
pub fn render_table(rows: &[(&str, Option<f32>)]) -> String {
    let mut out = String::from("样本,CER\n");
    for (name, cer) in rows {
        match cer {
            Some(v) => out.push_str(&format!("{name},{v:.4}\n")),
            None => out.push_str(&format!("{name},-\n")),
        }
    }
    out
}

/// 对比结论行（A/B 双路 CER 均值）：谁优 + 差值；任一侧不可比 → 平局说明。
pub fn ab_verdict(name: &str, a: Option<CerStats>, b: Option<CerStats>) -> String {
    let fmt = |s: Option<CerStats>| match s {
        Some(v) => format!("{:.4}", v.mean),
        None => "不可比".to_string(),
    };
    match (a, b) {
        (Some(x), Some(y)) => {
            let winner = if x.mean < y.mean { "开" } else { "关" };
            format!("{name}: 开预处理={} 关预处理={} → {winner}优（Δ={:.4}）", fmt(Some(x)), fmt(Some(y)), (x.mean - y.mean).abs())
        }
        _ => format!("{name}: 开={} 关={}（样本不足，不做结论）", fmt(a), fmt(b)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stats_mean_min_max() {
        let s = cer_stats(&[0.10, 0.20, 0.30]).unwrap();
        assert_eq!(s.n, 3);
        assert!((s.mean - 0.2).abs() < 1e-6);
        assert!((s.min - 0.1).abs() < 1e-6);
        assert!((s.max - 0.3).abs() < 1e-6);
    }

    #[test]
    fn stats_empty_is_none() {
        assert!(cer_stats(&[]).is_none());
    }

    #[test]
    fn regression_beyond_tolerance_fails() {
        assert_eq!(is_regression(Some(0.12), Some(0.10), 0.01), Some(true));
        assert_eq!(is_regression(Some(0.109), Some(0.10), 0.01), Some(false));
        assert_eq!(is_regression(Some(0.10), Some(0.10), 0.0), Some(false));
    }

    #[test]
    fn regression_unknown_side_is_none() {
        assert_eq!(is_regression(None, Some(0.1), 0.01), None);
        assert_eq!(is_regression(Some(0.1), None, 0.01), None);
        assert_eq!(is_regression(None, None, 0.01), None);
    }

    #[test]
    fn table_renders_dash_for_no_reference() {
        let out = render_table(&[("a.wav", Some(0.1234)), ("b.wav", None)]);
        assert!(out.contains("a.wav,0.1234"), "{out}");
        assert!(out.contains("b.wav,-\n"), "{out}");
    }

    #[test]
    fn ab_verdict_declares_winner_when_comparable() {
        let a = cer_stats(&[0.10]);
        let b = cer_stats(&[0.20]);
        let v = ab_verdict("样本集", a, b);
        assert!(v.contains("开优"), "{v}");
    }

    #[test]
    fn ab_verdict_no_claim_when_incomparable() {
        let v = ab_verdict("样本集", None, None);
        assert!(v.contains("不做结论"), "{v}");
    }
}
