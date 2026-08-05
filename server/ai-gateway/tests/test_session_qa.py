"""
D2 课堂问答路由/链测试 / Tests for the session-QA router & chain

覆盖：
- POST /api/v1/ai/session-qa — 正常返回、参数验证、全部服务降级
- SessionQaChain — JSON 解析容错、引用裁剪

@ai-context: Router tests mock call_with_fallback_for_request; chain tests
use MagicMock providers with canned JSON payloads.
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
    """创建测试用 FastAPI app（不挂中间件，只注册课堂问答路由）"""
    from routers import session_qa_router

    app = FastAPI()
    mock_provider = MagicMock()
    mock_provider.provider_name = "deepseek"
    mock_provider.api_key = "mock"

    app.state.providers = {
        "qwen": mock_provider,
        "deepseek": mock_provider,
        "glm": mock_provider,
        "fallback": mock_provider,
    }
    app.include_router(session_qa_router)
    return app


# ────────────────────────────────────────────────────────────
# 路由层
# ────────────────────────────────────────────────────────────


class TestSessionQaRouter:
    """POST /api/v1/ai/session-qa"""

    @pytest.fixture
    def client(self):
        return TestClient(_create_test_app())

    def _mock_result(self):
        return {
            "answer": "老师这节课讲了牛顿第二定律的推导过程。",
            "references": [
                {"time": "00:12:34", "text": "F 等于 ma 的推导…"},
                {"time": "00:20:11", "text": "举例说明加速度与力的关系…"},
            ],
            "status": "success",
            "model": "deepseek-chat",
            "tokens_used": 220,
            "latency_ms": 900,
        }

    def test_qa_success(self, client):
        with patch(
            "routers.session_qa.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.return_value = (self._mock_result(), "deepseek", False)
            resp = client.post(
                "/api/v1/ai/session-qa",
                json={"question": "这节课讲了什么？", "transcript": "00:00:01 大家好，今天我们讲牛顿第二定律…"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["references"]) == 2
        assert data["references"][0]["time"] == "00:12:34"

    def test_qa_validation_error_empty_question(self, client):
        resp = client.post(
            "/api/v1/ai/session-qa",
            json={"question": "", "transcript": "转写内容"},
        )
        assert resp.status_code == 422

    def test_qa_all_providers_fail_degraded(self, client):
        with patch(
            "routers.session_qa.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post(
                "/api/v1/ai/session-qa",
                json={"question": "什么是熵？", "transcript": "转写内容"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert data["answer"] == ""


# ────────────────────────────────────────────────────────────
# Chain 层
# ────────────────────────────────────────────────────────────


class TestSessionQaChain:
    """SessionQaChain JSON 解析容错"""

    def _make_chain(self, content: str):
        from chains.session_qa_chain import SessionQaChain

        provider = MagicMock()
        provider.generate = AsyncMock(return_value={
            "content": content,
            "model": "mock-model",
            "tokens_used": 100,
            "latency_ms": 30,
        })
        return SessionQaChain(provider=provider)

    @pytest.mark.asyncio
    async def test_parse_standard_json(self):
        chain = self._make_chain(
            '{"answer":"讲了牛顿第二定律。","references":[{"time":"00:01:00","text":"F=ma 推导"}]}'
        )
        result = await chain.run(transcript="转写", question="讲了什么")
        assert result["status"] == "success"
        assert result["references"][0]["time"] == "00:01:00"

    @pytest.mark.asyncio
    async def test_parse_markdown_code_block(self):
        chain = self._make_chain(
            '```json\n{"answer":"答案是 A。","references":[{"time":"00:05:00","text":"关键结论"}]}\n```'
        )
        result = await chain.run(transcript="转写", question="答案是什么")
        assert result["answer"] == "答案是 A。"

    @pytest.mark.asyncio
    async def test_references_trimmed_and_filtered(self):
        """引用最多保留 3 条；缺 time/text 的引用被过滤"""
        chain = self._make_chain(
            '{"answer":"答","references":['
            '{"time":"00:01:00","text":"一"},'
            '{"time":"00:02:00","text":"二"},'
            '{"time":"00:03:00","text":"三"},'
            '{"time":"00:04:00","text":"四"},'
            '{"time":"","text":"缺时间"},'
            '{"time":"00:05:00","text":""}'
            ']}'
        )
        result = await chain.run(transcript="转写", question="问题")
        assert len(result["references"]) == 3

    @pytest.mark.asyncio
    async def test_parse_empty_content_degraded(self):
        chain = self._make_chain("")
        result = await chain.run(transcript="转写", question="问题")
        assert result["status"] == "degraded"
        assert result["answer"] == ""
