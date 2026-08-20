//! 结构图检测纯函数（REQ-182 / v0.7.7）：diagram_likeness + pick_sharpest + 区域过滤。
//!
//! @ai-context: 非线性文本结构（表格/公式/代码/流程图/思维导图/架构图）的
//!              "图像即产物"兜底（ADR-010：图语义纯本地无法还原）——版面分析
//!              已分类区域，本模块决定**哪些区域值得持久化为结构图**：
//!              ① table/formula/code 直接候选（is_structural）；
//!              ② Image 区域过 diagram_likeness 启发式（防照片/装饰误收）；
//!              ③ text/unknown 跳过（text 走 OCR 线性文本；unknown 归 V1.0 AI 补缝）。
//! @ai-context: pick_sharpest 解决"屏卡代表帧可能不是最清晰帧"——屏时间窗内
//!              多张归档帧选边缘能量最高者（动效结束后的静止清晰帧）。
//! @ai-context: 纯函数无 IO（网格输入）；合成网格可单测（layout_analyzer 先例）。

use crate::layout_analyzer::{FrameGrid, LayoutRegion, RegionKind};

/// Image 区域判定为"疑似图结构"的阈值（0-1；合成网格标定，真机调参）。
pub const DIAGRAM_LIKENESS_THRESHOLD: f32 = 0.5;
/// 墨迹判定阈值（与 layout_analyzer INK_THRESHOLD 同口径 160——两模块独立
/// 常量防耦合，改阈值须双处同步）。
const INK_THRESHOLD: u8 = 160;
/// 长直线判定：连续墨迹段 ≥ 区域宽/高该比例视为"结构线"（框线/箭头线）。
const LINE_FRACTION: f32 = 0.25;
/// 低信息区域拒绝：灰度方差低于该值视为纯色/装饰（与 layout VARIANCE_MIN 同思路）。
const VARIANCE_MIN_STRUCT: f32 = 500.0;
/// 墨迹密度目标上限（结构图线条+文字密度通常 ≤0.6；照片纹理更高）。
const INK_TARGET_MAX: f32 = 0.6;
/// 墨迹密度下限（低于该值过于稀疏，不像结构图）。
const INK_TARGET_MIN: f32 = 0.04;
/// 合成评分权重：长直线是主信号（照片/文字均无框线），墨迹密度与面积占比辅助。
const W_LINE: f32 = 0.75;
const W_INK: f32 = 0.15;
const W_AREA: f32 = 0.10;

/// 图结构似然评分（纯函数）：区域网格 → 0-1。
///
/// @ai-context: 特征三件套——① 长直线（框线/箭头线，照片与文字均无）；
///              max_run=最长连续墨迹段占比 + line_rows=含长段的行数（框数信号）；
///              ② 墨迹密度（结构图线条+文字密度中等；超上限衰减防照片纹理拉分）；
///              ③ 面积占比（大区域才值得持久化，小图标/水印不收）。
/// @ai-context: 硬门槛：灰度方差过低（纯色块/渐变装饰）直接 0 分。
///              区域越界/过小 → 0 分（防御）。
pub fn diagram_likeness(grid: &FrameGrid, x0: u32, y0: u32, x1: u32, y1: u32) -> f32 {
    if x1 < x0 || y1 < y0 || x1 >= grid.cols || y1 >= grid.rows {
        return 0.0;
    }
    let w = x1 - x0 + 1;
    let h = y1 - y0 + 1;
    if w < 2 || h < 2 {
        return 0.0;
    }
    // 形状约束（实现校准）：标题细条/单行词条不可能是图结构——区域必须
    // 是"块状"（高 ≥3 格、宽 ≥6 格）。真实流程图页密度高被判 Text，
    // 行带可能是框线连成的大块；长标题是 1-2 格高的细条，借此拒绝。
    if h < 3 || w < 6 {
        return 0.0;
    }
    // ① 长直线特征：行/列最长连续墨迹段 + 含长段行数
    let mut max_h_run = 0u32;
    let mut line_rows = 0u32;
    for y in y0..=y1 {
        let (mut run, mut best, mut row_has_line) = (0u32, 0u32, false);
        for x in x0..=x1 {
            if is_ink(grid, y, x) {
                run += 1;
                best = best.max(run);
            } else {
                run = 0;
            }
        }
        max_h_run = max_h_run.max(best);
        if best as f32 >= w as f32 * LINE_FRACTION {
            row_has_line = true;
        }
        if row_has_line {
            line_rows += 1;
        }
    }
    let mut max_v_run = 0u32;
    let mut line_cols = 0u32;
    for x in x0..=x1 {
        let (mut run, mut best) = (0u32, 0u32);
        for y in y0..=y1 {
            if is_ink(grid, y, x) {
                run += 1;
                best = best.max(run);
            } else {
                run = 0;
            }
        }
        max_v_run = max_v_run.max(best);
        if best as f32 >= h as f32 * LINE_FRACTION {
            line_cols += 1;
        }
    }
    let max_run = (max_h_run as f32 / w as f32).max(max_v_run as f32 / h as f32);
    let line_rows_norm = ((line_rows + line_cols) as f32 / 2.0).min(1.0);
    let line_score = 0.7 * max_run + 0.3 * line_rows_norm;
    // ② 墨迹密度（区域内）
    let (mut ink, mut total) = (0u32, 0u32);
    let mut sum = 0u64;
    let mut sum_sq = 0u64;
    for y in y0..=y1 {
        for x in x0..=x1 {
            total += 1;
            let v = grid.cells[(y * grid.cols + x) as usize];
            if v < INK_THRESHOLD {
                ink += 1;
            }
            sum += v as u64;
            sum_sq += (v as u64) * (v as u64);
        }
    }
    let density = ink as f32 / total as f32;
    let ink_score = if density < INK_TARGET_MIN {
        0.0
    } else if density <= INK_TARGET_MAX {
        density / INK_TARGET_MAX
    } else {
        // 超上限衰减（照片纹理）：0.6→1.0 线性降到 1.0→0.5，防高密度纹理拉分
        1.0 - (density - INK_TARGET_MAX) / (1.0 - INK_TARGET_MAX) * 0.5
    };
    // ③ 面积占比
    let area_ratio = (w * h) as f32 / (grid.cols * grid.rows) as f32;
    // ④ 灰度方差（硬门槛：纯色/渐变装饰直接拒绝）
    let mean = sum as f64 / total as f64;
    let variance = (sum_sq as f64 / total as f64 - mean * mean).max(0.0) as f32;
    if variance < VARIANCE_MIN_STRUCT {
        return 0.0;
    }
    (W_LINE * line_score + W_INK * ink_score + W_AREA * area_ratio.min(1.0)).min(1.0)
}

/// 网格坐标单元是否墨迹（区域评分用，阈值同口径）。
fn is_ink(grid: &FrameGrid, y: u32, x: u32) -> bool {
    grid.cells[(y * grid.cols + x) as usize] < INK_THRESHOLD
}

/// 帧边缘能量（纯函数）：水平+垂直相邻格亮度差绝对值之和——清晰度代理指标
/// （文字/线条边缘锐利 → 能量高；模糊/纯色帧 → 能量低或零）。
pub fn edge_energy(grid: &FrameGrid) -> u64 {
    if grid.cols == 0 || grid.rows == 0 {
        return 0;
    }
    let mut energy = 0u64;
    for y in 0..grid.rows {
        for x in 0..grid.cols {
            let v = grid.cells[(y * grid.cols + x) as usize] as i64;
            if x + 1 < grid.cols {
                energy += (v - grid.cells[(y * grid.cols + x + 1) as usize] as i64).unsigned_abs();
            }
            if y + 1 < grid.rows {
                energy += (v - grid.cells[((y + 1) * grid.cols + x) as usize] as i64).unsigned_abs();
            }
        }
    }
    energy
}

/// 最清晰帧选择（纯函数）：候选 (时间戳, 网格) 列表 → 边缘能量最高者索引。
///
/// @ai-context: 零能量帧（纯色/黑屏，无内容）跳过；全部零能量 → None
///              （该屏无可捕获帧，调用方跳过——诚实降级）。
pub fn pick_sharpest(candidates: &[(u64, FrameGrid)]) -> Option<usize> {
    let mut best: Option<(usize, u64)> = None;
    for (i, (_, g)) in candidates.iter().enumerate() {
        let e = edge_energy(g);
        if e == 0 {
            continue;
        }
        if best.as_ref().is_none_or(|(_, be)| e > *be) {
            best = Some((i, e));
        }
    }
    best.map(|(i, _)| i)
}

/// 结构图候选过滤（纯函数）：版面区域 → 值得持久化的子集。
///
/// @ai-context: table/formula/code 直收（is_structural）；Image/Text 均过
///              diagram_likeness 阈值（实现校准：真实流程图页密度高被判
///              Text——长直线+形状约束天然拒纯文字/标题，故 Text 同门控）；
///              unknown 跳过（归 V1.0 AI 补缝）。输入输出均为网格坐标
///              （编排层随后 regions_to_frame 换算帧坐标裁剪）。
pub fn filter_structure_regions(
    regions: &[LayoutRegion],
    grid: &FrameGrid,
) -> Vec<LayoutRegion> {
    regions
        .iter()
        .filter(|r| match r.kind {
            RegionKind::Table | RegionKind::Formula | RegionKind::Code => true,
            RegionKind::Image | RegionKind::Text => {
                diagram_likeness(grid, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1)
                    >= DIAGRAM_LIKENESS_THRESHOLD
            }
            RegionKind::Unknown => false,
        })
        .cloned()
        .collect()
}

#[cfg(test)]
#[path = "structure_detect_tests.rs"]
mod tests;
