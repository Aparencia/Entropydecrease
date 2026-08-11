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
"""

import asyncio
import base64
import logging
import os
import time
import warnings
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

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

from config import APP_CONFIG
from errors import AuthenticationError

logger = logging.getLogger(__name__)

# 不需要认证的路径白名单
# 注意：license_webhook 是支付平台服务端回调（无用户 token），
# 防伪依赖 HMAC 签名 + order_id 查询确认（见 payment_adapter），而非 JWT。
PUBLIC_PATHS = {"/health", "/health/quick", "/health/live", "/api/v1/license/webhook"}

# GW-2#1: 占位符识别——SUPABASE_URL 模板中的示例项目域名与常见示例密钥
# 被视为"未配置"，避免"已配置"假象导致认证链路断裂后全站 401 且难排查
_PLACEHOLDER_PROJECT_ID = "your-project-id"
_PLACEHOLDER_SECRETS = {
    "change-this-to-a-random-string-in-production",
    "your-jwt-secret",
    "placeholder",
    "supabase_jwt_secret",
}


def _is_placeholder_text(value: str) -> bool:
    """判断配置值是否为占位符/示例值"""
    return value.strip().lower() in _PLACEHOLDER_SECRETS


def _jwt_verification_configured() -> bool:
    """
    检查当前算法是否具备验证所需的密钥材料。

    - 显式配置 HS256/RS256：需要 SUPABASE_JWT_SECRET（对称密钥或 PEM 公钥），
      占位符/示例值视为未配置；
    - 显式配置 ES256：需要 SUPABASE_JWKS_URL 或 SUPABASE_URL（用于获取 JWKS 公钥），
      URL 含 your-project-id 占位符域名时视为未配置；
    - 未配置算法（自动适配模式）：任一算法的密钥材料可用即视为已配置，
      验证时按 token 实际算法选用对应材料（GW-2#1 延伸）。
    """
    alg = APP_CONFIG.get("jwt_algorithm", "").strip().upper()
    if alg == "ES256":
        jwks_url = (
            APP_CONFIG.get("supabase_jwks_url", "")
            or APP_CONFIG.get("supabase_url", "")
        )
        return bool(jwks_url) and _PLACEHOLDER_PROJECT_ID not in jwks_url
    if alg:
        secret = APP_CONFIG.get("jwt_secret", "")
        return bool(secret) and not _is_placeholder_text(secret)
    # 自动适配模式：任一算法密钥材料可用即真实验证（fail-closed，不降级）
    secret = APP_CONFIG.get("jwt_secret", "")
    jwks_url = (
        APP_CONFIG.get("supabase_jwks_url", "")
        or APP_CONFIG.get("supabase_url", "")
    )
    has_secret = bool(secret) and not _is_placeholder_text(secret)
    has_jwks = bool(jwks_url) and _PLACEHOLDER_PROJECT_ID not in jwks_url
    return has_secret or has_jwks


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

# GW-2#14: 死配置检测——存在非空 JWT_SECRET 而 SUPABASE_JWT_SECRET 为空时
# 打印告警：运维按字面配置 JWT_SECRET 会误以为认证密钥已就绪（实际从未生效）
_legacy_jwt_secret = os.getenv("JWT_SECRET", "")
if _legacy_jwt_secret and not APP_CONFIG.get("jwt_secret", ""):
    logger.warning(
        "检测到 JWT_SECRET 已配置但 SUPABASE_JWT_SECRET 为空："
        "网关只读取 SUPABASE_JWT_SECRET，JWT_SECRET 是死配置不会生效，"
        "请将密钥迁移到 SUPABASE_JWT_SECRET（或删除 JWT_SECRET 避免误导）。"
    )

# 启动日志：输当前 JWT 验证算法与配置状态（GW-2#1: 避免"已配置"假象）
logger.info(
    "JWT 验证算法: %s (验证材料已配置=%s)",
    APP_CONFIG["jwt_algorithm"] or "auto",
    _jwt_verification_configured(),
)


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
# GW-2#8: 网络类失败时允许复用过期缓存的宽限窗口（秒）——密钥轮换的越权
# 风险与网络抖动导致的可用性风险权衡：JWKS 1 小时才刷新一次，期间 Supabase
# 任何一次网络故障若 fail-closed 会让全部请求 401（认证风暴）
_JWKS_STALE_GRACE_SECONDS: int = 300
# GW-2#8: 网络失败后的重试退避（秒），避免每次请求都打 JWKS 端点
_JWKS_FAIL_RETRY_SECONDS: int = 60
# 网络失败后下次刷新尝试的最早时间戳（0 表示无退避）
_jwks_retry_after: float = 0.0
# GW-M3: 防缓存击穿锁 + 共享连接池客户端（避免每次请求新建 TCP/TLS 连接）
_jwks_lock: asyncio.Lock = asyncio.Lock()
_jwks_client: Optional[httpx.AsyncClient] = None


def _get_jwks_client() -> httpx.AsyncClient:
    """获取共享 JWKS HTTP 客户端（懒初始化，连接池复用）"""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = httpx.AsyncClient(timeout=10)
    return _jwks_client


def _resolve_jwks_url() -> str:
    """解析 JWKS 端点 URL：优先 SUPABASE_JWKS_URL，其次从 SUPABASE_URL 推导"""
    jwks_url = APP_CONFIG.get("supabase_jwks_url", "")
    if jwks_url:
        if _PLACEHOLDER_PROJECT_ID in jwks_url:
            # GW-2#1: 占位符域名推导出的 JWKS 端点必然不可达，显式告警
            #（此分支通常不会被走到——_jwt_verification_configured 已将其判为未配置）
            logger.warning(
                "ES256 验签 JWKS URL 含占位符域名 %s，请配置真实的 SUPABASE_URL/SUPABASE_JWKS_URL",
                jwks_url,
            )
        return jwks_url
    supabase_url = APP_CONFIG.get("supabase_url", "")
    if supabase_url:
        return f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return ""


async def _fetch_jwks(jwks_url: str) -> dict:
    """
    获取 JWKS（带 TTL 缓存，默认 1 小时刷新一次）。

    GW-M3: 网络失败时 fail-closed（拒绝验证）而非返回过期缓存——
    密钥轮换后过期缓存会让旧 token 在验证窗口内继续有效（越权窗口）。
    asyncio.Lock 防止冷启动多请求并发刷新（缓存击穿）。
    GW-2#8: 区分两类失败——HTTP 状态错误（密钥轮换/端点失效）保持
    fail-closed；网络类失败（超时/DNS/TLS/连接）短暂复用过期缓存
    （最多 5 分钟宽限）并退避 60s 重试，避免 Supabase 短暂抖动全站 401。
    """
    global _jwks_cache, _jwks_cache_time, _jwks_retry_after
    now = time.time()
    if _jwks_cache is not None and (now - _jwks_cache_time) < _JWKS_CACHE_TTL:
        return _jwks_cache
    # 缓存过期但在宽限窗口内且未到重试时间：降级复用（网络抖动自愈窗口）
    if (
        _jwks_cache is not None
        and (now - _jwks_cache_time) < _JWKS_CACHE_TTL + _JWKS_STALE_GRACE_SECONDS
        and now < _jwks_retry_after
    ):
        return _jwks_cache
    async with _jwks_lock:
        # 双重检查：等待锁期间其他协程可能已刷新缓存
        now = time.time()
        if _jwks_cache is not None and (now - _jwks_cache_time) < _JWKS_CACHE_TTL:
            return _jwks_cache
        # GW-3: 锁内复用退避窗口——排队期间首个请求已失败并设 retry_after，
        # 后续请求不再重复打 JWKS 端点（原实现只查新鲜缓存，锁内并发风暴）
        if (
            _jwks_cache is not None
            and (now - _jwks_cache_time) < _JWKS_CACHE_TTL + _JWKS_STALE_GRACE_SECONDS
            and now < _jwks_retry_after
        ):
            return _jwks_cache
        try:
            resp = await _get_jwks_client().get(jwks_url)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_cache_time = time.time()
            _jwks_retry_after = 0.0
            logger.info("JWKS 获取成功，缓存已更新: %s", jwks_url)
            return _jwks_cache
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            # GW-3: 5xx 为临时性故障（网关抖动/维护），与网络类失败同样走
            # 宽限复用；401/403/404 等确定性状态（密钥轮换/端点失效）保持
            # fail-closed——原实现把所有 HTTP 错误一律 fail-closed，Supabase
            # 短暂 5xx 即全站 401
            if (
                status >= 500
                and _jwks_cache is not None
                and (now - _jwks_cache_time) < _JWKS_CACHE_TTL + _JWKS_STALE_GRACE_SECONDS
            ):
                _jwks_retry_after = time.time() + _JWKS_FAIL_RETRY_SECONDS
                logger.warning(
                    "JWKS 5xx 临时故障（status=%d），降级复用过期缓存（%ds 内重试）",
                    status, _JWKS_FAIL_RETRY_SECONDS,
                )
                return _jwks_cache
            logger.error("JWKS 获取失败: %s, status=%s", jwks_url, status)
            raise
        except Exception as e:
            # 网络类失败（超时/DNS/TLS/连接中断）：仅宽限窗口内复用过期缓存，
            # 超出后 fail-closed——原实现无条件复用，宽限窗口形同虚设
            #（过期密钥无限期生效，密钥轮换后越权窗口无上限）
            logger.error("JWKS 获取失败(网络): %s, error=%s", jwks_url, str(e))
            if (
                _jwks_cache is not None
                and (now - _jwks_cache_time) < _JWKS_CACHE_TTL + _JWKS_STALE_GRACE_SECONDS
            ):
                _jwks_retry_after = time.time() + _JWKS_FAIL_RETRY_SECONDS
                logger.warning(
                    "JWKS 网络失败，降级复用过期缓存（%ds 内重试）",
                    _JWKS_FAIL_RETRY_SECONDS,
                )
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


async def _get_public_key(alg: str, kid: Optional[str] = None):
    """
    按 token 实际签名算法获取用于 JWT 验证的密钥。

    - HS256：返回对称密钥字符串（SUPABASE_JWT_SECRET）
    - ES256：从 JWKS 端点获取 ECDSA P-256 公钥（按 kid 匹配）
    - RS256：返回 RSA 公钥 PEM 格式
    """
    if alg == "ES256":
        return await _get_es256_public_key(kid)
    raw = APP_CONFIG.get("jwt_secret", "")
    if not raw:
        # 未配置时返回占位符，jose 会在验证时报错（优雅降级）
        return "not-configured"
    if alg == "HS256":
        return raw
    return _normalize_pem_key(raw)


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

        当密钥材料未配置时启用开发降级模式：
        - 有 Bearer token 时提取 payload 中的 sub（不验证签名）
        - 无 token 时返回 "anonymous"

        Returns:
            tuple: (验证通过的用户 ID（sub claim）, 完整 payload claims)

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
                    return payload.get("sub", "dev-user"), payload
                except Exception:
                    return "dev-user", {}
            return "anonymous", {}

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

        # 解析 token header：获取实际签名算法与 kid（ES256 按 kid 匹配 JWKS 公钥）
        token_alg = None
        kid = None
        try:
            import json
            header_b64 = token.split('.')[0]
            header_b64 += '=' * (-len(header_b64) % 4)
            token_header = json.loads(base64.urlsafe_b64decode(header_b64))
            token_alg = (token_header.get("alg") or "").strip().upper()
            kid = token_header.get("kid")
        except Exception as e:
            logger.warning("解析 token header 获取 alg/kid 失败: %s", str(e))

        # 算法白名单：显式配置 SUPABASE_JWT_ALGORITHM 时强制该算法；
        # 未配置时自动适配（GW-2#1 延伸——不猜默认算法，按 token 实际 alg 验证，
        # 消除 HS256/ES256 配置错位导致的全站 401）
        configured_alg = APP_CONFIG.get("jwt_algorithm", "").strip().upper()
        allowed_algs = [configured_alg] if configured_alg else ["HS256", "ES256", "RS256"]
        if not token_alg or token_alg not in allowed_algs:
            raise AuthenticationError(f"token 验证失败: 不支持的签名算法 {token_alg or '未知'}")

        try:
            public_key = await _get_public_key(token_alg, kid=kid)
        except Exception as e:
            logger.error("获取公钥失败: %s", str(e))
            raise AuthenticationError("认证服务异常，请稍后重试") from e

        # 构建解码参数
        decode_kwargs: dict = {
            "algorithms": [token_alg],
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
        return user_id, payload
