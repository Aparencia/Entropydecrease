"""
测试路由端点（mock Provider / Chain，使用 TestClient）

覆盖：
- POST /api/v1/ai/summarize — 正常返回、参数验证
- POST /api/v1/ai/generate-cards — 正常返回、空笔记处理
- POST /api/v1/ai/evaluate-explanation — 正常返回
- POST /api/v1/ai/recommend-duration — 正常返回
- 降级场景
"""

import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)


# ────────────────────────────────────────────────────────────
# 辅助：创建带 mock providers 的 test app
# ────────────────────────────────────────────────────────────


def _create_test_app():
    """创建测试用 FastAPI app（不挂中间件）"""
    from routers import (
        summarize_router,
        generate_cards_router,
        evaluate_router,
        recommend_router,
    )

    app = FastAPI()
    mock_provider = MagicMock()
    mock_provider.provider_name = "qwen"
    mock_provider.api_key = "mock"

    app.state.providers = {
        "qwen": mock_provider,
        "deepseek": mock_provider,
        "glm": mock_provider,
        "fallback": mock_provider,
    }

    app.include_router(summarize_router)
    app.include_router(generate_cards_router)
    app.include_router(evaluate_router)
    app.include_router(recommend_router)

    return app


# ────────────────────────────────────────────────────────────
# /summarize 路由
# ────────────────────────────────────────────────────────────


class TestSummarizeRouter:
    """POST /api/v1/ai/summarize"""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_summarize_success(self, client):
        """正常返回摘要结果"""
        mock_result = {
            "content": "这是生成的摘要内容，涵盖了核心要点。",
            "tokens_used": 150,
            "model": "qwen-plus",
            "latency_ms": 800,
        }
        with patch("routers.summarize.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/summarize", json={
                "text": "这是一段足够长的学习笔记内容，包含多个知识点和概念。" * 3,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert "summary" in data
        assert data["model"] == "qwen-plus"
        assert data["tokens_used"] == 150

    def test_summarize_validation_error_short_text(self, client):
        """text 太短（< 10 字符）返回 422"""
        resp = client.post("/api/v1/ai/summarize", json={"text": "太短"})
        assert resp.status_code == 422

    def test_summarize_all_providers_fail(self, client):
        """所有 Provider 不可用时返回 503"""
        with patch("routers.summarize.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post("/api/v1/ai/summarize", json={
                "text": "这是一段足够长的学习笔记内容，用于测试降级场景。",
            })
        assert resp.status_code == 503


# ────────────────────────────────────────────────────────────
# /generate-cards 路由
# ────────────────────────────────────────────────────────────


class TestGenerateCardsRouter:
    """POST /api/v1/ai/generate-cards"""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_generate_cards_success(self, client):
        """正常返回闪卡列表"""
        mock_result = {
            "cards": [
                {"front": "什么是光合作用？", "back": "植物利用阳光将CO2和水转化为有机物", "type": "question_answer", "confidence": 0.9},
                {"front": "光合作用的场所？", "back": "叶绿体", "type": "question_answer", "confidence": 0.85},
            ],
            "total_extracted": 2,
            "model": "qwen-plus",
            "tokens_used": 300,
        }
        with patch("routers.generate_cards.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/generate-cards", json={
                "note": "光合作用是植物利用阳光、二氧化碳和水合成有机物质的过程。发生在叶绿体中，是地球上最重要的生物化学过程之一。",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["cards"]) == 2
        assert data["cards"][0]["front"] == "什么是光合作用？"
        assert data["total_extracted"] == 2

    def test_generate_cards_validation_short_note(self, client):
        """note 太短（< 20 字符）返回 422"""
        resp = client.post("/api/v1/ai/generate-cards", json={"note": "内容太短了"})
        assert resp.status_code == 422

    def test_generate_cards_empty_result(self, client):
        """Chain 返回空卡片列表时正常响应"""
        mock_result = {
            "cards": [],
            "total_extracted": 0,
            "model": "qwen-plus",
            "tokens_used": 100,
        }
        with patch("routers.generate_cards.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/generate-cards", json={
                "note": "这是一段足够长的学习笔记内容，但由于内容特殊性未能提取出知识点。" * 3,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["cards"] == []

    def test_generate_cards_all_providers_fail(self, client):
        """所有 Provider 不可用时返回 503"""
        with patch("routers.generate_cards.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post("/api/v1/ai/generate-cards", json={
                "note": "这是一段足够长的学习笔记内容，用于测试全部降级场景。" * 3,
            })
        assert resp.status_code == 503


# ────────────────────────────────────────────────────────────
# /evaluate-explanation 路由
# ────────────────────────────────────────────────────────────


class TestEvaluateRouter:
    """POST /api/v1/ai/evaluate-explanation"""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_evaluate_success(self, client):
        """正常返回评估结果"""
        mock_result = {
            "overall_score": 7.5,
            "dimensions": [
                {"dimension": "准确性", "score": 8.0, "feedback": "概念理解准确"},
                {"dimension": "完整性", "score": 7.0, "feedback": "覆盖较全面"},
            ],
            "strengths": ["表达清晰"],
            "improvements": ["可以加入更多例子"],
            "encouragement": "做得很好，继续加油！",
            "model": "deepseek-chat",
            "tokens_used": 200,
            "latency_ms": 600,
        }
        with patch("routers.evaluate.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "deepseek", False)
            resp = client.post("/api/v1/ai/evaluate-explanation", json={
                "concept": "光合作用",
                "explanation": "光合作用是植物利用阳光把二氧化碳和水变成有机物的过程。",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_score"] == 7.5
        assert len(data["dimensions"]) == 2
        assert data["model"] == "deepseek-chat"

    def test_evaluate_validation_short_explanation(self, client):
        """explanation 太短（< 10 字符）返回 422"""
        resp = client.post("/api/v1/ai/evaluate-explanation", json={
            "concept": "测试",
            "explanation": "太短了",
        })
        assert resp.status_code == 422

    def test_evaluate_fallback_on_all_fail(self, client):
        """所有 Provider 不可用时返回降级评估"""
        with patch("routers.evaluate.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post("/api/v1/ai/evaluate-explanation", json={
                "concept": "光合作用",
                "explanation": "光合作用是植物利用阳光把二氧化碳和水变成有机物的过程。",
            })
        # 降级返回 200（不是 503），因为 evaluate 路由会构建 fallback EvaluationResult
        assert resp.status_code == 200
        data = resp.json()
        assert data["model"] == "fallback"


# ────────────────────────────────────────────────────────────
# /recommend-duration 路由
# ────────────────────────────────────────────────────────────


class TestRecommendRouter:
    """POST /api/v1/ai/recommend-duration"""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_recommend_success(self, client):
        """正常返回推荐时长"""
        mock_result = {
            "recommended_minutes": 30,
            "break_minutes": 5,
            "reason": "基于您的专注历史分析",
            "source": "ai",
            "model": "deepseek-chat",
            "tokens_used": 80,
            "latency_ms": 400,
        }
        with patch("routers.recommend.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "deepseek", False)
            resp = client.post("/api/v1/ai/recommend-duration", json={
                "history": [
                    {"duration_minutes": 25, "completed": True},
                    {"duration_minutes": 30, "completed": True},
                ],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["recommended_minutes"] == 30
        assert data["source"] == "ai"

    def test_recommend_empty_history(self, client):
        """无历史记录时正常返回"""
        mock_result = {
            "recommended_minutes": 25,
            "break_minutes": 5,
            "reason": "首次使用推荐标准时长",
            "source": "ai",
            "model": "deepseek-chat",
            "tokens_used": 50,
            "latency_ms": 200,
        }
        with patch("routers.recommend.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "deepseek", False)
            resp = client.post("/api/v1/ai/recommend-duration", json={"history": []})
        assert resp.status_code == 200
        data = resp.json()
        assert data["recommended_minutes"] == 25

    def test_recommend_fallback_to_local_rule(self, client):
        """所有 Provider 不可用时降级为本地规则引擎"""
        with patch("routers.recommend.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post("/api/v1/ai/recommend-duration", json={
                "history": [
                    {"duration_minutes": 30, "completed": True},
                    {"duration_minutes": 35, "completed": True},
                ],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] == "local_rule"
        assert data["recommended_minutes"] > 0
