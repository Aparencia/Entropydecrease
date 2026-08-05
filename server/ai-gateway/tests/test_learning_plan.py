"""
P1 学习规划路由/链测试 / Tests for the learning-plan router & chain

覆盖：
- POST /api/v1/ai/learning-plan — 正常返回、参数验证、全部服务降级
- LearningPlanChain — JSON 解析容错、模块白名单、分钟数钳制

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
    """创建测试用 FastAPI app（不挂中间件，只注册学习规划路由）"""
    from routers import learning_plan_router

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
    app.include_router(learning_plan_router)
    return app


# ────────────────────────────────────────────────────────────
# 路由层
# ────────────────────────────────────────────────────────────


class TestLearningPlanRouter:
    """POST /api/v1/ai/learning-plan"""

    @pytest.fixture
    def client(self):
        return TestClient(_create_test_app())

    def _mock_result(self):
        return {
            "date": "2026-08-05",
            "items": [
                {"module": "flashcards", "title": "复习高数到期卡", "minutes": 20,
                 "task": "复习 25 张到期卡片", "reason": "今日 25 张卡到期", "order": 1},
                {"module": "pomodoro", "title": "深潜 30 分钟", "minutes": 30,
                 "task": "学习第三章", "reason": "高峰时段适合深度学习", "order": 2},
            ],
            "note": "先清完到期卡片，再进入深度学习，节奏刚好。",
            "status": "success",
            "model": "deepseek-chat",
            "tokens_used": 300,
            "latency_ms": 1200,
        }

    def test_plan_success(self, client):
        """正常返回今日计划"""
        with patch(
            "routers.learning_plan.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.return_value = (self._mock_result(), "deepseek", False)
            resp = client.post(
                "/api/v1/ai/learning-plan",
                json={
                    "mastery_summary": "高数：朦胧；英语：牢固",
                    "due_counts": {"高数": 25},
                    "peak_hours": [9, 20],
                    "weekly_goal_minutes": 300,
                    "today_minutes": 45,
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["items"]) == 2
        assert data["items"][0]["module"] == "flashcards"
        assert data["items"][0]["minutes"] == 20
        assert data["note"] != ""

    def test_plan_empty_context_allowed(self, client):
        """空上下文也可请求（模型按默认规则生成轻量计划）"""
        with patch(
            "routers.learning_plan.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.return_value = (self._mock_result(), "deepseek", False)
            resp = client.post("/api/v1/ai/learning-plan", json={})
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_plan_validation_error_bad_minutes(self, client):
        """负数分钟返回 422"""
        resp = client.post(
            "/api/v1/ai/learning-plan",
            json={"today_minutes": -5},
        )
        assert resp.status_code == 422

    def test_plan_peak_hours_out_of_range_filtered(self, client):
        """高峰时段越界/重复被 validator 过滤，不阻断请求（防御性清洗）"""
        with patch(
            "routers.learning_plan.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.return_value = (self._mock_result(), "deepseek", False)
            resp = client.post(
                "/api/v1/ai/learning-plan",
                json={"peak_hours": [-1, 9, 9, 24, 25]},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"
        # 上下文拼接只应包含清洗后的高峰小时（9）——通过路由内聚合验证
        # 无法直接读取闭包，此处断言 validator 未拒绝请求且结果正常

    def test_plan_all_providers_fail_degraded(self, client):
        """所有 Provider 不可用时返回降级响应（客户端回退本地规则规划）"""
        with patch(
            "routers.learning_plan.call_with_fallback_for_request",
            new_callable=AsyncMock,
        ) as mock_cwf:
            mock_cwf.side_effect = RuntimeError("所有 AI 服务暂时不可用")
            resp = client.post(
                "/api/v1/ai/learning-plan",
                json={"mastery_summary": "高数：朦胧"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert data["items"] == []


# ────────────────────────────────────────────────────────────
# Chain 层
# ────────────────────────────────────────────────────────────


class TestLearningPlanChain:
    """LearningPlanChain JSON 解析容错与白名单"""

    def _make_chain(self, content: str):
        from chains.learning_plan_chain import LearningPlanChain

        provider = MagicMock()
        provider.generate = AsyncMock(return_value={
            "content": content,
            "model": "mock-model",
            "tokens_used": 120,
            "latency_ms": 40,
        })
        return LearningPlanChain(provider=provider)

    @pytest.mark.asyncio
    async def test_parse_standard_json(self):
        chain = self._make_chain(
            '{"date":"2026-08-05","items":[{"module":"flashcards","title":"复习","minutes":20,'
            '"task":"复习卡","reason":"到期","order":1}],"note":"加油"}'
        )
        result = await chain.run(context_text="掌握度摘要：数学 朦胧")
        assert result["status"] == "success"
        assert result["items"][0]["module"] == "flashcards"
        assert result["note"] == "加油"

    @pytest.mark.asyncio
    async def test_parse_markdown_code_block(self):
        chain = self._make_chain(
            '```json\n{"items":[{"module":"pomodoro","title":"深潜","minutes":30,'
            '"task":"学习","reason":"高峰","order":1}]}\n```'
        )
        result = await chain.run(context_text="上下文")
        assert result["status"] == "success"
        assert result["items"][0]["module"] == "pomodoro"

    @pytest.mark.asyncio
    async def test_module_whitelist_filters_unknown(self):
        """非法模块被过滤，合法模块保留"""
        chain = self._make_chain(
            '{"items":['
            '{"module":"unknown","title":"x","minutes":10,"task":"t","reason":"r","order":1},'
            '{"module":"notes","title":"整理笔记","minutes":15,"task":"整理","reason":"沉淀","order":2}'
            ']}'
        )
        result = await chain.run(context_text="上下文")
        assert len(result["items"]) == 1
        assert result["items"][0]["module"] == "notes"

    @pytest.mark.asyncio
    async def test_minutes_clamped(self):
        """异常分钟数被钳制到 [1, 120]"""
        chain = self._make_chain(
            '{"items":['
            '{"module":"feynman","title":"讲解","minutes":9999,"task":"t","reason":"r","order":1},'
            '{"module":"inspiration","title":"整理","minutes":-3,"task":"t","reason":"r","order":2}'
            ']}'
        )
        result = await chain.run(context_text="上下文")
        by_module = {i["module"]: i["minutes"] for i in result["items"]}
        assert by_module["feynman"] == 120
        assert by_module["inspiration"] == 1

    @pytest.mark.asyncio
    async def test_parse_empty_content_degraded(self):
        chain = self._make_chain("")
        result = await chain.run(context_text="上下文")
        assert result["status"] == "degraded"
        assert result["items"] == []

    @pytest.mark.asyncio
    async def test_empty_context_text_allowed(self):
        """空上下文（新用户无数据）仍正常调用模型，不抛错"""
        from chains.learning_plan_chain import LearningPlanChain

        provider = MagicMock()
        provider.generate = AsyncMock(return_value={
            "content": '{"items":[{"module":"pomodoro","title":"深潜","minutes":25,'
                       '"task":"t","reason":"r","order":1}]}',
            "model": "mock-model",
            "tokens_used": 80,
            "latency_ms": 30,
        })
        chain = LearningPlanChain(provider=provider)
        result = await chain.run(context_text="")
        assert result["status"] == "success"
        assert len(result["items"]) == 1
        # 空上下文应被替换为兜底提示文本而非空串进入 prompt
        call_prompt = provider.generate.call_args.kwargs["prompt"]
        assert "轻量入门计划" in call_prompt
