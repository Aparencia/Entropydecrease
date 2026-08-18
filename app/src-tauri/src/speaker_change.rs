//! 说话人变化检测（REQ-046 / v0.5.0 M2，头脑风暴 A3：弱化版）。
//!
//! @ai-context: 访谈/会议档案支撑——**弱化版（不聚类身份）**：sherpa-onnx
//!              SpeakerEmbeddingExtractor 在 VAD 间隙提取音色向量，相邻向量
//!              余弦相似度低于阈值 → "讲者切换"事件（不识别是谁，只标记切换点）。
//! @ai-context: 本模块只含纯逻辑（余弦相似度 + 阈值判定），可注入 fake 向量单测；
//!              embedding 提取由引擎侧按需接入（模型缺失 → 降级为无讲者标注形态，
//!              产物模板含可选讲者字段——M7 消费）。
//! @ai-context: A3 spike 结论（2026-08）：sherpa-onnx 1.13 暴露 SpeakerEmbeddingExtractor
//!              （create/compute_embedding），弱化版路径成立；模型分发留 V1.0
//!              （G4 按需下载），本版判定器先行 + 降级形态兜底。

/// 讲者切换判定：余弦相似度低于该阈值视为换人（0.75 ≈ 常见 speaker 模型经验值）。
const SPEAKER_CHANGE_COSINE_THRESHOLD: f32 = 0.75;
/// 置信度判定：相似度距阈值越远置信度越高（0.0-1.0 归一）。
const CONFIDENCE_SPAN: f32 = 0.2;

/// 讲者切换事件。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SpeakerChangeEvent {
    /// 切换时刻（ms，取后一段起点）
    pub time_ms: u64,
    /// 切换置信度 0.0-1.0（距阈值越远越高）
    pub confidence: f32,
}

/// 语音段（VAD 间隙切出的可说话人片段）。
#[derive(Debug, Clone, PartialEq)]
pub struct SpeechSegment {
    pub start_ms: u64,
    /// 音色 embedding 向量（提取器输出；空向量视为无效段跳过）
    pub embedding: Vec<f32>,
}

/// 讲者切换检测（纯函数）：相邻语音段 embedding 余弦相似度 < 阈值 → 切换事件。
///
/// @ai-context: 输入段需按时间有序；空 embedding/零向量段跳过（提取失败不产生
///              误判切换）；连续多段同讲者不产生事件（只标记边界）。
pub fn detect_speaker_changes(segments: &[SpeechSegment]) -> Vec<SpeakerChangeEvent> {
    let mut events = Vec::new();
    let mut prev: Option<&SpeechSegment> = None;
    for seg in segments {
        if seg.embedding.is_empty() || norm(&seg.embedding) < 1e-6 {
            prev = None; // 无效段：重置前驱（避免跨无效段误判）
            continue;
        }
        if let Some(p) = prev {
            let sim = cosine(&p.embedding, &seg.embedding);
            if sim < SPEAKER_CHANGE_COSINE_THRESHOLD {
                let confidence = ((SPEAKER_CHANGE_COSINE_THRESHOLD - sim) / CONFIDENCE_SPAN)
                    .clamp(0.0, 1.0);
                events.push(SpeakerChangeEvent { time_ms: seg.start_ms, confidence });
            }
        }
        prev = Some(seg);
    }
    events
}

/// 余弦相似度（纯函数；零向量返回 0）。
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na <= 1e-12 || nb <= 1e-12 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

/// 向量范数（纯函数）。
fn norm(v: &[f32]) -> f32 {
    v.iter().map(|x| x * x).sum::<f32>().sqrt()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "speaker_change_tests.rs"]
mod tests;
