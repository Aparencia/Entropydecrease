//! 实时会话屏幕采样线程（live_session.rs 的拆分子模块）。
//!
//! @ai-context: 屏幕采样在独立线程运行（run_screen_worker，TD-026 修复）——
//!              OCR 推理不再阻塞会话线程的音频消费；语音活跃度（B3）驱动自适应采样。
//! @ai-context: 本文件只留「文档 + 类型 + 常量 + 公共签名 + 1s 主循环骨架 + 收尾 +
//!              分文件 `#[path]` 子模块声明」；原 974 行硬拆单元见
//!              standards/line-limit-exemptions.md「已拆分」节（批 0-C3 Task 3）。
//! @ai-context: 1s 主循环节拍顺序是**行为契约**（顺序/锁/时序不可变）：前台门控
//!              250ms → 暂停检查（暂停期：轻量轮询 + 50ms 空转）→ 恢复沿
//!              sleep(100ms) → 补偿纪元 → 媒体 1s 拍 → 负载 2s 拍 → 采样 1s 拍
//!              （内含 tier 观测/override 消费/领域 150s/播放器 5s/信息 10s）→
//!              15s 诊断 → sleep(50ms)。各拍实现分散在下列子模块的 `impl` 块中。
//! @ai-context: 帧处理（网格差异触发/字幕 OCR/面板抑制/落库）已拆至
//!              live_frame_process.rs（v0.6.0 ADR-011 拆分）。
//! @ai-context: 时间戳统一（ADR-008 A1）：帧时间戳在捕获后覆写为会话纪元 elapsed，
//!              与音频块、flush 尾句同一基准（由 live_frame_process 执行）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::db::Db;
use crate::engine::EnginePool;
use crate::fusion::SubtitleSegment;
use crate::live_frame_process::persist_voted_subtitle;

use live_session_worker_state::FrameWorkerState;

/// 采样节拍（ms）：与音频消费解耦，固定 1s 一拍（审查 M5 修复）。
const SAMPLE_TICK_MS: u64 = 1000;
/// 采样线程轮询休眠（ms）——空转粒度，影响停止响应延迟。
const WORKER_POLL_MS: u64 = 50;
/// 空闲探针间隔（ms）：REQ-073 空闲降频期间低频全帧采样——无声视频恢复
/// 播放（画面变化）靠探针检测唤醒（5s 一次，成本可忽略）。
const IDLE_PROBE_INTERVAL_MS: u64 = 5_000;

/// 最新捕获帧快照（REQ-051 M6：用户截图命令读取；纯数据跨线程共享）。
#[derive(Clone)]
pub struct LatestCapturedFrame {
    pub timestamp_ms: u64,
    pub bgraw: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// REQ-281 停更监测（停更判定/心跳载荷/WGC 自愈；本文件 ≤300 行，AGENTS.md §3）。
#[path = "live_session_liveness.rs"]
pub(super) mod live_session_liveness;

/// 线程状态聚合 `FrameWorkerState`（TD-24-A：装配参数 + 主循环状态量 → 1；§3）。
#[path = "live_session_worker_state.rs"]
pub(super) mod live_session_worker_state;

/// 暂停隔离与轻量轮询（前台门控拍/暂停期恢复检测；§3）。
#[path = "live_session_pause_poll.rs"]
pub(super) mod live_session_pause_poll;

/// 播放器行为/信息探测（5s 图标检测 + 10s 区域 OCR；§3）。
#[path = "live_player_probe.rs"]
pub(super) mod live_player_probe;

/// 画面档/档案三维运行期（tier 升降档 + override 消费 + 领域重评；§3）。
#[path = "live_profile_runtime.rs"]
pub(super) mod live_profile_runtime;

/// 采样 tick 消费（媒体拍/负载拍/采样拍/诊断打印；§3）。
#[path = "live_session_consume.rs"]
pub(super) mod live_session_consume;

/// 屏幕采样线程入口（TD-026 修复：OCR 从会话线程移出，音频消费不再被阻塞）。
///
/// @ai-context: ScreenCaptureSampler 持 COM 对象（非 Send），在本线程内创建与使用，
///              规避跨线程约束；节拍自驱动（与音频消费解耦）；字幕段写入共享缓存，
///              停止后由融合线程读取；epoch/speech_active 由会话线程注入（ADR-008）。
/// @ai-context: 参数为**装配上下文**（停止标志/纪元/活跃度/DB/引擎/事件/共享槽），
///              函数体只做两件事：① 交给 `FrameWorkerState::new` 聚合（TD-24-A/D2）；
///              ② 跑主循环骨架（各子系统在分文件 `impl` 里）。公共签名与调用点
///              （live_session.rs 装配侧）保持不变，登记 clippy 豁免。
#[allow(clippy::too_many_arguments)]
pub fn run_screen_worker(
    stop: Arc<AtomicBool>,
    hwnd: Option<i64>,
    epoch: Instant,
    speech_active: Arc<AtomicBool>,
    db: Db,
    engines: EnginePool,
    app: tauri::AppHandle,
    session_id: i64,
    subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>>,
    // v0.5.0 M1（REQ-043）：视频类型档案（None=默认档案，采样档零回归）
    profile: Option<crate::video_profile::ProfileKind>,
    // v0.5.0 M6（REQ-051）：会话图片存储（关键帧归档；None=未启用）
    image_store: Option<crate::image_store::SessionImageStore>,
    // v0.5.0 M6（REQ-051）：最新帧共享缓存（用户截图命令读取）
    latest_frame: std::sync::Arc<std::sync::Mutex<Option<LatestCapturedFrame>>>,
    // v0.6.0 M1（REQ-083）：UI 垃圾黑名单（字幕源头过滤——文本特征命中不进投票器）
    ui_junk: crate::ui_junk::UiJunkList,
    // v0.7.0 M2（REQ-128）：前台时间线监控（2s 轮询 observe → ForegroundSwitch 落库）
    foreground_monitor: crate::foreground_timeline::ForegroundMonitor,
    // 2026-08 A1：会话暂停共享状态（暂停跳过采样；恢复后时间戳补偿暂停时长）
    pause: crate::capture::audio_loopback::SessionPause,
    // REQ-291（v0.19.7）：媒体级"最后有声时刻"戳（音频线程写；随播随停输入）
    media_sound: Arc<Mutex<Option<Instant>>>,
    // v0.7.2（REQ-151）：会话信息聚合（播放器 OCR 文本 → 平台/时长/合集信息面板）
    session_info: crate::session_info::SessionInfoCollector,
    // v0.9.0 M2（REQ-189）：画面档降档确认共享状态（前端确认后写入——
    // 本 worker 消费并 retune 采样器；None=无待确认）
    tier_override: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    // v0.9.0 M2（REQ-189）：当前生效画面档共享槽（应用档位时写入——
    // command 查询用；事件可能早于前端面板挂载，拉取兑底）
    applied_tier: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    // v0.11.5（Task 6）：档案三维覆写共享槽（command 写入，本 worker 消费后清空）
    profile_override:
        std::sync::Arc<std::sync::Mutex<Option<crate::live_session::ProfileOverride>>>,
    // v0.11.5（Task 6）：窗口标题（形态/领域自动重评用）
    window_title: String,
    // v0.11.5（Task 6）：当前生效三维档案快照共享槽（worker 消费 override 后写入）
    applied_profile:
        std::sync::Arc<std::sync::Mutex<Option<crate::live_session::ProfileOverride>>>,
) {
    let mut w = FrameWorkerState::new(
        stop, hwnd, epoch, speech_active, db, engines, app, session_id, subtitle_segments,
        profile, image_store, latest_frame, ui_junk, foreground_monitor, pause, media_sound,
        session_info, tier_override, applied_tier, profile_override, window_title,
        applied_profile,
    );

    while !w.stop.load(Ordering::SeqCst) {
        w.foreground_gate_tick();
        // ── 暂停检查（2026-08 A1 硬暂停；批 2a 来源感知扩展）──
        let paused_now = w.pause.paused.load(Ordering::SeqCst);
        if paused_now {
            w.poll_while_paused();
            std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
            continue;
        }
        if w.worker_paused {
            // 恢复：短暂等待捕获线程更新累计补偿时长（10ms 粒度），
            // 防恢复首帧时间戳读到旧补偿值（含暂停时长偏差）
            w.worker_paused = false;
            std::thread::sleep(Duration::from_millis(100));
            eprintln!("[ScreenWorker] 会话恢复，画面链继续");
        }
        // 时间戳补偿（2026-08 A1）：会话时间 = epoch - 累计暂停时长；
        // process_frame 内部以 epoch 为基准生成帧时间戳——每次构造补偿后的
        // 纪元传入（暂停期间不采样，补偿值在恢复后恒定）
        let comp_epoch = w.compensated_epoch();
        // REQ-291（v0.19.7）：随播随停 1s 拍——暂停期的恢复检测由暂停分支承担
        if !paused_now {
            w.media_tick(comp_epoch);
        }
        w.load_tick();
        w.sample_tick(comp_epoch);
        w.diagnostic_tick();
        std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
    }
    // 停止：冲刷未定稿的最后一组字幕（否则末句字幕丢失，T2 语义要求）
    // 2026-08 A1：flush 时间戳同样补偿暂停时长（会话时间基准）
    let flush_epoch = w.compensated_epoch();
    if let Some(voted) = w.voter.flush(flush_epoch.elapsed().as_millis() as u64) {
        persist_voted_subtitle(&w.db, &w.app, w.session_id, &w.subtitle_segments, voted);
    }
    // M6/REQ-051：关键帧投票（课后精修：多信号筛选 → 关键图候选；产物层 M7 消费）
    crate::live_keyframes::vote_and_emit_keyframes(&w.frame_samples, &w.app, w.session_id);
    // 显式释放采样器（COM/DXGI 资源）——worker 退出即释放 duplication，
    // 防多会话快速连测时泄漏累积触发 DXGI 并发上限（4/5 会话无 OCR 排查项）
    drop(w.screen);
    eprintln!("[ScreenWorker] 屏幕采样线程退出（会话 {}）", w.session_id);
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_frame_tests.rs"]
mod tests;
