//! 结构模型清单与下载器单测（REQ-047/049/050 模型版）。
//!
//! @ai-context: AAA 模式；覆盖文件清单查表（含公式档位切换）、状态机默认值。

use super::*;

#[test]
fn layout_files_are_doclayout_l() {
    // Act：版面模型清单（高精度档 pp-doclayout-l）
    let files = files_for(StructureModelKind::Layout, false);
    // Assert：单文件 doclayout-l 129MB
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].name, "pp-doclayout-l.onnx");
    assert!(files[0].size_mb >= 100, "高精度版面模型应 ≥100MB");
}

#[test]
fn table_files_include_slanet_and_dict() {
    // Act
    let files = files_for(StructureModelKind::Table, false);
    // Assert：SLANet v2 + 字典 + 表格分类
    let names: Vec<&str> = files.iter().map(|f| f.name).collect();
    assert!(names.contains(&"slanet_plus_v2.onnx"));
    assert!(names.contains(&"table_structure_dict_ch.txt"));
    assert!(names.contains(&"pp-lcnet_x1_0_table_cls.onnx"));
}

#[test]
fn formula_default_is_pp_formulanet() {
    // Act：默认档（轻量）
    let files = files_for(StructureModelKind::Formula, false);
    let names: Vec<&str> = files.iter().map(|f| f.name).collect();
    // Assert：PP-FormulaNet-s + tokenizer（不含 1.84GB UniMERNet）
    assert!(names.contains(&"pp-formulanet-s.onnx"));
    assert!(!names.iter().any(|n| n.contains("unimernet")), "默认档不应含 UniMERNet");
}

#[test]
fn formula_high_accuracy_switches_to_unimernet() {
    // Act：高精度档（用户切换）
    let files = files_for(StructureModelKind::Formula, true);
    let names: Vec<&str> = files.iter().map(|f| f.name).collect();
    // Assert：UniMERNet 1.84GB + tokenizer 双件
    assert!(names.contains(&"unimernet.onnx"));
    assert!(names.contains(&"unimernet_tokenizer.json"));
    assert!(!names.iter().any(|n| n.contains("pp-formulanet")), "高精度档不应含 PP-FormulaNet");
    // 体积提示（设置面板显示"大模型"警告）
    let unimernet = files.iter().find(|f| f.name == "unimernet.onnx").unwrap();
    assert!(unimernet.size_mb > 1000, "UniMERNet 应为 1.8GB 级大模型");
}

#[test]
fn downloader_status_default_idle() {
    // Arrange
    let dl = StructureModelDownloader::new();
    // Act/Assert：未启动 → idle
    assert_eq!(dl.status(StructureModelKind::Layout).state, "idle");
    let all = dl.all_statuses();
    assert_eq!(all.len(), 3);
    assert!(all.iter().all(|s| s.state == "idle"));
}

#[test]
fn downloader_statuses_track_kinds() {
    // Arrange：手动注入状态（模拟下载中）
    let dl = StructureModelDownloader::new();
    {
        let mut st = dl.statuses.lock().unwrap();
        st.insert(
            StructureModelKind::Table,
            StructureDownloadStatus {
                kind: StructureModelKind::Table,
                state: "downloading".into(),
                current_file: Some("slanet_plus_v2.onnx".into()),
                downloaded_bytes: 0,
                total_bytes: 0,
                error: None,
            },
        );
    }
    // Act
    let s = dl.status(StructureModelKind::Table);
    // Assert：状态可查
    assert_eq!(s.state, "downloading");
    assert_eq!(s.current_file.as_deref(), Some("slanet_plus_v2.onnx"));
}
