//! BGRA8 帧 → BMP 编码（纯函数）。
//!
//! @ai-context: OCR 引擎（oar-ocr）按文件路径读图，屏幕捕获产出内存 BGRA8；
//!              实时链路用本模块编码为 BMP 临时文件后送 OCR（M7 编排）。
//! @ai-context: 32bit 自顶向下 BMP（负 biHeight），无调色板，编码零依赖。

/// 把 BGRA8 像素编码为 BMP 字节流。
///
/// @ai-context: 输入尺寸必须与像素长度匹配（width*height*4）；空像素返回 None。
pub fn bmp_encode(bgra: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let pixel_len = width as usize * height as usize * 4;
    if width == 0 || height == 0 || bgra.len() != pixel_len {
        return None;
    }

    // 14 字节文件头 + 40 字节信息头
    let row_size = width as usize * 4;
    let data_size = row_size * height as usize;
    let file_size = 14 + 40 + data_size;

    let mut out = Vec::with_capacity(file_size);
    // BITMAPFILEHEADER
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&(file_size as u32).to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes()); // reserved1
    out.extend_from_slice(&0u16.to_le_bytes()); // reserved2
    out.extend_from_slice(&54u32.to_le_bytes()); // pixel data offset
    // BITMAPINFOHEADER（自顶向下：负高度）
    out.extend_from_slice(&40u32.to_le_bytes()); // header size
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&(height as i32).wrapping_neg().to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // planes
    out.extend_from_slice(&32u16.to_le_bytes()); // bpp
    out.extend_from_slice(&0u32.to_le_bytes()); // compression BI_RGB
    out.extend_from_slice(&(data_size as u32).to_le_bytes());
    out.extend_from_slice(&0i32.to_le_bytes()); // x ppm
    out.extend_from_slice(&0i32.to_le_bytes()); // y ppm
    out.extend_from_slice(&0u32.to_le_bytes()); // colors used
    out.extend_from_slice(&0u32.to_le_bytes()); // important colors
    // 像素（BGRA8 直接拷贝，每行 4 字节对齐天然满足）
    out.extend_from_slice(bgra);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_valid_bmp_header() {
        // Arrange：4x4 BGRA 黑像素
        let bgra = vec![0u8; 4 * 4 * 4];
        // Act
        let bmp = bmp_encode(&bgra, 4, 4).expect("encode");
        // Assert：BM 魔数 + 文件大小（14+40+64=118）
        assert_eq!(&bmp[0..2], b"BM");
        assert_eq!(bmp.len(), 118);
        assert_eq!(&bmp[2..6], &118u32.to_le_bytes());
        assert_eq!(&bmp[10..14], &54u32.to_le_bytes());
    }

    #[test]
    fn encodes_topdown_height() {
        // Arrange & Act
        let bgra = vec![0u8; 2 * 2 * 4];
        let bmp = bmp_encode(&bgra, 2, 2).expect("encode");
        // Assert：biHeight 为负（自顶向下，无需像素翻转）
        let height_bytes = &bmp[22..26];
        let height = i32::from_le_bytes([height_bytes[0], height_bytes[1], height_bytes[2], height_bytes[3]]);
        assert_eq!(height, -2);
    }

    #[test]
    fn rejects_mismatched_size() {
        // Act & Assert：尺寸与像素长度不匹配 → None
        assert!(bmp_encode(&[0u8; 10], 4, 4).is_none());
        assert!(bmp_encode(&[], 0, 0).is_none());
    }

    #[test]
    fn preserves_pixel_bytes() {
        // Arrange：单像素，B=1,G=2,R=3,A=4
        let bgra = vec![1u8, 2, 3, 4];
        // Act
        let bmp = bmp_encode(&bgra, 1, 1).expect("encode");
        // Assert：像素区（offset 54）原样保留
        assert_eq!(&bmp[54..58], &[1u8, 2, 3, 4]);
    }
}
