//! 动态字幕区域跟踪（REQ-037 / v0.4.0 M2）。
//!
//! @ai-context: 在播放区域坐标系内锁定字幕 ROI：启动期/重扫期用 det bbox 密度
//!              聚簇锁定水平范围；运行期仅对 ROI 裁剪 OCR（推理减负）；ROI 内
//!              连续无文本超过阈值 → 触发全帧重扫（场景切换自适应）。
//! @ai-context: 初始先验 = 播放区域内底部 1/4（首帧避免全帧 det 延迟）；
//!              video_rect=None（未检测到播放区域）→ 退化窗口底部 1/4
//!              （与 v0.3.0 现状行为一致，零回归）。
//! @ai-context: 弹幕叠加在播放区域内——本模块不做弹幕过滤（滚动过滤在
//!              subtitle_ocr.rs，互补而非替代）。纯逻辑可单测，无系统调用。

use crate::capture::frame_diff::Rect;
use crate::playback_region::{detect_playback_region, VideoRect};
use crate::types::TextBox;

/// 锁定所需 bbox 样本帧数（启动期 det 3 帧，ADR-005 投票先例）。
pub const LOCK_SCAN_FRAMES: u32 = 3;

/// ROI 内连续无文本帧数阈值（超过触发全帧重扫；8 帧 ≈ 1.6s @5fps）。
pub const ROI_EMPTY_THRESHOLD: u32 = 8;

/// 播放区域重扫间隔（秒；黑边扫描成本极低，但窗口静止时无需频繁执行）。
pub const PLAYBACK_RESCAN_INTERVAL_SECS: u64 = 5;

/// 候选 bbox 的下半部起点比例（播放区域高度 35% 起——字幕/底部 UI 带）。
const CANDIDATE_BOTTOM_RATIO: f32 = 0.35;

/// 字幕高度带（播放区域底部 25%，与 ADR-005 底部 1/4 语义一致）。
const SUBTITLE_BAND_RATIO: f32 = 0.25;

/// 锁定 ROI 的水平边距比例（左右各留 2%，防边缘抖动丢字）。
const ROI_X_MARGIN_RATIO: f32 = 0.02;

/// 每帧裁剪决策。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoiDecision {
    /// 用锁定 ROI 裁剪（帧坐标系）
    UseRoi(Rect),
    /// 全帧处理（扫描期/重扫期）
    FullFrame,
}

/// 字幕 ROI 跟踪器（每会话一个，屏幕 worker 独占）。
pub struct RoiTracker {
    /// 播放区域（帧坐标系；None=未检测到 → 退化窗口坐标）
    video_rect: Option<Rect>,
    /// 当前锁定 ROI（帧坐标系；None=扫描期）
    roi: Option<Rect>,
    /// 扫描期累积的 bbox 样本（帧坐标系）
    lock_samples: Vec<TextBox>,
    /// 当前扫描已累计帧数
    scan_frames: u32,
    /// ROI 内连续无文本帧数
    empty_frames: u32,
    /// 距上次播放区域重扫时刻
    last_playback_scan_at: std::time::Instant,
    frame_w: u32,
    frame_h: u32,
}

impl RoiTracker {
    pub fn new(frame_w: u32, frame_h: u32) -> Self {
        Self {
            video_rect: None,
            roi: None,
            lock_samples: Vec::new(),
            scan_frames: 0,
            empty_frames: 0,
            last_playback_scan_at: std::time::Instant::now(),
            frame_w,
            frame_h,
        }
    }

    /// OCR 前每帧调用：返回本帧裁剪决策。
    pub fn decide(&self) -> RoiDecision {
        match self.roi {
            Some(roi) => RoiDecision::UseRoi(roi),
            None => RoiDecision::FullFrame,
        }
    }

    /// 窗口尺寸自适应（窗口移动/缩放后先验坐标跟随；尺寸变化时强制重扫）。
    ///
    /// @ai-context: 同时清空 video_rect（TD-046 同批修复）——播放区域为帧坐标，
    ///              尺寸变化后旧矩形立即失效（否则最长 5s 节流期内 ROI 错位）。
    pub fn resize(&mut self, w: u32, h: u32) {
        if self.frame_w == w && self.frame_h == h {
            return;
        }
        self.frame_w = w;
        self.frame_h = h;
        self.video_rect = None;
        self.reset_scan();
    }

    /// 播放区域周期重扫（worker 每帧调用全帧数据；内部 5s 节流）。
    ///
    /// @ai-context: 检测到播放区域变化（首次出现/移动）→ 强制重扫 ROI；
    ///              检测失败保持旧值（静默回退，不阻断）。
    pub fn refresh_playback_region(&mut self, bgraw: &[u8], width: u32, height: u32) {
        if self.last_playback_scan_at.elapsed().as_secs() < PLAYBACK_RESCAN_INTERVAL_SECS {
            return;
        }
        self.last_playback_scan_at = std::time::Instant::now();
        let Some(v) = detect_playback_region(bgraw, width, height) else { return };
        let rect = video_to_rect(v);
        if self.video_rect != Some(rect) {
            self.video_rect = Some(rect);
            // 播放区域变化（首次锁定/窗口拖动跨屏）→ 旧 ROI 失效，重扫
            self.reset_scan();
        }
    }

    /// OCR 后回喂文本块（OCR 输入图坐标系；crop_origin=本帧裁剪起点，全帧为 None）。
    ///
    /// @ai-context: 扫描期：累积样本，满 LOCK_SCAN_FRAMES 尝试锁定；
    ///              锁定失败 → 先验（区域规则回退，ADR-005 路径）。
    /// @ai-context: 锁定期：ROI 内无文本连续计数，超阈值 → 重扫。
    ///              OCR 失败帧不调用（失败≠无文本，不计数）。
    /// @ai-context: scale=（宽/高缩放比，OCR 输入图尺寸相对裁剪前帧）——TD-046 修复：
    ///              OCR 输入经 downscale_bgra（≤960px）后 bbox 处于缩小坐标系，
    ///              必须按缩放比反算回帧坐标系再参与聚簇/判定，否则 >960px 屏幕
    ///              ROI 错位（字幕裁半/空转）。
    pub fn feed_ocr(&mut self, blocks: &[TextBox], crop_origin: Option<(u32, u32)>, scale: (f32, f32)) {
        let (sx, sy) = scale;
        let (ox, oy) = crop_origin.unwrap_or((0, 0));
        let frame_boxes: Vec<TextBox> = blocks
            .iter()
            .filter_map(|b| {
                let (x, y) = (b.x * sx + ox as f32, b.y * sy + oy as f32);
                (x >= 0.0 && y >= 0.0).then_some(TextBox { x, y, w: b.w * sx, h: b.h * sy })
            })
            .collect();

        if self.roi.is_none() {
            // 扫描期：累积样本
            self.lock_samples.extend(frame_boxes);
            self.scan_frames += 1;
            if self.scan_frames >= LOCK_SCAN_FRAMES {
                let roi = lock_roi(&self.lock_samples, self.video_rect, self.frame_w, self.frame_h)
                    .or_else(|| Some(prior_roi(self.video_rect, self.frame_w, self.frame_h)));
                self.roi = roi;
                self.lock_samples.clear();
                self.scan_frames = 0;
            }
            return;
        }
        // 锁定期：ROI 内是否有文本（bbox 中心在 ROI 内）
        let roi = self.roi.unwrap();
        let has_text = frame_boxes.iter().any(|b| {
            let cx = b.x + b.w / 2.0;
            let cy = b.y + b.h / 2.0;
            cx >= roi.left as f32 && cx <= roi.right as f32 && cy >= roi.top as f32 && cy <= roi.bottom as f32
        });
        if has_text {
            self.empty_frames = 0;
        } else {
            self.empty_frames += 1;
            if self.empty_frames >= ROI_EMPTY_THRESHOLD {
                eprintln!("[RoiTracker] ROI 内连续无文本 {} 帧，触发全帧重扫", self.empty_frames);
                self.reset_scan();
            }
        }
    }

    /// 当前锁定 ROI（测试/诊断用；生产路径经 decide() 消费）。
    #[allow(dead_code)]
    pub fn locked_roi(&self) -> Option<Rect> {
        self.roi
    }

    fn reset_scan(&mut self) {
        self.roi = None;
        self.lock_samples.clear();
        self.scan_frames = 0;
        self.empty_frames = 0;
    }
}

/// 锁定 ROI：候选 = bbox 中心落在播放区域（或窗口）下半部 35% 起的块；
/// 取其 x 并集（±2% 边距）+ 底部 25% 高度带。
///
/// @ai-context: 纯函数可单测；返回 None 表示无可信候选（调用方落先验）。
/// @ai-context: 弹幕/UI 文字若与字幕同带会被并进 x 范围（水平并集天然宽容）；
///              其过滤由滚动检测与投票器承担。
pub fn lock_roi(bboxes: &[TextBox], video: Option<Rect>, frame_w: u32, frame_h: u32) -> Option<Rect> {
    let base = video.unwrap_or(Rect { left: 0, top: 0, right: frame_w as i32, bottom: frame_h as i32 });
    if base.width() == 0 || base.height() == 0 {
        return None;
    }
    let band_top = base.top + (base.height() as f32 * CANDIDATE_BOTTOM_RATIO) as i32;
    let mut x_min: Option<f32> = None;
    let mut x_max: Option<f32> = None;
    for b in bboxes {
        let cy = b.y + b.h / 2.0;
        if cy < band_top as f32 || cy >= base.bottom as f32 {
            continue;
        }
        x_min = Some(x_min.map_or(b.x, |m: f32| m.min(b.x)));
        x_max = Some(x_max.map_or(b.x + b.w, |m: f32| m.max(b.x + b.w)));
    }
    let (Some(x0), Some(x1)) = (x_min, x_max) else { return None };
    let margin = (x1 - x0) * ROI_X_MARGIN_RATIO;
    let top = base.bottom - (base.height() as f32 * SUBTITLE_BAND_RATIO) as i32;
    Some(Rect {
        left: (x0 - margin).max(base.left as f32) as i32,
        top: top.max(base.top),
        right: (x1 + margin).min(base.right as f32) as i32,
        bottom: base.bottom,
    })
}

/// 先验 ROI（区域规则回退）：播放区域内底部 25% 带；无播放区域 → 窗口底部 25% 带。
pub fn prior_roi(video: Option<Rect>, frame_w: u32, frame_h: u32) -> Rect {
    let base = video.unwrap_or(Rect { left: 0, top: 0, right: frame_w as i32, bottom: frame_h as i32 });
    let band_h = (base.height() as f32 * SUBTITLE_BAND_RATIO) as i32;
    Rect { left: base.left, top: base.bottom - band_h, right: base.right, bottom: base.bottom }
}

fn video_to_rect(v: VideoRect) -> Rect {
    Rect { left: v.left as i32, top: v.top as i32, right: v.right as i32, bottom: v.bottom as i32 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn box_at(x: f32, y: f32, w: f32, h: f32) -> TextBox {
        TextBox { x, y, w, h }
    }

    fn video_rect() -> Rect {
        Rect { left: 0, top: 60, right: 640, bottom: 320 }
    }

    #[test]
    fn lock_uses_bottom_band_bboxes() {
        // 底部字幕 bbox（y=250-270）→ x 并集
        let boxes = vec![box_at(100.0, 250.0, 200.0, 20.0), box_at(320.0, 250.0, 180.0, 20.0)];
        let roi = lock_roi(&boxes, Some(video_rect()), 640, 360).unwrap();
        assert!(roi.left <= 100);
        assert!(roi.right >= 500);
        assert_eq!(roi.bottom, 320);
        // 底部 25% 带 = 320 - (260*0.25=65) = 255
        assert_eq!(roi.top, 255);
    }

    #[test]
    fn lock_ignores_upper_ui_text() {
        // 顶部 UI 文字（y<35% 带起点 60+260*0.35=151）不参与
        let boxes = vec![box_at(10.0, 30.0, 300.0, 20.0)];
        assert_eq!(lock_roi(&boxes, Some(video_rect()), 640, 360), None);
    }

    #[test]
    fn lock_none_without_candidates() {
        assert_eq!(lock_roi(&[], Some(video_rect()), 640, 360), None);
    }

    #[test]
    fn lock_without_video_uses_window_band() {
        let boxes = vec![box_at(50.0, 320.0, 400.0, 20.0)];
        let roi = lock_roi(&boxes, None, 640, 360).unwrap();
        assert_eq!(roi.bottom, 360);
        assert_eq!(roi.top, 360 - 90); // 窗口底部 25%
    }

    #[test]
    fn prior_uses_video_band() {
        let p = prior_roi(Some(video_rect()), 640, 360);
        assert_eq!((p.left, p.top, p.right, p.bottom), (0, 255, 640, 320));
    }

    #[test]
    fn prior_without_video_is_window_bottom_quarter() {
        let p = prior_roi(None, 640, 360);
        assert_eq!((p.left, p.top, p.right, p.bottom), (0, 270, 640, 360));
    }

    #[test]
    fn tracker_locks_after_three_frames() {
        let mut t = RoiTracker::new(640, 360);
        assert_eq!(t.decide(), RoiDecision::FullFrame);
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[box_at(100.0, 260.0, 300.0, 20.0)], None, (1.0, 1.0));
        }
        assert_eq!(t.decide(), RoiDecision::UseRoi(t.locked_roi().unwrap()));
        assert!(t.locked_roi().unwrap().top >= 255);
    }

    #[test]
    fn tracker_falls_back_to_prior_without_bboxes() {
        let mut t = RoiTracker::new(640, 360);
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[], None, (1.0, 1.0));
        }
        let roi = t.locked_roi().unwrap();
        assert_eq!((roi.left, roi.top, roi.right, roi.bottom), (0, 270, 640, 360));
    }

    #[test]
    fn tracker_rescans_after_continuous_empty() {
        let mut t = RoiTracker::new(640, 360);
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[box_at(100.0, 260.0, 300.0, 20.0)], None, (1.0, 1.0));
        }
        assert!(t.locked_roi().is_some());
        // ROI 内无文本连续空帧（bbox 在 ROI 外）→ 重扫
        for _ in 0..ROI_EMPTY_THRESHOLD {
            t.feed_ocr(&[box_at(10.0, 10.0, 50.0, 20.0)], None, (1.0, 1.0));
        }
        assert_eq!(t.decide(), RoiDecision::FullFrame);
        assert!(t.locked_roi().is_none());
    }

    #[test]
    fn tracker_text_resets_empty_counter() {
        let mut t = RoiTracker::new(640, 360);
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[box_at(100.0, 260.0, 300.0, 20.0)], None, (1.0, 1.0));
        }
        // 4 帧空 + 1 帧有文本 → 不触发重扫
        for _ in 0..4 {
            t.feed_ocr(&[], None, (1.0, 1.0));
        }
        t.feed_ocr(&[box_at(100.0, 260.0, 300.0, 20.0)], None, (1.0, 1.0));
        for _ in 0..4 {
            t.feed_ocr(&[], None, (1.0, 1.0));
        }
        assert!(t.locked_roi().is_some());
    }

    #[test]
    fn crop_origin_shifts_bboxes() {
        let mut t = RoiTracker::new(640, 360);
        // 模拟：先锁定（全帧 bbox 在底部）
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[box_at(100.0, 260.0, 300.0, 20.0)], None, (1.0, 1.0));
        }
        // 锁定后 ROI 裁剪：裁剪图内的 bbox（如 y=5，ROI top=270 → 帧坐标 275）
        let roi = t.locked_roi().unwrap();
        for _ in 0..ROI_EMPTY_THRESHOLD - 1 {
            t.feed_ocr(&[box_at(5.0, 5.0, 100.0, 10.0)], Some((roi.left as u32, roi.top as u32)), (1.0, 1.0));
        }
        // 裁剪图 bbox 中心 55,10 + 原点 (0,270) → 帧坐标 (55, 280) 在 ROI 内 → 不重扫
        assert!(t.locked_roi().is_some());
    }

    #[test]
    fn downscaled_bboxes_are_rescaled_to_frame_coords() {
        // TD-046：OCR 输入经 2x downscale（1920→960）后，bbox 需反算回帧坐标系
        let mut t = RoiTracker::new(1920, 540);
        // 扫描期：缩小坐标系 bbox（x=50..850, y=380..410）→ 帧坐标 x=100..1700, y=760..820
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[box_at(50.0, 380.0, 800.0, 30.0)], None, (2.0, 2.0));
        }
        let roi = t.locked_roi().unwrap();
        // 锁定 ROI 应为帧坐标（底部带 top=540-135=405；x 覆盖 100..1700）
        assert!(roi.left <= 100, "缩小坐标未反算（left={}）", roi.left);
        assert!(roi.right >= 1700, "缩小坐标未反算（right={}）", roi.right);
        // 锁定期：ROI 裁剪 + 2x 缩放图内 bbox（y=8 → 帧坐标 405+16=421，仍在 ROI 内）→ 不重扫
        for _ in 0..ROI_EMPTY_THRESHOLD - 1 {
            t.feed_ocr(&[box_at(10.0, 8.0, 400.0, 6.0)], Some((roi.left as u32, roi.top as u32)), (2.0, 2.0));
        }
        assert!(t.locked_roi().is_some(), "缩放后 bbox 应换算回 ROI 内，不得误触发重扫");
    }

    #[test]
    fn playback_region_change_triggers_rescan() {
        let mut t = RoiTracker::new(640, 360);
        for _ in 0..LOCK_SCAN_FRAMES {
            t.feed_ocr(&[box_at(100.0, 260.0, 300.0, 20.0)], None, (1.0, 1.0));
        }
        assert!(t.locked_roi().is_some());
        // 黑边帧（上下各 60px）→ video_rect 出现 → 重扫
        let mut buf = vec![0u8; 640 * 360 * 4];
        for y in 60..300 {
            for x in 0..640 {
                let i = (y * 640 + x) as usize * 4;
                buf[i..i + 4].copy_from_slice(&[200, 200, 200, 255]);
            }
        }
        // 推进节流时间（同模块测试可访问私有字段；生产路径由 5s 节流控制）
        t.last_playback_scan_at = std::time::Instant::now() - std::time::Duration::from_secs(10);
        t.refresh_playback_region(&buf, 640, 360);
        assert_eq!(t.decide(), RoiDecision::FullFrame, "播放区域出现应强制重扫");
    }
}
