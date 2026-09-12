//! WAV 轴 ≡ 会话轴的对齐纯函数（批 6 T23 / R5.5-b 的根治方案）。
//!
//! @ai-context: Why —— 写块路径今天「纯追加」（WAV 轴 = 已写样本数 ÷ 16000），而会话轴
//!              （`segments[].start_ms` = 会话纪元 − 累计暂停）走墙钟；`capture/audio_loopback.rs:432-437`
//!              的**静默窗根本不产包**（`probe-audio-runtime.md` 的 D2）⇒ 两轴必然分叉
//!              且**无上界** ⇒ 播放头会漂到分钟级。本模块判定「这一块之前该补多少静音」。
//!              **基准轴 = `AudioChunk.timestamp_ms`**，它**已含暂停补偿**
//!              （`audio_loopback.rs:455-466` 逐字 `epoch.elapsed() - paused_ms`；暂停时长在
//!              恢复成功时 `:367-374` 才累加）⇒ 与 `segments[].start_ms` 同轴，无需另立基准。
//! @ai-context: 副作用 = **无**（纯函数、零 IO、零依赖、无全局态）；`AlignBook` 是调用方
//!              持有的值类型。消费者 = `audio_store::SessionAudioWriter::write_chunk`
//!              与 `audio_align_tests.rs` / `audio_store_tests.rs`。
//! @ai-context: 边界（**失效安全优先**：宁可退回今天的纯追加，也不写错位置）——`None` 的
//!              四种情形：① 本块时间戳缺失 ② 为负 ③ **回退/乱序**（`next < prev_end`）
//!              ④ 空档 > `MAX_GAP_MS`。`None` 的语义统一 =「**本块及后续一律不补**
//!              （纯追加）」，由调用方同时置 `aligned = false` ⇒ **样本一个不丢**、
//!              **不阻断会话主链路**（`audio_store.rs:9-10` 的降级方向不变）。
//!              首块（`prev_end_ms = None`）⇒ `Some(0)`：T0 由首块锚定。

/// 1 毫秒的样本数（16 kHz ÷ 1000；与 `audio_store::SAMPLE_RATE` 同契约，不重复定义采样率）。
pub const SAMPLES_PER_MS: usize = 16;

/// 单次空档补静音的**上限**（10 分钟）。
///
/// @ai-context: Why 必须有上限：空档由「静默窗无包」造成，**上不封界**（D2）⇒ 无上限会在
///              一次超长静默里当场分配巨量缓冲（1 小时 = 115 MB）⇒ 超出即 `None`
///              （不补 + `aligned = false`）。10 分钟是批 6 计划定的安全参数（追认项）。
pub const MAX_GAP_MS: i64 = 10 * 60 * 1000;

/// 一个空档应补多少静音样本；`None` = **失效安全**（不补，退回纯追加）。
/// @ai-context: `prev_end_ms` 由调用方按「首个带时间戳的块 + 已写样本数 ÷ 16」推
///              （不额外存时间戳，见 `AlignBook::last_end_ms`）；`next_ts_ms` = 本块的
///              `AudioChunk.timestamp_ms`（块**发点** = 块末 ⇒ 首块锚定后，WAV 轴与该块
///              末样本的会话时刻重合）。
pub fn silence_gap_samples(prev_end_ms: Option<i64>, next_ts_ms: Option<i64>) -> Option<usize> {
    let next = next_ts_ms?;
    if next < 0 {
        return None;
    }
    let Some(prev_end) = prev_end_ms else {
        return Some(0); // 首块锚定 T0：不补
    };
    if next < prev_end {
        return None; // 回退/乱序
    }
    let gap_ms = next - prev_end;
    if gap_ms > MAX_GAP_MS {
        return None; // 超大空档：宁可不补，也不写巨量静音
    }
    Some(gap_ms as usize * SAMPLES_PER_MS)
}

/// 对齐簿记（`SessionAudioWriter` 的字段集合；`aligned` 是**自证量**）。
///
/// @ai-context: `aligned` 初始 `true`（=「尚未发现偏差」，**不**等于「已确认对齐」），
///              但**只要遇到一次**「缺失/为负/回退/超大空档」就**永久置 `false`**
///              （本次会话内不恢复）；`aligned == false` ⇒ 后续块一律纯追加。
///              **禁止**把它写成恒 `true` 的字段（R5.5-b 第 3 条）——读侧
///              `commands_audio::read_aligned` 据此如实区分「有/无时间基准」，
///              本修复之前录的 WAV 无 sidecar ⇒ 读侧 false（历史录音不假装精确）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AlignBook {
    /// 自证量（对外值用 `is_aligned()`：空录音不冒充「已对齐」）
    pub aligned: bool,
    /// 首个带时间戳的块的 `timestamp_ms`（= R5.5-b 的 T0）
    pub first_ts_ms: Option<i64>,
    /// 已写样本对应的**会话轴末端**（`first_ts_ms + 已写样本数 ÷ 16`，由样本数推）
    pub last_end_ms: Option<i64>,
    /// 已写样本数（含补的静音；`last_end_ms` 由它推 ⇒ 不额外存「上一块时间戳」）
    written: u64,
}

impl AlignBook {
    /// 新建（`aligned` 初始 `true` =「尚未发现偏差」）。
    pub fn new() -> Self {
        Self { aligned: true, first_ts_ms: None, last_end_ms: None, written: 0 }
    }

    /// 推进一块（**唯一**的状态转移：`write_chunk` 与 `alignment_plan` 共用 ⇒ 不分叉）；返回本块之前应补的静音样本数（`None` = 不补）。
    pub fn step(&mut self, ts_ms: Option<i64>, samples: usize) -> Option<usize> {
        if !self.aligned {
            return None; // 已失效：后续纯追加（不补、不丢样本）
        }
        let Some(ts) = ts_ms else {
            self.aligned = false; // ① 缺失时间戳
            return None;
        };
        let pad = match silence_gap_samples(self.last_end_ms, Some(ts)) {
            Some(pad) => pad,
            None => {
                self.aligned = false; // ②/③/④：为负 / 回退 / 超大空档
                return None;
            }
        };
        let first = *self.first_ts_ms.get_or_insert(ts); // 首块锚定 T0（此时 pad 必为 0）
        self.written += (pad + samples) as u64;
        self.last_end_ms = Some(first + (self.written / SAMPLES_PER_MS as u64) as i64);
        Some(pad)
    }

    /// 自证量：`aligned` **且**至少写过一个带时间戳的块（空录音不得自称「已对齐」）。
    pub fn is_aligned(&self) -> bool {
        self.aligned && self.first_ts_ms.is_some()
    }
}

/// 块序列 → 逐块的「写入前应补静音样本数」（纯函数；单测与自证的主入口）。
///
/// @ai-context: 与 `AlignBook::step` 的逐块驱动**逐元素相等**（V5 对拍）；生产路径
///              （`write_chunk`）是增量的 ⇒ 本函数无生产调用点（同 `ChunkAccumulator::flush`）。
#[allow(dead_code)]
pub fn alignment_plan(chunks: &[(Option<i64>, usize)]) -> Vec<Option<usize>> {
    let mut book = AlignBook::new();
    chunks.iter().map(|(ts, n)| book.step(*ts, *n)).collect()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "audio_align_tests.rs"]
mod tests;
