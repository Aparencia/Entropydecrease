//! 结构模型档位配置（REQ-050 模型版：公式 PP-FormulaNet/UniMERNet 档位持久化）。
//!
//! @ai-context: 审查 H3 修复——原实现 `structure_model_paths` 硬编码 pp-formulanet，
//!              用户切换 UniMERNet 高精度档并下载后装配路径不匹配（公式精修跳过）。
//!              档位以 JSON 持久化（应用数据目录，路径可注入），装配路径按档位解析。
//! @ai-context: 与 profile_memory 同模式：锁内 read-modify-write 防 TOCTOU。

use serde::{Deserialize, Serialize};

/// 公式模型档位。
///
/// @ai-context: serde kebab-case 对连续大写（UniMERNet）会拆成 "uni-m-e-r-net"——
///              显式 rename 钉住契约（前端/装配/持久化共享标识）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FormulaTier {
    /// PP-FormulaNet-s（默认，231MB）
    PFormulaNet,
    /// UniMERNet（高精度，1.84GB）
    #[serde(rename = "uni-mer-net")]
    UniMERNet,
}

impl FormulaTier {
    /// 档位对应的模型文件名。
    pub fn model_file(self) -> &'static str {
        match self {
            FormulaTier::PFormulaNet => "pp-formulanet-s.onnx",
            FormulaTier::UniMERNet => "unimernet.onnx",
        }
    }

    /// 档位对应的 tokenizer 文件名。
    pub fn tokenizer_file(self) -> &'static str {
        match self {
            FormulaTier::PFormulaNet => "pp-formulanet-tokenizer.json",
            FormulaTier::UniMERNet => "unimernet_tokenizer.json",
        }
    }

    /// 引擎装配的模型类型标识（oar-ocr 契约）。
    pub fn model_type(self) -> &'static str {
        match self {
            FormulaTier::PFormulaNet => "pp_formulanet",
            FormulaTier::UniMERNet => "unimernet",
        }
    }
}

/// 结构模型档位配置（当前仅公式档位；版面/表格无档位概念）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StructureTierConfig {
    pub formula_tier: FormulaTier,
}

impl Default for StructureTierConfig {
    fn default() -> Self {
        Self { formula_tier: FormulaTier::PFormulaNet }
    }
}

impl StructureTierConfig {
    /// 从磁盘加载；文件不存在/损坏 → 默认档（防御：不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        let Ok(raw) = std::fs::read_to_string(path) else { return Self::default() };
        serde_json::from_str(&raw).unwrap_or_default()
    }

    /// 原子写（先 .tmp 再 rename，防写一半损坏配置）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Io(format!("序列化结构档位失败: {}", e)))?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "structure_tier_tests.rs"]
mod tests;
