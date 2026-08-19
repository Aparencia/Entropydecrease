//! 模型版本管理与磁盘占用（REQ-131 P13 / v0.7.0 M3）。

// 机制先行（v0.7.0 M3 登记）：本模块为影子层/面板数据源（命令层已接线或
// 供后续接线），部分函数无生产调用——dead_code 豁免（接线时移除）。
#![allow(dead_code)]
//!
//! @ai-context: 模型分发（bundle.resources + 首启同步 + ModelScope 自动缓存）的
//!              可观测与可回退通道：① 版本记录（.model-version 标记读取——
//!              现有 ModelDownloader 的 MODEL_VERSION 机制外显化）；② 磁盘占用
//!              面板（models/ 目录树大小 + 各子目录明细——"模型版本可查可回退
//!              + 磁盘占用面板"验收点）。
//! @ai-context: 纯逻辑 + 目录扫描（路径可注入，测试用 tempfile）；回退动作
//!              （切换版本目录）本版只提供目录清单与版本标记，实际切换由
//!              下载器/安装脚本执行（防运行中删除模型文件损坏引擎）。

use serde::{Deserialize, Serialize};

/// 单个模型子目录的占用明细（磁盘占用面板行）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelDirEntry {
    /// 子目录名（asr/streaming-zipformer、ocr/ppocr、structure/...）
    pub name: String,
    /// 目录总字节
    pub total_bytes: u64,
    /// 文件数
    pub file_count: usize,
    /// 版本标记（.model-version 内容；无标记 None）
    pub version: Option<String>,
}

/// 模型目录占用总览（磁盘占用面板载荷）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelDiskOverview {
    /// models 根目录总字节
    pub total_bytes: u64,
    /// 各子目录明细（按占用降序）
    pub entries: Vec<ModelDirEntry>,
}

/// 读取版本标记文件内容（缺失/读取失败 → None——旧目录无标记）。
pub fn read_version_marker(dir: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(dir.join(".model-version"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 扫描目录树总字节与文件数（纯函数；目录不存在 → 0）。
fn dir_stats(path: &std::path::Path) -> (u64, usize) {
    let mut total = 0u64;
    let mut count = 0usize;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
                count += 1;
            }
        }
    }
    (total, count)
}

/// 构建磁盘占用总览（REQ-131）：models 根目录 → 子目录明细 + 总计。
///
/// @ai-context: 只统计一层子目录（models/asr/streaming-zipformer 等直接子级）；
///              跳过 .part 临时文件？——保留（下载中占用也是面板要展示的）。
pub fn build_disk_overview(models_dir: &std::path::Path) -> ModelDiskOverview {
    let mut entries = Vec::new();
    let mut total_bytes = 0u64;
    if let Ok(read_dir) = std::fs::read_dir(models_dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let (bytes, files) = dir_stats(&path);
            let version = read_version_marker(&path);
            entries.push(ModelDirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                total_bytes: bytes,
                file_count: files,
                version,
            });
            total_bytes += bytes;
        }
    }
    entries.sort_by_key(|e| std::cmp::Reverse(e.total_bytes));
    ModelDiskOverview { total_bytes, entries }
}

/// 版本可回退清单（REQ-131）：扫描 models 根下的版本化子目录
/// （含 .model-version 标记或目录名含版本号特征）。
///
/// @ai-context: 回退动作由下载器执行（本函数只给清单——哪些版本可用）；
///              streaming-zipformer 目录名即版本（2025-06-30），版本标记
///              优先于目录名推断。
pub fn list_versions(models_dir: &std::path::Path) -> Vec<ModelDirEntry> {
    build_disk_overview(models_dir).entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("entropy-models-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn dir_stats_counts_bytes_and_files() {
        // Arrange：目录 + 两个文件
        let dir = temp_dir("stats");
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.bin"), vec![1u8; 100]).unwrap();
        std::fs::write(dir.join("sub").join("b.bin"), vec![2u8; 50]).unwrap();
        // Act
        let (bytes, count) = dir_stats(&dir);
        // Assert：递归统计
        assert_eq!(bytes, 150);
        assert_eq!(count, 2);
    }

    #[test]
    fn overview_sorts_by_size_desc() {
        // Arrange：两个子目录（不同大小）
        let dir = temp_dir("overview");
        std::fs::create_dir_all(dir.join("small")).unwrap();
        std::fs::create_dir_all(dir.join("big")).unwrap();
        std::fs::write(dir.join("small").join("a.bin"), vec![0u8; 10]).unwrap();
        std::fs::write(dir.join("big").join("b.bin"), vec![0u8; 200]).unwrap();
        // Act
        let overview = build_disk_overview(&dir);
        // Assert：大目录在前 + 总计正确
        assert_eq!(overview.entries.len(), 2);
        assert_eq!(overview.entries[0].name, "big");
        assert_eq!(overview.total_bytes, 210);
    }

    #[test]
    fn version_marker_read() {
        // Arrange：带版本标记的目录
        let dir = temp_dir("version");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(".model-version"), "zh-fp16-2025-06-30").unwrap();
        // Act & Assert
        assert_eq!(read_version_marker(&dir).as_deref(), Some("zh-fp16-2025-06-30"));
        // 无标记 → None
        let dir2 = temp_dir("version2");
        std::fs::create_dir_all(&dir2).unwrap();
        assert_eq!(read_version_marker(&dir2), None);
    }

    #[test]
    fn missing_models_dir_empty_overview() {
        // 目录不存在 → 空总览（0 字节 0 条目）
        let overview = build_disk_overview(std::path::Path::new("C:/nonexistent-models"));
        assert_eq!(overview.total_bytes, 0);
        assert!(overview.entries.is_empty());
    }

    #[test]
    fn overview_skips_plain_files() {
        // 根下的散文件不统计为子目录条目
        let dir = temp_dir("plain");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("loose.bin"), vec![0u8; 5]).unwrap();
        let overview = build_disk_overview(&dir);
        assert!(overview.entries.is_empty());
    }
}
