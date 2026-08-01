"""
熵减 AI 网关 — 虚拟 Key 签发与验证

@ai-context: 网关签发内部虚拟 Key（vkey），屏蔽真实供应商 Key。
客户端使用虚拟 Key 调用网关，网关内部映射到真实 Provider Key。
虚拟 Key 格式：vkey_<user_hash>_<random>，存储在 Redis 中（TTL 30 天）。
@ai-context: 当前为 Phase 4 预实现，路由层暂未接入。
后续替换 X-User-API-Key 直传模式，提升安全性。
"""

import hashlib
import logging
import secrets
import time

from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)

# 虚拟 Key 前缀
VKEY_PREFIX = "vkey_"
# 虚拟 Key 有效期（秒）：30 天
VKEY_TTL_SECONDS = 30 * 24 * 3600


async def issue_virtual_key(user_id: str, provider: str) -> str | None:
    """为用户签发虚拟 Key

    Args:
        user_id: 用户 ID
        provider: 关联的 Provider 名称

    Returns:
        虚拟 Key 字符串，Redis 不可用时返回 None
    """
    cache = get_cache()
    if not cache._client:
        return None

    # 生成虚拟 Key：vkey_<user_hash8>_<random16>
    user_hash = hashlib.sha256(user_id.encode()).hexdigest()[:8]
    random_part = secrets.token_hex(8)
    vkey = f"{VKEY_PREFIX}{user_hash}_{random_part}"

    # 存储映射：vkey → {user_id, provider, created_at}
    import json
    mapping = json.dumps({
        "user_id": user_id,
        "provider": provider,
        "created_at": int(time.time()),
    })

    redis_key = f"virtual_key:{vkey}"
    success = await cache.set(redis_key, mapping, expire=VKEY_TTL_SECONDS)
    if success:
        logger.info("VirtualKey 签发: user=%s, provider=%s, vkey=%s...", user_id, provider, vkey[:16])
        return vkey

    return None


async def resolve_virtual_key(vkey: str) -> dict | None:
    """解析虚拟 Key，返回关联信息

    Args:
        vkey: 虚拟 Key 字符串

    Returns:
        {"user_id": str, "provider": str, "created_at": int} 或 None
    """
    if not vkey.startswith(VKEY_PREFIX):
        return None

    cache = get_cache()
    if not cache._client:
        return None

    import json
    redis_key = f"virtual_key:{vkey}"
    raw = await cache.get(redis_key)
    if not raw:
        return None

    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def revoke_virtual_key(vkey: str) -> bool:
    """撤销虚拟 Key"""
    cache = get_cache()
    if not cache._client:
        return False

    redis_key = f"virtual_key:{vkey}"
    try:
        await cache._client.delete(redis_key)
        logger.info("VirtualKey 撤销: %s...", vkey[:16])
        return True
    except Exception as exc:
        logger.warning("VirtualKey 撤销失败: %s", exc)
        return False


def is_virtual_key(key: str) -> bool:
    """判断是否为虚拟 Key"""
    return key.startswith(VKEY_PREFIX)
