//! 视频类型档案 Tauri commands（REQ-043 / v0.5.0 M1）。
//!
//! @ai-context: 本层只做参数校验、调用纯逻辑（video_profile）、错误映射（AGENTS.md §6）。
//! @ai-context: 混合检测闭环：detect（信号投票 + 记忆偏好）→ 前端展示"检测为：网课（可改）"
//!              → 用户确认/修改 → remember 写记忆偏好（同窗口标题下次直接生效）。
//! @ai-context: 记忆偏好 JSON 持久化（应用数据目录，AppState 持有路径与内存态单点，
//!              与词表同模式：锁内 read-modify-write 防 TOCTOU）。

use tauri::State;

use crate::commands::AppState;
use crate::video_profile::{
    builtin_profiles, profile_by_kind, vote_detect, DetectResult, ObservedSignals, ProfileKind,
    ProfileMemory, VideoProfile,
};

/// 档案标识最大长度（防御超长输入污染记忆库）。
const KIND_MAX_CHARS: usize = 30;

/// 导出五档案（前端展示/校准；JSON 序列化即档案可校准接口）。
#[tauri::command]
pub fn video_profiles() -> Vec<VideoProfile> {
    builtin_profiles()
}

/// 混合检测：窗口标题信号 → 候选档案（先查记忆偏好，命中直接生效）。
///
/// @param title - 目标窗口标题（A5 信号；记忆偏好匹配键）
/// @param url - 可选 URL/播放器标题（B站/网课平台关键词信号）
/// @param frameSwitchRate - 可选画面切换频率（次/分；会话中可增量评估）
/// @param hasSubtitle - 可选字幕有无（det 结果统计）
#[tauri::command]
pub fn detect_video_profile(
    state: State<'_, AppState>,
    title: Option<String>,
    url: Option<String>,
    frame_switch_rate: Option<f32>,
    has_subtitle: Option<bool>,
) -> DetectResult {
    let title = title.map(|t| t.chars().take(200).collect::<String>());
    let url = url.map(|u| u.chars().take(500).collect::<String>());
    // 1) 记忆偏好优先：同窗口标题上次确认过 → 直接生效（无需再次询问）
    if let Some(t) = title.as_deref() {
        let memory = state
            .profile_memory
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        if let Some(kind) = memory.lookup(t) {
            let mut result = vote_detect(&ObservedSignals {
                title: title.clone(),
                url,
                frame_switch_rate,
                has_subtitle,
                duration_min: None,
            });
            // 记忆命中覆盖候选：单候选 + 无需确认（用户已裁决过）
            result.candidates = vec![crate::video_profile::ProfileCandidate {
                kind,
                score: 1.0,
            }];
            result.needs_confirmation = false;
            result.memory_hit = Some(kind);
            return result;
        }
    }
    // 2) 信号投票（无记忆命中）
    vote_detect(&ObservedSignals {
        title,
        url,
        frame_switch_rate: frame_switch_rate.map(|r| r.clamp(0.0, 1000.0)),
        has_subtitle,
        duration_min: None,
    })
}

/// 记录用户确认/修改：窗口标题 → 档案（记忆偏好，下次同标题直接生效）。
///
/// @param title - 窗口标题（记忆匹配键，完整标题入库）
/// @param kind - 档案标识（kebab-case；非法值回退 Lecture）
#[tauri::command]
pub fn remember_video_profile(
    state: State<'_, AppState>,
    title: String,
    kind: String,
) -> Result<(), String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("窗口标题为空，无法记忆档案偏好".to_string());
    }
    let title = title.chars().take(200).collect::<String>();
    let kind = ProfileKind::parse(&kind.chars().take(KIND_MAX_CHARS).collect::<String>());
    let path = state.profile_memory_path.clone();
    let memory = state.profile_memory.clone();
    // 锁内 read-modify-write（与词表同模式，防 TOCTOU 文件竞争）
    {
        let mut guard = memory
            .lock()
            .map_err(|e| format!("档案记忆锁中毒: {}", e))?;
        guard.remember(&title, kind);
        guard
            .save(&path)
            .map_err(|e| format!("保存档案记忆失败: {}", e))?;
    }
    Ok(())
}

/// 读取当前档案记忆（诊断/展示用）。
#[tauri::command]
pub fn video_profile_memory(state: State<'_, AppState>) -> ProfileMemory {
    state
        .profile_memory
        .lock()
        .map(|m| m.clone())
        .unwrap_or_default()
}

/// 按标识查单档案（前端"检测为：网课（可改）"下拉用；非法值回退 Lecture）。
#[tauri::command]
pub fn video_profile_by_kind(kind: String) -> VideoProfile {
    profile_by_kind(ProfileKind::parse(&kind.chars().take(KIND_MAX_CHARS).collect::<String>()))
}
