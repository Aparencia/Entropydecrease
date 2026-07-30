"""
测试 Provider 逻辑（mock 外部 API）

覆盖：
- base_provider 的 with_retry_and_timeout 装饰器：超时触发、重试次数、指数退避
- fallback_provider 的降级逻辑
- call_with_fallback 链：主 Provider 失败时自动回退
- health_check 返回正确格式
"""

import sys
import asyncio
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from providers.base_provider import AIProvider, with_retry_and_timeout
from providers.fallback_provider import FallbackProvider
from config import call_with_fallback


# ────────────────────────────────────────────────────────────
# 测试用 concrete Provider（继承 AIProvider 实现 generate）
# ────────────────────────────────────────────────────────────


class DummyProvider(AIProvider):
    """用于测试基类和装饰器的 dummy Provider"""

    def __init__(self, behaviour=None):
        super().__init__(base_url="http://dummy", api_key="dummy", provider_name="dummy")
        self._behaviour = behaviour

    @with_retry_and_timeout(max_retries=2)
    async def generate(self, prompt, system_prompt="", model="", temperature=0.7,
                       max_tokens=2048, response_format=None, **kwargs):
        if self._behaviour == "timeout":
            await asyncio.sleep(999)  # 触发超时
        if self._behaviour == "error":
            raise RuntimeError("模拟 Provider 故障")
        if callable(self._behaviour):
            return self._behaviour(prompt)
        return {
            "content": f"dummy 响应: {prompt}",
            "tokens_used": 10,
            "model": model or "dummy-model",
            "latency_ms": 1,
        }

    async def transcribe(self, audio_base64, language="zh", sample_rate=16000, channels=1, model=""):
        return {"text": "", "segments": [], "language": language, "confidence": 1.0, "model": model, "latency_ms": 0}


# ────────────────────────────────────────────────────────────
# with_retry_and_timeout 装饰器
# ────────────────────────────────────────────────────────────


class TestWithRetryAndTimeout:
    """超时、重试、指数退避测试"""

    @pytest.mark.asyncio
    async def test_timeout_raises_timeout_error(self):
        """超时后最终抛出 asyncio.TimeoutError"""
        provider = DummyProvider(behaviour="timeout")
        # 将 TIMEOUT_CONFIG 中 summarize 设为 1 秒以加速测试
        with patch("providers.base_provider.TIMEOUT_CONFIG", {"summarize": 1}):
            with pytest.raises(asyncio.TimeoutError):
                await provider.generate("hello", _feature="summarize")

    @pytest.mark.asyncio
    async def test_retries_on_error(self):
        """异常时按 max_retries 重试"""
        call_count = 0

        def counting_behaviour(prompt):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("瞬态错误")

        provider = DummyProvider(behaviour=counting_behaviour)
        with pytest.raises(RuntimeError):
            await provider.generate("hello")

        # max_retries=2 → 共调用 3 次（1 + 2 retries）
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_exponential_backoff_timing(self):
        """指数退避：第 1 次重试等 1s，第 2 次等 2s"""
        call_times = []

        def timed_behaviour(prompt):
            call_times.append(time.monotonic())
            raise RuntimeError("错误")

        provider = DummyProvider(behaviour=timed_behaviour)

        with pytest.raises(RuntimeError):
            await provider.generate("hello")

        assert len(call_times) == 3
        # 第 1 次重试延迟 ≈ 1s
        gap1 = call_times[1] - call_times[0]
        assert 0.8 < gap1 < 1.5, f"第 1 次退避约 1s，实际 {gap1:.2f}s"
        # 第 2 次重试延迟 ≈ 2s
        gap2 = call_times[2] - call_times[1]
        assert 1.8 < gap2 < 2.5, f"第 2 次退避约 2s，实际 {gap2:.2f}s"

    @pytest.mark.asyncio
    async def test_success_on_first_try(self):
        """首次成功则不重试"""
        provider = DummyProvider()
        result = await provider.generate("test prompt", model="test-model")
        assert result["content"] == "dummy 响应: test prompt"
        assert result["model"] == "test-model"

    @pytest.mark.asyncio
    async def test_success_on_retry(self):
        """第 2 次尝试成功时正常返回"""
        attempt = {"n": 0}

        def flaky_behaviour(prompt):
            attempt["n"] += 1
            if attempt["n"] == 1:
                raise RuntimeError("瞬态错误")
            return {"content": "恢复成功", "tokens_used": 5, "model": "m", "latency_ms": 1}

        provider = DummyProvider(behaviour=flaky_behaviour)
        result = await provider.generate("hello")
        assert result["content"] == "恢复成功"
        assert attempt["n"] == 2


# ────────────────────────────────────────────────────────────
# FallbackProvider 降级逻辑
# ────────────────────────────────────────────────────────────


class TestFallbackProvider:
    """FallbackProvider 降级响应测试"""

    @pytest.mark.asyncio
    async def test_summarize_fallback_content(self):
        provider = FallbackProvider()
        result = await provider.generate("请帮我总结这篇笔记", system_prompt="摘要助手")
        assert "不可用" in result["content"] or "摘要" in result["content"]
        assert result["tokens_used"] == 0
        assert result["model"] == "fallback"

    @pytest.mark.asyncio
    async def test_flashcard_fallback_content(self):
        provider = FallbackProvider()
        result = await provider.generate("生成闪卡复习卡片", system_prompt="flashcard generator")
        assert "卡片" in result["content"] or "flashcard" in result["content"].lower()

    @pytest.mark.asyncio
    async def test_evaluate_fallback_content(self):
        provider = FallbackProvider()
        result = await provider.generate("费曼评估我的解释", system_prompt="evaluate explanation")
        assert "评估" in result["content"] or "费曼" in result["content"]

    @pytest.mark.asyncio
    async def test_recommend_fallback_content(self):
        provider = FallbackProvider()
        result = await provider.generate("推荐番茄钟时长", system_prompt="recommend pomodoro")
        assert "番茄钟" in result["content"] or "推荐" in result["content"]

    @pytest.mark.asyncio
    async def test_generic_fallback_content(self):
        provider = FallbackProvider()
        result = await provider.generate("hello world", system_prompt="generic")
        assert "不可用" in result["content"] or "重试" in result["content"]

    def test_recommend_duration_fallback_no_history(self):
        result = FallbackProvider.recommend_duration_fallback([])
        assert result["recommended_minutes"] == 25
        assert result["source"] == "local_rule"

    @pytest.mark.asyncio
    async def test_transcribe_accepts_feature_kwarg(self):
        """
        回归：transcribe 必须容忍 call_with_fallback 透传的 _feature 关键字。

        云端 Provider 的 transcribe 由 with_retry_and_timeout 装饰并吞掉 _feature，
        但 FallbackProvider 无装饰器，若签名不接受 **kwargs 会抛 TypeError，
        导致 fallback 链最后一环失败、ASR 请求返回 503 而非降级响应。
        """
        # Arrange
        provider = FallbackProvider()

        # Act
        result = await provider.transcribe(
            audio_base64="ZmFrZQ==", language="zh", _feature="transcribe",
        )

        # Assert
        assert result["model"] == "fallback"
        assert result["text"] == ""
        assert result["warning"]  # 必须透传降级提示供客户端识别失败

    @pytest.mark.asyncio
    async def test_transcribe_fallback_reachable_when_cloud_asr_fails(self):
        """
        回归：云端 ASR 全失败时，fallback 链末端必须能返回降级响应。

        真实故障场景——Qwen 404 + GLM 400 后，若 FallbackProvider.transcribe
        因签名不接受 _feature 抛 TypeError，整个请求会变成 503。
        """
        # Arrange：模拟 qwen/glm 的 transcribe 均失败，链末端为真实 FallbackProvider
        class FailingASRProvider:
            def __init__(self, name):
                self.provider_name = name

            async def transcribe(self, *args, **kwargs):
                raise RuntimeError(f"{self.provider_name} ASR 上游故障")

        app = MagicMock()
        app.state.providers = {
            "qwen": FailingASRProvider("qwen"),
            "glm": FailingASRProvider("glm"),
            "fallback": FallbackProvider(),
        }

        async def _run_chain(provider, model_name):
            # 与 transcribe 路由一致：显式透传 _feature
            return await provider.transcribe(
                audio_base64="ZmFrZQ==", language="zh", model=model_name,
                _feature="transcribe",
            )

        # Act
        result, provider_key = await call_with_fallback(app, "transcribe", _run_chain)

        # Assert
        assert provider_key == "fallback"
        assert result["model"] == "fallback"
        assert result["warning"]

    def test_recommend_duration_fallback_short_history(self):
        history = [
            {"duration_minutes": 10, "completed": True},
            {"duration_minutes": 12, "completed": True},
        ]
        result = FallbackProvider.recommend_duration_fallback(history)
        assert result["recommended_minutes"] == 15

    def test_recommend_duration_fallback_normal_history(self):
        history = [
            {"duration_minutes": 30, "completed": True},
            {"duration_minutes": 40, "completed": True},
        ]
        result = FallbackProvider.recommend_duration_fallback(history)
        assert result["recommended_minutes"] == 35
        assert result["source"] == "local_rule"

    def test_recommend_duration_fallback_cap_at_50(self):
        history = [{"duration_minutes": 60, "completed": True}]
        result = FallbackProvider.recommend_duration_fallback(history)
        assert result["recommended_minutes"] == 50

    def test_recommend_duration_fallback_no_completed(self):
        history = [{"duration_minutes": 30, "completed": False}]
        result = FallbackProvider.recommend_duration_fallback(history)
        assert result["recommended_minutes"] == 25

    @pytest.mark.asyncio
    async def test_health_check_always_healthy(self):
        provider = FallbackProvider()
        result = await provider.health_check()
        assert result["status"] == "healthy"
        assert result["error"] is None


# ────────────────────────────────────────────────────────────
# call_with_fallback 链
# ────────────────────────────────────────────────────────────


class TestCallWithFallback:
    """call_with_fallback 降级链测试"""

    def _make_app(self, providers_dict):
        app = MagicMock()
        app.state.providers = providers_dict
        return app

    @pytest.mark.asyncio
    async def test_primary_provider_success(self):
        """主 Provider 成功时直接返回"""
        primary = AsyncMock()
        primary.health_check = AsyncMock(return_value={"status": "healthy"})

        async def mock_fn(provider, model_name):
            return {"content": "主响应", "model": model_name, "tokens_used": 10, "latency_ms": 5}

        # 当前 summarize 的 fallback chain 以 glm 为主 Provider
        app = self._make_app({"qwen": AsyncMock(), "glm": primary, "fallback": FallbackProvider()})
        result, provider_key = await call_with_fallback(app, "summarize", mock_fn)
        assert result["content"] == "主响应"
        assert provider_key == "glm"

    @pytest.mark.asyncio
    async def test_fallback_on_primary_failure(self):
        """主 Provider 失败时自动回退到下一个"""
        class FailingGLM:
            provider_name = "glm"
            async def generate(self, *a, **kw): raise RuntimeError("glm 故障")

        class WorkingQwen:
            provider_name = "qwen"

        async def mock_fn(provider, model_name):
            if getattr(provider, "provider_name", None) == "glm":
                raise RuntimeError("glm 故障")
            return {"content": "Qwen 备选响应", "model": model_name, "tokens_used": 5, "latency_ms": 2}

        app = self._make_app({"qwen": WorkingQwen(), "glm": FailingGLM(), "fallback": FallbackProvider()})
        result, provider_key = await call_with_fallback(app, "summarize", mock_fn)
        assert provider_key == "qwen"

    @pytest.mark.asyncio
    async def test_all_providers_fail_raises_runtime_error(self):
        """所有 Provider 均失败时抛出 RuntimeError"""
        async def always_fail(provider, model_name):
            raise RuntimeError("全部故障")

        app = self._make_app({
            "qwen": MagicMock(),
            "glm": MagicMock(),
            "fallback": MagicMock(),
        })

        with pytest.raises(RuntimeError, match="所有 AI 服务暂时不可用"):
            await call_with_fallback(app, "summarize", always_fail)

    @pytest.mark.asyncio
    async def test_skips_uninitialized_provider(self):
        """未初始化的 Provider（不在 app.state.providers 中）会被跳过"""
        fallback = FallbackProvider()

        async def mock_fn(provider, model_name):
            if provider is fallback:
                return {"content": "fallback 响应", "model": "fallback", "tokens_used": 0, "latency_ms": 0}
            raise RuntimeError("不应调用")

        # 只配置了 fallback
        app = self._make_app({"fallback": fallback})
        result, provider_key = await call_with_fallback(app, "summarize", mock_fn)
        assert provider_key == "fallback"
