//! 课后结构精修调度单测（REQ-047/049/050 模型版）。
//!
//! @ai-context: AAA 模式；覆盖待精修清单构建（类型过滤/时间戳匹配/排序）
//!              与降级决策矩阵、幂等过滤（v0.11.5：已精修区域跳过）。

use super::*;
use crate::artifact::{ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource, SessionArtifact};
use crate::table_reconstruct::TableBlock;

/// 已精修产物块夹具（Table/Formula + frame_ms 对齐区域时刻——精修回填形态）。
fn refined_block(kind: ArtifactKind, frame_ms: u64, order: u32) -> ArtifactBlock {
    ArtifactBlock {
        id: 0,
        kind,
        refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(frame_ms) },
        payload: match kind {
            ArtifactKind::Table => BlockPayload::Table(TableBlock {
                markdown: "|A|B|".into(),
                structure_confidence: 0.9,
                cell_refs: Vec::new(),
            }),
            _ => BlockPayload::Formula(crate::formula_reconstruct::FormulaBlock {
                latex: "x^2".into(),
                source_text: String::new(),
                confidence: 0.9,
            }),
        },
        order,
        source: BlockSource::Local,
    }
}

#[test]
fn auto_refine_skips_already_refined() {
    // Arrange：混合候选（table@1000/formula@2000 已精修；table@5000 未精修）
    let candidates = vec![
        RefineCandidate { kind: "table".into(), crop_image: "full/1000.webp".into(), time_ms: 1000 },
        RefineCandidate { kind: "formula".into(), crop_image: "full/2000.webp".into(), time_ms: 2000 },
        RefineCandidate { kind: "table".into(), crop_image: "full/5000.webp".into(), time_ms: 5000 },
    ];
    let artifact = SessionArtifact {
        session_id: 1,
        profile: String::new(),
        blocks: vec![
            refined_block(ArtifactKind::Table, 1000, 0),
            refined_block(ArtifactKind::Formula, 2000, 1),
        ],
    };
    // Act：自动精修入口的数据层过滤
    let pending = filter_refined_candidates(candidates, Some(&artifact));
    // Assert：已精修屏跳过，未精修保留（幂等——不重复推理）
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].kind, "table");
    assert_eq!(pending[0].time_ms, 5000);
}

#[test]
fn auto_refine_no_pending_when_all_refined() {
    // Arrange：全部候选已精修（产物块与候选一一对应）
    let candidates = vec![RefineCandidate {
        kind: "table".into(),
        crop_image: "full/1000.webp".into(),
        time_ms: 1000,
    }];
    let artifact = SessionArtifact {
        session_id: 1,
        profile: String::new(),
        blocks: vec![refined_block(ArtifactKind::Table, 1000, 0)],
    };
    // Act
    let pending = filter_refined_candidates(candidates, Some(&artifact));
    // Assert：空（no-pending 快速返回路径）
    assert!(pending.is_empty());
}

#[test]
fn auto_refine_first_run_keeps_all_without_artifact() {
    // Arrange：无产物（首跑/规则版重建后）
    let candidates = vec![RefineCandidate {
        kind: "table".into(),
        crop_image: "full/1000.webp".into(),
        time_ms: 1000,
    }];
    // Act：产物 None → 全量保留
    let pending = filter_refined_candidates(candidates, None);
    // Assert
    assert_eq!(pending.len(), 1);
}

#[test]
fn auto_refine_kind_mismatch_keeps_candidate() {
    // Arrange：产物有 table@1000，候选是 formula@1000（同刻不同类型——不互认）
    let candidates = vec![RefineCandidate {
        kind: "formula".into(),
        crop_image: "full/1000.webp".into(),
        time_ms: 1000,
    }];
    let artifact = SessionArtifact {
        session_id: 1,
        profile: String::new(),
        blocks: vec![refined_block(ArtifactKind::Table, 1000, 0)],
    };
    // Act
    let pending = filter_refined_candidates(candidates, Some(&artifact));
    // Assert：类型不同 → 仍需精修
    assert_eq!(pending.len(), 1);
}

#[test]
fn build_candidates_filters_and_matches() {
    // Arrange：混合区域记录 + 图片库
    let records = vec![
        ("table".to_string(), 1000),
        ("formula".to_string(), 2000),
        ("text".to_string(), 3000), // 非精修类型
        ("table".to_string(), 5000), // 无裁剪图（未保存）
    ];
    let images = vec!["full/1000.webp".to_string(), "full/2000.webp".to_string()];
    // Act
    let candidates = build_refine_candidates(&records, &images);
    // Assert：仅 table/formula 且图片存在；按时间升序
    assert_eq!(candidates.len(), 2);
    assert_eq!(candidates[0].kind, "table");
    assert_eq!(candidates[0].time_ms, 1000);
    assert_eq!(candidates[1].kind, "formula");
}

#[test]
fn build_candidates_matches_crop_namespace() {
    // Arrange：crop/ 命名空间（H2 分离后结构区域存裁剪图——懒自动化主路径）
    let records = vec![("table".to_string(), 1000)];
    let images = vec!["crop/1000.webp".to_string()];
    // Act
    let candidates = build_refine_candidates(&records, &images);
    // Assert：命中且携带实际存在的 crop/ 路径（refine_one 按此读图）
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].crop_image, "crop/1000.webp");
}

#[test]
fn build_candidates_legacy_full_fallback() {
    // Arrange：旧数据（H2 前结构区域图在归档关键帧命名空间）
    let records = vec![("table".to_string(), 1000)];
    let images = vec!["full/1000.webp".to_string()];
    // Act
    let candidates = build_refine_candidates(&records, &images);
    // Assert：兼容命中（历史会话可精修）
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].crop_image, "full/1000.webp");
}

#[test]
fn build_candidates_requires_crop_image() {
    // Arrange：记录存在但图片未保存（模型未启用时）
    let records = vec![("table".to_string(), 1000)];
    let images: Vec<String> = Vec::new();
    // Act
    let candidates = build_refine_candidates(&records, &images);
    // Assert：无候选（精修跳过）
    assert!(candidates.is_empty());
}

#[test]
fn decide_refine_all_ready_starts() {
    // Arrange：三模型就绪 + 有候选
    let candidates = vec![RefineCandidate {
        kind: "table".into(),
        crop_image: "full/1000.webp".into(),
        time_ms: 1000,
    }];
    // Act
    let (go, reason) = decide_refine(true, true, true, &candidates);
    // Assert：启动精修
    assert!(go);
    assert!(reason.is_empty());
}

#[test]
fn decide_refine_missing_formula_model_skips() {
    // Arrange：公式候选但 formula 模型未下载
    let candidates = vec![RefineCandidate {
        kind: "formula".into(),
        crop_image: "full/2000.webp".into(),
        time_ms: 2000,
    }];
    // Act
    let (go, reason) = decide_refine(true, true, false, &candidates);
    // Assert：跳过 + 明确原因（规则版保留）
    assert!(!go);
    assert!(reason.contains("公式模型未下载"));
}

#[test]
fn decide_refine_no_candidates_skips() {
    // Act：无候选（即使模型就绪）
    let (go, reason) = decide_refine(true, true, true, &[]);
    // Assert：跳过（无事可做）
    assert!(!go);
    assert!(reason.contains("无表格/公式区域"));
}

#[test]
fn decide_refine_layout_missing_blocks() {
    // Arrange：候选存在但版面模型缺失（管线必选组件）
    let candidates = vec![RefineCandidate {
        kind: "table".into(),
        crop_image: "full/1.webp".into(),
        time_ms: 1,
    }];
    // Act
    let (go, reason) = decide_refine(false, true, true, &candidates);
    // Assert：不可用（OARStructure layout 必选，提示明确下载路径）
    assert!(!go);
    assert!(reason.contains("版面模型未下载"));
    assert!(reason.contains("设置面板"));
}

#[test]
fn decide_refine_mixed_candidates_partial_ready() {
    // Arrange：表格+公式混合候选，仅表格模型就绪
    let candidates = vec![
        RefineCandidate { kind: "table".into(), crop_image: "full/1.webp".into(), time_ms: 1 },
        RefineCandidate { kind: "formula".into(), crop_image: "full/2.webp".into(), time_ms: 2 },
    ];
    // Act：table_ready=true, formula_ready=false
    let (go, reason) = decide_refine(true, true, false, &candidates);
    // Assert：有公式候选但公式模型缺失 → 跳过（诚实：不部分精修）
    assert!(!go);
    assert!(reason.contains("公式模型未下载"));
}

#[test]
fn refine_progress_serializable() {
    // Arrange：进度事件载荷
    let p = RefineProgress { done: 1, total: 3, current_kind: "table".into() };
    // Act：roundtrip
    let raw = serde_json::to_string(&p).unwrap();
    let back: RefineProgress = serde_json::from_str(&raw).unwrap();
    // Assert：无损
    assert_eq!(back, p);
}

#[test]
fn refine_result_variants_serialize() {
    // Act：表格/公式/失败三变体序列化
    let table = RefineResult::Table { markdown: "|A|".into(), confidence: 0.9 };
    let formula = RefineResult::Formula { latex: "x^2".into(), confidence: 0.8 };
    let failed = RefineResult::Failed { reason: "识别失败".into() };
    for r in [&table, &formula, &failed] {
        let raw = serde_json::to_string(r).unwrap();
        let back: RefineResult = serde_json::from_str(&raw).unwrap();
        assert_eq!(&back, r);
    }
}
