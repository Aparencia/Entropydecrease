//! 在线屏状态机（v0.7.3 REQ-155，ADR-015）。
//!
//! @ai-context: 采集链路的内存屏分配器：每帧全帧 OCR 成功后判定块归属屏号——
//!              ① 版面指纹变化（layout_cache 未复用）= 新屏；② 帧间隔 > 屏聚类
//!              gap = 新屏（翻回旧页再出现）；③ 帧文本与当前屏累积集合相似 <
//!              阈值 = 新屏（翻页）；否则同屏（累积集合去重并入，供后续比较）。
//! @ai-context: 与离线 cluster_blocks_into_screens 共用同一套纯函数
//!              （screen_merge），在线/离线一致性由构造保证（单管线双出口）。

use crate::screen_merge::{
    block_similarity, screen_similarity, BLOCK_MATCH_THRESHOLD, CLUSTER_GAP_MS,
    SCREEN_SIM_THRESHOLD,
};

/// 在线屏分配器（会话内递增屏号；从 1 起）。
#[derive(Debug)]
pub struct ScreenTracker {
    /// 当前屏号（会话内递增）
    screen_id: i64,
    /// 当前屏累积文本（块匹配去重——同屏新块并入）
    texts: Vec<String>,
    /// 上一帧时间戳（帧间隔 gap 判定）
    last_ts: u64,
}

impl ScreenTracker {
    /// 新建分配器（屏号从 0 起——首帧 assign 递增为 1）。
    pub fn new() -> Self {
        Self { screen_id: 0, texts: Vec::new(), last_ts: 0 }
    }

    /// 当前屏号（未喂帧时为 0）。
    #[allow(dead_code)]
    pub fn current_screen_id(&self) -> i64 {
        self.screen_id
    }

    /// 帧归属判定：返回本帧所属屏号（必要时递增）。
    ///
    /// @param ts 帧时间戳（会话纪元，递增）
    /// @param texts 本帧过滤后文本（非空——调用方保证：空帧不推进屏状态）
    /// @param layout_changed 版面指纹变化信号（None=无版面信息，仅用相似/gap 判定）
    pub fn assign_screen(&mut self, ts: u64, texts: &[String], layout_changed: Option<bool>) -> i64 {
        debug_assert!(!texts.is_empty(), "空帧不应推进屏状态（调用方保证）");
        let is_new = layout_changed == Some(true)
            || self.texts.is_empty()
            || ts.saturating_sub(self.last_ts) > CLUSTER_GAP_MS
            || screen_similarity(&self.texts, texts) < SCREEN_SIM_THRESHOLD;
        if is_new {
            self.screen_id += 1;
            self.texts = texts.to_vec();
        } else {
            // 同屏：累积集合去重并入（新块留作后续帧的比较基准）
            for t in texts {
                if !self.texts.iter().any(|a| block_similarity(a, t) >= BLOCK_MATCH_THRESHOLD) {
                    self.texts.push(t.clone());
                }
            }
        }
        self.last_ts = ts;
        self.screen_id
    }
}

impl Default for ScreenTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "screen_tracker_tests.rs"]
mod tests;
