//! 说话人分离命令（REQ-153 / v0.7.2：弱化版讲者切换离线分析）。
//!
//! @ai-context: analyze_session_speakers 懒加载——会话详情打开时调用：
//!              ① 幂等（已有 SpeakerChange 事件直接返回，不重复分析）；
//!              ② 模型缺失 → 空列表（前端提示"未启用"，诚实降级不报错）；
//!              ③ 段边界 = session_segments（端点断句产出 = 现成语音段，
//!              零新增 VAD）；音频 = session-audio/<id>.wav（16k 单声道）。
//! @ai-context: 分析成本 = 段数 × embedding 推理（~10ms/段）——百段会话
//!              <2s，可接受；单段失败跳过（不阻断整体，判定器对无效段
//!              重置前驱不误判）。结果落 session_events（SpeakerChange），
//!              容量守卫防写放大（低频事件，天然安全）。

use tauri::State;

use crate::commands::AppState;
use crate::session_events::{EventKind, NewSessionEvent};
use crate::speaker_change::{detect_speaker_changes, SpeechSegment};
use crate::speaker_engine::{self, SpeakerEmbeddingEngine};

/// 讲者切换输出（camelCase 契约，前端展示用）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerChangeOut {
    /// 切换时刻（会话纪元 ms）
    pub time_ms: u64,
    /// 切换置信度 0.0-1.0（距余弦阈值越远越高）
    pub confidence: f32,
}

/// 讲者分析结果（前端区分"未启用"与"无切换"——诚实展示）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerAnalysisResult {
    /// 说话人分离是否启用（模型文件存在且分析已执行）
    pub enabled: bool,
    pub changes: Vec<SpeakerChangeOut>,
}

/// 会话讲者切换分析（弱化版说话人分离；幂等懒加载）。
///
/// @ai-context: 异步命令 + spawn_blocking——分析含模型加载（~1s）+ 逐段
///              embedding（百段 <2s，千段长会话可能 10s+），不得占用异步
///              运行时线程（审查 B11：同步命令在长会话上阻塞 IPC 吞吐）。
#[tauri::command]
pub async fn analyze_session_speakers(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<SpeakerAnalysisResult, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let db = state.db.clone();
    let model_dir = state.model_dir.clone();
    let data_dir = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || analyze_speakers_impl(db, model_dir, data_dir, session_id))
        .await
        .map_err(|e| format!("讲者分析任务失败: {}", e))?
}

/// 分析实现（阻塞线程内执行；与命令层解耦便于独立演进）。
fn analyze_speakers_impl(
    db: crate::db::Db,
    model_dir: std::path::PathBuf,
    data_dir: std::path::PathBuf,
    session_id: i64,
) -> Result<SpeakerAnalysisResult, String> {
    // 1) 幂等：已有分析结果（SpeakerChange 事件）→ 直接返回
    let existing = db
        .list_events_by_kind(session_id, EventKind::SpeakerChange)
        .map_err(|e| e.to_string())?;
    if !existing.is_empty() {
        return Ok(SpeakerAnalysisResult {
            enabled: true,
            changes: existing
                .iter()
                .map(|e| SpeakerChangeOut {
                    time_ms: e.timestamp_ms,
                    confidence: e
                        .payload
                        .get("confidence")
                        .and_then(|v| v.as_f64())
                        .map(|v| v as f32)
                        .unwrap_or(0.0),
                })
                .collect(),
        });
    }
    // 2) 模型缺失 → 未启用（前端提示——诚实降级，不阻断）
    let Some(model_path) = speaker_engine::speaker_model_path(&model_dir) else {
        return Ok(SpeakerAnalysisResult { enabled: false, changes: Vec::new() });
    };
    // 3) 音频 + 段边界（端点断句产出 = 语音段）
    let wav_path = data_dir.join("session-audio").join(format!("{}.wav", session_id));
    let wave = sherpa_onnx::Wave::read(&wav_path.to_string_lossy())
        .ok_or_else(|| "会话音频缺失（实时捕获未落盘或已清理）".to_string())?;
    let segments = db.list_segments(session_id).map_err(|e| e.to_string())?;
    if segments.is_empty() {
        return Ok(SpeakerAnalysisResult { enabled: true, changes: Vec::new() });
    }
    // 4) 逐段提取音色向量（<MIN_SEGMENT_MS 或越界跳过——短段向量不稳）
    let sr = wave.sample_rate() as u32;
    let samples = wave.samples();
    let mut engine = SpeakerEmbeddingEngine::load(&model_path)
        .ok_or_else(|| "说话人模型加载失败（模型文件损坏？请重新下载）".to_string())?;
    let mut speech: Vec<SpeechSegment> = Vec::new();
    for seg in &segments {
        if seg.end_ms.saturating_sub(seg.start_ms) < speaker_engine::MIN_SEGMENT_MS {
            continue;
        }
        let Some((s, e)) =
            speaker_engine::segment_sample_range(seg.start_ms, seg.end_ms, sr, samples.len())
        else {
            continue;
        };
        let Some(emb) = engine.embedding_of(&samples[s..e], wave.sample_rate()) else {
            continue;
        };
        speech.push(SpeechSegment { start_ms: seg.start_ms, embedding: emb });
    }
    // 5) 相邻余弦判定（纯函数）→ 落库 → 返回
    let changes = detect_speaker_changes(&speech);
    for c in &changes {
        let _ = db.add_event(&NewSessionEvent {
            session_id,
            kind: EventKind::SpeakerChange,
            timestamp_ms: c.time_ms,
            payload: serde_json::json!({ "confidence": c.confidence }),
        });
    }
    Ok(SpeakerAnalysisResult {
        enabled: true,
        changes: changes
            .iter()
            .map(|c| SpeakerChangeOut { time_ms: c.time_ms, confidence: c.confidence })
            .collect(),
    })
}

/// 说话人模型应用内一键下载（TD-2026-08-20-D 清偿 / G1）。
///
/// @ai-context: 对照 structure_model_download——下载器后台线程 + 进度事件
///              speaker-model:download-progress/done/failed；模型已存在 → done
///              短路；下载中重复调用 → 明确错误。目标 models/speaker-embedding/。
#[tauri::command]
pub fn download_speaker_model(state: State<'_, AppState>) -> Result<(), String> {
    let dir = state.model_dir.join(crate::speaker_engine::SPEAKER_MODEL_REL)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| state.model_dir.join("speaker-embedding"));
    state
        .speaker_downloader
        .start(dir, state.app.clone())
        .map_err(|e| e.to_string())
}

/// 说话人模型下载状态（前端进度展示）。
#[tauri::command]
pub fn speaker_model_download_status(
    state: State<'_, AppState>,
) -> crate::speaker_download::SpeakerDownloadStatus {
    state.speaker_downloader.status()
}
