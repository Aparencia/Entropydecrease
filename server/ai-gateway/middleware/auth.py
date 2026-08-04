"""
熵减 AI 网关 — JWT 认证中间件

从 Authorization 头提取 Bearer token 并验证。
验证通过后将 user_id 注入 request.state。

支持 Supabase Auth 签发的多种 JWT 算法：
- HS256：使用对称密钥（HMAC）验证，密钥来自 SUPABASE_JWT_SECRET
- ES256：使用 ECDSA P-256 公钥验证，公钥从 Supabase JWKS 端点获取（按 kid 匹配）
- RS256：使用 RSA 公钥（PEM）验证

@ai-context: JWT 认证中间件：校验 Supabase JWT（ES256 经 JWKS，或 HS256/RS256 经密钥），未配置时以占位密钥放行供本地开发。
"""

import asyncio
import base64
import logging
import os
import time
import warnings
from typing import Optional

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import APP_CONFIG
from errors import AuthenticationError

logger = logging.getLogger(__name__)

# 不需要认证的路径白名单
PUBLIC_PATHS = {"/health", "/health/quick", "/health/live"}

def _jwt_verification_configured() -> bool:
    """
    检查当前算法是否具备验证所需的密钥材料。

    - HS256/RS256：需要 SUPABASE_JWT_SECRET（对称密钥或 PEM 公钥）
    - ES256：需要 SUPABASE_JWKS_URL 或 SUPABASE_URL（用于获取 JWKS 公钥）
    """
    alg = APP_CONFIG.get("jwt_algorithm", "HS256")
    if alg == "ES256":
        return bool(
            APP_CONFIG.get("supabase_jwks_url", "")
            or APP_CONFIG.get("supabase_url", "")
        )
    return bool(APP_CONFIG.get("jwt_secret", ""))


# 启动时检查密钥配置
# Phase1 安全加固：生产环境缺少密钥材料时拒绝启动（而非降级放行）
_ALLOW_DEV_AUTH = os.getenv("GATEWAY_ALLOW_DEV_AUTH", "false").lower() == "true"

if not _jwt_verification_configured():
    if APP_CONFIG.get("app_env") == "production" and not _ALLOW_DEV_AUTH:
        raise RuntimeError(
            "[FATAL] 生产环境 JWT 验证密钥材料未配置，拒绝启动。"
            "ES256 需配置 SUPABASE_JWKS_URL 或 SUPABASE_URL；"
            "HS256/RS256 需配置 SUPABASE_JWT_SECRET。"
            "如确需在生产环境使用开发降级模式，设置 GATEWAY_ALLOW_DEV_AUTH=true（不推荐）。"
        )
    else:
        warnings.warn(
            "JWT 验证密钥材料未配置，JWT 验证将使用开发降级模式（不验证签名）。"
            "ES256 需配置 SUPABASE_JWKS_URL 或 SUPABASE_URL；"
            "HS256/RS256 需配置 SUPABASE_JWT_SECRET。"
            "⚠️ 仅限本地开发，生产环境将拒绝启动。",
            RuntimeWarning,
            stacklevel=2,
        )

# 启动日志：输当前 JWT 验证算法
logger.info("JWT 验证算法: %s", APP_CONFIG["jwt_algorithm"])


def _normalize_pem_key(raw: str) -> str:
    """
    将密钥规范化为 PEM 格式。

    支持三种输入形式：
    1. 标准 PEM 字符串（以 -----BEGIN 开头）
    2. Base64 编码的 DER 公钥
    3. 其他（直接返回，交由 jose 处理）
    """
    if not raw:
        return raw

    stripped = raw.strip()

    # 已经是 PEM 格式
    if stripped.startswith("-----BEGIN"):
        return stripped

    # 尝试 Base64 解码为 DER，再包装为 PEM
    try:
        der_bytes = base64.b64decode(stripped)
        # 简单校验：DER 编码的 RSA 公钥通常以 0x30 (SEQUENCE) 开头
        if der_bytes and der_bytes[0] == 0x30:
            b64 = base64.b64encode(der_bytes).decode("ascii")
            lines = [b64[i : i + 64] for i in range(0, len(b64), 64)]
            return (
                "-----BEGIN PUBLIC KEY-----\n"
                + "\n".join(lines)
                + "\n-----END PUBLIC KEY-----"
            )
    except Exception:
        pass

    # 兜底：原样返回
    return stripped


# ============================================================
# JWKS 获取与缓存（ES256 验签用）
# ============================================================

_jwks_cache: Optional[dict] = None
_jwks_cache_time: float = 0.0
_JWKS_CACHE_TTL: int = 3600  # 缓存有效期（秒），默认 1 小时


def _resolve_jwks_url() -> str:
    """解析 JWKS 端点 URL：优先 SUPABASE_JWKS_URL，其次从 SUPABASE_URL 推导"""
    jwks_url = APP_CONFIG.get("supabase_jwks_url", "")
    if jwks_url:
        return jwks_url
    supabase_url = APP_CONFIG.get("supabase_url", "")
    if supabase_url:
        return f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return ""


async def _fetch_jwks(jwks_url: str) -> dict:
    """
    获取 JWKS（带 TTL 缓存，默认 1 小时刷新一次）。

    网络失败时若已有缓存，则返回过期缓存以保证服务可用性。
    """
    global _jwks_cache, _jwks_cache_time
    now = time.time()
    if _jwks_cache is not None and (now - _jwks_cache_time) < _JWKS_CACHE_TTL:
        return _jwks_cache
    try:
        resp = await asyncio.to_thread(httpx.get, jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_time = now
        logger.info("JWKS 获取成功，缓存已更新: %s", jwks_url)
        return _jwks_cache
    except Exception as e:
        logger.error("JWKS 获取失败: %s, error=%s", jwks_url, str(e))
        # 降级：返回过期缓存（若有），避免单次网络抖动导致验签全失败
        if _jwks_cache is not None:
            logger.warning("JWKS 获取失败，使用过期缓存（可能已过期）")
            return _jwks_cache
        raise


def _b64url_to_int(val: str) -> int:
    """将 base64url 编码的字符串解码为整数（用于 JWK 坐标解析）"""
    # 补齐 base64 padding
    padding = -len(val) % 4
    val += "=" * padding
    return int.from_bytes(base64.urlsafe_b64decode(val), "big")


async def _get_es256_public_key(kid: Optional[str] = None):
    """
    从 JWKS 端点获取 ECDSA P-256 公钥（ES256 验签用）。

    通过 token 头部的 kid 匹配 JWKS 中对应的公钥。
    JWKS 结果带缓存（TTL 1 小时），避免每次请求都请求 Supabase。

    Args:
        kid: token 头部中的 key id，用于匹配 JWKS 中的正确密钥

    Returns:
        cryptography 的 EllipticCurvePublicKey 对象（jose 兼容）

    Raises:
        ValueError: JWKS 中未找到匹配 kid 的密钥
    """
    jwks_url = _resolve_jwks_url()
    if not jwks_url:
        logger.warning(
            "ES256 验签缺少 JWKS 端点配置（SUPABASE_JWKS_URL / SUPABASE_URL）"
        )
        return "not-configured"

    jwks = await _fetch_jwks(jwks_url)
    for key in jwks.get("keys", []):
        # 按 kid 匹配；kid 为空时取第一个 EC P-256 类型的 key
        if kid and key.get("kid") != kid:
            continue
        if key.get("kty") != "EC" or key.get("crv") != "P-256":
            continue
        # 从 JWK 坐标构造 ECDSA P-256 公钥
        from cryptography.hazmat.primitives.asymmetric.ec import (
            EllipticCurvePublicNumbers,
            SECP256R1,
        )

        x = _b64url_to_int(key["x"])
        y = _b64url_to_int(key["y"])
        public_key = EllipticCurvePublicNumbers(x, y, SECP256R1()).public_key()
        return public_key

    raise ValueError(f"JWKS 中未找到 kid={kid} 对应的 EC P-256 公钥")


async def _get_public_key(kid: Optional[str] = None):
    """
    获取用于 JWT 验证的密钥。

    - HS256：返回对称密钥字符串（SUPABASE_JWT_SECRET）
    - ES256：从 JWKS 端点获取 ECDSA P-256 公钥（按 kid 匹配）
    - RS256：返回 RSA 公钥 PEM 格式
    """
    alg = APP_CONFIG.get("jwt_algorithm", "HS256")
    if alg == "ES256":
        return await _get_es256_public_key(kid)
    raw = APP_CONFIG["jwt_secret"]
    if not raw:
        # 未配置时返回占位符，jose 会在验证时报错（优雅降级）
        return "not-configured"
    if alg == "HS256":
        return raw
    return _normalize_pem_key(raw)


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
            user_id = await self._verify_token(request)
            # 注入 user_id 到 request.state，供后续路由使用
            request.state.user_id = user_id
        except AuthenticationError as e:
            return JSONResponse(
                status_code=e.status_code,
                content={"detail": e.message},
            )

        return await call_next(request)

    async def _verify_token(self, request: Request) -> str:
        """
        从请求头提取并验证 JWT token（HS256 / ES256 / RS256 / Supabase JWT）

        当密钥材料未配置时启用开发降级模式：
        - 有 Bearer token 时提取 payload 中的 sub（不验证签名）
        - 无 token 时返回 "anonymous"

        Returns:
            str: 验证通过的用户 ID（sub claim）

        Raises:
            AuthenticationError: token 缺失或验证失败
        """
        if not _jwt_verification_configured():
            # 生产环境已在模块加载时告警，此处仅处理开发环境降级
            if not getattr(self, '_warned_dev_mode', False):
                logger.warning(
                    "⚠️ JWT 验证处于开发降级模式！请勿在生产环境使用。"
                    "ES256 需配置 SUPABASE_JWKS_URL/SUPABASE_URL，"
                    "HS256/RS256 需配置 SUPABASE_JWT_SECRET 以启用完整验证。"
                )
                self._warned_dev_mode = True

            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                try:
                    # 无签名验证提取 claims（仅用于开发调试）
                    import json
                    payload_b64 = token.split('.')[1]
                    # 补齐 base64url padding
                    payload_b64 += '=' * (-len(payload_b64) % 4)
                    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                    return payload.get("sub", "dev-user")
                except Exception:
                    return "dev-user"
            return "anonymous"

        # === 正常 JWT 验证流程 ===
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            raise AuthenticationError("缺少 Authorization 请求头")

        # 提取 Bearer token
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise AuthenticationError("Authorization 头格式错误，应为 Bearer <token>")

        token = parts[1]

        # 使用 python-jose 解码并验证 JWT token
        from jose import jwt, JWTError, ExpiredSignatureError

        alg = APP_CONFIG.get("jwt_algorithm", "HS256")

        # ES256 需要从 token header 提取 kid，以匹配 JWKS 中的公钥
        kid = None
        if alg == "ES256":
            try:
                import json
                header_b64 = token.split('.')[0]
                header_b64 += '=' * (-len(header_b64) % 4)
                token_header = json.loads(base64.urlsafe_b64decode(header_b64))
                kid = token_header.get("kid")
            except Exception as e:
                logger.warning("解析 token header 获取 kid 失败: %s", str(e))

        try:
            public_key = await _get_public_key(kid=kid)
        except Exception as e:
            logger.error("获取公钥失败: %s", str(e))
            raise AuthenticationError("认证服务异常，请稍后重试") from e

        # 构建解码参数
        decode_kwargs: dict = {
            "algorithms": [alg],
            "audience": "authenticated",  # Supabase JWT 的标准 audience
        }
        # 当配置了 supabase_url 时，验证 iss claim
        supabase_url = APP_CONFIG.get("supabase_url", "")
        if supabase_url:
            # Supabase 的 iss 格式为 "https://<project-ref>.supabase.co/auth/v1"
            decode_kwargs["issuer"] = f"{supabase_url.rstrip('/')}/auth/v1"

        try:
            payload = jwt.decode(
                token,
                public_key,
                **decode_kwargs,
            )
        except ExpiredSignatureError as e:
            raise AuthenticationError("token 已过期，请重新登录") from e
        except JWTError as e:
            raise AuthenticationError(f"token 验证失败: {str(e)}") from e

        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationError("token 中缺少用户标识 (sub)")

        logger.debug("JWT 验证通过，user_id=%s", user_id)
        return user_id
