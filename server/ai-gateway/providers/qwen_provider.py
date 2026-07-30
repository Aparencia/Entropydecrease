"""
熵减 AI 网关 — QwenProvider（通义千问 / 阿里云百炼）

通过 OpenAI 兼容 SDK 调用阿里云百炼平台。
- base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
- 支持 JSON Mode: response_format={"type": "json_object"}
- 所有 prompt 使用中文

@ai-context: 文本生成/语音转写/流式能力在本文件；视觉/视频能力经
QwenVisionMixin（qwen_vision.py）多重继承引入。错误分类器
_handle_provider_error 定义于 qwen_vision.py 并由本文件复用。
"""

import base64
import time
import logging
from typing import Any, AsyncGenerator

import openai
from openai import AsyncOpenAI

from providers.base_provider import AIProvider, with_retry_and_timeout
from providers.qwen_vision import QwenVisionMixin, _handle_provider_error
from errors import ProviderUnavailableError, ModelResponseError, RateLimitExceededError

logger = logging.getLogger(__name__)


class QwenProvider(AIProvider, QwenVisionMixin):
    """通义千问 Provider — 阿里云百炼平台"""

    def __init__(self, base_url: str, api_key: str):
        super().__init__(base_url, api_key, provider_name="qwen")
        # 使用 openai SDK 的兼容模式连接阿里云百炼
        self._client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
        )

    @with_retry_and_timeout()
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "qwen-plus",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用通义千问生成内容

        使用 openai 兼容 SDK 发起请求，支持 JSON Mode 输出。
        """
        start_time = time.monotonic()

        # 构建消息列表（中文系统提示）
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            # 构建请求参数
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            # JSON Mode 支持（闪卡生成等场景）
            if response_format:
                kwargs["response_format"] = response_format

            response = await self._client.chat.completions.create(**kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)

            # 提取结果
            content = response.choices[0].message.content or ""
            tokens_used = 0
            if response.usage:
                tokens_used = response.usage.total_tokens or 0

            logger.info(
                "QwenProvider 调用成功: model=%s, tokens=%d, latency=%dms",
                model, tokens_used, latency_ms,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            logger.error("QwenProvider 调用失败: %s", str(e))
            _handle_provider_error(e, model)

    @with_retry_and_timeout()
    async def transcribe(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
        model: str = "paraformer-v2",
    ) -> dict[str, Any]:
        """
        调用阿里云 DashScope Paraformer 语音转文字

        通过 OpenAI 兼容的 audio transcription 接口调用 Paraformer 模型。
        """
        start_time = time.monotonic()

        try:
            audio_bytes = base64.b64decode(audio_base64)
            import io
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = "audio.wav"

            kwargs: dict[str, Any] = {
                "model": model,
                "file": audio_file,
                "language": language if language != "auto" else "zh",
            }

            response = await self._client.audio.transcriptions.create(**kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)
            text = response.text if hasattr(response, "text") else str(response)

            logger.info(
                "QwenProvider.transcribe 调用成功: model=%s, text_length=%d, latency=%dms",
                model, len(text), latency_ms,
            )

            return {
                "text": text,
                "segments": [],
                "language": language,
                "confidence": 0.9,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            err_str = str(e).lower()
            logger.error("QwenProvider.transcribe 调用失败: %s (耗时 %dms)", str(e), latency_ms)

            if isinstance(e, openai.APITimeoutError) or "timeout" in err_str:
                raise ProviderUnavailableError("qwen", f"ASR 网络超时: {e}") from e
            if isinstance(e, openai.RateLimitError) or "rate_limit" in err_str or "429" in err_str:
                raise RateLimitExceededError("qwen", 0) from e
            if isinstance(e, openai.APIConnectionError) or "connection" in err_str:
                raise ProviderUnavailableError("qwen", f"ASR 连接失败: {e}") from e

            raise ModelResponseError(model, str(e)) from e

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "qwen-plus",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式调用通义千问生成内容"""
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            }
            if response_format:
                kwargs["response_format"] = response_format

            stream = await self._client.chat.completions.create(**kwargs)
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except Exception as e:
            logger.error("QwenProvider.generate_stream 失败: %s", str(e))
            _handle_provider_error(e, model)
