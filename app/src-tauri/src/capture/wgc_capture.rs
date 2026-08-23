//! WGC 窗口级捕获（v0.12.0 M2，ADR-022——三级降级链 WGC→DXGI→GDI 的主路径）。
//!
//! @ai-context: Windows.Graphics.Capture 只捕获目标窗口内容（窗口上方覆盖的
//!              UI/弹窗/任务栏不会入镜——DXGI 屏幕级捕获的遮挡能力债由此根治）。
//! @ai-context: 同步化实现：Direct3D11CaptureFramePool::TryGetNextFrame 轮询
//!              （WinRT 帧缓冲直接取最新帧，比 FrameArrived 异步事件 + 通道更简单，
//!              且与 Session 语义一致）——capture() 保持同步接口，上层 Worker
//!              零改动（变化检测/双速率调度/OCR 编排全部复用）。
//! @ai-context: WGC 不稳定场景（安全桌面/全屏独占 DX 游戏/窗口最小化/远程桌面/
//!              无 DWM）由 dxgi_capture 的 try_create_backend 逐级降级处理；
//!              本模块 create 失败即报错，上层回落 DXGI/GDI。

use windows::core::{HSTRING, Interface};
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::Direct3D11::{IDirect3DDevice, IDirect3DSurface};
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, ID3D11Device,
    ID3D11DeviceContext,
};
use windows::Win32::Graphics::Dxgi::{IDXGIDevice, IDXGISurface, DXGI_MAP_FLAGS, DXGI_MAPPED_RECT};
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::RoGetActivationFactory;
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

use super::dxgi_capture::CapturedFrame;

/// WGC 捕获状态（WinRT 对象保活 + 帧池轮询）。
pub(crate) struct WgcState {
    /// WinRT 设备（保活——pool/session 依赖其存活）
    #[allow(dead_code)]
    device: IDirect3DDevice,
    /// 捕获目标（保活——窗口关闭时捕获会话随之失效 → 上层降级）
    #[allow(dead_code)]
    item: GraphicsCaptureItem,
    #[allow(dead_code)]
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    width: u32,
    height: u32,
}

impl WgcState {
    /// 创建 WGC 捕获（按窗口句柄）：D3D11 设备 → IDirect3DDevice（WinRT 桥）→
    /// GraphicsCaptureItem（interop）→ 帧池 + 捕获会话（StartCapture 后轮询取帧）。
    pub(crate) fn create(hwnd: HWND) -> crate::error::Result<Self> {
        unsafe {
            let mut rect: RECT = std::mem::zeroed();
            GetWindowRect(hwnd, &mut rect)
                .map_err(|e| crate::error::AppError::Io(format!("获取窗口矩形失败: {}", e)))?;
            let width = (rect.right - rect.left).max(1) as u32;
            let height = (rect.bottom - rect.top).max(1) as u32;

            // 1) D3D11 设备（BGRA 支持保证 WGC 兼容）
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;
            let levels = [D3D_FEATURE_LEVEL_11_0];
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                Default::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&levels),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .map_err(|e| crate::error::AppError::Io(format!("创建 D3D11 设备失败: {}", e)))?;
            let device = device.ok_or_else(|| crate::error::AppError::Io("D3D11 设备为空".into()))?;
            let _context = context.ok_or_else(|| crate::error::AppError::Io("D3D11 上下文为空".into()))?;

            // 2) IDXGIDevice → WinRT IDirect3DDevice（CreateDirect3D11DeviceFromDXGIDevice 返回 IInspectable）
            let dxgi: IDXGIDevice = device.cast().map_err(|e| {
                crate::error::AppError::Io(format!("D3D11 设备转 IDXGIDevice 失败: {}", e))
            })?;
            let raw_device: windows::core::IInspectable =
                CreateDirect3D11DeviceFromDXGIDevice(&dxgi).map_err(|e| {
                    crate::error::AppError::Io(format!("创建 WinRT 设备失败: {}", e))
                })?;
            let direct3d: IDirect3DDevice = raw_device.cast().map_err(|e| {
                crate::error::AppError::Io(format!("IInspectable 转 IDirect3DDevice 失败: {}", e))
            })?;

            // 3) 窗口 → GraphicsCaptureItem（IGraphicsCaptureItemInterop::CreateForWindow）
            let factory: windows::core::IInspectable = RoGetActivationFactory(&HSTRING::from(
                "Windows.Graphics.Capture.GraphicsCaptureItem",
            ))
            .map_err(|e| crate::error::AppError::Io(format!("获取 WGC 激活工厂失败: {}", e)))?;
            let interop: IGraphicsCaptureItemInterop = factory.cast().map_err(|e| {
                crate::error::AppError::Io(format!("激活工厂转 interop 失败: {}", e))
            })?;
            let item: GraphicsCaptureItem = interop.CreateForWindow(hwnd).map_err(|e| {
                crate::error::AppError::Io(format!("窗口创建捕获目标失败: {}", e))
            })?;

            // 4) 帧池（2 缓冲——TryGetNextFrame 轮询；池尺寸=窗口初始尺寸，
            //    实际帧尺寸以 ContentSize 为准，见 capture）
            let pool = Direct3D11CaptureFramePool::Create(
                &direct3d,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                2,
                SizeInt32 { Width: width as i32, Height: height as i32 },
            )
            .map_err(|e| crate::error::AppError::Io(format!("创建 WGC 帧池失败: {}", e)))?;
            let session = pool
                .CreateCaptureSession(&item)
                .map_err(|e| crate::error::AppError::Io(format!("创建 WGC 捕获会话失败: {}", e)))?;
            session.StartCapture().map_err(|e| {
                crate::error::AppError::Io(format!("启动 WGC 捕获失败: {}", e))
            })?;

            Ok(Self { device: direct3d, item, session, pool, width, height })
        }
    }

    /// 取最新帧（同步轮询：TryGetNextFrame；无新帧 → Ok(None)）。
    ///
    /// @ai-context: 像素经 WinRT surface → IDirect3DDxgiInterfaceAccess → IDXGISurface
    ///              → Map 直接 CPU 读（B8G8R8A8；帧尺寸以 ContentSize 为准，
    ///              池初值仅作兜底——窗口缩放后 ContentSize 更新）。
    pub(crate) fn capture(&mut self, timestamp_ms: u64) -> crate::error::Result<Option<CapturedFrame>> {
        unsafe {
            let Ok(frame) = self.pool.TryGetNextFrame() else { return Ok(None) };
            let result = (|| -> crate::error::Result<CapturedFrame> {
                let size = frame.ContentSize().unwrap_or(SizeInt32 {
                    Width: self.width as i32,
                    Height: self.height as i32,
                });
                let width = size.Width.max(1) as u32;
                let height = size.Height.max(1) as u32;
                let surface: IDirect3DSurface = frame
                    .Surface()
                    .map_err(|e| crate::error::AppError::Io(format!("取 WGC 帧表面失败: {}", e)))?;
                let access: IDirect3DDxgiInterfaceAccess = surface
                    .cast()
                    .map_err(|e| crate::error::AppError::Io(format!("表面转 DXGI 访问接口失败: {}", e)))?;
                let dxgi: IDXGISurface = access
                    .GetInterface()
                    .map_err(|e| crate::error::AppError::Io(format!("取 DXGI 表面失败: {}", e)))?;
                let mut mapped: DXGI_MAPPED_RECT = std::mem::zeroed();
                dxgi.Map(&mut mapped, DXGI_MAP_FLAGS(1))
                    .map_err(|e| crate::error::AppError::Io(format!("WGC 帧 Map 失败: {}", e)))?;
                let w = width as usize;
                let h = height as usize;
                let pitch = mapped.Pitch.max(0) as usize;
                let mut bgraw = vec![0u8; w * h * 4];
                for y in 0..h {
                    let src = (mapped.pBits as *const u8).add(y * pitch);
                    let dst = &mut bgraw[y * w * 4..(y + 1) * w * 4];
                    dst.copy_from_slice(std::slice::from_raw_parts(src, w * 4));
                }
                dxgi.Unmap().map_err(|e| crate::error::AppError::Io(format!("WGC 帧 Unmap 失败: {}", e)))?;
                Ok(CapturedFrame { width, height, bgraw, timestamp_ms })
            })();
            // 帧必须释放（未释放时帧池挂起——不产生新帧）
            let _ = frame.Close();
            result.map(Some)
        }
    }
}
