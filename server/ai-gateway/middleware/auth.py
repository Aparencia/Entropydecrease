"""
熵减 AI 网关 — JWT 认证中间件

从 Authorization 头提取 Bearer token 并验证。
验证通过后将 user_id 注入 request.state。

支持 Supabase Auth 签发的多种 JWT 算法：
- HS256：使用对称密钥（HMAC）验证，密钥来自 SUPABASE_JWT_SECRET
- ES256：使用 ECDSA P-256 公钥验证，公钥从 Supabase JWKS 端点获取（按 kid 匹配）
- RS256：使用 RSA 公钥（PEM）验证

未配置 SUPABASE_JWT_ALGORITHM 时按 token 实际算法自动适配（GW-2#1 延伸：
从根上消除 HS256/ES256 配置错位导致的全站 401），显式配置则强制白名单。

@ai-context: JWT 认证中间件：校验 Supabase JWT（ES256 经 JWKS，或 HS256/RS256 经密钥），未配置时以占位密钥放行供本地开发。
@ai-context: tier 注入：解析 JWT user_metadata 中的 beta.tier 与 paid 状态，写入 request.state.beta_tier/paid_tier 供 rate_limit/budget 分级配额；解析失败回落 free（fail-closed）。
@ai-context: 拆分说明：密钥材料/JWKS/模块级启动检查见 jwt_keys，验签逻辑见
jwt_verify；本文件保留 tier 解析、FastAPI 依赖 verify_token 与中间件，并 re-export
jwt_keys._get_es256_public_key（test_e2e_auth.py 的 patch 目标）。
"""

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from errors import AuthenticationError
from middleware.jwt_keys import _get_es256_public_key  # noqa: F401 — re-export：test_e2e_auth.py patch 目标
from middleware.jwt_verify import verify_token as _verify_token

# ============================================================
# Tier 解析（纯函数）
# ============================================================

# 合法 tier 值白名单（与 rate_limit.TIER_LIMITS 键集同步）
_VALID_TIERS = frozenset({"observer", "active", "core", "pro", "lifetime"})


def _is_dev_user(payload: dict, user_id: str) -> bool:
    """判断用户是否在开发者白名单（DEV_USER_IDS 环境变量）。

    @ai-context: 开发者账号完全豁免平台配额（rate_limit/budget 跳过）并赋予
    lifetime 最高身份，便于开发自测。匹配方式：Supabase user_id（sub）或邮箱
    （JWT email claim / user_metadata.email），大小写不敏感；未配置时返回 False。

    Args:
        payload: 解码后的 JWT payload
        user_id: 已验证的用户 ID（sub claim）

    Returns:
        bool: 是否为开发者白名单用户
    """
    raw = os.getenv("DEV_USER_IDS", "").strip()
    if not raw:
        return False
    dev_ids = {s.strip().lower() for s in raw.split(",") if s.strip()}
    if not dev_ids:
        return False
    if (user_id or "").lower() in dev_ids:
        return True
    # 邮箱匹配（JWT email claim 优先，user_metadata.email 兜底）
    email = payload.get("email") or ""
    if not email:
        meta = payload.get("user_metadata") or {}
        email = meta.get("email") or ""
    return str(email).lower() in dev_ids


def extract_tiers(payload: dict) -> tuple[Optional[str], Optional[str]]:
    """从 JWT payload 的 user_metadata 解析 (beta_tier, paid_tier)。

    - beta.tier：内测身份（observer/active/core）
    - paid.tier + paid.expires_at：付费身份（pro/lifetime），过期视为无付费身份
    - 非法 tier 值一律忽略（防止伪造 claims 提权）；解析结果由调用方取最高者

    @ai-context: 纯函数，无副作用。tier 只信服务端 JWT claims，客户端 Header 一律忽略。

    Args:
        payload: 解码后的 JWT payload（含 user_metadata）

    Returns:
        tuple: (beta_tier, paid_tier)，均为 None 表示无任何身份（回落 free）
    """
    if not isinstance(payload, dict):
        return None, None

    meta = payload.get("user_metadata")
    if not isinstance(meta, dict):
        return None, None

    # 内测身份
    beta_tier: Optional[str] = None
    beta = meta.get("beta")
    if isinstance(beta, dict):
        tier = beta.get("tier")
        if tier in _VALID_TIERS:
            beta_tier = tier

    # 付费身份（必须带未过期的 expires_at，lifetime 除外）
    paid_tier: Optional[str] = None
    paid = meta.get("paid")
    if isinstance(paid, dict):
        tier = paid.get("tier")
        expires_at = paid.get("expires_at")
        if tier in _VALID_TIERS and tier in ("pro", "lifetime"):
            if tier == "lifetime":
                paid_tier = tier
            elif expires_at and isinstance(expires_at, str):
                try:
                    expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    if expires > datetime.now(timezone.utc):
                        paid_tier = tier
                except ValueError:
                    # 日期格式异常视为无付费身份（fail-closed）
                    paid_tier = None

    return beta_tier, paid_tier


# 不需要认证的路径白名单
# 注意：license_webhook 是支付平台服务端回调（无用户 token），
# 防伪依赖 HMAC 签名 + order_id 查询确认（见 payment_adapter），而非 JWT。
PUBLIC_PATHS = {"/health", "/health/quick", "/health/live", "/api/v1/license/webhook"}


async def verify_token(request: Request) -> str:
    """
    FastAPI 依赖：返回 JWT 中间件注入的用户 ID。

    供需要显式用户身份的路由（如激活码 license）使用；普通路由由
    JWTAuthMiddleware 统一注入 request.state.user_id。未认证（中间件
    未注入或注入 anonymous）时返回 401。

    @ai-context: FastAPI dependency that returns the user id injected by
    JWTAuthMiddleware; 401 when the request is unauthenticated.
    """
    user_id = getattr(request.state, "user_id", None)
    if not user_id or user_id == "anonymous":
        raise HTTPException(status_code=401, detail="未认证")
    return user_id


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """JWT 认证中间件"""

    async def dispatch(self, request: Request, call_next):
        # CORS 预检请求直接放行，避免被 JWT 拦截
        if request.method == "OPTIONS":
            return await call_next(request)

        # 跳过白名单路径
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # 跳过非 API 路径
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        try:
            user_id, payload = await self._verify_token(request)
            # 注入 user_id 与 tier 到 request.state，供路由与限流/预算中间件使用
            request.state.user_id = user_id
            beta_tier, paid_tier = extract_tiers(payload)
            request.state.beta_tier = beta_tier
            request.state.paid_tier = paid_tier
            # 开发者白名单（DEV_USER_IDS）：完全豁免配额 + lifetime 最高身份
            if _is_dev_user(payload, user_id):
                request.state.is_dev = True
                request.state.paid_tier = "lifetime"
        except AuthenticationError as e:
            return JSONResponse(
                status_code=e.status_code,
                content={"detail": e.message},
            )

        return await call_next(request)

    async def _verify_token(self, request: Request) -> tuple[str, dict]:
        """
        从请求头提取并验证 JWT token（HS256 / ES256 / RS256 / Supabase JWT）

        验签实现已移至 middleware.jwt_verify.verify_token（本方法仅委托，
        方法签名/返回值/异常语义与原实现一致）。

        Returns:
            tuple: (验证通过的用户 ID（sub claim）, 完整 payload claims)

        Raises:
            AuthenticationError: token 缺失或验证失败
        """
        return await _verify_token(request)
