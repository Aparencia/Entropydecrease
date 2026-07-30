"""
熵减 AI 网关 — 健康检查路由

@ai-context: 三档健康检查：
- /health       重量级：并行 ping 所有 Provider（最坏 5s）+ Redis，缓存 30s
- /health/quick 轻量级：仅进程存活，供桌面客户端高频轮询，避免触发上游 ping
- /health/live  K8s liveness probe：仅进程存活
整体状态：任一 Provider 健康即 healthy，否则 degraded。
"""

import asyncio
import time

from fastapi import APIRouter, Request

from config import APP_CONFIG
from cache.redis_cache import get_cache

router = APIRouter(tags=["系统"])


@router.get("/health")
async def health_check(request: Request):
    """
    健康检查端点

    对每个 Provider 发送 ping 测试，记录响应时间和可用性。
    并行 ping 所有 Provider（最坏耗时 5s），并缓存结果 30 秒。
    """
    app = request.app
    # 30 秒 TTL 健康状态缓存
    cache_ttl = 30
    cached_result = getattr(app.state, "_health_cache", None)
    cache_time = getattr(app.state, "_health_cache_time", 0)
    now = time.monotonic()
    if cached_result is not None and (now - cache_time) < cache_ttl:
        return cached_result

    async def _ping_provider(name, provider):
        """单个 Provider 健康检测（带 5 秒超时）"""
        try:
            result = await asyncio.wait_for(provider.health_check(), timeout=5.0)
            return name, result
        except asyncio.TimeoutError:
            return name, {"status": "unhealthy", "latency_ms": 5000, "error": "health check timeout"}
        except Exception as e:
            return name, {"status": "unhealthy", "latency_ms": 0, "error": str(e)}

    # 并行 ping 所有 Provider
    tasks = [
        _ping_provider(name, provider)
        for name, provider in app.state.providers.items()
    ]
    results = await asyncio.gather(*tasks) if tasks else []
    providers_status = dict(results)

    # Redis 连接状态检查
    redis_status = "not_connected"
    try:
        cache = get_cache()
        if cache._client is not None:
            await cache._client.ping()
            redis_status = "connected"
    except Exception as e:
        redis_status = f"error: {str(e)}"

    # 整体健康状态
    healthy_providers = sum(1 for p in providers_status.values() if p.get("status") == "healthy")
    overall = "healthy" if healthy_providers > 0 else "degraded"

    response = {
        "status": overall,
        "service": "ai-gateway",
        "version": APP_CONFIG["version"],
        "providers": providers_status,
        "redis": redis_status,
        "healthy_count": healthy_providers,
        "total_count": len(providers_status),
    }

    # 缓存结果
    app.state._health_cache = response
    app.state._health_cache_time = now

    return response


@router.get("/health/live")
async def liveness():
    """K8s liveness probe — 仅检查进程存活"""
    return {"status": "alive"}


@router.get("/health/quick")
async def health_quick():
    """
    轻量级健康检查 — 仅检查进程存活，不 ping 上游 Provider

    供桌面客户端频繁轮询使用，避免每次触发重量级 Provider 健康检查。
    """
    return {
        "status": "ok",
        "service": "ai-gateway",
        "version": APP_CONFIG["version"],
    }
