//! DXGI 桌面复制状态（TD-033 拆分：DxgiState 自 dxgi_capture.rs 拆出，
//! 见 standards/line-limit-exemptions.md 登记的拆分计划）。
//!
//! @ai-context: DxgiState 内聚 D3D11 设备/上下文 + duplication + staging 纹理与
//!              桌面帧读取；由 ScreenCaptureSampler（dxgi_capture.rs）持有与重建。
//! @ai-context: TD-033 新增 desktop_coords——本 duplication 对应输出的桌面坐标，
//!              供上层判断窗口中心是否越界（跨显示器移动后立即重建，替代最长 30s
//!              周期重建等待；否则持续复制旧显示器桌面，窗口裁剪为空画面）。

use windows::core::Interface;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
    D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
    ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
    DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

use super::dxgi_capture::CapturedFrame;

/// DXGI 状态（设备 + 上下文 + duplication + staging 纹理 + 输出桌面坐标）。
pub(crate) struct DxgiState {
    /// D3D11 设备：仅用于创建 staging 后不再读取，但必须持有——
    /// duplication 对象依赖设备存活（drop 设备会导致后续捕获失败，审查 L10 保留理由）
    #[allow(dead_code)]
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    output_width: u32,
    output_height: u32,
    /// TD-033：本 duplication 对应输出的桌面坐标（窗口中心越界判定基准）
    pub(crate) desktop_coords: (i32, i32, i32, i32),
    staging: ID3D11Texture2D,
}

impl DxgiState {
    /// 创建 D3D11 设备 + 按窗口中心匹配显示器 + duplication + staging 纹理。
    pub(crate) fn create(hwnd: Option<HWND>) -> crate::error::Result<Self> {
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
            let mut desktop_coords = (0, 0, 0, 0);
            for adapter_index in 0..16 {
                let Ok(adapter) = factory.EnumAdapters1(adapter_index) else { break };
                for output_index in 0..16 {
                    let Ok(o) = adapter.EnumOutputs(output_index) else { break };
                    let desc = o.GetDesc().map_err(|e| crate::error::AppError::Io(format!("获取输出描述失败: {}", e)))?;
                    let r = desc.DesktopCoordinates;
                    let coords = (r.left, r.top, r.right, r.bottom);
                    if let Some((cx, cy)) = window_center {
                        // TD-033：匹配规则与运行期越界判定共用同一纯函数，防两处语义漂移
                        if point_in_output(cx, cy, coords) {
                            desktop_coords = coords;
                            output = Some(o);
                            break;
                        }
                    } else if output.is_none() {
                        // 无窗口：取第一个输出
                        desktop_coords = coords;
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

            Ok(Self { device, context, duplication, output_width, output_height, desktop_coords, staging })
        }
    }

    /// 捕获一帧（全桌面）；无变化返回 Ok(None)；ACCESS_LOST 返回 Err（触发降级）。
    pub(crate) fn capture_frame(&mut self, timestamp_ms: u64) -> crate::error::Result<Option<CapturedFrame>> {
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
                    let mut mapped: D3D11_MAPPED_SUBRESOURCE = std::mem::zeroed();
                    self.context
                        .Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                        .map_err(|e| {
                            // TD-010：Map 失败必须释放帧，否则 duplication 帧悬挂（未释放的帧不会被新帧替换）
                            let _ = self.duplication.ReleaseFrame();
                            crate::error::AppError::Io(format!("Map 失败: {}", e))
                        })?;

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
pub(crate) fn window_center(hwnd: HWND) -> (i32, i32) {
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

/// 点是否在输出矩形内（左闭右开，与 DXGI DesktopCoordinates 包含语义一致）。
/// TD-033：create 匹配显示器与运行期越界检查共用同一规则。
pub(crate) fn point_in_output(cx: i32, cy: i32, coords: (i32, i32, i32, i32)) -> bool {
    cx >= coords.0 && cx < coords.2 && cy >= coords.1 && cy < coords.3
}

#[cfg(test)]
mod tests {
    use super::point_in_output;

    #[test]
    fn point_inside_output_is_true() {
        assert!(point_in_output(100, 100, (0, 0, 1920, 1080)));
    }

    #[test]
    fn point_on_left_edge_is_inside() {
        // 左闭：等于 left 属于该输出
        assert!(point_in_output(0, 540, (0, 0, 1920, 1080)));
    }

    #[test]
    fn point_on_right_edge_is_outside() {
        // 右开：等于 right 不属于该输出（相邻显示器从 right 开始）
        assert!(!point_in_output(1920, 540, (0, 0, 1920, 1080)));
    }

    #[test]
    fn point_on_negative_monitor_is_inside_its_own_output() {
        // 副屏在左侧（负坐标）时，其区域内的点应判为内部
        assert!(point_in_output(-500, 300, (-1920, 0, 0, 1080)));
    }

    #[test]
    fn point_below_output_is_outside() {
        assert!(!point_in_output(960, 1080, (0, 0, 1920, 1080)));
    }

    #[test]
    fn point_above_output_is_outside() {
        assert!(!point_in_output(960, -1, (0, 0, 1920, 1080)));
    }
}
