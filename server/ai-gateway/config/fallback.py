"""
熵减 AI 网关 — Provider Fallback 链与调用编排

@ai-context: 主 Provider 失败时按 PROVIDER_FALLBACK_CHAIN 依次降级。整条链
共享 TIMEOUT_CONFIG*1.5 的总预算，每次切换前扣除已耗时，避免叠加超时。
call_with_fallback（dict）/ call_with_fallback_stream（AsyncGenerator）各有
带用户 Key 的变体：用户 Key 优先，失败再降级服务端链。_resolve_model_name
在 fallback 到备选 Provider 时按 主slot→功能slot→通用slot→首个模型 逐级回退。
"""

import asyncio
from typing import Any, Callable, Awaitable, AsyncGenerator

from config.runtime import logger, _FEATURE_CONTEXT
from config.providers import AI_PROVIDERS, MODEL_ROUTING, get_provider_for_request
from config.limits import TIMEOUT_CONFIG

# ============================================================
# Provider Fallback 链：主 Provider 失败时依次尝试的备选
# ============================================================

PROVIDER_FALLBACK_CHAIN: dict[str, list[str]] = {
    "summarize":      ["glm", "qwen", "fallback"],        # GLM（免费）优先，Qwen 备选
    "generate_cards": ["glm", "qwen", "fallback"],        # GLM（免费）优先，Qwen 备选
    "evaluate":       ["glm", "deepseek", "fallback"],    # GLM（免费）优先，DeepSeek 备选
    "recommend":      ["glm", "deepseek", "fallback"],    # GLM（免费）优先，DeepSeek 备选
    "vision_extract": ["qwen", "glm"],                   # Qwen-VL-Max（百炼）优先，GLM-4V 备选
    "transcribe":     ["qwen", "glm", "fallback"],       # Qwen3-ASR-Flash 优先，GLM-ASR 备选
    "tag_content":    ["glm", "deepseek", "fallback"],    # GLM（免费）优先，DeepSeek 备选
    "optimize_card":  ["glm", "qwen", "fallback"],       # GLM（免费）优先，Qwen 备选
    "feynman_question": ["deepseek", "glm", "fallback"], # DeepSeek 为主，GLM 备选
    "feynman_evaluate": ["deepseek", "glm", "fallback"], # DeepSeek 为主，GLM 备选
    "sort_inspiration": ["glm", "deepseek", "fallback"], # GLM（免费）优先，DeepSeek 备选
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point":       ["qwen", "glm", "fallback"],   # Qwen 为主，GLM 备选
    "socratic":           ["qwen", "deepseek", "fallback"], # Qwen 为主，DeepSeek 备选
    "predict":            ["qwen", "glm", "fallback"],   # Qwen 为主，GLM 备选
    "rescue":             ["qwen", "deepseek", "fallback"], # Qwen 为主，DeepSeek 备选
    "inspiration_draft":  ["qwen", "glm", "fallback"],   # Qwen 为主，GLM 备选
    "ritual_recall":      ["glm", "deepseek", "fallback"], # v0.26.0 B1.2：GLM（免费快速）优先
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": ["qwen", "deepseek", "fallback"],
    "socratic_evaluate":   ["qwen", "deepseek", "fallback"],
    "socratic_deepening":  ["qwen", "deepseek", "fallback"],
    # Path B: 多模态课堂分析（Qwen-VL 优先，GLM-4V 备选）
    "multimodal_analyze": ["qwen", "glm"],
    # Path C: 视频分析（Gemini 原生视频优先，Qwen-VL 抽帧降级）
    "video_analyze": ["gemini", "qwen"],
    # 学伴对话（Qwen 为主，DeepSeek 备选）
    "chat": ["qwen", "deepseek", "fallback"],
}


def _resolve_model_name(provider_key: str, feature: str) -> str:
    """
    根据当前 Provider 和功能选择最合理的模型名。

    优先使用 MODEL_ROUTING 中为该功能指定的 slot；当 fallback 到其它 Provider 时，
    先尝试功能对应的 slot，再回退到通用 slot（free/vision/asr），最后使用 Provider 的第一个模型。
    """
    provider_cfg = AI_PROVIDERS.get(provider_key, {})
    models = provider_cfg.get("models", {})
    routing = MODEL_ROUTING.get(feature)

    # 1. 当前 Provider 是主路由 Provider 时，使用主 slot
    if routing and routing[0] == provider_key and routing[1] in models:
        return models[routing[1]]

    # 2. 功能到通用 slot 的映射
    feature_slot = routing[1] if routing else None
    if feature_slot and feature_slot in models:
        return models[feature_slot]

    # 3. 通用兜底 slot
    for slot in ("free", "vision", "asr"):
        if slot in models:
            return models[slot]

    # 4. 最后使用 Provider 声明的第一个模型
    if models:
        return next(iter(models.values()))
    return "fallback"


async def call_with_fallback(
    app,
    feature: str,
    fn: Callable[..., Awaitable[dict[str, Any]]],
) -> tuple[dict[str, Any], str]:
    """
    使用 Provider fallback 链执行 AI 调用。

    依次尝试 PROVIDER_FALLBACK_CHAIN 中为该 feature 配置的 Provider 列表，
    每个 Provider 最多重试 2 次（由 @with_retry_and_timeout 装饰器控制）。
    所有 Provider 均失败时抛出 RuntimeError(503)。

    Args:
        app:     FastAPI 应用实例（通过 app.state.providers 获取 Provider）
        feature: 功能标识，对应 PROVIDER_FALLBACK_CHAIN 的 key
        fn:      异步可调用对象，签名为 async fn(provider, model_name) -> dict

    Returns:
        tuple: (result_dict, provider_key)

    Raises:
        RuntimeError: 所有 Provider 均不可用（status_code=503）
    """
    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
    budget = TIMEOUT_CONFIG.get(feature, 30) * 1.5

    async def _run_fallback_chain():
        start_time = asyncio.get_event_loop().time()
        for provider_key in chain:
            provider = app.state.providers.get(provider_key)
            if not provider:
                logger.warning("Provider [%s] 未初始化，跳过", provider_key)
                continue

            model_name = _resolve_model_name(provider_key, feature)

            # 计算剩余超时预算
            elapsed = asyncio.get_event_loop().time() - start_time
            remaining = budget - elapsed
            logger.debug(
                "Provider [%s] 开始调用: feature=%s, 已用=%.1fs, 剩余预算=%.1fs",
                provider_key, feature, elapsed, remaining,
            )

            try:
                _FEATURE_CONTEXT.set(feature)
                result = await fn(provider, model_name)
                return result, provider_key
            except Exception as e:
                logger.warning(
                    "Provider [%s] failed for feature=%s: %s, trying next...",
                    provider_key, feature, str(e),
                )
            finally:
                _FEATURE_CONTEXT.set("")

        # 所有 Provider 都失败
        raise RuntimeError("所有 AI 服务暂时不可用")

    try:
        return await asyncio.wait_for(_run_fallback_chain(), timeout=budget)
    except asyncio.TimeoutError:
        logger.error(
            "AI 服务超时（预算 %.1fs 已耗尽）: feature=%s", budget, feature,
        )
        raise RuntimeError(f"AI 服务超时（预算 {budget}s 已耗尽）")


async def call_with_fallback_for_request(
    app,
    feature: str,
    request,
    fn: Callable[..., Awaitable[dict[str, Any]]],
) -> tuple[dict[str, Any], str, bool]:
    """
    支持用户 Key 的 fallback 链执行。

    如果请求中携带用户 API Key，优先使用用户 Key 创建的 Provider 执行。
    用户 Key 失败时降级到服务端 fallback 链（GLM → fallback）。
    无用户 Key 时直接走 call_with_fallback。

    Args:
        app:     FastAPI 应用实例
        feature: 功能标识
        request: FastAPI Request 对象
        fn:      异步可调用对象，签名为 async fn(provider, model_name) -> dict

    Returns:
        tuple: (result_dict, provider_key, is_user_key)

    Raises:
        RuntimeError: 所有 Provider 均不可用
    """
    user_api_key = getattr(request.state, "user_api_key", None)

    if not user_api_key:
        # 无用户 Key，直接走服务端 fallback 链
        result, provider_key = await call_with_fallback(app, feature, fn)
        return result, provider_key, False

    # 有用户 Key，先尝试用用户 Key 的 Provider
    provider, model_name, is_user_key = get_provider_for_request(app, feature, request)

    if is_user_key:
        try:
            _FEATURE_CONTEXT.set(feature)
            result = await fn(provider, model_name)
            # 从 MODEL_ROUTING 获取 provider_key 用于日志
            provider_key = MODEL_ROUTING.get(feature, ("unknown", ""))[0]
            logger.info(
                "用户 Key 调用成功: feature=%s, provider=%s",
                feature, provider_key,
            )
            return result, provider_key, True
        except Exception as e:
            logger.warning(
                "用户 Key 调用失败，降级到服务端 fallback: feature=%s, error=%s",
                feature, str(e),
            )
        finally:
            _FEATURE_CONTEXT.set("")

    # 用户 Key 失败，降级到服务端 fallback 链
    result, provider_key = await call_with_fallback(app, feature, fn)
    return result, provider_key, False


async def call_with_fallback_stream(
    app,
    feature: str,
    request,
    fn: Callable[..., AsyncGenerator[str, None]],
) -> tuple[AsyncGenerator[str, None], str, bool]:
    """
    流式版本的 call_with_fallback_for_request。

    与 call_with_fallback_for_request 相同的 fallback 链逻辑，
    但 fn 返回 AsyncGenerator[str, None] 而非 dict。
    Phase1 加固：添加总预算超时保护（与非流式一致）+ 熔断器联动。

    Args:
        app:     FastAPI 应用实例
        feature: 功能标识
        request: FastAPI Request 对象
        fn:      异步生成器函数，签名为 async fn(provider, model_name) -> AsyncGenerator[str, None]

    Returns:
        tuple: (generator, provider_key, is_user_key)
    """
    from providers.circuit_breaker import is_provider_available, get_circuit

    budget = TIMEOUT_CONFIG.get(feature, 30) * 1.5
    user_api_key = getattr(request.state, "user_api_key", None)

    if not user_api_key:
        # 无用户 Key，走服务端 fallback 链（带总预算超时）
        chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
        start_time = asyncio.get_event_loop().time()

        for provider_key in chain:
            # 熔断器检查：跳过已熔断的 Provider
            if not is_provider_available(provider_key):
                logger.debug("Provider [%s] 已熔断，跳过 (stream feature=%s)", provider_key, feature)
                continue

            # 剩余预算检查
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= budget:
                logger.error("流式 fallback 预算耗尽: feature=%s, elapsed=%.1fs", feature, elapsed)
                break

            provider = app.state.providers.get(provider_key)
            if not provider:
                continue
            model_name = _resolve_model_name(provider_key, feature)
            try:
                _FEATURE_CONTEXT.set(feature)
                gen = fn(provider, model_name)
                # 通知熔断器成功
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_success()
                return gen, provider_key, False
            except Exception as e:
                logger.warning(
                    "Provider [%s] stream failed for feature=%s: %s, trying next...",
                    provider_key, feature, str(e),
                )
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_failure()
            finally:
                _FEATURE_CONTEXT.set("")

        raise RuntimeError("所有 AI 服务暂时不可用")

    # 有用户 Key，先尝试用户 Key 的 Provider
    provider, model_name, is_user_key = get_provider_for_request(app, feature, request)
    if is_user_key:
        try:
            _FEATURE_CONTEXT.set(feature)
            gen = fn(provider, model_name)
            provider_key = MODEL_ROUTING.get(feature, ("unknown", ""))[0]
            return gen, provider_key, True
        except Exception as e:
            logger.warning(
                "用户 Key 流式调用失败，降级到服务端 fallback: feature=%s, error=%s",
                feature, str(e),
            )
        finally:
            _FEATURE_CONTEXT.set("")

    # 降级到服务端 fallback 链（带总预算超时）
    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
    start_time = asyncio.get_event_loop().time()

    for provider_key in chain:
        if not is_provider_available(provider_key):
            continue

        elapsed = asyncio.get_event_loop().time() - start_time
        if elapsed >= budget:
            break

        provider = app.state.providers.get(provider_key)
        if not provider:
            continue
        model_name = _resolve_model_name(provider_key, feature)
        try:
            _FEATURE_CONTEXT.set(feature)
            gen = fn(provider, model_name)
            cb = get_circuit(provider_key)
            if cb:
                await cb.on_success()
            return gen, provider_key, False
        except Exception as e:
            logger.warning(
                "Provider [%s] stream failed for feature=%s: %s, trying next...",
                provider_key, feature, str(e),
            )
            cb = get_circuit(provider_key)
            if cb:
                await cb.on_failure()
        finally:
            _FEATURE_CONTEXT.set("")

    raise RuntimeError("所有 AI 服务暂时不可用")
