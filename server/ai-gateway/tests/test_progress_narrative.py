"""
A3 微进展叙述路由/链测试 / Tests for the progress-narrative router & chain

覆盖：
- POST /api/v1/ai/progress-narrative — 正常返回、参数验证、全部服务降级
- ProgressNarrativeChain — JSON 解析容错（标准 / markdown / 纯文本 / 损坏）

@ai-context: Router tests mock call_with_fallback_for_request; chain tests
use the conftest MockProvider with canned JSON payloads.
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


def _create_test_app():
    """创建测试用 FastAPI app（不挂中间件，只注册微进展叙述路由）"""
    from routers import progress_narrative_router

    app = FastAPI()
    mock_provider = MagicMock()
    mock_provider.provider_name = "glm"
    mock_provider.api_key = "mock"

    app.state.providers = {
        "qwen": mock_provider,
        "deepseek": mock_provider,
        "glm": mock_provider,
        "fallback": mock_provider,
    }
    app.include_router(progress_narrative_router)
    return app


# ────────────────────────────────────────────────────────────
# 路由层
# ────────────────────────────────────────────────────────────


class TestProgressNarrativeRouter:
    """POST /api/v1/ai/progress-narrative"""

    @pytest.fixture
    def client(self):
        return TestClient(_create_test_app())

    def test_narrative_success(self, client):
        """正常返回叙述文本"""
        mock_result = {
            "narrative": "本周你复习了 42 张卡片，比上周多了 12 张，节奏很稳。",
            "status": "success",
            "model": "glm-4-flash",
            "tokens_used": 80,
            "latency_ms": 600,
        }
        with patch(
            "routers.progress_narrative.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.return_value = (mock_result, "glm", False)
            resp = client.post(
                "/api/v1/ai/progress-narrative",
                json={"stats_text": "本周复习 42 张卡片，上周 30 张"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "42" in data["narrative"]
        assert data["model"] == "glm-4-flash"

    def test_narrative_validation_error_empty_stats(self, client):
        """stats_text 为空返回 422"""
        resp = client.post("/api/v1/ai/progress-narrative", json={"stats_text": ""})
        assert resp.status_code == 422

    def test_narrative_all_providers_fail_degraded(self, client):
        """所有 Provider 不可用时返回降级响应（客户端回退离线模板）"""
        with patch(
            "routers.progress_narrative.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post(
                "/api/v1/ai/progress-narrative",
                json={"stats_text": "本周完成 5 个番茄钟"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert data["narrative"] == ""


# ────────────────────────────────────────────────────────────
# Chain 层
# ────────────────────────────────────────────────────────────


class TestProgressNarrativeChain:
    """ProgressNarrativeChain JSON 解析容错"""

    def _make_chain(self, content: str):
        from chains.progress_narrative_chain import ProgressNarrativeChain

        provider = MagicMock()
        provider.generate = AsyncMock(return_value={
            "content": content,
            "model": "mock-model",
            "tokens_used": 50,
            "latency_ms": 30,
        })
        return ProgressNarrativeChain(provider=provider)

    @pytest.mark.asyncio
    async def test_parse_standard_json(self):
        chain = self._make_chain('{"narrative": "你本周进步明显。"}')
        result = await chain.run(stats_text="统计文本")
        assert result["status"] == "success"
        assert result["narrative"] == "你本周进步明显。"

    @pytest.mark.asyncio
    async def test_parse_markdown_code_block(self):
        chain = self._make_chain('```json\n{"narrative": "稳步前进的一周。"}\n```')
        result = await chain.run(stats_text="统计文本")
        assert result["narrative"] == "稳步前进的一周。"

    @pytest.mark.asyncio
    async def test_parse_plain_text_fallback(self):
        """模型未遵循 JSON 时，短纯文本兜底可用"""
        chain = self._make_chain("这周你完成得比上周更多，保持节奏。")
        result = await chain.run(stats_text="统计文本")
        assert result["status"] == "success"
        assert result["narrative"] == "这周你完成得比上周更多，保持节奏。"

    @pytest.mark.asyncio
    async def test_parse_empty_content_degraded(self):
        chain = self._make_chain("")
        result = await chain.run(stats_text="统计文本")
        assert result["status"] == "degraded"
        assert result["narrative"] == ""
