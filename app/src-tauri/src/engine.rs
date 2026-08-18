//! 常驻引擎池：ASR/OCR 引擎由专用线程独占持有，模型只加载一次。
//!
//! @ai-context: 第三方推理引擎（sherpa OfflineRecognizer / oar-ocr OAROCR）不保证 Send/Sync，
//!              专用线程独占持有可完全规避跨线程约束，同时实现模型常驻（消除每次调用 1-3 秒加载）。
//! @ai-context: 引擎线程随应用启动即加载模型（后台执行不阻塞 UI）；加载失败不致命，
//!              Result 保留到请求时向前端报出可操作错误。
//! @ai-context: 外部经 EnginePool（内部仅 channel sender，可廉价 Clone）同步发请求等结果。

use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use crate::asr::{AsrEngine, AsrModels};
use crate::error::{AppError, Result};
use crate::ocr::{OcrEngine, OcrModels, OcrParams};
use crate::types::{OcrBlock, TranscriptSegment};

/// 引擎请求（reply channel 回传结果）。
enum EngineRequest {
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
    Recognize {
        path: String,
        reply: Sender<Result<Vec<OcrBlock>>>,
    },
}

/// 引擎池句柄（Clone 仅复制请求 channel，开销极低）。
#[derive(Clone)]
pub struct EnginePool {
    tx: Sender<EngineRequest>,
}

impl EnginePool {
    /// 启动引擎专用线程（后台立即加载 ASR/OCR 模型）。
    pub fn start(asr_models: AsrModels, ocr_models: OcrModels, ocr_params: OcrParams) -> Result<Self> {
        let (tx, rx) = mpsc::channel();
        thread::Builder::new()
            .name("entropy-engine-pool".into())
            .spawn(move || worker_loop(rx, asr_models, ocr_models, ocr_params))
            .map_err(|e| AppError::Io(format!("启动引擎线程失败: {}", e)))?;
        Ok(Self { tx })
    }

    /// 转写音频（阻塞等待引擎线程返回）。
    pub fn transcribe(&self, path: &str) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.tx
            .send(EngineRequest::Transcribe { path: path.to_string(), reply })
            .map_err(|_| AppError::Asr("引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Asr("引擎线程未返回结果".to_string()))?
    }

    /// 转写 PCM 内存样本（SenseVoice 重打分，阻塞等待引擎线程返回）。
    pub fn transcribe_pcm(&self, samples: &[f32], sample_rate: i32) -> Result<TranscriptSegment> {
        let (reply, rx) = mpsc::channel();
        self.tx
            .send(EngineRequest::TranscribePcm {
                samples: samples.to_vec(),
                sample_rate,
                reply,
            })
            .map_err(|_| AppError::Asr("引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Asr("引擎线程未返回结果".to_string()))?
    }

    /// 识别图片（阻塞等待引擎线程返回）。
    pub fn recognize(&self, path: &str) -> Result<Vec<OcrBlock>> {
        let (reply, rx) = mpsc::channel();
        self.tx
            .send(EngineRequest::Recognize { path: path.to_string(), reply })
            .map_err(|_| AppError::Ocr("引擎线程已退出".to_string()))?;
        rx.recv().map_err(|_| AppError::Ocr("引擎线程未返回结果".to_string()))?
    }
}

/// 引擎线程主循环：启动即加载模型，随后顺序处理请求（引擎天然串行，无需加锁）。
fn worker_loop(
    rx: Receiver<EngineRequest>,
    asr_models: AsrModels,
    ocr_models: OcrModels,
    ocr_params: OcrParams,
) {
    // 启动即加载：后台就绪，用户操作时直接可用；失败保留到请求时报错。
    // @ai-context: OCR 首次构建可能触发 ModelScope 模型下载，耗时较长但在后台线程不影响 UI。
    let mut asr = AsrEngine::load(&asr_models);
    let mut ocr = OcrEngine::load(&ocr_models, &ocr_params);

    for req in rx {
        match req {
            EngineRequest::Transcribe { path, reply } => {
                let result = match asr.as_mut() {
                    Ok(engine) => engine.transcribe(&path),
                    Err(_) => Err(AppError::Asr("ASR 引擎加载失败（请检查模型文件是否就绪）".to_string())),
                };
                let _ = reply.send(result);
            }
            EngineRequest::TranscribePcm { samples, sample_rate, reply } => {
                let result = match asr.as_mut() {
                    Ok(engine) => engine.transcribe_pcm(&samples, sample_rate),
                    Err(_) => Err(AppError::Asr("ASR 引擎加载失败（请检查模型文件是否就绪）".to_string())),
                };
                let _ = reply.send(result);
            }
            EngineRequest::Recognize { path, reply } => {
                let result = match ocr.as_mut() {
                    Ok(engine) => engine.recognize(&path),
                    Err(_) => Err(AppError::Ocr("OCR 引擎加载失败（请检查模型下载/网络）".to_string())),
                };
                let _ = reply.send(result);
            }
        }
    }
}
