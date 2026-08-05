"""
熵减 AI 网关 — Phase3 服务端 AI Chains 测试

覆盖：
- POST /api/v1/ai/freshness         知识保鲜检测
- POST /api/v1/ai/embodied          概念具身化
- POST /api/v1/ai/learning-narrative 学习叙事 RPG
- POST /api/v1/ai/haiku             学习俳句

每个 Chain：Router happy path + fallback 降级 + Chain 层 degraded JSON 解析。
"""

import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock

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

    from routers import (
        freshness_router,
        embodied_router,
        learning_narrative_router,
        haiku_router,
    )
    app.include_router(freshness_router)
    app.include_router(embodied_router)
    app.include_router(learning_narrative_router)
    app.include_router(haiku_router)
    return app


# ============================================================
# Freshness 知识保鲜检测
# ============================================================


class TestFreshnessRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_freshness_success(self, client):
        """正常返回保鲜度检测结果"""
        mock_result = {
            "items": [
                {
                    "concept": "动量守恒",
                    "freshness": "fresh",
                    "reason": "经典力学定律，长期有效",
                    "recommendation": "无需处理",
                },
                {
                    "concept": "神经可塑性研究进展",
                    "freshness": "expiring",
                    "reason": "神经科学更新较快，半年未复习",
                    "recommendation": "近期检索最新文献并复习",
                },
            ],
            "summary": "大部分知识仍然新鲜，个别前沿领域需关注",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 300,
            "latency_ms": 600,
        }
        with patch("routers.freshness.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/freshness", json={
                "items": [
                    {"concept": "动量守恒", "lastReviewedAt": "2026-07-20"},
                    {"concept": "神经可塑性研究进展", "lastReviewedAt": "2026-01-10"},
                ],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["items"][0]["freshness"] == "fresh"
        assert data["items"][1]["freshness"] == "expiring"
        assert data["status"] == "success"

    def test_freshness_empty_items_422(self, client):
        resp = client.post("/api/v1/ai/freshness", json={"items": []})
        assert resp.status_code == 422

    def test_freshness_blank_concept_422(self, client):
        resp = client.post("/api/v1/ai/freshness", json={"items": [{"concept": "   "}]})
        assert resp.status_code == 422

    def test_freshness_fallback(self, client):
        with patch("routers.freshness.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/freshness", json={
                "items": [{"concept": "动量守恒"}],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert data["items"] == []


# ============================================================
# Embodied 概念具身化
# ============================================================


class TestEmbodiedRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_embodied_success(self, client):
        """正常返回身体动作建议"""
        mock_result = {
            "actions": [
                {
                    "gesture": "杠杆撬动",
                    "description": "左手握拳作为支点，右手掌沿左拳向前水平推出",
                    "meaning": "力矩 = 力 × 力臂：支点越远效果越大",
                    "difficulty": "easy",
                },
                {
                    "gesture": "旋转门推开",
                    "description": "右手在身前画弧从近到远推出",
                    "meaning": "力臂长度影响转动效果",
                    "difficulty": "easy",
                },
            ],
            "suggestion": "复习力矩时先做杠杆撬动再推公式",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.embodied.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/embodied", json={"concept": "力矩"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["actions"]) == 2
        assert data["actions"][0]["gesture"] == "杠杆撬动"
        assert data["actions"][0]["difficulty"] == "easy"
        assert data["status"] == "success"

    def test_embodied_blank_concept_422(self, client):
        resp = client.post("/api/v1/ai/embodied", json={"concept": "   "})
        assert resp.status_code == 422

    def test_embodied_fallback(self, client):
        with patch("routers.embodied.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/embodied", json={"concept": "力矩"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert len(data["actions"]) >= 1


# ============================================================
# Learning Narrative 学习叙事 RPG
# ============================================================


class TestLearningNarrativeRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_learning_narrative_success(self, client):
        """正常返回叙事章节"""
        mock_result = {
            "chapter_title": "暗流中的第三十七次深潜",
            "chapter_story": "本周你在知识之海中下潜五次，成功避开了三处错题暗礁……",
            "role_evolution": "见习潜航员",
            "milestones": [
                {"title": "五连击正确率突破", "description": "连续五天正确率保持在 80% 以上"},
                {"title": "错题克星徽章", "description": "攻克 3 个反复出错的力矩题目"},
            ],
            "next_chapter_hint": "更深处的洋流正在呼唤你，下周的海图将指向导数海域",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 400,
            "latency_ms": 900,
        }
        with patch("routers.learning_narrative.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/learning-narrative", json={
                "learning_stats": "学习5天，正确率65%，复习42次",
                "current_chapter": "第一章：初次下潜",
                "achievements": ["错题克星"],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["chapter_title"] == "暗流中的第三十七次深潜"
        assert data["role_evolution"] == "见习潜航员"
        assert len(data["milestones"]) == 2
        assert data["status"] == "success"

    def test_learning_narrative_empty(self, client):
        """空输入也应正常返回"""
        mock_result = {
            "chapter_title": "深海启航",
            "chapter_story": "新的旅程开始了",
            "role_evolution": "新手潜航员",
            "milestones": [{"title": "首次深潜", "description": "迈出第一步"}],
            "next_chapter_hint": "保持节奏",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.learning_narrative.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/learning-narrative", json={})
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_learning_narrative_fallback(self, client):
        with patch("routers.learning_narrative.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/learning-narrative", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert data["role_evolution"] == "新手潜航员"


# ============================================================
# Haiku 学习俳句
# ============================================================


class TestHaikuRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_haiku_success(self, client):
        """正常返回 5-7-5 俳句"""
        mock_result = {
            "haiku": "闪卡翻五轮/黄金错误映初心/记忆如珊瑚",
            "translation": "复习五轮闪卡，曾经的错误如今在记忆中沉淀成形",
            "reflection": "错误不是暗礁，而是记忆生长的基底",
            "mood": "reflective",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 150,
            "latency_ms": 400,
        }
        with patch("routers.haiku.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/haiku", json={
                "summary": "复习闪卡5轮，答对3个力矩错题",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["haiku"] == "闪卡翻五轮/黄金错误映初心/记忆如珊瑚"
        assert data["mood"] == "reflective"
        assert data["status"] == "success"

    def test_haiku_empty_summary(self, client):
        """空摘要也应正常返回（空白日俳句）"""
        mock_result = {
            "haiku": "静坐无新学/旧知如潮汐往复/温故而知新",
            "translation": "今天没有新知识，旧知识如潮汐般反复沉淀",
            "reflection": "温故也是下潜的一种方式",
            "mood": "calm",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 100,
            "latency_ms": 300,
        }
        with patch("routers.haiku.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/haiku", json={})
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_haiku_fallback(self, client):
        with patch("routers.haiku.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/haiku", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert "/" in data["haiku"]


# ============================================================
# Chain 直接测试（降级 JSON 解析）
# ============================================================


class TestDegradedJsonParsing:
    """测试各 Chain 的降级 JSON 解析能力"""

    @pytest.mark.asyncio
    async def test_freshness_chain_degraded_json(self):
        from chains.freshness_chain import FreshnessChain
        chain = FreshnessChain.__new__(FreshnessChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["items"] == []
        assert "失败" in parsed["summary"]

    @pytest.mark.asyncio
    async def test_freshness_chain_invalid_items_filtered(self):
        """非法保鲜度/缺概念名的项被过滤，合法项保留"""
        from chains.freshness_chain import FreshnessChain
        chain = FreshnessChain.__new__(FreshnessChain)
        parsed = chain._parse_response(
            '{"items": ['
            '{"concept": "动量守恒", "freshness": "fresh", "reason": "有效", "recommendation": "无"},'
            '{"concept": "坏数据", "freshness": "unknown"},'
            '{"freshness": "expired"}'
            '], "summary": "测试总结"}'
        )
        assert len(parsed["items"]) == 1
        assert parsed["items"][0]["concept"] == "动量守恒"
        assert parsed["summary"] == "测试总结"

    @pytest.mark.asyncio
    async def test_embodied_chain_degraded_json(self):
        from chains.embodied_chain import EmbodiedChain
        chain = EmbodiedChain.__new__(EmbodiedChain)
        parsed = chain._parse_response("这不是 JSON")
        assert len(parsed["actions"]) >= 1
        assert parsed["actions"][0]["gesture"] == "双手比划"
        assert parsed["suggestion"] != ""

    @pytest.mark.asyncio
    async def test_embodied_chain_invalid_difficulty_filtered(self):
        """难度非法的动作项被丢弃"""
        from chains.embodied_chain import EmbodiedChain
        chain = EmbodiedChain.__new__(EmbodiedChain)
        parsed = chain._parse_response(
            '{"actions": ['
            '{"gesture": "杠杆撬动", "description": "描述", "meaning": "含义", "difficulty": "easy"},'
            '{"gesture": "非法动作", "difficulty": "extreme"}'
            '], "suggestion": "建议"}'
        )
        assert len(parsed["actions"]) == 1
        assert parsed["actions"][0]["difficulty"] == "easy"

    @pytest.mark.asyncio
    async def test_learning_narrative_chain_degraded_json(self):
        from chains.learning_narrative_chain import LearningNarrativeChain
        chain = LearningNarrativeChain.__new__(LearningNarrativeChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["chapter_title"] == "深海启航"
        assert parsed["role_evolution"] == "新手潜航员"
        assert len(parsed["milestones"]) >= 1

    @pytest.mark.asyncio
    async def test_haiku_chain_degraded_json(self):
        from chains.haiku_chain import HaikuChain
        chain = HaikuChain.__new__(HaikuChain)
        parsed = chain._parse_response("这不是 JSON")
        assert "/" in parsed["haiku"]
        assert parsed["mood"] in {"calm", "joyful", "reflective", "determined", "tired", "curious"}

    @pytest.mark.asyncio
    async def test_haiku_chain_markdown_codeblock(self):
        """markdown 代码块包裹的 JSON 也能解析"""
        from chains.haiku_chain import HaikuChain
        chain = HaikuChain.__new__(HaikuChain)
        parsed = chain._parse_response(
            '```json\n{"haiku": "晨光翻书页/昨日错题今已解/海面泛金光", '
            '"translation": "翻译", "reflection": "反思", "mood": "joyful"}\n```'
        )
        assert parsed["haiku"] == "晨光翻书页/昨日错题今已解/海面泛金光"
        assert parsed["mood"] == "joyful"
