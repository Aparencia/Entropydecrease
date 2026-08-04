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
from cost.tracker import get_cost_tracker

# 流式降级首 token 探测超时（秒）：生成器惰性求值，需等首 token 才能
# 发现执行期错误（如 429）。与 routers/streaming.py 的首 token 超时保持一致。
_FIRST_TOKEN_PROBE_TIMEOUT = 30.0

_FIRST_TOKEN_RETRY_TIMEOUT = 5.0  # 首 token 探测重试的超时预算（秒）

# 高耗时功能（走独立并发上限 ai_heavy_semaphore）
_HEAVY_CONCURRENCY_FEATURES: frozenset[str] = frozenset(
    {"video_analyze", "multimodal_analyze"}
)


def _get_concurrency_semaphore(app, feature: str):
    """获取并发信号量；未初始化（如测试环境）时返回 None 表示不限流。

    @ai-context: Phase3 并发控制——主信号量限制全部 AI 调用，
    heavy 信号量进一步限制高耗时功能（视频/多模态分析）。
    """
    if feature in _HEAVY_CONCURRENCY_FEATURES:
        return getattr(app.state, "ai_heavy_semaphore", None)
    return getattr(app.state, "ai_semaphore", None)


async def _run_under_semaphore(app, feature: str, coro_factory: Callable[[], Awaitable[Any]]) -> Any:
    """在信号量保护下执行 AI 调用（信号量缺失时直通）。"""
    sem = _get_concurrency_semaphore(app, feature)
    if sem is None:
        return await coro_factory()
    async with sem:
        return await coro_factory()

# ============================================================
# Provider Fallback 链：主 Provider 失败时依次尝试的备选
# ============================================================

PROVIDER_FALLBACK_CHAIN: dict[str, list[str]] = {
    # ============================================================
    # 纯文字 AI 功能 → DeepSeek 为主力，Qwen 付费模型备选
    # 移除 GLM 免费模型（不可商用），确保降级链全程合规
    # ============================================================
    "summarize":           ["deepseek", "qwen", "fallback"],
    "generate_cards":      ["deepseek", "qwen", "fallback"],
    "evaluate":            ["deepseek", "qwen", "fallback"],
    "recommend":           ["deepseek", "qwen", "fallback"],
    "tag_content":         ["deepseek", "qwen", "fallback"],
    "optimize_card":       ["deepseek", "qwen", "fallback"],
    "feynman_question":    ["deepseek", "qwen", "fallback"],
    "feynman_evaluate":    ["deepseek", "qwen", "fallback"],
    "sort_inspiration":    ["deepseek", "qwen", "fallback"],
    "anchor_point":        ["deepseek", "qwen", "fallback"],
    "socratic":            ["deepseek", "qwen", "fallback"],
    "predict":             ["deepseek", "qwen", "fallback"],
    "rescue":              ["deepseek", "qwen", "fallback"],
    "inspiration_draft":   ["deepseek", "qwen", "fallback"],
    "ritual_recall":       ["deepseek", "qwen", "fallback"],
    "progress_narrative":  ["deepseek", "qwen", "fallback"],
    "socratic_brainstorm": ["deepseek", "qwen", "fallback"],
    "socratic_evaluate":   ["deepseek", "qwen", "fallback"],
    "socratic_deepening":  ["deepseek", "qwen", "fallback"],
    "chat":                ["deepseek", "qwen", "fallback"],
    "error_pattern":       ["deepseek", "qwen", "fallback"],
    "quiz_gen":            ["deepseek", "qwen", "fallback"],
    "content_tier":        ["deepseek", "qwen", "fallback"],
    "conflict_detect":     ["deepseek", "qwen", "fallback"],
    "concept_precheck":    ["deepseek", "qwen", "fallback"],
    "import_concept":      ["deepseek", "qwen", "fallback"],
    # ============================================================
    # 多模态 / ASR / 视频 — 移除 GLM 免费模型
    # vision_extract/multimodal_analyze 支持同 provider 不同模型降级
    # （qwen:vision_high 表示降级到 qwen 的 vision_high slot）
    # ============================================================
    "vision_extract":     ["qwen", "qwen:vision_high", "fallback"],
    "transcribe":         ["qwen", "fallback"],
    "multimodal_analyze": ["qwen", "qwen:vision_high", "fallback"],
    "video_analyze":      ["gemini", "qwen", "fallback"],
}


def _resolve_model_name(provider_key: str, feature: str, forced_slot: str | None = None) -> str:
    """
    根据当前 Provider 和功能选择最合理的模型名。

    优先使用 MODEL_ROUTING 中为该功能指定的 slot；当 fallback 到其它 Provider 时，
    先尝试功能对应的 slot，再回退到通用 slot（free/vision/asr），最后使用 Provider 的第一个模型。
    支持 forced_slot：用于同 provider 不同模型降级（如 qwen vision → qwen vision_high）。
    """
    provider_cfg = AI_PROVIDERS.get(provider_key, {})
    models = provider_cfg.get("models", {})
    routing = MODEL_ROUTING.get(feature)

    # 0. 强制 slot：用于同 provider 不同模型降级（如 qwen:vision_high）
    if forced_slot and forced_slot in models:
        return models[forced_slot]

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
    user_id: str = "system",
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
        user_id: 记账归属用户（预算控制按此维度计数）

    Returns:
        tuple: (result_dict, provider_key)

    Raises:
        RuntimeError: 所有 Provider 均不可用（status_code=503）
    """
    # 导入熔断器模块：is_provider_available 检查 Provider 是否被熔断，
    # get_circuit 获取熔断器实例以调用 on_success/on_failure 回调
    from providers.circuit_breaker import is_provider_available, get_circuit

    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
    budget = TIMEOUT_CONFIG.get(feature, 30) * 3.0

    async def _run_fallback_chain():
        start_time = asyncio.get_event_loop().time()
        for entry in chain:
            # 解析 "provider:slot" 格式（如 "qwen:vision_high"）
            base_key, _, forced_slot = entry.partition(":")
            provider_key = base_key
            forced_slot = forced_slot or None

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

            model_name = _resolve_model_name(provider_key, feature, forced_slot)

            # 计算剩余超时预算
            elapsed = asyncio.get_event_loop().time() - start_time
            remaining = budget - elapsed
            logger.debug(
                "Provider [%s] 开始调用: feature=%s, 已用=%.1fs, 剩余预算=%.1fs",
                provider_key, feature, elapsed, remaining,
            )

            try:
                async def _do_call():
                    _FEATURE_CONTEXT.set(feature)
                    try:
                        return await fn(provider, model_name)
                    finally:
                        # GW-L3: 成功路径也重置 context——避免同任务后续
                        # 无 _feature 的 provider 调用继承上次 feature
                        _FEATURE_CONTEXT.set("")

                # Phase3: 并发信号量保护（视频/多模态走 heavy 上限）
                result = await _run_under_semaphore(app, feature, _do_call)
                # 调用成功：通知熔断器重置失败计数，恢复 Provider 健康状态
                cb = get_circuit(provider_key)
                if cb:
                    await cb.on_success()
                # 记录成本（按真实用户记账，预算中间件按 user_id 维度查询）
                try:
                    tokens_used = result.get("tokens_used", 0)
                    model_name = result.get("model", model_name)
                    await get_cost_tracker().record(
                        user_id=user_id,
                        feature=feature,
                        model=model_name,
                        input_tokens=tokens_used // 2 if tokens_used else 0,
                        output_tokens=tokens_used // 2 if tokens_used else 0,
                    )
                except Exception as cost_err:
                    logger.debug("CostTracker 记录失败（可忽略）: %s", cost_err)
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

        # 所有 Provider 都失败（含被熔断跳过的）
        _FEATURE_CONTEXT.set("")
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
    # GW-H2: 预算记账必须归属真实用户，预算中间件（BudgetMiddleware）
    # 按 request.state.user_id 查询日用量，写死 system 会导致限额永不触发
    user_id = getattr(request.state, "user_id", "system")
    result, provider_key = await call_with_fallback(app, feature, fn, user_id=user_id)
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

    budget = TIMEOUT_CONFIG.get(feature, 30) * 3.0
    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])

    async def _run_stream_fallback_chain():
        """内部协程：遍历 fallback 链尝试获取可用的流式生成器。

        将循环逻辑封装为独立协程，以便外层用 asyncio.wait_for 施加
        总预算超时兜底，防止所有 Provider 异常时预算耗尽仍不退出。
        """
        start_time = asyncio.get_event_loop().time()

        for entry in chain:
            # 解析 "provider:slot" 格式（如 "qwen:vision_high"）
            base_key, _, forced_slot = entry.partition(":")
            provider_key = base_key
            forced_slot = forced_slot or None

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
            model_name = _resolve_model_name(provider_key, feature, forced_slot)

            # 首 token 探测重试：最多尝试 2 次，避免瞬时故障直接降级
            _probe_retries = 0
            _max_probe_retries = 2
            while _probe_retries < _max_probe_retries:
                _probe_retries += 1
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

                    # 首 token 成功：包装生成器，先吐首 token 再吐剩余；
                    # 并发信号量在生成器整个生命周期内持有，防止流式长连接堆积
                    sem = _get_concurrency_semaphore(app, feature)
                    if sem is None:
                        async def _wrapped_gen(a=agen, first=first_chunk):
                            yield first
                            async for c in a:
                                yield c
                    else:
                        async def _wrapped_gen(a=agen, first=first_chunk, s=sem):
                            async with s:
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
                except asyncio.TimeoutError as e:
                    # 超时可能是瞬时网络抖动，允许重试
                    if _probe_retries < _max_probe_retries:
                        logger.warning(
                            "Provider [%s] stream retry %d/%d (首token探测超时) for feature=%s: %s",
                            provider_key, _probe_retries, _max_probe_retries, feature, str(e),
                        )
                        await asyncio.sleep(0.5)  # 重试前短暂等待
                    else:
                        logger.warning(
                            "Provider [%s] stream failed (首token探测超时) for feature=%s: %s, trying next...",
                            provider_key, feature, str(e),
                        )
                        cb = get_circuit(provider_key)
                        if cb:
                            await cb.on_failure()
                except Exception as e:
                    # 其他错误（429/400 等确定性错误）直接切换 provider，不重试
                    logger.warning(
                        "Provider [%s] stream failed (首token探测) for feature=%s: %s, trying next...",
                        provider_key, feature, str(e),
                    )
                    cb = get_circuit(provider_key)
                    if cb:
                        await cb.on_failure()
                    break  # 跳出重试循环，进入下一个 provider

            # 当前 provider 所有重试均失败，尝试下一个
            _FEATURE_CONTEXT.set("")
            continue

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
