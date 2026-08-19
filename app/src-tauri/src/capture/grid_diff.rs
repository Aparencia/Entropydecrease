//! 网格差异变化检测与 UI 面板事件（ADR-011 / REQ-086 / REQ-087）。
//!
//! @ai-context: 替代 frame_diff.rs 的分块采样 hash（ADR-011）——旧算法 8 块 × 60 字节
//!              均匀采样在 1920 宽窗口下采样列仅 {0,480,960,1440}（字节步长混叠），
//!              静止画面（幻灯片/板书/字幕）中局部文字变化常落采样列外 → 完全漏检
//!              → OCR 不触发（用户反馈：同视频内页面变化不触发、切软件页面才触发）。
//!              网格指纹按格全覆盖采样，任何位置的局部变化都能命中。
//! @ai-context: PanelDetector（REQ-087）复用同一变化格集合——4-邻接连通聚类，
//!              大面积聚类连续出现 = 控制栏/弹窗等 UI 面板（出现事件同步性）；
//!              滚动字幕/弹幕是窄带持续变化（面积 < 阈值）不误判。
//! @ai-context: 纯逻辑无 IO，可单测；调用方（live_session_frame.rs）持有实例。

use crate::capture::frame_diff::Rect;

/// 全帧网格密度（列 × 行）。576 格 × 8 采样 ≈ 4.6K 像素采样/tick，
/// 成本为 OCR 推理的千分之一量级（变化检测是 OCR 的门卫，成本必须远低于它）。
pub const GRID_COLS: u32 = 32;
pub const GRID_ROWS: u32 = 18;

/// 字幕 ROI 裁剪帧网格密度（ROI 是底部带，8×4 足够定位字幕行）。
pub const ROI_COLS: u32 = 8;
pub const ROI_ROWS: u32 = 4;

/// 每格指纹采样数（2 行 × 4 列子块中心；8 样本 × 8bit 亮度 = u64）。
const SAMPLES_PER_CELL: usize = 8;

/// 大面积变化阈值（变化格占比 ≥ 8% 视为"页面切换"级变化，
/// 即使与字幕带相交也触发全帧——翻页时字幕带与页面同变）。
pub const LARGE_CHANGE_RATIO: f32 = 0.08;

/// 面板聚类面积阈值（最大连通聚类 ≥ 帧面积 8% 才算面板候选；
/// 满宽单行字幕 ≈5.6%、窄带滚动更低，天然不达阈值）。
pub const PANEL_MIN_AREA_RATIO: f32 = 0.08;

/// 面板候选确认所需连续 tick 数（同区域持续变化才确认，
/// 防字幕切换等单 tick 大面积变化误判）。
pub const PANEL_CONFIRM_TICKS: u32 = 2;

/// 面板活跃滑动窗口（ms）：确认后开始计时，区域内再次变化则重置。
///
/// @ai-context: 无"消失提前结束"（实现微调 2026-08-19）：静止面板（出现后
///              停住、不再产生变化格）是控制栏悬停的常态，若按"区域无变化"
///              提前结束会放过它；窗口自然到期 + ui_junk 词表兜底 + 投票器
///              已构成足够防线（3s 后残留 UI 文本命中播放器词表概率高）。
pub const PANEL_HOLD_MS: u64 = 3_000;

/// 网格差异结果（帧坐标系）。
#[derive(Debug, Clone, PartialEq)]
pub struct GridDiff {
    /// 变化格集合（列优先索引：y * cols + x；空 = 无变化）
    pub changed_cells: Vec<usize>,
    /// 变化包围盒（帧坐标；无变化为 None）
    pub bounds: Option<Rect>,
    /// 变化格占比（changed / 总格数；用于大面积/带外判定）
    pub changed_ratio: f32,
}

impl GridDiff {
    fn empty() -> Self {
        Self { changed_cells: Vec::new(), bounds: None, changed_ratio: 0.0 }
    }
}

/// 网格指纹变化检测器（有状态：保存上一帧指纹基准）。
///
/// @ai-context: 指纹 = 每格 8 个采样点（2×4 子块中心）的亮度量化拼成 u64；
///              逐格比较产出变化格集合与包围盒。语义与旧 has_changed 对齐：
///              首帧视为全变；帧尺寸变化视为全变；空帧防御返回空；
///              无论是否变化均更新基准（防亚阈值累积）。
pub struct GridDiffDetector {
    cols: u32,
    rows: u32,
    last_fingerprints: Vec<u64>,
    frame_w: u32,
    frame_h: u32,
}

impl GridDiffDetector {
    pub fn new(cols: u32, rows: u32) -> Self {
        Self { cols: cols.max(1), rows: rows.max(1), last_fingerprints: Vec::new(), frame_w: 0, frame_h: 0 }
    }

    /// 计算本帧网格差异并更新基准。
    pub fn diff(&mut self, frame: &[u8], width: u32, height: u32) -> GridDiff {
        if width == 0 || height == 0 || frame.len() != width as usize * height as usize * 4 {
            // 防御：空帧/尺寸不匹配不触发（与旧 has_changed 空帧语义一致）
            return GridDiff::empty();
        }
        let total = (self.cols * self.rows) as usize;
        let mut cur = Vec::with_capacity(total);
        for cy in 0..self.rows {
            for cx in 0..self.cols {
                cur.push(cell_fingerprint(frame, width, height, self.cols, self.rows, cx, cy));
            }
        }
        // 尺寸变化 → 旧基准失效，全格视为变化（窗口缩放/换分辨率）
        let size_changed = self.frame_w != width || self.frame_h != height;
        let mut changed: Vec<usize> = Vec::new();
        for i in 0..total {
            if size_changed || self.last_fingerprints.get(i).copied() != cur.get(i).copied() {
                changed.push(i);
            }
        }
        self.last_fingerprints = cur;
        self.frame_w = width;
        self.frame_h = height;
        if changed.is_empty() {
            return GridDiff::empty();
        }
        GridDiff {
            changed_ratio: changed.len() as f32 / total as f32,
            bounds: Some(bounds_of(&changed, self.cols, self.rows, width, height)),
            changed_cells: changed,
        }
    }
}

/// 格指纹：格内 2×4 子块中心的亮度量化（8bit）拼成 u64。
///
/// @ai-context: 子块中心采样保证格内任何 ≥1 子块的变化都能命中——
///              对"局部文字块"这类小区域变化，命中粒度 = 子块大小
///              （全帧 32×18 下每格 60×60px，子块 30×30px）。
fn cell_fingerprint(frame: &[u8], w: u32, h: u32, cols: u32, rows: u32, cx: u32, cy: u32) -> u64 {
    let x0 = cx * w / cols;
    let y0 = cy * h / rows;
    let x1 = ((cx + 1) * w / cols).max(x0 + 1);
    let y1 = ((cy + 1) * h / rows).max(y0 + 1);
    let mut fp: u64 = 0;
    for i in 0..SAMPLES_PER_CELL {
        // 2 行 × 4 列子块：采样点在子块中心（行/列按 4 分割）
        let sy = y0 + (y1 - y0) * (2 * (i / 4) as u32 + 1) / 4;
        let sx = x0 + (x1 - x0) * (2 * (i % 4) as u32 + 1) / 8;
        let idx = (sy as usize * w as usize + sx as usize) * 4;
        // BGRA → 亮度（简化 Rec.601）；8bit 量化
        let luma = (frame[idx + 2] as u32 * 299 + frame[idx + 1] as u32 * 587 + frame[idx] as u32 * 114) / 1000;
        fp = (fp << 8) | (luma as u64 & 0xFF);
    }
    fp
}

/// 变化格 → 帧坐标包围盒（格边界线性映射到像素边界，左闭右开）。
fn bounds_of(changed: &[usize], cols: u32, rows: u32, w: u32, h: u32) -> Rect {
    let mut cmin = usize::MAX;
    let mut rmin = usize::MAX;
    let mut cmax = 0usize;
    let mut rmax = 0usize;
    for &c in changed {
        let (cx, cy) = (c % cols as usize, c / cols as usize);
        cmin = cmin.min(cx);
        cmax = cmax.max(cx);
        rmin = rmin.min(cy);
        rmax = rmax.max(cy);
    }
    Rect {
        left: (cmin as u32 * w / cols) as i32,
        top: (rmin as u32 * h / rows) as i32,
        right: ((cmax as u32 + 1) * w / cols) as i32,
        bottom: ((rmax as u32 + 1) * h / rows) as i32,
    }
}

/// 带外变化判定（ADR-011）：变化包围盒与字幕带无交，或变化格占比 ≥ 大面积阈值。
///
/// @ai-context: 字幕带由调用方传入（region_tracker::prior_roi 语义：
///              播放区域底部 25% 带，无播放区域退化为窗口底部 25% 带）。
pub fn is_outside_band(
    bounds: Option<&Rect>,
    band: &Rect,
    changed_ratio: f32,
    large_change_ratio: f32,
) -> bool {
    let Some(b) = bounds else { return false };
    changed_ratio >= large_change_ratio || band.intersect(b).is_none()
}

/// UI 面板检测器（REQ-087）：变化格连通聚类 → 大面积连续候选 → 面板活跃期。
///
/// @ai-context: 控制栏/弹窗出现 = 一大片互不相关的 UI 块**同时**出现（变化格
///              大面积聚类连续 2 tick 确认）；滚动字幕/弹幕 = 窄带持续变化
///              （面积不足阈值）。活跃期 = 滑动窗口（确认后 PANEL_HOLD_MS，
///              区域内再变化重置；无变化则窗口自然到期——静止面板防护见
///              PANEL_HOLD_MS 注释）。调用方在活跃期丢弃字幕 OCR 文本。
#[derive(Debug, Default)]
pub struct PanelDetector {
    active: bool,
    active_until_ms: u64,
    /// 面板候选包围盒（格坐标：(col_min, row_min, col_max, row_max)）
    region_bbox: Option<(usize, usize, usize, usize)>,
    candidate_ticks: u32,
}

impl PanelDetector {
    /// 每采样 tick 喂入全帧变化格集合与当前时刻（会话纪元 ms）。
    pub fn feed(&mut self, changed_cells: &[usize], cols: usize, rows: usize, now_ms: u64) {
        let total = (cols.saturating_mul(rows)).max(1) as f32;
        let cluster = largest_cluster(changed_cells, cols, rows);
        if !cluster.is_empty() && cluster.len() as f32 / total >= PANEL_MIN_AREA_RATIO {
            let bbox = bbox_of(&cluster, cols);
            let overlaps = self.region_bbox.is_some_and(|r| bbox_overlap(r, bbox));
            self.candidate_ticks = if overlaps { self.candidate_ticks + 1 } else { 1 };
            self.region_bbox = Some(bbox);
            if self.active || self.candidate_ticks >= PANEL_CONFIRM_TICKS {
                // 已活跃（再变化 → 重置窗口）或本次达到确认阈值 → 进入/保持活跃
                self.active = true;
                self.active_until_ms = now_ms.saturating_add(PANEL_HOLD_MS);
            }
        } else {
            // 无大面积候选：候选计数清零（重新确认需再连续 2 tick）；
            // 活跃期不提前结束（静止面板防护），等待滑动窗口自然到期
            self.candidate_ticks = 0;
        }
        if self.active && now_ms >= self.active_until_ms {
            // 滑动窗口到期（含边界 tick：3s 整即结束）
            self.active = false;
        }
    }

    /// 当前是否处于面板活跃期（字幕源头丢弃门控）。
    pub fn is_active(&self) -> bool {
        self.active
    }
}

/// 变化格 4-邻接连通聚类（BFS）：返回最大聚类（空 = 无变化）。
fn largest_cluster(cells: &[usize], cols: usize, rows: usize) -> Vec<usize> {
    if cells.is_empty() || cols == 0 || rows == 0 {
        return Vec::new();
    }
    let mut grid = vec![false; cols * rows];
    for &c in cells {
        if c < grid.len() {
            grid[c] = true;
        }
    }
    let mut visited = vec![false; cols * rows];
    let mut best: Vec<usize> = Vec::new();
    for &start in cells {
        if start >= grid.len() || visited[start] {
            continue;
        }
        let mut stack = vec![start];
        visited[start] = true;
        let mut comp: Vec<usize> = Vec::new();
        while let Some(c) = stack.pop() {
            comp.push(c);
            let (cx, cy) = (c % cols, c / cols);
            for (dx, dy) in [(1i32, 0i32), (-1, 0), (0, 1), (0, -1)] {
                let nx = cx as i32 + dx;
                let ny = cy as i32 + dy;
                if nx < 0 || ny < 0 || nx >= cols as i32 || ny >= rows as i32 {
                    continue;
                }
                let ni = ny as usize * cols + nx as usize;
                if grid[ni] && !visited[ni] {
                    visited[ni] = true;
                    stack.push(ni);
                }
            }
        }
        if comp.len() > best.len() {
            best = comp;
        }
    }
    best
}

/// 聚类格集合 → 格坐标包围盒（(col_min, row_min, col_max, row_max)）。
fn bbox_of(cells: &[usize], cols: usize) -> (usize, usize, usize, usize) {
    let mut cmin = usize::MAX;
    let mut rmin = usize::MAX;
    let mut cmax = 0usize;
    let mut rmax = 0usize;
    for &c in cells {
        let (cx, cy) = (c % cols, c / cols);
        cmin = cmin.min(cx);
        cmax = cmax.max(cx);
        rmin = rmin.min(cy);
        rmax = rmax.max(cy);
    }
    (cmin, rmin, cmax, rmax)
}

/// 两个格坐标包围盒是否相交。
fn bbox_overlap(a: (usize, usize, usize, usize), b: (usize, usize, usize, usize)) -> bool {
    a.0 <= b.2 && b.0 <= a.2 && a.1 <= b.3 && b.1 <= a.3
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "grid_diff_tests.rs"]
mod tests;
