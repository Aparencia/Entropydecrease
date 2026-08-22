//! 水印聚类与区域出现率（B/C 层纯函数，v0.11.5 spec 10️⃣）。
//!
//! @ai-context: watermark_filter 的辅助模块（子模块方式，无需 lib.rs 注册）——
//!              B 文本相似聚类（OCR 抖动防御）+ C 区域级出现率（与具体文本
//!              解耦）+ bbox 归一化网格区域键（A 层调用侧共用）。
//! @ai-context: 纯 std 依赖（类型经 super 引用父模块）——编辑距离/聚类/区域键
//!              均不触碰 IO，可独立推理与单测。
//! @ai-context: 误杀防线：聚类只归并"出现 ≥2 次"的文本——正文每帧微变
//!              （页码/序号类，各 1 次）不参与聚类；区域级判定要求区域内
//!              **文本种类 ≥2**（文本恒定的场景由 detect_watermarks 的文本
//!              不变性判定覆盖，双路径不重叠）。

use super::*;

/// 编辑距离（朴素 DP，O(n*m)；水印文本通常 ≤30 字符，无需三数组优化）。
///
/// @ai-context: 长度差 >2 直接剪枝返回 3（>2 即不聚类）——避免对长文本开
///              O(n*m) 矩阵。
pub(crate) fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (n, m) = (a.len(), b.len());
    if n.abs_diff(m) > 2 {
        return 3;
    }
    // 滚动两行 DP（前一行 + 当前行）
    let mut prev: Vec<usize> = (0..=m).collect();
    let mut cur = vec![0usize; m + 1];
    for i in 1..=n {
        cur[0] = i;
        for j in 1..=m {
            cur[j] = if a[i - 1] == b[j - 1] {
                prev[j - 1]
            } else {
                prev[j - 1].min(prev[j]).min(cur[j - 1]) + 1
            };
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[m]
}

/// 文本相似聚类映射：(region_key, 原文) → 聚类代表文本。
///
/// @ai-context: ① 按区域分组；② 组内文本按出现次数降序（→字典序，确定性）；
///              ③ 贪心：新文本与任一已选代表编辑距离 ≤2 → 并入（键=代表=出现
///              最多的原文），否则自身成为新代表。
/// @ai-context: **只聚类出现 ≥2 次的文本**——OCR 抖动变体跨帧重复出现
///              （水印特征），而正文页码类文本每帧各 1 次（不聚类防误杀）；
///              出现 1 次的文本保持独立（自映射，统计阶段自然不达阈值）。
pub(crate) fn cluster_texts(blocks: &[WatermarkInput]) -> BTreeMap<(String, String), String> {
    // ① 计数：region → 文本 → 出现次数
    let mut counts: BTreeMap<String, BTreeMap<String, u32>> = BTreeMap::new();
    for b in blocks {
        let t = b.text.trim();
        if t.is_empty() {
            continue;
        }
        *counts
            .entry(b.region_key.clone().unwrap_or_default())
            .or_default()
            .entry(t.to_string())
            .or_insert(0) += 1;
    }
    // ② 组内贪心归并
    let mut map: BTreeMap<(String, String), String> = BTreeMap::new();
    for (region, text_counts) in counts {
        let mut sorted: Vec<(String, u32)> = text_counts.into_iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let mut reps: Vec<String> = Vec::new(); // 聚类代表（出现最多的原文）
        for (text, count) in sorted {
            if count < 2 {
                // 1 次文本独立成组（不聚类）——防正文页码类误杀
                map.insert((region.clone(), text.clone()), text);
                continue;
            }
            match reps.iter().find(|r| edit_distance(r, &text) <= 2) {
                Some(rep) => {
                    map.insert((region.clone(), text.clone()), rep.clone());
                }
                None => {
                    map.insert((region.clone(), text.clone()), text.clone());
                    reps.push(text);
                }
            }
        }
    }
    map
}

/// 区域级出现率检测（C 层）：按 (region_key) 聚合、忽略具体文本。
///
/// @ai-context: 与 detect_watermarks 互补的第二路径——文本每帧在变（OCR 抖动
///              严重、相似聚类也难归并）但**区域位置稳定** → 区域级水印候选，
///              与具体文本解耦（texts 输出众数文本，空则区域键）。
/// @ai-context: 三阈值：① 出现帧数 ≥ min_occurrences（区域稳定）；② 区域内
///              文本种类 ≥2（文本在变——恒定文本场景归 B 层，双路径不重叠）；
///              ③ 整帧签名种类 ≥ min_distinct_frames（内容在变，防纯水印帧
///              误杀——沿用 detect_watermarks 的内容变化证据）。
/// @ai-context: region_key=None 的块跳过（区域级判定需要区域概念；无 bbox
///              降级路径由 detect_watermarks 的全局文本不变性覆盖）。
/// @ai-context: lib 内暂无调用方（C 层接线留后续任务）——测试目标已覆盖；
///              接线后移除 allow(dead_code)。
#[allow(dead_code)]
pub fn detect_region_watermarks(blocks: &[WatermarkInput], cfg: &WatermarkConfig) -> WatermarkResult {
    // ① 帧签名（整帧内容变化证据，与 detect_watermarks 同款）
    let frame_texts = frame_text_signatures(blocks);
    // ② 按区域聚合
    #[derive(Default)]
    struct RegionAcc {
        timestamps: BTreeSet<u64>,
        /// 文本 → 出现次数（众数文本输出用）
        texts: BTreeMap<String, u32>,
        frame_sigs: BTreeSet<String>,
    }
    let mut regions: BTreeMap<String, RegionAcc> = BTreeMap::new();
    for b in blocks {
        let Some(region) = b.region_key.as_deref() else { continue };
        let t = b.text.trim();
        if t.is_empty() {
            continue;
        }
        let acc = regions.entry(region.to_string()).or_default();
        acc.timestamps.insert(b.timestamp_ms);
        *acc.texts.entry(t.to_string()).or_insert(0) += 1;
        if let Some(sig) = frame_texts.get(&b.timestamp_ms) {
            acc.frame_sigs
                .insert(sig.iter().cloned().collect::<Vec<_>>().join("|"));
        }
    }
    // ③ 三阈值过滤
    let mut hits: Vec<WatermarkHit> = regions
        .into_iter()
        .filter_map(|(region, acc)| {
            let occurrences = acc.timestamps.len() as u32;
            let span = acc
                .timestamps
                .last()
                .zip(acc.timestamps.first())
                .map(|(hi, lo)| hi.saturating_sub(*lo))
                .unwrap_or(0);
            let distinct_frames = acc.frame_sigs.len() as u32;
            let distinct_texts = acc.texts.len() as u32;
            let hit = occurrences >= cfg.min_occurrences
                && distinct_texts >= 2
                && distinct_frames >= cfg.min_distinct_frames;
            hit.then(|| {
                // 众数文本：出现次数最多 → 字典序 tie-break（确定性）；空则区域名
                let text = acc
                    .texts
                    .iter()
                    .max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))
                    .map(|(t, _)| t.clone())
                    .unwrap_or_else(|| region.clone());
                WatermarkHit {
                    text,
                    region_key: Some(region),
                    occurrences,
                    span_ms: span,
                    distinct_frames,
                }
            })
        })
        .collect();
    sort_hits(&mut hits);
    let texts: Vec<String> = hits.iter().map(|h| h.text.clone()).collect();
    WatermarkResult { texts, hits }
}

/// bbox → 归一化网格区域键（A 层调用侧共用）：4x4 网格，行 = y_center/frame_h*4
/// 取整、列 = x_center/frame_w*4 取整 → `g{row}-{col}`。
///
/// @ai-context: frame 尺寸为同帧内容包围盒外扩近似（screen_merge::infer_frame_dims
///              口径，1.08 外扩）；无 bbox/帧尺寸非法 → None（调用方降级为
///              全局文本判定——与旧行为一致）。
/// @ai-context: clamp 兜底坐标恰在帧边界的情况（bbox 理论上 < 帧尺寸，防御性
///              取整防 4 越界）。
pub fn region_key_from_bbox(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    frame_w: f32,
    frame_h: f32,
) -> Option<String> {
    if frame_w <= 0.0 || frame_h <= 0.0 || w < 0.0 || h < 0.0 {
        return None;
    }
    let (cx, cy) = (x + w / 2.0, y + h / 2.0);
    let row = ((cy / frame_h * 4.0).floor() as usize).min(3);
    let col = ((cx / frame_w * 4.0).floor() as usize).min(3);
    Some(format!("g{}-{}", row, col))
}
