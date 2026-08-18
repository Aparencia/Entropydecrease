//! 版面缓存（REQ-047 / v0.5.0 M3：事件帧触发 + 结果复用）。
//!
//! @ai-context: 帧 diff 变化事件触发版面分析——同一版面内后续帧复用分区结果，
//!              只重识别变化区域（OCR 缓存 M4 的扩展：版面缓存 = 版面级复用）。
//! @ai-context: 纯逻辑可单测；key 用帧的版面网格指纹（平均亮度向量哈希，
//!              简化用单元格亮度均值串），变化帧指纹不同 → 重新分析。
//! @ai-context: 缓存带时间戳：超过有效期强制重分析（防长期静止画面残留旧版面）。

use std::collections::HashMap;

use crate::layout_analyzer::{analyze_layout, FrameGrid, LayoutRegion};

/// 版面缓存有效期（ms）：超过则强制重分析（静止画面也周期性复核）。
const CACHE_TTL_MS: u64 = 60_000;
/// 默认容量（LRU 淘汰；覆盖 PPT 翻页往返窗口）。
const DEFAULT_CAPACITY: usize = 32;

/// 版面缓存条目。
#[derive(Debug, Clone)]
struct Entry {
    regions: Vec<LayoutRegion>,
    /// 分析时刻（会话纪元 ms）
    analyzed_at_ms: u64,
}

/// 版面缓存（有状态；屏幕 worker 独占）。
#[derive(Debug)]
pub struct LayoutCache {
    capacity: usize,
    map: HashMap<u64, Entry>,
    /// LRU 序（front=最近使用）
    order: std::collections::VecDeque<u64>,
}

impl Default for LayoutCache {
    fn default() -> Self {
        Self::new()
    }
}

impl LayoutCache {
    pub fn new() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            map: HashMap::new(),
            order: std::collections::VecDeque::new(),
        }
    }

    /// 查询版面：指纹命中且未过期 → 复用区域；否则 None（调用方分析后 put）。
    ///
    /// @ai-context: 命中条件 = 指纹相同（同一版面）+ 未超 TTL（防静止残留）。
    pub fn get(&mut self, fingerprint: u64, now_ms: u64) -> Option<Vec<LayoutRegion>> {
        let entry = self.map.get(&fingerprint)?;
        if now_ms.saturating_sub(entry.analyzed_at_ms) > CACHE_TTL_MS {
            return None;
        }
        // LRU 刷新
        if let Some(pos) = self.order.iter().position(|&k| k == fingerprint) {
            self.order.remove(pos);
        }
        self.order.push_front(fingerprint);
        Some(entry.regions.clone())
    }

    /// 写入版面结果（指纹 → 区域 + 分析时刻）；超容量淘汰最久未用。
    pub fn put(&mut self, fingerprint: u64, regions: Vec<LayoutRegion>, now_ms: u64) {
        if let Some(pos) = self.order.iter().position(|&k| k == fingerprint) {
            self.order.remove(pos);
        } else if self.map.len() >= self.capacity {
            if let Some(evict) = self.order.pop_back() {
                self.map.remove(&evict);
            }
        }
        self.map.insert(fingerprint, Entry { regions, analyzed_at_ms: now_ms });
        self.order.push_front(fingerprint);
    }
}

/// 版面指纹（纯函数）：行投影 + 列投影的墨迹占比阈值位图（64bit）。
///
/// @ai-context: 由网格直接计算（无需整帧 hash）——同版面帧 → 同指纹；
///              内容变化 → 指纹变化 → 触发重分析（事件帧触发语义）。
/// @ai-context: 前 32bit = 行墨迹占比超阈值的行位图，后 32bit = 列位图
///              （行列投影覆盖全网格，避免仅取前 64 格漏掉下方版面变化）。
pub fn layout_fingerprint(grid: &FrameGrid) -> u64 {
    if grid.cells.is_empty() || grid.cols == 0 || grid.rows == 0 {
        return 0;
    }
    let mut hash = 0u64;
    // 行投影位图（前 32 行）
    for y in 0..grid.rows.min(32) {
        let start = (y * grid.cols) as usize;
        let end = start + grid.cols as usize;
        let ink = grid.cells[start..end].iter().filter(|&&v| v < 160).count();
        if ink as f32 / grid.cols as f32 >= 0.3 {
            hash |= 1 << y;
        }
    }
    // 列投影位图（后 32 列）
    for x in 0..grid.cols.min(32) {
        let mut ink = 0u32;
        for y in 0..grid.rows {
            if grid.cells[(y * grid.cols + x) as usize] < 160 {
                ink += 1;
            }
        }
        if ink as f32 / grid.rows as f32 >= 0.3 {
            hash |= 1 << (32 + x);
        }
    }
    hash
}

/// 事件帧触发辅助：分析或复用版面（纯函数组合）。
///
/// @ai-context: 由屏幕 worker 调用：指纹命中（未过期）→ 复用；否则分析并缓存。
///              返回 (区域列表, 是否复用缓存)。
pub fn analyze_or_reuse(
    cache: &mut LayoutCache,
    grid: &FrameGrid,
    now_ms: u64,
) -> (Vec<LayoutRegion>, bool) {
    let fingerprint = layout_fingerprint(grid);
    if let Some(regions) = cache.get(fingerprint, now_ms) {
        return (regions, true);
    }
    let regions = analyze_layout(grid);
    cache.put(fingerprint, regions.clone(), now_ms);
    (regions, false)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "layout_cache_tests.rs"]
mod tests;
