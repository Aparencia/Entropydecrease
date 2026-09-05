//! asr_eval 会话信道编排（v0.20.0 / REQ-263，M2b；bin 子模块）。
//!
//! @ai-context: --db 模式的执行体：entropy.db 的 session_segments 按 source 分档
//!              ——`subtitle`=字幕来源段（真参考 ~99-100%）→ CER/漂移；
//!              `asr`=实时链路历史输出（**弱参考**，非真值）→ 只做
//!              "实时链路 vs 离线重跑"相对对比（端点切分损失方向观察）。
//!              音频=数据目录 session-audio/{id}.wav（16k PCM16 44 字节头）。
//! @ai-context: 数据面不足的诚实口径——无字幕档的会话明确标"弱参考"；
//!              全部无可用 → 报告说明"数据面不足"，不产绝对结论。

use std::path::Path;

use app_lib::cer;
use app_lib::eval_report::cer_stats;
use app_lib::eval_session::{drift_summary, reference_text, SessionRow};
use rusqlite::Connection;
use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig};

/// 字幕参考最小段数：不足则降为弱参考——单段字幕可能只是 OCR 残片，
/// 当真参考会产失真 CER/漂移（真机会话 63 实证：1 段 → CER 4.05）。
const MIN_SUBTITLE_SEGS: usize = 3;

/// 单会话报告行。
struct SessionReport {
    id: i64,
    subtitle_n: usize,
    asr_n: usize,
    /// 字幕档 CER（实时链路 asr 段 vs 字幕）；None=无字幕档。
    live_vs_subtitle: Option<f32>,
    /// 离线重跑 vs 参考（字幕档为真参考；弱档 asr 历史为参考）的 CER。
    offline_cer: Option<f32>,
    /// 字幕档弱标记：true=无字幕、以 asr 历史为弱参考（仅相对对比）。
    weak_reference: bool,
    drift_ms: Option<i64>,
    skip: Option<String>,
}

/// 执行会话信道，返回报告文本。ids 为 None 时跑全部可测会话。
pub fn run(db_path: &str, model_dir: &str, want_preproc: bool, ids: Option<&[i64]>) -> String {
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => return format!("[会话信道] DB 打开失败 {db_path}: {e}\n"),
    };
    let session_ids = match session_ids_with_asr(&conn) {
        Ok(v) => v,
        Err(e) => return format!("[会话信道] 会话枚举失败: {e}\n"),
    };
    let session_ids: Vec<i64> = match ids {
        Some(list) => list.iter().copied().filter(|id| session_ids.contains(id)).collect(),
        None => session_ids,
    };
    if session_ids.is_empty() {
        return "[会话信道] 无可测会话（无 asr 段会话）\n".to_string();
    }
    let data_dir = Path::new(db_path).parent().unwrap_or(Path::new("."));
    let mut recognizer: Option<OfflineRecognizer> = None;
    let mut reports: Vec<SessionReport> = Vec::new();
    for id in &session_ids {
        let subtitle_rows = load_rows(&conn, *id, "subtitle");
        let asr_rows = load_rows(&conn, *id, "asr");
        let wav = data_dir.join("session-audio").join(format!("{id}.wav"));
        let mut rep = SessionReport {
            id: *id,
            subtitle_n: subtitle_rows.len(),
            asr_n: asr_rows.len(),
            live_vs_subtitle: None,
            offline_cer: None,
            weak_reference: subtitle_rows.len() < MIN_SUBTITLE_SEGS,
            drift_ms: None,
            skip: None,
        };
        // 漂移/实时 CER（仅真参考字幕档；弱参考无真值不估）
        if !rep.weak_reference && !asr_rows.is_empty() {
            rep.drift_ms = drift_summary(&subtitle_rows, &asr_rows).map(|d| d.median_ms);
            let ref_text = reference_text(&subtitle_rows);
            let live_text = reference_text(&asr_rows);
            rep.live_vs_subtitle = cer::cer(&ref_text, &live_text);
        }
        // 离线重跑档（需 wav + 模型）：字幕档比真参考；弱档比 asr 历史
        if !wav.exists() {
            rep.skip = Some(format!("无音频 {}", wav.display()));
            reports.push(rep);
            continue;
        }
        if recognizer.is_none() {
            recognizer = try_load(model_dir).or_else(|| try_load(&default_models_dir().join("asr/sensevoice").to_string_lossy()));
        }
        let Some(rec) = recognizer.as_ref() else {
            rep.skip = Some("SenseVoice 模型不可用".to_string());
            reports.push(rep);
            continue;
        };
        let Some(wave) = sherpa_onnx::Wave::read(&wav.to_string_lossy()) else {
            rep.skip = Some("wav 解析失败".to_string());
            reports.push(rep);
            continue;
        };
        let text = transcribe(rec, wave.samples(), wave.sample_rate(), want_preproc);
        let reference = if rep.weak_reference {
            reference_text(&asr_rows)
        } else {
            reference_text(&subtitle_rows)
        };
        rep.offline_cer = cer::cer(&reference, &text);
        reports.push(rep);
    }

    // ── 渲染 ──
    let mut out = String::new();
    out.push_str("[会话信道] 会话数=");
    out.push_str(&reports.len().to_string());
    out.push('\n');
    let subtitle_tier: Vec<&SessionReport> = reports.iter().filter(|r| !r.weak_reference).collect();
    let weak_tier: Vec<&SessionReport> = reports.iter().filter(|r| r.weak_reference).collect();
    out.push_str(&format!("  字幕档(真参考)={} 弱参考档(仅相对)={}\n", subtitle_tier.len(), weak_tier.len()));
    for r in &reports {
        out.push_str(&format!(
            "  会话 {}: 字幕段={} asr段={} 漂移={}ms{}",
            r.id,
            r.subtitle_n,
            r.asr_n,
            r.drift_ms.map(|d| d.to_string()).unwrap_or_else(|| "-".into()),
            if r.weak_reference { "（弱参考）" } else { "" }
        ));
        if let Some(skip) = &r.skip {
            out.push_str(&format!(" [跳过: {skip}]"));
        } else {
            if let Some(v) = r.live_vs_subtitle {
                out.push_str(&format!(" 实时vs字幕 CER={v:.4}"));
            }
            if let Some(v) = r.offline_cer {
                out.push_str(&format!(" 离线vs参考 CER={v:.4}"));
            }
        }
        out.push('\n');
    }
    if let Some(s) = cer_stats(
        &reports.iter().filter_map(|r| r.live_vs_subtitle).collect::<Vec<_>>(),
    ) {
        out.push_str(&format!("  字幕档实时链路 CER 均值={:.4}（样本 {}\n", s.mean, s.n));
    }
    if let Some(s) = cer_stats(
        &reports.iter().filter_map(|r| r.offline_cer).collect::<Vec<_>>(),
    ) {
        out.push_str(&format!("  离线重跑 CER 均值={:.4}（样本 {}）\n", s.mean, s.n));
    }
    out
}

fn session_ids_with_asr(conn: &Connection) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT session_id FROM session_segments WHERE source='asr' AND text<>'' GROUP BY session_id ORDER BY session_id",
    )?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    Ok(rows.flatten().collect())
}

fn load_rows(conn: &Connection, session_id: i64, source: &str) -> Vec<SessionRow> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT start_ms, end_ms, text FROM session_segments WHERE session_id=?1 AND source=?2 AND text<>'' ORDER BY start_ms",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map(rusqlite::params![session_id, source], |r| {
        Ok(SessionRow { start_ms: r.get(0)?, end_ms: r.get(1)?, text: r.get(2)? })
    }) else {
        return Vec::new();
    };
    rows.flatten().collect()
}

fn transcribe(rec: &OfflineRecognizer, samples: &[f32], sample_rate: i32, _preproc_on: bool) -> String {
    if samples.is_empty() {
        return String::new();
    }
    let stream = rec.create_stream();
    stream.accept_waveform(sample_rate, samples);
    rec.decode(&stream);
    stream
        .get_result()
        .map(|r| r.text)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn try_load(model_dir: &str) -> Option<OfflineRecognizer> {
    let dir = Path::new(model_dir);
    let model = dir.join("model.int8.onnx");
    let tokens = dir.join("tokens.txt");
    if !model.exists() || !tokens.exists() {
        return None;
    }
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(model.to_string_lossy().into_owned()),
        language: Some("auto".into()),
        use_itn: true,
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    OfflineRecognizer::create(&config)
}

fn default_models_dir() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    std::path::PathBuf::from(format!("{appdata}\\com.entropydecrease.app\\models"))
}
