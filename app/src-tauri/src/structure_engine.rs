//! 结构分析引擎（版面/表格/公式模型版，REQ-047/049/050 模型版落地）。
//!
//! @ai-context: 基于 oar-ocr 0.9.1 内置 OARStructureBuilder（layout + SLANet 表格 +
//!              PP-FormulaNet/UniMERNet 公式）——与现有 OCR 同生态（ort 2.0.0-rc.13
//!              算子兼容由上游保证），EP 注入复用 ocr.rs::ort_config_for（跟随 OCR
//!              backend：有 NVIDIA 独显自动 CUDA，否则 CPU，构建失败回退 CPU）。
//! @ai-context: 按需启用：模型文件存在才装配对应能力（layout 必须；table/formula
//!              可选——文件缺失该能力自动降级，不阻断结构分析）。
//! @ai-context: OARStructure 非 Send——由专用线程持有（engine.rs worker 模式），
//!              课后精修线程内创建/使用/释放（大模型不常驻内存）。

use std::path::Path;

use oar_ocr::domain::structure::{StructureResult};
use oar_ocr::domain::tasks::FormulaRecognitionConfig;
use oar_ocr::oarocr::{OARStructure, OARStructureBuilder};

use crate::device_config::OcrBackend;
use crate::error::{AppError, Result};

/// 结构模型文件路径集合（lib.rs 装配注入，禁止硬编码绝对路径）。
#[derive(Debug, Clone)]
pub struct StructureModels {
    /// 版面分析（pp-doclayout-l.onnx；必选）
    pub layout: String,
    /// 表格结构（slanet_plus_v2.onnx；可选——缺失降级规则版）
    pub table: Option<String>,
    /// 表格分类（pp-lcnet_x1_0_table_cls.onnx；可选）
    pub table_cls: Option<String>,
    /// 表格结构字典（table_structure_dict_ch.txt；table 存在时必须）
    pub table_dict: Option<String>,
    /// 公式识别（pp-formulanet-s.onnx 或 unimernet.onnx；可选——缺失降级规则版）
    pub formula: Option<String>,
    /// 公式 tokenizer（与 formula 配套）
    pub formula_tokenizer: Option<String>,
}

impl StructureModels {
    /// 三类能力是否就绪（按需启用判定）。
    pub fn layout_ready(&self) -> bool {
        Path::new(&self.layout).is_file()
    }
    pub fn table_ready(&self) -> bool {
        self.table.as_deref().is_some_and(|p| Path::new(p).is_file())
            && self.table_dict.as_deref().is_some_and(|p| Path::new(p).is_file())
    }
    pub fn formula_ready(&self) -> bool {
        self.formula.as_deref().is_some_and(|p| Path::new(p).is_file())
            && self.formula_tokenizer.as_deref().is_some_and(|p| Path::new(p).is_file())
    }
}

/// 常驻结构引擎（专用线程持有，规避 FFI Send/Sync 约束）。
pub struct StructureEngine {
    inner: OARStructure,
    /// ADR-009 同款：实际生效后端（CUDA 构建失败回退 CPU 后为 Cpu；
    /// 诊断面板展示用，暂由测试覆盖，登记豁免 dead_code）
    #[allow(dead_code)]
    pub backend: OcrBackend,
    /// 回退原因（无回退为 None；诊断用，同上豁免）
    #[allow(dead_code)]
    pub fallback_reason: Option<String>,
}

impl StructureEngine {
    /// 构建结构管线（重操作：加载模型；layout 缺失直接失败——规则版兜底由调用方负责）。
    ///
    /// @ai-context: 防御链（ADR-009 同款）：请求后端构建失败 → CPU 重建兜底，
    ///              CUDA 不可用绝不阻断结构分析主链路。
    pub fn load(models: &StructureModels, backend: OcrBackend) -> Result<Self> {
        if !models.layout_ready() {
            return Err(AppError::ModelNotReady(
                "版面分析模型缺失（请先在设置面板下载结构模型）".to_string(),
            ));
        }
        match build_engine(models, backend) {
            Ok(inner) => Ok(Self { inner, backend, fallback_reason: None }),
            Err(e) => {
                let reason = format!("请求后端 {:?} 构建失败: {}；已回退 CPU", backend, e);
                eprintln!("[Structure] {}", reason);
                let inner = build_engine(models, OcrBackend::Cpu).map_err(|e2| {
                    AppError::ModelNotReady(format!("{}；CPU 回退构建也失败: {}", reason, e2))
                })?;
                Ok(Self { inner, backend: OcrBackend::Cpu, fallback_reason: Some(reason) })
            }
        }
    }

    /// 结构分析单页（返回版面元素/表格/公式；模型缺失的能力返回空，调用方降级）。
    pub fn predict_image(&self, image: image::RgbImage) -> Result<StructureResult> {
        self.inner
            .predict_image(image)
            .map_err(|e| AppError::Ocr(format!("结构分析失败: {}", e)))
    }
}

/// 按请求后端构建结构管线（失败即 Err，由 load 决定是否回退 CPU）。
fn build_engine(models: &StructureModels, backend: OcrBackend) -> Result<OARStructure> {
    let ort_config = crate::ocr::ort_config_for_structure(backend)?;
    // layout（必选）
    let mut builder = OARStructureBuilder::new(models.layout.clone());
    if let Some(cfg) = &ort_config {
        builder = builder.ort_session(cfg.clone());
    }
    // 表格（可选装配：SLANet 结构 + 表格分类 + 字典）
    if models.table_ready() {
        let table_model = models.table.clone().unwrap();
        let dict = models.table_dict.clone().unwrap();
        // 有线/无线共用同一 SLANet（分类器决定分支）；字典路径必填
        builder = builder
            .with_wired_table_structure(table_model.clone())
            .with_wireless_table_structure(table_model)
            .table_structure_dict_path(dict);
        if let Some(cls) = models.table_cls.clone() {
            if Path::new(&cls).is_file() {
                builder = builder.with_table_classification(cls);
            }
        }
    }
    // 公式（可选装配：PP-FormulaNet/UniMERNet + tokenizer + 模型类型）
    if models.formula_ready() {
        let formula_model = models.formula.clone().unwrap();
        let tokenizer = models.formula_tokenizer.clone().unwrap();
        // 审查 H3 修复：模型类型由档位契约映射（structure_tier::FormulaTier::model_type），
        // 文件名含 unimernet 仅为装配路径推断兜底（与档位文件一致）
        let model_type = if formula_model.contains("unimernet") {
            crate::structure_tier::FormulaTier::UniMERNet.model_type().to_string()
        } else {
            crate::structure_tier::FormulaTier::PFormulaNet.model_type().to_string()
        };
        builder = builder
            .with_formula_recognition(formula_model, tokenizer, model_type)
            .formula_recognition_config(FormulaRecognitionConfig {
                score_threshold: 0.0,
                max_length: 1536,
                batch_size: 4,
            });
        if let Some(cfg) = &ort_config {
            builder = builder.formula_ort_session(cfg.clone());
        }
    }
    builder
        .build()
        .map_err(|e| AppError::Ocr(format!("初始化结构引擎失败（后端 {:?}）: {}", backend, e)))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "structure_engine_tests.rs"]
mod tests;
