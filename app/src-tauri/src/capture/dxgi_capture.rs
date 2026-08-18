//! DXGI Desktop Duplication 屏幕捕获（REQ-008，ADR-002）。
//!
//! @ai-context: 主路径用 DXGI 桌面复制（GPU 直取，性能最优）；new 或运行时
//!              捕获失败（远程桌面/锁屏/设备丢失）自动降级 GDI BitBlt（gdi_capture.rs），
//!              调用方无感知。帧输出 BGRA8，支持按窗口矩形裁剪与底部字幕区裁剪。
//! @ai-context: AcquireNextFrame 超时（桌面无变化）是正常分支——返回 Ok(None)，
//!              由上层变化检测/采样调度决定是否继续；DXGI_ERROR_ACCESS_LOST 触发重建。

use windows::core::Interface;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
    D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING, ID3D11Device, ID3D11DeviceContext,
    ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
    DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

use super::frame_diff::{crop_frame, Rect};
use super::gdi_capture::gdi_capture;

/// 捕获帧（BGRA8 像素）。
#[derive(Debug, Clone)]
pub struct CapturedFrame {
    pub width: u32,
    pub height: u32,
    pub bgraw: Vec<u8>,
    /// 相对捕获起点的毫秒时间戳
    pub timestamp_ms: u64,
}

/// 屏幕捕获采样器（DXGI 主路径 + GDI 降级）。
pub struct ScreenCaptureSampler {
    dxgi: Option<DxgiState>,
    window_rect: Rect,
    started: std::time::Instant,
}

/// DXGI 状态（设备 + 上下文 + duplication + staging 纹理）。
struct DxgiState {
    /// D3D11 设备：仅用于创建 staging 后不再读取，但必须持有——
    /// duplication 对象依赖设备存活（drop 设备会导致后续捕获失败，审查 L10 保留理由）
    #[allow(dead_code)]
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    output_width: u32,
    output_height: u32,
    staging: ID3D11Texture2D,
}

impl ScreenCaptureSampler {
    /// 创建采样器：优先 DXGI（按窗口所在显示器 duplication），失败降级 GDI。
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
        let dxgi = DxgiState::create(hwnd).ok();
        Ok(Self { dxgi, window_rect, started: std::time::Instant::now() })
    }

    /// 捕获一帧（可选裁剪区域，相对桌面帧坐标）。
    ///
    /// @ai-context: 返回 Ok(None) 表示桌面无变化（超时）；DXGI 连续失效自动切 GDI。
    /// @ai-context: 先按目标窗口矩形裁剪（ADR-002 承诺，审查 M3 修复），再叠加区域裁剪；
    ///              字幕区裁剪（bottom_quarter）基于窗口尺寸由上层重新计算。
    pub fn capture(&mut self, crop: Option<&Rect>) -> crate::error::Result<Option<CapturedFrame>> {
        let elapsed_ms = self.started.elapsed().as_millis() as u64;
        if let Some(state) = self.dxgi.as_mut() {
            match state.capture_frame(elapsed_ms) {
                Ok(Some(mut frame)) => {
                    // 窗口裁剪（全屏时 window_rect 为空矩形，裁剪无效果）
                    let window_crop = (self.window_rect.width() > 0).then_some(self.window_rect);
                    if let Some(w) = window_crop {
                        crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, Some(&w));
                    }
                    crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, crop);
                    Ok(Some(frame))
                }
                Ok(None) => Ok(None),
                Err(e) => {
                    // DXGI 失效（远程桌面/锁屏/设备丢失）→ 降级 GDI（ADR-002）
                    eprintln!("[ScreenCapture] DXGI 失效，降级 GDI: {}", e);
                    self.dxgi = None;
                    self.capture_gdi(crop, elapsed_ms)
                }
            }
        } else {
            self.capture_gdi(crop, elapsed_ms)
        }
    }

    /// 当前后端名（诊断/日志——live_session 启动时记录，增强捕获后端可观测性）。
    pub fn backend_name(&self) -> &'static str {
        if self.dxgi.is_some() { "dxgi" } else { "gdi" }
    }

    fn capture_gdi(&mut self, crop: Option<&Rect>, elapsed_ms: u64) -> crate::error::Result<Option<CapturedFrame>> {
        // 无目标窗口（全屏）或按窗口矩形捕获后统一裁剪
        let target = if self.window_rect.width() > 0 { Some(&self.window_rect) } else { None };
        let mut frame = gdi_capture(target, elapsed_ms)?;
        crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, crop);
        Ok(Some(frame))
    }
}

impl DxgiState {
    /// 创建 D3D11 设备 + 按窗口中心匹配显示器 + duplication + staging 纹理。
    fn create(hwnd: Option<HWND>) -> crate::error::Result<Self> {
        unsafe {
            // 1) D3D11 设备（BGRA 支持保证 DXGI 兼容）
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;
            let levels = [D3D_FEATURE_LEVEL_11_0];
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                Default::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&levels),
                D3D11_SDK_VERSION, // 必须传宏值 7（传 11 会 E_INVALIDARG，审查 S1 修复）
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .map_err(|e| crate::error::AppError::Io(format!("创建 D3D11 设备失败: {}", e)))?;
            let device = device.ok_or_else(|| crate::error::AppError::Io("D3D11 设备为空".into()))?;
            let context = context.ok_or_else(|| crate::error::AppError::Io("D3D11 上下文为空".into()))?;

            // 2) 枚举输出，按窗口中心点匹配显示器
            let factory: IDXGIFactory1 = CreateDXGIFactory1()
                .map_err(|e| crate::error::AppError::Io(format!("创建 DXGI 工厂失败: {}", e)))?;
            let window_center = hwnd.map(window_center);

            let mut output: Option<IDXGIOutput> = None;
            for adapter_index in 0..16 {
                let Ok(adapter) = factory.EnumAdapters1(adapter_index) else { break };
                for output_index in 0..16 {
                    let Ok(o) = adapter.EnumOutputs(output_index) else { break };
                    let desc = o.GetDesc().map_err(|e| crate::error::AppError::Io(format!("获取输出描述失败: {}", e)))?;
                    if let Some((cx, cy)) = window_center {
                        let r = desc.DesktopCoordinates;
                        if cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom {
                            output = Some(o);
                            break;
                        }
                    } else if output.is_none() {
                        // 无窗口：取第一个输出
                        output = Some(o);
                    }
                }
                if output.is_some() {
                    break;
                }
            }
            let output = output.ok_or_else(|| crate::error::AppError::Io("未找到显示器输出".into()))?;

            // 3) 桌面复制（DuplicateOutput 是 IDXGIOutput1 的方法，需 cast）
            let output1: IDXGIOutput1 = output
                .cast()
                .map_err(|e| crate::error::AppError::Io(format!("输出转 IDXGIOutput1 失败: {}", e)))?;
            let duplication = output1
                .DuplicateOutput(&device)
                .map_err(|e| crate::error::AppError::Io(format!("创建桌面复制失败（远程桌面会话可能不支持）: {}", e)))?;
            let dup_desc = duplication.GetDesc();
            let output_width = dup_desc.ModeDesc.Width;
            let output_height = dup_desc.ModeDesc.Height;

            // 4) staging 纹理（CPU 可读；STAGING 资源禁止 BindFlags，读回无需 SHARED——审查 M2 修复）
            let mut staging: Option<ID3D11Texture2D> = None;
            let tex_desc = D3D11_TEXTURE2D_DESC {
                Width: output_width,
                Height: output_height,
                MipLevels: 1,
                ArraySize: 1,
                Format: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_STAGING,
                BindFlags: 0,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                MiscFlags: 0,
            };
            device
                .CreateTexture2D(&tex_desc, None, Some(&mut staging))
                .map_err(|e| crate::error::AppError::Io(format!("创建 staging 纹理失败: {}", e)))?;
            let staging = staging.ok_or_else(|| crate::error::AppError::Io("staging 纹理为空".into()))?;

            Ok(Self { device, context, duplication, output_width, output_height, staging })
        }
    }

    /// 捕获一帧（全桌面）；无变化返回 Ok(None)；ACCESS_LOST 返回 Err（触发降级）。
    fn capture_frame(&mut self, timestamp_ms: u64) -> crate::error::Result<Option<CapturedFrame>> {
        unsafe {
            let mut frame_info: DXGI_OUTDUPL_FRAME_INFO = std::mem::zeroed();
            let mut resource: Option<IDXGIResource> = None;
            let acquire = self.duplication.AcquireNextFrame(500, &mut frame_info, &mut resource);
            match acquire {
                Ok(()) => {
                    let resource = resource.ok_or_else(|| crate::error::AppError::Io("桌面资源为空".into()))?;
                    let texture: ID3D11Texture2D = resource.cast().map_err(|e| {
                        crate::error::AppError::Io(format!("资源转纹理失败: {}", e))
                    })?;
                    self.context.CopyResource(&self.staging, &texture);
                    let mut mapped: windows::Win32::Graphics::Direct3D11::D3D11_MAPPED_SUBRESOURCE =
                        std::mem::zeroed();
                    self.context
                        .Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                        .map_err(|e| crate::error::AppError::Io(format!("Map 失败: {}", e)))?;

                    let width = self.output_width as usize;
                    let height = self.output_height as usize;
                    let row_pitch = mapped.RowPitch as usize;
                    let mut bgraw = vec![0u8; width * height * 4];
                    for y in 0..height {
                        let src = (mapped.pData as *const u8).add(y * row_pitch);
                        let dst = &mut bgraw[y * width * 4..(y + 1) * width * 4];
                        dst.copy_from_slice(std::slice::from_raw_parts(src, width * 4));
                    }
                    self.context.Unmap(&self.staging, 0);
                    let _ = self.duplication.ReleaseFrame();
                    Ok(Some(CapturedFrame {
                        width: self.output_width,
                        height: self.output_height,
                        bgraw,
                        timestamp_ms,
                    }))
                }
                Err(e) => {
                    // 超时（桌面无变化）正常返回 None；ACCESS_LOST 返回 Err 触发重建/降级
                    if e.code() == DXGI_ERROR_WAIT_TIMEOUT {
                        Ok(None)
                    } else if e.code() == DXGI_ERROR_ACCESS_LOST {
                        Err(crate::error::AppError::Io("DXGI 桌面复制丢失（会话切换）".into()))
                    } else {
                        Err(crate::error::AppError::Io(format!("AcquireNextFrame 失败: {}", e)))
                    }
                }
            }
        }
    }
}

/// 窗口中心点（屏幕坐标）。
fn window_center(hwnd: HWND) -> (i32, i32) {
    unsafe {
        let mut rect: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut rect).is_ok() {
            let cx = rect.left + (rect.right - rect.left) / 2;
            let cy = rect.top + (rect.bottom - rect.top) / 2;
            (cx, cy)
        } else {
            (0, 0)
        }
    }
}
