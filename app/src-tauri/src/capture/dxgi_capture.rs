//! DXGI Desktop Duplication 屏幕捕获（REQ-008，ADR-002）。
//!
//! @ai-context: 主路径用 DXGI 桌面复制（GPU 直取，性能最优）；new 或运行时
//!              捕获失败（远程桌面/锁屏/设备丢失）自动降级 GDI BitBlt（gdi_capture.rs），
//!              调用方无感知。帧输出 BGRA8，支持按窗口矩形裁剪与底部字幕区裁剪。
//! @ai-context: AcquireNextFrame 超时（桌面无变化）是正常分支——返回 Ok(None)，
//!              由上层变化检测/采样调度决定是否继续；DXGI_ERROR_ACCESS_LOST 触发重建。
//! @ai-context: DxgiState（设备/duplication/staging）已拆至 dxgi_state.rs
//!              （行数豁免登记拆分计划，TD-033 实施时执行）；本文件只保留采样器编排。

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

use super::dxgi_state::{point_in_output, window_center, DxgiState};
use super::frame_diff::{crop_frame, Rect};
use super::gdi_capture::gdi_capture;
use super::wgc_capture::WgcState;

/// 捕获帧（BGRA8 像素）。
#[derive(Debug, Clone)]
pub struct CapturedFrame {
    pub width: u32,
    pub height: u32,
    pub bgraw: Vec<u8>,
    /// 相对捕获起点的毫秒时间戳
    pub timestamp_ms: u64,
}

/// 捕获过程事件（ADR-007：采样器内部检测、上层转发前端）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureEvent {
    /// 目标窗口已关闭（GetWindowRect 失败）→ 已回退全屏捕获
    WindowLost,
}

/// DXGI 重建节流间隔（GDI 降级期间周期性尝试切回主路径，ADR-007）。
const DXGI_RECREATE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);

/// 窗口中心越界（TD-033）后的快速重建节流：跨屏拖拽后立即重试，
/// 不再等 30s 周期重建（否则最长 30s 空窗/裁剪错位）。
const DXGI_REBIND_FAST_INTERVAL: std::time::Duration = std::time::Duration::from_secs(2);

/// 捕获后端（ADR-022 三级降级链：WGC 窗口级 → DXGI 屏幕级 → GDI 兜底）。
///
/// @ai-context: WGC=窗口级（目标窗口不被遮挡，主路径）；DXGI=屏幕级+窗口裁剪
///              （降级 1，当前既有主路径）；GDI=全场景兜底。WGC 失败后不回切
///              （YAGNI——沿用 DXGI 已有 30s 周期重建）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CaptureBackend {
    Wgc,
    Dxgi,
    Gdi,
}

/// 屏幕捕获采样器（WGC 主路径 + DXGI 降级 1 + GDI 兜底 + 周期重建自愈）。
pub struct ScreenCaptureSampler {
    /// ADR-022：WGC 窗口级捕获（主路径；None=未启用/已降级）
    wgc: Option<WgcState>,
    dxgi: Option<DxgiState>,
    /// 当前生效后端（诊断/路由——capture() 按其分派）
    backend: CaptureBackend,
    window_rect: Rect,
    started: std::time::Instant,
    /// 目标窗口句柄（重建 DXGI 与刷新窗口矩形用；None=全屏）
    hwnd: Option<HWND>,
    /// 上次 DXGI 重建尝试时刻（GDI 期间节流）
    last_recreate: std::time::Instant,
    /// TD-033：窗口中心越出输出区域标记——越界后按快速节流重建（不等 30s 周期）
    out_of_bounds: bool,
    /// 待上报事件（worker 每次捕获后取走）
    pending_event: Option<CaptureEvent>,
}

impl ScreenCaptureSampler {
    /// 创建采样器：WGC → DXGI → GDI 逐级尝试（ADR-022 三级自愈链）。
    pub fn new(hwnd: Option<HWND>) -> crate::error::Result<Self> {
        let window_rect = match hwnd {
            Some(h) => {
                let mut rect: RECT = unsafe { std::mem::zeroed() };
                unsafe { GetWindowRect(h, &mut rect) }
                    .map_err(|e| crate::error::AppError::Io(format!("获取窗口矩形失败: {}", e)))?;
                Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
            }
            None => Rect { left: 0, top: 0, right: 0, bottom: 0 },
        };
        // 主路径：WGC（窗口级，抗遮挡）——仅窗口捕获启用；失败逐级降级。
        // 全屏捕获（无目标窗口）无窗口级语义，直接 DXGI。
        let (wgc, dxgi) = match hwnd {
            Some(h) => match WgcState::create(h) {
                Ok(state) => (Some(state), None),
                Err(e) => {
                    // WGC 不可用（Win10 1903 以下/安全桌面/无 DWM/窗口最小化）→ DXGI
                    eprintln!("[ScreenCapture] WGC 初始化失败，降级 DXGI: {}", e);
                    (None, DxgiState::create(hwnd).ok())
                }
            },
            None => (None, DxgiState::create(hwnd).ok()),
        };
        let backend = if wgc.is_some() {
            CaptureBackend::Wgc
        } else if dxgi.is_some() {
            CaptureBackend::Dxgi
        } else {
            eprintln!("[ScreenCapture] DXGI 初始化失败，降级 GDI");
            CaptureBackend::Gdi
        };
        Ok(Self {
            wgc,
            dxgi,
            backend,
            window_rect,
            started: std::time::Instant::now(),
            hwnd,
            // GDI 期间周期尝试重建（backend_name 同步）
            last_recreate: std::time::Instant::now(),
            out_of_bounds: false,
            pending_event: None,
        })
    }

    /// 取走待上报事件（worker 每次捕获后调用；无事件返回 None）。
    pub fn take_event(&mut self) -> Option<CaptureEvent> {
        self.pending_event.take()
    }

    /// 刷新目标窗口矩形（ADR-007）：窗口移动/缩放/分辨率变化后裁剪跟随；
    /// GetWindowRect 失败 = 窗口已关闭 → 回退全屏并记录 WindowLost 事件。
    fn refresh_window_rect(&mut self) {
        let Some(hwnd) = self.hwnd else { return };
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_ok() {
            self.window_rect = Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        } else if self.window_rect.width() > 0 {
            // 窗口已关闭：回退全屏（一次性事件，防重复通知）
            eprintln!("[ScreenCapture] 目标窗口已关闭，回退全屏捕获");
            self.window_rect = Rect { left: 0, top: 0, right: 0, bottom: 0 };
            self.pending_event = Some(CaptureEvent::WindowLost);
        }
    }

    /// GDI 降级期间周期性尝试重建 DXGI 主路径（ADR-007：锁屏/远程桌面恢复后自动切回）。
    /// TD-033：窗口中心越界后按快速节流（2s）重试——跨屏拖拽场景不等 30s 周期。
    fn maybe_recreate_dxgi(&mut self) {
        if self.dxgi.is_some() {
            return;
        }
        let interval = if self.out_of_bounds {
            DXGI_REBIND_FAST_INTERVAL
        } else {
            DXGI_RECREATE_INTERVAL
        };
        if self.last_recreate.elapsed() < interval {
            return;
        }
        self.last_recreate = std::time::Instant::now();
        self.try_create_dxgi();
    }

    /// 尝试创建 DXGI 状态（成功/失败均打印——重建结果可观测，配合"会话无 OCR"排查）。
    fn try_create_dxgi(&mut self) {
        match DxgiState::create(self.hwnd) {
            Ok(state) => {
                eprintln!("[ScreenCapture] DXGI 主路径已恢复");
                self.out_of_bounds = false;
                self.backend = CaptureBackend::Dxgi;
                self.dxgi = Some(state);
            }
            Err(e) => eprintln!("[ScreenCapture] DXGI 重建失败（节流后重试）: {}", e),
        }
    }

    /// TD-033：窗口中心是否越出当前 duplication 输出区域。
    /// 越界意味着窗口已跨显示器移动，当前 DXGI 复制的是旧显示器桌面，
    /// 窗口裁剪必为空画面——调用方应立即弃用并重建（不等 30s 周期重建）。
    fn window_center_out_of_output(&self, state: &DxgiState) -> bool {
        // 全屏捕获（无窗口 / 窗口已关闭回退全屏）没有裁剪目标，不判越界
        if self.window_rect.width() == 0 {
            return false;
        }
        let Some(hwnd) = self.hwnd else { return false };
        let (cx, cy) = window_center(hwnd);
        !point_in_output(cx, cy, state.desktop_coords)
    }

    /// 捕获一帧（可选裁剪区域，相对捕获帧坐标）。
    ///
    /// @ai-context: 返回 Ok(None) 表示无新帧（WGC 无新帧 / DXGI 桌面超时）；
    ///              后端失效自动降级下一级（WGC→DXGI→GDI，ADR-022 三级自愈链）。
    /// @ai-context: WGC 帧=窗口内容（无需窗口矩形裁剪，仅叠加上层 crop）；DXGI
    ///              先按目标窗口矩形裁剪（ADR-002 承诺，审查 M3 修复），再叠加
    ///              区域裁剪；字幕区裁剪（bottom_quarter）由上层基于窗口尺寸计算。
    pub fn capture(&mut self, crop: Option<&Rect>) -> crate::error::Result<Option<CapturedFrame>> {
        // ADR-007：每次捕获前刷新窗口矩形（移动/缩放/关闭自适应）
        self.refresh_window_rect();
        let elapsed_ms = self.started.elapsed().as_millis() as u64;
        // WGC 主路径（窗口级——帧即窗口内容，不做窗口矩形裁剪）
        if self.backend == CaptureBackend::Wgc {
            match self.wgc.as_mut().expect("backend=Wgc 必有 wgc").capture(elapsed_ms) {
                Ok(Some(mut frame)) => {
                    crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, crop);
                    return Ok(Some(frame));
                }
                Ok(None) => return Ok(None),
                Err(e) => {
                    // WGC 失效（窗口关闭/最小化/会话丢失）→ 降级 DXGI（一次性，
                    // 不回切 WGC——YAGNI，沿用 DXGI 周期重建）
                    eprintln!("[ScreenCapture] WGC 失效，降级 DXGI: {}", e);
                    self.wgc = None;
                    self.dxgi = DxgiState::create(self.hwnd).ok();
                    self.backend = if self.dxgi.is_some() {
                        CaptureBackend::Dxgi
                    } else {
                        eprintln!("[ScreenCapture] DXGI 重建失败，降级 GDI");
                        CaptureBackend::Gdi
                    };
                }
            }
        }
        // DXGI 降级 1（屏幕级 + 窗口裁剪——既有逻辑）
        if self.backend == CaptureBackend::Dxgi {
            // TD-033：先判越界再取可变借用（借用规则：不可变检查与可变修改分离）
            let window_out_of_output = self.dxgi.as_ref().is_some_and(|s| self.window_center_out_of_output(s));
            if let Some(state) = self.dxgi.as_mut() {
                // TD-033：窗口中心越出 duplication 输出区域（跨显示器移动）→ 弃用当前
                // DXGI 立即重建；否则持续复制旧显示器桌面，窗口裁剪为空画面（最长 30s 空窗）
                if window_out_of_output {
                    eprintln!("[ScreenCapture] 窗口中心越出输出区域，弃用 DXGI 快速重建（TD-033）");
                    self.dxgi = None;
                    self.out_of_bounds = true;
                    self.try_create_dxgi();
                    self.last_recreate = std::time::Instant::now();
                } else {
                    match state.capture_frame(elapsed_ms) {
                        Ok(Some(mut frame)) => {
                            // 窗口裁剪（全屏时 window_rect 为空矩形，裁剪无效果）
                            let window_crop = (self.window_rect.width() > 0).then_some(self.window_rect);
                            if let Some(w) = window_crop {
                                crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, Some(&w));
                            }
                            crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, crop);
                            return Ok(Some(frame));
                        }
                        Ok(None) => return Ok(None),
                        Err(e) => {
                            // DXGI 失效（远程桌面/锁屏/设备丢失）→ 降级 GDI（ADR-002）
                            eprintln!("[ScreenCapture] DXGI 失效，降级 GDI: {}", e);
                            self.dxgi = None;
                            self.backend = CaptureBackend::Gdi;
                            self.last_recreate = std::time::Instant::now();
                        }
                    }
                }
            }
        }
        // GDI 兜底（全场景可用）；GDI 期间周期尝试重建 DXGI 主路径
        // （ADR-007 自愈；TD-033 越界后为 2s 快速节流）
        self.maybe_recreate_dxgi();
        self.capture_gdi(crop, elapsed_ms)
    }

    /// 当前后端名（诊断/日志——live_session 启动时记录，增强捕获后端可观测性）。
    pub fn backend_name(&self) -> &'static str {
        match self.backend {
            CaptureBackend::Wgc => "wgc",
            CaptureBackend::Dxgi => "dxgi",
            CaptureBackend::Gdi => "gdi",
        }
    }

    fn capture_gdi(&mut self, crop: Option<&Rect>, elapsed_ms: u64) -> crate::error::Result<Option<CapturedFrame>> {
        // 无目标窗口（全屏）或按窗口矩形捕获后统一裁剪
        let target = if self.window_rect.width() > 0 { Some(&self.window_rect) } else { None };
        let mut frame = gdi_capture(target, elapsed_ms)?;
        crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, crop);
        Ok(Some(frame))
    }
}
