//! 会话音频落盘 Tauri commands（REQ-068 / v0.6.0 M4，S4）。
//!
//! @ai-context: 本层只做参数校验、调用 audio_store、错误映射（AGENTS.md §6）；
//!              清理 UI（M6 前端消费）的两个后端命令：
//!              session_audio_status（文件数/总字节/预算/保留期——展示用）、
//!              session_audio_cleanup（手动触发清理——超保留期/超预算删最旧）。

//! @ai-context: REQ-101（v0.7.0 M1）：audio_preproc 开/关命令——CER 微基准
//!              （bin/cer_bench.rs）定默认值后的用户开关通道；配置 JSON 持久化
//!              应用数据目录（AudioPreprocConfig，原子写），下次实时会话生效。

//! @ai-context: 批 6 T22（R5.5/PB1）：新增只读命令 session_audio_path。它是本模块里
//!              **唯一**直接读文件的入口（WAV 头 44 字节 + T23 的对齐 sidecar）——
//!              读侧留在本文件是为了不碰 audio_store.rs（T23 的单写者面）。

use tauri::State;

use crate::audio_preproc_config::AudioPreprocConfig;
use crate::audio_store::{audio_dir_stats, cleanup, AudioStoreConfig};
use crate::commands::AppState;

/// 音频预处理配置状态（前端开关载荷）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioPreprocStatus {
    /// 持久化配置开关
    pub enabled: bool,
    /// 生效开关（env ENTROPY_AUDIO_PREPROC 覆盖配置文件时不同）
    pub effective: bool,
}

/// 查询音频预处理链配置（REQ-101）。
#[tauri::command]
pub fn audio_preproc_status(state: State<'_, AppState>) -> AudioPreprocStatus {
    let cfg = AudioPreprocConfig::load(&state.data_dir.join("audio-preproc.json"));
    AudioPreprocStatus { enabled: cfg.enabled, effective: cfg.effective() }
}

/// 设置音频预处理链开关（REQ-101；持久化，下次实时会话生效）。
#[tauri::command]
pub fn audio_preproc_set(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<AudioPreprocStatus, String> {
    let cfg = AudioPreprocConfig { enabled };
    cfg.save(&state.data_dir.join("audio-preproc.json")).map_err(|e| e.to_string())?;
    Ok(AudioPreprocStatus { enabled: cfg.enabled, effective: cfg.effective() })
}

/// 会话音频状态载荷（前端展示）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAudioStatus {
    /// 已落盘音频文件数
    pub file_count: usize,
    /// 总字节数
    pub total_bytes: u64,
    /// 保留期（天；策略配置）
    pub retention_days: u64,
    /// 磁盘预算（字节；策略配置）
    pub disk_budget_bytes: u64,
    /// 落盘策略开关（false=未启用，前端提示）
    pub enabled: bool,
}

/// 查询会话音频落盘状态（数量/占用/策略）。
#[tauri::command]
pub fn session_audio_status(state: State<'_, AppState>) -> SessionAudioStatus {
    let dir = state.data_dir.join("session-audio");
    let (file_count, total_bytes) = audio_dir_stats(&dir);
    let config = AudioStoreConfig::default();
    SessionAudioStatus {
        file_count,
        total_bytes,
        retention_days: config.retention_days,
        disk_budget_bytes: config.disk_budget_bytes,
        enabled: config.enabled,
    }
}

/// 手动触发音频清理（超保留期删除 + 超预算删最旧）。
#[tauri::command]
pub fn session_audio_cleanup(state: State<'_, AppState>) -> Result<crate::audio_store::CleanupSummary, String> {
    let dir = state.data_dir.join("session-audio");
    let config = AudioStoreConfig::default();
    Ok(cleanup(&dir, config.retention_days, config.disk_budget_bytes))
}

/// 会话音频目录名（与写入侧 `audio_store` 的 `{data_dir}/session-audio/{id}.wav` 一致）。
const SESSION_AUDIO_DIR: &str = "session-audio";
/// WAV 头长度（RIFF 12 + fmt 24 + data 8；与 `audio_store::WAV_HEADER_LEN` 同值）。
const WAV_HEADER_LEN: usize = 44;
/// `data` 块长度字段在头内的偏移（`audio_store::write_header` 的写入位置）。
const WAV_DATA_LEN_OFFSET: usize = 40;
/// PCM16 单声道 16 kHz ⇒ 32000 B/s ⇒ 1 ms = 32 字节（`audio_store` 的 SAMPLE_RATE 与
/// CHANNELS 是私有常量 ⇒ 此处按同一契约复述，不跨模块引用、不改 T23 的单写者面）。
const BYTES_PER_MS: u64 = 32;

/// 会话音频引用（只读；前端 `convertFileSrc(path)` 得可播放 URL）。
///
/// @ai-context: R5.5-b 第 3 条的「对齐自证量」通道。`aligned` **禁止恒 true**：它读 T23 的
///              对齐簿记 sidecar（`{id}.wav.meta.json`），**缺失/损坏 ⇒ false**（历史录音
///              不得被当作已对齐）⇒ T23 落地前 sidecar 无人写，**今天的值恒 false**（如实
///              反映「无时间基准」）。语义是「**不能保证**对齐」而非「一定没对齐」⇒ UI 文案
///              不得说「这条录音没有对齐」（ADR-035 后果③）。
/// @ai-context: `durationMs` 是「能不能播」的**唯一**判据（R5.5-b 约束 3：只有已 finalize 的
///              WAV 可播，创建时头部 data 长度为 0）——`None` ⇒ 前端必须禁用播放并如实提示，
///              **不得**把它读作「0 秒」。
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionAudioRef {
    /// 应用数据目录内的**绝对路径**（`{data_dir}/session-audio/{id}.wav`）
    pub path: String,
    /// 该录音的 WAV 轴是否与会话轴对齐（T23 的簿记；无 sidecar ⇒ false）
    pub aligned: bool,
    /// 音频时长（毫秒；由 WAV 头 data 长度换算，`None` = 未 finalize/未知）
    pub duration_ms: Option<u64>,
}

/// T23 的对齐 sidecar 的读取面（只取 `aligned`；其余键本任务不消费）。
///
/// @ai-context: 键名照计划 Task 23 Step 3 的冻结快照（`{ "version": 1, "aligned": bool,
///              "firstTsMs", "samplesWritten" }）。**未知键不报错、缺 `aligned` 回落 false**
///              —— 保守：宁可说「无基准」，也不假称已对齐（R5.5-b「禁止恒 true」）。
#[derive(serde::Deserialize)]
struct AudioAlignSidecar {
    #[serde(default)]
    aligned: bool,
}

/// 读对齐自证量：sidecar 缺失/损坏/T23 未落地 ⇒ **false**。
///
/// @ai-context: 副作用 = 一次只读文件读取；边界 = 任何失败都不报错、一律取保守值 false
///              （「历史录音」与「读不出来」在语义上是同一档：都不能保证对齐）。
fn read_aligned(base: &std::path::Path, session_id: i64) -> bool {
    let meta = base.join(format!("{}.wav.meta.json", session_id));
    let Ok(text) = std::fs::read_to_string(&meta) else { return false };
    serde_json::from_str::<AudioAlignSidecar>(&text).map(|s| s.aligned).unwrap_or(false)
}

/// 从 WAV 头读时长（毫秒；`None` = 未 finalize / 非本模块写入形态 / 读失败）。
///
/// @ai-context: 只读头 44 字节（**不**整读文件 —— 会话 WAV 约 115 MB/小时）。
///              `data` 长度字段在 `audio_store` 创建时写 0、`finalize()` 是唯一回填点
///              ⇒ 0 表示「未 finalize」（或零样本，今天两者不可区分）⇒ 返 `None`，
///              **不发明时长**。
fn wav_duration_ms(path: &std::path::Path) -> Option<u64> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut hdr = [0u8; WAV_HEADER_LEN];
    file.read_exact(&mut hdr).ok()?;
    // 只认写入侧产出的形态（RIFF/WAVE + 偏移 36 的 data 块）——异类文件不当作音频
    if &hdr[0..4] != b"RIFF" || &hdr[8..12] != b"WAVE" || &hdr[36..40] != b"data" {
        return None;
    }
    let raw: [u8; 4] = hdr[WAV_DATA_LEN_OFFSET..WAV_HEADER_LEN].try_into().ok()?;
    let data_len = u32::from_le_bytes(raw);
    if data_len == 0 {
        return None;
    }
    Some(u64::from(data_len) / BYTES_PER_MS)
}

/// 解析会话音频文件并做**目录边界校验**（AGENTS.md §4 安全红线②）。
///
/// @ai-context: 独立成 `file_name` 入参是为了让**越界样本可测**（`..` / 符号链接伪装成
///              `{id}.wav`）；调用侧由 `session_id: i64` 生成 ⇒ 类型上不含路径分隔符。
///              返回**构造路径**而非 `canonicalize` 的 `\\?\` 形态：asset protocol 的 scope 是
///              `$APPDATA/**` glob，先例 `commands_images.rs:55` 也返回构造路径 ⇒ canonicalize
///              只用于边界判定（避免把扩展长度前缀送进 scope 匹配）。
///              边界：不存在/不是普通文件 ⇒ `Ok(None)`（无音频**不是**错误）；越界 ⇒ `Err`。
fn confined_audio_file(
    base: &std::path::Path,
    file_name: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    let path = base.join(file_name);
    if !path.is_file() {
        return Ok(None); // 无音频（含导入会话：其音轨在 %TEMP% 且导入结束即删）
    }
    // 双保险：canonicalize 后必须仍在会话音频目录内（防符号链接/嵌套穿越）
    let canonical_base = std::fs::canonicalize(base).map_err(|e| format!("路径越界拒绝: {}", e))?;
    let canonical_path = std::fs::canonicalize(&path).map_err(|e| format!("路径越界拒绝: {}", e))?;
    if !canonical_path.starts_with(&canonical_base) {
        return Err("路径越界拒绝".to_string());
    }
    Ok(Some(path))
}

/// `session_audio_path` 的命令体（只依赖 `data_dir` ⇒ 可单测；`#[tauri::command]` 是薄壳）。
///
/// @ai-context: 顺序 = ① 校验入参（`<= 0` ⇒ Err）② 后端构造路径 + 目录边界双保险
///              ③ 无文件 ⇒ `Ok(None)` ④ 读 sidecar（`aligned`）+ WAV 头（`durationMs`）。
fn session_audio_ref_in(
    data_dir: &std::path::Path,
    session_id: i64,
) -> Result<Option<SessionAudioRef>, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let base = data_dir.join(SESSION_AUDIO_DIR);
    let Some(path) = confined_audio_file(&base, &format!("{}.wav", session_id))? else {
        return Ok(None);
    };
    Ok(Some(SessionAudioRef {
        path: path.to_string_lossy().into_owned(),
        aligned: read_aligned(&base, session_id),
        duration_ms: wav_duration_ms(&path),
    }))
}

/// 查询会话音频文件路径（前端 `convertFileSrc(path)` 得可播放 URL；只读）。
///
/// @ai-context: R5.5/PB1 的**唯一**新增 IPC（R12.2 追认出参形状）。路径由**后端**从
///              `state.data_dir` 构造——前端**不传路径**（AGENTS.md §4「文件系统访问限定
///              应用数据目录」）。本命令**不构造 asset URL**：URL 形态
///              `http://asset.localhost/<encodeURIComponent(绝对路径)>` 由前端
///              `convertFileSrc` 生成，与既有 5 处图片调用点同形（`commands_images.rs:55`）。
/// @ai-context: 副作用 = 只读文件系统（`is_file` + 读 WAV 头 44 字节 + 读 sidecar）；
///              不写盘、不连库、不发事件。边界：非法 id ⇒ `Err`；无音频 ⇒ `Ok(None)`；
///              越界 ⇒ `Err`。**不声称「播放已可用」**（真机不可验证，R5.5-b 诚实边界）。
#[tauri::command]
pub fn session_audio_path(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Option<SessionAudioRef>, String> {
    session_audio_ref_in(&state.data_dir, session_id)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_audio_tests.rs"]
mod tests;
