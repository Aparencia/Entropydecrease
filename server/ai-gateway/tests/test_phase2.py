"""
熵减 AI 网关 — Phase2 新 Chain 路由测试

覆盖：
- POST /api/v1/ai/debate
- POST /api/v1/ai/counterintuitive
- POST /api/v1/ai/personify
- POST /api/v1/ai/mnemonic
- POST /api/v1/ai/podcast
- POST /api/v1/ai/learning-coach
- POST /api/v1/ai/infographic
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
        debate_router,
        counterintuitive_router,
        personify_router,
        mnemonic_router,
        podcast_router,
        learning_coach_router,
        infographic_router,
    )
    app.include_router(debate_router)
    app.include_router(counterintuitive_router)
    app.include_router(personify_router)
    app.include_router(mnemonic_router)
    app.include_router(podcast_router)
    app.include_router(learning_coach_router)
    app.include_router(infographic_router)
    return app


# ============================================================
# Debate 辩论对手
# ============================================================


class TestDebateRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_debate_success(self, client):
        """正常返回辩论结果"""
        mock_result = {
            "argument": "躺平会导致社会进步动力不足",
            "counter_argument": "个人理性不一定等于集体理性",
            "evidence_quality": "high",
            "challenge": "如果所有人都躺平会怎样？",
            "round_number": 1,
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.debate.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/debate", json={
                "topic": "躺平是理性的吗？",
                "debate_type": "value",
                "stance": "躺平是理性的",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["argument"] == "躺平会导致社会进步动力不足"
        assert data["evidence_quality"] == "high"
        assert data["round_number"] == 1
        assert data["status"] == "success"

    def test_debate_blank_topic_422(self, client):
        resp = client.post("/api/v1/ai/debate", json={"topic": "   "})
        assert resp.status_code == 422

    def test_debate_invalid_type_422(self, client):
        resp = client.post("/api/v1/ai/debate", json={"topic": "测试", "debate_type": "invalid"})
        assert resp.status_code == 422

    def test_debate_fallback(self, client):
        with patch("routers.debate.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务不可用")
            resp = client.post("/api/v1/ai/debate", json={"topic": "测试"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Counterintuitive 反直觉发现器
# ============================================================


class TestCounterintuitiveRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_counterintuitive_success(self, client):
        """正常返回反直觉事实"""
        mock_result = {
            "fact": "蜜蜂群体的效率来源于个体的低效",
            "category": "counter_intuitive",
            "category_name": "违反直觉",
            "explanation": "冗余个体保证了生存韧性",
            "relation_to_learning": "通用知识",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 150,
            "latency_ms": 400,
        }
        with patch("routers.counterintuitive.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/counterintuitive", json={
                "learning_topics": "经济学",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["fact"] == "蜜蜂群体的效率来源于个体的低效"
        assert data["category"] == "counter_intuitive"
        assert data["status"] == "success"

    def test_counterintuitive_empty_topic(self, client):
        """空主题也应正常返回"""
        mock_result = {
            "fact": "测试事实",
            "category": "paradox",
            "category_name": "悖论",
            "explanation": "测试解释",
            "relation_to_learning": "通用知识",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 100,
            "latency_ms": 300,
        }
        with patch("routers.counterintuitive.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/counterintuitive", json={})
        assert resp.status_code == 200

    def test_counterintuitive_fallback(self, client):
        with patch("routers.counterintuitive.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/counterintuitive", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Personify 概念拟人化
# ============================================================


class TestPersonifyRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_personify_success(self, client):
        mock_result = {
            "persona_card": {
                "name": "惯性小哥哥",
                "personality": "固执、懒惰",
                "backstory": "从小就不爱动",
                "catchphrase": "别推我！",
            },
            "relationships": [
                {"other_concept": "力姐姐", "relation_type": "causal", "relation_type_name": "师徒", "story": "力姐姐是唯一能让惯性动起来的人"},
            ],
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.personify.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/personify", json={
                "concept": "惯性",
                "related_concepts": "力,加速度",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["persona_card"]["name"] == "惯性小哥哥"
        assert len(data["relationships"]) == 1
        assert data["status"] == "success"

    def test_personify_blank_concept_422(self, client):
        resp = client.post("/api/v1/ai/personify", json={"concept": "   "})
        assert resp.status_code == 422

    def test_personify_fallback(self, client):
        with patch("routers.personify.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/personify", json={"concept": "惯性"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Mnemonic 记忆术生成器
# ============================================================


class TestMnemonicRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_mnemonic_success(self, client):
        mock_result = {
            "mnemonics": [
                {"type": "phonetic", "type_name": "谐音", "mnemonic": "回母校", "association": "谐音联想", "example": "读回眸二字"},
                {"type": "story", "type_name": "故事", "mnemonic": "校园故事", "association": "故事联想", "example": "想象场景"},
                {"type": "spatial", "type_name": "空间", "mnemonic": "空间记忆", "association": "位置联想", "example": "走过空间"},
            ],
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.mnemonic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/mnemonic", json={
                "content": "回眸一笑百媚生",
                "learning_style": "visual",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["mnemonics"]) == 3
        assert data["status"] == "success"

    def test_mnemonic_blank_content_422(self, client):
        resp = client.post("/api/v1/ai/mnemonic", json={"content": "   "})
        assert resp.status_code == 422

    def test_mnemonic_invalid_style_422(self, client):
        resp = client.post("/api/v1/ai/mnemonic", json={"content": "测试", "learning_style": "invalid"})
        assert resp.status_code == 422

    def test_mnemonic_fallback(self, client):
        with patch("routers.mnemonic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/mnemonic", json={"content": "测试"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Podcast 播客生成器
# ============================================================


class TestPodcastRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_podcast_success(self, client):
        mock_result = {
            "title": "拖延症的秘密",
            "segments": [
                {"speaker": "host", "text": "今天我们来聊聊拖延症", "duration_estimate": 10},
                {"speaker": "guest", "text": "拖延不是懒，而是情绪调节失败", "duration_estimate": 15},
                {"speaker": "host", "text": "那怎么破解呢？", "duration_estimate": 8},
            ],
            "summary": "拖延是情绪问题",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 300,
            "latency_ms": 800,
        }
        with patch("routers.podcast.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/podcast", json={
                "topic": "拖延症",
                "scene": "commute",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "拖延症的秘密"
        assert len(data["segments"]) == 3
        assert data["status"] == "success"

    def test_podcast_blank_topic_422(self, client):
        resp = client.post("/api/v1/ai/podcast", json={"topic": "   "})
        assert resp.status_code == 422

    def test_podcast_invalid_scene_422(self, client):
        resp = client.post("/api/v1/ai/podcast", json={"topic": "测试", "scene": "invalid"})
        assert resp.status_code == 422

    def test_podcast_fallback(self, client):
        with patch("routers.podcast.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/podcast", json={"topic": "测试"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Learning Coach 学习教练
# ============================================================


class TestLearningCoachRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_learning_coach_success(self, client):
        mock_result = {
            "weekly_plan": [
                {
                    "day": "周一",
                    "tasks": [
                        {"task": "复习错题集", "type": "review", "estimated_minutes": 25, "reason": "巩固薄弱点"},
                    ],
                },
                {
                    "day": "周二",
                    "tasks": [
                        {"task": "学习新内容", "type": "new", "estimated_minutes": 25, "reason": "推进进度"},
                    ],
                },
            ],
            "adjustments": "增加复习比例",
            "focus_advice": "重点攻克函数导数",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 400,
            "latency_ms": 1000,
        }
        with patch("routers.learning_coach.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/learning-coach", json={
                "learning_stats": "上周学习5天，正确率65%",
                "goals": "数学考试90分",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["weekly_plan"]) == 2
        assert data["weekly_plan"][0]["day"] == "周一"
        assert data["status"] == "success"

    def test_learning_coach_empty(self, client):
        mock_result = {
            "weekly_plan": [{"day": "周一", "tasks": [{"task": "复习", "type": "review", "estimated_minutes": 25, "reason": "巩固"}]}],
            "adjustments": "保持节奏",
            "focus_advice": "保持规律",
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 200,
            "latency_ms": 500,
        }
        with patch("routers.learning_coach.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/learning-coach", json={})
        assert resp.status_code == 200

    def test_learning_coach_fallback(self, client):
        with patch("routers.learning_coach.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/learning-coach", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Infographic 信息图生成器
# ============================================================


class TestInfographicRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_infographic_success(self, client):
        mock_result = {
            "title": "光的波粒二象性",
            "style": "academic",
            "style_name": "学术简约",
            "sections": [
                {
                    "heading": "核心概念",
                    "points": [
                        {"text": "光同时具有波动性和粒子性", "importance": 5},
                    ],
                },
                {
                    "heading": "实验证据",
                    "points": [
                        {"text": "双缝干涉→波动性", "importance": 5},
                        {"text": "光电效应→粒子性", "importance": 5},
                    ],
                },
            ],
            "key_relationships": [
                {"from": "波动性", "to": "粒子性", "relation": "互补关系"},
            ],
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 300,
            "latency_ms": 700,
        }
        with patch("routers.infographic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/infographic", json={
                "content": "光的波粒二象性——光既是波又是粒子",
                "content_type": "physics",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "光的波粒二象性"
        assert len(data["sections"]) == 2
        assert len(data["key_relationships"]) == 1
        assert data["status"] == "success"

    def test_infographic_blank_content_422(self, client):
        resp = client.post("/api/v1/ai/infographic", json={"content": "   "})
        assert resp.status_code == 422

    def test_infographic_fallback(self, client):
        with patch("routers.infographic.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/infographic", json={"content": "测试内容"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"


# ============================================================
# Chain 直接测试（降级 JSON 解析）
# ============================================================


class TestDegradedJsonParsing:
    """测试各 Chain 的降级 JSON 解析能力"""

    @pytest.mark.asyncio
    async def test_debate_chain_degraded_json(self):
        from chains.debate_chain import DebateChain
        chain = DebateChain.__new__(DebateChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["argument"] == "让我们从基本假设开始——你愿意先明确你的核心论点吗？"

    @pytest.mark.asyncio
    async def test_counterintuitive_chain_degraded_json(self):
        from chains.counterintuitive_chain import CounterintuitiveChain
        chain = CounterintuitiveChain.__new__(CounterintuitiveChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["fact"] is not None

    @pytest.mark.asyncio
    async def test_personify_chain_degraded_json(self):
        from chains.personify_chain import PersonifyChain
        chain = PersonifyChain.__new__(PersonifyChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["persona_card"]["name"] == "概念小精灵"

    @pytest.mark.asyncio
    async def test_mnemonic_chain_degraded_json(self):
        from chains.mnemonic_chain import MnemonicChain
        chain = MnemonicChain.__new__(MnemonicChain)
        parsed = chain._parse_response("这不是 JSON")
        assert len(parsed["mnemonics"]) >= 1

    @pytest.mark.asyncio
    async def test_podcast_chain_degraded_json(self):
        from chains.podcast_chain import PodcastChain
        chain = PodcastChain.__new__(PodcastChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["title"] == "知识小课堂"

    @pytest.mark.asyncio
    async def test_learning_coach_chain_degraded_json(self):
        from chains.learning_coach_chain import LearningCoachChain
        chain = LearningCoachChain.__new__(LearningCoachChain)
        parsed = chain._parse_response("这不是 JSON")
        assert len(parsed["weekly_plan"]) >= 1

    @pytest.mark.asyncio
    async def test_infographic_chain_degraded_json(self):
        from chains.infographic_chain import InfographicChain
        chain = InfographicChain.__new__(InfographicChain)
        parsed = chain._parse_response("这不是 JSON")
        assert parsed["title"] == "知识概览"