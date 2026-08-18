//! 帧处理纯逻辑单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 live_session_frame.rs 以 #[cfg(test)] #[path] 引入，
//!              保持实现文件 ≤300 行（AGENTS.md §3）。

use super::bgra_to_rgb_image;

#[test]
fn bgra_converts_to_rgb_in_memory() {
    // Arrange：2x1 像素 BGRA（B=1,G=2,R=3 / B=4,G=5,R=6）
    let bgraw = vec![1u8, 2, 3, 255, 4, 5, 6, 255];
    // Act
    let img = bgra_to_rgb_image(&bgraw, 2, 1).expect("convert");
    // Assert：像素顺序 RGB，首像素 (3,2,1)
    assert_eq!(img.dimensions(), (2, 1));
    assert_eq!(img.as_raw(), &[3u8, 2, 1, 6, 5, 4]);
}

#[test]
fn bgra_rejects_mismatched_size() {
    // Act & Assert：尺寸与像素长度不匹配 → None
    assert!(bgra_to_rgb_image(&[0u8; 3], 2, 1).is_none());
    assert!(bgra_to_rgb_image(&[], 0, 0).is_none());
}
