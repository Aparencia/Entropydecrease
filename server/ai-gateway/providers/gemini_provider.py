"""
熵减 AI 网关 — GeminiProvider（Google Gemini 多模态模型）

使用 google-genai（新版 SDK）调用 Gemini 系列模型。
- 支持图片内联（base64）、文件上传、视频分析
- @ai-context Path C 视频分析链路的核心 Provider，
  Gemini 原生支持视频输入，是视频分析的首选模型。
"""

import asyncio
import base64
import logging
import time
from pathlib import Path
from typing import Any, AsyncGenerator

from google import genai
from google.genai import types

from providers.base_provider import AIProvider, with_retry_and_timeout
from errors import ProviderUnavailableError, ModelResponseError, RateLimitExceededError

logger = logging.getLogger(__name__)

# 默认模型名
_DEFAULT_MODEL = "gemini-2.0-flash"


def _handle_gemini_error(error: Exception, model: str) -> None:
    """分类 Gemini SDK 错误并转换为项目统一异常"""
    err_str = str(error).lower()
    if "timeout" in err_str or "deadline" in err_str:
        raise ProviderUnavailableError("gemini", f"网络超时: {error}") from error
    if "rate" in err_str or "429" in err_str or "quota" in err_str:
        raise RateLimitExceededError("gemini", 0) from error
    if "connection" in err_str or "network" in err_str:
        raise ProviderUnavailableError("gemini", f"连接失败: {error}") from error
    raise ModelResponseError(model, str(error)) from error


class GeminiProvider(AIProvider):
    """Gemini Provider — Google 多模态模型（图片+视频+文本）"""

    def __init__(self, api_key: str, base_url: str = ""):
        # Gemini SDK 不需要 base_url，仅用 api_key 初始化
        super().__init__(base_url or "https://generativelanguage.googleapis.com",
                         api_key, provider_name="gemini")
        self._client = genai.Client(api_key=api_key)

    @with_retry_and_timeout()
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """调用 Gemini 生成纯文本内容"""
        start_time = time.monotonic()
        try:
            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_prompt if system_prompt else None,
            )
            response = self._client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            latency_ms = int((time.monotonic() - start_time) * 1000)
            content = response.text or ""
            tokens_used = 0
            if response.usage_metadata:
                tokens_used = response.usage_metadata.total_token_count or 0
            logger.info("GeminiProvider.generate 成功: model=%s, tokens=%d, latency=%dms",
                        model, tokens_used, latency_ms)
            return {"content": content, "tokens_used": tokens_used,
                    "model": model, "latency_ms": latency_ms}
        except Exception as e:
            logger.error("GeminiProvider.generate 失败: %s", str(e))
            _handle_gemini_error(e, model)

    @with_retry_and_timeout()
    async def generate_vision(
        self,
        image_base64: str,
        prompt: str,
        system_prompt: str = "",
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用 Gemini 处理单张图片 + 文本

        @ai-context 图片通过 inline_data 以 base64 方式传入，
        Gemini 原生支持多模态输入，无需额外编码转换。
        """
        start_time = time.monotonic()
        try:
            image_part = types.Part.from_bytes(
                data=base64.b64decode(image_base64),
                mime_type="image/png",
            )
            contents = [image_part, prompt]
            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_prompt if system_prompt else None,
            )
            response = self._client.models.generate_content(
                model=model, contents=contents, config=config,
            )
            latency_ms = int((time.monotonic() - start_time) * 1000)
            content = response.text or ""
            tokens_used = 0
            if response.usage_metadata:
                tokens_used = response.usage_metadata.total_token_count or 0
            logger.info("GeminiProvider.generate_vision 成功: model=%s, tokens=%d, latency=%dms",
                        model, tokens_used, latency_ms)
            return {"content": content, "tokens_used": tokens_used,
                    "model": model, "latency_ms": latency_ms}
        except Exception as e:
            logger.error("GeminiProvider.generate_vision 失败: %s", str(e))
            _handle_gemini_error(e, model)

    @with_retry_and_timeout()
    async def generate_vision_multi(
        self,
        images_base64: list[str],
        prompt: str,
        system_prompt: str = "",
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        多模态多图分析（Gemini 原生多图支持）

        @ai-context 多帧课堂截图在单次请求中联合传入，
        Gemini 能感知帧间时序关系，比逐图拼接质量更高。
        """
        start_time = time.monotonic()
        try:
            parts: list[types.Part] = [
                types.Part.from_bytes(
                    data=base64.b64decode(img),
                    mime_type="image/jpeg",
                )
                for img in images_base64
            ]
            parts.append(types.Part.from_text(text=prompt))
            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_prompt if system_prompt else None,
            )
            response = self._client.models.generate_content(
                model=model, contents=parts, config=config,
            )
            latency_ms = int((time.monotonic() - start_time) * 1000)
            content = response.text or ""
            tokens_used = 0
            if response.usage_metadata:
                tokens_used = response.usage_metadata.total_token_count or 0
            logger.info("GeminiProvider.generate_vision_multi 成功: model=%s, images=%d, tokens=%d, latency=%dms",
                        model, len(images_base64), tokens_used, latency_ms)
            return {"content": content, "tokens_used": tokens_used,
                    "model": model, "latency_ms": latency_ms}
        except Exception as e:
            logger.error("GeminiProvider.generate_vision_multi 失败: %s", str(e))
            _handle_gemini_error(e, model)

    @with_retry_and_timeout()
    async def generate_video(
        self,
        video_input: str | bytes,
        prompt: str,
        system_prompt: str = "",
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        视频分析（Gemini 原生视频输入）

        @ai-context Path C 核心能力：Gemini 是项目中唯一原生支持
        视频输入的 Provider，可直接传入视频文件进行内容分析。

        - 文件路径：通过 File API 上传后引用
        - bytes / base64：通过 inline_data 内联传入
        """
        start_time = time.monotonic()
        uploaded_file = None
        try:
            video_part: types.Part
            if isinstance(video_input, bytes):
                video_part = types.Part.from_bytes(
                    data=video_input, mime_type="video/mp4",
                )
            elif isinstance(video_input, str) and Path(video_input).is_file():
                # 文件路径：使用 File API 上传
                uploaded_file = self._client.files.upload(file=video_input)
                # 轮询等待文件处理完成
                await _wait_for_file_active(self._client, uploaded_file.name)
                video_part = types.Part.from_uri(
                    file_uri=uploaded_file.uri,
                    mime_type=uploaded_file.mime_type or "video/mp4",
                )
            else:
                # 尝试作为 base64 字符串解码
                video_part = types.Part.from_bytes(
                    data=base64.b64decode(video_input),
                    mime_type="video/mp4",
                )

            contents = [video_part, prompt]
            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_prompt if system_prompt else None,
            )
            response = self._client.models.generate_content(
                model=model, contents=contents, config=config,
            )
            latency_ms = int((time.monotonic() - start_time) * 1000)
            content = response.text or ""
            tokens_used = 0
            if response.usage_metadata:
                tokens_used = response.usage_metadata.total_token_count or 0
            logger.info("GeminiProvider.generate_video 成功: model=%s, tokens=%d, latency=%dms",
                        model, tokens_used, latency_ms)
            return {"content": content, "tokens_used": tokens_used,
                    "model": model, "latency_ms": latency_ms}
        except Exception as e:
            logger.error("GeminiProvider.generate_video 失败: %s", str(e))
            _handle_gemini_error(e, model)
        finally:
            # 清理上传的临时文件
            if uploaded_file:
                try:
                    self._client.files.delete(name=uploaded_file.name)
                except Exception:
                    logger.debug("Gemini 临时文件清理失败（可忽略）: %s", uploaded_file.name)

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式调用 Gemini 生成内容"""
        try:
            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_prompt if system_prompt else None,
            )
            response = self._client.models.generate_content_stream(
                model=model,
                contents=prompt,
                config=config,
            )
            for chunk in response:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            logger.error("GeminiProvider.generate_stream 失败: %s", str(e))
            _handle_gemini_error(e, model)

    async def transcribe(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
        model: str = "",
    ) -> dict[str, Any]:
        """Gemini 不提供独立 ASR，暂不支持"""
        raise NotImplementedError("GeminiProvider 不支持独立语音转文字")


async def _wait_for_file_active(client: genai.Client, file_name: str, timeout: int = 120) -> None:
    """
    轮询等待 Gemini File API 文件状态变为 ACTIVE

    视频上传后需要服务端处理，状态从 PROCESSING → ACTIVE 后才可用于推理。
    使用 asyncio.sleep 避免阻塞事件循环。
    """
    import time as _time
    deadline = _time.monotonic() + timeout
    while _time.monotonic() < deadline:
        file_info = client.files.get(name=file_name)
        state = getattr(file_info, "state", None)
        # state 可能是枚举值或字符串
        state_str = str(state).upper() if state else "ACTIVE"
        if "ACTIVE" in state_str:
            return
        if "FAILED" in state_str:
            raise RuntimeError(f"Gemini 文件处理失败: {file_name}")
        await asyncio.sleep(2)
    raise TimeoutError(f"Gemini 文件处理超时（{timeout}s）: {file_name}")
