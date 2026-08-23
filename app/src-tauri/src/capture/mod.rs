//! 实时捕获模块（v0.2.0，ADR-001/ADR-002）。
//!
//! @ai-context: 音频（WASAPI 环回）与屏幕（DXGI）捕获的对外出口；
//!              纯逻辑层（resample / frame_diff / subtitle_ocr / fusion）与
//!              系统调用层（audio_loopback / dxgi_capture）物理分离。
//! @ai-context: 本模块仅 Windows（桌面壳技术栈），非 Windows 平台编译为空。

#[cfg(target_os = "windows")]
pub mod audio_loopback;
#[cfg(target_os = "windows")]
mod dxgi_state;
#[cfg(target_os = "windows")]
pub mod dxgi_capture;
// ADR-022（v0.12.0 M2）：WGC 窗口级捕获（三级降级链主路径）
#[cfg(target_os = "windows")]
pub mod wgc_capture;
pub mod frame_diff;
#[cfg(target_os = "windows")]
pub mod gdi_capture;
// ADR-011：网格差异变化检测（替代 frame_diff 的分块采样 hash）
pub mod grid_diff;
pub mod resample;
// REQ-114（v0.7.0 M2）：抗混叠重采样（降采样先低通——resample.rs 行数保护）
pub mod resample_antialias;

#[cfg(target_os = "windows")]
pub use audio_loopback::{AudioChunk, AudioLoopbackCapture};
#[cfg(target_os = "windows")]
pub use dxgi_capture::ScreenCaptureSampler;
