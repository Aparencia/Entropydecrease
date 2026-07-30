"""
熵减 AI 网关 — 苏格拉底式学习路由测试

覆盖：
- POST /api/v1/ai/socratic/brainstorm — 正常返回、参数验证、降级
- POST /api/v1/ai/socratic/evaluate   — 正常返回、参数验证、降级
- 请求模型验证逻辑（空白字符、历史格式等）
"""

import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)


# ────────────────────────────────────────────────────────────
# 辅助：创建带 mock providers 的 test app
# ────────────────────────────────────────────────────────────


def _create_test_app():
    """创建测试用 FastAPI app（不挂中间件）"""
    from routers import socratic_router

    app = FastAPI()
    from unittest.mock import MagicMock
    mock_provider = MagicMock()
    mock_provider.provider_name = "qwen"
    mock_provider.api_key = "mock"

    app.state.providers = {
        "qwen": mock_provider,
        "deepseek": mock_provider,
        "glm": mock_provider,
        "fallback": mock_provider,
    }

    app.include_router(socratic_router)
    return app


# ────────────────────────────────────────────────────────────
# 请求模型验证测试
# ────────────────────────────────────────────────────────────


class TestBrainstormRequestValidation:
    """SocraticBrainstormRequest 验证"""

    def test_valid_topic(self):
        """正常 topic 通过验证"""
        from routers.socratic import SocraticBrainstormRequest
        req = SocraticBrainstormRequest(topic="量子力学")
        assert req.topic == "量子力学"

    def test_topic_stripped(self):
        """topic 两端空白被去除"""
        from routers.socratic import SocraticBrainstormRequest
        req = SocraticBrainstormRequest(topic="  量子力学  ")
        assert req.topic == "量子力学"

    def test_topic_blank_rejected(self):
        """纯空白 topic 被拒绝"""
        from routers.socratic import SocraticBrainstormRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticBrainstormRequest(topic="   ")
        assert "空白" in str(exc_info.value)

    def test_topic_empty_rejected(self):
        """空 topic 被拒绝"""
        from routers.socratic import SocraticBrainstormRequest
        with pytest.raises(ValidationError):
            SocraticBrainstormRequest(topic="")

    def test_topic_too_long_rejected(self):
        """超过 500 字符的 topic 被拒绝"""
        from routers.socratic import SocraticBrainstormRequest
        with pytest.raises(ValidationError):
            SocraticBrainstormRequest(topic="测" * 501)

    def test_context_optional(self):
        """context 可选"""
        from routers.socratic import SocraticBrainstormRequest
        req = SocraticBrainstormRequest(topic="测试")
        assert req.context == ""


class TestEvaluateRequestValidation:
    """SocraticEvaluateRequest 验证"""

    def test_valid_request(self):
        """正常请求通过验证"""
        from routers.socratic import SocraticEvaluateRequest
        req = SocraticEvaluateRequest(
            topic="量子力学",
            question="什么是波粒二象性？",
            answer="光既有波动性又有粒子性",
        )
        assert req.topic == "量子力学"
        assert req.history == []

    def test_topic_blank_rejected(self):
        """纯空白 topic 被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="   ",
                question="问题",
                answer="回答",
            )
        assert "空白" in str(exc_info.value)

    def test_question_blank_rejected(self):
        """纯空白 question 被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="主题",
                question="   ",
                answer="回答",
            )
        assert "问题" in str(exc_info.value) or "空白" in str(exc_info.value)

    def test_answer_blank_rejected(self):
        """纯空白 answer 被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="主题",
                question="问题",
                answer="   ",
            )
        assert "回答" in str(exc_info.value) or "空白" in str(exc_info.value)

    def test_history_valid(self):
        """正常历史通过验证"""
        from routers.socratic import SocraticEvaluateRequest
        req = SocraticEvaluateRequest(
            topic="测试",
            question="问题",
            answer="回答",
            history=[
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好，让我们开始吧"},
            ],
        )
        assert len(req.history) == 2

    def test_history_missing_role_rejected(self):
        """缺少 role 的历史被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="测试",
                question="问题",
                answer="回答",
                history=[{"content": "没有role"}],
            )
        assert "role" in str(exc_info.value)

    def test_history_missing_content_rejected(self):
        """缺少 content 的历史被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="测试",
                question="问题",
                answer="回答",
                history=[{"role": "user"}],
            )
        assert "content" in str(exc_info.value)

    def test_history_invalid_role_rejected(self):
        """无效 role 被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="测试",
                question="问题",
                answer="回答",
                history=[{"role": "invalid_role", "content": "内容"}],
            )
        assert "role" in str(exc_info.value).lower()

    def test_history_blank_content_rejected(self):
        """content 为空白的历史被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError) as exc_info:
            SocraticEvaluateRequest(
                topic="测试",
                question="问题",
                answer="回答",
                history=[{"role": "user", "content": "   "}],
            )
        assert "空白" in str(exc_info.value)

    def test_history_too_many_rejected(self):
        """超过 50 条历史被拒绝"""
        from routers.socratic import SocraticEvaluateRequest
        with pytest.raises(ValidationError):
            SocraticEvaluateRequest(
                topic="测试",
                question="问题",
                answer="回答",
                history=[{"role": "user", "content": f"消息{i}"} for i in range(51)],
            )


# ────────────────────────────────────────────────────────────
# /brainstorm 路由测试
# ────────────────────────────────────────────────────────────


class TestBrainstormRouter:
    """POST /api/v1/ai/socratic/brainstorm"""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_brainstorm_success(self, client):
        """正常返回头脑风暴结果"""
        mock_result = {
            "ideas": [
                {"title": "生活类比", "description": "像水波一样传播", "category": "类比"},
                {"title": "反例", "description": "在某些条件下不适用", "category": "反例"},
            ],
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.socratic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/socratic/brainstorm", json={
                "topic": "量子力学",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["ideas"]) == 2
        assert data["ideas"][0]["title"] == "生活类比"
        assert data["status"] == "success"

    def test_brainstorm_blank_topic_422(self, client):
        """纯空白 topic 返回 422"""
        resp = client.post("/api/v1/ai/socratic/brainstorm", json={
            "topic": "   ",
        })
        assert resp.status_code == 422

    def test_brainstorm_empty_topic_422(self, client):
        """空 topic 返回 422"""
        resp = client.post("/api/v1/ai/socratic/brainstorm", json={
            "topic": "",
        })
        assert resp.status_code == 422

    def test_brainstorm_fallback(self, client):
        """服务不可用时返回降级响应"""
        with patch("routers.socratic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务不可用")
            resp = client.post("/api/v1/ai/socratic/brainstorm", json={
                "topic": "量子力学",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert len(data["ideas"]) == 5  # 降级返回5个默认角度


# ────────────────────────────────────────────────────────────
# /evaluate 路由测试
# ────────────────────────────────────────────────────────────


class TestEvaluateRouter:
    """POST /api/v1/ai/socratic/evaluate"""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_evaluate_success(self, client):
        """正常返回评估结果"""
        mock_result = {
            "dimensions": {
                "accuracy": 7.5,
                "completeness": 6.0,
                "logic": 8.0,
                "expression": 7.0,
            },
            "feedback": "回答准确但不够完整",
            "encouragement": "继续深入思考！",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 150,
            "latency_ms": 400,
        }
        with patch("routers.socratic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/socratic/evaluate", json={
                "topic": "量子力学",
                "question": "什么是波粒二象性？",
                "answer": "光既有波动性又有粒子性",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["dimensions"]["accuracy"] == 7.5
        assert data["feedback"] == "回答准确但不够完整"

    def test_evaluate_with_history(self, client):
        """带历史的请求正常处理"""
        mock_result = {
            "dimensions": {"accuracy": 8, "completeness": 7, "logic": 8, "expression": 7},
            "feedback": "很好",
            "encouragement": "继续",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 150,
            "latency_ms": 400,
        }
        with patch("routers.socratic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/socratic/evaluate", json={
                "topic": "量子力学",
                "question": "什么是波粒二象性？",
                "answer": "光既有波动性又有粒子性",
                "history": [
                    {"role": "user", "content": "我想了解量子力学"},
                    {"role": "assistant", "content": "好的，让我们开始"},
                ],
            })
        assert resp.status_code == 200

    def test_evaluate_blank_topic_422(self, client):
        """纯空白 topic 返回 422"""
        resp = client.post("/api/v1/ai/socratic/evaluate", json={
            "topic": "   ",
            "question": "问题",
            "answer": "回答",
        })
        assert resp.status_code == 422

    def test_evaluate_blank_question_422(self, client):
        """纯空白 question 返回 422"""
        resp = client.post("/api/v1/ai/socratic/evaluate", json={
            "topic": "主题",
            "question": "   ",
            "answer": "回答",
        })
        assert resp.status_code == 422

    def test_evaluate_blank_answer_422(self, client):
        """纯空白 answer 返回 422"""
        resp = client.post("/api/v1/ai/socratic/evaluate", json={
            "topic": "主题",
            "question": "问题",
            "answer": "   ",
        })
        assert resp.status_code == 422

    def test_evaluate_invalid_history_role_422(self, client):
        """无效历史 role 返回 422"""
        resp = client.post("/api/v1/ai/socratic/evaluate", json={
            "topic": "主题",
            "question": "问题",
            "answer": "回答",
            "history": [{"role": "invalid", "content": "内容"}],
        })
        assert resp.status_code == 422

    def test_evaluate_history_missing_field_422(self, client):
        """历史缺少必要字段返回 422"""
        resp = client.post("/api/v1/ai/socratic/evaluate", json={
            "topic": "主题",
            "question": "问题",
            "answer": "回答",
            "history": [{"role": "user"}],  # 缺少 content
        })
        assert resp.status_code == 422

    def test_evaluate_fallback(self, client):
        """服务不可用时返回降级响应"""
        with patch("routers.socratic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务不可用")
            resp = client.post("/api/v1/ai/socratic/evaluate", json={
                "topic": "量子力学",
                "question": "什么是波粒二象性？",
                "answer": "光既有波动性又有粒子性",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert data["dimensions"]["accuracy"] == 5  # 降级默认分数
