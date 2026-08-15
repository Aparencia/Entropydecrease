"""
熵减 AI 网关 — JWT 密钥材料与 JWKS 管理（自 middleware/auth.py 拆分）

@ai-context: 原 middleware/auth.py（613 行）按职责拆分为 jwt_keys（密钥材料/
JWKS/启动检查）、jwt_verify（验签逻辑）、auth（tier 解析+中间件）。本模块被
auth.py 顶部 import，模块级启动检查随加载执行——main.py import middleware.auth
即触发，时机与拆分前一致（顺序不变：占位符判断 → 生产拒绝启动/开发告警 →
死配置告警 → 启动日志）。
@ai-context: logger 沿用 "middleware.auth" 名称，保持 JSON 日志 module 字段
与拆分前一致（拆分前所有 JWT 相关日志均来自 middleware.auth）。
@ai-context: _get_public_key 的 ES256 分支在调用时经 middleware.auth 命名空间
延迟导入 _get_es256_public_key（模块级互相导入会构成循环依赖），使
test_e2e_auth.py 对 "middleware.auth._get_es256_public_key" 的 patch 生效。
"""

import asyncio
import base64
import logging
import os
import time
import warnings
from typing import Optional

import httpx

from config import APP_CONFIG

logger = logging.getLogger("middleware.auth")

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
# 注意：以下检查随本模块导入执行——auth.py 顶部 `from .jwt_keys import ...`
# 会先执行本模块体，与拆分前 auth.py 被 import 即检查的时机一致。
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
        # stacklevel=3：检查随 jwt_keys 模块加载执行（比原 auth.py 深一层，
        # 见文件头说明），+1 使告警定位到 auth.py 的导入方，与原实现一致
        warnings.warn(
            "JWT 验证密钥材料未配置，JWT 验证将使用开发降级模式（不验证签名）。"
            "ES256 需配置 SUPABASE_JWKS_URL 或 SUPABASE_URL；"
            "HS256/RS256 需配置 SUPABASE_JWT_SECRET。"
            "⚠️ 仅限本地开发，生产环境将拒绝启动。",
            RuntimeWarning,
            stacklevel=3,
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
        # 延迟导入：经 middleware.auth 命名空间解析 _get_es256_public_key，使
        # test_e2e_auth.py 对 "middleware.auth._get_es256_public_key" 的 patch 生效
        #（避免测试走真实网络）；模块级互相导入会构成 auth ↔ jwt_keys 循环依赖。
        from middleware.auth import _get_es256_public_key
        return await _get_es256_public_key(kid)
    raw = APP_CONFIG.get("jwt_secret", "")
    if not raw:
        # 未配置时返回占位符，jose 会在验证时报错（优雅降级）
        return "not-configured"
    if alg == "HS256":
        return raw
    return _normalize_pem_key(raw)
