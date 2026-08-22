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
use crate::db::Db;
use crate::refine::{build_refine_candidates, decide_refine, filter_refined_candidates, RefineCandidate};
use crate::structure_engine::StructureEngine;

/// 待精修候选（数据层，v0.11.5 幂等化）：OCR 区域记录 + 裁剪图清单 → 幂等过滤。
///
/// @ai-context: 与 run_refine 共用同一数据源——停止后自动触发（commands_live）与
///              详情进入懒触发（auto_refine_session）双通道防重；产物模型版结构块
///              即幂等标记（filter_refined_candidates 纯函数），已精修区域不重复推理。
/// @ai-context: 参数化 (db, images_dir) 而非 AppState——内存库 + 临时目录可端到端测试。
pub fn pending_candidates(
    db: &Db,
    session_images_dir: &std::path::Path,
    session_id: i64,
) -> Result<Vec<RefineCandidate>, String> {
    // ① 表格/公式区域记录（实时链路落库的 OCR 块 region_kind）
    let ocr_blocks = db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    let records: Vec<(String, u64)> = ocr_blocks
        .iter()
        .filter_map(|b| {
            b.region_kind
                .as_deref()
                .map(|k| (k.to_string(), b.timestamp_ms))
        })
        .collect();
    // ② 裁剪图清单（crop/ 命名空间；审查 H2 修复后与关键帧 full/ 分离）
    let images = crop_list_from_store(session_images_dir);
    let candidates = build_refine_candidates(&records, &images);
    // ③ 幂等过滤：已精修（产物同类型同 frame_ms 模型版块）→ 跳过
    let artifact = db.get_artifact(session_id).map_err(|e| e.to_string())?;
    Ok(filter_refined_candidates(candidates, artifact.as_ref()))
}

/// 运行精修（阻塞调用方线程；由 command 的 spawn_blocking 包裹）。
pub fn run_refine(state: &AppState, session_id: i64) -> Result<String, String> {
    let models = crate::commands_refine::structure_model_paths(state);
    // 会话图片库绝对目录（裁剪图/关键帧存储根；refine_one 在此目录内解析相对路径）
    let session_images_dir = state
        .data_dir
        .join("session-images")
        .join(session_id.to_string());
    // ① 待精修清单（幂等：产物已有模型版结构块 → 已精修跳过；
    //    停止后触发 + 详情进入懒触发双通道共享此过滤——防重复推理）
    let candidates = pending_candidates(&state.db, &session_images_dir, session_id)?;
    if candidates.is_empty() {
        // 无待精修区域（无结构区域 或 已全部精修）——快速返回，不误报跳过事件
        return Ok("no-pending".to_string());
    }
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
#[path = "commands_refine_inner_tests.rs"]
mod tests;

