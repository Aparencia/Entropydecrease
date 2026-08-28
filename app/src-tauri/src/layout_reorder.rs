//! 屏内版面重建（v0.14 D3 layout_reorder；纯函数——简化 XY-Cut）。
//!
//! @ai-context: spec §4.3——现状净化链"字幕思维"（按时间戳线性拼接）对 PPT
//!              版面结构性错误；bbox 自 v0.5.0 落库从未使用。本模块用 bbox
//!              重建屏内阅读序：行聚类（y 容差）→ 行内 x 排序 → 栏检测（稳定
//!              列间隙）→ 标题识别（行高显著）→ 栏内 y 序输出。
//! @ai-context: 纯规则零 token；输入缺 bbox 的块跳过（调用方保证有 bbox 的
//!              块才进本模块——无 bbox 走旧路径，诚实降级）。
//! @ai-context: lib 内暂无生产调用方（屏卡版面重建接线留后续任务，目标版本
//!              v0.14.1）；测试目标已覆盖，登记 dead_code 豁免（机制先行
//!              模式，watermark_cluster 先例）。
#![allow(dead_code)]

/// 行聚类 y 容差（px；spec §4.3 步骤 1：±8px 内归行）
const Y_TOLERANCE: f32 = 8.0;
/// 栏检测最小间隙（块宽中位数的比例——列间隙须显著大于行内字距）
const COLUMN_GAP_RATIO: f32 = 0.6;
/// 栏间隙位置合并容差（px；同一位列的间隙在多行重复出现视为栏边界）
const COLUMN_MERGE_TOL: f32 = 24.0;
/// 栏间隙至少出现的行数（单行偶然大间隙不算栏）
const COLUMN_MIN_ROWS: usize = 2;
/// 标题行高倍数（行高 > 中位行高 × 该倍数 → 标题）
const TITLE_HEIGHT_RATIO: f32 = 1.2;

/// 版面块（屏内 OCR 块——必须带 bbox）。
#[derive(Debug, Clone, PartialEq)]
pub struct LayoutBlock {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// 重建后的行（阅读序：栏升序 → 栏内 y 升序）。
#[derive(Debug, Clone, PartialEq)]
pub struct ReorderedLine {
    pub text: String,
    /// 行中心 y（供段落拼接/增量锚定）
    pub y: f32,
    /// 行高（标题识别/字体差护栏复用）
    pub h: f32,
    pub is_title: bool,
    /// 栏序号（0=最左栏）
    pub column: usize,
}

/// 行聚类（y 中心容差 ±Y_TOLERANCE 归行）。
///
/// @ai-context: 块按 y 中心排序后线性扫描——相邻中心差 ≤ 容差即同行
///              （O(n log n)）；行内按 x 升序拼接文本（中文无空格直拼；
///              英文/数字间补空格——OCR 相邻英文词无分隔符会粘连）。
fn cluster_lines(blocks: &[LayoutBlock]) -> Vec<(Vec<&LayoutBlock>, f32, f32)> {
    let mut sorted: Vec<&LayoutBlock> = blocks.iter().collect();
    sorted.sort_by(|a, b| (a.y + a.h / 2.0).total_cmp(&(b.y + b.h / 2.0)));
    let mut lines: Vec<(Vec<&LayoutBlock>, f32, f32)> = Vec::new();
    for b in sorted {
        let cy = b.y + b.h / 2.0;
        let Some((members, y_sum, h_sum)) = lines.last_mut() else {
            lines.push((vec![b], cy, b.h));
            continue;
        };
        let line_cy = *y_sum / members.len() as f32;
        if (cy - line_cy).abs() <= Y_TOLERANCE {
            members.push(b);
            *y_sum += cy;
            *h_sum += b.h;
        } else {
            lines.push((vec![b], cy, b.h));
        }
    }
    lines
        .into_iter()
        .map(|(mut members, y_sum, h_sum)| {
            members.sort_by(|a, b| a.x.total_cmp(&b.x));
            let len = members.len() as f32;
            (members, y_sum / len, h_sum / len)
        })
        .collect()
}

/// 行内文本拼接：中文直拼；ASCII 词间补空格（防粘连）。
fn join_text(members: &[&LayoutBlock]) -> String {
    let mut out = String::new();
    for (i, m) in members.iter().enumerate() {
        let prev = if i > 0 { members[i - 1].text.chars().last() } else { None };
        let cur = m.text.chars().next();
        let ascii_gap = prev.is_some_and(|c| c.is_ascii_alphanumeric())
            && cur.is_some_and(|c| c.is_ascii_alphanumeric());
        if i > 0 && ascii_gap && !out.ends_with(' ') {
            out.push(' ');
        }
        out.push_str(m.text.trim());
    }
    out
}

/// 栏检测：统计各行内相邻块的正间隙；间隙须大于块宽中位数 × COLUMN_GAP_RATIO
/// （字距级小间隙不算栏），且同一位置（±COLUMN_MERGE_TOL）在多行重复出现 → 栏边界。
/// 返回栏边界 x 值列表（升序）。
fn detect_columns(lines: &[(Vec<&LayoutBlock>, f32, f32)]) -> Vec<f32> {
    // 块宽中位数（栏间隙合理性基准）
    let mut widths: Vec<f32> = lines.iter().flat_map(|(ms, _, _)| ms.iter()).map(|m| m.w).collect();
    widths.sort_by(|a, b| a.total_cmp(b));
    let min_gap = widths.get(widths.len() / 2).copied().unwrap_or(40.0) * COLUMN_GAP_RATIO;

    let mut gaps: Vec<(f32, f32)> = Vec::new(); // (间隙中位点, 行数)
    for (members, _, _) in lines {
        if members.len() < 2 {
            continue;
        }
        let mut row_gaps: Vec<f32> = Vec::new();
        for pair in members.windows(2) {
            let gap = pair[1].x - (pair[0].x + pair[0].w);
            if gap > min_gap {
                row_gaps.push(pair[0].x + pair[0].w + gap / 2.0);
            }
        }
        for g in row_gaps {
            if let Some((_, rows)) = gaps.iter_mut().find(|(pos, _)| (*pos - g).abs() <= COLUMN_MERGE_TOL) {
                *rows += 1.0;
            } else {
                gaps.push((g, 1.0));
            }
        }
    }
    let mut boundaries: Vec<f32> = gaps
        .into_iter()
        .filter(|(_, rows)| *rows >= COLUMN_MIN_ROWS as f32)
        .map(|(pos, _)| pos)
        .collect();
    boundaries.sort_by(|a, b| a.total_cmp(b));
    boundaries
}

/// 块分栏（按栏边界；块中心在边界左侧 → 左栏）。
fn column_of(x: f32, w: f32, boundaries: &[f32]) -> usize {
    let cx = x + w / 2.0;
    boundaries.iter().take_while(|b| cx > **b).count()
}

/// 屏内版面重建：输入屏内带 bbox 的块，输出阅读序行（栏 → y）。
pub fn reorder_screen(blocks: &[LayoutBlock]) -> Vec<ReorderedLine> {
    if blocks.is_empty() {
        return Vec::new();
    }
    let lines = cluster_lines(blocks);
    let boundaries = detect_columns(&lines);
    // 标题识别：行高 > 中位行高 × 1.2（标题字号显著更大）
    let mut heights: Vec<f32> = lines.iter().map(|(_, _, h)| *h).collect();
    heights.sort_by(|a, b| a.total_cmp(b));
    let median_h = heights[heights.len() / 2].max(1.0);
    let mut out: Vec<ReorderedLine> = Vec::new();
    for (members, y, h) in lines {
        // 行内块按栏拆分：同 y 的跨栏块必须分属不同栏（整行 join 会拼出
        // 「左一右一」式错误行——两栏版面同高两块的 x 序拼接违背阅读序）
        let mut by_col: Vec<(usize, Vec<&LayoutBlock>)> = Vec::new();
        for m in members {
            let col = column_of(m.x, m.w, &boundaries);
            match by_col.last_mut() {
                Some((c, bs)) if *c == col => bs.push(m),
                _ => by_col.push((col, vec![m])),
            }
        }
        for (col, col_blocks) in by_col {
            out.push(ReorderedLine {
                text: join_text(&col_blocks),
                y,
                h,
                is_title: h > median_h * TITLE_HEIGHT_RATIO,
                column: col,
            });
        }
    }
    // 阅读序：栏升序 → 栏内 y 升序（spec §4.3 步骤 5）
    out.sort_by(|a, b| a.column.cmp(&b.column).then_with(|| a.y.total_cmp(&b.y)));
    out
}

#[cfg(test)]
#[path = "layout_reorder_tests.rs"]
mod tests;
