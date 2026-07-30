"""
熵减 AI 网关 — QwenProvider 多模态能力 Mixin

@ai-context: 从 qwen_provider 拆出的视觉/视频能力（generate_vision 单图、
generate_vision_multi 多图联合、generate_video 视频）。QwenProvider 通过多重
继承（AIProvider + QwenVisionMixin）获得这些方法，文本/语音/流式能力仍留在
qwen_provider.py。本文件同时承载 qwen 专用的错误分类器 _handle_provider_error，
供两个文件的 qwen 方法复用（provider_name 固定为 "qwen"）。
@ai-context: Qwen-VL 多图在单次请求 user_content 追加多个 image_url，模型可
感知帧间时序，质量优于逐图拼接；视频仅支持 URL 输入，本地文件应走 Gemini。
"""

import time
import logging
from typing import Any

import openai

from providers.base_provider import with_retry_and_timeout
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


class QwenVisionMixin:
    """通义千问多模态（视觉/视频）能力 Mixin

    依赖宿主类提供 self._client（AsyncOpenAI 兼容客户端）。
    """

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
