//! feature_flags 单测（AAA 模式）。

use crate::feature_flags::FeatureFlags;

#[test]
fn defaults_all_off() {
    // Arrange/Act
    let flags = FeatureFlags::default();
    // Assert：保守默认——feed 捕获默认关
    assert!(!flags.feed_capture);
}

#[test]
fn set_get_roundtrip_and_unknown_rejected() {
    // Arrange
    let mut flags = FeatureFlags::default();
    // Act/Assert：已知开关可写可读
    assert!(flags.set("feed_capture", true));
    assert_eq!(flags.get("feed_capture"), Some(true));
    // 未知开关诚实拒绝（不猜不造）
    assert!(!flags.set("nonexistent", true));
    assert_eq!(flags.get("nonexistent"), None);
}

#[test]
fn load_missing_or_corrupt_falls_back_default() {
    // Arrange：不存在的路径与损坏内容
    let missing = std::path::PathBuf::from("./no_such_feature_flags.json");
    let dir = std::env::temp_dir().join("ff_corrupt_test");
    let _ = std::fs::create_dir_all(&dir);
    let corrupt = dir.join("corrupt.json");
    let _ = std::fs::write(&corrupt, "{ not json !!");
    // Act
    let a = FeatureFlags::load(&missing);
    let b = FeatureFlags::load(&corrupt);
    // Assert：均回退默认（不阻断启动纪律）
    assert_eq!(a, FeatureFlags::default());
    assert_eq!(b, FeatureFlags::default());
}

#[test]
fn save_and_reload_persists() {
    // Arrange
    let dir = std::env::temp_dir().join("ff_save_test");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("flags.json");
    let mut flags = FeatureFlags::default();
    flags.feed_capture = true;
    // Act
    flags.save(&path).expect("save");
    let loaded = FeatureFlags::load(&path);
    // Assert
    assert!(loaded.feed_capture);
}
