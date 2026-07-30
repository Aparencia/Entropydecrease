"""
熵减 AI 网关 — 抽象基类 AIProvider

所有模型 Provider 必须继承此基类并实现 generate 方法。
统一返回格式：{"content": str, "tokens_used": int, "model": str, "latency_ms": int}
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from functools import wraps
from typing import Any, AsyncGenerator

from config import TIMEOUT_CONFIG, _FEATURE_CONTEXT

logger = logging.getLogger(__name__)


def with_retry_and_timeout(max_retries: int = 2):
    """装饰器：为 Provider 方法添加超时控制和重试逻辑

    使用 TIMEOUT_CONFIG 中按 feature 配置的超时时间。
    失败时最多重试 max_retries 次，每次重试间隔指数退避。

    用法：在 Provider 子类的 generate 方法上添加 @with_retry_and_timeout()

    feature 来源优先级：
    1. call_with_fallback 设置的 _FEATURE_CONTEXT 上下文变量（主路径）
    2. 调用方显式传入的 _feature 关键字参数（如 health_check）
    3. 以上均无时取 TIMEOUT_CONFIG 最大值作为安全上限

    注意：_feature 仅用于装饰器内部查找超时配置，不会传递给被装饰的方法。
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(self, *args, **kwargs):
            # 从上下文变量读取当前 feature 名称（由 call_with_fallback 设置）
            feature = _FEATURE_CONTEXT.get('')
            # 兼容调用方直接传入 _feature 关键字参数的场景（如 health_check），
            # 但不将其转发给被装饰的方法
            kwarg_feature = kwargs.pop('_feature', None)
            if not feature and kwarg_feature:
                feature = kwarg_feature

            if feature and feature in TIMEOUT_CONFIG:
                timeout = TIMEOUT_CONFIG[feature]
            else:
                # 未指定 feature 时取配置最大值，确保不会误杀慢请求
                timeout = max(TIMEOUT_CONFIG.values()) if TIMEOUT_CONFIG else 30

            last_error: Exception | None = None
            for attempt in range(max_retries + 1):
                try:
                    result = await asyncio.wait_for(
                        func(self, *args, **kwargs),
                        timeout=timeout
                    )
                    return result
                except asyncio.TimeoutError as e:
                    last_error = e
                    logger.warning(
                        "Provider %s timeout (attempt %d/%d, feature=%s, timeout=%ds)",
                        self.__class__.__name__, attempt + 1, max_retries + 1,
                        feature or "unknown", timeout
                    )
                except Exception as e:
                    last_error = e
                    logger.warning(
                        "Provider %s error (attempt %d/%d): %s",
                        self.__class__.__name__, attempt + 1, max_retries + 1, str(e)
                    )

                if attempt < max_retries:
                    await asyncio.sleep(2 ** attempt)  # 指数退避: 1s, 2s

            raise last_error  # type: ignore[misc]
        return wrapper
    return decorator


class AIProvider(ABC):
    """AI 模型 Provider 抽象基类"""

    def __init__(self, base_url: str, api_key: str, provider_name: str):
        self.base_url = base_url
        self.api_key = api_key
        self.provider_name = provider_name

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用模型生成内容

        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词（角色设定）
            model: 模型名称（覆盖默认值）
            temperature: 温度参数，控制随机性
            max_tokens: 最大生成 token 数
            response_format: 响应格式约束，如 {"type": "json_object"}

        Returns:
            dict: {
                "content": str,       # 生成的文本内容
                "tokens_used": int,   # 消耗的总 token 数
                "model": str,         # 实际使用的模型名
                "latency_ms": int,    # 请求耗时（毫秒）
            }
        """
        ...

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        流式生成内容（默认降级实现）

        默认行为：先调用 generate() 获取完整结果，再一次性 yield。
        子类应覆盖此方法以实现真正的流式输出。

        Yields:
            str: 生成的文本片段
        """
        result = await self.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
        )
        yield result.get("content", "")

    async def generate_vision(
        self,
        image_base64: str,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        temperature: float = 0.3,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用多模态视觉模型处理图片

        默认实现抛出 NotImplementedError，由支持视觉的 Provider 子类覆盖。

        Args:
            image_base64: 图片 base64 编码（不含 data: 前缀）
            prompt: 文本提示词
            system_prompt: 系统提示词
            model: 模型名称
            temperature: 温度参数
            max_tokens: 最大生成 token 数
            response_format: 响应格式约束

        Returns:
            dict: 与 generate 相同的统一返回格式
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} 不支持多模态视觉调用"
        )

    async def generate_vision_multi(
        self,
        images_base64: list[str],
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        temperature: float = 0.3,
        max_tokens: int = 4096,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        多模态多图分析（默认降级实现）

        默认行为：逐图调用 generate_vision() 后拼接结果。
        子类（如 QwenProvider / GLMProvider）可覆盖此方法，
        使用原生多图消息格式以获得更好的上下文关联效果。

        @ai-context 多帧课堂截图需要联合分析，原生多图能让模型
        感知帧间时序关系，比逐图拼接质量更高。

        Args:
            images_base64: 多张图片的 base64 编码列表（不含 data: 前缀）
            prompt: 文本提示词
            system_prompt: 系统提示词
            model: 模型名称
            temperature: 温度参数
            max_tokens: 最大生成 token 数
            response_format: 响应格式约束

        Returns:
            dict: 与 generate 相同的统一返回格式
        """
        # 降级方案：逐图调用并拼接（子类应覆盖为原生多图）
        all_content: list[str] = []
        total_tokens = 0
        total_latency = 0
        used_model = model

        for idx, img in enumerate(images_base64):
            result = await self.generate_vision(
                image_base64=img,
                prompt=f"[第 {idx + 1}/{len(images_base64)} 帧]\n{prompt}",
                system_prompt=system_prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
            )
            all_content.append(result.get("content", ""))
            total_tokens += result.get("tokens_used", 0)
            total_latency += result.get("latency_ms", 0)
            used_model = result.get("model", used_model)

        return {
            "content": "\n\n---\n\n".join(all_content),
            "tokens_used": total_tokens,
            "model": used_model,
            "latency_ms": total_latency,
        }

    async def generate_video(
        self,
        video_input: str | bytes,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        视频分析（默认不支持，由原生视频 Provider 覆写）

        @ai-context Path C 视频分析链路需要 Provider 原生支持视频输入
        （如 Gemini），不支持的 Provider 应保留此默认实现，
        Chain 层会捕获 NotImplementedError 并降级为抽帧多图分析。

        Args:
            video_input: 视频文件路径、bytes 或 base64 字符串
            prompt: 文本提示词
            system_prompt: 系统提示词
            model: 模型名称
            temperature: 温度参数
            max_tokens: 最大生成 token 数

        Returns:
            dict: 与 generate 相同的统一返回格式
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} 不支持视频分析，请使用 Gemini 或降级为抽帧多图模式"
        )

    @abstractmethod
    async def transcribe(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
        model: str = "",
    ) -> dict[str, Any]:
        """
        语音转文字

        默认实现抛出 NotImplementedError，由支持 ASR 的 Provider 子类覆盖。

        Args:
            audio_base64: PCM/WAV 音频 base64 编码
            language: 语言代码（zh/en/auto）
            sample_rate: 采样率
            channels: 声道数
            model: 模型名称

        Returns:
            dict: {
                "text": str,             # 转写文本
                "segments": list[dict],   # [{start, end, text}]
                "language": str,          # 检测到的语言
                "confidence": float,      # 置信度 0-1
                "model": str,             # 实际使用的模型名
                "latency_ms": int,        # 请求耗时（毫秒）
            }
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} 不支持语音转文字"
        )

    async def health_check(self) -> dict:
        """
        检查 Provider 实际可用性

        发送一个最小请求（如 "ping"）并测量响应时间。
        返回: {"status": "healthy"|"unhealthy", "latency_ms": float, "error": str|None}
        """
        import time
        start = time.monotonic()
        try:
            await self.generate("ping", max_tokens=5, _feature="health_check")
            latency = (time.monotonic() - start) * 1000
            return {"status": "healthy", "latency_ms": round(latency, 1), "error": None}
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return {"status": "unhealthy", "latency_ms": round(latency, 1), "error": str(e)}
