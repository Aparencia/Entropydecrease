//! 结构模型档位配置单测（REQ-050 模型版）。
//!
//! @ai-context: AAA 模式；覆盖档位 roundtrip/损坏回退/文件名映射。

use super::*;

#[test]
fn default_tier_is_pp_formulanet() {
    // Act/Assert：默认档 = PP-FormulaNet（轻量优先）
    assert_eq!(StructureTierConfig::default().formula_tier, FormulaTier::PFormulaNet);
}

#[test]
fn tier_file_mapping() {
    // Assert：档位 → 模型/tokenizer 文件（装配路径解析依赖）
    assert_eq!(FormulaTier::PFormulaNet.model_file(), "pp-formulanet-s.onnx");
    assert_eq!(FormulaTier::PFormulaNet.tokenizer_file(), "pp-formulanet-tokenizer.json");
    assert_eq!(FormulaTier::UniMERNet.model_file(), "unimernet.onnx");
    assert_eq!(FormulaTier::UniMERNet.tokenizer_file(), "unimernet_tokenizer.json");
    // oar-ocr 模型类型契约
    assert_eq!(FormulaTier::PFormulaNet.model_type(), "pp_formulanet");
    assert_eq!(FormulaTier::UniMERNet.model_type(), "unimernet");
}

#[test]
fn config_roundtrip_and_corrupt_fallback() {
    // Arrange：写配置 → 读回
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("structure_tier.json");
    let cfg = StructureTierConfig { formula_tier: FormulaTier::UniMERNet };
    // Act
    cfg.save(&path).unwrap();
    let loaded = StructureTierConfig::load(&path);
    // Assert：roundtrip 无损
    assert_eq!(loaded, cfg);
    // 损坏文件 → 默认档（防御：不阻断启动）
    std::fs::write(&path, "{broken").unwrap();
    assert_eq!(StructureTierConfig::load(&path), StructureTierConfig::default());
    // 缺失文件 → 默认档
    assert_eq!(
        StructureTierConfig::load(&dir.path().join("none.json")),
        StructureTierConfig::default()
    );
}

#[test]
fn tier_serializes_kebab_case() {
    // Act：序列化契约（serde kebab-case：UniMERNet → uni-mer-net）
    let raw = serde_json::to_string(&FormulaTier::UniMERNet).unwrap();
    // Assert：前端/装配共享标识
    assert_eq!(raw, "\"uni-mer-net\"");
    // 反序列化对称（持久化配置回读）
    let back: FormulaTier = serde_json::from_str(&raw).unwrap();
    assert_eq!(back, FormulaTier::UniMERNet);
}
