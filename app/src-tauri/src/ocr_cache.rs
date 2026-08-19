//! OCR 结果 LRU 缓存（REQ-039 E5 / v0.4.0 M4）。
//!
//! @ai-context: 区域感知哈希（OCR 输入图的 8×8 均值哈希）→ LRU 结果缓存。
//!              A→B→A 帧往返（PPT 翻页/窗口抖动/静止字幕重复帧）复用缓存零推理，
//!              与变化检测构成两级过滤：变化检测滤"无变化"帧，缓存滤"变回去了"的帧。
//! @ai-context: 纯逻辑可单测；64bit aHash 冲突（不同内容同 hash）概率低，
//!              冲突后果=返回旧文本一次（投票器/去重可吸收），可接受。
//! @ai-context: 命中返回历史结果——字幕场景同内容帧的识别结果一致（无害）；
//!              识别结果不含帧特定信息（timestamp 由调用方填），可安全复用。

use std::collections::{HashMap, VecDeque};

use crate::types::OcrBlock;

/// 默认缓存容量（LRU 淘汰；覆盖 PPT 翻页往返 + 窗口抖动窗口内的帧数级）。
const DEFAULT_CAPACITY: usize = 256;

/// OCR 结果缓存（有状态；引擎 worker 独占）。
#[derive(Debug)]
pub struct OcrCache {
    capacity: usize,
    map: HashMap<u64, Vec<OcrBlock>>,
    /// LRU 序（front=最近使用）
    order: VecDeque<u64>,
    hits: u64,
    misses: u64,
}

impl Default for OcrCache {
    fn default() -> Self {
        Self::new()
    }
}

impl OcrCache {
    pub fn new() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            map: HashMap::new(),
            order: VecDeque::new(),
            hits: 0,
            misses: 0,
        }
    }

    /// 查缓存：命中刷新 LRU 序并返回副本；未命中返回 None（调用方识别后 put）。
    pub fn get(&mut self, key: u64) -> Option<Vec<OcrBlock>> {
        match self.map.get(&key) {
            Some(blocks) => {
                self.hits += 1;
                // LRU 刷新：移到队首（front=最近使用）
                if let Some(pos) = self.order.iter().position(|&k| k == key) {
                    self.order.remove(pos);
                }
                self.order.push_front(key);
                Some(blocks.clone())
            }
            None => {
                self.misses += 1;
                None
            }
        }
    }

    /// 写入缓存：已存在则更新并刷新 LRU 序；超容量淘汰最久未用（队尾）。
    pub fn put(&mut self, key: u64, blocks: Vec<OcrBlock>) {
        if let Some(pos) = self.order.iter().position(|&k| k == key) {
            self.order.remove(pos);
        } else if self.map.len() >= self.capacity {
            if let Some(evict) = self.order.pop_back() {
                self.map.remove(&evict);
            }
        }
        self.map.insert(key, blocks);
        self.order.push_front(key);
    }

    /// 命中/未命中统计（M7 诊断面板数据源；开发期日志）。
    pub fn stats(&self) -> (u64, u64) {
        (self.hits, self.misses)
    }
}

/// 8×8 均值哈希（对 OCR 输入图；纯函数）。
///
/// @ai-context: 每格均匀步进采样（≤16×16 点）计算平均灰度，整体均值作阈值
///              生成 64bit 位图——对亮度平移鲁棒、对内容差异敏感；
///              成本 ≈64×256 像素采样，远低于一次 OCR 推理。
pub fn average_hash(image: &image::RgbImage) -> u64 {
    const CELLS: u32 = 8;
    let (w, h) = image.dimensions();
    if w == 0 || h == 0 {
        return 0;
    }
    let raw = image.as_raw();
    let mut cells = [0u64; 64];
    for cy in 0..CELLS {
        let y0 = cy * h / CELLS;
        let y1 = (cy + 1) * h / CELLS;
        let sy = ((y1 - y0) / 16).max(1);
        for cx in 0..CELLS {
            let x0 = cx * w / CELLS;
            let x1 = (cx + 1) * w / CELLS;
            let sx = ((x1 - x0) / 16).max(1);
            let mut sum = 0u64;
            let mut n = 0u64;
            let mut y = y0;
            while y < y1 {
                let row = y as usize * w as usize * 3;
                let mut x = x0;
                while x < x1 {
                    let i = row + x as usize * 3;
                    // 简化 Rec.601 亮度（整数权重）
                    sum += (raw[i] as u64 * 299 + raw[i + 1] as u64 * 587 + raw[i + 2] as u64 * 114) / 1000;
                    n += 1;
                    x += sx;
                }
                y += sy;
            }
            cells[(cy * CELLS + cx) as usize] = sum.checked_div(n).unwrap_or(0);
        }
    }
    let mean = cells.iter().sum::<u64>() / cells.len() as u64;
    let mut hash = 0u64;
    for (i, &c) in cells.iter().enumerate() {
        if c > mean {
            hash |= 1 << i;
        }
    }
    hash
}

/// 8×8 差异哈希（对 OCR 输入图；纯函数；REQ-067 双指纹之一）。
///
/// @ai-context: 与 average_hash 同源灰度化（简化 Rec.601），但编码**相邻格
///              亮度差**的符号——对边缘/纹理敏感、对整体亮度平移鲁棒；
///              与 aHash（区域均值 vs 整体均值）互补：aHash 双稳定 + dHash
///              双稳定才判定同图（见 frame_cluster::same_image）。
/// @ai-context: 每格采样 4×4 点平均（比 aHash 16×16 粗——dHash 只关心
///              相对关系，粗采样足够且更省）；成本与 aHash 同量级。
pub fn difference_hash(image: &image::RgbImage) -> u64 {
    const CELLS: u32 = 8;
    let (w, h) = image.dimensions();
    if w == 0 || h == 0 {
        return 0;
    }
    let raw = image.as_raw();
    let mut cells = [0u64; 64];
    for cy in 0..CELLS {
        let y0 = cy * h / CELLS;
        let y1 = (cy + 1) * h / CELLS;
        let sy = ((y1 - y0) / 4).max(1);
        for cx in 0..CELLS {
            let x0 = cx * w / CELLS;
            let x1 = (cx + 1) * w / CELLS;
            let sx = ((x1 - x0) / 4).max(1);
            let mut sum = 0u64;
            let mut n = 0u64;
            let mut y = y0;
            while y < y1 {
                let row = y as usize * w as usize * 3;
                let mut x = x0;
                while x < x1 {
                    let i = row + x as usize * 3;
                    sum += (raw[i] as u64 * 299 + raw[i + 1] as u64 * 587 + raw[i + 2] as u64 * 114) / 1000;
                    n += 1;
                    x += sx;
                }
                y += sy;
            }
            cells[(cy * CELLS + cx) as usize] = sum.checked_div(n).unwrap_or(0);
        }
    }
    // 位编码：行内右邻比较（8×7=56 位）+ 首列下邻比较（7 位）= 63 位有效；
    // 第 64 位恒 0——双指纹汉明距离比较中该位双方恒等，不影响判定
    let mut hash = 0u64;
    let mut idx = 0usize;
    for cy in 0..CELLS {
        for cx in 0..(CELLS - 1) {
            let i = (cy * CELLS + cx) as usize;
            if cells[i + 1] > cells[i] {
                hash |= 1 << idx;
            }
            idx += 1;
        }
    }
    for cy in 0..(CELLS - 1) {
        let i = (cy * CELLS) as usize;
        if cells[i + CELLS as usize] > cells[i] {
            hash |= 1 << idx;
        }
        idx += 1;
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(text: &str) -> OcrBlock {
        OcrBlock { timestamp_ms: None, text: text.to_string(), score: 0.9, bbox: None, region_kind: None }
    }

    /// 左右分屏（左=left 灰、右=right 灰）——空间不对称内容
    fn hsplit_image(w: u32, h: u32, left: u8, right: u8) -> image::RgbImage {
        image::RgbImage::from_fn(w, h, |x, _| {
            let v = if x < w / 2 { left } else { right };
            image::Rgb([v, v, v])
        })
    }

    /// 上下分屏（上=top 灰、下=bottom 灰）——空间不对称内容
    fn vsplit_image(w: u32, h: u32, top: u8, bottom: u8) -> image::RgbImage {
        image::RgbImage::from_fn(w, h, |_, y| {
            let v = if y < h / 2 { top } else { bottom };
            image::Rgb([v, v, v])
        })
    }

    #[test]
    fn get_miss_returns_none() {
        let mut cache = OcrCache::with_capacity(4);
        assert_eq!(cache.get(1), None);
        assert_eq!(cache.stats(), (0, 1));
    }

    #[test]
    fn put_then_get_hits() {
        let mut cache = OcrCache::with_capacity(4);
        cache.put(7, vec![block("你好")]);
        let got = cache.get(7).expect("hit");
        assert_eq!(got, vec![block("你好")]);
        assert_eq!(cache.stats(), (1, 0));
    }

    #[test]
    fn lru_evicts_least_recently_used() {
        let mut cache = OcrCache::with_capacity(2);
        cache.put(1, vec![block("a")]);
        cache.put(2, vec![block("b")]);
        cache.get(1); // 刷新 1 为最近
        cache.put(3, vec![block("c")]); // 淘汰 2
        assert!(cache.get(2).is_none(), "最久未用 2 应被淘汰");
        assert!(cache.get(1).is_some());
        assert!(cache.get(3).is_some());
    }

    #[test]
    fn put_existing_refreshes_order() {
        let mut cache = OcrCache::with_capacity(2);
        cache.put(1, vec![block("a")]);
        cache.put(2, vec![block("b")]);
        cache.put(1, vec![block("a2")]); // 更新 1 → 1 变最近
        cache.put(3, vec![block("c")]); // 淘汰 2
        assert!(cache.get(2).is_none());
        assert_eq!(cache.get(1).expect("hit")[0].text, "a2");
    }

    #[test]
    fn average_hash_stable_for_same_image() {
        let a = hsplit_image(960, 540, 30, 200);
        let b = hsplit_image(960, 540, 30, 200);
        assert_eq!(average_hash(&a), average_hash(&b));
    }

    #[test]
    fn average_hash_differs_for_different_content() {
        // 左右分屏 vs 上下分屏：格子相对均值编码必然不同
        let a = hsplit_image(960, 540, 30, 200);
        let b = vsplit_image(960, 540, 30, 200);
        assert_ne!(average_hash(&a), average_hash(&b));
    }

    #[test]
    fn average_hash_robust_to_brightness_shift() {
        // 亮度平移（30→40 / 200→210）：均值哈希按格相对均值编码，应保持稳定
        let a = hsplit_image(960, 540, 30, 200);
        let b = hsplit_image(960, 540, 40, 210);
        assert_eq!(average_hash(&a), average_hash(&b));
    }

    #[test]
    fn average_hash_empty_image_is_zero() {
        assert_eq!(average_hash(&image::RgbImage::new(0, 0)), 0);
    }

    // ── REQ-067（v0.6.0 M3）：dHash 差异哈希 ──

    #[test]
    fn difference_hash_stable_for_same_image() {
        let a = hsplit_image(960, 540, 30, 200);
        let b = hsplit_image(960, 540, 30, 200);
        assert_eq!(difference_hash(&a), difference_hash(&b));
    }

    #[test]
    fn difference_hash_differs_for_different_content() {
        // 左右分屏 vs 上下分屏：相邻格亮度关系必然不同
        let a = hsplit_image(960, 540, 30, 200);
        let b = vsplit_image(960, 540, 30, 200);
        assert_ne!(difference_hash(&a), difference_hash(&b));
    }

    #[test]
    fn difference_hash_robust_to_brightness_shift() {
        // 亮度平移：相邻格相对关系不变 → 哈希稳定（与 aHash 同鲁棒性）
        let a = hsplit_image(960, 540, 30, 200);
        let b = hsplit_image(960, 540, 40, 210);
        assert_eq!(difference_hash(&a), difference_hash(&b));
    }

    #[test]
    fn difference_hash_scale_invariant_golden() {
        // 旋转/缩放去重 golden（REQ-067 验收）：同一内容不同分辨率 →
        // 双指纹判定仍为同图（same_image 双稳定）
        let a = hsplit_image(960, 540, 30, 200);
        let small = hsplit_image(480, 270, 30, 200);
        let (ha, da) = (average_hash(&a), difference_hash(&a));
        let (hs, ds) = (average_hash(&small), difference_hash(&small));
        // 缩放下指纹应高度接近（汉明距离小）
        assert!(crate::frame_cluster::hamming(ha, hs) <= 12, "缩放后 aHash 应接近");
        assert!(crate::frame_cluster::hamming(da, ds) <= 12, "缩放后 dHash 应接近");
        // 双指纹判定同图（阈值放宽到缩放容差）
        assert!(crate::frame_cluster::same_image(ha, da, hs, ds, 12, 12));
        // 不同内容不应误判同图
        let other = vsplit_image(960, 540, 30, 200);
        let (ho, do_) = (average_hash(&other), difference_hash(&other));
        assert!(!crate::frame_cluster::same_image(ha, da, ho, do_, 12, 12));
    }

    #[test]
    fn difference_hash_empty_image_is_zero() {
        assert_eq!(difference_hash(&image::RgbImage::new(0, 0)), 0);
    }

    #[test]
    fn a_to_b_to_a_roundtrip_hits_cache() {
        // E5 验收语义：A→B→A 往返复用缓存零推理
        let mut cache = OcrCache::with_capacity(16);
        let img_a = hsplit_image(320, 180, 30, 200);
        let img_b = vsplit_image(320, 180, 90, 120);
        let ha = average_hash(&img_a);
        let hb = average_hash(&img_b);
        assert_ne!(ha, hb, "测试前提：A/B 内容哈希必须不同");
        // A 帧识别一次，B 帧识别一次，A 帧再来 → 命中
        assert!(cache.get(ha).is_none());
        cache.put(ha, vec![block("A")]);
        assert!(cache.get(hb).is_none());
        cache.put(hb, vec![block("B")]);
        assert_eq!(cache.get(ha).expect("往返命中")[0].text, "A");
        assert_eq!(cache.stats(), (1, 2));
    }
}
