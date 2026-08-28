//! 跨帧增量合并（v0.14 D3 incremental_merge；纯函数）。
//!
//! @ai-context: spec §4.3——PPT 动画逐行出现：后帧文本 ⊇ 前帧 + bbox 位置稳定
//!              → 同屏增量合并（取增量后的完整文本，非拼接——后帧已含前帧）；
//!              bbox 整体位移 → 翻页新屏。现有"跨屏去重"按文本相似度聚类，
//!              对动画逐行出现的场景失效（每帧都"新"）——本模块补同屏增量。
//! @ai-context: 输出保留首帧 id（屏号锚定）；文本取末次增量后的完整内容。
//! @ai-context: lib 内暂无生产调用方（视频全帧 OCR 增量接线留后续任务，目标
//!              版本 v0.14.1；POSITION_STABLE_RATIO 已被净化链引用）；测试
//!              目标已覆盖，登记 dead_code 豁免（机制先行模式）。
#![allow(dead_code)]

/// bbox 中心位移容差（比例：中心位移 ≤ 行高 × 该值视为位置稳定）。
/// @ai-context: pub(crate)（v0.14 D）——note_filter_ocr 净化链 ③ 跨帧增量复用
///              同一稳定口径（帧级 bbox 并集中心），避免两处常量漂移。
pub(crate) const POSITION_STABLE_RATIO: f32 = 0.5;

/// 帧输入（同屏候选帧；bbox 为文本内容包围盒）。
#[derive(Debug, Clone, PartialEq)]
pub struct ScreenFrame {
    pub id: u64,
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// 合并后的屏。
#[derive(Debug, Clone, PartialEq)]
pub struct MergedScreen {
    /// 首帧 id（屏号锚定——原料回看/去重沿用）
    pub id: u64,
    /// 末次增量后的完整文本（后帧 ⊇ 前帧时取后帧）
    pub text: String,
}

/// 帧文本是否包含前一帧（增量前提：后帧 ⊇ 前帧）。
fn text_contains(prev: &str, next: &str) -> bool {
    !prev.trim().is_empty() && next.contains(prev.trim())
}

/// bbox 位置是否稳定（中心位移 ≤ 行高 × 阈值；无行高防御按原值）。
fn position_stable(a: &ScreenFrame, b: &ScreenFrame) -> bool {
    let ax = a.x + a.w / 2.0;
    let ay = a.y + a.h / 2.0;
    let bx = b.x + b.w / 2.0;
    let by = b.y + b.h / 2.0;
    let h = a.h.max(b.h).max(1.0);
    (ax - bx).abs() <= h * POSITION_STABLE_RATIO && (ay - by).abs() <= h * POSITION_STABLE_RATIO
}

/// 跨帧增量合并：顺序扫描——后帧包含前帧且位置稳定 → 合并（文本取后帧）；
/// 否则新屏（翻页）。输入须按时间序（调用方保证）。
pub fn merge_incremental(frames: &[ScreenFrame]) -> Vec<MergedScreen> {
    let mut out: Vec<MergedScreen> = Vec::new();
    for f in frames {
        let Some(cur) = out.last_mut() else {
            out.push(MergedScreen { id: f.id, text: f.text.clone() });
            continue;
        };
        if text_contains(&cur.text, &f.text) && position_stable(frames.iter().find(|p| p.id == cur.id).unwrap_or(f), f) {
            // 同屏增量：文本取后帧（更完整），屏号保持首帧
            cur.text = f.text.clone();
        } else {
            out.push(MergedScreen { id: f.id, text: f.text.clone() });
        }
    }
    out
}

#[cfg(test)]
#[path = "incremental_merge_tests.rs"]
mod tests;
