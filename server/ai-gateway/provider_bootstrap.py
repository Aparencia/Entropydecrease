"""
熵减 AI 网关 — Provider 启动初始化

@ai-context: 从 main.lifespan 提取。按 AI_PROVIDERS 配置逐个实例化 Provider
并存入 app.state.providers 供路由层取用。API Key 无效/缺失时跳过该 Provider
（仅告警），FallbackProvider 始终注册作为最终降级兜底——保证即便所有云端
Key 缺失，网关仍可启动并由 fallback 返回友好错误。
"""

import logging

from fastapi import FastAPI

from config import AI_PROVIDERS, is_valid_api_key

logger = logging.getLogger(__name__)


def init_providers(app: FastAPI) -> None:
    """初始化各 Provider 并写入 app.state.providers

    Provider 类采用延迟导入（函数内 import），避免在仅导入 main 时
    就强制加载 google-genai/openai 等重依赖，与原始 lifespan 设计一致。
    """
    from providers.qwen_provider import QwenProvider
    from providers.deepseek_provider import DeepSeekProvider
    from providers.glm_provider import GLMProvider
    from providers.gemini_provider import GeminiProvider
    from providers.fallback_provider import FallbackProvider

    app.state.providers = {}

    qwen_cfg = AI_PROVIDERS.get("qwen", {})
    if is_valid_api_key(qwen_cfg.get("api_key", "")):
        app.state.providers["qwen"] = QwenProvider(
            base_url=qwen_cfg["base_url"],
            api_key=qwen_cfg["api_key"],
        )
        logger.info("Provider [qwen]: 已初始化")
    else:
        logger.warning("Provider [qwen]: API Key 未配置，跳过初始化")

    deepseek_cfg = AI_PROVIDERS.get("deepseek", {})
    if is_valid_api_key(deepseek_cfg.get("api_key", "")):
        app.state.providers["deepseek"] = DeepSeekProvider(
            base_url=deepseek_cfg["base_url"],
            api_key=deepseek_cfg["api_key"],
        )
        logger.info("Provider [deepseek]: 已初始化")
    else:
        logger.warning("Provider [deepseek]: API Key 未配置，跳过初始化")

    glm_cfg = AI_PROVIDERS.get("glm", {})
    if is_valid_api_key(glm_cfg.get("api_key", "")):
        app.state.providers["glm"] = GLMProvider(
            base_url=glm_cfg["base_url"],
            api_key=glm_cfg["api_key"],
        )
        logger.info("Provider [glm]: 已初始化")
    else:
        logger.warning("Provider [glm]: API Key 未配置，跳过初始化")

    # Gemini: google-genai SDK，仅需 api_key
    gemini_cfg = AI_PROVIDERS.get("gemini", {})
    if is_valid_api_key(gemini_cfg.get("api_key", "")):
        app.state.providers["gemini"] = GeminiProvider(
            api_key=gemini_cfg["api_key"],
        )
        logger.info("Provider [gemini]: 已初始化")
    else:
        logger.warning("Provider [gemini]: API Key 未配置，跳过初始化")

    # FallbackProvider 始终可用
    app.state.providers["fallback"] = FallbackProvider()
    logger.info("Provider [fallback]: 已初始化（降级兜底）")

    for name, cfg in AI_PROVIDERS.items():
        has_key = is_valid_api_key(cfg.get("api_key", ""))
        status = "已配置" if has_key else "未配置（API Key 缺失或为占位符）"
        logger.info("Provider [%s]: %s", name, status)
