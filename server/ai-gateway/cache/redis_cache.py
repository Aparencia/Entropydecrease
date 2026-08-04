"""
熵减 AI 网关 — Redis 缓存封装

提供异步 Redis 缓存操作：
- 频率限制计数器
- AI 响应缓存（语义去重）
- 通用 KV 缓存

@ai-context: Redis 缓存封装：单例连接、频率限制计数与通用 KV 读写；连接失败静默降级为直通（不阻塞主链路）。
"""

import json
import logging
from typing import Any

import redis.asyncio as aioredis
from redis.retry import Retry
from redis.backoff import ExponentialBackoff

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis 缓存封装"""

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self.redis_url = redis_url
        self._client: aioredis.Redis | None = None

    async def connect(self) -> None:
        """
        建立 Redis 异步连接

        使用连接池模式，decode_responses=True 自动将 bytes 解码为 str。
        连接失败时仅记录日志，不抛出异常（优雅降级）。
        """
        try:
            self._client = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                retry_on_timeout=True,
                retry=Retry(ExponentialBackoff(), retries=3),
            )
            # 验证连接可用
            await self._client.ping()
            logger.info("Redis 连接成功: %s", self.redis_url)
        except Exception as exc:
            logger.warning("Redis 连接失败，缓存功能将降级: %s", exc)
            self._client = None

    async def disconnect(self) -> None:
        """关闭 Redis 连接"""
        if self._client:
            try:
                await self._client.close()
            except Exception as exc:
                logger.warning("关闭 Redis 连接时出错: %s", exc)
            finally:
                self._client = None
        logger.info("Redis 连接已关闭")

    async def get(self, key: str) -> str | None:
        """获取缓存值，Redis 不可用时返回 None"""
        if not self._client:
            await self._maybe_reconnect()  # GW-M7: 惰性重连
        if not self._client:
            return None
        try:
            return await self._client.get(key)
        except Exception as exc:
            logger.warning("Redis GET 失败 key=%s: %s", key, exc)
            # 连接可能已失效，尝试重连供下次使用
            await self._maybe_reconnect()
            return None

    async def set(self, key: str, value: str, expire: int = 0) -> bool:
        """
        设置缓存值，expire 为过期时间（秒）

        Redis 不可用时静默跳过。返回是否设置成功。
        """
        if not self._client:
            await self._maybe_reconnect()  # GW-M7: 惰性重连
        if not self._client:
            return False
        try:
            if expire > 0:
                await self._client.set(key, value, ex=expire)
            else:
                await self._client.set(key, value)
            return True
        except Exception as exc:
            logger.warning("Redis SET 失败 key=%s: %s", key, exc)
            await self._maybe_reconnect()
            return False

    async def increment(self, key: str, expire: int = 86400) -> int:
        """
        原子递增操作（用于频率限制计数）

        使用 pipeline 保证 INCR + EXPIRE 原子性。
        首次调用时设置 TTL，后续调用仅递增。

        Args:
            key: 缓存键
            expire: 过期时间（秒），默认 24 小时

        Returns:
            int: 递增后的值；Redis 不可用时返回 0
        """
        if not self._client:
            await self._maybe_reconnect()  # GW-M7: 惰性重连
        if not self._client:
            return 0
        try:
            pipe = self._client.pipeline()
            pipe.incr(key)
            pipe.expire(key, expire)
            results = await pipe.execute()
            return results[0]
        except Exception as exc:
            logger.warning("Redis INCR 失败 key=%s: %s", key, exc)
            await self._maybe_reconnect()
            return 0

    async def _maybe_reconnect(self) -> None:
        """
        GW-M7: 惰性重连——Redis 重启/网络抖动后连接失效，
        下次操作时自动尝试恢复，避免限流/缓存静默失效至进程重启。
        connect() 内部已捕获异常，此处不会向上抛出。
        """
        try:
            await self.connect()
        except Exception:
            pass

    async def get_ai_cache(self, prompt_hash: str) -> dict[str, Any] | None:
        """
        获取 AI 响应缓存

        Args:
            prompt_hash: prompt 的哈希值

        Returns:
            dict | None: 缓存的 AI 响应；未命中或 Redis 不可用时返回 None
        """
        key = f"ai_cache:{prompt_hash}"
        data = await self.get(key)
        if data:
            try:
                return json.loads(data)
            except (json.JSONDecodeError, TypeError) as exc:
                logger.warning("AI 缓存反序列化失败 key=%s: %s", key, exc)
        return None

    async def set_ai_cache(
        self, prompt_hash: str, response: dict[str, Any], expire: int = 3600
    ) -> None:
        """
        缓存 AI 响应

        Args:
            prompt_hash: prompt 的哈希值
            response: AI 响应数据
            expire: 缓存过期时间（秒），默认 1 小时
        """
        key = f"ai_cache:{prompt_hash}"
        try:
            await self.set(key, json.dumps(response, ensure_ascii=False), expire=expire)
        except (TypeError, ValueError) as exc:
            logger.warning("AI 缓存序列化失败 key=%s: %s", key, exc)


# 全局缓存实例（延迟初始化）
_cache_instance: RedisCache | None = None


def get_cache() -> RedisCache:
    """
    获取全局缓存实例

    @ai-context: 必须用 APP_CONFIG["redis_url"]（来自环境变量 REDIS_URL）构造，
    容器部署时 Redis 位于独立容器（redis:6379，带密码），若用无参默认值
    redis://localhost:6379/0 会永远连接失败，导致限流与响应缓存静默失效。
    """
    global _cache_instance
    if _cache_instance is None:
        from config import APP_CONFIG
        _cache_instance = RedisCache(APP_CONFIG["redis_url"])
    return _cache_instance
