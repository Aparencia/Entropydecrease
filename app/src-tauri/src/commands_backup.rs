//! 备份/恢复 Tauri commands（REQ-107，TRUST-1）。
//!
//! @ai-context: 命令层只做参数提取与错误映射（AGENTS.md §6）；备份目录取
//!              data_dir/backups（与数据同卷，用户可另行拷贝到外部存储）；
//!              恢复入参仅 archive_path（zip 文件），解压目标恒为应用数据目录
//!              （IPC 文件访问限定应用数据目录——AGENTS 安全红线）。
//! @ai-context: 错误按项目惯例映射为 String（AppError 未派生 Serialize，Tauri command
//!              错误需可序列化——与全部现有 command 同口径）；打包/解压为阻塞 IO，
//!              走 spawn_blocking 避免卡 UI 事件循环。

use tauri::State;

use crate::backup::BackupSummary;
use crate::commands::AppState;

/// 创建备份：data_dir（SQLite+图+音频）打包为 data_dir/backups/backup-<unix秒>.zip。
#[tauri::command]
pub async fn backup_create(state: State<'_, AppState>) -> Result<BackupSummary, String> {
    let data_dir = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let backup_dir = data_dir.join("backups");
        crate::backup::create_backup(&data_dir, &backup_dir, &unix_timestamp_secs())
    })
    .await
    .map_err(|e| format!("备份任务调度失败: {}", e))?
    .map_err(|e| e.to_string())
}

/// 从备份 zip 恢复：解压覆盖回数据目录（现有 entropy.db 改名 .pre-restore 兜底）。
#[tauri::command]
pub async fn backup_restore(
    state: State<'_, AppState>,
    archive_path: String,
) -> Result<usize, String> {
    if archive_path.trim().is_empty() {
        return Err("备份文件路径为空".to_string());
    }
    let data_dir = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::backup::restore_backup(std::path::Path::new(&archive_path), &data_dir)
    })
    .await
    .map_err(|e| format!("恢复任务调度失败: {}", e))?
    .map_err(|e| e.to_string())
}

/// Unix 时间戳（秒）——Cargo.toml 未引入 chrono，用系统时钟自取。
fn unix_timestamp_secs() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}
