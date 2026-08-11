"""
熵减 AI 网关 — Phase4 服务端 AI Chains 测试

覆盖：
- POST /api/v1/ai/compile       知识编译引擎（摘要/概念图谱/闪卡/费曼/学习路径）
- POST /api/v1/ai/micro-card    微学习卡片流（30 秒可消化的卡片流）

每个 Chain：Router happy path + fallback 降级 + Chain 层 degraded JSON（mock provider）。
"""

import json
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
        compile_router,
        micro_card_router,
    )
    app.include_router(compile_router)
    app.include_router(micro_card_router)
    return app


class _MockProvider:
    """可自定义响应的 mock Provider（用于 Chain 层 degraded JSON 测试）"""

    def __init__(self, response: dict | None = None):
        self.provider_name = "mock"
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


# ============================================================
# Compile 知识编译引擎
# ============================================================


class TestCompileRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_compile_success(self, client):
        """正常返回 5 种编译输出"""
        mock_result = {
            "summary": "本课程围绕力学三大定律与动量守恒展开，核心是理解力与运动的关系。",
            "concept_map": [
                {"concept": "牛顿第一定律", "related": ["惯性", "力"], "mastery_estimate": 0.8},
                {"concept": "动量守恒", "related": ["碰撞", "冲量"], "mastery_estimate": 0.5},
            ],
            "flashcard_highlights": [
                {"front": "牛顿第一定律的内容是什么？", "back": "物体在不受外力时保持静止或匀速直线运动"},
            ],
            "feynman_picks": [
                {"concept": "动量守恒", "takeaway": "合外力为零时，碰撞前后的总动量不变"},
            ],
            "learning_path": [
                {"step": "掌握力的概念", "action": "复习力的三要素并做 10 道基础题"},
                {"step": "理解三大定律", "action": "用生活案例对应每条定律"},
            ],
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 500,
            "latency_ms": 900,
        }
        with patch("routers.compile.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/compile", json={
                "theme": "力学基础",
                "notes": [
                    {"title": "牛顿定律", "content": "第一定律惯性，第二定律 F=ma"},
                    {"title": "动量", "content": "动量守恒适用于合外力为零的系统"},
                ],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"].startswith("本课程")
        assert len(data["concept_map"]) == 2
        assert data["concept_map"][0]["concept"] == "牛顿第一定律"
        assert data["concept_map"][0]["mastery_estimate"] == 0.8
        assert len(data["flashcard_highlights"]) == 1
        assert data["feynman_picks"][0]["concept"] == "动量守恒"
        assert len(data["learning_path"]) == 2
        assert data["status"] == "success"

    def test_compile_blank_content_422(self, client):
        resp = client.post("/api/v1/ai/compile", json={
            "notes": [{"title": "空笔记", "content": "   "}],
        })
        assert resp.status_code == 422

    def test_compile_empty_notes_422(self, client):
        resp = client.post("/api/v1/ai/compile", json={"notes": []})
        assert resp.status_code == 422

    def test_compile_fallback(self, client):
        with patch("routers.compile.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/compile", json={
                "notes": [{"title": "笔记", "content": "测试内容"}],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert data["concept_map"] == []
        assert data["learning_path"] == []


# ============================================================
# Micro Card 微学习卡片流
# ============================================================


class TestMicroCardRouter:
    @pytest.fixture
    def client(self):
        app = _create_test_app()
        return TestClient(app)

    def test_micro_card_success(self, client):
        """正常返回 30 秒可消化的卡片流"""
        mock_result = {
            "cards": [
                {
                    "id": "card-1",
                    "front": "光同时具有波动性和粒子性，称为波粒二象性",
                    "back": "双缝干涉证明波动性，光电效应证明粒子性",
                    "tags": ["光学", "量子"],
                    "difficulty": 3,
                },
                {
                    "id": "card-2",
                    "front": "光电效应中，光的频率决定电子是否逸出",
                    "back": "频率低于阈值的入射光无法打出电子，与光强无关",
                    "tags": ["光电效应"],
                    "difficulty": 4,
                },
            ],
            "total_cards": 2,
            "status": "success",
            "model": "qwen-plus",
            "tokens_used": 300,
            "latency_ms": 700,
        }
        with patch("routers.micro_card.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/ai/micro-card", json={
                "content": "光的波粒二象性——光既是波又是粒子，双缝干涉和光电效应分别证明了这一点",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_cards"] == 2
        assert len(data["cards"]) == 2
        assert data["cards"][0]["id"] == "card-1"
        assert data["cards"][0]["difficulty"] == 3
        assert data["cards"][0]["tags"] == ["光学", "量子"]
        assert data["status"] == "success"

    def test_micro_card_blank_content_422(self, client):
        resp = client.post("/api/v1/ai/micro-card", json={"content": "   "})
        assert resp.status_code == 422

    def test_micro_card_fallback(self, client):
        with patch("routers.micro_card.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("服务不可用")
            resp = client.post("/api/v1/ai/micro-card", json={"content": "测试内容"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "fallback"
        assert data["cards"] == []
        assert data["total_cards"] == 0


# ============================================================
# Chain 直接测试（降级 JSON 解析，mock provider）
# ============================================================


class TestDegradedJsonParsing:
    """测试各 Chain 的降级 JSON 解析能力（mock provider 返回非法 JSON）"""

    @pytest.mark.asyncio
    async def test_compile_chain_degraded_json(self):
        """非法 JSON → 空结构 + 降级摘要"""
        from chains.compile_chain import CompileChain
        chain = CompileChain(provider=_MockProvider(response={
            "content": "这不是 JSON", "tokens_used": 0, "model": "mock-model", "latency_ms": 0,
        }))
        result = await chain.run(notes=[{"title": "笔记", "content": "内容"}])
        assert result["status"] == "degraded"
        assert "失败" in result["summary"]
        assert result["concept_map"] == []
        assert result["flashcard_highlights"] == []
        assert result["feynman_picks"] == []
        assert result["learning_path"] == []

    @pytest.mark.asyncio
    async def test_compile_chain_invalid_items_normalized(self):
        """缺核心字段的项被过滤，辅助字段（related/mastery）非法时归一"""
        from chains.compile_chain import CompileChain
        chain = CompileChain(provider=_MockProvider(response={
            "content": json.dumps({
                "summary": "测试摘要",
                "concept_map": [
                    {"concept": "惯性", "related": ["力"], "mastery_estimate": 0.9},
                    {"concept": "坏概念", "related": "非法", "mastery_estimate": "abc"},
                    {"mastery_estimate": 0.5},  # 缺 concept → 丢弃
                    {"concept": "", "related": []},  # 空白 concept → 丢弃
                ],
                "flashcard_highlights": [
                    {"front": "Q?", "back": "A!"},
                    {"front": "缺背面"},  # 缺 back → 丢弃
                ],
                "feynman_picks": [{"concept": "动量", "takeaway": "守恒"}, {"takeaway": "缺概念"}],
                "learning_path": [{"step": "第一步", "action": "复习"}, {"step": "缺动作"}],
            }),
            "tokens_used": 0, "model": "mock-model", "latency_ms": 0,
        }))
        result = await chain.run(notes=[{"title": "笔记", "content": "内容"}])
        assert result["status"] == "success"
        assert result["summary"] == "测试摘要"
        assert len(result["concept_map"]) == 2  # 缺 concept 的两项被丢弃
        assert result["concept_map"][0]["concept"] == "惯性"
        assert result["concept_map"][0]["mastery_estimate"] == 0.9
        # 辅助字段非法时归一而非丢弃
        assert result["concept_map"][1]["concept"] == "坏概念"
        assert result["concept_map"][1]["related"] == []
        assert result["concept_map"][1]["mastery_estimate"] == 0.3
        assert len(result["flashcard_highlights"]) == 1
        assert len(result["feynman_picks"]) == 1
        assert len(result["learning_path"]) == 1

    @pytest.mark.asyncio
    async def test_micro_card_chain_degraded_json(self):
        """非法 JSON → 空卡片流"""
        from chains.micro_card_chain import MicroCardChain
        chain = MicroCardChain(provider=_MockProvider(response={
            "content": "这不是 JSON", "tokens_used": 0, "model": "mock-model", "latency_ms": 0,
        }))
        result = await chain.run(content="光的波粒二象性")
        assert result["status"] == "degraded"
        assert result["cards"] == []
        assert result["total_cards"] == 0

    @pytest.mark.asyncio
    async def test_micro_card_chain_invalid_cards_normalized(self):
        """缺字段/非法 difficulty 的卡片被过滤或归一，id 自动编号，total_cards 以实际为准"""
        import json as _json
        from chains.micro_card_chain import MicroCardChain
        chain = MicroCardChain(provider=_MockProvider(response={
            "content": _json.dumps({
                "cards": [
                    {"front": "卡片A内容", "back": "补充A", "tags": ["标签"], "difficulty": 2},
                    {"front": "缺背面"},  # 缺 back → 丢弃
                    {"front": "卡片B内容", "back": "补充B", "tags": "非法", "difficulty": 99},
                ],
                "total_cards": 3,  # LLM 报 3，实际合法 2
            }),
            "tokens_used": 0, "model": "mock-model", "latency_ms": 0,
        }))
        result = await chain.run(content="测试知识")
        assert result["status"] == "success"
        assert result["total_cards"] == 2  # 以实际清洗后为准
        assert result["cards"][0]["id"] == "card-1"  # 缺 id 自动编号
        assert result["cards"][0]["difficulty"] == 2
        assert result["cards"][1]["id"] == "card-2"
        assert result["cards"][1]["tags"] == []  # 非法 tags 归一为空
        assert result["cards"][1]["difficulty"] == 5  # 99 钳制到 5
