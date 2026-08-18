//! 播放区域检测（REQ-037 / v0.4.0 M2：动态字幕区域的前置——黑边扫描）。
//!
//! @ai-context: 动机——网课网页播放器窗口含大量 UI 干扰（控制栏/侧边栏/评论区），
//!              字幕 ROI 必须在"实际视频播放区域"坐标系内计算（ADR-005 底部 1/4
//!              硬编码在此坐标系下失效）。本模块只做纯规则黑边扫描（letterbox），
//!              无黑边场景（浅色 UI 底色/海报帧）返回 None——调用方静默回退窗口
//!              坐标系（现状行为），不阻断会话。
//! @ai-context: 成本极低（逐行/列均匀采样亮度方差），启动期 + 每 5s 重扫一次；
//!              弹幕叠加在播放区域内，播放区域裁剪不能滤弹幕——滚动过滤在
//!              subtitle_ocr.rs 与播放区域检测互补而非替代。

/// 黑边判定：行/列亮度均值阈值（0-255 灰度；黑边通常 <16）。
const BLACK_MEAN_THRESHOLD: f32 = 24.0;

/// 黑边判定：行/列亮度方差阈值（黑边近似常数，方差极小；内容区方差大）。
const BLACK_VAR_THRESHOLD: f32 = 12.0;

/// 行/列采样点数（均匀采样，成本 O(采样数×行数)）。
const SAMPLE_POINTS: usize = 32;

/// 视频矩形最小占比（黑边裁剪后剩余区域 < 30% 视为检测失败——防止误裁剪）。
const MIN_VIDEO_RATIO: f32 = 0.3;

/// 黑边带最小厚度（相对对应边长比例；过窄的"黑边"可能是内容本身）。
const MIN_BAR_RATIO: f32 = 0.02;

/// 视频播放区域（像素坐标，左闭右开，与 frame_diff::Rect 语义一致）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoRect {
    pub left: u32,
    pub top: u32,
    pub right: u32,
    pub bottom: u32,
}

impl VideoRect {
    pub fn width(&self) -> u32 {
        self.right - self.left
    }

    pub fn height(&self) -> u32 {
        self.bottom - self.top
    }
}

/// 从 BGRA8 帧检测视频播放区域（黑边扫描）。
///
/// @ai-context: ①逐行扫描顶部/底部黑边（行均值+方差均低）；②逐列扫描左右黑边；
///              ③黑边带需 ≥2% 边长且剩余区域 ≥30% 才接受；否则 None（回退）。
/// @ai-context: 纯函数（无状态无 IO），可单测；退化启发式（文本密度）由
///              region_tracker 的启动期 det 承担，本模块不做。
pub fn detect_playback_region(bgraw: &[u8], width: u32, height: u32) -> Option<VideoRect> {
    if width == 0 || height == 0 || bgraw.len() != width as usize * height as usize * 4 {
        return None;
    }
    let (top, bottom) = scan_rows(bgraw, width, height);
    let (left, right) = scan_cols(bgraw, width, height);

    let video = VideoRect { left, top, right, bottom };
    // 注意：`as f32` 后紧跟 `<` 会被解析为泛型参数（Rust 2021 词法歧义），先绑定变量
    let video_ratio = video.width() as f32 * video.height() as f32 / (width * height) as f32;
    if video_ratio < MIN_VIDEO_RATIO {
        return None;
    }
    Some(video)
}

/// 逐行扫描顶部/底部黑边：返回 (top, bottom)（左闭右开）。
fn scan_rows(bgraw: &[u8], width: u32, height: u32) -> (u32, u32) {
    let mut top = 0u32;
    for y in 0..height {
        if is_black_row(bgraw, width, y) {
            top = y + 1;
        } else {
            break;
        }
    }
    let mut bottom = height;
    for y in (top..height).rev() {
        if is_black_row(bgraw, width, y) {
            bottom = y;
        } else {
            break;
        }
    }
    // 黑边带过窄（<2% 高）→ 视为无黑边（防误判深色 UI 边缘）
    if top < height / 100 * (MIN_BAR_RATIO * 100.0) as u32 {
        top = 0;
    }
    if height - bottom < height / 100 * (MIN_BAR_RATIO * 100.0) as u32 {
        bottom = height;
    }
    (top, bottom)
}

/// 逐列扫描左右黑边：返回 (left, right)（左闭右开）。
fn scan_cols(bgraw: &[u8], width: u32, height: u32) -> (u32, u32) {
    let mut left = 0u32;
    for x in 0..width {
        if is_black_col(bgraw, width, height, x) {
            left = x + 1;
        } else {
            break;
        }
    }
    let mut right = width;
    for x in (left..width).rev() {
        if is_black_col(bgraw, width, height, x) {
            right = x;
        } else {
            break;
        }
    }
    if left < width / 100 * (MIN_BAR_RATIO * 100.0) as u32 {
        left = 0;
    }
    if width - right < width / 100 * (MIN_BAR_RATIO * 100.0) as u32 {
        right = width;
    }
    (left, right)
}

/// 行是否黑边：均匀采样 SAMPLE_POINTS 个像素，均值与方差均低于阈值。
fn is_black_row(bgraw: &[u8], width: u32, y: u32) -> bool {
    let (mean, var) = row_stats(bgraw, width, y);
    mean < BLACK_MEAN_THRESHOLD && var < BLACK_VAR_THRESHOLD
}

fn is_black_col(bgraw: &[u8], width: u32, height: u32, x: u32) -> bool {
    let (mean, var) = col_stats(bgraw, width, height, x);
    mean < BLACK_MEAN_THRESHOLD && var < BLACK_VAR_THRESHOLD
}

fn row_stats(bgraw: &[u8], width: u32, y: u32) -> (f32, f32) {
    let row = &bgraw[y as usize * width as usize * 4..(y as usize + 1) * width as usize * 4];
    stats(row, 4)
}

fn col_stats(bgraw: &[u8], width: u32, height: u32, x: u32) -> (f32, f32) {
    let mut samples = Vec::with_capacity(height as usize);
    for y in 0..height {
        let px = (y as usize * width as usize + x as usize) * 4;
        samples.push(luma(&bgraw[px..px + 4]));
    }
    mean_var(&samples)
}

/// 从行缓冲均匀采样亮度并计算 (均值, 方差)。
fn stats(buf: &[u8], bpp: usize) -> (f32, f32) {
    let n = buf.len() / bpp;
    let step = (n / SAMPLE_POINTS).max(1);
    let mut samples = Vec::with_capacity(n / step + 1);
    for i in (0..n).step_by(step) {
        samples.push(luma(&buf[i * bpp..i * bpp + 4]));
    }
    mean_var(&samples)
}

/// BGRA → 亮度（简化 Rec.601 权重）。
fn luma(px: &[u8]) -> f32 {
    px[2] as f32 * 0.299 + px[1] as f32 * 0.587 + px[0] as f32 * 0.114
}

fn mean_var(samples: &[f32]) -> (f32, f32) {
    if samples.is_empty() {
        return (0.0, 0.0);
    }
    let mean = samples.iter().sum::<f32>() / samples.len() as f32;
    let var = samples
        .iter()
        .map(|v| (v - mean) * (v - mean))
        .sum::<f32>()
        / samples.len() as f32;
    (mean, var)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 生成 BGRA 帧：fill = 底图颜色；black_top/bottom/left/right = 黑边厚度。
    fn frame(w: u32, h: u32, fill: [u8; 3], bt: u32, bb: u32, bl: u32, br: u32) -> Vec<u8> {
        let mut buf = vec![0u8; w as usize * h as usize * 4];
        for y in 0..h {
            for x in 0..w {
                let black = y < bt || y >= h - bb || x < bl || x >= w - br;
                let i = (y * w + x) as usize * 4;
                if black {
                    buf[i..i + 4].copy_from_slice(&[0, 0, 0, 255]);
                } else {
                    buf[i..i + 4].copy_from_slice(&[fill[2], fill[1], fill[0], 255]);
                }
            }
        }
        buf
    }

    #[test]
    fn detects_letterbox_top_bottom() {
        let f = frame(640, 360, [200, 200, 200], 60, 40, 0, 0);
        let r = detect_playback_region(&f, 640, 360).unwrap();
        assert_eq!((r.left, r.top, r.right, r.bottom), (0, 60, 640, 320));
    }

    #[test]
    fn detects_pillarbox_left_right() {
        let f = frame(640, 360, [180, 180, 180], 0, 0, 80, 100);
        let r = detect_playback_region(&f, 640, 360).unwrap();
        assert_eq!((r.left, r.top, r.right, r.bottom), (80, 0, 540, 360));
    }

    #[test]
    fn no_black_bar_returns_full_frame() {
        let f = frame(640, 360, [200, 200, 200], 0, 0, 0, 0);
        let r = detect_playback_region(&f, 640, 360).unwrap();
        assert_eq!((r.left, r.top, r.right, r.bottom), (0, 0, 640, 360));
    }

    #[test]
    fn tiny_black_band_is_not_a_bar() {
        // 1px 黑边（<2% 边长）→ 视为内容，不裁剪
        let f = frame(640, 360, [200, 200, 200], 1, 1, 0, 0);
        let r = detect_playback_region(&f, 640, 360).unwrap();
        assert_eq!(r.top, 0);
        assert_eq!(r.bottom, 360);
    }

    #[test]
    fn oversized_bars_reject() {
        // 黑边吃掉 >70% → 检测失败（返回 None）
        let f = frame(640, 360, [200, 200, 200], 130, 130, 0, 0);
        assert!(detect_playback_region(&f, 640, 360).is_none());
    }

    #[test]
    fn invalid_size_rejects() {
        assert!(detect_playback_region(&[0u8; 100], 640, 360).is_none());
        assert!(detect_playback_region(&[], 0, 0).is_none());
    }

    #[test]
    fn dark_ui_edge_is_not_bar_when_varies() {
        // 深色但带噪声（方差大）→ 不算黑边
        let mut f = frame(640, 360, [200, 200, 200], 0, 0, 0, 0);
        // 顶部 10 行填入 20±8 噪声（均值低但方差高）
        for y in 0..10u32 {
            for x in 0..640u32 {
                let i = (y * 640 + x) as usize * 4;
                let v = 20 + (x % 17) as u8;
                f[i..i + 4].copy_from_slice(&[v, v, v, 255]);
            }
        }
        let r = detect_playback_region(&f, 640, 360).unwrap();
        assert_eq!(r.top, 0, "噪声深色边缘不应被裁掉");
    }
}
