//! 音频预处理链 CER 微基准（REQ-101 PRE-O1 / v0.7.0 M1，开发期工具）。
//!
//! @ai-context: 目的——S4 落盘音频（session-audio/{id}.wav）以"预处理开/关"
//!              两路转写，与参考文本（人工抄录/字幕）比对 CER：定 AGC/动态阈值
//!              默认值的**数据支撑**（REQ-101 验收：默认值有数据支撑）。
//! @ai-context: 独立 bin（同 asr_forensic 模式）：只依赖 sherpa-onnx 公共依赖，
//!              不触碰业务代码；CER 计算复用 src/cer.rs（lib 导出）。
//! @ai-context: 用法：
//!   cargo run --bin cer_bench -- <wav> <reference.txt> [--model <sensevoice_dir>]
//!   输出：开/关两路 CER + 推荐结论（recommend_preproc 判定）。

use std::path::PathBuf;

use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
};

/// 默认 SenseVoice 模型目录（与 download-streaming-asr 脚本约定一致）。
const DEFAULT_MODEL_DIR: &str = "models/asr/sensevoice";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (wav, reference, model_dir) = parse_args(&args);
    if wav.is_none() || reference.is_none() {
        eprintln!("用法: cer_bench <wav> <reference.txt> [--model <sensevoice_dir>]");
        std::process::exit(2);
    }
    let wav = wav.unwrap();
    let reference = std::fs::read_to_string(reference.unwrap())
        .expect("读取参考文本失败")
        .trim()
        .to_string();
    let model_dir = model_dir.unwrap_or_else(|| DEFAULT_MODEL_DIR.to_string());

    // 读音频（sherpa Wave 契约：16kHz 单声道 f32）
    let wave = sherpa_onnx::Wave::read(&wav)
        .unwrap_or_else(|| panic!("读取 WAV 失败: {}", wav));
    let sample_rate = wave.sample_rate();
    let samples = wave.samples();

    // 两路转写：预处理开（AGC+动态阈值）vs 关（直通）
    let recognizer = load_recognizer(&model_dir);
    let off_text = transcribe(&recognizer, samples, sample_rate, false);
    let on_text = transcribe(&recognizer, samples, sample_rate, true);

    // CER 对比（lib 纯函数；bin 通过 app_lib crate 引用 lib 模块）
    let (on_cer, off_cer) = app_lib::cer::cer_comparison(&reference, &on_text, &off_text);
    println!("参考文本: {}", &reference.chars().take(60).collect::<String>());
    println!("预处理开: CER={:?} | {}", on_cer, &on_text.chars().take(60).collect::<String>());
    println!("预处理关: CER={:?} | {}", off_cer, &off_text.chars().take(60).collect::<String>());
    let recommend = app_lib::cer::recommend_preproc(on_cer, off_cer);
    println!(
        "结论: {}",
        if recommend { "推荐开启预处理链（CER 有显著下降）" } else { "保持默认关闭（无显著收益或不可比）" }
    );
}

/// 参数解析：位置参数 wav/reference，可选 --model。
fn parse_args(args: &[String]) -> (Option<String>, Option<String>, Option<String>) {
    let mut wav = None;
    let mut reference = None;
    let mut model = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--model" => model = it.next().cloned(),
            _ => {
                if wav.is_none() {
                    wav = Some(a.clone());
                } else if reference.is_none() {
                    reference = Some(a.clone());
                }
            }
        }
    }
    (wav, reference, model)
}

/// 加载 SenseVoice 离线识别器（模型目录约定：model.int8.onnx + tokens.txt）。
fn load_recognizer(model_dir: &str) -> OfflineRecognizer {
    let dir = PathBuf::from(model_dir);
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(dir.join("model.int8.onnx").to_string_lossy().to_string()),
        language: Some("auto".into()),
        use_itn: true,
    };
    config.model_config.tokens = Some(dir.join("tokens.txt").to_string_lossy().to_string());
    OfflineRecognizer::create(&config).expect("SenseVoice 模型加载失败（检查 --model 目录）")
}

/// 单路转写（可选预处理：AGC 目标 RMS 0.125 + 动态阈值——与业务链同参数）。
fn transcribe(
    recognizer: &OfflineRecognizer,
    samples: &[f32],
    sample_rate: i32,
    preproc: bool,
) -> String {
    let audio: Vec<f32> = if preproc {
        let mut p = app_lib::audio_preprocess::AudioPreprocessor::new(
            app_lib::audio_preprocess::AudioPreprocessConfig {
                enabled: true,
                target_rms: 0.125,
            },
        );
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
