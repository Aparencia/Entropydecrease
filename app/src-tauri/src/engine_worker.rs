//! 引擎 worker 线程：ASR/OCR 双线程主循环与请求协议（engine.rs 拆分产物）。
//!
//! @ai-context: 拆分动机（三维复审 #9 + 豁免登记计划）：engine.rs 在接入超时排空
//!              机制（三维复审 #5）后逼近 600 行硬拆线，按 line-limit-exemptions
//!              登记的拆分计划把 worker 循环与请求处理拆至本文件——
//!              engine.rs 保留 EnginePool 句柄与同步 API。
//! @ai-context: 请求通道 receiver 与 EnginePool 经 Arc<Mutex> 共享（非 worker 独占）：
//!              调用方超时后可 try_recv 尽力排空已积压的过期请求（best-effort），
//!              防止串行队列在引擎恢复后追赶过期帧（OCR 每帧一份 RgbImage，
//!              积压即内存线性增长——三维复审 #5）。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};

use crate::asr::{AsrEngine, AsrModels};
use crate::device_config::OcrBackend;
use crate::error::{AppError, Result};
use crate::ocr::{OcrEngine, OcrModels, OcrParams};
use crate::types::{OcrBlock, TranscriptSegment};
use crate::vocab::{apply_replacements, VocabStore};

/// ASR 引擎请求（reply channel 回传结果）。
pub(crate) enum AsrRequest {
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
pub(crate) enum OcrRequest {
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

/// 从共享 receiver 取下一个请求（worker 与排空方共用同一把锁）。
///
/// @ai-context: Why 不用裸 recv 持锁阻塞：排空方（EnginePool 超时路径）需要
///              获得同一把锁做 try_recv；worker 若持锁裸 recv 会饿死排空方。
///              改为 100ms 有界等待 + 周期性放锁——排空方最多等一个周期即可入内，
///              对 worker 吞吐无感知影响（请求到达即被取走）。
/// @returns Disconnected（所有 sender 已 drop，引擎池销毁）→ None，worker 退出。
fn next_request<T>(rx: &Arc<Mutex<Receiver<T>>>) -> Option<T> {
    loop {
        let res = {
            let guard = rx.lock().unwrap_or_else(|p| p.into_inner());
            guard.recv_timeout(std::time::Duration::from_millis(100))
        };
        match res {
            Ok(req) => return Some(req),
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => return None,
        }
    }
}

/// 引擎心跳守卫（TD-045 修复）：worker 线程无论正常退出还是 panic，
/// 只要本守卫被 drop，心跳即置 false——health_status 才能真实反映线程存活。
struct AliveGuard(Arc<AtomicBool>);

impl Drop for AliveGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
    }
}

/// ASR 线程主循环：启动即加载模型，随后顺序处理请求（引擎天然串行，无需加锁）。
pub(crate) fn asr_worker_loop(
    rx: Arc<Mutex<Receiver<AsrRequest>>>,
    asr_models: AsrModels,
    alive: Arc<AtomicBool>,
    failures: Arc<AtomicU64>,
) {
    let _alive_guard = AliveGuard(alive.clone());
    let mut asr = AsrEngine::load(&asr_models);
    while let Some(req) = next_request(&rx) {
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
pub(crate) fn ocr_worker_loop(
    rx: Arc<Mutex<Receiver<OcrRequest>>>,
    ocr_models: OcrModels,
    ocr_params: OcrParams,
    backend: OcrBackend,
    device_status: Arc<Mutex<crate::device_config::OcrDeviceStatus>>,
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
    // M5/REQ-040：替换词纠错——缓存只存**原始识别结果**，纠错在返回路径统一应用：
    // ①运行期新增替换词即时生效（TD-048 修复，与热词同模式）；②词表变更后
    // 缓存命中仍得到新纠错（无陈旧纠错结果残留）
    while let Some(req) = next_request(&rx) {
        alive.store(true, Ordering::Relaxed);
        let (result, reply) = match req {
            OcrRequest::Recognize { path, reply } => {
                let result = match ocr.as_mut() {
                    Ok(engine) => {
                        let pairs = current_replacements(&vocab);
                        engine
                            .recognize(&path)
                            .map(|blocks| correct_blocks(blocks, pairs.as_deref()))
                    }
                    Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
                };
                (result, reply)
            }
            OcrRequest::RecognizeImage { image, reply } => {
                let result: Result<Vec<OcrBlock>> = match ocr.as_mut() {
                    Ok(engine) => {
                        // E5：区域感知哈希（8×8 aHash）→ 命中直接返回缓存（零推理）
                        let key = crate::ocr_cache::average_hash(&image);
                        let raw = match ocr_cache.get(key) {
                            Some(blocks) => {
                                cache_hits.fetch_add(1, Ordering::Relaxed);
                                Ok(blocks)
                            }
                            None => {
                                cache_misses.fetch_add(1, Ordering::Relaxed);
                                match engine.recognize_image(image) {
                                    Ok(blocks) => {
                                        // 只缓存原始结果（纠错在返回路径统一应用，
                                        // 词表变更后命中缓存仍得新纠错——TD-048）
                                        ocr_cache.put(key, blocks.clone());
                                        Ok(blocks)
                                    }
                                    Err(e) => Err(e),
                                }
                            }
                        };
                        // TD-048：每次请求读取最新替换词（运行期新增即时生效）
                        raw.map(|blocks| {
                            let pairs = current_replacements(&vocab);
                            correct_blocks(blocks, pairs.as_deref())
                        })
                    }
                    Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
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

/// 读取当前替换词表（TD-048 修复：请求循环内重读，运行期变更即时生效；
/// 锁中毒回退 None——与热词读取同口径）。
fn current_replacements(vocab: &Option<Arc<Mutex<VocabStore>>>) -> Option<Vec<crate::vocab::ReplacePair>> {
    vocab
        .as_ref()
        .and_then(|v| v.lock().ok())
        .map(|v| v.replacements.clone())
}
