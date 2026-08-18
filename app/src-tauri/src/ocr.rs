//! 本地 OCR 引擎封装（REQ-002）：基于 oar-ocr（PP-OCRv6 + ONNX Runtime）。
//!
//! @ai-context: 本地优先——关键帧文字识别全部在本机完成，画面数据不出设备。
//! @ai-context: OcrEngine 为常驻引擎（load 构建一次 pipeline，recognize 可复用），由 engine.rs
//!              的专用线程独占持有，模型只加载一次。
//! @ai-context: auto-download feature 下模型标识为 oar-ocr 注册名，首次构建从 ModelScope（国内源）
//!              自动下载缓存到 $OAR_HOME；ONNX Runtime 本体经 ORT_LIB_LOCATION 指向本地库。

use std::path::Path;

use oar_ocr::domain::tasks::TextDetectionConfig;
use oar_ocr::oarocr::OAROCR;
use oar_ocr::prelude::*;

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

/// 常驻 OCR 引擎：持有 OAROCR pipeline 实例，可复用于多次识别。
pub struct OcrEngine {
    inner: OAROCR,
}

impl OcrEngine {
    /// 构建 OCR pipeline（重操作：加载模型；auto-download 时首次会下载模型文件）。
    pub fn load(models: &OcrModels, params: &OcrParams) -> Result<Self> {
        let inner = OAROCRBuilder::new(models.det.as_str(), models.rec.as_str(), models.dict.as_str())
            .text_detection_config(TextDetectionConfig {
                score_threshold: params.score_threshold,
                box_threshold: params.box_threshold,
                unclip_ratio: params.unclip_ratio,
                max_candidates: params.max_candidates,
                ..Default::default()
            })
            .build()
            .map_err(|e| AppError::Ocr(format!("初始化 OCR 引擎失败: {}", e)))?;
        Ok(Self { inner })
    }

    /// 识别单张图片，返回文本块列表（通常自上而下排序）。
    ///
    /// @ai-context: 第一阶段离线导入图片，timestamp_ms 为 None；接入屏幕捕获后由调用方填关键帧时间戳。
    pub fn recognize(&self, img_path: &str) -> Result<Vec<OcrBlock>> {
        let image = load_image(Path::new(img_path))
            .map_err(|e| AppError::Ocr(format!("读取图片失败: {}", e)))?;

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
                        })
                    })
                    .filter(|b| !b.text.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        Ok(blocks)
    }
}
