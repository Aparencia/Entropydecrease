//! 临时诊断：复现「窗口捕获」链路（定位实时会话无 OCR 根因——全屏链路已确认可用）。
//!
//! 运行：cargo test live_pipeline_diag -- --nocapture --ignored
//! 诊断后删除本文件。

use crate::capture::grid_diff::{GridDiffDetector, GRID_COLS, GRID_ROWS};
use crate::capture::ScreenCaptureSampler;
use crate::ocr::{OcrEngine, OcrModels, OcrParams};
use crate::windows::{hwnd_from_i64, list_capture_windows};

/// BGRA8 → image::RgbImage（尺寸不匹配返回 None；与 live_session_frame 同口径）。
fn bgra_to_rgb(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
    let pixel_len = width as usize * height as usize * 4;
    if width == 0 || height == 0 || bgraw.len() != pixel_len {
        return None;
    }
    let mut rgb = Vec::with_capacity(pixel_len / 4 * 3);
    for px in bgraw.chunks_exact(4) {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    image::RgbImage::from_raw(width, height, rgb)
}

fn run(hwnd: Option<i64>, label: &str) {
    let mut sampler = match ScreenCaptureSampler::new(hwnd.map(hwnd_from_i64)) {
        Ok(s) => {
            eprintln!("[diag][{label}] 后端: {}", s.backend_name());
            s
        }
        Err(e) => {
            eprintln!("[diag][{label}] 采样器创建失败: {e}");
            return;
        }
    };
    let mut diff = GridDiffDetector::new(GRID_COLS, GRID_ROWS);
    let ocr = match OcrEngine::load(
        &OcrModels {
            det: "pp-ocrv6_tiny_det.onnx".into(),
            rec: "pp-ocrv6_tiny_rec.onnx".into(),
            dict: "ppocrv6_tiny_dict.txt".into(),
        },
        &OcrParams::default(),
        // ADR-009：诊断链路固定 CPU（探测 CUDA 环境非本模块职责）
        crate::device_config::OcrBackend::Cpu,
    ) {
        Ok(o) => Some(o),
        Err(e) => {
            eprintln!("[diag][{label}] OCR 引擎加载失败: {e}");
            None
        }
    };

    let mut ocr_count = 0;
    for i in 0..5 {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        match sampler.capture(None) {
            Ok(Some(frame)) => {
                let changed = !diff.diff(&frame.bgraw, frame.width, frame.height).changed_cells.is_empty();
                eprintln!("[diag][{label}] 第{i}次: 捕获 {}x{}，变化={changed}", frame.width, frame.height);
                if changed && ocr_count < 2 {
                    ocr_count += 1;
                    if let Some(rgb) = bgra_to_rgb(&frame.bgraw, frame.width, frame.height) {
                        if let Some(ocr) = ocr.as_ref() {
                            match ocr.recognize_image(rgb) {
                                Ok(blocks) => eprintln!("[diag][{label}]   OCR 块数: {}", blocks.len()),
                                Err(e) => eprintln!("[diag][{label}]   OCR 失败: {e}"),
                            }
                        }
                    }
                }
            }
            Ok(None) => eprintln!("[diag][{label}] 第{i}次: 无帧（桌面无变化）"),
            Err(e) => eprintln!("[diag][{label}] 第{i}次: 捕获失败 {e}"),
        }
    }
}

#[test]
#[ignore]
fn live_pipeline_diag() {
    // 1) 全屏链路（基线）
    run(None, "全屏");

    // 2) 窗口链路：枚举可见窗口
    let wins = list_capture_windows();
    eprintln!("[diag] 枚举到 {} 个窗口", wins.len());
    // 优先测用户目标窗口（《复盘》课程视频窗口），其次测每个带标题窗口
    let target = wins
        .iter()
        .find(|w| w.title.contains("复盘") || w.title.contains("精读"))
        .or_else(|| wins.iter().find(|w| w.process_name == "哔哩哔哩" && !w.title.contains("干杯")))
        .cloned();
    if let Some(w) = target {
        eprintln!(
            "[diag] 目标窗口: id={} title={:?}",
            w.id,
            crate::log_redact::redact_line(&w.title)
        );
        run(Some(w.id), &w.title);
    } else {
        eprintln!("[diag] 未找到《复盘》窗口");
    }
}
