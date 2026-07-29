"""
熵减 AI 网关 — 视频分析 Chain

@ai-context Path C 核心链路：客户端上传录制视频 →
本 Chain 编排视频分析（优先原生视频 → 降级抽帧多图）→
输出结构化 Markdown 课堂笔记。

与 MultimodalAnalyzeChain 的差异：
- MultimodalAnalyzeChain：客户端已抽取关键帧 + 语音转写
- VideoAnalyzeChain：直接接收完整视频文件，服务端自主分析

降级策略：当 Provider 不支持原生视频输入时，
使用 ffmpeg 均匀抽取关键帧后转为多图分析。
"""

import base64
import logging
import tempfile
from pathlib import Path
from typing import Any

from providers.base_provider import AIProvider
from prompts.video_analyze import (
    VIDEO_ANALYZE_SYSTEM_PROMPT,
    build_video_prompt,
)

logger = logging.getLogger(__name__)

# 降级抽帧配置：均匀抽取的帧数上限
_FALLBACK_FRAME_COUNT = 10


def _extract_frames_ffmpeg(video_path: str, frame_count: int) -> list[str]:
    """
    使用 ffmpeg 从视频中均匀抽取关键帧（返回 base64 列表）

    @ai-context 当 Provider 不支持原生视频时，降级为抽帧多图分析。
    ffmpeg 是服务端最常见的视频处理工具，几乎必装。

    Returns:
        list[str]: 抽取帧的 base64 编码列表（JPEG 格式）

    Raises:
        RuntimeError: ffmpeg 不可用或抽帧失败
    """
    import subprocess

    try:
        # 获取视频时长
        probe_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe 获取时长失败: {result.stderr}")
        duration = float(result.stdout.strip())

        # 均匀间隔抽帧
        interval = max(duration / (frame_count + 1), 1.0)
        frames: list[str] = []

        with tempfile.TemporaryDirectory() as tmpdir:
            for i in range(frame_count):
                ts = interval * (i + 1)
                out_path = Path(tmpdir) / f"frame_{i:03d}.jpg"
                cmd = [
                    "ffmpeg", "-ss", str(ts),
                    "-i", video_path,
                    "-frames:v", "1",
                    "-q:v", "3",
                    str(out_path),
                    "-y",
                ]
                subprocess.run(cmd, capture_output=True, timeout=15, check=True)
                if out_path.exists():
                    frames.append(base64.b64encode(out_path.read_bytes()).decode())

        if not frames:
            raise RuntimeError("ffmpeg 未抽取到任何帧")

        logger.info("ffmpeg 抽帧完成: video=%s, frames=%d", video_path, len(frames))
        return frames

    except FileNotFoundError as e:
        raise RuntimeError("ffmpeg 未安装，无法进行视频抽帧降级") from e
    except Exception as e:
        raise RuntimeError(f"视频抽帧失败: {e}") from e


class VideoAnalyzeChain:
    """视频分析链：原生视频优先 → 抽帧多图降级"""

    def __init__(self, provider: AIProvider, model: str | None = None):
        self.provider = provider
        self.model = model or ""

    def _parse_response(self, raw: str) -> str:
        """
        清理模型返回内容

        视频分析直接输出 Markdown，若模型意外包裹代码块围栏则去除。
        """
        stripped = raw.strip()
        if stripped.startswith("```markdown"):
            stripped = stripped[len("```markdown"):].strip()
            if stripped.endswith("```"):
                stripped = stripped[:-3].strip()
        elif stripped.startswith("```") and stripped.endswith("```"):
            inner = stripped[3:].strip()
            if inner.endswith("```"):
                inner = inner[:-3].strip()
            if "```" not in inner:
                stripped = inner
        return stripped

    async def run(
        self,
        video_input: str | bytes,
        duration: int,
        language: str = "zh-CN",
    ) -> dict[str, Any]:
        """
        执行视频分析

        优先调用 Provider 原生视频能力（如 Gemini），
        若 Provider 不支持则降级为 ffmpeg 抽帧 + 多图分析。

        Args:
            video_input: 视频文件路径、bytes 或 base64
            duration: 视频时长（秒），用于 Prompt 构建
            language: 输出语言

        Returns:
            dict: {content, tokens_used, model, latency_ms, duration_analyzed}
        """
        prompt = build_video_prompt(duration_seconds=duration, language=language)

        # ---- 路径 A：尝试原生视频分析 ----
        try:
            result = await self.provider.generate_video(
                video_input=video_input,
                prompt=prompt,
                system_prompt=VIDEO_ANALYZE_SYSTEM_PROMPT,
                model=self.model,
                _feature="video_analyze",
            )
            logger.info("VideoAnalyzeChain: 原生视频分析成功, model=%s", self.model)
            return {
                "content": self._parse_response(result["content"]),
                "tokens_used": result.get("tokens_used", 0),
                "model": result.get("model", self.model),
                "latency_ms": result.get("latency_ms", 0),
                "duration_analyzed": duration,
            }
        except NotImplementedError:
            logger.info("VideoAnalyzeChain: Provider 不支持原生视频，降级为抽帧多图")
        except Exception as e:
            logger.warning("VideoAnalyzeChain: 原生视频分析失败(%s)，降级为抽帧多图", str(e))

        # ---- 路径 B：降级为抽帧 + 多图分析 ----
        # 仅支持文件路径抽帧（bytes/base64 无法直接交给 ffmpeg）
        if isinstance(video_input, bytes) or (
            isinstance(video_input, str) and not Path(video_input).is_file()
        ):
            raise RuntimeError(
                "Provider 不支持原生视频，且输入非文件路径，无法进行抽帧降级"
            )

        try:
            frames = _extract_frames_ffmpeg(str(video_input), _FALLBACK_FRAME_COUNT)
        except RuntimeError as e:
            raise RuntimeError(f"视频分析失败：Provider 不支持视频且抽帧不可用: {e}") from e

        logger.info("VideoAnalyzeChain: 抽帧 %d 帧进行多图分析", len(frames))
        result = await self.provider.generate_vision_multi(
            images_base64=frames,
            prompt=f"[抽帧降级模式，共 {len(frames)} 帧]\n{prompt}",
            system_prompt=VIDEO_ANALYZE_SYSTEM_PROMPT,
            model=self.model,
            temperature=0.3,
            max_tokens=4096,
            _feature="video_analyze",
        )

        return {
            "content": self._parse_response(result["content"]),
            "tokens_used": result.get("tokens_used", 0),
            "model": result.get("model", self.model),
            "latency_ms": result.get("latency_ms", 0),
            "duration_analyzed": duration,
        }
