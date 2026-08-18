//! 本地 OCR 引擎封装（REQ-002）：基于 oar-ocr（PP-OCRv6 + ONNX Runtime）。
//!
//! @ai-context: 本地优先——关键帧文字识别全部在本机完成，画面数据不出设备。
//! @ai-context: OcrEngine 为常驻引擎（load 构建一次 pipeline，recognize 可复用），由 engine.rs
//!              的专用线程独占持有，模型只加载一次。
//! @ai-context: auto-download feature 下模型标识为 oar-ocr 注册名，首次构建从 ModelScope（国内源）
//!              自动下载缓存到 $OAR_HOME；ONNX Runtime 本体经 ORT_LIB_LOCATION 指向本地库。
//! @ai-context: ADR-009（v0.4.0 M1）——推理后端可配置（Cpu | Cuda）：
//!              CUDA EP 经 cargo feature `ocr-cuda`（默认开）编译；ORT 1.28 官方
//!              gpu_cuda12 运行时经 download-ort-cuda.ps1 分发；请求后端构建失败
//!              （无 NVIDIA 驱动/运行时缺 CUDA 支持）自动回退 CPU 并记录 fallback_reason。
//! @ai-context: E1 ORT 调优——EP/线程/图优化级别统一经 OrtSessionConfig 注入（仅一处生效点）。

use std::path::Path;

use oar_ocr::core::config::{OrtExecutionProvider, OrtGraphOptimizationLevel, OrtSessionConfig};
use oar_ocr::domain::tasks::TextDetectionConfig;
use oar_ocr::oarocr::OAROCR;
use oar_ocr::prelude::*;

use crate::device_config::OcrBackend;
use crate::error::{AppError, Result};
use crate::types::OcrBlock;

/// OCR 模型标识（auto-download 模式下为 oar-ocr 注册名；也可替换为本地文件路径）。
#[derive(Debug, Clone)]
pub struct OcrModels {
    /// 文字检测模型（det）
    pub det: String,
    /// 文字识别模型（rec）
    pub rec: String,
    /// 识别字典（dict）
    pub dict: String,
}

/// OCR 检测参数（构建期固定，PP-OCR 经验值）。
#[derive(Debug, Clone)]
pub struct OcrParams {
    /// 检测区域分值阈值
    pub score_threshold: f32,
    /// 文本框阈值
    pub box_threshold: f32,
    /// 文本框扩张比例
    pub unclip_ratio: f32,
    /// 最大候选框数量
    pub max_candidates: usize,
}

impl Default for OcrParams {
    fn default() -> Self {
        Self {
            score_threshold: 0.2,
            box_threshold: 0.45,
            unclip_ratio: 1.4,
            max_candidates: 3000,
        }
    }
}

/// E1 初始调优值：OCR worker 专用线程内 intra-op 线程数。
/// @ai-context: 与 ASR 引擎分线程并行，2 线程为初始基准值（实测后校准，诊断面板数据源）；
///              不设 inter-op（默认 1）——det/rec 图内并行已由 intra-op 覆盖。
const OCR_INTRA_THREADS: usize = 2;

/// 常驻 OCR 引擎：持有 OAROCR pipeline 实例，可复用于多次识别。
pub struct OcrEngine {
    inner: OAROCR,
    /// ADR-009：实际生效后端（CUDA 构建失败回退 CPU 后为 Cpu）
    pub backend: OcrBackend,
    /// ADR-009：回退原因（无回退为 None；含"未启用 feature/运行时无 CUDA"等可观测信息）
    pub fallback_reason: Option<String>,
}

impl OcrEngine {
    /// 构建 OCR pipeline（重操作：加载模型；auto-download 时首次会下载模型文件）。
    ///
    /// @ai-context: 防御链（ADR-009 ②层）：请求后端构建失败 → 打印原因 →
    ///              CPU 重建兜底（CUDA 不可用绝不阻断 OCR 主链路）。
    pub fn load(models: &OcrModels, params: &OcrParams, backend: OcrBackend) -> Result<Self> {
        match build_engine(models, params, backend) {
            Ok(inner) => Ok(Self { inner, backend, fallback_reason: None }),
            Err(e) => {
                let reason = format!(
                    "请求后端 {:?} 构建失败: {}；已回退 CPU",
                    backend, e
                );
                eprintln!("[Ocr] {}", reason);
                let inner = build_engine(models, params, OcrBackend::Cpu).map_err(|e2| {
                    AppError::Ocr(format!("{}；CPU 回退构建也失败: {}", reason, e2))
                })?;
                Ok(Self { inner, backend: OcrBackend::Cpu, fallback_reason: Some(reason) })
            }
        }
    }

    /// 识别单张图片，返回文本块列表（通常自上而下排序）。
    ///
    /// @ai-context: 第一阶段离线导入图片，timestamp_ms 为 None；接入屏幕捕获后由调用方填关键帧时间戳。
    pub fn recognize(&self, img_path: &str) -> Result<Vec<OcrBlock>> {
        let image = load_image(Path::new(img_path))
            .map_err(|e| AppError::Ocr(format!("读取图片失败: {}", e)))?;
        self.recognize_image(image)
    }

    /// 识别内存图像（TD-025 修复：实时链路不再写磁盘临时 BMP）。
    ///
    /// @ai-context: oar-ocr 的 predict 直接接收 image::RgbImage（内存输入），
    ///              屏幕捕获帧（BGRA8）转 RGB 后直接送入，消除磁盘 IO 与崩溃残留。
    pub fn recognize_image(&self, image: image::RgbImage) -> Result<Vec<OcrBlock>> {
        let results = self
            .inner
            .predict(vec![image])
            .map_err(|e| AppError::Ocr(format!("OCR 识别失败: {}", e)))?;

        let blocks = results
            .first()
            .map(|page| {
                page.text_regions
                    .iter()
                    .filter_map(|region| {
                        region.text_with_confidence().map(|(text, score)| OcrBlock {
                            timestamp_ms: None,
                            text: text.trim().to_string(),
                            score,
                            // M2/REQ-037：det 结果暴露 bbox（oar-ocr 0.9.1 已确认），
                            // 供 region_tracker 做动态字幕区域锁定
                            bbox: {
                                let bb = &region.bounding_box;
                                let (x, y) = (bb.x_min(), bb.y_min());
                                let (x2, y2) = (bb.x_max(), bb.y_max());
                                (x2 > x && y2 > y).then_some(crate::types::TextBox {
                                    x,
                                    y,
                                    w: x2 - x,
                                    h: y2 - y,
                                })
                            },
                            // M4/REQ-048：区域类型由编排层回填（引擎层未知）
                            region_kind: None,
                        })
                    })
                    .filter(|b| !b.text.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        Ok(blocks)
    }
}

/// 按请求后端构建 OAROCR pipeline（失败即 Err，由 load 决定是否回退 CPU）。
fn build_engine(models: &OcrModels, params: &OcrParams, backend: OcrBackend) -> Result<OAROCR> {
    let mut builder = OAROCRBuilder::new(models.det.as_str(), models.rec.as_str(), models.dict.as_str())
        .text_detection_config(TextDetectionConfig {
            score_threshold: params.score_threshold,
            box_threshold: params.box_threshold,
            unclip_ratio: params.unclip_ratio,
            max_candidates: params.max_candidates,
            ..Default::default()
        });
    if let Some(cfg) = ort_config_for(backend)? {
        builder = builder.ort_session(cfg);
    }
    builder
        .build()
        .map_err(|e| AppError::Ocr(format!("初始化 OCR 引擎失败（后端 {:?}）: {}", backend, e)))
}

/// 后端 → OrtSessionConfig（EP 顺序即回退顺序，ADR-009）。
///
/// @ai-context: CUDA 请求在 feature 未启用时显式返回 Err（触发 load 的 CPU 回退
///              并记录原因）；feature 启用后由 ort 会话构建失败兜底
///              （无 NVIDIA 驱动/运行时为 CPU 版时 CUDA EP 注册失败）。
fn ort_config_for(backend: OcrBackend) -> Result<Option<OrtSessionConfig>> {
    ort_config_for_impl(backend)
}

/// 结构引擎（版面/表格/公式）的 ORT 会话配置（v0.5.0 模型版）。
///
/// @ai-context: 与 OCR 同款 EP 注入（跟随 OCR backend 决策，用户确认的策略）：
///              CUDA 优先 + CPU 兜底 + intra_threads + 图优化 All；
///              结构模型体积大（pp-doclayout-l 129MB / PP-FormulaNet 231MB），
///              CUDA 时设 gpu_mem_limit 上限防显存失控。
pub fn ort_config_for_structure(backend: OcrBackend) -> Result<Option<OrtSessionConfig>> {
    let mut cfg = ort_config_for_impl(backend)?;
    // 结构引擎显存上限（4GB）：GPU 会话与 OCR 会话共存时防 OOM
    if let Some(OrtExecutionProvider::CUDA { gpu_mem_limit, .. }) = cfg
        .as_mut()
        .and_then(|c| c.execution_providers.as_mut())
        .and_then(|eps| eps.first_mut())
    {
        *gpu_mem_limit = Some(4 * 1024 * 1024 * 1024);
    }
    Ok(cfg)
}

/// EP/线程/图优化统一注入（OCR 与结构引擎共用）。
fn ort_config_for_impl(backend: OcrBackend) -> Result<Option<OrtSessionConfig>> {
    match backend {
        OcrBackend::Cpu => Ok(Some(
            OrtSessionConfig::new()
                .with_execution_providers(vec![OrtExecutionProvider::CPU])
                .with_intra_threads(OCR_INTRA_THREADS)
                .with_optimization_level(OrtGraphOptimizationLevel::All),
        )),
        OcrBackend::Cuda { device_id } => {
            #[cfg(feature = "ocr-cuda")]
            {
                // EP 顺序即回退顺序：CUDA 优先，CPU 兜底（ADR-009）
                Ok(Some(
                    OrtSessionConfig::new()
                        .with_execution_providers(vec![
                            OrtExecutionProvider::CUDA {
                                device_id: Some(device_id),
                                gpu_mem_limit: None,
                                arena_extend_strategy: None,
                                cudnn_conv_algo_search: None,
                                cudnn_conv_use_max_workspace: None,
                            },
                            OrtExecutionProvider::CPU,
                        ])
                        .with_intra_threads(OCR_INTRA_THREADS)
                        .with_optimization_level(OrtGraphOptimizationLevel::All),
                ))
            }
            #[cfg(not(feature = "ocr-cuda"))]
            {
                let _ = device_id;
                Err(AppError::Ocr(
                    "CUDA 支持未启用（编译 feature ocr-cuda 关闭，见 ADR-009）".into(),
                ))
            }
        }
    }
}
