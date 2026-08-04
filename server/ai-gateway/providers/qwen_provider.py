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

    def _reinit_client(self) -> None:
        """重新初始化 OpenAI 客户端（Key 轮换后调用）"""
        self._client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
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
        # Key 轮询：将请求分散到多个 Key 以突破单一 Key 的 RPM 限制
        await self._rotate_api_key()
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
        model: str = "qwen3-asr-flash",
    ) -> dict[str, Any]:
        """
        调用阿里云百炼 Qwen3-ASR-Flash 语音转文字

        @ai-context: DashScope 的 OpenAI 兼容模式仅 Qwen3-ASR-Flash 系列支持
        ASR（Paraformer 仅支持原生异步 API 且要求公网音频 URL，无法直传）。
        官方调用规范：chat.completions + input_audio 内容块（Base64 Data URL，
        编码后 ≤10MB），语言经 extra_body.asr_options.language 指定，
        language="auto" 时不传该字段由模型自动检测。
        """
        start_time = time.monotonic()

        try:
            # 音频以 Data URL 内嵌（客户端上送 WAV/PCM base64）
            data_uri = f"data:audio/wav;base64,{audio_base64}"
            # ITN 开启：数字/单位规范化（"三点一四"→"3.14"），对齐主流 ASR 默认行为，
            # 课堂场景公式/数据密集，规范化文本对笔记质量至关重要
            asr_options: dict[str, Any] = {"enable_itn": True}
            if language != "auto":
                asr_options["language"] = language

            response = await self._client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_audio", "input_audio": {"data": data_uri}},
                        ],
                    }
                ],
                extra_body={"asr_options": asr_options},
            )

            latency_ms = int((time.monotonic() - start_time) * 1000)
            # ASR 转写文本在 message.content 中返回
            text = ""
            if response.choices:
                text = response.choices[0].message.content or ""

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
