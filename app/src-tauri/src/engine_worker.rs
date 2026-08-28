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
use crate::line_rec_engine::LineRecognizer;
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
    /// v0.14 D：行级重识别（净化链 ② 源头执行——疑碎行裁剪图批量 rec）
    RecognizeLines {
        crops: Vec<image::RgbImage>,
        reply: Sender<Result<Vec<crate::line_rec_engine::LineRecResult>>>,
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
                // v0.12.1：engine_ready 与 actual/fallback_reason 一起回写——
                // 前端就绪判定必须用 engine_ready，不得用线程心跳（活 ≠ 引擎就绪）
                s.actual = engine.backend;
                s.engine_ready = true;
                s.fallback_reason = engine.fallback_reason.clone();
            }
        }
        Err(e) => {
            eprintln!("[Engine] OCR 引擎加载失败: {}", e);
            if let Ok(mut s) = device_status.lock() {
                // v0.12.1：失败显式回写 engine_ready=false（加载中的初始值也是 false，
                // 重启场景仍显式置位，防未来复用旧状态）；附可行动提示——
                // auto-download 已恢复，重启应用即重试 ModelScope 缓存命中/下载
                s.engine_ready = false;
                s.fallback_reason =
                    Some(format!("OCR 引擎加载失败: {}（模型缺失或下载失败——重启应用自动重试）", e));
            }
        }
    }
    // M4/REQ-039 E5：OCR 结果 LRU 缓存（A→B→A 帧往返零推理；worker 独占）
    let mut ocr_cache = crate::ocr_cache::OcrCache::new();
    // v0.14 D：行级重识别引擎（懒构建——首个 RecognizeLines 请求时加载 rec 模型；
    // 构建失败保持 None → 每次请求 Err 降级，净化链保留碎片——能力降级不失效）
    let mut rec_engine: Option<crate::line_rec_engine::RecLineEngine> = None;
    // M5/REQ-040：替换词纠错——缓存只存**原始识别结果**，纠错在返回路径统一应用：
    // ①运行期新增替换词即时生效（TD-048 修复，与热词同模式）；②词表变更后
    // 缓存命中仍得到新纠错（无陈旧纠错结果残留）
    while let Some(req) = next_request(&rx) {
        alive.store(true, Ordering::Relaxed);
        match req {
            // v0.14 D：行级重识别（返回类型与全图 OCR 不同——独立分支处理）
            OcrRequest::RecognizeLines { crops, reply } => {
                // 懒构建：首个请求时加载 rec 模型（与主 OCR 同后端口径）；
                // 失败打印原因并保持 None——每次请求 Err（净化链保留碎片）
                if rec_engine.is_none() {
                    ensure_rec_engine(&mut rec_engine, &ocr_models, backend);
                }
                let result = match rec_engine.as_ref() {
                    Some(e) => e.recognize_lines(&crops),
                    None => Err(AppError::Ocr(
                        "行级重识别引擎不可用（rec 模型加载失败——净化链 ② 降级保留碎片）".to_string(),
                    )),
                };
                if result.is_err() {
                    failures.fetch_add(1, Ordering::Relaxed);
                }
                let _ = reply.send(result);
            }
            other => {
                let (result, reply) = match other {
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
                    // 外层 match 已分流 RecognizeLines（返回类型不同）——逻辑不可达；
                    // 防御（审查 L2）：即使可达也不得以裸 return 退出主循环（会
                    // 静默终止整个 OCR worker，后续请求全部失败）——跳过继续
                    OcrRequest::RecognizeLines { reply, .. } => {
                        let _ = reply.send(Err(AppError::Ocr("行级重识别请求分流失效".to_string())));
                        continue;
                    }
                };
                if result.is_err() {
                    failures.fetch_add(1, Ordering::Relaxed);
                }
                let _ = reply.send(result);
            }
        }
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

/// 懒构建行级重识别引擎（首个 RecognizeLines 请求时；失败打印原因并保持
/// None——降级可观测，净化链保留碎片不失效）。
///
/// @ai-context: v0.14 D——复用主 OCR 的 rec 模型/字典与 EP 注入（同后端口径，
///              CUDA 构建失败回退 CPU 的语义由 ort_config_for 保证）。
fn ensure_rec_engine(
    slot: &mut Option<crate::line_rec_engine::RecLineEngine>,
    models: &OcrModels,
    backend: OcrBackend,
) {
    if slot.is_some() {
        return;
    }
    match crate::line_rec_engine::RecLineEngine::build(
        &models.rec,
        &models.dict,
        crate::ocr::ort_config_for(backend).ok().flatten(),
    ) {
        Ok(engine) => *slot = Some(engine),
        Err(e) => eprintln!("[Engine] 行级重识别引擎构建失败（净化链 ② 降级保留碎片）: {}", e),
    }
}
