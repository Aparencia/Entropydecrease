//! 行级重识别引擎（v0.14 D3 line_rec_engine；adapter 编排 + 疑碎行判定）。
//!
//! @ai-context: spec §4.3——oar-ocr 无 rec-only API（源码验证 0.9.2），官方
//!              TextRecognitionAdapter 为公共 API（CRNN+预处理+CTC 解码封装，
//!              supports_batching=true）：疑碎行判定 → 行图裁剪（bbox + padding）
//!              → 批量 execute → 行级文本替换（行级得分取均值）。
//! @ai-context: 降级纪律（spec §5）：adapter 构建失败/识别失败/空文本/低分 →
//!              保留原结果（能力降级不失效）；编排经 LineRecognizer trait 注入
//!              ——单测用假识别器，真实模型测试标注集成（需模型文件）。
//! @ai-context: 挂载（spec §4.3）：RecLineEngine 由 OCR worker 线程懒构建持有
//!              （engine_worker RecognizeLines 请求）；净化链 ② 源头执行在
//!              photo_capture 落库前（EnginePool → PoolLineRecognizer 注入）。

use image::RgbImage;
use oar_ocr::core::config::OrtSessionConfig;
use oar_ocr::core::traits::OrtConfigurable;
use oar_ocr::core::traits::adapter::{AdapterBuilder, ModelAdapter};
use oar_ocr::core::traits::task::ImageTaskInput;
use oar_ocr::domain::adapters::{TextRecognitionAdapter, TextRecognitionAdapterBuilder};

use crate::error::{AppError, Result};
use crate::types::{OcrBlock, TextBox};

/// 疑碎行判定：≤4 字（碎片——ocr_quality FRAGMENT_CHAR_LIMIT 同源引用，
/// 一处定义两处同口径）。
pub const SUSPECT_FRAGMENT_CHARS: usize = crate::ocr_quality::FRAGMENT_CHAR_LIMIT;
/// 疑碎行判定：置信 < 阈值（photo/实时链路落库口径 0.5 同源）。
pub const SUSPECT_MIN_SCORE: f32 = 0.5;
/// 行图裁剪 padding（px；bbox 外扩——防切字）。
const CROP_PADDING: i32 = 4;

/// 疑碎行判定（纯函数）：文本碎片（≤4 字）或低置信 → 行级重识别候选。
pub fn is_suspect_line(text: &str, score: f32) -> bool {
    text.trim().chars().count() <= SUSPECT_FRAGMENT_CHARS || score < SUSPECT_MIN_SCORE
}

/// 行图裁剪（纯函数）：bbox + padding → 裁剪图（越界 clamp）。
///
/// @ai-context: 空矩形防御（审查 M2 双保险）——非法 bbox（零宽高）不裁剪返回
///              原图；调用方 rec_pipeline_on_blocks 已先过滤无效 bbox（无效
///              不送识别），本检查兜底防未来调用方遗漏（原图送识别会以整屏
///              结果静默替换碎片，污染落库数据）。
pub fn crop_line(image: &RgbImage, bbox: &TextBox) -> RgbImage {
    if bbox.w <= 0.0 || bbox.h <= 0.0 {
        return image.clone();
    }
    let (w, h) = (image.width() as i32, image.height() as i32);
    let x0 = (bbox.x.floor() as i32 - CROP_PADDING).clamp(0, w);
    let y0 = (bbox.y.floor() as i32 - CROP_PADDING).clamp(0, h);
    let x1 = ((bbox.x + bbox.w).ceil() as i32 + CROP_PADDING).clamp(0, w);
    let y1 = ((bbox.y + bbox.h).ceil() as i32 + CROP_PADDING).clamp(0, h);
    if x1 <= x0 || y1 <= y0 {
        return image.clone();
    }
    image::imageops::crop_imm(image, x0 as u32, y0 as u32, (x1 - x0) as u32, (y1 - y0) as u32)
        .to_image()
}

/// 识别结果（与输入裁剪图 1:1 对应）。
#[derive(Debug, Clone, PartialEq)]
pub struct LineRecResult {
    pub text: String,
    pub score: f32,
}

/// 行级识别器抽象（净化链/落库前替换注入；单测用假识别器，生产用 RecLineEngine）。
pub trait LineRecognizer {
    /// 批量识别行裁剪图（1:1 对应；Err → 调用方保留原结果）。
    fn recognize_lines(&self, crops: &[RgbImage]) -> Result<Vec<LineRecResult>>;
}

/// 官方 TextRecognitionAdapter 封装（rec 模型常驻——OCR worker 线程持有）。
pub struct RecLineEngine {
    adapter: TextRecognitionAdapter,
}

impl RecLineEngine {
    /// 构建 rec-only 管线（重操作：加载模型；失败 → Err，调用方降级保留碎片）。
    pub fn build(
        rec_model: &str,
        dict_path: &str,
        ort_config: Option<OrtSessionConfig>,
    ) -> Result<Self> {
        let dict = std::fs::read_to_string(dict_path)
            .map_err(|e| AppError::ModelNotReady(format!("识别字典读取失败: {}", e)))?;
        let char_dict: Vec<String> = dict
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let mut builder = TextRecognitionAdapterBuilder::new().character_dict(char_dict);
        if let Some(cfg) = ort_config {
            builder = builder.with_ort_config(cfg);
        }
        let adapter = builder
            .build(rec_model)
            .map_err(|e| AppError::Ocr(format!("行级识别适配器构建失败: {}", e)))?;
        Ok(Self { adapter })
    }
}

impl LineRecognizer for RecLineEngine {
    fn recognize_lines(&self, crops: &[RgbImage]) -> Result<Vec<LineRecResult>> {
        if crops.is_empty() {
            return Ok(Vec::new());
        }
        let input = ImageTaskInput::new(crops.to_vec());
        let out = TextRecognitionAdapter::execute(&self.adapter, input, None)
            .map_err(|e| AppError::Ocr(format!("行级批量识别失败: {}", e)))?;
        Ok(out
            .texts
            .into_iter()
            .zip(out.scores)
            .map(|(text, score)| LineRecResult { text, score })
            .collect())
    }
}

/// 落库前源头净化（photo_capture 调用；纯编排）：疑碎块 → 裁剪 → 批量识别 →
/// 达标替换。
///
/// @ai-context: 1:1 索引对齐（疑碎块 ↔ 裁剪图 ↔ 结果）——不漂移；识别失败/
///              空文本/低分保留原样（能力降级不失效，spec §5）；行级得分取
///              重识别结果（spec：行级得分取均值——单块行即自身）。
/// @returns 替换块数（0 = 无疑碎或全部降级）。
pub fn rec_pipeline_on_blocks(
    rec: &dyn LineRecognizer,
    image: &RgbImage,
    blocks: &mut [OcrBlock],
    accept_min_score: f32,
) -> usize {
    let suspects: Vec<usize> = blocks
        .iter()
        .enumerate()
        .filter(|(_, b)| {
            // 无效 bbox（零宽高）不裁剪不识别（审查 M2）——crop_line 对无效
            // bbox 返回原图，若送识别会以整屏图结果静默替换碎片文本（落库污染）
            b.bbox.is_some_and(|bb| bb.w > 0.0 && bb.h > 0.0) && is_suspect_line(&b.text, b.score)
        })
        .map(|(i, _)| i)
        .collect();
    if suspects.is_empty() {
        return 0;
    }
    let crops: Vec<RgbImage> = suspects
        .iter()
        .filter_map(|&i| blocks[i].bbox.as_ref().map(|bb| crop_line(image, bb)))
        .collect();
    // 识别失败/结果数不匹配 → 保留原结果（防外部实现 bug 造成索引漂移）
    let results = match rec.recognize_lines(&crops) {
        Ok(r) if r.len() == suspects.len() => r,
        Ok(r) => {
            eprintln!("[LineRec] 结果数不匹配（{} vs {}）——保留原结果", r.len(), suspects.len());
            return 0;
        }
        Err(e) => {
            eprintln!("[LineRec] 重识别降级（保留原结果）: {}", e);
            return 0;
        }
    };
    let mut replaced = 0;
    for (k, &i) in suspects.iter().enumerate() {
        let r = &results[k];
        let t = r.text.trim();
        if t.is_empty() || r.score < accept_min_score {
            continue;
        }
        blocks[i].text = t.to_string();
        blocks[i].score = r.score;
        replaced += 1;
    }
    replaced
}

#[cfg(test)]
#[path = "line_rec_engine_tests.rs"]
mod tests;
