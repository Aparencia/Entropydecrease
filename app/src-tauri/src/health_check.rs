//! 资源健康巡检（REQ-042 F2 / v0.4.0 M7）。
//!
//! @ai-context: 磁盘空间 / 模型文件完整性 / 引擎线程心跳三查 → 会话页状态徽标。
//!              磁盘写满崩溃是最常见隐性故障（本地优先架构数据全落盘）；
//!              模型文件缺失提前于"首次识别失败"暴露；引擎线程心跳让
//!              线程静默死亡（panic/被系统回收）可见。
//! @ai-context: 纯检查函数可单测（注入路径）；系统调用（GetDiskFreeSpaceExW）
//!              仅 Windows（非 Windows 返回 None，调用方容忍）。

/// 磁盘告警阈值（剩余 <500MB 提示清理）。
pub const DISK_WARN_BYTES: u64 = 500 * 1024 * 1024;

/// 磁盘剩余空间（Windows；非 Windows 返回 None）。
#[cfg(target_os = "windows")]
pub fn disk_free_bytes(path: &std::path::Path) -> Option<u64> {
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide = windows::core::HSTRING::from(path.to_string_lossy().as_ref());
    unsafe {
        let mut free: u64 = 0;
        GetDiskFreeSpaceExW(windows::core::PCWSTR(wide.as_ptr()), Some(&mut free), None, None)
            .ok()?;
        Some(free)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn disk_free_bytes(_path: &std::path::Path) -> Option<u64> {
    None
}

/// 模型文件缺失清单（存在性检查；路径由调用方注入，可单测）。
pub fn missing_model_files(paths: &[(&str, &std::path::Path)]) -> Vec<String> {
    paths
        .iter()
        .filter(|(_, p)| !p.exists())
        .map(|(name, _)| name.to_string())
        .collect()
}

/// 磁盘剩余是否告警。
pub fn disk_warn(free_bytes: Option<u64>) -> bool {
    free_bytes.is_some_and(|f| f < DISK_WARN_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_models_lists_only_absent() {
        let dir = tempfile::tempdir().unwrap();
        let existing = dir.path().join("a.onnx");
        std::fs::write(&existing, b"x").unwrap();
        let missing = dir.path().join("b.onnx");
        let list = missing_model_files(&[
            ("encoder", &existing),
            ("decoder", &missing),
        ]);
        assert_eq!(list, vec!["decoder".to_string()]);
    }

    #[test]
    fn no_missing_models_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.txt");
        std::fs::write(&p, b"x").unwrap();
        assert!(missing_model_files(&[("a", &p)]).is_empty());
    }

    #[test]
    fn disk_warn_threshold() {
        assert!(disk_warn(Some(DISK_WARN_BYTES - 1)));
        assert!(!disk_warn(Some(DISK_WARN_BYTES)));
        assert!(!disk_warn(Some(DISK_WARN_BYTES + 1024)));
        assert!(!disk_warn(None), "未知剩余空间不告警（避免误报）");
    }
}
