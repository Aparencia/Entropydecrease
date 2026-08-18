//! 临时诊断示例：验证本机「屏幕捕获 + OCR」是否可用（定位课堂助手无 OCR 根因）。
//!
//! 运行：cargo run --example capture_ocr_diag
//! 用途：分别验证 ① OCR 引擎加载 ② GDI 捕获 ③ DXGI 桌面复制 ④ GDI 帧 OCR，
//!       打印每步结果；诊断后应删除本文件。

use std::time::Instant;

use oar_ocr::oarocr::{OAROCR, OAROCRBuilder};

fn main() {
    println!("=== [1] OCR 引擎加载 ===");
    let t = Instant::now();
    let ocr: OAROCR = match OAROCRBuilder::new(
        "pp-ocrv6_tiny_det.onnx",
        "pp-ocrv6_tiny_rec.onnx",
        "ppocrv6_tiny_dict.txt",
    )
    .build()
    {
        Ok(ocr) => {
            println!("OCR 引擎加载成功（{}ms）", t.elapsed().as_millis());
            ocr
        }
        Err(e) => {
            println!("OCR 引擎加载失败: {e}");
            return;
        }
    };

    println!("=== [3] DXGI 桌面复制探测 ===");
    println!("{}", dxgi_probe());

    println!("=== [2] GDI 屏幕捕获 ===");
    match gdi_capture_full() {
        Ok((w, h, bgraw)) => {
            println!("GDI 捕获成功：{w}x{h}，{} 字节", bgraw.len());
            let nonblack = bgraw
                .chunks_exact(4)
                .filter(|px| px[0] != 0 || px[1] != 0 || px[2] != 0)
                .count();
            println!(
                "非黑像素比例：{:.1}%",
                nonblack as f64 / (w as u64 * h as u64) as f64 * 100.0
            );
            // BGRA → RGB
            let mut rgb = Vec::with_capacity((w * h * 3) as usize);
            for px in bgraw.chunks_exact(4) {
                rgb.extend_from_slice(&[px[2], px[1], px[0]]);
            }
            let img = image::RgbImage::from_raw(w, h, rgb).expect("rgb image");
            println!("=== [4] OCR 识别（整帧，可能较慢）===");
            let t = Instant::now();
            match ocr.predict(vec![img]) {
                Ok(pages) => {
                    println!("OCR 完成（{}ms），页数 {}", t.elapsed().as_millis(), pages.len());
                    for (i, page) in pages.iter().enumerate() {
                        println!("--- 页 {i}，区域数 {} ---", page.text_regions.len());
                        for r in &page.text_regions {
                            if let Some((text, score)) = r.text_with_confidence() {
                                println!("  [{score:.3}] {text}");
                            }
                        }
                    }
                }
                Err(e) => println!("OCR 识别失败: {e}"),
            }
        }
        Err(e) => println!("GDI 捕获失败: {e}"),
    }
}

/// GDI 全屏捕获（BitBlt + GetDIBits），返回 (宽, 高, BGRA 像素)。
fn gdi_capture_full() -> Result<(u32, u32, Vec<u8>), String> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, ROP_CODE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };

    unsafe {
        let left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = (GetSystemMetrics(SM_CXVIRTUALSCREEN)).max(1) as u32;
        let height = (GetSystemMetrics(SM_CYVIRTUALSCREEN)).max(1) as u32;
        let region = RECT { left, top, right: left + width as i32, bottom: top + height as i32 };

        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("GetDC 失败".into());
        }
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err("CreateCompatibleDC 失败".into());
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, width as i32, height as i32);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err("CreateCompatibleBitmap 失败".into());
        }
        let _old = SelectObject(mem_dc, HGDIOBJ(bitmap.0 as *mut _));
        let r = BitBlt(
            mem_dc,
            0,
            0,
            width as i32,
            height as i32,
            Some(screen_dc),
            region.left,
            region.top,
            ROP_CODE(0x00CC0020),
        );
        if r.is_err() {
            let _ = SelectObject(mem_dc, _old);
            let _ = DeleteObject(HGDIOBJ(bitmap.0 as *mut _));
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err("BitBlt 失败".into());
        }
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
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
        let _ = SelectObject(mem_dc, _old);
        let _ = DeleteObject(HGDIOBJ(bitmap.0 as *mut _));
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);
        if got == 0 {
            return Err("GetDIBits 失败".into());
        }
        Ok((width, height, bgraw))
    }
}

/// 探测 DXGI Desktop Duplication 是否可用（返回描述文本）。
fn dxgi_probe() -> String {
    use windows::core::Interface;
    use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, ID3D11Device,
    };
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput1};

    unsafe {
        let mut device: Option<ID3D11Device> = None;
        let levels = [D3D_FEATURE_LEVEL_11_0];
        let r = D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&levels),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            None,
        );
        if let Err(e) = r {
            return format!("D3D11CreateDevice 失败: {e}");
        }
        let Some(device) = device else {
            return "D3D11 设备为空".into();
        };
        let factory: IDXGIFactory1 = match CreateDXGIFactory1() {
            Ok(f) => f,
            Err(e) => return format!("CreateDXGIFactory1 失败: {e}"),
        };
        let adapter = match factory.EnumAdapters1(0) {
            Ok(a) => a,
            Err(e) => return format!("EnumAdapters1 失败: {e}"),
        };
        let output = match adapter.EnumOutputs(0) {
            Ok(o) => o,
            Err(e) => return format!("EnumOutputs 失败: {e}"),
        };
        let output1: IDXGIOutput1 = match output.cast() {
            Ok(o) => o,
            Err(e) => return format!("cast IDXGIOutput1 失败: {e}"),
        };
        match output1.DuplicateOutput(&device) {
            Ok(_) => "DXGI DuplicateOutput 成功（桌面复制可用）".to_string(),
            Err(e) => format!("DXGI DuplicateOutput 失败: {e}"),
        }
    }
}
