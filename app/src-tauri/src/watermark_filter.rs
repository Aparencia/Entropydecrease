//! 水印/台标/角标过滤（REQ-059 / v0.6.0 M1；v0.11.5 spec 10️⃣ A+B+C 落地）。
//!
//! @ai-context: 产物与术语统计的"输入干净化"——区域稳定性（同区域同文本出现
//!              ≥N 次）+ 文本不变性（内容不随版面变化）→ 水印候选集；
//!              产物层过滤 + 术语统计排除（REQ-061 前置），**原料层不动**。
//! @ai-context: "内容不随版面变化"的实现：水印出现帧的**整帧文本签名**须有
//!              ≥min_distinct_frames 种——幻灯片/板书在变而水印不动 → 命中；
//!              水印是帧内唯一文本（签名恒定）→ 不命中（防"纯水印帧"误杀，
//!              也保护"老师固定位置常驻提示语"这类合法内容）。
//! @ai-context: 误杀兜底：阈值可校准 + 产物层可逆（原始 OCR 块保留在库中，
//!              预览/过滤统计可复查）。
//! @ai-context: v0.11.5（spec 10️⃣）三件套：A bbox→region_key 接入（screens/
//!              analysis 从 DB bbox 列构造归一化网格键，区域稳定性信号启用）；
//!              B 文本相似聚类（编辑距离 ≤2 归并，OCR 抖动漏检防御——会话 38
//!              "万事如番茄LilLil" 实证）；C 区域级出现率（区域稳定+文本变化+内容
//!              在变 → 区域水印，与具体文本解耦）。纯函数在 watermark_cluster.rs
//!              （子模块）——本文件保持 ≤300 行（AGENTS.md §3）。

use std::collections::{BTreeMap, BTreeSet};

use watermark_cluster::cluster_texts;
// A 层对外入口（screens/analysis 接线用）
pub use watermark_cluster::region_key_from_bbox;
// C 层对外入口：lib 内暂无调用方（测试目标已覆盖；接线留后续任务）
#[allow(unused_imports)]
pub use watermark_cluster::detect_region_watermarks;

/// 水印检测输入块。
#[derive(Debug, Clone, PartialEq)]
pub struct WatermarkInput {
    pub text: String,
    /// 相对会话起点毫秒
    pub timestamp_ms: u64,
    /// 区域键（上游按 bbox 归一化网格计算；无 bbox 数据为 None——全局判定）
    pub region_key: Option<String>,
}

/// 水印检测配置（阈值可校准）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WatermarkConfig {
    /// 同区域同文本出现帧数下限（区域稳定性）
    pub min_occurrences: u32,
    /// 首末出现跨度下限 ms（时间稳定性）
    pub min_span_ms: u64,
    /// 出现帧的整帧文本签名种类下限（文本不随内容变化）
    pub min_distinct_frames: u32,
}

impl Default for WatermarkConfig {
    fn default() -> Self {
        Self {
            min_occurrences: 5,
            min_span_ms: 60_000,
            min_distinct_frames: 2,
        }
    }
}

/// 水印命中明细（统计/复查用）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct WatermarkHit {
    pub text: String,
    pub region_key: Option<String>,
    /// 出现帧数
    pub occurrences: u32,
    /// 首末跨度 ms
    pub span_ms: u64,
    /// 整帧文本签名种类（内容变化证据）
    pub distinct_frames: u32,
}

/// 水印检测结果。
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct WatermarkResult {
    /// 水印文本集合（去重；术语统计排除 / 产物过滤用）
    pub texts: Vec<String>,
    /// 命中明细（按出现次数降序，确定性排序）
    pub hits: Vec<WatermarkHit>,
}

/// 水印检测（纯函数）：OCR 块流 → 水印候选集。
///
/// @ai-context: 两阶段：① 按时间戳聚帧求整帧文本签名；② 按 (区域键, 聚类代表
///              文本) 分组统计出现帧数/跨度/签名种类，三阈值全过 → 水印。
/// @ai-context: v0.11.5（B 层）：分组前经 cluster_texts 做编辑距离 ≤2 相似聚类
///              ——OCR 抖动变体归并同一候选；无抖动时各文本自成组（行为兼容，
///              旧用例零回归）。区域键为 None 的块按全局文本聚合（DB 无 bbox
///              时的降级路径）。
pub fn detect_watermarks(blocks: &[WatermarkInput], cfg: &WatermarkConfig) -> WatermarkResult {
    // ① 帧签名：timestamp → 该帧去重文本集合（排序 join）
    let frame_texts = frame_text_signatures(blocks);
    // ①.5 文本相似聚类（B 层）：(region, 原文) → 聚类代表
    let cluster = cluster_texts(blocks);

    // ② 分组统计
    #[derive(Default)]
    struct Acc {
        timestamps: BTreeSet<u64>,
        frame_sigs: BTreeSet<String>,
    }
    let mut groups: BTreeMap<(String, String), Acc> = BTreeMap::new();
    for b in blocks {
        let t = b.text.trim();
        if t.is_empty() {
            continue;
        }
        let key = b.region_key.clone().unwrap_or_default();
        // 键改为聚类代表文本（无抖动时代表=原文，行为兼容）
        let rep = cluster
            .get(&(key.clone(), t.to_string()))
            .cloned()
            .unwrap_or_else(|| t.to_string());
        let group = groups.entry((key, rep)).or_default();
        group.timestamps.insert(b.timestamp_ms);
        if let Some(sig) = frame_texts.get(&b.timestamp_ms) {
            group.frame_sigs.insert(sig.iter().cloned().collect::<Vec<_>>().join("|"));
        }
    }

    let mut hits: Vec<WatermarkHit> = groups
        .into_iter()
        .filter_map(|((region_key, text), acc)| {
            let occurrences = acc.timestamps.len() as u32;
            let span = acc
                .timestamps
                .last()
                .zip(acc.timestamps.first())
                .map(|(hi, lo)| hi.saturating_sub(*lo))
                .unwrap_or(0);
            let distinct_frames = acc.frame_sigs.len() as u32;
            let hit = occurrences >= cfg.min_occurrences
                && span >= cfg.min_span_ms
                && distinct_frames >= cfg.min_distinct_frames;
            hit.then_some(WatermarkHit {
                text,
                region_key: (!region_key.is_empty()).then_some(region_key),
                occurrences,
                span_ms: span,
                distinct_frames,
            })
        })
        .collect();
    sort_hits(&mut hits);
    let texts: Vec<String> = hits.iter().map(|h| h.text.clone()).collect();
    WatermarkResult { texts, hits }
}

/// 帧签名表（共享）：timestamp → 该帧去重文本集合（排序 join 由调用方做）。
///
/// @ai-context: detect_watermarks 与 detect_region_watermarks 共用同一"内容变化
///              证据"口径——两路径的 distinct_frames 统计不打架。
fn frame_text_signatures(blocks: &[WatermarkInput]) -> BTreeMap<u64, BTreeSet<String>> {
    let mut frame_texts: BTreeMap<u64, BTreeSet<String>> = BTreeMap::new();
    for b in blocks {
        let t = b.text.trim();
        if t.is_empty() {
            continue;
        }
        frame_texts
            .entry(b.timestamp_ms)
            .or_default()
            .insert(t.to_string());
    }
    frame_texts
}

/// 命中明细排序（共享）：出现次数降序 → 跨度降序 → 文本字典序（确定性）。
fn sort_hits(hits: &mut Vec<WatermarkHit>) {
    hits.sort_by(|a, b| {
        b.occurrences
            .cmp(&a.occurrences)
            .then(b.span_ms.cmp(&a.span_ms))
            .then(a.text.cmp(&b.text))
    });
}

/// B/C 层纯函数子模块（聚类 + 区域出现率 + bbox 区域键；≤300 行约束）。
#[path = "watermark_cluster.rs"]
mod watermark_cluster;

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "watermark_filter_tests.rs"]
mod tests;
