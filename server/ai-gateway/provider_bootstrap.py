"""
熵减 AI 网关 — Provider 启动初始化 + 后台健康探活

@ai-context: 从 main.lifespan 提取。按 AI_PROVIDERS 配置逐个实例化 Provider
并存入 app.state.providers 供路由层取用。API Key 无效/缺失时跳过该 Provider
（仅告警），FallbackProvider 始终注册作为最终降级兖底——保证即便所有云端
Key 缺失，网关仍可启动并由 fallback 返回友好错误。
@ai-context: Phase1 新增：初始化熔断器 + Key 池 + 后台健康探活任务。
探活每 30s 对各 Provider 发送最小请求，更新熔断器和指标。
"""

import asyncio
import logging

from fastapi import FastAPI

from config import AI_PROVIDERS, is_valid_api_key
from config.key_pool import load_key_pools, get_primary_key
from providers.circuit_breaker import init_circuit_breakers, get_circuit

logger = logging.getLogger(__name__)

# 健康探活间隔（秒）
_HEALTH_PROBE_INTERVAL = 30


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

    # ── 加载多 Key 池（突破单 Key RPM 限制） ──
    load_key_pools()

    qwen_cfg = AI_PROVIDERS.get("qwen", {})
    qwen_key = get_primary_key("qwen") or qwen_cfg.get("api_key", "")
    if is_valid_api_key(qwen_key):
        app.state.providers["qwen"] = QwenProvider(
            base_url=qwen_cfg["base_url"],
            api_key=qwen_key,
        )
        logger.info("Provider [qwen]: 已初始化")
    else:
        logger.warning("Provider [qwen]: API Key 未配置，跳过初始化")

    deepseek_cfg = AI_PROVIDERS.get("deepseek", {})
    deepseek_key = get_primary_key("deepseek") or deepseek_cfg.get("api_key", "")
    if is_valid_api_key(deepseek_key):
        app.state.providers["deepseek"] = DeepSeekProvider(
            base_url=deepseek_cfg["base_url"],
            api_key=deepseek_key,
        )
        logger.info("Provider [deepseek]: 已初始化")
    else:
        logger.warning("Provider [deepseek]: API Key 未配置，跳过初始化")

    glm_cfg = AI_PROVIDERS.get("glm", {})
    glm_key = get_primary_key("glm") or glm_cfg.get("api_key", "")
    if is_valid_api_key(glm_key):
        app.state.providers["glm"] = GLMProvider(
            base_url=glm_cfg["base_url"],
            api_key=glm_key,
        )
        logger.info("Provider [glm]: 已初始化")
    else:
        logger.warning("Provider [glm]: API Key 未配置，跳过初始化")

    # Gemini: google-genai SDK，仅需 api_key
    gemini_cfg = AI_PROVIDERS.get("gemini", {})
    gemini_key = get_primary_key("gemini") or gemini_cfg.get("api_key", "")
    if is_valid_api_key(gemini_key):
        app.state.providers["gemini"] = GeminiProvider(
            api_key=gemini_key,
        )
        logger.info("Provider [gemini]: 已初始化")
    else:
        logger.warning("Provider [gemini]: API Key 未配置，跳过初始化")

    # FallbackProvider 始终可用
    app.state.providers["fallback"] = FallbackProvider()
    logger.info("Provider [fallback]: 已初始化（降级兖底）")

    for name, cfg in AI_PROVIDERS.items():
        has_key = is_valid_api_key(cfg.get("api_key", ""))
        status = "已配置" if has_key else "未配置（API Key 缺失或为占位符）"
        logger.info("Provider [%s]: %s", name, status)

    # ── 初始化熔断器 ──
    provider_names = [k for k in app.state.providers.keys() if k != "fallback"]
    init_circuit_breakers(provider_names, failure_threshold=5, recovery_timeout=60.0)


def start_health_probe(app: FastAPI) -> asyncio.Task:
    """启动后台健康探活任务

    每 30s 对各 Provider 发送最小请求（"ping", max_tokens=5），
    更新熔断器状态和 Prometheus 指标。
    """

    async def _probe_loop():
        # 启动后等待 10s 再开始探活（避免与初始化竞争）
        await asyncio.sleep(10)
        logger.info("健康探活任务已启动（间隔 %ds）", _HEALTH_PROBE_INTERVAL)

        while True:
            providers = getattr(app.state, "providers", {})
            for name, provider in providers.items():
                if name == "fallback":
                    continue
                try:
                    result = await provider.health_check()
                    healthy = result.get("status") == "healthy"

                    # 更新指标
                    try:
                        from observability.metrics import set_provider_health
                        set_provider_health(name, healthy)
                    except ImportError:
                        pass

                    # 更新熔断器
                    cb = get_circuit(name)
                    if cb:
                        if healthy:
                            await cb.on_success()
                        else:
                            await cb.on_failure()

                    if not healthy:
                        logger.warning(
                            "Provider [%s] 探活失败: %s",
                            name, result.get("error", "unknown"),
                        )
                except Exception as e:
                    logger.warning("Provider [%s] 探活异常: %s", name, str(e))
                    cb = get_circuit(name)
                    if cb:
                        await cb.on_failure()

            await asyncio.sleep(_HEALTH_PROBE_INTERVAL)

    return asyncio.create_task(_probe_loop())
