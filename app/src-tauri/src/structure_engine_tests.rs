//! 结构引擎纯逻辑单测（REQ-047/049/050 模型版）。
//!
//! @ai-context: AAA 模式；覆盖模型就绪判定（按需启用）与公式模型类型推断。
//!              不加载真实模型（集成测试标注，CI 安全）。

use super::*;

fn models() -> StructureModels {
    StructureModels {
        layout: "models/structure/pp-doclayout-l.onnx".into(),
        table: Some("models/structure/slanet_plus_v2.onnx".into()),
        table_cls: Some("models/structure/pp-lcnet_x1_0_table_cls.onnx".into()),
        table_dict: Some("models/structure/table_structure_dict_ch.txt".into()),
        formula: Some("models/structure/pp-formulanet-s.onnx".into()),
        formula_tokenizer: Some("models/structure/pp-formulanet-tokenizer.json".into()),
    }
}

#[test]
fn ready_flags_false_when_files_missing() {
    // Arrange：默认路径文件不存在（测试环境无模型）
    let m = models();
    // Act/Assert：就绪判定全 false（按需启用——文件缺失能力禁用）
    assert!(!m.layout_ready());
    assert!(!m.table_ready());
    assert!(!m.formula_ready());
}

#[test]
fn ready_flags_true_with_temp_files() {
    // Arrange：tempfile 放置占位文件
    let dir = tempfile::tempdir().unwrap();
    let touch = |name: &str| {
        let p = dir.path().join(name);
        std::fs::write(&p, b"placeholder").unwrap();
        p
    };
    let m = StructureModels {
        layout: touch("pp-doclayout-l.onnx").to_string_lossy().into_owned(),
        table: Some(touch("slanet_plus_v2.onnx").to_string_lossy().into_owned()),
        table_cls: None,
        table_dict: Some(touch("table_structure_dict_ch.txt").to_string_lossy().into_owned()),
        formula: Some(touch("pp-formulanet-s.onnx").to_string_lossy().into_owned()),
        formula_tokenizer: Some(touch("pp-formulanet-tokenizer.json").to_string_lossy().into_owned()),
    };
    // Act/Assert：全部就绪
    assert!(m.layout_ready());
    assert!(m.table_ready());
    assert!(m.formula_ready());
}

#[test]
fn ready_flags_partial_missing() {
    // Arrange：表格模型在但字典缺
    let dir = tempfile::tempdir().unwrap();
    let touch = |name: &str| {
        let p = dir.path().join(name);
        std::fs::write(&p, b"x").unwrap();
        p
    };
    let m = StructureModels {
        layout: touch("layout.onnx").to_string_lossy().into_owned(),
        table: Some(touch("slanet.onnx").to_string_lossy().into_owned()),
        table_cls: None,
        table_dict: None, // 缺字典 → 表格不完整
        formula: None,
        formula_tokenizer: None,
    };
    // Act/Assert：表格就绪=false（配套不全不启用）；版面就绪=true
    assert!(m.layout_ready());
    assert!(!m.table_ready());
    assert!(!m.formula_ready());
}

#[test]
fn formula_model_type_inferred_from_filename() {
    // 辅助闭包：与 build_engine 内同口径的类型推断
    let infer = |path: &str| {
        if path.contains("unimernet") { "unimernet" } else { "pp_formulanet" }
    };
    // Assert：默认档 → pp_formulanet；高精度档 → unimernet
    assert_eq!(infer("models/structure/pp-formulanet-s.onnx"), "pp_formulanet");
    assert_eq!(infer("models/structure/unimernet.onnx"), "unimernet");
}
