"""
测试配置加载

覆盖：
- MODEL_ROUTING 表完整性（4 个 feature 都有映射）
- TIMEOUT_CONFIG 覆盖所有 feature
- PROVIDER_FALLBACK_CHAIN 包含 fallback Provider
- get_provider_for_feature() 返回正确的 Provider 名称和模型槽位
- _resolve_model_name() 在 fallback 链中正确选择模型名
"""

import os
import sys
from pathlib import Path

import pytest

# 确保 ai-gateway 根目录在 sys.path 中
GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from config import (
    AI_PROVIDERS,
    MODEL_ROUTING,
    TIMEOUT_CONFIG,
    PROVIDER_FALLBACK_CHAIN,
    APP_CONFIG,
    is_valid_api_key,
    get_provider_for_feature,
    _resolve_model_name,
    call_with_fallback,
)

# 所有功能标识
ALL_FEATURES = ["summarize", "generate_cards", "evaluate", "recommend"]


# ────────────────────────────────────────────────────────────
# MODEL_ROUTING 完整性
# ────────────────────────────────────────────────────────────


class TestModelRouting:
    """MODEL_ROUTING 表完整性测试"""

    def test_all_features_present(self):
        """4 个 feature 都有映射"""
        for feature in ALL_FEATURES:
            assert feature in MODEL_ROUTING, f"feature '{feature}' 缺少 MODEL_ROUTING 映射"

    def test_mapping_format_is_tuple(self):
        """每条映射都是 (provider_key, model_slot) 二元组"""
        for feature, mapping in MODEL_ROUTING.items():
            assert isinstance(mapping, tuple), f"{feature} 映射应为 tuple"
            assert len(mapping) == 2, f"{feature} 映射应有 2 个元素"

    def test_provider_keys_valid(self):
        """映射中的 provider_key 在 AI_PROVIDERS 中存在"""
        for feature, (provider_key, _) in MODEL_ROUTING.items():
            assert provider_key in AI_PROVIDERS, (
                f"feature '{feature}' 的 provider '{provider_key}' 不在 AI_PROVIDERS 中"
            )

    def test_model_slots_valid(self):
        """映射中的 model_slot 在对应 Provider 的 models 中存在"""
        for feature, (provider_key, model_slot) in MODEL_ROUTING.items():
            models = AI_PROVIDERS.get(provider_key, {}).get("models", {})
            assert model_slot in models, (
                f"feature '{feature}' 的 model_slot '{model_slot}' "
                f"不在 provider '{provider_key}' 的 models 中"
            )


# ────────────────────────────────────────────────────────────
# TIMEOUT_CONFIG 覆盖
# ────────────────────────────────────────────────────────────


class TestTimeoutConfig:
    """TIMEOUT_CONFIG 覆盖所有 feature"""

    def test_all_features_covered(self):
        for feature in ALL_FEATURES:
            assert feature in TIMEOUT_CONFIG, f"feature '{feature}' 缺少 TIMEOUT_CONFIG"

    def test_timeout_values_positive(self):
        for feature, timeout in TIMEOUT_CONFIG.items():
            assert isinstance(timeout, int), f"{feature} 超时应为 int"
            assert timeout > 0, f"{feature} 超时应大于 0"


# ────────────────────────────────────────────────────────────
# PROVIDER_FALLBACK_CHAIN
# ────────────────────────────────────────────────────────────


class TestProviderFallbackChain:
    """PROVIDER_FALLBACK_CHAIN 包含 fallback Provider"""

    def test_all_features_covered(self):
        for feature in ALL_FEATURES:
            assert feature in PROVIDER_FALLBACK_CHAIN, (
                f"feature '{feature}' 缺少 PROVIDER_FALLBACK_CHAIN"
            )

    def test_chain_ends_with_fallback(self):
        """核心 feature 的 chain 最后一个必须是 'fallback'"""
        for feature, chain in PROVIDER_FALLBACK_CHAIN.items():
            # 视觉/多模态/视频链路当前未接入 FallbackProvider，允许不以 fallback 结尾
            if feature in ("vision_extract", "multimodal_analyze", "video_analyze", "transcribe"):
                continue
            assert chain[-1] == "fallback", (
                f"feature '{feature}' 的 fallback chain 末尾必须是 'fallback'"
            )

    def test_chain_not_empty(self):
        for feature, chain in PROVIDER_FALLBACK_CHAIN.items():
            assert len(chain) >= 2, (
                f"feature '{feature}' 的 fallback chain 至少包含主 Provider 和 fallback"
            )

    def test_primary_provider_matches_routing(self):
        """chain 的第一个 Provider 应与 MODEL_ROUTING 的主 Provider 一致"""
        for feature, chain in PROVIDER_FALLBACK_CHAIN.items():
            routing_provider = MODEL_ROUTING[feature][0]
            assert chain[0] == routing_provider, (
                f"feature '{feature}' fallback chain 主 Provider "
                f"应为 '{routing_provider}'，实际为 '{chain[0]}'"
            )


# ────────────────────────────────────────────────────────────
# _resolve_model_name
# ────────────────────────────────────────────────────────────


class TestResolveModelName:
    """_resolve_model_name 应为主 Provider 选择指定 slot，并为 fallback Provider 选择可用模型"""

    def test_primary_provider_uses_routing_slot(self):
        """主 Provider 使用 MODEL_ROUTING 指定的 slot"""
        assert _resolve_model_name("glm", "summarize") == "glm-4.6v-flash"
        assert _resolve_model_name("deepseek", "evaluate") == "deepseek-chat"
        assert _resolve_model_name("qwen", "transcribe") == "qwen3-asr-flash"

    def test_fallback_provider_uses_feature_or_free_slot(self):
        """fallback 到非主 Provider 时，优先使用功能 slot，否则使用 free slot"""
        # summarize 主 Provider 是 glm；fallback 到 qwen 时，qwen 没有 summary slot，应使用 free
        assert _resolve_model_name("qwen", "summarize") == "qwen-plus"
        # evaluate 主 Provider 是 deepseek；fallback 到 glm 时应使用 free
        assert _resolve_model_name("glm", "evaluate") == "glm-4.6v-flash"

    def test_unknown_feature_uses_free_slot(self):
        """未知 feature 使用 Provider 的 free slot 或第一个可用模型"""
        assert _resolve_model_name("glm", "unknown_feature") == "glm-4.6v-flash"
        assert _resolve_model_name("qwen", "unknown_feature") == "qwen-plus"


# ────────────────────────────────────────────────────────────
# call_with_fallback 上下文透传
# ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_call_with_fallback_sets_feature_context():
    """call_with_fallback 应把当前 feature 写入上下文变量，供 with_retry_and_timeout 读取"""
    from unittest.mock import MagicMock

    class FakeProvider:
        provider_name = "fake"
        captured_feature = None

        async def generate(self, *args, **kwargs):
            from config import _FEATURE_CONTEXT
            FakeProvider.captured_feature = _FEATURE_CONTEXT.get("")
            return {"content": "ok"}

    app = MagicMock()
    # 使用一个不存在于 PROVIDER_FALLBACK_CHAIN 的 feature，使其默认走 fallback
    app.state.providers = {"fallback": FakeProvider()}

    async def fn(provider, model_name):
        return await provider.generate()

    await call_with_fallback(app, "__test_feature__", fn)
    assert FakeProvider.captured_feature == "__test_feature__"


# ────────────────────────────────────────────────────────────
# get_provider_for_feature()
# ────────────────────────────────────────────────────────────


class TestGetProviderForFeature:
    """get_provider_for_feature() 返回正确的 Provider 实例和模型名"""

    def _make_app(self, providers_dict):
        """构建一个携带 providers 的 mock app"""
        from unittest.mock import MagicMock

        app = MagicMock()
        app.state.providers = providers_dict
        return app

    def test_returns_correct_provider_for_known_feature(self):
        """已知 feature 返回正确的 provider 实例和模型名"""
        from unittest.mock import MagicMock
        mock_provider = MagicMock()
        mock_provider.api_key = "valid-key"
        app = self._make_app({"glm": mock_provider})

        provider, model_name = get_provider_for_feature(app, "summarize")
        assert provider is mock_provider
        # summarize → glm.free → glm-4.6v-flash
        assert model_name == "glm-4.6v-flash"

    def test_fallback_when_provider_not_initialized(self):
        """目标 Provider 未初始化时回退到 fallback"""
        from unittest.mock import MagicMock
        fallback_provider = MagicMock()
        fallback_provider.api_key = "valid-key"
        app = self._make_app({"fallback": fallback_provider})  # glm 未配置

        provider, model_name = get_provider_for_feature(app, "summarize")
        assert provider is fallback_provider

    def test_unknown_feature_uses_fallback(self):
        """未知 feature 使用 fallback 路由"""
        from unittest.mock import MagicMock
        fallback_provider = MagicMock()
        fallback_provider.api_key = "valid-key"
        app = self._make_app({"fallback": fallback_provider})

        provider, model_name = get_provider_for_feature(app, "nonexistent_feature")
        assert provider is fallback_provider

    def test_evaluate_returns_glm_model(self):
        """evaluate feature 默认返回 glm-4.6v-flash（MODEL_ROUTING 主 Provider 为 glm）"""
        from unittest.mock import MagicMock
        mock_provider = MagicMock()
        mock_provider.api_key = "valid-key"
        app = self._make_app({"glm": mock_provider})

        provider, model_name = get_provider_for_feature(app, "evaluate")
        assert provider is mock_provider
        assert model_name == "glm-4.6v-flash"


# ────────────────────────────────────────────────────────────
# APP_CONFIG / is_valid_api_key 断言
# ────────────────────────────────────────────────────────────


class TestConfigAssertions:
    """配置值精确断言（JWT 算法、API Key 校验、超时配置、Fallback 链尾）"""

    def test_jwt_algorithm_defaults_to_auto(self):
        """APP_CONFIG jwt_algorithm 默认空串=自动适配模式（GW-2#1 延伸：不猜默认
        算法，按 token 实际 alg 选择密钥材料，消除 HS256/ES256 配置错位导致的
        全站 401）。显式配置 SUPABASE_JWT_ALGORITHM 时使用配置值。"""
        expected = os.getenv("SUPABASE_JWT_ALGORITHM", "").strip().upper()
        assert APP_CONFIG["jwt_algorithm"] == expected

    def test_is_valid_api_key_rejects_placeholder(self):
        """占位符 API Key 应被识别为无效"""
        assert is_valid_api_key("your-glm-api-key") is False

    def test_is_valid_api_key_accepts_real_key(self):
        """真实格式 API Key 应被识别为有效"""
        assert is_valid_api_key("79d10cf22fb54941bc14c740af5cc21f.i5VOYkXa8ozicDiC") is True

    def test_is_valid_api_key_rejects_empty(self):
        """空字符串 API Key 应被识别为无效"""
        assert is_valid_api_key("") is False

    def test_summarize_timeout_is_30(self):
        """summarize 超时配置应为 30 秒"""
        assert TIMEOUT_CONFIG["summarize"] == 30

    def test_summarize_fallback_chain_ends_with_fallback(self):
        """summarize 的 fallback 链尾必须为 'fallback'"""
        assert PROVIDER_FALLBACK_CHAIN["summarize"][-1] == "fallback"
