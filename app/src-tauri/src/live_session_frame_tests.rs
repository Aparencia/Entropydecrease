//! 帧处理纯逻辑单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 live_session_frame.rs 以 #[cfg(test)] #[path] 引入，
//!              保持实现文件 ≤300 行（AGENTS.md §3）。
//! @ai-context: bgra_to_rgb_image 已随 M4 编排函数移入 region_ocr.rs
//!              （保持本文件内联测试的引用更新）。

use super::*;
use crate::pause_state::PauseConditions;
use crate::region_ocr::bgra_to_rgb_image;

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

#[test]
fn light_poll_runs_for_media_or_foreground_pause_but_not_manual() {
    // Arrange & Act & Assert（P2-4 门控真值表）：
    assert!(!light_poll_enabled(PauseConditions { manual: true, foreground: false, media: false }),
        "manual 锁存期全冻结（用户冻结语义，不跟随任何自动源）");
    assert!(light_poll_enabled(PauseConditions { manual: false, foreground: false, media: true }),
        "media 暂停期维持轻量轮询（既有语义不回归）");
    assert!(light_poll_enabled(PauseConditions { manual: false, foreground: true, media: false }),
        "P2-4：fg 暂停期也维持媒体检测——离开期间视频暂停/结束即锁存 media");
    assert!(light_poll_enabled(PauseConditions { manual: false, foreground: true, media: true }));
    assert!(!light_poll_enabled(PauseConditions::default()), "防御：无持因不轮询");
}

#[test]
fn light_poll_manual_latch_overrides_every_auto_condition() {
    // Arrange & Act & Assert：manual 与任意 auto 条件叠加时门控仍关闭
    assert!(!light_poll_enabled(PauseConditions { manual: true, foreground: true, media: false }));
    assert!(!light_poll_enabled(PauseConditions { manual: true, foreground: false, media: true }));
    assert!(!light_poll_enabled(PauseConditions { manual: true, foreground: true, media: true }));
}
