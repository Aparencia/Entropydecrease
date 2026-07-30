"""
熵减 AI 网关 — 频率限制中间件

基于 Redis 的滑动窗口频率限制：
- 按 user_id + feature 计数
- 双层计数器：全局每日上限 + 功能级上限
- 用户 Key 独立限流：携带 X-User-API-Key 时对该 Key 单独限速
- Redis 不可用时放行（降级到无限制）
- 超限返回 HTTP 429

@ai-context: 频率限制中间件：按用户+功能维度基于 Redis 计数执行每日上限（RATE_LIMITS），超限返回 429。
"""

import hashlib
import logging
from datetime import datetime

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from cache.redis_cache import get_cache
from config import RATE_LIMITS

logger = logging.getLogger(__name__)

# 用户 Key 独立限流参数
USER_KEY_RATE_LIMIT_PER_MINUTE = 30  # 每个用户 Key 每分钟最多请求数
USER_KEY_RATE_WINDOW_SECONDS = 60    # 限流窗口（秒）

# API 路径到功能名称的映射
PATH_TO_FEATURE: dict[str, str] = {
    "/api/v1/ai/summarize": "summarize",
    "/api/v1/ai/generate-cards": "generate_cards",
    "/api/v1/ai/evaluate-explanation": "evaluate",
    "/api/v1/ai/recommend-duration": "recommend",
    "/api/v1/ai/vision": "vision_extract",
    "/api/v1/ai/transcribe": "transcribe",
    "/api/v1/ai/tag-content": "tag_content",
    "/api/v1/ai/optimize-card": "optimize_card",
    "/api/v1/ai/feynman-question": "feynman_question",
    "/api/v1/ai/feynman-evaluate-answers": "feynman_evaluate",
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """频率限制中间件 — 基于 Redis 滑动窗口"""

    async def dispatch(self, request: Request, call_next):
        # 仅对 AI 功能 API 进行频率限制
        feature = PATH_TO_FEATURE.get(request.url.path)
        if not feature:
            return await call_next(request)

        # 获取 user_id（由 JWT 中间件注入）
        user_id = getattr(request.state, "user_id", "anonymous")

        # ---- 用户 Key 独立限流 ----
        user_api_key = getattr(request.state, "user_api_key", None)
        if user_api_key:
            is_allowed, detail = await self._check_user_key_rate_limit(user_api_key, feature)
            if not is_allowed:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": detail,
                        "feature": feature,
                    },
                )

        # 检查常规频率限制（预检查模式，仅读取计数）
        is_allowed, detail = await self._check_rate_limit(user_id, feature)
        if not is_allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": detail,
                    "feature": feature,
                },
            )

        # 执行请求
        response = await call_next(request)

        # 仅对 2xx 响应递增计数，避免失败请求消耗配额
        if 200 <= response.status_code < 300:
            await self._increment_rate_limit(user_id, feature)

        return response

    async def _check_user_key_rate_limit(
        self, user_api_key: str, feature: str
    ) -> tuple[bool, str]:
        """
        用户 Key 独立限流检查。

        对携带 X-User-API-Key 的请求实施独立限流策略，
        使用 Key 前 16 字符的 SHA256 哈希作为 Redis key，防止滥用。

        Args:
            user_api_key: 用户自带的 API Key
            feature: 功能名称

        Returns:
            tuple: (是否允许, 拒绝原因)
        """
        cache = get_cache()
        if not cache._client:
            # Redis 不可用，降级放行
            return True, ""

        # 用 Key 前 16 字符的哈希作为限流标识（不暴露完整 Key）
        key_hash = hashlib.sha256(user_api_key[:16].encode()).hexdigest()[:12]
        rate_key = f"rate_limit:userkey:{key_hash}:{feature}"

        try:
            count = await cache.increment(rate_key, expire=USER_KEY_RATE_WINDOW_SECONDS)
        except Exception as exc:
            logger.warning("用户 Key 限流计数失败: %s", exc)
            return True, ""  # Redis 异常，降级放行

        if count > USER_KEY_RATE_LIMIT_PER_MINUTE:
            logger.warning(
                "用户 Key 限流触发: key_hash=%s, feature=%s, count=%d/%d",
                key_hash, feature, count, USER_KEY_RATE_LIMIT_PER_MINUTE,
            )
            return False, (
                "您的 API Key 请求过于频繁，请稍后再试"
                f"（每分钟最多 {USER_KEY_RATE_LIMIT_PER_MINUTE} 次）"
            )

        logger.debug(
            "用户 Key 限流通过: key_hash=%s, feature=%s, count=%d/%d",
            key_hash, feature, count, USER_KEY_RATE_LIMIT_PER_MINUTE,
        )
        return True, ""

    async def _check_rate_limit(
        self, user_id: str, feature: str
    ) -> tuple[bool, str]:
        """
        检查用户是否超出频率限制（预检查模式，仅读取计数）

        检查顺序：
        1. 功能级每日限制（如 summarize 每日 15 次）
        2. 全局每日总量限制（每日 50 次）

        Redis 不可用时跳过检查，直接放行。
        实际计数在请求成功（2xx）后由 _increment_rate_limit 执行，
        避免失败请求消耗配额。

        Args:
            user_id: 用户 ID
            feature: 功能名称

        Returns:
            tuple: (是否允许, 拒绝原因)
        """
        cache = get_cache()
        if not cache._client:
            # Redis 不可用，降级放行
            logger.debug("频率限制检查: user=%s, feature=%s (Redis 不可用，放行)", user_id, feature)
            return True, ""

        today = datetime.now().strftime("%Y-%m-%d")

        # 从配置读取限额
        feature_limit = RATE_LIMITS.get(feature, 10)
        daily_limit = RATE_LIMITS.get("daily_total", 50)

        # ---- 第一层：功能级限制（预检查，仅读取） ----
        feature_key = f"rate_limit:{user_id}:{feature}:{today}"
        try:
            feature_raw = await cache.get(feature_key)
            feature_count = int(feature_raw) if feature_raw else 0
        except Exception as exc:
            logger.warning("频率限制预检查失败(功能级): %s", exc)
            return True, ""  # Redis 异常，降级放行

        if feature_count >= feature_limit:
            return False, (
                f"「{feature}」今日使用次数已达上限（{feature_limit} 次/天），"
                "请明天再试，或升级套餐获取更多配额。"
            )

        # ---- 第二层：全局每日总量限制（预检查，仅读取） ----
        global_key = f"rate_limit:{user_id}:global:{today}"
        try:
            global_raw = await cache.get(global_key)
            global_count = int(global_raw) if global_raw else 0
        except Exception as exc:
            logger.warning("频率限制预检查失败(全局): %s", exc)
            return True, ""  # Redis 异常，降级放行

        if global_count >= daily_limit:
            return False, (
                f"今日 AI 功能总使用次数已达上限（{daily_limit} 次/天），"
                "请明天再试，或升级套餐获取更多配额。"
            )

        logger.debug(
            "频率限制预检查通过: user=%s, feature=%s, feature_count=%d/%d, global_count=%d/%d",
            user_id, feature, feature_count, feature_limit, global_count, daily_limit,
        )
        return True, ""

    async def _increment_rate_limit(self, user_id: str, feature: str) -> None:
        """
        请求成功后递增频率限制计数器

        在 dispatch 中仅对 2xx 响应调用，避免失败请求消耗配额。

        Args:
            user_id: 用户 ID
            feature: 功能名称
        """
        cache = get_cache()
        if not cache._client:
            return

        today = datetime.now().strftime("%Y-%m-%d")

        # 计算到当日结束的剩余秒数（至少 60 秒，避免边界问题）
        now = datetime.now()
        seconds_until_end_of_day = (
            (24 - now.hour) * 3600
            - now.minute * 60
            - now.second
        )
        ttl = max(seconds_until_end_of_day, 60)

        # ---- 第一层：功能级计数 ----
        feature_key = f"rate_limit:{user_id}:{feature}:{today}"
        try:
            await cache.increment(feature_key, expire=ttl)
        except Exception as exc:
            logger.warning("频率限制计数失败(功能级): %s", exc)

        # ---- 第二层：全局每日总量计数 ----
        global_key = f"rate_limit:{user_id}:global:{today}"
        try:
            await cache.increment(global_key, expire=ttl)
        except Exception as exc:
            logger.warning("频率限制计数失败(全局): %s", exc)
