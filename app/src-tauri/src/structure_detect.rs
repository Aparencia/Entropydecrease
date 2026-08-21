//! 结构图检测纯函数（REQ-182 / v0.7.7；v0.10.2 重构）：diagram_likeness + decide_keep 过滤。
//!
//! @ai-context: 非线性文本结构（表格/公式/代码/流程图/思维导图/架构图）的
//!              "图像即产物"兜底（ADR-010：图语义纯本地无法还原）——版面分析
//!              已分类区域，本模块决定**哪些区域值得持久化为结构图**：
//!              ① L1 table/formula/code 直收（is_structural）；
//!              ② Image/Text 过 diagram_likeness 启发式（防照片/装饰误收）；
//!              ③ L2 OCR 置信度反向验证（v0.10.2：OCR 已高置信还原的线性
//!                 文本不收——结构图只收"OCR 不准确"的含文本图）；
//!              ④ L0 字幕块重叠拦截 + L3 底部条带形状约束（v0.10.2：会话 33
//!                 实测 50%+ 误收为字幕条——背景条+文字的长直线信号骗过旧
//!                 启发式；字幕块 bbox 由 OCR 字幕管线落库，直接可查）。
//! @ai-context: 纯函数无 IO（网格/上下文输入）；合成网格可单测（layout_analyzer 先例）。

use crate::layout_analyzer::{FrameGrid, LayoutRegion, RegionKind};
use crate::types::TextBox;

/// Image 区域判定为"疑似图结构"的阈值（0-1；合成网格标定，真机调参）。
pub const DIAGRAM_LIKENESS_THRESHOLD: f32 = 0.5;
/// 字幕重叠拦截 IoU 下限（v0.10.2）：候选区域与字幕 OCR 块重叠 ≥ 该值 → 拒。
pub const SUBTITLE_IOU_MIN: f32 = 0.3;
/// OCR 块计入区域信号的重叠下限（v0.10.2 审查修复）：块与区域重叠面积 ≥ 块面积
/// 该比例才视为"属于该区域"——防整帧/大框 OCR 块与区域微量重叠即拉高平均分
/// 而误拒真实结构图（旧判据 `iou>0` 过宽）。
const BLOCK_OVERLAP_MIN: f32 = 0.3;
/// OCR 置信度反向信号：区域内重叠 OCR 块平均分 ≥ 该值 → 线性文本已还原 → 拒。
const OCR_SCORE_CONFIDENT: f32 = 0.7;
/// OCR 置信度反向信号：平均分 < 该值 → OCR 还原不了 → 收（结构图兜底）。
const OCR_SCORE_WEAK: f32 = 0.5;
/// 底部条带判定：区域中心位于画面底部 (1-BOTTOM_BAND_RATIO) 比例内 → 字幕条特征。
const BOTTOM_BAND_RATIO: f32 = 0.88;
/// 底部条带判定：高宽比超该值 → 细长条带（字幕条/进度条），非块状结构。
const SUB_BAR_ASPECT: f32 = 8.0;
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

/// 结构图过滤上下文（v0.10.2）：同帧时间窗内的 OCR 块信号（帧坐标）。
///
/// @ai-context: 由编排层（structure_capture）从 SessionOcrBlock 按时间窗组装：
///              subtitle_boxes=字幕管线块（region="subtitle"，独立 ROI 不进
///              版面——字幕条与版面区域重叠是旧版误收主因）；full_blocks=画面
///              要点块（region="full"，含 OCR 置信度）——L2 反向信号数据源。
pub struct StructureFilterContext {
    /// 同时间窗字幕块 bbox（帧坐标）
    pub subtitle_boxes: Vec<TextBox>,
    /// 同时间窗画面要点块 (bbox, OCR 置信度 0-1)
    pub full_blocks: Vec<(TextBox, f32)>,
}

/// 区域是否值得持久化为结构图（纯函数；v0.10.2 重构，取代 filter_structure_regions）。
///
/// @ai-context: 判定顺序——L3 位置（最廉价预过滤）→ L0 字幕重叠 → L1 版面
///              类型 → L2 OCR 置信度反向信号；任一拒则拒，全部过则收。
/// @ai-context: diagram_score 由调用方预计算（仅 Image/Text 需要；结构三类
///              传 0.0 占位）——本函数不依赖网格，输入均为帧坐标，便于单测
///              与编排层解耦。
pub fn decide_keep(
    kind: RegionKind,
    r: &LayoutRegion,
    diagram_score: f32,
    ctx: &StructureFilterContext,
    _frame_w: u32,
    frame_h: u32,
) -> bool {
    // L3 位置约束：底部细长条带 → 字幕条特征（防旧数据无字幕标记的兜底）
    if r.h > 0 && r.w as f32 / r.h as f32 > SUB_BAR_ASPECT {
        let cy = r.y as f32 + r.h as f32 / 2.0;
        if frame_h > 0 && cy > frame_h as f32 * BOTTOM_BAND_RATIO {
            return false;
        }
    }
    // L0 字幕重叠拦截：与任一字幕块 IoU ≥ 阈值 → 字幕区，不收
    if ctx
        .subtitle_boxes
        .iter()
        .any(|b| iou_frame(r, b) >= SUBTITLE_IOU_MIN)
    {
        return false;
    }
    // L1 版面类型
    match kind {
        RegionKind::Table | RegionKind::Formula | RegionKind::Code => true,
        RegionKind::Unknown => false,
        RegionKind::Image | RegionKind::Text => {
            if diagram_score < DIAGRAM_LIKENESS_THRESHOLD {
                return false;
            }
            // L2 OCR 置信度反向信号：区域内（重叠面积 ≥ 块面积 30%）full 块
            // 平均分——高置信 → OCR 已还原线性文本（字幕/PPT 正文）→ 无需
            // 图像兜底 → 拒；低置信/无区域内块 → OCR 还原不了 → 收；模糊地带
            // 偏向收（V1.0 用户删除反馈校准阈值）。
            let mut sum = 0.0f32;
            let mut n = 0u32;
            for (bb, score) in &ctx.full_blocks {
                if overlap_ratio(r, bb) >= BLOCK_OVERLAP_MIN {
                    sum += score;
                    n += 1;
                }
            }
            let avg = if n > 0 { sum / n as f32 } else { 0.0 };
            match avg {
                a if a >= OCR_SCORE_CONFIDENT => false,
                a if a < OCR_SCORE_WEAK => true,
                _ => true,
            }
        }
    }
}

/// 块与区域的重叠面积占比（纯函数）：重叠面积 / 块面积——判断块是否"属于"区域。
/// 与 iou_frame（对称 IoU）互补：L0 字幕拦截用对称 IoU（区域与字幕条整体
/// 重合度）；L2 信号归属用非对称占比（防止巨大 OCR 框微量重叠污染平均分）。
fn overlap_ratio(r: &LayoutRegion, b: &TextBox) -> f32 {
    let (rx1, ry1) = (r.x as f32 + r.w as f32, r.y as f32 + r.h as f32);
    let (bx1, by1) = (b.x + b.w, b.y + b.h);
    let ix = rx1.min(bx1) - (r.x as f32).max(b.x);
    let iy = ry1.min(by1) - (r.y as f32).max(b.y);
    if ix <= 0.0 || iy <= 0.0 {
        return 0.0;
    }
    let inter = ix * iy;
    let block_area = b.w * b.h;
    if block_area <= 0.0 {
        0.0
    } else {
        inter / block_area
    }
}

/// 帧坐标区域与 OCR 块 bbox 的 IoU（纯函数；无重叠/空尺寸防御为 0）。
fn iou_frame(r: &LayoutRegion, b: &TextBox) -> f32 {
    let (rx1, ry1) = (r.x as f32 + r.w as f32, r.y as f32 + r.h as f32);
    let (bx1, by1) = (b.x + b.w, b.y + b.h);
    let ix = rx1.min(bx1) - (r.x as f32).max(b.x);
    let iy = ry1.min(by1) - (r.y as f32).max(b.y);
    if ix <= 0.0 || iy <= 0.0 {
        return 0.0;
    }
    let inter = ix * iy;
    let union = r.w as f32 * r.h as f32 + b.w * b.h - inter;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

#[cfg(test)]
#[path = "structure_detect_tests.rs"]
mod tests;
