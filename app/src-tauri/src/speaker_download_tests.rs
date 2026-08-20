//! 说话人模型下载器单测（TD-2026-08-20-D 清偿 / G1，AAA 模式）。
//!
//! @ai-context: 网络/线程路径不单测（与 model_downloader/structure_models 同口径，
//!              tauri mock runtime 与本机 wry 链接冲突已验证不可用）——
//!              覆盖已就绪判定三态与状态默认；start 并发/状态机留真机验证。

use super::*;

#[test]
fn already_downloaded_nonempty_file() {
    // Arrange：目标目录已有非空 model.onnx
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("model.onnx"), b"fake-model").unwrap();

    // Act/Assert：非空文件 → 已就绪（start 短路依据）
    assert!(already_downloaded(dir.path()));
}

#[test]
fn already_downloaded_empty_or_missing_file() {
    // Arrange：空文件 / 无文件
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("model.onnx"), b"").unwrap();
    let empty = tempfile::tempdir().unwrap();

    // Act/Assert：空文件与缺失均视为未就绪（防装配残缺模型）
    assert!(!already_downloaded(dir.path()));
    assert!(!already_downloaded(empty.path()));
}

#[test]
fn status_defaults_to_idle() {
    // Arrange：全新下载器
    let dl = SpeakerModelDownloader::new();

    // Act/Assert：idle 初始态（前端轮询安全）
    assert_eq!(dl.status().state, "idle");
    assert_eq!(dl.status().downloaded_bytes, 0);
    assert_eq!(dl.status().total_bytes, 0);
    assert!(dl.status().error.is_none());
}

#[test]
fn download_target_path_follows_speaker_engine_convention() {
    // Arrange/Act/Assert：下载目录与 speaker_engine 路径约定一致
    // （model_dir/speaker-embedding/model.onnx——命令层按 SPEAKER_MODEL_REL 推导）
    let model_dir = std::path::Path::new("/models");
    let dir = model_dir.join(crate::speaker_engine::SPEAKER_MODEL_REL);
    assert_eq!(
        dir,
        std::path::Path::new("/models/speaker-embedding/model.onnx")
    );
}
