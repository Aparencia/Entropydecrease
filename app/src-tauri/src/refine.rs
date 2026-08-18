//! 课后结构精修调度（REQ-047/049/050 模型版：课后批处理精修 + 静默升级）。
//!
//! @ai-context: 方案 A 增强版——实时链路只保存表格/公式区域裁剪图（零推理），
//!              会话停止后自动精修：懒加载模型（仅当有待精修区域）→ 模型版识别 →
//!              回填产物块（source 标记 model），前端"精修中 → 静默升级"。
//! @ai-context: 纯逻辑可单测（待精修清单构建/降级决策）；实际模型调用在
//!              commands_refine.rs（专用线程持有 StructureEngine）。
//! @ai-context: 降级链：模型未下载 → 精修跳过（保留规则版产物 + 提示事件）；
//!              单区域识别失败 → 跳过该区域不阻断整体。

use serde::{Deserialize, Serialize};

/// 待精修区域（实时链路落库的裁剪图引用）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RefineCandidate {
    /// 区域类型（table | formula）
    pub kind: String,
    /// 裁剪图相对路径（session-images 目录内）
    pub crop_image: String,
    /// 区域时间戳（ms；产物块 refs.frame_ms 对齐）
    pub time_ms: u64,
}

/// 精修结果（模型版识别输出 → 回填产物块）。
///
/// @ai-context: 当前由 commands_refine_inner 直接构造产物块（内联），
///              本枚举为结果契约与后续诊断消费预留，登记豁免 dead_code。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[allow(dead_code)]
pub enum RefineResult {
    /// 表格：Markdown + 结构置信度
    Table { markdown: String, confidence: f32 },
    /// 公式：LaTeX + 置信度
    Formula { latex: String, confidence: f32 },
    /// 识别失败（跳过该区域，保留规则版）
    Failed { reason: String },
}

/// 精修进度事件载荷。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RefineProgress {
    pub done: usize,
    pub total: usize,
    pub current_kind: String,
}

/// 构建待精修清单（纯函数）：实时链路保存的裁剪图 → 候选列表。
///
/// @ai-context: 输入为会话图片库列表（full/<ts>.webp）+ 版面区域类型记录
///              （实时链路落库的 region_kind=table/formula 的 OCR 块）；
///              无裁剪图（模型未启用时未保存）→ 空清单（精修跳过）。
pub fn build_refine_candidates(
    region_records: &[(String, u64)], // (region_kind, timestamp_ms)
    image_paths: &[String],           // full/<ts>.webp
) -> Vec<RefineCandidate> {
    let mut candidates = Vec::new();
    for (kind, ts) in region_records {
        let wanted = kind == "table" || kind == "formula";
        if !wanted {
            continue;
        }
        // 裁剪图按时间戳匹配（full/<ts>.webp）
        let crop = format!("full/{}.webp", ts);
        if image_paths.iter().any(|p| p == &crop) {
            candidates.push(RefineCandidate {
                kind: kind.clone(),
                crop_image: crop,
                time_ms: *ts,
            });
        }
    }
    // 按时间升序（稳定精修顺序）
    candidates.sort_by_key(|c| c.time_ms);
    candidates
}

/// 精修降级决策（纯函数）：模型就绪 + 有待精修清单 → 是否启动精修。
///
/// @ai-context: 返回 (是否精修, 原因)：模型缺失/无候选 → 跳过并提示前端。
pub fn decide_refine(
    layout_ready: bool,
    table_ready: bool,
    formula_ready: bool,
    candidates: &[RefineCandidate],
) -> (bool, String) {
    if candidates.is_empty() {
        return (false, "会话无表格/公式区域（无需精修）".to_string());
    }
    // 至少一类相关模型就绪才精修（表格候选需 table_ready，公式候选需 formula_ready）
    let has_table = candidates.iter().any(|c| c.kind == "table");
    let has_formula = candidates.iter().any(|c| c.kind == "formula");
    let table_ok = !has_table || table_ready;
    let formula_ok = !has_formula || formula_ready;
    if layout_ready && (table_ok && formula_ok) {
        (true, String::new())
    } else if !table_ok || !formula_ok {
        let missing = if !table_ok { "表格" } else { "公式" };
        (false, format!("{}模型未下载，精修跳过（规则版产物保留，可到设置下载后重试）", missing))
    } else {
        (false, "版面模型未就绪，精修不可用".to_string())
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "refine_tests.rs"]
mod tests;
