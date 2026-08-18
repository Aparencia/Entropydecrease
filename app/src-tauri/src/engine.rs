//! 常驻引擎池：ASR/OCR 双 worker 线程（v0.3.0 优化，ADR-008 A3）。
//!
//! @ai-context: 第三方推理引擎（sherpa OfflineRecognizer / oar-ocr OAROCR）不保证 Send/Sync，
//!              专用线程独占持有可完全规避跨线程约束，同时实现模型常驻（消除每次调用 1-3 秒加载）。
//! @ai-context: 拆分动机（技术审查 A3）：原单线程串行处理 ASR/OCR 两类请求——实时链路中
//!              OCR 推理阻塞 SenseVoice 重打分、反之亦然；文件导入（v0.3.0）的长转写会整段
//!              阻塞实时 OCR。拆双线程后两路并行，各线程只加载自己的模型（内存不翻倍）。
//! @ai-context: 外部经 EnginePool（内部仅两个 channel sender，可廉价 Clone）同步发请求等结果。

use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use crate::asr::{AsrEngine, AsrModels};
use crate::error::{AppError, Result};
use crate::ocr::{OcrEngine, OcrModels, OcrParams};
use crate::types::{OcrBlock, TranscriptSegment};

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
}

impl EnginePool {
    /// 启动 ASR/OCR 两个专用线程（各自立即加载模型，互不阻塞）。
    pub fn start(asr_models: AsrModels, ocr_models: OcrModels, ocr_params: OcrParams) -> Result<Self> {
        let (asr_tx, asr_rx) = mpsc::channel();
        let (ocr_tx, ocr_rx) = mpsc::channel();
        thread::Builder::new()
            .name("entropy-asr-engine".into())
            .spawn(move || asr_worker_loop(asr_rx, asr_models))
            .map_err(|e| AppError::Io(format!("启动 ASR 引擎线程失败: {}", e)))?;
        thread::Builder::new()
            .name("entropy-ocr-engine".into())
            .spawn(move || ocr_worker_loop(ocr_rx, ocr_models, ocr_params))
            .map_err(|e| AppError::Io(format!("启动 OCR 引擎线程失败: {}", e)))?;
        Ok(Self { asr_tx, ocr_tx })
    }

    /// 测试用空池（任何请求立即失败；仅用于不触引擎的路径单测）。
    #[cfg(test)]
    pub fn dummy() -> Self {
        let (asr_tx, _) = mpsc::channel::<AsrRequest>();
        let (ocr_tx, _) = mpsc::channel::<OcrRequest>();
        Self { asr_tx, ocr_tx }
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

/// ASR 线程主循环：启动即加载模型，随后顺序处理请求（引擎天然串行，无需加锁）。
fn asr_worker_loop(rx: Receiver<AsrRequest>, asr_models: AsrModels) {
    let mut asr = AsrEngine::load(&asr_models);
    for req in rx {
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
        let _ = reply.send(result);
    }
}

/// OCR 线程主循环：启动即加载模型，随后顺序处理请求。
fn ocr_worker_loop(rx: Receiver<OcrRequest>, ocr_models: OcrModels, ocr_params: OcrParams) {
    // @ai-context: OCR 首次构建可能触发 ModelScope 模型下载，耗时较长但在后台线程不影响 UI。
    let mut ocr = OcrEngine::load(&ocr_models, &ocr_params);
    // @ai-context: 加载失败此前静默（仅首次识别时报错），排查"会话无 OCR"无法定位——
    //              启动即打印结果，加载失败可观测（与 ASR 引擎同口径）。
    match &ocr {
        Ok(_) => eprintln!("[Engine] OCR 引擎加载成功（{}）", ocr_models.det),
        Err(e) => eprintln!("[Engine] OCR 引擎加载失败: {}", e),
    }
    for req in rx {
        let (result, reply) = match req {
            OcrRequest::Recognize { path, reply } => {
                let result = match ocr.as_mut() {
                    Ok(engine) => engine.recognize(&path),
                    Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
                };
                (result, reply)
            }
            OcrRequest::RecognizeImage { image, reply } => {
                let result = match ocr.as_mut() {
                    Ok(engine) => engine.recognize_image(image),
                    Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
                };
                (result, reply)
            }
        };
        let _ = reply.send(result);
    }
}
