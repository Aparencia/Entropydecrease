"""
测试 call_with_fallback 超时预算机制

覆盖：
- 第一个 Provider 成功时正确返回结果
- 第一个 Provider 失败时降级到第二个 Provider
- 所有 Provider 均失败时抛出 RuntimeError
- 超时预算耗尽时抛出 RuntimeError（mock Provider 调用 sleep 超过预算时间）
"""

import asyncio
import sys
from pathlib import Path

import pytest
from unittest.mock import MagicMock

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from config import call_with_fallback, TIMEOUT_CONFIG


# ────────────────────────────────────────────────────────────
# 辅助 Provider 类
# ────────────────────────────────────────────────────────────


class SuccessProvider:
    """总是成功的 Provider"""

    def __init__(self, name="success", response=None):
        self.provider_name = name
        self.api_key = "valid-key"
        self._response = response or {"content": "ok", "model": "mock"}

    async def generate(self, *args, **kwargs):
        return self._response.copy()


class FailingProvider:
    """总是抛出异常的 Provider"""

    def __init__(self, name="failing"):
        self.provider_name = name
        self.api_key = "valid-key"

    async def generate(self, *args, **kwargs):
        raise RuntimeError(f"Provider [{self.provider_name}] 模拟故障")


class SlowProvider:
    """模拟慢速 Provider，sleep 超过预算时间"""

    def __init__(self, name="slow", delay=5.0):
        self.provider_name = name
        self.api_key = "valid-key"
        self._delay = delay

    async def generate(self, *args, **kwargs):
        await asyncio.sleep(self._delay)
        return {"content": "should-not-reach-here"}


def _make_app(providers_dict):
    """构建一个携带 providers 的 mock app"""
    app = MagicMock()
    app.state.providers = providers_dict
    return app


# ────────────────────────────────────────────────────────────
# call_with_fallback 测试
# ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_first_provider_success():
    """第一个 Provider 成功时正确返回结果"""
    glm_provider = SuccessProvider(name="glm", response={"content": "summary from glm"})
    app = _make_app({
        "glm": glm_provider,
        "qwen": SuccessProvider(name="qwen"),
        "fallback": SuccessProvider(name="fallback"),
    })

    async def fn(provider, model_name):
        return await provider.generate()

    result, provider_key = await call_with_fallback(app, "summarize", fn)
    assert result["content"] == "summary from glm"
    assert provider_key == "glm"


@pytest.mark.asyncio
async def test_fallback_to_second_provider():
    """第一个 Provider 失败时降级到第二个 Provider"""
    glm_provider = FailingProvider(name="glm")
    qwen_provider = SuccessProvider(name="qwen", response={"content": "from qwen"})
    app = _make_app({
        "glm": glm_provider,
        "qwen": qwen_provider,
        "fallback": SuccessProvider(name="fallback"),
    })

    async def fn(provider, model_name):
        return await provider.generate()

    result, provider_key = await call_with_fallback(app, "summarize", fn)
    assert result["content"] == "from qwen"
    assert provider_key == "qwen"


@pytest.mark.asyncio
async def test_fallback_to_last_provider():
    """前两个 Provider 失败时降级到最后一个 fallback Provider"""
    app = _make_app({
        "glm": FailingProvider(name="glm"),
        "qwen": FailingProvider(name="qwen"),
        "fallback": SuccessProvider(name="fallback", response={"content": "fallback response"}),
    })

    async def fn(provider, model_name):
        return await provider.generate()

    result, provider_key = await call_with_fallback(app, "summarize", fn)
    assert result["content"] == "fallback response"
    assert provider_key == "fallback"


@pytest.mark.asyncio
async def test_all_providers_fail():
    """所有 Provider 均失败时抛出 RuntimeError"""
    app = _make_app({
        "glm": FailingProvider(name="glm"),
        "qwen": FailingProvider(name="qwen"),
        "fallback": FailingProvider(name="fallback"),
    })

    async def fn(provider, model_name):
        return await provider.generate()

    with pytest.raises(RuntimeError, match="所有 AI 服务暂时不可用"):
        await call_with_fallback(app, "summarize", fn)


@pytest.mark.asyncio
async def test_all_providers_none_in_app_state():
    """app.state.providers 中无对应 Provider 时抛出 RuntimeError"""
    app = _make_app({})  # 空 providers

    async def fn(provider, model_name):
        return await provider.generate()

    with pytest.raises(RuntimeError, match="所有 AI 服务暂时不可用"):
        await call_with_fallback(app, "summarize", fn)


@pytest.mark.asyncio
async def test_timeout_budget_exhausted(monkeypatch):
    """超时预算耗尽时抛出 RuntimeError"""
    # 设置极短超时：summarize=1s → budget = 1 * 1.5 = 1.5s
    monkeypatch.setitem(TIMEOUT_CONFIG, "summarize", 1)

    slow_provider = SlowProvider(name="glm", delay=5.0)  # sleep 5s >> budget 1.5s
    app = _make_app({"glm": slow_provider})

    async def fn(provider, model_name):
        return await provider.generate()

    with pytest.raises(RuntimeError, match="超时"):
        await call_with_fallback(app, "summarize", fn)


@pytest.mark.asyncio
async def test_timeout_budget_with_short_config(monkeypatch):
    """使用更短超时配置验证超时触发（budget=0.3s）"""
    monkeypatch.setitem(TIMEOUT_CONFIG, "summarize", 0)

    # budget = max(0, ...) * 1.5 = 0 → asyncio.wait_for(timeout=0) 立即超时
    # 但 timeout=0 在 asyncio.wait_for 中意味着立即取消
    # 为避免边界问题，使用 0.2s
    monkeypatch.setitem(TIMEOUT_CONFIG, "summarize", 0.2)

    slow_provider = SlowProvider(name="glm", delay=3.0)
    app = _make_app({
        "glm": slow_provider,
        "qwen": SlowProvider(name="qwen", delay=3.0),
        "fallback": SlowProvider(name="fallback", delay=3.0),
    })

    async def fn(provider, model_name):
        return await provider.generate()

    with pytest.raises(RuntimeError, match="超时"):
        await call_with_fallback(app, "summarize", fn)


@pytest.mark.asyncio
async def test_fn_receives_correct_model_name():
    """fn 回调应接收正确的 model_name（由 _resolve_model_name 解析）"""
    received_models = []
    glm_provider = SuccessProvider(name="glm")
    app = _make_app({"glm": glm_provider})

    async def fn(provider, model_name):
        received_models.append(model_name)
        return {"content": "ok"}

    await call_with_fallback(app, "summarize", fn)
    # summarize → glm.free → glm-4.6v-flash
    assert "glm-4.6v-flash" in received_models


@pytest.mark.asyncio
async def test_unknown_feature_uses_default_chain():
    """未知 feature 使用默认 fallback 链"""
    fallback_provider = SuccessProvider(name="fallback", response={"content": "default"})
    app = _make_app({"fallback": fallback_provider})

    async def fn(provider, model_name):
        return await provider.generate()

    result, provider_key = await call_with_fallback(app, "__unknown_feature__", fn)
    assert result["content"] == "default"
    assert provider_key == "fallback"
