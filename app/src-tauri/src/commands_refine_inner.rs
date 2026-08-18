//! 课后结构精修编排核心（方案 A 增强版：模型版识别 → 产物回填）。
//!
//! @ai-context: 步骤：① 读会话图片库与表格/公式区域记录 → 构建待精修清单；
//!              ② 降级决策（模型未下载 → 跳过 + 提示事件）；
//!              ③ 专用线程内懒加载 StructureEngine（用后释放，大模型不常驻）；
//!              ④ 逐候选识别（表格→SLANet Markdown / 公式→FormulaNet LaTeX）；
//!              ⑤ 回填 artifact_blocks（模型版块 source=local、payload 升级）；
//!              ⑥ emit session:refining（进度）→ session:refined（完成）。
//! @ai-context: 精修失败单区域跳过（保留规则版），整体失败保留全部规则版产物。

use tauri::Emitter;

use crate::artifact::{ArtifactBlock, ArtifactKind, BlockPayload};
use crate::commands::AppState;
use crate::refine::{build_refine_candidates, decide_refine, RefineCandidate};
use crate::structure_engine::StructureEngine;

/// 运行精修（阻塞调用方线程；由 command 的 spawn_blocking 包裹）。
pub fn run_refine(state: &AppState, session_id: i64) -> Result<String, String> {
    let models = crate::commands_refine::structure_model_paths(state);
    // 会话图片库绝对目录（裁剪图/关键帧存储根；refine_one 在此目录内解析相对路径）
    let session_images_dir = state
        .data_dir
        .join("session-images")
        .join(session_id.to_string());
    // ① 待精修清单：表格/公式区域记录（实时链路落库的 OCR 块 region_kind）+ 裁剪图库
    let ocr_blocks = state.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    let records: Vec<(String, u64)> = ocr_blocks
        .iter()
        .filter_map(|b| {
            b.region_kind
                .as_deref()
                .map(|k| (k.to_string(), b.timestamp_ms))
        })
        .collect();
    // 裁剪图清单（crop/ 命名空间；审查 H2 修复后与关键帧 full/ 分离）
    let images = crop_list_from_store(&session_images_dir);
    let candidates = build_refine_candidates(&records, &images);
    // ② 降级决策
    let (go, reason) = decide_refine(
        models.layout_ready(),
        models.table_ready(),
        models.formula_ready(),
        &candidates,
    );
    if !go {
        eprintln!("[Refine] 会话 {} 精修跳过: {}", session_id, reason);
        let _ = state.app.emit("session:refine-skipped", reason.clone());
        return Ok(reason);
    }
    // ③ 懒加载引擎（专用线程内创建；此处 spawn_blocking 已保证）
    let backend = state.engines.ocr_device_status().actual;
    let engine = match StructureEngine::load(&models, backend) {
        Ok(e) => e,
        Err(e) => {
            let msg = format!("结构引擎加载失败（规则版产物保留）: {}", e);
            let _ = state.app.emit("session:refine-failed", msg.clone());
            return Ok(msg);
        }
    };
    // ④ 逐候选识别（先全部识别，再单次回填——避免 N 次全量产物重写）
    let total = candidates.len();
    let mut upgraded: Vec<ArtifactBlock> = Vec::new();
    for (i, candidate) in candidates.iter().enumerate() {
        let _ = state.app.emit(
            "session:refining",
            crate::refine::RefineProgress {
                done: i,
                total,
                current_kind: candidate.kind.clone(),
            },
        );
        match refine_one(&engine, candidate, &session_images_dir) {
            Ok(Some(block)) => upgraded.push(block),
            Ok(None) => {} // 该区域无对应结果（模型未检出），跳过
            Err(e) => {
                eprintln!("[Refine] 区域 {}ms 精修失败（保留规则版）: {}", candidate.time_ms, e);
            }
        }
    }
    // ⑤ 单次回填：读取产物 → 内存合并模型版块 → 一次 replace（审查 M4 修复）
    let upgraded_blocks = std::mem::take(&mut upgraded);
    if !upgraded_blocks.is_empty() {
        let mut artifact = state.db.get_artifact(session_id).map_err(|e| e.to_string())?;
        if let Some(art) = artifact.as_mut() {
            for mut block in upgraded_blocks {
                // 替换同 frame_ms 的同类型块（静默升级）；无则追加
                let frame = block.refs.frame_ms;
                let kind = block.kind;
                art.blocks.retain(|b| !(b.kind == kind && b.refs.frame_ms == frame));
                block.order = art.blocks.len() as u32;
                art.blocks.push(block);
            }
            state.db.replace_artifact(art).map_err(|e| e.to_string())?;
        }
    }
    let _ = state.app.emit(
        "session:refined",
        crate::refine::RefineProgress { done: upgraded.len(), total, current_kind: String::new() },
    );
    Ok(format!("精修完成：{}/{} 区域已升级为模型版", upgraded.len(), total))
}

/// 会话裁剪图清单（crop/ 命名空间；审查 H2 修复：精修候选只匹配裁剪图，
/// 不再与关键帧 full/ 混淆）。
fn crop_list_from_store(session_images_dir: &std::path::Path) -> Vec<String> {
    let store = match crate::image_store::SessionImageStore::new(session_images_dir.to_path_buf()) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    store.list_crops()
}

/// 单候选识别 → 产物块（None=模型未检出该区域，保留规则版）。
fn refine_one(
    engine: &StructureEngine,
    candidate: &RefineCandidate,
    session_images_dir: &std::path::Path,
) -> Result<Option<ArtifactBlock>, String> {
    // 读取裁剪图（会话图片库目录内解析相对路径——审查 H1 修复：
    // 原实现只传相对路径，进程工作目录下必然找不到）
    let image_path = session_images_dir.join(&candidate.crop_image);
    if !image_path.is_file() {
        return Err(format!("裁剪图不存在 {}: {}", session_images_dir.display(), candidate.crop_image));
    }
    let image = image::open(&image_path)
        .map_err(|e| format!("读取裁剪图失败 {}: {}", image_path.display(), e))?
        .to_rgb8();
    let result = engine.predict_image(image).map_err(|e| e.to_string())?;
    // 按区域类型提取结果
    match candidate.kind.as_str() {
        "table" => {
            // 裁剪图即区域本体：取与裁剪图覆盖面积占比最大的表格结果
            // （审查 M3 修复：不再盲目 first——完整管线可能输出多个候选）
            let table = best_table(&result, image_path_unknown_size());
            match table {
                Some(t) => {
                    // SLANet html_structure → Markdown（转换辅助见下）
                    let markdown = html_to_markdown(t.html_structure.as_deref().unwrap_or(""));
                    let confidence = t.structure_confidence.unwrap_or(0.5);
                    Ok(Some(ArtifactBlock {
                        id: 0,
                        kind: ArtifactKind::Table,
                        refs: crate::artifact::BlockRefs {
                            segment_id: None,
                            ocr_block_id: None,
                            frame_ms: Some(candidate.time_ms),
                        },
                        payload: BlockPayload::Table(crate::table_reconstruct::TableBlock {
                            markdown,
                            structure_confidence: confidence,
                            cell_refs: Vec::new(),
                        }),
                        order: 0,
                        source: crate::artifact::BlockSource::Local,
                    }))
                }
                None => Ok(None),
            }
        }
        "formula" => {
            let formula = result.formulas.first();
            match formula {
                Some(f) => Ok(Some(ArtifactBlock {
                    id: 0,
                    kind: ArtifactKind::Formula,
                    refs: crate::artifact::BlockRefs {
                        segment_id: None,
                        ocr_block_id: None,
                        frame_ms: Some(candidate.time_ms),
                    },
                    payload: BlockPayload::Formula(crate::formula_reconstruct::FormulaBlock {
                        latex: f.latex.clone(),
                        source_text: String::new(),
                        confidence: f.confidence,
                    }),
                    order: 0,
                    source: crate::artifact::BlockSource::Local,
                })),
                None => Ok(None),
            }
        }
        _ => Ok(None),
    }
}

/// 在结构结果中选与裁剪图最匹配的表格（bbox 覆盖面积占比最大者）。
///
/// @ai-context: 裁剪图即区域本体，模型版完整管线（layout→表格）可能输出多个
///              候选——选 bbox 覆盖裁剪图比例最高的（最可能是"这个区域"的表格）；
///              无 bbox 信息时回退 first（兼容上游输出缺省）。
fn best_table(
    result: &oar_ocr::domain::structure::StructureResult,
    _image_size: Option<(u32, u32)>,
) -> Option<&oar_ocr::domain::structure::TableResult> {
    if result.tables.is_empty() {
        return None;
    }
    if result.tables.len() == 1 {
        return result.tables.first();
    }
    // 多候选：按 bbox 面积降序（裁剪图场景，最大 bbox 最可能是区域本体）
    result
        .tables
        .iter()
        .max_by(|a, b| {
            let area = |t: &oar_ocr::domain::structure::TableResult| {
                let bb = &t.bbox;
                (bb.x_max() - bb.x_min()).max(0.0) * (bb.y_max() - bb.y_min()).max(0.0)
            };
            area(a).partial_cmp(&area(b)).unwrap_or(std::cmp::Ordering::Equal)
        })
}

/// 裁剪图尺寸占位（best_table 的 bbox 归一化预留；当前按面积降序足够，
/// 登记豁免——后续接入真实尺寸做 IoU 匹配）。
#[allow(dead_code)]
fn image_path_unknown_size() -> Option<(u32, u32)> {
    None
}

/// SLANet HTML 结构 → Markdown 表格（简化转换：<table><tr><td> → | 表格）。
///
/// @ai-context: 完整 HTML→MD 转换复杂；本函数覆盖常见 SLANet 输出
///              （tr/td/th 标签），失败/空输入回退空串（产物层按低置信标记）。
fn html_to_markdown(html: &str) -> String {
    if html.trim().is_empty() {
        return String::new();
    }
    let mut md = String::new();
    let mut row: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut in_cell = false;
    let mut chars = html.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '<' {
            // 收集标签名（含可能的结束斜杠）
            let mut tag = String::new();
            for t in chars.by_ref() {
                if t == '>' {
                    break;
                }
                tag.push(t);
            }
            let is_closing = tag.starts_with('/');
            let name: String = tag.trim_start_matches('/').trim().to_lowercase();
            if name.starts_with("td") || name.starts_with("th") {
                if is_closing {
                    if in_cell {
                        row.push(cell.trim().to_string());
                        cell.clear();
                        in_cell = false;
                    }
                } else if !in_cell {
                    in_cell = true; // 开标签：开始收集单元格文本
                }
            } else if name == "tr" && is_closing && !row.is_empty() {
                md.push('|');
                md.push_str(&row.join("|"));
                md.push_str("|\n");
                row.clear();
            }
        } else if in_cell {
            cell.push(c);
        }
    }
    // 收尾：未闭合的最后一格也输出（防御）
    if in_cell {
        row.push(cell.trim().to_string());
    }
    if !row.is_empty() {
        md.push('|');
        md.push_str(&row.join("|"));
        md.push_str("|\n");
    }
    md
}

/// 供测试使用：不触发真实模型（仅转换函数）。
#[cfg(test)]
pub fn _html_to_markdown_for_test(html: &str) -> String {
    html_to_markdown(html)
}

#[cfg(test)]
mod tests {
    use super::*;
    use oar_ocr::domain::structure::{TableResult, TableType};
    use oar_ocr::processors::BoundingBox;

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
}
