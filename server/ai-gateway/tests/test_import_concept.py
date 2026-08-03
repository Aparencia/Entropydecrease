"""
熵减 AI 网关 —— 知识入籍概念化测试

覆盖：
- ImportConceptChain：合法 JSON 提取、非法条目过滤、解析失败降级、总量预算
- POST /api/v1/ai/import/concepts：正常返回、单块超限 400、总量超限 400、503

@ai-context: Settling router & chain tests. Mock provider + patched fallback.
"""

import sys
import json
from pathlib import Path
from unittest.mock import patch, AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from chains.import_concept_chain import ImportConceptChain, MAX_CONCEPTS  # noqa: E402


class _MockProvider:
    """模拟 AI Provider（与 conftest.MockProvider 同构，避免导入 conftest）"""

    def __init__(self, name: str = "mock", response: dict | None = None):
        self.provider_name = name
        self.api_key = "mock-key"
        self._response = response or {
            "content": "{}",
            "tokens_used": 0,
            "model": "mock-model",
            "latency_ms": 0,
        }

    async def generate(self, prompt, system_prompt="", model="", temperature=0.7,
                       max_tokens=2048, response_format=None, **kwargs):
        return self._response.copy()


# ────────────────────────────────────────────────────────────
# ImportConceptChain 单元测试
# ────────────────────────────────────────────────────────────


class TestImportConceptChain:
    """ImportConceptChain.run 行为"""

    def _chain_with(self, content: str) -> ImportConceptChain:
        provider = _MockProvider(response={
            "content": content,
            "tokens_used": 120,
            "model": "mock-model",
            "latency_ms": 30,
        })
        return ImportConceptChain(provider=provider, model="mock-model")

    @pytest.mark.asyncio
    async def test_extracts_valid_concepts(self):
        """合法 JSON 输出 → 提取并校验概念"""
        payload = {"concepts": [
            {"name": "费曼学习法", "summary": "以教促学的学习策略",
             "card_front": "什么是费曼学习法？", "card_back": "用自己的话讲清楚"},
            {"name": "间隔重复", "summary": "按遗忘曲线安排复习",
             "card_front": "什么是间隔重复？", "card_back": "临界时刻复习"},
        ]}
        chain = self._chain_with(json.dumps(payload, ensure_ascii=False))

        result = await chain.run(title="学习方法", text_chunks=["一段足够长的文本内容。"] * 5)

        assert result["model"] == "mock-model"
        assert len(result["concepts"]) == 2
        assert result["concepts"][0]["name"] == "费曼学习法"
        assert result["concepts"][0]["card_front"] == "什么是费曼学习法？"

    @pytest.mark.asyncio
    async def test_filters_invalid_entries_and_derives_front(self):
        """非法条目（缺 name / name 超长）被过滤；card_front 缺省由 name 派生"""
        payload = {"concepts": [
            {"name": "", "summary": "缺名字", "card_front": "", "card_back": ""},
            {"name": "有名字的概念", "summary": "ok", "card_front": "", "card_back": ""},
            {"name": "x" * 200, "summary": "超长名字", "card_front": "", "card_back": ""},
        ]}
        chain = self._chain_with(json.dumps(payload, ensure_ascii=False))

        result = await chain.run(title="t", text_chunks=["内容"])

        assert len(result["concepts"]) == 1
        assert result["concepts"][0]["name"] == "有名字的概念"
        assert result["concepts"][0]["card_front"] == "什么是有名字的概念？"

    @pytest.mark.asyncio
    async def test_parse_failure_returns_fallback_empty(self):
        """非 JSON 输出 → fallback 空结果（model=fallback）"""
        chain = self._chain_with("这不是 JSON，只是一段散文输出。")

        result = await chain.run(title="t", text_chunks=["内容"])

        assert result["concepts"] == []
        assert result["model"] == "fallback"

    @pytest.mark.asyncio
    async def test_empty_concepts_list_falls_back(self):
        """AI 返回空概念列表 → 视为失败走 fallback"""
        chain = self._chain_with(json.dumps({"concepts": []}))

        result = await chain.run(title="t", text_chunks=["内容"])

        assert result["concepts"] == []
        assert result["model"] == "fallback"

    @pytest.mark.asyncio
    async def test_chunk_budget_truncates_overlong_input(self):
        """总量预算生效：超长输入被截断而不是溢出"""
        payload = {"concepts": [{"name": "唯一概念", "summary": "s",
                                 "card_front": "f", "card_back": "b"}]}
        chain = self._chain_with(json.dumps(payload, ensure_ascii=False))

        # 50 个 5000 字块（总量 25 万）→ 截断到 5 万以内
        result = await chain.run(title="t", text_chunks=["甲" * 5000] * 50)

        assert len(result["concepts"]) == 1

    @pytest.mark.asyncio
    async def test_empty_chunks_returns_fallback(self):
        """全部空白块 → fallback 空结果（不调用 Provider）"""
        provider = _MockProvider()
        chain = ImportConceptChain(provider=provider, model="mock-model")

        result = await chain.run(title="t", text_chunks=["   ", "\n"])

        assert result["concepts"] == []
        assert result["model"] == "fallback"

    @pytest.mark.asyncio
    async def test_limits_concepts_to_max(self):
        """提取数量不超过 MAX_CONCEPTS"""
        many = {"concepts": [
            {"name": f"概念{i}", "summary": "s", "card_front": "f", "card_back": "b"}
            for i in range(30)
        ]}
        chain = self._chain_with(json.dumps(many, ensure_ascii=False))

        result = await chain.run(title="t", text_chunks=["内容"])

        assert len(result["concepts"]) <= MAX_CONCEPTS


# ────────────────────────────────────────────────────────────
# 路由测试
# ────────────────────────────────────────────────────────────


def _create_test_app():
    """创建只注册 import_concept 路由的测试 app"""
    from routers.import_concept import router as import_concept_router

    app = FastAPI()
    app.state.providers = {
        "qwen": _MockProvider(name="qwen"),
        "glm": _MockProvider(name="glm"),
        "fallback": _MockProvider(name="fallback"),
    }
    app.include_router(import_concept_router)
    return app


class TestImportConceptRouter:
    """POST /api/v1/ai/import/concepts"""

    @pytest.fixture
    def client(self):
        return TestClient(_create_test_app())

    def _mock_result(self):
        return (
            {"concepts": [
                {"name": "概念甲", "summary": "摘要", "card_front": "提问", "card_back": "答案"},
            ], "model": "glm-4.6v-flash", "tokens_used": 100},
            "glm",
            False,
        )

    def test_success(self, client):
        """正常返回概念候选列表"""
        with patch("routers.import_concept.call_with_fallback_for_request", new_callable=AsyncMock) as m:
            m.return_value = self._mock_result()
            resp = client.post("/api/v1/ai/import/concepts", json={
                "title": "学习方法论",
                "text_chunks": ["这是第一块文本，介绍核心概念。", "这是第二块文本，补充细节。"],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["concepts"]) == 1
        assert data["concepts"][0]["name"] == "概念甲"
        assert data["model"] == "glm-4.6v-flash"

    def test_rejects_oversized_chunk(self, client):
        """单块超过 3000 字 → 400"""
        resp = client.post("/api/v1/ai/import/concepts", json={
            "title": "t",
            "text_chunks": ["甲" * 3001],
        })
        assert resp.status_code == 400
        assert "单块上限" in resp.json()["detail"]

    def test_rejects_total_overflow(self, client):
        """总量超过 5 万字符 → 400"""
        resp = client.post("/api/v1/ai/import/concepts", json={
            "title": "t",
            "text_chunks": ["乙" * 3000] * 20,  # 6 万 > 5 万
        })
        assert resp.status_code == 400
        assert "总量" in resp.json()["detail"]

    def test_rejects_empty_chunks(self, client):
        """空文本块列表 → 422（Pydantic 校验）"""
        resp = client.post("/api/v1/ai/import/concepts", json={"title": "t", "text_chunks": []})
        assert resp.status_code == 422

    def test_service_unavailable_returns_503(self, client):
        """所有 AI 服务不可用 → 503"""
        with patch("routers.import_concept.call_with_fallback_for_request", new_callable=AsyncMock) as m:
            m.side_effect = RuntimeError("all providers down")
            resp = client.post("/api/v1/ai/import/concepts", json={
                "title": "t",
                "text_chunks": ["内容"],
            })
        assert resp.status_code == 503
