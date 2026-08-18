//! 规则版版面分析（REQ-047 / v0.5.0 M3，头脑风暴轮 4 + 追加讨论）。
//!
//! @ai-context: 输入播放区域内帧（REQ-037 坐标系）→ 区域分类 text/table/formula/code/image/unknown。
//!              设计原则：**规则版先行 + layout 模型 spike 并行**——编排层按"区域类型"
//!              抽象，规则版→模型版只换 LayoutAnalyzer 实现（编排零改动）。
//! @ai-context: 本模块输入为**灰度网格**（帧降采样亮度），纯逻辑分类无图像依赖可单测；
//!              帧 → 网格的特征提取在 frame_features.rs（BGRA8 → 亮度网格 + 边缘网格）。
//! @ai-context: 区域价值采样（REQ-039 预算制升级）：区域类型 → 采样权重表
//!              （table/code 高权重高分辨率；装饰/image 跳过；字幕区独立 ROI 不进版面）。

use serde::{Deserialize, Serialize};

/// 区域类型（全栈统一业务术语；编排层按此分发专项管线）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RegionKind {
    /// 常规文本（PPT 正文/板书）
    Text,
    /// 表格（有线网格结构）
    Table,
    /// 公式（渲染公式/上下标）
    Formula,
    /// 代码块（等宽缩进结构）
    Code,
    /// 图片/照片区域
    Image,
    /// 无法分类（低置信 → AI 补缝候选，V1.0）
    Unknown,
}

/// 版面区域（输出）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayoutRegion {
    pub kind: RegionKind,
    /// 网格坐标 bbox（相对输入网格；编排层换算回帧坐标）
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    /// 分类置信度 0.0-1.0
    pub confidence: f32,
    /// 结构性区域（表格/公式/代码——产物块类型直接映射，M7 消费）
    pub is_structural: bool,
}

/// 输入灰度网格（帧降采样；0=黑 255=白）。
///
/// @ai-context: 由 frame_features::grid_from_bgra 提取（实时链路）或合成构造（单测）；
///              分类逻辑只依赖此结构——规则版与模型版（spike 通过后）共用此接口。
#[derive(Debug, Clone, PartialEq)]
pub struct FrameGrid {
    pub cols: u32,
    pub rows: u32,
    /// cols×rows 灰度值（行优先）
    pub cells: Vec<u8>,
}

/// 分类阈值：网格单元灰度低于该值视为"墨迹"（文字/线条/图形）。
const INK_THRESHOLD: u8 = 160;
/// 文本行带最少墨迹单元占比（行带判定）。
const LINE_INK_MIN: f32 = 0.18;
/// 表格横/竖线判定：行/列墨迹占比下限（整行/整列线条特征）。
const TABLE_LINE_INK: f32 = 0.6;
/// 表格线孤立判定：邻行/邻列墨迹占比上限（区分粗块与细线）。
const LINE_ISOLATED_MAX: f32 = 0.3;
/// 表格最少横线+竖线数。
const TABLE_LINE_MIN: u32 = 2;
/// 置信度：纯规则启发式按信号强度赋值。
const CONFIDENCE_STRONG: f32 = 0.9;
const CONFIDENCE_MEDIUM: f32 = 0.7;
const CONFIDENCE_WEAK: f32 = 0.5;

/// 版面分析（纯函数）：灰度网格 → 区域列表。
///
/// @ai-context: 管线：① 全局表格检测（孤立横线+孤立竖线交叉 → Table，含表头）
///              → ② 未命中表格时行投影 → 墨迹行带（间隙 ≤1 合并）→ 列区间
///              → 每区域分类：代码（行首对齐+行宽变化）> 公式（中线符号）> 文本。
/// @ai-context: 回退链（编排层）：本函数失败/空 → 整帧直跑现有 OCR 管线（现状行为）。
pub fn analyze_layout(grid: &FrameGrid) -> Vec<LayoutRegion> {
    if grid.cols == 0 || grid.rows == 0 || grid.cells.len() != (grid.cols * grid.rows) as usize {
        return Vec::new();
    }
    // ① 全局表格检测（表格页整体判定——行带粒度无法表达网格结构）
    if let Some(region) = detect_table(grid) {
        return vec![region];
    }
    // ② 行投影 → 墨迹行带
    let row_ink = row_projection(grid);
    let bands = merge_bands(&row_ink, grid.rows);
    // ③ 每行带内列区间 → 区域候选
    let mut regions = Vec::new();
    for (y0, y1) in bands {
        let col_runs = column_runs(grid, y0, y1);
        for (x0, x1) in col_runs {
            let (kind, confidence) = classify_region(grid, x0, y0, x1, y1);
            regions.push(LayoutRegion {
                kind,
                x: x0,
                y: y0,
                w: x1 - x0 + 1,
                h: y1 - y0 + 1,
                confidence,
                is_structural: matches!(kind, RegionKind::Table | RegionKind::Formula | RegionKind::Code),
            });
        }
    }
    regions
}

/// 全局表格检测：孤立横线行（≥2）与孤立竖线列（≥2）交叉 → Table 区域。
///
/// @ai-context: "孤立" = 该行/列墨迹占比高（≥TABLE_LINE_INK）而邻行/列低
///              （≤LINE_ISOLATED_MAX）——细线特征（表格线）；粗墨迹块（公式
///              分数线/文本行）邻行邻列同样墨迹 → 不判孤立 → 不误判表格。
/// @ai-context: 区域 bbox = 横线行范围 × 竖线列范围（网格坐标）。
fn detect_table(grid: &FrameGrid) -> Option<LayoutRegion> {
    // 孤立横线行
    let mut h_rows = Vec::new();
    for y in 0..grid.rows {
        let ink = row_ink_at(grid, y);
        let neighbors_quiet = (y == 0 || row_ink_at(grid, y - 1) <= LINE_ISOLATED_MAX)
            && (y + 1 >= grid.rows || row_ink_at(grid, y + 1) <= LINE_ISOLATED_MAX);
        if ink >= TABLE_LINE_INK && neighbors_quiet {
            h_rows.push(y);
        }
    }
    // 孤立竖线列
    let mut v_cols = Vec::new();
    for x in 0..grid.cols {
        let ink = col_ink_at(grid, x);
        let neighbors_quiet = (x == 0 || col_ink_at(grid, x - 1) <= LINE_ISOLATED_MAX)
            && (x + 1 >= grid.cols || col_ink_at(grid, x + 1) <= LINE_ISOLATED_MAX);
        if ink >= TABLE_LINE_INK && neighbors_quiet {
            v_cols.push(x);
        }
    }
    if h_rows.len() >= TABLE_LINE_MIN as usize && v_cols.len() >= TABLE_LINE_MIN as usize {
        let x0 = *v_cols.first()?;
        let x1 = *v_cols.last()?;
        let y0 = *h_rows.first()?;
        let y1 = *h_rows.last()?;
        return Some(LayoutRegion {
            kind: RegionKind::Table,
            x: x0,
            y: y0,
            w: x1 - x0 + 1,
            h: y1 - y0 + 1,
            confidence: CONFIDENCE_STRONG,
            is_structural: true,
        });
    }
    None
}

/// 单行墨迹占比。
fn row_ink_at(grid: &FrameGrid, y: u32) -> f32 {
    let start = (y * grid.cols) as usize;
    let end = start + grid.cols as usize;
    let ink = grid.cells[start..end].iter().filter(|&&v| v < INK_THRESHOLD).count();
    ink as f32 / grid.cols as f32
}

/// 单列墨迹占比。
fn col_ink_at(grid: &FrameGrid, x: u32) -> f32 {
    let mut ink = 0u32;
    for y in 0..grid.rows {
        if grid.cells[(y * grid.cols + x) as usize] < INK_THRESHOLD {
            ink += 1;
        }
    }
    ink as f32 / grid.rows as f32
}

/// 行投影：每行墨迹单元数占比（0.0-1.0）。
fn row_projection(grid: &FrameGrid) -> Vec<f32> {
    (0..grid.rows)
        .map(|y| {
            let start = (y * grid.cols) as usize;
            let end = start + grid.cols as usize;
            let ink = grid.cells[start..end].iter().filter(|&&v| v < INK_THRESHOLD).count();
            ink as f32 / grid.cols as f32
        })
        .collect()
}

/// 墨迹行带合并：连续墨迹行（≥LINE_INK_MIN）合并为带，间隙 ≤1 行不断开
/// （代码行/表格单元行之间常见单行空隙，断开会碎化代码块检测）。
fn merge_bands(row_ink: &[f32], rows: u32) -> Vec<(u32, u32)> {
    let mut bands = Vec::new();
    let mut start: Option<u32> = None;
    let mut gap = 0u32;
    for (y, &ink) in row_ink.iter().enumerate() {
        let active = ink >= LINE_INK_MIN;
        match (start, active) {
            (None, true) => {
                start = Some(y as u32);
                gap = 0;
            }
            (Some(_), true) => gap = 0,
            (Some(s), false) => {
                gap += 1;
                if gap > 1 {
                    bands.push((s, y as u32 - gap));
                    start = None;
                }
            }
            (None, false) => {}
        }
    }
    if let Some(s) = start {
        bands.push((s, rows - 1));
    }
    bands
}

/// 列区间：行带内墨迹密度 ≥ 阈值的连续列段（带内合并小间隙 ≤1 列）。
///
/// @ai-context: 阈值 0.2（带内 1/5 行有墨迹即算内容列）——公式分子/分母等
///              稀疏符号列也能成区；纯噪声列（单行偶然墨迹）密度更低被滤除。
fn column_runs(grid: &FrameGrid, y0: u32, y1: u32) -> Vec<(u32, u32)> {
    let mut runs = Vec::new();
    let mut start: Option<u32> = None;
    let mut gap = 0u32;
    for x in 0..grid.cols {
        let ink = column_ink(grid, x, y0, y1);
        if ink >= 0.2 {
            if start.is_none() {
                start = Some(x);
                gap = 0;
            } else {
                gap = 0;
            }
        } else if let Some(s) = start {
            gap += 1;
            if gap > 1 {
                runs.push((s, x - gap));
                start = None;
            }
        }
    }
    if let Some(s) = start {
        runs.push((s, grid.cols - 1));
    }
    runs
}

/// 列墨迹占比（行带内）。
fn column_ink(grid: &FrameGrid, x: u32, y0: u32, y1: u32) -> f32 {
    let mut ink = 0u32;
    let mut total = 0u32;
    for y in y0..=y1 {
        let i = (y * grid.cols + x) as usize;
        total += 1;
        if grid.cells[i] < INK_THRESHOLD {
            ink += 1;
        }
    }
    if total == 0 {
        0.0
    } else {
        ink as f32 / total as f32
    }
}

/// 区域分类（纯规则启发式）：
/// 公式（中线长条）> 代码（行首对齐+行宽变化）> 文本 > 图像 > unknown。
///
/// @ai-context: 表格已在全局阶段处理（detect_table），此处不再重复检测。
fn classify_region(grid: &FrameGrid, x0: u32, y0: u32, x1: u32, y1: u32) -> (RegionKind, f32) {
    let w = x1 - x0 + 1;
    let h = y1 - y0 + 1;
    if w == 0 || h == 0 {
        return (RegionKind::Unknown, CONFIDENCE_WEAK);
    }
    // 墨迹占比（区域密度）
    let mut ink = 0u32;
    let mut total = 0u32;
    for y in y0..=y1 {
        for x in x0..=x1 {
            total += 1;
            if grid.cells[(y * grid.cols + x) as usize] < INK_THRESHOLD {
                ink += 1;
            }
        }
    }
    let density = ink as f32 / total as f32;
    // 大面积低密度 → 图像/装饰（照片或留白）
    if density < 0.06 && w * h >= (grid.cols * grid.rows) / 6 {
        return (RegionKind::Image, CONFIDENCE_MEDIUM);
    }
    // 公式：中线长条（分数线）——最长行墨迹宽 ≥60% 区域宽，且上下行明显更短
    if is_formula_region(grid, x0, y0, x1, y1) {
        return (RegionKind::Formula, CONFIDENCE_MEDIUM);
    }
    // 代码块：≥3 墨迹行、行首对齐（首墨迹列差 ≤1）、行宽有变化（≥2 列）
    if is_code_block(grid, x0, y0, x1, y1) {
        return (RegionKind::Code, CONFIDENCE_MEDIUM);
    }
    // 常规文本（墨迹密度适中）
    if density >= 0.06 {
        (RegionKind::Text, CONFIDENCE_STRONG)
    } else {
        (RegionKind::Unknown, CONFIDENCE_WEAK)
    }
}

/// 公式启发：区域内最长连续墨迹段（分数线）宽 ≥60% 区域宽，且上下行平均宽
/// 不足最长段一半（分子/分母符号短于分数线）——渲染公式"分数/根号/积分"特征。
///
/// @ai-context: 高 ≥3 行才判定（单行 PPT 标题无上下参照不误判）；
///              与代码块的区分：代码行宽变化但无"独行长条"（行宽不会超过
///              上下行均宽 2 倍），误判代价低（产物层低置信标记）。
/// @ai-context: 行宽取"最长连续墨迹段"而非首尾差——分子左右两段符号
///              （如 "a²+b²"）若按首尾差会被误算为全宽长条。
fn is_formula_region(grid: &FrameGrid, x0: u32, y0: u32, x1: u32, y1: u32) -> bool {
    if y1 <= y0 + 1 {
        return false;
    }
    // 每行最长连续墨迹段宽
    let widths: Vec<u32> = (y0..=y1)
        .map(|y| longest_ink_run(grid, y, x0, x1))
        .collect();
    let max_w = *widths.iter().max().unwrap_or(&0);
    if max_w == 0 || (max_w as f32) / ((x1 - x0 + 1) as f32) < 0.6 {
        return false;
    }
    // 上下行平均宽（去除最长行自身与空行）
    let neighbors: Vec<u32> = widths.iter().filter(|&&w| w > 0 && w < max_w).copied().collect();
    if neighbors.is_empty() {
        return false;
    }
    let avg = neighbors.iter().sum::<u32>() as f32 / neighbors.len() as f32;
    avg < max_w as f32 / 2.0
}

/// 行内最长连续墨迹段宽（纯函数；无墨迹返回 0）。
fn longest_ink_run(grid: &FrameGrid, y: u32, x0: u32, x1: u32) -> u32 {
    let mut longest = 0u32;
    let mut current = 0u32;
    for x in x0..=x1 {
        if grid.cells[(y * grid.cols + x) as usize] < INK_THRESHOLD {
            current += 1;
            longest = longest.max(current);
        } else {
            current = 0;
        }
    }
    longest
}

/// 代码块启发：≥3 个墨迹行、各墨迹行首墨迹列接近（对齐）、行宽有变化。
///
/// @ai-context: 行首对齐是代码块核心特征（等宽缩进）；行宽变化区分代码
///              （不同行长）与 PPT 正文行（行长相近）。阈值宽松（对齐差 ≤1 列、
///              宽差 ≥2 列）——误判代价低（产物层按低置信可标记）。
fn is_code_block(grid: &FrameGrid, x0: u32, y0: u32, x1: u32, y1: u32) -> bool {
    let mut line_starts = Vec::new();
    let mut line_widths = Vec::new();
    for y in y0..=y1 {
        let ink_cols: Vec<u32> = (x0..=x1)
            .filter(|&x| grid.cells[(y * grid.cols + x) as usize] < INK_THRESHOLD)
            .collect();
        if !ink_cols.is_empty() {
            line_starts.push(*ink_cols.first().unwrap());
            line_widths.push(ink_cols.last().unwrap() - ink_cols.first().unwrap());
        }
    }
    if line_starts.len() < 3 {
        return false;
    }
    // 行首对齐：起点差异 ≤1 列
    let min = *line_starts.iter().min().unwrap_or(&x0);
    let max = *line_starts.iter().max().unwrap_or(&x0);
    // 行宽有变化：宽差 ≥2 列（区分等宽正文与变长代码）
    let min_w = *line_widths.iter().min().unwrap_or(&0);
    let max_w = *line_widths.iter().max().unwrap_or(&0);
    max - min <= 1 && max_w - min_w >= 2
}

/// 区域价值采样权重（REQ-047 第 3 点：区域类型 → 采样预算表）。
///
/// @ai-context: table/code 高权重高分辨率（结构信息价值高）；formula 中权重；
///              text 常规；image 跳过（非文字信息，M6 图集处理）；
///              unknown 低权重（低置信 → 补缝 AI 候选，V1.0）。
/// @ai-context: 返回 (采样权重 0.0-1.0, 是否跳过)。权重乘到区域级采样频率。
/// @ai-context: M4（region_ocr 调度）消费本表；当前仅测试覆盖，登记豁免 dead_code。
#[allow(dead_code)]
pub fn region_sampling_weight(kind: RegionKind) -> (f32, bool) {
    match kind {
        RegionKind::Table => (1.0, false),
        RegionKind::Code => (0.9, false),
        RegionKind::Formula => (0.7, false),
        RegionKind::Text => (0.5, false),
        RegionKind::Image => (0.0, true),
        RegionKind::Unknown => (0.2, false),
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "layout_analyzer_tests.rs"]
mod tests;
