"""
熵减 AI 网关 — 配置包

@ai-context: 原单体 config.py 按职责拆分为 5 个子模块：
runtime（运行时/env/Key 校验）、limits（超时/限流）、providers（Provider 与路由）、
fallback（降级链与调用编排）、app（应用级配置）。
@ai-context: 本 __init__ 按依赖序导入并 re-export 全部公共符号，使既有的
`from config import X` 与 `import config` 用法零改动保持兼容。
"""

# 依赖序：runtime（含 load_dotenv）→ limits → providers → fallback → app
from config.runtime import (  # noqa: F401
    logger,
    _FEATURE_CONTEXT,
    PLACEHOLDER_PREFIXES,
    is_valid_api_key,
)
from config.limits import (  # noqa: F401
    TIMEOUT_CONFIG,
    RATE_LIMITS,
)
from config.providers import (  # noqa: F401
    ALIYUN_ACCESS_KEY_ID,
    ALIYUN_ACCESS_KEY_SECRET,
    AI_PROVIDERS,
    MODEL_ROUTING,
    _TIER_RANK,  # 单源 tier 优先级（rate_limit 等消费方从此导入，避免重复定义）
    get_provider_for_feature,
)
from config.fallback import (  # noqa: F401
    PROVIDER_FALLBACK_CHAIN,
    _resolve_model_name,
    call_with_fallback,
    call_with_fallback_for_request,
    call_with_fallback_stream,
)
from config.app import APP_CONFIG  # noqa: F401

__all__ = [
    "logger",
    "_FEATURE_CONTEXT",
    "PLACEHOLDER_PREFIXES",
    "is_valid_api_key",
    "TIMEOUT_CONFIG",
    "RATE_LIMITS",
    "ALIYUN_ACCESS_KEY_ID",
    "ALIYUN_ACCESS_KEY_SECRET",
    "AI_PROVIDERS",
    "MODEL_ROUTING",
    "_TIER_RANK",
    "get_provider_for_feature",
    "PROVIDER_FALLBACK_CHAIN",
    "_resolve_model_name",
    "call_with_fallback",
    "call_with_fallback_for_request",
    "call_with_fallback_stream",
    "APP_CONFIG",
]
