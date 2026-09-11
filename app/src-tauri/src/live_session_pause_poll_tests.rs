//! 暂停轮询门控真值表单测（AAA；纯函数，无 IO 依赖）。
//!
//! @ai-context: 随 `light_poll_enabled` 迁出 live_session_frame.rs（D5）——原文件
//!              `use super::*` 会因函数迁出而断链，故实现与测试同迁，保真值表覆盖。
//! @ai-context: bgra_* 两例仍留在 live_session_frame_tests.rs（实为 region_ocr 逻辑）。

use super::*;
use crate::pause_state::PauseConditions;

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
