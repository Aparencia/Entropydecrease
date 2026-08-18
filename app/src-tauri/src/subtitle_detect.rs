//! 字幕探测与优先决策（REQ-016/017/018，ADR-008）。
//!
//! @ai-context: 三级降级策略：L1 外挂字幕（同名 .srt/.ass/.vtt，纯文本解析零依赖）→
//!              L2 内嵌字幕轨（ffprobe 探测 + ffmpeg 解出为标准 SRT）→ 无字幕
//!              （调用方回退 ASR）。命中字幕即免 ASR（零成本 100% 准确）。
//! @ai-context: L2 依赖 ffmpeg（FfmpegResolver）：解析/解码失败降级回 ASR（不阻断），
//!              仅 ffmpeg 完全缺失时返回可操作错误（此时音轨提取同样不可用）。
//! @ai-context: 本模块只做"探测 + 解析"，管线编排在 import.rs。

use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};
use crate::ffmpeg::{self, FfmpegPaths, FfmpegResolver};
use crate::fusion::SubtitleSegment;
use crate::subtitle::{parse_subtitle, parse_subtitle_file, SubtitleFormat};

/// 外挂字幕扩展名探测优先级（vtt 最精确 → srt → ass）。
const EXTERNAL_EXTENSIONS: [&str; 3] = ["vtt", "srt", "ass"];

/// 字幕决策结果（调用方按命中情况选择转写路径）。
#[derive(Debug, Clone, PartialEq)]
pub enum SubtitleDecision {
    /// L1 外挂字幕命中
    External(Vec<SubtitleSegment>),
    /// L2 内嵌字幕轨命中
    Embedded(Vec<SubtitleSegment>),
    /// 无字幕（回退 ASR）
    None,
}

impl SubtitleDecision {
    /// 命中的字幕段（未命中为空）。
    pub fn segments(&self) -> &[SubtitleSegment] {
        match self {
            SubtitleDecision::External(segs) | SubtitleDecision::Embedded(segs) => segs,
            SubtitleDecision::None => &[],
        }
    }

    /// 是否命中字幕（免 ASR 判定）。
    pub fn is_hit(&self) -> bool {
        !self.segments().is_empty()
    }
}

/// 探测视频同目录同名外挂字幕（优先级 vtt > srt > ass）；未命中返回 None。
pub fn probe_external(video_path: &Path) -> Option<PathBuf> {
    let dir = video_path.parent()?;
    let stem = video_path.file_stem()?.to_string_lossy().into_owned();
    for ext in EXTERNAL_EXTENSIONS {
        let candidate = dir.join(format!("{}.{}", stem, ext));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// 字幕优先决策：L1 → L2 → None。
///
/// @ai-context: L2 内部失败（ffprobe/ffmpeg 解码错误）降级为 None 并告警——
///              字幕是增强路径，失败不阻断导入（ASR 兜底）。
pub fn decide_subtitle(video_path: &Path, resolver: &FfmpegResolver) -> Result<SubtitleDecision> {
    decide_subtitle_with_path(video_path, resolver, std::env::var_os("PATH").as_deref())
}

/// 决策实现（PATH 可注入——测试隔离，避免污染全局环境变量）。
fn decide_subtitle_with_path(
    video_path: &Path,
    resolver: &FfmpegResolver,
    path_env: Option<&std::ffi::OsStr>,
) -> Result<SubtitleDecision> {
    // L1：纯文本解析，零外部依赖，始终可用
    if let Some(sub_path) = probe_external(video_path) {
        return parse_subtitle_file(&sub_path).map(SubtitleDecision::External);
    }
    // L2：需 ffmpeg；缺失直接报可操作错误（音轨提取同样需要它）
    let paths = resolver.resolve_with_path(path_env)?;
    match extract_embedded_subtitles(&paths, video_path) {
        Ok(Some(segs)) => Ok(SubtitleDecision::Embedded(segs)),
        Ok(None) => Ok(SubtitleDecision::None),
        Err(e) => {
            eprintln!("[Import] 内嵌字幕解析失败，回退 ASR: {}", e);
            Ok(SubtitleDecision::None)
        }
    }
}

/// 提取内嵌字幕轨：ffprobe 探测 → ffmpeg 解出 SRT → 复用 L1 解析器。
fn extract_embedded_subtitles(paths: &FfmpegPaths, video: &Path) -> Result<Option<Vec<SubtitleSegment>>> {
    // 1) 探测：无字幕轨直接返回 None（不启动 ffmpeg 解码）
    let probe_out = ffmpeg::run_captured(&paths.ffprobe, &ffmpeg::probe_subtitle_streams_args(video), ffmpeg::default_timeout())?;
    let json: serde_json::Value = serde_json::from_slice(&probe_out)
        .map_err(|e| AppError::Io(format!("ffprobe 输出解析失败: {}", e)))?;
    let has_streams = json
        .get("streams")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if !has_streams {
        return Ok(None);
    }
    // 2) 解出首条字幕轨为 SRT 文本
    let srt_out = ffmpeg::run_captured(&paths.ffmpeg, &ffmpeg::extract_subtitle_args(video), ffmpeg::default_timeout())?;
    let text = String::from_utf8_lossy(&srt_out);
    let segments = parse_subtitle(&text, SubtitleFormat::Srt);
    if segments.is_empty() {
        Ok(None)
    } else {
        Ok(Some(segments))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_external_finds_same_name_subtitle() {
        // Arrange：临时目录放 同名 .srt
        let dir = tempfile::tempdir().expect("tempdir");
        let video = dir.path().join("第一课.mp4");
        std::fs::write(dir.path().join("第一课.srt"), "1\n00:00:01,000 --> 00:00:02,000\n你好\n").expect("write");
        // Act
        let found = probe_external(&video);
        // Assert
        assert_eq!(found, Some(dir.path().join("第一课.srt")));
    }

    #[test]
    fn probe_external_prioritizes_vtt_over_srt() {
        // Arrange：同名 .srt 与 .vtt 并存
        let dir = tempfile::tempdir().expect("tempdir");
        let video = dir.path().join("lesson.mp4");
        std::fs::write(dir.path().join("lesson.srt"), "x").expect("write");
        std::fs::write(dir.path().join("lesson.vtt"), "WEBVTT").expect("write");
        // Act
        let found = probe_external(&video);
        // Assert：vtt 优先
        assert_eq!(found, Some(dir.path().join("lesson.vtt")));
    }

    #[test]
    fn probe_external_missing_is_none() {
        // Arrange & Act：无任何字幕文件
        let dir = tempfile::tempdir().expect("tempdir");
        let video = dir.path().join("lesson.mp4");
        // Assert
        assert!(probe_external(&video).is_none());
    }

    #[test]
    fn decide_subtitle_uses_external_when_hit() {
        // Arrange：L1 命中（无需 ffmpeg）
        let dir = tempfile::tempdir().expect("tempdir");
        let video = dir.path().join("lesson.mp4");
        std::fs::write(dir.path().join("lesson.srt"), "1\n00:00:01,000 --> 00:00:02,000\n你好\n").expect("write");
        // Act
        let decision = decide_subtitle(&video, &FfmpegResolver::dev()).expect("decide");
        // Assert
        assert!(decision.is_hit());
        assert_eq!(decision.segments().len(), 1);
        assert_eq!(decision.segments()[0].text, "你好");
    }

    #[test]
    fn decide_subtitle_without_ffmpeg_is_actionable_error() {
        // Arrange：无外挂字幕 + 强制空候选目录（无 ENTROPY_FFMPEG_DIR、空 extra_dirs、PATH 注入 None）
        let dir = tempfile::tempdir().expect("tempdir");
        let video = dir.path().join("lesson.mp4");
        std::fs::write(&video, "fake").expect("write");
        let resolver = FfmpegResolver::with_dirs(vec![]);
        // Act：PATH 注入 None（= 无 PATH 可探测），不污染全局环境变量
        let decision = decide_subtitle_with_path(&video, &resolver, None);
        // Assert：可操作错误（引导下载 ffmpeg）
        assert!(decision.is_err());
        let err = decision.unwrap_err().to_string();
        assert!(err.contains("ffmpeg"), "错误应引导 ffmpeg: {}", err);
    }
}
