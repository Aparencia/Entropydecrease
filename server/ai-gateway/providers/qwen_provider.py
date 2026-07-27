"""
课伴 AI 网关 — QwenProvider（通义千问 / 阿里云百炼）

通过 OpenAI 兼容 SDK 调用阿里云百炼平台。
- base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
- 支持 JSON Mode: response_format={"type": "json_object"}
- 所有 prompt 使用中文
"""

import base64
import time
import logging
from typing import Any, AsyncGenerator

import openai
from openai import AsyncOpenAI

from providers.base_provider import AIProvider, with_retry_and_timeout
from errors import ProviderUnavailableError, ModelResponseError, RateLimitExceededError

logger = logging.getLogger(__name__)


def _handle_provider_error(error: Exception, model: str) -> None:
    """分类 Provider 错误并抛出对应异常（供各方法复用）"""
    err_str = str(error).lower()
    if isinstance(error, openai.APITimeoutError) or "timeout" in err_str:
        raise ProviderUnavailableError("qwen", f"网络超时: {error}") from error
    if isinstance(error, openai.RateLimitError) or "rate_limit" in err_str or "429" in err_str:
        raise RateLimitExceededError("qwen", 0) from error
    if isinstance(error, openai.APIConnectionError) or "connection" in err_str:
        raise ProviderUnavailableError("qwen", f"连接失败: {error}") from error
    if "content" in err_str and ("filter" in err_str or "policy" in err_str or "审核" in err_str):
        raise ModelResponseError(model, "内容未通过安全审核") from error
    raise ModelResponseError(model, str(error)) from error


class QwenProvider(AIProvider):
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

    @with_retry_and_timeout()
    async def generate_vision(
        self,
        image_base64: str,
        prompt: str,
        system_prompt: str = "",
        model: str = "qwen-vl-plus",
        temperature: float = 0.3,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用通义千问 Qwen-VL-Plus 多模态视觉模型

        Qwen-VL-Plus 支持图片 + 文本输入，通过 OpenAI 兼容接口发送
        多模态消息格式。
        """
        start_time = time.monotonic()

        # 构建多模态消息列表
        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # 用户消息包含图片和文本
        user_content: list[dict[str, Any]] = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{image_base64}"},
            },
            {"type": "text", "text": prompt},
        ]
        messages.append({"role": "user", "content": user_content})

        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format:
                kwargs["response_format"] = response_format

            response = await self._client.chat.completions.create(**kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)

            content = response.choices[0].message.content or ""
            tokens_used = 0
            if response.usage:
                tokens_used = response.usage.total_tokens or 0

            logger.info(
                "QwenProvider.generate_vision 调用成功: model=%s, tokens=%d, latency=%dms",
                model, tokens_used, latency_ms,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            logger.error("QwenProvider.generate_vision 调用失败: %s", str(e))
            _handle_provider_error(e, model)

    @with_retry_and_timeout()
    async def generate_vision_multi(
        self,
        images_base64: list[str],
        prompt: str,
        system_prompt: str = "",
        model: str = "qwen-vl-plus",
        temperature: float = 0.3,
        max_tokens: int = 4096,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        多模态多图分析（Qwen-VL-Plus 原生多图支持）

        @ai-context 课堂多帧截图需要在单次请求中联合分析，
        Qwen-VL-Plus 支持在 user_content 中追加多个 image_url 项，
        模型能感知帧间时序关系，比逐图拼接质量更高。
        """
        start_time = time.monotonic()

        # 构建多模态消息列表
        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # user_content 中依次追加多张图片，最后追加文本提示
        user_content: list[dict[str, Any]] = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img}"},
            }
            for img in images_base64
        ]
        user_content.append({"type": "text", "text": prompt})
        messages.append({"role": "user", "content": user_content})

        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format:
                kwargs["response_format"] = response_format

            response = await self._client.chat.completions.create(**kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)

            content = response.choices[0].message.content or ""
            tokens_used = 0
            if response.usage:
                tokens_used = response.usage.total_tokens or 0

            logger.info(
                "QwenProvider.generate_vision_multi 调用成功: model=%s, images=%d, tokens=%d, latency=%dms",
                model, len(images_base64), tokens_used, latency_ms,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            logger.error("QwenProvider.generate_vision_multi 调用失败: %s", str(e))
            _handle_provider_error(e, model)

    async def generate_video(
        self,
        video_input: str | bytes,
        prompt: str,
        system_prompt: str = "",
        model: str = "qwen-vl-plus",
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Qwen 视频分析（仅支持 URL 视频输入）

        @ai-context DashScope 视频输入要求 URL 方式，不支持 base64 内联。
        本地文件场景应使用 Gemini Provider，Chain 层负责 fallback 逻辑。
        """
        # bytes 或 base64 输入不支持，要求 URL
        if isinstance(video_input, bytes):
            raise NotImplementedError(
                "Qwen 要求视频 URL 输入，不支持 bytes，请使用 Gemini 处理本地文件"
            )

        # 简单判断：如果是文件路径（非 URL），拒绝
        if isinstance(video_input, str) and not video_input.startswith(("http://", "https://")):
            raise NotImplementedError(
                "Qwen 要求视频 URL，不支持本地文件路径，请使用 Gemini 处理本地文件"
            )

        start_time = time.monotonic()

        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # DashScope 视频消息格式
        user_content: list[dict[str, Any]] = [
            {"type": "video", "video": video_input},
            {"type": "text", "text": prompt},
        ]
        messages.append({"role": "user", "content": user_content})

        try:
            resp_kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            response = await self._client.chat.completions.create(**resp_kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)
            content = response.choices[0].message.content or ""
            tokens_used = 0
            if response.usage:
                tokens_used = response.usage.total_tokens or 0

            logger.info(
                "QwenProvider.generate_video 调用成功: model=%s, tokens=%d, latency=%dms",
                model, tokens_used, latency_ms,
            )
            return {
                "content": content,
                "tokens_used": tokens_used,
                "model": model,
                "latency_ms": latency_ms,
            }
        except Exception as e:
            logger.error("QwenProvider.generate_video 调用失败: %s", str(e))
            _handle_provider_error(e, model)

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
