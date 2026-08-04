"""
熵减 AI 网关 — DeepSeekProvider（深度求索）

通过 OpenAI 兼容 SDK 调用 DeepSeek API。
- base_url: https://api.deepseek.com/v1
- 支持缓存命中（系统提示复用可降低成本）
- 所有 prompt 使用中文

@ai-context: DeepSeek Provider：OpenAI 兼容 SDK 接入深度求索，主用费曼评估/推荐等文本功能。
"""

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
        raise ProviderUnavailableError("deepseek", f"网络超时: {error}") from error
    if isinstance(error, openai.RateLimitError) or "rate_limit" in err_str or "429" in err_str:
        raise RateLimitExceededError("deepseek", 0) from error
    if isinstance(error, openai.APIConnectionError) or "connection" in err_str:
        raise ProviderUnavailableError("deepseek", f"连接失败: {error}") from error
    if "content" in err_str and ("filter" in err_str or "policy" in err_str or "审核" in err_str):
        raise ModelResponseError(model, "内容未通过安全审核") from error
    raise ModelResponseError(model, str(error)) from error


class DeepSeekProvider(AIProvider):
    """DeepSeek Provider — 深度求索"""

    def __init__(self, base_url: str, api_key: str):
        super().__init__(base_url, api_key, provider_name="deepseek")
        # 使用 openai SDK 的兼容模式连接 DeepSeek
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
        model: str = "deepseek-chat",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用 DeepSeek 生成内容

        DeepSeek 支持 prompt 缓存，系统提示复用可降低 token 成本。
        """
        # Key 轮询：将请求分散到多个 Key 以突破单一 Key 的 RPM 限制
        # GW-3: 内部不再轮询——已上移至 with_retry_and_timeout wrapper 统一
        # 处理，避免与 wrapper 双重轮询（偶数 Key 配置下轮询失效）
        start_time = time.monotonic()

        # 构建消息列表
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

            # DeepSeek 缓存命中信息（如果有的话）
            cache_hit_tokens = 0
            cache_miss_tokens = 0
            cache_hit = False
            effective_tokens = tokens_used

            if hasattr(response, "usage") and response.usage is not None:
                usage = response.usage
                # DeepSeek 返回 prompt_cache_hit_tokens 表示缓存命中的 token 数
                if hasattr(usage, "prompt_cache_hit_tokens"):
                    cache_hit_tokens = getattr(usage, "prompt_cache_hit_tokens", 0) or 0
                    cache_hit = cache_hit_tokens > 0

                if cache_hit:
                    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
                    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
                    cache_miss_tokens = prompt_tokens - cache_hit_tokens
                    # DeepSeek 缓存命中按 1/4 价格计费
                    effective_tokens = int(cache_hit_tokens * 0.25) + cache_miss_tokens + completion_tokens
                    # GW-3(X4): input 记账改用缓存未命中部分（命中部分按 1/4
                    # 计费）——原实现用原始 prompt_tokens，缓存命中场景成本高估
                    input_tokens = cache_miss_tokens
                    logger.info(
                        "DeepSeek 缓存命中: hit=%d, miss=%d, 实际计费 token=%d",
                        cache_hit_tokens, cache_miss_tokens, effective_tokens,
                    )

            logger.info(
                "DeepSeekProvider 调用成功: model=%s, tokens=%d, effective_tokens=%d, latency=%dms, cache_hit=%s",
                model, tokens_used, effective_tokens, latency_ms, cache_hit,
            )

            return {
                "content": content,
                "tokens_used": tokens_used,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "effective_tokens": effective_tokens,
                "cache_hit": cache_hit,
                "cache_hit_tokens": cache_hit_tokens,
                "model": model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            err_str = str(e).lower()
            logger.error("DeepSeekProvider 调用失败: %s (耗时 %dms)", str(e), latency_ms)

            # 错误分类处理
            if isinstance(e, openai.APITimeoutError) or "timeout" in err_str:
                logger.warning("DeepSeekProvider 网络超时")
                raise ProviderUnavailableError("deepseek", f"网络超时: {e}") from e

            if isinstance(e, openai.RateLimitError) or "rate_limit" in err_str or "429" in err_str:
                logger.warning("DeepSeekProvider 触发频率限制")
                raise RateLimitExceededError("deepseek", 0) from e

            if isinstance(e, openai.APIConnectionError) or "connection" in err_str:
                logger.warning("DeepSeekProvider 连接失败")
                raise ProviderUnavailableError("deepseek", f"连接失败: {e}") from e

            if "content" in err_str and ("filter" in err_str or "policy" in err_str or "审核" in err_str):
                logger.warning("DeepSeekProvider 内容审核拦截")
                raise ModelResponseError(model, "内容未通过安全审核") from e

            raise ModelResponseError(model, str(e)) from e

    async def transcribe(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
        model: str = "",
    ) -> dict[str, Any]:
        """DeepSeek 不支持 ASR，始终抛出 NotImplementedError"""
        raise NotImplementedError("DeepSeekProvider 不支持语音转文字，请使用 Qwen 或 GLM Provider")

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "deepseek-chat",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式调用 DeepSeek 生成内容"""
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
            logger.error("DeepSeekProvider.generate_stream 失败: %s", str(e))
            _handle_provider_error(e, model)
