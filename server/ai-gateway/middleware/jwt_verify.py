"""
熵减 AI 网关 — JWT 验签逻辑（自 middleware/auth.py 拆分）

承载原 JWTAuthMiddleware._verify_token 的完整验签逻辑（开发降级模式 +
正常 JWT 验证流程），以模块级 verify_token(request) 暴露，供 auth.py 的
JWTAuthMiddleware._verify_token 委托调用。

@ai-context: 原 middleware/auth.py（613 行）按职责拆分为 jwt_keys（密钥材料/
JWKS/启动检查）、jwt_verify（验签逻辑）、auth（tier 解析+中间件）。本模块承接
验签核心：dev 降级模式（不验签提取 sub）/ 算法白名单 / 按 token alg 获取公钥并
jose 解码；认证失败统一抛 errors.AuthenticationError（401）。
@ai-context: 开发降级告警去重使用模块级 _warned_dev_mode（原为中间件实例属性
self._warned_dev_mode）——网关仅注册单个 JWTAuthMiddleware 实例，逐进程告警
一次的语义与原实现一致（日志内容/时机不变）。
@ai-context: 公钥获取委托 jwt_keys._get_public_key（其 ES256 分支在调用时经
middleware.auth 命名空间解析 _get_es256_public_key，使 test_e2e_auth.py 对该
符号的 patch 生效，见 jwt_keys 文件头说明）。
"""

import base64
import logging

from fastapi import Request

from config import APP_CONFIG
from errors import AuthenticationError
from middleware.jwt_keys import _get_public_key, _jwt_verification_configured

# 沿用原 auth.py 的 logger 名：保持 JSON 日志 module 字段与拆分前一致
logger = logging.getLogger("middleware.auth")

# 开发降级模式告警去重标志（原为中间件实例属性，见文件头 @ai-context）
_warned_dev_mode = False


async def verify_token(request: Request) -> tuple[str, dict]:
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
    global _warned_dev_mode
    if not _jwt_verification_configured():
        # 生产环境已在模块加载时告警，此处仅处理开发环境降级
        if not _warned_dev_mode:
            logger.warning(
                "⚠️ JWT 验证处于开发降级模式！请勿在生产环境使用。"
                "ES256 需配置 SUPABASE_JWKS_URL/SUPABASE_URL，"
                "HS256/RS256 需配置 SUPABASE_JWT_SECRET 以启用完整验证。"
            )
            _warned_dev_mode = True

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
