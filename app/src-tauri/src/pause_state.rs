//! 会话暂停单状态机与共享状态（批 2a：暂停来源单状态机，2026-09）。
//!
//! @ai-context(Why)：2026-08 A1 的 SessionPause 只是 paused + total_paused_ms 两
//!              个原子，命令层/屏幕 worker/捕获线程各自直写，无仲裁——① 无法
//!              区分"谁暂停的"（手动/媒体随播随停/前台离开共用一个标志，恢复
//!              语义互踩）；② 恢复丢内容：暂停+恢复都发生在主循环 500ms 轮询
//!              窗内时，loop 看不到标志边沿（不 flush 不 reset），暂停前后语音
//!              在同一流里连句。本模块收口：paused 的唯一语义写入点是 request
//!              API（单状态机，manual 锁存 + auto 条件各自独立互不解除）；
//!              seq/edge 槽由捕获线程单写（物理暂停区间的计数与实测会话时刻），
//!              loop 以 seq 代数补偿漏边沿（reconcile 见 live_session_pause.rs）。
//! @ai-context：来源优先级 manual > foreground > media（reason=当前持因；多因
//!              叠加显示最可能先解除后仍暂停的因——前台的"离开即恢复"语义最
//!              贴近用户当下注意力）。暂停时刻 = 捕获线程实测（edge 槽）优先、
//!              loop 会话时刻公式兜底，恢复时刻单调夹逼（>= 上一 Pause 事件）。
//! @ai-context：reset() 纪律保持（2026-08 A1）：total_paused_ms/seq/edge 槽仅
//!              捕获线程写，reset 是新会话起点例外；暂停条件/理由走锁内仲裁。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// 暂停来源（kebab-case 序列化：manual/media/foreground；DB 事件载荷与
/// live:paused/resumed 事件 reason 字段共用同一序列化契约）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseSource {
    /// 用户手动（pause/resume 命令）
    Manual,
    /// 前台离开（目标窗口失焦/切走，批 2a 新增自动暂停源）
    Foreground,
    /// 媒体随播随停（视频暂停检测，REQ-291）
    Media,
}

impl PauseSource {
    /// kebab-case 契约串（DB payload/事件载荷/状态查询同口径）。
    pub fn as_str(&self) -> &'static str {
        match self {
            PauseSource::Manual => "manual",
            PauseSource::Foreground => "foreground",
            PauseSource::Media => "media",
        }
    }

    /// 显示优先级（manual > foreground > media）——多因叠加时 reason 取最高。
    fn rank(self) -> u8 {
        match self {
            PauseSource::Manual => 3,
            PauseSource::Foreground => 2,
            PauseSource::Media => 1,
        }
    }
}

impl serde::Serialize for PauseSource {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

/// 机器条件锁存（manual 锁存 + 两个 auto 条件；auto 只解自己互不解除）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PauseConditions {
    pub manual: bool,
    pub foreground: bool,
    pub media: bool,
}

/// request API 的返回（调用方据此决定守卫文案/事件动作）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseOutcome {
    /// 本请求使会话 运行→暂停（paused 标志翻转 true）
    Paused,
    /// 本请求使会话 暂停→运行（整段暂停结束，paused 翻转 false）
    Resumed,
    /// 暂停请求但会话已暂停（条件已记录，物理无变化——锁存语义）
    AlreadyPaused,
    /// 释放请求但会话未暂停（无本来源持暂停）
    NotPaused,
    /// 释放了本来源但仍有其他来源持暂停（暂停延续，reason 已切换）
    StillHeld,
}

/// 暂停机器状态（纯值；request API 在锁内应用 next() 后落共享）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PauseMachineState {
    pub cond: PauseConditions,
    /// 推导值 paused = manual || foreground || media
    pub paused: bool,
    /// 暂停中=当前持因；解除瞬间起=最近一次释放源（sticky——loop 恢复边沿
    /// 事件需要"谁结束了暂停"，读同一槽免竞态）
    pub reason: Option<PauseSource>,
}

impl PauseMachineState {
    /// 纯函数真值表（单测在 pause_state_tests.rs）：
    /// - Pause(src)：锁存 cond[src]；已暂停时物理无变化（outcome 由调用方判定）
    /// - Release(src)：只清 cond[src]；仍被其他源持有 → 暂停延续
    /// - reason：暂停中=rank 最高持因；解除落地时=本次释放源（sticky）
    pub(crate) fn next(self, req: PauseRequest) -> Self {
        let mut cond = self.cond;
        let was_paused = self.paused;
        match req {
            PauseRequest::Pause(src) => set_cond(&mut cond, src, true),
            PauseRequest::Release(src) => set_cond(&mut cond, src, false),
        }
        let paused = cond.manual || cond.foreground || cond.media;
        let reason = if paused {
            top_holder(&cond)
        } else if was_paused {
            // 整段暂停刚结束：sticky = 本次释放源（谁结束了暂停）
            Some(req.source())
        } else {
            None
        };
        Self { cond, paused, reason }
    }
}

fn set_cond(cond: &mut PauseConditions, src: PauseSource, v: bool) {
    match src {
        PauseSource::Manual => cond.manual = v,
        PauseSource::Foreground => cond.foreground = v,
        PauseSource::Media => cond.media = v,
    }
}

fn holds_in(cond: &PauseConditions, src: PauseSource) -> bool {
    match src {
        PauseSource::Manual => cond.manual,
        PauseSource::Foreground => cond.foreground,
        PauseSource::Media => cond.media,
    }
}

/// rank 最高持因（manual > foreground > media）。
fn top_holder(cond: &PauseConditions) -> Option<PauseSource> {
    [
        PauseSource::Manual,
        PauseSource::Foreground,
        PauseSource::Media,
    ]
    .into_iter()
    .filter(|s| holds_in(cond, *s))
    .max_by_key(|s| s.rank())
}

/// 单写入请求（request API 与 next() 之间传递）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseRequest {
    Pause(PauseSource),
    Release(PauseSource),
}

impl PauseRequest {
    fn source(self) -> PauseSource {
        match self {
            PauseRequest::Pause(s) | PauseRequest::Release(s) => s,
        }
    }
}

/// 最近实测物理暂停区间的会话时刻对（捕获线程在 Start 成功时完整写入；
/// 供 loop 合成漏边沿 Pause/Resume 事件对定时刻，session 时间轴暂停区间
/// 是零时长点——暂停时长已由补偿扣除，故 pause_ms == resume_ms ≈ 冻结点）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PauseInterval {
    pub pause_ms: u64,
    pub resume_ms: u64,
    /// 物理停采瞬间的持因快照（事件对 source 用）
    pub source: PauseSource,
}

/// 锁内可变状态（request 仲裁 + reason + 最近完成区间）。
#[derive(Debug, Default)]
struct PauseInner {
    cond: PauseConditions,
    /// 语义见 PauseMachineState.reason（暂停中=持因；解除后=最近释放源）
    reason: Option<PauseSource>,
    /// 最近完成的物理暂停区间（None=本会话尚无完成区间）
    edge: Option<PauseInterval>,
}

impl PauseInner {
    fn conditions(&self) -> PauseConditions {
        self.cond
    }
}

/// 会话暂停共享状态（2026-08 A1 SessionPause 迁移升级——audio_loopback
/// 以 `pub use` 别名保留旧路径，调用点零爆炸）。
///
/// @ai-context: paused 原子供 loop/捕获线程高频无锁采样；条件与 reason 在
///              锁内（请求改条件 → 重算 → 最后落 paused——锁序保证读 paused
///              true 的线程随后取锁必见完整条件/reason）。
#[derive(Clone)]
pub struct SessionPause {
    pub paused: Arc<AtomicBool>,
    /// 累计暂停毫秒（原子 u64；捕获线程维护，消费方读作时间戳补偿）
    pub total_paused_ms: Arc<AtomicU64>,
    /// 已完成的物理暂停区间计数（捕获线程单写；loop 以此做漏边沿代数）
    seq: Arc<AtomicU64>,
    inner: Arc<Mutex<PauseInner>>,
}

impl Default for SessionPause {
    fn default() -> Self {
        Self {
            paused: Arc::new(AtomicBool::new(false)),
            total_paused_ms: Arc::new(AtomicU64::new(0)),
            seq: Arc::new(AtomicU64::new(0)),
            inner: Arc::new(Mutex::new(PauseInner::default())),
        }
    }
}

impl SessionPause {
    /// 按会话复位（P2 补漏：标志/补偿时长/区间计数/条件不得跨会话残留——
    /// 上次会话若在暂停中停止，paused 残留会让新会话起始即暂停；补偿/seq/
    /// 条件残留会让新会话时间戳与来源语义错位）。生命周期起点调用。
    pub fn reset(&self) {
        self.paused.store(false, Ordering::SeqCst);
        self.total_paused_ms.store(0, Ordering::SeqCst);
        self.seq.store(0, Ordering::SeqCst);
        if let Ok(mut g) = self.inner.lock() {
            *g = PauseInner::default();
        }
    }

    /// request API（paused 唯一语义写入入口）：应用真值表并落共享。
    ///
    /// @ai-context: 调用方各自持源：手动经 manager（pause/resume 命令）；
    ///              媒体/前台经屏幕 worker（各自检测器的决策点）。auto 源在
    ///              manual 锁存期间只记条件不动作（已暂停，物理无变化）。
    pub fn request(&self, req: PauseRequest) -> PauseOutcome {
        let mut guard = self.inner.lock().expect("pause state lock poisoned");
        let cur = PauseMachineState {
            cond: guard.cond,
            paused: self.paused.load(Ordering::SeqCst),
            reason: guard.reason,
        };
        let next = cur.next(req);
        let outcome = match req {
            PauseRequest::Pause(_) if cur.paused => PauseOutcome::AlreadyPaused,
            PauseRequest::Pause(_) => PauseOutcome::Paused,
            PauseRequest::Release(_) if !cur.paused => PauseOutcome::NotPaused,
            PauseRequest::Release(_) if next.paused => PauseOutcome::StillHeld,
            PauseRequest::Release(_) => PauseOutcome::Resumed,
        };
        guard.cond = next.cond;
        guard.reason = next.reason;
        // 锁内最后落 paused（见模块头锁序注释）
        self.paused.store(next.paused, Ordering::SeqCst);
        outcome
    }

    /// 便捷：暂停请求（src 由调用方给定：Manual/Media/Foreground）。
    pub fn request_pause(&self, src: PauseSource) -> PauseOutcome {
        self.request(PauseRequest::Pause(src))
    }

    /// 便捷：释放请求（只解自己）。
    pub fn request_release(&self, src: PauseSource) -> PauseOutcome {
        self.request(PauseRequest::Release(src))
    }

    /// 当前暂停来源（暂停中=持因；解除后 sticky=最近释放源——loop 恢复边沿
    /// 事件读此取 source）。
    pub fn reason(&self) -> Option<PauseSource> {
        self.inner.lock().expect("pause state lock poisoned").reason
    }

    /// 当前来源（仅暂停中有意义；status 查询用——未暂停恒 None）。
    pub fn paused_reason(&self) -> Option<PauseSource> {
        if self.paused.load(Ordering::SeqCst) {
            self.reason()
        } else {
            None
        }
    }

    /// 来源是否锁存（worker 侧按自身条件行动：媒体持有时轻量轮询找恢复
    /// 信号、manual 锁存期冻结一切自动检测）。
    pub fn holds(&self, src: PauseSource) -> bool {
        let cond = self.conditions();
        match src {
            PauseSource::Manual => cond.manual,
            PauseSource::Foreground => cond.foreground,
            PauseSource::Media => cond.media,
        }
    }

    /// manual 锁存（用户主动暂停——worker 冻结，不跟随任何自动源）。
    pub fn manual_held(&self) -> bool {
        self.holds(PauseSource::Manual)
    }

    /// 媒体条件锁存（随播随停或播放器暂停检测置位）。
    pub fn media_held(&self) -> bool {
        self.holds(PauseSource::Media)
    }

    /// 当前条件锁存快照。
    pub fn conditions(&self) -> PauseConditions {
        self.inner.lock().expect("pause state lock poisoned").conditions()
    }

    /// 已完成物理暂停区间计数（捕获线程单写；loop 漏边沿代数输入）。
    pub fn completed_intervals(&self) -> u64 {
        self.seq.load(Ordering::SeqCst)
    }

    /// 最近完成物理暂停区间（None=尚无；loop 合成事件定时刻/定来源）。
    pub(crate) fn edge_interval(&self) -> Option<PauseInterval> {
        self.inner.lock().expect("pause state lock poisoned").edge
    }

    /// 捕获线程在物理 Stop 成功时调用：快照当前持因（区间事件来源；与锁序
    /// 配合——paused=true 已落，取锁必见完整 reason）。
    pub(crate) fn snapshot_reason(&self) -> Option<PauseSource> {
        self.reason()
    }

    /// 捕获线程在物理 Start 成功时调用：登记完成的暂停区间并推进区间计数
    /// （先写 edge 槽后推进 seq——loop 见新 seq 必见新槽）。
    pub(crate) fn record_interval(&self, interval: PauseInterval) {
        if let Ok(mut g) = self.inner.lock() {
            g.edge = Some(interval);
        }
        self.seq.fetch_add(1, Ordering::SeqCst);
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "pause_state_tests.rs"]
mod tests;
