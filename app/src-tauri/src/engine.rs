//! 常驻引擎池：ASR/OCR 双 worker 线程（v0.3.0 优化，ADR-008 A3）。
//!
//! @ai-context: 第三方推理引擎（sherpa OfflineRecognizer / oar-ocr OAROCR）不保证 Send/Sync，
//!              专用线程独占持有可完全规避跨线程约束，同时实现模型常驻（消除每次调用 1-3 秒加载）。
//! @ai-context: 拆分动机（技术审查 A3）：原单线程串行处理 ASR/OCR 两类请求——实时链路中
//!              OCR 推理阻塞 SenseVoice 重打分、反之亦然；文件导入（v0.3.0）的长转写会整段
//!              阻塞实时 OCR。拆双线程后两路并行，各线程只加载自己的模型（内存不翻倍）。
//! @ai-context: 外部经 EnginePool（内部仅两个 channel sender，可廉价 Clone）同步发请求等结果。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::asr::{AsrEngine, AsrModels};
use crate::device_config::{OcrBackend, OcrDeviceStatus};
use crate::error::{AppError, Result};
use crate::ocr::{OcrEngine, OcrModels, OcrParams};
use crate::types::{OcrBlock, TranscriptSegment};
use crate::vocab::{apply_replacements, VocabStore};

/// ASR 引擎请求（reply channel 回传结果）。
enum AsrRequest {
    Transcribe {
        path: String,
        reply: Sender<Result<TranscriptSegment>>,
    },
    /// 流式端点句的 SenseVoice 整句重打分（ADR-003 §5）
    TranscribePcm {
        samples: Vec<f32>,
        sample_rate: i32,
        reply: Sender<Result<TranscriptSegment>>,
    },
}

/// OCR 引擎请求。
enum OcrRequest {
    Recognize {
        path: String,
        reply: Sender<Result<Vec<OcrBlock>>>,
    },
    /// 内存图像 OCR（TD-025：实时链路免磁盘临时文件；image::RgbImage 为纯数据，可跨线程）
    RecognizeImage {
        image: image::RgbImage,
        reply: Sender<Result<Vec<OcrBlock>>>,
    },
}

/// 引擎池句柄（Clone 仅复制请求 channel，开销极低）。
#[derive(Clone)]
pub struct EnginePool {
    asr_tx: Sender<AsrRequest>,
    ocr_tx: Sender<OcrRequest>,
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
        let asr_alive = Arc::new(AtomicBool::new(true));
        let ocr_alive = Arc::new(AtomicBool::new(true));
        let asr_failures = Arc::new(AtomicU64::new(0));
        let ocr_failures = Arc::new(AtomicU64::new(0));
        let ocr_cache_hits = Arc::new(AtomicU64::new(0));
        let ocr_cache_misses = Arc::new(AtomicU64::new(0));
        let asr_alive_w = asr_alive.clone();
        let asr_fail_w = asr_failures.clone();
        thread::Builder::new()
            .name("entropy-asr-engine".into())
            .spawn(move || asr_worker_loop(asr_rx, asr_models, asr_alive_w, asr_fail_w))
            .map_err(|e| AppError::Io(format!("启动 ASR 引擎线程失败: {}", e)))?;
        let status_for_worker = ocr_device_status.clone();
        let vocab_for_worker = vocab.clone();
        let ocr_alive_w = ocr_alive.clone();
        let ocr_fail_w = ocr_failures.clone();
        let ocr_hits_w = ocr_cache_hits.clone();
        let ocr_misses_w = ocr_cache_misses.clone();
        thread::Builder::new()
            .name("entropy-ocr-engine".into())
            .spawn(move || {
                ocr_worker_loop(
                    ocr_rx,
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
            ocr_device_status,
            ocr_calibrating: Arc::new(AtomicBool::new(false)),
            asr_alive,
            ocr_alive,
            asr_failures,
            ocr_failures,
            ocr_cache_hits,
            ocr_cache_misses,
        })
    }

    /// 测试用空池（任何请求立即失败；仅用于不触引擎的路径单测）。
    #[cfg(test)]
    pub fn dummy() -> Self {
        let (asr_tx, _) = mpsc::channel::<AsrRequest>();
        let (ocr_tx, _) = mpsc::channel::<OcrRequest>();
        Self {
            asr_tx,
            ocr_tx,
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

    /// 占用/释放校准标记（成功占用返回 true）。
    pub fn ocr_try_begin_calibrate(&self) -> bool {
        !self.ocr_calibrating.swap(true, Ordering::SeqCst)
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

    pub fn ocr_end_calibrate(&self) {
        self.ocr_calibrating.store(false, Ordering::SeqCst);
    }

    /// 转写音频（阻塞等待 ASR 线程返回）。
    pub fn transcribe(&self, path: &str) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.asr_tx
            .send(AsrRequest::Transcribe { path: path.to_string(), reply })
            .map_err(|_| AppError::Asr("ASR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Asr("ASR 引擎线程未返回结果".to_string()))?
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

    /// 识别图片（阻塞等待 OCR 线程返回）。
    pub fn recognize(&self, path: &str) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::Recognize { path: path.to_string(), reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Ocr("OCR 引擎线程未返回结果".to_string()))?
    }

    /// 识别内存图像（TD-025：实时链路免磁盘临时文件，阻塞等待 OCR 线程返回）。
    pub fn recognize_image(&self, image: image::RgbImage) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.ocr_tx
            .send(OcrRequest::RecognizeImage { image, reply })
            .map_err(|_| AppError::Ocr("OCR 引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Ocr("OCR 引擎线程未返回结果".to_string()))?
    }
}

/// M5/REQ-040：替换词纠错（纯函数；空表原样返回）。
fn correct_blocks(blocks: Vec<OcrBlock>, pairs: Option<&[crate::vocab::ReplacePair]>) -> Vec<OcrBlock> {
    let Some(pairs) = pairs else { return blocks };
    if pairs.is_empty() {
        return blocks;
    }
    blocks
        .into_iter()
        .map(|mut b| {
            b.text = apply_replacements(&b.text, pairs);
            b
        })
        .collect()
}

/// ASR 线程主循环：启动即加载模型，随后顺序处理请求（引擎天然串行，无需加锁）。
fn asr_worker_loop(
    rx: Receiver<AsrRequest>,
    asr_models: AsrModels,
    alive: Arc<AtomicBool>,
    failures: Arc<AtomicU64>,
) {
    let mut asr = AsrEngine::load(&asr_models);
    for req in rx {
        alive.store(true, Ordering::Relaxed);
        // 解构请求与 reply 通道（reply 随匹配臂带出，统一回传）
        let (result, reply) = match req {
            AsrRequest::Transcribe { path, reply } => {
                let result = match asr.as_mut() {
                    Ok(engine) => engine.transcribe(&path),
                    Err(_) => Err(AppError::Asr("ASR 引擎加载失败（请检查模型文件是否就绪）".to_string())),
                };
                (result, reply)
            }
            AsrRequest::TranscribePcm { samples, sample_rate, reply } => {
                let result = match asr.as_mut() {
                    Ok(engine) => engine.transcribe_pcm(&samples, sample_rate),
                    Err(_) => Err(AppError::Asr("ASR 引擎加载失败（请检查模型文件是否就绪）".to_string())),
                };
                (result, reply)
            }
        };
        if result.is_err() {
            failures.fetch_add(1, Ordering::Relaxed);
        }
        let _ = reply.send(result);
    }
}

/// OCR 线程主循环：启动即加载模型，随后顺序处理请求。
///
/// @ai-context: ADR-009——加载成功后把实际后端/回退原因回写共享状态（命令层可查）；
///              加载失败同样回写（actual 保持请求值、fallback_reason 记录失败）。
/// @ai-context: 参数多为编排上下文传递（模型/后端/状态/词表/巡检计数），
///              聚合会破坏内聚，登记 clippy 豁免（M7 巡检计数接入后 10 参）。
#[allow(clippy::too_many_arguments)]
fn ocr_worker_loop(
    rx: Receiver<OcrRequest>,
    ocr_models: OcrModels,
    ocr_params: OcrParams,
    backend: OcrBackend,
    device_status: Arc<Mutex<OcrDeviceStatus>>,
    vocab: Option<Arc<Mutex<VocabStore>>>,
    alive: Arc<AtomicBool>,
    failures: Arc<AtomicU64>,
    cache_hits: Arc<AtomicU64>,
    cache_misses: Arc<AtomicU64>,
) {
    // @ai-context: OCR 首次构建可能触发 ModelScope 模型下载，耗时较长但在后台线程不影响 UI。
    let mut ocr = OcrEngine::load(&ocr_models, &ocr_params, backend);
    // @ai-context: 加载失败此前静默（仅首次识别时报错），排查"会话无 OCR"无法定位——
    //              启动即打印结果，加载失败可观测（与 ASR 引擎同口径）。
    match &ocr {
        Ok(engine) => {
            eprintln!(
                "[Engine] OCR 引擎加载成功（{}，后端 {:?}{}）",
                ocr_models.det,
                engine.backend,
                engine
                    .fallback_reason
                    .as_ref()
                    .map(|r| format!("，回退原因: {}", r))
                    .unwrap_or_default()
            );
            if let Ok(mut s) = device_status.lock() {
                s.actual = engine.backend;
                s.fallback_reason = engine.fallback_reason.clone();
            }
        }
        Err(e) => {
            eprintln!("[Engine] OCR 引擎加载失败: {}", e);
            if let Ok(mut s) = device_status.lock() {
                s.fallback_reason = Some(format!("OCR 引擎加载失败: {}", e));
            }
        }
    }
    // M4/REQ-039 E5：OCR 结果 LRU 缓存（A→B→A 帧往返零推理；worker 独占）
    let mut ocr_cache = crate::ocr_cache::OcrCache::new();
    // M5/REQ-040：替换词纠错（识别结果按共享词表修正，缓存存修正后结果）
    let vocab_pairs: Option<Vec<crate::vocab::ReplacePair>> =
        vocab.as_ref().and_then(|v| v.lock().ok()).map(|v| v.replacements.clone());
    for req in rx {
        alive.store(true, Ordering::Relaxed);
        let (result, reply) = match req {
            OcrRequest::Recognize { path, reply } => {
                let result = match ocr.as_mut() {
                    Ok(engine) => engine.recognize(&path).map(|blocks| correct_blocks(blocks, vocab_pairs.as_deref())),
                    Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
                };
                (result, reply)
            }
            OcrRequest::RecognizeImage { image, reply } => {
                // E5：区域感知哈希（8×8 aHash）→ 命中直接返回缓存（零推理）
                let key = crate::ocr_cache::average_hash(&image);
                let result = match ocr_cache.get(key) {
                    Some(blocks) => {
                        cache_hits.fetch_add(1, Ordering::Relaxed);
                        Ok(blocks)
                    }
                    None => {
                        cache_misses.fetch_add(1, Ordering::Relaxed);
                        match ocr.as_mut() {
                            Ok(engine) => match engine.recognize_image(image) {
                                Ok(blocks) => {
                                    let corrected = correct_blocks(blocks, vocab_pairs.as_deref());
                                    ocr_cache.put(key, corrected.clone());
                                    Ok(corrected)
                                }
                                Err(e) => Err(e),
                            },
                            Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
                        }
                    }
                };
                (result, reply)
            }
        };
        if result.is_err() {
            failures.fetch_add(1, Ordering::Relaxed);
        }
        let _ = reply.send(result);
    }
    // 退出时打印缓存统计（M7 诊断面板数据源；开发期日志）
    let (hits, misses) = ocr_cache.stats();
    eprintln!("[Engine] OCR 缓存退出统计: 命中 {} 未命中 {}（命中率 {:.0}%）", hits, misses, {
        let total = hits + misses;
        if total == 0 { 0.0 } else { hits as f64 * 100.0 / total as f64 }
    });
}
