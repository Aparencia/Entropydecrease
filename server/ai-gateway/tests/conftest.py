"""
熵减 AI 网关 — pytest 公共夹具

提供测试用的 FastAPI app、TestClient、mock Provider 等。

@ai-context: 测试夹具层——统一提供 MockProvider/FailingProvider 与精简 TestClient
（不挂 JWT/限流中间件），保证全部测试离线隔离（2026-08 审计确认 0 处真实网络调用）。
测试隔离策略：一切外部依赖（Redis/供应商 API）均以 mock 替代。
"""

import sys
import os
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# 确保 ai-gateway 根目录在 sys.path 中，使 config/errors 等可导入
GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)


# ────────────────────────────────────────────────────────────
# Event loop（pytest-asyncio 需要）
# ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """创建全局事件循环，供所有 async 测试共享"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ────────────────────────────────────────────────────────────
# Mock Provider
# ────────────────────────────────────────────────────────────

class MockProvider:
    """模拟 AI Provider，可自定义 generate 返回值"""

    def __init__(self, name: str = "mock", response: dict | None = None):
        self.provider_name = name
        self.api_key = "mock-key"
        self._response = response or {
            "content": "这是模拟的 AI 响应内容",
            "tokens_used": 100,
            "model": "mock-model",
            "latency_ms": 50,
        }

    async def generate(self, prompt, system_prompt="", model="", temperature=0.7,
                       max_tokens=2048, response_format=None, **kwargs):
        return self._response.copy()

    async def health_check(self):
        return {"status": "healthy", "latency_ms": 1.0, "error": None}


class FailingProvider:
    """总是抛出异常的 Provider，用于测试 fallback 链"""

    def __init__(self, name: str = "failing"):
        self.provider_name = name
        self.api_key = "mock-key"

    async def generate(self, *args, **kwargs):
        raise RuntimeError(f"Provider [{self.provider_name}] 模拟故障")

    async def health_check(self):
        return {"status": "unhealthy", "latency_ms": 0, "error": "模拟故障"}


@pytest.fixture
def mock_provider():
    """返回一个可用的 mock Provider"""
    return MockProvider()


@pytest.fixture
def failing_provider():
    """返回一个总是失败的 Provider"""
    return FailingProvider()


# ────────────────────────────────────────────────────────────
# 测试用 FastAPI 应用（绕过 JWT / RateLimit 中间件）
# ────────────────────────────────────────────────────────────

@pytest.fixture
def test_app():
    """
    创建精简版 FastAPI 应用，只注册路由，不挂中间件。
    在 app.state.providers 中注入 mock Provider。
    """
    from fastapi import FastAPI
    from routers import (
        summarize_router,
        generate_cards_router,
        evaluate_router,
        recommend_router,
    )

    app = FastAPI()

    # 注入 mock providers（call_with_fallback 会从 app.state.providers 读取）
    mock = MockProvider(name="qwen")
    app.state.providers = {
        "qwen": mock,
        "deepseek": MockProvider(name="deepseek"),
        "glm": MockProvider(name="glm"),
        "fallback": mock,
    }

    app.include_router(summarize_router)
    app.include_router(generate_cards_router)
    app.include_router(evaluate_router)
    app.include_router(recommend_router)

    return app


@pytest.fixture
def client(test_app):
    """同步 TestClient，用于路由测试"""
    from fastapi.testclient import TestClient
    return TestClient(test_app)


# ────────────────────────────────────────────────────────────
# 模拟 call_with_fallback（直接调用主 Provider，不走 fallback 链）
# ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_call_with_fallback(monkeypatch):
    """
    Patch config.call_with_fallback，直接调用第一个可用 Provider。
    返回 fixture 函数：调用后获得 patch 上下文。
    """
    async def fake_call(app, feature, fn):
        provider = list(app.state.providers.values())[0]
        from config import MODEL_ROUTING, AI_PROVIDERS
        routing = MODEL_ROUTING.get(feature, ("fallback", "free"))
        model_name = AI_PROVIDERS.get(routing[0], {}).get("models", {}).get(routing[1], "mock-model")
        result = await fn(provider, model_name)
        return result, routing[0]

    monkeypatch.setattr("config.call_with_fallback", fake_call)
    return fake_call
