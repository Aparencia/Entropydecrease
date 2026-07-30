"""
测试多模态分析 partial 增量片段模式

覆盖：
- AnalyzeSessionRequest.mode 字段：默认 full / 接受 partial / 拒绝非法值
- build_partial_prompt：包含片段限定与全局信息禁令
- MultimodalAnalyzeChain partial 模式：片段系统提示词 + max_tokens=2000
- 截断检测：tokens_used 达上限且末尾无结束标点时 logger.warning
- /analyze-session 路由透传 mode
- /merge-notes 路由对合并结果做段落级去重
"""

import sys
import logging
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)


# ────────────────────────────────────────────────────────────
# 辅助：mock 多模态 Provider 与关键帧数据
# ────────────────────────────────────────────────────────────


def _make_vision_provider(content: str = "## 知识点\n- 要点。", tokens_used: int = 100):
    """构造带 generate_vision_multi 的 mock Provider"""
    provider = MagicMock()
    provider.provider_name = "qwen"
    provider.api_key = "mock"
    provider.generate_vision_multi = AsyncMock(return_value={
        "content": content,
        "tokens_used": tokens_used,
        "model": "qwen-vl-plus",
        "latency_ms": 100,
    })
    return provider


def _make_keyframes(count: int = 3) -> list[dict]:
    return [
        {"timestamp": float(i * 30), "image_base64": "aW1n", "change_type": "slide_change"}
        for i in range(count)
    ]


# ────────────────────────────────────────────────────────────
# Schema：mode 字段
# ────────────────────────────────────────────────────────────


class TestAnalyzeSessionRequestMode:
    """AnalyzeSessionRequest.mode 字段校验"""

    def _base_payload(self) -> dict:
        return {
            "duration": 120,
            "keyframes": [{"timestamp": 10.0, "image_base64": "aW1n"}],
        }

    def test_mode_defaults_to_full(self):
        """不传 mode 时默认 full（向后兼容）"""
        from routers.multimodal_schemas import AnalyzeSessionRequest
        req = AnalyzeSessionRequest(**self._base_payload())
        assert req.mode == "full"

    def test_mode_accepts_partial(self):
        """mode=partial 合法"""
        from routers.multimodal_schemas import AnalyzeSessionRequest
        req = AnalyzeSessionRequest(**self._base_payload(), mode="partial")
        assert req.mode == "partial"

    def test_mode_rejects_invalid_value(self):
        """非法 mode 值被 Pydantic 拒绝"""
        from pydantic import ValidationError
        from routers.multimodal_schemas import AnalyzeSessionRequest
        with pytest.raises(ValidationError):
            AnalyzeSessionRequest(**self._base_payload(), mode="incremental")


# ────────────────────────────────────────────────────────────
# Prompt：片段模板
# ────────────────────────────────────────────────────────────


class TestBuildPartialPrompt:
    """build_partial_prompt 片段提示词"""

    def test_contains_fragment_scope_and_prohibition(self):
        """片段提示词包含片段限定与全局信息禁令"""
        from prompts.session_analyze import build_partial_prompt
        prompt = build_partial_prompt(keyframes_count=5)
        assert "5 张关键帧" in prompt
        assert "禁止" in prompt
        assert "课程概述" in prompt
        assert "核心知识点摘要" in prompt
        assert "MM:SS" in prompt
        assert "[?]" in prompt

    def test_partial_system_prompt_forbids_global_info(self):
        """片段系统提示词明确禁止全局信息"""
        from prompts.session_analyze import PARTIAL_ANALYZE_SYSTEM_PROMPT
        assert "严禁" in PARTIAL_ANALYZE_SYSTEM_PROMPT
        assert "课程概述" in PARTIAL_ANALYZE_SYSTEM_PROMPT


# ────────────────────────────────────────────────────────────
# Chain：partial 模式行为
# ────────────────────────────────────────────────────────────


class TestChainPartialMode:
    """MultimodalAnalyzeChain 的 mode 分支"""

    @pytest.mark.asyncio
    async def test_partial_mode_uses_partial_prompt_and_max_tokens(self):
        """partial 模式使用片段系统提示词且 max_tokens=2000"""
        from chains.multimodal_analyze_chain import MultimodalAnalyzeChain
        from prompts.session_analyze import PARTIAL_ANALYZE_SYSTEM_PROMPT

        provider = _make_vision_provider()
        chain = MultimodalAnalyzeChain(provider=provider, model="qwen-vl-plus")
        result = await chain.run(
            keyframes=_make_keyframes(3), audio_text=None, duration=90, mode="partial",
        )

        assert result["keyframes_analyzed"] == 3
        call_kwargs = provider.generate_vision_multi.call_args.kwargs
        assert call_kwargs["max_tokens"] == 2000
        assert call_kwargs["system_prompt"] == PARTIAL_ANALYZE_SYSTEM_PROMPT
        assert "禁止" in call_kwargs["prompt"]

    @pytest.mark.asyncio
    async def test_full_mode_keeps_default_behavior(self):
        """full 模式（默认）保持全量模板与 max_tokens=4096"""
        from chains.multimodal_analyze_chain import MultimodalAnalyzeChain
        from prompts.session_analyze import SESSION_ANALYZE_SYSTEM_PROMPT

        provider = _make_vision_provider()
        chain = MultimodalAnalyzeChain(provider=provider, model="qwen-vl-plus")
        await chain.run(keyframes=_make_keyframes(3), audio_text=None, duration=90)

        call_kwargs = provider.generate_vision_multi.call_args.kwargs
        assert call_kwargs["max_tokens"] == 4096
        assert call_kwargs["system_prompt"] == SESSION_ANALYZE_SYSTEM_PROMPT

    @pytest.mark.asyncio
    async def test_truncation_warning_logged(self, caplog):
        """tokens_used 达上限且末尾无结束标点时记录截断告警"""
        from chains.multimodal_analyze_chain import MultimodalAnalyzeChain

        provider = _make_vision_provider(
            content="## 知识点\n- 这段输出在句子中间被截", tokens_used=2000,
        )
        chain = MultimodalAnalyzeChain(provider=provider, model="qwen-vl-plus")
        with caplog.at_level(logging.WARNING):
            await chain.run(
                keyframes=_make_keyframes(2), audio_text=None, duration=60, mode="partial",
            )
        assert "截断" in caplog.text

    @pytest.mark.asyncio
    async def test_no_truncation_warning_when_complete(self, caplog):
        """输出以结束标点收尾且未达上限时不告警"""
        from chains.multimodal_analyze_chain import MultimodalAnalyzeChain

        provider = _make_vision_provider(content="## 知识点\n- 完整的要点。", tokens_used=500)
        chain = MultimodalAnalyzeChain(provider=provider, model="qwen-vl-plus")
        with caplog.at_level(logging.WARNING):
            await chain.run(
                keyframes=_make_keyframes(2), audio_text=None, duration=60, mode="partial",
            )
        assert "截断" not in caplog.text

    @pytest.mark.asyncio
    async def test_truncation_uses_provider_clamped_max_tokens(self, caplog):
        """provider clamp 后返回实际 max_tokens（如 GLM 1024）时截断检测仍生效"""
        from chains.multimodal_analyze_chain import MultimodalAnalyzeChain

        # full 模式请求 4096，GLM provider clamp 到 1024 并在返回中携带实际值
        provider = _make_vision_provider(
            content="## 知识点\n- 这段输出在句子中间被截", tokens_used=1024,
        )
        provider.generate_vision_multi.return_value["max_tokens"] = 1024
        provider.generate_vision_multi.return_value["model"] = "glm-4.6v-flash"
        chain = MultimodalAnalyzeChain(provider=provider, model="glm-4.6v-flash")
        with caplog.at_level(logging.WARNING):
            await chain.run(keyframes=_make_keyframes(2), audio_text=None, duration=60)
        assert "截断" in caplog.text


# ────────────────────────────────────────────────────────────
# 路由：mode 透传与 merge-notes 去重
# ────────────────────────────────────────────────────────────


def _create_multimodal_app() -> FastAPI:
    """创建仅挂多模态路由的测试 app（不挂中间件）"""
    from routers.multimodal import router as multimodal_router

    app = FastAPI()
    mock_provider = MagicMock()
    mock_provider.provider_name = "qwen"
    mock_provider.api_key = "mock"
    app.state.providers = {"qwen": mock_provider, "fallback": mock_provider}
    app.include_router(multimodal_router)
    return app


class TestAnalyzeSessionModeRoute:
    """POST /api/v1/multimodal/analyze-session mode 透传"""

    @pytest.fixture
    def client(self):
        return TestClient(_create_multimodal_app())

    def test_partial_mode_accepted(self, client):
        """mode=partial 请求正常返回"""
        mock_result = {
            "content": "## 片段知识点\n- 要点。",
            "tokens_used": 300,
            "model": "qwen-vl-plus",
            "latency_ms": 500,
            "keyframes_analyzed": 2,
        }
        with patch("routers.multimodal.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/multimodal/analyze-session", json={
                "duration": 60,
                "keyframes": [
                    {"timestamp": 5.0, "image_base64": "aW1n"},
                    {"timestamp": 35.0, "image_base64": "aW1n"},
                ],
                "mode": "partial",
            })
        assert resp.status_code == 200
        assert resp.json()["content"] == "## 片段知识点\n- 要点。"

    def test_invalid_mode_rejected(self, client):
        """非法 mode 返回 422"""
        resp = client.post("/api/v1/multimodal/analyze-session", json={
            "duration": 60,
            "keyframes": [{"timestamp": 5.0, "image_base64": "aW1n"}],
            "mode": "bogus",
        })
        assert resp.status_code == 422


class TestMergeNotesDedup:
    """POST /api/v1/multimodal/merge-notes 合并结果去重"""

    @pytest.fixture
    def client(self):
        return TestClient(_create_multimodal_app())

    def test_duplicate_paragraphs_removed_from_merge_result(self, client):
        """模型合并输出中的重复段落被兜底去重"""
        duplicated = (
            "## 二叉树遍历\n\n"
            "前序遍历的顺序是根左右，中序遍历的顺序是左根右，后序遍历的顺序是左右根。\n\n"
            "前序遍历的顺序是根左右，中序遍历的顺序是左根右，后序遍历的顺序是左右根。\n\n"
            "## 核心知识点摘要\n\n- 三种遍历方式的访问顺序不同。"
        )
        mock_result = {
            "content": duplicated,
            "tokens_used": 400,
            "model": "qwen-plus",
            "latency_ms": 300,
        }
        with patch("routers.multimodal.call_with_fallback_for_request", new_callable=AsyncMock) as mock_cwf:
            mock_cwf.return_value = (mock_result, "qwen", False)
            resp = client.post("/api/v1/multimodal/merge-notes", json={
                "partials": ["## 片段一\n内容一", "## 片段二\n内容二"],
                "duration": 600,
            })
        assert resp.status_code == 200
        content = resp.json()["content"]
        assert content.count("前序遍历的顺序是根左右") == 1
        assert "核心知识点摘要" in content
