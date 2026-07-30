"""
熵减 AI 网关 — ASR 语音转写 Chain

编排语音转文字的完整流程：
1. 接收音频 base64 数据（PCM/WAV）
2. 调用 Provider 的 transcribe 方法进行语音识别
3. 后处理转写结果（格式化、分段等）

@ai-context: 语音转写 Chain：编排音频转文字流程。
"""

import logging
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)


class TranscribeChain:
    """语音转文字处理链"""

    def __init__(self, provider: AIProvider, model: str = "qwen3-asr-flash"):
        self.provider = provider
        self.model = model

    def _postprocess_result(self, result: dict[str, Any]) -> dict[str, Any]:
        """后处理转写结果：确保字段完整、格式统一"""
        text = result.get("text", "").strip()
        segments = result.get("segments", [])

        # 确保 segments 格式统一
        normalized_segments = []
        for seg in segments:
            if isinstance(seg, dict):
                normalized_segments.append({
                    "start": float(seg.get("start", 0.0)),
                    "end": float(seg.get("end", 0.0)),
                    "text": str(seg.get("text", "")).strip(),
                })

        # 如果没有 segments 但有 text，生成单段
        if not normalized_segments and text:
            normalized_segments.append({
                "start": 0.0,
                "end": 0.0,
                "text": text,
            })

        result["text"] = text
        result["segments"] = normalized_segments
        return result

    async def run(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
    ) -> dict[str, Any]:
        """
        将音频 base64 数据转写为文本

        Args:
            audio_base64: 音频数据（PCM/WAV base64 编码）
            language: 语言代码（zh/en/auto）
            sample_rate: 采样率
            channels: 声道数

        Returns:
            {
                "text": "转写文本",
                "segments": [{"start": 0.0, "end": 2.5, "text": "..."}],
                "language": "zh",
                "confidence": 0.95,
                "model": "qwen3-asr-flash",
                "latency_ms": 500,
            }
        """
        logger.info(
            "TranscribeChain.run: audio_size=%d chars, language=%s, sample_rate=%d",
            len(audio_base64), language, sample_rate,
        )

        result = await self.provider.transcribe(
            audio_base64=audio_base64,
            language=language,
            sample_rate=sample_rate,
            channels=channels,
            model=self.model,
            _feature="transcribe",
        )

        # 后处理
        result = self._postprocess_result(result)
        result.setdefault("language", language)
        result.setdefault("confidence", 0.0)
        result.setdefault("model", self.model)

        return result
