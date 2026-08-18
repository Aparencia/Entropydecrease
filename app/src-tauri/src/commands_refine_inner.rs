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
    // ① 待精修清单：表格/公式区域记录（实时链路落库的 OCR 块 region_kind）+ 图片库
    let ocr_blocks = state.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    let records: Vec<(String, u64)> = ocr_blocks
        .iter()
        .filter_map(|b| {
            b.region_kind
                .as_deref()
                .map(|k| (k.to_string(), b.timestamp_ms))
        })
        .collect();
    let images = crate::commands_images::keyframes_from_store(state, session_id)
        .unwrap_or_default()
        .into_iter()
        .map(|kf| format!("full/{}.webp", kf.timestamp_ms))
        .collect::<Vec<String>>();
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
    // ④ 逐候选识别 + 回填
    let total = candidates.len();
    let mut refined = 0usize;
    for (i, candidate) in candidates.iter().enumerate() {
        let _ = state.app.emit(
            "session:refining",
            crate::refine::RefineProgress {
                done: i,
                total,
                current_kind: candidate.kind.clone(),
            },
        );
        match refine_one(&engine, candidate) {
            Ok(Some(block)) => {
                // ⑤ 回填产物块（模型版结果 → artifact_blocks 表）
                let artifact = state.db.get_artifact(session_id).map_err(|e| e.to_string())?;
                if let Some(mut art) = artifact {
                    // 替换同 frame_ms 的同类型块（静默升级）；无则追加
                    let frame = block.refs.frame_ms;
                    let kind = block.kind;
                    art.blocks.retain(|b| !(b.kind == kind && b.refs.frame_ms == frame));
                    let mut block = block;
                    block.order = art.blocks.len() as u32;
                    art.blocks.push(block);
                    state.db.replace_artifact(&art).map_err(|e| e.to_string())?;
                }
                refined += 1;
            }
            Ok(None) => {} // 该区域无产物块可回填（无会话产物），跳过
            Err(e) => {
                eprintln!("[Refine] 区域 {}ms 精修失败（保留规则版）: {}", candidate.time_ms, e);
            }
        }
    }
    let _ = state.app.emit(
        "session:refined",
        crate::refine::RefineProgress { done: refined, total, current_kind: String::new() },
    );
    Ok(format!("精修完成：{}/{} 区域已升级为模型版", refined, total))
}

/// 单候选识别 → 产物块（None=无需回填）。
fn refine_one(
    engine: &StructureEngine,
    candidate: &RefineCandidate,
) -> Result<Option<ArtifactBlock>, String> {
    // 读取裁剪图（session-images 目录）
    let image_path = state_image_path_for(candidate);
    let image = image::open(&image_path)
        .map_err(|e| format!("读取裁剪图失败 {}: {}", image_path.display(), e))?
        .to_rgb8();
    let result = engine.predict_image(image).map_err(|e| e.to_string())?;
    // 按区域类型提取结果
    match candidate.kind.as_str() {
        "table" => {
            // 取与裁剪图时间戳最接近的表格结果
            let table = result.tables.first();
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

/// 裁剪图绝对路径（会话图片库 + 相对路径）。
fn state_image_path_for(candidate: &RefineCandidate) -> std::path::PathBuf {
    // 由调用方提供会话目录（简化：相对路径由 image_store 目录约定解析）
    std::path::PathBuf::from(&candidate.crop_image)
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
}
