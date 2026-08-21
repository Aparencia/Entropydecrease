//! 流式 ASR 引擎测试（AAA 模式；纯函数不依赖真实模型——引擎相关为集成测试标注）。
//!
//! @ai-context: 由 streaming_asr.rs 以 #[cfg(test)] #[path] 引入。
//! @ai-context: 重打分决策（pick_rescored/levenshtein）测试在 asr_rescore.rs，
//!              净化（clean_asr_result）测试在 asr_clean.rs，跨 final 去重测试在
//!              asr_dedupe.rs——本文件只保留引擎状态机纯函数与集成测试。

// v0.7.0 M0：silence_feed_decision 随端点处理域拆至子模块 endpoint
use super::endpoint::silence_feed_decision;
// 2026-08-21 热词崩溃修复：纯函数在模块级（与引擎分离，纯逻辑可单测）
use super::{filter_hotwords_by_tokens, load_token_chars};
use crate::streaming_asr::{
    StreamingAsrConfig, StreamingAsrEngine, StreamingAsrEvent, StreamingAsrModels,
};

// ── hangover 静音喂入决策（ADR-012 F1-3）──

#[test]
fn non_silent_always_fed_and_resets_counters() {
    // 非静音块：喂入 + 双计数复位
    assert_eq!(silence_feed_decision(false, 5, 1), (true, 0, 0));
}

#[test]
fn hangover_blocks_fed_without_skip() {
    // 语音结束后 3 块内：静音也喂入（句尾弱音保护），skip 计数不变
    assert_eq!(silence_feed_decision(true, 0, 0), (true, 0, 1));
    assert_eq!(silence_feed_decision(true, 1, 0), (true, 0, 2));
    assert_eq!(silence_feed_decision(true, 2, 0), (true, 0, 3));
}

#[test]
fn after_hangover_alternate_blocks_skipped() {
    // hangover 后（第 4 块起）：隔块喂入——奇数块跳过、偶数块喂入
    let (feed1, skip1, blocks1) = silence_feed_decision(true, 3, 0);
    assert_eq!((feed1, skip1), (false, 1)); // 第 4 块：跳过
    let (feed2, skip2, blocks2) = silence_feed_decision(true, blocks1, skip1);
    assert_eq!((feed2, skip2), (true, 0)); // 第 5 块：喂入
    let (feed3, skip3, _) = silence_feed_decision(true, blocks2, skip2);
    assert_eq!((feed3, skip3), (false, 1)); // 第 6 块：跳过
}

#[test]
fn hangover_resets_after_speech() {
    // 长静音后出现语音 → 计数全部复位，后续静音重新走 hangover
    let (_, _, blocks) = silence_feed_decision(true, 100, 1); // 长静音（跳过中）
    assert_eq!(blocks, 101);
    let (feed, skip, blocks) = silence_feed_decision(false, blocks, 1);
    assert_eq!((feed, skip, blocks), (true, 0, 0));
    // 新语音段结束 → 再次 hangover 保护
    assert_eq!(silence_feed_decision(true, 0, 0), (true, 0, 1));
}

#[test]
fn silence_blocks_counter_counts_all_silent_blocks() {
    // 连续静音块数持续累计（不受隔块跳过影响）——尾静音端点判别依据
    let mut blocks = 0;
    for _ in 0..10 {
        let (_, _, b) = silence_feed_decision(true, blocks, 0);
        blocks = b;
    }
    assert_eq!(blocks, 10);
}

// ── rule3 配置（ADR-012 F3-1）──

#[test]
fn default_rule3_is_8_seconds() {
    // 默认 8s（5s 过短致句中硬切，取证 ADR-012）
    assert_eq!(StreamingAsrConfig::default().rule3_min_utterance_secs, 8.0);
}

// ── 热词 tokens 过滤（2026-08-21：领域热词含 tokens 表外字 → 解码 abort）──

#[test]
fn filter_hotwords_keeps_covered_words() {
    // Arrange：token 集合覆盖常用字（焦/冥/哲 缺席——用户真机日志实证）
    let chars: std::collections::HashSet<char> =
        "心理成长情绪压力习惯认知思维自律人生哲学".chars().collect();
    // Act & Assert：全覆盖词原样保留
    assert_eq!(
        filter_hotwords_by_tokens("心理 成长 习惯", &chars),
        "心理 成长 习惯"
    );
}

#[test]
fn filter_hotwords_drops_uncovered_words() {
    // Arrange：冥想/哲学 含表外字（冥/哲）→ 整词剔除（词级，语义完整）
    let chars: std::collections::HashSet<char> = "心理成长".chars().collect();
    // Act & Assert：覆盖词保留，表外词剔除
    assert_eq!(
        filter_hotwords_by_tokens("心理 冥想 哲学 成长", &chars),
        "心理 成长"
    );
}

#[test]
fn filter_hotwords_all_uncovered_returns_empty() {
    // Act & Assert：全部被剔 → 空串（调用方回退普通流，防 ContextGraph 崩溃）
    let chars: std::collections::HashSet<char> = "心理".chars().collect();
    assert_eq!(filter_hotwords_by_tokens("冥想 哲学", &chars), "");
}

#[test]
fn load_token_chars_collects_single_char_tokens() {
    // Arrange：临时 tokens.txt（单字 + 多字符 token + 带 id 行混合）
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tokens.txt");
    std::fs::write(&path, "心 1\n理 2\n▁ 3\n<sos> 4\n成长 5\n").unwrap();
    // Act：读取构建单字集合
    let chars = load_token_chars(path.to_str().unwrap()).unwrap();
    // Assert：仅单字符 token 入集（▁=U+2581 也是单字符；多字符 token 不参与）
    assert!(chars.contains(&'心') && chars.contains(&'理') && chars.contains(&'▁'));
    assert!(!chars.contains(&'成'));
    assert_eq!(chars.len(), 3);
}

#[test]
fn load_token_chars_missing_file_is_none() {
    // Act & Assert：文件缺失 → None（不阻断加载，仅失去过滤能力）
    assert!(load_token_chars("C:\\nonexistent\\tokens.txt").is_none());
}

/// 集成测试：用本机真实 Zipformer 模型验证加载与喂入不崩溃。
///
/// @ai-context: 模型目录取 ENTROPY_STREAMING_MODEL_DIR 环境变量，默认
///              %APPDATA%\com.entropydecrease.app\models\streaming-zipformer；
///              不依赖真实模型的单测见上方纯函数测试。
/// @ai-context: 验证历史：曾因强制 model_type="zipformer2" 导致 C++ 层
///              query_head_dims 元数据缺失崩溃（第一代 zipformer 包）。
#[test]
#[ignore = "集成测试：需要真实模型文件"]
fn load_and_feed_streaming_zipformer_integration() {
    // Arrange：模型路径（环境变量优先，回退 AppData 默认）
    let base = std::env::var("ENTROPY_STREAMING_MODEL_DIR").unwrap_or_else(|_| {
        let appdata = std::env::var("APPDATA").expect("APPDATA 环境变量");
        format!("{}\\com.entropydecrease.app\\models\\streaming-zipformer", appdata)
    });
    let p = |name: &str| format!("{}\\{}", base, name);
    let models = StreamingAsrModels {
        encoder: p("encoder.fp16.onnx"),
        decoder: p("decoder.fp16.onnx"),
        joiner: p("joiner.fp16.onnx"),
        tokens: p("tokens.txt"),
    };
    // Act：加载（ADR-012：显式传 config；M5 词表参数传 None；F4-2 标点模型传 None）
    let mut engine =
        StreamingAsrEngine::load(&models, &StreamingAsrConfig::default(), None, None, None)
            .expect("流式模型加载成功");
    // 喂入合成音频（1s 随机噪声 = 非静音，走完整 decode 路径）
    let samples: Vec<f32> = (0..16000).map(|i| ((i % 997) as f32 / 997.0 - 0.5) * 0.2).collect();
    let events = engine.feed(&samples, false);
    // Assert：不崩溃；事件可为空（噪声无有效语音）但可安全 flush
    let _ = engine.flush();
    let _ = events;
    println!("流式引擎加载与喂入通过（模型目录: {}", base);
}

/// 集成测试：标点恢复模型加载与中文标点补全（ADR-012 F4-2）。
///
/// @ai-context: 模型目录取 ENTROPY_PUNCT_MODEL_DIR 环境变量，默认
///              %APPDATA%\com.entropydecrease.app\models\punctuation\model.int8.onnx；
///              引擎缺失该模型时零开销降级（无标点），本测试验证有模型路径的效果。
#[test]
#[ignore = "集成测试：需要真实标点模型文件"]
fn punctuation_model_integration() {
    // Arrange：模型路径（环境变量优先，回退 AppData 默认）
    let model = std::env::var("ENTROPY_PUNCT_MODEL_DIR").unwrap_or_else(|_| {
        let appdata = std::env::var("APPDATA").expect("APPDATA 环境变量");
        format!("{}\\com.entropydecrease.app\\models\\punctuation\\model.int8.onnx", appdata)
    });
    // Act：创建标点恢复器（F4-2 引擎内同配置）
    let mut config = sherpa_onnx::OfflinePunctuationConfig::default();
    config.model.ct_transformer = Some(model.clone());
    let punct = sherpa_onnx::OfflinePunctuation::create(&config).expect("标点模型加载成功");
    // Assert：中文无标点文本补全标点（模型输出应含句号/逗号）
    let out = punct
        .add_punctuation("那今天晚上我会用三个阶段来做分享一个呢就是关于复盘模型的一个简单的介绍")
        .expect("标点补全成功");
    assert!(
        out.contains('。') || out.contains('，') || out.contains('！') || out.contains('？'),
        "输出应含标点: {}",
        out
    );
    println!("标点补全输出: {}", out);
    println!("标点模型验证通过（模型: {}", model);
}

/// 集成复现：会话音频喂入复现（会话 22 内容缺失根因定位，2026-08-19）。
///
/// @ai-context: 精确复现 run_session 主循环的喂入决策（AdaptiveVad 自适应阈值 +
///              静音隔块喂入 + 端点/final 产出），验证"音频全程有语音但 21.9s 后
///              无 Final 产出"的机制。用法：
///              ENTROPY_REPLAY_WAV=<22.wav 路径> cargo test --lib replay_session -- --ignored --nocapture
#[test]
#[ignore = "集成复现：需要真实流式模型 + 会话音频（ENTROPY_REPLAY_WAV）"]
fn replay_session_audio_vad_and_engine() {
    use crate::capture::resample::compute_rms;
    use crate::vad_adaptive::{AdaptiveVad, AdaptiveVadConfig};

    let wav = std::env::var("ENTROPY_REPLAY_WAV").expect("ENTROPY_REPLAY_WAV 环境变量");
    let appdata = std::env::var("APPDATA").expect("APPDATA 环境变量");
    let models_dir = std::env::var("ENTROPY_MODELS_DIR")
        .unwrap_or_else(|_| format!("{}\\com.entropydecrease.app\\models", appdata));
    let m = |name: &str| format!("{}\\streaming-zipformer\\{}", models_dir, name);

    // 读 WAV（44 字节头 PCM16 16k 单声道，防御性解析）
    let bytes = std::fs::read(&wav).expect("读取 wav");
    assert!(&bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE", "非法 wav 头");
    let data = &bytes[44..];
    let samples: Vec<f32> = data
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32767.0)
        .collect();

    let models = StreamingAsrModels {
        encoder: m("encoder.fp16.onnx"),
        decoder: m("decoder.fp16.onnx"),
        joiner: m("joiner.fp16.onnx"),
        tokens: m("tokens.txt"),
    };
    let punct = format!("{}\\punctuation\\model.int8.onnx", models_dir);
    let mut engine = StreamingAsrEngine::load(&models, &StreamingAsrConfig::default(), None, None, Some(punct))
        .expect("流式引擎加载成功");

    let mut vad = AdaptiveVad::new(AdaptiveVadConfig { enabled: true });
    const BLOCK: usize = 16_000 / 5; // 200ms
    let mut silent_total = 0usize;
    let mut finals = 0usize;
    let mut blocks = 0usize;
    let mut last_log_sec = 0usize;
    let mut silent_in_sec = 0usize;
    for (i, chunk) in samples.chunks(BLOCK).enumerate() {
        let sec = i / 5;
        let raw_rms = compute_rms(chunk);
        let threshold = vad.next_threshold(raw_rms, 0.005);
        let silent = raw_rms < threshold;
        if silent {
            silent_total += 1;
            silent_in_sec += 1;
        }
        let events = engine.feed(chunk, silent);
        for e in events {
            match e {
                StreamingAsrEvent::Final { text, merge_with_next, .. } => {
                    finals += 1;
                    let t = i as f64 * 0.2;
                    println!(
                        "  [Final #{:02} t={:6.1}s merge={}] {}",
                        finals,
                        t,
                        merge_with_next,
                        &text.chars().take(40).collect::<String>()
                    );
                }
                StreamingAsrEvent::Partial { .. } => {}
            }
        }
        if sec != last_log_sec {
            println!(
                "  t={:4}s rms={:6.4} thr={:6.4} silent_this_sec={}/5 (累计静音 {}/{})",
                sec,
                raw_rms,
                threshold,
                silent_in_sec,
                silent_total,
                i
            );
            silent_in_sec = 0;
            last_log_sec = sec;
        }
        blocks = i;
    }
    if let Some(StreamingAsrEvent::Final { text, .. }) = engine.flush() {
        println!("  [flush t={:.1}s] {}", blocks as f64 * 0.2, &text.chars().take(40).collect::<String>());
    }
    println!("复现结束：{} 块，静音判定 {}/{}（{:.0}%），Final 产出 {} 个", blocks + 1, silent_total, blocks + 1, silent_total as f64 * 100.0 / (blocks + 1) as f64, finals);
}

/// 集成复现：SenseVoice 逐窗口推理耗时（会话 22 积压假设验证，2026-08-19）。
///
/// @ai-context: 产品 maybe_rescore 每端点**同步阻塞**等待 transcribe_pcm——
///              若每 8s 段的 SenseVoice 推理耗时接近/超过语音周期，主循环
///              处理速率 < 音频产生速率 → channel 无界积压 → 停止时积压块
///              被 `while !stop` 退出直接丢弃（会话 22 实测 ~33s 语音缺失）。
#[test]
#[ignore = "集成复现：需要真实 SenseVoice 模型（ENTROPY_REPLAY_WAV）"]
fn sensevoice_inference_latency_per_window() {
    use std::time::Instant;
    let wav = std::env::var("ENTROPY_REPLAY_WAV").expect("ENTROPY_REPLAY_WAV 环境变量");
    let appdata = std::env::var("APPDATA").expect("APPDATA 环境变量");
    let models_dir = std::env::var("ENTROPY_MODELS_DIR")
        .unwrap_or_else(|_| format!("{}\\com.entropydecrease.app\\models", appdata));
    let model = format!("{}\\asr\\sensevoice\\model.int8.onnx", models_dir);
    let tokens = format!("{}\\asr\\sensevoice\\tokens.txt", models_dir);

    let mut config = sherpa_onnx::OfflineRecognizerConfig::default();
    config.model_config.sense_voice = sherpa_onnx::OfflineSenseVoiceModelConfig {
        model: Some(model),
        language: Some("auto".into()),
        use_itn: true,
    };
    config.model_config.tokens = Some(tokens);
    let rec = sherpa_onnx::OfflineRecognizer::create(&config).expect("SenseVoice 加载成功");

    let bytes = std::fs::read(&wav).expect("读取 wav");
    let data = &bytes[44..];
    let samples: Vec<f32> = data
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32767.0)
        .collect();

    // 以 8s（rule3 段）为窗口滑窗转写并计时（步长 8s，与端点周期对齐）
    const WIN: usize = 16_000 * 8;
    let mut total = 0.0;
    for (i, w) in samples.chunks(WIN).enumerate() {
        let t0 = Instant::now();
        let stream = rec.create_stream();
        stream.accept_waveform(16_000, w);
        rec.decode(&stream);
        let text = stream.get_result().map(|r| r.text).unwrap_or_default();
        let dt = t0.elapsed().as_secs_f32();
        total += dt;
        println!(
            "  窗口#{:02} {:.1}-{:.1}s 推理 {:.2}s | {}",
            i,
            i as f32 * 8.0,
            (i + 1) as f32 * 8.0,
            dt,
            &text.chars().take(30).collect::<String>()
        );
    }
    let n = samples.len().div_ceil(WIN);
    println!(
        "SenseVoice 平均推理 {:.2}s/8s窗口（实时比 {:.2}x）——{} 个窗口合计 {:.2}s",
        total / n as f32,
        total / (samples.len() as f32 / 16_000.0),
        n,
        total
    );
}
