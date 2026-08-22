//! commands_refine_inner 单测（v0.11.5 懒自动化：待精修候选端到端幂等）。
//!
//! @ai-context: 内存库 + 临时图片目录（环境隔离，绝不触碰真实文件）；覆盖
//!              pending_candidates 全链路：OCR 区域记录 → 裁剪图匹配 → 幂等过滤
//!              （产物模型版结构块即标记——已精修区域跳过）；原内部测试模块
//!              （html 转换/best_table）整体迁入（模块化 ≤300 行）。

use super::*;
use oar_ocr::domain::structure::{TableResult, TableType};
use oar_ocr::processors::BoundingBox;
use crate::artifact::{ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource, SessionArtifact};
use crate::db::Db;
use crate::types::{NewSession, NewSessionOcrBlock};

/// 内存库 + 会话夹具（环境隔离）。
fn mem_db_with_session() -> (Db, i64) {
    let db = Db::open(":memory:").expect("内存库打开成功");
    let session = db
        .create_session(&NewSession {
            title: "精修幂等测试".to_string(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .expect("会话创建成功");
    (db, session.id)
}

/// 结构区域 OCR 块（region_kind=table/formula——精修候选数据源）。
fn ocr_block(session_id: i64, ts: u64, kind: &str) -> NewSessionOcrBlock {
    NewSessionOcrBlock {
        session_id,
        timestamp_ms: ts,
        text: format!("区域 {}", ts),
        score: 0.9,
        region: "full".to_string(),
        region_kind: Some(kind.to_string()),
        bbox: None,
        screen_id: Some(1),
    }
}

/// 建裁剪图文件（crop/<ts>.webp；list_crops 只校验扩展名）。
fn touch_crop(session_images_dir: &std::path::Path, ts: u64) {
    let crop_dir = session_images_dir.join("crop");
    std::fs::create_dir_all(&crop_dir).expect("建 crop 目录成功");
    std::fs::write(crop_dir.join(format!("{}.webp", ts)), b"fake").expect("写裁剪图成功");
}

/// 已精修产物块（模型版回填形态：kind + frame_ms 对齐区域时刻）。
fn refined_block(kind: ArtifactKind, frame_ms: u64) -> ArtifactBlock {
    ArtifactBlock {
        id: 0,
        kind,
        refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(frame_ms) },
        payload: BlockPayload::Table(crate::table_reconstruct::TableBlock {
            markdown: "|A|B|".into(),
            structure_confidence: 0.9,
            cell_refs: Vec::new(),
        }),
        order: 0,
        source: BlockSource::Local,
    }
}

#[test]
fn pending_candidates_detects_unrefined_regions() {
    // Arrange：会话 + table@1000 OCR 块 + 裁剪图（未精修——无产物）
    let (db, sid) = mem_db_with_session();
    db.add_ocr_block(&ocr_block(sid, 1000, "table")).expect("落库成功");
    let dir = tempfile::tempdir().expect("tempdir 成功");
    let images_dir = dir.path().join("session-images").join(sid.to_string());
    touch_crop(&images_dir, 1000);
    // Act
    let pending = super::pending_candidates(&db, &images_dir, sid).expect("查询成功");
    // Assert：检测到未精修区域（懒自动化触发条件成立）
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].kind, "table");
    assert_eq!(pending[0].time_ms, 1000);
}

#[test]
fn pending_candidates_skips_already_refined_end_to_end() {
    // Arrange：会话 + 两个结构区域 + 裁剪图；table@1000 已精修（产物块），formula@2000 未精修
    let (db, sid) = mem_db_with_session();
    db.add_ocr_block(&ocr_block(sid, 1000, "table")).expect("落库成功");
    db.add_ocr_block(&ocr_block(sid, 2000, "formula")).expect("落库成功");
    let dir = tempfile::tempdir().expect("tempdir 成功");
    let images_dir = dir.path().join("session-images").join(sid.to_string());
    touch_crop(&images_dir, 1000);
    touch_crop(&images_dir, 2000);
    let artifact = SessionArtifact {
        session_id: sid,
        profile: String::new(),
        blocks: vec![refined_block(ArtifactKind::Table, 1000)],
    };
    db.replace_artifact(&artifact).expect("产物落库成功");
    // Act：自动精修入口的数据层检查（停止后触发/详情进入懒触发共用）
    let pending = super::pending_candidates(&db, &images_dir, sid).expect("查询成功");
    // Assert：已精修屏跳过，未精修保留（幂等——双触发通道防重）
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].kind, "formula");
    assert_eq!(pending[0].time_ms, 2000);
}

#[test]
fn pending_candidates_no_pending_when_all_refined() {
    // Arrange：唯一结构区域已精修
    let (db, sid) = mem_db_with_session();
    db.add_ocr_block(&ocr_block(sid, 1000, "table")).expect("落库成功");
    let dir = tempfile::tempdir().expect("tempdir 成功");
    let images_dir = dir.path().join("session-images").join(sid.to_string());
    touch_crop(&images_dir, 1000);
    let artifact = SessionArtifact {
        session_id: sid,
        profile: String::new(),
        blocks: vec![refined_block(ArtifactKind::Table, 1000)],
    };
    db.replace_artifact(&artifact).expect("产物落库成功");
    // Act
    let pending = super::pending_candidates(&db, &images_dir, sid).expect("查询成功");
    // Assert：空（auto_refine_session 快速返回 no-pending 的条件）
    assert!(pending.is_empty());
}

#[test]
fn pending_candidates_empty_without_crops() {
    // Arrange：OCR 记录存在但裁剪图未保存（模型未启用时实时链路不存图）
    let (db, sid) = mem_db_with_session();
    db.add_ocr_block(&ocr_block(sid, 1000, "table")).expect("落库成功");
    let dir = tempfile::tempdir().expect("tempdir 成功");
    let images_dir = dir.path().join("session-images").join(sid.to_string());
    // Act：无 crop 目录（list_crops 读空 → 空清单）
    let pending = super::pending_candidates(&db, &images_dir, sid).expect("查询成功");
    // Assert：空（不白跑精修）
    assert!(pending.is_empty());
}

// ── 原内部测试模块迁入（html 转换 + best_table 选择）──

fn table_result(x1: f32, y1: f32, x2: f32, y2: f32) -> TableResult {
    TableResult {
        bbox: BoundingBox::from_coords(x1, y1, x2, y2),
        table_type: TableType::Wired,
        classification_confidence: Some(0.9),
        structure_confidence: Some(0.8),
        cells: Vec::new(),
        html_structure: Some("<table></table>".into()),
        cell_texts: None,
        structure_tokens: None,
        detected_cell_bboxes: None,
        is_e2e: false,
    }
}

fn structure_result(tables: Vec<TableResult>) -> oar_ocr::domain::structure::StructureResult {
    oar_ocr::domain::structure::StructureResult {
        input_path: "test".into(),
        index: 0,
        layout_elements: Vec::new(),
        tables,
        formulas: Vec::new(),
        text_regions: None,
        orientation_angle: None,
        region_blocks: None,
        page_continuation_flags: None,
        rectified_img: None,
    }
}

#[test]
fn html_table_converts_to_markdown() {
    // Arrange：SLANet 典型 html 结构输出
    let html = "<table><tr><td>姓名</td><td>年龄</td></tr><tr><td>张三</td><td>25</td></tr></table>";
    // Act
    let md = _html_to_markdown_for_test(html);
    // Assert：表头/数据行
    assert!(md.contains("|姓名|年龄|"));
    assert!(md.contains("|张三|25|"));
}

#[test]
fn html_empty_returns_empty() {
    // Assert：空/空白输入 → 空串（产物层低置信标记）
    assert_eq!(_html_to_markdown_for_test(""), "");
    assert_eq!(_html_to_markdown_for_test("   "), "");
}

#[test]
fn html_th_cells_included() {
    // Arrange：th 表头
    let html = "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>";
    // Act
    let md = _html_to_markdown_for_test(html);
    // Assert
    assert!(md.contains("|A|B|"));
    assert!(md.contains("|1|2|"));
}

#[test]
fn html_malformed_does_not_crash() {
    // Act/Assert：畸形标签防御（不 panic）
    let md = _html_to_markdown_for_test("<table><tr><td>只有开头");
    assert!(!md.contains('<')); // 未闭合的 cell 内容不产生垃圾
}

#[test]
fn best_table_picks_largest_bbox() {
    // Arrange（审查 M3 回归：多候选时选 bbox 面积最大者——裁剪图区域本体）
    let result = structure_result(vec![
        table_result(0.0, 0.0, 100.0, 100.0),  // 小表格（干扰）
        table_result(0.0, 0.0, 400.0, 300.0),  // 大表格（区域本体）
    ]);
    // Act
    let best = best_table(&result, None);
    // Assert：选面积最大的
    assert!(best.is_some());
    let bb = &best.unwrap().bbox;
    assert!((bb.x_max() - bb.x_min()) > 300.0);
}

#[test]
fn best_table_single_or_empty() {
    // Assert：无表格 → None；单表格 → 该表格
    let empty = structure_result(Vec::new());
    assert!(best_table(&empty, None).is_none());
    let single = structure_result(vec![table_result(0.0, 0.0, 10.0, 10.0)]);
    assert!(best_table(&single, None).is_some());
}
