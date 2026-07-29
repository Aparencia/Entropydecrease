"""
测试 AIError 异常体系

覆盖：
- 各子类的 status_code 正确
- 错误消息传递
- detail 字典正确
"""

import sys
from pathlib import Path

import pytest

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from errors import (
    AIError,
    ProviderUnavailableError,
    RateLimitExceededError,
    ModelResponseError,
    AuthenticationError,
)


# ────────────────────────────────────────────────────────────
# AIError 基类
# ────────────────────────────────────────────────────────────


class TestAIError:
    """AIError 基类测试"""

    def test_default_status_code(self):
        err = AIError("通用错误")
        assert err.status_code == 500

    def test_custom_status_code(self):
        err = AIError("自定义", status_code=418)
        assert err.status_code == 418

    def test_message_propagation(self):
        err = AIError("这是错误消息")
        assert err.message == "这是错误消息"
        assert str(err) == "这是错误消息"

    def test_detail_default_empty(self):
        err = AIError("错误")
        assert err.detail == {}

    def test_detail_custom(self):
        err = AIError("错误", detail={"key": "value"})
        assert err.detail == {"key": "value"}

    def test_inherits_from_exception(self):
        err = AIError("测试")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        with pytest.raises(AIError) as exc_info:
            raise AIError("测试异常")
        assert exc_info.value.message == "测试异常"


# ────────────────────────────────────────────────────────────
# ProviderUnavailableError
# ────────────────────────────────────────────────────────────


class TestProviderUnavailableError:
    """Provider 不可用异常测试"""

    def test_status_code_is_503(self):
        err = ProviderUnavailableError("qwen", "网络超时")
        assert err.status_code == 503

    def test_message_contains_provider(self):
        err = ProviderUnavailableError("deepseek", "连接失败")
        assert "deepseek" in err.message
        assert "连接失败" in err.message

    def test_detail_fields(self):
        err = ProviderUnavailableError("glm", "API 下线")
        assert err.detail["provider"] == "glm"
        assert err.detail["reason"] == "API 下线"

    def test_inherits_from_ai_error(self):
        err = ProviderUnavailableError("test")
        assert isinstance(err, AIError)

    def test_default_reason(self):
        err = ProviderUnavailableError("qwen")
        assert err.detail["reason"] == ""


# ────────────────────────────────────────────────────────────
# RateLimitExceededError
# ────────────────────────────────────────────────────────────


class TestRateLimitExceededError:
    """频率限制超限异常测试"""

    def test_status_code_is_429(self):
        err = RateLimitExceededError("summarize", 15)
        assert err.status_code == 429

    def test_message_contains_limit(self):
        err = RateLimitExceededError("evaluate", 10)
        assert "evaluate" in err.message
        assert "10" in err.message

    def test_detail_fields(self):
        err = RateLimitExceededError("generate_cards", 10)
        assert err.detail["feature"] == "generate_cards"
        assert err.detail["limit"] == 10

    def test_inherits_from_ai_error(self):
        err = RateLimitExceededError("test", 5)
        assert isinstance(err, AIError)


# ────────────────────────────────────────────────────────────
# ModelResponseError
# ────────────────────────────────────────────────────────────


class TestModelResponseError:
    """模型响应异常测试"""

    def test_status_code_is_502(self):
        err = ModelResponseError("qwen-plus", "内容审核拦截")
        assert err.status_code == 502

    def test_message_contains_model(self):
        err = ModelResponseError("deepseek-chat", "格式错误")
        assert "deepseek-chat" in err.message
        assert "格式错误" in err.message

    def test_detail_fields(self):
        err = ModelResponseError("glm-4.6v-flash", "空响应")
        assert err.detail["model"] == "glm-4.6v-flash"
        assert err.detail["reason"] == "空响应"

    def test_inherits_from_ai_error(self):
        err = ModelResponseError("test")
        assert isinstance(err, AIError)


# ────────────────────────────────────────────────────────────
# AuthenticationError
# ────────────────────────────────────────────────────────────


class TestAuthenticationError:
    """认证失败异常测试"""

    def test_status_code_is_401(self):
        err = AuthenticationError()
        assert err.status_code == 401

    def test_default_message(self):
        err = AuthenticationError()
        assert "无效" in err.message or "凭据" in err.message

    def test_custom_reason(self):
        err = AuthenticationError("token 已过期")
        assert err.message == "token 已过期"
        assert err.detail["reason"] == "token 已过期"

    def test_inherits_from_ai_error(self):
        err = AuthenticationError()
        assert isinstance(err, AIError)
