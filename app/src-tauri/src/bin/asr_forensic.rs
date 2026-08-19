//! ASR 取证诊断工具（开发期，不入产品包）。
//!
//! @ai-context: 定位"结尾识别不全/短句不清晰/断句不准"根因的三连验证：
//!              ① 会话原始音频（session-audio/{id}.wav，16k 单声道 PCM16）离线
//!              SenseVoice 整段转写 → 与 DB 流式链路段对比（句尾是否更完整）；
//!              ② 对疑似截断段截取音频窗口（start-200ms..end+1200ms）单独离线
//!              转写 → 证明"音频里有没有这个尾字"（二分：链路丢 vs 源缺失）；
//!              ③ 200ms 块 RMS 统计 → 验证"句尾弱音块被判静音"假设的量化依据。
//! @ai-context: 独立 bin，只依赖 sherpa-onnx/rusqlite 公共依赖，不触碰业务代码；
//!              用法：cargo run --bin asr_forensic -- <wav...> [--db <path>]

use std::path::PathBuf;

use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
};

/// 静音判定阈值（与 streaming_asr.rs SILENCE_RMS_THRESHOLD 同值，供对照）。
const SILENCE_RMS: f32 = 0.005;
/// 块样本数（16kHz × 200ms，与音频链路块对齐）。
const BLOCK_SAMPLES: usize = 16_000 / 5;
/// 窗口复核时向后多取的音频（ms）——覆盖端点判定滞后与句尾弱音。
const TAIL_MARGIN_MS: i64 = 1200;
/// 窗口复核时向前多取的音频（ms）。
const HEAD_MARGIN_MS: i64 = 200;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("用法: asr_forensic <wav...> [--db <sqlite路径>]");
        std::process::exit(2);
    }
    let mut wavs: Vec<String> = Vec::new();
    let mut db_path: Option<String> = None;
    let mut it = args.into_iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--db" => db_path = it.next(),
            _ => wavs.push(a),
        }
    }
    let db_path = db_path.unwrap_or_else(default_db_path);

    // SenseVoice 模型（离线整句复核引擎；路径与产品 lib.rs 约定一致）
    let models_dir = default_models_dir();
    let model = models_dir.join("asr/sensevoice/model.int8.onnx");
    let tokens = models_dir.join("asr/sensevoice/tokens.txt");
    let recognizer = load_sensevoice(&model, &tokens);

    for wav in &wavs {
        println!("\n========== 会话 {} ==========", wav);
        let Some((samples, duration_s)) = read_wav(wav) else {
            println!("[跳过] 无法解析 {}", wav);
            continue;
        };
        println!("时长 {:.1}s，样本 {}", duration_s, samples.len());

        // ③ RMS 块统计（静音误判可能性量化）
        report_block_rms(&samples);

        // ① 离线整段转写
        let full_text = recognizer
            .as_ref()
            .and_then(|r| transcribe(r, &samples))
            .unwrap_or_else(|| "<离线引擎不可用>".to_string());
        println!("\n[离线整段转写]\n{}", full_text);

        // ② DB 流式段对比 + 截断窗口复核
        let session_id = session_id_from_wav(wav);
        let segments = load_segments(&db_path, session_id);
        println!("\n[DB 流式段] {} 段", segments.len());
        for (i, s) in segments.iter().enumerate() {
            println!("  #{} [{}-{}ms] {}", i + 1, s.start_ms, s.end_ms, s.text);
        }
        let Some(rec) = recognizer.as_ref() else {
            continue;
        };
        for (i, s) in segments.iter().enumerate() {
            if s.text.trim().is_empty() {
                continue;
            }
            // 截取窗口（防御边界：起点含前导 margin，终点含尾随 margin）
            let start_s = (s.start_ms - HEAD_MARGIN_MS).max(0) as usize;
            let end_s = ((s.end_ms + TAIL_MARGIN_MS) * 16) as usize;
            let end_s = end_s.min(samples.len());
            if start_s >= end_s {
                continue;
            }
            let win = &samples[start_s..end_s];
            let win_text = transcribe(rec, win).unwrap_or_default();
            let verdict = truncation_verdict(&s.text, &win_text);
            if verdict != TruncationVerdict::None {
                println!(
                    "\n[疑似截断] 段#{} [{}ms] 流式: 「{}」\n  窗口({}ms)离线: 「{}」\n  → {}",
                    i + 1,
                    s.start_ms,
                    s.text,
                    (end_s - start_s) / 16,
                    win_text,
                    verdict.label()
                );
            }
        }
    }
}

/// 截断判定：流式文本是否 = 窗口离线转写的前缀（且离线更长/含尾字）。
///
/// @ai-context: 比较前剥离标点/空白（SenseVoice 窗口转写的标点位置与
///              DB 存储文本不一致是常态，字符级前缀会漏报截断）。
fn truncation_verdict(streaming: &str, window: &str) -> TruncationVerdict {
    let a: Vec<char> = strip_punct(streaming);
    let b: Vec<char> = strip_punct(window);
    if a.is_empty() || b.len() <= a.len() {
        return TruncationVerdict::None;
    }
    // 前缀匹配（允许流式文本为离线文本去掉尾部若干字）
    if a.iter().zip(b.iter()).all(|(x, y)| x == y) {
        TruncationVerdict::PrefixMissingTail
    } else if a.len() <= 2 {
        // 极短句（≤2 字）离线更长且不相等：可能是短句误识/截断
        TruncationVerdict::ShortMismatch
    } else {
        TruncationVerdict::None
    }
}

/// 剥离标点与空白（纯函数；中文标点 + ASCII 标点 + 空白）。
fn strip_punct(s: &str) -> Vec<char> {
    s.chars()
        .filter(|c| !c.is_whitespace() && !"，。！？；：、,.!?;:'\"“”‘’（）()…—《》【】[]".contains(*c))
        .collect()
}

#[derive(PartialEq)]
enum TruncationVerdict {
    /// 无异常
    None,
    /// 流式 = 离线前缀 → 句尾被链路丢弃，音频含尾字
    PrefixMissingTail,
    /// 短句流式与离线不一致（短句误识或截断）
    ShortMismatch,
}

impl TruncationVerdict {
    fn label(&self) -> &'static str {
        match self {
            TruncationVerdict::None => "无异常",
            TruncationVerdict::PrefixMissingTail => {
                "音频含尾字但流式缺——链路丢字（静音跳过/端点时序），需打补丁"
            }
            TruncationVerdict::ShortMismatch => {
                "短句不一致——短句误识（模型上下文不足）或截断，需复核"
            }
        }
    }
}

/// 200ms 块 RMS 统计：静音块占比 + 能量分布（验证静音误判假设）。
fn report_block_rms(samples: &[f32]) {
    let mut blocks = 0usize;
    let mut silent = 0usize;
    let mut near = 0usize; // 0.005..0.02（贴近阈值的语音块——句尾弱音高危区）
    let mut max_rms = 0.0f32;
    let mut bucket = [0usize; 5]; // <0.001 / 0.001-0.005 / 0.005-0.02 / 0.02-0.1 / ≥0.1
    for chunk in samples.chunks(BLOCK_SAMPLES) {
        if chunk.len() < BLOCK_SAMPLES / 2 {
            continue; // 尾部残块忽略
        }
        let rms = chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32;
        let rms = rms.sqrt();
        blocks += 1;
        max_rms = max_rms.max(rms);
        if rms < SILENCE_RMS {
            silent += 1;
        } else if rms < 0.02 {
            near += 1;
        }
        if rms < 0.001 {
            bucket[0] += 1;
        } else if rms < 0.005 {
            bucket[1] += 1;
        } else if rms < 0.02 {
            bucket[2] += 1;
        } else if rms < 0.1 {
            bucket[3] += 1;
        } else {
            bucket[4] += 1;
        }
    }
    if blocks == 0 {
        return;
    }
    println!(
        "\n[块 RMS] {} 块 | 静音(<0.005) {:.0}% | 贴近阈值(0.005-0.02) {:.0}% | 峰值 {:.3}",
        blocks,
        silent as f32 * 100.0 / blocks as f32,
        near as f32 * 100.0 / blocks as f32,
        max_rms
    );
    println!(
        "  分布: <0.001 {} | 0.001-0.005 {} | 0.005-0.02 {} | 0.02-0.1 {} | ≥0.1 {}",
        bucket[0], bucket[1], bucket[2], bucket[3], bucket[4]
    );
}

/// 加载 SenseVoice 离线识别器（照抄产品 asr.rs 配置；失败 → None）。
fn load_sensevoice(model: &std::path::Path, tokens: &std::path::Path) -> Option<OfflineRecognizer> {
    if !model.exists() || !tokens.exists() {
        eprintln!("[引擎] SenseVoice 模型缺失: {} / {}", model.display(), tokens.display());
        return None;
    }
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(model.to_string_lossy().into_owned()),
        language: Some("auto".into()),
        use_itn: true,
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    match OfflineRecognizer::create(&config) {
        Some(r) => Some(r),
        None => {
            eprintln!("[引擎] SenseVoice 创建失败");
            None
        }
    }
}

/// 转写一段 PCM（f32，16k 单声道）→ 文本。
fn transcribe(rec: &OfflineRecognizer, samples: &[f32]) -> Option<String> {
    if samples.is_empty() {
        return None;
    }
    let stream = rec.create_stream();
    stream.accept_waveform(16_000, samples);
    rec.decode(&stream);
    stream.get_result().map(|r| r.text.trim().to_string())
}

/// 读 WAV（仅本项目落盘格式：44 字节头 PCM16 单声道 16k；防御性解析）。
fn read_wav(path: &str) -> Option<(Vec<f32>, f64)> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        eprintln!("[WAV] 非法头: {}", path);
        return None;
    }
    let channels = u16::from_le_bytes([bytes[22], bytes[23]]) as usize;
    let bits = u16::from_le_bytes([bytes[34], bytes[35]]);
    if channels == 0 || bits != 16 {
        eprintln!("[WAV] 不支持格式（声道 {}，位深 {}）", channels, bits);
        return None;
    }
    let data = &bytes[44..];
    let samples: Vec<f32> = data
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32767.0)
        .collect();
    // 多声道 → 按帧取第一声道（本项目文件恒单声道，防御即可）
    let samples: Vec<f32> = if channels == 1 {
        samples
    } else {
        samples.chunks(channels).map(|f| f[0]).collect()
    };
    let duration_s = samples.len() as f64 / 16_000.0;
    Some((samples, duration_s))
}

/// 从文件名推断会话 id（12.wav → 12）。
fn session_id_from_wav(path: &str) -> Option<i64> {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .and_then(|s| s.parse().ok())
}

/// 读 DB 中某会话的全部段（按 start_ms 排序）。
fn load_segments(db_path: &str, session_id: Option<i64>) -> Vec<Segment> {
    let Some(session_id) = session_id else { return Vec::new() };
    let conn = match rusqlite::Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[DB] 打开失败 {}: {}", db_path, e);
            return Vec::new();
        }
    };
    let mut stmt = match conn.prepare(
        "SELECT start_ms, end_ms, text FROM session_segments WHERE session_id=?1 AND source='asr' ORDER BY start_ms",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[DB] 查询失败: {}", e);
            return Vec::new();
        }
    };
    let rows = match stmt.query_map([session_id], |r| {
        Ok(Segment { start_ms: r.get(0)?, end_ms: r.get(1)?, text: r.get(2)? })
    }) {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("[DB] 查询失败: {}", e);
            return Vec::new();
        }
    };
    rows.flatten().collect()
}

struct Segment {
    start_ms: i64,
    end_ms: i64,
    text: String,
}

fn default_db_path() -> String {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    format!("{}\\com.entropydecrease.app\\entropy.db", appdata)
}

fn default_models_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(format!("{}\\com.entropydecrease.app\\models", appdata))
}
