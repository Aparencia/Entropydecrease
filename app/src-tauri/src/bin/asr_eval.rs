//! asr_eval 自验证 harness（v0.20.0 / REQ-263，M2）。
//!
//! @ai-context: 目的——"无人工语料也能测 ASR"（2026-09-03 用户裁决①）：
//!              批量样本（wav + 同名 .srt 外挂字幕 = 参考信道 L1 ~100% 无损）
//!              → SenseVoice 离线转写（预处理开/关两路，A/B）→ CER + 混淆画像
//!              → 汇总/A/B 对比/画像 top-N → 相对基线回归门（退出码契约）。
//! @ai-context: 复用现成件——app_lib::cer（CER/推荐）、app_lib::eval_*（画像/
//!              SRT/统计/回归门）、app_lib::audio_preprocess（A/B 预处理路）；
//!              引擎装载与转写沿用 bin/cer_bench.rs 同款 API（独立 bin 范式）。
//! @ai-context: 局限（诚实登记）——①无参考样本只列表不产 CER；②SRT 仅 UTF-8/
//!              BOM（GBK 需 encoding 依赖，留 P1）；③漂移分布需带时间轴的
//!              会话信道（--db 会话模式，M2b 接线）；④结论只做相对对比与回归，
//!              不宣称绝对指标。
//! @ai-context: 用法：cargo run --bin asr_eval -- <样本目录> [--model <dir>]
//!              [--preproc off|on|both] [--baseline <json>] [--update-baseline]
//!              [--out <目录>]
//! @ai-context: 退出码：0=通过（含无参考样本的诚实告警）；1=基线回归退化
//!              （均值 CER 超容差）或模型/运行失败；2=用法错误。

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use app_lib::audio_preprocess::{AudioPreprocessConfig, AudioPreprocessor};
use app_lib::cer;
use app_lib::eval_confusion::{profile, ConfusionAggregator};
use app_lib::eval_report::{ab_verdict, cer_stats, is_regression, CerStats};
use app_lib::eval_samples::{is_media_file, parse_srt, reference_text, srt_path_for};
use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig};

/// 默认 SenseVoice 模型目录（与 cer_bench/download 脚本约定一致）。
const DEFAULT_MODEL_DIR: &str = "models/asr/sensevoice";
/// 基线回归容差（v0.20.0 契约：相对基线均值 CER 退化 >2% 即失败）。
const REGRESSION_TOLERANCE: f32 = 0.02;

/// A/B 路选择。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Route {
    Off,
    On,
    Both,
}

impl Route {
    fn names(&self) -> Vec<&'static str> {
        match self {
            Route::Off => vec!["preproc_off"],
            Route::On => vec!["preproc_on"],
            Route::Both => vec!["preproc_off", "preproc_on"],
        }
    }
}

#[derive(Debug)]
struct Options {
    samples_dir: PathBuf,
    model_dir: PathBuf,
    out_dir: PathBuf,
    baseline: Option<PathBuf>,
    update_baseline: bool,
    preproc: Route,
}

/// 单样本（文件对信道）。
struct Sample {
    name: String,
    wav: PathBuf,
    reference: String,
}

fn main() -> ExitCode {
    let opts = match parse_args() {
        Some(o) => o,
        None => return ExitCode::from(2),
    };
    let _ = fs::create_dir_all(&opts.out_dir);

    let (samples, no_ref_skips) = collect_samples(&opts);
    if samples.is_empty() {
        println!("无可用样本（wav+srt 配对为空）；跳过列表：{no_ref_skips:?}");
        return ExitCode::SUCCESS;
    }

    let recognizer = load_recognizer(&opts.model_dir);
    let mut out = String::new();
    let mut rows: Vec<(String, String, Option<f32>)> = Vec::new();
    let mut cers: std::collections::BTreeMap<String, Vec<f32>> = Default::default();
    let mut portraits: std::collections::BTreeMap<String, ConfusionAggregator> = Default::default();

    for s in &samples {
        let Some(wave) = sherpa_onnx::Wave::read(&s.wav.to_string_lossy()) else {
            println!("[跳过] 音频解析失败: {}", s.wav.display());
            continue;
        };
        let (sr, samples_f32) = (wave.sample_rate(), wave.samples());
        for route in opts.preproc.names() {
            let preproc_on = route == "preproc_on";
            let text = transcribe(&recognizer, samples_f32, sr, preproc_on);
            let c = cer::cer(&s.reference, &text);
            rows.push((s.name.clone(), route.to_string(), c));
            if let Some(v) = c {
                cers.entry(route.to_string()).or_default().push(v);
            }
            portraits
                .entry(route.to_string())
                .or_default()
                .add(&profile(&s.reference, &text));
        }
        print!("{}. ", s.name);
    }

    // ── 汇总渲染 ──
    out.push_str(&render_rows(&rows));
    out.push_str("\n== 各样本行 ==\n");
    for (name, route, c) in &rows {
        match c {
            Some(v) => out.push_str(&format!("{name}\t{route}\t{v:.4}\n")),
            None => out.push_str(&format!("{name}\t{route}\t-\n")),
        }
    }
    for route in opts.preproc.names() {
        let stats = cer_stats(cers.get(route).map(|v| v.as_slice()).unwrap_or(&[]));
        out.push_str(&format!(
            "\n[{}] 样本={} CER均值={} 范围={}~{}",
            route,
            stats.map(|s: CerStats| s.n.to_string()).unwrap_or_else(|| "0".into()),
            stats.map(|s| format!("{:.4}", s.mean)).unwrap_or_else(|| "不可比".into()),
            stats.map(|s| format!("{:.4}", s.min)).unwrap_or_else(|| "-".into()),
            stats.map(|s| format!("{:.4}", s.max)).unwrap_or_else(|| "-".into()),
        ));
        let agg = portraits.get(route).cloned().unwrap_or_default();
        let top = agg.top_n(10);
        if top.is_empty() {
            out.push_str(&format!("\n[{}] 画像：无（样本不足或全对）\n", route));
        } else {
            out.push_str(&format!("\n[{}] 画像 top-10：", route));
            for ((a, b), n) in top {
                out.push_str(&format!(" {a}→{b}({n})"));
            }
            out.push('\n');
        }
    }
    // A/B 结论（仅 both 时）
    if opts.preproc == Route::Both {
        let a = cer_stats(cers.get("preproc_on").map(|v| v.as_slice()).unwrap_or(&[]));
        let b = cer_stats(cers.get("preproc_off").map(|v| v.as_slice()).unwrap_or(&[]));
        out.push_str(&format!("\n{}\n", ab_verdict("A/B(preproc 开 vs 关)", a, b)));
    }
    if !no_ref_skips.is_empty() {
        out.push_str(&format!("\n无参考样本（不产 CER）：{no_ref_skips:?}\n"));
    }

    println!("{out}");
    let _ = fs::write(opts.out_dir.join("summary.txt"), &out);

    // ── 基线回归门 ──
    let primary = cers.get("preproc_off").map(|v| cer_stats(v)).flatten();
    if let Some(bp) = &opts.baseline {
        let cur = primary.map(|s| s.mean);
        let base_mean = read_baseline_mean(bp);
        match is_regression(cur, base_mean, REGRESSION_TOLERANCE) {
            Some(true) => {
                println!("[回归门] 失败：均值 CER {:.4} 相对基线 {:.4} 退化超容差", cur.unwrap(), base_mean.unwrap());
                return ExitCode::from(1);
            }
            Some(false) => println!("[回归门] 通过（均值 CER {:.4} vs 基线 {:.4}）", cur.unwrap(), base_mean.unwrap()),
            None => println!("[回归门] 不可比（无参考/无基线数据），跳过"),
        }
    }
    if opts.update_baseline {
        let mean = primary.map(|s| format!("{:.4}", s.mean)).unwrap_or_else(|| "null".into());
        let json = format!("{{\"route\":\"preproc_off\",\"mean_cer\":{mean},\"samples\":{}}}\n", primary.map(|s| s.n).unwrap_or(0));
        let _ = fs::write(opts.out_dir.join("baseline.json"), json);
        println!("[基线] 已写 {}/baseline.json", opts.out_dir.display());
    }
    ExitCode::SUCCESS
}

/// 汇总表渲染（CSV 行序：样本 × 路）。
fn render_rows(rows: &[(String, String, Option<f32>)]) -> String {
    let mut out = String::from("样本,路,CER\n");
    for (name, route, c) in rows {
        match c {
            Some(v) => out.push_str(&format!("{name},{route},{v:.4}\n")),
            None => out.push_str(&format!("{name},{route},-\n")),
        }
    }
    out
}

/// 读取基线 JSON 的 mean_cer（缺失/坏文件 → None，诚实不可比）。
fn read_baseline_mean(path: &Path) -> Option<f32> {
    let raw = fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("mean_cer")?.as_f64().map(|x| x as f32)
}

/// 收集样本：wav 文件 + 同名 srt（存在且 UTF-8 可解）→ Sample；
/// 无参考/不可解 → no_ref 列表（只列名不产 CER）。
fn collect_samples(opts: &Options) -> (Vec<Sample>, Vec<String>) {
    let mut samples = Vec::new();
    let mut skips = Vec::new();
    let Ok(entries) = fs::read_dir(&opts.samples_dir) else {
        eprintln!("样本目录不可读: {}", opts.samples_dir.display());
        return (samples, skips);
    };
    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| is_media_file(n) && n.to_ascii_lowercase().ends_with(".wav"))
        .collect();
    names.sort();
    for name in names {
        let wav = opts.samples_dir.join(&name);
        let Some(srt_name) = srt_path_for(&name) else { continue };
        let srt_path = opts.samples_dir.join(srt_name);
        let raw = match fs::read(&srt_path) {
            Ok(b) => b,
            Err(_) => {
                skips.push(format!("{name}（无同名 srt）"));
                continue;
            }
        };
        let srt_text = match String::from_utf8(raw) {
            Ok(t) => t,
            Err(_) => {
                skips.push(format!("{name}（srt 非 UTF-8，GBK 留 P1）"));
                continue;
            }
        };
        let reference = reference_text(&parse_srt(&srt_text));
        if reference.trim().is_empty() {
            skips.push(format!("{name}（srt 解析为空参考）"));
            continue;
        }
        samples.push(Sample { name, wav, reference });
    }
    (samples, skips)
}

/// 参数解析：位置参数=样本目录；--model/--preproc/--baseline/--update-baseline/--out。
fn parse_args() -> Option<Options> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut samples_dir = None;
    let mut model_dir = DEFAULT_MODEL_DIR.to_string();
    let mut out_dir = "asr_eval_out".to_string();
    let mut baseline = None;
    let mut update_baseline = false;
    let mut preproc = Route::Both;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--model" => model_dir = it.next()?.clone(),
            "--out" => out_dir = it.next()?.clone(),
            "--baseline" => baseline = Some(PathBuf::from(it.next()?.clone())),
            "--update-baseline" => update_baseline = true,
            "--preproc" => {
                preproc = match it.next()?.as_str() {
                    "off" => Route::Off,
                    "on" => Route::On,
                    "both" => Route::Both,
                    _ => return None,
                };
            }
            _ if samples_dir.is_none() => samples_dir = Some(a.clone()),
            _ => {
                eprintln!("用法: asr_eval <样本目录> [--model <dir>] [--preproc off|on|both] [--baseline <json>] [--update-baseline] [--out <dir>]");
                return None;
            }
        }
    }
    Some(Options {
        samples_dir: PathBuf::from(samples_dir?),
        model_dir: PathBuf::from(model_dir),
        out_dir: PathBuf::from(out_dir),
        baseline,
        update_baseline,
        preproc,
    })
}

/// 加载 SenseVoice 离线识别器（与 cer_bench 同约定：model.int8.onnx + tokens.txt）。
fn load_recognizer(model_dir: &Path) -> OfflineRecognizer {
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(model_dir.join("model.int8.onnx").to_string_lossy().to_string()),
        language: Some("auto".into()),
        use_itn: true,
    };
    config.model_config.tokens = Some(model_dir.join("tokens.txt").to_string_lossy().to_string());
    OfflineRecognizer::create(&config).expect("SenseVoice 模型加载失败（检查 --model 目录）")
}

/// 单路转写（preproc=true 走业务链同参预处理：AGC 目标 RMS 0.125）。
fn transcribe(
    recognizer: &OfflineRecognizer,
    samples: &[f32],
    sample_rate: i32,
    preproc_on: bool,
) -> String {
    let audio: Vec<f32> = if preproc_on {
        let mut p = AudioPreprocessor::new(AudioPreprocessConfig { enabled: true, target_rms: 0.125 });
        p.process(samples, 0.005).samples
    } else {
        samples.to_vec()
    };
    let stream = recognizer.create_stream();
    stream.accept_waveform(sample_rate, &audio);
    recognizer.decode(&stream);
    stream
        .get_result()
        .map(|r| r.text)
        .unwrap_or_default()
        .trim()
        .to_string()
}
