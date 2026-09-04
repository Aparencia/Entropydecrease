//! 实时会话启动/预热生命周期（Task #14 自 live_session.rs 拆出）。
//!
//! @ai-context: 2026-08-21 Task #14 硬限拆分：live_session.rs 实测 727 行超
//!              AGENTS.md ">600 行必拆" 硬限。本文件承接"会话启动准备"职责簇：
//!              start（建会话 + P3 预热交接/内联回退 + 起编排线程）、
//!              prepare/release_prepare/prepare_status（P3 预热引擎生命周期）、
//!              wait_prepared_ready（有界等待）、run_session（会话线程入口，
//!              内联加载流式 ASR 后进入 run_session_after_engine 装配骨架）。
//! @ai-context: 职责边界：结构体定义/查询控制方法簇在 live_session.rs /
//!              live_session_manager.rs；引擎就绪后的装配骨架（捕获/worker/
//!              主循环/融合接线）留在 live_session.rs 的 run_session_after_engine。
//!              impl LiveSessionManager 跨文件分布，公共 API 签名零变化。

use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::error::{AppError, Result};
use crate::live_session::{emit_error, run_session_after_engine, ActiveSession, LiveSessionManager, LiveSessionParams};
use crate::live_session_prepare::{PreparedSession, PrepareEnv, PrepareMsg, PrepareStatus, StartHandoff};
use crate::streaming_asr::{StreamingAsrConfig, StreamingAsrEngine};

/// 预备就绪等待结果（v0.19.3 审查即修：枚举替代字符串相等做行为分支——
/// 字符串跨函数耦合任一侧文案改动即静默退回"取消+内联"双引擎路径）。
pub enum WaitError {
    /// 引擎加载失败（原因——回退内联加载，旧引擎已死无内存翻倍）
    LoadFailed(String),
    /// 预备线程已退出（无可用预备——回退内联加载）
    Exited,
    /// 有界等待超时（引擎仍在加载——取消+会话行回滚+明确报错，防双引擎）
    Timeout,
}

impl std::fmt::Display for WaitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WaitError::LoadFailed(e) => write!(f, "引擎加载失败: {}", e),
            WaitError::Exited => write!(f, "预备线程已退出"),
            WaitError::Timeout => write!(f, "等待超时"),
        }
    }
}

impl LiveSessionManager {
    /// 启动实时会话：建会话 + 起编排线程，返回会话 id。
    ///
    /// @ai-context: P3：优先交接预热线程（引擎已加载——开始毫秒级）；无预备/
    ///              加载失败/交接失败回退内联加载（start 不因预热缺席失败）；
    ///              预热加载中**有界等待 ≤15s**（v0.19.2：CUDA 冷载常 >5s，
    ///              原 5s 超时走"取消+内联"双引擎重载，浪费且开头不齐）；
    ///              >15s 仍加载 → 取消预备并回滚会话行后明确报错（不双开）。
    /// @ai-context: 锁纪律（v0.19.3 审查即修）：等待期**不持有 active 锁**——
    ///              旧实现 15s 全程持锁会让主线程 pause/resume/status 命令
    ///              排队至事件循环冻结；改为快速初检 → 锁外等待 → 最终登记
    ///              闸（并发双 start 后到者回滚自身并报错，单会话不变量仍在）。
    pub fn start(&self, params: LiveSessionParams) -> Result<i64> {
        // ① 快速互斥初检（随后锁外等待——不长期占锁）
        if self.active.lock().expect("live session lock poisoned").is_some() {
            return Err(AppError::Io("已有进行中的实时会话，请先停止".to_string()));
        }
        let session_id = params
            .db
            .create_session(&crate::types::NewSession {
                title: params.title.clone(),
                source_window: params.source_window.clone(),
                // REQ-043：档案标识落库（None=默认档案）
                profile: params.profile.map(|k| k.as_str().to_string()),
                // 实时捕获 = 视频类会话（图文会话走 photo 命令线）
                kind: None,
            })
            .map_err(|e| AppError::Db(e.to_string()))?
            .id;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag = stop_flag.clone();
        // M6/REQ-051：最新帧共享缓存由 manager 持有（截图命令读取）
        let latest_frame = self.latest_frame.clone();
        // 2026-08 A1：会话暂停共享状态——按会话复位（P2 补漏：标志/补偿时长
        // 跨会话残留会让新会话起始即暂停、时间戳偏移）
        self.pause.reset();
        // 2026-08-21 审查修复（H1）：画面档共享槽按会话复位——槽跨会话残留会
        // 让新会话起始即显示上一会话档位（音频档案无 screen worker 写入，
        // 残留永久生效）；tier_override 残留会让新会话首次降档裁决被静默
        // 自动消费（未经本会话用户确认即降档）。
        *self.tier_override.lock().expect("tier override lock poisoned") = None;
        *self.applied_tier.lock().expect("applied tier lock poisoned") = None;
        let pause = self.pause.clone();
        // v0.7.2（REQ-151）：从窗口标题初始化会话信息（平台/系列/集号——
        // 标题信号零成本；时长/分P 由屏幕 worker 播放器 OCR 增量补充）
        self.session_info
            .init_from_title(params.source_window.as_deref().unwrap_or(&params.title));

        // ② 取预备槽（短锁）→ 锁外等待就绪（≤15s）
        let prep_opt = self.prepared.lock().expect("prepared lock poisoned").take();
        let wait_outcome = prep_opt
            .as_ref()
            .map(|p| wait_prepared_ready(p, std::time::Duration::from_secs(15)));

        // ③ 最终登记闸：等待期间他人可能已注册会话（并发双 start）——
        // 后到者取消自身预备/回滚会话行后明确报错
        let mut guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_some() {
            cancel_prepared_thread(prep_opt.as_ref());
            mark_failed(&params.db, session_id);
            return Err(AppError::Io("已有进行中的实时会话，请先停止".to_string()));
        }

        match (prep_opt, wait_outcome) {
            // 就绪交接：预备线程就地转为会话线程（引擎不跨线程）
            (Some(p), Some(Ok(()))) => {
                let handoff = StartHandoff {
                    params,
                    session_id,
                    stop: flag.clone(),
                    latest_frame: latest_frame.clone(),
                    pause: pause.clone(),
                    session_info: self.session_info.clone(),
                };
                match p.tx.send(PrepareMsg::Start(Box::new(handoff))) {
                    Ok(()) => {
                        *guard = Some(ActiveSession { stop_flag, thread: p.thread, session_id });
                        Ok(session_id)
                    }
                    Err(mpsc::SendError(PrepareMsg::Start(h))) => {
                        // 极小竞态（预备线程恰好退出）：取回参数回退内联加载
                        eprintln!("[LiveSession] 预备线程已退出，回退内联加载");
                        spawn_and_register_inline(
                            &mut guard,
                            stop_flag,
                            flag,
                            h.params,
                            h.session_id,
                            h.latest_frame,
                            h.pause,
                            h.session_info,
                        )
                    }
                    Err(_) => {
                        // 理论不可达（本路径只发 Start；防御：不得静默吞错）。
                        // 注：create_session 已执行——此路径会留一条空会话记录
                        // （与内联 spawn 失败同级别的既有边界，概率极低）
                        Err(AppError::Io(
                            "预热交接失败（预备线程异常退出），请重试".to_string(),
                        ))
                    }
                }
            }
            // 超时：取消预备（引擎仍加载不可中断——取消排队，线程加载完自行
            // 退出释放）并回滚会话行——**不回退内联**（双引擎内存翻倍）
            (Some(p), Some(Err(WaitError::Timeout))) => {
                cancel_prepared_thread(Some(&p));
                mark_failed(&params.db, session_id);
                Err(AppError::Io(
                    "引擎预热超时（模型加载过慢）——已取消，请稍候重试".to_string(),
                ))
            }
            // 加载失败/预备已退出：取消（线程已死——幂等）后回退内联加载
            (Some(p), Some(Err(e))) => {
                cancel_prepared_thread(Some(&p));
                eprintln!("[LiveSession] 预热{}，回退内联加载", e);
                spawn_and_register_inline(
                    &mut guard, stop_flag, flag, params, session_id, latest_frame, pause,
                    self.session_info.clone(),
                )
            }
            // 无预备：直接内联（首次/引擎释放后）
            (None, None) => {
                spawn_and_register_inline(
                    &mut guard, stop_flag, flag, params, session_id, latest_frame, pause,
                    self.session_info.clone(),
                )
            }
            (None, Some(_)) | (Some(_), None) => {
                // 逻辑不可达（prep 存在 ⇔ 有 wait_outcome）——防御兜底
                Err(AppError::Io("启动内部状态不一致，请重试".to_string()))
            }
        }
    }

    /// 预热流式 ASR 引擎（P3）：起预备线程加载引擎后 park 等待 Start/Cancel。
    ///
    /// @ai-context: 幂等（已有预备返回当前状态）；活动会话中返回 Idle 不预热
    ///              （避免白占内存）；模型文件缺失由命令层预检拦截，本层不重复。
    pub fn prepare(&self, env: PrepareEnv) -> PrepareStatus {
        // 活动会话中不预热（内存价值为零）
        if self.active.lock().expect("live session lock poisoned").is_some() {
            return PrepareStatus::Idle;
        }
        let mut prep = self.prepared.lock().expect("prepared lock poisoned");
        // 清理线程已退出的残留条目（取消/加载失败后）并上报终态；
        // 线程已退出 = 无可用预备——仅 Failed 值得上报（原因），
        // Ready 是 stale（release 超时 detach 后线程收到 Cancel 退出）
        if let Some(p) = prep.as_ref() {
            if p.thread.is_finished() {
                let st = p.status();
                *prep = None;
                return match st {
                    PrepareStatus::Failed(_) => st,
                    _ => PrepareStatus::Idle,
                };
            }
            return p.status();
        }
        let (tx, rx) = mpsc::channel();
        let status: Arc<Mutex<PrepareStatus>> = Arc::new(Mutex::new(PrepareStatus::Loading));
        let worker_status = status.clone();
        match std::thread::Builder::new()
            .name("entropy-live-prepare".into())
            .spawn(move || {
                crate::live_session_prepare::run_prepared(rx, env, worker_status)
            }) {
            Ok(thread) => {
                *prep = Some(PreparedSession { tx, thread, status: status.clone() });
                PrepareStatus::Loading
            }
            Err(e) => {
                // spawn 失败必须可观测（审查：不得静默失效）
                eprintln!("[LiveSession] 预热线程启动失败: {}", e);
                PrepareStatus::Failed(format!("预热线程启动失败: {}", e))
            }
        }
    }

    /// 释放预热引擎（P3：离开课堂助手页时调用；有界 join ≤1s）。
    pub fn release_prepare(&self) -> Result<()> {
        let p = self.prepared.lock().expect("prepared lock poisoned").take();
        let Some(p) = p else { return Ok(()) };
        let _ = p.tx.send(PrepareMsg::Cancel);
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1000);
        while !p.thread.is_finished() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        if !p.thread.is_finished() {
            // 卡在引擎加载中（不可中断）：detach——加载完即退出释放，可观测
            eprintln!("[LiveSession] 预热线程 1s 内未退出，已 detach");
        }
        Ok(())
    }

    /// 当前预热状态（live_session_status 的 prepared 字段数据源）。
    pub fn prepare_status(&self) -> PrepareStatus {
        let mut prep = self.prepared.lock().expect("prepared lock poisoned");
        match prep.as_ref() {
            Some(p) if p.thread.is_finished() => {
                // 线程已退出（取消/加载失败残留）：清理并上报终态；
                // 与 prepare() 同口径——Ready 为 stale（线程已死=无预备）
                let st = p.status();
                *prep = None;
                match st {
                    PrepareStatus::Failed(_) => st,
                    _ => PrepareStatus::Idle,
                }
            }
            Some(p) => p.status(),
            None => PrepareStatus::Idle,
        }
    }
}

/// 有界等待预备线程就绪（P3）：Ready→Ok；其余 → WaitError 枚举。
/// 注：调用方（start）在**锁外**等待（v0.19.3 审查即修——最长 15s 不占
/// active 锁，pause/resume/status 等命令不被冻结排队）。
fn wait_prepared_ready(
    p: &PreparedSession,
    timeout: std::time::Duration,
) -> std::result::Result<(), WaitError> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match p.status() {
            PrepareStatus::Ready => return Ok(()),
            PrepareStatus::Failed(e) => return Err(WaitError::LoadFailed(e)),
            PrepareStatus::Idle => return Err(WaitError::Exited),
            PrepareStatus::Loading => {
                if std::time::Instant::now() >= deadline {
                    return Err(WaitError::Timeout);
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }
}

/// 取消预备线程（发送 Cancel + 有界 join ≤1s，超时 detach——引擎加载不可
/// 中断，取消排队后线程加载完自行退出释放）。
fn cancel_prepared_thread(p: Option<&PreparedSession>) {
    let Some(p) = p else { return };
    let _ = p.tx.send(PrepareMsg::Cancel);
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1000);
    while !p.thread.is_finished() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    if !p.thread.is_finished() {
        eprintln!("[LiveSession] 预备线程取消超时，已 detach");
    }
}

/// 会话行回滚（start 失败路径——防孤儿 recording；失败须可观测不静默）。
fn mark_failed(db: &crate::db::Db, session_id: i64) {
    if let Err(e) = db.mark_session_failed(session_id) {
        eprintln!("[LiveSession] 会话 {} 标记失败回滚失败: {}", session_id, e);
    }
}

/// 内联加载路径统一落位：起会话线程（加载流式 ASR 后进入装配）并注册活动
/// 会话——须在持有 active 锁（最终登记闸）时调用。
#[allow(clippy::too_many_arguments)]
fn spawn_and_register_inline(
    active: &mut Option<ActiveSession>,
    stop_flag: Arc<AtomicBool>,
    flag: Arc<AtomicBool>,
    params: LiveSessionParams,
    session_id: i64,
    latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    pause: crate::capture::audio_loopback::SessionPause,
    session_info: crate::session_info::SessionInfoCollector,
) -> Result<i64> {
    let thread = std::thread::Builder::new()
        .name("entropy-live-session".into())
        .spawn(move || {
            run_session(flag, params, session_id, latest_frame, pause, session_info)
        })
        .map_err(|e| AppError::Io(format!("启动会话线程失败: {}", e)))?;
    *active = Some(ActiveSession { stop_flag, thread, session_id });
    Ok(session_id)
}

/// 会话线程（内联加载路径）：加载流式 ASR 引擎 → 装配骨架（run_session_after_engine）。
///
/// @ai-context: 与预热交接路径的分叉点——交接时引擎已由预备线程加载，
///              直接进 run_session_after_engine；内联路径在此完成加载。
fn run_session(
    stop: Arc<AtomicBool>,
    params: LiveSessionParams,
    session_id: i64,
    // M6/REQ-051：最新帧共享缓存（屏幕 worker 写入，manager 持同一实例）
    latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    // 2026-08 A1：会话暂停共享状态（manager 持同一实例；捕获线程维护补偿时长）
    pause: crate::capture::audio_loopback::SessionPause,
    // v0.7.2（REQ-151）：会话信息聚合（屏幕 worker 播放器 OCR 写入）
    session_info: crate::session_info::SessionInfoCollector,
) {
    let db = params.db.clone();
    let engines = params.engines.clone();
    // A1：会话纪元——音频/屏幕/flush 三处时间戳的唯一基准（ADR-008）
    let epoch = Instant::now();

    // 1) 流式 ASR（SenseVoice 重打分接离线引擎池；M5 热词经共享词表注入）
    // ADR-012 F3-1：rule3 最长句 env 可覆盖（默认 8s——5s 过短致句中硬切）
    let rule3_secs = std::env::var("ENTROPY_ASR_RULE3_SECS")
        .ok()
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(8.0);
    let asr_config = StreamingAsrConfig { rule3_min_utterance_secs: rule3_secs };
    let asr_engine = match StreamingAsrEngine::load(
        &params.streaming_models,
        &asr_config,
        Some(engines.clone()),
        Some(params.vocab.clone()),
        params.punctuation_model.clone(),
    ) {
        Ok(e) => e,
        Err(e) => {
            emit_error(&params.app, &format!("流式 ASR 引擎加载失败: {}", e));
            let _ = db.mark_session_failed(session_id);
            return;
        }
    };
    run_session_after_engine(
        asr_engine,
        stop,
        params,
        session_id,
        latest_frame,
        pause,
        epoch,
        session_info,
    );
}
