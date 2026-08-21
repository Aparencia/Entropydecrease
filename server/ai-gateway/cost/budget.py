"""
熵减 AI 网关 — 预算控制中间件

@ai-context: 在请求到达路由前检查用户日预算是否耗尽。
@ai-context: 预算分两级：token 上限（防滥用，全局统一）和费用上限（控成本，按 tier 分级）。
@ai-context: Redis 不可用时降级放行。超限返回 HTTP 429 + 友好提示。
@ai-context: 预算阈值通过环境变量配置，支持运行时调整。
"""

import logging
import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from cost.tracker import get_cost_tracker

logger = logging.getLogger(__name__)

# 预算配置（环境变量可覆盖）
# 每用户每日 token 上限（默认 200K，约等于 50 次中等调用）
DAILY_TOKEN_LIMIT = int(os.getenv("BUDGET_DAILY_TOKEN_LIMIT", "200000"))
# 每用户每日费用上限（元）——作为 TIER_LIMITS 缺失时的全局兜底
DEFAULT_COST_LIMIT_YUAN = float(os.getenv("BUDGET_DAILY_COST_LIMIT", "0.5"))

# 需要预算检查的路径前缀
BUDGET_CHECKED_PATHS = ("/api/v1/ai/", "/api/v1/asr/", "/api/v1/multimodal/", "/api/v1/vision/")


def resolve_cost_limit(beta_tier: str | None = None, paid_tier: str | None = None) -> float:
    """按有效 tier 解析每日费用上限（元）。

    @ai-context: 纯函数。tier 由 JWT claims 注入（auth.py），此处只做查表；
    TIER_LIMITS 缺失 cost 键时回退环境变量默认值。
    @ai-context: 延迟导入 get_tier_limits——cost 包位于 config 初始化链上
    （config → fallback → cost.tracker → cost/__init__），顶层导入 middleware
    会触发 middleware → auth → config 循环导入（ImportError: APP_CONFIG）。

    Args:
        beta_tier: 内测 tier（observer/active/core）
        paid_tier: 付费 tier（pro/lifetime）

    Returns:
        float: 每日费用上限（元）
    """
    # 延迟导入：打破 config → cost → middleware → config 的循环依赖
    from middleware.rate_limit import get_tier_limits

    limits = get_tier_limits(beta_tier, paid_tier)
    return float(limits.get("cost", DEFAULT_COST_LIMIT_YUAN))


class BudgetMiddleware(BaseHTTPMiddleware):
    """预算控制中间件 — 超限时拒绝新请求"""

    async def dispatch(self, request: Request, call_next):
        # 仅对 AI 功能路径生效
        if not any(request.url.path.startswith(p) for p in BUDGET_CHECKED_PATHS):
            return await call_next(request)

        # 开发者白名单完全豁免（auth.py 注入 is_dev，DEV_USER_IDS 配置）
        if getattr(request.state, "is_dev", False):
            return await call_next(request)

        # 获取 user_id
        user_id = getattr(request.state, "user_id", None)
        if not user_id or user_id == "anonymous":
            return await call_next(request)

        # 按 tier 解析当日费用上限（由 auth.py 注入，解析失败回落 free）
        beta_tier = getattr(request.state, "beta_tier", None)
        paid_tier = getattr(request.state, "paid_tier", None)
        daily_cost_limit = resolve_cost_limit(beta_tier, paid_tier)

        # 检查预算
        tracker = get_cost_tracker()
        usage = await tracker.get_user_daily_usage(user_id)

        if DAILY_TOKEN_LIMIT > 0 and usage["tokens"] >= DAILY_TOKEN_LIMIT:
            logger.warning(
                "预算拦截(token): user=%s, tokens=%d/%d",
                user_id, usage["tokens"], DAILY_TOKEN_LIMIT,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        f"今日 AI 使用量已达上限（{DAILY_TOKEN_LIMIT // 1000}K tokens），"
                        "请明天再试，或使用自己的 API Key 解除限制。"
                    ),
                    "code": "budget_token_exceeded",
                    "usage": usage,
                },
            )

        if daily_cost_limit > 0 and usage["yuan"] >= daily_cost_limit:
            logger.warning(
                "预算拦截(cost): user=%s, yuan=%.2f/%.2f",
                user_id, usage["yuan"], daily_cost_limit,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        f"今日 AI 费用已达上限（¥{daily_cost_limit:.1f}），"
                        "请明天再试，或使用自己的 API Key 解除限制。"
                    ),
                    "code": "budget_cost_exceeded",
                    "usage": usage,
                },
            )

        return await call_next(request)
