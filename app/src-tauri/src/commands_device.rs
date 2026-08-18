//! OCR 设备状态 command（REQ-036，ADR-009：GPU 卸载决策/回退可观测）。
//!
//! @ai-context: 前端设置区查询/修改 OCR 推理后端：模式（Auto/ForceGpu/ForceCpu）、
//!              实际生效后端与回退原因（引擎 worker 回写）、校准基准。
//! @ai-context: 变更下次引擎启动生效（不做热重启，避免中断进行中会话）——
//!              "重新检测"只持久化基准，decide 在下次启动重算（UI 提示生效时机）。

use tauri::State;

use crate::commands::AppState;
use crate::device_config::{
    decide, BenchResult, OcrBackend, OcrDeviceConfig, OcrDeviceMode, OcrDeviceStatus,
};
use crate::ocr::{OcrEngine, OcrModels, OcrParams};

/// 校准帧数（ADR-009：各后端 3 帧取中位数，防单帧抖动）。
const BENCH_FRAMES: usize = 3;

/// 校准合成图尺寸（纯色带图案；只计时不关心识别内容）。
const BENCH_WIDTH: u32 = 640;
const BENCH_HEIGHT: u32 = 360;

/// 查询 OCR 设备状态（模式 + 请求/生效后端 + 回退原因 + 校准基准）。
#[tauri::command]
pub fn ocr_device_status(state: State<'_, AppState>) -> OcrDeviceStatus {
    let mut status = state.engines.ocr_device_status();
    let config = OcrDeviceConfig::load(&state.ocr_device_config_path);
    status.mode = config.mode;
    status.bench = config.bench;
    status
}

/// 设置 OCR 设备模式（auto/force_gpu/force_cpu）；持久化，下次引擎启动生效。
#[tauri::command]
pub fn ocr_device_set_mode(state: State<'_, AppState>, mode: String) -> Result<OcrDeviceStatus, String> {
    // 入参校验（安全红线：所有 command 必须校验入参）
    let mode = match mode.as_str() {
        "auto" => OcrDeviceMode::Auto,
        "force_gpu" => OcrDeviceMode::ForceGpu,
        "force_cpu" => OcrDeviceMode::ForceCpu,
        other => return Err(format!("无效模式: {}（可选 auto/force_gpu/force_cpu）", other)),
    };
    let mut config = OcrDeviceConfig::load(&state.ocr_device_config_path);
    config.mode = mode;
    config.save(&state.ocr_device_config_path).map_err(|e| e.to_string())?;
    let mut status = state.engines.ocr_device_status();
    status.mode = mode;
    status.bench = config.bench;
    Ok(status)
}

/// 触发"重新检测"校准（后台线程：CPU/GPU 各 3 帧真实 OCR 取中位数 → 持久化基准）。
///
/// @ai-context: 校准结果只影响下次引擎启动的 decide（Auto 模式防抖动阈值）；
///              校准中重复调用返回错误；GPU 分支在 feature/运行时不可用时跳过并注明。
/// @ai-context: 首次校准可能触发 ModelScope 模型下载（引擎构建），耗时较长——
///              后台线程执行，前端轮询 ocr_device_status 的 calibrating/bench。
#[tauri::command]
pub async fn ocr_device_recalibrate(state: State<'_, AppState>) -> Result<OcrDeviceStatus, String> {
    if !state.engines.ocr_try_begin_calibrate() {
        return Err("校准进行中，请稍候".to_string());
    }
    let engines = state.engines.clone();
    let config_path = state.ocr_device_config_path.clone();
    let ocr_models = state.ocr_models.clone();
    let ocr_params = state.ocr_params.clone();
    std::thread::spawn(move || {
        let result = calibrate(&ocr_models, &ocr_params, &config_path);
        engines.ocr_end_calibrate();
        match result {
            Ok(note) => eprintln!("[Ocr] 校准完成: {}", note),
            Err(note) => eprintln!("[Ocr] 校准未完成: {}", note),
        }
    });
    Ok(state.engines.ocr_device_status())
}

/// 校准实现（后台线程执行；GPU 分支按 feature/运行时可用性门控）。
fn calibrate(
    models: &OcrModels,
    params: &OcrParams,
    config_path: &std::path::Path,
) -> Result<String, String> {
    // 1) 硬件门槛（ADR-009 ①层）：无 GPU 候选 → 清空基准并注明（不阻断）
    #[cfg(target_os = "windows")]
    let best_device = crate::device_probe::select_best(&crate::device_probe::probe_adapters());
    #[cfg(not(target_os = "windows"))]
    let best_device = None;
    let Some(device_id) = best_device else {
        let mut config = OcrDeviceConfig::load(config_path);
        config.bench = None;
        config.save(config_path).map_err(|e| e.to_string())?;
        return Err("无 GPU 候选，无法校准（本机将使用 CPU）".to_string());
    };

    // 2) 合成校准图（纯色带模拟文本行；计时不依赖识别内容）
    let image = synthetic_bench_image();

    // 3) CPU 3 帧中位数
    let cpu_engine = OcrEngine::load(models, params, OcrBackend::Cpu).map_err(|e| e.to_string())?;
    let cpu_ms = median_ocr_latency(&cpu_engine, &image);

    // 4) GPU 3 帧中位数——CUDA 引擎构建失败（feature 关闭/运行时无 CUDA 支持）时
    //    load 已回退 CPU：基准变为 CPU vs CPU，无意义 → 中止并注明
    let gpu_engine = OcrEngine::load(models, params, OcrBackend::Cuda { device_id: 0 }).map_err(|e| {
        let mut config = OcrDeviceConfig::load(config_path);
        config.bench = None;
        let _ = config.save(config_path);
        format!("GPU 引擎构建失败: {}", e)
    })?;
    if let Some(reason) = &gpu_engine.fallback_reason {
        let mut config = OcrDeviceConfig::load(config_path);
        config.bench = None;
        config.save(config_path).map_err(|e| e.to_string())?;
        return Err(format!("GPU 校准不可用: {}", reason));
    }
    let gpu_ms = median_ocr_latency(&gpu_engine, &image);

    // 5) 持久化基准 + 按当前模式预演决策（下次启动生效）
    let bench = BenchResult { cpu_ms, gpu_ms };
    let mut config = OcrDeviceConfig::load(config_path);
    config.bench = Some(bench);
    config.save(config_path).map_err(|e| e.to_string())?;
    let recommended = decide(config.mode, Some(device_id), Some(bench));
    Ok(format!(
        "CPU {:.1}ms / GPU {:.1}ms → 推荐 {:?}（下次引擎启动生效）",
        cpu_ms, gpu_ms, recommended
    ))
}

/// 合成校准图：交替色带模拟文本行（det/rec 走完整流水线）。
fn synthetic_bench_image() -> image::RgbImage {
    let mut img = image::RgbImage::new(BENCH_WIDTH, BENCH_HEIGHT);
    for (_, y, p) in img.enumerate_pixels_mut() {
        let band = (y / 40) % 2 == 0;
        *p = if band { image::Rgb([40, 40, 40]) } else { image::Rgb([200, 200, 200]) };
    }
    img
}

/// 跑 BENCH_FRAMES 帧取中位数延迟（毫秒）。
fn median_ocr_latency(engine: &OcrEngine, image: &image::RgbImage) -> f64 {
    let mut times = Vec::with_capacity(BENCH_FRAMES);
    for _ in 0..BENCH_FRAMES {
        let start = std::time::Instant::now();
        let _ = engine.recognize_image(image.clone());
        times.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    times[BENCH_FRAMES / 2]
}
