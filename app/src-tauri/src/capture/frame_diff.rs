//! 帧变化检测与采样调度纯函数（REQ-008，ADR-002）。
//!
//! @ai-context: 移植原项目 screenCapture.ts 的分块采样 hash 算法（生产验证过）：
//!              8 块 × 60 字节采样，≥2 块变化才判定为变化（过滤 1px 鼠标微动），
//!              无论是否判定均更新基准 hash（防亚阈值变化累积）。
//! @ai-context: 本模块不依赖 windows 类型（纯逻辑可单测）；矩形用自有结构。

/// 简单矩形（屏幕/帧坐标，与 windows RECT 同布局但不依赖系统 crate）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(&self) -> u32 {
        (self.right - self.left).max(0) as u32
    }
    pub fn height(&self) -> u32 {
        (self.bottom - self.top).max(0) as u32
    }
    /// 与另一矩形求交；不相交返回 None。
    pub fn intersect(&self, other: &Rect) -> Option<Rect> {
        let left = self.left.max(other.left);
        let top = self.top.max(other.top);
        let right = self.right.min(other.right);
        let bottom = self.bottom.min(other.bottom);
        if right <= left || bottom <= top {
            None
        } else {
            Some(Rect { left, top, right, bottom })
        }
    }
}

/// 分块采样 hash 变化检测器（有状态：保存上一帧基准 hash）。
#[derive(Debug)]
pub struct FrameDiffDetector {
    block_count: usize,
    samples_per_block: usize,
    min_changed_blocks: usize,
    last_block_hashes: Vec<String>,
}

impl Default for FrameDiffDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameDiffDetector {
    /// 默认参数：8 块 × 60 字节采样，≥2 块变化判定（与原项目一致，适合全帧）。
    ///
    /// @ai-context: v0.5.0 M1 起生产路径改走 from_budget（档案驱动采样），
    ///              new 保留为默认档构造入口（测试与外部调用用，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::with_min_changed_blocks(2)
    }

    /// 指定最小变化块数：字幕区裁剪帧用 1（单行字幕翻页可能只落 1 块内，审查 M6 修复），
    /// 全帧用 2（过滤鼠标微动）。
    pub fn with_min_changed_blocks(min_changed_blocks: usize) -> Self {
        Self {
            block_count: 8,
            samples_per_block: 60,
            min_changed_blocks: min_changed_blocks.max(1),
            last_block_hashes: Vec::new(),
        }
    }

    /// 判定帧是否变化（相比上一帧），并更新基准。
    ///
    /// @ai-context: 首帧（无基准）视为变化；帧长变化视为变化。
    pub fn has_changed(&mut self, frame: &[u8]) -> bool {
        if frame.is_empty() {
            return false;
        }
        let hashes = block_hashes(frame, self.block_count, self.samples_per_block);
        let changed = if hashes.len() == self.last_block_hashes.len() {
            hashes
                .iter()
                .zip(self.last_block_hashes.iter())
                .filter(|(a, b)| a != b)
                .take(self.min_changed_blocks)
                .count()
                >= self.min_changed_blocks
        } else {
            // 块数不一致（首帧或尺寸变化），视为变化
            true
        };
        // 无论是否变化均更新基准（防亚阈值累积，与原项目一致）
        self.last_block_hashes = hashes;
        changed
    }

    /// 重置基准（窗口切换/尺寸变化时调用，下一帧必判变化；
    /// 当前实时链路未调用——窗口切换预留，登记豁免）。
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.last_block_hashes.clear();
    }
}

/// 计算帧的分块采样 hash：每块取固定步长样本拼成字符串。
fn block_hashes(frame: &[u8], block_count: usize, samples_per_block: usize) -> Vec<String> {
    let size = frame.len();
    let mut hashes = Vec::with_capacity(block_count);
    for b in 0..block_count {
        let block_start = (size * b) / block_count;
        let block_end = (size * (b + 1)) / block_count;
        let block_size = block_end - block_start;
        if block_size == 0 {
            hashes.push(String::new());
            continue;
        }
        let step = (block_size / samples_per_block).max(1);
        let mut hash = String::with_capacity(block_size / step + 8);
        hash.push_str(&block_size.to_string());
        let mut i = block_start;
        while i < block_end {
            hash.push_str(&frame[i].to_string());
            i += step;
        }
        hashes.push(hash);
    }
    hashes
}

/// 采样区域（双速率调度输出）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SampleRegion {
    /// 本次跳过（未到任何间隔）
    Skip,
    /// 字幕区高频采样
    Subtitle,
    /// 全帧低频采样
    Full,
}

/// 双速率采样调度器（ADR-002/ADR-005；v0.3.0 P3 语音活跃度自适应；v0.4.0 M4 预算制）。
///
/// @ai-context: 字幕区 1-2 fps、全帧 0.2-0.5 fps：以 tick（一次采集周期）为粒度，
///              字幕区每 subtitle_every tick 采一次，全帧每 full_every tick 采一次；
///              两者重叠时优先字幕区（高频覆盖低频）。
/// @ai-context: P3（头脑风暴）简化版：语音活跃期维持字幕区为主（原参数）；
///              静音期（老师停顿展示幻灯片/板书）降低字幕区频率、提升全帧频率——
///              静音时字幕区基本静止（低价值），画面要点价值上升。
/// @ai-context: M4（REQ-039）预算语义——字幕区 ≤1/(subtitle_every×tick)、
///              全帧 ≤1/(full_every×tick) 封顶；VAD 旋钮参数化（with_silent）；
///              高负载降级档（degraded）只压全帧（full_every×2 → 0.1fps 封顶），
///              保 ASR/字幕主链路（P8：关闭次要功能=全帧降频）。
#[derive(Debug)]
pub struct DualRateScheduler {
    subtitle_every: u32,
    full_every: u32,
    /// 静音期字幕区间隔（tick）
    silent_subtitle_every: u32,
    /// 静音期全帧间隔（tick）
    silent_full_every: u32,
    /// M4：高负载降级档全帧间隔（tick；默认 full_every×2 = 0.1fps 封顶）
    degraded_full_every: u32,
    /// 距上次字幕采样的 tick 数（独立计数：全帧点不被字幕 tick 整除遮蔽，
    /// 审查修复——原取模实现下 degraded 档（如 full=10 且 sub=2）全帧永不触发）
    subtitle_tick: u32,
    /// 距上次全帧采样的 tick 数
    full_tick: u32,
}

impl DualRateScheduler {
    /// 创建调度器。subtitle_every/full_every 为语音活跃期 tick 间隔（至少 1）；
    /// 静音期参数固定为字幕区 4 tick / 全帧 2 tick（P3 简化版）。
    ///
    /// @ai-context: v0.5.0 M1 起生产路径改走 from_budget（档案驱动采样），
    ///              new 保留为默认档构造入口（测试与外部调用用，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn new(subtitle_every: u32, full_every: u32) -> Self {
        let full_every = full_every.max(1);
        Self {
            subtitle_every: subtitle_every.max(1),
            full_every,
            silent_subtitle_every: 4,
            silent_full_every: 2,
            degraded_full_every: full_every * 2,
            subtitle_tick: 0,
            full_tick: 0,
        }
    }

    /// M4：VAD 旋钮参数化——静音期档位（默认 (4,2) 由 new 设定；可配）。
    /// 参数化入口暂由测试覆盖，后续可配置 UI 接入（登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn with_silent(mut self, subtitle_every: u32, full_every: u32) -> Self {
        self.silent_subtitle_every = subtitle_every.max(1);
        self.silent_full_every = full_every.max(1);
        self
    }

    /// v0.5.0 M1（REQ-043）：按档案采样预算全参数构造（语音期/静音期档位一次给定）。
    ///
    /// @ai-context: 口播/访谈/会议档案全帧极低频（full_every 大），实操档案全帧高频
    ///              （关键帧差异化采样）；degraded 档仍取 full_every×2（降级不归零）。
    pub fn from_budget(
        subtitle_every: u32,
        full_every: u32,
        silent_subtitle_every: u32,
        silent_full_every: u32,
    ) -> Self {
        let full_every = full_every.max(1);
        Self {
            subtitle_every: subtitle_every.max(1),
            full_every,
            silent_subtitle_every: silent_subtitle_every.max(1),
            silent_full_every: silent_full_every.max(1),
            degraded_full_every: full_every * 2,
            subtitle_tick: 0,
            full_tick: 0,
        }
    }

    /// M4：高负载降级档全帧间隔（默认 full_every×2 = 0.1fps 封顶；可配）。
    /// 参数化入口暂由测试覆盖，后续可配置 UI 接入（登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn with_degraded_full(mut self, every: u32) -> Self {
        self.degraded_full_every = every.max(1);
        self
    }

    /// 推进一个 tick 并返回本次采样区域（speech_active=语音活跃度；degraded=高负载降级）。
    ///
    /// @ai-context: 字幕区与全帧各自独立计数（审查修复）：重叠 tick 优先字幕区
    ///              （高频覆盖低频），全帧计数保持——在下一个字幕空档补采，
    ///              保证全帧采样不被字幕 tick 整除永久遮蔽（degraded 档 0.1fps
    ///              仍可触发，符合"降频而非清零"意图）。
    pub fn next_region(&mut self, speech_active: bool, degraded: bool) -> SampleRegion {
        let (sub_every, full_every) = if speech_active {
            (self.subtitle_every, self.full_every)
        } else {
            (self.silent_subtitle_every, self.silent_full_every)
        };
        // M4：降级档覆盖全帧间隔（静音期也不破 0.1fps 封顶）
        let full_every = if degraded { self.degraded_full_every } else { full_every };
        self.subtitle_tick = self.subtitle_tick.wrapping_add(1);
        self.full_tick = self.full_tick.wrapping_add(1);
        if self.subtitle_tick >= sub_every {
            self.subtitle_tick = 0;
            SampleRegion::Subtitle
        } else if self.full_tick >= full_every {
            self.full_tick = 0;
            SampleRegion::Full
        } else {
            SampleRegion::Skip
        }
    }
}

/// 字幕区启发式：帧底部 1/4 高度区域（ADR-005）。
///
/// @ai-context: v0.4.0 M2（REQ-037）后实时链路改用 region_tracker 动态 ROI，
///              本函数保留供测试与回退参考（M2 先验语义同源）。
#[allow(dead_code)]
pub fn bottom_quarter_rect(frame_width: u32, frame_height: u32) -> Option<Rect> {
    if frame_width == 0 || frame_height == 0 {
        return None;
    }
    let quarter = (frame_height / 4).max(1);
    Some(Rect {
        left: 0,
        top: (frame_height - quarter) as i32,
        right: frame_width as i32,
        bottom: frame_height as i32,
    })
}

/// 按裁剪区域裁剪 BGRA8 帧（区域相对帧左上角）；None 时不裁剪。
///
/// @ai-context: 纯函数（帧数据操作），供 DXGI/GDI 捕获层复用（ADR-002）。
///              区域越界部分自动裁掉；裁剪后区域为空则清空帧。
pub fn crop_frame(frame: &mut Vec<u8>, width: &mut u32, height: &mut u32, crop: Option<&Rect>) {
    let Some(crop) = crop else { return };
    let fw = *width as i32;
    let fh = *height as i32;
    let clipped = Rect { left: 0, top: 0, right: fw, bottom: fh }
        .intersect(crop)
        .unwrap_or(Rect { left: 0, top: 0, right: 0, bottom: 0 });
    let cw = clipped.width() as usize;
    let ch = clipped.height() as usize;
    if cw == 0 || ch == 0 || frame.len() < (fw as usize) * (fh as usize) * 4 {
        *width = 0;
        *height = 0;
        frame.clear();
        return;
    }
    let mut out = Vec::with_capacity(cw * ch * 4);
    for y in 0..ch {
        let src_row = (clipped.top as usize + y) * fw as usize * 4;
        let start = src_row + clipped.left as usize * 4;
        out.extend_from_slice(&frame[start..start + cw * 4]);
    }
    *width = cw as u32;
    *height = ch as u32;
    *frame = out;
}

/// 最近邻缩小 BGRA8 帧到指定最大宽度（保持宽高比；P4：OCR 输入缩小）。
///
/// @ai-context: OCR 推理成本随像素数近似平方增长（头脑风暴 P4）——字幕区裁剪帧
///              全宽（如 1920px）送 OCR 昂贵；缩至 ~960px 宽成本降约 4 倍，
///              字幕文字大、缩小后识别质量无损。宽高比经整数比例换算（y*dst/src）。
pub fn downscale_bgra(frame: &mut Vec<u8>, width: &mut u32, height: &mut u32, max_width: u32) {
    if max_width == 0 || *width <= max_width || *height == 0 {
        return;
    }
    let src_w = *width as usize;
    let src_h = *height as usize;
    if frame.len() < src_w * src_h * 4 {
        return;
    }
    let dst_w = max_width as usize;
    let dst_h = ((*height as u64 * max_width as u64) / *width as u64).max(1) as usize;
    let mut out = Vec::with_capacity(dst_w * dst_h * 4);
    for y in 0..dst_h {
        let src_y = (y * src_h) / dst_h;
        let src_row = src_y * src_w * 4;
        for x in 0..dst_w {
            let src_x = (x * src_w) / dst_w;
            let i = src_row + src_x * 4;
            out.extend_from_slice(&frame[i..i + 4]);
        }
    }
    *width = dst_w as u32;
    *height = dst_h as u32;
    *frame = out;
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "frame_diff_tests.rs"]
mod tests;
