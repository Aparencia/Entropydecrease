"""
测试流式 fallback 外层超时兜底 + TIMEOUT_CONFIG chat 条目

覆盖：
- TIMEOUT_CONFIG 包含 chat 条目且值为 60
- 流式 fallback 首 provider 成功时正确返回生成器
- 流式 fallback 所有 provider 失败时抛出 RuntimeError
- 流式 fallback 外层超时兜底：慢 provider 触发 asyncio.wait_for 超时
"""

import asyncio
import sys
from pathlib import Path

import pytest
from unittest.mock import MagicMock

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from config import call_with_fallback_stream, TIMEOUT_CONFIG
from config.providers import MODEL_ROUTING


# ────────────────────────────────────────────────────────────
# 辅助工具
# ────────────────────────────────────────────────────────────


def _make_app(providers_dict):
    """构建一个携带 providers 的 mock app"""
    app = MagicMock()
    app.state.providers = providers_dict
    return app


def _make_stream_fn(chunks, delay=0.0):
    """
    创建一个返回异步生成器的 fn，模拟流式 provider。

    Args:
        chunks: 要 yield 的字符串列表
        delay:  每个 chunk 之间的延迟（秒）
    """
    def fn(provider, model_name):
        async def _gen():
            for chunk in chunks:
                if delay > 0:
                    await asyncio.sleep(delay)
                yield chunk
        return _gen()
    return fn


def _make_slow_stream_fn(delay=10.0):
    """
    创建一个慢速流式 fn：首 token 延迟很久才到达，用于触发超时。
    """
    def fn(provider, model_name):
        async def _gen():
            await asyncio.sleep(delay)
            yield "should-not-reach"
        return _gen()
    return fn


def _make_failing_stream_fn(error_msg="模拟故障"):
    """创建一个抛出异常的流式 fn"""
    def fn(provider, model_name):
        async def _gen():
            raise RuntimeError(error_msg)
            yield "unreachable"  # 使 _gen 成为异步生成器（此句不可达，仅为语法需要）
        return _gen()
    return fn


# ────────────────────────────────────────────────────────────
# TIMEOUT_CONFIG chat 条目测试
# ────────────────────────────────────────────────────────────


class TestTimeoutConfigChat:
    """验证 TIMEOUT_CONFIG 包含 chat 条目"""

    def test_chat_entry_exists(self):
        """TIMEOUT_CONFIG 必须包含 chat 条目"""
        assert "chat" in TIMEOUT_CONFIG, "TIMEOUT_CONFIG 缺少 'chat' 条目"

    def test_chat_timeout_is_60(self):
        """chat 超时应为 60 秒（流式 SSE 多轮交互需要更宽裕的超时）"""
        assert TIMEOUT_CONFIG["chat"] == 60, (
            f"chat 超时应为 60，实际为 {TIMEOUT_CONFIG['chat']}"
        )

    def test_chat_budget_larger_than_text_features(self):
        """chat 超时应大于普通文本功能（如 tag_content=10, recommend=10）"""
        assert TIMEOUT_CONFIG["chat"] > TIMEOUT_CONFIG["tag_content"]
        assert TIMEOUT_CONFIG["chat"] > TIMEOUT_CONFIG["recommend"]


class TestModelRoutingChat:
    """验证 MODEL_ROUTING 包含 chat 条目"""

    def test_chat_routing_exists(self):
        """MODEL_ROUTING 必须包含 chat 条目"""
        assert "chat" in MODEL_ROUTING, "MODEL_ROUTING 缺少 'chat' 条目"

    def test_chat_routing_provider_is_deepseek(self):
        """chat 主路由 Provider 应为 deepseek"""
        provider, slot = MODEL_ROUTING["chat"]
        assert provider == "deepseek", f"chat 主路由应为 deepseek，实际为 {provider}"

    def test_chat_routing_slot_is_chat(self):
        """chat 路由 slot 应为 chat"""
        provider, slot = MODEL_ROUTING["chat"]
        assert slot == "chat", f"chat slot 应为 chat，实际为 {slot}"

    def test_chat_routing_tuple_format(self):
        """chat 路由应为 (provider, slot) 二元组格式"""
        routing = MODEL_ROUTING["chat"]
        assert isinstance(routing, tuple) and len(routing) == 2


# ────────────────────────────────────────────────────────────
# 流式 fallback 功能测试
# ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stream_first_provider_success():
    """第一个 provider 成功时正确返回异步生成器"""
    app = _make_app({
        "deepseek": MagicMock(provider_name="deepseek"),
        "qwen": MagicMock(provider_name="qwen"),
        "fallback": MagicMock(provider_name="fallback"),
    })

    fn = _make_stream_fn(["hello", " ", "world"])
    gen, provider_key, is_user_key = await call_with_fallback_stream(
        app, "chat", None, fn,
    )

    assert provider_key == "deepseek"
    assert is_user_key is False

    # 消费生成器，验证所有 chunk 正确吐出
    collected = []
    async for chunk in gen:
        collected.append(chunk)
    assert collected == ["hello", " ", "world"]


@pytest.mark.asyncio
async def test_stream_all_providers_fail():
    """所有 provider 都失败时抛出 RuntimeError"""
    app = _make_app({
        "qwen": MagicMock(provider_name="qwen"),
        "deepseek": MagicMock(provider_name="deepseek"),
        "fallback": MagicMock(provider_name="fallback"),
    })

    fn = _make_failing_stream_fn("所有 provider 模拟故障")

    with pytest.raises(RuntimeError, match="所有 AI 服务暂时不可用"):
        await call_with_fallback_stream(app, "chat", None, fn)


@pytest.mark.asyncio
async def test_stream_outer_timeout_budget(monkeypatch):
    """外层 asyncio.wait_for 超时兜底：慢 provider 应在预算耗尽时被终止"""
    # 设置极短超时：chat=1s → budget = 1 * 1.5 = 1.5s
    monkeypatch.setitem(TIMEOUT_CONFIG, "chat", 1)

    app = _make_app({
        "qwen": MagicMock(provider_name="qwen"),
        "deepseek": MagicMock(provider_name="deepseek"),
        "fallback": MagicMock(provider_name="fallback"),
    })

    # 每个 provider 首 token 延迟 10s，远超 1.5s 预算
    fn = _make_slow_stream_fn(delay=10.0)

    with pytest.raises(RuntimeError, match="超时"):
        await call_with_fallback_stream(app, "chat", None, fn)


@pytest.mark.asyncio
async def test_stream_fallback_to_second_provider():
    """第一个 provider 失败时应降级到第二个 provider"""
    app = _make_app({
        "deepseek": MagicMock(provider_name="deepseek"),
        "qwen": MagicMock(provider_name="qwen"),
        "fallback": MagicMock(provider_name="fallback"),
    })

    call_count = {"n": 0}

    def fn(provider, model_name):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # 第一次调用（deepseek）失败
            return _make_failing_stream_fn("deepseek 故障")(provider, model_name)
        else:
            # 第二次调用（qwen）成功
            return _make_stream_fn(["from", "qwen"])(provider, model_name)

    gen, provider_key, is_user_key = await call_with_fallback_stream(
        app, "chat", None, fn,
    )

    assert provider_key == "qwen"
    assert is_user_key is False

    collected = []
    async for chunk in gen:
        collected.append(chunk)
    assert collected == ["from", "qwen"]
