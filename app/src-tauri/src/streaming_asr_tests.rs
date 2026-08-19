//! 流式 ASR 引擎测试（AAA 模式；纯函数不依赖真实模型——引擎相关为集成测试标注）。
//!
//! @ai-context: 由 streaming_asr.rs 以 #[cfg(test)] #[path] 引入。
//! @ai-context: 重打分决策（pick_rescored/levenshtein）测试在 asr_rescore.rs，
//!              净化（clean_asr_result）测试在 asr_clean.rs，跨 final 去重测试在
//!              asr_dedupe.rs——本文件只保留引擎状态机纯函数与集成测试。

use crate::streaming_asr::{silence_feed_decision, StreamingAsrConfig, StreamingAsrEngine, StreamingAsrModels};

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
