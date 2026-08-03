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
from config.providers import AI_PROVIDERS, MODEL_ROUTING
from config.limits import TIMEOUT_CONFIG

# 流式降级首 token 探测超时（秒）：生成器惰性求值，需等首 token 才能
# 发现执行期错误（如 429）。与 routers/streaming.py 的首 token 超时保持一致。
_FIRST_TOKEN_PROBE_TIMEOUT = 30.0

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
    "progress_narrative": ["glm", "deepseek", "fallback"], # A3 微进展叙述：短文本生成，GLM 优先
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
    # F4: 黄金错误模式分析（Qwen 为主，GLM 备选）
    "error_pattern": ["qwen", "glm", "fallback"],
    # N1: 课程级迷你测试生成（Qwen 为主，GLM 备选）
    "quiz_gen": ["qwen", "glm", "fallback"],
    # N5: 内容分层（Qwen 为主，GLM 备选）
    "content_tier": ["qwen", "glm", "fallback"],
    # N6: 概念冲突检测（Qwen 为主，GLM 备选）
    "conflict_detect": ["qwen", "glm", "fallback"],
    # E1: 概念预检（Qwen 为主，GLM 备选）
    "concept_precheck": ["qwen", "glm", "fallback"],
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
    使用 Provider fallback 链执行 AI 调用（非流式路径）。

    依次尝试 PROVIDER_FALLBACK_CHAIN 中为该 feature 配置的 Provider 列表，
    每个 Provider 最多重试 2 次（由 @with_retry_and_timeout 装饰器控制）。
    熔断器联动：跳过已熔断的 Provider，调用成功/失败后通知熔断器更新状态。
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
    # 导入熔断器模块：is_provider_available 检查 Provider 是否被熔断，
    # get_circuit 获取熔断器实例以调用 on_success/on_failure 回调
    from providers.circuit_breaker import is_provider_available, get_circuit

    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
    budget = TIMEOUT_CONFIG.get(feature, 30) * 1.5

    async def _run_fallback_chain():
        start_time = asyncio.get_event_loop().time()
        for provider_key in chain:
            # ---- 熔断器检查：跳过已熔断的 Provider，避免无效请求耗时 ----
            if not is_provider_available(provider_key):
                logger.debug(
                    "Provider [%s] 已熔断，跳过 (non-stream feature=%s)",
                    provider_key, feature,
                )
                continue

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
                # 调用成功：通知熔断器重置失败计数，恢复 Provider 健康状态
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_success()
                return result, provider_key
            except Exception as e:
                logger.warning(
                    "Provider [%s] failed for feature=%s: %s, trying next...",
                    provider_key, feature, str(e),
                )
                # 调用失败：通知熔断器累加失败计数，连续失败达到阈值后自动熔断
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_failure()
            finally:
                _FEATURE_CONTEXT.set("")

        # 所有 Provider 都失败（含被熔断跳过的）
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
    fallback 链执行（保持历史 3 元组签名以兼容既有路由调用点）。

    用户自带 Key（BYOK）能力已移除，统一走服务端 fallback 链。
    第三个返回值 is_user_key 恒为 False（死值，保留仅为避免改动约 15 个路由）。

    Args:
        app:     FastAPI 应用实例
        feature: 功能标识
        request: FastAPI Request 对象（保留参数以兼容签名，不再使用）
        fn:      异步可调用对象，签名为 async fn(provider, model_name) -> dict

    Returns:
        tuple: (result_dict, provider_key, is_user_key=False)

    Raises:
        RuntimeError: 所有 Provider 均不可用
    """
    result, provider_key = await call_with_fallback(app, feature, fn)
    return result, provider_key, False


async def call_with_fallback_stream(
    app,
    feature: str,
    request,
    fn: Callable[..., AsyncGenerator[str, None]],
) -> tuple[AsyncGenerator[str, None], str, bool]:
    """
    流式 fallback 链执行（保持历史 3 元组签名以兼容既有路由调用点）。

    用户自带 Key（BYOK）能力已移除，统一走服务端 fallback 链。
    第三个返回值 is_user_key 恒为 False。fn 返回 AsyncGenerator[str, None]。
    Phase1 加固：总预算超时保护 + 熔断器联动 + 首 token 探测降级。

    Args:
        app:     FastAPI 应用实例
        feature: 功能标识
        request: FastAPI Request 对象（保留参数以兼容签名，不再使用）
        fn:      异步生成器函数，签名为 async fn(provider, model_name) -> AsyncGenerator[str, None]

    Returns:
        tuple: (generator, provider_key, is_user_key=False)
    """
    from providers.circuit_breaker import is_provider_available, get_circuit

    budget = TIMEOUT_CONFIG.get(feature, 30) * 1.5
    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])

    async def _run_stream_fallback_chain():
        """内部协程：遍历 fallback 链尝试获取可用的流式生成器。

        将循环逻辑封装为独立协程，以便外层用 asyncio.wait_for 施加
        总预算超时兜底，防止所有 Provider 异常时预算耗尽仍不退出。
        """
        start_time = asyncio.get_event_loop().time()

        for provider_key in chain:
            # 熔断器检查：跳过已熔断的 Provider
            if not is_provider_available(provider_key):
                logger.debug("Provider [%s] 已熔断，跳过 (stream feature=%s)", provider_key, feature)
                continue

            # 剩余预算检查
            elapsed = asyncio.get_event_loop().time() - start_time
            remaining = budget - elapsed
            if remaining <= 0:
                logger.error("流式 fallback 预算耗尽: feature=%s, elapsed=%.1fs", feature, elapsed)
                break

            provider = app.state.providers.get(provider_key)
            if not provider:
                continue
            model_name = _resolve_model_name(provider_key, feature)
            try:
                _FEATURE_CONTEXT.set(feature)
                gen = fn(provider, model_name)
                # 首 token 探测：生成器是惰性求值，真正的 provider 调用（及 429
                # 等执行期错误）发生在首次迭代时，仅创建生成器的 try/except 捕获
                # 不到。此处等首 token，成功才认定该 provider 可用，否则捕获
                # 执行期错误并降级到下一个 provider（修复 429 不切换模型的问题）。
                agen = gen.__aiter__()
                probe_timeout = min(_FIRST_TOKEN_PROBE_TIMEOUT, remaining)
                first_chunk = await asyncio.wait_for(agen.__anext__(), timeout=probe_timeout)

                # 首 token 成功：包装生成器，先吐首 token 再吐剩余
                async def _wrapped_gen(a=agen, first=first_chunk):
                    yield first
                    async for c in a:
                        yield c

                # 通知熔断器成功
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_success()
                return _wrapped_gen(), provider_key, False
            except StopAsyncIteration:
                # 生成器为空（provider 正常但无输出）：返回空流，视为成功
                async def _empty_gen():
                    if False:
                        yield  # 使其成为异步生成器函数
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_success()
                return _empty_gen(), provider_key, False
            except Exception as e:
                logger.warning(
                    "Provider [%s] stream failed (首token探测) for feature=%s: %s, trying next...",
                    provider_key, feature, str(e),
                )
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_failure()
            finally:
                _FEATURE_CONTEXT.set("")

        raise RuntimeError("所有 AI 服务暂时不可用")

    # 外层超时兜底：防止所有 Provider 异常时预算耗尽仍不退出
    # 与非流式 call_with_fallback 保持一致，用 asyncio.wait_for 包裹整条链
    try:
        return await asyncio.wait_for(_run_stream_fallback_chain(), timeout=budget)
    except asyncio.TimeoutError:
        logger.error(
            "流式 AI 服务超时（预算 %.1fs 已耗尽）: feature=%s", budget, feature,
        )
        raise RuntimeError(f"流式 AI 服务超时（预算 {budget}s 已耗尽）")
