//! 实时会话引擎预热（P3：选窗口阶段后台加载 ASR 引擎，点"开始"即录）。
//!
//! @ai-context: StreamingAsrEngine 含 FFI 句柄（非 Send）**不能跨线程移交**——
//!              预热线程加载引擎后 park 在**原线程**等待 Start/Cancel：start
//!              通过 channel 发消息交接（引擎不移动，线程就地转为会话线程），
//!              模型加载数秒从点击路径移除。
//! @ai-context: 生命周期：prepare 起线程 → Loading → Ready（引擎加载完成）→
//!              park 等消息（500ms 轮询 Cancel / 15min TTL / 发送端断开）→
//!              Start 后执行 run_session_after_engine；Cancel/TTL → 退出释放
//!              引擎（内存 ~数百 MB，页面卸载经 release_live_prepare 主动释放）。
//! @ai-context: 会话纪元在 Start 交接后创建（模型已加载——无 ADR-008 A1 秒级
//!              偏移；音频/屏幕/flush 三处共享同基准）。

use std::sync::atomic::AtomicBool;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::engine::EnginePool;
use crate::live_session::LiveSessionParams;
use crate::streaming_asr::{StreamingAsrConfig, StreamingAsrEngine, StreamingAsrModels};

/// 预热空闲 TTL（min）：超时未开始自动退出释放内存（页面卸载另有主动释放）。
const PREPARE_TTL: Duration = Duration::from_secs(15 * 60);
/// park 轮询粒度（ms）：Cancel/TTL 响应延迟上限。
const PREPARE_POLL_MS: u64 = 500;

/// 预热输入（命令层从 AppState 组装；均为只读路径/共享句柄，Clone 廉价）。
#[derive(Clone)]
pub struct PrepareEnv {
    pub streaming_models: StreamingAsrModels,
    pub engines: EnginePool,
    pub vocab: Arc<Mutex<crate::vocab::VocabStore>>,
    pub punctuation_model: Option<String>,
}

/// Start 交接载荷（start 命令组装；预备线程收到后就地转为会话线程）。
pub struct StartHandoff {
    pub params: LiveSessionParams,
    pub session_id: i64,
    /// 停止标志（start 命令创建——与 ActiveSession 同源）
    pub stop: Arc<AtomicBool>,
    /// 最新帧共享缓存（manager 持有；屏幕 worker 写入、截图命令读取）
    pub latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    /// 会话暂停共享状态（A1：manager 持同一实例，捕获线程维护补偿时长）
    pub pause: crate::capture::audio_loopback::SessionPause,
    /// v0.7.2（REQ-151）：会话信息聚合（屏幕 worker 播放器 OCR 写入）
    pub session_info: crate::session_info::SessionInfoCollector,
}

/// 预备线程消息（Start 载荷装箱——消息只发一次，避免大枚举变体常驻栈上）。
pub enum PrepareMsg {
    Start(Box<StartHandoff>),
    Cancel,
}

/// 预热状态（命令层返回给前端提示；start 有界等待就绪）。
///
/// @ai-context: 手写 Serialize（审查修复）：derive 对带载荷变体 Failed(String)
///              产出 `{"failed": "..."}` 对象、unit 变体产出字符串——前端
///              契约是纯字符串 tag（"idle"/"loading"/"ready"/"failed"），
///              双表示会经 `as` 断言被掩盖并在运行时静默失效；失败原因
///              已由 eprintln 日志承载，不进 IPC 载荷。
#[derive(Debug, Clone, PartialEq)]
pub enum PrepareStatus {
    /// 无预备（未预热/已消费/活动会话中）
    Idle,
    /// 引擎加载中
    Loading,
    /// 引擎就绪，开始即录
    Ready,
    /// 加载失败（原因仅日志；start 回退内联加载，不阻断）
    Failed(String),
}

impl serde::Serialize for PrepareStatus {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let tag: &str = match self {
            PrepareStatus::Idle => "idle",
            PrepareStatus::Loading => "loading",
            PrepareStatus::Ready => "ready",
            PrepareStatus::Failed(_) => "failed",
        };
        serializer.serialize_str(tag)
    }
}

/// 预备会话句柄（manager 持有；start 交接后 thread 移入 active）。
pub struct PreparedSession {
    pub tx: mpsc::Sender<PrepareMsg>,
    pub thread: JoinHandle<()>,
    pub(crate) status: Arc<Mutex<PrepareStatus>>,
}

impl PreparedSession {
    /// 当前预热状态（线程加载完成/失败时更新；幂等可反复查询）。
    pub fn status(&self) -> PrepareStatus {
        self.status.lock().expect("prepare status lock poisoned").clone()
    }
}

/// 预备线程入口：加载引擎 → 置 Ready → park 等 Start/Cancel/TTL。
pub fn run_prepared(rx: mpsc::Receiver<PrepareMsg>, env: PrepareEnv, status: Arc<Mutex<PrepareStatus>>) {
    // 与 run_session 同口径的端点配置（v0.20.1 REQ-265：档案 asr-params.json +
    // 遗留 env 覆盖，防两处漂移；默认值即原常量零变更）
    let asr_config = StreamingAsrConfig::from_env();
    let engine = match StreamingAsrEngine::load(
        &env.streaming_models,
        &asr_config,
        Some(env.engines.clone()),
        Some(env.vocab.clone()),
        env.punctuation_model.clone(),
    ) {
        Ok(e) => e,
        Err(e) => {
            *status.lock().expect("prepare status lock poisoned") =
                PrepareStatus::Failed(e.to_string());
            eprintln!("[LiveSession] 引擎预热失败: {}", e);
            return;
        }
    };
    // 加载期间可能已收到 Cancel/断开（release 先于加载完成——引擎加载不可中断，
    // 请求排队的语义收口）：先消费再宣告 Ready，避免"已完成→随即取消"的自相
    // 矛盾日志（dev StrictMode 双挂载下可稳定复现的误读观感）。
    // Start 理论上不会出现在加载期（start 仅在 status=Ready 时发交接；Loading
    // 期 start 走内联回退并先取消预备），但不可吞消息——交接到手就就地转会话
    match rx.try_recv() {
        Ok(PrepareMsg::Cancel) | Err(mpsc::TryRecvError::Disconnected) => {
            eprintln!("[LiveSession] 加载期间已请求取消，释放引擎");
            return;
        }
        Ok(PrepareMsg::Start(handoff)) => {
            run_with_handoff(engine, *handoff);
            return;
        }
        Err(mpsc::TryRecvError::Empty) => {}
    }
    *status.lock().expect("prepare status lock poisoned") = PrepareStatus::Ready;
    eprintln!("[LiveSession] 引擎预热完成（等待开始/取消）");

    // park：等 Start（就地转会话线程）/ Cancel / TTL / 发送端断开
    let deadline = Instant::now() + PREPARE_TTL;
    loop {
        match rx.recv_timeout(Duration::from_millis(PREPARE_POLL_MS)) {
            Ok(PrepareMsg::Start(handoff)) => {
                run_with_handoff(engine, *handoff);
                return;
            }
            Ok(PrepareMsg::Cancel) | Err(RecvTimeoutError::Disconnected) => {
                eprintln!("[LiveSession] 预热取消，释放引擎");
                return;
            }
            Err(RecvTimeoutError::Timeout) => {
                if Instant::now() >= deadline {
                    eprintln!("[LiveSession] 预热 TTL 到期，释放引擎");
                    return;
                }
            }
        }
    }
}

/// Start 交接执行（run_prepared 的就绪前/就绪后两处共用——防语义漂移）。
fn run_with_handoff(engine: StreamingAsrEngine, handoff: StartHandoff) {
    let StartHandoff {
        params,
        session_id,
        stop,
        latest_frame,
        pause,
        session_info,
    } = handoff;
    // 会话纪元在交接后创建（模型已加载——无 A1 秒级偏移）
    let epoch = Instant::now();
    crate::live_session::run_session_after_engine(
        engine, stop, params, session_id, latest_frame, pause, epoch, session_info,
    );
}
