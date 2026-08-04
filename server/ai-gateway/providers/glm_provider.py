"""
熵减 AI 网关 — GLMProvider（智谱 AI / GLM）

通过 OpenAI 兼容 SDK 调用智谱 GLM API。
- base_url: https://open.bigmodel.cn/api/paas/v4
- 模型: glm-4.6v-flash（免费）
- API 格式与 OpenAI Chat Completions 兼容
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
        raise ProviderUnavailableError("glm", f"网络超时: {error}") from error
    if isinstance(error, openai.RateLimitError) or "rate_limit" in err_str or "429" in err_str:
        raise RateLimitExceededError("glm", 0) from error
    if isinstance(error, openai.APIConnectionError) or "connection" in err_str:
        raise ProviderUnavailableError("glm", f"连接失败: {error}") from error
    if "content" in err_str and ("filter" in err_str or "policy" in err_str or "审核" in err_str):
        raise ModelResponseError(model, "内容未通过安全审核") from error
    raise ModelResponseError(model, str(error)) from error


class GLMProvider(AIProvider):
    """智谱 GLM Provider — glm-4.6v-flash 免费模型"""

    def __init__(self, base_url: str, api_key: str):
        super().__init__(base_url, api_key, provider_name="glm")
        # 使用 openai SDK 的兼容模式连接智谱 GLM
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
        model: str = "glm-4.6v-flash",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用智谱 GLM 生成内容

        使用 openai 兼容 SDK 发起请求，glm-4.6v-flash 模型免费。
        """
        # Key 轮询：将请求分散到多个 Key 以突破单一 Key 的 RPM 限制
        # GW-3: 内部不再轮询——已上移至 with_retry_and_timeout wrapper 统一
        # 处理，避免与 wrapper 双重轮询（偶数 Key 配置下轮询失效）
        start_time = time.monotonic()
        # GLM 免费 flash 模型输出上限 1024 tokens（与 generate_vision 的 clamp 对齐）：
        # 超限会被 API 参数校验直接拒绝，导致 Qwen 限流降级到 GLM 时
        # fallback 链在最需要兑底的时刻断裂（重试 3 次后集体失效）
        if "flash" in model.lower():
            max_tokens = min(max_tokens, 1024)

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
            if response_format:
                kwargs["response_format"] = response_format

            response = await self._client.chat.completions.create(**kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)

            # 提取结果
            content = response.choices[0].message.content or ""
            tokens_used = 0
            input_tokens = 0
            output_tokens = 0
            if response.usage:
                tokens_used = response.usage.total_tokens or 0
                # GW-2#6: 提取真实 input/output 拆分供成本记账（OpenAI 兼容
                # usage 字段），fallback 链不再对半估算
                input_tokens = getattr(response.usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(response.usage, "completion_tokens", 0) or 0

            logger.info(
                "GLMProvider 调用成功: model=%s, tokens=%d, latency=%dms",
                model, tokens_used, latency_ms,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            logger.error("GLMProvider 调用失败: %s", str(e))
            _handle_provider_error(e, model)

    @with_retry_and_timeout()
    async def transcribe(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
        model: str = "glm-asr",
    ) -> dict[str, Any]:
        """
        调用智谱 GLM-ASR 语音转文字

        @ai-context: 官方端点 POST {base_url}/audio/transcriptions（multipart），
        经 OpenAI 兼容 SDK 的 audio.transcriptions.create 调用。官方参数仅
        model/file(或 file_base64)/prompt/hotwords/stream，不支持 language，
        故不传；音频限制 wav/mp3、≤25MB、时长 ≤30 秒。
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
            }

            response = await self._client.audio.transcriptions.create(**kwargs)

            latency_ms = int((time.monotonic() - start_time) * 1000)
            text = response.text if hasattr(response, "text") else str(response)

            logger.info(
                "GLMProvider.transcribe 调用成功: model=%s, text_length=%d, latency=%dms",
                model, len(text), latency_ms,
            )

            return {
                "text": text,
                "segments": [],
                "language": language,
                # GW-2#11: OpenAI 兼容 ASR 响应不提供置信度字段，
                # 原硬编码 0.9 是编造数据——改为 0.0 明确表示"无置信度数据"，
                # 客户端不应据此做阈值过滤（与 QwenProvider GW-M15 对齐）
                "confidence": 0.0,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            err_str = str(e).lower()
            logger.error("GLMProvider.transcribe 调用失败: %s (耗时 %dms)", str(e), latency_ms)

            if isinstance(e, openai.APITimeoutError) or "timeout" in err_str:
                raise ProviderUnavailableError("glm", f"ASR 网络超时: {e}") from e
            if isinstance(e, openai.RateLimitError) or "rate_limit" in err_str or "429" in err_str:
                raise RateLimitExceededError("glm", 0) from e
            if isinstance(e, openai.APIConnectionError) or "connection" in err_str:
                raise ProviderUnavailableError("glm", f"ASR 连接失败: {e}") from e

            raise ModelResponseError(model, str(e)) from e

    @with_retry_and_timeout()
    async def generate_vision(
        self,
        image_base64: str,
        prompt: str,
        system_prompt: str = "",
        model: str = "glm-4.6v-flash",
        temperature: float = 0.3,
        max_tokens: int = 1024,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用智谱 GLM-4V-Flash 多模态视觉模型

        GLM-4V-Flash 支持图片 + 文本输入，通过 OpenAI 兼容接口发送
        多模态消息格式。
        """
        # GLM 免费视觉模型 max_tokens 上限 1024
        max_tokens = min(max_tokens, 1024)
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
                "GLMProvider.generate_vision 调用成功: model=%s, tokens=%d, latency=%dms",
                model, tokens_used, latency_ms,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "model": model,
                "latency_ms": latency_ms,
                # GW-2#4: clamp 后实际生效的 max_tokens，供 chain 侧截断检测使用
                #（与 generate_vision_multi 保持一致；原实现缺此字段，
                # full 模式请求 4096 被 clamp 到 1024 后截断不可感知）
                "max_tokens": max_tokens,
            }

        except Exception as e:
            logger.error("GLMProvider.generate_vision 调用失败: %s", str(e))
            _handle_provider_error(e, model)

    @with_retry_and_timeout()
    async def generate_vision_multi(
        self,
        images_base64: list[str],
        prompt: str,
        system_prompt: str = "",
        model: str = "glm-4.6v-flash",
        temperature: float = 0.3,
        max_tokens: int = 1024,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        多模态多图分析（GLM-4V-Flash 原生多图支持）

        @ai-context 课堂多帧截图需要在单次请求中联合分析，
        GLM-4V-Flash 支持在 user_content 中追加多个 image_url 项，
        模型能感知帧间时序关系，比逐图拼接质量更高。
        """
        # GLM 免费视觉模型 max_tokens 上限 1024
        max_tokens = min(max_tokens, 1024)
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
                "GLMProvider.generate_vision_multi 调用成功: model=%s, images=%d, tokens=%d, latency=%dms",
                model, len(images_base64), tokens_used, latency_ms,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "model": model,
                "latency_ms": latency_ms,
                # clamp 后实际生效的 max_tokens，供 chain 侧截断检测使用
                "max_tokens": max_tokens,
            }

        except Exception as e:
            logger.error("GLMProvider.generate_vision_multi 调用失败: %s", str(e))
            _handle_provider_error(e, model)

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "glm-4.6v-flash",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式调用智谱 GLM 生成内容"""
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
            logger.error("GLMProvider.generate_stream 失败: %s", str(e))
            _handle_provider_error(e, model)
