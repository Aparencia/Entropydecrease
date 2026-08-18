//! GDI BitBlt 屏幕捕获（ADR-002 降级路径）。
//!
//! @ai-context: 仅当 DXGI 不可用时启用（远程桌面/锁屏/无 GPU 加速会话）；
//!              低频采样（0.2-0.5 fps）下 CPU 开销可接受。输出 BGRA8。
//! @ai-context: 一次性调用（每次捕获创建/释放 DC），无持久状态——GDI 资源
//!              泄漏风险最小化（CreateCompatibleDC/DeleteDC 成对）。

use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, ROP_CODE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

use super::dxgi_capture::CapturedFrame;
use super::frame_diff::Rect;

/// GDI 捕获一帧：无窗口（全屏）或按窗口矩形裁剪。
pub fn gdi_capture(target: Option<&Rect>, timestamp_ms: u64) -> crate::error::Result<CapturedFrame> {
    unsafe {
        // 1) 目标区域：窗口矩形（屏幕坐标）或全屏（虚拟屏幕边界）
        let region: RECT = match target {
            Some(r) => RECT { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            None => get_system_metrics_screen(),
        };
        let width = (region.right - region.left).max(0) as u32;
        let height = (region.bottom - region.top).max(0) as u32;
        if width == 0 || height == 0 {
            return Err(crate::error::AppError::Io("捕获区域为空（窗口可能已关闭）".into()));
        }

        // 2) 屏幕 DC + 内存 DC + 位图
        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err(crate::error::AppError::Io("获取屏幕 DC 失败".into()));
        }
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err(crate::error::AppError::Io("创建内存 DC 失败".into()));
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, width as i32, height as i32);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err(crate::error::AppError::Io("创建兼容位图失败".into()));
        }
        let _old = SelectObject(mem_dc, HGDIOBJ(bitmap.0 as *mut _));

        // 3) BitBlt 拷贝
        let result = BitBlt(
            mem_dc,
            0,
            0,
            width as i32,
            height as i32,
            Some(screen_dc),
            region.left,
            region.top,
            ROP_CODE(0x00CC0020), // SRCCOPY
        );

        // TD-014：BitBlt 失败直接清理返回——不再继续 GetDIBits（读取未定义内容）；
        //          清理顺序：先恢复旧对象再 DeleteObject（对象仍选入 DC 时删除会失败）
        if result.is_err() {
            let _ = SelectObject(mem_dc, _old);
            let _ = DeleteObject(HGDIOBJ(bitmap.0 as *mut _));
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err(crate::error::AppError::Io("GDI BitBlt 失败".into()));
        }

        // 4) GetDIBits 读回 BGRA 像素
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // 负值 = 自顶向下
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            bmiColors: [Default::default(); 1],
        };
        let mut bgraw = vec![0u8; (width * height * 4) as usize];
        let got = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height,
            Some(bgraw.as_mut_ptr() as *mut core::ffi::c_void),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // 5) 清理（恢复旧对象 → 成对释放，防泄漏）
        let _ = SelectObject(mem_dc, _old);
        let _ = DeleteObject(HGDIOBJ(bitmap.0 as *mut _));
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);

        if got == 0 {
            return Err(crate::error::AppError::Io("GDI GetDIBits 失败".into()));
        }
        Ok(CapturedFrame { width, height, bgraw, timestamp_ms })
    }
}

/// 虚拟屏幕边界（多显示器合并区域）。
/// @ai-context: TD-011 修复——SM_CXSCREEN 仅主屏，副屏窗口内容会错误；
///              改用 SM_X/Y/CX/CYVIRTUALSCREEN 覆盖全部显示器。
fn get_system_metrics_screen() -> RECT {
    unsafe {
        let left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        RECT { left, top, right: left + width, bottom: top + height }
    }
}
