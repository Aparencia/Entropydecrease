//! 常驻引擎池：ASR/OCR 双 worker 线程（v0.3.0 优化，ADR-008 A3）。
//!
//! @ai-context: 第三方推理引擎（sherpa OfflineRecognizer / oar-ocr OAROCR）不保证 Send/Sync，
//!              专用线程独占持有可完全规避跨线程约束，同时实现模型常驻（消除每次调用 1-3 秒加载）。
//! @ai-context: 拆分动机（技术审查 A3）：原单线程串行处理 ASR/OCR 两类请求——实时链路中
//!              OCR 推理阻塞 SenseVoice 重打分、反之亦然；文件导入（v0.3.0）的长转写会整段
//!              阻塞实时 OCR。拆双线程后两路并行，各线程只加载自己的模型（内存不翻倍）。
//! @ai-context: 外部经 EnginePool（内部仅两个 channel sender，可廉价 Clone）同步发请求等结果。
//! @ai-context: worker 主循环与请求协议已拆至 engine_worker.rs（三维复审 #9：
//!              接入超时排空机制后逼近 600 行硬拆线，按豁免登记计划落地）。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::asr::AsrModels;
use crate::device_config::{OcrBackend, OcrDeviceStatus};
use crate::engine_worker::{asr_worker_loop, ocr_worker_loop, AsrRequest, OcrRequest};
use crate::error::{AppError, Result};
use crate::ocr::{OcrModels, OcrParams};
use crate::types::{OcrBlock, TranscriptSegment};
use crate::vocab::VocabStore;

/// H2 修复：ASR 单请求默认超时预算。
/// Why 60s：文件导入分窗转写正常在数十秒内完成，但引擎异常（CPU 竞争/
/// 模型卡顿）时不得让调用方裸 recv 永久挂起；特殊长任务可自行传更大 timeout。
pub const ASR_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// 三维复审 #3：整文件 WAV 转写（process_to_note 一键流水线）专用超时预算。
/// Why 30 分钟：整文件转写耗时与音频时长线性相关（40 分钟课堂录音远超短请求
/// 60s 预算）——行为契约是"长录音必达"，与短请求路径（ASR_REQUEST_TIMEOUT）
/// 语义不同，不得复用同一常量。
pub const ASR_FILE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// H2 修复：OCR 单图默认超时预算。
/// Why 20s：单帧推理正常在秒级内完成；实时热路径单帧异常时不得无限阻塞
/// （超时后调用方计入错误统计并继续下一帧——降级不阻塞）。
pub const OCR_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// 引擎池句柄（Clone 仅复制请求 channel，开销极低）。
#[derive(Clone)]
pub struct EnginePool {
    asr_tx: Sender<AsrRequest>,
    ocr_tx: Sender<OcrRequest>,
    /// 三维复审 #5：与 worker 共享的请求通道 receiver（超时后排空已积压请求）。
    /// 测试装配（dummy/with_*_channel）为 None——排空直接 no-op。
    asr_rx: Option<Arc<Mutex<Receiver<AsrRequest>>>>,
    ocr_rx: Option<Arc<Mutex<Receiver<OcrRequest>>>>,
    /// ADR-009：OCR 设备运行时状态（worker 更新生效后端/回退原因；命令层只读）
    ocr_device_status: Arc<Mutex<OcrDeviceStatus>>,
    /// ADR-009：校准进行中标记（防并发重复校准）
    ocr_calibrating: Arc<AtomicBool>,
    /// M7/REQ-042 F2：引擎线程心跳（worker 每处理一个请求置位；死亡=静默可见）
    asr_alive: Arc<AtomicBool>,
    ocr_alive: Arc<AtomicBool>,
    /// M7/REQ-042 F3：静默失败可见化——ASR/OCR 失败计数（会话摘要/诊断面板）
    asr_failures: Arc<AtomicU64>,
    ocr_failures: Arc<AtomicU64>,
    /// M7/REQ-042 G2：OCR 缓存命中/未命中计数（诊断面板命中率）
    ocr_cache_hits: Arc<AtomicU64>,
    ocr_cache_misses: Arc<AtomicU64>,
    /// REQ-100（v0.7.0 M1）：SenseVoice 重打分有界等待超时计数——
    /// 质量报告 rescore_timeouts 数据源（重打分降级事件，不再是恒 0）
    rescore_timeouts: Arc<AtomicU64>,
}

impl EnginePool {
    /// 启动 ASR/OCR 两个专用线程（各自立即加载模型，互不阻塞）。
    ///
    /// @ai-context: ADR-009——backend 为启动期决策结果（lib.rs 完成 探测→decide）；
    ///              状态 Arc 与命令层共享，worker 加载完成后回写 actual/fallback_reason。
    pub fn start(
        asr_models: AsrModels,
        ocr_models: OcrModels,
        ocr_params: OcrParams,
        backend: OcrBackend,
        ocr_device_status: Arc<Mutex<OcrDeviceStatus>>,
        vocab: Option<Arc<Mutex<VocabStore>>>,
    ) -> Result<Self> {
        let (asr_tx, asr_rx) = mpsc::channel();
        let (ocr_tx, ocr_rx) = mpsc::channel();
        // 三维复审 #5：receiver 经 Arc<Mutex> 与 worker 共享——超时路径可 try_recv 排空积压
        let asr_rx = Arc::new(Mutex::new(asr_rx));
        let ocr_rx = Arc::new(Mutex::new(ocr_rx));
        let asr_alive = Arc::new(AtomicBool::new(true));
        let ocr_alive = Arc::new(AtomicBool::new(true));
        let asr_failures = Arc::new(AtomicU64::new(0));
        let ocr_failures = Arc::new(AtomicU64::new(0));
        let ocr_cache_hits = Arc::new(AtomicU64::new(0));
        let ocr_cache_misses = Arc::new(AtomicU64::new(0));
        let rescore_timeouts = Arc::new(AtomicU64::new(0));
        let asr_alive_w = asr_alive.clone();
        let asr_fail_w = asr_failures.clone();
        let asr_rx_w = asr_rx.clone();
        thread::Builder::new()
            .name("entropy-asr-engine".into())
            .spawn(move || asr_worker_loop(asr_rx_w, asr_models, asr_alive_w, asr_fail_w))
            .map_err(|e| AppError::Io(format!("启动 ASR 引擎线程失败: {}", e)))?;
        let status_for_worker = ocr_device_status.clone();
        let vocab_for_worker = vocab.clone();
        let ocr_alive_w = ocr_alive.clone();
        let ocr_fail_w = ocr_failures.clone();
        let ocr_hits_w = ocr_cache_hits.clone();
        let ocr_misses_w = ocr_cache_misses.clone();
        let ocr_rx_w = ocr_rx.clone();
        thread::Builder::new()
            .name("entropy-ocr-engine".into())
            .spawn(move || {
                ocr_worker_loop(
                    ocr_rx_w,
                    ocr_models,
                    ocr_params,
                    backend,
                    status_for_worker,
                    vocab_for_worker,
                    ocr_alive_w,
                    ocr_fail_w,
                    ocr_hits_w,
                    ocr_misses_w,
                )
            })
            .map_err(|e| AppError::Io(format!("启动 OCR 引擎线程失败: {}", e)))?;
        Ok(Self {
            asr_tx,
            ocr_tx,
            asr_rx: Some(asr_rx),
            ocr_rx: Some(ocr_rx),
            ocr_device_status,
            ocr_calibrating: Arc::new(AtomicBool::new(false)),
            asr_alive,
            ocr_alive,
            asr_failures,
            ocr_failures,
            ocr_cache_hits,
            ocr_cache_misses,
            rescore_timeouts,
        })
    }

    /// 测试用空池（任何请求立即失败；仅用于不触引擎的路径单测）。
    #[cfg(test)]
    pub fn dummy() -> Self {
        let (asr_tx, _) = mpsc::channel::<AsrRequest>();
        let (ocr_tx, _) = mpsc::channel::<OcrRequest>();
        Self::assemble(asr_tx, ocr_tx)
    }

    /// 测试用：注入自建 ASR 通道（receiver 由调用方持活——
    /// send 成功、recv 超时路径可测；见 transcribe_pcm_timeout 超时计数单测）。
    #[cfg(test)]
    pub fn with_asr_channel(asr_tx: Sender<AsrRequest>) -> Self {
        let (ocr_tx, _) = mpsc::channel::<OcrRequest>();
        Self::assemble(asr_tx, ocr_tx)
    }

    /// 测试用：注入自建 OCR 通道（receiver 由调用方持活——超时变体单测专用）。
    #[cfg(test)]
    pub fn with_ocr_channel(ocr_tx: Sender<OcrRequest>) -> Self {
        let (asr_tx, _) = mpsc::channel::<AsrRequest>();
        Self::assemble(asr_tx, ocr_tx)
    }

    /// 测试装配：计数/状态 Arc 全部归零或默认（start 与测试构造共用，避免重复）。
    #[cfg(test)]
    fn assemble(asr_tx: Sender<AsrRequest>, ocr_tx: Sender<OcrRequest>) -> Self {
        Self {
            asr_tx,
            ocr_tx,
            // 测试池不共享 receiver（dummy 需保持 receiver 已 drop 的"立即失败"语义）
            asr_rx: None,
            ocr_rx: None,
            ocr_device_status: Arc::new(Mutex::new(OcrDeviceStatus::new(
                crate::device_config::OcrDeviceMode::Auto,
                OcrBackend::Cpu,
                None,
            ))),
            ocr_calibrating: Arc::new(AtomicBool::new(false)),
            asr_alive: Arc::new(AtomicBool::new(true)),
            ocr_alive: Arc::new(AtomicBool::new(true)),
            asr_failures: Arc::new(AtomicU64::new(0)),
            ocr_failures: Arc::new(AtomicU64::new(0)),
            ocr_cache_hits: Arc::new(AtomicU64::new(0)),
            ocr_cache_misses: Arc::new(AtomicU64::new(0)),
            rescore_timeouts: Arc::new(AtomicU64::new(0)),
        }
    }

    /// OCR 设备当前状态（命令层读；worker 写；校准标记实时合并）。
    pub fn ocr_device_status(&self) -> OcrDeviceStatus {
        let mut s = self
            .ocr_device_status
            .lock()
            .map(|s| s.clone())
            .unwrap_or_else(|_| {
                OcrDeviceStatus::new(
                    crate::device_config::OcrDeviceMode::Auto,
                    OcrBackend::Cpu,
                    None,
                )
            });
        s.calibrating = self.ocr_calibrating.load(Ordering::SeqCst);
        s
    }

    /// 申请校准标记并返回 RAII guard（drop 时自动释放；申请失败返回 None）。
    ///
    /// @ai-context: 修复（v0.4.0 发布审查）：原手动 ocr_end_calibrate 在校准线程
    ///              panic 时标记卡死（前端永久"校准中"），guard 保证成功/失败/
    ///              panic 三条退出路径都释放。
    pub fn ocr_try_begin_calibrate_guard(&self) -> Option<CalibrateGuard> {
        if self.ocr_calibrating.swap(true, Ordering::SeqCst) {
            return None;
        }
        Some(CalibrateGuard { flag: self.ocr_calibrating.clone() })
    }

    /// M7/REQ-042：巡检读数（线程心跳 + 失败计数 + 缓存命中率）。
    pub fn liveness(&self) -> (bool, bool) {
        (self.asr_alive.load(Ordering::Relaxed), self.ocr_alive.load(Ordering::Relaxed))
    }

    pub fn failure_counts(&self) -> (u64, u64) {
        (self.asr_failures.load(Ordering::Relaxed), self.ocr_failures.load(Ordering::Relaxed))
    }

    pub fn ocr_cache_counts(&self) -> (u64, u64) {
        (self.ocr_cache_hits.load(Ordering::Relaxed), self.ocr_cache_misses.load(Ordering::Relaxed))
    }

    /// REQ-100（v0.7.0 M1）：SenseVoice 重打分超时计数（质量报告 rescore_timeouts 数据源）。
    pub fn rescore_timeout_count(&self) -> u64 {
        self.rescore_timeouts.load(Ordering::Relaxed)
    }

    /// 转写音频（阻塞等待 ASR 线程返回）。
    /// @ai-context: H2 修复后调用方均已切换 *_timeout 变体；保留此阻塞原语
    ///              以维持引擎池公共 API 兼容（外部/未来调用方可选无界等待）。
    #[allow(dead_code)]
    pub fn transcribe(&self, path: &str) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.asr_tx
            .send(AsrRequest::Transcribe { path: path.to_string(), reply })
            .map_err(|_| AppError::Asr("ASR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Asr("ASR 引擎线程未返回结果".to_string()))?
    }

    /// 转写音频（**有界等待**变体，H2 修复）：超时返回 Err，调用方可诊断/降级。
    ///
    /// @ai-context: 原 transcribe 为裸 rx.recv()——引擎线程卡死时调用方永久阻塞
    ///              （导入管线/命令层均受累）；原接口保留不破坏调用方，
    ///              新调用点应使用本变体。不计数 rescore_timeouts（那是
    ///              流式重打分专用降级指标，与文件转写语义不同）。
    pub fn transcribe_timeout(&self, path: &str, timeout: std::time::Duration) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.asr_tx
            .send(AsrRequest::Transcribe { path: path.to_string(), reply })
            .map_err(|_| AppError::Asr("ASR 引擎线程已退出".to_string()))?;
        rx.recv_timeout(timeout).map_err(|_| {
            self.drain_asr_backlog();
            AppError::Asr(format!("ASR 转写超时（{}s 未返回，引擎可能卡死）", timeout.as_secs()))
        })?
    }

    /// 转写 PCM 内存样本（SenseVoice 重打分/分窗转写，阻塞等待 ASR 线程返回）。
    pub fn transcribe_pcm(&self, samples: &[f32], sample_rate: i32) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.asr_tx
            .send(AsrRequest::TranscribePcm {
                samples: samples.to_vec(),
                sample_rate,
                reply,
            })
            .map_err(|_| AppError::Asr("ASR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Asr("ASR 引擎线程未返回结果".to_string()))?
    }

    /// 转写 PCM 内存样本（**有界等待**——超时返回 Err，调用方走降级）。
    ///
    /// @ai-context: 2026-08-19 取优整合：流式链路 maybe_rescore 的同步等待改为
    ///              有界——推理环境异常（CPU 竞争/引擎卡顿）时 ASR 主循环不得
    ///              被无限阻塞（阻塞 → 音频块积压 → 停止时积压丢弃 = 内容缺失，
    ///              会话 22 类问题兜底）；超时后结果丢弃（worker 侧 send 失败
    ///              自然忽略，无泄漏）。
    pub fn transcribe_pcm_timeout(
        &self,
        samples: &[f32],
        sample_rate: i32,
        timeout: std::time::Duration,
    ) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.asr_tx
            .send(AsrRequest::TranscribePcm {
                samples: samples.to_vec(),
                sample_rate,
                reply,
            })
            .map_err(|_| AppError::Asr("ASR 引擎线程已退出".to_string()))?;
        rx.recv_timeout(timeout)
            .map_err(|_| {
                // REQ-100（v0.7.0 M1）：有界等待超时/通道断开 = 重打分未在期限内返回，
                // 调用方走降级（保留 Zipformer 流式结果）——计数该降级事件，
                // 质量报告 rescore_timeouts 由此变真实（此前恒 0）。
                self.rescore_timeouts.fetch_add(1, Ordering::Relaxed);
                // 三维复审 #5：同 transcribe_timeout——超时后排空 ASR 队列积压
                self.drain_asr_backlog();
                AppError::Asr("SenseVoice 重打分超时（降级保留流式结果）".to_string())
            })?
    }

    /// 识别图片（阻塞等待 OCR 线程返回）。
    /// @ai-context: 保留理由同 transcribe——阻塞原语，调用方已切 recognize_timeout。
    #[allow(dead_code)]
    pub fn recognize(&self, path: &str) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::Recognize { path: path.to_string(), reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Ocr("OCR 引擎线程未返回结果".to_string()))?
    }

    /// 识别图片（**有界等待**变体，H2 修复）：超时返回 Err，调用方可诊断/降级。
    /// @ai-context: 同 transcribe_timeout——裸 recv 在 OCR 引擎卡死时永久阻塞调用方。
    pub fn recognize_timeout(&self, path: &str, timeout: std::time::Duration) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::Recognize { path: path.to_string(), reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv_timeout(timeout).map_err(|_| {
            self.drain_ocr_backlog();
            AppError::Ocr(format!("OCR 识别超时（{}s 未返回，引擎可能卡死）", timeout.as_secs()))
        })?
    }

    /// 识别内存图像（TD-025：实时链路免磁盘临时文件，阻塞等待 OCR 线程返回）。
    /// @ai-context: 保留理由同 transcribe——阻塞原语，调用方已切 recognize_image_timeout。
    #[allow(dead_code)]
    pub fn recognize_image(&self, image: image::RgbImage) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::RecognizeImage { image, reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Ocr("OCR 引擎线程未返回结果".to_string()))?
    }

    /// 识别内存图像（**有界等待**变体，H2 修复）：实时热路径专用——
    /// 超时返回 Err，调用方计入错误统计并继续下一帧（降级不阻塞）。
    /// @ai-context: 屏幕捕获帧处理是持续热路径，单帧裸 recv 卡死会冻结整条
    ///              OCR 管线（后续帧全部排队等待）——超时变体是结构性防御。
    pub fn recognize_image_timeout(
        &self,
        image: image::RgbImage,
        timeout: std::time::Duration,
    ) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::RecognizeImage { image, reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv_timeout(timeout).map_err(|_| {
            self.drain_ocr_backlog();
            AppError::Ocr(format!("OCR 识别超时（{}s 未返回，引擎可能卡死）", timeout.as_secs()))
        })?
    }

    /// 行级重识别（v0.14 D 净化链 ②：疑碎行裁剪图批量 rec；有界等待同 OCR 单图）。
    ///
    /// @ai-context: 调用方（photo_capture 源头净化）裁剪行图后整批提交——rec 引擎
    ///              批量推理（supports_batching）；超时/引擎不可用 → Err（调用方
    ///              保留原结果，能力降级不失效）。
    pub fn recognize_lines_timeout(
        &self,
        crops: Vec<image::RgbImage>,
        timeout: std::time::Duration,
    ) -> Result<Vec<crate::line_rec_engine::LineRecResult>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::RecognizeLines { crops, reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv_timeout(timeout).map_err(|_| {
            self.drain_ocr_backlog();
            AppError::Ocr(format!("行级重识别超时（{}s 未返回，引擎可能卡死）", timeout.as_secs()))
        })?
    }

    /// 超时后排空 ASR 请求队列积压（三维复审 #5，best-effort）。
    ///
    /// @ai-context: Why——worker 串行处理，调用方超时后已入队请求无法取消；
    ///              过期请求在引擎恢复后被"追赶"处理只延长陈旧状态。
    ///              排空逐个回复 Err（等待中的其他调用方立即得到可诊断错误，
    ///              而非裸等到自己的超时）。
    /// @ai-context: 竞态说明——排空期间其他调用方可能并发入队，try_recv 只排
    ///              此刻已在队列中的（尽力而为）；漏网的请求或被下次超时再排，
    ///              或被 worker 正常处理（晚到回复 send 失败自然忽略），可接受。
    fn drain_asr_backlog(&self) {
        let Some(rx) = self.asr_rx.as_ref() else { return };
        let guard = rx.lock().unwrap_or_else(|p| p.into_inner());
        while let Ok(req) = guard.try_recv() {
            let reply = match req {
                AsrRequest::Transcribe { reply, .. } | AsrRequest::TranscribePcm { reply, .. } => reply,
            };
            let _ = reply.send(Err(AppError::Asr("ASR 请求已废弃（调用方超时，积压排空）".to_string())));
        }
    }

    /// 超时后排空 OCR 请求队列积压（三维复审 #5，best-effort）。
    ///
    /// @ai-context: Why——OCR 串行队列积压的是过期帧（每帧一份 RgbImage，
    ///              内存线性增长）；不排空则引擎恢复后追赶积压 = 内存峰值 +
    ///              陈旧结果连环返回。语义与竞态说明同 drain_asr_backlog。
    fn drain_ocr_backlog(&self) {
        let Some(rx) = self.ocr_rx.as_ref() else { return };
        let guard = rx.lock().unwrap_or_else(|p| p.into_inner());
        while let Ok(req) = guard.try_recv() {
            match req {
                OcrRequest::Recognize { reply, .. } | OcrRequest::RecognizeImage { reply, .. } => {
                    let _ = reply.send(Err(AppError::Ocr("OCR 请求已废弃（调用方超时，积压排空）".to_string())));
                }
                OcrRequest::RecognizeLines { reply, .. } => {
                    let _ = reply.send(Err(AppError::Ocr("行级重识别请求已废弃（调用方超时，积压排空）".to_string())));
                }
            }
        }
    }
}

/// EnginePool → LineRecognizer 适配（photo_capture 源头净化注入；超时同 OCR 单图）。
///
/// @ai-context: v0.14 D——line_rec_engine 编排层经 trait 注入识别器；生产实现
///              走引擎池请求（rec 模型由 OCR worker 懒构建持有——FFI 线程约束
///              与主 OCR 同架构规避）。
pub struct PoolLineRecognizer {
    pool: EnginePool,
    timeout: std::time::Duration,
}

impl PoolLineRecognizer {
    pub fn new(pool: &EnginePool) -> Self {
        Self {
            pool: pool.clone(),
            timeout: OCR_REQUEST_TIMEOUT,
        }
    }
}

impl crate::line_rec_engine::LineRecognizer for PoolLineRecognizer {
    fn recognize_lines(
        &self,
        crops: &[image::RgbImage],
    ) -> Result<Vec<crate::line_rec_engine::LineRecResult>> {
        self.pool.recognize_lines_timeout(crops.to_vec(), self.timeout)
    }
}

/// 校准标记 RAII guard（drop 时释放；防 panic 路径卡死校准标记）。
pub struct CalibrateGuard {
    flag: Arc<AtomicBool>,
}

impl Drop for CalibrateGuard {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

/// 单测（AAA 模式；只测有界等待超时计数——重打分降级事件不再是恒 0）。
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcribe_pcm_timeout_counts_timeout_on_bounded_wait() {
        // Arrange：持活 receiver 的通道——send 成功、recv 必超时（无 worker 应答）
        let (asr_tx, _asr_rx) = mpsc::channel::<AsrRequest>();
        let pool = EnginePool::with_asr_channel(asr_tx);
        // Act：有界等待 10ms → 超时 Err
        let result = pool.transcribe_pcm_timeout(&[0.0_f32], 16_000, std::time::Duration::from_millis(10));
        // Assert：Err 且超时计数 +1（正常应答路径不计数）
        assert!(result.is_err());
        assert_eq!(pool.rescore_timeout_count(), 1);
    }

    #[test]
    fn recognize_image_timeout_returns_err_on_bounded_wait() {
        // Arrange：持活 receiver 的 OCR 通道——send 成功、recv 必超时（无 worker 应答）
        let (ocr_tx, _ocr_rx) = mpsc::channel::<OcrRequest>();
        let pool = EnginePool::with_ocr_channel(ocr_tx);
        let img = image::RgbImage::new(4, 4);
        // Act：有界等待 10ms → 超时 Err
        let result = pool.recognize_image_timeout(img, std::time::Duration::from_millis(10));
        // Assert：Err（超时变体不阻塞、可诊断）
        assert!(result.is_err());
    }
}
