//! 精修输出预算化（REQ-290 ②，v0.19.7）——档位缩放纯函数。
//!
//! @ai-context: 精修"1 分钟+"的物理大头=单片非流式生成（DeepSeek 长输出实测
//!              ~110s@20k token，ai_client 注释证据）。原单请求 max_tokens=20000
//!              只为最坏档（≤8000 字输入 → 结构化输出最坏 ~15k token）服务，
//!              常态生成远短——收紧上限 + 提示词引导字数可显著减少长尾空转。
//!              预算只做上限收窄（≤ 原 20000），不改变档位语义与协议校验。

/// 输出预算（按档位从切片输入字符换算；见 output_budget）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OutputBudget {
    /// 单请求 max_tokens（后端硬顶，防长尾空转；≤ 原 20000 上限）
    pub max_tokens: u32,
    /// 提示词引导字数（中文正文量级——含列表/表格原文长度）
    pub guidance_chars: usize,
}

/// 档位输出缩放（相对切片输入长度）与 token 上限。
///
/// @ai-context 依据（2026-08-21 真机 + ai_client 注释证据）：单片 ≤8000 字输入、
///              结构化输出最坏 ~15k token——20k 上限只为最坏档服务，常态生成
///              远短，模型长尾空转吃掉大量"1 分钟+"。按档位收紧：忠实/标准
///              保持高上限（防截断毁 JSON 校验），极简提取激进收敛。
fn budget_params(preset_id: &str) -> (f64, u32) {
    match preset_id {
        // faithful=忠实整理（输出≈输入长度）· deep=深度改写（转述+导语≈输入）；
        // 最坏档 8000 字片需 ~15k token 且 20k 为旧上限——18k 保留 ≥3k 包装余量
        // （审查 B5：16k 余量 <1k 会让合法长输出先被截断再 Parse 失败）
        "faithful" => (1.0, 18_000),
        "standard" | "" => (0.9, 18_000),
        "deep" => (0.95, 18_000),
        "minimal" => (0.3, 9_000),
        // custom 无档位语义 → 按标准兜底（REQ-279 已声明后端兜底口径）
        _ => (0.9, 18_000),
    }
}

/// 输出预算换算（纯函数可单测）：
/// guidance ≈ 输入字符 × 档位缩放（下限 200，防空输入给出 0 引导）；
/// max_tokens = guidance × 2 + 1500（中文 ~1.5–2 token/字 + JSON 包装余量），
/// 下限 4000（结构化响应安全垫，防截断致 Parse 失败），按档位上限截断。
pub fn output_budget(preset_id: &str, content_chars: usize) -> OutputBudget {
    let (scale, cap) = budget_params(preset_id);
    let guidance_chars = ((content_chars as f64 * scale).round() as usize).max(200);
    let tokens = ((guidance_chars as u64) * 2 + 1500).clamp(4_000, cap as u64);
    OutputBudget { max_tokens: tokens as u32, guidance_chars }
}

/// 档位输出引导段（追加在 system 提示词尾部——所见即所发预览不含本段：
/// 预算为逐片动态值，预览为静态系统文本，二者不承诺一致，注释如实）。
pub fn guidance_suffix(budget: &OutputBudget) -> String {
    format!(
        "【输出长度】本片请把内容（含列表/表格原文）控制在约 {} 字以内：删除冗余表达，但保留全部事实、术语与原文结构；宁精炼不堆叠。",
        budget.guidance_chars
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_content_still_gets_safety_floor() {
        let b = output_budget("standard", 0);
        assert_eq!(b.guidance_chars, 200);
        assert!(b.max_tokens >= 4000, "结构化响应安全垫下限");
    }

    #[test]
    fn minimal_preset_converges_hardest() {
        // 4000 字输入：standard≈9000 token 上限 vs minimal 显著更紧
        let standard = output_budget("standard", 4000);
        let minimal = output_budget("minimal", 4000);
        assert!(standard.guidance_chars > minimal.guidance_chars);
        assert!(standard.max_tokens > minimal.max_tokens);
        assert_eq!(minimal.guidance_chars, 1200);
    }

    #[test]
    fn caps_never_exceed_legacy_20000() {
        for preset in ["faithful", "standard", "deep", "minimal", "custom", "unknown-x"] {
            let b = output_budget(preset, 8000);
            assert!(b.max_tokens <= 20000, "preset={} tokens={}", preset, b.max_tokens);
        }
    }

    #[test]
    fn guidance_suffix_contains_budget_chars() {
        let b = output_budget("minimal", 3000);
        let suffix = guidance_suffix(&b);
        assert!(suffix.contains(&b.guidance_chars.to_string()));
    }
}
