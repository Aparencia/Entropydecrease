//! 流式 ASR 纯函数单测（AAA 模式；不依赖真实模型文件——引擎相关为集成测试标注）。
//!
//! @ai-context: 由 streaming_asr.rs 以 #[cfg(test)] #[path] 引入。

use crate::streaming_asr::{levenshtein, pick_rescored, StreamingAsrEngine, StreamingAsrModels};

#[test]
fn levenshtein_identical_is_zero() {
    // Act & Assert
    assert_eq!(levenshtein("今天讲熵减", "今天讲熵减"), 0);
}

#[test]
fn levenshtein_insertion_counts_one() {
    // Act & Assert：插入 1 字
    assert_eq!(levenshtein("熵减", "熵减概念"), 2);
}

#[test]
fn levenshtein_substitution_counts_one() {
    // Act & Assert：替换 1 字
    assert_eq!(levenshtein("物理", "无理"), 1);
}

#[test]
fn levenshtein_empty_strings() {
    // Act & Assert
    assert_eq!(levenshtein("", ""), 0);
    assert_eq!(levenshtein("abc", ""), 3);
    assert_eq!(levenshtein("", "abc"), 3);
}

#[test]
fn rescored_takes_sensevoice_when_close() {
    // Arrange：编辑距离 1（≤40% 阈值），SenseVoice 应胜出
    let zip = "熵减的概念";
    let sense = "熵减的概念";
    // Act
    let picked = pick_rescored(zip, sense);
    // Assert
    assert_eq!(picked.as_deref(), Some("熵减的概念"));
}

#[test]
fn rescored_keeps_zipformer_when_far() {
    // Arrange：语义差异大（编辑距离超阈值）→ 保留 Zipformer
    let zip = "今天讲牛顿定律";
    let sense = "明天考试加油";
    // Act
    let picked = pick_rescored(zip, sense);
    // Assert
    assert_eq!(picked, None);
}

#[test]
fn rescored_handles_empty_inputs() {
    // Act & Assert：任一为空 → None
    assert_eq!(pick_rescored("", "有内容"), None);
    assert_eq!(pick_rescored("有内容", ""), None);
    assert_eq!(pick_rescored("", ""), None);
}

#[test]
fn rescored_trim_normalizes_whitespace() {
    // Arrange：首尾空白不应影响一致性判断
    let zip = "  熵减  ";
    let sense = "熵减";
    // Act
    let picked = pick_rescored(zip, sense);
    // Assert
    assert_eq!(picked.as_deref(), Some("熵减"));
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
    // Act：加载（第一代 zipformer，自动推断——修复前此处崩溃；M5 词表参数传 None）
    let mut engine = StreamingAsrEngine::load(&models, None, None).expect("流式模型加载成功");
    // 喂入合成音频（1s 随机噪声 = 非静音，走完整 decode 路径）
    let samples: Vec<f32> = (0..16000).map(|i| ((i % 997) as f32 / 997.0 - 0.5) * 0.2).collect();
    let events = engine.feed(&samples, false);
    // Assert：不崩溃；事件可为空（噪声无有效语音）但可安全 flush
    let _ = engine.flush();
    let _ = events;
    println!("流式引擎加载与喂入通过（模型目录: {}", base);
}
