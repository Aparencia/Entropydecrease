//! 数据备份/恢复（REQ-107，TRUST-1）。
//!
//! @ai-context: 把数据目录（SQLite entropy.db + session-images/ + session-audio/）打包为
//!              zip，提供备份与恢复入口（误删/磁盘损坏可恢复；与 E1 导出解耦，v0.7.0 裁决）。
//!              纯 IO 模块：不依赖 AppState，路径由命令层注入，可用临时目录单测。
//! @ai-context: 安全红线（security.md §4）——zip 路径穿越防护：恢复时条目路径必须
//!              resolve 后仍在 data_dir 内（拒绝绝对路径 / `..` / 反斜杠伪装 / 盘符前缀），
//!              命中任一不安全条目则整体失败（fail-closed，不部分解压、不触碰数据目录）。
//! @ai-context: 决策：恢复前把现有 entropy.db 改名为 entropy.db.pre-restore（简单防误删
//!              兜底，不做整目录快照）；zip 只存文件不存空目录（恢复时按需重建）；
//!              备份采用固定条目清单打包（不含 backup 目录自身），防递归打包历史备份。

use std::io::Write;
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, Result};

/// 数据库文件名（与 lib.rs setup 中 Db::open 的路径约定一致，v0.7.0 核查确认）。
pub const DB_FILE_NAME: &str = "entropy.db";
/// 恢复前现有 db 的改名后缀（防误删兜底）。
const PRE_RESTORE_SUFFIX: &str = ".pre-restore";
/// 打包条目清单（数据目录下固定条目；新增存储目录须在此登记）。
const BACKUP_ENTRIES: [&str; 3] = [DB_FILE_NAME, "session-images", "session-audio"];

/// 备份摘要（命令层序列化返回前端）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub archive_path: String,
    pub file_count: usize,
    pub total_bytes: u64,
}

/// 创建备份：把 data_dir 下固定条目打包为 backup_dir/backup-<now_ts>.zip。
///
/// @ai-context: now_ts 由调用方生成（命令层用 Unix 秒；测试用固定值保证确定性）。
/// @param data_dir   - 应用数据目录（含 entropy.db / session-images / session-audio）
/// @param backup_dir - 备份输出目录（不存在则创建；即使位于 data_dir 内，
///                     固定条目清单不含 backup 目录自身，不会递归打包）
/// @returns 备份摘要（归档路径 / 文件数 / 总字节）；空数据目录返回 Ok(0 文件)
pub fn create_backup(data_dir: &Path, backup_dir: &Path, now_ts: &str) -> Result<BackupSummary> {
    std::fs::create_dir_all(backup_dir)?;
    let archive_path = backup_dir.join(format!("backup-{}.zip", now_ts));
    let file = std::fs::File::create(&archive_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut file_count = 0usize;
    let mut total_bytes = 0u64;
    for entry in BACKUP_ENTRIES {
        let rel = Path::new(entry);
        let src = data_dir.join(rel);
        if !src.exists() {
            continue; // 缺条目不报错（如从未启用音频落盘的安装）
        }
        add_tree_to_zip(&mut zip, &src, rel, &options, &mut file_count, &mut total_bytes)?;
    }
    zip.finish()
        .map_err(|e| AppError::Io(format!("完成 zip 写入失败: {}", e)))?;
    Ok(BackupSummary {
        archive_path: archive_path.to_string_lossy().into_owned(),
        file_count,
        total_bytes,
    })
}

/// 递归把目录树写入 zip（条目名统一 `/` 分隔，符合 zip 规范）。
fn add_tree_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    src: &Path,
    rel: &Path,
    options: &zip::write::SimpleFileOptions,
    file_count: &mut usize,
    total_bytes: &mut u64,
) -> Result<()> {
    if src.is_dir() {
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let child_rel = rel.join(entry.file_name());
            add_tree_to_zip(zip, &entry.path(), &child_rel, options, file_count, total_bytes)?;
        }
        return Ok(());
    }
    let name = rel.to_string_lossy().replace('\\', "/");
    let bytes = std::fs::read(src)?;
    zip.start_file(name, *options)
        .map_err(|e| AppError::Io(format!("写入 zip 条目失败: {}", e)))?;
    zip.write_all(&bytes)
        .map_err(|e| AppError::Io(format!("写入 zip 数据失败: {}", e)))?;
    *file_count += 1;
    *total_bytes += bytes.len() as u64;
    Ok(())
}

/// 从备份 zip 恢复：解压覆盖回 data_dir，返回恢复的文件数。
///
/// @ai-context: 两遍执行：第一遍全量校验条目名（路径穿越 fail-closed——不安全 zip
///              完全不触碰数据目录）；第二遍先改名现有 db（防误删兜底）再解压。
/// @ai-context: 已改名 db 保留为 entropy.db.pre-restore，恢复失败时旧库可手工找回
///              （文档化决策：不做自动回滚，避免回滚逻辑自身成为数据风险）。
pub fn restore_backup(archive: &Path, data_dir: &Path) -> Result<usize> {
    std::fs::create_dir_all(data_dir)?;
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Io(format!("备份文件不是有效 zip: {}", e)))?;

    // 第一遍：全量校验条目名（目录条目同样校验——`../evil/` 也不得放行）
    for i in 0..zip.len() {
        let entry = zip
            .by_index(i)
            .map_err(|e| AppError::Io(format!("读取备份条目失败: {}", e)))?;
        if safe_dest(data_dir, entry.name()).is_none() {
            return Err(AppError::Io(format!(
                "备份条目路径不安全，已中止恢复: {}",
                entry.name()
            )));
        }
    }

    // 防误删：现有 db 改名 .pre-restore
    let db_path = data_dir.join(DB_FILE_NAME);
    if db_path.exists() {
        std::fs::rename(&db_path, data_dir.join(format!("{}{}", DB_FILE_NAME, PRE_RESTORE_SUFFIX)))?;
    }

    // 第二遍：解压（条目已在第一遍校验，此处仅做防御性二次检查）
    let mut restored = 0usize;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| AppError::Io(format!("读取备份条目失败: {}", e)))?;
        if entry.is_dir() {
            continue; // zip 不存空目录；父目录在写文件时按需创建
        }
        let dest = safe_dest(data_dir, entry.name())
            .ok_or_else(|| AppError::Io("备份条目路径不安全，已中止恢复".to_string()))?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
        restored += 1;
    }
    Ok(restored)
}

/// 校验 zip 条目名并得到安全目标路径（路径穿越防护核心）。
///
/// @ai-context: 拒绝：空名 / 绝对路径 / 盘符前缀（C:evil）/ `..` 父目录 / RootDir /
///              Prefix 组件；先把反斜杠归一化为 `/`（zip 规范用 `/`，Windows 上
///              `..\evil` 若不归一化会被当作普通文件名——跨平台口径一致）。
/// @returns None 表示条目不安全（调用方须 fail-closed）
fn safe_dest(base: &Path, name: &str) -> Option<PathBuf> {
    if name.is_empty() {
        return None;
    }
    let normalized = name.replace('\\', "/");
    let rel = Path::new(&normalized);
    if rel.is_absolute() {
        return None;
    }
    // 盘符前缀（"C:/evil" 在非 Windows 平台不被 is_absolute 捕获）
    let bytes = normalized.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return None;
    }
    for comp in rel.components() {
        if matches!(comp, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return None;
        }
    }
    Some(base.join(rel))
}

#[cfg(test)]
#[path = "backup_tests.rs"]
mod tests;
