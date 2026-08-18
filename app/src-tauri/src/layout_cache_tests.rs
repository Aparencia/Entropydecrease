//! 版面缓存单测（REQ-047 / v0.5.0 M3）。
//!
//! @ai-context: AAA 模式；覆盖命中复用/TTL 过期/LRU 淘汰/指纹区分/事件帧触发组合。

use super::*;
use crate::layout_analyzer::RegionKind;

/// 构造网格辅助（全白 + 指定行墨迹）。
fn grid_with_ink(cols: u32, rows: u32, ink_rows: &[u32]) -> FrameGrid {
    let mut cells = vec![255u8; (cols * rows) as usize];
    for &y in ink_rows {
        for x in 0..cols {
            cells[(y * cols + x) as usize] = 0;
        }
    }
    FrameGrid { cols, rows, cells }
}

fn region(kind: RegionKind) -> LayoutRegion {
    LayoutRegion { kind, x: 0, y: 0, w: 4, h: 2, confidence: 0.9, is_structural: false }
}

#[test]
fn put_then_get_reuses_regions() {
    // Arrange
    let mut cache = LayoutCache::with_capacity(8);
    let grid = grid_with_ink(32, 18, &[2, 4, 6]);
    let regions = vec![region(RegionKind::Text)];
    // Act：写入后查询
    cache.put(layout_fingerprint(&grid), regions.clone(), 1000);
    let got = cache.get(layout_fingerprint(&grid), 2000);
    // Assert：命中复用
    assert_eq!(got, Some(regions));
}

#[test]
fn ttl_expiry_forces_reanalysis() {
    // Arrange：超过 60s TTL
    let mut cache = LayoutCache::with_capacity(8);
    let grid = grid_with_ink(32, 18, &[2, 4, 6]);
    cache.put(layout_fingerprint(&grid), vec![region(RegionKind::Text)], 1000);
    // Act：61s 后查询
    let got = cache.get(layout_fingerprint(&grid), 1000 + CACHE_TTL_MS + 1000);
    // Assert：过期 → 不命中（强制重分析）
    assert_eq!(got, None);
}

#[test]
fn lru_evicts_oldest() {
    // Arrange：容量 2，三个不同版面
    let mut cache = LayoutCache::with_capacity(2);
    let g1 = grid_with_ink(32, 18, &[2]);
    let g2 = grid_with_ink(32, 18, &[4]);
    let g3 = grid_with_ink(32, 18, &[6]);
    cache.put(layout_fingerprint(&g1), vec![region(RegionKind::Text)], 100);
    cache.put(layout_fingerprint(&g2), vec![region(RegionKind::Code)], 200);
    cache.get(layout_fingerprint(&g1), 300); // 刷新 g1 为最近
    cache.put(layout_fingerprint(&g3), vec![region(RegionKind::Formula)], 400); // 淘汰 g2
    // Assert
    assert!(cache.get(layout_fingerprint(&g2), 500).is_none(), "g2 应被淘汰");
    assert!(cache.get(layout_fingerprint(&g1), 500).is_some());
    assert!(cache.get(layout_fingerprint(&g3), 500).is_some());
}

#[test]
fn fingerprint_differs_for_different_layouts() {
    // Arrange：不同墨迹行的版面
    let a = grid_with_ink(32, 18, &[2, 4]);
    let b = grid_with_ink(32, 18, &[2, 4, 6, 8]);
    // Act/Assert：指纹不同（事件帧触发基础）
    assert_ne!(layout_fingerprint(&a), layout_fingerprint(&b));
    // 相同版面指纹相同
    assert_eq!(layout_fingerprint(&a), layout_fingerprint(&grid_with_ink(32, 18, &[2, 4])));
}

#[test]
fn analyze_or_reuse_hits_cache_after_first() {
    // Arrange：同一网格两次调用
    let mut cache = LayoutCache::with_capacity(8);
    let grid = grid_with_ink(32, 18, &[2, 4, 6]);
    // Act：首次分析（未命中）→ 二次复用（命中）
    let (regions1, reused1) = analyze_or_reuse(&mut cache, &grid, 1000);
    let (regions2, reused2) = analyze_or_reuse(&mut cache, &grid, 2000);
    // Assert：首次分析产出区域，二次直接复用
    assert!(!reused1);
    assert!(reused2);
    assert_eq!(regions1, regions2, "复用结果应与首次一致");
    assert!(!regions1.is_empty(), "含墨迹行应产出区域");
}

#[test]
fn analyze_or_reuse_reanalyzes_on_layout_change() {
    // Arrange：版面变化（墨迹行不同）
    let mut cache = LayoutCache::with_capacity(8);
    let g_a = grid_with_ink(32, 18, &[2, 4]);
    let g_b = grid_with_ink(32, 18, &[2, 4, 6, 8]);
    // Act：A → B → A
    let (_, reused_a1) = analyze_or_reuse(&mut cache, &g_a, 1000);
    let (_, reused_b) = analyze_or_reuse(&mut cache, &g_b, 2000);
    let (_, reused_a2) = analyze_or_reuse(&mut cache, &g_a, 3000);
    // Assert：A 首次分析、B 重新分析、A 再命中缓存（往返复用——PPT 翻页往返）
    assert!(!reused_a1);
    assert!(!reused_b, "版面变化应触发重分析");
    assert!(reused_a2, "版面变回应复用缓存");
}
