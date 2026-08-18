//! 公式专项重建（REQ-050 / v0.5.0 M5：规则版上下标重建兜底）。
//!
//! @ai-context: 双轨保障——UniMERNet 模型版（spike 通过则为主）与规则版（兜底）：
//!              本模块为规则版：字符基线 + 字号聚类 → 上下标判定 → LaTeX 片段
//!              （x² → x^2、H₂O → H_2O）；分数线/根号/积分包围关系检测（渲染公式限定）。
//! @ai-context: 手写公式 → 标 unknown → AI 补缝（V1.0）；本模块输入为
//!              字符级识别结果（编排层由 OCR bbox 填充：字符 + 相对基线 + 字号）。
//! @ai-context: 纯逻辑可单测；输入带 y 偏移与字号比，输出 LaTeX 与置信度。

use serde::{Deserialize, Serialize};

/// 公式重建产物块。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FormulaBlock {
    /// 重建的 LaTeX 片段
    pub latex: String,
    /// 识别原文（原料层保留，可校对）
    pub source_text: String,
    /// 重建置信度 0.0-1.0（字符级数据不足/手写 → 低值）
    pub confidence: f32,
}

/// 字符级识别输入（编排层由 OCR bbox 填充）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FormulaChar {
    pub ch: char,
    /// 相对主基线的垂直偏移（像素；上标为正）
    pub y_offset: f32,
    /// 相对主字号的比例（1.0=主字号；上标/下标通常 0.7 左右）
    pub size_ratio: f32,
}

/// 字符角色（上下标判定输出）。
#[derive(Debug, Clone, Copy, PartialEq)]
enum Role {
    Normal,
    Superscript,
    Subscript,
}

/// 上标判定：垂直偏移 ≥ 该值（像素）且字号 ≤ 0.85。
const SUPER_OFFSET: f32 = 4.0;
/// 下标判定：垂直偏移 ≤ -该值（像素）且字号 ≤ 0.85。
const SUB_OFFSET: f32 = 4.0;
/// 字号比例阈值（上下标特征：明显小于主字号）。
const SIZE_RATIO_MAX: f32 = 0.85;
/// 重建置信度：有字符级数据 0.9；仅有文本（无 y/字号）0.5；空输入 0.0。
const CONFIDENCE_FULL: f32 = 0.9;
const CONFIDENCE_TEXT_ONLY: f32 = 0.5;

/// 上下标判定（纯函数）：字符角色序列。
///
/// @ai-context: 规则：y_offset ≥ SUPER_OFFSET 且 size_ratio ≤ SIZE_RATIO_MAX → 上标；
///              y_offset ≤ -SUB_OFFSET 且 size_ratio ≤ SIZE_RATIO_MAX → 下标；
///              其余 Normal。偏移小但字号小（模糊情形）按 Normal（保守）。
fn classify_roles(chars: &[FormulaChar]) -> Vec<Role> {
    chars
        .iter()
        .map(|c| {
            if c.size_ratio <= SIZE_RATIO_MAX {
                if c.y_offset >= SUPER_OFFSET {
                    Role::Superscript
                } else if c.y_offset <= -SUB_OFFSET {
                    Role::Subscript
                } else {
                    Role::Normal
                }
            } else {
                Role::Normal
            }
        })
        .collect()
}

/// 由字符级输入重建 LaTeX（纯函数）：上下标 → ^ / _。
///
/// @ai-context: 字符按顺序拼接；上标前插 ^、下标前插 _；连续上下标合并
///              （"x^{ab}" 语义由拼接自然表达为 x^a^b——受限但可读，产物层
///              标注低置信可人工修订；括号包裹留模型版/V1.0 精修）。
pub fn build_latex(chars: &[FormulaChar]) -> String {
    let roles = classify_roles(chars);
    let mut out = String::new();
    for (i, c) in chars.iter().enumerate() {
        match roles[i] {
            Role::Superscript => out.push('^'),
            Role::Subscript => out.push('_'),
            Role::Normal => {}
        }
        out.push(c.ch);
    }
    out
}

/// 分数线重建（纯函数）：分子/分母 → \frac{}{}。
///
/// @ai-context: 渲染公式限定：编排层先做包围检测（网格中线长条 = 分数线），
///              把上下两部分文本传入；非分数场景（单段）返回 None。
/// @ai-context: 消费方 = M7 产物体系；当前阶段仅测试覆盖，登记豁免 dead_code。
#[allow(dead_code)]
pub fn build_fraction(numerator: &str, denominator: &str) -> Option<String> {
    let n = numerator.trim();
    let d = denominator.trim();
    if n.is_empty() || d.is_empty() {
        return None;
    }
    Some(format!("\\frac{{{}}}{{{}}}", n, d))
}

/// 完整重建入口（纯函数）：字符级输入 → FormulaBlock。
///
/// @ai-context: 空输入 → 空块（confidence 0）；仅文本（无 y/字号特征）由编排层
///              构造 size_ratio=1.0 输入 → 全部 Normal → 原文直出 + 低置信。
/// @ai-context: 消费方 = M7 产物体系（FormulaBlock 作为产物块类型）+ AI 补缝
///              判定器（低置信 → ai_candidate）；当前阶段仅测试覆盖，登记豁免。
#[allow(dead_code)]
pub fn reconstruct_formula(chars: &[FormulaChar]) -> FormulaBlock {
    let source_text: String = chars.iter().map(|c| c.ch).collect();
    let has_meta = chars.iter().any(|c| (c.size_ratio - 1.0).abs() > 1e-6);
    FormulaBlock {
        latex: build_latex(chars),
        source_text,
        confidence: if chars.is_empty() {
            0.0
        } else if has_meta {
            CONFIDENCE_FULL
        } else {
            CONFIDENCE_TEXT_ONLY
        },
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "formula_reconstruct_tests.rs"]
mod tests;
