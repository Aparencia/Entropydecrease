//! backup 单测（REQ-107，AAA 模式）。
//!
//! @ai-context: 全部使用临时目录（tempfile），不触碰真实数据目录；恶意 zip 由测试内
//!              zip::ZipWriter 构造（覆盖路径穿越条目：`..` / 反斜杠伪装 / 绝对路径）。

use std::io::Write;
use std::path::Path;

use super::{create_backup, restore_backup, DB_FILE_NAME, PRE_RESTORE_SUFFIX};

/// 写文件（父目录不存在则创建）。
fn write_file(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, bytes).unwrap();
}

/// 构造单条目 zip（恶意条目名测试复用）。
fn write_single_entry_zip(zip_path: &Path, entry_name: &str, content: &[u8]) {
    let file = std::fs::File::create(zip_path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    zip.start_file(entry_name, zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(content).unwrap();
    zip.finish().unwrap();
}

/// Roundtrip：备份 → 删除 → 恢复，文件内容一致。
#[test]
fn create_then_restore_roundtrip_preserves_content() {
    // Arrange
    let tmp = tempfile::tempdir().unwrap();
    let data_dir = tmp.path().join("data");
    write_file(&data_dir.join(DB_FILE_NAME), b"sqlite-bytes");
    write_file(&data_dir.join("session-images/5/full/a.webp"), b"img-a");
    write_file(&data_dir.join("session-audio/7.wav"), b"audio-wav");
    let backup_dir = tmp.path().join("backups");

    // Act
    let summary = create_backup(&data_dir, &backup_dir, "20260819-120000").unwrap();
    let archive = backup_dir.join("backup-20260819-120000.zip");
    std::fs::remove_dir_all(&data_dir).unwrap(); // 模拟误删
    let restored = restore_backup(&archive, &data_dir).unwrap();

    // Assert
    assert_eq!(summary.file_count, 3);
    assert_eq!(
        summary.total_bytes,
        (b"sqlite-bytes".len() + b"img-a".len() + b"audio-wav".len()) as u64
    );
    assert!(archive.exists());
    assert_eq!(restored, 3);
    assert_eq!(std::fs::read(data_dir.join(DB_FILE_NAME)).unwrap(), b"sqlite-bytes");
    assert_eq!(
        std::fs::read(data_dir.join("session-images/5/full/a.webp")).unwrap(),
        b"img-a"
    );
    assert_eq!(std::fs::read(data_dir.join("session-audio/7.wav")).unwrap(), b"audio-wav");
}

/// 备份 zip 内条目结构与计数正确。
#[test]
fn backup_zip_contains_expected_entries() {
    // Arrange
    let tmp = tempfile::tempdir().unwrap();
    let data_dir = tmp.path().join("data");
    write_file(&data_dir.join(DB_FILE_NAME), b"db");
    write_file(&data_dir.join("session-images/1/thumb/2.webp"), b"t");
    write_file(&data_dir.join("session-audio/1.wav"), b"a");

    // Act
    let summary = create_backup(&data_dir, &tmp.path().join("backups"), "ts").unwrap();
    let file = std::fs::File::open(&summary.archive_path).unwrap();
    let archive = zip::ZipArchive::new(file).unwrap();
    let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();

    // Assert
    assert_eq!(
        names,
        vec![
            DB_FILE_NAME.to_string(),
            "session-images/1/thumb/2.webp".to_string(),
            "session-audio/1.wav".to_string(),
        ]
    );
    assert_eq!(summary.file_count, 3);
}

/// 空数据目录：返回 Ok(0)，仍生成空归档。
#[test]
fn create_backup_with_empty_data_dir_returns_zero_files() {
    // Arrange
    let tmp = tempfile::tempdir().unwrap();
    let data_dir = tmp.path().join("data");
    std::fs::create_dir_all(&data_dir).unwrap();

    // Act
    let summary = create_backup(&data_dir, &tmp.path().join("backups"), "ts").unwrap();

    // Assert
    assert_eq!(summary.file_count, 0);
    assert_eq!(summary.total_bytes, 0);
    assert!(Path::new(&summary.archive_path).exists());
}

/// 路径穿越条目（`../evil`）→ 整体失败，且外部不产生文件。
#[test]
fn restore_backup_rejects_parent_traversal_entry() {
    // Arrange
    let tmp = tempfile::tempdir().unwrap();
    let evil_zip = tmp.path().join("evil.zip");
    write_single_entry_zip(&evil_zip, "../evil.txt", b"pwned");
    let data_dir = tmp.path().join("data");
    std::fs::create_dir_all(&data_dir).unwrap();

    // Act
    let result = restore_backup(&evil_zip, &data_dir);

    // Assert
    assert!(result.is_err());
    assert!(!tmp.path().join("evil.txt").exists());
    assert!(!tmp.path().join("data").join("..").join("evil.txt").exists());
}

/// 反斜杠伪装、绝对路径、盘符前缀条目同样拒绝。
#[test]
fn restore_backup_rejects_backslash_absolute_and_drive_entries() {
    // Arrange & Act & Assert（每类一个独立临时目录）
    for evil_name in ["..\\evil2.txt", "/etc/passwd", "C:/evil3.txt"] {
        let tmp = tempfile::tempdir().unwrap();
        let evil_zip = tmp.path().join(format!("evil-{}.zip", evil_name.len()));
        write_single_entry_zip(&evil_zip, evil_name, b"x");
        let data_dir = tmp.path().join("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        assert!(
            restore_backup(&evil_zip, &data_dir).is_err(),
            "条目应被拒绝: {:?}",
            evil_name
        );
    }
}

/// 恢复前现有 db 改名 .pre-restore（防误删兜底）。
#[test]
fn restore_backup_renames_existing_db_as_pre_restore() {
    // Arrange
    let tmp = tempfile::tempdir().unwrap();
    let data_dir = tmp.path().join("data");
    write_file(&data_dir.join(DB_FILE_NAME), b"old-db");
    let backup_dir = tmp.path().join("backups");
    std::fs::create_dir_all(&backup_dir).unwrap();
    let zip_path = backup_dir.join("b.zip");
    write_single_entry_zip(&zip_path, DB_FILE_NAME, b"new-db");

    // Act
    let restored = restore_backup(&zip_path, &data_dir).unwrap();

    // Assert
    assert_eq!(restored, 1);
    assert_eq!(std::fs::read(data_dir.join(DB_FILE_NAME)).unwrap(), b"new-db");
    assert_eq!(
        std::fs::read(data_dir.join(format!("{}{}", DB_FILE_NAME, PRE_RESTORE_SUFFIX))).unwrap(),
        b"old-db"
    );
}

/// 归档不存在 → Err（不静默成功）。
#[test]
fn restore_backup_missing_archive_returns_err() {
    // Arrange
    let tmp = tempfile::tempdir().unwrap();
    let data_dir = tmp.path().join("data");

    // Act
    let result = restore_backup(&tmp.path().join("nope.zip"), &data_dir);

    // Assert
    assert!(result.is_err());
}
